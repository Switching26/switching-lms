import { unite } from '../services/unite.js';
import { adresse, modeLMS } from '../services/base.js';
// VIGNETTES DES ÉTAPES (visuel v2) — pour chaque étape, une image que l'étape MONTRE déjà
// (relevé dans le script de D : images citées par l'étape, ou portrait du personnage qui parle).
// Les fichiers de /vignettes/ sont les images de V réduites (sips, 360 px) : aucune image nouvelle.
// Une étape sans image garde une tuile à la couleur et à l'icône de sa compétence principale.
import { COMPETENCES } from './ui.js';

const IMAGES = {
  VID: 'S02',     // l'épisode : Daniel accueille Claire (scène de la vidéo)
  C1: 'S06',      // photo d'équipe, décor de l'explication
  'EX-02': 'P03', // portraits à ranger
  C2: 'V12',      // « ready — Helen », image de l'explication
  'EX-03': 'P02', // le message de Daniel (son portrait est affiché)
  'EX-04': 'S03', // Daniel présente Claire à Helen et Rob
  C3: 'S04',      // le coin café, décor de l'explication
  'ECO-1': 'V11', // « late — Daniel », image de l'écoute
  'ECO-2': 'S04', // la conversation au coin café
  C4: 'P04',      // Rob, présenté dans l'explication
  'EX-07': 'V06', // l'accueil
  DLG: 'S05',     // Daniel vous accueille
  'JEU-2': 'V04', // memory en images
  'JEU-3': 'P01', // le badge de Claire
  REV: 'V01',     // cartes de révision illustrées
};
const PORTRAITS = new Set(['P01', 'P02', 'P03', 'P04']);

/** URL de la vignette d'une image (P01, S03…), ou null. */
export const urlVignette = (idImage) => (idImage ? adresse(`vignettes/${idImage}.jpg`) : null);

/** HTML de la vignette d'une étape : la photo si l'étape en montre une, sinon la tuile de sa compétence. */
export function vignetteEtape(etape, classe = '') {
  const img = unite()==='U01' ? IMAGES[etape?.id] : null;
  if (img) return `<span class="vignette ${PORTRAITS.has(img) ? 'portrait' : ''} ${classe}" style="background-image:url('${urlVignette(img)}')" aria-hidden="true"></span>`;
  const c = (etape?.competences || [])[0];
  const d = COMPETENCES[c];
  return `<span class="vignette tuile-${c || 'lire'} ${classe}" aria-hidden="true">${d ? d.icone : ''}</span>`;
}
