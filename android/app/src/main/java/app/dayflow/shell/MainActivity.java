package app.dayflow.shell;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.lang.ref.WeakReference;

/**
 * 画面（Web）を表示するだけの入れ物。画面の中身は BuildConfig.APP_URL から読むので、
 * 画面の更新でアプリを入れ直す必要はない。
 */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 11;
    private static final int REQ_NOTIFICATIONS = 12;
    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    private WebView web;
    private FrameLayout root;
    private ValueCallback<Uri[]> fileCallback;

    /** 通知のボタンが押されたとき、画面が生きていればすぐ取りに来させる。 */
    static void nudge() {
        final MainActivity a = current.get();
        if (a != null) a.runOnUiThread(a::drain);
    }

    private void drain() {
        if (web != null) web.evaluateJavascript("window.dayFlowDrain&&window.dayFlowDrain()", null);
    }

    /** 画面（Web）から、上下の帯の色を受け取る。色は "#rrggbb"。画面のデザインを変えてもアプリを入れ直さずに済む。 */
    static void setBarColors(final String top, final String bottom) {
        final MainActivity a = current.get();
        if (a == null) return;
        a.runOnUiThread(() -> {
            try {
                a.applyBars(Color.parseColor(top), Color.parseColor(bottom));
            } catch (RuntimeException ignored) {      // 色の書式が違うときは何もしない
            }
        });
    }

    /** 上の帯（ステータスバーの裏）と下の帯（ナビゲーションバーの裏）を塗り、バーの文字の明暗を合わせる。 */
    private void applyBars(int top, int bottom) {
        if (root == null) return;
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{top, top, bottom, bottom});
        bg.setColors(new int[]{top, top, bottom, bottom}, new float[]{0f, 0.5f, 0.5f, 1f});   // 上半分は上の色、下半分は下の色
        root.setBackground(bg);
        boolean lightTop = Color.luminance(top) > 0.5f, lightBottom = Color.luminance(bottom) > 0.5f;
        if (Build.VERSION.SDK_INT < 35) {             // Android 14 以前はバー自体に色を付ける
            getWindow().setStatusBarColor(top);
            getWindow().setNavigationBarColor(bottom);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                int value = (lightTop ? WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS : 0)
                        | (lightBottom ? WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS : 0);
                c.setSystemBarsAppearance(value, mask);   // 明るい背景のときはバーの文字を暗くする
            }
        } else {
            int flags = (lightTop ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : 0) | (lightBottom ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);
        Notifier.ensureChannels(this);

        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        // 画面が読み込まれるまでの色。styles.css の --paper／--bar-top／--bar-bottom と同じ色にしておく。
        // 読み込み後は画面側が setBarColors で上書きする。
        int background = night ? 0xFF081C30 : 0xFFE9F6F8;
        int barTop = night ? 0xFF0E3152 : 0xFF8FDCEC;
        int barBottom = night ? 0xFF102C47 : 0xFFFFFFFF;

        root = new FrameLayout(this);
        web = new WebView(this);
        web.setBackgroundColor(background);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        fitSystemBars(root);
        applyBars(barTop, barBottom);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(false);

        web.addJavascriptInterface(new Bridge(this), "DayFlowNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                Uri home = Uri.parse(BuildConfig.APP_URL);
                if (home.getHost() != null && home.getHost().equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));   // 外のリンクはブラウザで開く
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                String html = "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                        + "<body style='font-family:sans-serif;padding:32px 20px;line-height:1.7'>"
                        + "<h2>DayFlowを開けませんでした</h2><p>通信できる場所で、もう一度開いてください。一度開けば、次からは通信なしでも使えます。</p>"
                        + "<p><a href='" + BuildConfig.APP_URL + "' style='font-size:18px'>もう一度開く</a></p></body>";
                view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {
                    startActivityForResult(pick, REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        web.loadUrl(BuildConfig.APP_URL);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    /** Android 15 以降は画面がステータスバーの下まで広がるので、その分の余白を取る。 */
    private void fitSystemBars(View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        Scheduler.applySchedule(this);      // 予約がスマホ側で消されていても、開けば戻す
        drain();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (current.get() == this) current = new WeakReference<>(null);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
