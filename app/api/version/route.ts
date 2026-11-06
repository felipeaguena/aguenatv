import { NextResponse } from 'next/server';

export interface AppVersionInfo {
  currentVersion: string;
  latestVersion: string;
  releaseDate: string;
  apkDownloadUrl: string;
  githubUrl: string;
  changelog: string[];
}

export async function GET() {
  let latestVersion = '0.2.6';
  let apkDownloadUrl = 'https://github.com/felipeaguena/aguenatv/releases';
  let changelog = [
    'Ajuste na proporção cinema do player no desktop e barra lateral acompanhando a altura com média de 5 capítulos visíveis',
    'Nova página de Vídeos Baixados (Offline) no estilo Watch Séries com player local no topo e lista sequencial abaixo',
    'Instalação automática do APK nativo sem sair do aplicativo com barra de progresso em tempo real (%)',
    'Abertura de links externos do GitHub no navegador padrão do aparelho celular',
    'Persistência total na página ativa ao desconectar da internet ou retomar do segundo plano',
    'Notificação discreta de modo offline no topo com confirmação prévia antes de alternar',
    'Correção do cabeçalho no notch da câmera em aparelhos móveis no portal offline',
    'Carregamento otimizado do catálogo em cache do IndexedDB no modo offline',
    'Separação estrita de abas e gerenciamento entre Favoritos e Concluídos sem abas de TV ao Vivo',
  ];

  try {
    const ghRes = await fetch('https://api.github.com/repos/felipeaguena/aguenatv/releases/latest', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AGUENATV-App',
      },
      next: { revalidate: 300 },
    });
    if (ghRes.ok) {
      const data = await ghRes.json();
      if (data.tag_name) {
        latestVersion = data.tag_name.replace(/^v/, '');
      }
      const apkAsset = data.assets?.find((a: any) => a.name?.endsWith('.apk'));
      if (apkAsset?.browser_download_url) {
        apkDownloadUrl = apkAsset.browser_download_url;
      } else if (data.html_url) {
        apkDownloadUrl = data.html_url;
      }
      if (data.body) {
        const parsed = data.body
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.startsWith('-') || line.startsWith('*'))
          .map((line: string) => line.replace(/^[-*]\s*/, ''));
        if (parsed.length > 0) changelog = parsed;
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar releases do GitHub:', err);
  }

  const versionData: AppVersionInfo = {
    currentVersion: '0.2.0',
    latestVersion,
    releaseDate: '2026-11-04',
    apkDownloadUrl,
    githubUrl: 'https://github.com/felipeaguena/aguenatv',
    changelog,
  };

  return NextResponse.json(versionData, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
