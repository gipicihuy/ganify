<script>
  export let data;

  // If maintenance was turned off after this page loaded (or someone lands
  // here directly while it's off), just send them home instead of showing
  // a stale "we're down" screen.
  if (typeof window !== 'undefined' && !data.enabled) {
    location.href = '/';
  }
</script>

<div style="min-height:80vh;display:flex;align-items:center;justify-content:center;padding:28px 16px">
  <div style="max-width:360px;width:100%;text-align:center">
    <img src="/logo.png" alt="Ganify" width="72" height="72" style="border-radius:16px;margin:0 auto 22px;display:block" />
    <div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;margin:0 auto 18px">
      <svg width="20" height="20" fill="none" stroke="#F5F5F5" stroke-opacity=".7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <path d="M12 8v4M12 16h.01M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/>
      </svg>
    </div>
    <p style="font-size:1.05rem;font-weight:700;color:#F5F5F5;margin:0 0 10px;font-family:'Quicksand',sans-serif">Sedang dalam perbaikan</p>
    <p style="font-size:.85rem;color:rgba(245,245,245,.5);margin:0;line-height:1.6;font-family:'Quicksand',sans-serif">
      {data.message || 'Ganify sedang menjalani maintenance sebentar. Coba lagi beberapa saat lagi ya.'}
    </p>
  </div>
</div>
