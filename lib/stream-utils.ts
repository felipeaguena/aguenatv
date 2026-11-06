import { BaseStreamItem } from './types';

/**
 * Converte timestamp 'added' ou 'last_modified' para milissegundos
 */
export function parseAddedTimestamp(added?: string | number): number | null {
  if (!added) return null;
  const str = String(added).trim();
  if (!str || str === '0') return null;

  // Se for apenas numérico
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (isNaN(num) || num <= 0) return null;
    // Se for unix timestamp em segundos (10 dígitos ou menor que 10 bilhões)
    if (num < 10000000000) {
      return num * 1000;
    }
    return num;
  }

  // Se for string no formato data "YYYY-MM-DD HH:MM:SS" ou ISO
  const formatted = str.replace(' ', 'T');
  const parsed = Date.parse(formatted);
  if (!isNaN(parsed) && parsed > 0) {
    return parsed;
  }

  return null;
}

/**
 * Calcula a pontuação de ordenação: timestamp 'added'/'last_modified' ou fallback para stream_id numérico
 */
export function getSortScore(item: BaseStreamItem): number {
  if (item.added) {
    const ts = parseAddedTimestamp(item.added);
    if (ts && ts > 0) return ts;
  }
  const numericId = Number(String(item.stream_id).replace(/\D/g, ''));
  return !isNaN(numericId) ? numericId : 0;
}

/**
 * Verifica se um título foi feito upload recentemente (ex: nos últimos 30 a 45 dias)
 */
export function isRecentlyAdded(item: BaseStreamItem, maxDays = 30): boolean {
  if ((item as any).isNew || (item as any).is_new) return true;
  if (!item.added) return false;

  const ts = parseAddedTimestamp(item.added);
  if (!ts) return false;

  const now = Date.now();
  const diffDays = (now - ts) / (1000 * 60 * 60 * 24);

  // Considera recente se estiver entre -2 dias (fuso horário adiantado) e maxDays
  return diffDays >= -2 && diffDays <= maxDays;
}

/**
 * Limpa o nome da categoria removendo prefixos redundantes
 */
export function cleanCategoryName(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/^Canais\s*\|\s*/i, '')
    .replace(/^Filmes\s*\|\s*/i, '')
    .replace(/^Séries\s*\|\s*/i, '')
    .replace(/^Series\s*\|\s*/i, '')
    .trim();
}
