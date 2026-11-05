package com.aguenatv.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundDownload")
public class BackgroundDownloadPlugin extends Plugin {

    @PluginMethod
    public void startDownload(PluginCall call) {
        String title = call.getString("title", "Vídeo");
        Context context = getContext();
        Intent intent = new Intent(context, DownloadForegroundService.class);
        intent.setAction(DownloadForegroundService.ACTION_START);
        intent.putExtra(DownloadForegroundService.EXTRA_TITLE, title);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void updateProgress(PluginCall call) {
        int progress = call.getInt("progress", 0);
        String subtext = call.getString("subtext", "");
        Context context = getContext();
        Intent intent = new Intent(context, DownloadForegroundService.class);
        intent.setAction(DownloadForegroundService.ACTION_PROGRESS);
        intent.putExtra(DownloadForegroundService.EXTRA_PROGRESS, progress);
        intent.putExtra(DownloadForegroundService.EXTRA_SUBTEXT, subtext);

        context.startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stopDownload(PluginCall call) {
        boolean success = call.getBoolean("success", true);
        String title = call.getString("title", "");
        Context context = getContext();
        Intent intent = new Intent(context, DownloadForegroundService.class);
        intent.setAction(DownloadForegroundService.ACTION_STOP);
        intent.putExtra(DownloadForegroundService.EXTRA_SUCCESS, success);
        intent.putExtra(DownloadForegroundService.EXTRA_TITLE, title);

        context.startService(intent);
        call.resolve();
    }
}
