<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { _q8z, _p1k, _x9a, _showNP } from '$lib/store.js';
  import { _getSongInfo } from '$lib/api.js';
  import { _loadQueueSnapshot } from '$lib/queueSnapshot.js';

  // Cuma dipasang true kalau beneran harus nunggu network (fetch info lagu
  // dari server) - kalau lagunya udah ada di store/snapshot, _showNP
  // langsung ke-set dan halaman ini gak pernah kelihatan sama sekali.
  let _showLoading = false;

  function _stripTopic(name) {
    return (name || '').replace(/\s*-\s*topic\s*$/i, '').trim();
  }

  async function _fetchFromOembed(id) {
    let title = '';
    let author = '';
    let thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
      const r = await fetch(oembedUrl);
      if (r.ok) {
        const j = await r.json();
        title = j.title || '';
        author = _stripTopic(j.author_name || '');
        if (j.thumbnail_url) thumbnail = j.thumbnail_url;
      }
    } catch {
      title = '';
    }
    return title ? { videoId: id, title, thumbnail, author, artist: author, artistId: '', duration: '' } : null;
  }

  async function _fetchTrackInfo(id) {
    // Sumber utama: endpoint sendiri (lewat server, jadi nggak bergantung
    // pada koneksi klien ke domain YouTube yang kadang diblokir jaringan
    // tertentu). Ini juga yang menyediakan artistId asli & nama artis yang
    // sudah bersih dari suffix channel seperti "- Topic", plus antrian "up
    // next" bawaan YT Music buat lagu ini, dipakai sebagai queue kalau nggak
    // ada context playlist dari halaman asal (mis. dibuka langsung dari link).
    try {
      const info = await _getSongInfo(id);
      if (info && info.title) {
        const { queue: rawQueue, ...rest } = info;
        const track = { ...rest, artist: _stripTopic(rest.artist), author: _stripTopic(rest.author) };
        const queue = Array.isArray(rawQueue) && rawQueue.length
          ? rawQueue.map((t) => ({ ...t, artist: _stripTopic(t.artist), author: _stripTopic(t.author) }))
          : null;
        return { track, queue };
      }
    } catch { /* lanjut ke fallback */ }

    // Fallback kalau endpoint di atas gagal (mis. video tidak ditemukan di
    // YT Music): coba oEmbed langsung dari klien.
    const fallback = await _fetchFromOembed(id);
    return fallback ? { track: fallback, queue: null } : null;
  }

  onMount(async () => {
    const id = $page.params.id;
    if (!id) { goto('/'); return; }

    if ($_q8z && $_q8z.videoId === id) {
      _showNP.set(true);
      return;
    }

    const snapshot = _loadQueueSnapshot();
    if (snapshot) {
      const idx = snapshot.queue.findIndex(t => t.videoId === id);
      if (idx !== -1) {
        _p1k.set(snapshot.queue);
        _x9a.set(idx);
        _q8z.set(snapshot.queue[idx]);
        _showNP.set(true);
        return;
      }
    }

    // Titik ini baru beneran nunggu network - tampilin loading biar area
    // kosong pas klik "Putar Sekarang" (mis. dari link share) gak keliatan
    // kayak bug.
    _showLoading = true;

    const result = await _fetchTrackInfo(id);
    if (!result) { goto('/'); return; }

    const { track, queue } = result;
    if (queue && queue.length > 1) {
      const idx = queue.findIndex((t) => t.videoId === id);
      // Item lagu yang lagi diputar di dalam antrian "up next" YT Music
      // biasanya nggak nyertain link channel artis (artistId kosong).
      // Data `track` di atas sudah dicocokkan ke pencarian YT Music dan
      // punya artistId yang valid, jadi timpa posisi lagu ini di antrian
      // dengan versi itu supaya nama artis tetap bisa diklik.
      const mergedQueue = idx >= 0
        ? queue.map((t, i) => (i === idx ? { ...t, ...track } : t))
        : queue;
      _p1k.set(mergedQueue);
      _x9a.set(idx >= 0 ? idx : 0);
      _q8z.set(idx >= 0 ? mergedQueue[idx] : track);
    } else {
      _p1k.set([track]);
      _x9a.set(0);
      _q8z.set(track);
    }
    _showNP.set(true);
    _showLoading = false;
  });
</script>

{#if _showLoading}
  <div class="play-loading">
    <div class="play-loading-content">
      <img src="/logo.png" alt="Ganify" class="play-loading-logo" />
      <div class="play-loading-title">GANIFY</div>
      <div class="play-loading-bars">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
    </div>
  </div>
{/if}

<style>
  .play-loading {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: #141414;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* PNG, bukan inline SVG - biar renderingnya konsisten di semua browser
     (termasuk in-app webview WhatsApp/Telegram yang buka link share). */
  .play-loading-logo {
    width: 88px;
    height: 88px;
    margin-bottom: 22px;
    border-radius: 20px;
  }

  .play-loading-title {
    font-family: 'PakTzy', 'Quicksand', sans-serif;
    font-weight: 800;
    font-size: 1.75rem;
    letter-spacing: -0.04em;
    color: #FFFFFF;
    margin-bottom: 20px;
  }

  .play-loading-bars {
    display: flex;
    gap: 6px;
    align-items: flex-end;
    height: 30px;
  }

  .play-loading-bars span {
    display: block;
    width: 5px;
    background: #FFFFFF;
    border-radius: 3px;
    animation: _playLoadingEq 1s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate;
  }

  .play-loading-bars span:nth-child(1) { animation-delay: 0.1s; }
  .play-loading-bars span:nth-child(2) { animation-delay: 0.3s; }
  .play-loading-bars span:nth-child(3) { animation-delay: 0.0s; }
  .play-loading-bars span:nth-child(4) { animation-delay: 0.2s; }
  .play-loading-bars span:nth-child(5) { animation-delay: 0.4s; }

  @keyframes _playLoadingEq {
    0% { height: 6px; opacity: 0.5; }
    100% { height: 30px; opacity: 1; }
  }
</style>
