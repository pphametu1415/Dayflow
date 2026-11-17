package app.dayflow.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.net.Uri;

import java.util.Locale;

/**
 * 通知を組み立てて出す。
 * ふつうの通知にボタン（addAction）を付けるだけにしてある。この形ならスマホの通知が Watch に転送され、Watch でもボタンが押せる。
 * setOngoing(true) と setLocalOnly(true) は付けないこと（Watch に届かなくなる）。
 */
final class Notifier {
    static final String CH_START = "start";
    static final String CH_END = "end";
    static final String ACTION_BUTTON = "app.dayflow.shell.BUTTON";
    static final int END_NOTIFICATION_ID = 9001;
    private static final int PI_FLAGS = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    private static final int ACCENT = 0xFF2C5AA0;

    private Notifier() {
    }

    private static NotificationManager manager(Context c) {
        return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    static void ensureChannels(Context c) {
        NotificationChannel start = new NotificationChannel(CH_START, "開始の通知", NotificationManager.IMPORTANCE_HIGH);
        start.setDescription("予定の開始時刻に知らせます");
        start.enableVibration(true);
        NotificationChannel end = new NotificationChannel(CH_END, "終了の確認", NotificationManager.IMPORTANCE_HIGH);
        end.setDescription("予定の終了時刻に、終わったかどうかを確認します");
        end.enableVibration(true);
        NotificationManager nm = manager(c);
        nm.createNotificationChannel(start);
        nm.createNotificationChannel(end);
    }

    static boolean enabled(Context c) {
        return manager(c).areNotificationsEnabled();
    }

    static int startNotificationId(String id) {
        return 10000 + (id.hashCode() & 0x0FFFFFFF);
    }

    private static String hm(int minutesOfDay) {
        return String.format(Locale.US, "%02d:%02d", (minutesOfDay / 60) % 24, minutesOfDay % 60);
    }

    private static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PI_FLAGS);
    }

    /** ボタン1個。押すと ActionReceiver に届く（画面は開かない）。 */
    private static Notification.Action button(Context c, String label, String action, String id, String name,
                                              int start, int minutes, int notificationId) {
        Intent i = new Intent(c, ActionReceiver.class)
                .setAction(ACTION_BUTTON)
                .setData(Uri.parse("dayflow://button/" + action + "/" + Uri.encode(id)))
                .putExtra("action", action)
                .putExtra("id", id)
                .putExtra("name", name)
                .putExtra("start", start)
                .putExtra("minutes", minutes)
                .putExtra("notificationId", notificationId);
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, i, PI_FLAGS);
        return new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_stat), label, pi).build();
    }

    static void showStart(Context c, String id, String name, int start, int minutes) {
        ensureChannels(c);
        int nid = startNotificationId(id);
        Notification n = new Notification.Builder(c, CH_START)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(ACCENT)
                .setContentTitle(hm(start) + " " + name)
                .setContentText(minutes + "分の予定です。始めますか？")
                .setCategory(Notification.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setContentIntent(openApp(c))
                .addAction(button(c, "開始", "start", id, name, start, minutes, nid))
                .addAction(button(c, "10分後", "snooze10", id, name, start, minutes, nid))
                .addAction(button(c, "スキップ", "skip", id, name, start, minutes, nid))
                .build();
        manager(c).notify(nid, n);
    }

    static final int TEST_NOTIFICATION_ID = 9002;

    /** テスト通知。late は予約した時刻からの遅れ（ミリ秒）。 */
    static void showTest(Context c, long late) {
        ensureChannels(c);
        String delay = late < 60000 ? "時刻どおり" : (late / 60000) + "分遅れ";
        Notification n = new Notification.Builder(c, CH_START)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(ACCENT)
                .setContentTitle("DayFlow テスト通知")
                .setContentText("届いています（" + delay + "）。Watchでも見えたら［受け取った］を押してください。")
                .setCategory(Notification.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setContentIntent(openApp(c))
                .addAction(button(c, "受け取った", "test", "test", "", 0, 0, TEST_NOTIFICATION_ID))
                .build();
        manager(c).notify(TEST_NOTIFICATION_ID, n);
    }

    static int channelImportance(Context c, String id) {
        NotificationChannel ch = manager(c).getNotificationChannel(id);
        return ch == null ? -1 : ch.getImportance();
    }

    static void showEnd(Context c, String name) {
        ensureChannels(c);
        Notification n = new Notification.Builder(c, CH_END)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(ACCENT)
                .setContentTitle(name + " 終わった？")
                .setContentText("予定の終了時刻です。")
                .setCategory(Notification.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setContentIntent(openApp(c))
                .addAction(button(c, "完了", "finish", "", name, 0, 0, END_NOTIFICATION_ID))
                .addAction(button(c, "＋15分", "extend15", "", name, 0, 0, END_NOTIFICATION_ID))
                .build();
        manager(c).notify(END_NOTIFICATION_ID, n);
    }

    static void cancel(Context c, int notificationId) {
        manager(c).cancel(notificationId);
    }

    static void cancelEnd(Context c) {
        manager(c).cancel(END_NOTIFICATION_ID);
    }
}
