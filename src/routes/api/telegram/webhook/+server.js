import {
  answerCallbackQuery,
  blockIp,
  editMessageReplyMarkup,
  getHistory,
  isBlocked,
  sendTelegramMessage
} from '$lib/server/activityMonitor.js';

const TYPE_EMOJI = { search: '🔎', song: '🎵', lyrics: '📝' };
const TYPE_LABEL = { search: 'Search', song: 'Song', lyrics: 'Lyrics' };

function formatHistory(ip, history) {
  if (!history.length) {
    return `📊 *Aktivitas IP*\n> *IP:* \`${ip}\`\n\nBelum ada riwayat aktivitas tercatat untuk IP ini.`;
  }
  const lines = history.map((h) => {
    const emoji = TYPE_EMOJI[h.type] || '•';
    const label = TYPE_LABEL[h.type] || h.type;
    let desc = '';
    if (h.type === 'search') desc = h.detail?.query || '-';
    else desc = `${h.detail?.title || '-'} — ${h.detail?.artist || '-'}`;
    return `${emoji} *${label}* • \`${desc}\` • \`${h.time}\``;
  });
  return `📊 *Aktivitas IP*\n> *IP:* \`${ip}\`\n> *Total:* \`${history.length}\` event terakhir\n\n${lines.join('\n')}`;
}

/**
 * Verifikasi request benar-benar datang dari Telegram menggunakan secret
 * token yang di-set saat `setWebhook` (header X-Telegram-Bot-Api-Secret-Token).
 */
function isVerified(request, platform) {
  const expected = platform?.env?.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true; // tidak wajib, tapi sangat disarankan untuk di-set
  const got = request.headers.get('x-telegram-bot-api-secret-token');
  return got === expected;
}

export async function POST({ request, platform }) {
  if (!isVerified(request, platform)) {
    return new Response('forbidden', { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('ok');
  }

  const cq = update?.callback_query;
  if (!cq) return new Response('ok'); // event lain (message, dll) diabaikan

  const data = cq.data || '';
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const [action, ip] = data.split(':');

  try {
    if (action === 'activity' && ip) {
      const history = await getHistory(platform, ip);
      await answerCallbackQuery(platform, cq.id, 'Mengambil riwayat aktivitas…');
      await sendTelegramMessage(platform, formatHistory(ip, history));
    } else if (action === 'block' && ip) {
      await blockIp(platform, ip);
      await answerCallbackQuery(platform, cq.id, `IP ${ip} diblokir`);
      if (chatId && messageId) {
        await editMessageReplyMarkup(platform, chatId, messageId, {
          inline_keyboard: [
            [
              { text: '📊 Aktivitas IP', callback_data: `activity:${ip}` },
              { text: '✅ IP Diblokir', callback_data: 'noop' }
            ]
          ]
        });
      }
      await sendTelegramMessage(platform, `🚫 *IP Diblokir*\n> *IP:* \`${ip}\`\n\nRequest berikutnya dari IP ini akan ditolak otomatis.`);
    } else {
      await answerCallbackQuery(platform, cq.id, '');
    }
  } catch (e) {
    console.error('[telegram webhook] error:', e?.message || e);
    await answerCallbackQuery(platform, cq.id, 'Terjadi error, coba lagi.');
  }

  return new Response('ok');
}

export async function GET() {
  return new Response('Telegram webhook is alive. Use POST for updates.', { status: 200 });
}
