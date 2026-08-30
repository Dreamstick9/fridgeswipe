package com.dreamsticks.redflag

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat

/**
 * Fires on cellular call-state changes. Posts the "join the call?" notification natively so
 * it works while the JS runtime is backgrounded or asleep.
 *   YES — deep-links redflag://arm, which opens the app already armed.
 *   NO  — dismisses via an explicit self-broadcast.
 * Posted on RINGING and re-posted on OFFHOOK (pickup); cleared when the call ends.
 */
class CallReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    if (intent.action == ACTION_DISMISS) {
      nm.cancel(NOTIF_ID)
      return
    }
    if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
    val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return

    when (state) {
      TelephonyManager.EXTRA_STATE_RINGING, TelephonyManager.EXTRA_STATE_OFFHOOK -> {
        ensureChannel(nm)
        context.getSharedPreferences("redflag", Context.MODE_PRIVATE).edit()
          .putBoolean("callActive", true)
          .putLong("callActiveTimestamp", System.currentTimeMillis())
          .apply()

        val yesIntent = Intent(Intent.ACTION_VIEW, Uri.parse("redflag://arm")).apply {
          setPackage(context.packageName)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val yes = PendingIntent.getActivity(
          context, 4711, yesIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val noIntent = Intent(context, CallReceiver::class.java).apply { action = ACTION_DISMISS }
        val no = PendingIntent.getBroadcast(
          context, 4712, noIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val answered = state == TelephonyManager.EXTRA_STATE_OFFHOOK
        val n = NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(android.R.drawable.ic_dialog_alert)
          .setContentTitle(if (answered) "📞 You're on a call" else "📞 Incoming call detected")
          .setContentText("Should I join and listen for scam signals?")
          .setStyle(NotificationCompat.BigTextStyle()
            .bigText("Should I join and listen for scam signals? Put the call on speaker — I stay silent and flag manipulation live."))
          .setPriority(NotificationCompat.PRIORITY_MAX)
          .setCategory(NotificationCompat.CATEGORY_CALL)
          .setContentIntent(yes)
          .setAutoCancel(true)
          .addAction(0, "✓ YES, LISTEN", yes)
          .addAction(0, "✗ NO", no)
          .setOngoing(false)
          .build()
        nm.notify(NOTIF_ID, n)
      }
      TelephonyManager.EXTRA_STATE_IDLE -> {
        nm.cancel(NOTIF_ID)

        val prefs = context.getSharedPreferences("redflag", Context.MODE_PRIVATE)
        val callActive = prefs.getBoolean("callActive", false)
        val callActiveTimestamp = prefs.getLong("callActiveTimestamp", 0L)
        val elapsed = System.currentTimeMillis() - callActiveTimestamp
        val withinLastThirtyMinutes = elapsed in 0L..CALL_ACTIVE_TIMEOUT_MS
        prefs.edit().putBoolean("callActive", false).remove("callActiveTimestamp").apply()

        if (callActive && withinLastThirtyMinutes) {
          ensureChannel(nm)
          val reportIntent = Intent(Intent.ACTION_VIEW, Uri.parse("redflag://report")).apply {
            setPackage(context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          }
          val report = PendingIntent.getActivity(
            context, 4713, reportIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
          )
          val reportNotification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("📋 Call ended — your report is ready")
            .setContentText("Tap to see whether action is needed.")
            .setContentIntent(report)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
          nm.notify(REPORT_NOTIF_ID, reportNotification)
        }
      }
    }
  }

  private fun ensureChannel(nm: NotificationManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Call detection", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Asks whether RED FLAG should join a call"
          enableVibration(true)
        }
      )
    }
  }

  companion object {
    const val CHANNEL_ID = "redflag-call"
    const val NOTIF_ID = 4711
    const val REPORT_NOTIF_ID = 4713
    const val CALL_ACTIVE_TIMEOUT_MS = 30 * 60 * 1000L
    const val ACTION_DISMISS = "com.dreamsticks.redflag.DISMISS_CALL_PROMPT"
  }
}
