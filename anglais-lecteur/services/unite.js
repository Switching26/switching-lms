import { requete as fetch } from './base.js';
let active = 'U01';
let mediaPromise = null;
export const unite = () => active;
export function activerUnite(id) { active = id || 'U01'; mediaPromise = null; }
export function lien(page = '', id = active) { return `#/unite/${id}${page ? '/' + page : ''}`; }
export function medias(recharger = false) {
  if (!mediaPromise || recharger) mediaPromise = fetch(`/api/medias/${active}`, { cache: 'no-cache' }).then(r => r.json());
  return mediaPromise;
}

export const mediasPour = id => fetch(`/api/medias/${id}`, { cache: 'no-cache' }).then(r=>r.json());
