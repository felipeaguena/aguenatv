package com.aguenatv.app;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.WebViewListener;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String DEFAULT_SERVER_URL = "http://163.176.207.140";
    private SwipeRefreshLayout swipeRefreshLayout;

    private boolean isCutoutFullscreenActive = false;

    private static final int SYSTEM_BAR_COLOR_DARK = Color.parseColor("#0b0c10");

    public void applyCutoutFullscreen(boolean enable) {
        runOnUiThread(() -> {
            try {
                Window window = getWindow();
                if (window == null) return;
                View decorView = window.getDecorView();

                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    window.setNavigationBarContrastEnforced(false);
                    window.setStatusBarContrastEnforced(false);
                }

                if (enable) {
                    // 1. Edge-to-Edge: desenhar sob 100% da barra de navegação e status (o vídeo cobre tudo)
                    WindowCompat.setDecorFitsSystemWindows(window, false);

                    // 2. Sobrepor o notch / entalhe da câmera em qualquer orientação (API 30+ usa ALWAYS, API 28-29 usa SHORT_EDGES)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        WindowManager.LayoutParams params = window.getAttributes();
                        params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
                        window.setAttributes(params);
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        WindowManager.LayoutParams params = window.getAttributes();
                        params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                        window.setAttributes(params);
                    }

                    // 3. Fundo 100% preto absoluto na janela e views para eliminar qualquer barra cinza residual do notch
                    window.setBackgroundDrawable(new ColorDrawable(Color.BLACK));
                    decorView.setBackgroundColor(Color.BLACK);
                    try {
                        WebView wv = getBridge().getWebView();
                        if (wv != null) {
                            wv.setBackgroundColor(Color.BLACK);
                            wv.setPadding(0, 0, 0, 0);
                        }
                        if (swipeRefreshLayout != null) {
                            swipeRefreshLayout.setBackgroundColor(Color.BLACK);
                            swipeRefreshLayout.setPadding(0, 0, 0, 0);
                        }
                    } catch (Exception ignored) {}

                    // 4. Torna a barra de navegação e status 100% transparentes para não sobrepor o vídeo
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        window.setStatusBarColor(Color.TRANSPARENT);
                        window.setNavigationBarColor(Color.TRANSPARENT);
                    }

                    // 5. Oculta barra de status e navegação com Auto-Hide imersivo (swipe temporário)
                    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
                    if (controller != null) {
                        controller.hide(WindowInsetsCompat.Type.systemBars());
                        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                        controller.setAppearanceLightStatusBars(false);
                        controller.setAppearanceLightNavigationBars(false);
                    }

                    // 6. Flags de fallback para garantir 100% de imersão em qualquer versão do Android
                    decorView.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    );
                } else {
                    // Restauração das barras fora do fullscreen: cor escura #0b0c10 igual ao fundo do app
                    WindowCompat.setDecorFitsSystemWindows(window, true);

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        WindowManager.LayoutParams params = window.getAttributes();
                        params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                        window.setAttributes(params);
                    }

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        window.setStatusBarColor(SYSTEM_BAR_COLOR_DARK);
                        window.setNavigationBarColor(SYSTEM_BAR_COLOR_DARK);
                    }

                    window.setBackgroundDrawable(new ColorDrawable(SYSTEM_BAR_COLOR_DARK));
                    decorView.setBackgroundColor(SYSTEM_BAR_COLOR_DARK);
                    try {
                        WebView wv = getBridge().getWebView();
                        if (wv != null) wv.setBackgroundColor(SYSTEM_BAR_COLOR_DARK);
                        if (swipeRefreshLayout != null) swipeRefreshLayout.setBackgroundColor(SYSTEM_BAR_COLOR_DARK);
                    } catch (Exception ignored) {}

                    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
                    if (controller != null) {
                        controller.show(WindowInsetsCompat.Type.systemBars());
                        controller.setAppearanceLightStatusBars(false);
                        controller.setAppearanceLightNavigationBars(false);
                    }

                    decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (isCutoutFullscreenActive) {
            applyCutoutFullscreen(true);
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void setCutoutFullscreen(boolean enable) {
            isCutoutFullscreenActive = enable;
            applyCutoutFullscreen(enable);
        }

        @JavascriptInterface
        public boolean isNetworkConnected() {
            return MainActivity.this.isNetworkConnected();
        }

        @JavascriptInterface
        public void loadOfflinePortal() {
            try {
                WebView wv = getBridge().getWebView();
                MainActivity.this.loadOfflinePortal(wv);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public String getOfflineDownloadsJson() {
            try {
                File videosDir = new File(getFilesDir(), "videos");
                if (!videosDir.exists()) {
                    videosDir.mkdirs();
                }

                JSONObject manifestObj = new JSONObject();
                File manifestFile = new File(videosDir, "downloads_manifest.json");
                if (manifestFile.exists()) {
                    try {
                        String manifestContent = readFileToString(manifestFile);
                        if (manifestContent != null && !manifestContent.trim().isEmpty()) {
                            manifestObj = new JSONObject(manifestContent);
                        }
                    } catch (Exception ignored) {}
                }

                File[] files = videosDir.listFiles();
                if (files != null) {
                    for (File file : files) {
                        String name = file.getName();
                        if (name.startsWith("offline_") && !name.endsWith(".tmp") && !name.endsWith(".json")) {
                            String withoutPrefix = name.substring("offline_".length());
                            int lastDot = withoutPrefix.lastIndexOf('.');
                            String cleanId = (lastDot != -1) ? withoutPrefix.substring(0, lastDot) : withoutPrefix;
                            String ext = (lastDot != -1) ? withoutPrefix.substring(lastDot + 1) : "mp4";

                            JSONObject item = null;

                            // 1. Tenta carregar do companion JSON individual (offline_{id}.json)
                            File companionJson = new File(videosDir, "offline_" + cleanId + ".json");
                            if (companionJson.exists()) {
                                try {
                                    String cContent = readFileToString(companionJson);
                                    if (cContent != null && !cContent.trim().isEmpty()) {
                                        item = new JSONObject(cContent);
                                    }
                                } catch (Exception ignored) {}
                            }

                            // 2. Se não encontrou, busca no manifesto mestre
                            if (item == null && manifestObj.has(cleanId)) {
                                try {
                                    item = manifestObj.getJSONObject(cleanId);
                                } catch (Exception ignored) {}
                            }

                            // 3. Se ainda não possui metadados, sintetiza com base no nome do arquivo físico
                            if (item == null) {
                                item = new JSONObject();
                                boolean isMovie = cleanId.startsWith("movie_");
                                String streamId = cleanId;
                                Integer sNum = null;
                                Integer eNum = null;

                                if (isMovie) {
                                    streamId = cleanId.replace("movie_", "");
                                    item.put("stream_type", "movie");
                                    item.put("title", "Filme " + streamId);
                                } else {
                                    item.put("stream_type", "series");
                                    String[] parts = cleanId.split("_");
                                    if (parts.length > 1) streamId = parts[1];
                                    if (parts.length > 2 && parts[2].startsWith("s")) {
                                        try { sNum = Integer.parseInt(parts[2].substring(1)); } catch (Exception ignored) {}
                                    }
                                    if (parts.length > 3 && parts[3].startsWith("e")) {
                                        try { eNum = Integer.parseInt(parts[3].substring(1)); } catch (Exception ignored) {}
                                    }
                                    String epLabel = (sNum != null && eNum != null) ? " (T" + sNum + ":E" + eNum + ")" : "";
                                    item.put("title", "Série " + streamId + epLabel);
                                    item.put("series_title", "Série " + streamId);
                                    if (sNum != null) item.put("season_num", sNum);
                                    if (eNum != null) {
                                        item.put("episode_num", eNum);
                                        item.put("episode_id", eNum);
                                    }
                                }

                                item.put("id", cleanId);
                                item.put("stream_id", streamId);
                                item.put("container_extension", ext);
                                item.put("downloaded_at", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date(file.lastModified())));
                            }

                            item.put("file_path", "videos/" + name);
                            item.put("file_size", file.length());
                            if (!item.has("id")) item.put("id", cleanId);

                            manifestObj.put(cleanId, item);

                            if (!companionJson.exists()) {
                                try {
                                    writeStringToFile(companionJson, item.toString(2));
                                } catch (Exception ignored) {}
                            }
                        }
                    }
                }

                try {
                    writeStringToFile(manifestFile, manifestObj.toString(2));
                } catch (Exception ignored) {}

                JSONArray array = new JSONArray();
                Iterator<String> keys = manifestObj.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    array.put(manifestObj.getJSONObject(k));
                }
                return array.toString();
            } catch (Exception e) {
                e.printStackTrace();
                return "[]";
            }
        }

        @JavascriptInterface
        public boolean saveOfflineMetadata(String id, String jsonString) {
            try {
                if (id == null || jsonString == null) return false;
                File videosDir = new File(getFilesDir(), "videos");
                if (!videosDir.exists()) videosDir.mkdirs();

                File companionJson = new File(videosDir, "offline_" + id + ".json");
                writeStringToFile(companionJson, jsonString);

                File manifestFile = new File(videosDir, "downloads_manifest.json");
                JSONObject manifestObj = new JSONObject();
                if (manifestFile.exists()) {
                    try {
                        String content = readFileToString(manifestFile);
                        if (content != null && !content.trim().isEmpty()) {
                            manifestObj = new JSONObject(content);
                        }
                    } catch (Exception ignored) {}
                }
                manifestObj.put(id, new JSONObject(jsonString));
                writeStringToFile(manifestFile, manifestObj.toString(2));

                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        @JavascriptInterface
        public boolean deleteOfflineVideo(String id, String filePath) {
            try {
                File videosDir = new File(getFilesDir(), "videos");

                if (id != null) {
                    File cJson = new File(videosDir, "offline_" + id + ".json");
                    if (cJson.exists()) cJson.delete();
                }

                if (filePath != null) {
                    String fileName = filePath.contains("/") ? filePath.substring(filePath.lastIndexOf('/') + 1) : filePath;
                    File vFile = new File(videosDir, fileName);
                    if (vFile.exists()) vFile.delete();
                } else if (id != null) {
                    File[] list = videosDir.listFiles();
                    if (list != null) {
                        for (File f : list) {
                            if (f.getName().startsWith("offline_" + id + ".")) {
                                f.delete();
                            }
                        }
                    }
                }

                File manifestFile = new File(videosDir, "downloads_manifest.json");
                if (manifestFile.exists() && id != null) {
                    try {
                        String content = readFileToString(manifestFile);
                        if (content != null && !content.trim().isEmpty()) {
                            JSONObject manifestObj = new JSONObject(content);
                            manifestObj.remove(id);
                            writeStringToFile(manifestFile, manifestObj.toString(2));
                        }
                    } catch (Exception ignored) {}
                }

                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        @JavascriptInterface
        public String getOfflineVideoUrl(String fileName) {
            if (fileName == null) return "";
            if (fileName.contains("/")) {
                fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
            }
            return DEFAULT_SERVER_URL + "/_local_video_/" + fileName;
        }
    }

    public boolean isTvApp() {
        return "com.aguenatv.tv".equals(getPackageName());
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundDownloadPlugin.class);
        super.onCreate(savedInstanceState);

        try {
            Window window = getWindow();
            if (window != null) {
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    window.setStatusBarColor(SYSTEM_BAR_COLOR_DARK);
                    window.setNavigationBarColor(SYSTEM_BAR_COLOR_DARK);
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    window.setNavigationBarContrastEnforced(false);
                    window.setStatusBarContrastEnforced(false);
                }
                window.setBackgroundDrawable(new ColorDrawable(SYSTEM_BAR_COLOR_DARK));
                View decorView = window.getDecorView();
                decorView.setBackgroundColor(SYSTEM_BAR_COLOR_DARK);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
                if (controller != null) {
                    controller.setAppearanceLightStatusBars(false);
                    controller.setAppearanceLightNavigationBars(false);
                }
            }
        } catch (Exception ignored) {}

        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.setBackgroundColor(SYSTEM_BAR_COLOR_DARK);
                webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
                WebSettings settings = webView.getSettings();
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);

                if (isTvApp()) {
                    // Configurações exclusivas para Android TV e Tablet
                    webView.setFocusable(true);
                    webView.setFocusableInTouchMode(true);
                    webView.requestFocus();
                    webView.post(() -> {
                        String currentUrl = webView.getUrl();
                        if (currentUrl == null || currentUrl.endsWith("/80") || currentUrl.endsWith(":80/") || currentUrl.equals("http://163.176.207.140") || currentUrl.equals("http://163.176.207.140/")) {
                            webView.loadUrl("http://163.176.207.140/tv");
                        }
                    });
                }

                // Configura cliente customizado para recursos locais sem interceptar navegação normal
                setupCustomWebViewClient(webView);

                // Configura Pull-to-Refresh nativo com SwipeRefreshLayout
                setupSwipeRefresh(webView);
                if (isTvApp() && swipeRefreshLayout != null) {
                    swipeRefreshLayout.setEnabled(false);
                }

                // Listener para eventos de carregamento e desativação do spinner
                getBridge().addWebViewListener(new WebViewListener() {
                    @Override
                    public void onPageLoaded(WebView view) {
                        if (swipeRefreshLayout != null) {
                            swipeRefreshLayout.setRefreshing(false);
                            if (isTvApp()) {
                                swipeRefreshLayout.setEnabled(false);
                            } else {
                                String url = view.getUrl();
                                if (url != null && url.contains("/watch")) {
                                    swipeRefreshLayout.setEnabled(false);
                                } else {
                                    swipeRefreshLayout.setEnabled(true);
                                }
                            }
                        }
                    }

                    @Override
                    public void onReceivedError(WebView view) {
                        if (swipeRefreshLayout != null) {
                            swipeRefreshLayout.setRefreshing(false);
                        }
                        // NUNCA redireciona automaticamente para portal offline em erros durante a navegação
                    }

                    @Override
                    public void onReceivedHttpError(WebView view) {
                        if (swipeRefreshLayout != null) {
                            swipeRefreshLayout.setRefreshing(false);
                        }
                    }
                });

                settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void setupCustomWebViewClient(WebView webView) {
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url != null) {
                    String path = url.getPath();

                    // Intercepta arquivos de vídeo offline (local) para reprodução offline instantânea com busca/range
                    if (path != null && (path.contains("/_local_video_/") || path.contains("/videos/offline_"))) {
                        String fileName = path.substring(path.lastIndexOf('/') + 1);
                        try {
                            fileName = java.net.URLDecoder.decode(fileName, "UTF-8");
                        } catch (Exception ignored) {}
                        File videoFile = new File(new File(getFilesDir(), "videos"), fileName);
                        if (!videoFile.exists()) {
                            int dot = fileName.lastIndexOf('.');
                            String base = dot != -1 ? fileName.substring(0, dot) : fileName;
                            File[] candidates = new File(getFilesDir(), "videos").listFiles((dir, fName) ->
                                fName.startsWith(base) && !fName.endsWith(".tmp") && !fName.endsWith(".json")
                            );
                            if (candidates != null && candidates.length > 0) {
                                videoFile = candidates[0];
                            }
                        }
                        if (videoFile.exists() && videoFile.isFile()) {
                            return serveLocalVideoFile(request, videoFile);
                        }
                    }

                    String host = url.getHost();
                    if ("163.176.207.140".equals(host)) {
                        // Serve recursos estáticos locais (svg, png) quando sem rede
                        if (!isNetworkConnected()) {
                            if (path != null && (path.endsWith(".svg") || path.endsWith(".png") || path.endsWith(".ico"))) {
                                try {
                                    String assetPath = "public" + path;
                                    InputStream is = getAssets().open(assetPath);
                                    String mime = path.endsWith(".svg") ? "image/svg+xml" : "image/png";
                                    return new WebResourceResponse(mime, "UTF-8", is);
                                } catch (Exception ignored) {}
                            }
                        }
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame() && !isNetworkConnected()) {
                    loadOfflinePortal(view);
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Não faz nada em APIs antigas para evitar sobrescrever a página ativa por falha em sub-recursos
            }
        });
    }

    private WebResourceResponse serveLocalVideoFile(WebResourceRequest request, File videoFile) {
        try {
            long fileLength = videoFile.length();
            if (fileLength <= 0) {
                return null;
            }

            String mimeType = "video/mp4";
            String lowerName = videoFile.getName().toLowerCase(Locale.ROOT);
            if (lowerName.endsWith(".webm")) {
                mimeType = "video/webm";
            }

            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Access-Control-Allow-Headers", "*");
            headers.put("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
            headers.put("Content-Type", mimeType);
            headers.put("Cache-Control", "no-cache, no-store, must-revalidate");

            // Resposta para requisição HEAD (verificação preliminar do player sem consumir dados)
            if (request != null && "HEAD".equalsIgnoreCase(request.getMethod())) {
                headers.put("Content-Length", String.valueOf(fileLength));
                return new WebResourceResponse(mimeType, null, 200, "OK", headers, new java.io.ByteArrayInputStream(new byte[0]));
            }

            String rangeHeader = null;
            if (request != null && request.getRequestHeaders() != null) {
                rangeHeader = request.getRequestHeaders().get("Range");
                if (rangeHeader == null) {
                    rangeHeader = request.getRequestHeaders().get("range");
                }
            }

            long start = 0;
            long end = fileLength - 1;
            boolean isRange = false;

            if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                String rangeVal = rangeHeader.substring(6).trim();
                int comma = rangeVal.indexOf(',');
                if (comma != -1) {
                    rangeVal = rangeVal.substring(0, comma).trim();
                }

                int dash = rangeVal.indexOf('-');
                if (dash != -1) {
                    String startStr = rangeVal.substring(0, dash).trim();
                    String endStr = rangeVal.substring(dash + 1).trim();

                    if (!startStr.isEmpty() && !endStr.isEmpty()) {
                        // Ex: bytes=1000-2000
                        try {
                            start = Long.parseLong(startStr);
                            end = Long.parseLong(endStr);
                            isRange = true;
                        } catch (Exception ignored) {}
                    } else if (!startStr.isEmpty()) {
                        // Ex: bytes=1000- (até o final do arquivo)
                        try {
                            start = Long.parseLong(startStr);
                            end = fileLength - 1;
                            isRange = true;
                        } catch (Exception ignored) {}
                    } else if (!endStr.isEmpty()) {
                        // Ex: bytes=-1048576 (sufixo: últimos N bytes do arquivo, ex: atom moov do MP4!)
                        try {
                            long suffix = Long.parseLong(endStr);
                            start = Math.max(0, fileLength - suffix);
                            end = fileLength - 1;
                            isRange = true;
                        } catch (Exception ignored) {}
                    }
                }
            }

            if (end >= fileLength) {
                end = fileLength - 1;
            }
            if (start < 0) {
                start = 0;
            }
            if (start > end) {
                start = end;
            }

            long contentLength = end - start + 1;
            int statusCode = isRange ? 206 : 200;
            String statusMsg = isRange ? "Partial Content" : "OK";

            if (isRange) {
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + fileLength);
            }
            headers.put("Content-Length", String.valueOf(contentLength));

            // Stream inteligente com suporte nativo a seek/skip aleatório sem duplo pulo do Chromium
            InputStream stream = new SmartVideoInputStream(videoFile, start, end);
            return new WebResourceResponse(mimeType, null, statusCode, statusMsg, headers, stream);
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    private static class SmartVideoInputStream extends InputStream {
        private final RandomAccessFile raf;
        private final long fileLength;
        private final long intendedStart;
        private final long intendedEnd;
        private long position = 0;
        private boolean initialSeekHandled = false;

        SmartVideoInputStream(File file, long start, long end) throws IOException {
            this.raf = new RandomAccessFile(file, "r");
            this.fileLength = file.length();
            this.intendedStart = Math.max(0, Math.min(start, fileLength - 1));
            this.intendedEnd = Math.max(this.intendedStart, Math.min(end, fileLength - 1));
            this.position = 0;
            if (this.intendedStart == 0) {
                this.initialSeekHandled = true;
            }
        }

        private void ensurePositioned() throws IOException {
            if (!initialSeekHandled) {
                initialSeekHandled = true;
                position = intendedStart;
                raf.seek(position);
            }
        }

        @Override
        public int read() throws IOException {
            ensurePositioned();
            if (position > intendedEnd) {
                return -1;
            }
            int b = raf.read();
            if (b != -1) {
                position++;
            }
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            ensurePositioned();
            if (position > intendedEnd) {
                return -1;
            }
            long maxToRead = intendedEnd - position + 1;
            int toRead = (int) Math.min((long) len, maxToRead);
            if (toRead <= 0) {
                return -1;
            }
            int bytesRead = raf.read(b, off, toRead);
            if (bytesRead != -1) {
                position += bytesRead;
            }
            return bytesRead;
        }

        @Override
        public long skip(long n) throws IOException {
            if (n <= 0) return 0;

            if (!initialSeekHandled) {
                initialSeekHandled = true;
                // Se o Chromium está tentando pular para intendedStart (comportamento do AndroidStreamReaderURLLoader)
                if (n == intendedStart) {
                    position = intendedStart;
                    raf.seek(position);
                    return n;
                } else {
                    long target = Math.min(intendedStart + n, intendedEnd + 1);
                    position = target;
                    raf.seek(position);
                    return n;
                }
            }

            long target = Math.min(position + n, intendedEnd + 1);
            long skipped = target - position;
            position = target;
            raf.seek(position);
            return skipped;
        }

        @Override
        public int available() throws IOException {
            ensurePositioned();
            long rem = (intendedEnd >= position) ? (intendedEnd - position + 1) : 0;
            return rem > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) rem;
        }

        @Override
        public void close() throws IOException {
            try {
                raf.close();
            } catch (Exception ignored) {}
        }
    }

    private static String readFileToString(File file) throws Exception {
        try (InputStream is = new FileInputStream(file);
             BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            return sb.toString();
        }
    }

    private static void writeStringToFile(File file, String content) throws Exception {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(content.getBytes(StandardCharsets.UTF_8));
            fos.flush();
        }
    }

    private void setupSwipeRefresh(WebView webView) {
        try {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                int index = parent.indexOfChild(webView);
                ViewGroup.LayoutParams params = webView.getLayoutParams();
                parent.removeView(webView);

                swipeRefreshLayout = new SwipeRefreshLayout(this);
                swipeRefreshLayout.setLayoutParams(params);
                swipeRefreshLayout.addView(webView, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                ));
                parent.addView(swipeRefreshLayout, index);

                // Cores do tema AGUENATV (Violeta / Indigo)
                swipeRefreshLayout.setColorSchemeColors(
                        Color.parseColor("#8b5cf6"),
                        Color.parseColor("#6366f1")
                );
                swipeRefreshLayout.setProgressBackgroundColorSchemeColor(Color.parseColor("#181924"));

                swipeRefreshLayout.setOnRefreshListener(() -> {
                    if (isNetworkConnected()) {
                        String currentUrl = webView.getUrl();
                        if (currentUrl == null || currentUrl.contains("data:text/html") || currentUrl.contains("localhost")) {
                            webView.loadUrl(DEFAULT_SERVER_URL);
                        } else {
                            webView.reload();
                        }
                    } else {
                        // Quando sem internet, apenas desliga o spinner sem sobrescrever a página
                        swipeRefreshLayout.setRefreshing(false);
                    }
                });

                // Dispara o refresh somente quando estiver exatamente no topo da página
                swipeRefreshLayout.setOnChildScrollUpCallback((parentLayout, child) -> {
                    return webView.getScrollY() > 0;
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void loadOfflinePortal(WebView webView) {
        if (webView == null) return;
        webView.post(() -> {
            try {
                String current = webView.getUrl();
                if (current != null && current.contains("offline_portal")) return;
                webView.stopLoading();
                String html = readAssetString("public/index.html");
                webView.loadDataWithBaseURL(DEFAULT_SERVER_URL + "/offline_portal", html, "text/html", "UTF-8", DEFAULT_SERVER_URL + "/offline_portal");
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private String readAssetString(String assetPath) {
        try (InputStream is = getAssets().open(assetPath);
             BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            return sb.toString();
        } catch (Exception e) {
            try (InputStream is2 = getAssets().open("index.html");
                 BufferedReader reader2 = new BufferedReader(new InputStreamReader(is2, StandardCharsets.UTF_8))) {
                StringBuilder sb2 = new StringBuilder();
                String line2;
                while ((line2 = reader2.readLine()) != null) {
                    sb2.append(line2).append("\n");
                }
                return sb2.toString();
            } catch (Exception e2) {
                return "<!DOCTYPE html><html><body style='background:#0b0c10;color:#fff;padding:24px;font-family:sans-serif;'><h2>AGUENATV - Modo Offline</h2><p>Sem conexão de rede no momento.</p></body></html>";
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try {
            applyCutoutFullscreen(false);
        } catch (Exception ignored) {}
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            if (isCutoutFullscreenActive) {
                applyCutoutFullscreen(true);
            } else {
                applyCutoutFullscreen(false);
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (isCutoutFullscreenActive) {
            applyCutoutFullscreen(true);
        } else {
            applyCutoutFullscreen(false);
        }
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                if (!isNetworkConnected()) {
                    settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
                } else {
                    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (isTvApp()) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                keyCode == KeyEvent.KEYCODE_DPAD_UP ||
                keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
                keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
                keyCode == KeyEvent.KEYCODE_ENTER ||
                keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE ||
                keyCode == KeyEvent.KEYCODE_MEDIA_PLAY ||
                keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE ||
                keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD ||
                keyCode == KeyEvent.KEYCODE_MEDIA_REWIND) {
                WebView webView = getBridge().getWebView();
                if (webView != null && !webView.hasFocus()) {
                    webView.requestFocus();
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private boolean isNetworkConnected() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.net.Network activeNetwork = cm.getActiveNetwork();
                if (activeNetwork != null) {
                    android.net.NetworkCapabilities capabilities = cm.getNetworkCapabilities(activeNetwork);
                    if (capabilities != null) {
                        return capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
                    }
                }
                return false;
            } else {
                NetworkInfo activeNetworkInfo = cm.getActiveNetworkInfo();
                return activeNetworkInfo != null && activeNetworkInfo.isConnected();
            }
        } catch (Exception ignored) {}
        return true;
    }
}
