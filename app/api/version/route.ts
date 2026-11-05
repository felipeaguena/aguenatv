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
  let latestVersion = '0.2.1';
  let apkDownloadUrl = 'https://github.com/felipeaguena/aguenatv/releases';
  let changelog = [
    'Novo ícone oficial do aplicativo AGUENATV instalado no celular e nova tela de splash temática',
    'Ocultado o item "Baixados" da barra inferior no mobile/tablet para manter a navegação limpa',
    'Novo botão de download de filmes na página de informações (ao lado de Concluído)',
    'Download em lote de temporadas completas ou episódios individuais de séries',
    'Exclusão de vídeos baixados com 1 clique para liberar espaço na memória do celular',
    'Nova aba "Baixados Offline" em Favoritos com gerenciamento completo por título',
    'Detecção automática de modo offline com reprodução direta da memória sem internet',
    'Build Release assinado com certificado dedicado para evitar alertas do Play Protect',
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
