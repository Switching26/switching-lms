import { preparerMedias } from '../../services/medias-transversaux.js';
// « MON CARNET » : les mots gardés par l'apprenant, à réécouter et à retirer.
import { e, coquille } from '../ui.js';
import { carnet } from '../../services/carnet.js';
import { voix } from '../../services/voix.js';
import { revisions } from '../../services/revisions.js';
import { icones } from '../../services/icones.js';

export async function afficher(racine) {
  const zone = coquille(racine, 'carnet', { aReviser: revisions.aReviser().length });
  await voix.recharger();
  await preparerMedias(carnet.liste());
  const rendre = () => {
    const l = carnet.liste();
    zone.innerHTML = `
      <div class="entete-page"><span class="surtitre">Mon carnet</span><h1>Les mots que je garde</h1>
        <p>${l.length ? `${l.length} mot${l.length > 1 ? 's' : ''}. Touchez « Écouter » pour réentendre la prononciation.` : 'Votre carnet est encore vide.'}</p></div>
      ${l.length ? `<div class="pile">${l.map((m, i) => {
        const son = m.audio && voix.info(m.audio);
        return `<div class="carte mot-carnet">
          <div class="texte"><b lang="en">${e(m.mot)}</b>${m.sens ? `<span class="discret" style="display:block">${e(m.sens)}</span>` : ''}${m.exemple ? `<span class="petit discret" lang="en" style="display:block;margin-top:4px">${e(m.exemple)}</span>` : ''}</div>
          ${son ? `<button type="button" class="btn-icone" data-ecouter="${i}" aria-label="Écouter ${e(m.mot)}">${icones.ecouter}</button>` : ''}
          <button type="button" class="btn-icone" data-retirer="${i}" aria-label="Retirer ${e(m.mot)} du carnet">${icones.fermer}</button>
        </div>`;
      }).join('')}</div>`
      : `<div class="carte vide"><div class="puce">${icones.carnet}</div><p>Pendant l'épisode vidéo ou les révisions, touchez un mot puis « Garder dans mon carnet ». Il vous attendra ici, avec sa prononciation.</p><a class="btn btn-secondaire" href="#/revisions" style="margin-top:14px">Aller aux révisions</a></div>`}`;
    for (const b of zone.querySelectorAll('[data-ecouter]')) b.addEventListener('click', () => voix.jouer(l[Number(b.dataset.ecouter)].audio));
    for (const b of zone.querySelectorAll('[data-retirer]')) b.addEventListener('click', () => { carnet.retirer(l[Number(b.dataset.retirer)].mot); rendre(); });
  };
  rendre();
}
