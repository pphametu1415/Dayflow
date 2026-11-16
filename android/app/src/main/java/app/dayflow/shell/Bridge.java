package app.dayflow.shell;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
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

    /** 開始の通知の予定表。呼ばれるたびに全部置き換える。 */
    @JavascriptInterface
    public void replaceSchedule(String json) {
        String next = json == null ? "[]" : json;
        if (next.equals(Store.getSchedule(app))) return;      // 変わっていなければ予約はそのまま
        Store.setSchedule(app, next);
        Scheduler.applySchedule(app);
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
