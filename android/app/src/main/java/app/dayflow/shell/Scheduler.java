package app.dayflow.shell;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** 通知の予約（アラーム）。開始の通知は予定ごとに1つ、終了確認は全体で1つ。 */
final class Scheduler {
    static final String ACTION_ALARM = "app.dayflow.shell.ALARM";
    /** 開始の通知に反応がなければ、この時間のあとに1回だけ出し直す。「10分後」ボタンの待ち時間も同じ。 */
    static final long RENOTIFY_MS = 10 * 60 * 1000L;
    private static final int PI_FLAGS = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

    private Scheduler() {
    }

    private static AlarmManager alarms(Context c) {
        return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    }

    static boolean canExact(Context c) {
        return Build.VERSION.SDK_INT < 31 || alarms(c).canScheduleExactAlarms();
    }

    private static void set(Context c, long at, PendingIntent pi) {
        AlarmManager am = alarms(c);
        try {
            if (canExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    /* ---- 開始の通知 ---- */

    private static Intent startIntent(Context c, String id) {
        // data に予定IDを入れて、予定ごとに別の予約として扱わせる。
        return new Intent(c, AlarmReceiver.class)
                .setAction(ACTION_ALARM)
                .setData(Uri.parse("dayflow://start/" + Uri.encode(id)));
    }

    /** attempt：0＝最初の通知、1＝出し直し（これ以上は出さない）。 */
    static void setStartAlarm(Context c, String id, String name, int start, int minutes, long at, int attempt) {
        Intent i = startIntent(c, id)
                .putExtra("kind", "start")
                .putExtra("id", id)
                .putExtra("name", name)
                .putExtra("start", start)
                .putExtra("minutes", minutes)
                .putExtra("attempt", attempt);
        set(c, at, PendingIntent.getBroadcast(c, 0, i, PI_FLAGS));
    }

    static void cancelStart(Context c, String id) {
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, startIntent(c, id), PI_FLAGS);
        alarms(c).cancel(pi);
        pi.cancel();
    }

    /** 保存してある予定表どおりに、開始の通知を全部張り直す。 */
    static synchronized void applySchedule(Context c) {
        for (String id : Store.getAlarmIds(c)) cancelStart(c, id);
        List<String> ids = new ArrayList<>();
        long now = System.currentTimeMillis();
        try {
            JSONArray arr = new JSONArray(Store.getSchedule(c));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                String id = o.optString("id", "");
                long when = o.optLong("when", 0);
                if (id.isEmpty() || when <= 0) continue;
                long at;
                int attempt;
                if (when > now) {                       // これから来る予定
                    at = when;
                    attempt = 0;
                } else if (now < when + RENOTIFY_MS) {  // 時刻を過ぎて10分以内：出し直しの分だけ予約
                    at = when + RENOTIFY_MS;
                    attempt = 1;
                } else {
                    continue;                           // それ以上過ぎた予定は通知しない
                }
                setStartAlarm(c, id, o.optString("name", ""), o.optInt("start", 0), o.optInt("minutes", 0), at, attempt);
                ids.add(id);
            }
        } catch (JSONException ignored) {
        }
        Store.setAlarmIds(c, ids);
    }

    /* ---- 終了確認の通知 ---- */

    private static Intent endIntent(Context c) {
        return new Intent(c, AlarmReceiver.class)
                .setAction(ACTION_ALARM)
                .setData(Uri.parse("dayflow://end"));
    }

    static void scheduleEnd(Context c, String name, long at) {
        Intent i = endIntent(c).putExtra("kind", "end").putExtra("name", name);
        set(c, at, PendingIntent.getBroadcast(c, 0, i, PI_FLAGS));
    }

    static void cancelEnd(Context c) {
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, endIntent(c), PI_FLAGS);
        alarms(c).cancel(pi);
        pi.cancel();
    }

    /** 保存してある「計測中」に合わせて、終了確認を張り直す。計測中でなければ取り消す。 */
    static synchronized void applyRunning(Context c) {
        cancelEnd(c);
        String json = Store.getRunning(c);
        if (json == null || json.isEmpty()) {
            Notifier.cancelEnd(c);
            return;
        }
        try {
            JSONObject o = new JSONObject(json);
            long endAt = o.optLong("endAt", 0);
            if (endAt > System.currentTimeMillis()) scheduleEnd(c, o.optString("name", ""), endAt);
        } catch (JSONException ignored) {
        }
    }
}
