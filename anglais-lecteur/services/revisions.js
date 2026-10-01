import { unite } from './unite.js';
// RÉVISIONS ESPACÉES — boîtes de Leitner, mécanique de D (script/revisions.json) :
//   · 5 boîtes, revues après 1, 2, 4, 8 et 16 jours ;
//   · « Je savais » : la carte monte d'une boîte · « J'hésitais » : elle reste · « Je ne savais pas » : boîte 1 ;
//   · après la boîte 5 réussie, la carte est acquise et revient une fois par mois ;
//   · au plus 20 cartes par séance, les plus en retard d'abord ;
//   · à partir de la boîte 3, la carte se révise dans l'autre sens (français → anglais).
import { lire, ecrire } from './stockage.js';

const CLE = 'revisions';
const INTERVALLES_J = [1, 2, 4, 8, 16];
const MOIS_J = 30;
const JOUR = 86400000;
export const PAR_SEANCE = 20;

function toutes() { return lire(CLE, {}); }
function garder(t) { ecrire(CLE, t); }

export function ajouter(carte) {
  if (!carte?.id || !carte.recto) return false;
  const t = toutes();
  if (t[carte.id]) return false;
  t[carte.id] = { source_unite: unite(), ...carte, boite: 1, prochaine: Date.now(), vues: 0, acquise: false, ajoutee_le: Date.now() };
  garder(t);
  return true;
}

export function ajouterPlusieurs(cartes) { let n = 0; for (const c of cartes || []) if (ajouter(c)) n += 1; return n; }

export function liste() { return Object.values(toutes()); }

/** Les cartes à revoir maintenant : les plus en retard d'abord, au plus 20. */
export function aReviser(maintenant = Date.now(), max = PAR_SEANCE) {
  return liste().filter((c) => c.prochaine <= maintenant).sort((a, b) => a.prochaine - b.prochaine || a.boite - b.boite).slice(0, max);
}

/** Sens de révision d'une carte : 'reconnaitre' (anglais → français) ou 'produire' (français → anglais, dès la boîte 3). */
export function sens(carte) { return (carte?.boite || 1) >= 3 ? 'produire' : 'reconnaitre'; }

/** resultat : 'su' | 'hesite' | 'oublie' */
export function noter(id, resultat) {
  const t = toutes();
  const c = t[id];
  if (!c) return null;
  if (resultat === 'su') {
    if (c.boite >= 5) { c.acquise = true; c.prochaine = Date.now() + MOIS_J * JOUR; }
    else { c.boite += 1; c.prochaine = Date.now() + INTERVALLES_J[c.boite - 1] * JOUR; }
  } else if (resultat === 'hesite') {
    c.prochaine = Date.now() + INTERVALLES_J[c.boite - 1] * JOUR;
  } else {
    c.boite = 1;
    c.prochaine = Date.now() + INTERVALLES_J[0] * JOUR;
  }
  c.vues += 1;
  c.derniere = { resultat, le: Date.now() };
  garder(t);
  return c;
}

/** Durée annoncée d'une séance : 15 secondes par carte (D : 3 à 5 minutes pour 20 cartes). Un seul calcul partout. */
export function minutesSeance(n) { return Math.max(1, Math.round((n || 0) * 0.25)); }

export function prochaineDate() {
  const l = liste().filter((c) => c.prochaine > Date.now());
  return l.length ? Math.min(...l.map((c) => c.prochaine)) : null;
}

export const revisions = { ajouter, ajouterPlusieurs, liste, aReviser, noter, prochaineDate, sens, minutesSeance, PAR_SEANCE };
