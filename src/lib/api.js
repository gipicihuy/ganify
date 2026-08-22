const _SECRET = 'msc_s3cr3t_g1vy_2026';
const _ENC_KEY = async () => {
  const raw = new Uint8Array([0x4d,0x7a,0x9c,0x2e,0x1f,0x8b,0x3a,0x6d,0x0e,0x5c,0x9f,0x2b,0x7a,0x4e,0x1d,0x8c]);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, ['decrypt']);
};

const _b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function _decrypt(d, ivB64) {
  const key = await _ENC_KEY();
  const iv = _b64(ivB64);
  const data = _b64(d);
  const dec = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(dec));
}

async function _sign(ts, q) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}:${q}`));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const _CK = '_msc_urls';
const _TTL = 3 * 60 * 60 * 1000;

function _loadCache() {
  try {
    const r = localStorage.getItem(_CK);
    if (!r) return {};
    const p = JSON.parse(r);
    const now = Date.now();
    const clean = {};
    for (const id in p) { if (now - p[id].t < _TTL) clean[id] = p[id]; }
    return clean;
  } catch { return {}; }
}

function _saveCache(c) {
  try { localStorage.setItem(_CK, JSON.stringify(c)); } catch {}
}

const _mem = new Map();
const _searchMem = new Map();
const _searchInFlight = new Map();
// The "abort the previous query when a new one comes in" race below exists
// for a single typeahead input (the search page), where an older query is
// genuinely superseded by whatever the user typed next. That's only true
// for calls belonging to the same sequence, so the abort state is tracked
// per "group" instead of one global slot — otherwise two independent calls
// firing close together (e.g. the home page's mood query and artist query
// on mount) would cancel each other even though neither supersedes the
// other. Callers that don't pass a group share the default one, so the
// search page keeps its original cancel-on-supersede behavior unchanged.
const _activeAbortByGroup = new Map();
const _activeKeyByGroup = new Map();

function _normQ(q) {
  return String(q || '').trim().replace(/\s+/g, ' ');
}

export async function _g9(q, group = 'default') {
  const key = _normQ(q);
  if (_searchMem.has(key)) return _searchMem.get(key);
  // Same query already in flight (e.g. typing-debounce fired, then the user
  // picked a matching suggestion before it resolved) — reuse it instead of
  // firing a second identical request.
  if (_searchInFlight.has(key)) return _searchInFlight.get(key);

  // A different query in the SAME group is still in flight — the user has
  // moved on, so that request (and the 3 YT Music calls behind it) is now
  // wasted work. Abort it instead of letting it run to completion in the
  // background. Requests in other groups are left untouched since they're
  // unrelated, independent fetches.
  const activeAbort = _activeAbortByGroup.get(group);
  const activeKey = _activeKeyByGroup.get(group);
  if (activeAbort && activeKey !== key) {
    activeAbort.abort();
  }

  const controller = new AbortController();
  _activeAbortByGroup.set(group, controller);
  _activeKeyByGroup.set(group, key);

  const p = (async () => {
    try {
      const ts = Date.now();
      const sig = await _sign(ts, key);
      const r = await fetch(`/api/search?q=${encodeURIComponent(key)}&ts=${ts}&sig=${sig}`, { signal: controller.signal });
      const j = await r.json();
      if (!j.d || !j.iv) return { query: key, totalSongs: 0, songs: [], albums: [], playlists: [], artists: [] };
      const result = await _decrypt(j.d, j.iv);
      _searchMem.set(key, result);
      return result;
    } finally {
      _searchInFlight.delete(key);
      if (_activeKeyByGroup.get(group) === key) { _activeAbortByGroup.delete(group); _activeKeyByGroup.delete(group); }
    }
  })();

  _searchInFlight.set(key, p);
  return p;
}

export async function _getStreamUrl(videoId, title = '', artist = '') {
  if (_mem.has(videoId)) return _mem.get(videoId);
  const disk = _loadCache();
  if (disk[videoId]) { const url = disk[videoId].u; _mem.set(videoId, url); return url; }
  let q = `/api/stream?id=${encodeURIComponent(videoId)}`;
  if (title) q += `&title=${encodeURIComponent(title)}`;
  if (artist) q += `&artist=${encodeURIComponent(artist)}`;
  const r = await fetch(q);
  const j = await r.json();
  const url = j.url || null;
  if (url) { _mem.set(videoId, url); disk[videoId] = { u: url, t: Date.now() }; _saveCache(disk); }
  return url;
}

export async function _getAlbum(id) {
  const r = await fetch(`/api/album?id=${encodeURIComponent(id)}`);
  const j = await r.json();
  return j.status ? j.result : null;
}

export async function _getArtist(id) {
  const r = await fetch(`/api/artist?id=${encodeURIComponent(id)}`);
  const j = await r.json();
  return j.status ? j.result : null;
}

export async function _getLyrics(title, artist, duration) {
  let q = `/api/lyrics?title=${encodeURIComponent(title || '')}&artist=${encodeURIComponent(artist || '')}`;
  if (duration && isFinite(duration) && duration > 0) q += `&duration=${Math.round(duration)}`;
  const r = await fetch(q);
  const j = await r.json();
  return j.status ? j.result.lyrics : null;
}
