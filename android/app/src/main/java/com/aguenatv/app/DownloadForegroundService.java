package com.aguenatv.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class DownloadForegroundService extends Service {
    public static final String CHANNEL_ID = "aguenatv_downloads_channel";
    public static final String CHANNEL_NAME = "Downloads AGUENATV";
    public static final String COMPLETE_CHANNEL_ID = "aguenatv_complete_channel";
    public static final String COMPLETE_CHANNEL_NAME = "Downloads Concluídos";

    public static final int NOTIFICATION_ID = 9901;

    public static final String ACTION_START = "com.aguenatv.app.START_DOWNLOAD";
    public static final String ACTION_PROGRESS = "com.aguenatv.app.UPDATE_PROGRESS";
    public static final String ACTION_STOP = "com.aguenatv.app.STOP_DOWNLOAD";

    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_PROGRESS = "extra_progress";
    public static final String EXTRA_SUBTEXT = "extra_subtext";
    public static final String EXTRA_SUCCESS = "extra_success";

    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;
    private NotificationCompat.Builder notificationBuilder;
    private String currentTitle = "Vídeo";

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannels();

        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aguenatv:download_wakelock");
                wakeLock.setReferenceCounted(false);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            // Canal em andamento (silencioso para não apitar a cada atualização de %)
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notificações de progresso de downloads em segundo plano");
            channel.enableVibration(false);
            channel.setShowBadge(false);
            notificationManager.createNotificationChannel(channel);

            // Canal para notificação de conclusão (com som e alerta)
            NotificationChannel completeChannel = new NotificationChannel(
                COMPLETE_CHANNEL_ID,
                COMPLETE_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            );
            completeChannel.setDescription("Alertas de conclusão de download de vídeos offline");
            completeChannel.enableVibration(true);
            completeChannel.setShowBadge(true);
            notificationManager.createNotificationChannel(completeChannel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            if (title != null && !title.isEmpty()) {
                currentTitle = title;
            }
            startForegroundWithNotification(currentTitle, 0, "Iniciando download...");
        } else if (ACTION_PROGRESS.equals(action)) {
            int progress = intent.getIntExtra(EXTRA_PROGRESS, 0);
            String subtext = intent.getStringExtra(EXTRA_SUBTEXT);
            updateNotificationProgress(progress, subtext);
        } else if (ACTION_STOP.equals(action)) {
            boolean success = intent.getBooleanExtra(EXTRA_SUCCESS, true);
            String title = intent.getStringExtra(EXTRA_TITLE);
            if (title != null && !title.isEmpty()) {
                currentTitle = title;
            }
            stopDownloadService(success);
        }

        return START_NOT_STICKY;
    }

    private void startForegroundWithNotification(String title, int progress, String subtext) {
        if (wakeLock != null && !wakeLock.isHeld()) {
            // Mantém a CPU ativa mesmo com tela apagada por até 60 minutos contínuos
            wakeLock.acquire(60 * 60 * 1000L);
        }

        Intent appIntent = new Intent(this, MainActivity.class);
        appIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            appIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AGUENATV: Baixando para ver offline")
            .setContentText(title + (subtext != null ? " • " + subtext : ""))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, progress, progress == 0)
            .setContentIntent(pendingIntent);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notificationBuilder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notificationBuilder.build());
        }
    }

    private void updateNotificationProgress(int progress, String subtext) {
        if (notificationBuilder != null && notificationManager != null) {
            notificationBuilder.setProgress(100, progress, false);
            if (subtext != null && !subtext.isEmpty()) {
                notificationBuilder.setContentText(currentTitle + " • " + subtext);
            }
            notificationManager.notify(NOTIFICATION_ID, notificationBuilder.build());
        }
    }

    private void stopDownloadService(boolean success) {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }

        stopForeground(STOP_FOREGROUND_REMOVE);

        if (success && notificationManager != null) {
            Intent appIntent = new Intent(this, MainActivity.class);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                appIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            NotificationCompat.Builder completeBuilder = new NotificationCompat.Builder(this, COMPLETE_CHANNEL_ID)
                .setContentTitle("AGUENATV: Download Concluído! 🍿")
                .setContentText(currentTitle + " já está salvo para assistir offline.")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent);

            notificationManager.notify((int) System.currentTimeMillis(), completeBuilder.build());
        } else if (!success && notificationManager != null) {
            NotificationCompat.Builder failBuilder = new NotificationCompat.Builder(this, COMPLETE_CHANNEL_ID)
                .setContentTitle("AGUENATV: Falha no Download")
                .setContentText("Não foi possível concluir o download de: " + currentTitle)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH);

            notificationManager.notify((int) System.currentTimeMillis(), failBuilder.build());
        }

        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
