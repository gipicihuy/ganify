<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { _q8z, _p1k, _x9a, _showNP } from '$lib/store.js';

  async function _fetchTrackInfo(id) {
    let title = '';
    let author = '';
    let thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
      const r = await fetch(oembedUrl);
      if (r.ok) {
        const j = await r.json();
        title = j.title || '';
        author = j.author_name || '';
        if (j.thumbnail_url) thumbnail = j.thumbnail_url;
      }
    } catch {
      title = '';
    }
    return title ? { videoId: id, title, thumbnail, author, artist: author, duration: '' } : null;
  }

  onMount(async () => {
    const id = $page.params.id;
    if (!id) { goto('/'); return; }

    if ($_q8z && $_q8z.videoId === id) {
      _showNP.set(true);
      return;
    }

    const track = await _fetchTrackInfo(id);
    if (!track) { goto('/'); return; }

    _p1k.set([track]);
    _x9a.set(0);
    _q8z.set(track);
    _showNP.set(true);
  });
</script>
