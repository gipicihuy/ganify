<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { _getAlbum } from '$lib/api.js';
  import { _q8z, _p1k, _x9a, _showMenu, _playlists } from '$lib/store.js';
  import { getPlaylists } from '$lib/playlist.js';

  let _data = null, _ld = true, _er = null;
  let _loadingId = null;

  $: _id = $page.params.id;

  onMount(load);

  async function load() {
    _ld = true; _er = null;
    try {
      _data = await _getAlbum(_id);
      if (!_data) _er = 'Album tidak ditemukan';
    } catch (e) {
      _er = e.message;
    } finally {
      _ld = false;
    }
  }

  function _queue() {
    return (_data?.songs || []).map(s => ({
      title: s.title, videoId: s.videoId, thumbnail: s.thumbnail || _data.cover,
      duration: s.duration, author: s.artist, artist: s.artist, artistId: s.artistId
    }));
  }

  function _pl(idx) {
    const q = _queue();
    const item = q[idx];
    _loadingId = item.videoId;
    _p1k.set(q);
    _x9a.set(idx);
    _q8z.set(item);
    setTimeout(() => { _loadingId = null; }, 3000);
  }

  function _playAll() {
    if (!_data?.songs?.length) return;
    _pl(0);
  }

  function _openMenu(e, item) {
    e.stopPropagation();
    _showMenu.set({ title: item.title, videoId: item.videoId, thumbnail: item.thumbnail || _data.cover, duration: item.duration, author: item.artist });
    getPlaylists().then((list) => _playlists.set(list)).catch(() => {});
  }
</script>

<div style="max-width:560px;margin:0 auto;padding:20px 16px 0">
  <button on:click={() => history.back()}
    style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);cursor:pointer;color:rgba(255,255,255,.7);margin-bottom:18px">
    <svg width="19" height="19" fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
  </button>

  {#if _ld}
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:20px 0 30px">
      <div class="skeleton" style="width:180px;height:180px;border-radius:16px"></div>
      <div class="skeleton" style="height:16px;width:60%;border-radius:6px"></div>
    </div>
  {:else if _er}
    <div class="glass-card" style="border-radius:16px;padding:24px;text-align:center;color:rgba(245,245,245,.55)">
      <p style="font-size:.875rem">{_er}</p>
    </div>
  {:else if _data}
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:8px 0 22px">
      <img src={_data.cover} alt={_data.title} style="width:180px;height:180px;border-radius:16px;object-fit:cover;box-shadow:0 8px 32px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12)" loading="lazy" />
      <h1 style="font-size:1.25rem;font-weight:700;color:#FFFFFF;margin:0;line-height:1.35">{_data.title}</h1>
      <p style="font-size:.78rem;color:rgba(245,245,245,.45);margin:0">{_data.songs?.length || 0} lagu</p>

      <button on:click={_playAll}
        style="margin-top:6px;display:flex;align-items:center;gap:8px;padding:11px 26px;border-radius:99px;
          background:linear-gradient(135deg,#FFFFFF,#E6E6E6);border:none;cursor:pointer;color:#141414;
          font-size:.82rem;font-weight:700;box-shadow:0 4px 18px rgba(255,255,255,.3)">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Putar Semua
      </button>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;padding-bottom:24px">
      {#each _data.songs as item, i}
        <div class="animate-card-up" style="border-radius:14px;padding:10px 12px;display:flex;gap:12px;align-items:center;animation-delay:{Math.min(i,12)*25}ms;
          {$_q8z?.videoId === item.videoId ? 'border-color:rgba(255,255,255,.38);box-shadow:0 0 18px rgba(255,255,255,.13)' : ''}">
          <button on:click={() => _pl(i)}
            style="display:flex;gap:12px;align-items:center;flex:1;min-width:0;background:none;border:none;cursor:pointer;text-align:left;padding:0">
            <div style="width:26px;flex-shrink:0;text-align:center;font-size:.72rem;font-weight:700;color:rgba(245,245,245,.3);position:relative">
              {#if _loadingId === item.videoId}
                <div class="mini-spin" style="margin:0 auto"></div>
              {:else}
                {i + 1}
              {/if}
            </div>
            <div style="flex:1;min-width:0">
              <p style="font-size:.82rem;font-weight:700;color:{$_q8z?.videoId === item.videoId ? '#FFFFFF' : '#F5F5F5'};margin:0 0 3px;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{item.title}</p>
              <p style="font-size:.68rem;color:rgba(245,245,245,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{item.artist}</p>
            </div>
            {#if item.duration}
              <span style="font-size:.68rem;color:rgba(245,245,245,.3);flex-shrink:0">{item.duration}</span>
            {/if}
          </button>
          <button on:click={e => _openMenu(e, item)}
            style="width:30px;height:30px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;
              background:transparent;border:none;cursor:pointer;color:rgba(245,245,245,.3)">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .mini-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,.2); border-top-color: #FFFFFF; animation: _mspin .7s linear infinite; }
  @keyframes _mspin { to { transform: rotate(360deg); } }
</style>
