package com.shici.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

/** 每日学习提醒：用系统闹钟（非精确，省电）在设定时间附近发一条通知，触发后再排下一天。 */
public class Reminder extends BroadcastReceiver {
    static final String CHANNEL = "daily";
    static final String ACTION = "com.shici.app.REMIND";
    private static final long DAY = 24L * 3600 * 1000;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("reminder", Context.MODE_PRIVATE);
    }

    private static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, Reminder.class).setAction(ACTION);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c) {
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("on", false)) return;
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, p.getInt("h", 20));
        cal.set(Calendar.MINUTE, p.getInt("m", 30));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        long at = cal.getTimeInMillis();
        if (at <= System.currentTimeMillis() + 30_000) at += DAY;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(c));
        else am.set(AlarmManager.RTC_WAKEUP, at, alarmIntent(c));
    }

    static void cancel(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(c));
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (ACTION.equals(a)) {
            show(c);
            schedule(c);
        }
    }

    @SuppressWarnings("deprecation")
    private static void show(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "每日学习提醒", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("每天在你设定的时间提醒背单词");
            nm.createNotificationChannel(ch);
        }
        SharedPreferences p = prefs(c);
        // 今天的任务文字只在当天有效；今天已经学完就不打扰
        boolean fresh = System.currentTimeMillis() - p.getLong("textDay", 0) < 20L * 3600 * 1000;
        String text = p.getString("text", "");
        if (fresh && text != null && text.contains("已完成")) return;
        if (!fresh || text == null || text.isEmpty()) text = "今天的单词复习好了吗？花几分钟，别让复习堆起来。";
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle("拾词 · 该背单词了")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true);
        try {
            nm.notify(1, b.build());
        } catch (SecurityException ignored) {
            // 没有通知权限
        }
    }
}
