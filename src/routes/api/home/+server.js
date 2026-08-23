import { getClientIp, isBlocked, notifyEvent, runBackground } from '$lib/server/activityMonitor.js';

// Endpoint ini narik home feed ASLI YT Music (browseId FEmusic_home) — bukan
// query pencarian bikinan sendiri. Ini persis sumber data yang dipakai app
// YT Music resmi buat render section-section macam "Quick picks" / trending
// carousel di beranda mereka, jadi hasilnya akurat mengikuti apa yang lagi
// "rame diputar" versi YT Music, bukan tebakan kita.

const SECRET = 'msc_s3cr3t_g1vy_2026';
const ENC_KEY_HEX = '4d7a9c2e1f8b3a6d0e5c9f2b7a4e1d8c';
const SIGN_TTL = 15000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function bytesToBase64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function verifyFingerprint(request) {
  const ua = request.headers.get('user-agent') || '';
  const sec = request.headers.get('sec-fetch-dest') || '';
  if (!ua || ua.toLowerCase().includes('curl') || ua.toLowerCase().includes('python') || ua.toLowerCase().includes('wget')) return false;
  if (sec && sec !== 'empty') return false;
  return true;
}
async function verifySignature(sig, ts, q) {
  const now = Date.now();
  if (Math.abs(now - parseInt(ts)) > SIGN_TTL) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  try {
    return await crypto.subtle.verify('HMAC', key, hexToBytes(sig), enc.encode(`${ts}:${q}`));
  } catch {
    return false;
  }
}
async function encrypt(data) {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', hexToBytes(ENC_KEY_HEX), { name: 'AES-CBC' }, false, ['encrypt']);
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, encoded);
  return { d: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

function findAllKeys(obj, key, results) {
  if (obj === null || typeof obj !== 'object') return;
  if (obj[key] !== undefined) results.push(obj[key]);
  Object.values(obj).forEach(v => findAllKeys(v, key, results));
}
function getRunsText(runs) { return Array.isArray(runs) ? runs.map(r => r.text || '').join('') : ''; }
function toHDThumbnail(url, videoId) {
  if (!url && videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (!url) return '';
  let hd = String(url);
  if (hd.includes('googleusercontent.com') || hd.includes('ggpht.com') || hd.includes('ytimg.com')) {
    if (/=w\d+-h\d+/i.test(hd)) hd = hd.replace(/=w\d+-h\d+[^?#]*/i, '=w800-h800-l90-rj');
    else if (/=s\d+/i.test(hd)) hd = hd.replace(/=s\d+[^?#]*/i, '=s800-c-k-c0x00ffffff-no-rj');
    else if (/=w\d+/i.test(hd)) hd = hd.replace(/=w\d+[^?#]*/i, '=w800-h800-l90-rj');
  }
  if (hd.includes('i.ytimg.com/vi/') || hd.includes('img.youtube.com/vi/')) {
    hd = hd.split('?')[0];
    hd = hd.replace(/(hqdefault|mqdefault|sddefault|default)\.jpg/i, 'hqdefault.jpg');
  }
  return hd;
}
function cleanTitle(title) {
  if (!title) return title;
  return title
    .replace(/[\(\[]\s*official\s+music\s+video\s*[\)\]]/gi, '(Official Music)')
    .replace(/[\(\[]\s*official\s+audio\s*[\)\]]/gi, '(Official Audio)')
    .replace(/[\(\[]\s*official\s+lyric[s]?\s+video\s*[\)\]]/gi, '(Official)')
    .replace(/[\(\[]\s*official\s+video\s*[\)\]]/gi, '(Official)')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchHome() {
  const r = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://music.youtube.com' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' } },
      browseId: 'FEmusic_home'
    })
  });
  return await r.json();
}

// Section-section di FEmusic_home dibungkus musicCarouselShelfRenderer, tiap
// isinya musicTwoRowItemRenderer (kartu lagu/album/artis dengan navigasi
// watchEndpoint utk lagu). Kita hanya ambil kartu yang punya videoId — itu
// yang benar-benar representasi "lagu", sama seperti yang muncul sebagai
// track-playable card di beranda YT Music asli.
function extractHomeSongs(data) {
  const sections = [];
  findAllKeys(data, 'musicCarouselShelfRenderer', sections);
  const out = [];
  for (const section of sections) {
    const items = section?.contents || [];
    for (const it of items) {
      const card = it?.musicTwoRowItemRenderer;
      if (!card) continue;
      const videoId = card?.navigationEndpoint?.watchEndpoint?.videoId
        || card?.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId
        || '';
      if (!videoId) continue;
      const title = cleanTitle(getRunsText(card.title?.runs));
      const subRuns = card.subtitle?.runs || [];
      let artist = '', artistId = '';
      for (const run of subRuns) {
        const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
        if (browseId.startsWith('UC') && !artist) { artist = run.text || ''; artistId = browseId; }
      }
      if (!artist) {
        const meaningful = subRuns.map(r => (r.text || '').trim()).filter(t => t && t !== '•' && t !== '·');
        artist = meaningful[0] || '';
      }
      const thumbs = card.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      const thumbnail = toHDThumbnail(thumbs.length ? thumbs[thumbs.length - 1].url : '', videoId);
      out.push({ title, videoId, thumbnail, author: artist, artist, artistId });
    }
  }
  return out;
}

function dedupeBy(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

const HOME_CACHE_TTL = 5 * 60 * 1000;
let _homeCache = null;
let _homeCacheTime = 0;

async function performHome() {
  if (_homeCache && Date.now() - _homeCacheTime < HOME_CACHE_TTL) return _homeCache;
  const data = await fetchHome();
  const songs = dedupeBy(extractHomeSongs(data), s => s.videoId);
  const result = { songs };
  _homeCache = result;
  _homeCacheTime = Date.now();
  return result;
}

export async function GET({ url, request, platform }) {
  const sig = url.searchParams.get('sig') || '';
  const ts = url.searchParams.get('ts') || '';
  const ip = getClientIp(request);

  if (await isBlocked(platform, ip)) {
    return new Response(JSON.stringify({ e: 1 }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  if (!verifyFingerprint(request)) {
    return new Response(JSON.stringify({ e: 1 }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  if (!(await verifySignature(sig, ts, '__home__'))) {
    return new Response(JSON.stringify({ e: 1 }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const result = await performHome();
    const payload = await encrypt(result);
    runBackground(platform, notifyEvent(platform, 'home', { ip, endpoint: 'GET /api/home', detail: {} }));
    return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ e: 1 }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
