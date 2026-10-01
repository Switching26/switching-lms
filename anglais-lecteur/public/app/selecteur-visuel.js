import { modeLMS } from '../services/base.js';
// SÉLECTEUR « Visuel actuel ↔ Nouveau visuel » — présent dans la copie du nouveau visuel SEULEMENT.
// Il ouvre le MÊME écran (même adresse après le #) sur l'autre version : :10042 → :10041, 8942 → 8941.
// Lien ordinaire dans le même onglet : le bouton Retour du navigateur ramène au nouveau visuel.
// Rangé dans une zone libre (bandeau des écrans, barre du bas du lecteur) : il ne recouvre jamais un bouton.
const AUTRE_PORT = { 10042: '10041', 8942: '8941' };
const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>';

function monter() {
  let capture = false;
  try { capture = localStorage.getItem('lmsang:capture') === 'true'; } catch { /* rien */ }
  const port = AUTRE_PORT[location.port];
  const app = document.getElementById('app');
  if (modeLMS || capture || !port || !app) return;
  const placer = () => {
    if (app.querySelector('.selecteur-visuel')) return;
    const pied = app.querySelector('.lecteur-bas .rang');
    const bandeau = app.querySelector('.bandeau-in');
    const hote = pied || bandeau;
    if (!hote) return;
    const a = document.createElement('a');
    a.className = `selecteur-visuel ${pied ? 'dans-pied' : 'dans-bandeau'}`;
    a.href = `${location.protocol}//${location.hostname}:${port}/${location.hash || '#/'}`;
    a.innerHTML = `${ICONE}<span>Visuel actuel</span>`;
    a.setAttribute('aria-label', 'Ouvrir le même écran avec le visuel actuel');
    if (pied) pied.insertBefore(a, pied.querySelector('.espace')); else hote.append(a);
  };
  // Chaque écran remplace le contenu de #app : on se replace à chaque changement, et on suit l'adresse.
  new MutationObserver(placer).observe(app, { childList: true });
  window.addEventListener('hashchange', () => {
    const a = app.querySelector('.selecteur-visuel');
    if (a) a.href = `${location.protocol}//${location.hostname}:${port}/${location.hash || '#/'}`;
  });
  placer();
}
monter();
