<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { _q8z, _p1k, _x9a, _showNP } from '$lib/store.js';
  import { _getSongInfo } from '$lib/api.js';
  import { _loadQueueSnapshot } from '$lib/queueSnapshot.js';

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
    // sudah bersih dari suffix channel seperti "- Topic".
    try {
      const info = await _getSongInfo(id);
      if (info && info.title) return { ...info, artist: _stripTopic(info.artist), author: _stripTopic(info.author) };
    } catch { /* lanjut ke fallback */ }

    // Fallback kalau endpoint di atas gagal (mis. video tidak ditemukan di
    // YT Music): coba oEmbed langsung dari klien.
    return _fetchFromOembed(id);
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

    const track = await _fetchTrackInfo(id);
    if (!track) { goto('/'); return; }

    _p1k.set([track]);
    _x9a.set(0);
    _q8z.set(track);
    _showNP.set(true);
  });
</script>
