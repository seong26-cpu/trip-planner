package app.mylife.haru;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import java.io.File;

/** 나의 하루 — 앱 화면은 APK 안에 들어 있고, 데이터는 사용자 본인의 Apps Script 서버와만 통신합니다. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String HOME = "https://" + HOST + "/assets/index.html";
    static final int PICK = 7;
    WebView web;
    ValueCallback<Uri[]> fileCb;
    Uri camUri;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFFFF6A3D);
        web = new WebView(this);
        setContentView(web);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " MyLifeApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openOutside(u);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("image/*");
                Intent chooser = Intent.createChooser(pick, "사진 선택");
                camUri = null;
                try {
                    File dir = new File(getCacheDir(), "camera");
                    dir.mkdirs();
                    File f = new File(dir, "photo_" + System.currentTimeMillis() + ".jpg");
                    camUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                    Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    cam.putExtra(MediaStore.EXTRA_OUTPUT, camUri);
                    cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (p.isCaptureEnabled()) chooser = cam;
                    else chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
                } catch (Exception e) { camUri = null; }
                try {
                    startActivityForResult(chooser, PICK);
                } catch (ActivityNotFoundException e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });
        load(getIntent());
    }

    /** mylife://connect?u=서버주소 로 열리면 그 서버에 자동 연결 */
    void load(Intent it) {
        String url = HOME;
        Uri d = it != null ? it.getData() : null;
        if (d != null && "mylife".equals(d.getScheme())) {
            String u = d.getQueryParameter("u");
            if (u != null) url = HOME + "#connect=" + Uri.encode(u);
        }
        web.loadUrl(url);
    }

    @Override
    protected void onNewIntent(Intent it) {
        super.onNewIntent(it);
        if (it.getData() != null) load(it);
    }

    void openOutside(Uri u) {
        try {
            Intent i = "intent".equals(u.getScheme()) ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) { /* 열 수 있는 앱이 없으면 무시 */ }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK && fileCb != null) {
            Uri[] out = null;
            if (res == RESULT_OK) {
                if (data != null && data.getData() != null) out = new Uri[]{data.getData()};
                else if (camUri != null) out = new Uri[]{camUri};
            }
            fileCb.onReceiveValue(out);
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
