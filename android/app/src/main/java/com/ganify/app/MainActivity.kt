package com.ganify.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // Frontend tetap, WebView hanya UI. Semua fetch JS langsung ke backend API:
    // /api/search, /api/song, /api/artist, /api/album, /api/stream, /api/download, /api/lyrics
    // Tidak ada proxy via hosting frontend.
    private val frontendUrl = "https://ganify.my.id"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
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

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
