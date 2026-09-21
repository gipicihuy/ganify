package com.ganify.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class MusicService : MediaSessionService() {

    companion object {
        private const val TAG = "GanifyService"

        // Sama dengan channel default Media3 -> notifikasi player nanti pakai channel yang sama.
        private const val CHANNEL_ID = "default_channel_id"
        private const val FALLBACK_NOTIFICATION_ID = 888

        private const val STREAM_UA =
            "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/126.0.0.0 Mobile Safari/537.36"

        @Volatile var isRunning: Boolean = false

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
        isRunning = true

        // Service dinyalakan lewat startForegroundService() -> WAJIB langsung startForeground(),
        // kalau nggak Android bakal kill app ("did not call startForeground"). Notifikasi ini
        // nanti otomatis digantikan notifikasi player Media3 begitu lagu diputar.
        try {
            val notification = buildFallbackNotification()
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(FALLBACK_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(FALLBACK_NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "startForeground ditolak", e)
            stopSelf()
        }

        // Header HTTP mirip browser + boleh redirect lintas protokol, biar CDN nggak nolak "ExoPlayer" UA.
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent(STREAM_UA)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)

        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(this).setDataSourceFactory(httpFactory))
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

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_ID,
                        getString(R.string.music_player),
                        NotificationManager.IMPORTANCE_LOW
                    )
                )
            }
        }
    }

    private fun buildFallbackNotification(): Notification {
        ensureChannel()
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notif_idle))
            .setSmallIcon(R.drawable.ic_stat_music)
            .setContentIntent(openApp)
            .setOngoing(true)
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
        isRunning = false
        mediaSession?.release()
        mediaSession = null
        exoPlayer?.release()
        exoPlayer = null
        super.onDestroy()
    }
}
