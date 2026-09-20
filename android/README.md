# Ganify Android (WebView Hybrid)

Monorepo: `ganify/` = web (SvelteKit), `ganify/android/` = wrapper Android.

**Arsitektur:**
```
Android App (com.ganify.app)
 └─ WebView → https://ganify.my.id (frontend)
      ├─ fetch /api/search  → langsung ke backend (Worker/D1) — bukan proxy frontend
      ├─ fetch /api/song,/artist,/album,/lyrics,/home,/suggest → langsung
      ├─ /api/stream → return {url: googlevideo} → WebView audio play langsung
      └─ /api/download → Content-Disposition attachment → DownloadManager (tidak lewat JS blob)
```

**Prinsip hybrid terpenuhi:**
- Tidak ada backend baru khusus Android, pakai `/api/*` yang sudah ada
- DB/secret/API key tetap di server (HMAC, ENC_KEY, YT API tetap di Worker)
- Website tetap normal di browser (same-origin → CORS di-ignore)
- WebView request langsung ke backend dari device (bukan `WebView → hosting frontend → proxy → backend`)
- CORS sudah di-handle `apiGuard` + `hooks.server` (allow `X-Requested-With: com.ganify.app` + `GanifyAndroid` UA, handle OPTIONS, `Access-Control-Allow-Origin`)
- Cache: server `_searchMem` 60s + `_homeCache` + `cover 86400s`
- Streaming: `resolveAudioSource` → URL langsung, WebView `mediaPlaybackRequiresUserGesture=false`
- Download: `Content-Disposition: attachment; filename="..."` + forward `Range`/`Content-Range` biar resume, `DownloadListener` ke `DownloadManager`

**Build:**
```bash
cd android
./gradlew assembleDebug   # output: app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease # perlu signing config
```

**Test checklist:**
- [ ] Search → pindah tab → balik → hasil tetap (fix sudah di main)
- [ ] Play lagu → audio play tanpa tap kedua
- [ ] Download → muncul di Notification + folder Downloads (bukan blank)
- [ ] Background play → tidak ke-pause pas lock (WebView foreground)

**GitHub Actions (belum aktif, nanti tinggal centang workflows):**
`.github/workflows/android.yml` akan `assembleDebug` tiap push `main` dan upload APK artifact.
