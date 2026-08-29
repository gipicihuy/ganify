<script>
  import { onMount } from 'svelte';

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
    }
  };

  async function _runAction(action) {
    _processing = true;
    try {
      await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      _confirmAction = null;
      _showToast(action === 'clear_liked' ? 'Semua lagu disukai dihapus' : 'Riwayat dihapus');
    } catch {
      _showToast('Gagal memproses, coba lagi');
    } finally {
      _processing = false;
    }
  }
</script>

<div style="max-width:560px;margin:0 auto;padding:28px 16px 40px">

  {#if _loading}
    <div style="min-height:50vh;display:flex;align-items:center;justify-content:center">
      <div class="settings-spin"></div>
    </div>
  {:else}
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:28px">
      {#if _me && !_me.isGuest}
        <div style="width:84px;height:84px;border-radius:24px;overflow:hidden;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:20px">
          {#if _me.avatarUrl}
            <img src={_me.avatarUrl} alt={_me.name || 'Avatar'} style="width:100%;height:100%;object-fit:cover" />
          {:else}
            <span style="font-size:1.4rem;font-weight:700;color:#FFFFFF">{_initials(_me.name) || '?'}</span>
          {/if}
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <h1 style="font-size:1.3rem;font-weight:700;color:#FFFFFF;margin:0">{_me.name || 'Akun Ganify'}</h1>
          <button on:click={_openNameEdit} aria-label="Ganti nama"
            style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.08);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="13" height="13" fill="rgba(255,255,255,.55)" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
        </div>
        {#if _me.email}
          <p style="font-size:.82rem;color:rgba(255,255,255,.4);margin:0 0 18px">{_me.email}</p>
        {:else}
          <p style="font-size:.82rem;color:rgba(255,255,255,.4);margin:0 0 18px">Akun tertaut dengan Google</p>
        {/if}

        <div style="width:100%;max-width:320px;padding:14px 16px;border-radius:16px;border:1px solid #303030;background:#1F1F1F;display:flex;align-items:center;gap:10px;justify-content:center">
          <svg width="16" height="16" fill="#4ADE80" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
          <span style="font-size:.85rem;font-weight:600;color:#F5F5F5">Tersambung dengan Google</span>
        </div>
      {:else}
        <div style="width:84px;height:84px;border-radius:24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:20px">
          <svg width="40" height="40" fill="#FFFFFF" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.85c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </div>

        <h1 style="font-size:1.3rem;font-weight:700;color:#FFFFFF;margin:0 0 10px">Settings</h1>
        <p style="font-size:.82rem;color:rgba(255,255,255,.4);line-height:1.6;margin:0 0 20px;max-width:340px">Kamu masih pakai akun tamu. Hubungkan dengan Google biar data lagu, playlist, dan riwayat aman kalau ganti perangkat.</p>

        <button on:click={handleGoogleSignIn} class="google-signin-btn">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z"/>
            <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1-.38-2.27c0-.79.14-1.56.38-2.27V6.62H1.27A11.96 11.96 0 0 0 0 12c0 1.94.47 3.77 1.27 5.38l4-3.11z"/>
            <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.11c.95-2.85 3.6-4.96 6.73-4.96z"/>
          </svg>
          <span>Masuk dengan Google</span>
        </button>
      {/if}
    </div>

    <div class="settings-section">
      <p class="settings-section-title">Kelola Data</p>
      <button class="settings-row" on:click={() => _confirmAction = 'clear_history'}>
        <span class="settings-row-icon">
          <svg width="18" height="18" fill="rgba(245,245,245,.6)" viewBox="0 0 24 24"><path d="M13 3a9 9 0 1 0 .001 18.001A9 9 0 0 0 13 3zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zm.5-11H12v6l5.25 3.15.75-1.23-4.5-2.67V8z"/></svg>
        </span>
        <span class="settings-row-label">Hapus Semua Riwayat</span>
        <svg width="16" height="16" fill="rgba(245,245,245,.25)" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6v12z"/></svg>
      </button>
      <button class="settings-row" on:click={() => _confirmAction = 'clear_liked'}>
        <span class="settings-row-icon">
          <svg width="18" height="18" fill="rgba(245,245,245,.6)" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </span>
        <span class="settings-row-label">Hapus Semua Lagu Disukai</span>
        <svg width="16" height="16" fill="rgba(245,245,245,.25)" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6v12z"/></svg>
      </button>
    </div>

    {#if _me && !_me.isGuest}
      <div class="settings-section">
        <p class="settings-section-title">Akun</p>
        <button class="settings-row settings-row-danger" on:click={handleLogOut}>
          <span class="settings-row-icon">
            <svg width="18" height="18" fill="rgba(255,100,100,.75)" viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L17.17 10H9v2h8.17l-1.58 1.59L17 15l4-4zM5 5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h7v-2H5V5z"/></svg>
          </span>
          <span class="settings-row-label" style="color:rgba(255,100,100,.85)">Log Out</span>
        </button>
      </div>
    {/if}

    <div style="margin-top:24px;text-align:center">
      <span style="font-size:.68rem;color:rgba(255,255,255,.4);letter-spacing:.04em">&copy; 2026 Ganify. All rights reserved.</span>
    </div>
  {/if}

</div>

{#if _editingName}
  <div style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px"
    on:click={() => { if (!_savingName) _editingName = false; }}>
    <div style="width:100%;max-width:320px;background:#1c1c1c;border-radius:18px;padding:24px 20px;border:1px solid rgba(255,255,255,.12)"
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
    <div style="width:100%;max-width:320px;background:#1c1c1c;border-radius:18px;padding:24px 20px;border:1px solid rgba(255,100,100,.2)"
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

  .settings-section {
    margin-bottom: 20px;
  }

  .settings-section-title {
    font-size: .72rem;
    font-weight: 700;
    color: rgba(245,245,245,.35);
    text-transform: uppercase;
    letter-spacing: .05em;
    margin: 0 0 10px 4px;
  }

  .settings-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 14px;
    cursor: pointer;
    text-align: left;
    margin-bottom: 8px;
    transition: background-color .15s ease;
  }

  .settings-row:hover {
    background: rgba(255,255,255,.07);
  }

  .settings-row-danger {
    border-color: rgba(255,100,100,.15);
  }

  .settings-row-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255,255,255,.06);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .settings-row-label {
    flex: 1;
    font-size: .84rem;
    font-weight: 600;
    color: #F5F5F5;
  }
</style>
