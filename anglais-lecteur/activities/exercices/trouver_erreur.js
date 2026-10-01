// activities/exercices/trouver_erreur.js — EX-06 « Trouver l'erreur » (exercices.json, type trouver_erreur).
//
// Chaque phrase est découpée en mots touchables. On touche le mot faux ; un champ apparaît pour écrire
// la correction. Le bouton « Aucune erreur » est toujours proposé (une phrase est juste).
// « Montrez-moi » passe la phrase aux quatre contrôles du script : majuscule de I, pronom, forme de be,
// article devant le métier — et s'arrête sur celui qui échoue.
import { lancerExercice } from './_commun.js';
import { el, liste, evaluerSaisie, attendre, mouvementReduit, sansOui, icone } from './_commun.js';

export const meta = { titre: 'Trouver l\'erreur', entete: true };
const P = '.act-exercices-trouver_erreur';

const CONTROLES = [
  { libelle: 'La majuscule de I', teste: (m) => /^i('m)?$/.test(m) },
  { libelle: 'Le pronom', teste: (m) => /^(he|she|it|we|they|you)('s|'re)?$/i.test(m) },
  { libelle: 'La forme de be', teste: (m) => /^(am|is|are|his|be)$/i.test(m) },
  { libelle: 'L\'article devant le métier', teste: (m) => /^(a|an|the)$/i.test(m) },
];

export async function monter(racine, ctx) {
  return lancerExercice(racine, ctx, {
    type: 'trouver_erreur',
    prefixe: P,
    css,
    preparer: (etape) => liste(etape.items).filter((i) => i && i.phrase),
    rendre,
  });
}

function rendre(zone, item, api) {
  const { signal } = api;
  const R = api.R;
  const morceaux = [...String(item.phrase).matchAll(/([A-Za-z'’]+)|([^A-Za-z'’]+)/g)].map((m) => ({ mot: m[1] || null, texte: m[0] }));
  const indexFaux = item.mot_faux ? morceaux.findIndex((m) => m.mot === item.mot_faux) : -1;
  let phase = 'mot';                  // 'mot' → 'correction'
  let attente = null;                 // ce que la prochaine vérification doit juger
  let mauvaisMotVu = false;
  let bloque = false;

  const phraseEl = el('p', { class: 'b3-tre-phrase', lang: 'en' });
  const boutons = [];
  morceaux.forEach((m, i) => {
    if (!m.mot) { phraseEl.append(/^\S/.test(m.texte) ? el('span', { class: 'b3-tre-ponct', texte: m.texte }) : m.texte); return; }
    const b = el('button', { type: 'button', class: 'b3-tre-mot', 'data-i': String(i) }, m.mot);
    b.addEventListener('click', () => toucherMot(i));
    boutons[i] = b;
    phraseEl.append(b);
  });
  const correction = el('div', { class: 'b3-tre-correction', hidden: true });
  const libelle = el('label', { class: 'b3-tre-lib', for: `b3-tre-${item.id}` });
  const champ = el('input', { id: `b3-tre-${item.id}`, class: 'b3-tre-champ', type: 'text', lang: 'en', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', maxlength: '24' });
  correction.append(libelle, champ);
  const aucune = el('button', { type: 'button', class: 'btn btn-secondaire b3-tre-aucune', html: `${icone(api.ctx, 'coche')}<span>Aucune erreur</span>` });
  const controles = el('ol', { class: 'b3-tre-controles', hidden: true, 'aria-live': 'polite' });
  zone.append(el('div', { class: 'b3-tre-carte' }, el('span', { class: 'b3-tre-lib-carte', texte: 'Note du stagiaire' }), phraseEl), controles, correction, aucune);
  champ.addEventListener('input', () => api.changement());

  function toucherMot(i) {
    if (bloque || phase !== 'mot') return;
    if (i === indexFaux) {
      phase = 'correction';
      boutons[i].classList.add('b3-tre-trouve');
      boutons[i].setAttribute('aria-pressed', 'true');
      libelle.textContent = `Bien vu : « ${item.mot_faux} » est faux. Écrivez la correction :`;
      correction.hidden = false;
      aucune.hidden = true;
      api.effacerRetour?.();
      api.changement();
      requestAnimationFrame(() => champ.focus());
      return;
    }
    attente = { type: 'mot', i };
    api.valider();
  }
  aucune.addEventListener('click', () => { if (bloque || phase !== 'mot') return; attente = { type: 'aucune' }; api.valider(); });

  const corrigee = () => {
    const rep = liste(item.correction?.attendues)[0] || '';
    return morceaux.map((m, i) => (i === indexFaux ? rep : m.texte)).join('');
  };

  return {
    verifierVisible: () => phase === 'correction',
    complet: () => phase === 'correction' ? champ.value.trim().length > 0 : !!attente,
    messageIncomplet: 'Écrivez d\'abord la correction.',
    verifier() {
      const a = attente;
      attente = null;
      if (phase === 'mot' && a?.type === 'mot') {
        mauvaisMotVu = true;
        const b = boutons[a.i];
        b.classList.remove('b3-secoue'); void b.offsetWidth; b.classList.add('b3-secoue', 'b3-tre-non');
        setTimeout(() => b.classList.remove('b3-tre-non'), 900);
        const retour = item.mot_faux ? item.retours?.mauvais_mot : item.retours?.mauvais_mot;
        return { verdict: 'faux', cle: `mot:${a.i}`, donne: morceaux[a.i].mot, attendu: item.mot_faux || 'aucune erreur', element: item.phrase, retour, titre: `« ${morceaux[a.i].mot} » est correct.` };
      }
      if (phase === 'mot' && a?.type === 'aucune') {
        if (indexFaux < 0) return { verdict: 'juste', cle: 'aucune', donne: 'aucune erreur', attendu: 'aucune erreur', element: item.phrase, retour: item.retours?.juste };
        mauvaisMotVu = true;
        return { verdict: 'faux', cle: 'aucune', donne: 'aucune erreur', attendu: item.mot_faux, element: item.phrase, titre: 'Il y a bien une erreur dans cette phrase.', retour: item.retours?.mauvais_mot };
      }
      if (phase === 'correction') {
        const donne = champ.value.trim();
        const r = evaluerSaisie(donne, item.correction, { juste: item.retours?.juste, faux_par_defaut: item.retours?.correction_fausse });
        if (r.verdict === 'faux') { champ.select(); return { ...r, cle: `corr:${donne}`, donne, element: item.phrase, retour: r.retour || item.retours?.correction_fausse }; }
        return { ...r, cle: `corr:${donne}`, donne, element: item.phrase, retour: item.retours?.juste };
      }
      return { verdict: 'vide' };
    },
    indice2() {
      if (indexFaux < 0) return String(item.retours?.mauvais_mot || '').replace(/^Ce mot est correct\.\s*/i, '') || null;
      return mauvaisMotVu ? `Regardez le mot « ${item.mot_faux} ».` : (item.retours?.mauvais_mot || null);
    },
    async montrer(sig) {
      if (api.ctx.unite && api.ctx.unite !== 'U01') {
        controles.hidden=false; controles.replaceChildren(el('li', { texte: item.retours?.mauvais_mot || (indexFaux < 0 ? 'Cette phrase est correcte.' : 'Repérez le mot surligné, puis corrigez-le.') }));
        if(indexFaux>=0) boutons[indexFaux]?.classList.add('b3-tre-montre');
        return;
      }
      controles.hidden = false;
      controles.replaceChildren();
      requestAnimationFrame(() => controles.scrollIntoView?.({ block: 'center', behavior: mouvementReduit() ? 'auto' : 'smooth' }));
      const echec = indexFaux >= 0 ? CONTROLES.findIndex((c) => c.teste(item.mot_faux)) : -1;
      for (const [k, c] of CONTROLES.entries()) {
        const li = el('li', { class: 'b3-tre-ctl b3-tre-encours' }, el('span', { class: 'b3-tre-ctl-marque', 'aria-hidden': 'true' }), el('span', { texte: c.libelle }));
        controles.append(li);
        await attendre(mouvementReduit() ? 80 : 650, sig);
        if (sig.aborted) return;
        li.classList.remove('b3-tre-encours');
        if (k === echec) {
          li.classList.add('b3-tre-ko');
          li.querySelector('.b3-tre-ctl-marque').innerHTML = icone(api.ctx, 'faux');
          li.append(el('span', { class: 'b3-tre-ici', lang: 'en', texte: ` : « ${item.mot_faux} »` }));
          boutons[indexFaux]?.classList.add('b3-tre-montre');
          return;
        }
        li.classList.add('b3-tre-ok');
        li.querySelector('.b3-tre-ctl-marque').innerHTML = icone(api.ctx, 'coche');
      }
      if (echec < 0 && indexFaux >= 0) { boutons[indexFaux]?.classList.add('b3-tre-montre'); return; }
      if (indexFaux < 0) controles.append(el('li', { class: 'b3-tre-bilan', texte: 'Les quatre contrôles passent : cette phrase n\'a pas d\'erreur.' }));
    },
    solution() {
      if (indexFaux < 0) return { texte: 'Cette phrase est juste : aucune erreur.', explication: sansOui(item.retours?.juste) };
      const b = boutons[indexFaux];
      if (b) b.replaceWith(el('span', { class: 'b3-tre-rectif' }, el('s', { texte: item.mot_faux }), ' ', el('b', { texte: liste(item.correction?.attendues)[0] || '' })));
      correction.hidden = true;
      return { texte: corrigee(), explication: sansOui(item.retours?.juste) };
    },
    bloquer() {
      bloque = true;
      aucune.disabled = true;
      champ.readOnly = true;
      for (const b of boutons) if (b) b.disabled = true;
      if (phase === 'correction' && boutons[indexFaux]) {
        boutons[indexFaux].replaceWith(el('span', { class: 'b3-tre-rectif' }, el('s', { texte: item.mot_faux }), ' ', el('b', { texte: champ.value.trim() || liste(item.correction?.attendues)[0] })));
        correction.hidden = true;
      }
    },
    focus() { (phase === 'correction' ? champ : boutons.find(Boolean))?.focus({ preventScroll: true }); },
    apresErreur() { if (phase === 'correction') champ.select(); },
  };
}

function css(p) {
  return `
${p} .b3-tre-carte { position: relative; padding: 16px 16px 14px; border-radius: var(--rayon-bloc); background: #FFFDF7; border: 1px solid #EFE6CF; box-shadow: 0 1px 2px rgba(12,21,40,0.04); }
${p} .b3-tre-lib-carte { display: block; font-size: 0.75rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-50); margin-bottom: 6px; }
${p} .b3-tre-phrase { margin: 0; font-size: 1.2rem; line-height: 2.2; color: var(--encre); }
@media (min-width: 768px) { ${p} .b3-tre-phrase { font-size: 1.35rem; } }
${p} .b3-tre-mot { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; padding: 0 6px; margin: 0 -1px; border: 0; border-radius: 8px; background: transparent; font: inherit; color: inherit; cursor: pointer; text-decoration: underline dotted var(--filet-fort); text-decoration-thickness: 2px; text-underline-offset: 6px; touch-action: manipulation; transition: background-color .15s, color .15s; }
@media (hover: hover) { ${p} .b3-tre-mot:hover:not(:disabled) { background: var(--marque-voile); } }
${p} .b3-tre-mot:disabled { cursor: default; text-decoration: none; }
${p} .b3-tre-trouve { background: var(--faux-voile); color: var(--faux-fonce); text-decoration: line-through; text-decoration-color: var(--faux); }
${p} .b3-tre-non { background: #F2F0EB; color: var(--encre-50); }
${p} .b3-tre-montre { box-shadow: 0 0 0 2px var(--marque); background: var(--marque-voile); }
${p} .b3-tre-ponct { margin-left: -5px; }
${p} .b3-tre-rectif s { color: var(--faux-fonce); text-decoration-thickness: 2px; }
${p} .b3-tre-rectif b { color: var(--juste-fonce); }
${p} .b3-tre-correction { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
${p} .b3-tre-lib { font-weight: 600; font-size: 0.95rem; }
${p} .b3-tre-champ { width: min(100%, 16rem); height: 48px; padding: 0 14px; border-radius: 12px; border: 1.5px solid var(--filet-fort); background: var(--surface); font: inherit; font-size: 17px; font-weight: 700; }
${p} .b3-tre-champ:focus { outline: none; border-color: var(--marque); box-shadow: 0 0 0 3px var(--marque-voile-bord); }
${p} .b3-tre-aucune { margin-top: 14px; }
${p} .b3-tre-controles { list-style: none; margin: 12px 0 0; padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--marque-voile); border: 1px solid var(--marque-voile-bord); display: flex; flex-direction: column; gap: 6px; }
${p} .b3-tre-ctl { display: flex; align-items: center; gap: 8px; font-size: 0.95rem; color: var(--encre-70); }
${p} .b3-tre-ctl-marque { width: 20px; height: 20px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; }
${p} .b3-tre-ctl-marque svg { width: 16px; height: 16px; }
${p} .b3-tre-encours .b3-tre-ctl-marque { border: 2px solid var(--marque-clair); border-right-color: transparent; animation: b3-tourne .7s linear infinite; }
@keyframes b3-tourne { to { transform: rotate(360deg); } }
${p} .b3-tre-ok { color: var(--juste-fonce); }
${p} .b3-tre-ko { color: var(--faux-fonce); font-weight: 600; }
${p} .b3-tre-bilan { font-weight: 600; color: var(--juste-fonce); }
@media (prefers-reduced-motion: reduce) { ${p} .b3-tre-encours .b3-tre-ctl-marque { animation: none; } }
`;
}
