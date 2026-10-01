import { modeLMS, idInterne } from '../services/base.js';
import { chargerDroitsLMS } from '../services/droits-lms.js';
import { chargerEtat, chargerTransversaux, definirPlan, synchroniser } from '../services/etat-lms.js';
import { afficherLMS } from '../services/lms.js';
import { chargerLecon } from './donnees.js';
import { activerUnite, unite } from '../services/unite.js';
import { rafraichirScript } from '../services/script.js';
// LE ROUTEUR DU PROTOTYPE — navigation par ancre (#/…), aucune dépendance.
import { debloquer } from '../services/audio.js';
import './selecteur-visuel.js';

const ROUTES = [
  [/^#?\/?$/, () => import('./ecrans/accueil.js')],
  [/^#\/accueil$/, () => import('./ecrans/accueil.js')],
  [/^#\/bilan-final$/, () => import('./ecrans/bilan-final.js')],
  [/^#\/niveau$/, () => import('./ecrans/niveau.js')],
  [/^#\/lecon$/, () => import('./ecrans/lecon.js')],
  [/^#\/etape\/([A-Za-z0-9_-]+)/, () => import('./ecrans/lecteur.js')],
  [/^#\/bilan$/, () => import('./ecrans/bilan.js')],
  [/^#\/revisions$/, () => import('./ecrans/revisions.js')],
  [/^#\/carnet$/, () => import('./ecrans/carnet.js')],
  [/^#\/banc$/, () => import('./ecrans/banc.js')],
];

const app = document.getElementById('app');
const demande=idInterne(new URLSearchParams(location.search).get('id') || 'U01');
const chapitreDemande=/^(U(?:0[1-9]|1\d|2[0-4])|T[1-6]|[GV](?:0[1-9]|1\d|20)|EVAL(?:-B[12])?|BILAN)$/.test(demande)?demande:'U01';
if(modeLMS && !location.hash) history.replaceState(null,'',`${location.pathname}${location.search}#/unite/${chapitreDemande}`);
let chapitreActif = chapitreDemande;
let demonter = null;
let jeton = 0;
// La page se quitte (rechargement, fermeture) : une requête coupée à ce moment n'est pas une panne.
let quitte = false;
window.addEventListener('pagehide', () => { quitte = true; });
window.addEventListener('beforeunload', () => { quitte = true; });

async function naviguer() {
  let h = location.hash || '#/';
  h = h.replace(/^#\/unite\/EVAL\/BLANC([12])(?=\/|$)/, '#/unite/EVAL-B$1');
  const scoped = /^#\/unite\/(U\d{2}|T[1-6]|[GV]\d{2}|EVAL(?:-B[12])?|BILAN)(?:\/(.*))?$/.exec(h);
  const cibleUnite = scoped?.[1] || (modeLMS ? chapitreActif : 'U01');
  if (scoped) h = '#/' + (scoped[2] || (scoped[1] === 'BILAN' ? 'bilan-final' : 'lecon'));
  if(modeLMS && ['#/','#/accueil','#/niveau','#/banc'].includes(h)) h='#/lecon';
  const moi = ++jeton;
  delete app.dataset.pret;
  if (demonter) { try { await demonter(); } catch (err) { console.warn('[socle] démontage', err); } demonter = null; }
  void synchroniser();
  if(modeLMS) app.innerHTML='<div class="chargement" role="status">Chargement du chapitre…</div>';
  chapitreActif = cibleUnite;
  activerUnite(cibleUnite);
  await chargerEtat(cibleUnite);
  if(modeLMS && ['#/revisions','#/carnet','#/bilan-final'].includes(h)) await chargerTransversaux();
  rafraichirScript();
  for (const [re, charger] of ROUTES) {
    const m = h.match(re);
    if (!m) continue;
    try {
      const mod = h === '#/bilan' && unite().startsWith('EVAL') ? await import('./ecrans/bilan-eval.js') : h === '#/bilan' && unite() !== 'U01' ? await import('./ecrans/bilan-multi.js') : await charger();
      if (moi !== jeton) return;
      window.scrollTo(0, 0);
      if(modeLMS && cibleUnite!=='BILAN') { const l=await chargerLecon(true); definirPlan(cibleUnite,l.etapes?.map(x=>x.id)||[]); }
      const d = await mod.afficher(app, ...m.slice(1));
      if (moi !== jeton) { if (typeof d === 'function') d(); return; }
      demonter = typeof d === 'function' ? d : null;
      app.dataset.route=location.hash; app.dataset.pret='1';
      afficherLMS(app,cibleUnite,h.startsWith('#/etape/'));
    } catch (err) {
      if (quitte || moi !== jeton) return;
      const reseau = err instanceof TypeError && /fetch|network|load/i.test(String(err.message));
      if (reseau) {
        // Réseau qui décroche (Tailscale, téléphone en veille) : on propose de réessayer, sans alarme.
        console.warn('[socle] connexion interrompue', h, err.message);
        app.innerHTML = `<main class="contenu"><div class="carte panne"><h2>La connexion a été interrompue.</h2><p class="discret" style="margin-top:8px">Vérifiez le réseau, puis réessayez : votre progression est gardée sur cet appareil.</p><button type="button" class="btn btn-primaire" style="margin-top:16px" data-reessayer>Réessayer</button></div></main>`;
        app.querySelector('[data-reessayer]').addEventListener('click', () => naviguer());
        return;
      }
      console.error('[socle] écran', h, err);
      app.innerHTML = `<main class="contenu"><div class="carte panne"><h2>Cet écran n'a pas pu s'ouvrir.</h2><p class="discret" style="margin-top:8px">Rechargez la page : votre progression est gardée sur cet appareil.</p><a class="btn btn-secondaire" style="margin-top:16px" href="#/">Revenir à l'accueil</a></div></main>`;
    }
    return;
  }
  location.replace('#/');
}

// Un montage doit être démonté avant que le suivant ne change le dossier actif.
let navigation = Promise.resolve();
const demanderNavigation = () => { navigation = navigation.catch(() => {}).then(naviguer); };
window.addEventListener('hashchange', demanderNavigation);
document.addEventListener('click', (ev) => { if (ev.target.closest('button, a')) debloquer(); }, { capture: true });
chargerDroitsLMS().then(demanderNavigation);
