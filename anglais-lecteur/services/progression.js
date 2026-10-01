import { unite } from './unite.js';
// PROGRESSION ET JOURNAL — gardés dans le navigateur. Le journal trace l'activité (preuve Qualiopi)
// sans jamais le contenu d'une saisie.
import { lire, ecrire, effacer } from './stockage.js';

const cle = () => unite() === 'U01' ? 'progression-l01' : `progression-${unite()}`;
const MAX_JOURNAL = 800;
const abonnes = new Set();

function etat() {
  const e = lire(cle(), null);
  return e && typeof e === 'object' ? e : { etapes: {}, journal: [], debut: Date.now() };
}
function garder(e) { if (e.journal.length > MAX_JOURNAL) e.journal.splice(0, e.journal.length - MAX_JOURNAL); ecrire(cle(), e); for (const f of abonnes) { try { f(e); } catch { /* rien */ } } }
function etape(e, id) {
  if (!e.etapes[id]) e.etapes[id] = { ouvertures: 0, duree_s: 0, essais: 0, justes: 0, justes_premier: 0, aides: 0, solutions: 0, erreurs: [], termine: false, score: null };
  return e.etapes[id];
}

export function lireEtat() { return etat(); }
export function reinitialiser() { effacer(cle()); garder(etat()); }
export function surChangement(f) { abonnes.add(f); return () => abonnes.delete(f); }

export function tracer(evenement, details = {}) {
  const e = etat();
  e.journal.push({ t: Date.now(), ev: evenement, ...details });
  if (e.journal.length > MAX_JOURNAL) e.journal.splice(0, e.journal.length - MAX_JOURNAL);
  garder(e);
}

export function ouvrir(id) {
  const e = etat();
  const s = etape(e, id);
  s.ouvertures += 1;
  s.derniere_ouverture = Date.now();
  e.derniere_etape = id;
  e.journal.push({ t: Date.now(), ev: 'etape_ouverte', etape: id });
  garder(e);
}

export function fermer(id, secondes) {
  const e = etat();
  etape(e, id).duree_s += Math.max(0, Math.round(secondes));
  garder(e);
}

/** true | 'presque' | false — tolère aussi les verdicts écrits en texte ('juste', 'faux'). */
function verdict(v) { return v === true || v === 'juste' ? true : v === 'presque' ? 'presque' : false; }

export function essai(id, brut = {}) {
  const d = { ...brut, juste: verdict(brut.juste) };
  const e = etat();
  const s = etape(e, id);
  s.essais += 1;
  if (d.juste === true || d.juste === 'presque') { s.justes += 1; if (d.premier_essai) s.justes_premier += 1; }
  if (d.juste === false) {
    s.erreurs.push({
      item: d.item ?? null, element: d.element ?? null, attendu: d.attendu ?? null, donne: d.donne ?? null,
      explication: d.explication ?? null, remediation: d.remediation ?? null, competence: d.competence ?? null,
      famille_erreur: d.famille_erreur ?? null, t: Date.now(),
    });
    if (s.erreurs.length > 40) s.erreurs.splice(0, s.erreurs.length - 40);
  }
  e.journal.push({ t: Date.now(), ev: 'reponse_donnee', etape: id, item: d.item ?? null, juste: d.juste });
  garder(e);
}

export function aide(id, niveau) {
  const e = etat();
  etape(e, id).aides += 1;
  e.journal.push({ t: Date.now(), ev: niveau === 'montrer' ? 'aide_montrer' : 'aide_indice', etape: id });
  garder(e);
}

export function solution(id, item) {
  const e = etat();
  etape(e, id).solutions += 1;
  e.journal.push({ t: Date.now(), ev: 'solution_vue', etape: id, item: item ?? null });
  garder(e);
}

export function fin(id, d = {}) {
  const e = etat();
  const s = etape(e, id);
  const premiere = !s.termine;
  s.termine = true;
  s.score = typeof d.score === 'number' ? Math.max(0, Math.min(1, d.score)) : s.score;
  s.reussi = d.reussi ?? (s.score === null ? true : s.score >= 0.6);
  s.sans_note = Boolean(d.sans_note) || s.score === null;
  s.termine_le = Date.now();
  if (premiere) e.journal.push({ t: Date.now(), ev: 'etape_terminee', etape: id, score: s.score });
  garder(e);
}

export const progression = { lireEtat, reinitialiser, surChangement, tracer, ouvrir, fermer, essai, aide, solution, fin };
