package com.aguenatv.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundDownload")
public class BackgroundDownloadPlugin extends Plugin {

    private static BackgroundDownloadPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @PluginMethod
    public void startDownload(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        String title = call.getString("title", "Vídeo");
        String fileName = call.getString("fileName");

        if (id == null || url == null || fileName == null) {
            call.reject("Parâmetros obrigatórios ausentes (id, url ou fileName)");
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(context, DownloadForegroundService.class);
        intent.setAction(DownloadForegroundService.ACTION_START_DOWNLOAD);
        intent.putExtra(DownloadForegroundService.EXTRA_ID, id);
        intent.putExtra(DownloadForegroundService.EXTRA_URL, url);
        intent.putExtra(DownloadForegroundService.EXTRA_TITLE, title);
        intent.putExtra(DownloadForegroundService.EXTRA_FILE_NAME, fileName);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }

        JSObject ret = new JSObject();
        ret.put("started", true);
        ret.put("id", id);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id obrigatório");
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(context, DownloadForegroundService.class);
        intent.setAction(DownloadForegroundService.ACTION_CANCEL_DOWNLOAD);
        intent.putExtra(DownloadForegroundService.EXTRA_ID, id);
        context.startService(intent);

        call.resolve();
    }

    public static void emitProgress(String id, String title, long bytes, long total, int percentage) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("id", id);
            data.put("title", title);
            data.put("bytes", bytes);
            data.put("contentLength", total);
            data.put("percentage", percentage);
            instance.notifyListeners("progress", data);
        }
    }

    public static void emitComplete(String id, String title, String path, long size, boolean success, String error) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("id", id);
            data.put("title", title);
            data.put("path", path);
            data.put("size", size);
            data.put("success", success);
            if (error != null) {
                data.put("error", error);
            }
            instance.notifyListeners("complete", data);
        }
    }
}
