// activities/exercices/phrase_a_reconstruire.js — EX-05 « Reconstruire la phrase » (type phrase_a_reconstruire).
//
// Une phrase française, des étiquettes anglaises mélangées (parfois une de trop). Chaque toucher place
// le mot à la suite ; toucher un mot placé le renvoie. On peut aussi glisser un mot à l'endroit voulu
// (souris : tout de suite ; doigt : appui long). La majuscule et le point sont ajoutés automatiquement.
// Les étiquettes s'affichent sans leur majuscule d'origine : sinon le premier mot se devinerait.
import { lancerExercice } from './_commun.js';
import {
  el, liste, melangerVraiment, evaluerSaisie, rendreGlissable, depotSous, attendre, mouvementReduit, pointeurFin, icone, esc, sansOui,
} from './_commun.js';

export const meta = { titre: 'Reconstruire la phrase', entete: true };
const P = '.act-exercices-phrase_a_reconstruire';
const NOMS_PROPRES = /^(I|I'm|I'll|I've|Claire|Daniel|Helen|Rob|Bristol|Lyon|Wren|Holt|French|English|British|Scottish|Monday)$/;

/** « She's » → « she's », sauf I et les noms propres. */
const sansMajuscule = (m) => (NOMS_PROPRES.test(m) ? m : m.charAt(0).toLowerCase() + m.slice(1));
const avecMajuscule = (m) => m.charAt(0).toUpperCase() + m.slice(1);

export async function monter(racine, ctx) {
  return lancerExercice(racine, ctx, {
    type: 'phrase_a_reconstruire',
    prefixe: P,
    css,
    preparer: (etape, { rng }) => liste(etape.items).filter((i) => i && liste(i.etiquettes).length).map((i) => ({
      ...i,
      melange: melangerVraiment(liste(i.etiquettes).map((m, k) => ({ k, mot: String(m) })), rng, (a, b) => a.k === b.k),
    })),
    rendre,
  });
}

function rendre(zone, item, api) {
  const { ctx, signal } = api;
  const afficherMot = ctx.unite === 'U01' ? sansMajuscule : m => m;
  const attendue = liste(item.reponse?.attendues)[0] || '';
  const ponctuation = (attendue.match(/[.!?]$/) || ['.'])[0];
  const place = [];          // indices des étiquettes, dans l'ordre de la phrase
  let bloque = false;

  const fr = el('div', { class: 'b3-prs-fr' }, el('span', { class: 'b3-prs-lib', texte: 'En français' }), el('p', { lang: 'fr', texte: item.traduction || '' }));
  const ligne = el('div', { class: 'b3-prs-ligne', 'data-ligne': '', 'aria-label': 'Votre phrase', role: 'group' });
  const vide = el('span', { class: 'b3-prs-vide', texte: pointeurFin() ? 'Cliquez les mots dans l\'ordre' : 'Touchez les mots dans l\'ordre' });
  const point = el('span', { class: 'b3-prs-point', 'aria-hidden': 'true', texte: ponctuation });
  const banque = el('div', { class: 'b3-prs-banque', role: 'group', 'aria-label': 'Mots à placer' });
  const legende = el('div', { class: 'b3-prs-legende', 'aria-live': 'polite' });
  zone.append(fr, ligne, legende, banque);

  const jetons = item.melange.map(({ k, mot }) => {
    const b = el('button', { type: 'button', class: 'b3-jeton b3-prs-jeton', lang: 'en', 'data-k': String(k) }, afficherMot(mot));
    const place_ = el('span', { class: 'b3-prs-place', 'aria-hidden': 'true' });
    b.addEventListener('click', () => basculer(k));
    rendreGlissable(b, {
      hote: zone, signal,
      actif: () => !bloque,
      cibleSous: (x, y) => depotSous(x, y, 'data-ligne', zone) || depotSous(x, y, 'data-banque', zone),
      deposer: (c, x) => { if (c.hasAttribute('data-ligne')) inserer(k, positionDans(x)); else retirer(k); },
    });
    banque.append(place_);
    place_.append(b);
    return { k, mot, b, place_ };
  });
  banque.setAttribute('data-banque', '');

  function jeton(k) { return jetons.find((j) => j.k === k); }
  function positionDans(x) {
    const chips = [...ligne.querySelectorAll('.b3-prs-jeton')];
    for (let i = 0; i < chips.length; i++) { const r = chips[i].getBoundingClientRect(); if (x < r.left + r.width / 2) return i; }
    return chips.length;
  }
  function basculer(k) { if (bloque) return; if (place.includes(k)) retirer(k); else inserer(k, place.length); }
  function inserer(k, pos) {
    const i = place.indexOf(k);
    if (i >= 0) { place.splice(i, 1); if (i < pos) pos -= 1; }
    place.splice(pos, 0, k);
    dessiner();
  }
  function retirer(k) { const i = place.indexOf(k); if (i >= 0) place.splice(i, 1); dessiner(); }
  function dessiner() {
    api.effacerRetour?.();
    ligne.querySelectorAll('.b3-ko').forEach((n) => n.classList.remove('b3-ko'));
    // Les mots placés vont sur la ligne ; leur place dans la banque reste marquée (rien ne saute).
    for (const j of jetons) if (!place.includes(j.k) && j.b.parentElement !== j.place_) j.place_.append(j.b);
    place.forEach((k, i) => {
      const j = jeton(k);
      j.b.textContent = i === 0 ? avecMajuscule(afficherMot(j.mot)) : afficherMot(j.mot);
      ligne.append(j.b);
    });
    for (const j of jetons) if (!place.includes(j.k)) j.b.textContent = afficherMot(j.mot);
    vide.remove(); point.remove();
    if (!place.length) ligne.append(vide); else ligne.append(point);
    api.changement();
  }
  dessiner();
  // Chaque emplacement de la banque garde la largeur de son mot : quand il part, rien ne saute.
  requestAnimationFrame(() => { for (const j of jetons) if (j.b.offsetWidth) j.place_.style.minWidth = `${j.b.offsetWidth}px`; });

  const phrase = () => place.map((k, i) => (i === 0 ? avecMajuscule(afficherMot(jeton(k).mot)) : afficherMot(jeton(k).mot))).join(' ') + ponctuation;
  const motsAttendus = attendue.replace(/[.!?]$/, '').split(' ');

  return {
    complet: () => place.length > 0,
    messageIncomplet: 'Touchez d\'abord les mots, dans l\'ordre.',
    verifier() {
      const donne = phrase();
      const r = evaluerSaisie(donne, item.reponse, item.retours);
      if (r.verdict === 'faux') {
        // Le premier mot mal placé est montré en rouge : on sait où regarder.
        const chips = [...ligne.querySelectorAll('.b3-prs-jeton')];
        const i = chips.findIndex((c, n) => c.textContent.toLowerCase() !== (motsAttendus[n] || '').toLowerCase());
        if (i >= 0) chips[i].classList.add('b3-ko');
      }
      return { ...r, donne, element: item.traduction || '', retour: r.retour || (r.verdict === 'juste' ? item.retours?.juste : item.retours?.faux_par_defaut) };
    },
    indice2: () => (motsAttendus[0] ? `La phrase commence par « ${motsAttendus[0]} ».` : null),
    async montrer(sig) {
      // Démonstration : le sujet, puis l'article, puis le nom… un mot après l'autre, chacun expliqué.
      place.splice(0, place.length); dessiner();
      bloque = true;
      const libres = [...jetons];
      const etapes = [];
      for (const mot of motsAttendus) {
        const j = libres.find((x) => x.mot.toLowerCase() === mot.toLowerCase());
        if (!j) break;
        libres.splice(libres.indexOf(j), 1);
        await attendre(mouvementReduit() ? 60 : 520, sig);
        if (sig.aborted) return;
        place.push(j.k); dessiner();
        j.b.classList.remove('b3-pouls'); void j.b.offsetWidth; j.b.classList.add('b3-pouls');
        const role = ctx.unite === 'U01' ? roleDe(mot, etapes.length, motsAttendus) : 'le mot suivant dans la phrase';
        if (role) { etapes.push(`${mot} : ${role}`); legende.replaceChildren(el('p', { class: 'b3-prs-role' }, ...etapes.map((e, n) => el('span', { texte: n ? ` → ${e}` : e })))); }
      }
      bloque = false;
      api.changement();
    },
    solution() {
      place.splice(0, place.length);
      const libres = [...jetons];
      for (const mot of motsAttendus) { const j = libres.find((x) => x.mot.toLowerCase() === mot.toLowerCase()); if (j) { libres.splice(libres.indexOf(j), 1); place.push(j.k); } }
      dessiner();
      return { texte: attendue, explication: sansOui(item.retours?.juste) };
    },
    bloquer() {
      bloque = true;
      for (const j of jetons) { j.b.disabled = true; if (place.includes(j.k)) j.b.classList.add('b3-ok'); }
    },
    focus() { (jetons.find((j) => !place.includes(j.k))?.b || ligne.querySelector('button'))?.focus({ preventScroll: true }); },
  };
}

/** Le rôle d'un mot dans les phrases de la leçon (démonstration). */
function roleDe(mot, rang, tous) {
  const m = mot.toLowerCase();
  if (rang === 0 && /'(m|s|re)$|^(i|he|she|it|we|you|they)$/.test(m)) return 'le sujet et le verbe';
  if (m === 'a' || m === 'an' || m === 'the') return 'l\'article';
  if (m === 'too') return 'aussi, en fin de phrase';
  if (m === 'to' && tous.map((x) => x.toLowerCase()).join(' ').includes('nice to meet')) return 'la formule nice to meet';
  if (['good', 'new', 'happy', 'busy'].includes(m)) return 'l\'adjectif, avant le nom';
  if (rang === tous.length - 1) return 'le nom, en dernier';
  if (['project', 'event', 'meeting', 'coffee'].includes(m)) return 'le mot qui précise, avant le nom';
  return null;
}

function css(p) {
  return `
${p} .b3-prs-fr { display: flex; flex-direction: column; gap: 2px; }
${p} .b3-prs-lib { font-size: 0.75rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-50); }
${p} .b3-prs-fr p { font-size: 1.15rem; font-weight: 600; color: var(--encre); }
${p} .b3-prs-ligne { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 64px; margin-top: 14px; padding: 10px 4px 12px; border-bottom: 2px solid var(--filet-fort); transition: border-color .15s; }
${p} .b3-prs-ligne.b3-cible-survol { outline: none; border-bottom-color: var(--marque); }
${p} .b3-prs-vide { color: var(--encre-30); font-size: 0.95rem; }
${p} .b3-prs-point { font-size: 1.4rem; font-weight: 700; color: var(--encre-70); margin-left: -4px; }
${p} .b3-prs-legende:empty { display: none; }
${p} .b3-prs-legende { margin-top: 10px; }
${p} .b3-prs-role { font-size: 0.9rem; color: var(--marque-tres-fonce); background: var(--marque-voile); border-radius: var(--rayon-bloc); padding: 8px 12px; }
${p} .b3-prs-banque { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 18px; }
${p} .b3-prs-place { display: inline-flex; min-height: 44px; border-radius: 12px; background: var(--fond); box-shadow: inset 0 0 0 1px var(--filet); }
${p} .b3-prs-place:has(.b3-prs-jeton) { background: none; box-shadow: none; }
${p} .b3-prs-jeton { min-width: 3em; }
@media (min-width: 768px) { ${p} .b3-prs-fr p { font-size: 1.25rem; } }
`;
}
export { icone, esc };
