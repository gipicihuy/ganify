<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  export let data;

  $: track = data.track;
  $: shareUrl = data.shareUrl;
  $: ogImage = data.ogImage;
  $: subtitle = track.artist || track.author || '';
  $: ogTitle = subtitle ? `${track.title} - ${subtitle}` : track.title;
  $: ogDescription = `Dengarkan ${track.title} di Ganify!`;

  // Halaman ini pada dasarnya cuma dirender buat crawler preview (server
  // sudah redirect browser asli ke Home + bottom sheet sebelum sampai
  // sini). Baris ini murni jaring pengaman: kalau suatu saat ada UA
  // browser asli yang kebaca sebagai "crawler" oleh regex di server,
  // tetap arahkan ke flow yang sama begitu JS jalan, bukan nyangkut di
  // halaman standalone ini.
  onMount(() => {
    goto(`/?share=${encodeURIComponent(track.videoId)}`, { replaceState: true });
  });
</script>

<svelte:head>
  <title>{track.title} - Ganify</title>
  <meta name="description" content={ogDescription} />

  <meta property="og:type" content="music.song" />
  <meta property="og:url" content={shareUrl} />
  <meta property="og:site_name" content="Ganify" />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:image" content={ogImage.url} />
  {#if ogImage.width}
    <meta property="og:image:width" content={String(ogImage.width)} />
    <meta property="og:image:height" content={String(ogImage.height)} />
  {/if}
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:alt" content={ogTitle} />
  <meta property="og:locale" content="id_ID" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content={shareUrl} />
  <meta name="twitter:title" content={ogTitle} />
  <meta name="twitter:description" content={ogDescription} />
  <meta name="twitter:image" content={ogImage.url} />
</svelte:head>

<div class="share-wrap">
  <div class="share-content">
    <div class="share-cover">
      <img src={track.thumbnail} alt={track.title} loading="eager" />
    </div>
    <p class="share-title">{track.title}</p>
    {#if subtitle}
      <p class="share-artist">{subtitle}</p>
    {/if}
  </div>
</div>

<style>
  .share-wrap {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: var(--bg-raised);
  }

  .share-content {
    max-width: 380px;
    width: 100%;
    text-align: center;
  }

  .share-cover {
    width: 220px;
    height: 220px;
    margin: 0 auto 24px;
    border-radius: 18px;
    overflow: hidden;
    background: var(--bg-card);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-flat);
  }

  .share-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .share-title {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--cream);
    margin: 0 0 6px;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }

  .share-artist {
    font-size: 0.95rem;
    color: rgba(245, 245, 245, 0.55);
    margin: 0 0 32px;
  }

  .share-title:last-of-type {
    margin-bottom: 0;
  }
</style>
