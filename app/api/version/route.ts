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
  let latestVersion = '0.3.0';
  let apkDownloadUrl = 'https://github.com/felipeaguena/aguenatv/releases';
  let changelog = [
    'Suporte completo a Android TV, Smart TV, TV Box, Fire TV Stick e Mi Box',
    'Navegação fluida por controle remoto (D-Pad: Cima, Baixo, Esquerda, Direita, OK e Voltar)',
    'Motor de navegação espacial com realce neon e foco automático em cards e botões',
    'Controles de vídeo via controle remoto (Play/Pause, retroceder/avançar 10s e volume)',
    'Launcher Banner 16:9 oficial para a tela inicial do Android TV e Google TV',
    'Alternador de Modo TV integrado nas configurações e menu de perfil',
    'Otimização de layout widescreen 16:9 e ocultação de barras de navegação touch na TV',
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
