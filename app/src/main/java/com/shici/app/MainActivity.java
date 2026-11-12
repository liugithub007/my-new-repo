package com.shici.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 拾词 App 外壳：用系统 WebView 运行内置的网页（assets/www/，构建时从仓库的 web/ 目录复制）。
 * - 网页固定从 https://appassets.androidplatform.net/ 这个虚拟地址加载，
 *   所以学习进度（localStorage）在 App 升级后保持不变，1.x 版本的进度也能自动迁移。
 * - 通过 ShiciNative 给网页提供：系统朗读、把进度备份到“下载/拾词”、每日提醒、打开链接。
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final int REQ_FILE = 1;
    private static final int REQ_NOTIFY = 3;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private final Map<String, Uri> savedUris = new HashMap<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        removeLegacyOverride();
        styleSystemBars(isSystemDark());

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.addJavascriptInterface(new Bridge(), "ShiciNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u != null && HOST.equals(u.getHost())) return serve(u.getPath());
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u != null && HOST.equals(u.getHost())) return false;
                openExternal(u);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                try {
                    startActivityForResult(Intent.createChooser(i, "选择备份文件"), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        tts = new TextToSpeech(this, status -> ttsReady = (status == TextToSpeech.SUCCESS));

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    private boolean isSystemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /** 状态栏、导航栏颜色跟随网页主题。 */
    private void styleSystemBars(boolean dark) {
        Window w = getWindow();
        int color = Color.parseColor(dark ? "#0F131D" : "#F3F5F9");
        w.setStatusBarColor(color);
        w.setNavigationBarColor(color);
        if (Build.VERSION.SDK_INT >= 23) {
            int flags = 0;
            if (!dark) {
                flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            w.getDecorView().setSystemUiVisibility(flags);
        }
        if (web != null) web.setBackgroundColor(color);
    }

    /** 1.x 版本支持手动安装网页更新包（files/www/），2.0 起网页随 App 一起更新，清掉旧的更新包。 */
    private void removeLegacyOverride() {
        File dir = new File(getFilesDir(), "www");
        File[] fs = dir.listFiles();
        if (fs != null) for (File f : fs) //noinspection ResultOfMethodCallIgnored
            f.delete();
        //noinspection ResultOfMethodCallIgnored
        dir.delete();
    }

    /** 加载 App 自带的网页文件。 */
    private WebResourceResponse serve(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        String name = path.substring(1);
        if (name.contains("..")) return notFound();
        InputStream in;
        try {
            in = getAssets().open("www/" + name);
        } catch (IOException e) {
            return notFound();
        }
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        return new WebResourceResponse(mimeOf(name), "utf-8", 200, "OK", headers, in);
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeOf(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js")) return "application/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".webmanifest")) return "application/manifest+json";
        if (n.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private void openExternal(Uri u) {
        if (u == null) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "没有可以打开链接的应用", Toast.LENGTH_SHORT).show();
        }
    }

    /** 把文本保存到“下载/拾词/”（Android 10 及以上），卸载 App 也不会删除。 */
    private String saveToDownloads(String name, String data) throws IOException {
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = getContentResolver();
            Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            String rel = Environment.DIRECTORY_DOWNLOADS + "/拾词/";
            Uri target = savedUris.get(name);
            if (target == null) {
                String sel = MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
                try (Cursor c = cr.query(collection, new String[]{MediaStore.MediaColumns._ID}, sel, new String[]{rel, name}, null)) {
                    if (c != null && c.moveToFirst()) target = ContentUris.withAppendedId(collection, c.getLong(0));
                }
            }
            if (target == null) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, rel);
                target = cr.insert(collection, v);
                if (target == null) throw new IOException("无法在下载文件夹创建文件");
            }
            try (OutputStream os = cr.openOutputStream(target, "wt")) {
                if (os == null) throw new IOException("无法写入文件");
                os.write(bytes);
            } catch (IOException | SecurityException e) {
                savedUris.remove(name);
                throw e instanceof IOException ? (IOException) e : new IOException(e.getMessage());
            }
            savedUris.put(name, target);
            return "下载/拾词/" + name;
        }
        File dir = getExternalFilesDir("backup");
        if (dir == null) dir = new File(getFilesDir(), "backup");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("无法创建备份文件夹");
        File f = new File(dir, name);
        try (FileOutputStream os = new FileOutputStream(f)) {
            os.write(bytes);
        }
        return f.getAbsolutePath();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) fileCallback.onReceiveValue(uri != null ? new Uri[]{uri} : null);
            fileCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_NOTIFY && (results.length == 0 || results[0] != PackageManager.PERMISSION_GRANTED)) {
            Toast.makeText(this, "没有通知权限，提醒无法显示。可以在系统设置里给拾词打开通知。", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.__shiciBack && window.__shiciBack()) ? 'y' : 'n'", value -> {
            if (value == null || !value.contains("y")) moveTaskToBack(true);
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }

    /** 网页里通过 window.ShiciNative 调用的方法（在后台线程执行）。 */
    private class Bridge {
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public String version() {
            String name = "?";
            int code = 0;
            try {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                name = pi.versionName;
                code = pi.versionCode;
            } catch (Exception ignored) {
            }
            return name + "|" + code;
        }

        @JavascriptInterface
        public boolean ttsAvailable() {
            return ttsReady;
        }

        @JavascriptInterface
        public void speak(String text, String lang, float rate) {
            if (!ttsReady || text == null) return;
            Locale loc = "en-GB".equals(lang) ? Locale.UK : Locale.US;
            int r = tts.setLanguage(loc);
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.ENGLISH);
            tts.setSpeechRate(rate > 0.2f && rate < 3f ? rate : 1f);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "shici");
        }

        @JavascriptInterface
        public String saveBackup(String name, String data) {
            if (name == null || data == null || name.contains("/") || name.contains("..")) return "ERR 文件名不对";
            try {
                return saveToDownloads(name, data);
            } catch (Exception e) {
                return "ERR " + e.getMessage();
            }
        }

        /** 开关每日提醒。h:m 为本地时间。返回是否设置成功。 */
        @JavascriptInterface
        public boolean setReminder(boolean on, int h, int m, String text) {
            SharedPreferences p = Reminder.prefs(MainActivity.this);
            SharedPreferences.Editor e = p.edit().putBoolean("on", on).putInt("h", Math.max(0, Math.min(23, h))).putInt("m", Math.max(0, Math.min(59, m)));
            if (text != null && !text.isEmpty()) e.putString("text", text);
            e.apply();
            try {
                if (on) {
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                        runOnUiThread(() -> requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFY));
                    }
                    Reminder.schedule(MainActivity.this);
                } else {
                    Reminder.cancel(MainActivity.this);
                }
                return true;
            } catch (Exception ex) {
                return false;
            }
        }

        /** 更新提醒里显示的“今天要复习多少”。 */
        @JavascriptInterface
        public void setReminderText(String text) {
            if (text == null) return;
            Reminder.prefs(MainActivity.this).edit().putString("text", text).putLong("textDay", System.currentTimeMillis()).apply();
        }

        @JavascriptInterface
        public void setDark(boolean dark) {
            runOnUiThread(() -> styleSystemBars(dark));
        }

        @JavascriptInterface
        public boolean systemDark() {
            return isSystemDark();
        }

        @JavascriptInterface
        public void openUrl(String url) {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
            runOnUiThread(() -> openExternal(Uri.parse(url)));
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }
    }
}
