<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { _getArtist } from '$lib/api.js';
  import { _q8z, _p1k, _x9a, _showMenu, _playlists } from '$lib/store.js';
  import { getPlaylists } from '$lib/playlist.js';

  let _data = null, _ld = true, _er = null;
  let _loadingId = null;
  // State expand/collapse buat deskripsi/bio artist. Direset tiap kali
  // load() jalan (lihat di bawah) supaya pas pindah ke artist lain
  // (mis. dari "Artis Serupa") state "Selengkapnya" dari artist
  // sebelumnya gak kebawa nyangkut ke artist yang baru.
  let _bioExpanded = false;
  // ID yang datanya lagi ditampilkan/lagi diproses oleh load() saat ini.
  // Root cause loading yang gak pernah selesai: `$: if (_id) load();`
  // dulunya nembak load() lagi tiap kali blok reaktif ini ke-invalidate,
  // BUKAN cuma pas `_id` beneran ganti nilai — Svelte re-run reactive
  // statement berdasarkan "variabelnya baru di-assign", bukan "nilainya
  // beda dari sebelumnya". Jadi navigasi/update store apa pun yang bikin
  // `_id` di-assign ulang ke nilai yang SAMA tetap men-trigger load() lagi,
  // dan beberapa call `load()` yang overlap saling rebutan _ld/_data/_er
  // tanpa urutan yang jelas — salah satu request yang telat balik bisa
  // nimpa state dari request yang lebih baru, termasuk numpuk balik jadi
  // "loading" padahal ada request lain yang sudah selesai duluan.
  let _loadedFor = null;
  let _loadToken = 0;

  $: _id = $page.params.id;

  // reactive, bukan onMount: karena SvelteKit reuse komponen yang sama saat
  // pindah dari /artist/A ke /artist/B (misal klik "Artis Serupa"), onMount
  // saja cuma jalan sekali di navigasi pertama sehingga data lama nyangkut.
  // Guard `_id !== _loadedFor` di sini biar gak nembak ulang request untuk
  // ID yang sama persis (lihat catatan di atas `_loadedFor`).
  $: if (_id && _id !== _loadedFor) load(_id);

  async function load(id) {
    const myToken = ++_loadToken;
    _loadedFor = id;
    _ld = true; _er = null;
    _bioExpanded = false;
    try {
      const result = await _getArtist(id);
      if (myToken !== _loadToken) return; // ada request yang lebih baru, hasil ini dibuang
      _data = result;
      if (!_data) _er = 'Artis tidak ditemukan';
    } catch (e) {
      if (myToken !== _loadToken) return;
      _data = null;
      _er = e?.message || 'Gagal memuat data artis';
    } finally {
      if (myToken === _loadToken) _ld = false;
    }
  }

  // Metadata artist yang ditampilkan di header profile. Cuma pakai angka
  // yang beneran ada di response /api/artist (jumlah item tiap section
  // yang memang sudah dirender di halaman ini) — bukan follower/subscriber
  // count, karena /api/artist (browse) sama sekali gak pernah mengembalikan
  // field itu (lihat src/routes/api/artist/+server.js: hasil cuma berisi
  // artistId, name, description, cover, topSongs, topAlbums, topSingles,
  // playlists, similarArtists). Dulu area info artist cuma nampilin
  // `description` mentah dari YT Music, dan buat sebagian artist field itu
  // isinya bukan bio beneran (kosong atau cuma teks pendek generik) —
  // makanya kelihatan "kadang audience-like, kadang description, kadang
  // gak ada apa-apa". Dengan chip metadata ini, header profile selalu
  // konsisten menampilkan ringkasan katalog yang tersedia, terpisah total
  // dari section bio di bawahnya.
  $: _artistStats = _data ? [
    _data.topSongs?.length ? `${_data.topSongs.length} Lagu` : null,
    _data.topAlbums?.length ? `${_data.topAlbums.length} Album` : null,
    _data.topSingles?.length ? `${_data.topSingles.length} Single & EP` : null,
    _data.playlists?.length ? `${_data.playlists.length} Playlist` : null,
    _data.similarArtists?.length ? `${_data.similarArtists.length} Artis Serupa` : null
  ].filter(Boolean) : [];

  // Heuristik panjang teks buat nentuin apakah bio perlu tombol
  // expand/collapse. Sebelumnya dipaksa clamp 3 baris via CSS
  // `-webkit-line-clamp` TANPA ada cara buat lihat sisa teksnya — hasilnya
  // teks kepotong "..." mati tanpa mekanisme buka/tutup. Threshold di sini
  // dicocokkan ke lebar container bio (max-width 440px, font .82rem,
  // line-clamp 4 baris di CSS) supaya tombol cuma muncul kalau teksnya
  // memang bakal overflow.
  $: _bioIsLong = !!_data?.description && (
    _data.description.length > 220 ||
    (_data.description.match(/\n/g) || []).length >= 3
  );

  async function _pl(item, idx, queue) {
    _loadingId = item.videoId;
    _p1k.set(queue);
    _x9a.set(idx);
    _q8z.set({ ...item, author: item.artist });
    setTimeout(() => { _loadingId = null; }, 3000);
  }

  function _openMenu(e, item) {
    e.stopPropagation();
    _showMenu.set({ ...item, author: item.artist });
    getPlaylists().then((list) => _playlists.set(list)).catch(() => {});
  }

  function scrollGlow(node) {
    let hideTimer;
    function onScroll() {
      node.classList.add('is-scrolling');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => node.classList.remove('is-scrolling'), 900);
    }
    node.addEventListener('scroll', onScroll, { passive: true });
    return {
      destroy() {
        node.removeEventListener('scroll', onScroll);
        clearTimeout(hideTimer);
      }
    };
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
    <div class="artist-header">
      <img src={_data.cover} alt={_data.name} class="artist-photo" loading="lazy" />
      <h1 class="artist-name">{_data.name}</h1>

      {#if _artistStats.length > 0}
        <div class="artist-stats">
          {#each _artistStats as stat, i}
            {#if i > 0}<span class="artist-stats-dot" aria-hidden="true">•</span>{/if}
            <span class="artist-stat">{stat}</span>
          {/each}
        </div>
      {/if}
    </div>

    {#if _data.description}
      <div class="artist-bio">
        <span class="artist-bio-label">Tentang Artist</span>
        <p class="artist-bio-text" class:is-clamped={_bioIsLong && !_bioExpanded}>{_data.description}</p>
        {#if _bioIsLong}
          <button type="button" class="artist-bio-toggle" on:click={() => _bioExpanded = !_bioExpanded}>
            {_bioExpanded ? 'Lebih sedikit' : 'Selengkapnya'}
          </button>
        {/if}
      </div>
    {/if}

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
      <div class="hscroll" style="margin-bottom:26px" use:scrollGlow>
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
      <div class="hscroll" style="margin-bottom:26px" use:scrollGlow>
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
      <div class="hscroll" style="margin-bottom:26px" use:scrollGlow>
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

  /* Header profile artist: foto, nama, dan ringkasan metadata katalog.
     Selalu tampil dengan struktur yang sama untuk semua artist -- kalau
     _artistStats kosong, blok statsnya cuma gak dirender, layout foto+nama
     tetap konsisten (gak ada elemen lain yang "gantiin" tempatnya). */
  .artist-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
    padding: 8px 0 4px;
  }
  .artist-name {
    font-size: 1.4rem;
    font-weight: 700;
    color: #FFFFFF;
    line-height: 1.25;
    margin: 0;
  }
  .artist-stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    column-gap: 8px;
    row-gap: 4px;
    max-width: 440px;
  }
  .artist-stat {
    font-size: .78rem;
    font-weight: 600;
    color: rgba(245,245,245,.72);
    letter-spacing: .01em;
  }
  .artist-stats-dot {
    font-size: .65rem;
    color: rgba(245,245,245,.28);
  }

  /* Bio/deskripsi artist: section terpisah di bawah metadata, bukan
     pengganti/kondisi "salah satu" dari metadata di atas. Rata kiri
     (bukan center) supaya paragraf multi-baris tetap enak dibaca. */
  .artist-bio {
    max-width: 440px;
    margin: 14px auto 26px;
    padding: 14px 16px;
    text-align: left;
    background: rgba(255,255,255,.04);
    border: 1px solid var(--border);
    border-radius: 14px;
  }
  .artist-bio-label {
    display: block;
    font-size: .68rem;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: rgba(245,245,245,.45);
    margin-bottom: 8px;
  }
  .artist-bio-text {
    font-size: .82rem;
    font-weight: 500;
    color: rgba(245,245,245,.75);
    line-height: 1.65;
    margin: 0;
    white-space: pre-line;
    overflow-wrap: break-word;
  }
  .artist-bio-text.is-clamped {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .artist-bio-toggle {
    display: inline-block;
    margin-top: 8px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'Quicksand', sans-serif;
    font-size: .74rem;
    font-weight: 700;
    color: #FFFFFF;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .artist-bio-toggle:hover { color: rgba(255,255,255,.8); }
</style>
