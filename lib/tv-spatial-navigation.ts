/**
 * Motor de Navegação Espacial híbrido para TV / Tablet / APK Desktop do AGUENATV.
 * Escopado exclusivamente ao container `.tv-root` (rotas `/tv/*`).
 * Suporta D-Pad (controle remoto), teclado, mouse e toque simultaneamente.
 */

type Direction = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-tv-focusable="true"]',
  '.tv-focusable',
].join(', ');

function getTvRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('.tv-root');
}

function getZoneOf(el: HTMLElement | null): string | null {
  if (!el) return null;
  const zoneEl = el.closest<HTMLElement>('[data-tv-zone]');
  return zoneEl ? zoneEl.getAttribute('data-tv-zone') : null;
}

function getRowOf(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  return el.closest<HTMLElement>('[data-tv-row]');
}

function isElementVisibleAndFocusable(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 8 && rect.height > 8;
}

function getTvFocusableElements(scope?: HTMLElement | null): HTMLElement[] {
  const root = scope || getTvRoot();
  if (!root) return [];

  // Se houver modal TV aberto, restringe o foco apenas para dentro do modal
  const activeModal = root.querySelector<HTMLElement>('[data-tv-modal="true"]');
  const searchContainer = scope || activeModal || root;

  const elements = Array.from(searchContainer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return elements.filter(isElementVisibleAndFocusable);
}

function findBestSpatialCandidate(
  currentRect: DOMRect,
  direction: Direction,
  candidates: HTMLElement[],
  currentEl: HTMLElement
): HTMLElement | null {
  let bestCandidate: HTMLElement | null = null;
  let minScore = Infinity;

  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2,
  };
  const currentRow = getRowOf(currentEl);

  for (const el of candidates) {
    if (el === currentEl) continue;

    const rect = el.getBoundingClientRect();
    const candidateCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    const dx = candidateCenter.x - currentCenter.x;
    const dy = candidateCenter.y - currentCenter.y;

    let isInDirection = false;
    let primaryDist = 0;
    let secondaryDist = 0;

    switch (direction) {
      case 'left':
        isInDirection = candidateCenter.x < currentCenter.x - 6;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
        break;
      case 'right':
        isInDirection = candidateCenter.x > currentCenter.x + 6;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
        break;
      case 'up':
        isInDirection = candidateCenter.y < currentCenter.y - 6;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
        break;
      case 'down':
        isInDirection = candidateCenter.y > currentCenter.y + 6;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
        break;
    }

    if (!isInDirection) continue;

    // Penaliza troca acidental de linha horizontal ao apertar Esquerda/Direita
    let rowPenalty = 0;
    const candidateRow = getRowOf(el);
    if ((direction === 'left' || direction === 'right') && currentRow && candidateRow !== currentRow) {
      rowPenalty = 1200;
    }

    // Penaliza desvios perpendiculares (maior peso vertical em movimentos horizontais)
    const perpendicularWeight = direction === 'left' || direction === 'right' ? 3.2 : 2.1;
    const score = primaryDist + secondaryDist * perpendicularWeight + rowPenalty;

    if (score < minScore) {
      minScore = score;
      bestCandidate = el;
    }
  }

  return bestCandidate;
}

function scrollElementComfortably(el: HTMLElement) {
  // Rola horizontalmente dentro do trilho se estiver dentro de uma row
  const scrollRow = el.closest<HTMLElement>('.tv-scroll-row');
  if (scrollRow) {
    const elRect = el.getBoundingClientRect();
    const rowRect = scrollRow.getBoundingClientRect();
    const margin = 48;
    if (elRect.left < rowRect.left + margin) {
      scrollRow.scrollBy({
        left: elRect.left - rowRect.left - margin,
        behavior: 'smooth',
      });
    } else if (elRect.right > rowRect.right - margin) {
      scrollRow.scrollBy({
        left: elRect.right - rowRect.right + margin,
        behavior: 'smooth',
      });
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    return;
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

export function focusTvElement(el: HTMLElement | null) {
  if (!el || !document.contains(el)) return;
  el.focus({ preventScroll: true });
  scrollElementComfortably(el);
}

export function initTvSpatialNavigation(): () => void {
  if (typeof window === 'undefined') return () => {};

  const lastFocusedByZone = new Map<string, HTMLElement>();

  const setInputMode = (mode: 'dpad' | 'pointer') => {
    const root = getTvRoot();
    if (!root) return;
    if (mode === 'dpad') {
      root.classList.add('tv-input-dpad');
      root.classList.remove('tv-input-pointer');
    } else {
      root.classList.add('tv-input-pointer');
      root.classList.remove('tv-input-dpad');
    }
  };

  const handleFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const zone = getZoneOf(target);
    if (zone) {
      lastFocusedByZone.set(zone, target);
    }
  };

  const handlePointer = () => {
    setInputMode('pointer');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const root = getTvRoot();
    if (!root) return;

    const activeEl = document.activeElement as HTMLElement | null;
    const isTextInput =
      activeEl &&
      (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
      activeEl.getAttribute('type') !== 'button' &&
      activeEl.getAttribute('type') !== 'checkbox';

    // Atalho '/' foca a barra de busca universal se não estiver digitando
    if (e.key === '/' && !isTextInput) {
      const searchInput = document.getElementById('tv-global-search-input') as HTMLInputElement | null;
      if (searchInput) {
        e.preventDefault();
        setInputMode('dpad');
        searchInput.focus();
        return;
      }
    }

    // Tecla Voltar / Escape / Backspace fora de input
    if (e.key === 'Escape' || (e.key === 'Backspace' && !isTextInput)) {
      const customBack = new CustomEvent('aguenatv:tv-back', { cancelable: true });
      window.dispatchEvent(customBack);
      if (customBack.defaultPrevented) {
        e.preventDefault();
        return;
      }

      if (isTextInput && e.key === 'Escape') {
        activeEl?.blur();
        e.preventDefault();
        return;
      }

      // Escada de retorno inteligente entre zonas: content -> categories -> sidebar -> histórico
      const currentZone = getZoneOf(activeEl);
      const categoriesEl = root.querySelector<HTMLElement>('[data-tv-zone="categories"]');
      const sidebarEl = root.querySelector<HTMLElement>('[data-tv-zone="sidebar"]');

      if (currentZone === 'content' && categoriesEl) {
        const catTarget =
          lastFocusedByZone.get('categories') && document.contains(lastFocusedByZone.get('categories')!)
            ? lastFocusedByZone.get('categories')!
            : getTvFocusableElements(categoriesEl)[0];
        if (catTarget) {
          e.preventDefault();
          setInputMode('dpad');
          focusTvElement(catTarget);
          return;
        }
      }

      if (currentZone && currentZone !== 'sidebar' && sidebarEl) {
        const sideTarget =
          sidebarEl.querySelector<HTMLElement>('[data-tv-active="true"]') ||
          lastFocusedByZone.get('sidebar') ||
          getTvFocusableElements(sidebarEl)[0];
        if (sideTarget) {
          e.preventDefault();
          setInputMode('dpad');
          focusTvElement(sideTarget);
          return;
        }
      }

      if (window.location.pathname !== '/tv' && window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
      return;
    }

    // Dentro de inputs de texto, permite movimentação normal do cursor com Left/Right
    if (isTextInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      return;
    }

    let direction: Direction | null = null;
    if (e.key === 'ArrowUp') direction = 'up';
    else if (e.key === 'ArrowDown') direction = 'down';
    else if (e.key === 'ArrowLeft') direction = 'left';
    else if (e.key === 'ArrowRight') direction = 'right';

    if (direction) {
      setInputMode('dpad');

      // Se houver um handler local (ex: VideoPlayer em tela cheia), respeita
      if (e.defaultPrevented) return;

      const activeModal = root.querySelector<HTMLElement>('[data-tv-modal="true"]');
      const currentZone = getZoneOf(activeEl);

      // No player (/tv/watch) sem modal aberto e fora da barra superior, deixa ArrowLeft/Right/Up/Down para o VideoPlayer (seek/volume)
      if (
        window.location.pathname.startsWith('/tv/watch') &&
        !activeModal &&
        currentZone !== 'topbar'
      ) {
        return;
      }

      const candidates = getTvFocusableElements();
      if (!candidates.length) return;

      if (!activeEl || !candidates.includes(activeEl)) {
        const preferred =
          root.querySelector<HTMLElement>('[data-tv-autofocus="true"]') ||
          lastFocusedByZone.get('content') ||
          candidates[0];
        if (preferred && document.contains(preferred)) {
          e.preventDefault();
          if (activeModal) e.stopPropagation();
          focusTvElement(preferred);
        }
        return;
      }

      // Ao sair da Sidebar para a direita, restaura último item focado da zona de categorias ou conteúdo
      if (currentZone === 'sidebar' && direction === 'right') {
        if (!activeModal) {
          const catMem = lastFocusedByZone.get('categories');
          const contentMem = lastFocusedByZone.get('content');
          const targetZoneEl =
            (catMem && document.contains(catMem) && isElementVisibleAndFocusable(catMem) && catMem) ||
            (contentMem && document.contains(contentMem) && isElementVisibleAndFocusable(contentMem) && contentMem);

          if (targetZoneEl) {
            e.preventDefault();
            focusTvElement(targetZoneEl);
            return;
          }
        }
      }

      const currentRect = activeEl.getBoundingClientRect();
      let nextCandidate = findBestSpatialCandidate(currentRect, direction, candidates, activeEl);

      // Se apertar esquerda na borda do conteúdo/categorias e não houver candidato na mesma altura, foca a sidebar
      if (!nextCandidate && direction === 'left' && currentZone !== 'sidebar' && !activeModal) {
        const sidebarEl = root.querySelector<HTMLElement>('[data-tv-zone="sidebar"]');
        if (sidebarEl) {
          nextCandidate =
            sidebarEl.querySelector<HTMLElement>('[data-tv-active="true"]') ||
            lastFocusedByZone.get('sidebar') ||
            getTvFocusableElements(sidebarEl)[0] ||
            null;
        }
      }

      if (nextCandidate) {
        e.preventDefault();
        if (activeModal) e.stopPropagation();
        focusTvElement(nextCandidate);
      }
      return;
    }

    // D-Pad Center / Enter em elementos não nativos (divs/cards)
    if (e.key === 'Enter') {
      setInputMode('dpad');
      if (activeEl && activeEl !== document.body) {
        if (
          activeEl.tagName !== 'A' &&
          activeEl.tagName !== 'BUTTON' &&
          activeEl.tagName !== 'INPUT' &&
          activeEl.tagName !== 'SELECT' &&
          activeEl.tagName !== 'TEXTAREA'
        ) {
          e.preventDefault();
          activeEl.click();
        }
      }
    }
  };

  setInputMode('pointer');
  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('focusin', handleFocusIn, true);
  window.addEventListener('pointermove', handlePointer, { passive: true });
  window.addEventListener('touchstart', handlePointer, { passive: true });

  const initialTimer = setTimeout(() => {
    const root = getTvRoot();
    if (!root) return;
    if (!document.activeElement || document.activeElement === document.body) {
      const preferred =
        root.querySelector<HTMLElement>('[data-tv-autofocus="true"]') ||
        getTvFocusableElements()[0];
      if (preferred) {
        preferred.focus({ preventScroll: true });
      }
    }
  }, 350);

  return () => {
    clearTimeout(initialTimer);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('focusin', handleFocusIn, true);
    window.removeEventListener('pointermove', handlePointer);
    window.removeEventListener('touchstart', handlePointer);
  };
}
