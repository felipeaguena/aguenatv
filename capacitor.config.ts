import type { CapacitorConfig } from '@capacitor/cli';

// Define a URL padrão de produção na Oracle Cloud (porta 80 padrão)
const defaultServer = 'http://163.176.207.140';
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || defaultServer;

const config: CapacitorConfig = {
  appId: 'com.aguenatv.app',
  appName: 'AGUENATV',
  webDir: 'public',
  server: {
    // Conecta diretamente ao servidor na Oracle Cloud (Live Web / OTA)
    url: serverUrl,
    // Página local servida quando offline ou quando houver erro de rede
    errorPath: 'index.html',
    // Permite conexões HTTP em texto claro (essencial para servidores IPTV que transmitem em HTTP)
    cleartext: true,
    // Permite navegação livre dentro do WebView nativo sem abrir o navegador Chrome externo
    allowNavigation: ['*'],
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
