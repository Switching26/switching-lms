// activities/jeux/_jeux.js — boîte à outils des trois jeux de B4 : course (JEU-1), memory (JEU-2), mission (JEU-3).
//
// Pas un type d'activité : le nom commence par « _ », le serveur ne le liste pas.
// Tout passe par `ctx` (CONTRAT-ACTIVITES v1.1). Rien ne touche au document hors de la racine de l'activité.
//
// Les jeux prennent tout l'écran de l'étape (meta.entete = false) : chacun affiche lui-même, sur son écran
// d'accueil, le régime, le titre, l'objectif et la consigne, avec les mêmes classes que le lecteur. Ainsi la
// partie tient dans l'écran du téléphone, sans en-tête à faire défiler.
//
// Réutilise EN LECTURE la comparaison tolérante de B3 (activities/exercices/_commun.js), chargée à la demande :
// si ce fichier change ou manque, une version locale plus simple prend le relais et les jeux continuent.

/* ── DOM ─────────────────────────────────────────────────────────────────────── */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** el('button', { class: 'btn', onclick: fn, 'aria-label': '…' }, enfant, 'texte', …) */
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

/* ── Icônes : celles du socle quand elles existent, sinon les nôtres (traits, jamais d'emoji) ── */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${d}</svg>`;
const NOS_ICONES = {
  etoile: svg('<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8L12 3Z"/>'),
  etoilePleine: svg('<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8L12 3Z" fill="currentColor"/>'),
  eclair: svg('<path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z"/>'),
  chrono: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5"/><path d="M9.5 2h5"/><path d="M12 2v3"/>'),
  badge: svg('<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M9.5 3h5v5h-5z"/><circle cx="12" cy="12.5" r="2.2"/><path d="M8.6 18a3.6 3.6 0 0 1 6.8 0"/>'),
  telephone: svg('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  epingle: svg('<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>'),
  sceau: svg('<circle cx="12" cy="10" r="6.5"/><path d="m9.2 10 1.9 1.9 3.8-3.8"/><path d="M8.3 15.4 7 22l5-2.6 5 2.6-1.3-6.6"/>'),
  porte: svg('<path d="M3 21h18"/><path d="M6 21V4h9v17"/><path d="M15 6h3v15"/><path d="M12 12.5h.01"/>'),
  melanger: svg('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>'),
  coche: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  rejouer: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  suivant: svg('<path d="m9 18 6-6-6-6"/>'),
  ecouter: svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  lecture: svg('<path d="M7 4v16l13-8L7 4Z"/>', 'fill="currentColor" stroke="none"'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  carnet: svg('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
};
export function icone(ctx, nom) {
  const s = ctx?.services?.icones;
  return (s && s[nom]) || NOS_ICONES[nom] || NOS_ICONES.info;
}
export const ICONES = NOS_ICONES;

/* ── Hasard reproductible (les contrôles passent ?graine=… dans l'adresse) ───────── */
export function creerHasard(graine) {
  if (graine === undefined || graine === null || graine === '') return Math.random;
  let h = 1779033703 ^ String(graine).length;
  for (const c of String(graine)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function melanger(tab, hasard = Math.random) {
  const t = [...tab];
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(hasard() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  return t;
}

/**
 * Paramètres de test de l'adresse (#/etape/JEU-1?banc=1&graine=3&duree=12) : tirage reproductible, partie
 * raccourcie. Pris en compte UNIQUEMENT sur le banc d'essai (ctx.mode === 'banc') : dans la leçon, l'apprenant
 * a toujours les réglages du script de D (60 secondes, tirage au hasard), même si l'adresse en contient.
 */
export function parametres(ctx) {
  if (ctx?.mode !== 'banc') return {};
  try { return Object.fromEntries(new URLSearchParams((location.hash.split('?')[1] || ''))); } catch { return {}; }
}

export const mouvementReduit = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export const pointeurFin = () => { try { return window.matchMedia('(pointer: fine)').matches; } catch { return false; } };

/* ── Minuteries : tout ce qui tourne est arrêté d'un coup au démontage ─────────── */
export function creerMinuteries(signal) {
  const attentes = new Set();
  const images = new Set();
  const api = {
    apres(ms, f) {
      const id = setTimeout(() => { attentes.delete(id); if (!signal?.aborted) f(); }, Math.max(0, ms));
      attentes.add(id);
      return id;
    },
    annuler(id) { if (id) { clearTimeout(id); attentes.delete(id); } },
    image(f) {
      const id = requestAnimationFrame((t) => { images.delete(id); if (!signal?.aborted) f(t); });
      images.add(id);
      return id;
    },
    annulerImage(id) { if (id) { cancelAnimationFrame(id); images.delete(id); } },
    /** Promesse résolue après `ms` (jamais si l'activité est démontée entre-temps : rien ne repart). */
    attendre(ms) { return new Promise((ok) => { api.apres(ms, ok); }); },
    toutArreter() {
      for (const id of attentes) clearTimeout(id);
      for (const id of images) cancelAnimationFrame(id);
      attentes.clear(); images.clear();
    },
  };
  signal?.addEventListener('abort', () => api.toutArreter(), { once: true });
  return api;
}

/* ── Voix : fichiers de l'outil de voix, tracés à chaque écoute ─────────────────── */
export function voixInfo(ctx, id) {
  if (!id) return null;
  try { return ctx?.services?.voix?.info?.(id) || null; } catch { return null; }
}

/** Joue un segment produit. Rend 'fin' | 'arret' | 'bloque' | 'erreur' | 'absent'. */
export async function jouerVoix(ctx, id, opts = {}) {
  if (!voixInfo(ctx, id)) return 'absent';
  try { ctx.tracer?.('audio_ecoute', { id }); } catch { /* rien */ }
  try { return await ctx.services.voix.jouer(id, opts); } catch { return 'erreur'; }
}

/** Précharge en mémoire les sons des segments (la lecture démarre ensuite sans attente réseau). */
export async function prechargerVoix(ctx, ids) {
  const urls = ids.map((id) => voixInfo(ctx, id)?.url).filter(Boolean);
  if (!urls.length) return;
  try { await ctx.services.audio.precharger(urls); } catch { /* la lecture ira chercher le fichier */ }
}

/** Précharge des images (décodées avant d'être montrées : pas de carte blanche au retournement). */
export function prechargerImages(urls) {
  return Promise.allSettled(urls.filter(Boolean).map((u) => new Promise((ok) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => { (i.decode ? i.decode() : Promise.resolve()).catch(() => {}).then(ok); };
    i.onerror = ok;
    i.src = u;
  })));
}

/* ── Transcription mot à mot (surlignée pendant l'écoute, phrase utile marquée) ─── */
const normMot = (m) => String(m || '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z0-9']/g, '');

/** Aligne les mots affichés (texte de D, avec sa ponctuation) sur les mots horodatés du manifeste. */
function aligner(motsAffiches, horodates) {
  const res = motsAffiches.map(() => null);
  let j = 0;
  for (let i = 0; i < motsAffiches.length; i++) {
    const cible = normMot(motsAffiches[i]);
    if (!cible) continue;
    for (let k = j; k < Math.min(horodates.length, j + 4); k++) {
      if (normMot(horodates[k].mot) === cible) { res[i] = { debut: horodates[k].debut, fin: horodates[k].fin }; j = k + 1; break; }
    }
  }
  // Trous : on interpole entre les voisins connus.
  for (let i = 0; i < res.length; i++) {
    if (res[i]) continue;
    const avant = res.slice(0, i).reverse().find(Boolean);
    const apres = res.slice(i + 1).find(Boolean);
    const d = avant ? avant.fin : 0;
    res[i] = { debut: d, fin: apres ? apres.debut : d + 0.3 };
  }
  return res;
}

/** Indices [debut, fin] des mots affichés qui forment `phrase` (comparaison sans ponctuation ni casse). */
export function plageDe(motsAffiches, phrase) {
  const cible = String(phrase || '').split(/\s+/).map(normMot).filter(Boolean);
  if (!cible.length) return null;
  const n = motsAffiches.map(normMot);
  for (let i = 0; i + cible.length <= n.length; i++) {
    if (cible.every((m, k) => n[i + k] === m)) return [i, i + cible.length - 1];
  }
  return null;
}

/**
 * Transcription cliquable d'un segment : chaque mot s'allume pendant l'écoute.
 * `lecteurTranscrit(ctx, id, texte)` rend { element, jouer({ utile }) , marquer(phrase), vider() }.
 * `utile` : phrase de D à surligner (démonstration « Montrez-moi »).
 */
export function lecteurTranscrit(ctx, id, texte) {
  const motsAffiches = String(texte || '').split(/\s+/).filter(Boolean);
  const info = voixInfo(ctx, id);
  const temps = aligner(motsAffiches, info?.mots || []);
  const p = el('p', { class: 'j-transcrit', lang: 'en' });
  const spans = motsAffiches.map((m) => el('span', { class: 'j-mot', texte: m }));
  spans.forEach((s, i) => { p.append(s); if (i < spans.length - 1) p.append(' '); });
  let actif = -1;
  const allumer = (i) => {
    if (i === actif) return;
    if (actif >= 0) spans[actif]?.classList.remove('j-mot-actif');
    actif = i;
    if (i >= 0) spans[i]?.classList.add('j-mot-actif');
  };
  /** Surligne une phrase, ou plusieurs (tableau). Rend true si au moins une a été trouvée. */
  const marquer = (phrases) => {
    for (const s of spans) s.classList.remove('j-utile');
    let trouve = false;
    for (const ph of (Array.isArray(phrases) ? phrases : [phrases]).filter(Boolean)) {
      const plage = plageDe(motsAffiches, ph);
      if (!plage) continue;
      trouve = true;
      for (let i = plage[0]; i <= plage[1]; i++) spans[i].classList.add('j-utile');
    }
    return trouve;
  };
  return {
    element: p,
    marquer,
    vider() { for (const s of spans) s.classList.remove('j-utile'); allumer(-1); },
    async jouer({ utile = null } = {}) {
      if (utile) marquer(utile);
      const r = await jouerVoix(ctx, id, {
        surTemps: (t) => {
          let i = -1;
          for (let k = 0; k < temps.length; k++) if (temps[k].debut <= t + 0.04) i = k;
          allumer(i);
        },
      });
      allumer(-1);
      return r;
    },
  };
}

/* ── Comparaison tolérante des saisies (SCHEMA §3) — celle de B3, sinon la nôtre ── */
let outilsB3 = null;
export async function chargerOutilsB3() {
  if (outilsB3) return outilsB3;
  try { outilsB3 = await import('../exercices/_commun.js'); } catch (err) { console.warn('[B4] boîte à outils de B3 indisponible, repli local', err?.message); outilsB3 = {}; }
  return outilsB3;
}

const liste = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const MOTS_PROTEGES = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'am', 'is', 'are', "i'm", "you're", "he's", "she's", "it's", "we're", "they're", 'his', 'her', 'its', 'your', 'a', 'an', 'the']);
function normLocal(s) {
  return String(s ?? '').normalize('NFC').replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase().replace(/[\s.!?…]+$/u, '').trim();
}
function distanceLocale(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}
/** Une seule faute de frappe, sur un mot de 4 lettres ou plus qui n'est ni un pronom ni une forme de be. */
function uneFaute(donne, attendu, norm, dist) {
  const a = norm(donne).split(' '), b = norm(attendu).split(' ');
  if (a.length !== b.length) return null;
  const diff = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  if (diff.length !== 1) return null;
  const mot = b[diff[0]];
  if (MOTS_PROTEGES.has(mot) || mot.replace(/[^a-z]/g, '').length < 4) return null;
  return dist(a[diff[0]], mot) === 1 ? mot : null;
}
function evaluerLocal(donne, reponse = {}, retours = {}) {
  const attendues = [...liste(reponse.attendues), ...liste(reponse.variantes)].filter((x) => typeof x === 'string');
  const n = normLocal(donne);
  if (!n) return { verdict: 'vide' };
  const premier = liste(reponse.attendues)[0] ?? attendues[0] ?? '';
  if (attendues.some((a) => normLocal(a) === n)) return { verdict: 'juste', attendu: premier, retour: retours.juste };
  for (const c of liste(retours.cibles)) if (liste(c.si).some((s) => normLocal(s) === n)) return { verdict: 'faux', attendu: premier, retour: c.retour, cible: true };
  if (reponse?.tolerance?.une_faute_de_frappe) {
    for (const a of attendues) {
      const mot = uneFaute(n, a, normLocal, distanceLocale);
      if (mot) return { verdict: 'presque', attendu: a, correction: mot, note: retours.presque };
    }
  }
  return { verdict: 'faux', attendu: premier, retour: retours.faux_par_defaut };
}

/**
 * Évalue une saisie : { verdict: 'juste' | 'presque' | 'faux' | 'vide', attendu, retour, note, correction }.
 * Règle ajoutée : une erreur ciblée par D qui n'est qu'une faute de frappe (« projet manager ») reste
 * « presque » (tolérance du script), avec l'explication ciblée de D.
 */
export function evaluer(donne, reponse = {}, retours = {}) {
  const f = outilsB3?.evaluerSaisie;
  let r = null;
  if (typeof f === 'function') { try { r = f(donne, reponse, retours, []); } catch { r = null; } }
  if (!r || !r.verdict) r = evaluerLocal(donne, reponse, retours);
  if (r.verdict === 'faux' && r.cible && reponse?.tolerance?.une_faute_de_frappe === 'presque') {
    const attendues = [...liste(reponse.attendues), ...liste(reponse.variantes)];
    for (const a of attendues) {
      const mot = uneFaute(donne, a, normLocal, distanceLocale);
      if (mot) return { verdict: 'presque', attendu: a, correction: mot, note: r.retour, cible: true };
    }
  }
  return r;
}

/* ── Retours : les encarts du socle, avec un repli aux mêmes classes ────────────── */
export function retours(ctx) {
  const s = ctx?.services?.retour;
  const secours = (genre, texte, o = {}) => {
    const n = el('div', { class: `encart encart-${genre === 'presque' ? 'note encart-presque' : genre} apparait`, role: genre === 'faux' ? 'alert' : 'status' });
    n.innerHTML = icone(ctx, genre === 'presque' ? 'presque' : genre);
    const corps = el('span', {}, genre === 'reponse' ? el('b', { texte: 'Voici la réponse. ' }) : null, el('span', { texte: texte || '' }));
    if (o.correction) corps.append(el('span', { class: 'explication', texte: `Orthographe attendue : ${o.correction}` }));
    if (o.explication) corps.append(el('span', { class: 'explication', texte: o.explication }));
    n.append(corps);
    return n;
  };
  const essayer = (nom, texte, o) => { try { const n = s?.[nom]?.(texte, o); if (n instanceof Node) return n; } catch { /* repli */ } return secours(nom, texte, o); };
  return {
    juste: (t, o = {}) => essayer('juste', t, o),
    presque: (t, o = {}) => essayer('presque', t, o),
    faux: (t, o = {}) => essayer('faux', t, o),
    reponse: (t, o = {}) => essayer('reponse', t, o),
    info: (t, o = {}) => essayer('info', t, o),
    annoncer: (t) => { try { s?.annoncer?.(t); } catch { /* rien */ } },
  };
}

export function son(ctx, nom) { try { ctx?.services?.sons?.jouer?.(nom); } catch { /* rien */ } }

/* ── Écran d'accueil d'un jeu (remplace l'en-tête du lecteur, mêmes classes) ───── */
const REGIMES = { comprendre: 'À comprendre', a_vous_de_jouer: 'À vous de jouer', evaluation: 'Évaluation' };

/**
 * accueilJeu(ctx, etape, { pastilles: [...], corps: Node, bouton: 'Commencer', surCommencer })
 * Rend { element, bouton } ; le bouton porte le focus au clavier (Entrée lance la partie).
 */
export function accueilJeu(ctx, etape, { pastilles = [], corps = null, bouton = 'Commencer', surCommencer } = {}) {
  const regime = ctx?.regime || etape?.regime || 'a_vous_de_jouer';
  const entete = el('div', { class: 'consigne-etape j-entete' });
  entete.append(el('span', { class: `regime regime-${regime}`, texte: REGIMES[regime] || REGIMES.a_vous_de_jouer }));
  entete.append(el('h1', { texte: etape?.titre || '' }));
  if (etape?.objectif_apprenant) {
    const o = el('p', { class: 'objectif' });
    o.innerHTML = icone(ctx, 'coche');
    o.append(el('span', {}, el('b', { texte: 'Objectif' }), ` ${etape.objectif_apprenant}`));
    entete.append(o);
  }
  if (etape?.consigne?.fr) {
    const c = el('p', { class: 'consigne', texte: etape.consigne.fr });
    if (etape.consigne.en) c.append(el('span', { class: 'en', lang: 'en', texte: etape.consigne.en }));
    entete.append(c);
  }
  const panneau = el('div', { class: 'carte j-lobby' });
  if (pastilles.length) panneau.append(el('div', { class: 'j-lobby-pastilles' }, ...pastilles));
  if (corps) panneau.append(corps);
  const b = el('button', { type: 'button', class: 'btn btn-primaire j-go' });
  b.innerHTML = `<span>${esc(bouton)}</span>${icone(ctx, 'suivant')}`;
  b.addEventListener('click', () => surCommencer?.());
  panneau.append(b);
  return { element: el('section', { class: 'j-accueil' }, entete, panneau), bouton: b };
}

/** Pastille d'information sobre (icône + texte), pour l'accueil et les résultats. */
export function pastille(ctx, nomIcone, texte, classe = '') {
  const p = el('span', { class: `j-pastille ${classe}` });
  p.innerHTML = icone(ctx, nomIcone);
  p.append(el('span', { texte }));
  return p;
}

/** Trois étoiles, dont `n` pleines (barème de D). */
export function etoiles(ctx, n, total = 3, { taille = '' } = {}) {
  const e = el('span', { class: `j-etoiles ${taille}`, role: 'img', 'aria-label': `${n} étoile${n > 1 ? 's' : ''} sur ${total}` });
  for (let i = 0; i < total; i++) e.append(el('span', { class: `j-etoile${i < n ? ' pleine' : ''}`, html: i < n ? NOS_ICONES.etoilePleine : NOS_ICONES.etoile }));
  return e;
}

/** « Vos erreurs, expliquées » : chaque ligne montre la phrase juste, la réponse donnée et le pourquoi. */
export function listeErreurs(erreurs, { titre = 'Vos erreurs, expliquées' } = {}) {
  const bloc = el('div', { class: 'j-erreurs' }, el('h3', { texte: titre }));
  const ul = el('ul');
  for (const e of erreurs) {
    const li = el('li');
    if (e.phrase) li.append(e.phrase);
    else if (e.element) li.append(el('span', { class: 'j-err-element', lang: 'en', texte: e.element }));
    if (e.donne || e.attendu) {
      li.append(el('span', { class: 'j-err-paire' },
        e.donne ? el('span', { class: 'j-err-donne', lang: 'en' }, el('s', { texte: e.donne })) : null,
        e.donne && e.attendu ? el('span', { class: 'j-err-fleche', 'aria-hidden': 'true', texte: '→' }) : null,
        e.attendu ? el('b', { class: 'j-err-attendu', lang: 'en', texte: e.attendu }) : null));
    }
    if (e.explication) li.append(el('span', { class: 'j-err-texte', texte: e.explication }));
    ul.append(li);
  }
  bloc.append(ul);
  return bloc;
}

/** Fait défiler juste assez pour que `n` soit visible sous l'en-tête collant et au-dessus du pied du lecteur. */
export function rendreVisible(n, { haut = false } = {}) {
  if (!n) return;
  requestAnimationFrame(() => {
    const r = n.getBoundingClientRect();
    const piedPx = 88;
    if (haut || r.top < 72 || r.bottom > window.innerHeight - piedPx) {
      n.scrollIntoView({ block: haut ? 'start' : 'nearest', behavior: mouvementReduit() ? 'auto' : 'smooth' });
    }
  });
}

/* ── Feuille de style commune aux jeux (préfixée par l'activité) ───────────────── */
export function cssJeux(p) {
  return `
${p} { --j-nuit: #0C1528; --j-nuit-2: #0C1528; --j-verre: rgba(255,255,255,0.08); --j-verre-bord: rgba(255,255,255,0.16);
  --j-clair: #DDE3EC; --j-juste-clair: #6EE7B7; --j-faux-clair: #FDA4AF; --j-scene: calc(100svh - 150px - var(--haut-sur, 0px) - var(--bas-sur, 0px)); }
${p} .j-cadre { width: 100%; max-width: var(--largeur-lecture, 760px); margin: 0 auto; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
${p} .j-entete { margin-bottom: 0; }
${p} .j-accueil { display: flex; flex-direction: column; gap: 16px; }
${p} .j-lobby { padding: 18px 16px 16px; display: flex; flex-direction: column; gap: 16px; }
@media (min-width: 768px) { ${p} .j-lobby { padding: 22px 24px 20px; } }
${p} .j-lobby-pastilles { display: flex; flex-wrap: wrap; gap: 8px; }
${p} .j-go { align-self: stretch; min-height: 52px; font-size: 1.02rem; }
@media (min-width: 640px) { ${p} .j-go { align-self: flex-start; min-width: 15rem; } }
${p} .j-pastille { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: var(--fond); border: 1px solid var(--filet); font-size: 0.8125rem; font-weight: 600; color: var(--encre-70); }
${p} .j-pastille svg { width: 16px; height: 16px; color: var(--marque); flex: none; }
${p} .j-pastille.forte { background: var(--marque-voile); border-color: var(--marque-voile-bord); color: var(--marque-tres-fonce); }
${p} .j-etoiles { display: inline-flex; gap: 2px; color: var(--marque); }
${p} .j-etoile svg { width: 22px; height: 22px; display: block; }
${p} .j-etoile:not(.pleine) { color: var(--filet-fort); }
${p} .j-etoiles.grandes .j-etoile svg { width: 34px; height: 34px; }
${p} .j-titre-fin { font-family: var(--police-titre); font-weight: 600; font-size: clamp(1.5rem, 1.2rem + 1.4vw, 2.1rem); letter-spacing: -0.01em; line-height: 1.15; }
${p} .j-surtitre { font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--marque); }
${p} .j-erreurs { display: grid; gap: 10px; }
${p} .j-erreurs h3 { font-size: 1rem; }
${p} .j-erreurs ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
${p} .j-erreurs li { display: grid; gap: 4px; padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); min-width: 0; }
${p} .j-err-element { font-weight: 600; }
${p} .j-err-paire { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 6px; font-size: 0.95rem; }
${p} .j-err-donne { color: var(--faux-fonce); }
${p} .j-err-attendu { color: var(--juste-fonce); }
${p} .j-err-fleche { color: var(--encre-50); }
${p} .j-err-texte { color: var(--encre-70); font-size: 0.925rem; }
${p} .j-phrase-juste { font-weight: 600; }
${p} .j-phrase-juste b { color: var(--juste-fonce); }
${p} .j-transcrit { font-size: 1.05rem; line-height: 1.7; margin: 0; }
${p} .j-mot { border-radius: 4px; padding: 1px 1px; transition: background-color 0.15s, color 0.15s; }
${p} .j-mot.j-utile { background: var(--marque-voile); color: var(--marque-tres-fonce); box-shadow: 0 0 0 2px var(--marque-voile); font-weight: 600; }
${p} .j-mot.j-mot-actif { background: var(--marque); color: #fff; box-shadow: 0 0 0 2px var(--marque); }
${p} .j-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
@media (max-width: 559px) { ${p} .j-actions > .btn { flex: 1 1 100%; } }
${p} .btn .j-kbd { display: none; }
@media (pointer: fine) { ${p} .btn .j-kbd { display: inline-grid; } }
${p} .j-kbd { place-items: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; border: 1px solid currentColor; opacity: 0.55; }
@media (prefers-reduced-motion: reduce) { ${p} * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
`;
}
