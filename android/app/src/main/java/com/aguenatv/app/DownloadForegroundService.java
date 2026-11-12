package com.aguenatv.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

public class DownloadForegroundService extends Service {
    private static final String TAG = "DownloadFGService";

    public static final String CHANNEL_ID = "aguenatv_downloads_channel";
    public static final String CHANNEL_NAME = "Downloads AGUENATV";
    public static final String COMPLETE_CHANNEL_ID = "aguenatv_complete_channel";
    public static final String COMPLETE_CHANNEL_NAME = "Downloads Concluídos";

    public static final int NOTIFICATION_ID = 9901;

    public static final String ACTION_START_DOWNLOAD = "com.aguenatv.app.START_DOWNLOAD";
    public static final String ACTION_CANCEL_DOWNLOAD = "com.aguenatv.app.CANCEL_DOWNLOAD";

    public static final String EXTRA_ID = "extra_id";
    public static final String EXTRA_URL = "extra_url";
    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_FILE_NAME = "extra_file_name";
    public static final String EXTRA_METADATA = "extra_metadata";

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private NotificationManager notificationManager;
    private NotificationCompat.Builder notificationBuilder;

    private final ExecutorService executorService = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<String, DownloadTask> activeTasks = new ConcurrentHashMap<>();

    private static class DownloadTask {
        String id;
        String url;
        String title;
        String fileName;
        String metadata;
        AtomicBoolean isCancelled = new AtomicBoolean(false);
        long bytesDownloaded = 0;
        long totalBytes = 0;

        DownloadTask(String id, String url, String title, String fileName, String metadata) {
            this.id = id;
            this.url = url;
            this.title = title;
            this.fileName = fileName;
            this.metadata = metadata;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannels();

        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                // PARTIAL_WAKE_LOCK mantém a CPU 100% ativa mesmo com tela apagada
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aguenatv:download_wakelock");
                wakeLock.setReferenceCounted(false);
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao criar WakeLock", e);
        }

        try {
            WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null) {
                // WifiLock impede que o Android coloque o chip Wi-Fi em modo economia de energia
                wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "aguenatv:wifi_lock");
                wifiLock.setReferenceCounted(false);
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao criar WifiLock", e);
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notificações de progresso contínuo de downloads em segundo plano");
            channel.enableVibration(false);
            channel.setShowBadge(false);
            notificationManager.createNotificationChannel(channel);

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
        if (ACTION_START_DOWNLOAD.equals(action)) {
            String id = intent.getStringExtra(EXTRA_ID);
            String url = intent.getStringExtra(EXTRA_URL);
            String title = intent.getStringExtra(EXTRA_TITLE);
            String fileName = intent.getStringExtra(EXTRA_FILE_NAME);
            String metadata = intent.getStringExtra(EXTRA_METADATA);

            if (id != null && url != null && fileName != null) {
                startNativeDownload(id, url, title != null ? title : "Vídeo", fileName, metadata);
            }
        } else if (ACTION_CANCEL_DOWNLOAD.equals(action)) {
            String id = intent.getStringExtra(EXTRA_ID);
            if (id != null) {
                DownloadTask task = activeTasks.get(id);
                if (task != null) {
                    task.isCancelled.set(true);
                }
            }
        }

        return START_NOT_STICKY;
    }

    private synchronized void acquireLocks() {
        try {
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(2 * 60 * 60 * 1000L); // 2 horas máximo
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao adquirir WakeLock", e);
        }

        try {
            if (wifiLock != null && !wifiLock.isHeld()) {
                wifiLock.acquire();
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao adquirir WifiLock", e);
        }
    }

    private synchronized void releaseLocksIfIdle() {
        if (activeTasks.isEmpty()) {
            try {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                }
            } catch (Exception ignored) {}

            try {
                if (wifiLock != null && wifiLock.isHeld()) {
                    wifiLock.release();
                }
            } catch (Exception ignored) {}

            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        }
    }

    private void startNativeDownload(String id, String urlStr, String title, String fileName, String metadata) {
        acquireLocks();

        File videosDir = new File(getFilesDir(), "videos");
        if (!videosDir.exists()) {
            videosDir.mkdirs();
        }

        // Não grava offline_{id}.json antes do término para impedir que downloads em andamento ou falhos apareçam como concluídos

        DownloadTask task = new DownloadTask(id, urlStr, title, fileName, metadata);
        activeTasks.put(id, task);

        // Inicializa Foreground Notification
        updateForegroundNotification(task, 0, "Iniciando download...");

        executorService.execute(() -> runDownloadLoop(task));
    }

    private void runDownloadLoop(DownloadTask task) {
        File videosDir = new File(getFilesDir(), "videos");
        if (!videosDir.exists()) {
            videosDir.mkdirs();
        }

        File targetFile = new File(videosDir, task.fileName);
        File tempFile = new File(videosDir, task.fileName + ".tmp");

        int maxRetries = 10;
        int currentRetry = 0;
        boolean downloadCompleted = false;
        long lastNotificationTime = 0;

        Log.i(TAG, "Iniciando download nativo resiliente para: " + task.title + " em: " + tempFile.getAbsolutePath());

        while (!task.isCancelled.get() && currentRetry < maxRetries && !downloadCompleted) {
            HttpURLConnection conn = null;
            InputStream inputStream = null;
            FileOutputStream outputStream = null;

            try {
                long existingLength = tempFile.exists() ? tempFile.length() : 0;
                task.bytesDownloaded = existingLength;

                URL url = new URL(task.url);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(30000); // 30 segundos para conectar
                conn.setReadTimeout(60000);    // 60 segundos de leitura

                // Permite retomada (Resumable Download) usando HTTP Range
                if (existingLength > 0) {
                    conn.setRequestProperty("Range", "bytes=" + existingLength + "-");
                    Log.i(TAG, "Retomando download a partir do byte: " + existingLength);
                }

                conn.connect();

                int responseCode = conn.getResponseCode();
                boolean isResume = (responseCode == HttpURLConnection.HTTP_PARTIAL); // 206
                boolean isOk = (responseCode == HttpURLConnection.HTTP_OK);          // 200

                if (!isOk && !isResume) {
                    throw new Exception("HTTP status inválido: " + responseCode);
                }

                long contentLength = conn.getContentLengthLong();
                if (contentLength > 0) {
                    task.totalBytes = isResume ? (existingLength + contentLength) : contentLength;
                } else if (task.totalBytes <= 0) {
                    task.totalBytes = 0;
                }

                inputStream = conn.getInputStream();
                // Append mode se estiver retomando
                outputStream = new FileOutputStream(tempFile, isResume);

                byte[] buffer = new byte[64 * 1024]; // Buffer de 64 KB para alta velocidade
                int bytesRead;

                while (!task.isCancelled.get() && (bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                    task.bytesDownloaded += bytesRead;

                    long now = System.currentTimeMillis();
                    // Atualiza notificação e envia evento para a UI a cada 800ms
                    if (now - lastNotificationTime > 800 || (task.totalBytes > 0 && task.bytesDownloaded >= task.totalBytes)) {
                        lastNotificationTime = now;
                        int percentage = task.totalBytes > 0
                            ? (int) Math.min(100, (task.bytesDownloaded * 100) / task.totalBytes)
                            : 0;

                        String subtext = formatBytes(task.bytesDownloaded)
                            + (task.totalBytes > 0 ? " / " + formatBytes(task.totalBytes) : "")
                            + " (" + percentage + "%)";

                        updateForegroundNotification(task, percentage, subtext);

                        BackgroundDownloadPlugin.emitProgress(
                            task.id,
                            task.title,
                            task.bytesDownloaded,
                            task.totalBytes,
                            percentage
                        );
                    }
                }

                outputStream.flush();

                if (task.isCancelled.get()) {
                    Log.i(TAG, "Download cancelado pelo usuário: " + task.title);
                    break;
                }

                // Verifica se baixou todo o arquivo
                if (task.totalBytes <= 0 || task.bytesDownloaded >= task.totalBytes) {
                    downloadCompleted = true;
                }

            } catch (Exception e) {
                currentRetry++;
                Log.w(TAG, "Falha de conexão durante o download (" + currentRetry + "/" + maxRetries + "): " + e.getMessage());

                if (task.isCancelled.get()) break;

                try {
                    // Espera 2 segundos antes de tentar reconectar e retomar
                    Thread.sleep(2000);
                } catch (InterruptedException ignored) {}
            } finally {
                try {
                    if (outputStream != null) outputStream.close();
                } catch (Exception ignored) {}
                try {
                    if (inputStream != null) inputStream.close();
                } catch (Exception ignored) {}
                try {
                    if (conn != null) conn.disconnect();
                } catch (Exception ignored) {}
            }
        }

        activeTasks.remove(task.id);

        if (downloadCompleted && !task.isCancelled.get()) {
            // Renomeia o arquivo temporário para o destino final
            if (targetFile.exists()) {
                targetFile.delete();
            }
            tempFile.renameTo(targetFile);

            long actualSize = targetFile.length();
            Log.i(TAG, "Download concluído com sucesso: " + targetFile.getAbsolutePath() + " (" + actualSize + " bytes)");

            // Atualiza o arquivo companion JSON com tamanho e data final
            try {
                File companionJson = new File(videosDir, "offline_" + task.id + ".json");
                JSONObject json = null;
                if (companionJson.exists()) {
                    try {
                        String content = readFileToString(companionJson);
                        if (content != null && !content.trim().isEmpty()) {
                            json = new JSONObject(content);
                        }
                    } catch (Exception ignored) {}
                }
                if (json == null && task.metadata != null && !task.metadata.trim().isEmpty()) {
                    try {
                        json = new JSONObject(task.metadata);
                    } catch (Exception ignored) {}
                }
                if (json == null) {
                    json = new JSONObject();
                    json.put("id", task.id);
                    json.put("title", task.title);
                }

                json.put("file_path", "videos/" + task.fileName);
                json.put("file_size", actualSize);
                json.put("downloaded_at", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date()));

                writeStringToFile(companionJson, json.toString(2));

                // Também atualiza o downloads_manifest.json mestre
                File manifestFile = new File(videosDir, "downloads_manifest.json");
                JSONObject manifestObj = new JSONObject();
                if (manifestFile.exists()) {
                    try {
                        String mContent = readFileToString(manifestFile);
                        if (mContent != null && !mContent.trim().isEmpty()) {
                            manifestObj = new JSONObject(mContent);
                        }
                    } catch (Exception ignored) {}
                }
                manifestObj.put(task.id, json);
                writeStringToFile(manifestFile, manifestObj.toString(2));
            } catch (Exception err) {
                Log.w(TAG, "Falha ao atualizar JSON de metadados em disco: " + err.getMessage());
            }

            notifyCompletion(task.title, true);
            BackgroundDownloadPlugin.emitComplete(
                task.id,
                task.title,
                targetFile.getAbsolutePath(),
                actualSize,
                true,
                null
            );
        } else {
            if (task.isCancelled.get()) {
                tempFile.delete();
                try {
                    File companionJson = new File(videosDir, "offline_" + task.id + ".json");
                    if (companionJson.exists()) companionJson.delete();
                } catch (Exception ignored) {}
                BackgroundDownloadPlugin.emitComplete(task.id, task.title, "", 0, false, "Download cancelado");
            } else {
                notifyCompletion(task.title, false);
                BackgroundDownloadPlugin.emitComplete(
                    task.id,
                    task.title,
                    "",
                    0,
                    false,
                    "Falha ao concluir download após " + maxRetries + " tentativas."
                );
            }
        }

        releaseLocksIfIdle();
    }

    private void updateForegroundNotification(DownloadTask task, int progress, String subtext) {
        Intent appIntent = new Intent(this, MainActivity.class);
        appIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            appIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        int count = activeTasks.size();
        String title = count > 1
            ? "AGUENATV: Baixando (" + count + " vídeos)"
            : "AGUENATV: Baixando " + task.title;

        notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(task.title + " • " + subtext)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, progress, progress <= 0)
            .setContentIntent(pendingIntent);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notificationBuilder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notificationBuilder.build());
        }
    }

    private void notifyCompletion(String title, boolean success) {
        if (notificationManager == null) return;

        Intent appIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            appIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        if (success) {
            NotificationCompat.Builder completeBuilder = new NotificationCompat.Builder(this, COMPLETE_CHANNEL_ID)
                .setContentTitle("AGUENATV: Download Concluído! 🍿")
                .setContentText(title + " já está pronto para assistir offline.")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent);

            notificationManager.notify((int) System.currentTimeMillis(), completeBuilder.build());
        } else {
            NotificationCompat.Builder failBuilder = new NotificationCompat.Builder(this, COMPLETE_CHANNEL_ID)
                .setContentTitle("AGUENATV: Falha no Download")
                .setContentText("Não foi possível concluir o download de: " + title)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH);

            notificationManager.notify((int) System.currentTimeMillis(), failBuilder.build());
        }
    }

    private String formatBytes(long bytes) {
        if (bytes <= 0) return "0 MB";
        double mb = bytes / (1024.0 * 1024.0);
        if (mb >= 1024) {
            return String.format(java.util.Locale.US, "%.1f GB", mb / 1024.0);
        }
        return String.format(java.util.Locale.US, "%.0f MB", mb);
    }

    @Override
    public void onDestroy() {
        executorService.shutdownNow();
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            try {
                wifiLock.release();
            } catch (Exception ignored) {}
        }
        super.onDestroy();
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

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
