<script context="module">
  // Cache di level modul: bertahan selama halaman ini pernah dimuat sekali di sesi SPA,
  // jadi saat user balik dari halaman lain (mis. halaman artis), feed tidak di-fetch ulang.
  let _homeCache = null;
  let _homeScrollY = 0;
</script>

<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { _g9, _getHome, _getArtist } from '$lib/api.js';
  import { _q8z, _p1k, _x9a, _showMenu, _playlists } from '$lib/store.js';
  import { getPlaylists, createPlaylist } from '$lib/playlist.js';

  const __cv = _q8z;
  let _ds = [], _ld = true, _er = null;
  let _refreshing = false;
  let _collection = [];
  let _loadingId = null;
  let _artists = [];
  let _artistsLoading = true;
  let _activeMood = 0;
  let _trending = [];
  let _trendingLoading = true;
  let _mix = [];

  const _moods = [
    { label: 'Viral', query: 'Lagu Indonesia Viral Tiktok 2026' },
    { label: 'Santai', query: 'Chill Vibes Lofi Songs' },
    { label: 'Fokus', query: 'Focus Deep Work Instrumental Music' },
    { label: 'Nyetir', query: 'Driving Roadtrip Music Indonesia' },
    { label: 'Gaming', query: 'Gaming EDM Hype Songs' },
    { label: 'Semangat', query: 'Energetic Workout Beats' },
    { label: 'Pesta', query: 'Party Dance Hits' },
    { label: 'Bahagia', query: 'Feel Good Happy Songs Indonesia' },
    { label: 'Romantis', query: 'Lagu Romantis Indonesia' },
    { label: 'Tidur', query: 'Sleeping Calming Relaxation Music' },
    { label: 'Galau', query: 'Lagu Sad Galau Indonesia' },
    { label: 'Nostalgia', query: 'Lagu Indonesia 2000an Nostalgia' },
  ];

  $: _hero = _ds.length ? { item: _ds[0], idx: 0 } : null;
  $: _quick = _ds.slice(1, 5).map((item, i) => ({ item, idx: i + 1 }));

  function _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function _pickFlavorIndices(excludeIdx, count) {
    const pool = _moods.map((_, i) => i).filter(i => i !== excludeIdx);
    return _shuffle(pool).slice(0, count);
  }

  function _artistKey(item) {
    return (item.artistId || item.author || item.title || '').toLowerCase();
  }

  // "Artis Populer" dulu diambil dari artistId lagu yang lagi tampil di feed
  // (_ds), jadi isinya cuma sebanyak/seberagam artis yang kebetulan muncul di
  // mood aktif. Sekarang ngirim request ke endpoint search buat nama-nama
  // artis populer tertentu (mis. "Raim Laode", "Taylor Swift", "Justin
  // Bieber"), sama seperti cara YT Music nampilin hasil pencarian artist -
  // jadi section ini konsisten isinya, gak bergantung ke feed lagu.
  // Sistemnya HYBRID: default-nya dynamic search + exact-match + pemilihan
  // audiens terbanyak (buat hindarin clone/duplikat), TAPI kalau ada artis
  // yang tetap ambigu walau sudah divalidasi begitu (mis. clone-nya justru
  // punya audiens lebih banyak dari akun resmi), boleh di-override langsung
  // ke artist/channel ID via _popularArtistOverrides di bawah.
  const _popularArtistQueries = [
    'Raim Laode', 'Taylor Swift', 'Justin Bieber', 'Tulus', 'Rich Brian',
    'Bruno Mars', 'Dua Lipa', 'The Weeknd', 'Ariana Grande', 'Sheila On 7',
    'Weird Genius', 'NIKI'
  ];

  // Sebagian artis punya banyak channel/akun clone-duplikat yang pakai nama
  // PERSIS sama dengan artisnya (kadang subscriber clone-nya malah lebih
  // banyak dari akun resmi), jadi validasi exact-match + audiens terbanyak
  // di bawah masih bisa salah pilih. Buat kasus begini, override langsung ke
  // artist/channel ID yang sudah dipastikan benar (manual verified) - key-nya
  // dinormalisasi (_normArtistName) biar cocok sama entri di
  // _popularArtistQueries apa adanya. Detail (nama, thumbnail, dst) TETAP
  // diambil LIVE dari endpoint /api/artist tiap kali dipakai, BUKAN
  // di-hardcode - jadi kalau YT Music update nama/foto profil artisnya,
  // section ini otomatis ikut ke-update juga.
  const _popularArtistOverrides = {
    'raim laode': 'UC6CRezCe1QhJfNpdTOXx5Sg'
  };

  // Parse angka audiens ("pendengar bulanan"/"subscriber"/dst) dari subtitle
  // hasil search. Dipakai buat mutusin channel MANA yang beneran dimaksud
  // kalau ada lebih dari satu channel dengan nama PERSIS sama — misal ada
  // akun clone/duplikat yang pakai nama artis asli. Gak perlu presisi
  // sempurna, cukup buat bandingin mana yang jauh lebih gede.
  function _parseAudienceCount(subtitle) {
    if (!subtitle) return 0;
    const s = String(subtitle).toLowerCase();
    // Format singkatan dgn desimal koma, mis. "1,2 jt pendengar bulanan"
    // atau "500 rb subscriber".
    let m = s.match(/(\d+(?:,\d+)?)\s*(rb|ribu|jt|juta|m|b|miliar)\b/);
    if (m) {
      const num = parseFloat(m[1].replace(',', '.'));
      const unit = m[2];
      if (unit === 'rb' || unit === 'ribu') return num * 1e3;
      if (unit === 'jt' || unit === 'juta' || unit === 'm') return num * 1e6;
      return num * 1e9; // b / miliar
    }
    // Format angka penuh pakai titik ribuan, mis. "823.145 pendengar bulanan".
    m = s.match(/(\d{1,3}(?:\.\d{3})+|\d+)\s*(pendengar|subscriber|audiens)/);
    if (m) return parseInt(m[1].replace(/\./g, ''), 10) || 0;
    return 0;
  }

  // Normalisasi nama buat exact-match. Selain kapitalisasi/whitespace, hasil
  // search YT Music kadang nempelin embel-embel yang bukan bagian nama asli
  // artisnya — kanal auto-generated tanpa artist channel resmi suka disebut
  // "<Nama> - Topic", ada juga yang kebawa "(Official)"/"VEVO"/diakritik
  // beda unicode form. Dibersihin dulu sebelum dibandingin, TAPI tetap exact
  // equality (bukan substring/fuzzy) — jadi masih aman dari collision nama
  // mirip, cuma gak gagal cocok gara-gara noise kayak gitu.
  function _normArtistName(s) {
    return String(s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*[-–]\s*topic\s*$/i, '')
      .replace(/\s*[-–]\s*vevo\s*$/i, '')
      .replace(/\((official|resmi)\)\s*$/i, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  // Jalanin `fn` buat tiap `items` tapi dibatasi maksimal `limit` request
  // bersamaan, bukan semuanya sekaligus. 12 nama artis x request search (yang
  // masing-masing nembak 3 request ke YT Music di baliknya) kalau ditembak
  // barengan itu ~36 request YT Music dalam sekali gebrak — gampang banget
  // ke-throttle YT Music-nya sendiri, hasilnya beberapa/banyak query balik
  // kosong/gagal dan "Artis Populer" jadi keliatan kosong padahal artisnya
  // ada. Dibatasi biar lebih "sopan" ke YT Music dan hasilnya lebih stabil.
  async function _mapLimited(items, limit, fn) {
    const results = new Array(items.length);
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const cur = idx++;
        results[cur] = await fn(items[cur], cur);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  // Cari 1 nama artis, dengan 1x retry (bypass cache) kalau percobaan
  // pertama gagal total ATAU balik tanpa hasil artis sama sekali — biasanya
  // gara-gara hiccup jaringan sesaat, bukan karena artisnya beneran gak ada.
  // Tanpa bypassCache, retry percuma karena _g9 bakal balikin hasil "kosong"
  // yang sama persis dari cache-nya sendiri.
  // `force`: dipakai pas user eksplisit refresh Artis Populer — percobaan
  // PERTAMA juga langsung bypass cache (bukan cuma retry-nya), soalnya
  // _searchMem di api.js itu cache in-memory tanpa TTL (bertahan seumur
  // sesi SPA), jadi tanpa ini refresh gak bakal pernah benar-benar nembak
  // ulang ke YT Music buat artis yang search-nya udah pernah sukses.
  async function _searchArtistWithRetry(name, i, force = false) {
    const group = `_home_artist_${i}`;
    let r = await _g9(name, group, { bypassCache: force }).catch(() => null);
    if (r?.artists?.length) return r;
    await new Promise(res => setTimeout(res, 350));
    r = await _g9(name, group, { bypassCache: true }).catch(() => null);
    return r;
  }

  // Ambil 1 entri "Artis Populer" berdasarkan hasil search dinamis (jalur
  // default, dipakai kalau artisnya gak ada di _popularArtistOverrides).
  async function _resolveArtistBySearch(name, i, force) {
    const r = await _searchArtistWithRetry(name, i, force);
    const wantedName = _normArtistName(name);
    // Jangan langsung percaya hasil pertama (r.artists[0]) — hasil search
    // bisa collision sama artis lain yang namanya mirip/mengandung query.
    // Kumpulin SEMUA hasil artist yang benar-benar exact match (case-
    // insensitive, whitespace/embel-embel-normalized) dengan nama yang
    // kita cari. Kalau gak ada satupun yang cocok persis, skip artis ini
    // daripada nampilin artis yang salah.
    const matches = (r?.artists || []).filter(
      a => a?.id && _normArtistName(a.title) === wantedName
    );
    if (!matches.length) return null;
    // Bisa aja ada lebih dari satu channel dengan nama PERSIS sama (mis.
    // akun clone/duplikat pakai nama artis asli). Dalam kasus gitu, pilih
    // yang audiensnya (pendengar bulanan/subscriber) paling banyak — hampir
    // selalu itu artisnya yang beneran, bukan clone-nya. Ini masih bisa
    // salah kalau clone-nya justru punya audiens lebih gede (kasus kayak
    // Raim Laode) — buat artis begini pakai override ID, bukan andalin
    // heuristik audiens ini.
    const best = matches.length === 1
      ? matches[0]
      : matches.reduce((a, b) => _parseAudienceCount(b.artist) > _parseAudienceCount(a.artist) ? b : a);
    return { id: best.id, title: best.title, cover: best.cover };
  }

  // Ambil 1 entri "Artis Populer" dari artist/channel ID yang sudah
  // di-override (dipastikan manual, bukan hasil search). Detailnya (nama,
  // thumbnail) tetap live dari endpoint /api/artist yang sudah ada, jadi
  // gak ada apa pun yang di-hardcode selain ID-nya sendiri.
  async function _resolveArtistByOverride(id) {
    try {
      const data = await _getArtist(id);
      if (!data?.name) return null;
      return { id, title: data.name, cover: data.cover || '' };
    } catch {
      return null;
    }
  }

  async function _resolveArtistEntry(name, i, force) {
    const overrideId = _popularArtistOverrides[_normArtistName(name)];
    if (overrideId) return _resolveArtistByOverride(overrideId);
    return _resolveArtistBySearch(name, i, force);
  }

  async function _loadArtistsTop(force = false) {
    _artistsLoading = true;
    try {
      const results = await _mapLimited(
        _popularArtistQueries, 4,
        (name, i) => _resolveArtistEntry(name, i, force)
      );
      const seen = new Set();
      const list = [];
      results.forEach(entry => {
        if (!entry?.id || seen.has(entry.id)) return;
        seen.add(entry.id);
        list.push(entry);
      });
      _artists = list;
    } catch {
      _artists = [];
    } finally {
      _artistsLoading = false;
    }
  }

  // Query fallback kalau FEmusic_home gagal/kosong (mis. YT Music menolak
  // request tanpa sesi login) — biar section tetap ada isinya, bukan hilang.
  const _trendingFallbackQueries = [
    'Lagu Viral 2026',
    'Trending Music Indonesia',
    'Top Hits 2026'
  ];

  async function _loadTrendingFallback() {
    try {
      const results = await Promise.all(
        _trendingFallbackQueries.map((q, i) => _g9(q, `_home_trending_${i}`).catch(() => null))
      );
      const seen = new Set();
      const pool = [];
      for (const r of results) {
        for (const s of (r?.songs || [])) {
          if (!s.videoId || seen.has(s.videoId)) continue;
          seen.add(s.videoId);
          pool.push(s);
        }
      }
      return _shuffle(pool);
    } catch {
      return [];
    }
  }

  // Query terpisah buat nyari lagu Indonesia yang lagi viral/rame saat ini.
  // Dipakai buat nambahin "Campuran Untukmu" doang (BUKAN "Lagi Rame
  // Diputar" — itu harus murni ngikutin urutan asli dari FEmusic_home biar
  // akurat sama beranda YT Music beneran, gak dicampur/diacak lagi), dan
  // dijalanin belakangan/background biar gak nunda kemunculan pertama kedua
  // section (lihat _augmentMixWithViral).
  const _viralIndoQueries = [
    'Lagu Indonesia Viral',
    'Lagu Indonesia Trending'
  ];

  async function _loadViralIndo() {
    try {
      const results = await _mapLimited(
        _viralIndoQueries, 2,
        (q, i) => _g9(q, `_home_viral_indo_${i}`).catch(() => null)
      );
      const seen = new Set();
      const pool = [];
      for (const r of results) {
        for (const s of (r?.songs || [])) {
          if (!s.videoId || seen.has(s.videoId)) continue;
          seen.add(s.videoId);
          pool.push(s);
        }
      }
      return _shuffle(pool);
    } catch {
      return [];
    }
  }

  // Sisipin `priority` ke dalam `pool` secara berkala (1 item priority tiap
  // `everyN` item pool) alih-alih ditumpuk semua di depan — biar lagu viral
  // Indonesia kebagian porsi lebih besar di "Campuran Untukmu" tapi urutan/
  // variasi aslinya tetap kepegang, gak ketiban semua di satu tempat.
  function _interleavePriority(pool, priority, everyN = 2) {
    if (!priority.length) return pool;
    const result = [];
    let pi = 0;
    for (let i = 0; i < pool.length; i++) {
      result.push(pool[i]);
      if ((i + 1) % everyN === 0 && pi < priority.length) {
        result.push(priority[pi++]);
      }
    }
    while (pi < priority.length) result.push(priority[pi++]);
    return result;
  }

  // Nambahin lagu Indonesia viral ke "Campuran Untukmu" SETELAH trending/mix
  // awal udah tampil & retry-nya kelar. Dijalanin belakangan (gak diawait di
  // jalur render pertama) biar section ini gak ikut nunggu 2 request search
  // tambahan ini buat bisa muncul — itu salah satu sumber kenapa section
  // suka "telat ngeload".
  async function _augmentMixWithViral() {
    if (!_mix.length) return;
    const viralIndo = await _loadViralIndo();
    if (!viralIndo.length) return;
    const existingIds = new Set([..._trending, ..._mix].map(s => s.videoId));
    const viralPicks = viralIndo.filter(s => !existingIds.has(s.videoId));
    if (!viralPicks.length) return;
    _mix = _interleavePriority(_mix, viralPicks, 2);
  }

  async function _loadTrending(attempt = 0) {
    _trendingLoading = true;
    try {
      const home = await _getHome();
      let pool = (home?.songs || []).filter(s => s.videoId);

      // FEmusic_home kadang balik pool yang tipis (mis. continuation gagal
      // di tengah jalan) — cukup buat isi "Lagi Rame Diputar" tapi gak sisa
      // buat "Campuran Untukmu", jadi section itu hilang padahal home-nya
      // sendiri sukses. Tambahin (bukan gantiin) dari fallback query kalau
      // pool masih tipis, biar dua section tetap keisi.
      if (pool.length < 20) {
        const seen = new Set(pool.map(s => s.videoId));
        const extra = (await _loadTrendingFallback()).filter(s => !seen.has(s.videoId));
        pool = pool.concat(extra);
      }

      if (pool.length) {
        // `pool` sudah terurut dari yang paling sering muncul di berbagai
        // shelf FEmusic_home (paling "rame"/didorong) ke yang paling jarang
        // — INI urutan asli algoritma beranda YT Music, jadi "Lagi Rame
        // Diputar" (12 item pertama) dibiarkan apa adanya, gak
        // dicampur/diacak lagi biar akurat.
        _trending = pool.slice(0, 12);
        _mix = _shuffle(pool.slice(12));
      } else {
        _trending = [];
        _mix = [];
      }
    } catch {
      const shuffled = await _loadTrendingFallback();
      _trending = shuffled.slice(0, 12);
      _mix = shuffled.slice(12);
    } finally {
      _trendingLoading = false;
    }

    // Feed utama (_getHome) kadang gagal/kosong di percobaan pertama (lihat
    // catatan di atas _trendingFallbackQueries), dan sesekali fallback-nya
    // juga ikut kena hiccup. Daripada salah satu section ini "hilang" sampai
    // user pencet refresh manual, coba ulang sendiri beberapa kali dengan
    // jeda — dicek dua-duanya, bukan cuma trending, karena mix bisa kosong
    // sendiri walau trending udah keisi.
    if ((!_trending.length || !_mix.length) && attempt < 2) {
      await new Promise(res => setTimeout(res, 600 * (attempt + 1)));
      await _loadTrending(attempt + 1);
      return;
    }

    await _augmentMixWithViral();
  }

  async function _loadFeed(moodIdx) {
    _ld = true; _er = null;
    try {
      const [flavorAIdx, flavorBIdx] = _pickFlavorIndices(moodIdx, 2);
      const [primary, flavorA, flavorB] = await Promise.all([
        _g9(_moods[moodIdx].query, '_home_primary'),
        _g9(_moods[flavorAIdx].query, '_home_flavor_a'),
        _g9(_moods[flavorBIdx].query, '_home_flavor_b'),
      ]);

      const usedIds = new Set();
      const extraSongs = _shuffle((flavorA.songs || []).filter(s => s.videoId)).slice(0, 10);
      extraSongs.forEach(s => usedIds.add(s.videoId));

      const pools = [
        { songs: primary.songs || [], weight: 0 },
        { songs: flavorB.songs || [], weight: 1 },
      ];

      const candidates = [];
      pools.forEach(({ songs, weight }) => {
        songs.forEach((s, pos) => {
          if (!s.videoId || usedIds.has(s.videoId)) return;
          usedIds.add(s.videoId);
          candidates.push({ item: s, pos, weight, rand: Math.random() });
        });
      });

      candidates.sort((a, b) => (a.pos + a.weight * 4 + a.rand * 7) - (b.pos + b.weight * 4 + b.rand * 7));

      const artistCap = new Map();
      const capped = [];
      for (const c of candidates) {
        const key = _artistKey(c.item);
        const n = artistCap.get(key) || 0;
        if (key && n >= 2) continue;
        artistCap.set(key, n + 1);
        capped.push(c.item);
        if (capped.length >= 30) break;
      }

      _ds = capped;
      _p1k.set(_ds);

      const albumItems = (primary.albums || []).slice(0, 8).map(a => ({ ...a, _kind: a.albumType || 'Album' }));
      const playlistItems = (primary.playlists || []).slice(0, 6).map(p => ({ ...p, _kind: 'Playlist' }));
      _collection = _shuffle([...albumItems, ...playlistItems]).slice(0, 10);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      _er = e.message;
    } finally {
      _ld = false;
    }
  }

  async function _pickMood(i) {
    if (_activeMood === i) return;
    _activeMood = i;
    // Feed dulu (yang langsung keliatan pas ganti mood), Artis Populer
    // nyusul belakangan — bukan bareng — biar gak numpuk request ke YT
    // Music bareng-bareng (lihat catatan di _mapLimited).
    await _loadFeed(i);
    _saveCache();
    await _loadArtistsTop();
    _saveCache();
  }

  async function _refresh() {
    if (_refreshing || _ld) return;
    _refreshing = true;
    try {
      await Promise.all([
        _loadFeed(_activeMood),
        _loadTrending()
      ]);
      _saveCache();
      // force=true: ini refresh eksplisit dari user, jadi Artis Populer
      // harus benar-benar nembak ulang, bukan kebaca dari _searchMem lama.
      await _loadArtistsTop(true);
      _saveCache();
    } finally {
      _refreshing = false;
    }
  }

  function _saveCache() {
    _homeCache = {
      ds: _ds, collection: _collection, activeMood: _activeMood,
      artists: _artists, trending: _trending, mix: _mix
    };
  }

  onMount(async () => {
    if (_homeCache) {
      _ds = _homeCache.ds;
      _collection = _homeCache.collection;
      _activeMood = _homeCache.activeMood;
      _artists = _homeCache.artists;
      _trending = _homeCache.trending || [];
      _mix = _homeCache.mix || [];
      _artistsLoading = false;
      _trendingLoading = false;
      _ld = false;
      await tick();
      window.scrollTo(0, _homeScrollY);
      return;
    }

    // Konten utama (feed + trending/mix) dulu — itu yang paling kelihatan &
    // paling ditunggu user pas pertama buka. "Artis Populer" nembak 4-12
    // request search tambahan ke YT Music di belakangnya; kalau ditembak
    // bareng sama feed+trending pas mount, semuanya rebutan bandwidth/rate
    // limit YT Music dan hasilnya section-section ini suka telat muncul
    // atau (khusus Artis Populer) balik kosong gara-gara request-nya
    // ke-throttle. Jadi Artis Populer dimuat belakangan, gak diblokir ke
    // scroll-restore di bawah.
    await Promise.all([
      _loadFeed(_activeMood),
      _loadTrending()
    ]);
    _saveCache();
    await tick();
    window.scrollTo(0, _homeScrollY);

    await _loadArtistsTop();
    _saveCache();
  });

  onDestroy(() => {
    _homeScrollY = window.scrollY;
  });

  async function _pl(item, idx) {
    _loadingId = item.videoId;
    _p1k.set(_ds);
    _x9a.set(idx);
    _q8z.set(item);
    setTimeout(() => { _loadingId = null; }, 3000);
  }

  async function _plTrending(item, idx) {
    _loadingId = item.videoId;
    _p1k.set(_trending);
    _x9a.set(idx);
    _q8z.set(item);
    setTimeout(() => { _loadingId = null; }, 3000);
  }

  async function _plMix(item, idx) {
    _loadingId = item.videoId;
    _p1k.set(_mix);
    _x9a.set(idx);
    _q8z.set(item);
    setTimeout(() => { _loadingId = null; }, 3000);
  }

  function _openCollection(c) {
    if (c._kind === 'Playlist') { goto('/search'); return; }
    goto(`/album/${c.id}`);
  }

  function _openMenu(e, item) {
    e.stopPropagation();
    _showMenu.set(item);
    getPlaylists().then((list) => _playlists.set(list)).catch(() => {});
  }

  let _showNewPl = false;
  let _newPlName = '';

  function focusScroll(node) {
    function onFocus() {
      setTimeout(() => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 320);
    }
    node.addEventListener('focus', onFocus);
    return { destroy() { node.removeEventListener('focus', onFocus); } };
  }

  async function _doCreatePl() {
    const name = _newPlName.trim();
    if (!name) return;
    _newPlName = '';
    _showNewPl = false;
    try {
      await createPlaylist(name);
      _playlists.set(await getPlaylists());
    } catch {}
  }
</script>

<div style="max-width:560px;margin:0 auto;padding:28px 16px 0">

  <div style="margin-bottom:22px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">

      <div style="position:relative;width:64px;height:64px;flex-shrink:0">
        <svg width="64" height="64" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="512" height="512" rx="112" fill="#0D0D0D"/>
          <path
            d="M348 180
               C322 151 282 136 238 136
               C169 136 116 188 116 256
               C116 324 169 376 238 376
               C282 376 322 361 348 331
               V256
               H250"
            stroke="#FFFFFF"
            stroke-width="38"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="220" cy="256" r="46" fill="#F5F5F5"/>
          <circle cx="220" cy="256" r="38" stroke="#C8C8C8" stroke-width="2"/>
          <circle cx="220" cy="256" r="31" stroke="#D5D5D5" stroke-width="2"/>
          <g stroke="#0D0D0D" stroke-width="5" stroke-linecap="round">
            <path d="M192 250V262"/>
            <path d="M200 243V269"/>
            <path d="M208 237V275"/>
            <path d="M216 246V266"/>
            <path d="M224 231V281"/>
            <path d="M232 239V273"/>
            <path d="M240 246V266"/>
            <path d="M248 241V271"/>
          </g>
          <circle cx="220" cy="256" r="4" fill="#F5F5F5"/>
        </svg>
      </div>

      <div style="flex:1;min-width:0;display:flex;align-items:center">
        <span style="font-size:1.75rem;font-weight:700;color:#FFFFFF;letter-spacing:-.02em;font-family:'Quicksand',sans-serif">Ganify</span>
      </div>

      <button
        on:click={_refresh}
        disabled={_refreshing || _ld}
        style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
          cursor:pointer;color:rgba(255,255,255,0.7);flex-shrink:0;transition:all .15s"
        onmouseenter="this.style.background='rgba(255,255,255,0.18)';this.style.color='#FFFFFF';this.style.borderColor='rgba(255,255,255,0.4)'"
        onmouseleave="this.style.background='rgba(255,255,255,0.07)';this.style.color='rgba(255,255,255,0.7)';this.style.borderColor='rgba(255,255,255,0.15)'"
        aria-label="Segarkan rekomendasi"
      >
        <svg width="17" height="17" fill="currentColor" viewBox="0 0 24 24" class={_refreshing ? 'spin-refresh' : ''}>
          <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
      </button>

      <button
        on:click={() => goto('/search')}
        style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
          cursor:pointer;color:rgba(255,255,255,0.7);flex-shrink:0;transition:all .15s"
        onmouseenter="this.style.background='rgba(255,255,255,0.18)';this.style.color='#FFFFFF';this.style.borderColor='rgba(255,255,255,0.4)'"
        onmouseleave="this.style.background='rgba(255,255,255,0.07)';this.style.color='rgba(255,255,255,0.7)';this.style.borderColor='rgba(255,255,255,0.15)'"
        aria-label="Cari lagu"
      >
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
      </button>

    </div>
  </div>

  <div class="hscroll hide-scrollbar" style="margin-bottom:24px">
    {#each _moods as mood, i}
      <button on:click={() => _pickMood(i)}
        class="chip-tab {_activeMood === i ? 'active' : ''}"
        style="flex-shrink:0;padding:8px 16px;border-radius:99px;font-size:.72rem;font-weight:700;cursor:pointer;
          background:{_activeMood === i ? '' : 'rgba(255,255,255,.06)'};
          border:1px solid {_activeMood === i ? 'transparent' : 'rgba(255,255,255,.15)'};
          color:{_activeMood === i ? '' : 'rgba(245,245,245,.6)'}">
        {mood.label}
      </button>
    {/each}
  </div>

  {#if _ld}
    <div class="hscroll hide-scrollbar" style="margin-bottom:22px">
      {#each Array(4) as _}
        <div class="skeleton" style="width:130px;height:130px;border-radius:14px;flex-shrink:0"></div>
      {/each}
    </div>
    <div class="skeleton" style="width:100%;aspect-ratio:16/10;border-radius:20px;margin-bottom:22px"></div>
    <div class="quick-grid" style="margin-bottom:22px">
      {#each Array(4) as _}
        <div class="skeleton" style="width:100%;aspect-ratio:1;border-radius:14px"></div>
      {/each}
    </div>
    <div class="hscroll hide-scrollbar" style="margin-bottom:22px">
      {#each Array(4) as _}
        <div class="skeleton" style="width:110px;height:110px;border-radius:14px;flex-shrink:0"></div>
      {/each}
    </div>
    <div class="hscroll hide-scrollbar" style="margin-bottom:22px">
      {#each Array(4) as _}
        <div class="skeleton" style="width:128px;height:128px;border-radius:12px;flex-shrink:0"></div>
      {/each}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      {#each Array(4) as _}
        <div style="border-radius:16px;padding:12px;display:flex;gap:12px;align-items:center">
          <div class="skeleton" style="width:72px;height:72px;border-radius:8px;flex-shrink:0"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            <div class="skeleton" style="height:11px;width:75%;border-radius:6px"></div>
            <div class="skeleton" style="height:9px;width:40%;border-radius:6px"></div>
          </div>
        </div>
      {/each}
    </div>

  {:else if _er}
    <div class="glass-card" style="border-radius:16px;padding:24px;text-align:center;color:rgba(245,245,245,.55)">
      <p style="font-size:.875rem">Gagal memuat data 😔</p>
      <p style="font-size:.75rem;margin-top:4px;opacity:.6">{_er}</p>
    </div>

  {:else}

    {#if _trending.length}
      <div style="margin-bottom:24px">
        <div class="section-title" style="margin-bottom:10px">
          <span class="bar"></span>
          <span style="font-size:.85rem;font-weight:700;color:#F5F5F5">Lagi Rame Diputar</span>
        </div>
        <div class="hscroll hide-scrollbar">
          {#each _trending as item, i}
            <div class="animate-card-up"
              style="flex-shrink:0;width:130px;cursor:pointer;animation-delay:{i*30}ms"
              role="button" tabindex="0"
              on:click={() => _plTrending(item, i)}
              on:keydown={e => e.key === 'Enter' && _plTrending(item, i)}>
              <div style="position:relative">
                <img src={item.thumbnail} alt={item.title} style="width:130px;height:130px;border-radius:14px;object-fit:cover;display:block;margin-bottom:8px" loading="lazy" />
                {#if _loadingId === item.videoId}
                  <div style="position:absolute;inset:0;border-radius:14px;background:rgba(10,10,10,.55);display:flex;align-items:center;justify-content:center">
                    <div class="mini-spin"></div>
                  </div>
                {:else if $_q8z?.videoId === item.videoId}
                  <div style="position:absolute;top:8px;right:8px;background:rgba(10,10,10,.55);border-radius:99px;padding:5px 8px;display:flex;align-items:flex-end;gap:2px;height:12px">
                    <div class="eq-bar-nm animate-eq-a" style="height:6px"></div>
                    <div class="eq-bar-nm animate-eq-b" style="height:10px"></div>
                    <div class="eq-bar-nm animate-eq-c" style="height:5px"></div>
                  </div>
                {/if}
              </div>
              <p style="font-size:.74rem;font-weight:700;line-height:1.25;margin:0 0 2px;
                display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
                color:{$_q8z?.videoId === item.videoId ? '#FFFFFF' : '#F5F5F5'}">{item.title}</p>
              {#if item.author}
                <p style="font-size:.65rem;font-weight:600;color:rgba(245,245,245,.55);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{item.author}</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if _hero}
      {@const item = _hero.item}{@const idx = _hero.idx}
      <div style="margin-bottom:24px">
        <div class="section-title" style="margin-bottom:10px">
          <span class="bar"></span>
          <span style="font-size:.85rem;font-weight:700;color:#F5F5F5">Sorotan {_moods[_activeMood].label}</span>
        </div>
        <div class="hero-card animate-card-up"
          style="border-radius:0;overflow:hidden;position:relative;cursor:pointer;
            {$_q8z?.videoId === item.videoId ? 'border-color:rgba(255,255,255,.4);box-shadow:0 0 24px rgba(255,255,255,.15)' : ''}"
          role="button" tabindex="0"
          on:click={() => _pl(item, idx)} on:keydown={e => e.key === 'Enter' && _pl(item, idx)}>
          <img src={item.thumbnail} alt={item.title} class="hero-img" loading="lazy" />
          <div class="hero-scrim"></div>

          {#if _loadingId === item.videoId}
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,10,10,.35)">
              <div class="mini-spin"></div>
            </div>
          {:else if $__cv?.videoId === item.videoId && $_q8z?.videoId === item.videoId}
            <div style="position:absolute;top:14px;right:14px;background:rgba(10,10,10,.55);border-radius:99px;padding:6px 10px;display:flex;align-items:flex-end;gap:2px;height:14px">
              <div class="eq-bar-nm animate-eq-a" style="height:6px"></div>
              <div class="eq-bar-nm animate-eq-b" style="height:10px"></div>
              <div class="eq-bar-nm animate-eq-c" style="height:5px"></div>
            </div>
          {/if}

          <button on:click={e => _openMenu(e, item)}
            style="position:absolute;top:12px;left:12px;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;
              background:rgba(10,10,10,.45);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.2);cursor:pointer;color:rgba(245,245,245,.85)">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
          </button>

          <div class="hero-body">
            <p style="font-size:.62rem;font-weight:700;color:#FFFFFF;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px">Pilihan Teratas</p>
            <p style="font-size:1.08rem;font-weight:700;line-height:1.3;margin:0 0 4px;
              display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
              color:{$_q8z?.videoId === item.videoId ? '#FFFFFF' : '#F5F5F5'}">{item.title}</p>
            {#if item.author}
              <p style="font-size:.76rem;font-weight:600;color:rgba(245,245,245,.65);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{item.author}</p>
            {/if}
          </div>

          <div class="hero-play">
            <svg width="20" height="20" fill="#141414" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      </div>
    {/if}

    {#if _quick.length}
      <div style="margin-bottom:24px">
        <div class="section-title" style="margin-bottom:10px">
          <span class="bar"></span>
          <span style="font-size:.85rem;font-weight:700;color:#F5F5F5">Rekomendasi Cepat</span>
        </div>
        <div class="quick-grid">
          {#each _quick as { item, idx }, i}
            <div class="animate-card-up quick-card"
              style="border-radius:0;overflow:hidden;position:relative;cursor:pointer;animation-delay:{i*40}ms;
                {$_q8z?.videoId === item.videoId ? 'border-color:rgba(255,255,255,.4);box-shadow:0 0 16px rgba(255,255,255,.13)' : ''}"
              role="button" tabindex="0"
              on:click={() => _pl(item, idx)} on:keydown={e => e.key === 'Enter' && _pl(item, idx)}>
              <img src={item.thumbnail} alt={item.title} class="quick-img" loading="lazy" />
              <div class="quick-scrim"></div>

              {#if _loadingId === item.videoId}
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,10,10,.4)">
                  <div class="mini-spin"></div>
                </div>
              {:else if $_q8z?.videoId === item.videoId}
                <div style="position:absolute;top:8px;right:8px;display:flex;align-items:flex-end;gap:2px;height:12px">
                  <div class="eq-bar-nm animate-eq-a" style="height:6px"></div>
                  <div class="eq-bar-nm animate-eq-b" style="height:10px"></div>
                  <div class="eq-bar-nm animate-eq-c" style="height:5px"></div>
                </div>
              {:else}
                <button on:click={e => _openMenu(e, item)}
                  style="position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                    background:rgba(10,10,10,.5);border:none;cursor:pointer;color:rgba(245,245,245,.85)">
                  <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                </button>
              {/if}

              <div class="quick-body">
                <p style="font-size:.72rem;font-weight:700;line-height:1.25;margin:0 0 2px;
                  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
                  color:{$_q8z?.videoId === item.videoId ? '#FFFFFF' : '#F5F5F5'}">{item.title}</p>
                {#if item.author}
                  <p style="font-size:.62rem;font-weight:600;color:rgba(245,245,245,.55);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{item.author}</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div style="margin-bottom:24px">
        <div class="section-title" style="margin-bottom:10px">
          <span class="bar"></span>
          <span style="font-size:.85rem;font-weight:700;color:#F5F5F5">Playlist &amp; Album Pilihan</span>
        </div>
        <div class="hscroll hide-scrollbar">
          <button on:click={() => _showNewPl = true}
            style="background:none;border:none;cursor:pointer;text-align:left;width:128px;flex-shrink:0;padding:0">
            <div style="width:128px;height:128px;border-radius:12px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;
              background:rgba(255,255,255,.06);border:1.5px dashed rgba(255,255,255,.25)">
              <svg width="26" height="26" fill="none" stroke="#F5F5F5" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <p style="font-size:.74rem;font-weight:700;color:#F5F5F5;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Buat Playlist</p>
            <p style="font-size:.65rem;color:rgba(245,245,245,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Playlist baru</p>
          </button>
          {#each _collection as c}
            <button on:click={() => _openCollection(c)}
              style="background:none;border:none;cursor:pointer;text-align:left;width:128px;flex-shrink:0;padding:0;position:relative">
              <div style="position:relative">
                <img src={c.cover} alt={c.title} style="width:128px;height:128px;border-radius:12px;object-fit:cover;display:block;margin-bottom:8px" loading="lazy" />
                <span style="position:absolute;top:6px;left:6px;font-size:.55rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
                  color:#F5F5F5;background:rgba(10,10,10,.6);border:1px solid rgba(255,255,255,.2);border-radius:99px;padding:2px 8px">{c._kind}</span>
              </div>
              <p style="font-size:.74rem;font-weight:700;color:#F5F5F5;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{c.title}</p>
              <p style="font-size:.65rem;color:rgba(245,245,245,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{c.artist}</p>
            </button>
          {/each}
        </div>
      </div>

    {#if _artistsLoading}
      <div class="hscroll hide-scrollbar" style="margin-bottom:22px">
        {#each Array(6) as _}
          <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:9px;width:96px">
            <div class="skeleton" style="width:88px;height:88px;border-radius:50%"></div>
            <div class="skeleton" style="height:9px;width:60px;border-radius:4px"></div>
          </div>
        {/each}
      </div>
    {:else if _artists.length}
      <div style="margin-bottom:24px">
        <div class="section-title" style="margin-bottom:10px">
          <span class="bar"></span>
          <span style="font-size:.85rem;font-weight:700;color:#F5F5F5">Artis Populer</span>
        </div>
        <div class="hscroll hide-scrollbar">
          {#each _artists as a, i}
            <button on:click={() => goto(`/artist/${a.id}`)} class="animate-card-up"
              style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:9px;width:96px;background:none;border:none;cursor:pointer;padding:0;animation-delay:{i*30}ms">
              <img src={a.cover} alt={a.title} style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.2)" loading="lazy" />
              <span style="font-size:.72rem;font-weight:600;color:rgba(245,245,245,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;display:block">{a.title}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if _mix.length}
      <div class="section-title" style="margin-bottom:10px">
        <span class="bar"></span>
        <span style="font-size:.85rem;font-weight:700;color:#F5F5F5">Campuran Untukmu</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;padding-bottom:8px">
        {#each _mix as item, idx (item.videoId)}
          <div class="animate-card-up"
            style="border-radius:14px;padding:9px;display:flex;gap:10px;align-items:center;animation-delay:{Math.min(idx,10)*30}ms;
              {$_q8z?.videoId === item.videoId ? 'border-color:rgba(255,255,255,.38);box-shadow:0 0 18px rgba(255,255,255,.13)' : ''}">

            <button on:click={() => _plMix(item, idx)}
              style="flex-shrink:0;background:none;border:none;cursor:pointer;padding:0">
              <div style="position:relative">
                <img src={item.thumbnail} alt={item.title}
                  style="width:58px;height:58px;border-radius:0;object-fit:cover;display:block" loading="lazy" />
                {#if _loadingId === item.videoId}
                  <div style="position:absolute;inset:0;border-radius:0;background:rgba(10,10,10,.7);display:flex;align-items:center;justify-content:center">
                    <div class="mini-spin"></div>
                  </div>
                {:else if $__cv?.videoId === item.videoId}
                  <div style="position:absolute;inset:0;border-radius:0;background:rgba(10,10,10,.55);display:flex;align-items:center;justify-content:center">
                    {#if $_q8z?.videoId === item.videoId}
                      <div style="display:flex;align-items:flex-end;gap:2px;height:12px">
                        <div class="eq-bar-nm animate-eq-a" style="height:6px"></div>
                        <div class="eq-bar-nm animate-eq-b" style="height:10px"></div>
                        <div class="eq-bar-nm animate-eq-c" style="height:5px"></div>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            </button>

            <div style="flex:1;min-width:0">
              <button on:click={() => _plMix(item, idx)}
                style="display:block;width:100%;background:none;border:none;cursor:pointer;text-align:left;padding:0">
                <p style="font-size:.9rem;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                  color:{$_q8z?.videoId === item.videoId ? '#FFFFFF' : '#F5F5F5'};margin-bottom:3px">
                  {item.title}
                </p>
              </button>
              {#if item.author}
                <p style="font-size:.76rem;font-weight:500;color:rgba(255,255,255,.5);margin:0;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  {item.author}
                </p>
              {/if}
            </div>

            <button on:click={e => _openMenu(e, item)}
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
  {/if}

  {#if !_ld && !_er}
  <div style="padding:20px 0 24px;text-align:center">
    <span style="font-size:.68rem;color:rgba(255,255,255,.4);letter-spacing:.04em">&copy; 2026 Ganify. All rights reserved.</span>
  </div>
  {/if}

</div>

{#if _showNewPl}
  <div style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px"
    on:click={() => _showNewPl = false}>
    <div style="width:100%;max-width:400px;background:#1c1c1c;border-radius:20px;padding:24px 20px;border:1px solid rgba(255,255,255,.15)"
      on:click|stopPropagation>
      <p style="font-size:.95rem;font-weight:700;color:#FFFFFF;margin:0 0 16px">Playlist Baru</p>
      <input
        bind:value={_newPlName}
        on:keydown={e => e.key === 'Enter' && _doCreatePl()}
        placeholder="Nama playlist..."
        style="width:100%;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.2);color:#F5F5F5;
          font-family:'Quicksand',sans-serif;font-size:1rem;font-weight:500;
          border-radius:12px;padding:12px 16px;outline:none;margin-bottom:14px;box-sizing:border-box"
        autofocus
        use:focusScroll
      />
      <div style="display:flex;gap:10px">
        <button on:click={() => _showNewPl = false}
          style="flex:1;padding:12px;border-radius:12px;background:rgba(255,255,255,.07);
            border:1px solid rgba(255,255,255,.15);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.85rem;font-weight:700;color:rgba(245,245,245,.6)">Batal</button>
        <button on:click={_doCreatePl}
          style="flex:1;padding:12px;border-radius:12px;background:linear-gradient(135deg,#FFFFFF,#E6E6E6);
            border:none;cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.85rem;font-weight:700;color:#141414">
          Buat
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mini-spin {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2.5px solid rgba(255,255,255,.2);
    border-top-color: #FFFFFF;
    animation: _mspin .7s linear infinite;
  }
  @keyframes _mspin { to { transform: rotate(360deg); } }

  .spin-refresh { animation: _refreshspin .6s linear infinite; }
  @keyframes _refreshspin { to { transform: rotate(360deg); } }

  .hero-card { width: 100%; aspect-ratio: 16 / 11; }
  .hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .hero-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(10,10,10,.05) 0%, rgba(10,10,10,.35) 55%, rgba(10,10,10,.92) 100%);
  }
  .hero-body { position: absolute; left: 16px; right: 70px; bottom: 16px; min-width: 0; }
  .hero-play {
    position: absolute; right: 16px; bottom: 16px; width: 44px; height: 44px; border-radius: 50%;
    background: linear-gradient(135deg, var(--gold), var(--gold-soft));
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(255,255,255,.35);
  }

  .quick-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .quick-card { aspect-ratio: 1; }
  .quick-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .quick-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(10,10,10,.05) 0%, rgba(10,10,10,.25) 45%, rgba(10,10,10,.88) 100%);
  }
  .quick-body { position: absolute; left: 10px; right: 10px; bottom: 9px; min-width: 0; }

  @media (min-width: 420px) {
    .hero-body { right: 80px; }
  }
</style>
