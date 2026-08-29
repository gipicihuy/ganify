<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';

  let _loading = true;
  let _me = null;
  let _confirmAction = null;
  let _processing = false;
  let _toast = '';
  let _toastTimer = null;
  let _editingName = false;
  let _nameInput = '';
  let _savingName = false;
  let _nameError = '';
  let _sheet = null; // 'account' | 'clearData' | 'appearance' | 'theme' | null

  // Kunci scroll halaman di belakang selagi modal/sheet manapun terbuka,
  // supaya yang ke-scroll cuma isi modal-nya, bukan konten Settings di
  // belakangnya.
  $: _modalOpen = _editingName || !!_confirmAction || !!_sheet;
  $: if (typeof document !== 'undefined') {
    document.body.style.overflow = _modalOpen ? 'hidden' : '';
  }

  onDestroy(() => {
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  });

  function handleGoogleSignIn() {
    location.href = '/login';
  }

  function handleLogOut() {
    location.href = '/logout';
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/me');
      _me = await res.json();
    } catch {
      _me = { isGuest: true };
    } finally {
      _loading = false;
    }
  });

  function _initials(name) {
    if (!name) return '';
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
  }

  function _showToast(msg) {
    _toast = msg;
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { _toast = ''; }, 2400);
  }

  function _openNameEdit() {
    _nameInput = _me?.name || '';
    _nameError = '';
    _editingName = true;
  }

  function _openProfile() {
    if (!_me || _me.isGuest) {
      handleGoogleSignIn();
      return;
    }
    _openNameEdit();
  }

  function _openConnectedAccounts() {
    if (!_me || _me.isGuest) {
      handleGoogleSignIn();
      return;
    }
    _sheet = 'account';
  }

  async function _saveName() {
    const trimmed = _nameInput.trim();
    if (!trimmed) {
      _nameError = 'Nama gak boleh kosong';
      return;
    }
    if (trimmed.length > 60) {
      _nameError = 'Kepanjangan, maksimal 60 karakter';
      return;
    }
    _savingName = true;
    _nameError = '';
    try {
      const res = await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_name', name: trimmed })
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        _nameError = 'Gagal simpan, coba lagi';
        return;
      }
      _me = { ..._me, name: trimmed };
      _editingName = false;
      _showToast('Nama berhasil diganti');
    } catch {
      _nameError = 'Gagal simpan, coba lagi';
    } finally {
      _savingName = false;
    }
  }

  const _confirmCopy = {
    clear_liked: {
      title: 'Hapus Semua Lagu Disukai?',
      desc: 'Semua lagu yang kamu suka akan dihapus permanen dan tidak bisa dikembalikan.',
      confirmLabel: 'Hapus'
    },
    clear_history: {
      title: 'Hapus Semua Riwayat?',
      desc: 'Riwayat pemutaran lagu akan dihapus permanen dan tidak bisa dikembalikan.',
      confirmLabel: 'Hapus'
    },
    logout: {
      title: 'Keluar dari Akun?',
      desc: 'Kamu perlu masuk kembali dengan Google untuk mengakses riwayat, lagu disukai, dan playlist kamu.',
      confirmLabel: 'Log Out'
    }
  };

  async function _runAction(action) {
    if (action === 'logout') {
      _confirmAction = null;
      handleLogOut();
      return;
    }
    _processing = true;
    try {
      await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      _confirmAction = null;
      _sheet = null;
      _showToast(action === 'clear_liked' ? 'Semua lagu disukai dihapus' : 'Riwayat dihapus');
    } catch {
      _showToast('Gagal memproses, coba lagi');
    } finally {
      _processing = false;
    }
  }
</script>

<div style="max-width:560px;margin:0 auto;padding:24px 16px 40px">

  {#if _loading}
    <div style="min-height:50vh;display:flex;align-items:center;justify-content:center">
      <div class="settings-spin"></div>
    </div>
  {:else}

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:22px">
      <div style="width:5px;height:26px;border-radius:3px;background:linear-gradient(to bottom,#FFFFFF,#E6E6E6);flex-shrink:0"></div>
      <h1 style="font-size:1.35rem;font-weight:700;color:#FFFFFF;margin:0">Settings</h1>
    </div>

    <div style="display:flex;align-items:center;gap:14px;padding:2px 4px 28px">
      <div style="width:52px;height:52px;border-radius:16px;overflow:hidden;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        {#if _me && !_me.isGuest && _me.avatarUrl}
          <img src={_me.avatarUrl} alt={_me.name || 'Avatar'} style="width:100%;height:100%;object-fit:cover" />
        {:else if _me && !_me.isGuest}
          <span style="font-size:1.05rem;font-weight:700;color:#FFFFFF">{_initials(_me.name) || '?'}</span>
        {:else}
          <svg width="24" height="24" fill="#FFFFFF" fill-opacity=".55" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        {/if}
      </div>
      <div style="min-width:0">
        <p style="font-size:1rem;font-weight:700;color:#FFFFFF;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          {#if _me && !_me.isGuest}{_me.name || 'Akun Ganify'}{:else}Akun Tamu{/if}
        </p>
        <p style="font-size:.78rem;color:rgba(255,255,255,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          {#if _me && !_me.isGuest}{_me.email || 'Tersambung dengan Google'}{:else}Belum masuk akun{/if}
        </p>
        {#if _me && !_me.isGuest}
          <button class="account-logout-btn" on:click={() => _confirmAction = 'logout'}>
            <svg width="17" height="17" fill="#FF6464" fill-opacity=".9" viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L17.17 10H9v2h8.17l-1.58 1.59L17 15l4-4zM5 5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h7v-2H5V5z"/></svg>
            <span>Log Out</span>
          </button>
        {/if}
      </div>
    </div>

    {#if !_me || _me.isGuest}
      <button on:click={handleGoogleSignIn} class="google-signin-btn" style="margin:0 0 26px">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8z"/>
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z"/>
          <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1-.38-2.27c0-.79.14-1.56.38-2.27V6.62H1.27A11.96 11.96 0 0 0 0 12c0 1.94.47 3.77 1.27 5.38l4-3.11z"/>
          <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.11c.95-2.85 3.6-4.96 6.73-4.96z"/>
        </svg>
        <span>Masuk dengan Google</span>
      </button>
    {/if}

    <p class="settings-section-title">Account</p>
    <div class="settings-group">
      <button class="settings-item" on:click={_openProfile}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">Profile</span>
        </span>
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <button class="settings-item" on:click={_openConnectedAccounts}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">Connected Accounts</span>
        </span>
        {#if _me && !_me.isGuest}
          <span class="settings-item-value">Google</span>
        {/if}
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <p class="settings-section-title">Data</p>
    <div class="settings-group">
      <button class="settings-item" on:click={() => goto('/library?tab=recent')}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M13 3a9 9 0 1 0 .001 18.001A9 9 0 0 0 13 3zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zm.5-11H12v6l5.25 3.15.75-1.23-4.5-2.67V8z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">History</span>
        </span>
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <button class="settings-item" on:click={() => goto('/library?tab=liked')}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">Liked Songs</span>
        </span>
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <button class="settings-item" on:click={() => _sheet = 'clearData'}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">Clear Data</span>
        </span>
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <p class="settings-section-title">Appearance</p>
    <div class="settings-group">
      <button class="settings-item" on:click={() => _sheet = 'appearance'}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">Appearance</span>
        </span>
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <button class="settings-item" on:click={() => _sheet = 'theme'}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">Theme</span>
        </span>
        <span class="settings-item-value">Dark</span>
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <p class="settings-section-title">About</p>
    <div class="settings-group">
      <button class="settings-item" on:click={() => goto('/settings/about')}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">About Ganify</span>
        </span>
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <button class="settings-item" on:click={() => goto('/settings/privacy')}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">Privacy Policy</span>
        </span>
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <button class="settings-item" on:click={() => goto('/settings/terms')}>
        <span class="settings-item-icon">
          <svg width="19" height="19" fill="#F5F5F5" fill-opacity=".62" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        </span>
        <span class="settings-item-text">
          <span class="settings-item-title">Terms of Service</span>
        </span>
        <svg class="settings-chevron" width="18" height="18" fill="none" stroke="#F5F5F5" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <div style="margin-top:26px;text-align:center">
      <span style="font-size:.68rem;color:rgba(255,255,255,.4);letter-spacing:.04em">&copy; 2026 Ganify. All rights reserved.</span>
    </div>
  {/if}

</div>

{#if _editingName}
  <div style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px"
    on:click={() => { if (!_savingName) _editingName = false; }}>
    <div style="width:100%;max-width:320px;max-height:85vh;overflow-y:auto;background:#1c1c1c;border-radius:18px;padding:24px 20px;border:1px solid rgba(255,255,255,.12)"
      on:click|stopPropagation>
      <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 14px">Ganti Nama</p>
      <input
        type="text"
        bind:value={_nameInput}
        maxlength="60"
        placeholder="Nama kamu"
        disabled={_savingName}
        on:keydown={(e) => e.key === 'Enter' && _saveName()}
        style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.15);color:#FFFFFF;font-family:'Quicksand',sans-serif;font-size:.85rem;
          font-weight:600;margin-bottom:8px;outline:none" />
      {#if _nameError}
        <p style="font-size:.72rem;color:rgba(255,100,100,.85);margin:0 0 8px">{_nameError}</p>
      {/if}
      <div style="display:flex;gap:10px;margin-top:12px">
        <button disabled={_savingName} on:click={() => _editingName = false}
          style="flex:1;padding:11px;border-radius:10px;background:rgba(255,255,255,.07);
            border:1px solid rgba(255,255,255,.15);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.8rem;font-weight:700;color:rgba(245,245,245,.6)">Batal</button>
        <button disabled={_savingName} on:click={_saveName}
          style="flex:1;padding:11px;border-radius:10px;background:rgba(255,255,255,.12);
            border:1px solid rgba(255,255,255,.25);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.8rem;font-weight:700;color:#FFFFFF">
          {_savingName ? '...' : 'Simpan'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if _confirmAction}
  <div style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px"
    on:click={() => { if (!_processing) _confirmAction = null; }}>
    <div style="width:100%;max-width:320px;max-height:85vh;overflow-y:auto;background:#1c1c1c;border-radius:18px;padding:24px 20px;border:1px solid rgba(255,100,100,.2)"
      on:click|stopPropagation>
      <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 8px">{_confirmCopy[_confirmAction].title}</p>
      <p style="font-size:.78rem;color:rgba(245,245,245,.45);margin:0 0 20px;line-height:1.5">{_confirmCopy[_confirmAction].desc}</p>
      <div style="display:flex;gap:10px">
        <button disabled={_processing} on:click={() => _confirmAction = null}
          style="flex:1;padding:11px;border-radius:10px;background:rgba(255,255,255,.07);
            border:1px solid rgba(255,255,255,.15);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.8rem;font-weight:700;color:rgba(245,245,245,.6)">Batal</button>
        <button disabled={_processing} on:click={() => _runAction(_confirmAction)}
          style="flex:1;padding:11px;border-radius:10px;background:rgba(255,60,60,.15);
            border:1px solid rgba(255,60,60,.3);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.8rem;font-weight:700;color:rgba(255,100,100,.9)">
          {_processing ? '...' : _confirmCopy[_confirmAction].confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if _sheet}
  <div style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px"
    on:click={() => { if (!_processing) _sheet = null; }}>
    <div style="width:100%;max-width:340px;max-height:85vh;overflow-y:auto;background:#1c1c1c;border-radius:18px;padding:22px 20px;border:1px solid rgba(255,255,255,.12)"
      on:click|stopPropagation>

      {#if _sheet === 'account'}
        <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 16px">Connected Accounts</p>
        <div style="display:flex;align-items:center;gap:10px;padding:13px 14px;border-radius:12px;border:1px solid #303030;background:#1F1F1F">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z"/>
            <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1-.38-2.27c0-.79.14-1.56.38-2.27V6.62H1.27A11.96 11.96 0 0 0 0 12c0 1.94.47 3.77 1.27 5.38l4-3.11z"/>
            <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.11c.95-2.85 3.6-4.96 6.73-4.96z"/>
          </svg>
          <span style="flex:1;font-size:.82rem;font-weight:600;color:#F5F5F5">{_me?.email || 'Google Account'}</span>
          <svg width="16" height="16" fill="#4ADE80" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        </div>
        <p style="font-size:.72rem;color:rgba(245,245,245,.4);margin:12px 0 0;line-height:1.5">Akun Google kamu dipakai untuk menyimpan riwayat, lagu disukai, dan playlist agar aman saat ganti perangkat.</p>
        <button on:click={() => _sheet = null}
          style="width:100%;margin-top:18px;padding:11px;border-radius:10px;background:rgba(255,255,255,.07);
            border:1px solid rgba(255,255,255,.15);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.8rem;font-weight:700;color:rgba(245,245,245,.6)">Tutup</button>

      {:else if _sheet === 'clearData'}
        <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 4px">Clear Data</p>
        <p style="font-size:.74rem;color:rgba(245,245,245,.4);margin:0 0 16px;line-height:1.5">Pilih data yang mau dihapus permanen dari akun kamu.</p>
        <button class="sheet-danger-row" on:click={() => _confirmAction = 'clear_history'}>
          <svg width="18" height="18" fill="#FF6464" fill-opacity=".75" viewBox="0 0 24 24"><path d="M13 3a9 9 0 1 0 .001 18.001A9 9 0 0 0 13 3zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zm.5-11H12v6l5.25 3.15.75-1.23-4.5-2.67V8z"/></svg>
          <span>Hapus Semua Riwayat</span>
        </button>
        <button class="sheet-danger-row" on:click={() => _confirmAction = 'clear_liked'}>
          <svg width="18" height="18" fill="#FF6464" fill-opacity=".75" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          <span>Hapus Semua Lagu Disukai</span>
        </button>
        <button on:click={() => _sheet = null}
          style="width:100%;margin-top:14px;padding:11px;border-radius:10px;background:rgba(255,255,255,.07);
            border:1px solid rgba(255,255,255,.15);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.8rem;font-weight:700;color:rgba(245,245,245,.6)">Batal</button>

      {:else if _sheet === 'appearance'}
        <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 10px">Appearance</p>
        <p style="font-size:.78rem;color:rgba(245,245,245,.45);margin:0 0 18px;line-height:1.6">Ganify saat ini didesain khusus untuk pengalaman dark mode yang optimal. Opsi kustomisasi tampilan tambahan akan hadir di pembaruan mendatang.</p>
        <button on:click={() => _sheet = null}
          style="width:100%;padding:11px;border-radius:10px;background:rgba(255,255,255,.12);
            border:1px solid rgba(255,255,255,.25);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.8rem;font-weight:700;color:#FFFFFF">Oke, Mengerti</button>

      {:else if _sheet === 'theme'}
        <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 16px">Theme</p>
        <div class="theme-pick-row theme-pick-active">
          <span>Dark</span>
          <svg width="17" height="17" fill="#FFFFFF" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        </div>
        <div class="theme-pick-row theme-pick-disabled">
          <span>Light</span>
          <span class="theme-pick-tag">Segera Hadir</span>
        </div>
        <button on:click={() => _sheet = null}
          style="width:100%;margin-top:16px;padding:11px;border-radius:10px;background:rgba(255,255,255,.07);
            border:1px solid rgba(255,255,255,.15);cursor:pointer;font-family:'Quicksand',sans-serif;
            font-size:.8rem;font-weight:700;color:rgba(245,245,245,.6)">Tutup</button>
      {/if}

    </div>
  </div>
{/if}

{#if _toast}
  <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:200;
    background:#1c1c1c;border:1px solid rgba(255,255,255,.3);border-radius:99px;
    padding:10px 20px;font-size:.78rem;font-weight:700;color:#FFFFFF;
    white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4)">
    {_toast}
  </div>
{/if}

<style>
  .google-signin-btn {
    width: 100%;
    height: 52px;
    padding: 0 16px;
    border-radius: 14px;
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

  .settings-spin {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid rgba(255,255,255,.15);
    border-top-color: #FFFFFF;
    animation: _settingsSpin .7s linear infinite;
  }

  @keyframes _settingsSpin {
    to { transform: rotate(360deg); }
  }

  .settings-section-title {
    font-size: .68rem;
    font-weight: 700;
    color: rgba(245,245,245,.34);
    text-transform: uppercase;
    letter-spacing: .07em;
    margin: 0 0 8px 6px;
  }

  .settings-group {
    background: rgba(255,255,255,.03);
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 22px;
  }

  .settings-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 14px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,.06);
    cursor: pointer;
    text-align: left;
    transition: background-color .15s ease;
  }

  .settings-group .settings-item:last-child {
    border-bottom: none;
  }

  .settings-item:hover {
    background: rgba(255,255,255,.045);
  }

  .settings-item-icon {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .settings-item-text {
    flex: 1;
    min-width: 0;
  }

  .settings-item-title {
    display: block;
    font-size: .84rem;
    font-weight: 600;
    color: #F5F5F5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .settings-item-value {
    font-size: .76rem;
    font-weight: 600;
    color: rgba(245,245,245,.35);
    flex-shrink: 0;
  }

  .settings-chevron {
    flex-shrink: 0;
  }

  .account-logout-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0 0;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .account-logout-btn span {
    font-family: 'Quicksand', sans-serif;
    font-size: .8rem;
    font-weight: 700;
    color: rgba(255,100,100,.9);
  }

  .account-logout-btn:hover span {
    color: rgba(255,100,100,1);
  }

  .sheet-danger-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 4px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,.06);
    cursor: pointer;
    text-align: left;
    font-family: 'Quicksand', sans-serif;
    font-size: .82rem;
    font-weight: 600;
    color: rgba(255,100,100,.85);
  }

  .sheet-danger-row:last-of-type {
    border-bottom: none;
  }

  .sheet-danger-row:hover {
    background: rgba(255,100,100,.05);
  }

  .theme-pick-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.08);
    margin-bottom: 8px;
    font-size: .84rem;
    font-weight: 600;
    color: #F5F5F5;
  }

  .theme-pick-active {
    background: rgba(255,255,255,.06);
    border-color: rgba(255,255,255,.2);
  }

  .theme-pick-disabled {
    color: rgba(245,245,245,.3);
  }

  .theme-pick-tag {
    font-size: .66rem;
    font-weight: 700;
    color: rgba(245,245,245,.35);
    text-transform: uppercase;
    letter-spacing: .04em;
  }
</style>
