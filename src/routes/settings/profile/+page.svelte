<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let _loading = true;
  let _me = null;
  let _nameInput = '';
  let _savingName = false;
  let _nameError = '';
  let _toast = '';
  let _toastTimer = null;

  function _initials(name) {
    if (!name) return '';
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
  }

  function _showToast(msg) {
    _toast = msg;
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { _toast = ''; }, 2400);
  }

  let _showPhotoSoon = false;

  function _handlePhotoTap() {
    _showPhotoSoon = true;
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/me');
      _me = await res.json();
      if (!_me || _me.isGuest) {
        goto('/settings');
        return;
      }
      _nameInput = _me.name || '';
    } catch {
      goto('/settings');
      return;
    } finally {
      _loading = false;
    }
  });

  $: _dirty = _me && _nameInput.trim() && _nameInput.trim() !== _me.name;

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
    if (trimmed === _me.name) return;
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
      _showToast('Profil berhasil disimpan');
    } catch {
      _nameError = 'Gagal simpan, coba lagi';
    } finally {
      _savingName = false;
    }
  }
</script>

<div style="max-width:560px;margin:0 auto;padding-bottom:40px">

  {#if _loading}
    <div style="min-height:70vh;display:flex;align-items:center;justify-content:center">
      <div class="profile-spin"></div>
    </div>
  {:else if _me}

    <div class="profile-topbar">
      <button on:click={() => history.back()} class="profile-back-btn" aria-label="Kembali">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </button>
      <p class="profile-topbar-title">Edit Profil</p>
      <button on:click={_saveName} disabled={!_dirty || _savingName} class="profile-save-btn"
        style="opacity:{(!_dirty || _savingName) ? .35 : 1}">
        {_savingName ? '...' : 'Simpan'}
      </button>
    </div>

    <div class="profile-hero">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar">
          {#if _me.avatarUrl}
            <img src={_me.avatarUrl} alt={_me.name || 'Avatar'} style="width:100%;height:100%;object-fit:cover" />
          {:else}
            <span style="font-size:2.1rem;font-weight:700;color:#FFFFFF">{_initials(_me.name) || '?'}</span>
          {/if}
        </div>
        <button class="profile-avatar-cam" on:click={_handlePhotoTap} aria-label="Ganti foto profil">
          <svg width="17" height="17" fill="none" stroke="#0D0D0D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>
            <circle cx="12" cy="14" r="3.5"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="profile-fields">
      <div class="profile-field">
        <p class="profile-field-label">Username</p>
        <input
          type="text"
          bind:value={_nameInput}
          maxlength="60"
          placeholder="Nama kamu"
          disabled={_savingName}
          on:input={() => _nameError = ''}
          on:keydown={(e) => e.key === 'Enter' && _saveName()}
          class="profile-field-input" />
        {#if _nameError}
          <p class="profile-field-error">{_nameError}</p>
        {/if}
      </div>

      <div class="profile-field">
        <p class="profile-field-label">Email</p>
        <p class="profile-field-static">{_me.email || 'Tersambung dengan Google'}</p>
      </div>
    </div>

  {/if}

</div>

{#if _showPhotoSoon}
  <div style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px"
    on:click={() => _showPhotoSoon = false}>
    <div style="width:100%;max-width:340px;max-height:85vh;overflow-y:auto;background:#1c1c1c;border-radius:18px;padding:22px 20px;border:1px solid rgba(255,255,255,.12)"
      on:click|stopPropagation>
      <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 10px">Ganti Foto Profil</p>
      <p style="font-size:.78rem;color:rgba(245,245,245,.45);margin:0 0 18px;line-height:1.6">Fitur ini akan segera hadir!</p>
      <button on:click={() => _showPhotoSoon = false}
        style="width:100%;padding:11px;border-radius:10px;background:rgba(255,255,255,.12);
          border:1px solid rgba(255,255,255,.25);cursor:pointer;font-family:'Quicksand',sans-serif;
          font-size:.8rem;font-weight:700;color:#FFFFFF">Oke, Mengerti</button>
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
  .profile-spin {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid rgba(255,255,255,.15);
    border-top-color: #FFFFFF;
    animation: _profileSpin .7s linear infinite;
  }

  @keyframes _profileSpin {
    to { transform: rotate(360deg); }
  }

  .profile-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 16px;
    background: #101010;
    border-bottom: 1px solid rgba(255,255,255,.07);
  }

  .profile-back-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.12);
    cursor: pointer;
    color: rgba(255,255,255,.7);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .profile-topbar-title {
    font-size: .95rem;
    font-weight: 700;
    color: #FFFFFF;
    margin: 0;
  }

  .profile-save-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: 'Quicksand', sans-serif;
    font-size: .82rem;
    font-weight: 800;
    letter-spacing: .03em;
    color: #FFFFFF;
    padding: 6px 4px;
    flex-shrink: 0;
    min-width: 52px;
    text-align: right;
  }

  .profile-hero {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 16px 34px;
    background: #101010;
  }

  .profile-avatar-wrap {
    position: relative;
    width: 108px;
    height: 108px;
  }

  .profile-avatar {
    width: 108px;
    height: 108px;
    border-radius: 50%;
    overflow: hidden;
    background: rgba(255,255,255,0.08);
    border: 2px solid rgba(255,255,255,0.15);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .profile-avatar-cam {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #FFFFFF;
    border: 3px solid #101010;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .profile-fields {
    padding: 26px 20px 0;
  }

  .profile-field {
    margin-bottom: 22px;
  }

  .profile-field-label {
    font-size: .68rem;
    font-weight: 700;
    color: rgba(245,245,245,.34);
    text-transform: uppercase;
    letter-spacing: .07em;
    margin: 0 0 8px 2px;
  }

  .profile-field-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0 2px 10px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,.15);
    color: #FFFFFF;
    font-family: 'Quicksand', sans-serif;
    font-size: .95rem;
    font-weight: 700;
    outline: none;
  }

  .profile-field-input:focus {
    border-bottom-color: rgba(255,255,255,.5);
  }

  .profile-field-static {
    margin: 0;
    padding: 0 2px 10px;
    border-bottom: 1px solid rgba(255,255,255,.08);
    font-size: .95rem;
    font-weight: 700;
    color: rgba(245,245,245,.5);
  }

  .profile-field-error {
    font-size: .72rem;
    color: rgba(255,100,100,.85);
    margin: 8px 0 0 2px;
  }
</style>
