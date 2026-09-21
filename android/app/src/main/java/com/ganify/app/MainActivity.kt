package com.ganify.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import android.content.Intent
import android.provider.Settings
import androidx.appcompat.app.AlertDialog
import androidx.core.app.NotificationManagerCompat
import androidx.media3.common.PlaybackException
import android.Manifest
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.CookieManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var mediaController: MediaController? = null
    private var controllerFuture: ListenableFuture<MediaController>? = null

    private val frontendUrl = "https://ganify.my.id"
    private val tag = "Ganify"

    // Kalau JS minta play sebelum MediaController selesai connect, antre dulu.
    private var pendingPlay: (() -> Unit)? = null

    // MediaController hanya boleh disentuh dari main thread, sedangkan @JavascriptInterface
    // jalan di thread lain. Jadi posisi/durasi/status di-poll di main thread lalu di-cache.
    private val uiHandler = Handler(Looper.getMainLooper())
    @Volatile private var cachedPosition = 0L
    @Volatile private var cachedDuration = 0L
    @Volatile private var cachedPlaying = false
    private val statePoller = object : Runnable {
        override fun run() {
            mediaController?.let { c ->
                cachedPosition = c.currentPosition
                cachedDuration = if (c.duration < 0) 0L else c.duration
                cachedPlaying = c.isPlaying
            }
            uiHandler.postDelayed(this, 500)
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface fun play(url: String, title: String, artist: String) {
            runOnUiThread { playNative(url, title, artist, null) }
        }
        @JavascriptInterface fun playWithArt(url: String, title: String, artist: String, artwork: String) {
            runOnUiThread { playNative(url, title, artist, artwork) }
        }
        @JavascriptInterface fun pause() { runOnUiThread { mediaController?.pause() } }
        @JavascriptInterface fun resume() { runOnUiThread { mediaController?.play() } }
        @JavascriptInterface fun seekTo(ms: Long) {
            cachedPosition = ms
            runOnUiThread { mediaController?.seekTo(ms) }
        }
        @JavascriptInterface fun getPosition(): Long = cachedPosition
        @JavascriptInterface fun getDuration(): Long = cachedDuration
        @JavascriptInterface fun isPlaying(): Boolean = cachedPlaying
        @JavascriptInterface fun isNative(): Boolean = true
    }

    private fun playNative(url: String, title: String, artist: String, artwork: String?) {
        val controller = mediaController
        if (controller == null) {
            Log.w(tag, "MediaController belum siap, antre playback")
            pendingPlay = { playNative(url, title, artist, artwork) }
            return
        }
        val metadata = androidx.media3.common.MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
        if (!artwork.isNullOrBlank()) {
            metadata.setArtworkUri(Uri.parse(artwork))
        }
        val mediaItem = MediaItem.Builder()
            .setUri(url)
            .setMediaMetadata(metadata.build())
            .build()
        controller.setMediaItem(mediaItem)
        controller.prepare()
        controller.play()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        ensureNotificationPermission()
        startPlaybackService()
        uiHandler.post(statePoller)

        webView = findViewById(R.id.webview)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = userAgentString + " GanifyAndroid/1.0"
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(AndroidBridge(), "AndroidPlayer")

        try {
            val token = SessionToken(this, ComponentName(this, MusicService::class.java))
            controllerFuture = MediaController.Builder(this, token).buildAsync()
            controllerFuture?.addListener({
                try {
                    mediaController = controllerFuture?.get()
                    pendingPlay?.let { task -> pendingPlay = null; task() }
                    mediaController?.addListener(object : Player.Listener {
                        override fun onPlaybackStateChanged(state: Int) {
                            if (state == Player.STATE_ENDED) {
                                webView.post { webView.evaluateJavascript("window.__nativeNext && window.__nativeNext()", null) }
                            }
                        }
                        override fun onPlayerError(error: PlaybackException) {
                            Log.e(tag, "Playback error: ${error.errorCodeName}", error)
                            Toast.makeText(this@MainActivity, "Gagal memutar (${error.errorCodeName})", Toast.LENGTH_LONG).show()
                            webView.post { webView.evaluateJavascript("window.__nativePlaying && window.__nativePlaying(false)", null) }
                        }
                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            webView.post { webView.evaluateJavascript("window.__nativePlaying && window.__nativePlaying($isPlaying)", null) }
                        }
                    })
                } catch (e: Exception) {
                    Log.e(tag, "MediaController gagal connect", e)
                    Toast.makeText(this, "Player native gagal connect: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }, ContextCompat.getMainExecutor(this))
        } catch (e: Exception) {
            Log.e(tag, "SessionToken gagal dibuat", e)
            Toast.makeText(this, "Player native gagal dibuat: ${e.message}", Toast.LENGTH_LONG).show()
        }

        // Tombol next/prev di notifikasi & lockscreen -> antrean di JS
        MusicService.onSkipNext = {
            runOnUiThread { webView.evaluateJavascript("window.__nativeNext && window.__nativeNext()", null) }
        }
        MusicService.onSkipPrevious = {
            runOnUiThread { webView.evaluateJavascript("window.__nativePrev && window.__nativePrev()", null) }
        }

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
            try {
                val filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimetype)
                    addRequestHeader("User-Agent", userAgent)
                    addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                    addRequestHeader("X-Requested-With", "com.ganify.app")
                    setDescription("Mengunduh $filename")
                    setTitle(filename)
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                    setAllowedOverMetered(true)
                    setAllowedOverRoaming(true)
                }
                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                dm.enqueue(request)
            } catch (_: Exception) {}
        })

        if (savedInstanceState == null) {
            webView.loadUrl(frontendUrl, mapOf("X-Requested-With" to "com.ganify.app"))
        }
    }

    // Service dinyalakan eksplisit (foreground) lalu di-bind lewat MediaController,
    // supaya notifikasi player pasti bisa tampil (pola yang sama dengan app music biasa).
    private fun startPlaybackService() {
        if (MusicService.isRunning) return
        try {
            ContextCompat.startForegroundService(this, Intent(this, MusicService::class.java))
        } catch (e: Exception) {
            Log.e(tag, "Gagal start MusicService", e)
        }
    }

    private fun ensureNotificationPermission() {
        if (NotificationManagerCompat.from(this).areNotificationsEnabled()) return
        val prefs = getSharedPreferences("ganify_prefs", Context.MODE_PRIVATE)
        if (Build.VERSION.SDK_INT >= 33 && !prefs.getBoolean("notif_asked", false)) {
            prefs.edit().putBoolean("notif_asked", true).apply()
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
        } else {
            showNotificationSettingsDialog()
        }
    }

    private fun showNotificationSettingsDialog() {
        try {
            AlertDialog.Builder(this)
                .setTitle("Notifikasi Ganify mati")
                .setMessage("Aktifkan notifikasi biar kontrol musik (play/pause, next/prev) muncul di notifikasi HP.")
                .setPositiveButton("Buka pengaturan") { _, _ ->
                    try {
                        startActivity(
                            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        )
                    } catch (_: Exception) {}
                }
                .setNegativeButton("Nanti", null)
                .show()
        } catch (e: Exception) {
            Log.e(tag, "Gagal menampilkan dialog notifikasi", e)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1001 && grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Izin notifikasi ditolak, kontrol musik nggak akan muncul di notifikasi", Toast.LENGTH_LONG).show()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }

    override fun onDestroy() {
        super.onDestroy()
        uiHandler.removeCallbacks(statePoller)
        MusicService.onSkipNext = null
        MusicService.onSkipPrevious = null
        controllerFuture?.let {
            try { MediaController.releaseFuture(it) } catch (_: Exception) {}
        }
    }
}
