import { modeLMS } from './base.js';
import { lireLMS, ecrireLMS } from './etat-lms.js';
// Mémoire du navigateur, protégée : localStorage peut être absent ou refuser (navigation privée,
// données bloquées). Toute lecture et écriture passe par un try/catch, avec une mémoire de secours
// en RAM pour que la session reste utilisable.
const PREFIXE = 'lmsang:';
const secours = new Map();

export function lire(cle, defaut = null) {
  if (modeLMS) return lireLMS(cle, defaut);
  try {
    const v = localStorage.getItem(PREFIXE + cle);
    if (v !== null) return JSON.parse(v);
  } catch { /* on tente la mémoire de secours */ }
  return secours.has(cle) ? structuredClone(secours.get(cle)) : defaut;
}

export function ecrire(cle, valeur) {
  if (modeLMS) return ecrireLMS(cle, valeur);
  secours.set(cle, valeur);
  try { localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur)); return true; } catch { return false; }
}

export function effacer(cle) {
  if (modeLMS) return ecrireLMS(cle, null);
  secours.delete(cle);
  try { localStorage.removeItem(PREFIXE + cle); } catch { /* rien */ }
}

/** Un espace de noms : ctx.stockage d'une activité ne voit que ses propres clés. */
export function espace(nom) {
  return {
    lire: (cle, defaut) => lire(`${nom}:${cle}`, defaut),
    ecrire: (cle, valeur) => ecrire(`${nom}:${cle}`, valeur),
    effacer: (cle) => effacer(`${nom}:${cle}`),
  };
}

export const stockage = { lire, ecrire, effacer, espace };
