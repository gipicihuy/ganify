/**
 * Activity monitoring + Telegram notification untuk Ganify.
 *
 * ENV VARS (jangan hardcode — set via `wrangler secret put <NAME>` di
 * production, atau file `.dev.vars` (sudah di-gitignore) untuk dev lokal):
 *
 *   TELEGRAM_BOT_TOKEN       - token bot dari @BotFather
 *   TELEGRAM_CHAT_ID         - chat id / channel id tujuan notifikasi
 *   TELEGRAM_WEBHOOK_SECRET  - (opsional, disarankan) secret token untuk
 *                              verifikasi request webhook dari Telegram
 *
 * OPTIONAL BINDING
 *   ACTIVITY_KV - KV namespace Cloudflare. Kalau di-bind, blocklist IP dan
 *   riwayat aktivitas per-IP akan persist lintas restart/cold start worker.
 *   Tanpa ini, semua tetap jalan tapi hanya bertahan selama isolate worker
 *   yang sedang aktif (cukup untuk dev/traffic kecil, tidak terjamin
 *   persisten di production tanpa KV).
 */

const HISTORY_LIMIT = 20; // jumlah event yang disimpan per IP
const MAX_TRACKED_IPS = 500; // batas memori untuk mode in-memory
const DEFAULT_DEBOUNCE_MS = 8000; // jangan kirim event identik dalam window ini
const TIMEZONE = 'Asia/Jakarta';

// ---------------- in-memory fallback state (module-scope per isolate) ----------------
const _blockedIps = new Set();
const _history = new Map(); // ip -> [{type, detail, endpoint, time}, ...] (terbaru duluan)
const _ipOrder = []; // urutan pemakaian untuk eviction sederhana
const _debounceLast = new Map(); // debounceKey -> timestamp terakhir terkirim

function _touchIpOrder(ip) {
  const idx = _ipOrder.indexOf(ip);
  if (idx !== -1) _ipOrder.splice(idx, 1);
  _ipOrder.push(ip);
  while (_ipOrder.length > MAX_TRACKED_IPS) {
    const evict = _ipOrder.shift();
    _history.delete(evict);
  }
}

// ---------------- helpers ----------------

/** Ambil real client IP di belakang Cloudflare, bukan IP server Cloudflare. */
export function getClientIp(request, event) {
  const h = request.headers;
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const trueClient = h.get('true-client-ip'); // Cloudflare Enterprise header
  if (trueClient) return trueClient.trim();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  try {
    return event?.getClientAddress?.() || 'unknown';
  } catch {
    return 'unknown';
  }
}

function formatTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIMEZONE
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} WIB`;
}

/** Escape karakter yang bisa merusak parsing Markdown legacy di dalam code span. */
function mdCode(text, maxLen = 200) {
  let s = String(text ?? '-').trim();
  if (!s) s = '-';
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  s = s.replace(/\\/g, '\\\\').replace(/`/g, '´');
  return `\`${s}\``;
}

function env(platform) {
  return platform?.env || {};
}

function kv(platform) {
  return env(platform).ACTIVITY_KV || null;
}

/** Jalankan promise di background tanpa memblokir/mempengaruhi response utama. */
export function runBackground(platform, promise) {
  const safe = Promise.resolve(promise).catch((e) => {
    console.error('[activityMonitor] background task error:', e?.message || e);
  });
  const ctx = platform?.context;
  if (ctx?.waitUntil) ctx.waitUntil(safe);
  return safe;
}

// ---------------- blocklist ----------------

export async function isBlocked(platform, ip) {
  if (!ip || ip === 'unknown') return false;
  const store = kv(platform);
  if (store) {
    try {
      const v = await store.get(`block:${ip}`);
      return v !== null;
    } catch (e) {
      console.error('[activityMonitor] KV isBlocked error:', e?.message || e);
      return _blockedIps.has(ip);
    }
  }
  return _blockedIps.has(ip);
}

export async function blockIp(platform, ip) {
  if (!ip || ip === 'unknown') return false;
  _blockedIps.add(ip);
  const store = kv(platform);
  if (store) {
    try {
      await store.put(`block:${ip}`, String(Date.now()));
    } catch (e) {
      console.error('[activityMonitor] KV blockIp error:', e?.message || e);
    }
  }
  return true;
}

export async function unblockIp(platform, ip) {
  if (!ip || ip === 'unknown') return false;
  _blockedIps.delete(ip);
  const store = kv(platform);
  if (store) {
    try {
      await store.delete(`block:${ip}`);
    } catch (e) {
      console.error('[activityMonitor] KV unblockIp error:', e?.message || e);
    }
  }
  return true;
}

// ---------------- history ----------------

async function recordHistory(platform, ip, entry) {
  const store = kv(platform);
  if (store) {
    try {
      const raw = await store.get(`hist:${ip}`);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(entry);
      while (list.length > HISTORY_LIMIT) list.pop();
      await store.put(`hist:${ip}`, JSON.stringify(list), { expirationTtl: 60 * 60 * 24 * 30 });
      return;
    } catch (e) {
      console.error('[activityMonitor] KV recordHistory error:', e?.message || e);
      // fall through to in-memory as a backup
    }
  }
  _touchIpOrder(ip);
  const list = _history.get(ip) || [];
  list.unshift(entry);
  while (list.length > HISTORY_LIMIT) list.pop();
  _history.set(ip, list);
}

export async function getHistory(platform, ip) {
  const store = kv(platform);
  if (store) {
    try {
      const raw = await store.get(`hist:${ip}`);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error('[activityMonitor] KV getHistory error:', e?.message || e);
    }
  }
  return _history.get(ip) || [];
}

// ---------------- debounce ----------------

function shouldSend(key, debounceMs) {
  const now = Date.now();
  const last = _debounceLast.get(key) || 0;
  if (now - last < debounceMs) return false;
  _debounceLast.set(key, now);
  // rapihkan map biar tidak tumbuh tanpa batas
  if (_debounceLast.size > 2000) {
    const cutoff = now - debounceMs * 4;
    for (const [k, t] of _debounceLast) if (t < cutoff) _debounceLast.delete(k);
  }
  return true;
}

// ---------------- Telegram ----------------

async function callTelegram(platform, method, body) {
  const { TELEGRAM_BOT_TOKEN } = env(platform);
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[activityMonitor] TELEGRAM_BOT_TOKEN belum di-set, notifikasi dilewati.');
    return null;
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.ok === false) {
    console.error('[activityMonitor] Telegram API error:', json?.description || res.status);
  }
  return json;
}

export async function sendTelegramMessage(platform, text, { replyMarkup } = {}) {
  const { TELEGRAM_CHAT_ID } = env(platform);
  if (!TELEGRAM_CHAT_ID) {
    console.warn('[activityMonitor] TELEGRAM_CHAT_ID belum di-set, notifikasi dilewati.');
    return null;
  }
  try {
    return await callTelegram(platform, 'sendMessage', {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: replyMarkup
    });
  } catch (e) {
    // Kegagalan Telegram TIDAK BOLEH mempengaruhi request utama.
    console.error('[activityMonitor] gagal kirim Telegram:', e?.message || e);
    return null;
  }
}

export async function notifyGoogleLogin(platform, { name, email, avatarUrl, ip }) {
  const time = formatTime();
  const caption =
    `🔐 *New Google Sign-In*\n` +
    `> *Name:* ${mdCode(name)}\n` +
    `> *Email:* ${mdCode(email)}\n` +
    `> *IP:* ${mdCode(ip)}\n` +
    `> *Time:* ${mdCode(time)}`;
  const { TELEGRAM_CHAT_ID } = env(platform);
  if (!TELEGRAM_CHAT_ID) {
    console.warn('[activityMonitor] TELEGRAM_CHAT_ID belum di-set, notifikasi dilewati.');
    return null;
  }
  if (avatarUrl) {
    const res = await callTelegram(platform, 'sendPhoto', {
      chat_id: TELEGRAM_CHAT_ID,
      photo: avatarUrl,
      caption,
      parse_mode: 'Markdown'
    });
    if (res?.ok) return res;
  }
  return sendTelegramMessage(platform, caption);
}

export async function answerCallbackQuery(platform, callbackQueryId, text) {
  try {
    await callTelegram(platform, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false
    });
  } catch (e) {
    console.error('[activityMonitor] gagal answerCallbackQuery:', e?.message || e);
  }
}

export async function editMessageReplyMarkup(platform, chatId, messageId, replyMarkup) {
  try {
    await callTelegram(platform, 'editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup
    });
  } catch (e) {
    console.error('[activityMonitor] gagal editMessageReplyMarkup:', e?.message || e);
  }
}

function ipButtons(ip) {
  return {
    inline_keyboard: [
      [
        { text: '📊 Aktivitas IP', callback_data: `activity:${ip}` },
        { text: '🚫 Block IP', callback_data: `block:${ip}` }
      ]
    ]
  };
}

const TEMPLATES = {
  search: ({ query, ip, time, endpoint }) =>
    `🔎 *New Search*\n` +
    `> *Query:* ${mdCode(query)}\n` +
    `> *IP:* ${mdCode(ip)}\n` +
    `> *Time:* ${mdCode(time)}` +
    (endpoint ? `\n> *Endpoint:* ${mdCode(endpoint)}` : ''),
  song: ({ title, artist, ip, time, endpoint }) =>
    `🎵 *New Song Playback*\n` +
    `> *Title:* ${mdCode(title)}\n` +
    `> *Artist:* ${mdCode(artist)}\n` +
    `> *IP:* ${mdCode(ip)}\n` +
    `> *Time:* ${mdCode(time)}` +
    (endpoint ? `\n> *Endpoint:* ${mdCode(endpoint)}` : ''),
  lyrics: ({ title, artist, ip, time, endpoint }) =>
    `📝 *Lyrics Request*\n` +
    `> *Title:* ${mdCode(title)}\n` +
    `> *Artist:* ${mdCode(artist)}\n` +
    `> *IP:* ${mdCode(ip)}\n` +
    `> *Time:* ${mdCode(time)}` +
    (endpoint ? `\n> *Endpoint:* ${mdCode(endpoint)}` : '')
};

/**
 * Catat + kirim notifikasi untuk satu event penting.
 * @param {object} platform - SvelteKit `platform` (berisi env & context.waitUntil)
 * @param {'search'|'song'|'lyrics'} type
 * @param {{ip:string, detail:object, endpoint?:string}} opts
 */
export async function notifyEvent(platform, type, { ip, detail = {}, endpoint }) {
  const time = formatTime();
  const entry = { type, detail, endpoint, time, ts: Date.now() };

  // Riwayat dicatat setiap kali (dipakai tombol "📊 Aktivitas IP"),
  // terlepas dari apakah notifikasi Telegram-nya di-debounce atau tidak.
  await recordHistory(platform, ip, entry).catch((e) =>
    console.error('[activityMonitor] recordHistory error:', e?.message || e)
  );

  const debounceMs = Number(env(platform).ACTIVITY_DEBOUNCE_MS) || DEFAULT_DEBOUNCE_MS;
  const debounceKey = `${type}:${ip}:${JSON.stringify(detail)}`;
  if (!shouldSend(debounceKey, debounceMs)) return; // event sama, baru saja dikirim -> skip biar tidak spam

  const buildText = TEMPLATES[type];
  if (!buildText) return;
  const text = buildText({ ...detail, ip, time, endpoint });

  await sendTelegramMessage(platform, text, { replyMarkup: ipButtons(ip) });
}

export { formatTime, mdCode };
