<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
</script>

<div style="min-height:80vh;display:flex;align-items:center;justify-content:center;padding:28px 16px">
  <div style="max-width:340px;width:100%;text-align:center">
    <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,60,60,.12);border:1px solid rgba(255,60,60,.3);display:flex;align-items:center;justify-content:center;margin:0 auto 18px">
      <svg width="20" height="20" fill="none" stroke="rgba(255,100,100,.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
      </svg>
    </div>
    <p style="font-size:1rem;font-weight:700;color:#F5F5F5;margin:0 0 8px;font-family:'Quicksand',sans-serif">Akses ditolak</p>
    <p style="font-size:.82rem;color:rgba(245,245,245,.5);margin:0 0 22px;line-height:1.6;font-family:'Quicksand',sans-serif">
      {$page.status === 403
        ? 'Halaman ini khusus untuk admin Ganify.'
        : 'Terjadi kesalahan saat memuat halaman ini.'}
    </p>
    <button on:click={() => goto('/')}
      style="padding:11px 22px;border-radius:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);
        cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.8rem;font-weight:700;color:#F5F5F5">
      Kembali ke Beranda
    </button>
  </div>
</div>
