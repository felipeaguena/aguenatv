/**
 * AGUENATV - Motor de Navegação Espacial para Android TV (D-Pad / Controle Remoto)
 * Permite navegação fluida em interfaces 10-foot usando setas (Cima, Baixo, Esquerda, Direita, OK e Voltar)
 */

export const TV_STORAGE_KEY = 'aguenatv_tv_mode';
export const TV_EVENT = 'aguenatv_tv_mode_change';

/**
 * Detecta se o dispositivo atual é uma TV ou TV Box
 */
export function isTvDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Preferência explícita salva pelo usuário
  const saved = localStorage.getItem(TV_STORAGE_KEY);
  if (saved !== null) {
    return saved === 'true';
  }

  // 2. Parâmetro de URL (útil para testes: ?tv=1)
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tv') === '1' || params.get('tv') === 'true') {
      return true;
    }
  } catch {}

  // 3. User-Agent de Android TV, Smart TV, Fire TV, Mi Box, etc.
  const ua = navigator.userAgent || '';
  const isTvUa = /Android.*TV|SmartTV|GoogleTV|Large Screen|BRAVIA|AFT|MiBOX|TV Box|H96|X96|TX3|Tanix|FireTV/i.test(ua);
  if (isTvUa) return true;

  return false;
}

export function setTvMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TV_STORAGE_KEY, enabled ? 'true' : 'false');
  if (enabled) {
    document.body.classList.add('tv-mode');
  } else {
    document.body.classList.remove('tv-mode');
  }
  window.dispatchEvent(new CustomEvent(TV_EVENT, { detail: { enabled } }));
}

export function toggleTvMode(): boolean {
  const current = isTvDevice();
  setTvMode(!current);
  return !current;
}

type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Encontra todos os elementos focáveis na tela atual
 */
function getFocusableElements(): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[data-tv-focusable="true"]',
    '.tv-focusable',
  ].join(', ');

  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

  // Filtra elementos visíveis com dimensões reais
  return elements.filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 5 && rect.height > 5;
  });
}

/**
 * Calcula a distância angular e euclidiana ponderada entre o elemento ativo e os candidatos
 */
function findBestSpatialCandidate(currentRect: DOMRect, direction: Direction, candidates: HTMLElement[]): HTMLElement | null {
  let bestCandidate: HTMLElement | null = null;
  let minDistance = Infinity;

  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2,
  };

  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const candidateCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    const dx = candidateCenter.x - currentCenter.x;
    const dy = candidateCenter.y - currentCenter.y;

    let isStrictlyInDirection = false;
    let primaryDist = 0;
    let secondaryDist = 0;

    switch (direction) {
      case 'left':
        isStrictlyInDirection = candidateCenter.x < currentCenter.x - 5;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
        break;
      case 'right':
        isStrictlyInDirection = candidateCenter.x > currentCenter.x + 5;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
        break;
      case 'up':
        isStrictlyInDirection = candidateCenter.y < currentCenter.y - 5;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
        break;
      case 'down':
        isStrictlyInDirection = candidateCenter.y > currentCenter.y + 5;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
        break;
    }

    if (!isStrictlyInDirection) continue;

    // Pondera mais a distância primária e penaliza desvios no eixo secundário
    const score = primaryDist + secondaryDist * 2.2;

    if (score < minDistance) {
      minDistance = score;
      bestCandidate = el;
    }
  }

  return bestCandidate;
}

let isInitialized = false;

/**
 * Inicializa o listener global do controle remoto (D-Pad)
 */
export function initSpatialNavigation(): () => void {
  if (typeof window === 'undefined' || isInitialized) {
    return () => {};
  }

  isInitialized = true;

  if (isTvDevice()) {
    document.body.classList.add('tv-mode');
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    // Se estiver digitando em um input de texto, permite navegação nativa do cursor
    const activeEl = document.activeElement as HTMLElement | null;
    const isTextInput =
      activeEl &&
      (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
      activeEl.getAttribute('type') !== 'button' &&
      activeEl.getAttribute('type') !== 'checkbox';

    if (isTextInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      return;
    }

    let direction: Direction | null = null;
    if (e.key === 'ArrowUp') direction = 'up';
    else if (e.key === 'ArrowDown') direction = 'down';
    else if (e.key === 'ArrowLeft') direction = 'left';
    else if (e.key === 'ArrowRight') direction = 'right';

    if (direction) {
      const candidates = getFocusableElements();
      if (!candidates.length) return;

      if (!activeEl || !candidates.includes(activeEl)) {
        // Se nada estiver focado, foca o primeiro elemento visível
        candidates[0].focus();
        candidates[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        e.preventDefault();
        return;
      }

      const currentRect = activeEl.getBoundingClientRect();
      const nextCandidate = findBestSpatialCandidate(currentRect, direction, candidates);

      if (nextCandidate) {
        e.preventDefault();
        nextCandidate.focus();
        nextCandidate.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
      return;
    }

    // Tecla Enter / Selecionar / D-pad Center
    if (e.key === 'Enter') {
      if (activeEl && activeEl !== document.body) {
        if (activeEl.tagName !== 'A' && activeEl.tagName !== 'BUTTON' && activeEl.tagName !== 'INPUT') {
          activeEl.click();
        }
        return;
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown, { passive: false });

  // Foca o primeiro item caso o app inicie em modo TV
  if (isTvDevice()) {
    setTimeout(() => {
      const elements = getFocusableElements();
      if (elements.length > 0 && (!document.activeElement || document.activeElement === document.body)) {
        elements[0].focus();
      }
    }, 500);
  }

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    isInitialized = false;
  };
}
