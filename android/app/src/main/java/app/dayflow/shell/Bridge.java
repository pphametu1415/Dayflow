package app.dayflow.shell;

import android.content.ContentResolver;
import android.app.ActivityManager;
import android.app.usage.UsageStatsManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 画面（Web）から呼ばれる入口。JavaScript では window.DayFlowNative として見える。
 * 取り決めは docs/ANDROID_SHELL.md。
 */
final class Bridge {
    private final Context app;

    Bridge(Context c) {
        app = c.getApplicationContext();
    }

    /**
     * 開始の通知の予定表。呼ばれるたびに全部置き換え、予約も毎回張り直す。
     * （内容が同じでも張り直す。スマホ側の電池の節約などで予約が消えていても、画面を開けば戻るように）
     */
    @JavascriptInterface
    public void replaceSchedule(String json) {
        String next = json == null ? "[]" : json;
        Store.setSchedule(app, next);
        Scheduler.applySchedule(app);
        int count = 0;
        try {
            count = new org.json.JSONArray(next).length();
        } catch (JSONException ignored) {
        }
        Store.putDiagPair(app, "scheduleAt", System.currentTimeMillis(), "scheduleCount", Integer.toString(count));
    }

    /** テスト通知。delaySec 秒後（0ならすぐ）に、予定の通知と同じ仕組み（アラーム）で出す。 */
    @JavascriptInterface
    public void testNotify(int delaySec) {
        long at = System.currentTimeMillis() + Math.max(0, delaySec) * 1000L;
        if (delaySec <= 0) {
            Notifier.showTest(app, 0);
            Store.putDiagPair(app, "testFiredAt", System.currentTimeMillis(), "testLateMs", "0");
        } else {
            Scheduler.scheduleTest(app, at);
        }
        Store.putDiag(app, "testRequestedAt", System.currentTimeMillis());
        Store.putDiag(app, "testDueAt", at);
    }

    /** スマホの設定画面を開く。which：notifications（通知）／battery（電池の最適化）／app（アプリ情報） */
    @JavascriptInterface
    public boolean openSettings(String which) {
        String pkg = app.getPackageName();
        Intent i;
        if ("notifications".equals(which)) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else if ("battery".equals(which)) {
            i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
        } else if ("alarms".equals(which) && Build.VERSION.SDK_INT >= 31) {
            i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg));
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            app.startActivity(i);
            return true;
        } catch (Exception e) {
            try {           // 開けなければアプリ情報の画面にする
                app.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }
    }

    /** 通知の診断（設定画面に出す）。 */
    @JavascriptInterface
    public String diagnose() {
        try {
            JSONObject o = new JSONObject();
            o.put("version", BuildConfig.VERSION_NAME);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("maker", Build.MANUFACTURER);
            o.put("model", Build.MODEL);
            o.put("notifications", Notifier.enabled(app));
            o.put("channelStart", Notifier.channelImportance(app, Notifier.CH_START));
            o.put("exactAlarms", Scheduler.canExact(app));
            PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
            o.put("batteryExempt", pm != null && pm.isIgnoringBatteryOptimizations(app.getPackageName()));
            ActivityManager am = (ActivityManager) app.getSystemService(Context.ACTIVITY_SERVICE);
            o.put("bgRestricted", am != null && am.isBackgroundRestricted());
            UsageStatsManager us = (UsageStatsManager) app.getSystemService(Context.USAGE_STATS_SERVICE);
            o.put("bucket", us == null ? 0 : us.getAppStandbyBucket());
            o.put("alarms", Store.getAlarmIds(app).size());
            o.put("nextAt", Store.getLong(app, "nextAt"));
            o.put("nextName", Store.getString(app, "nextName"));
            o.put("scheduleAt", Store.getLong(app, "scheduleAt"));
            o.put("scheduleCount", Store.getString(app, "scheduleCount"));
            o.put("lastFiredAt", Store.getLong(app, "lastFiredAt"));
            o.put("lastFiredName", Store.getString(app, "lastFiredName"));
            o.put("testRequestedAt", Store.getLong(app, "testRequestedAt"));
            o.put("testDueAt", Store.getLong(app, "testDueAt"));
            o.put("testFiredAt", Store.getLong(app, "testFiredAt"));
            o.put("testAckAt", Store.getLong(app, "testAckAt"));
            return o.toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    /** 計測中の実績。空文字なら「計測していない」。 */
    @JavascriptInterface
    public void setRunning(String json) {
        String next = json == null ? "" : json;
        if (next.equals(Store.getRunning(app))) return;
        Store.setRunning(app, next);
        Scheduler.applyRunning(app);
    }

    /** 通知のボタンが押された記録を返して空にする。 */
    @JavascriptInterface
    public String takePendingActions() {
        return Store.takePending(app);
    }

    /** バックアップを「ダウンロード/DayFlow」に保存する。成功したら保存先の名前、失敗したら空文字を返す。 */
    @JavascriptInterface
    public String saveFile(String name, String text) {
        String safe = (name == null ? "dayflow-backup.json" : name).replaceAll("[^A-Za-z0-9._-]", "_");
        try {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
            v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/DayFlow");
            ContentResolver r = app.getContentResolver();
            Uri uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return "";
            try (OutputStream os = r.openOutputStream(uri)) {
                if (os == null) return "";
                os.write((text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            }
            return "ダウンロード/DayFlow";
        } catch (Exception e) {
            return "";
        }
    }

    /** 上下の帯（ステータスバー・ナビゲーションバーの裏）の色を、画面の色に合わせる。色は "#rrggbb"。 */
    @JavascriptInterface
    public void setBarColors(String top, String bottom) {
        if (top == null || bottom == null) return;
        MainActivity.setBarColors(top, bottom);
    }

    /** 設定画面に出す状態。 */
    @JavascriptInterface
    public String status() {
        try {
            JSONObject o = new JSONObject();
            o.put("version", BuildConfig.VERSION_NAME);
            o.put("notifications", Notifier.enabled(app));
            o.put("exactAlarms", Scheduler.canExact(app));
            return o.toString();
        } catch (JSONException e) {
            return "{}";
        }
    }
}
