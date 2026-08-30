<script>
  import { onMount, onDestroy, tick } from 'svelte';

  let _open = false;
  let _loading = true;
  let _items = [];
  let _wrapEl;
  let _popoverEl;
  let _isMobile = false;
  // Posisi popover dihitung dari getBoundingClientRect() bell-nya sendiri
  // (fixed positioning), bukan absolute relatif ke parent flex row - parent
  // row-nya (logo, judul, bell, refresh, search) punya lebar konten yang
  // berubah-ubah, jadi absolute+left:0 gampang ke-dorong/numpuk ke kanan
  // tergantung isi row di kiri bell. Fixed+rect-based selalu ke-anchor pas
  // di bawah bell dan diklem biar gak overflow keluar viewport sama sekali.
  let _top = 0;
  let _left = 0;
  let _right = null;

  // Id-id notif yang udah "kelihatan" user di sesi buka-panel terakhir.
  // Dipakai buat bedain notif lama (auto jadi read pas panel dibuka) sama
  // notif baru yang nongol lewat polling selagi panel masih kebuka - yang
  // baru itu harus tetap unread sampai panel ditutup terus dibuka lagi.
  let _seenIds = new Set();
  let _pollTimer = null;

  $: _unread = _items.filter((i) => !i.isRead).length;
  $: _showGroups = _items.length > 6;
  $: _groups = _showGroups ? _groupByRecency(_items) : null;

  function _groupByRecency(items) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const today = [];
    const earlier = [];
    for (const it of items) {
      (it.created_at >= todayStart ? today : earlier).push(it);
    }
    const groups = [];
    if (today.length) groups.push({ label: 'Hari ini', items: today });
    if (earlier.length) groups.push({ label: 'Sebelumnya', items: earlier });
    return groups;
  }

  async function _load() {
    try {
      const res = await fetch('/api/announcements');
      const data = await res.json();
      const fresh = data.announcements || [];
      // Item yang udah pernah "dilihat" (dari sesi buka panel sebelumnya)
      // selalu dianggap read. Item baru yang belum pernah dilihat ngikut
      // status read dari server (biasanya unread, kecuali dibuka dari tab lain).
      _items = fresh.map((a) => (_seenIds.has(a.id) ? { ...a, isRead: true } : a));
    } catch {
      _items = [];
    } finally {
      _loading = false;
    }
  }

  onMount(_load);

  function _startPolling() {
    _stopPolling();
    _pollTimer = setInterval(_load, 20000);
  }

  function _stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  async function _markExistingAsRead() {
    const unreadIds = _items.filter((i) => !i.isRead).map((i) => i.id);
    _seenIds = new Set([..._seenIds, ..._items.map((i) => i.id)]);
    if (!unreadIds.length) return;
    // Optimistic: langsung ilangin semua indicator unread yang lagi
    // kelihatan di panel, gak perlu diklik satu-satu.
    _items = _items.map((i) => (unreadIds.includes(i.id) ? { ...i, isRead: true } : i));
    try {
      await fetch('/api/announcements/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds })
      });
    } catch {
      console.error('Gagal menandai notifikasi sebagai dibaca');
    }
  }

  function _computePosition() {
    if (!_wrapEl) return;
    const rect = _wrapEl.getBoundingClientRect();
    const vw = window.innerWidth;
    _isMobile = vw < 480;
    _top = rect.bottom + 10;
    if (_isMobile) {
      _left = 16;
      _right = 16;
    } else {
      const width = 340;
      // Anchor ke sisi kanan bell (pola dropdown standar), lalu diklem biar
      // gak pernah nabrak tepi kiri/kanan viewport.
      let left = rect.right - width;
      left = Math.max(16, Math.min(left, vw - width - 16));
      _left = left;
      _right = null;
    }
  }

  async function _toggle() {
    _open = !_open;
    if (_open) {
      await tick();
      _computePosition();
      await _markExistingAsRead();
      _startPolling();
    } else {
      _stopPolling();
    }
  }

  function _close() {
    _open = false;
    _stopPolling();
  }

  async function _openItem(item) {
    if (item.isRead) return;
    // Optimistic: state lokal langsung update biar dot unread-nya hilang
    // seketika saat diklik, gak nunggu round-trip network.
    _items = _items.map((i) => (i.id === item.id ? { ...i, isRead: true } : i));
    _seenIds.add(item.id);
    try {
      await fetch('/api/announcements/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id })
      });
    } catch {
      // Gagal sync ke server bukan hal fatal buat UX - biarkan tetap
      // "terbaca" secara lokal, cukup dicatat buat debugging.
      console.error('Gagal menandai notifikasi sebagai dibaca');
    }
  }

  // Relative time yang beneran ngikutin timestamp asli, bukan hardcode.
  // Ambang "cukup lama" dipatok 7 hari - di bawah itu selalu relative,
  // di atas itu baru pakai tanggal absolut (+tahun kalau beda tahun).
  function _timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const minute = 60_000, hour = 3_600_000, day = 86_400_000;
    if (diff < minute) return 'Baru saja';
    if (diff < hour) {
      const m = Math.floor(diff / minute);
      return `${m} menit yang lalu`;
    }
    if (diff < day) {
      const h = Math.floor(diff / hour);
      return `${h} jam yang lalu`;
    }
    const days = Math.floor(diff / day);
    if (days === 1) return 'Kemarin';
    if (days < 7) return `${days} hari yang lalu`;
    const now = new Date();
    const then = new Date(ts);
    const sameYear = now.getFullYear() === then.getFullYear();
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: sameYear ? undefined : 'numeric'
    }).format(then);
  }

  function _handleClickOutside(node) {
    function onClick(e) {
      if (!node.contains(e.target) && !(_popoverEl && _popoverEl.contains(e.target))) _close();
    }
    document.addEventListener('click', onClick, true);
    return { destroy() { document.removeEventListener('click', onClick, true); } };
  }

  function _onWindowChange() {
    if (_open) _computePosition();
  }

  onMount(() => {
    window.addEventListener('resize', _onWindowChange);
    window.addEventListener('scroll', _onWindowChange, true);
  });
  onDestroy(() => {
    _stopPolling();
    if (typeof window === 'undefined') return;
    window.removeEventListener('resize', _onWindowChange);
    window.removeEventListener('scroll', _onWindowChange, true);
  });
</script>

<div style="position:relative" bind:this={_wrapEl} use:_handleClickOutside>
  <button
    on:click={_toggle}
    style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
      cursor:pointer;color:rgba(255,255,255,0.7);flex-shrink:0;transition:all .15s;position:relative"
    on:mouseenter={(e) => { e.currentTarget.style.background='rgba(255,255,255,0.18)'; e.currentTarget.style.color='#FFFFFF'; e.currentTarget.style.borderColor='rgba(255,255,255,0.4)'; }}
    on:mouseleave={(e) => { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.color='rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; }}
    aria-label="Notifikasi"
    aria-expanded={_open}
  >
    <svg width="17" height="17" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
    </svg>
    {#if _unread > 0}
      <span style="position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;
        background:#FF4444;color:#fff;font-size:.62rem;font-weight:700;display:flex;align-items:center;justify-content:center;
        font-family:'Quicksand',sans-serif;border:1.5px solid #121212">{_unread > 9 ? '9+' : _unread}</span>
    {/if}
  </button>
</div>

{#if _open}
  <div
    class="notif-popover"
    bind:this={_popoverEl}
    style="top:{_top}px; left:{_left}px; {_right !== null ? `right:${_right}px; width:auto;` : 'width:340px;'}"
    role="dialog"
    aria-label="Notifikasi"
  >
    <div class="notif-header">
      <span class="notif-header-title">Notifikasi</span>
      {#if _unread > 0}
        <span class="notif-header-count">{_unread} baru</span>
      {/if}
    </div>

    <div class="notif-list">
      {#if _loading}
        <div class="notif-empty">
          <div class="notif-empty-spin"></div>
          <p>Memuat notifikasi...</p>
        </div>
      {:else if _items.length === 0}
        <div class="notif-empty">
          <svg width="30" height="30" fill="none" stroke="rgba(245,245,245,.35)" stroke-width="1.6" viewBox="0 0 24 24">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
          <p>Belum ada notifikasi</p>
          <span>Pengumuman dan info terbaru bakal muncul di sini.</span>
        </div>
      {:else if _showGroups}
        {#each _groups as group (group.label)}
          <div class="notif-group-label">{group.label}</div>
          {#each group.items as item (item.id)}
            <button type="button" class="notif-item" class:is-unread={!item.isRead} on:click={() => _openItem(item)}>
              <span class="notif-dot" aria-hidden={item.isRead}></span>
              <span class="notif-body">
                <span class="notif-title">{item.title}</span>
                <span class="notif-text">{item.body}</span>
                <span class="notif-time">{_timeAgo(item.created_at)}</span>
              </span>
            </button>
          {/each}
        {/each}
      {:else}
        {#each _items as item (item.id)}
          <button type="button" class="notif-item" class:is-unread={!item.isRead} on:click={() => _openItem(item)}>
            <span class="notif-dot" aria-hidden={item.isRead}></span>
            <span class="notif-body">
              <span class="notif-title">{item.title}</span>
              <span class="notif-text">{item.body}</span>
              <span class="notif-time">{_timeAgo(item.created_at)}</span>
            </span>
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .notif-popover {
    position: fixed;
    z-index: 200;
    max-width: calc(100vw - 32px);
    max-height: min(70vh, 440px);
    display: flex;
    flex-direction: column;
    background: var(--bg-card, #1c1c1c);
    border: 1px solid var(--border, rgba(255,255,255,.12));
    border-radius: 18px;
    box-shadow: 0 20px 48px rgba(0,0,0,.55), var(--shadow-flat, 0 4px 16px rgba(0,0,0,.45));
    overflow: hidden;
    animation: notifPopIn .2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    transform-origin: top right;
  }

  @keyframes notifPopIn {
    from { opacity: 0; transform: scale(0.96) translateY(-4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .notif-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--border, rgba(255,255,255,.1));
  }
  .notif-header-title {
    font-size: .88rem;
    font-weight: 700;
    color: #F5F5F5;
  }
  .notif-header-count {
    font-size: .66rem;
    font-weight: 700;
    color: rgba(245,245,245,.55);
    background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.12);
    padding: 2px 8px;
    border-radius: 99px;
  }

  .notif-list {
    overflow-y: auto;
    padding: 6px;
  }

  .notif-group-label {
    padding: 10px 10px 4px;
    font-size: .64rem;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: rgba(245,245,245,.32);
  }
  .notif-group-label:first-child { padding-top: 6px; }

  .notif-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    padding: 10px 10px;
    border-radius: 12px;
    transition: background-color .15s ease;
  }
  .notif-item:hover { background: rgba(255,255,255,.05); }
  .notif-item:active { background: rgba(255,255,255,.08); }
  .notif-item + .notif-item { margin-top: 2px; }

  .notif-dot {
    flex-shrink: 0;
    margin-top: 6px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #FFFFFF;
  }
  .notif-dot[aria-hidden="true"] { background: transparent; }

  .notif-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .notif-title {
    font-size: .8rem;
    font-weight: 700;
    color: #F5F5F5;
    line-height: 1.35;
  }
  .notif-text {
    font-size: .74rem;
    color: rgba(245,245,245,.6);
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  .notif-time {
    font-size: .65rem;
    color: rgba(245,245,245,.35);
    margin-top: 2px;
  }

  /* Notif yang sudah dibaca: tetap kebaca jelas, cuma sedikit lebih
     subdued dibanding yang unread - bukan di-dim habis-habisan. */
  .notif-item:not(.is-unread) .notif-title { color: rgba(245,245,245,.72); font-weight: 600; }
  .notif-item:not(.is-unread) .notif-text { color: rgba(245,245,245,.45); }

  .notif-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    padding: 34px 20px 30px;
  }
  .notif-empty p {
    font-size: .8rem;
    font-weight: 600;
    color: rgba(245,245,245,.55);
    margin: 4px 0 0;
  }
  .notif-empty span {
    font-size: .72rem;
    color: rgba(245,245,245,.35);
    max-width: 220px;
    line-height: 1.5;
  }
  .notif-empty-spin {
    width: 20px; height: 20px; border-radius: 50%;
    border: 2.5px solid rgba(255,255,255,.15);
    border-top-color: rgba(255,255,255,.6);
    animation: notifSpin .7s linear infinite;
  }
  @keyframes notifSpin { to { transform: rotate(360deg); } }
</style>
