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

export async function GET({ url }) {
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'no id' }), { status: 400 });

  try {
    const downloadUrl = await savetube(id);
    if (!downloadUrl) {
      console.error(`[stream] all CDNs failed for id=${id}`);
      return new Response(JSON.stringify({ error: 'failed' }), { status: 500 });
    }
    return new Response(JSON.stringify({ url: downloadUrl }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(`[stream] unexpected error for id=${id}:`, e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
