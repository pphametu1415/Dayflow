package app.dayflow.shell;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 通知のボタン（スマホ・Watch）が押されたときの受け口。画面は開かない。
 * 1) 押された時刻つきでためる（画面が取りに来て実績にする）
 * 2) 次の通知を自分で予約し直す（画面が閉じていても続きが動くように）
 * 3) 画面が生きていれば、すぐ取りに来るよう合図する
 */
public class ActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String action = intent.getStringExtra("action");
        if (action == null) return;
        String id = intent.getStringExtra("id");
        if (id == null) id = "";
        String name = intent.getStringExtra("name");
        if (name == null) name = "";
        int minutes = intent.getIntExtra("minutes", 0);
        int start = intent.getIntExtra("start", 0);
        long now = System.currentTimeMillis();

        Notifier.cancel(c, intent.getIntExtra("notificationId", 0));
        if ("test".equals(action)) {                            // テスト通知：押された時刻だけ覚える
            Store.putDiag(c, "testAckAt", now);
            MainActivity.nudge();
            return;
        }
        Store.addPending(c, action, id, now);

        switch (action) {
            case "start": {
                Scheduler.cancelStart(c, id);                       // 出し直しを止める
                long endAt = now + Math.max(1, minutes) * 60000L;
                try {
                    JSONObject o = new JSONObject();
                    o.put("sessionId", "");
                    o.put("planId", id);
                    o.put("name", name);
                    o.put("startedAt", now);
                    o.put("endAt", endAt);
                    Store.setRunning(c, o.toString());
                } catch (JSONException ignored) {
                }
                Scheduler.scheduleEnd(c, name, endAt);              // 予定の長さが過ぎたら終了確認
                break;
            }
            case "snooze10":
                Scheduler.setStartAlarm(c, id, name, start, minutes, now + Scheduler.RENOTIFY_MS, 0);
                break;
            case "skip":
                Scheduler.cancelStart(c, id);
                break;
            case "finish":
                Scheduler.cancelEnd(c);
                Store.setRunning(c, "");
                break;
            case "extend15":
                Scheduler.scheduleEnd(c, name, now + 15 * 60000L);
                break;
            default:
                break;
        }
        MainActivity.nudge();
    }
}
