// LE GUIDE VOCAL FRANÇAIS — mêmes règles que celui de notre LMS (useGuideVocal) :
//  1. il démarre à l'arrivée sur l'étape (0,6 s après) ;
//  2. il s'arrête dès que l'apprenant agit (premier geste dans l'activité) ;
//  3. il se coupe d'un bouton, et ce choix est mémorisé ;
//  4. le même bouton le relance et rejoue l'étape ;
//  5. il ne se superpose jamais à un autre son, et ne survit pas au changement d'étape.
import { arreter as arreterAudio, enLecture, surChangement as surAudio } from './audio.js';
import { jouerSequence, info } from './voix.js';
import { lire, ecrire } from './stockage.js';

const DELAI_MS = 600;
let coupe = Boolean(lire('guide-coupe', false));
let minuterie = 0;
let courant = null;       // la séquence de l'étape, pour « rejouer »
let bloque = false;
const abonnes = new Set();

function notifier() {
  const e = etat();
  for (const f of abonnes) { try { f(e); } catch { /* rien */ } }
}
surAudio(() => notifier());

export function etat() {
  return { coupe, enLecture: enLecture('guide'), bloque, disponible: Boolean(courant?.some(s => info(typeof s === 'string' ? s : s.ref || s.id))) };
}

/** Le relais est importé avant chargerEtat : relire ensuite la préférence sauvegardée. */
export function rechargerPreference() {
  const preference = Boolean(lire('guide-coupe', false));
  if (preference === coupe) return;
  coupe = preference;
  if (coupe) arreter();
  notifier();
}

export async function dire(sequence, opts = {}) {
  clearTimeout(minuterie);
  if (coupe || !sequence) return 'coupe';
  if (enLecture('media')) return 'arret';
  const r = await jouerSequence(sequence, { canal: 'guide', surSegment: opts.surSegment });
  bloque = r === 'bloque';
  notifier();
  return r;
}

/** Retient la voix de l'écran sans la démarrer (présentation dans la barre LMS). */
export function preparer(sequence) {
  clearTimeout(minuterie);
  courant = sequence && (Array.isArray(sequence) ? sequence : [sequence]);
  bloque = false;
  notifier();
}

/** Programme la voix d'arrivée de l'étape. Le lecteur l'appelle ; rien à faire côté activité. */
export function planifier(sequence) {
  preparer(sequence);
  if (!courant || !courant.length || coupe) return;
  minuterie = setTimeout(() => { dire(courant); }, DELAI_MS);
}

export function arreter() {
  clearTimeout(minuterie);
  arreterAudio('guide');
}

/** Oublie l'étape (changement d'étape, sortie). */
export function oublier() { arreter(); courant = null; bloque = false; notifier(); }

export function rejouer() { if (courant) { bloque = false; if (coupe) basculer(); else dire(courant); } }

export function basculer() {
  coupe = !coupe;
  ecrire('guide-coupe', coupe);
  if (coupe) arreter();
  else if (courant) dire(courant);
  notifier();
}

export function estCoupe() { return coupe; }
export function surChangement(f) { abonnes.add(f); return () => abonnes.delete(f); }

export const guide = { dire, preparer, rechargerPreference, planifier, arreter, oublier, rejouer, basculer, estCoupe, etat, surChangement };
