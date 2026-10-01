import { adresse } from '../../services/base.js';
import { requete as fetch } from '../../services/base.js';
// activities/exercices/_commun.js — boîte à outils commune aux activités de B3 (exercices), lue par B4 (jeux).
//
// Pas un type d'activité : le nom commence par « _ », le serveur ne le liste pas.
// Tout passe par `ctx` (CONTRAT-ACTIVITES v1.1) ; rien ne touche au document hors de la racine de l'activité.
//
// ─── API STABLE (B4 l'importe en lecture seule : ne pas renommer, ne pas changer les signatures) ───
// Import : import { el, evaluerSaisie, … } from '../exercices/_commun.js';
//
// DOM et outils
//   el(tag, attrs, ...enfants) → Node        attrs : class, html, texte, style{}, onclick…, booléens, autres attributs
//   esc(texte) → texte échappé pour innerHTML
//   icone(ctx, nom) → SVG (icônes du socle d'abord : juste, faux, indice, montrer, reponse, ecouter, suivant, rejouer,
//                     horloge, info, coche, cadenas ; puis les nôtres : medaille, message, badge, drapeau, eclair, retirer)
//   attendre(ms, signal) → Promise (se termine aussi à l'annulation)      mouvementReduit() · pointeurFin() → booléens
//   creerRng(graine) → () => [0,1[ (Math.random sans graine) · melanger(tab, rng) · melangerVraiment(tab, rng, egal)
//   texteFr(v) (chaîne, { fr } ou { texte }) · liste(v) → tableau · sansOui(retour) (« Oui : x » → « X »)
//   rendreVisible(noeud) : sur grand écran, fait défiler juste assez pour montrer le noeud au-dessus du pied du lecteur
//   garderAuDessus(contenu, panneau) : au téléphone, remonte la page pour que le panneau collé ne cache pas le contenu
//
// Saisies (SCHEMA §3)
//   normaliser(texte, tolerance) · distance(a, b) (OSA)
//   evaluerSaisie(donne, reponse, retours, distracteurs) → { verdict: 'juste'|'presque'|'faux'|'vide', attendu,
//     retour, note, correction } — casse, espaces, apostrophes, ponctuation finale ; une faute de frappe sur un mot
//     de 4 lettres ou plus = 'presque' (jamais sur un pronom ni une forme de be) ; « i » minuscule = 'presque' avec la
//     règle ; retours.cibles [{ si, retour }] et distracteurs [{ texte, retour }] donnent l'explication de l'erreur.
//
// Retours, voix, images
//   retoursDe(ctx) → { juste, presque, faux, reponse, info, annoncer } : encarts du socle (repli aux mêmes classes)
//   preparerMedias(ctx) : à attendre au montage (voix.pret, visuels.pret)
//   voixDisponible(ctx, seg) · jouerVoix(ctx, seg, options) → 'fin'|'arret'|'bloque'|'erreur'|'absent' (trace audio_ecoute)
//   boutonEcouter(ctx, seg, { libelle, compact }) → bouton, ou null si la réplique n'est pas produite
//   urlImage(ctx, 'P01') → URL ou null · idSegment(seg) (chaîne, { id } ou { ref })
//
// Étape, suivi, aide, bilan
//   donneesEtape(ctx, fichier, type) → { etape, raison } (ctx.donnees d'abord, sinon le script)
//   afficherEnPreparation(racine, ctx, raison) → { demonter } · regimeDe(ctx, etape) → régime
//   creerSuivi(ctx, etape) → { essai({ item, juste, element, attendu, donne, explication }), aide(item), solution(item),
//     declarer(ids), erreurs, score() → { obtenus, total, score }, remettre() } — barème au premier essai, signale au lecteur
//   creerBarreAide(ctx, { etape, regime, indices: () => [texte1, texte2?], surMontrer, surSolution, nbChoix })
//     → { element, erreur(), nouvelItem(), terminer(), montrer(), solution(), erreurs, seuils } — paliers de D (apres_essais),
//     « Un indice » puis « Un autre indice » (après une nouvelle erreur), « Montrez-moi », « Voir la solution »
//   carteBilan(ctx, { obtenus, total, erreurs, aRetenir, libelleScore, surRecommencer, ecoute, texteEcoute }) → Node
//   signalerFin(ctx, suivi, etape) → { obtenus, total, score } (signaler.fin + son de fin)
//   lancerExercice(racine, ctx, config) : déroulé « une question à la fois » (voir sa documentation plus bas)
//
// Gestes
//   rendreGlissable(source, { hote, cibleSous(x, y), deposer(cible, x, y), signal, actif(), doigt })
//     souris : glisser tout de suite ; doigt : après 230 ms d'appui immobile (un balayage fait défiler la page)
//   depotSous(x, y, attribut, racine) → élément de dépôt · animerVers(de, vers, hote, signal, duree) (démonstrations)
//   motAvecInfobulle(ctx, mot, sens, { signal }) · lireGlossaireNote(note) → Map · texteAvecGloses(ctx, texte, glossaire, { signal })
//
// Styles
//   cssCommun(prefixe) → CSS commun préfixé (.act-<famille>-<type>) : jetons .b3-jeton, panneau collant .b3-dock,
//     barre d'aide, bilan, infobulles. À ENVOYER EN UN SEUL ctx.ajouterStyle(cssCommun(P) + css(P)) : le lecteur
//     ignore un second appel sans clé (ou utiliser la clé facultative de F : ctx.ajouterStyle(css, cle)).
// ────────────────────────────────────────────────────────────────────────────────────────────────

/* ── Icônes : celles du socle quand elles existent, sinon les nôtres (traits, jamais d'emoji) ── */
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const NOS_ICONES = {
  juste: svg('<path d="M20 6 9 17l-5-5"/>'),
  faux: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  indice: svg('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  montrer: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  reponse: svg('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  ecouter: svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  suivant: svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
  rejouer: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  horloge: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
  medaille: svg('<circle cx="12" cy="9" r="6"/><path d="m8.5 13.8-1.3 7.2 4.8-2.6 4.8 2.6-1.3-7.2"/>'),
  retirer: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  message: svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
  badge: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.2 16a3 3 0 0 1 5.6 0"/><path d="M15 10h3"/><path d="M15 14h3"/>'),
  drapeau: svg('<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.33 2q2 0 3.07-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.53"/>'),
  cadenas: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  coche: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  eclair: svg('<path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z"/>'),
};
export function icone(ctx, nom) {
  const s = ctx?.services?.icones;
  return (s && s[nom]) || NOS_ICONES[nom] || NOS_ICONES.info;
}
export const ICONES = NOS_ICONES;

/* ── Petits outils DOM ─────────────────────────────────────────────────────── */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** el('button', { class: 'btn', onclick: fn, 'aria-label': '…' }, enfant1, 'texte', …) */
export function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'texte') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, String(v));
  }
  for (const e of enfants.flat()) {
    if (e === undefined || e === null || e === false) continue;
    n.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return n;
}

export const attendre = (ms, signal) => new Promise((ok) => {
  if (signal?.aborted) return ok();
  const t = setTimeout(ok, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); ok(); }, { once: true });
});

export const mouvementReduit = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Pointeur précis (souris, stylet d'ordinateur) : on y trace des lignes et on y glisse sans appui long. */
export const pointeurFin = () => {
  try { return window.matchMedia('(pointer: fine)').matches; } catch { return false; }
};

/* ── Hasard reproductible (les tests passent ?graine=…) ────────────────────── */
export function creerRng(graine) {
  if (graine === undefined || graine === null || graine === '') return Math.random;
  let h = 1779033703 ^ String(graine).length;
  for (const c of String(graine)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function melanger(tab, rng = Math.random) {
  const t = [...tab];
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  return t;
}

/** Mélange qui ne rend jamais l'ordre de départ (sauf pour un seul élément). */
export function melangerVraiment(tab, rng = Math.random, egal = (a, b) => a === b) {
  if (tab.length < 2) return [...tab];
  for (let k = 0; k < 12; k++) {
    const t = melanger(tab, rng);
    if (t.some((x, i) => !egal(x, tab[i]))) return t;
  }
  return [...tab.slice(1), tab[0]];
}

/* ── Textes du script ─────────────────────────────────────────────────────── */
export function texteFr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.fr ?? v.texte ?? v.en ?? '';
  return String(v);
}
export const liste = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
/** « Oui : plusieurs ordinateurs… » → « Plusieurs ordinateurs… » (le retour juste, repris dans une démonstration). */
export const sansOui = (t) => { const r = String(t || '').replace(/^\s*Oui\s*[:.,]\s*/i, '').trim(); return r ? r[0].toUpperCase() + r.slice(1) : ''; };

/* ── Comparaison tolérante (SCHEMA §3 « reponse ») ─────────────────────────── */
const APOSTROPHES = /[’‘‛`´ʼ′]/g;
const TOLERANCE_DEFAUT = { casse: true, ponctuation_finale: true, apostrophes: true, espaces: true, une_faute_de_frappe: 'presque' };
// Une lettre y change le sens : jamais de « faute de frappe » acceptée sur ces mots (SCHEMA §3).
const MOTS_PROTEGES = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'am', 'is', 'are', "i'm", "you're", "he's",
  "she's", "it's", "we're", "they're", 'his', 'her', 'its', 'your', 'a', 'an', 'the', 'this', 'that', 'to', 'too']);

export function normaliser(s, tol = TOLERANCE_DEFAUT) {
  let t = String(s ?? '').normalize('NFC');
  if (tol.apostrophes !== false) t = t.replace(APOSTROPHES, "'");
  t = t.replace(/[   \t\n\r]/g, ' ');
  t = t.replace(/ *' */g, "'");              // « I ' m » → « I'm »
  t = t.replace(/ +([,.!?;:])/g, '$1');        // pas d'espace avant la ponctuation
  t = t.replace(/([,;:]) *(?=\S)/g, '$1 ');    // une espace après la virgule
  t = t.replace(/ +/g, ' ').trim();
  if (tol.casse !== false) t = t.toLowerCase();
  if (tol.ponctuation_finale !== false) t = t.replace(/[\s.!?…]+$/u, '').trim();
  if (tol.ponctuation === true) t = t.replace(/[.,!?;:…"«»()]/g, '').replace(/ +/g, ' ').trim();
  return t;
}

/** Distance d'édition avec transposition (OSA). */
export function distance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

function uneFaute(donne, attendu) {
  const a = donne.split(' '), b = attendu.split(' ');
  if (a.length !== b.length) return null;
  const diff = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  if (diff.length !== 1) return null;
  const [i] = diff;
  const motAttendu = b[i].replace(/[.,!?;:]+$/, ''), motDonne = a[i].replace(/[.,!?;:]+$/, '');
  if (MOTS_PROTEGES.has(motAttendu.toLowerCase()) || motAttendu.replace(/[^a-z]/gi, '').length < 4) return null;
  return distance(motDonne.toLowerCase(), motAttendu.toLowerCase()) === 1 ? { mot: motAttendu, donne: motDonne } : null;
}

/** « i » minuscule employé comme pronom alors que la réponse attendue a « I ». */
function iMinuscule(brut, attendu) {
  return /(^|[^A-Za-z'])I(?=('m\b|\b))/.test(attendu) && /(^|[^A-Za-z'])i(?=('m\b|\b))(?![a-z])/.test(String(brut).replace(APOSTROPHES, "'"));
}

const motsDe = (t) => t.split(/[\s,.!?;:]+/).filter(Boolean);

/**
 * Évalue une saisie. Rend { verdict: 'juste' | 'presque' | 'faux' | 'vide', attendu, retour, note, correction }.
 * `retours.cibles` : [{ si: [...], retour }] ; `distracteurs` : [{ texte, retour }] servent aussi de cibles.
 */
export function evaluerSaisie(donne, reponse = {}, retours = {}, distracteurs = []) {
  const tol = { ...TOLERANCE_DEFAUT, ...(reponse.tolerance || {}) };
  if (tol.une_faute_de_frappe === 'non' || tol.une_faute_de_frappe === false) tol.une_faute_de_frappe = null;
  const attendues = [...liste(reponse.attendues), ...liste(reponse.variantes)].filter((x) => typeof x === 'string');
  const brut = String(donne ?? '');
  const n = normaliser(brut, tol);
  if (!n) return { verdict: 'vide' };
  const premier = liste(reponse.attendues)[0] ?? attendues[0] ?? '';

  for (const a of attendues) {
    if (normaliser(a, tol) === n) {
      if (tol.casse !== false && iMinuscule(brut, a)) {
        return { verdict: 'presque', attendu: a, correction: a, note: 'Accepté. Petite règle : le pronom I s\'écrit toujours en majuscule, même au milieu d\'une phrase.' };
      }
      return { verdict: 'juste', attendu: a, retour: retours.juste };
    }
  }

  const cibles = [...liste(retours.cibles), ...liste(distracteurs).map((d) => ({ si: [d.texte], retour: d.retour }))];
  for (const c of cibles) {
    if (liste(c.si).some((s) => normaliser(s, tol) === n)) return { verdict: 'faux', attendu: premier, retour: c.retour, cible: true };
  }
  const motsDonnes = new Set(motsDe(n));
  const motsAttendus = new Set(motsDe(normaliser(premier, tol)));
  for (const c of cibles) {
    for (const s of liste(c.si)) {
      const ns = normaliser(s, tol);
      if (ns && !ns.includes(' ') && motsDonnes.has(ns) && !motsAttendus.has(ns)) return { verdict: 'faux', attendu: premier, retour: c.retour, cible: true };
    }
  }
  if (tol.une_faute_de_frappe) {
    for (const a of attendues) {
      const f = uneFaute(n, normaliser(a, tol));
      if (f) {
        return {
          verdict: tol.une_faute_de_frappe === 'presque' ? 'presque' : 'juste',
          attendu: a, correction: f.mot,
          note: retours.presque || 'Accepté, avec une petite faute de frappe.',
        };
      }
    }
  }
  return { verdict: 'faux', attendu: premier, retour: retours.faux_par_defaut };
}

/* ── Retours : les encarts du socle, ou un repli aux mêmes classes ─────────── */
export function retoursDe(ctx) {
  const s = ctx?.services?.retour;
  const secours = (genre, titre, texte, o = {}) => {
    const n = el('div', { class: `encart encart-${genre === 'presque' ? 'note encart-presque' : genre} apparait`, role: genre === 'faux' ? 'alert' : 'status' });
    n.innerHTML = icone(ctx, genre === 'presque' ? 'info' : genre);
    const corps = el('span', {});
    if (titre) corps.append(el('b', { texte: titre }), ' ');
    if (texte) corps.append(el('span', { texte }));
    if (o.correction) corps.append(el('span', { class: 'explication', texte: `Orthographe attendue : ${o.correction}` }));
    if (o.explication) corps.append(el('span', { class: 'explication', texte: o.explication }));
    n.append(corps);
    return n;
  };
  const essayer = (f, repli) => { try { const n = f(); if (n instanceof Node) return n; } catch { /* repli */ } return repli(); };
  return {
    juste: (t, o = {}) => essayer(() => s.juste(t, o), () => secours('juste', null, t || 'Juste.', o)),
    presque: (t, o = {}) => essayer(() => s.presque(t, o), () => secours('presque', null, t || 'Accepté.', o)),
    faux: (t, o = {}) => essayer(() => s.faux(t, o), () => secours('faux', null, t || 'Pas encore.', o)),
    reponse: (t, o = {}) => essayer(() => s.reponse(t, o), () => secours('reponse', 'Voici la réponse.', t, o)),
    info: (t, o = {}) => essayer(() => s.info(t, o), () => secours('info', null, t, o)),
    annoncer: (t) => { try { s?.annoncer?.(t); } catch { /* rien */ } },
  };
}

/* ── Médias : voix produites et images de V ───────────────────────────────── */
// Repli (demande D1 au socle) : si ctx.image ne trouve rien, on lit nous-mêmes visuels.json de V
// (clé « assets »). S'efface de lui-même dès que ctx.image répond.
let imagesDeSecours = null;
async function chargerImagesDeSecours(ctx) {
  if (imagesDeSecours) return imagesDeSecours;
  imagesDeSecours = new Map();
  try {
    const url = ctx?.asset ? ctx.asset('assets/visuels/visuels.json') : '/assets/visuels/visuels.json';
    const r = await fetch(url, { cache: 'no-cache' });
    const j = r.ok ? await r.json() : null;
    for (const v of liste(j?.assets)) {
      if (!v?.id || !v?.fichier || /\.(mp4|webm)$/i.test(v.fichier)) continue;
      if (v.statut && !/retenu|ok|valid/i.test(String(v.statut))) continue;
      imagesDeSecours.set(String(v.id), adresse(`/assets/visuels/${String(v.fichier).replace(/^.*\//, '')}`));
    }
  } catch { /* pas d'image : les activités s'affichent en texte */ }
  return imagesDeSecours;
}

export async function preparerMedias(ctx) {
  await Promise.all([
    Promise.resolve(ctx?.services?.voix?.pret?.()).catch(() => null),
    Promise.resolve(ctx?.services?.visuels?.pret?.()).catch(() => null),
  ]);
  let socle = null;
  try { socle = ctx?.image?.('P01') || ctx?.services?.visuels?.image?.('P01') || null; } catch { socle = null; }
  if (!socle && !ctx.medias) await chargerImagesDeSecours(ctx);
}

export function idSegment(seg) {
  if (!seg) return null;
  if (typeof seg === 'string') return seg;
  return seg.ref || seg.id || null;
}

export function voixDisponible(ctx, seg) {
  const id = idSegment(seg);
  if (!id) return false;
  try { return !!ctx?.services?.voix?.info?.(id)?.url; } catch { return false; }
}

export async function jouerVoix(ctx, seg, options = {}) {
  const id = idSegment(seg);
  if (!id || !voixDisponible(ctx, id)) return 'absent';
  try { ctx.tracer?.('audio_ecoute', { id }); } catch { /* rien */ }
  try { return await ctx.services.voix.jouer(id, options); } catch { return 'erreur'; }
}

export function urlImage(ctx, id) {
  if (!id) return null;
  let u = null;
  try { u = ctx?.image?.(id) || ctx?.services?.visuels?.image?.(id) || null; } catch { u = null; }
  return u || imagesDeSecours?.get(String(id)) || null;
}

/** Bouton « Écouter » : rendu seulement si la réplique a été produite. */
export function boutonEcouter(ctx, seg, { libelle = 'Écouter', classe = '', compact = false } = {}) {
  if (!voixDisponible(ctx, seg)) return el('button', { type: 'button', class: 'btn btn-secondaire', disabled: true, texte: 'Voix en préparation' });
  const b = el('button', { type: 'button', class: `btn btn-secondaire b3-ecouter ${compact ? 'b3-ecouter-compact' : ''} ${classe}`, 'data-voix': '', 'aria-label': libelle });
  b.innerHTML = `${icone(ctx, 'ecouter')}${compact ? '' : `<span>${esc(libelle)}</span>`}`;
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    b.classList.add('b3-en-lecture');
    await jouerVoix(ctx, seg);
    b.classList.remove('b3-en-lecture');
  });
  return b;
}

/** Grand écran : fait défiler juste assez pour que `n` soit visible au-dessus du pied du lecteur. */
export function rendreVisible(n) {
  if (!n || window.innerWidth < 768) return;
  requestAnimationFrame(() => {
    const r = n.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 90 || r.top < 70) n.scrollIntoView({ block: 'nearest', behavior: mouvementReduit() ? 'auto' : 'smooth' });
  });
}

/** Téléphone : si le panneau collé en bas recouvre le bas du contenu, remonte la page juste assez
 *  (sans jamais faire passer le haut du contenu sous l'en-tête du lecteur). */
export function garderAuDessus(contenu, dock) {
  if (!contenu || !dock || window.innerWidth >= 768) return;
  requestAnimationFrame(() => {
    const c = contenu.getBoundingClientRect(), d = dock.getBoundingClientRect();
    const deborde = c.bottom - d.top + 8;
    if (deborde <= 0) return;
    const dy = Math.min(deborde, Math.max(0, c.top - 76));
    if (dy > 4) window.scrollBy({ top: dy, behavior: mouvementReduit() ? 'auto' : 'smooth' });
  });
}

/* ── Données de l'étape : ctx.donnees (contrat 1.1), sinon le script ───────── */
export async function donneesEtape(ctx, fichier, type) {
  if (ctx?.donnees && typeof ctx.donnees === 'object' && (!type || ctx.donnees.type === type || !ctx.donnees.type)) return { etape: ctx.donnees };
  let doc = null;
  try { doc = await ctx.script(fichier); } catch { return { etape: null, raison: 'script à venir' }; }
  const etapes = Array.isArray(doc?.etapes) ? doc.etapes : [];
  const id = ctx?.etape?.id || ctx?.params?.etape;
  const etape = (id && etapes.find((e) => e && e.id === id)) || etapes.find((e) => e && e.type === type) || null;
  return { etape, raison: etape ? null : `aucune étape « ${type} » dans ${fichier}` };
}

export function afficherEnPreparation(racine, ctx, raison) {
  racine.innerHTML = '';
  racine.append(el('div', { class: 'b3-cadre' }, el('div', { class: 'carte b3-vide' },
    el('p', { class: 'b3-vide-titre', texte: 'Contenu en préparation' }),
    el('p', { class: 'petit discret', texte: `Cette activité attend son texte (${raison}).` }))));
  ctx.signaler?.pret?.();
  return { demonter() {} };
}

export const regimeDe = (ctx, etape) => ctx?.regime || etape?.regime || ctx?.etape?.regime || 'a_vous_de_jouer';

/* ── Suivi : essais, barème au premier essai, erreurs expliquées ────────────── */
/**
 * Un item = une chose notée (une étiquette, un trou, une phrase). Seule la réussite au premier essai
 * rapporte le point (SCHEMA §2 « points »). Tout essai est signalé au lecteur avec son explication.
 */
export function creerSuivi(ctx, etape) {
  const items = new Map();   // id → { essais, premier: bool|null, solution: bool }
  const erreurs = [];        // { item, element, donne, attendu, explication }
  const remediation = liste(etape?.remediation);
  const fiche = (id) => { if (!items.has(id)) items.set(id, { essais: 0, premier: null, solution: false, aide: false }); return items.get(id); };
  return {
    essai({ item, juste, element = '', attendu = '', donne = '', explication = '', famille_erreur }) {
      const f = fiche(item);
      f.essais += 1;
      const premier = f.essais === 1;
      if (premier) f.premier = juste !== false && !f.aide;
      if (juste === false) erreurs.push({ item, element, donne, attendu, explication });
      try {
        ctx.signaler?.essai?.({
          juste, item, element, attendu, donne,
          explication: juste === false ? (explication || '') : (explication || undefined),
          remediation: remediation.length ? remediation : undefined,
          premier_essai: premier,
          ...(famille_erreur ? { famille_erreur } : {}),
        });
      } catch { /* le lecteur ne doit jamais casser l'activité */ }
    },
    /** L'item a été montré (démonstration) ou résolu par la solution : pas de point. */
    aide(item) { const f = fiche(item); f.aide = true; if (f.premier === null) f.premier = false; },
    solution(item) { const f = fiche(item); f.solution = true; if (f.premier === null) f.premier = false; },
    declarer(ids) { for (const id of ids) fiche(id); },
    get erreurs() { return erreurs; },
    score() {
      let obtenus = 0, total = 0;
      for (const f of items.values()) { total += 1; if (f.premier === true) obtenus += 1; }
      return { obtenus, total, score: total ? obtenus / total : 0 };
    },
    remettre() { items.clear(); erreurs.length = 0; },
  };
}

/* ── Barre d'aide : paliers de D (SCHEMA §4), un indice puis un autre ──────── */
/**
 * @param opts { etape, regime, indices: () => string[] (le 2e est facultatif), surMontrer, surSolution, nbChoix }
 * Les boutons apparaissent aux paliers ; l'indice se lit d'un toucher, le second attend une nouvelle erreur.
 */
export function creerBarreAide(ctx, opts = {}) {
  const R = retoursDe(ctx);
  const aideScript = opts.etape?.aide || {};
  const seuils = { indice: 2, montrer: 3, solution: 5, ...(aideScript.apres_essais || {}) };
  if (Number.isFinite(opts.nbChoix)) {
    const max = Math.max(1, opts.nbChoix - 1);
    seuils.solution = Math.min(seuils.solution, max);
    seuils.montrer = Math.min(seuils.montrer, seuils.solution);
    seuils.indice = Math.min(seuils.indice, seuils.montrer);
  }
  const evaluation = opts.regime === 'evaluation';
  const element = el('div', { class: 'aide-barre b3-aide-barre', 'data-voix': '' });
  const boutons = el('div', { class: 'aide-boutons b3-aide-boutons' });
  const zone = el('div', { class: 'aide-zone b3-aide-zone' });
  element.append(boutons, zone);
  let erreurs = 0, vus = 0, erreursAuDernierIndice = 0, montre = false, fini = false;

  const bouton = (cle, libelle, nomIcone, action) => {
    const b = el('button', { type: 'button', class: 'btn btn-secondaire aide-btn apparait', 'data-aide': cle });
    b.innerHTML = `${icone(ctx, nomIcone)}<span>${esc(libelle)}</span>`;
    b.addEventListener('click', action);
    return b;
  };
  const indices = () => (evaluation ? [] : liste(opts.indices?.()).filter(Boolean));

  function montrerIndice() {
    const l = indices();
    if (vus >= l.length) return;
    const texte = l[vus];
    vus += 1;
    erreursAuDernierIndice = erreurs;
    try { ctx.signaler?.aide?.({ niveau: 'indice', rang: vus }); } catch { /* rien */ }
    // Un seul indice à l'écran : le suivant remplace le précédent (le panneau du bas reste compact).
    zone.replaceChildren(R.info(texte, {}));
    afficher();
  }
  async function montrer() {
    if (montre || !opts.surMontrer) return;
    montre = true;
    try { ctx.signaler?.aide?.({ niveau: 'montrer' }); } catch { /* rien */ }
    afficher();
    try { await opts.surMontrer(); } catch { /* démonstration interrompue */ }
  }
  function solution() {
    if (fini || !opts.surSolution) return;
    opts.surSolution();
  }
  function afficher() {
    boutons.replaceChildren();
    if (fini || evaluation) { element.hidden = !zone.childElementCount; return; }
    const l = indices();
    const prochainIndice = vus < l.length && erreurs >= seuils.indice && (vus === 0 || erreurs > erreursAuDernierIndice);
    if (prochainIndice) boutons.append(bouton('indice', vus === 0 ? 'Un indice' : 'Un autre indice', 'indice', montrerIndice));
    if (opts.surMontrer && !montre && erreurs >= seuils.montrer) boutons.append(bouton('montrer', 'Montrez-moi', 'montrer', montrer));
    if (opts.surSolution && erreurs >= seuils.solution) boutons.append(bouton('solution', 'Voir la solution', 'reponse', solution));
    element.hidden = boutons.childElementCount === 0 && zone.childElementCount === 0;
  }
  afficher();
  return {
    element,
    erreur() { erreurs += 1; afficher(); },
    nouvelItem() { erreurs = 0; vus = 0; erreursAuDernierIndice = 0; montre = false; fini = false; zone.replaceChildren(); afficher(); },
    terminer() { fini = true; zone.replaceChildren(); afficher(); },
    get erreurs() { return erreurs; },
    get seuils() { return seuils; },
    montrer, solution,
  };
}

/* ── Bilan de fin d'exercice (le retour qui apprend) ──────────────────────── */
export function carteBilan(ctx, { obtenus, total, erreurs = [], aRetenir = '', libelleScore = 'réponses justes du premier coup', surRecommencer, ecoute = null, texteEcoute = '' }) {
  const R = retoursDe(ctx);
  const vue = el('div', { class: 'carte b3-carte b3-bilan apparait' });
  vue.append(el('p', { class: 'b3-bilan-sur', texte: 'Exercice terminé' }));
  const ligne = el('p', { class: 'b3-bilan-score' });
  ligne.append(el('strong', { texte: String(obtenus) }), el('span', { texte: ` sur ${total}` }));
  vue.append(ligne, el('p', { class: 'petit discret', texte: libelleScore }));
  if (ecoute) vue.append(el('div', { class: 'b3-bilan-ecoute' }, texteEcoute ? el('p', { class: 'petit', texte: texteEcoute }) : null, ecoute));
  if (aRetenir) vue.append(R.info(aRetenir));
  const vues = new Set();
  const uniques = erreurs.filter((e) => e.explication && (vues.has(e.explication) ? false : (vues.add(e.explication), true)));
  if (uniques.length) {
    const bloc = el('div', { class: 'b3-a-retenir' });
    bloc.append(el('h3', { texte: 'Vos erreurs, expliquées' }));
    const ul = el('ul');
    for (const e of uniques.slice(0, 8)) {
      ul.append(el('li', {},
        (e.donne || e.attendu) ? el('span', { class: 'b3-ar-paire' },
          e.element ? el('span', { class: 'b3-ar-element', texte: `${e.element} : ` }) : null,
          e.donne ? el('s', { lang: 'en', texte: e.donne }) : null,
          e.donne && e.attendu ? ' → ' : null,
          e.attendu ? el('b', { lang: 'en', texte: e.attendu }) : null) : null,
        el('span', { class: 'b3-ar-texte', texte: e.explication })));
    }
    bloc.append(ul);
    vue.append(bloc);
  } else if (total) {
    vue.append(R.juste('Aucune erreur : tout est juste du premier coup.'));
  }
  if (surRecommencer) {
    const b = el('button', { type: 'button', class: 'btn btn-secondaire', html: `${icone(ctx, 'rejouer')}<span>Recommencer l'exercice</span>` });
    b.addEventListener('click', surRecommencer);
    vue.append(el('div', { class: 'b3-actions' }, el('div', { class: 'b3-actions-pri' }, b)));
  }
  return vue;
}

export function signalerFin(ctx, suivi, etape) {
  const { obtenus, total, score } = suivi.score();
  const seuil = typeof etape?.seuil_reussite === 'number' ? etape.seuil_reussite : 0.6;
  const s = Math.round(score * 100) / 100;
  try { ctx.signaler?.fin?.({ score: s, reussi: score >= seuil, points_obtenus: Math.round(score * (etape?.points || total)) }); } catch { /* rien */ }
  try { ctx.services?.sons?.jouer?.('fin'); } catch { /* rien */ }
  return { obtenus, total, score: s };
}

/* ── Déroulé « une question à la fois » (EX-05, EX-06, EX-07) ────────────────── */
/**
 * config : { type, fichier, prefixe, css?(p), preparer(etape, {rng}) → items,
 *   rendre(zone, item, api) → { verifier(), complet?(), montrer?(signal), solution(), bloquer(), apresErreur?(r), focus?(),
 *                               indice2?(), nbChoix?, validationImmediate? },
 *   libelleItem?(i, n), texteFin?(etape) }
 * verifier() rend { verdict: 'juste'|'presque'|'faux'|'vide', donne, attendu, retour, correction, element, cle }.
 */
export async function lancerExercice(racine, ctx, config) {
  const { type, fichier = 'exercices.json' } = config;
  // Une seule feuille par type : le lecteur ignore un second appel (style[data-act]).
  ctx.ajouterStyle?.(cssCommun(config.prefixe) + (config.css ? config.css(config.prefixe) : ''));
  const { etape, raison } = await donneesEtape(ctx, fichier, type);
  if (!etape) return afficherEnPreparation(racine, ctx, raison);
  await preparerMedias(ctx);

  const R = retoursDe(ctx);
  const regime = regimeDe(ctx, etape);
  const evaluation = regime === 'evaluation';
  const graine = ctx?.params?.graine;
  let rng = creerRng(graine);
  let items = [];
  try { items = config.preparer(etape, { rng }) || []; } catch (e) {
    console.warn('[B3] préparation impossible', e);
    return afficherEnPreparation(racine, ctx, 'format inattendu');
  }
  if (!items.length) return afficherEnPreparation(racine, ctx, 'aucun item');

  const suivi = creerSuivi(ctx, etape);
  suivi.declarer(items.map((i) => i.id));
  let arrete = false;
  let courant = null;
  let index = 0;

  const cadre = el('div', { class: 'b3-cadre' });
  const compteur = el('div', { class: 'b3-compteur' });
  const libelleCompteur = el('span', { class: 'b3-num' });
  const barre = el('div', { class: 'progression', 'aria-hidden': 'true' }, el('span'));
  compteur.append(libelleCompteur, barre);
  const scene = el('div', { class: 'b3-scene' });
  if (items.length > 1) cadre.append(compteur);
  cadre.append(scene);
  racine.replaceChildren(cadre);

  const majCompteur = () => {
    libelleCompteur.textContent = config.libelleItem ? config.libelleItem(index + 1, items.length) : `Question ${index + 1} sur ${items.length}`;
    barre.firstChild.style.width = `${Math.round((index / items.length) * 100)}%`;
    try { ctx.signaler?.progression?.(index / items.length); } catch { /* rien */ }
  };

  // Le focus ne suit l'exercice que pour qui joue au clavier (au doigt, un anneau de focus surprendrait).
  let clavier = false;
  racine.addEventListener('keydown', () => { clavier = true; }, { capture: true });
  racine.addEventListener('pointerdown', () => { clavier = false; }, { capture: true });
  const focaliser = (f) => { if (clavier) f(); };

  racine.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.isComposing || !courant) return;
    const t = ev.target;
    if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    ev.preventDefault();
    courant.entree();
  });

  function montrerItem() {
    if (arrete) return;
    courant?.ac.abort();
    const item = items[index];
    const ac = new AbortController();
    ctx.signal?.addEventListener('abort', () => ac.abort(), { once: true });
    majCompteur();

    const vue = el('div', { class: 'carte b3-carte apparait' });
    const zone = el('div', { class: 'b3-item' });
    const zoneRetour = el('div', { class: 'b3-retour', 'aria-live': 'polite' });
    const actions = el('div', { class: 'b3-actions' });
    const principales = el('div', { class: 'b3-actions-pri' });
    const etat = { erreurs: 0, fini: false, cleEssai: null, montre: false };
    const bVerifier = el('button', { type: 'button', class: 'btn btn-primaire b3-btn-verifier', html: '<span>Vérifier</span>' });
    const dernier = index === items.length - 1;
    const bSuivant = el('button', { type: 'button', class: 'btn btn-primaire b3-btn-suivant', hidden: true, html: `<span>${dernier ? 'Voir mon résultat' : 'Question suivante'}</span>${icone(ctx, 'suivant')}` });
    principales.append(bVerifier, bSuivant);
    actions.append(principales);

    const api = {
      ctx, rng, etape, item, regime, evaluation, signal: ac.signal, R,
      valider: () => verifier(),
      changement: () => { if (ctrl) majBoutons(); },
      effacerRetour: () => zoneRetour.replaceChildren(),
      boutonEcouter: (seg, o) => boutonEcouter(ctx, seg, o),
      jouer: (seg, o) => jouerVoix(ctx, seg, o),
      afficherRetour: (n) => { zoneRetour.replaceChildren(n); },
      ajouterRetour: (n) => { zoneRetour.append(n); },
    };
    let ctrl;
    try { ctrl = config.rendre(zone, item, api) || {}; } catch (e) {
      console.error('[B3] rendu impossible', e);
      zone.append(R.info('Cette question n\'a pas pu s\'afficher. Passez à la suivante.'));
      ctrl = { verifier: () => ({ verdict: 'juste' }), solution: () => ({}), bloquer() {} };
    }
    const aide = creerBarreAide(ctx, {
      etape, regime, nbChoix: ctrl.nbChoix,
      indices: () => [texteFr(etape.aide?.indice), ctrl.indice2?.()].filter(Boolean),
      surMontrer: ctrl.montrer ? async () => {
        etat.montre = true;
        suivi.aide(item.id);
        zoneRetour.replaceChildren();   // la démonstration remplace le dernier message : le panneau se resserre
        bVerifier.disabled = true;
        await ctrl.montrer(ac.signal);
        if (!ac.signal.aborted) { majBoutons(); focaliser(() => ctrl.focus?.()); }
      } : null,
      surSolution: () => solution(),
    });
    const dock = el('div', { class: 'b3-dock' }, zoneRetour, aide.element, actions);
    vue.append(zone, dock);
    scene.replaceChildren(vue);
    if (config.validationImmediate || ctrl.validationImmediate) bVerifier.hidden = true;

    function majBoutons() {
      if (etat.fini || !ctrl) return;
      const complet = ctrl.complet ? ctrl.complet() : true;
      bVerifier.disabled = !complet;
      if (ctrl.verifierVisible) bVerifier.hidden = !!(config.validationImmediate || ctrl.validationImmediate) || !ctrl.verifierVisible();
    }

    function solution() {
      if (etat.fini) return;
      suivi.solution(item.id);
      try { ctx.signaler?.solution?.({ item: item.id }); } catch { /* rien */ }
      const info = ctrl.solution() || {};
      zoneRetour.replaceChildren(R.reponse(info.texte ?? '', { explication: info.explication || '' }));
      const ecoute = boutonEcouter(ctx, info.audio, { libelle: 'Écouter' });
      if (ecoute) zoneRetour.append(el('div', { class: 'b3-ecoute-ligne' }, ecoute));
      ctrl.bloquer?.();
      terminerItem();
    }

    function terminerItem() {
      etat.fini = true;
      aide.terminer();
      bVerifier.hidden = true;
      bSuivant.hidden = false;
      requestAnimationFrame(() => { if (!ac.signal.aborted) focaliser(() => bSuivant.focus({ preventScroll: true })); });
    }

    function verifier() {
      if (etat.fini || arrete) return;
      if (ctrl.complet && !ctrl.complet()) {
        zoneRetour.replaceChildren(R.info(ctrl.messageIncomplet || 'Complétez d\'abord votre réponse.'));
        return;
      }
      let r;
      try { r = ctrl.verifier() || { verdict: 'faux' }; } catch (e) { console.warn('[B3] vérification', e); r = { verdict: 'faux' }; }
      if (r.verdict === 'vide' || r.verdict === 'incomplet') {
        zoneRetour.replaceChildren(R.info(r.message || 'Complétez d\'abord votre réponse.'));
        return;
      }
      const cle = r.cle ?? JSON.stringify([r.donne, r.verdict]);
      if (r.verdict === 'faux' && cle === etat.cleEssai) { ctrl.focus?.(); return; }
      etat.cleEssai = cle;
      const juste = r.verdict === 'juste' ? true : r.verdict === 'presque' ? 'presque' : false;
      const explication = r.retour || r.explication || '';
      suivi.essai({ item: item.id, juste, element: r.element ?? item.element ?? '', attendu: r.attendu ?? '', donne: r.donne ?? '', explication });
      if (juste !== false) {
        const n = r.verdict === 'presque'
          ? R.presque(r.note || 'Accepté.', { correction: r.correction && r.correction !== r.donne ? r.correction : undefined, explication: r.complement || '' })
          : R.juste(explication || 'Juste.', { explication: r.complement || '' });
        zoneRetour.replaceChildren(n);
        const ecoute = boutonEcouter(ctx, r.audio, { libelle: 'Écouter la phrase' });
        if (ecoute) zoneRetour.append(el('div', { class: 'b3-ecoute-ligne' }, ecoute));
        if (r.audio && r.jouerAuto !== false) jouerVoix(ctx, r.audio);
        try { ctx.services?.sons?.jouer?.('juste'); } catch { /* rien */ }
        ctrl.bloquer?.();
        terminerItem();
        garderAuDessus(zone, dock);
        return;
      }
      etat.erreurs += 1;
      try { ctx.services?.sons?.jouer?.('faux'); } catch { /* rien */ }
      zoneRetour.replaceChildren(R.faux(r.titre || (evaluation ? 'Réponse enregistrée.' : 'Pas encore.'), { explication }));
      if (evaluation) { ctrl.bloquer?.(); terminerItem(); return; }
      aide.erreur();
      ctrl.apresErreur?.(r);
      majBoutons();
      focaliser(() => ctrl.focus?.());
      garderAuDessus(zone, dock);
    }

    bVerifier.addEventListener('click', verifier);
    bSuivant.addEventListener('click', suivant);
    courant = {
      ac, ctrl, item, aide,
      entree() { if (etat.fini) suivant(); else if (!bVerifier.hidden && !bVerifier.disabled) verifier(); },
      montrer: () => aide.montrer(),
      montrerSolution: () => solution(),
    };
    majBoutons();
    requestAnimationFrame(() => { if (!ac.signal.aborted) focaliser(() => ctrl.focus?.()); });
  }

  function suivant() {
    if (arrete) return;
    if (index < items.length - 1) { index += 1; montrerItem(); return; }
    bilan();
  }

  function bilan() {
    courant?.ac.abort();
    courant = null;
    barre.firstChild.style.width = '100%';
    try { ctx.signaler?.progression?.(1); } catch { /* rien */ }
    const { obtenus, total } = signalerFin(ctx, suivi, etape);
    libelleCompteur.textContent = 'Résultat';
    const vue = carteBilan(ctx, {
      obtenus, total, erreurs: suivi.erreurs,
      aRetenir: config.texteFin ? config.texteFin(etape) : texteFr(etape.retours?.fin),
      surRecommencer: recommencer,
    });
    scene.replaceChildren(vue);
    requestAnimationFrame(() => vue.querySelector('button')?.focus({ preventScroll: true }));
  }

  function recommencer() {
    rng = creerRng(graine === undefined ? undefined : `${graine}-r${Date.now()}`);
    try { items = config.preparer(etape, { rng }) || items; } catch { /* garde les items */ }
    suivi.remettre();
    suivi.declarer(items.map((i) => i.id));
    index = 0;
    montrerItem();
  }

  montrerItem();
  try { ctx.signaler?.pret?.(); } catch { /* rien */ }

  return {
    demonter() { arrete = true; courant?.ac.abort(); courant = null; },
    montrer() { courant?.montrer?.(); },
    montrerSolution() { courant?.montrerSolution?.(); },
  };
}

/* ── Glisser-déposer : souris immédiat, doigt après un appui long ───────────── */
/**
 * Rend `source` glissable, EN PLUS du toucher (qui reste l'action principale et accessible).
 * `cibleSous(x, y)` rend l'élément de dépôt sous le pointeur, `deposer(cible)` fait l'action du toucher.
 * Au doigt, le glisser démarre après 230 ms d'appui immobile : un simple balayage fait défiler la page.
 */
export function rendreGlissable(source, { hote, cibleSous, deposer, signal, actif = () => true, doigt = true }) {
  let depart = null, fantome = null, survol = null, id = null, minuterie = null, type = null;
  const SEUIL = 7, APPUI = 230;
  const nettoyer = () => {
    clearTimeout(minuterie); minuterie = null;
    fantome?.remove(); fantome = null;
    source.classList.remove('b3-fantome', 'b3-souleve');
    survol?.classList.remove('b3-cible-survol'); survol = null;
    depart = null;
    if (id !== null) { try { source.releasePointerCapture(id); } catch { /* déjà relâché */ } id = null; }
  };
  const commencer = (x, y) => {
    try { source.setPointerCapture(id); } catch { /* ignore */ }
    const r = source.getBoundingClientRect();
    fantome = source.cloneNode(true);
    fantome.removeAttribute('id');
    fantome.classList.add('b3-glisse');
    fantome.setAttribute('aria-hidden', 'true');
    fantome.style.width = `${r.width}px`;
    fantome.style.left = `${x}px`;
    fantome.style.top = `${y}px`;
    (hote || source.parentElement).append(fantome);
    source.classList.add('b3-fantome');
  };
  source.addEventListener('pointerdown', (e) => {
    if (!actif() || source.disabled || e.button > 0) return;
    type = e.pointerType;
    if (type !== 'mouse' && !doigt) return;
    depart = { x: e.clientX, y: e.clientY };
    id = e.pointerId;
    if (type !== 'mouse') {
      minuterie = setTimeout(() => {
        if (!depart) return;
        source.classList.add('b3-souleve');
        commencer(depart.x, depart.y);
      }, APPUI);
    }
  }, { signal });
  source.addEventListener('pointermove', (e) => {
    if (!depart || e.pointerId !== id) return;
    const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
    if (!fantome) {
      if (type !== 'mouse') { if (Math.hypot(dx, dy) > SEUIL) { clearTimeout(minuterie); depart = null; } return; }
      if (Math.hypot(dx, dy) < SEUIL) return;
      commencer(e.clientX, e.clientY);
    }
    fantome.style.left = `${e.clientX}px`;
    fantome.style.top = `${e.clientY}px`;
    const c = cibleSous(e.clientX, e.clientY);
    if (c !== survol) { survol?.classList.remove('b3-cible-survol'); survol = c; survol?.classList.add('b3-cible-survol'); }
  }, { signal });
  // Pendant un glisser au doigt, la page ne défile pas.
  source.addEventListener('touchmove', (e) => { if (fantome) e.preventDefault(); }, { passive: false, signal });
  source.addEventListener('contextmenu', (e) => { if (type !== 'mouse') e.preventDefault(); }, { signal });
  source.addEventListener('pointerup', (e) => {
    if (fantome) {
      const c = cibleSous(e.clientX, e.clientY);
      source.dataset.glisse = '1';
      setTimeout(() => { delete source.dataset.glisse; }, 60);
      nettoyer();
      if (c) deposer(c, e.clientX, e.clientY);
      return;
    }
    nettoyer();
  }, { signal });
  source.addEventListener('pointercancel', nettoyer, { signal });
  source.addEventListener('click', (e) => { if (source.dataset.glisse) { e.stopImmediatePropagation(); e.preventDefault(); } }, { capture: true, signal });
  signal?.addEventListener('abort', nettoyer, { once: true });
}

/** L'élément de dépôt sous un point, parmi ceux qui portent l'attribut `attr` dans `racine`. */
export function depotSous(x, y, attr, racine) {
  const pile = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
  for (const n of pile) {
    if (!n || n.closest?.('.b3-glisse')) continue;
    const c = n.closest?.(`[${attr}]`);
    if (c && (!racine || racine.contains(c))) return c;
  }
  return null;
}

/** Déplace visuellement un clone de `de` jusqu'à `vers` (démonstrations). Se termine toujours. */
export async function animerVers(de, vers, hote, signal, duree = 750) {
  if (!de || !vers || signal?.aborted) return;
  if (mouvementReduit()) { await attendre(250, signal); return; }
  const a = de.getBoundingClientRect(), b = vers.getBoundingClientRect();
  const clone = de.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.add('b3-glisse', 'b3-demo-vol');
  clone.setAttribute('aria-hidden', 'true');
  clone.style.width = `${a.width}px`;
  clone.style.left = `${a.left + a.width / 2}px`;
  clone.style.top = `${a.top + a.height / 2}px`;
  clone.style.transition = `left ${duree}ms var(--doux), top ${duree}ms var(--doux)`;
  (hote || document.body).append(clone);
  await attendre(30, signal);
  clone.style.left = `${b.left + b.width / 2}px`;
  clone.style.top = `${b.top + b.height / 2}px`;
  await attendre(duree + 60, signal);
  clone.remove();
}

/* ── Infobulle de vocabulaire (mot touché → sens), fermée au toucher suivant ── */
export function motAvecInfobulle(ctx, mot, sens, { signal } = {}) {
  const b = el('button', { type: 'button', class: 'b3-glose', 'aria-expanded': 'false', lang: 'en' });
  b.textContent = mot;
  const bulle = el('span', { class: 'b3-bulle', role: 'tooltip', hidden: true, lang: 'fr' });
  bulle.append(el('b', { lang: 'en', texte: mot }), ' : ', sens);
  const enveloppe = el('span', { class: 'b3-glose-env' }, b, bulle);
  const fermer = () => { bulle.hidden = true; b.setAttribute('aria-expanded', 'false'); };
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const ouvrir = bulle.hidden;
    document.querySelectorAll('.b3-bulle:not([hidden])').forEach((x) => { x.hidden = true; });
    bulle.hidden = !ouvrir;
    b.setAttribute('aria-expanded', String(ouvrir));
    if (ouvrir) {
      try { ctx.tracer?.('mot_consulte', { mot }); } catch { /* rien */ }
      // Garder la bulle dans l'écran.
      bulle.style.left = ''; bulle.style.right = '';
      requestAnimationFrame(() => {
        const r = bulle.getBoundingClientRect();
        if (r.right > window.innerWidth - 8) { bulle.style.left = 'auto'; bulle.style.right = '0'; }
        if (r.left < 8) { bulle.style.left = '0'; bulle.style.right = 'auto'; }
      });
    }
  });
  b.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer(); });
  document.addEventListener('click', fermer, { signal });
  // Cible tactile de 44 px au moins, sans décaler le texte : marge intérieure compensée par une marge négative.
  requestAnimationFrame(() => {
    const w = b.getBoundingClientRect().width;
    if (w > 0 && w < 44) { const pad = Math.ceil((44 - w) / 2); b.style.paddingInline = `${pad}px`; b.style.marginInline = `-${pad}px`; }
  });
  return enveloppe;
}

/** « trade fair = salon professionnel ; quiet = calme. … » → Map('trade fair' → 'salon professionnel', …) */
export function lireGlossaireNote(note) {
  const m = new Map();
  const partie = String(note || '').split(/\.\s/)[0];
  for (const bout of partie.split(/\s*;\s*/)) {
    const x = bout.match(/^\s*([A-Za-z' -]+?)\s*=\s*(.+?)\s*\.?\s*$/);
    if (x) m.set(x[1].trim(), x[2].trim());
  }
  return m;
}

/** Découpe `texte` et remplace chaque expression du glossaire par un mot à infobulle. */
export function texteAvecGloses(ctx, texte, glossaire, { signal } = {}) {
  const frag = document.createDocumentFragment();
  const cles = [...(glossaire?.keys?.() || [])].sort((a, b) => b.length - a.length);
  if (!cles.length) { frag.append(texte); return frag; }
  const re = new RegExp(`\\b(${cles.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
  let dernier = 0;
  for (const m of texte.matchAll(re)) {
    frag.append(texte.slice(dernier, m.index));
    const cle = cles.find((k) => k.toLowerCase() === m[0].toLowerCase());
    frag.append(motAvecInfobulle(ctx, m[0], glossaire.get(cle), { signal }));
    dernier = m.index + m[0].length;
  }
  frag.append(texte.slice(dernier));
  return frag;
}

/* ── Feuille de style commune (préfixée par l'activité) ───────────────────── */
export function cssCommun(p) {
  return `
${p} { --b3-jeton-h: 44px; }
${p} .b3-cadre { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: var(--largeur-lecture, 760px); margin: 0; margin-inline: var(--colonne-marge, 0); min-width: 0; }
${p} .b3-compteur { display: flex; align-items: center; gap: 12px; }
${p} .b3-num { font-size: 0.8125rem; font-weight: 600; color: var(--encre-50); white-space: nowrap; }
${p} .b3-compteur .progression { flex: 1; }
${p} .b3-carte { padding: 18px 16px 16px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
@media (min-width: 768px) { ${p} .b3-carte { padding: 24px 26px 22px; gap: 16px; } }
${p} .b3-item { min-width: 0; }
${p} { --b3-pied: calc(76px + env(safe-area-inset-bottom, 0px)); }
${p} .b3-dock { display: flex; flex-direction: column; gap: 10px; scroll-margin-bottom: calc(var(--b3-pied) + 12px); }
${p} .b3-dock:not(:has(.encart, .aide-btn, .btn:not([hidden]), .b3-jeton)) { display: none; }
@media (max-width: 767px) {
  ${p} .b3-dock { position: sticky; bottom: var(--b3-pied); z-index: 6; max-height: 36vh; overflow-y: auto; overscroll-behavior: contain;
    margin: 0 -16px -16px; padding: 12px 16px 14px; background: rgba(255, 255, 255, 0.96);
    -webkit-backdrop-filter: saturate(1.3) blur(14px); backdrop-filter: saturate(1.3) blur(14px);
    border-top: 1px solid var(--filet); border-radius: 0 0 var(--rayon-carte) var(--rayon-carte); }
}
${p} .b3-dock:empty { display: none; }
${p} .b3-mode { display: flex; align-items: center; gap: 8px; color: var(--encre-50); font-size: 0.875rem; }
${p} .b3-mode svg { width: 18px; height: 18px; flex: none; color: var(--marque); }
${p} .b3-retour { display: flex; flex-direction: column; gap: 8px; }
${p} .b3-retour:empty { display: none; }
${p} .b3-aide-barre { margin-top: 0 !important; display: grid; gap: 10px; }
${p} .b3-aide-barre[hidden] { display: none; }
${p} .b3-aide-boutons { display: flex; flex-wrap: wrap; gap: 8px; }
${p} .b3-aide-boutons:empty, ${p} .b3-aide-zone:empty { display: none; }
${p} .b3-aide-zone { display: grid; gap: 8px; }
${p} .b3-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; }
${p} .b3-actions-pri { display: flex; gap: 8px; margin-left: auto; }
${p} .b3-actions-pri .btn { min-width: 10rem; }
@media (max-width: 560px) {
  ${p} .b3-actions { align-items: stretch; }
  ${p} .b3-actions-pri { margin-left: 0; flex: 1; }
  ${p} .b3-actions-pri .btn { flex: 1; }
}
${p} .b3-ecoute-ligne { display: flex; gap: 8px; flex-wrap: wrap; }
${p} .b3-ecouter { min-height: var(--cible); padding: 0.45rem 0.9rem; font-size: 0.9rem; }
${p} .b3-ecouter-compact { width: var(--cible); padding: 0; flex: none; }
${p} .b3-ecouter.b3-en-lecture { border-color: var(--marque-voile-bord); color: var(--marque-fonce); background: var(--marque-voile); }
${p} [lang="en"] { font-feature-settings: 'kern'; }

/* Jetons : mots à toucher ou à glisser */
${p} .b3-jeton { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: var(--b3-jeton-h); padding: 0 14px; border-radius: 12px; border: 1px solid var(--filet-fort); background: var(--surface); color: var(--encre); font-weight: 600; font-size: 1rem; line-height: 1.2; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; box-shadow: 0 1px 0 rgba(12,21,40,0.05), 0 1px 2px rgba(12,21,40,0.04); transition: transform .18s var(--ressort), background-color .15s, border-color .15s, color .15s, box-shadow .15s, opacity .15s; touch-action: manipulation; max-width: 100%; white-space: normal; text-align: center; }
@media (hover: hover) { ${p} .b3-jeton:hover:not(:disabled) { border-color: var(--marque-voile-bord); } }
${p} .b3-jeton:active:not(:disabled) { transform: scale(0.97); }
${p} .b3-jeton[aria-pressed="true"] { border-color: var(--marque); background: var(--marque-voile); color: var(--marque-tres-fonce); box-shadow: 0 0 0 1px var(--marque) inset; }
${p} .b3-jeton.b3-ok { border-color: var(--juste-bord); background: var(--juste-voile); color: var(--juste-fonce); box-shadow: none; cursor: default; }
${p} .b3-jeton.b3-ko { border-color: var(--faux-bord); background: var(--faux-voile); color: var(--faux-fonce); box-shadow: none; }
${p} .b3-jeton.b3-ok.b3-par-aide { border-style: dashed; background: var(--surface); }
${p} .b3-jeton.b3-ecarte { opacity: 0.4; box-shadow: none; text-decoration: line-through; }
${p} .b3-jeton:disabled { cursor: default; }
${p} .b3-jeton.b3-fantome { opacity: 0.25; }
${p} .b3-jeton.b3-souleve { transform: scale(1.04); box-shadow: 0 8px 22px rgba(12,21,40,0.14); }
${p} .b3-glisse { position: fixed; z-index: 60; pointer-events: none; margin: 0; transform: translate(-50%, -50%) scale(1.05); box-shadow: 0 12px 28px rgba(12,21,40,0.18); border-color: var(--marque) !important; background: var(--surface); }
${p} .b3-cible-survol { outline: 2px dashed var(--marque-clair); outline-offset: 3px; }
${p} .b3-surligne { background: linear-gradient(transparent 58%, var(--marque-voile-bord) 58%); border-radius: 2px; }
@keyframes b3-secoue { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
${p} .b3-secoue { animation: b3-secoue .28s ease-in-out 1; }
@keyframes b3-pouls { 0% { box-shadow: 0 0 0 0 rgba(27,42,74,0.35); } 100% { box-shadow: 0 0 0 10px rgba(27,42,74,0); } }
${p} .b3-pouls { animation: b3-pouls .9s var(--doux) 2; }

/* Infobulles de vocabulaire */
${p} .b3-glose-env { position: relative; display: inline; }
${p} .b3-glose { font: inherit; color: inherit; background: none; border: 0; padding: 9px 0; margin: -9px 0; cursor: help; text-decoration: underline dotted var(--marque-clair); text-decoration-thickness: 2px; text-underline-offset: 4px; border-radius: 6px; min-height: 44px; vertical-align: baseline; touch-action: manipulation; }
${p} .b3-glose-env { position: relative; }
${p} .b3-bulle { position: absolute; left: 0; bottom: calc(100% + 8px); z-index: 20; width: max-content; max-width: min(260px, 80vw); padding: 8px 12px; border-radius: 10px; background: var(--encre); color: #fff; font-size: 0.875rem; line-height: 1.35; font-weight: 500; box-shadow: var(--ombre-carte-forte); white-space: normal; }
${p} .b3-bulle b { font-weight: 700; }

/* Bilan */
${p} .b3-bilan { gap: 10px; }
${p} .b3-bilan-sur { font-weight: 700; color: var(--encre-50); text-transform: uppercase; letter-spacing: .06em; font-size: .75rem; }
${p} .b3-bilan-score { font-family: var(--police-titre); font-size: 2.2rem; line-height: 1.1; }
${p} .b3-bilan-score strong { font-weight: 600; }
${p} .b3-bilan-score span { font-size: 1.1rem; color: var(--encre-50); font-family: var(--police); }
${p} .b3-bilan-ecoute { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
${p} .b3-a-retenir { margin-top: 4px; padding: 14px 16px; border-radius: var(--rayon-bloc); background: var(--fond-chaud, #FAF8F5); border: 1px solid var(--filet); }
${p} .b3-a-retenir h3 { margin-bottom: 8px; }
${p} .b3-a-retenir ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
${p} .b3-a-retenir li { display: flex; flex-direction: column; gap: 2px; font-size: .95rem; line-height: 1.45; }
${p} .b3-ar-element { color: var(--encre-50); }
${p} .b3-ar-paire s { color: var(--faux-fonce); text-decoration-thickness: 1.5px; }
${p} .b3-ar-paire b { color: var(--juste-fonce); }
${p} .b3-ar-texte { color: var(--encre-70); }
${p} .b3-vide { padding: 22px; display: flex; flex-direction: column; gap: 4px; }
${p} .b3-vide-titre { font-weight: 700; }
@media (prefers-reduced-motion: reduce) { ${p} .b3-secoue, ${p} .b3-pouls { animation: none; } }
`;
}
