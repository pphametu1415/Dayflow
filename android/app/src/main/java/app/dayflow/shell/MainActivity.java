package app.dayflow.shell;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Insets;
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
    private ValueCallback<Uri[]> fileCallback;

    /** 通知のボタンが押されたとき、画面が生きていればすぐ取りに来させる。 */
    static void nudge() {
        final MainActivity a = current.get();
        if (a != null) a.runOnUiThread(a::drain);
    }

    private void drain() {
        if (web != null) web.evaluateJavascript("window.dayFlowDrain&&window.dayFlowDrain()", null);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);
        Notifier.ensureChannels(this);

        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int background = night ? 0xFF12171D : 0xFFF6F7F3;      // styles.css の --paper と同じ色

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(background);
        web = new WebView(this);
        web.setBackgroundColor(background);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        fitSystemBars(root, night);

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
    private void fitSystemBars(View root, boolean night) {
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
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(night ? 0 : light, light);   // 明るい背景のときはバーの文字を暗くする
            }
        } else if (!night) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
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
