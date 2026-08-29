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
      _showToast('Nama berhasil diganti');
    } catch {
      _nameError = 'Gagal simpan, coba lagi';
    } finally {
      _savingName = false;
    }
  }
</script>

<div style="max-width:560px;margin:0 auto;padding:20px 16px 40px">

  <button on:click={() => history.back()}
    style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);cursor:pointer;color:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;margin-bottom:22px">
    <svg width="19" height="19" fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
  </button>

  {#if _loading}
    <div style="min-height:40vh;display:flex;align-items:center;justify-content:center">
      <div class="profile-spin"></div>
    </div>
  {:else if _me}

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:26px">
      <div style="width:5px;height:26px;border-radius:3px;background:linear-gradient(to bottom,#FFFFFF,#E6E6E6);flex-shrink:0"></div>
      <h1 style="font-size:1.35rem;font-weight:700;color:#FFFFFF;margin:0">Profile</h1>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:30px">
      <div style="position:relative;width:96px;height:96px;margin-bottom:14px">
        <div style="width:96px;height:96px;border-radius:24px;overflow:hidden;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center">
          {#if _me.avatarUrl}
            <img src={_me.avatarUrl} alt={_me.name || 'Avatar'} style="width:100%;height:100%;object-fit:cover" />
          {:else}
            <span style="font-size:1.8rem;font-weight:700;color:#FFFFFF">{_initials(_me.name) || '?'}</span>
          {/if}
        </div>
      </div>
      <p style="font-size:.72rem;color:rgba(245,245,245,.35);margin:0;text-align:center">Foto profil belum bisa diganti dari sini</p>
    </div>

    <p class="profile-field-label">Nama</p>
    <input
      type="text"
      bind:value={_nameInput}
      maxlength="60"
      placeholder="Nama kamu"
      disabled={_savingName}
      on:input={() => _nameError = ''}
      on:keydown={(e) => e.key === 'Enter' && _saveName()}
      style="width:100%;box-sizing:border-box;padding:13px 14px;border-radius:12px;background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.15);color:#FFFFFF;font-family:'Quicksand',sans-serif;font-size:.88rem;
        font-weight:600;outline:none;margin-bottom:6px" />
    {#if _nameError}
      <p style="font-size:.72rem;color:rgba(255,100,100,.85);margin:0 0 8px">{_nameError}</p>
    {/if}

    <p class="profile-field-label" style="margin-top:20px">Email</p>
    <div style="padding:13px 14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">
      <span style="font-size:.84rem;font-weight:600;color:rgba(245,245,245,.55)">{_me.email || 'Tersambung dengan Google'}</span>
    </div>

    <button disabled={_savingName || !_nameInput.trim() || _nameInput.trim() === _me.name} on:click={_saveName}
      style="width:100%;margin-top:26px;padding:13px;border-radius:12px;background:rgba(255,255,255,.12);
        border:1px solid rgba(255,255,255,.25);cursor:pointer;font-family:'Quicksand',sans-serif;
        font-size:.85rem;font-weight:700;color:#FFFFFF;opacity:{(_savingName || !_nameInput.trim() || _nameInput.trim() === _me.name) ? 0.5 : 1}">
      {_savingName ? 'Menyimpan...' : 'Simpan Perubahan'}
    </button>

  {/if}

</div>

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

  .profile-field-label {
    font-size: .68rem;
    font-weight: 700;
    color: rgba(245,245,245,.34);
    text-transform: uppercase;
    letter-spacing: .07em;
    margin: 0 0 8px 2px;
  }
</style>
