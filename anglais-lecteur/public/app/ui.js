import { modeLMS } from '../services/base.js';
import { lien as lienUnite } from '../services/unite.js';
// Petits outils d'écran partagés par les écrans du socle.
import { icones } from '../services/icones.js';
import { typo } from '../services/typo.js';

export { typo };

/** Échappe un texte pour l'insérer dans du HTML (typographie française comprise). */
export function e(texte) {
  return typo(texte).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const COMPETENCES = {
  ecouter: { nom: 'Écouter', icone: svg('<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2Z"/><path d="M3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2Z"/>') },
  lire: { nom: 'Lire', icone: svg('<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2Z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8Z"/>') },
  parler: { nom: 'Parler', icone: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.2-4.4A8 8 0 1 1 21 12Z"/>') },
  ecrire: { nom: 'Écrire', icone: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>') },
};
export const REGIMES = { comprendre: 'À comprendre', a_vous_de_jouer: 'À vous de jouer', evaluation: 'Évaluation' };

/** Accord en nombre à la française : singulier pour 0 et 1 (« 0 étape », « 1 étape », « 2 étapes »). */
export const pluriel = (n, singulier, forme = `${singulier}s`) => (Math.abs(Number(n) || 0) <= 1 ? singulier : forme);
export const compte = (n, singulier, forme) => `${n} ${pluriel(n, singulier, forme)}`;

export function pastilleCompetence(c) {
  const d = COMPETENCES[c];
  return d ? `<span class="pastille pastille-${c}">${d.icone}${e(d.nom)}</span>` : '';
}

export function duree(min) {
  if (!min && min !== 0) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function chargement(racine, texte = 'Chargement…') {
  racine.innerHTML = `<div class="chargement" role="status"><div><div class="rond-chargement" style="margin:0 auto 12px"></div>${e(texte)}</div></div>`;
}

const LIENS = [
  ['#/', 'Accueil', icones.accueil, 'accueil'],
  ['#/niveau', 'Niveau 1', icones.carte, 'niveau'],
  ['#/revisions', 'Révisions', icones.cartes, 'revisions'],
  ['#/carnet', 'Mon carnet', icones.carnet, 'carnet'],
];

/** La coquille des écrans hors lecteur : bandeau, navigation, contenu. Rend l'élément de contenu. */
export function coquille(racine, actif, opts = {}) {
  if(modeLMS) { racine.innerHTML=`<div class="coquille"><main class="contenu" id="contenu"></main></div>`; const zone=racine.querySelector('#contenu'); if(['revisions','carnet'].includes(actif)) { const a=document.createElement('a'); a.className='btn btn-secondaire retour-lecon';a.href=lienUnite();a.textContent='Revenir à la leçon';zone.before(a); } return zone; }
  const lien = ([href, nom, ic, cle], bas) => `<a href="${href}" ${cle === actif ? 'aria-current="page"' : ''}>${ic}<span>${nom}</span>${bas && cle === 'revisions' && opts.aReviser ? `<span class="compteur" aria-label="${opts.aReviser} à revoir">${opts.aReviser}</span>` : ''}</a>`;
  racine.innerHTML = `
    <div class="coquille">
      <header class="bandeau"><div class="bandeau-in">
        <a class="marque" href="#/"><img src="./logo-switching.png" alt="" width="30" height="30"><span>Anglais niveau 1<small>Switching Formation</small></span></a>
        <nav class="nav-haut" aria-label="Navigation principale">${LIENS.map((l) => lien(l, false)).join('')}</nav>
      </div></header>
      <main class="contenu" id="contenu"></main>
      <nav class="nav-bas" aria-label="Navigation">${LIENS.map((l) => lien(l, true)).join('')}</nav>
    </div>`;
  return racine.querySelector('#contenu');
}

/** Anneau de score (0..1 ou null). */
export function anneau(valeur, couleur) {
  const r = 30; const c = 2 * Math.PI * r;
  const v = valeur == null ? 0 : Math.max(0, Math.min(1, valeur));
  const txt = valeur == null ? '—' : `${Math.round(v * 100)}`;
  return `<svg class="anneau" viewBox="0 0 76 76" style="color:${couleur}" role="img" aria-label="${valeur == null ? 'non évalué' : `${txt} sur 100`}">
    <circle class="fond" cx="38" cy="38" r="${r}"/>
    <circle class="val" cx="38" cy="38" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}"/>
    <text x="38" y="44" text-anchor="middle">${txt}</text></svg>`;
}
