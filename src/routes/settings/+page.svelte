<!--
  Halaman ini nantinya jadi pusat akun & pengaturan pengguna, bukan cuma login.
  Rencana ke depan: sign in with Google, ganti nama tampilan, ganti/upload foto profil,
  preferensi kualitas audio, tema, notifikasi, hapus akun, dll.
  Tombol Google sign-in sudah tersambung ke Auth.js (lihat src/hooks.server.js).
  Fitur profil/pengaturan lain di bawah masih placeholder sampai skema user di database jadi.
-->
<script>
  import { signIn } from '@auth/sveltekit/client';

  function handleGoogleSignIn() {
    signIn('google');
  }
</script>

<div style="max-width:560px;margin:0 auto;padding:24px 16px 0;min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">

  <div style="width:84px;height:84px;border-radius:24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:24px">
    <svg width="40" height="40" fill="#FFFFFF" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.85c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
  </div>

  <h1 style="font-size:1.4rem;font-weight:700;color:#FFFFFF;margin:0 0 10px">Settings</h1>
  <p style="font-size:.82rem;color:rgba(255,255,255,.4);line-height:1.6;margin:0 0 32px;max-width:340px">Pengaturan akun akan segera tersedia.</p>

  <button on:click={handleGoogleSignIn} class="google-signin-btn">
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z"/>
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1-.38-2.27c0-.79.14-1.56.38-2.27V6.62H1.27A11.96 11.96 0 0 0 0 12c0 1.94.47 3.77 1.27 5.38l4-3.11z"/>
      <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.11c.95-2.85 3.6-4.96 6.73-4.96z"/>
    </svg>
    <span>Masuk dengan Google</span>
  </button>

  <div style="margin-top:32px">
    <span style="font-size:.68rem;color:rgba(255,255,255,.4);letter-spacing:.04em">&copy; 2026 Ganify. All rights reserved.</span>
  </div>

</div>

<style>
  .google-signin-btn {
    width: 100%;
    max-width: 320px;
    height: 54px;
    padding: 0 16px;
    border-radius: 16px;
    border: 1px solid #303030;
    background: #1F1F1F;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: background-color .15s ease;
  }

  .google-signin-btn:hover,
  .google-signin-btn:focus-visible {
    background: #292929;
  }

  .google-signin-btn:active {
    background: #292929;
  }

  .google-signin-btn span {
    font-size: .85rem;
    font-weight: 600;
    color: #F5F5F5;
  }
</style>
