import { preparerMedias } from '../../services/medias-transversaux.js';
// LES RÉVISIONS DU JOUR : les cartes dues, au plus 20, les plus en retard d'abord (mécanique de D).
import { coquille, chargement, compte } from '../ui.js';
import { revisions } from '../../services/revisions.js';
import { voix } from '../../services/voix.js';
import { visuels } from '../../services/visuels.js';
import { scriptOptionnel } from '../../services/script.js';
import { seance, carteDepuisScript } from '../seance-cartes.js';

/** Première séance : toutes les cartes de la leçon en boîte 1 (familles mélangées, comme le veut D). */
export async function semerCartesLecon() {
  const r = await scriptOptionnel('revisions.json');
  const cartes = (r?.etapes || []).flatMap((x) => x.cartes || []).map(carteDepuisScript).filter((c) => c.id && c.recto);
  // Mélange stable : les familles ne se suivent pas en bloc.
  cartes.sort((a, b) => (a.id.split('').reverse().join('') < b.id.split('').reverse().join('') ? -1 : 1));
  return revisions.ajouterPlusieurs(cartes);
}

export async function afficher(racine) {
  const zone = coquille(racine, 'revisions', { aReviser: revisions.aReviser().length });
  chargement(zone);
  await Promise.all([semerCartesLecon(), voix.pret(), visuels.pret()]);
  await preparerMedias(revisions.liste());
  const dues = revisions.aReviser();
  zone.innerHTML = `
    <div class="entete-page"><span class="surtitre">Révisions espacées</span><h1>${dues.length ? 'Vous vous souvenez ?' : 'Rien à revoir aujourd’hui'}</h1>
      <p>${dues.length ? `${compte(dues.length, 'carte')} aujourd'hui, environ ${compte(revisions.minutesSeance(dues.length), 'minute')}. Dites la réponse dans votre tête ou à voix haute, puis retournez la carte. Soyez honnête : c'est ce qui règle vos prochaines révisions.` : 'Revenez demain : vos cartes reviennent juste avant que vous les oubliiez.'}</p></div>
    <div data-seance></div>`;
  const ctrl = new AbortController();
  const s = seance(zone.querySelector('[data-seance]'), { cartes: dues, signal: ctrl.signal });
  return () => { ctrl.abort(); s.detruire(); };
}
