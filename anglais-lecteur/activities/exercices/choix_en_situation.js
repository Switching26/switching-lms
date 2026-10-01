// activities/exercices/choix_en_situation.js — EX-07 « La bonne phrase au bon moment » (type choix_en_situation).
//
// Une situation illustrée (photo de la bible), trois réponses. Un toucher suffit : une réponse fausse est
// barrée avec l'explication de SON erreur ; la bonne se fait entendre (jamais une phrase fausse) et se
// réécoute d'un toucher. « Montrez-moi » fait réentendre la réplique de la vidéo qui contient la bonne phrase.
import { lancerExercice } from './_commun.js';
import { el, liste, melangerVraiment, urlImage, jouerVoix, voixDisponible, icone, normaliser, idSegment } from './_commun.js';

export const meta = { titre: 'La bonne phrase au bon moment', entete: true };
const P = '.act-exercices-choix_en_situation';
const NOMS = { claire: 'Claire', daniel: 'Daniel', helen: 'Helen', rob: 'Rob' };

export async function monter(racine, ctx) {
  // Les répliques de la vidéo servent à la démonstration (« Montrez-moi »).
  let repliques = [];
  try {
    const v = await ctx.script('video.json');
    repliques = liste(v?.etapes).flatMap((e) => liste(e.repliques));
  } catch { repliques = []; }
  return lancerExercice(racine, ctx, {
    type: 'choix_en_situation',
    prefixe: P,
    css,
    validationImmediate: true,
    preparer: (etape, { rng }) => liste(etape.items).filter((i) => i && liste(i.options).length > 1).map((i) => ({
      ...i,
      ordre: melangerVraiment(liste(i.options), rng),
      replique: trouverReplique(repliques, i.bonne),
    })),
    rendre,
  });
}

/** La réplique de la vidéo qui contient la bonne phrase (sans la ponctuation finale), s'il y en a une. */
function trouverReplique(repliques, bonne) {
  const cle = normaliser(bonne, { casse: true, ponctuation_finale: true, apostrophes: true, ponctuation: true });
  if (!cle) return null;
  return repliques.find((r) => normaliser(r.en || r.segment?.texte || '', { casse: true, apostrophes: true, ponctuation: true }).includes(cle)) || null;
}

function rendre(zone, item, api) {
  const { ctx } = api;
  let attente = null;
  let fini = false;
  const img = urlImage(ctx, item.image);
  if (img) zone.append(el('figure', { class: 'b3-ces-scene' }, el('img', { src: img, alt: '', decoding: 'async', class: /^P0/.test(item.image) ? 'b3-ces-portrait' : '' })));
  zone.append(el('p', { class: 'b3-ces-situation', texte: item.situation || '' }));
  const groupe = el('div', { class: 'b3-ces-options', role: 'group', 'aria-label': 'Que dites-vous ?' });
  const boutons = new Map();
  for (const o of item.ordre) {
    const b = el('button', { type: 'button', class: 'b3-ces-option', lang: 'en' }, el('span', { class: 'b3-ces-texte', texte: o }), el('span', { class: 'b3-ces-marque', 'aria-hidden': 'true' }));
    b.addEventListener('click', () => {
      if (fini) { if (o === item.bonne) jouerVoix(ctx, item.audio_bonne); return; }
      if (b.disabled) return;
      attente = o;
      api.valider();
    });
    boutons.set(o, b);
    groupe.append(b);
  }
  zone.append(groupe);
  const demo = el('div', { class: 'b3-ces-demo', 'aria-live': 'polite' });
  zone.append(demo);

  const marquerBonne = () => {
    const b = boutons.get(item.bonne);
    b.classList.add('b3-ces-ok');
    b.querySelector('.b3-ces-marque').innerHTML = icone(ctx, 'coche');
    if (voixDisponible(ctx, item.audio_bonne)) {
      b.setAttribute('data-voix', '');
      b.setAttribute('aria-label', `${item.bonne} — réécouter`);
      b.querySelector('.b3-ces-marque').innerHTML = icone(ctx, 'ecouter');
    }
  };

  // Si la voix produite dit une variante de la phrase affichée (ex. « We're new here. » pour « We're new. »,
  // allongée pour passer le contrôle), on l'écrit : l'apprenant voit exactement ce qu'il entend.
  function ecartAudio() {
    let t = '';
    try { t = ctx.services?.voix?.info?.(idSegment(item.audio_bonne))?.texte || ''; } catch { t = ''; }
    const tol = { casse: true, ponctuation_finale: true, apostrophes: true };
    return t && normaliser(t, tol) !== normaliser(item.bonne, tol) ? `Vous entendez : « ${t} »` : '';
  }

  return {
    nbChoix: item.ordre.length,
    validationImmediate: true,
    complet: () => !!attente,
    verifier() {
      const o = attente;
      attente = null;
      if (!o) return { verdict: 'vide' };
      if (o === item.bonne) {
        return { verdict: 'juste', cle: o, donne: o, attendu: item.bonne, element: item.situation, retour: 'C\'est la phrase qui convient.', audio: item.audio_bonne, complement: ecartAudio() };
      }
      const b = boutons.get(o);
      b.classList.add('b3-ces-ko');
      b.disabled = true;
      b.querySelector('.b3-ces-marque').innerHTML = icone(ctx, 'faux');
      const d = liste(item.distracteurs).find((x) => x.texte === o);
      return { verdict: 'faux', cle: o, donne: o, attendu: item.bonne, element: item.situation, retour: d?.retour || '', titre: `« ${o} » ne convient pas ici.` };
    },
    montrer: item.replique ? async () => {
      const r = item.replique;
      const qui = NOMS[r.personnage] || 'Un personnage';
      const texte = r.en || r.segment?.texte || '';
      const i = texte.toLowerCase().indexOf(item.bonne.replace(/[.!?]$/, '').toLowerCase());
      const citation = el('q', { lang: 'en' });
      if (i >= 0) {
        const n = item.bonne.replace(/[.!?]$/, '').length;
        citation.append(texte.slice(0, i), el('mark', { class: 'b3-surligne', texte: texte.slice(i, i + n) }), texte.slice(i + n));
      } else citation.append(texte);
      demo.replaceChildren(el('div', { class: 'b3-ces-citation' },
        el('span', { class: 'b3-ces-qui', html: `${icone(ctx, 'ecouter')}<span>Dans la vidéo, ${qui} dit :</span>` }), citation));
      await jouerVoix(ctx, r.segment?.id || r.segment);
    } : undefined,
    solution() {
      marquerBonne();
      for (const [o, b] of boutons) if (o !== item.bonne) { b.disabled = true; b.classList.add('b3-ces-eteint'); }
      return { texte: item.bonne, explication: ecartAudio(), audio: item.audio_bonne };
    },
    bloquer() {
      fini = true;
      marquerBonne();
      for (const [o, b] of boutons) if (o !== item.bonne) { b.disabled = true; if (!b.classList.contains('b3-ces-ko')) b.classList.add('b3-ces-eteint'); }
      if (!voixDisponible(ctx, item.audio_bonne)) boutons.get(item.bonne).disabled = true;
    },
    focus() { [...boutons.values()].find((b) => !b.disabled)?.focus({ preventScroll: true }); },
  };
}

function css(p) {
  return `
${p} .b3-ces-scene { margin: 0 0 12px; border-radius: var(--rayon-bloc); overflow: hidden; background: var(--filet); aspect-ratio: 16 / 8; }
${p} .b3-ces-scene img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 45%; display: block; }
${p} .b3-ces-scene img.b3-ces-portrait { object-position: 50% 22%; }
@media (min-width: 768px) { ${p} .b3-ces-scene { aspect-ratio: 16 / 6.5; } }
${p} .b3-ces-situation { font-size: 1.08rem; font-weight: 600; line-height: 1.45; color: var(--encre); }
${p} .b3-ces-options { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
${p} .b3-ces-option { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 54px; padding: 10px 16px; border-radius: 14px; border: 1px solid var(--filet-fort); background: var(--surface); font: inherit; font-size: 1.08rem; font-weight: 600; color: var(--encre); text-align: left; cursor: pointer; touch-action: manipulation; box-shadow: 0 1px 0 rgba(12,21,40,0.05); transition: border-color .15s, background-color .15s, color .15s, transform .18s var(--ressort); }
@media (hover: hover) { ${p} .b3-ces-option:hover:not(:disabled) { border-color: var(--marque-voile-bord); } }
${p} .b3-ces-option:active:not(:disabled) { transform: scale(0.99); }
${p} .b3-ces-marque { width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
${p} .b3-ces-marque svg { width: 20px; height: 20px; }
${p} .b3-ces-ok { border-color: var(--juste-bord); background: var(--juste-voile); color: var(--juste-fonce); }
${p} .b3-ces-ko { border-color: var(--faux-bord); background: var(--faux-voile); color: var(--faux-fonce); cursor: default; }
${p} .b3-ces-ko .b3-ces-texte { text-decoration: line-through; text-decoration-thickness: 1.5px; }
${p} .b3-ces-eteint { opacity: 0.45; cursor: default; }
${p} .b3-ces-demo:empty { display: none; }
${p} .b3-ces-demo { margin-top: 12px; }
${p} .b3-ces-citation { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--c-ecouter-voile); border: 1px solid #D6DEF2; }
${p} .b3-ces-qui { display: flex; align-items: center; gap: 6px; font-size: 0.875rem; font-weight: 600; color: var(--c-ecouter); }
${p} .b3-ces-qui svg { width: 18px; height: 18px; }
${p} .b3-ces-citation q { font-size: 1.02rem; color: var(--encre); quotes: '“' '”'; }
`;
}
