<script>
  export let data;

  // Kalau ban-nya udah dicabut (atau orang gak-banned nyasar ke sini
  // langsung lewat URL), gak ada alasan nahan mereka di halaman ini.
  if (typeof window !== 'undefined' && !data.banned) {
    location.href = '/';
  }

  function _logout() {
    location.href = '/logout';
  }

  function _formatDate(ts) {
    if (!ts) return '';
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ts));
  }
</script>

<div class="banned-wrap">
  <div class="banned-card">
    <div class="banned-icon">
      <svg width="26" height="26" fill="none" stroke="#FF5C5C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <line x1="4.9" y1="4.9" x2="19.1" y2="19.1" />
      </svg>
    </div>

    <p class="banned-title">Kamu telah dibanned</p>
    <p class="banned-desc">
      Akun kamu diblokir dari Ganify oleh admin dan gak bisa dipakai buat sementara ini.
    </p>

    {#if data.reason}
      <div class="banned-reason">
        <span class="banned-reason-label">Alasan</span>
        <span class="banned-reason-text">{data.reason}</span>
      </div>
    {/if}

    {#if data.bannedAt}
      <p class="banned-meta">Diblokir sejak {_formatDate(data.bannedAt)}</p>
    {/if}

    <button type="button" class="banned-logout" on:click={_logout}>Keluar dari akun</button>
  </div>
</div>

<style>
  .banned-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: #121212;
  }

  .banned-card {
    max-width: 380px;
    width: 100%;
    text-align: center;
    padding: 32px 26px;
    border-radius: 20px;
    background: #1c1c1c;
    border: 1px solid rgba(255, 92, 92, 0.2);
  }

  .banned-icon {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: rgba(255, 92, 92, 0.1);
    border: 1px solid rgba(255, 92, 92, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
  }

  .banned-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #F5F5F5;
    margin: 0 0 10px;
    font-family: 'Quicksand', sans-serif;
  }

  .banned-desc {
    font-size: 0.85rem;
    color: rgba(245, 245, 245, 0.55);
    line-height: 1.6;
    margin: 0 0 20px;
    font-family: 'Quicksand', sans-serif;
  }

  .banned-reason {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    background: rgba(255, 92, 92, 0.06);
    border: 1px solid rgba(255, 92, 92, 0.18);
    border-radius: 12px;
    padding: 12px 14px;
    margin: 0 0 16px;
  }

  .banned-reason-label {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(255, 92, 92, 0.7);
  }

  .banned-reason-text {
    font-size: 0.8rem;
    color: rgba(245, 245, 245, 0.75);
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  .banned-meta {
    font-size: 0.72rem;
    color: rgba(245, 245, 245, 0.35);
    margin: 0 0 22px;
  }

  .banned-logout {
    width: 100%;
    padding: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #F5F5F5;
    font-size: 0.82rem;
    font-weight: 700;
    font-family: 'Quicksand', sans-serif;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .banned-logout:hover {
    background: rgba(255, 255, 255, 0.14);
  }
</style>
