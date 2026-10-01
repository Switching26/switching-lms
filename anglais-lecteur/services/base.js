// Une seule base, déduite du module servi : / ou /anglais/ (ou tout autre montage).
export const base = new URL('../', import.meta.url);
export const modeLMS = new URLSearchParams(globalThis.location?.search || '').get('lms') === '1';
export function adresse(valeur) {
  const s = String(valeur || '').replace(/(^|\/)EVAL-B([12])(?=\/|[?#]|$)/g, '$1BLANC$2');
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(s)) return s;
  if (base.pathname !== '/' && s.startsWith(base.pathname)) return new URL(s, base.origin).href;
  return new URL(s.replace(/^\/+/, ''), base).href;
}
export const requete = (url, options) => globalThis.fetch(typeof url === 'string' ? adresse(url) : url, options);
export const idInterne = id => ({ BLANC1: 'EVAL-B1', BLANC2: 'EVAL-B2' }[id] || id);
export const idChapitre = id => ({ 'EVAL-B1': 'BLANC1', 'EVAL-B2': 'BLANC2' }[id] || id);
