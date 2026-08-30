<script>
  import { onMount } from 'svelte';

  let _open = false;
  let _loading = true;
  let _items = [];
  let _unread = 0;

  async function _load() {
    try {
      const res = await fetch('/api/announcements');
      const data = await res.json();
      _items = data.announcements || [];
      _unread = data.unreadCount || 0;
    } catch {
      _items = [];
      _unread = 0;
    } finally {
      _loading = false;
    }
  }

  onMount(_load);

  async function _toggle() {
    _open = !_open;
    if (_open && _unread > 0) {
      // Being shown in the open panel counts as "seen" - mark everything
      // currently listed as read, same as most notification bells.
      const toMark = _items.slice();
      _unread = 0;
      for (const item of toMark) {
        try {
          await fetch('/api/announcements/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.id })
          });
        } catch {}
      }
    }
  }

  function _fmtDate(ts) {
    if (!ts) return '';
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(ts));
  }

  function _handleClickOutside(node) {
    function onClick(e) {
      if (!node.contains(e.target)) _open = false;
    }
    document.addEventListener('click', onClick, true);
    return { destroy() { document.removeEventListener('click', onClick, true); } };
  }
</script>

<div style="position:relative" use:_handleClickOutside>
  <button
    on:click={_toggle}
    style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
      cursor:pointer;color:rgba(255,255,255,0.7);flex-shrink:0;transition:all .15s;position:relative"
    on:mouseenter={(e) => { e.currentTarget.style.background='rgba(255,255,255,0.18)'; e.currentTarget.style.color='#FFFFFF'; e.currentTarget.style.borderColor='rgba(255,255,255,0.4)'; }}
    on:mouseleave={(e) => { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.color='rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; }}
    aria-label="Notifikasi"
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

  {#if _open}
    <div style="position:absolute;top:48px;left:0;width:320px;max-width:82vw;max-height:70vh;overflow-y:auto;
      background:#1c1c1c;border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.5);z-index:80;padding:6px">
      <div style="padding:12px 14px 8px">
        <span style="font-size:.85rem;font-weight:700;color:#F5F5F5;font-family:'Quicksand',sans-serif">Notifikasi</span>
      </div>
      {#if _loading}
        <p style="padding:20px 14px;font-size:.78rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Memuat...</p>
      {:else if _items.length === 0}
        <p style="padding:20px 14px;font-size:.78rem;color:rgba(245,245,245,.4);font-family:'Quicksand',sans-serif">Belum ada pengumuman.</p>
      {:else}
        {#each _items as item (item.id)}
          <div style="padding:10px 14px;border-radius:10px;margin-bottom:2px">
            <p style="font-size:.8rem;font-weight:700;color:#F5F5F5;margin:0 0 4px;font-family:'Quicksand',sans-serif">{item.title}</p>
            <p style="font-size:.75rem;color:rgba(245,245,245,.55);margin:0 0 6px;line-height:1.5;white-space:pre-wrap;font-family:'Quicksand',sans-serif">{item.body}</p>
            <span style="font-size:.66rem;color:rgba(245,245,245,.3);font-family:'Quicksand',sans-serif">{_fmtDate(item.created_at)}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
