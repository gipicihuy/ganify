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
  <div class="maint-content">
    <div class="maint-icon">
      <svg width="38" height="38" fill="none" stroke="#F5F5F5" stroke-opacity=".85" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <path d="M12 8v4M12 16h.01M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/>
      </svg>
    </div>

    <p class="maint-title">Sedang dalam perbaikan</p>
    <p class="maint-desc">
      {data.message || 'Ganify sedang menjalani maintenance sebentar. Coba lagi beberapa saat lagi ya.'}
    </p>
  </div>

  <span class="maint-footer">&copy; 2026 Ganify. All rights reserved.</span>
</div>

<style>
  .maint-wrap {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: #121212;
  }

  .maint-content {
    max-width: 380px;
    width: 100%;
    text-align: center;
  }

  .maint-icon {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 28px;
  }

  .maint-title {
    font-size: 1.55rem;
    font-weight: 700;
    color: #F5F5F5;
    margin: 0 0 14px;
    letter-spacing: -0.01em;
    font-family: 'Quicksand', sans-serif;
  }

  .maint-desc {
    font-size: 0.95rem;
    color: rgba(245, 245, 245, 0.5);
    margin: 0;
    line-height: 1.75;
    font-family: 'Quicksand', sans-serif;
  }

  .maint-footer {
    margin-top: 40px;
    font-size: 0.68rem;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 0.04em;
    font-family: 'Quicksand', sans-serif;
  }
</style>
