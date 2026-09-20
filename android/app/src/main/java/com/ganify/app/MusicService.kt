package com.ganify.app

import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class MusicService : MediaSessionService() {

    companion object {
        var exoPlayer: ExoPlayer? = null
        var mediaSession: MediaSession? = null
    }

    override fun onCreate() {
        super.onCreate()
        if (exoPlayer == null) {
            exoPlayer = ExoPlayer.Builder(this).build()
        }
        if (mediaSession == null) {
            mediaSession = MediaSession.Builder(this, exoPlayer!!).build()
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        // Jangan release di sini — biar tetap hidup selama app hidup (WebView foreground)
        // Release hanya saat app benar-benar di-kill
        super.onDestroy()
    }
}
