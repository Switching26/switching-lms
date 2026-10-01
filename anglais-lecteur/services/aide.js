// LA BARRE D'AIDE PROGRESSIVE — mêmes paliers que notre LMS (script/SCHEMA.md §4) :
// après 2 erreurs l'indice, après 3 « Montrez-moi », après 5 « Voir la solution » (encart vert).
// Seuils lus dans ctx.donnees.aide.apres_essais. En évaluation : seulement « Passer la question ».
import { icones } from './icones.js';
import { info } from './retour.js';

export function barre(ctx, opts = {}) {
  const aideScript = ctx?.donnees?.aide || {};
  const seuils = { indice: 2, montrer: 3, solution: 5, ...(aideScript.apres_essais || {}) };
  const evaluation = ctx?.regime === 'evaluation';
  const texteIndice = opts.indice ?? aideScript.indice ?? null;
  const texteMontrer = aideScript.montrer ?? null;

  const el = document.createElement('div');
  el.className = 'aide-barre';
  el.setAttribute('data-voix', '');
  const boutons = document.createElement('div');
  boutons.className = 'aide-boutons';
  const zone = document.createElement('div');
  zone.className = 'aide-zone';
  el.append(boutons, zone);

  let erreurs = 0;
  let indiceVu = false;
  let solutionAccessible = false;
  const cree = (cle, libelle, icone, action) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-secondaire aide-btn apparait';
    b.dataset.aide = cle;
    b.innerHTML = `${icones[icone]}<span>${libelle}</span>`;
    b.addEventListener('click', action);
    return b;
  };
  const btn = {
    indice: cree('indice', 'Un indice', 'indice', () => montrerIndice()),
    montrer: cree('montrer', 'Montrez-moi', 'montrer', () => {
      ctx?.signaler?.aide({ niveau: 'montrer' });
      if (opts.surMontrer) opts.surMontrer();
      else if (texteMontrer) remplir(info(texteMontrer));
    }),
    solution: cree('solution', 'Voir la solution', 'reponse', () => {
      ctx?.signaler?.solution({ item: opts.item?.() });
      opts.surSolution?.();
    }),
    passer: cree('passer', 'Passer la question', 'suivant', () => opts.surPasser?.()),
  };

  function remplir(noeud) { zone.replaceChildren(noeud); }
  function montrerIndice() {
    if (!texteIndice) return;
    if (!indiceVu) ctx?.signaler?.aide({ niveau: 'indice' });
    indiceVu = true;
    remplir(info(texteIndice));
  }
  function afficher() {
    boutons.replaceChildren();
    if (evaluation) { if (opts.surPasser) boutons.append(btn.passer); return; }
    if (texteIndice && erreurs >= seuils.indice) boutons.append(btn.indice);
    if ((opts.surMontrer || texteMontrer) && erreurs >= seuils.montrer) boutons.append(btn.montrer);
    if (opts.surSolution && (solutionAccessible || erreurs >= seuils.solution)) boutons.append(btn.solution);
    el.hidden = boutons.childElementCount === 0 && !zone.childElementCount;
  }

  afficher();
  return {
    element: el,
    erreur() { erreurs += 1; afficher(); if (erreurs === seuils.indice && texteIndice && opts.indiceAuto) montrerIndice(); },
    ouvrirSolution() { solutionAccessible = true; afficher(); },
    nouvelItem() { erreurs = 0; indiceVu = false; solutionAccessible = false; zone.replaceChildren(); afficher(); },
    get erreurs() { return erreurs; },
    detruire() { el.remove(); },
  };
}

export const aide = { barre };
