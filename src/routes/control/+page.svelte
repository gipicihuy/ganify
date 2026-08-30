<script>
  import { onMount } from 'svelte';

  export let data; // { admin: { email, name, avatarUrl } }

  const TABS = [
    ['overview', 'Overview'],
    ['site', 'Site Control'],
    ['announcements', 'Pengumuman'],
    ['users', 'Users'],
    ['flags', 'Feature Flags'],
    ['audit', 'Audit Log']
  ];
  let _tab = 'overview';

  let _loading = true;
  let _stats = null;
  let _maintenance = { enabled: false, message: '' };

  let _announcements = [];
  let _annLoading = true;
  let _annForm = null; // null | {id?, title, body, isActive, publishAt, expiresAt}
  let _annSaving = false;

  let _users = [];
  let _usersTotal = 0;
  let _usersLoading = true;
  let _usersQuery = '';
  let _usersOffset = 0;
  const USERS_PAGE = 20;

  let _flags = [];
  let _flagsLoading = true;
  let _newFlagKey = '';

  let _auditEntries = [];
  let _auditTotal = 0;
  let _auditLoading = true;
  let _auditOffset = 0;
  const AUDIT_PAGE = 30;

  // { kind: 'maintenance' | 'ban' | 'unban' | 'delete_announcement', payload }
  let _confirm = null;
  let _confirmBusy = false;
  let _toast = '';
  let _toastTimer = null;

  function _showToast(msg) {
    _toast = msg;
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { _toast = ''; }, 2600);
  }

  async function _loadOverview() {
    _loading = true;
    try {
      const res = await fetch('/api/admin/overview');
      const data = await res.json();
      _stats = data.stats;
      _maintenance = data.maintenance;
    } catch {
      _showToast('Gagal memuat overview');
    } finally {
      _loading = false;
    }
  }

  async function _loadAnnouncements() {
    _annLoading = true;
    try {
      const res = await fetch('/api/admin/announcements');
      const data = await res.json();
      _announcements = data.announcements || [];
    } catch {
      _showToast('Gagal memuat pengumuman');
    } finally {
      _annLoading = false;
    }
  }

  async function _loadUsers() {
    _usersLoading = true;
    try {
      const params = new URLSearchParams({ q: _usersQuery, limit: USERS_PAGE, offset: _usersOffset });
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      _users = data.users || [];
      _usersTotal = data.total || 0;
    } catch {
      _showToast('Gagal memuat users');
    } finally {
      _usersLoading = false;
    }
  }

  async function _loadFlags() {
    _flagsLoading = true;
    try {
      const res = await fetch('/api/admin/flags');
      const data = await res.json();
      _flags = data.flags || [];
    } catch {
      _showToast('Gagal memuat feature flags');
    } finally {
      _flagsLoading = false;
    }
  }

  async function _loadAudit() {
    _auditLoading = true;
    try {
      const params = new URLSearchParams({ limit: AUDIT_PAGE, offset: _auditOffset });
      const res = await fetch(`/api/admin/audit-log?${params}`);
      const data = await res.json();
      _auditEntries = data.entries || [];
      _auditTotal = data.total || 0;
    } catch {
      _showToast('Gagal memuat audit log');
    } finally {
      _auditLoading = false;
    }
  }

  onMount(_loadOverview);

  function _switchTab(t) {
    _tab = t;
    if (t === 'announcements' && _annLoading) _loadAnnouncements();
    if (t === 'users' && _usersLoading) _loadUsers();
    if (t === 'flags' && _flagsLoading) _loadFlags();
    if (t === 'audit' && _auditLoading) _loadAudit();
    if (t === 'overview') _loadOverview();
  }

  // ---------------- site control ----------------

  function _askToggleMaintenance() {
    _confirm = { kind: 'maintenance', enable: !_maintenance.enabled };
  }

  async function _confirmMaintenance(enable, message) {
    _confirmBusy = true;
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable, message: message ?? _maintenance.message })
      });
      _maintenance = await res.json();
      _showToast(enable ? 'Maintenance mode diaktifkan' : 'Maintenance mode dimatikan');
    } catch {
      _showToast('Gagal mengubah maintenance mode');
    } finally {
      _confirmBusy = false;
      _confirm = null;
    }
  }

  // ---------------- announcements ----------------

  function _newAnnouncement() {
    _annForm = { title: '', body: '', isActive: true, publishAt: '', expiresAt: '' };
  }
  function _editAnnouncement(a) {
    _annForm = {
      id: a.id,
      title: a.title,
      body: a.body,
      isActive: !!a.is_active,
      publishAt: a.publish_at ? new Date(a.publish_at).toISOString().slice(0, 16) : '',
      expiresAt: a.expires_at ? new Date(a.expires_at).toISOString().slice(0, 16) : ''
    };
  }

  async function _saveAnnouncement() {
    if (!_annForm.title.trim() || !_annForm.body.trim()) {
      _showToast('Judul dan isi wajib diisi');
      return;
    }
    _annSaving = true;
    try {
      const payload = {
        title: _annForm.title,
        body: _annForm.body,
        isActive: _annForm.isActive,
        publishAt: _annForm.publishAt ? new Date(_annForm.publishAt).getTime() : null,
        expiresAt: _annForm.expiresAt ? new Date(_annForm.expiresAt).getTime() : null
      };
      const url = _annForm.id ? `/api/admin/announcements/${_annForm.id}` : '/api/admin/announcements';
      const method = _annForm.id ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      _annForm = null;
      _showToast('Pengumuman disimpan');
      await _loadAnnouncements();
    } catch {
      _showToast('Gagal menyimpan pengumuman');
    } finally {
      _annSaving = false;
    }
  }

  function _askDeleteAnnouncement(a) {
    _confirm = { kind: 'delete_announcement', id: a.id, title: a.title };
  }

  async function _confirmDeleteAnnouncement(id) {
    _confirmBusy = true;
    try {
      await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      _showToast('Pengumuman dihapus');
      await _loadAnnouncements();
    } catch {
      _showToast('Gagal menghapus pengumuman');
    } finally {
      _confirmBusy = false;
      _confirm = null;
    }
  }

  // ---------------- users ----------------

  let _usersSearchTimer = null;
  function _onUsersSearchInput() {
    if (_usersSearchTimer) clearTimeout(_usersSearchTimer);
    _usersSearchTimer = setTimeout(() => { _usersOffset = 0; _loadUsers(); }, 350);
  }

  function _askBan(user) {
    _confirm = { kind: 'ban', user, reason: '' };
  }
  function _askUnban(user) {
    _confirm = { kind: 'unban', user };
  }

  async function _confirmBanAction(user, action, reason) {
    _confirmBusy = true;
    try {
      await fetch(`/api/admin/users/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason })
      });
      _showToast(action === 'ban' ? 'User di-ban' : 'User di-unban');
      await _loadUsers();
    } catch {
      _showToast('Aksi gagal');
    } finally {
      _confirmBusy = false;
      _confirm = null;
    }
  }

  function _fmtDateTime(ts) {
    if (!ts) return '-';
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  }

  // ---------------- feature flags ----------------

  async function _addFlag() {
    const key = _newFlagKey.trim();
    if (!key) return;
    try {
      await fetch('/api/admin/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, enabled: true })
      });
      _newFlagKey = '';
      await _loadFlags();
    } catch {
      _showToast('Gagal menambah flag');
    }
  }

  async function _toggleFlag(flag) {
    try {
      await fetch('/api/admin/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: flag.key, enabled: !flag.enabled })
      });
      await _loadFlags();
    } catch {
      _showToast('Gagal mengubah flag');
    }
  }

  async function _deleteFlag(flag) {
    try {
      await fetch(`/api/admin/flags/${flag.key}`, { method: 'DELETE' });
      await _loadFlags();
    } catch {
      _showToast('Gagal menghapus flag');
    }
  }
</script>

<div style="max-width:640px;margin:0 auto;padding:24px 16px 100px">

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px">
    <div>
      <p style="font-size:1.15rem;font-weight:700;color:#F5F5F5;margin:0;font-family:'Quicksand',sans-serif">Control Panel</p>
      <p style="font-size:.75rem;color:rgba(245,245,245,.4);margin:2px 0 0;font-family:'Quicksand',sans-serif">Masuk sebagai {data.admin.email}</p>
    </div>
    {#if _maintenance.enabled}
      <span style="font-size:.68rem;font-weight:700;color:#FFB020;background:rgba(255,176,32,.12);border:1px solid rgba(255,176,32,.3);padding:5px 10px;border-radius:20px;white-space:nowrap;font-family:'Quicksand',sans-serif">Maintenance ON</span>
    {/if}
  </div>

  <div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:20px;padding-bottom:4px">
    {#each TABS as [key, label]}
      <button on:click={() => _switchTab(key)}
        style="flex-shrink:0;padding:8px 14px;border-radius:20px;cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.78rem;font-weight:700;
          background:{_tab === key ? '#FFFFFF' : 'rgba(255,255,255,.07)'};
          color:{_tab === key ? '#121212' : 'rgba(245,245,245,.6)'};
          border:1px solid {_tab === key ? '#FFFFFF' : 'rgba(255,255,255,.15)'}">
        {label}
      </button>
    {/each}
  </div>

  {#if _tab === 'overview'}
    {#if _loading}
      <p style="font-size:.8rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Memuat...</p>
    {:else if _stats}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="control-card">
          <p class="control-card-label">Total User</p>
          <p class="control-card-value">{_stats.totalUsers}</p>
        </div>
        <div class="control-card">
          <p class="control-card-label">Akun Terdaftar</p>
          <p class="control-card-value">{_stats.registeredUsers}</p>
        </div>
        <div class="control-card">
          <p class="control-card-label">Di-ban</p>
          <p class="control-card-value" style="color:{_stats.bannedUsers > 0 ? 'rgba(255,100,100,.9)' : '#F5F5F5'}">{_stats.bannedUsers}</p>
        </div>
        <div class="control-card">
          <p class="control-card-label">Pengumuman Aktif</p>
          <p class="control-card-value">{_stats.activeAnnouncements}</p>
        </div>
      </div>
      <div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)">
        <p style="font-size:.78rem;color:rgba(245,245,245,.55);margin:0;font-family:'Quicksand',sans-serif">
          Status website: <strong style="color:{_maintenance.enabled ? '#FFB020' : '#7CFF9E'}">{_maintenance.enabled ? 'Maintenance' : 'Normal'}</strong>
        </p>
      </div>
    {/if}
  {/if}

  {#if _tab === 'site'}
    <div class="control-panel-block">
      <p class="control-block-title">Maintenance Mode</p>
      <p class="control-block-desc">Saat aktif, semua user selain admin dialihkan ke halaman maintenance. Berlaku langsung tanpa redeploy.</p>
      <textarea bind:value={_maintenance.message} placeholder="Pesan maintenance (opsional)"
        style="width:100%;min-height:70px;margin:10px 0;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.15);color:#F5F5F5;font-family:'Quicksand',sans-serif;font-size:.8rem;resize:vertical"></textarea>
      <button on:click={_askToggleMaintenance}
        style="padding:11px 18px;border-radius:10px;cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.8rem;font-weight:700;
          background:{_maintenance.enabled ? 'rgba(255,60,60,.15)' : 'rgba(255,255,255,.9)'};
          color:{_maintenance.enabled ? 'rgba(255,100,100,.9)' : '#121212'};
          border:1px solid {_maintenance.enabled ? 'rgba(255,60,60,.3)' : 'transparent'}">
        {_maintenance.enabled ? 'Matikan Maintenance' : 'Aktifkan Maintenance'}
      </button>
    </div>
  {/if}

  {#if _tab === 'announcements'}
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button on:click={_newAnnouncement}
        style="padding:9px 16px;border-radius:10px;background:#FFFFFF;color:#121212;border:none;cursor:pointer;
          font-family:'Quicksand',sans-serif;font-size:.78rem;font-weight:700">+ Pengumuman Baru</button>
    </div>

    {#if _annLoading}
      <p style="font-size:.8rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Memuat...</p>
    {:else if _announcements.length === 0}
      <p style="font-size:.8rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Belum ada pengumuman.</p>
    {:else}
      {#each _announcements as a (a.id)}
        <div class="control-panel-block" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div style="min-width:0">
              <p style="font-size:.85rem;font-weight:700;color:#F5F5F5;margin:0 0 4px;font-family:'Quicksand',sans-serif">{a.title}</p>
              <p style="font-size:.76rem;color:rgba(245,245,245,.5);margin:0 0 8px;line-height:1.5;font-family:'Quicksand',sans-serif;white-space:pre-wrap">{a.body}</p>
              <span style="font-size:.68rem;font-weight:700;padding:3px 8px;border-radius:10px;font-family:'Quicksand',sans-serif;
                background:{a.is_active ? 'rgba(124,255,158,.12)' : 'rgba(255,255,255,.08)'};
                color:{a.is_active ? '#7CFF9E' : 'rgba(245,245,245,.4)'}">{a.is_active ? 'Aktif' : 'Nonaktif'}</span>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button on:click={() => _editAnnouncement(a)} style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);cursor:pointer;color:rgba(245,245,245,.7);display:flex;align-items:center;justify-content:center">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
              <button on:click={() => _askDeleteAnnouncement(a)} style="width:32px;height:32px;border-radius:8px;background:rgba(255,60,60,.1);border:1px solid rgba(255,60,60,.25);cursor:pointer;color:rgba(255,100,100,.9);display:flex;align-items:center;justify-content:center">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  {/if}

  {#if _tab === 'users'}
    <input bind:value={_usersQuery} on:input={_onUsersSearchInput} placeholder="Cari nama atau email..."
      style="width:100%;padding:11px 14px;border-radius:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);
        color:#F5F5F5;font-family:'Quicksand',sans-serif;font-size:.82rem;margin-bottom:14px" />

    {#if _usersLoading}
      <p style="font-size:.8rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Memuat...</p>
    {:else if _users.length === 0}
      <p style="font-size:.8rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Tidak ada user ditemukan.</p>
    {:else}
      {#each _users as u (u.id)}
        <div class="control-panel-block" style="margin-bottom:10px;display:flex;align-items:center;gap:12px">
          <img src={u.avatar_url || '/logo.png'} alt="" width="40" height="40" style="border-radius:50%;flex-shrink:0;object-fit:cover" />
          <div style="flex:1;min-width:0">
            <p style="font-size:.82rem;font-weight:700;color:#F5F5F5;margin:0 0 2px;font-family:'Quicksand',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{u.name || '(tanpa nama)'}</p>
            <p style="font-size:.72rem;color:rgba(245,245,245,.45);margin:0;font-family:'Quicksand',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{u.email}</p>
            <p style="font-size:.66rem;color:rgba(245,245,245,.3);margin:4px 0 0;font-family:'Quicksand',sans-serif">
              Bergabung {_fmtDateTime(u.created_at)} · Terakhir aktif {_fmtDateTime(u.last_seen_at)}
            </p>
          </div>
          {#if u.is_banned}
            <button on:click={() => _askUnban(u)}
              style="flex-shrink:0;padding:8px 12px;border-radius:8px;background:rgba(124,255,158,.1);border:1px solid rgba(124,255,158,.3);
                color:#7CFF9E;cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.72rem;font-weight:700">Unban</button>
          {:else}
            <button on:click={() => _askBan(u)}
              style="flex-shrink:0;padding:8px 12px;border-radius:8px;background:rgba(255,60,60,.1);border:1px solid rgba(255,60,60,.25);
                color:rgba(255,100,100,.9);cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.72rem;font-weight:700">Ban</button>
          {/if}
        </div>
      {/each}

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <button disabled={_usersOffset === 0} on:click={() => { _usersOffset = Math.max(0, _usersOffset - USERS_PAGE); _loadUsers(); }}
          style="padding:7px 14px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#F5F5F5;
            cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.74rem;opacity:{_usersOffset === 0 ? .4 : 1}">Sebelumnya</button>
        <span style="font-size:.72rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">{_usersOffset + 1}-{Math.min(_usersOffset + USERS_PAGE, _usersTotal)} dari {_usersTotal}</span>
        <button disabled={_usersOffset + USERS_PAGE >= _usersTotal} on:click={() => { _usersOffset += USERS_PAGE; _loadUsers(); }}
          style="padding:7px 14px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#F5F5F5;
            cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.74rem;opacity:{_usersOffset + USERS_PAGE >= _usersTotal ? .4 : 1}">Selanjutnya</button>
      </div>
    {/if}
  {/if}

  {#if _tab === 'flags'}
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <input bind:value={_newFlagKey} placeholder="nama_flag_baru"
        style="flex:1;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);
          color:#F5F5F5;font-family:'Quicksand',sans-serif;font-size:.8rem" />
      <button on:click={_addFlag} style="padding:10px 16px;border-radius:10px;background:#FFFFFF;color:#121212;border:none;cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.78rem;font-weight:700">Tambah</button>
    </div>
    <p style="font-size:.72rem;color:rgba(245,245,245,.35);margin:0 0 14px;line-height:1.5;font-family:'Quicksand',sans-serif">
      Flag disimpan server-side dan siap dipakai, tapi belum ada fitur di kode Ganify saat ini yang membaca flag ini secara otomatis — perlu dihubungkan manual ke bagian yang ingin di-gate.
    </p>
    {#if _flagsLoading}
      <p style="font-size:.8rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Memuat...</p>
    {:else if _flags.length === 0}
      <p style="font-size:.8rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Belum ada feature flag.</p>
    {:else}
      {#each _flags as f (f.key)}
        <div class="control-panel-block" style="margin-bottom:8px;display:flex;align-items:center;gap:12px">
          <span style="flex:1;font-size:.82rem;color:#F5F5F5;font-family:'Quicksand',sans-serif;font-weight:600">{f.key}</span>
          <button on:click={() => _toggleFlag(f)}
            style="width:44px;height:26px;border-radius:14px;border:none;cursor:pointer;position:relative;flex-shrink:0;
              background:{f.enabled ? '#7CFF9E' : 'rgba(255,255,255,.15)'};transition:background .15s">
            <span style="position:absolute;top:3px;left:{f.enabled ? '21px' : '3px'};width:20px;height:20px;border-radius:50%;background:#121212;transition:left .15s"></span>
          </button>
          <button on:click={() => _deleteFlag(f)} style="width:30px;height:30px;border-radius:8px;background:rgba(255,60,60,.1);border:1px solid rgba(255,60,60,.25);cursor:pointer;color:rgba(255,100,100,.9);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      {/each}
    {/if}
  {/if}

  {#if _tab === 'audit'}
    {#if _auditLoading}
      <p style="font-size:.8rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Memuat...</p>
    {:else if _auditEntries.length === 0}
      <p style="font-size:.8rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Belum ada aktivitas admin.</p>
    {:else}
      {#each _auditEntries as e (e.id)}
        <div class="control-panel-block" style="margin-bottom:8px">
          <p style="font-size:.78rem;color:#F5F5F5;margin:0 0 3px;font-family:'Quicksand',sans-serif"><strong>{e.action}</strong>{e.target ? ` — ${e.target}` : ''}</p>
          {#if e.detail}<p style="font-size:.72rem;color:rgba(245,245,245,.45);margin:0 0 4px;font-family:'Quicksand',sans-serif">{e.detail}</p>{/if}
          <p style="font-size:.66rem;color:rgba(245,245,245,.3);margin:0;font-family:'Quicksand',sans-serif">{e.actor_email} · {_fmtDateTime(e.created_at)}</p>
        </div>
      {/each}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <button disabled={_auditOffset === 0} on:click={() => { _auditOffset = Math.max(0, _auditOffset - AUDIT_PAGE); _loadAudit(); }}
          style="padding:7px 14px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#F5F5F5;
            cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.74rem;opacity:{_auditOffset === 0 ? .4 : 1}">Sebelumnya</button>
        <span style="font-size:.72rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">{_auditOffset + 1}-{Math.min(_auditOffset + AUDIT_PAGE, _auditTotal)} dari {_auditTotal}</span>
        <button disabled={_auditOffset + AUDIT_PAGE >= _auditTotal} on:click={() => { _auditOffset += AUDIT_PAGE; _loadAudit(); }}
          style="padding:7px 14px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#F5F5F5;
            cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.74rem;opacity:{_auditOffset + AUDIT_PAGE >= _auditTotal ? .4 : 1}">Selanjutnya</button>
      </div>
    {/if}
  {/if}
</div>

<!-- Announcement editor -->
{#if _annForm}
  <div style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px"
    on:click={() => { if (!_annSaving) _annForm = null; }}>
    <div style="width:100%;max-width:420px;max-height:88vh;overflow-y:auto;background:#1c1c1c;border-radius:18px;padding:22px 20px;border:1px solid rgba(255,255,255,.12)"
      on:click|stopPropagation>
      <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 16px;font-family:'Quicksand',sans-serif">{_annForm.id ? 'Edit' : 'Pengumuman Baru'}</p>

      <label class="control-form-label">Judul</label>
      <input bind:value={_annForm.title} class="control-form-input" maxlength="120" />

      <label class="control-form-label">Isi Pesan</label>
      <textarea bind:value={_annForm.body} class="control-form-input" style="min-height:100px;resize:vertical" maxlength="2000"></textarea>

      <label class="control-form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" bind:checked={_annForm.isActive} style="width:16px;height:16px" />
        Publish/aktif
      </label>

      <label class="control-form-label">Publish pada (opsional)</label>
      <input type="datetime-local" bind:value={_annForm.publishAt} class="control-form-input" />

      <label class="control-form-label">Expired pada (opsional)</label>
      <input type="datetime-local" bind:value={_annForm.expiresAt} class="control-form-input" />

      <div style="display:flex;gap:10px;margin-top:18px">
        <button disabled={_annSaving} on:click={() => _annForm = null}
          style="flex:1;padding:11px;border-radius:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);
            cursor:pointer;font-family:'Quicksand',sans-serif;font-size:.8rem;font-weight:700;color:rgba(245,245,245,.6)">Batal</button>
        <button disabled={_annSaving} on:click={_saveAnnouncement}
          style="flex:1;padding:11px;border-radius:10px;background:#FFFFFF;border:none;cursor:pointer;
            font-family:'Quicksand',sans-serif;font-size:.8rem;font-weight:700;color:#121212">
          {_annSaving ? '...' : 'Simpan'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Confirmation modal for dangerous actions -->
{#if _confirm}
  <div style="position:fixed;inset:0;z-index:110;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px"
    on:click={() => { if (!_confirmBusy) _confirm = null; }}>
    <div style="width:100%;max-width:320px;background:#1c1c1c;border-radius:18px;padding:24px 20px;border:1px solid rgba(255,100,100,.2)"
      on:click|stopPropagation>
      {#if _confirm.kind === 'maintenance'}
        <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 8px;font-family:'Quicksand',sans-serif">
          {_confirm.enable ? 'Aktifkan maintenance mode?' : 'Matikan maintenance mode?'}
        </p>
        <p style="font-size:.78rem;color:rgba(245,245,245,.45);margin:0 0 20px;line-height:1.5;font-family:'Quicksand',sans-serif">
          {_confirm.enable ? 'Semua user (kecuali admin) akan langsung diarahkan ke halaman maintenance.' : 'Website akan langsung kembali normal untuk semua user.'}
        </p>
        <div style="display:flex;gap:10px">
          <button disabled={_confirmBusy} on:click={() => _confirm = null} class="control-modal-cancel">Batal</button>
          <button disabled={_confirmBusy} on:click={() => _confirmMaintenance(_confirm.enable)} class="control-modal-danger">{_confirmBusy ? '...' : 'Ya, lanjutkan'}</button>
        </div>
      {:else if _confirm.kind === 'ban'}
        <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 8px;font-family:'Quicksand',sans-serif">Ban {_confirm.user.name || _confirm.user.email}?</p>
        <p style="font-size:.78rem;color:rgba(245,245,245,.45);margin:0 0 12px;line-height:1.5;font-family:'Quicksand',sans-serif">
          User tidak akan bisa melakukan aksi akun (like, playlist, riwayat, dll). Data mereka tidak dihapus.
        </p>
        <input bind:value={_confirm.reason} placeholder="Alasan (opsional)" class="control-form-input" style="margin-bottom:16px" />
        <div style="display:flex;gap:10px">
          <button disabled={_confirmBusy} on:click={() => _confirm = null} class="control-modal-cancel">Batal</button>
          <button disabled={_confirmBusy} on:click={() => _confirmBanAction(_confirm.user, 'ban', _confirm.reason)} class="control-modal-danger">{_confirmBusy ? '...' : 'Ban'}</button>
        </div>
      {:else if _confirm.kind === 'unban'}
        <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 8px;font-family:'Quicksand',sans-serif">Unban {_confirm.user.name || _confirm.user.email}?</p>
        <p style="font-size:.78rem;color:rgba(245,245,245,.45);margin:0 0 20px;line-height:1.5;font-family:'Quicksand',sans-serif">User akan bisa mengakses fitur akun lagi seperti biasa.</p>
        <div style="display:flex;gap:10px">
          <button disabled={_confirmBusy} on:click={() => _confirm = null} class="control-modal-cancel">Batal</button>
          <button disabled={_confirmBusy} on:click={() => _confirmBanAction(_confirm.user, 'unban')} class="control-modal-danger" style="background:rgba(124,255,158,.15);border-color:rgba(124,255,158,.3);color:#7CFF9E">{_confirmBusy ? '...' : 'Unban'}</button>
        </div>
      {:else if _confirm.kind === 'delete_announcement'}
        <p style="font-size:.92rem;font-weight:700;color:#F5F5F5;margin:0 0 8px;font-family:'Quicksand',sans-serif">Hapus "{_confirm.title}"?</p>
        <p style="font-size:.78rem;color:rgba(245,245,245,.45);margin:0 0 20px;line-height:1.5;font-family:'Quicksand',sans-serif">Tindakan ini tidak bisa dibatalkan.</p>
        <div style="display:flex;gap:10px">
          <button disabled={_confirmBusy} on:click={() => _confirm = null} class="control-modal-cancel">Batal</button>
          <button disabled={_confirmBusy} on:click={() => _confirmDeleteAnnouncement(_confirm.id)} class="control-modal-danger">{_confirmBusy ? '...' : 'Hapus'}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if _toast}
  <div style="position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1c1c1c;border:1px solid rgba(255,255,255,.15);
    padding:10px 18px;border-radius:20px;font-size:.78rem;color:#F5F5F5;font-family:'Quicksand',sans-serif;z-index:150;box-shadow:0 8px 24px rgba(0,0,0,.4)">
    {_toast}
  </div>
{/if}

<style>
  .control-card {
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 14px;
    padding: 14px 16px;
  }
  .control-card-label { font-size: .7rem; color: rgba(245,245,245,.45); margin: 0 0 4px; font-family: 'Quicksand', sans-serif; }
  .control-card-value { font-size: 1.3rem; font-weight: 700; color: #F5F5F5; margin: 0; font-family: 'Quicksand', sans-serif; }

  .control-panel-block {
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 14px;
    padding: 16px;
  }
  .control-block-title { font-size: .88rem; font-weight: 700; color: #F5F5F5; margin: 0 0 6px; font-family: 'Quicksand', sans-serif; }
  .control-block-desc { font-size: .76rem; color: rgba(245,245,245,.45); margin: 0; line-height: 1.5; font-family: 'Quicksand', sans-serif; }

  .control-form-label { display: block; font-size: .72rem; color: rgba(245,245,245,.5); margin: 12px 0 6px; font-family: 'Quicksand', sans-serif; }
  .control-form-input {
    width: 100%; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.15); color: #F5F5F5; font-family: 'Quicksand', sans-serif; font-size: .8rem;
  }
  .control-modal-cancel {
    flex: 1; padding: 11px; border-radius: 10px; background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.15); cursor: pointer; font-family: 'Quicksand', sans-serif;
    font-size: .8rem; font-weight: 700; color: rgba(245,245,245,.6);
  }
  .control-modal-danger {
    flex: 1; padding: 11px; border-radius: 10px; background: rgba(255,60,60,.15);
    border: 1px solid rgba(255,60,60,.3); cursor: pointer; font-family: 'Quicksand', sans-serif;
    font-size: .8rem; font-weight: 700; color: rgba(255,100,100,.9);
  }
</style>
