package com.aguenatv.app;

import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundDownloadPlugin.class);
        super.onCreate(savedInstanceState);

        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);

                // Configura cliente customizado para interceptar requisições offline
                setupCustomWebViewClient(webView);

                // Configura Pull-to-Refresh nativo com SwipeRefreshLayout
                setupSwipeRefresh(webView);

                // Listener para eventos de carregamento e desativação do spinner
                getBridge().addWebViewListener(new WebViewListener() {
                    @Override
                    public void onPageLoaded(WebView view) {
                        if (swipeRefreshLayout != null) {
                            swipeRefreshLayout.setRefreshing(false);
                            String url = view.getUrl();
                            if (url != null && url.contains("/watch")) {
                                swipeRefreshLayout.setEnabled(false);
                            } else {
                                swipeRefreshLayout.setEnabled(true);
                            }
                        }
                    }

                    @Override
                    public void onReceivedError(WebView view) {
                        if (swipeRefreshLayout != null) {
                            swipeRefreshLayout.setRefreshing(false);
                        }
                        loadOfflinePortal(view);
                    }

                    @Override
                    public void onReceivedHttpError(WebView view) {
                        if (swipeRefreshLayout != null) {
                            swipeRefreshLayout.setRefreshing(false);
                        }
                    }
                });

                // Se abrir o app offline ou em Modo Avião, para conexões remotas e carrega imediatamente o portal offline local
                if (!isNetworkConnected()) {
                    webView.stopLoading();
                    settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
                    loadOfflinePortal(webView);
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
                        // Se estiver sem conexão e for requisição de página principal HTML
                        if (!isNetworkConnected() && request.isForMainFrame()) {
                            try {
                                InputStream is = getAssets().open("public/index.html");
                                return new WebResourceResponse("text/html", "UTF-8", is);
                            } catch (Exception ignored) {}
                        }
                        // Serve recursos estáticos locais (svg, png)
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
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                if (url != null && url.contains("163.176.207.140") && !isNetworkConnected()) {
                    try {
                        InputStream is = getAssets().open("public/index.html");
                        return new WebResourceResponse("text/html", "UTF-8", is);
                    } catch (Exception ignored) {}
                }
                return super.shouldInterceptRequest(view, url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    loadOfflinePortal(view);
                    return;
                }
                super.onReceivedError(view, request, error);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                loadOfflinePortal(view);
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
                        loadOfflinePortal(webView);
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

    private void loadOfflinePortal(WebView webView) {
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
    public void onResume() {
        super.onResume();
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                if (!isNetworkConnected()) {
                    settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
                    loadOfflinePortal(webView);
                } else {
                    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
                }
            }
        } catch (Exception ignored) {}
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
