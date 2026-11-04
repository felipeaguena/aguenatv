import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aguenatv.app',
  appName: 'AGUENATV',
  webDir: 'public',
  server: {
    // Configura o esquema Android para https
    androidScheme: 'https',
    // Permite conexões HTTP em texto claro (essencial para servidores IPTV que transmitem em HTTP)
    cleartext: true,
  },
  android: {
    // Permite reprodução mista (HTTPS + HTTP streams) sem bloqueio do WebView
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    CapacitorHttp: {
      // Habilita requisições HTTP nativas do Android, contornando 100% dos bloqueios de CORS do navegador
      enabled: true,
    },
  },
};

export default config;
