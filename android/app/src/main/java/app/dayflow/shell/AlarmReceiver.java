package app.dayflow.shell;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 予約した時刻になったら通知を出す。 */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String kind = intent.getStringExtra("kind");
        if ("start".equals(kind)) {
            String id = intent.getStringExtra("id");
            String name = intent.getStringExtra("name");
            int start = intent.getIntExtra("start", 0);
            int minutes = intent.getIntExtra("minutes", 0);
            if (id == null) return;
            if (name == null) name = "";
            Notifier.showStart(c, id, name, start, minutes);
            Store.putDiagPair(c, "lastFiredAt", System.currentTimeMillis(), "lastFiredName", name);
            // 最初の通知なら、反応がなかったときのために10分後の出し直しを1回だけ予約する。
            if (intent.getIntExtra("attempt", 0) == 0) {
                Scheduler.setStartAlarm(c, id, name, start, minutes, System.currentTimeMillis() + Scheduler.RENOTIFY_MS, 1);
            }
        } else if ("test".equals(kind)) {
            long now = System.currentTimeMillis();
            long late = Math.max(0, now - intent.getLongExtra("at", now));
            Notifier.showTest(c, late);
            Store.putDiagPair(c, "testFiredAt", now, "testLateMs", Long.toString(late));
        } else if ("end".equals(kind)) {
            String name = intent.getStringExtra("name");
            Notifier.showEnd(c, name == null ? "" : name);
        }
    }
}
