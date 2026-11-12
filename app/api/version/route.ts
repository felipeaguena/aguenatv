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
  let latestVersion = '0.3.1';
  let apkDownloadUrl = 'https://github.com/felipeaguena/aguenatv/releases';
  let changelog = [
    "Transição instantânea entre capítulos e episódios sem recarregar a página (History API nativa)",
    "Player de vídeo com troca suave de mídia contínua sem tela preta ou destruição do DOM",
    "Rolagem automática inteligente para o player ao selecionar capítulos na lista",
    "Scroll-to-top imediato padronizado em todas as rotas e navegações do sistema",
    "Otimização de consumo no servidor com 100% de redução de requisições desnecessárias na reprodução"
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
    currentVersion: '0.3.1',
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
