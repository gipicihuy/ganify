<script>
  export let data;

  // If maintenance was turned off after this page loaded (or someone lands
  // here directly while it's off), just send them home instead of showing
  // a stale "we're down" screen.
  if (typeof window !== 'undefined' && !data.enabled) {
    location.href = '/';
  }
</script>

<div class="maint-wrap">
  <div class="maint-card">
    <div class="maint-icon">
      <svg width="34" height="34" fill="none" stroke="#F5F5F5" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <path d="M12 8v4M12 16h.01M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/>
      </svg>
    </div>

    <p class="maint-title">Sedang dalam perbaikan</p>
    <p class="maint-desc">
      {data.message || 'Ganify sedang menjalani maintenance sebentar. Coba lagi beberapa saat lagi ya.'}
    </p>
  </div>
</div>

<style>
  .maint-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: #121212;
  }

  .maint-card {
    max-width: 440px;
    width: 100%;
    text-align: center;
    padding: 48px 36px;
    border-radius: 26px;
    background: #1c1c1c;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  }

  .maint-icon {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 26px;
  }

  .maint-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #F5F5F5;
    margin: 0 0 14px;
    letter-spacing: -0.01em;
    font-family: 'Quicksand', sans-serif;
  }

  .maint-desc {
    font-size: 0.95rem;
    color: rgba(245, 245, 245, 0.55);
    margin: 0;
    line-height: 1.75;
    font-family: 'Quicksand', sans-serif;
  }
</style>
