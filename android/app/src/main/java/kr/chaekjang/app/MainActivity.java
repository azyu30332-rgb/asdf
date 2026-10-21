package kr.chaekjang.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final int EXPORT = 1001, IMPORT = 1002, MAX_BYTES = 20 * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final List<String> pendingScripts = new ArrayList<>();
    private WebView webView;
    private boolean pageReady, pickerOpen;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        pickerOpen = state != null && state.getBoolean("pickerOpen", false);
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(Color.rgb(247,248,250));
        webView = new WebView(this);
        container.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(container);
        if (Build.VERSION.SDK_INT >= 30) {
            container.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
                return WindowInsets.CONSUMED;
            });
            container.requestApplyInsets();
        }
        WebSettings settings = webView.getSettings();
        // Only the bundled local UI executes JS. Network/file access and navigation are blocked;
        // all user-provided titles, authors, and notes are rendered with textContent.
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        webView.setBackgroundColor(Color.rgb(247,248,250));
        webView.addJavascriptInterface(new NativeFiles(), "ChaekjangNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && "/index.html".equals(uri.getPath()) && "GET".equals(request.getMethod())) {
                    try { return new WebResourceResponse("text/html", "UTF-8", getAssets().open("index.html")); }
                    catch (Exception ignored) { }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public void onPageFinished(WebView view, String url) {
                if (!(ORIGIN + "/index.html").equals(url)) return;
                pageReady = true;
                for (String script : pendingScripts) view.evaluateJavascript(script, null);
                pendingScripts.clear();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle("책장").setMessage(message)
                    .setPositiveButton("확인", (d,w) -> result.confirm())
                    .setNegativeButton("취소", (d,w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel()).show();
                return true;
            }
        });
        webView.loadUrl(ORIGIN + "/index.html");
    }

    private void sendScript(String script) {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            if (pageReady) webView.evaluateJavascript(script, null);
            else pendingScripts.add(script);
        });
    }
    private void notifyUser(String message) {
        sendScript("window.dispatchEvent(new CustomEvent('chaekjang-message',{detail:" + JSONObject.quote(message) + "}));");
    }
    private File pendingBackup() { return new File(getCacheDir(), "pending-backup.json"); }

    public final class NativeFiles {
        @JavascriptInterface public void exportBackup(String text, String filename) {
            runOnUiThread(() -> {
                if (pickerOpen) { notifyUser("파일 선택 창이 이미 열려 있어요."); return; }
                pickerOpen = true;
                io.execute(() -> {
                    try {
                        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                        if (bytes.length > MAX_BYTES) throw new Exception("Backup too large");
                        JSONObject json = new JSONObject(text);
                        if (json.getInt("version") != 1 || json.optJSONArray("books") == null) throw new Exception("Invalid backup");
                        try (FileOutputStream out = new FileOutputStream(pendingBackup())) { out.write(bytes); }
                        runOnUiThread(() -> {
                            try {
                                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                                intent.addCategory(Intent.CATEGORY_OPENABLE);
                                intent.setType("application/json");
                                intent.putExtra(Intent.EXTRA_TITLE, "책장-백업-" + java.time.LocalDate.now() + ".json");
                                startActivityForResult(intent, EXPORT);
                            } catch (Exception e) { pickerOpen = false; pendingBackup().delete(); notifyUser("파일 저장 창을 열지 못했어요."); }
                        });
                    } catch (Exception e) { runOnUiThread(() -> pickerOpen = false); notifyUser("백업을 준비하지 못했어요. 저장 공간을 확인해 주세요."); }
                });
            });
        }
        @JavascriptInterface public void importBackup() {
            runOnUiThread(() -> {
                if (pickerOpen) { notifyUser("파일 선택 창이 이미 열려 있어요."); return; }
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                    pickerOpen = true;
                    startActivityForResult(intent, IMPORT);
                } catch (Exception e) { pickerOpen = false; notifyUser("파일 선택 창을 열지 못했어요."); }
            });
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != EXPORT && requestCode != IMPORT) return;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            pickerOpen = false;
            if (requestCode == EXPORT) pendingBackup().delete();
            return;
        }
        Uri uri = data.getData();
        io.execute(() -> {
            try {
                if (requestCode == EXPORT) {
                    try (InputStream in = new FileInputStream(pendingBackup()); OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                        if (out == null) throw new Exception("No output stream");
                        byte[] buffer = new byte[8192]; int size;
                        while ((size = in.read(buffer)) != -1) out.write(buffer, 0, size);
                    }
                    notifyUser("백업 파일을 저장했어요. 안전하게 보관해 주세요.");
                } else {
                    try (InputStream in = getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                        if (in == null) throw new Exception("No input stream");
                        byte[] buffer = new byte[8192]; int size;
                        while ((size = in.read(buffer)) != -1) {
                            if (out.size() + size > MAX_BYTES) throw new Exception("Backup too large");
                            out.write(buffer, 0, size);
                        }
                        String text = out.toString(StandardCharsets.UTF_8.name());
                        sendScript("window.dispatchEvent(new CustomEvent('chaekjang-restore',{detail:" + JSONObject.quote(text) + "}));");
                    }
                }
            } catch (Exception e) { notifyUser(requestCode == EXPORT ? "파일을 저장하지 못했어요. 저장 공간을 확인해 주세요." : "파일을 읽지 못했어요. 20MB 이하의 JSON 백업인지 확인해 주세요."); }
            finally { if (requestCode == EXPORT) pendingBackup().delete(); runOnUiThread(() -> pickerOpen = false); }
        });
    }
    @Override protected void onSaveInstanceState(Bundle outState) {
        outState.putBoolean("pickerOpen", pickerOpen);
        super.onSaveInstanceState(outState);
    }
    @Override public void onBackPressed() {
        webView.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true;}const s=document.querySelector('#search');if(s&&s===document.activeElement){s.blur();return true;}return false;})()", handled -> {
            if (!"true".equals(handled)) super.onBackPressed();
        });
    }
    @Override protected void onDestroy() {
        if (webView != null) { webView.removeJavascriptInterface("ChaekjangNative"); webView.destroy(); }
        io.shutdown();
        super.onDestroy();
    }
}
