const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const logoBase64 = fs.readFileSync(path.join(__dirname, '..', 'public', 'studio-aguena-white.png')).toString('base64');

// 1. SVG para ic_launcher (quadrado com cantos arredondados)
const squareIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#grad)" />
  <image href="data:image/png;base64,${logoBase64}" x="56" y="112" width="400" height="168" preserveAspectRatio="xMidYMid meet" />
  <text x="256" y="400" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="112" letter-spacing="12">TV</text>
</svg>
`;

// 2. SVG para ic_launcher_round (círculo)
const roundIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
  </defs>
  <circle cx="256" cy="256" r="256" fill="url(#grad)" />
  <image href="data:image/png;base64,${logoBase64}" x="66" y="118" width="380" height="160" preserveAspectRatio="xMidYMid meet" />
  <text x="256" y="396" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="108" letter-spacing="12">TV</text>
</svg>
`;

// 3. SVG para ic_launcher_foreground (fundo transparente, área segura 72dp centralizada em canvas 108dp)
const foregroundIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <filter id="fg-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.4" />
    </filter>
  </defs>
  <!-- Ícone TV perfeitamente posicionado na safe zone (raio máx 360px a partir de 540,540) -->
  <g filter="url(#fg-shadow)">
    <!-- Moldura da TV: largura 480, altura 310 -->
    <rect x="300" y="340" width="480" height="310" rx="42" fill="none" stroke="#ffffff" stroke-width="36" />
    <!-- Botão Play -->
    <polygon points="495,430 495,560 610,495" fill="#ffffff" />
    <!-- Pedestal da TV -->
    <line x1="540" y1="650" x2="540" y2="730" stroke="#ffffff" stroke-width="36" stroke-linecap="round" />
    <line x1="430" y1="730" x2="650" y2="730" stroke="#ffffff" stroke-width="36" stroke-linecap="round" />
  </g>
</svg>
`;

// 4. Função geradora de Splash Screen
function createSplashSvg(width, height) {
  const isLandscape = width > height;
  const iconSize = isLandscape ? Math.min(height * 0.38, 180) : Math.min(width * 0.35, 180);
  const cx = width / 2;
  const cy = height / 2 - (isLandscape ? 15 : 25);
  const x = cx - iconSize / 2;
  const y = cy - iconSize / 2;
  const fontSize = Math.max(Math.round(iconSize * 0.28), 24);
  const textY = cy + iconSize / 2 + (isLandscape ? 38 : 48);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="splashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
    <filter id="splashShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#7c3aed" flood-opacity="0.5" />
    </filter>
  </defs>

  <!-- Fundo escuro premium -->
  <rect width="${width}" height="${height}" fill="#0c0d14" />

  <!-- Badge com gradiente -->
  <g filter="url(#splashShadow)">
    <rect x="${x}" y="${y}" width="${iconSize}" height="${iconSize}" rx="${iconSize * 0.22}" fill="url(#splashGrad)" />
  </g>

  <!-- Elemento TV dentro do badge -->
  <g transform="translate(${x}, ${y}) scale(${iconSize / 512})">
    <rect x="90" y="115" width="332" height="215" rx="30" fill="none" stroke="#ffffff" stroke-width="26" />
    <polygon points="225,178 225,268 305,223" fill="#ffffff" />
    <line x1="256" y1="330" x2="256" y2="385" stroke="#ffffff" stroke-width="26" stroke-linecap="round" />
    <line x1="180" y1="385" x2="332" y2="385" stroke="#ffffff" stroke-width="26" stroke-linecap="round" />
  </g>

  <!-- Texto AGUENATV -->
  <text x="${cx}" y="${textY}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="${fontSize}" letter-spacing="1">
    <tspan fill="#ffffff">AGUENA</tspan><tspan fill="#a78bfa">TV</tspan>
  </text>
</svg>
  `;
}

const iconDensities = [
  { folder: 'mipmap-mdpi', launcherSize: 48, fgSize: 108 },
  { folder: 'mipmap-hdpi', launcherSize: 72, fgSize: 162 },
  { folder: 'mipmap-xhdpi', launcherSize: 96, fgSize: 216 },
  { folder: 'mipmap-xxhdpi', launcherSize: 144, fgSize: 324 },
  { folder: 'mipmap-xxxhdpi', launcherSize: 192, fgSize: 432 },
];

const splashTargets = [
  { path: 'drawable/splash.png', width: 480, height: 320 },
  { path: 'drawable-land-mdpi/splash.png', width: 480, height: 320 },
  { path: 'drawable-land-hdpi/splash.png', width: 800, height: 480 },
  { path: 'drawable-land-xhdpi/splash.png', width: 1280, height: 720 },
  { path: 'drawable-land-xxhdpi/splash.png', width: 1600, height: 960 },
  { path: 'drawable-land-xxxhdpi/splash.png', width: 1920, height: 1280 },
  { path: 'drawable-port-mdpi/splash.png', width: 320, height: 480 },
  { path: 'drawable-port-hdpi/splash.png', width: 480, height: 800 },
  { path: 'drawable-port-xhdpi/splash.png', width: 720, height: 1280 },
  { path: 'drawable-port-xxhdpi/splash.png', width: 960, height: 1600 },
  { path: 'drawable-port-xxxhdpi/splash.png', width: 1280, height: 1920 },
];

async function run() {
  console.log('Gerando ícones do Android...');

  for (const item of iconDensities) {
    const dir = path.join(resDir, item.folder);
    fs.mkdirSync(dir, { recursive: true });

    // 1. ic_launcher.png
    await sharp(Buffer.from(squareIconSvg))
      .resize(item.launcherSize, item.launcherSize)
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    // 2. ic_launcher_round.png
    await sharp(Buffer.from(roundIconSvg))
      .resize(item.launcherSize, item.launcherSize)
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // 3. ic_launcher_foreground.png
    await sharp(Buffer.from(foregroundIconSvg))
      .resize(item.fgSize, item.fgSize)
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));

    console.log(`✓ ${item.folder} gerado (${item.launcherSize}px e fg ${item.fgSize}px)`);
  }

  console.log('Gerando telas de Splash...');
  for (const s of splashTargets) {
    const filePath = path.join(resDir, s.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const svg = createSplashSvg(s.width, s.height);
    await sharp(Buffer.from(svg))
      .resize(s.width, s.height)
      .png()
      .toFile(filePath);

    console.log(`✓ Splash gerado: ${s.path} (${s.width}x${s.height})`);
  }

  console.log('Todos os ícones e telas splash foram gerados com sucesso!');
}

run().catch((err) => {
  console.error('Erro ao gerar ícones:', err);
  process.exit(1);
});
