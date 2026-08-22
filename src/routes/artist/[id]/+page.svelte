<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { _getArtist } from '$lib/api.js';
  import { _q8z, _p1k, _x9a, _showMenu, _playlists } from '$lib/store.js';
  import { getPlaylists } from '$lib/playlist.js';

  let _data = null, _ld = true, _er = null;
  let _loadingId = null;

  $: _id = $page.params.id;

  onMount(load);

  async function load() {
    _ld = true; _er = null;
    try {
      _data = await _getArtist(_id);
      if (!_data) _er = 'Artis tidak ditemukan';
    } catch (e) {
      _er = e.message;
    } finally {
      _ld = false;
    }
  }

  async function _pl(item, idx, queue) {
    _loadingId = item.videoId;
    _p1k.set(queue);
    _x9a.set(idx);
    _q8z.set({ ...item, author: item.artist });
    setTimeout(() => { _loadingId = null; }, 3000);
  }

  function _openMenu(e, item) {
    e.stopPropagation();
    _playlists.set(getPlaylists());
    _showMenu.set({ ...item, author: item.artist });
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
      <div class="skeleton" style="width:128px;height:128px;border-radius:50%"></div>
      <div class="skeleton" style="height:16px;width:60%;border-radius:6px"></div>
    </div>
  {:else if _er}
    <div class="glass-card" style="border-radius:16px;padding:24px;text-align:center;color:rgba(245,245,245,.55)">
      <p style="font-size:.875rem">{_er}</p>
    </div>
  {:else if _data}
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:8px 0 26px">
      <img src={_data.cover} alt={_data.name} class="artist-photo" loading="lazy" />
      <h1 style="font-size:1.4rem;font-weight:700;color:#FFFFFF;margin:0">{_data.name}</h1>
      {#if _data.description}
        <p style="font-size:.75rem;color:rgba(245,245,245,.45);line-height:1.5;max-width:440px;
          display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">{_data.description}</p>
      {/if}
    </div>

    {#if _data.topSongs?.length > 0}
      <div class="section-title" style="margin-bottom:12px">
        <div class="bar"></div>
        <h2 style="font-size:1.05rem;font-weight:700;color:#F5F5F5;margin:0">Lagu Populer</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:26px">
        {#each _data.topSongs as item, i}
          <div class="animate-card-up" style="border-radius:16px;padding:12px;display:flex;gap:12px;align-items:center;animation-delay:{Math.min(i,10)*30}ms">
            <button on:click={() => _pl(item, i, _data.topSongs.map(s => ({ ...s, author: s.artist })))}
              style="display:flex;gap:12px;align-items:center;flex:1;min-width:0;background:none;border:none;cursor:pointer;text-align:left;padding:0">
              <div style="position:relative;flex-shrink:0">
                <img src={item.thumbnail} alt={item.title} style="width:64px;height:64px;border-radius:0;object-fit:cover;display:block" loading="lazy" />
                {#if _loadingId === item.videoId}
                  <div style="position:absolute;inset:0;border-radius:0;background:rgba(10,10,10,.7);display:flex;align-items:center;justify-content:center">
                    <div class="mini-spin"></div>
                  </div>
                {/if}
              </div>
              <div style="flex:1;min-width:0">
                <p style="font-size:.82rem;font-weight:700;color:{$_q8z?.videoId === item.videoId ? '#FFFFFF' : '#F5F5F5'};margin:0 0 4px;
                  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{item.title}</p>
                {#if item.duration}
                  <p style="font-size:.68rem;color:rgba(245,245,245,.35);margin:0">{item.duration}</p>
                {/if}
              </div>
            </button>
            <button on:click={e => _openMenu(e, item)}
              style="width:32px;height:32px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;
                background:transparent;border:none;cursor:pointer;color:rgba(245,245,245,.3)">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#if _data.topAlbums?.length > 0}
      <div class="section-title" style="margin-bottom:12px">
        <div class="bar"></div>
        <h2 style="font-size:1.05rem;font-weight:700;color:#F5F5F5;margin:0">Album</h2>
      </div>
      <div class="hscroll" style="margin-bottom:26px">
        {#each _data.topAlbums as al}
          <button on:click={() => goto(`/album/${al.id}`)} style="background:none;border:none;cursor:pointer;text-align:left;width:130px;flex-shrink:0">
            <img src={al.cover} alt={al.title} style="width:130px;height:130px;border-radius:12px;object-fit:cover;display:block;margin-bottom:8px" loading="lazy" />
            <p style="font-size:.76rem;font-weight:700;color:#F5F5F5;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{al.title}</p>
            <p style="font-size:.65rem;color:rgba(245,245,245,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{al.artist}</p>
          </button>
        {/each}
      </div>
    {/if}

    {#if _data.topSingles?.length > 0}
      <div class="section-title" style="margin-bottom:12px">
        <div class="bar"></div>
        <h2 style="font-size:1.05rem;font-weight:700;color:#F5F5F5;margin:0">Single & EP</h2>
      </div>
      <div class="hscroll" style="margin-bottom:26px">
        {#each _data.topSingles as al}
          <button on:click={() => goto(`/album/${al.id}`)} style="background:none;border:none;cursor:pointer;text-align:left;width:130px;flex-shrink:0">
            <img src={al.cover} alt={al.title} style="width:130px;height:130px;border-radius:12px;object-fit:cover;display:block;margin-bottom:8px" loading="lazy" />
            <p style="font-size:.76rem;font-weight:700;color:#F5F5F5;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{al.title}</p>
            <p style="font-size:.65rem;color:rgba(245,245,245,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{al.artist}</p>
          </button>
        {/each}
      </div>
    {/if}

    {#if _data.similarArtists?.length > 0}
      <div class="section-title" style="margin-bottom:12px">
        <div class="bar"></div>
        <h2 style="font-size:1.05rem;font-weight:700;color:#F5F5F5;margin:0">Artis Serupa</h2>
      </div>
      <div class="hscroll" style="margin-bottom:26px">
        {#each _data.similarArtists as a}
          <button on:click={() => goto(`/artist/${a.id}`)} style="background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;width:96px;flex-shrink:0">
            <img src={a.cover} alt={a.title} style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.15)" loading="lazy" />
            <span style="font-size:.7rem;font-weight:700;color:#F5F5F5;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">{a.title}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .mini-spin { width: 20px; height: 20px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,.2); border-top-color: #FFFFFF; animation: _mspin .7s linear infinite; }
  @keyframes _mspin { to { transform: rotate(360deg); } }
</style>
