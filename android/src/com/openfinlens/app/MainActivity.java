package com.openfinlens.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/* OpenFinLens 安卓壳：WebView 加载 GitHub Pages 站点（与网页版同一份数据源/降级链）。
   DOM Storage 打开——网页版的收藏/设置存 localStorage，App 里同样生效。
   刻意不做原生功能面（推送/定位等）：保持"纯前端 + 零权限收集"的家规。 */
public class MainActivity extends Activity {

    private static final String HOME = "https://5777-wq.github.io/openfinlens/";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // targetSdk 29 默认禁止混合内容（MIXED_CONTENT_NEVER_ALLOW），无需显式设置
        web.setBackgroundColor(0xFF0A0A0B);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                // 站内（含页内 hash 路由）留在壳里；其他域名交给系统浏览器
                if (url != null && url.startsWith("https://5777-wq.github.io/")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, int code, String desc, String failingUrl) {
                // 只对主页面报错生效（favicon 之类的子资源失败不触发）
                if (failingUrl == null || !failingUrl.startsWith("https://5777-wq.github.io/")) return;
                offline();
            }
        });
        web.loadUrl(HOME);
        setContentView(web);
    }

    private void offline() {
        web.loadDataWithBaseURL(null,
                "<body style=\"background:#0a0a0b;color:#9a9aa2;font-family:monospace;"
                        + "text-align:center;padding-top:40%\">网络不可用，10 秒后自动重试…</body>",
                "text/html", "utf-8", null);
        web.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.loadUrl(HOME);
            }
        }, 10000);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeCallbacks(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
