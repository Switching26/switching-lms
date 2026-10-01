// LES ENCARTS DE NOTRE LMS : juste, presque, faux (toujours expliqué), « Voici la réponse » (vert).
// Chaque fonction rend un élément ; l'activité le place où elle veut. Le texte est inséré en texte
// brut ; `{ html: true }` accepte du HTML venant du script (contenu de confiance, jamais une saisie).
import { icones } from './icones.js';
import { typo } from './typo.js';

function encart(type, libelle, texte, opts = {}) {
  const el = document.createElement('div');
  el.className = `encart encart-${type} apparait`;
  el.setAttribute('role', type === 'faux' ? 'alert' : 'status');
  const corps = document.createElement('span');
  if (libelle) { const b = document.createElement('b'); b.textContent = libelle; corps.append(b, ' '); }
  const t = document.createElement('span');
  if (opts.html) t.innerHTML = texte || ''; else t.textContent = typo(texte || '');
  corps.append(t);
  if (opts.correction) {
    const c = document.createElement('span');
    c.className = 'explication';
    c.textContent = typo(`Orthographe attendue : ${opts.correction}`);
    corps.append(c);
  }
  if (opts.explication) {
    const x = document.createElement('span');
    x.className = 'explication';
    if (opts.html) x.innerHTML = opts.explication; else x.textContent = typo(opts.explication);
    corps.append(x);
  }
  el.innerHTML = icones[type] || (type === 'note' ? icones.presque : icones.info);
  el.append(corps);
  return el;
}

export const juste = (texte, opts) => encart('juste', null, texte || 'Juste.', opts);
export const presque = (texte, opts) => encartPresque(texte, opts);
function encartPresque(texte, opts = {}) { const el = encart('note', null, texte || 'Accepté, avec une petite correction.', opts); el.classList.add('encart-presque'); return el; }
export const faux = (texte, opts) => encart('faux', null, texte || 'Pas encore.', opts);
export const reponse = (texte, opts) => encart('reponse', 'Voici la réponse.', texte, opts);
export const info = (texte, opts) => encart('info', null, texte, opts);

let zone = null;
/** Zone lue par les lecteurs d'écran (aria-live), fournie par le lecteur d'étape. */
export function definirZone(el) { zone = el; }
export function annoncer(texte) {
  if (!zone) return;
  zone.textContent = '';
  requestAnimationFrame(() => { zone.textContent = texte; });
}

export const retour = { juste, presque: encartPresque, faux, reponse, info, annoncer, definirZone };
