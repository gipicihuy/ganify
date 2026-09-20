package com.ganify.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
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
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var mediaController: MediaController? = null
    private var controllerFuture: ListenableFuture<MediaController>? = null

    // Frontend tetap, WebView hanya UI. Semua fetch JS langsung ke backend API:
    // /api/search, /api/song, /api/artist, /api/album, /api/stream, /api/download, /api/lyrics
    // Tidak ada proxy via hosting frontend.
    // Playback sekarang via ExoPlayer native (MusicService) biar nyetel langsung di HP, background + lockscreen.
    private val frontendUrl = "https://ganify.my.id"

    // JS Bridge: dipanggil dari frontend JS kalau window.AndroidPlayer tersedia
    inner class AndroidBridge {
        @JavascriptInterface fun play(url: String, title: String, artist: String) {
            runOnUiThread { playNative(url, title, artist) }
        }
        @JavascriptInterface fun pause() { runOnUiThread { mediaController?.pause() } }
        @JavascriptInterface fun resume() { runOnUiThread { mediaController?.play() } }
        @JavascriptInterface fun seekTo(ms: Long) { runOnUiThread { mediaController?.seekTo(ms) } }
        @JavascriptInterface fun getPosition(): Long = mediaController?.currentPosition ?: 0L
        @JavascriptInterface fun getDuration(): Long = mediaController?.duration?.let { if (it < 0) 0 else it } ?: 0L
        @JavascriptInterface fun isPlaying(): Boolean = mediaController?.isPlaying == true
        @JavascriptInterface fun isNative(): Boolean = true
    }

    private fun playNative(url: String, title: String, artist: String) {
        val controller = mediaController ?: return
        val mediaItem = MediaItem.Builder()
            .setUri(url)
            .setMediaMetadata(
                androidx.media3.common.MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(artist)
                    .build()
            )
            .build()
        controller.setMediaItem(mediaItem)
        controller.prepare()
        controller.play()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // POST_NOTIFICATIONS untuk notifikasi playback Android 13+
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
            }
        }
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)

        // WebView siap untuk streaming & WebView hybrid
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

        // Bridge ke ExoPlayer native
        webView.addJavascriptInterface(AndroidBridge(), "AndroidPlayer")

        // Init MediaController untuk native playback (background + notifikasi)
        val token = SessionToken(this, ComponentName(this, MusicService::class.java))
        controllerFuture = MediaController.Builder(this, token).buildAsync()
        controllerFuture?.addListener({
            try {
                mediaController = controllerFuture?.get()
                mediaController?.addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        if (state == Player.STATE_ENDED) {
                            webView.post { webView.evaluateJavascript("window.__nativeNext && window.__nativeNext()", null) }
                        }
                    }
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        webView.post { webView.evaluateJavascript("window.__nativePlaying && window.__nativePlaying($isPlaying)", null) }
                    }
                })
            } catch (_: Exception) {}
        }, androidx.core.content.ContextCompat.getMainExecutor(this))

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlRequest(view: WebView?, request: WebResourceRequest?): Boolean {
                // Biarkan semua navigasi internal tetap di WebView, jangan lempar ke browser
                // Kecuali link eksternal non-ganify (mis. wikipedia di artist bio), buka via intent jika perlu.
                return false
            }
        }

        webView.webChromeClient = WebChromeClient()

        // Download: jangan lewat frontend page/blob, langsung serahkan ke DownloadManager
        // Endpoint /api/download sudah set Content-Disposition: attachment dan forward Range
        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
            try {
                val filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimetype)
                    addRequestHeader("User-Agent", userAgent)
                    addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                    // Penting: biar backend tahu ini WebView Android (lolos apiGuard)
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
            } catch (_: Exception) {
            }
        })

        if (savedInstanceState == null) {
            // Header khusus WebView biar apiGuard allow (same-origin sudah allow, ini untuk file:// fallback)
            val extraHeaders = mapOf("X-Requested-With" to "com.ganify.app")
            webView.loadUrl(frontendUrl, extraHeaders)
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
        controllerFuture?.let {
            androidx.media3.common.util.UnstableApi::class.java // keep import
            MediaController.releaseFuture(it)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
