package com.ganify.app

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class MusicService : MediaSessionService() {

    companion object {
        // Antrean lagu dikelola JS di WebView, jadi tombol next/prev di notifikasi
        // diteruskan ke MainActivity -> JS (window.__nativeNext / __nativePrev).
        @Volatile var onSkipNext: (() -> Unit)? = null
        @Volatile var onSkipPrevious: (() -> Unit)? = null
    }

    private var exoPlayer: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    // Player pembungkus: aktifkan tombol next/prev di notifikasi & lockscreen
    // dan arahkan aksinya ke JS, bukan ke playlist internal ExoPlayer (yang cuma 1 item).
    private inner class SkipForwardingPlayer(player: Player) : ForwardingPlayer(player) {
        override fun getAvailableCommands(): Player.Commands {
            return super.getAvailableCommands().buildUpon()
                .add(Player.COMMAND_SEEK_TO_NEXT)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                .build()
        }

        override fun isCommandAvailable(command: Int): Boolean {
            return when (command) {
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> true
                else -> super.isCommandAvailable(command)
            }
        }

        override fun seekToNext() { onSkipNext?.invoke() }
        override fun seekToNextMediaItem() { onSkipNext?.invoke() }
        override fun seekToPrevious() { onSkipPrevious?.invoke() }
        override fun seekToPreviousMediaItem() { onSkipPrevious?.invoke() }
    }

    override fun onCreate() {
        super.onCreate()

        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        exoPlayer = player

        // Tap notifikasi -> balik ke app
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        mediaSession = MediaSession.Builder(this, SkipForwardingPlayer(player))
            .setSessionActivity(openApp)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    // App di-swipe dari recents: kalau lagi nggak muter, matikan service.
    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = exoPlayer
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        mediaSession?.release()
        mediaSession = null
        exoPlayer?.release()
        exoPlayer = null
        super.onDestroy()
    }
}
