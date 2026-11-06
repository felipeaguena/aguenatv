/**
 * Motor de Navegação Espacial isolado para a interface TV / Tablet do AGUENATV
 * Aplica-se exclusivamente ao container .tv-root (rota /tv)
 */

type Direction = 'up' | 'down' | 'left' | 'right';

function getTvFocusableElements(): HTMLElement[] {
  if (typeof document === 'undefined') return [];

  const container = document.querySelector('.tv-root');
  if (!container) return [];

  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[data-tv-focusable="true"]',
    '.tv-focusable',
  ].join(', ');

  const elements = Array.from(container.querySelectorAll<HTMLElement>(selector));

  return elements.filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 10 && rect.height > 10;
  });
}

function findBestSpatialCandidate(
  currentRect: DOMRect,
  direction: Direction,
  candidates: HTMLElement[]
): HTMLElement | null {
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

    // Distância ponderada penalizando desvios perpendiculares
    const weightedDistance = primaryDist + secondaryDist * 2.5;

    if (weightedDistance < minDistance) {
      minDistance = weightedDistance;
      bestCandidate = el;
    }
  }

  return bestCandidate;
}

export function initTvSpatialNavigation(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleKeyDown = (e: KeyboardEvent) => {
    // Se estiver digitando em um input de texto, mantém digitação padrão
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
      const candidates = getTvFocusableElements();
      if (!candidates.length) return;

      if (!activeEl || !candidates.includes(activeEl)) {
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
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown, { passive: false });

  // Foco inicial
  setTimeout(() => {
    const candidates = getTvFocusableElements();
    if (candidates.length > 0 && (!document.activeElement || document.activeElement === document.body)) {
      candidates[0].focus();
    }
  }, 400);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}
