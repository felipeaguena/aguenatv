package com.aguenatv.app;

import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

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

                // Configura Pull-to-Refresh nativo com SwipeRefreshLayout
                setupSwipeRefresh(webView);

                // Listener para interceptar erros de rede e desativar spinner
                getBridge().addWebViewListener(new WebViewListener() {
                    @Override
                    public void onPageLoaded(WebView view) {
                        if (swipeRefreshLayout != null) {
                            swipeRefreshLayout.setRefreshing(false);
                            String url = view.getUrl();
                            // Desativa pull-to-refresh na tela do player para não interferir em gestos
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
                        // Se falhou ao conectar ao servidor remoto, abre o portal offline local
                        fallbackToLocalOffline(view);
                    }

                    @Override
                    public void onReceivedHttpError(WebView view) {
                        if (swipeRefreshLayout != null) {
                            swipeRefreshLayout.setRefreshing(false);
                        }
                    }
                });

                // Se abrir o app offline ou em Modo Avião, carrega imediatamente o portal offline local
                if (!isNetworkConnected()) {
                    settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
                    fallbackToLocalOffline(webView);
                } else {
                    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
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
                        if (currentUrl != null && currentUrl.contains("localhost")) {
                            // Estava no portal offline e a rede voltou: recarrega para o servidor de produção
                            webView.loadUrl(DEFAULT_SERVER_URL);
                        } else {
                            webView.reload();
                        }
                    } else {
                        // Sem rede: apenas recarrega o portal local
                        webView.reload();
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

    private void fallbackToLocalOffline(WebView webView) {
        if (webView == null) return;
        webView.post(() -> {
            try {
                String localUrl = getBridge().getLocalUrl();
                String curUrl = webView.getUrl();
                if (localUrl != null && (curUrl == null || !curUrl.startsWith(localUrl))) {
                    webView.loadUrl(localUrl);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
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
                    fallbackToLocalOffline(webView);
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
