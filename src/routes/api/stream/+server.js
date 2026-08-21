/*
 * Fallback providers ported from a Node.js/axios script.
 * Original creator: febry.is-a.dev (GitHub: vandebry10-star)
 * Ported to Cloudflare Workers (fetch + node:crypto via nodejs_compat).
 * Do not remove the original creator's watermark, please respect the creator.
 */
import nodeCrypto from 'node:crypto';

const UA = 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36';
const KEY_HEX = 'C5D58EF67A7584E4A29F6C35BBC4EB12';

const CDNS = ['cdn405.savetube.vip', 'cdn403.savetube.vip', 'cdn401.savetube.vip'];
const ATTEMPT_TIMEOUT = 10000;

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function decryptSavetube(encryptedB64) {
  const raw = base64ToBytes(encryptedB64);
  const iv = raw.slice(0, 16);
  const data = raw.slice(16);
  const key = await crypto.subtle.importKey('raw', hexToBytes(KEY_HEX), { name: 'AES-CBC' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function fetchJsonWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Single CDN attempt (used inside Promise.allSettled below).
// Throws on any failure so allSettled can capture the reason for logging.
async function trySingleCdn(cdn, videoId, headers, fullUrl) {
  const infoJson = await fetchJsonWithTimeout(`https://${cdn}/v2/info`, {
    method: 'POST', headers, body: JSON.stringify({ url: fullUrl })
  }, ATTEMPT_TIMEOUT);

  const encryptedData = infoJson?.data;
  if (!encryptedData) throw new Error(`${cdn}: no data in /v2/info response`);

  const decrypted = await decryptSavetube(encryptedData);

  const dlJson = await fetchJsonWithTimeout(`https://${cdn}/download`, {
    method: 'POST', headers,
    body: JSON.stringify({ id: videoId, downloadType: 'audio', quality: '128', key: decrypted.key })
  }, ATTEMPT_TIMEOUT);

  const downloadUrl = dlJson?.data?.downloadUrl || dlJson?.downloadUrl;
  if (!downloadUrl) throw new Error(`${cdn}: no downloadUrl in /download response`);
  return downloadUrl;
}

async function savetube(videoId) {
  const headers = {
    'content-type': 'application/json',
    'origin': 'https://yt.savetube.me',
    'user-agent': UA
  };
  const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Race all CDNs in parallel instead of sequentially (old version could take
  // up to CDNS.length * 2 * ATTEMPT_TIMEOUT ≈ 60s worst case before failing).
  // Now total wait time is bounded by the slowest single attempt (~10s),
  // and one dead CDN doesn't block trying the others.
  const results = await Promise.allSettled(
    CDNS.map(cdn => trySingleCdn(cdn, videoId, headers, fullUrl))
  );

  const success = results.find((r) => r.status === 'fulfilled');
  if (success) return success.value;

  // All CDNs failed — log each reason so we can actually see why in
  // Cloudflare's Logs tab (Observability), instead of a silent {"error":"failed"}.
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[stream] CDN ${CDNS[i]} failed:`, r.reason?.message || r.reason);
    }
  });

  return null;
}

/* ============================================================
 * FALLBACK CHAIN — used only when savetube fails on all CDNs.
 * Ported from an axios/Node script to fetch() for Workers.
 * ============================================================ */

function spoofHeaders() {
  const ip = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
  const randomIp = ip();
  return { 'x-forwarded-for': randomIp, 'x-real-ip': randomIp, 'client-ip': randomIp };
}

const FALLBACK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0';

function baseFallbackHeaders() {
  return {
    'user-agent': FALLBACK_UA,
    accept: '*/*',
    'accept-language': 'en-GB,en;q=0.9,en-US;q=0.8',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    ...spoofHeaders()
  };
}

async function fetchJson(url, description, options = {}) {
  try {
    const headers = { ...baseFallbackHeaders(), ...(options.headers || {}) };
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    throw new Error(`[${description}] ${e.message || 'Request failed'}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Digs through an unknown response shape looking for a plausible audio
// download link. Third-party fallback APIs are undocumented and their
// field names drift over time, so this is intentionally generic rather
// than hardcoded per-provider — adjust the key list below if a given
// provider's shape doesn't get picked up.
const URL_KEY_HINTS = ['download', 'downloadurl', 'downloadurL', 'url', 'link', 'mp3', 'audio', 'dlink', 'dl'];
function findUrlInResult(obj, depth = 0) {
  if (!obj || depth > 4) return null;
  if (typeof obj === 'string') {
    return /^https?:\/\/\S+/.test(obj) ? obj : null;
  }
  if (typeof obj !== 'object') return null;

  for (const key of URL_KEY_HINTS) {
    const val = obj[key];
    if (typeof val === 'string' && val.startsWith('http')) return val;
  }
  for (const val of Object.values(obj)) {
    if (typeof val === 'object' && val) {
      const found = findUrlInResult(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function mp3dl(url) {
  const generateToken = () => {
    const payload = JSON.stringify({ timestamp: Date.now() });
    const key = Buffer.from('dyhQjAtqAyTIf3PdsKcJ6nMX1suz8ksZ');
    const cipher = nodeCrypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
    let encrypted = cipher.update(payload, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  };

  return await fetchJson('https://ds1.ezsrv.net/api/convert', 'MP3DL', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, quality: 128, trim: false, startT: 0, endT: 0, token: generateToken() }),
    method: 'POST'
  });
}

async function y2matenu(url) {
  return await fetchJson(`https://e.mnuu.nu/?_=${Math.random()}`, 'Y2mate.nu', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
    method: 'POST'
  });
}

async function ytmp3cc(url) {
  return await fetchJson(`https://e.ecoe.cc/?_=${Math.random()}`, 'Ytmp3.cc', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
    method: 'POST'
  });
}

async function ytmp3mobi(url, videoId) {
  const headers = { Referer: 'https://id.ytmp3.mobi/' };

  const { convertURL } = await fetchJson(
    `https://d.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=${Math.random()}`,
    'Init Ytmp3mobi',
    { headers }
  );

  const urlParam = { v: videoId, f: 'mp3', _: Math.random() };
  const { progressURL, downloadURL } = await fetchJson(
    `${convertURL}&${new URLSearchParams(urlParam).toString()}`,
    'Progress Ytmp3mobi',
    { headers }
  );

  let error, progress;
  let attempts = 0;
  while (progress !== 3 && attempts < 15) {
    ({ error, progress } = await fetchJson(progressURL, 'Status Ytmp3mobi', { headers }));
    if (error) throw new Error(`Ytmp3mobi Error: ${error}`);
    if (progress !== 3) {
      attempts++;
      await delay(2000);
    }
  }

  return { downloadURL };
}

async function ytmp3ing(url) {
  const initRes = await fetch('https://ytmp3.ing/', { headers: baseFallbackHeaders() });
  const html = await initRes.text();
  const cookie = initRes.headers.get('set-cookie') || '';
  const csrfmiddlewaretoken = html.match(/value="([^"]+)"/)?.[1];
  if (!csrfmiddlewaretoken) throw new Error('Gagal mendapatkan token CSRF.');

  const bodyData = `------WebKitFormBoundaryeByWolep\r\nContent-Disposition: form-data; name="url"\r\n\r\n${url}\r\n------WebKitFormBoundaryeByWolep--\r\n`;

  const res = await fetch('https://ytmp3.ing/audio', {
    method: 'POST',
    headers: {
      ...baseFallbackHeaders(),
      'content-type': 'multipart/form-data; boundary=----WebKitFormBoundaryeByWolep',
      'x-csrftoken': csrfmiddlewaretoken,
      cookie
    },
    body: bodyData
  });
  if (!res.ok) throw new Error(`Ytmp3ing HTTP ${res.status}`);
  const data = await res.json();

  let { url: downloadUrl } = data;
  if (downloadUrl) downloadUrl = atob(downloadUrl);
  return { url: downloadUrl };
}

async function hybridfallrye(videoId) {
  const infoJson = await fetchJson(
    `https://c01-h01.cdnframe.com/api/v4/info/${videoId}`,
    'Info Hybridfallrye'
  );
  const token = infoJson?.formats?.audio?.mp3?.[0]?.token;
  if (!token) throw new Error('Gagal mendapatkan token Hybridfallrye.');

  const convertJson = await fetchJson(
    'https://c01-h01.cdnframe.com/api/v4/convert',
    'Konversi Hybridfallrye',
    { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), method: 'POST' }
  );

  const { jobId } = convertJson;
  if (!jobId) throw new Error('Gagal mendapatkan ID pekerjaan.');

  let job = {};
  let attempts = 0;
  while (job.progress !== 100 && attempts < 15) {
    job = await fetchJson(
      `https://c01-h01.cdnframe.com/api/v4/status/${jobId}`,
      'Status Hybridfallrye',
      { headers: { 'content-type': 'application/json' } }
    );
    if (job.progress === 100 && job.status === 'active') throw new Error(`Konversi gagal: ${job.state}`);
    if (job.progress !== 100) {
      attempts++;
      await delay(3000);
    }
  }

  return { download: job.download };
}

// Providers ordered roughly by speed/reliability. Each is tried in sequence
// (not parallel) — the goal here is "eventually works" once savetube is
// already down, not lowest latency.
const FALLBACK_PROVIDERS = [
  { name: 'mp3dl', run: (fullUrl) => mp3dl(fullUrl) },
  { name: 'ytmp3cc', run: (fullUrl) => ytmp3cc(fullUrl) },
  { name: 'y2matenu', run: (fullUrl) => y2matenu(fullUrl) },
  { name: 'ytmp3mobi', run: (fullUrl, videoId) => ytmp3mobi(fullUrl, videoId) },
  { name: 'ytmp3ing', run: (fullUrl) => ytmp3ing(fullUrl) },
  { name: 'hybridfallrye', run: (fullUrl, videoId) => hybridfallrye(videoId) }
];

async function fallbackChain(videoId) {
  const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;

  for (const provider of FALLBACK_PROVIDERS) {
    try {
      const result = await provider.run(fullUrl, videoId);
      const downloadUrl = findUrlInResult(result);
      if (downloadUrl) return downloadUrl;
      console.error(`[stream] fallback ${provider.name}: no url found in result`, JSON.stringify(result));
    } catch (e) {
      console.error(`[stream] fallback ${provider.name} failed:`, e.message);
    }
  }
  return null;
}

export async function GET({ url }) {
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'no id' }), { status: 400 });

  try {
    let downloadUrl = await savetube(id);
    let source = 'savetube';

    if (!downloadUrl) {
      console.error(`[stream] savetube failed for id=${id}, trying fallback chain`);
      downloadUrl = await fallbackChain(id);
      source = 'fallback';
    }

    if (!downloadUrl) {
      console.error(`[stream] all providers (savetube + fallback) failed for id=${id}`);
      return new Response(JSON.stringify({ error: 'failed' }), { status: 500 });
    }

    return new Response(JSON.stringify({ url: downloadUrl, source }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(`[stream] unexpected error for id=${id}:`, e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
