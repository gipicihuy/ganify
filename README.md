# musictory
## Activity Monitoring + Notifikasi Telegram

Event penting (search, song playback, lyrics request) dicatat dan dikirim ke
Telegram. Endpoint yang tidak penting (asset, favicon, dll) tidak dikirim.

### Setup

1. Buat bot lewat [@BotFather](https://t.me/BotFather), ambil `TELEGRAM_BOT_TOKEN`.
2. Ambil `TELEGRAM_CHAT_ID` tujuan notifikasi (chat pribadi/grup/channel bot-mu).
3. **Dev lokal**: copy `.dev.vars.example` → `.dev.vars`, isi token & chat id
   (file ini sudah di-gitignore, aman dari commit).
4. **Production (Cloudflare)**:
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_CHAT_ID
   wrangler secret put TELEGRAM_WEBHOOK_SECRET   # opsional, disarankan
   ```
5. (Opsional, disarankan untuk production) Tambahkan KV namespace binding
   `ACTIVITY_KV` di `wrangler.toml` supaya blocklist IP & riwayat aktivitas
   persisten lintas restart worker:
   ```toml
   [[kv_namespaces]]
   binding = "ACTIVITY_KV"
   id = "isi-dengan-id-kv-namespace-kamu"
   ```
   Tanpa binding ini, fitur tetap jalan tapi memori-nya reset saat worker
   cold start / redeploy.
6. Daftarkan webhook Telegram (untuk tombol "📊 Aktivitas IP" / "🚫 Block IP"):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://domain-kamu.com/api/telegram/webhook" \
     -d "secret_token=<isi sama dengan TELEGRAM_WEBHOOK_SECRET>"
   ```

### Cara kerja singkat

- `src/lib/server/activityMonitor.js` — ambil real client IP dari header
  `CF-Connecting-IP` (bukan IP server Cloudflare), simpan riwayat per-IP,
  debounce pengiriman Telegram, dan kirim pesan Markdown.
- `src/routes/api/telegram/webhook/+server.js` — handle tombol inline
  Telegram (`activity:<ip>`, `block:<ip>`).
- IP yang di-block akan mendapat `403` di endpoint `/api/search`,
  `/api/stream`, dan `/api/lyrics`.
- Jika Telegram gagal/tidak dikonfigurasi, request utama tetap berjalan
  normal — hanya notifikasi yang di-skip (lihat log server untuk debug).