// Outils partagés par les activités de B1 (vidéo, écoute, dialogue).
// Le nom commence par « _ » : le serveur ne le prend pas pour une activité.

/** Les quatre personnages de la bible : prénom affiché, portrait, couleur fixe (≥ 4,5:1 sur blanc). */
export const PERSONNAGES = {
  claire: { nom: 'Claire', portrait: 'P01', couleur: '#334E86', clair: '#AFC4EE' },
  daniel: { nom: 'Daniel', portrait: 'P02', couleur: '#7A5520', clair: '#E9C98F' },
  helen: { nom: 'Helen', portrait: 'P03', couleur: '#733F6B', clair: '#E3B6DA' },
  rob: { nom: 'Rob', portrait: 'P04', couleur: '#4B5563', clair: '#CBD2DC' },
};

/** Vignette recadrée sur le visage d'un personnage (fichiers dérivés des portraits de V, dossier de B1). */
export function visage(ctx, id) {
  const p = PERSONNAGES[id];
  if (!p?.portrait) return null;
  const chemin = `activities/dialogue/images/visage-${p.portrait}.jpg`;
  try { return ctx?.asset ? ctx.asset(chemin) : `/${chemin}`; } catch { return `/${chemin}`; }
}

export function personnage(id) {
  return PERSONNAGES[id] || { nom: id ? id.charAt(0).toUpperCase() + id.slice(1) : '', portrait: null, couleur: '#374151', clair: '#E5E7EB' };
}

/** Icônes au trait (20 px), sans emoji. */
export const ICONES = {
  lecture: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
  rejouer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/></svg>',
  ecouter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.2 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  lent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9.5 2.5h5"/></svg>',
  sousTitres: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 11h4M13 11h4M7 15h6M15 15h2"/></svg>',
  micro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/></svg>',
  carnet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15l-3-2-3 2-3-2-3 2V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M9 8.5h6M9 12h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  coche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  croix: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  repeter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h3l2-5 3 10 2.5-7 1.5 2H20"/></svg>',
  suite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
};

/**
 * Typographie française (recette Q n° 3 et 9) : espace fine insécable avant ? ! : ; et à l'intérieur des
 * guillemets, pour qu'aucun signe ne tombe seul en début ou fin de ligne ; « Wren & Holt » ne se coupe jamais.
 * Sans effet sur l'anglais (pas d'espace avant la ponctuation, pas de guillemets français).
 */
export function typo(s) {
  return String(s ?? '')
    .replace(/Wren & Holt/g, 'Wren\u00A0&\u00A0Holt')
    .replace(/«[ \u00A0]*/g, '«\u202F')
    .replace(/[ \u00A0]*»/g, '\u202F»')
    .replace(/[ \u00A0]+([?!:;])/g, '\u202F$1');
}

export function echapper(s) {
  return typo(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Le service `retour` du socle, avec la typographie appliquée aux textes qu'on lui passe. */
export function retourTypo(retour) {
  if (!retour) return null;
  const o = (opts) => (opts && typeof opts === 'object' ? { ...opts, explication: opts.explication != null ? typo(opts.explication) : opts.explication } : opts);
  const env = {};
  for (const k of ['juste', 'presque', 'faux', 'reponse', 'info']) if (typeof retour[k] === 'function') env[k] = (t, opts) => retour[k](typo(t), o(opts));
  env.annoncer = (t) => retour.annoncer?.(typo(t));
  return env;
}

/** Découpe un texte affiché en mots, ponctuation collée (« morning, » « here… »). */
export function decouperMots(texte) {
  return String(texte || '').replace(/…(?=\S)/g, '… ').split(/\s+/).filter(Boolean);
}

/** Forme de comparaison d'un mot : minuscules, apostrophes unifiées, sans ponctuation. */
export function normaliserMot(m) {
  return String(m || '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/&/g, 'and').replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
}

/**
 * Repère des expressions (« Nice to meet you », « busy ») dans une liste de mots.
 * Rend [{ debut, fin, expression }] (indices inclus), la plus longue d'abord, sans chevauchement.
 */
export function repererExpressions(mots, expressions) {
  const n = mots.map(normaliserMot);
  const exps = [...new Set(expressions || [])]
    .map((e) => ({ e, t: decouperMots(e).map(normaliserMot).filter(Boolean) }))
    .filter((x) => x.t.length)
    .sort((a, b) => b.t.length - a.t.length);
  const pris = new Array(mots.length).fill(false);
  const res = [];
  for (const { e, t } of exps) {
    for (let i = 0; i + t.length <= n.length; i++) {
      if (t.every((x, k) => n[i + k] === x) && !t.some((_, k) => pris[i + k])) {
        for (let k = 0; k < t.length; k++) pris[i + k] = true;
        res.push({ debut: i, fin: i + t.length - 1, expression: e });
        break;
      }
    }
  }
  return res.sort((a, b) => a.debut - b.debut);
}

/** Formes de be (am, is, are et formes courtes) : surlignées dans les transcriptions. */
const FORMES_BE = new Set(['am', 'is', 'are', "i'm", "you're", "he's", "she's", "it's", "we're", "they're"]);
export function estFormeDeBe(mot) { return FORMES_BE.has(normaliserMot(mot)); }

/** Distance d'édition (fautes de frappe). */
export function distance(a, b) {
  const m = a.length; const n = b.length;
  if (!m) return n; if (!n) return m;
  let prec = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cour = [i];
    for (let j = 1; j <= n; j++) {
      cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prec = cour;
  }
  return prec[n];
}

// Mots où une seule lettre change le sens : jamais « presque » (SCHEMA §3).
const PROTEGES = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'am', 'is', 'are', 'his', 'her', 'hers', 'its', 'i\'m', 'you\'re', 'he\'s', 'she\'s', 'it\'s', 'we\'re', 'they\'re', 'a', 'an', 'the', 'this', 'these', 'those', 'that']);

function formeComparable(texte, tolerance = {}) {
  let t = String(texte || '').trim();
  t = t.replace(/[’‘`´]/g, "'");
  if (tolerance.ponctuation_finale !== false) t = t.replace(/[\s.!?…]+$/g, '');
  t = t.replace(/\s+/g, ' ');
  if (tolerance.casse !== false) t = t.toLowerCase();
  return t;
}

function motsComparables(texte, tolerance) {
  // Les virgules et points internes ne changent pas la réponse d'un débutant : ils sont ignorés
  // à la comparaison (la réponse modèle, avec sa ponctuation, est toujours affichée).
  return formeComparable(texte, tolerance).replace(/[,;:.!?"«»()]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Compare une saisie à une `reponse` de D : { attendues, variantes, tolerance }.
 * Rend { verdict: 'juste' | 'presque' | 'faux', modele, correction? , ecart? }.
 */
export function comparerReponse(saisie, reponse) {
  const tol = reponse?.tolerance || { casse: true, ponctuation_finale: true, apostrophes: true, une_faute_de_frappe: 'presque' };
  const acceptees = [...(reponse?.attendues || []), ...(reponse?.variantes || [])].filter(Boolean);
  const modele = reponse?.attendues?.[0] || acceptees[0] || '';
  const s = motsComparables(saisie, tol);
  if (!s.length) return { verdict: 'vide', modele };
  let meilleure = null;
  for (const a of acceptees) {
    const m = motsComparables(a, tol);
    if (m.length === s.length && m.every((x, i) => x === s[i])) return { verdict: 'juste', modele, acceptee: a };
    if (tol.une_faute_de_frappe && m.length === s.length) {
      const diff = m.map((x, i) => (x === s[i] ? null : { i, attendu: x, donne: s[i] })).filter(Boolean);
      if (diff.length === 1) {
        const d = diff[0];
        const ok = d.attendu.length >= 4 && !PROTEGES.has(d.attendu) && !PROTEGES.has(d.donne) && distance(d.attendu, d.donne) === 1;
        if (ok && !meilleure) meilleure = { verdict: 'presque', modele, acceptee: a, correction: d.attendu, ecart: d };
      }
    }
  }
  return meilleure || { verdict: 'faux', modele };
}

/** Un segment de D → fichier audio du manifeste, ou null (le texte s'affiche, rien ne bloque). */
export function infoVoix(ctx, idOuSegment) {
  const id = typeof idOuSegment === 'string' ? idOuSegment : (idOuSegment?.ref || idOuSegment?.id);
  if (!id) return null;
  try { return ctx.services?.voix?.info(id) || null; } catch { return null; }
}

/** Joue un segment sur le canal média ; rend 'fin' | 'arret' | 'bloque' | 'erreur' | 'absent'. */
export async function jouerSegment(ctx, idOuSegment, { vitesse = 1 } = {}) {
  const info = infoVoix(ctx, idOuSegment);
  if (!info?.url) return 'absent';
  try { return await ctx.services.audio.jouer(info.url, { vitesse, canal: 'media' }); } catch { return 'erreur'; }
}

/** Petite aide : crée un élément depuis du HTML. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Mélange stable (graine) pour l'ordre des options : même ordre à chaque visite. */
export function melanger(liste, graine = 7) {
  const a = liste.slice();
  let s = graine;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
