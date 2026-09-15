<script>
  import { goto } from '$app/navigation';

  export let data;

  $: track = data.track;
  $: shareUrl = data.shareUrl;
  $: subtitle = track.artist || track.author || '';
  $: ogDescription = subtitle ? `${track.title} - ${subtitle}` : track.title;

  function _playNow() {
    goto(`/play/${track.videoId}`);
  }

  function _later() {
    goto('/');
  }
</script>

<svelte:head>
  <title>{track.title} - Ganify</title>
  <meta name="description" content={ogDescription} />

  <meta property="og:type" content="music.song" />
  <meta property="og:url" content={shareUrl} />
  <meta property="og:site_name" content="Ganify" />
  <meta property="og:title" content={track.title} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:image" content={track.thumbnail} />
  <meta property="og:locale" content="id_ID" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content={shareUrl} />
  <meta name="twitter:title" content={track.title} />
  <meta name="twitter:description" content={ogDescription} />
  <meta name="twitter:image" content={track.thumbnail} />
</svelte:head>

<div class="share-wrap">
  <div class="share-content">
    <p class="share-eyebrow">Seseorang membagikan lagu ini kepadamu</p>

    <div class="share-cover">
      <img src={track.thumbnail} alt={track.title} loading="eager" />
    </div>

    <p class="share-title">{track.title}</p>
    {#if subtitle}
      <p class="share-artist">{subtitle}</p>
    {/if}

    <div class="share-actions">
      <button class="share-btn share-btn-primary" on:click={_playNow}>Putar Sekarang</button>
      <button class="share-btn share-btn-secondary" on:click={_later}>Nanti</button>
    </div>
  </div>

  <span class="share-footer">&copy; 2026 Ganify. All rights reserved.</span>
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

  .share-eyebrow {
    font-size: 0.85rem;
    color: rgba(245, 245, 245, 0.6);
    margin: 0 0 24px;
    letter-spacing: 0.01em;
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
    margin-bottom: 32px;
  }

  .share-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 8px;
  }

  .share-btn {
    width: 100%;
    padding: 14px 20px;
    border-radius: 999px;
    font-size: 0.95rem;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  .share-btn:active {
    transform: scale(0.97);
  }

  .share-btn-primary {
    background: var(--gold);
    color: #141414;
  }

  .share-btn-secondary {
    background: transparent;
    color: var(--cream);
    border: 1px solid var(--border);
  }

  .share-footer {
    margin-top: 40px;
    font-size: 0.68rem;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 0.04em;
  }
</style>
