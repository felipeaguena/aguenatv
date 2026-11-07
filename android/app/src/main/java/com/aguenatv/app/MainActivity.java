package com.aguenatv.app;

import android.content.Context;
import android.graphics.Color;
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
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private static final String DEFAULT_SERVER_URL = "http://163.176.207.140";
    private SwipeRefreshLayout swipeRefreshLayout;

    private boolean isCutoutFullscreenActive = false;

    public void applyCutoutFullscreen(boolean enable) {
        runOnUiThread(() -> {
            try {
                Window window = getWindow();
                if (window == null) return;
                View decorView = window.getDecorView();

                if (enable) {
                    // 1. Edge-to-Edge: desenhar sob 100% da barra de navegação e status
                    WindowCompat.setDecorFitsSystemWindows(window, false);

                    // 2. Sobrepor o notch / entalhe da câmera em landscape
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        WindowManager.LayoutParams params = window.getAttributes();
                        params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                        window.setAttributes(params);
                    }

                    // 3. Torna a barra de navegação e de status 100% transparentes
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        window.setStatusBarColor(Color.TRANSPARENT);
                        window.setNavigationBarColor(Color.TRANSPARENT);
                    }

                    // 4. Oculta barra de status e navegação com Auto-Hide (Immersive Sticky por swipe)
                    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
                    if (controller != null) {
                        controller.hide(WindowInsetsCompat.Type.systemBars());
                        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    }

                    // 5. Flags de fallback para forçar sobreposição de 100% da barra de navegação e auto-hide
                    decorView.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    );
                } else {
                    // Restauração das barras normais de navegação e status fora do fullscreen
                    WindowCompat.setDecorFitsSystemWindows(window, true);

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        WindowManager.LayoutParams params = window.getAttributes();
                        params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                        window.setAttributes(params);
                    }

                    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
                    if (controller != null) {
                        controller.show(WindowInsetsCompat.Type.systemBars());
                    }

                    decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void setCutoutFullscreen(boolean enable) {
            isCutoutFullscreenActive = enable;
            applyCutoutFullscreen(enable);
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
            WebView webView = getBridge().getWebView();
            if (webView != null) {
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

                if (!isNetworkConnected()) {
                    settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
                } else {
                    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
                }
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
                    String host = url.getHost();
                    if ("163.176.207.140".equals(host)) {
                        // Serve recursos estáticos locais (svg, png) quando sem rede
                        if (!isNetworkConnected()) {
                            String path = url.getPath();
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
                // Apenas loga erro sem sobrescrever a tela do usuário
                super.onReceivedError(view, request, error);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Não sobrescreve a página ativa
            }
        });
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
                webView.stopLoading();
                String html = readAssetString("public/index.html");
                webView.loadDataWithBaseURL(DEFAULT_SERVER_URL + "/", html, "text/html", "UTF-8", DEFAULT_SERVER_URL + "/");
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
        if (hasFocus && isCutoutFullscreenActive) {
            applyCutoutFullscreen(true);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (isCutoutFullscreenActive) {
            applyCutoutFullscreen(true);
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
            if (cm != null) {
                NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
                return activeNetwork != null && activeNetwork.isConnectedOrConnecting();
            }
        } catch (Exception ignored) {}
        return false;
    }
}
