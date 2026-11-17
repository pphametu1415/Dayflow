package app.dayflow.shell;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 殻が端末に覚えておくもの。記録そのもの（予定・実績）は画面側の IndexedDB にあり、ここには置かない。
 *  - schedule：画面から渡された開始通知の予定表（再起動後に張り直すため）
 *  - running ：計測中の実績（終了確認の通知を張り直すため）
 *  - pending ：通知のボタンが押された記録。画面が取りに来るまでためる
 *  - alarmIds：いま予約している開始通知の予定ID（取り消すため）
 *  - diag.*  ：診断用の記録（予定表を受け取った時刻、次の通知、最後に通知を出した時刻）
 */
final class Store {
    private static final String PREFS = "dayflow";

    private Store() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized String getSchedule(Context c) {
        return prefs(c).getString("schedule", "[]");
    }

    static synchronized void setSchedule(Context c, String json) {
        prefs(c).edit().putString("schedule", json == null ? "[]" : json).commit();
    }

    static synchronized String getRunning(Context c) {
        return prefs(c).getString("running", "");
    }

    static synchronized void setRunning(Context c, String json) {
        prefs(c).edit().putString("running", json == null ? "" : json).commit();
    }

    static synchronized List<String> getAlarmIds(Context c) {
        List<String> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs(c).getString("alarmIds", "[]"));
            for (int i = 0; i < a.length(); i++) out.add(a.getString(i));
        } catch (JSONException ignored) {
        }
        return out;
    }

    static synchronized void setAlarmIds(Context c, List<String> ids) {
        prefs(c).edit().putString("alarmIds", new JSONArray(ids).toString()).commit();
    }

    static synchronized long getLong(Context c, String key) {
        return prefs(c).getLong("diag." + key, 0L);
    }

    static synchronized String getString(Context c, String key) {
        return prefs(c).getString("diag." + key, "");
    }

    static synchronized void putDiag(Context c, String key, long value) {
        prefs(c).edit().putLong("diag." + key, value).apply();
    }

    static synchronized void putDiagPair(Context c, String key, long value, String textKey, String text) {
        prefs(c).edit().putLong("diag." + key, value).putString("diag." + textKey, text == null ? "" : text).apply();
    }

    /** ボタンが押された時刻（at）つきで1件ためる。 */
    static synchronized void addPending(Context c, String action, String id, long at) {
        JSONArray a;
        try {
            a = new JSONArray(prefs(c).getString("pending", "[]"));
        } catch (JSONException e) {
            a = new JSONArray();
        }
        try {
            JSONObject o = new JSONObject();
            o.put("action", action);
            o.put("id", id == null ? "" : id);
            o.put("at", at);
            a.put(o);
        } catch (JSONException ignored) {
        }
        prefs(c).edit().putString("pending", a.toString()).commit();
    }

    /** ためた分をまとめて返し、空にする。 */
    static synchronized String takePending(Context c) {
        SharedPreferences p = prefs(c);
        String s = p.getString("pending", "[]");
        p.edit().putString("pending", "[]").commit();
        return s;
    }
}
