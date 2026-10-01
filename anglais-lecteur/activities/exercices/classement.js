// activities/exercices/classement.js — EX-02 « Ranger : quel pronom pour qui ? » (exercices.json, type classement).
//
// Une réserve de mots (avec la photo quand la bible en a une) et cinq colonnes : he, she, it, we, they.
// Toucher un mot puis sa colonne ; ou le faire glisser (souris : tout de suite ; doigt : appui long).
// Vérification au dépôt : un mot juste rejoint sa colonne, un mot faux reste dans la réserve avec
// l'explication de SON erreur, tirée du script.
import { lancerEtiquettes } from './_etiquettes.js';
import { el, liste, urlImage, rendreGlissable, depotSous, pointeurFin } from './_commun.js';

export const meta = { titre: 'Ranger', entete: true };
const P = '.act-exercices-classement';

export async function monter(racine, ctx) {
  return lancerEtiquettes(racine, ctx, {
    type: 'classement',
    prefixe: P,
    css,
    cibles: (etape) => liste(etape.categories).map((c) => (typeof c === 'string' ? { nom: c } : { nom: c.en ?? c.nom ?? c.id, libelle: c.fr })),
    libelleEtat: (n, t) => `${n} sur ${t} rangés`,
    modeEmploi: (souris) => ctx.unite && ctx.unite !== 'U01' ? 'Choisissez une étiquette, puis la catégorie qui lui correspond.' : (souris
      ? 'Cliquez un mot puis sa colonne, ou faites-le glisser.'
      : 'Touchez un mot, puis la colonne de son pronom. Vous pouvez aussi le faire glisser : appuyez une demi-seconde.'),
    second_indice: (item) => {
      if (ctx.unite && ctx.unite !== 'U01') return 'Relisez les catégories proposées, puis classez cette étiquette.';
      const t = item?.etiquette || '';
      if (/\band I$/i.test(t)) return `« ${t} » : regardez le dernier mot, I. Celui qui parle fait-il partie du groupe ?`;
      if (/\band\b/i.test(t)) return `« ${t} » : combien de personnes ? Celui qui parle en fait-il partie ?`;
      if (/^the\s/i.test(t)) return `« ${t} » : une chose, ou plusieurs ? Regardez la fin du mot.`;
      return `« ${t} » : un homme, une femme, ou une chose ?`;
    },
    vue,
  });
}

function vue(hote, modele, api) {
  const { ctx, signal } = api;
  const plateau = el('div', { class: 'b3-cls' });
  const reserve = el('div', { class: 'b3-cls-reserve', role: 'group', 'aria-label': 'Mots à ranger' });
  const colonnes = el('div', { class: 'b3-cls-colonnes' });
  plateau.append(reserve, colonnes);
  hote.append(plateau);

  const jetons = new Map();
  const cols = new Map();

  for (const e of modele.etiquettes) {
    const img = urlImage(ctx, e.image);
    const b = el('button', { type: 'button', class: 'b3-jeton b3-cls-jeton', 'data-etiq': e.id, 'aria-pressed': 'false', lang: 'en' },
      img ? el('img', { class: 'b3-cls-vignette', src: img, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }) : null,
      el('span', { class: 'b3-cls-texte', texte: e.texte }));
    b.addEventListener('click', () => {
      api.choisir(e.id);
      if (api.choisie() === e.id && b.dataset.clavier === '1') cols.values().next().value?.querySelector('.b3-cls-tete')?.focus();
    });
    b.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') b.dataset.clavier = '1'; });
    b.addEventListener('pointerdown', () => { b.dataset.clavier = '0'; });
    rendreGlissable(b, {
      hote: plateau,
      signal,
      actif: () => !api.estPlace(e.id),
      cibleSous: (x, y) => depotSous(x, y, 'data-cible', plateau),
      deposer: (c) => api.poser(c.dataset.cible, e.id),
    });
    jetons.set(e.id, b);
    reserve.append(b);
  }

  for (const c of modele.cibles) {
    const col = el('div', { class: 'b3-cls-col', 'data-cible': c.nom });
    const tete = el('button', { type: 'button', class: 'b3-cls-tete', lang: 'en', 'aria-label': `Ranger dans la colonne ${c.nom}` }, el('span', { texte: c.nom }));
    const contenu = el('div', { class: 'b3-cls-contenu' });
    const vide = el('span', { class: 'b3-cls-vide', texte: pointeurFin() ? 'Déposez ici' : 'Touchez ici', 'aria-hidden': 'true' });
    contenu.append(vide);
    col.append(tete, contenu);
    const agir = () => {
      const id = api.choisie();
      if (!id) { inviter(); return; }
      const ok = api.poser(c.nom);
      if (tete.matches(':focus-visible')) {
        const suivant = [...jetons.entries()].find(([k]) => !api.estPlace(k));
        (ok ? suivant?.[1] : jetons.get(id))?.focus();
      }
    };
    tete.addEventListener('click', (ev) => { ev.stopPropagation(); agir(); });
    col.addEventListener('click', agir);
    cols.set(c.nom, col);
    colonnes.append(col);
  }

  function inviter() {
    reserve.classList.remove('b3-cls-invite'); void reserve.offsetWidth; reserve.classList.add('b3-cls-invite');
  }

  return {
    element: plateau,
    etiquette: (id) => jetons.get(id),
    cible: (nom) => cols.get(nom)?.querySelector('.b3-cls-contenu') || cols.get(nom),
    selection(id) {
      for (const [k, b] of jetons) b.setAttribute('aria-pressed', String(k === id));
      plateau.classList.toggle('b3-cls-attente', !!id);
    },
    surligner(id, mot) {
      const t = jetons.get(id)?.querySelector('.b3-cls-texte');
      if (!t || t.querySelector('mark')) return;
      const re = new RegExp(`\\b(${mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`);
      const m = t.textContent.match(re);
      if (!m) return;
      const avant = t.textContent.slice(0, m.index), apres = t.textContent.slice(m.index + m[0].length);
      t.replaceChildren(avant, el('mark', { class: 'b3-cls-marque', texte: m[0] }), apres);
    },
    succes(id, nom, { demo } = {}) {
      const b = jetons.get(id);
      b.classList.add('b3-ok');
      if (demo) b.classList.add('b3-par-aide');
      b.disabled = true;
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', `${b.textContent} : rangé dans ${nom}`);
      const col = cols.get(nom);
      const contenu = col.querySelector('.b3-cls-contenu');
      contenu.querySelector('.b3-cls-vide')?.remove();
      contenu.append(b);
      col.classList.remove('b3-cls-recoit'); void col.offsetWidth; col.classList.add('b3-cls-recoit');
      if (!reserve.querySelector('.b3-cls-jeton')) reserve.classList.add('b3-cls-reserve-vide');
    },
    echec(id, nom) {
      const b = jetons.get(id);
      b.classList.remove('b3-secoue'); void b.offsetWidth; b.classList.add('b3-secoue');
      const col = cols.get(nom);
      col.classList.remove('b3-cls-refus'); void col.offsetWidth; col.classList.add('b3-cls-refus');
    },
    reinitialiser() {},
  };
}

function css(p) {
  return `
${p} .b3-cls { display: flex; flex-direction: column; gap: 16px; }
${p} .b3-cls-reserve { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px dashed var(--filet-fort); min-height: 68px; transition: min-height .3s var(--doux); }
${p} .b3-cls-reserve-vide { min-height: 0; padding: 0; border: 0; }
${p} .b3-cls-jeton { padding: 0 12px 0 6px; gap: 8px; font-weight: 600; }
${p} .b3-cls-jeton:not(:has(img)) { padding-left: 14px; }
${p} .b3-cls-vignette { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex: none; background: var(--filet); pointer-events: none; }
${p} .b3-cls-texte { min-width: 0; }
${p} .b3-cls-marque { background: var(--marque-voile-bord); color: inherit; border-radius: 3px; padding: 0 2px; }
${p} .b3-cls-colonnes { display: grid; grid-template-columns: 1fr; gap: 8px; }
${p} .b3-cls-col { display: grid; grid-template-columns: 76px minmax(0, 1fr); align-items: stretch; min-height: 56px; border-radius: 14px; border: 1px solid var(--filet-fort); background: var(--surface); overflow: hidden; cursor: pointer; transition: border-color .15s, box-shadow .2s; }
${p} .b3-cls-tete { display: flex; align-items: center; justify-content: center; min-height: 56px; border: 0; border-right: 1px solid var(--filet); background: var(--fond); font: inherit; font-weight: 700; font-size: 1.15rem; color: var(--encre); cursor: pointer; touch-action: manipulation; }
${p} .b3-cls-contenu { display: flex; flex-wrap: wrap; align-content: center; align-items: center; gap: 6px; padding: 6px 8px; min-width: 0; }
${p} .b3-cls-contenu .b3-jeton { min-height: 40px; font-size: 0.93rem; }
${p} .b3-cls-contenu .b3-cls-vignette { width: 26px; height: 26px; }
${p} .b3-cls-vide { color: var(--encre-30); font-size: 0.875rem; padding-left: 6px; }
${p} .b3-cls-attente .b3-cls-col { border-color: var(--marque-voile-bord); box-shadow: 0 0 0 3px var(--marque-voile); }
${p} .b3-cls-attente .b3-cls-vide { color: var(--marque); }
${p} .b3-cls-col.b3-cible-survol { outline: none; border-color: var(--marque); box-shadow: 0 0 0 3px var(--marque-voile-bord); }
@keyframes b3-cls-recoit { 0% { box-shadow: 0 0 0 0 rgba(5,150,105,0.35); } 100% { box-shadow: 0 0 0 10px rgba(5,150,105,0); } }
${p} .b3-cls-recoit { animation: b3-cls-recoit .6s var(--doux) 1; }
@keyframes b3-cls-refus { 0%, 100% { border-color: var(--filet-fort); } 20%, 60% { border-color: var(--faux); } }
${p} .b3-cls-refus { animation: b3-cls-refus .8s ease 1; }
@keyframes b3-cls-invite { 0%,100% { transform: none; } 40% { transform: translateY(-3px); } }
${p} .b3-cls-invite .b3-cls-jeton { animation: b3-cls-invite .35s ease 1; }
@media (hover: hover) { ${p} .b3-cls-col:hover { border-color: var(--marque-voile-bord); } }
@media (min-width: 700px) {
  ${p} .b3-cls-colonnes { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
  ${p} .b3-cls-col { grid-template-columns: 1fr; grid-template-rows: auto 1fr; min-height: 210px; }
  ${p} .b3-cls-tete { border-right: 0; border-bottom: 1px solid var(--filet); min-height: 48px; }
  ${p} .b3-cls-contenu { flex-direction: column; align-items: stretch; align-content: flex-start; justify-content: flex-start; padding: 8px; }
  ${p} .b3-cls-contenu .b3-jeton { justify-content: flex-start; text-align: left; }
  ${p} .b3-cls-vide { text-align: center; padding: 18px 0 0; }
}
@media (prefers-reduced-motion: reduce) { ${p} .b3-cls-invite .b3-cls-jeton { animation: none; } }
`;
}
