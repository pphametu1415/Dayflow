package app.dayflow.shell;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** スマホの再起動やアプリの更新で予約が消えるので、保存してある内容から張り直す。 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        Notifier.ensureChannels(c);
        Scheduler.applySchedule(c);
        Scheduler.applyRunning(c);
    }
}
