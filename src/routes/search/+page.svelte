<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { _g9 } from '$lib/api.js';
  import { _q8z, _p1k, _x9a, _searchQuery, _searchResults, _showMenu, _playlists, _searchTab, _searchAlbums, _searchArtists, _searchInit, _searchSubmitted, _searchTopResult } from '$lib/store.js';
  import { getPlaylists } from '$lib/playlist.js';

  let _ld = false, _t = null, _init = false;
  // _submitted: true kalau user udah "commit" ke pencarian (Enter / pilih
  // saran / dibuka lewat URL ?q=...). Selama false (masih ngetik doang),
  // section hasil lengkap di bawah nggak dirender — biar nggak dobel sama
  // dropdown quick-result, sesuai perilaku Rythim (dropdown dulu, grid
  // lengkap nyusul setelah submit). Sekarang di-sync ke store biar survive
  // pindah tab (sebelumnya hilang karena reset ke false tiap mount).
  let _submitted = false;
  let _loadingId = null;
  let _qv = '';
  let _ds = [];
  let _albums = [];
  let _artists = [];
  let _topResult = null;
  let _tab = 'songs';
  let _suggestions = [];
  let _showSug = false;
  let _sugT = null;
  let _inputEl = null;
  let _history = [];

  const unsubTab = _searchTab.subscribe(v => { _tab = v; });

  const _HK = '_msc_sh';
  const _HM = 10;

  function _loadHistory() {
    try { return JSON.parse(localStorage.getItem(_HK) || '[]'); } catch { return []; }
  }

  function _saveHistory(q) {
    try {
      let h = _loadHistory();
      h = h.filter(x => x.toLowerCase() !== q.toLowerCase());
      h.unshift(q);
      if (h.length > _HM) h = h.slice(0, _HM);
      localStorage.setItem(_HK, JSON.stringify(h));
      _history = h;
    } catch {}
  }

  function _removeHistory(q) {
    try {
      let h = _loadHistory();
      h = h.filter(x => x !== q);
      localStorage.setItem(_HK, JSON.stringify(h));
      _history = h;
      _buildSuggestions(_qv);
    } catch {}
  }

  function _clearHistory() {
    try {
      localStorage.removeItem(_HK);
      _history = [];
      _buildSuggestions(_qv);
    } catch {}
  }

  import { onDestroy, onMount } from 'svelte';

  onMount(() => {
    _history = _loadHistory();

    // Sinkronkan pencarian dari URL, mis. dibuka via /search?q=beautiful+things
    const urlQ = $page.url.searchParams.get('q');
    if (urlQ && urlQ.trim()) {
      const q = urlQ.trim();
      _searchQuery.set(q);
      _qv = q;
      _ld = true;
      _init = true;
      _submitted = true;
      _searchInit.set(true);
      _searchSubmitted.set(true);
      _runSearch(q);
    } else if (_qv.trim() && (_ds.length || _albums.length || _artists.length)) {
      // Balik dari tab lain (beranda -> search): restore supaya hasil tidak hilang.
      // Store _qv/_ds/_albums/_artists sudah ke-restore via subscription, tinggal
      // set _submitted = true dan sync URL biar konsisten.
      _submitted = true;
      _searchSubmitted.set(true);
      _init = true;
      _searchInit.set(true);
      _syncUrl(_qv);
    }
  });

  // Ubah URL search agar query pencarian ikut tampil, mis. /search?q=beautiful+things
  function _syncUrl(q) {
    const target = q ? `/search?q=${encodeURIComponent(q)}` : '/search';
    const current = `${$page.url.pathname}${$page.url.search}`;
    if (current === target) return;
    goto(target, { replaceState: true, noScroll: true, keepFocus: true });
  }

  async function _runSearch(q) {
    const _reqVal = q;
    try {
      const r = await _g9(q);
      if (_qv !== _reqVal) return;
      _ds = r.songs || [];
      _albums = r.albums || [];
      _artists = r.artists || [];
      _topResult = r.topResult || null;
      _searchResults.set(_ds);
      _searchAlbums.set(_albums);
      _searchArtists.set(_artists);
      _searchTopResult.set(_topResult);
      _p1k.set(_ds);
      _syncUrl(q);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (_qv !== _reqVal) return;
      _ds = []; _albums = []; _artists = []; _topResult = null;
      _searchResults.set([]);
      _searchAlbums.set([]);
      _searchArtists.set([]);
      _searchTopResult.set(null);
      _syncUrl(q);
    } finally {
      if (_qv === _reqVal) _ld = false;
    }
  }

  const unsubQ = _searchQuery.subscribe(v => { _qv = v; });
  const unsubR = _searchResults.subscribe(v => { _ds = v; });
  const unsubAl = _searchAlbums.subscribe(v => { _albums = v; });
  const unsubAr = _searchArtists.subscribe(v => { _artists = v; });
  const unsubInit = _searchInit.subscribe(v => { _init = v; });
  const unsubSubmitted = _searchSubmitted.subscribe(v => { _submitted = v; });
  const unsubTop = _searchTopResult.subscribe(v => { _topResult = v; });

  onDestroy(() => { unsubQ(); unsubR(); unsubTab(); unsubAl(); unsubAr(); unsubInit(); unsubSubmitted(); unsubTop(); });

  async function _fetchSuggestions(q) {
    try {
      const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
      const data = await r.json();
      return { queries: data?.queries || [], items: data?.items || [] };
    } catch { return { queries: [], items: [] }; }
  }

  function _buildSuggestions(q) {
    const h = _history.filter(x => x.toLowerCase().includes(q.toLowerCase()));
    _suggestions = { history: h, api: _suggestions.api || [], apiItems: _suggestions.apiItems || [] };
  }

  function _onInput(e) {
    const val = e.target.value;
    _searchQuery.set(val);
    _qv = val;
    _showSug = true;
    // Ngetik lagi = belum submit. Sembunyiin grid hasil lengkap sampai
    // user beneran commit (Enter / pilih saran).
    _submitted = false;
    _searchSubmitted.set(false);

    if (!val.trim()) {
      _suggestions = { history: _history, api: [], apiItems: [] };
      _ld = false;
      _init = false;
      _ds = []; _albums = []; _artists = []; _topResult = null;
      _searchResults.set([]);
      _searchAlbums.set([]);
      _searchArtists.set([]);
      _searchInit.set(false);
      _searchTopResult.set(null);
      if (_t) clearTimeout(_t);
      if (_sugT) clearTimeout(_sugT);
      _syncUrl('');
      return;
    }

    _buildSuggestions(val);

    if (_sugT) clearTimeout(_sugT);
    _sugT = setTimeout(async () => {
      const { queries, items } = await _fetchSuggestions(val);
      const historySet = new Set(_history.map(x => x.toLowerCase()));
      _suggestions = {
        history: _history.filter(x => x.toLowerCase().includes(val.toLowerCase())),
        api: queries.filter(x => !historySet.has(x.toLowerCase())),
        apiItems: items
      };
    }, 200);

    if (_t) clearTimeout(_t);
    _ld = true;
    _init = true;
    _searchInit.set(true);
    _t = setTimeout(() => { _runSearch(val); }, 300);
  }

  function _selectSuggestion(q) {
    _searchQuery.set(q);
    _qv = q;
    _showSug = false;
    _submitted = true;
    _searchSubmitted.set(true);
    _saveHistory(q);
    _ld = true;
    _init = true;
    _searchInit.set(true);
    if (_t) clearTimeout(_t);
    _t = setTimeout(() => { _runSearch(q); }, 0);
  }

  function _setTab(t) { _tab = t; _searchTab.set(t); }

  function _onSubmit() {
    if (!_qv.trim()) return;
    _showSug = false;
    _submitted = true;
    _searchSubmitted.set(true);
    _saveHistory(_qv.trim());
  }

  function _clear() {
    _searchQuery.set('');
    _searchResults.set([]);
    _searchAlbums.set([]);
    _searchArtists.set([]);
    _searchInit.set(false);
    _searchSubmitted.set(false);
    _searchTopResult.set(null);
    _ds = []; _albums = []; _artists = []; _topResult = null;
    _init = false;
    _submitted = false;
    _showSug = false;
    _suggestions = { history: _history, api: [], apiItems: [] };
    if (_t) clearTimeout(_t);
    if (_sugT) clearTimeout(_sugT);
    _syncUrl('');
  }

  function _onFocus() {
    _history = _loadHistory();
    _suggestions = { history: _qv ? _history.filter(x => x.toLowerCase().includes(_qv.toLowerCase())) : _history, api: _suggestions.api || [], apiItems: _suggestions.apiItems || [] };
    _showSug = true;
  }

  function _onBlur() {
    setTimeout(() => {
      _showSug = false;
      if (_qv.trim() && !_submitted) {
        _submitted = true;
        _searchSubmitted.set(true);
        _saveHistory(_qv.trim());
      }
    }, 180);
  }

  async function _pl(item, idx) {
    _loadingId = item.videoId;
    _p1k.set(_ds);
    _x9a.set(idx);
    _q8z.set(item);
    setTimeout(() => { _loadingId = null; }, 3000);
  }

  function _openMenu(e, item) {
    e.stopPropagation();
    _showMenu.set(item);
    getPlaylists().then((list) => _playlists.set(list)).catch(() => {});
  }

  function _highlight(text, query) {
    if (!query.trim()) return `<span style="color:rgba(245,245,245,.8)">${text}</span>`;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return `<span style="color:rgba(245,245,245,.8)">${text}</span>`;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return `<span style="color:rgba(245,245,245,.38)">${before}</span><span style="color:#F5F5F5;font-weight:700">${match}</span><span style="color:rgba(245,245,245,.38)">${after}</span>`;
  }

  // Quick-result items ala Rythim: begitu hasil pencarian buat query
  // sekarang udah settle (!_ld), tampilin beberapa lagu teratas langsung
  // di dropdown suggestion, biar user bisa langsung tap-play tanpa perlu
  // submit/pindah ke tab "Lagu" dulu. Di-gate pake !_ld biar nggak nampilin
  // hasil query lama yang sempet nyangkut sebelum debounce settle.
  const _QUICK_RESULT_MAX = 1;
  $: _quickResults = (!_ld && _qv.trim() && _ds.length > 0)
    ? _ds.slice(0, _QUICK_RESULT_MAX)
    : [];

  $: _songsGrid = _topResult
    ? _ds.filter(s => s.videoId !== _topResult.videoId)
    : _ds;

  function _selectQuick(item, idx) {
    _showSug = false;
    _submitted = true;
    _searchSubmitted.set(true);
    _saveHistory(_qv.trim());
    _pl(item, idx);
  }

  function _selectSuggestionSong(item) {
    _showSug = false;
    _submitted = true;
    _searchSubmitted.set(true);
    _saveHistory(_qv.trim());
    _pl({ videoId: item.videoId, title: item.title, thumbnail: item.thumbnail, author: item.artist, artist: item.artist }, 0);
  }

  function _selectSuggestionNav(item) {
    _showSug = false;
    _saveHistory(_qv.trim());
    if (item.type === 'artist') { goto(`/artist/${item.id}`); return; }
    if (item.type === 'album') { goto(`/album/${item.id}`); return; }
    _selectSuggestion(item.title);
  }

  $: _apiItemsFiltered = (_suggestions.apiItems || []).filter(
    it => !(it.type === 'song' && _quickResults.some(q => q.videoId === it.videoId))
  );

  $: _hasSug = _showSug && ((_suggestions.history?.length > 0) || (_suggestions.api?.length > 0) || (_apiItemsFiltered.length > 0) || (_quickResults.length > 0));
  // Dipakai buat nge-gate tab yang lagi kelihatan: kalau dropdown suggestion
  // kebuka (pill Album/Artis lagi disembunyiin), paksa balik nampilin
  // section Lagu, biar nggak nyangkut nampilin grid Album/Artis padahal
  // pill buat pindah balik ke situ lagi disembunyiin.
  $: _effectiveTab = _hasSug ? 'songs' : _tab;
</script>

<div style="max-width:560px;margin:0 auto;padding:24px 16px 0">

  <div style="margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:5px;height:26px;border-radius:3px;background:linear-gradient(to bottom,#FFFFFF,#E6E6E6);flex-shrink:0"></div>
      <h1 style="font-size:1.35rem;font-weight:700;color:#FFFFFF;margin:0">Cari Lagu</h1>
    </div>

    <div style="position:relative">
      <div style="position:relative">
        <div style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,.5);pointer-events:none;z-index:2">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        </div>

        <input
          bind:this={_inputEl}
          value={_qv}
          on:input={_onInput}
          on:focus={_onFocus}
          on:blur={_onBlur}
          on:keydown={e => { if (e.key === 'Enter') _onSubmit(); if (e.key === 'Escape') _showSug = false; }}
          type="text"
          placeholder="Cari lagu, artis, album..."
          style="width:100%;background:var(--bg-card,#1c1c1c);border:1px solid rgba(255,255,255,{_hasSug ? '.16' : '.1'});color:#F5F5F5;
            font-family:'Quicksand',sans-serif;font-size:.875rem;font-weight:500;
            border-radius:14px;padding:13px 44px 13px 44px;outline:none;
            transition:border-color .2s,box-shadow .2s;
            box-shadow:{_hasSug ? '0 2px 10px rgba(0,0,0,.25)' : 'none'}"
        />
        {#if _qv}
          <button on:click={_clear}
            style="position:absolute;right:14px;top:50%;transform:translateY(-50%);color:rgba(245,245,245,.4);background:none;border:none;cursor:pointer;padding:4px;transition:color .15s;z-index:2"
            onmouseenter="this.style.color='rgba(245,245,245,.8)'" onmouseleave="this.style.color='rgba(245,245,245,.4)'">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        {/if}
      </div>

      {#if _hasSug}
        <div style="margin-top:8px;
          background:var(--bg-raised,#1a1a1a);border:1px solid rgba(255,255,255,.08);
          border-radius:14px;overflow:hidden;
          box-shadow:0 6px 18px rgba(0,0,0,.3)">

          {#if _suggestions.history?.length > 0}
            {#each _suggestions.history as h}
              <div style="display:flex;align-items:center;gap:0">
                <button on:mousedown|preventDefault={() => _selectSuggestion(h)}
                  style="flex:1;display:flex;align-items:center;gap:10px;padding:10px 14px;
                    background:none;border:none;cursor:pointer;text-align:left;transition:background .12s"
                  onmouseenter="this.style.background='rgba(255,255,255,.05)'" onmouseleave="this.style.background='none'">
                  <svg width="14" height="14" fill="rgba(255,255,255,.35)" viewBox="0 0 24 24" style="flex-shrink:0"><path d="M13 3a9 9 0 1 0 .001 18.001A9 9 0 0 0 13 3zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zm.5-11H12v6l5.25 3.15.75-1.23-4.5-2.67V8z"/></svg>
                  <span style="font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{@html _highlight(h, _qv)}</span>
                </button>
                <button on:mousedown|preventDefault={() => _removeHistory(h)}
                  style="padding:10px 14px;background:none;border:none;cursor:pointer;color:rgba(245,245,245,.2);flex-shrink:0;transition:color .12s"
                  onmouseenter="this.style.color='rgba(255,100,100,.6)'" onmouseleave="this.style.color='rgba(245,245,245,.2)'">
                  <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>
            {/each}
          {/if}

          {#if _suggestions.api?.length > 0}
            {#if _suggestions.history?.length > 0}
              <div style="height:1px;background:rgba(255,255,255,.06);margin:2px 0"></div>
            {/if}
            {#each _suggestions.api as s}
              <button on:mousedown|preventDefault={() => _selectSuggestion(s)}
                style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;
                  background:none;border:none;cursor:pointer;text-align:left;transition:background .12s"
                onmouseenter="this.style.background='rgba(255,255,255,.05)'" onmouseleave="this.style.background='none'">
                <svg width="14" height="14" fill="rgba(255,255,255,.25)" viewBox="0 0 24 24" style="flex-shrink:0"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                <span style="font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{@html _highlight(s, _qv)}</span>
              </button>
            {/each}
          {/if}

          {#if _quickResults.length > 0}
            {#if _suggestions.history?.length > 0 || _suggestions.api?.length > 0}
              <div style="height:1px;background:rgba(255,255,255,.06);margin:2px 0"></div>
            {/if}
            {#each _quickResults as item, i}
              <button on:mousedown|preventDefault={() => _selectQuick(item, i)}
                style="width:100%;display:flex;align-items:center;gap:10px;padding:8px 14px;
                  background:none;border:none;cursor:pointer;text-align:left;transition:background .12s"
                onmouseenter="this.style.background='rgba(255,255,255,.05)'" onmouseleave="this.style.background='none'">
                <img src={item.thumbnail} alt={item.title}
                  style="width:34px;height:34px;border-radius:6px;object-fit:cover;flex-shrink:0" loading="lazy" />
                <div style="min-width:0;flex:1">
                  <p style="font-size:.82rem;font-weight:700;color:#F5F5F5;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    {item.title}
                  </p>
                  {#if item.author}
                    <p style="font-size:.7rem;color:rgba(245,245,245,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      {item.author}
                    </p>
                  {/if}
                </div>
              </button>
            {/each}
          {/if}

          {#if _apiItemsFiltered.length > 0}
            {#if _suggestions.history?.length > 0 || _suggestions.api?.length > 0 || _quickResults.length > 0}
              <div style="height:1px;background:rgba(255,255,255,.06);margin:2px 0"></div>
            {/if}
            {#each _apiItemsFiltered as item}
              <button on:mousedown|preventDefault={() => item.type === 'song' ? _selectSuggestionSong(item) : _selectSuggestionNav(item)}
                style="width:100%;display:flex;align-items:center;gap:10px;padding:8px 14px;
                  background:none;border:none;cursor:pointer;text-align:left;transition:background .12s"
                onmouseenter="this.style.background='rgba(255,255,255,.05)'" onmouseleave="this.style.background='none'">
                <img src={item.thumbnail} alt={item.title}
                  style="width:34px;height:34px;border-radius:{item.type === 'artist' ? '50%' : '6px'};object-fit:cover;flex-shrink:0" loading="lazy" />
                <div style="min-width:0;flex:1">
                  <p style="font-size:.82rem;font-weight:700;color:#F5F5F5;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    {item.title}
                  </p>
                  <p style="font-size:.7rem;color:rgba(245,245,245,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    {item.type === 'artist' ? 'Artis' : item.type === 'album' ? (item.artist || 'Album') : item.type === 'playlist' ? (item.artist || 'Playlist') : (item.artist || '')}
                  </p>
                </div>
              </button>
            {/each}
          {/if}

          <div style="height:6px"></div>
        </div>
      {/if}
    </div>
  </div>

  {#if !_submitted}
    <!-- Belum submit (masih ngetik / belum tekan Enter): jangan render
         grid/skeleton hasil di sini sama sekali, biar nggak dobel sama
         dropdown quick-result di atas. Cuma tampilin placeholder kalau
         input-nya masih kosong total. -->
    {#if !_qv.trim()}
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 0;gap:14px">
        <div style="width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center">
          <svg width="26" height="26" fill="rgba(255,255,255,.45)" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        </div>
        <p style="color:rgba(245,245,245,.38);font-size:.84rem">Ketik untuk mencari lagu favoritmu</p>
      </div>
    {/if}

  {:else if _ld}
    <div style="display:flex;flex-direction:column;gap:10px">
      {#each Array(5) as _}
        <div style="border-radius:16px;padding:12px;display:flex;gap:12px;align-items:center">
          <div class="skeleton" style="width:72px;height:72px;border-radius:8px;flex-shrink:0"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            <div class="skeleton" style="height:11px;width:72%;border-radius:6px"></div>
            <div class="skeleton" style="height:9px;width:40%;border-radius:6px"></div>
          </div>
        </div>
      {/each}
    </div>

  {:else if _ds.length === 0 && _albums.length === 0 && _artists.length === 0}
    <div style="display:flex;align-items:center;justify-content:center;padding:60px 0">
      <p style="color:rgba(245,245,245,.45);font-size:.84rem">Tidak ada hasil untuk "<span style="color:#FFFFFF">{_qv}</span>"</p>
    </div>

  {:else}
    {#if _topResult && !_hasSug}
      <div style="margin-bottom:18px">
        <div class="section-title" style="margin-bottom:10px">
          <span class="bar"></span>
          <span style="font-size:.85rem;font-weight:700;color:#F5F5F5">Top Result</span>
        </div>
        <div class="animate-card-up"
          style="border-radius:16px;padding:14px;display:flex;gap:14px;align-items:center;
            background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);cursor:pointer;
            {$_q8z?.videoId === _topResult.videoId ? 'border-color:rgba(255,255,255,.38);box-shadow:0 0 18px rgba(255,255,255,.13)' : ''}"
          role="button" tabindex="0"
          on:click={() => _pl(_topResult, 0)} on:keydown={e => e.key === 'Enter' && _pl(_topResult, 0)}>
          <div style="position:relative;flex-shrink:0">
            <img src={_topResult.thumbnail} alt={_topResult.title}
              style="width:84px;height:84px;border-radius:10px;object-fit:cover;display:block" loading="lazy" />
            <div style="position:absolute;inset:0;border-radius:10px;display:flex;align-items:center;justify-content:center;
              background:rgba(10,10,10,{_loadingId === _topResult.videoId ? '.55' : '0'});transition:background .15s">
              {#if _loadingId === _topResult.videoId}
                <div class="mini-spin"></div>
              {:else if $_q8z?.videoId === _topResult.videoId}
                <div style="width:34px;height:34px;border-radius:50%;background:rgba(10,10,10,.6);display:flex;align-items:flex-end;justify-content:center;gap:2px;padding-bottom:8px">
                  <div class="eq-bar-nm animate-eq-a" style="height:6px"></div>
                  <div class="eq-bar-nm animate-eq-b" style="height:10px"></div>
                  <div class="eq-bar-nm animate-eq-c" style="height:5px"></div>
                </div>
              {/if}
            </div>
          </div>
          <div style="min-width:0;flex:1">
            <p style="font-size:1rem;font-weight:800;line-height:1.3;margin:0 0 4px;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
              color:{$_q8z?.videoId === _topResult.videoId ? '#FFFFFF' : '#F5F5F5'}">{_topResult.title}</p>
            <p style="font-size:.78rem;font-weight:600;color:rgba(245,245,245,.5);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              Lagu{#if _topResult.author} · {_topResult.author}{/if}
            </p>
          </div>
          <button on:click|stopPropagation={e => _openMenu(e, _topResult)}
            style="width:30px;height:30px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;
              background:transparent;border:none;cursor:pointer;color:rgba(245,245,245,.35)">
            <svg width="17" height="17" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
          </button>
        </div>
      </div>
    {/if}
    {#if !_hasSug}
    <div style="display:flex;gap:8px;margin-bottom:14px;overflow-x:auto" class="hide-scrollbar">
      <button on:click={() => _setTab('songs')} class="chip-tab {_effectiveTab==='songs' ? 'active' : ''}"
        style="padding:8px 16px;border-radius:99px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);
          cursor:pointer;font-size:.75rem;font-weight:700;color:rgba(245,245,245,.6);white-space:nowrap;flex-shrink:0">
        Lagu ({_ds.length})
      </button>
      {#if _albums.length > 0}
        <button on:click={() => _setTab('albums')} class="chip-tab {_tab==='albums' ? 'active' : ''}"
          style="padding:8px 16px;border-radius:99px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);
            cursor:pointer;font-size:.75rem;font-weight:700;color:rgba(245,245,245,.6);white-space:nowrap;flex-shrink:0">
          Album ({_albums.length})
        </button>
      {/if}
      {#if _artists.length > 0}
        <button on:click={() => _setTab('artists')} class="chip-tab {_tab==='artists' ? 'active' : ''}"
          style="padding:8px 16px;border-radius:99px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);
            cursor:pointer;font-size:.75rem;font-weight:700;color:rgba(245,245,245,.6);white-space:nowrap;flex-shrink:0">
          Artis ({_artists.length})
        </button>
      {/if}
    </div>
    {/if}
    {#if _effectiveTab === 'songs'}
      {#if _ds.length === 0}
        <div style="display:flex;align-items:center;justify-content:center;padding:40px 0">
          <p style="color:rgba(245,245,245,.4);font-size:.8rem">Tidak ada lagu ditemukan</p>
        </div>
      {:else}
      <div class="song-grid" style="padding-bottom:16px">
        {#each _songsGrid as item, gi}
          {@const i = _ds.findIndex(x => x.videoId === item.videoId)}
          <div class="animate-card-up"
            style="border-radius:14px;padding:9px;display:flex;gap:10px;align-items:center;animation-delay:{Math.min(gi,10)*30}ms;
              {$_q8z?.videoId === item.videoId ? 'border-color:rgba(255,255,255,.38);box-shadow:0 0 18px rgba(255,255,255,.13)' : ''}">

            <button on:click={() => _pl(item, i)}
              style="flex-shrink:0;background:none;border:none;cursor:pointer;padding:0">
              <div style="position:relative">
                <img src={item.thumbnail} alt={item.title}
                  style="width:58px;height:58px;border-radius:0;object-fit:cover;display:block" loading="lazy" />
                {#if _loadingId === item.videoId}
                  <div style="position:absolute;inset:0;border-radius:0;background:rgba(10,10,10,.7);display:flex;align-items:center;justify-content:center">
                    <div class="mini-spin"></div>
                  </div>
                {/if}
              </div>
            </button>

            <div style="flex:1;min-width:0">
              <button on:click={() => _pl(item, i)}
                style="display:block;width:100%;background:none;border:none;cursor:pointer;text-align:left;padding:0">
                <p style="font-size:.9rem;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                  color:{$_q8z?.videoId === item.videoId ? '#FFFFFF' : '#F5F5F5'};margin-bottom:3px">
                  {item.title}
                </p>
              </button>
              {#if item.author}
                <p style="font-size:.76rem;font-weight:500;color:rgba(255,255,255,.4);margin:0;
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
    {:else if _effectiveTab === 'artists'}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding-bottom:16px">
        {#each _artists as a, i}
          <button on:click={() => goto(`/artist/${a.id}`)} class="animate-card-up"
            style="background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px;animation-delay:{i*40}ms">
            <img src={a.cover} alt={a.title} style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.2)" loading="lazy" />
            <span style="font-size:.72rem;font-weight:700;color:#F5F5F5;text-align:center;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:100%;line-height:1.25;word-break:break-word">{a.title}</span>
          </button>
        {/each}
      </div>
    {:else if _effectiveTab === 'albums'}
      <div class="album-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding-bottom:16px">
        {#each _albums as al, i}
          <button on:click={() => goto(`/album/${al.id}`)} class="glass-card animate-card-up"
            style="width:100%;min-width:0;border-radius:14px;padding:10px;background:none;cursor:pointer;text-align:left;animation-delay:{i*40}ms">
            <img src={al.cover} alt={al.title} style="width:100%;aspect-ratio:1;border-radius:10px;object-fit:cover;display:block;margin-bottom:8px" loading="lazy" />
            <p style="font-size:.78rem;font-weight:700;color:#F5F5F5;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{al.title}</p>
            <p style="font-size:.68rem;color:rgba(245,245,245,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{al.artist}</p>
          </button>
        {/each}
      </div>
    {/if}
  {/if}

</div>

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

  .song-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    max-width: 560px;
    margin: 0 auto;
  }
  .song-grid > * { min-width: 0; }

  .album-grid > * { min-width: 0; }
</style>
