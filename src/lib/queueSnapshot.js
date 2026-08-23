const _QK = '_msc_queue_snap';

export function _saveQueueSnapshot(queue, index) {
  try {
    sessionStorage.setItem(_QK, JSON.stringify({ q: queue, i: index }));
  } catch {}
}

export function _loadQueueSnapshot() {
  try {
    const r = sessionStorage.getItem(_QK);
    if (!r) return null;
    const p = JSON.parse(r);
    if (!p || !Array.isArray(p.q) || !p.q.length) return null;
    const i = Number.isInteger(p.i) && p.i >= 0 && p.i < p.q.length ? p.i : 0;
    return { queue: p.q, index: i };
  } catch {
    return null;
  }
}
