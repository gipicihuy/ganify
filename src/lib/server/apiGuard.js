import { getClientIp } from '$lib/server/activityMonitor.js';

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
  '/api/me'
];

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function isSameSiteRequest(event) {
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
    await kv.put(key, String(current + 1), { expirationTtl: 120 });
    return true;
  } catch (err) {
    console.error('[apiGuard] rate limit check failed', err?.message || err);
    return true;
  }
}

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function guardApiRequest(event) {
  const path = event.url.pathname;
  if (!path.startsWith('/api/') || PUBLIC_API_PATHS.has(path)) return null;

  if (!isSameSiteRequest(event)) {
    return jsonError(403, 'forbidden');
  }

  if (isRateLimited(path)) {
    const allowed = await checkRateLimit(event);
    if (!allowed) return jsonError(429, 'rate_limited');
  }

  return null;
}
