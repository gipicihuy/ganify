import { getClientIp, runBackground } from '$lib/server/activityMonitor.js';

const PUBLIC_API_PATHS = new Set(['/api/telegram/webhook']);

const RATE_LIMITED_PREFIXES = [
  '/api/search',
  '/api/song',
  '/api/stream',
  '/api/download',
  '/api/lyrics',
  '/api/suggest',
  '/api/home',
  '/api/cover',
  '/api/album',
  '/api/artist',
  '/api/liked',
  '/api/history',
  '/api/playlists',
  '/api/me',
  '/api/announcements'
];

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function isWebViewRequest(event) {
  // Hybrid WebView langsung ke backend: WebView tetap load frontend dari
  // domain yang sama (same-origin), tapi jaga-jaga kalau WebView kirim
  // origin berbeda (file://, custom scheme) atau header khusus Android.
  const xrw = event.request.headers.get('x-requested-with') || '';
  const ua = event.request.headers.get('user-agent') || '';
  if (xrw === 'com.ganify.app' || xrw === 'com.ganify') return true;
  if (ua.includes('GanifyAndroid') || ua.includes('Ganify-Android')) return true;
  // Android WebView secara default kirim X-Requested-With = package name,
  // dan UA mengandung 'wv'. Jangan allow 'wv' generic tanpa package,
  // tapi kalau xrw sudah ada paket app kita di atas, sudah di-allow.
  return false;
}

function isSameSiteRequest(event) {
  if (isWebViewRequest(event)) return true;
  const secFetchSite = event.request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    return secFetchSite === 'same-origin' || secFetchSite === 'same-site' || secFetchSite === 'none';
  }
  const origin = event.request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host === event.url.host;
    } catch {
      return false;
    }
  }
  const referer = event.request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).host === event.url.host;
    } catch {
      return false;
    }
  }
  // No sec-fetch-site, origin, or referer at all: every real browser request
  // (navigation or fetch/XHR) sends at least one of these automatically, so
  // a request with none of them is almost certainly a script/curl/Postman
  // hitting the API directly rather than the app's own frontend. Previously
  // this fell through to `return true` (allowed), which meant simply not
  // sending those headers - the default for most non-browser HTTP clients -
  // bypassed this check entirely. Fail closed instead.
  return false;
}

function corsHeaders(origin) {
  // Hybrid: WebView fetch langsung ke backend harus lolos CORS. Kalau sudah
  // same-origin, browser/WebView tidak butuh CORS, tapi kalau WebView pakai
  // custom origin/file://, perlu allow. Kita reflect origin kalau ada,
  // fallback * untuk file:// / null.
  const allowOrigin = origin || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Range',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function isRateLimited(path) {
  return RATE_LIMITED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

async function checkRateLimit(event) {
  const kv = event.platform?.env?.ACTIVITY_KV;
  if (!kv) return true;
  const ip = getClientIp(event.request, event);
  const bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
  const key = `ratelimit:${ip}:${bucket}`;
  try {
    const current = Number((await kv.get(key)) || 0);
    if (current >= RATE_LIMIT_MAX) return false;
    // Tulis counter di background (KV put lambat) - jangan blok request.
    runBackground(event.platform, kv.put(key, String(current + 1), { expirationTtl: 120 }));
    return true;
  } catch (err) {
    console.error('[apiGuard] rate limit check failed', err?.message || err);
    return true;
  }
}

function jsonError(status, error, event) {
  const headers = { 'Content-Type': 'application/json' };
  if (event) {
    const origin = event.request.headers.get('origin');
    Object.assign(headers, corsHeaders(origin));
  }
  return new Response(JSON.stringify({ error }), {
    status,
    headers
  });
}

export async function guardApiRequest(event) {
  const path = event.url.pathname;
  if (!path.startsWith('/api/') || PUBLIC_API_PATHS.has(path)) return null;

  // CORS preflight: jangan block, balas langsung biar WebView/browser bisa lanjut.
  // Ini tetap same-origin safe karena preflight tidak bawa kredensial sensitif.
  if (event.request.method === 'OPTIONS') {
    const origin = event.request.headers.get('origin');
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (!isSameSiteRequest(event)) {
    return jsonError(403, 'forbidden', event);
  }

  if (isRateLimited(path)) {
    const allowed = await checkRateLimit(event);
    if (!allowed) return jsonError(429, 'rate_limited', event);
  }

  // Sisipkan header CORS untuk request WebView / cross-origin yang sah (same-site
  // request yang sudah lolos di atas). Untuk same-origin biasa header ini
  // di-ignore browser, jadi aman untuk web normal.
  // Return null = lanjut ke handler, tapi handler perlu forward header CORS.
  // Kita set via event.locals biar hook bisa pakai, atau handler bisa set sendiri.
  // Simpler: tidak return response, tapi biarkan request lanjut — CORS untuk
  // actual response akan di-set di hooks.server.js (attach). Untuk sekarang,
  // guard tidak memblokir WebView yang sah.
  return null;
}

export function applyCors(event, response) {
  if (!event.url.pathname.startsWith('/api/')) return response;
  const origin = event.request.headers.get('origin');
  const headers = new Headers(response.headers);
  const cors = corsHeaders(origin);
  for (const [k, v] of Object.entries(cors)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  // Caching masuk akal: search/home/suggest boleh di-cache sebentar biar
  // WebView tidak repeat request yang sama berulang kali.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
