package com.nadircoderlab.sanad;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * «مكتب الخدمات الصحية المساندة» على أندرويد TV — غلاف WebView حول صفحة الشاشة.
 *
 * يفتح الصفحة من GitHub Pages (عشان أي تحديث يوصل بدون إعادة تثبيت)، وإذا ما فيه
 * نت يفتح النسخة اللي داخل التطبيق (assets/web/tv.html).
 *
 * أزرار الريموت تنتقل للصفحة بنفس طريقة غلاف سامسونج: postMessage({sanadKey}) بأرقام
 * المتصفح (الأسهم 37–40، موافق 13، رجوع 10009). وزر الرجوع ما يقفل التطبيق: الصفحة
 * تقرّر (ترجع للقائمة، ومن القائمة تقفل عبر SanadAndroid.exit). والاستمرار بالضغط
 * على الرجوع ثانية مخرج مضمون حتى لو الصفحة علقت.
 */
public class MainActivity extends Activity {

    static final String REMOTE = "https://nadir-coderlab.github.io/sanad/tv.html";
    static final String LOCAL = "file:///android_asset/web/tv.html";

    private WebView web;
    private boolean usingLocal = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // خلفية كحلية من أول لحظة (بدل المربع الأبيض قبل ما تحمّل الصفحة)
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0xFF050D1A));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // رقم الشاشة محفوظ في localStorage
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);            // النسخة الاحتياطية من assets
        web.setBackgroundColor(0xFF050D1A);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                // الصفحة الرئيسية ما فتحت (ما فيه نت) ← النسخة اللي داخل التطبيق
                if (req.isForMainFrame() && !usingLocal) { usingLocal = true; v.loadUrl(LOCAL); }
            }
        });
        web.addJavascriptInterface(new Bridge(), "SanadAndroid");
        WebView.setWebContentsDebuggingEnabled(true);

        setContentView(web);
        hideSystemUi();
        web.loadUrl(REMOTE);
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    /** رقم الزر كما تعرفه الصفحة (أرقام المتصفح وريموت سامسونج) */
    private static int pageCode(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_LEFT: return 37;
            case KeyEvent.KEYCODE_DPAD_UP: return 38;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 39;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 40;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER: return 13;
            case KeyEvent.KEYCODE_BACK: return 10009;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return 415;
            case KeyEvent.KEYCODE_MEDIA_REWIND: return 412;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return 417;
            case KeyEvent.KEYCODE_CHANNEL_UP:
            case KeyEvent.KEYCODE_PAGE_UP: return 427;
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
            case KeyEvent.KEYCODE_PAGE_DOWN: return 428;
            case KeyEvent.KEYCODE_PROG_RED: return 403;
            case KeyEvent.KEYCODE_PROG_GREEN: return 404;
            case KeyEvent.KEYCODE_PROG_YELLOW: return 405;
            case KeyEvent.KEYCODE_PROG_BLUE: return 406;
            default: return 0;
        }
    }

    private static final long BACK_HOLD_EXIT_MS = 1000;
    private long backDownAt = 0;
    private boolean backExited = false;

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = pageCode(e.getKeyCode());
        if (code == 0) return super.dispatchKeyEvent(e);
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            // الاستمرار بالضغط ثانية = خروج مضمون
            if (e.getAction() == KeyEvent.ACTION_DOWN) {
                if (e.getRepeatCount() == 0) { backDownAt = e.getDownTime(); backExited = false; }
                if (!backExited && e.getEventTime() - backDownAt >= BACK_HOLD_EXIT_MS) { backExited = true; finishAffinity(); }
                if (e.getRepeatCount() > 0) return true;
            } else {
                return true;
            }
        }
        if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0)
            web.evaluateJavascript("window.postMessage({sanadKey:" + code + "},'*')", null);
        return true;
    }

    @Override
    public void onBackPressed() {
        // مقصود: الصفحة تقرّر، والخروج من قائمتها أو بالاستمرار بالضغط
    }

    /** يناديه tv.js لما يضغط المستخدم «رجوع» وهو على شاشة البداية */
    public class Bridge {
        /**
         * عنوان الجهاز في الشبكة الداخلية. الصفحة تحطه بدل الاسم المموّه (xxx.local) في
         * مرشّحات WebRTC: الآيفون يخفي عنوانه كذلك، وأندرويد ما يقدر يحل أسماء .local،
         * فلو أخفينا عنواننا كمان ما يلقى أحد الثاني. يكفي طرف واحد يعلن عنوانه.
         */
        @JavascriptInterface
        public String localIp() {
            try {
                for (java.net.NetworkInterface ni : java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces())) {
                    if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
                    for (java.net.InetAddress a : java.util.Collections.list(ni.getInetAddresses())) {
                        if (a instanceof java.net.Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                    }
                }
            } catch (Exception ignored) {}
            return "";
        }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() { @Override public void run() { finishAffinity(); } });
        }
    }
}
