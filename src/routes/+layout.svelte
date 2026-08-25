<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { goto, afterNavigate } from '$app/navigation';
  import { _q8z, _p1k, _x9a, _playing, _showNP, _showMenu, _showAddPl, _playlists, _recentlyPlayed, _shuffle, _repeat, _origQueue, _showLyrics, _likedSongs } from '$lib/store.js';
  import { _saveQueueSnapshot } from '$lib/queueSnapshot.js';
  import { _getStreamUrl, _getLyrics, _getSongInfo, _fetchAudioBytes, _fetchCoverBytes } from '$lib/api.js';
  import { addRecentlyPlayed, getPlaylists, addTrackToPlaylist, createPlaylist, getLikedSongs, toggleLikeSong } from '$lib/playlist.js';
  import { onDestroy, onMount, tick } from 'svelte';
  import { ID3Writer } from 'browser-id3-writer';

  $: _rt = $page.url.pathname;

  const _navItems = [
    ['/', 'Beranda', 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'],
    ['/search', 'Cari', 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'],
    ['/library', 'Library', 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'],
    ['/tentang', 'Tentang', 'M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-11h2V7h-2v2z']
  ];

  $: _activeIdx = Math.max(0, _navItems.findIndex(([p]) => p === _rt));

  function _setBodyLock(locked) {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  $: _setBodyLock($_showNP);

  function _dur2s(d) {
    if (!d) return 0;
    const p = d.split(':').map(Number);
    if (p.length === 3) return p[0]*3600 + p[1]*60 + p[2];
    if (p.length === 2) return p[0]*60 + p[1];
    return 0;
  }
  function _s2dur(s) {
    if (!s || !isFinite(s) || isNaN(s)) return '0:00';
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }

  let _elapsed = 0;
  let _lyricT = 0;
  let _total = 0;
  let _pct = 0;
  let _ticker = null;
  let _prev = null;
  let _audioEl = null;
  let _loading = false;
  let _seeking = false;

  let _swipeStartY = 0;
  let _swipeDeltaY = 0;
  let _isSwiping = false;
  let _swipeLocked = false;
  let _playerEl = null;
  let _swipeHoriz = false;

  let _lyrics = null;
  let _lyricsLoading = false;
  let _lyricsTrackId = null;
  let _lyricsWrapEl = null;

  // "Lagu Serupa" pakai data queue/up-next dari /api/song (endpoint `next`
  // YT Music yang sama persis dipakai buat radio/mix otomatis) — bukan
  // search query bikinan. Ini sumber yang paling akurat karena YT Music
  // sendiri yang mencampur lagu dari artis yang sama + artis relevan lain,
  // dan endpoint ini sudah terbukti jalan (dipakai fitur lain di app ini).
  let _similar = [];
  let _similarLoading = false;
  let _similarTrackId = null;
  let _similarLoadingId = null;

  async function _loadSimilar(track) {
    _similarLoading = true;
    try {
      const info = await _getSongInfo(track.videoId);
      const q = (info?.queue || []).filter(s => s.videoId && s.videoId !== track.videoId);
      _similar = q.slice(0, 15);
    } catch {
      _similar = [];
    } finally {
      _similarLoading = false;
    }
  }

  async function _playSimilar(item, idx) {
    _similarLoadingId = item.videoId;
    _p1k.set(_similar);
    _x9a.set(idx);
    _q8z.set(item);
    setTimeout(() => { _similarLoadingId = null; }, 3000);
  }

  async function _loadLyrics(track) {
    if (!track) return;
    _lyricsLoading = true;
    _lyrics = null;
    try {
      const accurateDuration = (_audioEl && $_q8z && $_q8z.videoId === track.videoId && isFinite(_audioEl.duration) && _audioEl.duration > 0)
        ? Math.floor(_audioEl.duration)
        : _dur2s(track.duration);
      const data = await _getLyrics(track.title, track.author || track.artist || '', accurateDuration);
      if ($_q8z && $_q8z.videoId === track.videoId) _lyrics = data;
    } catch { _lyrics = null; }
    finally { _lyricsLoading = false; }
  }

  function _toggleLyrics() {
    const next = !$_showLyrics;
    _showLyrics.set(next);
    if (next && $_q8z && _lyricsTrackId !== $_q8z.videoId) {
      _lyricsTrackId = $_q8z.videoId;
      _loadLyrics($_q8z);
    }
  }

  $: _activeLyricIdx = (() => {
    if (!_lyrics || _lyrics.type !== 'synced' || !_lyrics.lines?.length) return -1;
    let idx = -1;
    for (let i = 0; i < _lyrics.lines.length; i++) {
      if (_lyrics.lines[i].time <= _lyricT) idx = i; else break;
    }
    return idx;
  })();

  $: if (_lyricsWrapEl && _activeLyricIdx >= 0) {
    const el = _lyricsWrapEl.querySelector(`[data-li="${_activeLyricIdx}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  let _newPlName = '';
  let _showNewPlInSheet = false;
  let _showNewPlModal = false;
  let _pendingTrack = null;
  let _addFeedback = '';
  let _feedbackTimer = null;

  function _showFeedback(msg) {
    _addFeedback = msg;
    if (_feedbackTimer) clearTimeout(_feedbackTimer);
    _feedbackTimer = setTimeout(() => { _addFeedback = ''; }, 2000);
  }

  function _openMenuSheet(item) {
    _playlists.set(getPlaylists());
    _showMenu.set(item);
    _showNewPlInSheet = false;
    _newPlName = '';
  }

  function _closeMenuSheet() {
    _showMenu.set(null);
    _showNewPlInSheet = false;
    _newPlName = '';
  }

  let _menuSheetEl = null;
  let _menuSwipeStartY = 0;
  let _menuSwipeDeltaY = 0;
  let _menuIsSwiping = false;

  function _onMenuSheetTouchStart(e) {
    _menuSwipeStartY = e.touches[0].clientY;
    _menuSwipeDeltaY = 0;
    _menuIsSwiping = true;
    if (_menuSheetEl) _menuSheetEl.style.transition = 'none';
  }

  function _onMenuSheetTouchMove(e) {
    if (!_menuIsSwiping) return;
    const dy = e.touches[0].clientY - _menuSwipeStartY;
    if (dy <= 0) { _menuSwipeDeltaY = 0; return; }
    _menuSwipeDeltaY = dy;
    if (_menuSheetEl) _menuSheetEl.style.transform = `translateY(${dy}px)`;
  }

  function _onMenuSheetTouchEnd() {
    if (!_menuIsSwiping) return;
    _menuIsSwiping = false;
    if (_menuSwipeDeltaY > 90) {
      _closeMenuSheet();
    } else if (_menuSheetEl) {
      _menuSheetEl.style.transition = 'transform .2s cubic-bezier(.4,0,.2,1)';
      _menuSheetEl.style.transform = 'translateY(0)';
    }
    _menuSwipeDeltaY = 0;
  }

  let _downloadingId = null;

  function _sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  }

  async function _coverToJpegBytes(cover) {
    if (!cover) return null;
    try {
      const blob = new Blob([cover.buffer], { type: cover.type || 'image/jpeg' });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const jpegBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!jpegBlob) return null;
      return await jpegBlob.arrayBuffer();
    } catch {
      return null;
    }
  }

  async function _downloadTrack(track) {
    if (!track || _downloadingId) return;
    _downloadingId = track.videoId;
    const title = track.title || 'Untitled';
    const artist = track.author || track.artist || 'Unknown Artist';
    try {
      const [audioBuf, cover] = await Promise.all([
        _fetchAudioBytes(track.videoId, title, artist),
        _fetchCoverBytes(track.thumbnail)
      ]);
      const coverJpeg = await _coverToJpegBytes(cover);
      const writer = new ID3Writer(audioBuf);
      writer.setFrame('TIT2', title);
      writer.setFrame('TPE1', [artist]);
      if (coverJpeg) {
        writer.setFrame('APIC', {
          type: 3,
          data: coverJpeg,
          description: '',
          useUnicodeEncoding: false
        });
      }
      writer.addTag();
      const blob = writer.getBlob();
      const filename = _sanitizeFilename(`${title} - ${artist}.mp3`);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      _closeMenuSheet();
      _showFeedback('Lagu berhasil diunduh');
    } catch (e) {
      _showFeedback('Gagal mengunduh lagu');
    } finally {
      _downloadingId = null;
    }
  }

  async function _shareTrack(track) {
    if (!track) return;
    const url = `${location.origin}/song/${track.videoId}`;
    const shareData = {
      title: track.title,
      text: track.author ? `${track.title} - ${track.author}` : track.title,
      url
    };
    _closeMenuSheet();
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* dibatalkan user, gapapa */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      _showFeedback('Link lagu disalin');
    } catch {
      _showFeedback('Gagal menyalin link');
    }
  }

  function _doAddToPl(pl) {
    const track = $_showMenu;
    if (!track) return;
    const ok = addTrackToPlaylist(pl.id, track);
    _playlists.set(getPlaylists());
    _showFeedback(ok ? `Ditambahkan ke "${pl.name}"` : `Sudah ada di "${pl.name}"`);
    _closeMenuSheet();
  }

  function _doCreateAndAdd() {
    if (!_newPlName.trim()) return;
    const pl = createPlaylist(_newPlName.trim());
    addTrackToPlaylist(pl.id, $_showMenu);
    _playlists.set(getPlaylists());
    _showFeedback(`Ditambahkan ke "${pl.name}"`);
    _newPlName = '';
    _showNewPlInSheet = false;
    _closeMenuSheet();
  }

  function _doCreateAndAddModal() {
    if (!_newPlName.trim() || !_pendingTrack) return;
    const pl = createPlaylist(_newPlName.trim());
    addTrackToPlaylist(pl.id, _pendingTrack);
    _playlists.set(getPlaylists());
    _showFeedback(`Ditambahkan ke "${pl.name}"`);
    _newPlName = '';
    _showNewPlModal = false;
    _pendingTrack = null;
  }

  function _onPlayerTouchStart(e) {
    const seekEls = _playerEl ? _playerEl.querySelectorAll('.seek-range') : [];
    for (const el of seekEls) { if (el.contains(e.target)) return; }
    _swipeStartY = e.touches[0].clientY;
    _swipeDeltaY = 0;
    _isSwiping = true;
    _swipeHoriz = false;
    _swipeLocked = false;
  }

  function _onPlayerTouchMove(e) {
    if (!_isSwiping) return;
    const dy = e.touches[0].clientY - _swipeStartY;
    if (!_swipeLocked) {
      if (Math.abs(dy) < 5) return;
      if (dy <= 0) { _isSwiping = false; return; }
      _swipeLocked = true;
    }
    e.preventDefault();
    _swipeDeltaY = dy;
    if (_swipeDeltaY > 0 && _playerEl) {
      _playerEl.style.transition = 'none';
      _playerEl.style.transform = `translateY(${Math.min(_swipeDeltaY * 0.7, 90)}px)`;
      _playerEl.style.opacity = `${Math.max(0.2, 1 - _swipeDeltaY / 100)}`;
    }
  }

  function _onPlayerTouchEnd() {
    if (!_isSwiping) return;
    _isSwiping = false;
    _swipeLocked = false;
    if (_swipeDeltaY > 60) {
      if (_playerEl) {
        _playerEl.style.transition = 'transform .18s ease, opacity .18s ease';
        _playerEl.style.transform = 'translateY(120px)';
        _playerEl.style.opacity = '0';
        setTimeout(() => _closeTrack(), 180);
      } else { _closeTrack(); }
    } else {
      if (_playerEl) {
        _playerEl.style.transition = 'transform .2s ease, opacity .2s ease';
        _playerEl.style.transform = '';
        _playerEl.style.opacity = '';
      }
    }
    _swipeDeltaY = 0;
  }

  let _lastPosPush = 0;

  function _clearPositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    try { navigator.mediaSession.setPositionState(); } catch(_) {}
    _lastPosPush = 0;
  }

  function _updatePositionState(force) {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const now = Date.now();
    if (!force && now - _lastPosPush < 800) return;
    const liveDuration = _audioEl && isFinite(_audioEl.duration) && _audioEl.duration > 0 ? _audioEl.duration : _total;
    const liveElapsed = _audioEl && isFinite(_audioEl.currentTime) ? _audioEl.currentTime : _elapsed;
    try {
      if (!liveDuration || !isFinite(liveDuration) || liveDuration <= 0) {
        navigator.mediaSession.setPositionState();
        _lastPosPush = now;
        return;
      }
      const position = Math.min(Math.max(liveElapsed, 0), liveDuration);
      navigator.mediaSession.setPositionState({ duration: liveDuration, playbackRate: 1, position });
      _lastPosPush = now;
    } catch(_) {}
  }

  function _setMediaSession(track) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: 'Ganify',
      artwork: [
        { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
        { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' },
      ]
    });
    navigator.mediaSession.setActionHandler('play', () => {
      if (_audioEl) _audioEl.play().catch(() => {});
      _playing.set(true);
      navigator.mediaSession.playbackState = 'playing';
      _updatePositionState(true);
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (_audioEl) _audioEl.pause();
      _playing.set(false);
      navigator.mediaSession.playbackState = 'paused';
      _updatePositionState(true);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => _prv());
    navigator.mediaSession.setActionHandler('nexttrack', () => _nxt());
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      if (_audioEl) _audioEl.currentTime = Math.max(0, _audioEl.currentTime - 10);
      _updatePositionState(true);
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      if (_audioEl) _audioEl.currentTime = Math.min(_total, _audioEl.currentTime + 10);
      _updatePositionState(true);
    });
    navigator.mediaSession.playbackState = 'playing';
    _updatePositionState(true);
  }

  function _onDurationKnown() {
    if (!_audioEl) return;
    const d = _audioEl.duration;
    if (typeof d === 'number' && isFinite(d) && d > 0) {
      _total = Math.floor(d);
      _pct = _total > 0 ? (_elapsed / _total) * 100 : 0;
      _syncSeekEls(_pct);
      _updatePositionState(true);
    }
  }

  function _onTimeUpdate() {
    if (!_audioEl) return;
    _lyricT = _audioEl.currentTime || 0;
    if (_seeking) return;
    if (isFinite(_audioEl.duration) && _audioEl.duration > 0) {
      _total = Math.floor(_audioEl.duration);
    }
    _elapsed = Math.floor(_audioEl.currentTime);
    if (_total > 0 && _elapsed > _total) _elapsed = _total;
    _pct = _total > 0 ? (_elapsed / _total) * 100 : 0;
    _syncSeekEls(_pct);
    _updatePositionState(false);
  }

  function _stopTick() {
    if (_ticker) { clearInterval(_ticker); _ticker = null; }
  }

  function _resetPositionForNewTrack() {
    _stopTick();
    _clearPositionState();
  }

  let _mounted = false;
  let _npReturnPath = '/';

  function _isSongRoute(pathname) {
    return pathname.startsWith('/song/');
  }

  $: if (_mounted && $_p1k.length) _saveQueueSnapshot($_p1k, $_x9a);

  $: if (_mounted && $_showNP && $_q8z) {
    const _npTarget = `/song/${$_q8z.videoId}`;
    const _onSongRoute = _isSongRoute($page.url.pathname);
    if (!_onSongRoute) _npReturnPath = $page.url.pathname + $page.url.search;
    if ($page.url.pathname !== _npTarget) {
      goto(_npTarget, { noScroll: true, keepFocus: true, replaceState: _onSongRoute });
    }
  }

  afterNavigate(({ to }) => {
    const _path = to?.url?.pathname || '';
    if (!_isSongRoute(_path) && $_showNP) _showNP.set(false);
  });

  onMount(() => {
    _mounted = true;
    _playlists.set(getPlaylists());
    _likedSongs.set(getLikedSongs());
    if ($_q8z && $_q8z !== _prev) {
      _prev = $_q8z;
      _elapsed = 0;
      _total = _dur2s($_q8z.duration);
      _pct = 0;
      // Jangan optimis set "playing" di sini — kalau browser mem-block
      // autoplay (lazim terjadi saat buka link lagu langsung tanpa tap
      // tombol play di dalam app), event `play` asli di elemen <audio>
      // di bawah tidak akan pernah nyala, dan status ini bakal nyangkut
      // "playing" padahal audio-nya diam. Biarkan event `on:play` yang
      // set true begitu playback beneran mulai.
      _playing.set(false);
      _resetPositionForNewTrack();
      _loadAndPlay($_q8z);
      _lyricsTrackId = $_q8z.videoId;
      _loadLyrics($_q8z);
      _similarTrackId = $_q8z.videoId;
      _loadSimilar($_q8z);
    }
  });

  function _toggleLike(track) {
    if (!track) return;
    const { list } = toggleLikeSong(track);
    _likedSongs.set(list);
  }

  $: _isLiked = $_q8z ? $_likedSongs.some(t => t.videoId === $_q8z.videoId) : false;
  $: _isMenuLiked = $_showMenu ? $_likedSongs.some(t => t.videoId === $_showMenu.videoId) : false;

  $: if (_mounted && $_q8z && $_q8z !== _prev) {
    _prev = $_q8z;
    _elapsed = 0;
    _total = _dur2s($_q8z.duration);
    _pct = 0;
    // Sama seperti di onMount: status "playing" ditentukan oleh event
    // `play` asli di elemen audio, bukan diasumsikan langsung nyala.
    _playing.set(false);
    _resetPositionForNewTrack();
    _loadAndPlay($_q8z);
    _lyrics = null;
    _showLyrics.set(false);
    _lyricsTrackId = $_q8z.videoId;
    _loadLyrics($_q8z);
    _similarTrackId = $_q8z.videoId;
    _loadSimilar($_q8z);
    addRecentlyPlayed($_q8z);
    _recentlyPlayed.set(
      (() => { try { return JSON.parse(localStorage.getItem('_msc_rp') || '[]'); } catch { return []; } })()
    );
  }

  async function _loadAndPlay(track) {
    await tick();
    if (!_audioEl) return;
    _loading = true;
    _audioEl.pause();
    _audioEl.src = '';
    _syncSeekEls(0);
    const url = await _getStreamUrl(track.videoId, track.title, track.artist || track.author);
    _loading = false;
    if (!url) return;
    _audioEl.src = url;
    _audioEl.load();
    try {
      await _audioEl.play();
    } catch(e) {
      const onCanPlay = () => {
        _audioEl.removeEventListener('canplay', onCanPlay);
        _audioEl.play().catch(() => {});
      };
      _audioEl.addEventListener('canplay', onCanPlay);
    }
    _setMediaSession(track);
    _startTick();
  }

  function _togglePlay() {
    if (!_audioEl || _loading) return;
    if ($_playing) {
      _audioEl.pause();
      _playing.set(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else {
      _audioEl.play().catch(() => {});
      _playing.set(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    }
    _updatePositionState(true);
  }

  function _startTick() {
    if (_ticker) clearInterval(_ticker);
    _ticker = setInterval(() => {
      if (!$_playing || !_audioEl || _seeking) return;
      _onTimeUpdate();
    }, 1000);
  }

  onDestroy(() => {
    if (_ticker) clearInterval(_ticker);
    if (_audioEl) { _audioEl.pause(); _audioEl.src = ''; }
    if (_feedbackTimer) clearTimeout(_feedbackTimer);
    _setBodyLock(false);
  });

  function _nxt() {
    const a = $_p1k, b = $_x9a;
    if (!a.length) return;
    if ($_repeat === 'one') { if (_audioEl) { _audioEl.currentTime = 0; _audioEl.play().catch(() => {}); } return; }
    const n = (b + 1) % a.length;
    if (n === 0 && $_repeat === 'off') { _playing.set(false); if (_audioEl) _audioEl.pause(); return; }
    _x9a.set(n); _q8z.set(a[n]);
  }
  function _prv() {
    const a = $_p1k, b = $_x9a;
    if (!a.length) return;
    if (_elapsed > 3) { if (_audioEl) { _audioEl.currentTime = 0; _elapsed = 0; } return; }
    const n = (b - 1 + a.length) % a.length;
    _x9a.set(n); _q8z.set(a[n]);
  }

  function _toggleShuffle() {
    const current = $_shuffle;
    if (!current) {
      _origQueue.set([...$_p1k]);
      const idx = $_x9a;
      const currentTrack = $_p1k[idx];
      const rest = $_p1k.filter((_, i) => i !== idx);
      const shuffled = [currentTrack, ..._shuffleArr(rest)];
      _p1k.set(shuffled);
      _x9a.set(0);
      _showFeedback('Lagu akan diputar acak');
    } else {
      const orig = $_origQueue;
      if (orig.length) {
        const currentTrack = $_q8z;
        _p1k.set(orig);
        const newIdx = orig.findIndex(t => t.videoId === currentTrack?.videoId);
        _x9a.set(newIdx >= 0 ? newIdx : 0);
        _origQueue.set([]);
      }
      _showFeedback('Shuffle dimatikan');
    }
    _shuffle.set(!current);
  }

  function _shuffleArr(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function _cycleRepeat() {
    const modes = ['off', 'all', 'one'];
    const cur = modes.indexOf($_repeat);
    const next = modes[(cur + 1) % modes.length];
    _repeat.set(next);
    if (next === 'one' && $_shuffle) {
      const orig = $_origQueue;
      if (orig.length) {
        const currentTrack = $_q8z;
        _p1k.set(orig);
        const newIdx = orig.findIndex(t => t.videoId === currentTrack?.videoId);
        _x9a.set(newIdx >= 0 ? newIdx : 0);
        _origQueue.set([]);
      }
      _shuffle.set(false);
      _showFeedback('Lagu ini akan diulang terus (shuffle dimatikan)');
    } else if (next === 'all') {
      _showFeedback('Semua lagu akan diulang');
    } else if (next === 'one') {
      _showFeedback('Lagu ini akan diulang terus');
    } else {
      _showFeedback('Repeat dimatikan');
    }
  }

  let _seekEl1 = null;
  let _seekEl2 = null;

  function _syncSeekEls(val) {
    if (_seekEl1) _seekEl1.value = val;
    if (_seekEl2) _seekEl2.value = val;
  }

  function _onSeekStart() { _seeking = true; }
  function _onSeekInput(e) {
    if (!_total || !isFinite(_total)) return;
    const val = Number(e.target.value);
    _elapsed = Math.round((val / 100) * _total);
    _pct = val;
    if (_seekEl1 && e.target !== _seekEl1) _seekEl1.value = val;
    if (_seekEl2 && e.target !== _seekEl2) _seekEl2.value = val;
  }
  function _onSeekEnd(e) {
    if (!_total || !isFinite(_total)) { _seeking = false; return; }
    const val = Number(e.target.value);
    const target = Math.round((val / 100) * _total);
    if (_audioEl) _audioEl.currentTime = target;
    _elapsed = target;
    _pct = val;
    _syncSeekEls(val);
    _seeking = false;
  }

  function _closeTrack() {
    if (_audioEl) { _audioEl.pause(); _audioEl.src = ''; }
    if (_ticker) clearInterval(_ticker);
    _elapsed = 0; _total = 0; _pct = 0;
    _playing.set(false);
    _showNP.set(false);
    _showLyrics.set(false);
    _lyrics = null;
    _q8z.set(null);
    _setBodyLock(false);
    if (_isSongRoute($page.url.pathname)) goto(_npReturnPath || '/', { noScroll: true, keepFocus: true });
    if ('mediaSession' in navigator) {
      _clearPositionState();
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    }
  }

  function _openNP() {
    _showNP.set(true);
    requestAnimationFrame(() => { if (_seekEl2) _seekEl2.value = _pct; });
  }

  function _closeNP() {
    _showNP.set(false);
    _setBodyLock(false);
    if (_isSongRoute($page.url.pathname)) goto(_npReturnPath || '/', { noScroll: true, keepFocus: true });
  }

  function _handleNPBack() {
    if ($_showLyrics) {
      _showLyrics.set(false);
    } else {
      _closeNP();
    }
  }
</script>

<audio
  bind:this={_audioEl}
  style="display:none"
  on:ended={_nxt}
  on:play={() => { if (!_loading) _playing.set(true); _updatePositionState(true); }}
  on:pause={() => { if (!_loading) _playing.set(false); }}
  on:loadedmetadata={_onDurationKnown}
  on:durationchange={_onDurationKnown}
  on:timeupdate={_onTimeUpdate}
></audio>

<div style="padding-bottom:{$_q8z ? '11rem' : '4.5rem'}">
  <slot />
</div>

{#if _addFeedback}
  <div style="position:fixed;bottom:{$_q8z ? '185px' : '80px'};left:50%;transform:translateX(-50%);z-index:200;
    background:#1c1c1c;border:1px solid rgba(255,255,255,.3);border-radius:99px;
    padding:10px 20px;font-size:.78rem;font-weight:700;color:#FFFFFF;
    white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4);
    animation:_fadeIn .2s ease">
    {_addFeedback}
  </div>
{/if}

{#if $_q8z}
<div
  bind:this={_playerEl}
  class="player-bar"
  style="position:fixed;bottom:58px;left:0;right:0;z-index:40;padding:12px 16px 10px;transition:transform .2s ease,opacity .2s ease;touch-action:none"
  on:touchstart|passive={_onPlayerTouchStart}
  on:touchmove={_onPlayerTouchMove}
  on:touchend={_onPlayerTouchEnd}
>
  <div style="display:flex;justify-content:center;margin-bottom:8px">
    <div style="width:36px;height:4px;border-radius:99px;background:rgba(255,255,255,.2)"></div>
  </div>

  <div style="max-width:560px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;position:relative;z-index:2">

      <button on:click={() => _openNP()}
        style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;background:none;border:none;cursor:pointer;text-align:left;padding:0">
        <div style="position:relative;flex-shrink:0;width:46px;height:46px">
          {#if _loading}
            <img src={$_q8z.thumbnail} alt="" style="width:46px;height:46px;border-radius:50%;object-fit:cover;display:block;border:2px solid rgba(255,255,255,.15);opacity:.5" />
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
              <div class="player-spin"></div>
            </div>
          {:else}
            <img src={$_q8z.thumbnail} alt="" style="width:46px;height:46px;border-radius:50%;object-fit:cover;display:block;border:2px solid rgba(255,255,255,.3)" />
            <div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid transparent;border-top-color:#FFFFFF;border-right-color:rgba(255,255,255,.25);animation:_ring 1.8s linear infinite;animation-play-state:{$_playing ? 'running' : 'paused'}"></div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:#181818;border:1.5px solid rgba(255,255,255,.4)"></div>
          {/if}
        </div>
        <div style="flex:1;min-width:0">
          <p style="font-size:.76rem;font-weight:700;color:#FFFFFF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px">{$_q8z.title}</p>
          <div style="display:flex;align-items:center;gap:6px">
            {#if _loading}
              <span style="font-size:.62rem;color:rgba(245,245,245,.4)">Memuat...</span>
            {:else}
              <div style="display:flex;align-items:flex-end;gap:2px;height:10px">
                {#each [1,2,3,4] as bar}
                  <div class="eqbar eqbar{bar}" style="width:3px;border-radius:2px;background:#FFFFFF;animation-play-state:{$_playing ? 'running' : 'paused'}"></div>
                {/each}
              </div>
              <span style="font-size:.62rem;color:rgba(245,245,245,.35)">{_s2dur(_elapsed)} / {_s2dur(_total)}</span>
            {/if}
          </div>
        </div>
      </button>

      <button on:click={() => _openMenuSheet($_q8z)}
        style="width:32px;height:32px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:transparent;border:none;cursor:pointer;color:rgba(245,245,245,.35);transition:all .15s"
        onmouseenter="this.style.background='rgba(255,255,255,.1)';this.style.color='rgba(255,255,255,.7)'"
        onmouseleave="this.style.background='transparent';this.style.color='rgba(245,245,245,.35)'">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
      </button>

      <div style="display:flex;gap:5px;align-items:center;flex-shrink:0">
        <button on:click={_prv}
          style="width:33px;height:33px;border-radius:50%;display:flex;align-items:center;justify-content:center;
            background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);cursor:pointer;
            color:rgba(245,245,245,.55);transition:all .15s"
          onmouseenter="this.style.background='rgba(255,255,255,.18)';this.style.color='#FFFFFF'"
          onmouseleave="this.style.background='rgba(255,255,255,.07)';this.style.color='rgba(245,245,245,.55)'">
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
        </button>
        <button on:click={_togglePlay}
          style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
            background:linear-gradient(135deg,#FFFFFF,#E6E6E6);border:none;cursor:pointer;
            color:#141414;transition:all .15s;box-shadow:0 0 14px rgba(255,255,255,.3)"
          onmouseenter="this.style.transform='scale(1.08)'" onmouseleave="this.style.transform='scale(1)'">
          {#if _loading}
            <div class="btn-spin"></div>
          {:else if $_playing}
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          {:else}
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          {/if}
        </button>
        <button on:click={_nxt}
          style="width:33px;height:33px;border-radius:50%;display:flex;align-items:center;justify-content:center;
            background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);cursor:pointer;
            color:rgba(245,245,245,.55);transition:all .15s"
          onmouseenter="this.style.background='rgba(255,255,255,.18)';this.style.color='#FFFFFF'"
          onmouseleave="this.style.background='rgba(255,255,255,.07)';this.style.color='rgba(245,245,245,.55)'">
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M16 6h2v12h-2zm-3.5 6L4 6v12z"/></svg>
        </button>
      </div>
    </div>

    <div style="position:relative;height:14px;display:flex;align-items:center">
      <div style="position:absolute;left:0;right:0;height:3px;border-radius:99px;background:rgba(255,255,255,.1);pointer-events:none">
        <div style="height:100%;width:{_pct}%;border-radius:99px;background:linear-gradient(to right,#FFFFFF,#E6E6E6);transition:width {_seeking ? '0s' : '1s'} linear;min-width:{_pct>0 ? '6px':'0'}"></div>
      </div>
      <input type="range" min="0" max="100" step="0.1"
        bind:this={_seekEl1}
        on:mousedown={_onSeekStart}
        on:touchstart|stopPropagation={_onSeekStart}
        on:input={_onSeekInput}
        on:mouseup={_onSeekEnd}
        on:touchend|stopPropagation={_onSeekEnd}
        class="seek-range"
        style="position:absolute;left:0;right:0;width:100%;margin:0;padding:0;touch-action:none;z-index:1" />
    </div>
  </div>
</div>
{/if}

{#if $_showNP && $_q8z}
<div class="overlay-enter" style="position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;
  background:linear-gradient(180deg,#1c1c1c 0%,#141414 100%);overflow:hidden;overscroll-behavior:contain">

  <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 0;gap:8px">
    <button on:click={_handleNPBack} aria-label={$_showLyrics ? 'Kembali ke lagu' : 'Tutup'}
      style="width:38px;height:38px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);cursor:pointer;color:rgba(245,245,245,.6)">
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
    </button>
    <div style="text-align:center;min-width:0;flex:1">
      <p style="font-size:.62rem;font-weight:700;color:rgba(255,255,255,.5);letter-spacing:.14em">{$_showLyrics ? 'LIRIK' : 'SEDANG DIPUTAR'}</p>
      {#if $_showLyrics}
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;margin:2px auto 0">
          <img src={$_q8z.thumbnail} alt="" style="width:18px;height:18px;border-radius:4px;object-fit:cover;flex-shrink:0" />
          <p style="font-size:.68rem;font-weight:600;color:rgba(245,245,245,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0">{$_q8z.title}</p>
        </div>
      {:else}
        <p style="font-size:.68rem;font-weight:600;color:rgba(245,245,245,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:2px auto 0">{$_q8z.title}</p>
      {/if}
    </div>
    <div style="display:flex;gap:8px;flex-shrink:0">
      <button on:click={() => _openMenuSheet($_q8z)}
        style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);cursor:pointer;color:rgba(245,245,245,.5)">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
      </button>
    </div>
  </div>

  <div class="hide-scrollbar" style="flex:1;display:flex;flex-direction:column;align-items:center;padding:0 24px;overflow-y:auto;overflow-x:hidden">
    <div style="display:flex;flex-direction:column;align-items:center;gap:24px;width:100%;margin:auto 0;padding:24px 0">    {#if !$_showLyrics}
    <div style="position:relative;width:min(300px,78vw);height:min(300px,78vw)">
      {#if _loading}
        <img src={$_q8z.thumbnail} alt="" style="width:100%;height:100%;border-radius:20px;object-fit:cover;display:block;border:2px solid rgba(255,255,255,.1);opacity:.4" />
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div class="np-spin"></div></div>
      {:else}
        <img src={$_q8z.thumbnail} alt="" style="width:100%;height:100%;border-radius:20px;object-fit:cover;display:block;border:2px solid rgba(255,255,255,.15);box-shadow:0 8px 32px rgba(0,0,0,.5)" />
      {/if}
    </div>

    <div style="text-align:center;width:100%">
      <p style="font-size:1.1rem;font-weight:800;color:#F5F5F5;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px">{$_q8z.title}</p>
      {#if _loading}
        <p style="font-size:.75rem;color:rgba(255,255,255,.35)">Memuat audio...</p>
      {:else if $_q8z.artistId}
        <button on:click={() => { _closeNP(); goto(`/artist/${$_q8z.artistId}`); }}
          style="background:none;border:none;padding:0;font-size:.78rem;font-weight:500;color:rgba(255,255,255,.6);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">
          {$_q8z.author || ''}
        </button>
      {:else}
        <p style="font-size:.78rem;font-weight:500;color:rgba(255,255,255,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;margin:0">{$_q8z.author || ''}</p>
      {/if}
    </div>
    {:else}
    <div bind:this={_lyricsWrapEl} class="hide-scrollbar" style="width:100%;height:min(360px,50vh);overflow-y:auto;overflow-x:hidden;padding:12px 4px;box-sizing:border-box">
      {#if _lyricsLoading}
        <div style="display:flex;flex-direction:column;gap:14px;padding-top:8px">
          {#each Array(6) as _}
            <div class="skeleton" style="height:14px;width:{60 + Math.random()*30}%;border-radius:6px"></div>
          {/each}
        </div>
      {:else if !_lyrics || !_lyrics.lines?.length}
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;text-align:center">
          <svg width="30" height="30" fill="rgba(255,255,255,.3)" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          <p style="font-size:.8rem;color:rgba(245,245,245,.4)">Lirik tidak ditemukan</p>
        </div>
      {:else}
        <div style="display:flex;flex-direction:column;gap:2px">
          {#each _lyrics.lines as line, i (i)}
            <p data-li={i}
              class="lyric-line {_lyrics.type === 'synced' ? (i === _activeLyricIdx ? 'active-lyric' : (i < _activeLyricIdx ? 'past-lyric' : '')) : ''}"
              on:click={() => { if (_lyrics.type === 'synced' && line.time >= 0 && _audioEl) { _audioEl.currentTime = line.time; _elapsed = line.time; _lyricT = line.time; } }}>
              {line.text}
            </p>
          {/each}
        </div>
      {/if}
    </div>
    {/if}

    <div style="width:100%">
      <div style="position:relative;height:18px;display:flex;align-items:center;margin-bottom:8px;cursor:pointer">
        <div style="position:absolute;left:0;right:0;height:4px;border-radius:99px;background:rgba(255,255,255,.1)">
          <div style="height:100%;width:{_pct}%;border-radius:99px;background:linear-gradient(to right,#FFFFFF,#E6E6E6);transition:width {_seeking ? '0s' : '1s'} linear;min-width:{_pct>0 ? '8px':'0'}"></div>
        </div>
        <input type="range" min="0" max="100" step="0.1"
          bind:this={_seekEl2}
          on:mousedown={_onSeekStart}
          on:touchstart={_onSeekStart}
          on:input={_onSeekInput}
          on:mouseup={_onSeekEnd}
          on:touchend={_onSeekEnd}
          class="seek-range"
          style="position:absolute;left:0;right:0;width:100%;margin:0;padding:0;touch-action:none" />
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:.65rem;color:rgba(245,245,245,.35)">{_s2dur(_elapsed)}</span>
        <span style="font-size:.65rem;color:rgba(245,245,245,.35)">{_s2dur(_total)}</span>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:center;gap:16px">
      <button on:click={_toggleShuffle}
        style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:{$_shuffle ? 'rgba(255,255,255,.15)' : 'transparent'};border:1px solid {$_shuffle ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.1)'};cursor:pointer;
          color:{$_shuffle ? '#FFFFFF' : 'rgba(245,245,245,.3)'};transition:all .2s">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
      </button>
      <button on:click={_prv}
        style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);cursor:pointer;
          color:rgba(245,245,245,.6);transition:all .15s"
        onmouseenter="this.style.background='rgba(255,255,255,.18)';this.style.color='#FFFFFF'"
        onmouseleave="this.style.background='rgba(255,255,255,.07)';this.style.color='rgba(245,245,245,.6)'">
        <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
      </button>
      <button on:click={_togglePlay}
        style="width:68px;height:68px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:linear-gradient(135deg,#FFFFFF,#E6E6E6);border:none;cursor:pointer;
          color:#141414;transition:all .18s;box-shadow:0 0 28px rgba(255,255,255,.35)"
        onmouseenter="this.style.transform='scale(1.07)'" onmouseleave="this.style.transform='scale(1)'">
        {#if _loading}
          <div class="btn-spin-lg"></div>
        {:else if $_playing}
          <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        {:else}
          <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        {/if}
      </button>
      <button on:click={_nxt}
        style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);cursor:pointer;
          color:rgba(245,245,245,.6);transition:all .15s"
        onmouseenter="this.style.background='rgba(255,255,255,.18)';this.style.color='#FFFFFF'"
        onmouseleave="this.style.background='rgba(255,255,255,.07)';this.style.color='rgba(245,245,245,.6)'">
        <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M16 6h2v12h-2zm-3.5 6L4 6v12z"/></svg>
      </button>
      <button on:click={_cycleRepeat}
        style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:{$_repeat !== 'off' ? 'rgba(255,255,255,.15)' : 'transparent'};border:1px solid {$_repeat !== 'off' ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.1)'};cursor:pointer;
          color:{$_repeat !== 'off' ? '#FFFFFF' : 'rgba(245,245,245,.3)'};transition:all .2s;position:relative">
        {#if $_repeat === 'one'}
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>
        {:else}
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
        {/if}
      </button>
    </div>
    </div>

    {#if !$_showLyrics}
      <div style="width:100%;padding-bottom:28px">
        <div class="section-title" style="margin-bottom:10px">
          <span class="bar"></span>
          <span style="font-size:.85rem;font-weight:700;color:#F5F5F5">Lagu Serupa</span>
        </div>

        {#if _similarTrackId !== $_q8z.videoId || _similarLoading}
          <div style="display:flex;flex-direction:column;gap:8px">
            {#each Array(4) as _}
              <div style="border-radius:14px;padding:9px;display:flex;gap:10px;align-items:center">
                <div class="skeleton" style="width:52px;height:52px;border-radius:8px;flex-shrink:0"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px">
                  <div class="skeleton" style="height:11px;width:70%;border-radius:6px"></div>
                  <div class="skeleton" style="height:9px;width:40%;border-radius:6px"></div>
                </div>
              </div>
            {/each}
          </div>
        {:else if !_similar.length}
          <p style="font-size:.78rem;color:rgba(245,245,245,.35);text-align:center;padding:16px 0">Belum ada rekomendasi lagu serupa</p>
        {:else}
          <div style="display:flex;flex-direction:column;gap:8px">
            {#each _similar as item, i}
              <div class="animate-card-up"
                style="border-radius:14px;padding:9px;display:flex;gap:10px;align-items:center;animation-delay:{Math.min(i,10)*30}ms;
                  {$_q8z?.videoId === item.videoId ? 'border-color:rgba(255,255,255,.38);box-shadow:0 0 18px rgba(255,255,255,.13)' : ''}">

                <button on:click={() => _playSimilar(item, i)}
                  style="flex-shrink:0;background:none;border:none;cursor:pointer;padding:0">
                  <div style="position:relative">
                    <img src={item.thumbnail} alt={item.title}
                      style="width:52px;height:52px;border-radius:8px;object-fit:cover;display:block" loading="lazy" />
                    {#if _similarLoadingId === item.videoId}
                      <div style="position:absolute;inset:0;border-radius:8px;background:rgba(10,10,10,.7);display:flex;align-items:center;justify-content:center">
                        <div class="mini-spin"></div>
                      </div>
                    {/if}
                  </div>
                </button>

                <div style="flex:1;min-width:0">
                  <button on:click={() => _playSimilar(item, i)}
                    style="display:block;width:100%;background:none;border:none;cursor:pointer;text-align:left;padding:0">
                    <p style="font-size:.83rem;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                      color:{$_q8z?.videoId === item.videoId ? '#FFFFFF' : '#F5F5F5'};margin-bottom:3px">
                      {item.title}
                    </p>
                  </button>
                  {#if item.author}
                    {#if item.artistId}
                      <button on:click={() => { _closeNP(); goto(`/artist/${item.artistId}`); }}
                        style="display:block;width:100%;background:none;border:none;cursor:pointer;padding:0;
                        font-size:.7rem;font-weight:500;color:rgba(255,255,255,.4);margin:0;text-align:left;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        {item.author}
                      </button>
                    {:else}
                      <p style="font-size:.7rem;font-weight:500;color:rgba(255,255,255,.4);margin:0;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        {item.author}
                      </p>
                    {/if}
                  {/if}
                </div>

                <button on:click={e => { e.stopPropagation(); _openMenuSheet(item); }}
                  style="width:28px;height:28px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;
                    background:transparent;border:none;cursor:pointer;color:rgba(245,245,245,.3);transition:all .15s"
                  onmouseenter="this.style.background='rgba(255,255,255,.1)';this.style.color='rgba(255,255,255,.7)'"
                  onmouseleave="this.style.background='transparent';this.style.color='rgba(245,245,245,.3)'">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
{/if}

{#if $_showMenu}
  <div style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;animation:_menuOverlayIn .26s ease"
    on:click={_closeMenuSheet}>
    <div bind:this={_menuSheetEl} style="width:100%;max-width:560px;background:#1c1c1c;border-radius:24px 24px 0 0;
      padding:0 0 40px;border-top:1px solid rgba(255,255,255,.15);max-height:75vh;overflow-y:auto;
      animation:_menuSheetIn .26s cubic-bezier(.4,0,.2,1)"
      on:click|stopPropagation>

      <div style="padding:16px 20px 14px;display:flex;gap:12px;align-items:center;border-bottom:1px solid rgba(255,255,255,.08);position:relative;touch-action:none"
        on:touchstart|passive={_onMenuSheetTouchStart}
        on:touchmove={_onMenuSheetTouchMove}
        on:touchend={_onMenuSheetTouchEnd}>
        <div style="width:36px;height:4px;border-radius:99px;background:rgba(255,255,255,.25);position:absolute;top:8px;left:50%;transform:translateX(-50%)"></div>
        <img src={$_showMenu.thumbnail} alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;margin-top:8px" />
        <div style="flex:1;min-width:0;margin-top:8px">
          <p style="font-size:.8rem;font-weight:700;color:#F5F5F5;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{$_showMenu.title}</p>
          {#if $_showMenu.author}
            <p style="font-size:.7rem;color:rgba(245,245,245,.4);margin:4px 0 0">{$_showMenu.author}</p>
          {/if}
        </div>
        <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;margin-top:8px">
          <button on:click={() => _toggleLike($_showMenu)} aria-label={_isMenuLiked ? 'Hapus dari Lagu Disukai' : 'Suka lagu ini'}
            style="width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
              background:none;border:none;cursor:pointer">
            {#if _isMenuLiked}
              <svg width="18" height="18" fill="#FFFFFF" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            {:else}
              <svg width="18" height="18" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            {/if}
          </button>
        </div>
      </div>

      <div style="padding:14px 20px 0">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:8px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:14px">
          {#if $_showMenu.videoId === $_q8z?.videoId}
            <button on:click={() => { _closeMenuSheet(); _showNP.set(true); if (!$_showLyrics) _toggleLyrics(); }}
              style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px 4px;
                background:rgba(255,255,255,.06);border:none;border-radius:14px;cursor:pointer">
              <svg width="19" height="19" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12M6 13h8M6 6h12" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span style="font-size:.68rem;font-weight:700;color:rgba(245,245,245,.75)">Lirik</span>
            </button>
          {/if}

          <button on:click={() => _downloadTrack($_showMenu)} disabled={_downloadingId === $_showMenu.videoId}
            style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px 4px;
              background:rgba(255,255,255,.06);border:none;border-radius:14px;cursor:pointer">
            {#if _downloadingId === $_showMenu.videoId}
              <div class="mini-spin"></div>
            {:else}
              <svg width="19" height="19" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {/if}
            <span style="font-size:.68rem;font-weight:700;color:rgba(245,245,245,.75)">
              {_downloadingId === $_showMenu.videoId ? 'Mengunduh' : 'Download'}
            </span>
          </button>

          <button on:click={() => _shareTrack($_showMenu)}
            style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px 4px;
              background:rgba(255,255,255,.06);border:none;border-radius:14px;cursor:pointer">
            <svg width="19" height="19" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1.6" viewBox="0 0 24 24"><path d="M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span style="font-size:.68rem;font-weight:700;color:rgba(245,245,245,.75)">Share</span>
          </button>
        </div>

        <p style="font-size:.65rem;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.1em;margin:0 0 12px">TAMBAH KE PLAYLIST</p>

        <button on:click={() => { _pendingTrack = $_showMenu; _showMenu.set(null); _showNewPlModal = true; _newPlName = ''; }}
          style="width:100%;display:flex;align-items:center;gap:12px;padding:12px 0;
            background:none;border:none;border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer;text-align:left">
          <div style="width:40px;height:40px;border-radius:10px;flex-shrink:0;
            background:rgba(255,255,255,.08);border:1px dashed rgba(255,255,255,.25);
            display:flex;align-items:center;justify-content:center">
            <svg width="18" height="18" fill="rgba(255,255,255,.6)" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </div>
          <span style="font-size:.82rem;font-weight:700;color:rgba(255,255,255,.7)">Buat Playlist Baru</span>
        </button>

        {#if $_playlists.length === 0}
          <p style="font-size:.76rem;color:rgba(245,245,245,.3);text-align:center;padding:16px 0">Belum ada playlist</p>
        {:else}
          {#each $_playlists as pl}
            <button on:click={() => _doAddToPl(pl)}
              style="width:100%;display:flex;align-items:center;gap:12px;padding:12px 0;
                background:none;border:none;border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer;text-align:left;transition:opacity .15s"
              onmouseenter="this.style.opacity='.7'" onmouseleave="this.style.opacity='1'">
              <div style="width:40px;height:40px;border-radius:10px;flex-shrink:0;
                background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);
                overflow:hidden;display:flex;align-items:center;justify-content:center">
                {#if pl.tracks.length === 0}
                  <svg width="18" height="18" fill="rgba(255,255,255,.35)" viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
                {:else if pl.tracks.length === 1}
                  <img src={pl.tracks[0].thumbnail} alt="" style="width:100%;height:100%;object-fit:cover" />
                {:else if pl.tracks.length === 2}
                  <div style="display:grid;grid-template-columns:1fr 1fr;width:100%;height:100%">
                    {#each pl.tracks.slice(0,2) as t}<img src={t.thumbnail} alt="" style="width:100%;height:100%;object-fit:cover" />{/each}
                  </div>
                {:else if pl.tracks.length === 3}
                  <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:100%;height:100%">
                    <img src={pl.tracks[0].thumbnail} alt="" style="width:100%;height:100%;object-fit:cover;grid-row:1/3" />
                    <img src={pl.tracks[1].thumbnail} alt="" style="width:100%;height:100%;object-fit:cover" />
                    <img src={pl.tracks[2].thumbnail} alt="" style="width:100%;height:100%;object-fit:cover" />
                  </div>
                {:else}
                  <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:100%;height:100%">
                    {#each pl.tracks.slice(0,4) as t}<img src={t.thumbnail} alt="" style="width:100%;height:100%;object-fit:cover" />{/each}
                  </div>
                {/if}
              </div>
              <div style="flex:1;min-width:0">
                <p style="font-size:.82rem;font-weight:700;color:#F5F5F5;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{pl.name}</p>
                <p style="font-size:.7rem;color:rgba(245,245,245,.35);margin:4px 0 0">{pl.tracks.length} lagu</p>
              </div>
              <svg width="18" height="18" fill="rgba(255,255,255,.3)" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
          {/each}
        {/if}

        {#if $_showMenu?._ctx === 'recent'}
          <button on:click={() => { const vid = $_showMenu.videoId; _closeMenuSheet(); import('$lib/playlist.js').then(m => { m.removeRecentlyPlayed(vid); _recentlyPlayed.set(m.getRecentlyPlayed()); }); }}
            style="width:100%;display:flex;align-items:center;gap:12px;padding:14px 0;
              background:none;border:none;cursor:pointer;text-align:left;margin-top:4px">
            <svg width="18" height="18" fill="rgba(255,100,100,.6)" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            <span style="font-size:.82rem;font-weight:700;color:rgba(255,100,100,.7)">Hapus dari Riwayat</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if _showNewPlModal}
  <div style="position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px"
    on:click={() => { _showNewPlModal = false; _pendingTrack = null; }}>
    <div style="width:100%;max-width:400px;background:#1c1c1c;border-radius:20px;padding:24px 20px;border:1px solid rgba(255,255,255,.15)"
      on:click|stopPropagation>
      <p style="font-size:.95rem;font-weight:700;color:#FFFFFF;margin:0 0 16px">Playlist Baru</p>
      <input
        bind:value={_newPlName}
        on:keydown={e => { if (e.key === 'Enter') _doCreateAndAddModal(); }}
        placeholder="Nama playlist baru..."
        style="width:100%;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.2);color:#F5F5F5;
          font-family:'Quicksand',sans-serif;font-size:1rem;font-weight:500;
          border-radius:12px;padding:12px 16px;outline:none;margin-bottom:14px;box-sizing:border-box"
        autofocus
      />
      <div style="display:flex;gap:10px">
        <button on:click={() => { _showNewPlModal = false; _pendingTrack = null; }}
          style="flex:1;padding:12px;border-radius:12px;background:rgba(255,255,255,.07);
            border:1px solid rgba(255,255,255,.15);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.85rem;font-weight:700;color:rgba(245,245,245,.6)">Batal</button>
        <button on:click={_doCreateAndAddModal}
          style="flex:1;padding:12px;border-radius:12px;background:linear-gradient(135deg,#FFFFFF,#E6E6E6);
            border:none;cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.85rem;font-weight:700;color:#141414">
          Buat
        </button>
      </div>
    </div>
  </div>
{/if}

<nav class="bottom-nav">
  <ul class="bottom-nav-list">
    {#each _navItems as [p, l, ic], i}
      <li class="bottom-nav-item">
        <button on:click={() => goto(p)} class="bottom-nav-link {_rt === p ? 'active' : ''}">
          <span class="bottom-nav-icon">
            <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d={ic}/></svg>
          </span>
          <span class="bottom-nav-text">{l}</span>
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    background: var(--bg-raised);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .bottom-nav-list {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .bottom-nav-item {
    flex: 1;
  }

  .bottom-nav-link {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 58px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: rgba(245,245,245,.4);
    transition: color .2s ease;
  }

  .bottom-nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bottom-nav-text {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: .02em;
  }

  .bottom-nav-link.active {
    color: var(--gold, #D4AF37);
  }

  @keyframes _sp   { to { transform: rotate(360deg); } }
  @keyframes _ring { to { transform: rotate(360deg); } }
  @keyframes _spin { to { transform: rotate(360deg); } }
  @keyframes _fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  @keyframes _menuOverlayIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes _menuSheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }

  .player-spin { width:26px;height:26px;border-radius:50%;border:2.5px solid rgba(255,255,255,.15);border-top-color:#FFFFFF;animation:_sp .7s linear infinite; }
  .np-spin { width:52px;height:52px;border-radius:50%;border:3px solid rgba(255,255,255,.15);border-top-color:#FFFFFF;animation:_sp .8s linear infinite; }
  .mini-spin { width:22px;height:22px;border-radius:50%;border:2.5px solid rgba(255,255,255,.2);border-top-color:#FFFFFF;animation:_sp .7s linear infinite; }
  .btn-spin { width:14px;height:14px;border-radius:50%;border:2px solid rgba(20,20,20,.3);border-top-color:#141414;animation:_sp .6s linear infinite; }
  .btn-spin-lg { width:22px;height:22px;border-radius:50%;border:2.5px solid rgba(20,20,20,.3);border-top-color:#141414;animation:_sp .6s linear infinite; }

  .eqbar { height:3px;transition:height .1s; }
  .eqbar1 { animation:_eq1 .5s ease-in-out infinite alternate; }
  .eqbar2 { animation:_eq2 .7s ease-in-out infinite alternate; }
  .eqbar3 { animation:_eq3 .6s ease-in-out infinite alternate; }
  .eqbar4 { animation:_eq4 .4s ease-in-out infinite alternate; }

  @keyframes _eq1 { from{height:2px} to{height:10px} }
  @keyframes _eq2 { from{height:5px} to{height:10px} }
  @keyframes _eq3 { from{height:3px} to{height:8px}  }
  @keyframes _eq4 { from{height:7px} to{height:4px}  }

  .seek-range { -webkit-appearance:none;appearance:none;height:100%;background:transparent;cursor:pointer;outline:none; }
  .seek-range::-webkit-slider-thumb { -webkit-appearance:none;appearance:none;width:13px;height:13px;border-radius:50%;background:#ffffff;border:2px solid rgba(255,255,255,.6);box-shadow:0 0 6px rgba(255,255,255,.35);cursor:pointer;transition:transform .12s; }
  .seek-range::-webkit-slider-thumb:active { transform:scale(1.25); }
  .seek-range::-moz-range-thumb { width:13px;height:13px;border-radius:50%;background:#ffffff;border:2px solid rgba(255,255,255,.6);box-shadow:0 0 6px rgba(255,255,255,.35);cursor:pointer; }
  .seek-range::-webkit-slider-runnable-track { background:transparent; }
  .seek-range::-moz-range-track { background:transparent; }
</style>
