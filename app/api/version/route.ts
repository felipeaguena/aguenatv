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
  let latestVersion = '0.2.5';
  let apkDownloadUrl = 'https://github.com/felipeaguena/aguenatv/releases';
  let changelog = [
    'Sistema de pré-renderização offline integrado no APK (elimina erro ERR_INTERNET_DISCONNECTED no Modo Avião)',
    'Portal offline autônomo com listagem e reprodução de vídeos salvos e catálogo em cache sem internet',
    'Novo gesto nativo e web Pull-To-Refresh (arrastar para baixo para atualizar a aplicação sem precisar reiniciar)',
    'Reconexão automática com o servidor quando a internet for restabelecida',
    'Redesign completo da página Vídeos Baixados (Offline) com agrupamento de séries e filmes',
    'Travamento de download duplicado para uma única vez por título/episódio com ícone de status',
    'Exclusão segura de downloads da memória e do disco com popup de confirmação',
    'Contabilização exata de espaço em disco utilizado pelos downloads salvos',
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
