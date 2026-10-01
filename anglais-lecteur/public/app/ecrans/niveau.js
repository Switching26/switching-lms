import { e, coquille, chargement, duree } from '../ui.js';
import { chargerNiveau } from '../donnees.js';
import { lien } from '../../services/unite.js';
import { revisions } from '../../services/revisions.js';
export async function afficher(racine) {
  const zone = coquille(racine, 'niveau', { aReviser: revisions.aReviser().length });
  chargement(zone);
  const n = await chargerNiveau();
  let onglet = 'unites';
  const carte = x => `<${x.disponible ? 'a' : 'div'} class="carte unite ${x.disponible ? 'ouverte carte-survol' : 'verrouillee'}" ${x.disponible ? `href="${lien('', x.id)}"` : ''}><span class="num">${e(x.id)}</span><span class="texte"><b>${e(x.titre)}</b><span class="petit discret">${duree(x.duree_min)} · ${x.disponible ? 'Ouvrir en relecture' : 'En préparation'}</span></span></${x.disponible ? 'a' : 'div'}>`;
  function rendre() {
    let contenu = '';
    if (onglet === 'unites') {
      for (let b = 0; b < 6; b++) {
        const ids = Array.from({ length: 4 }, (_, i) => `U${String(b * 4 + i + 1).padStart(2, '0')}`).concat(`T${b + 1}`);
        contenu += `<section class="bloc-niveau"><h3>Bloc ${b + 1}</h3><div class="unites">${ids.map(id => n.elements.find(x => x.id === id)).filter(Boolean).map(carte).join('')}</div></section>`;
      }
      contenu += n.elements.filter(x => x.id.startsWith('EVAL')).map(carte).join('') + '<a class="carte unite ouverte carte-survol" href="#/unite/EVAL/bilan-final">Votre bilan final d’anglais · rapport</a>';
    } else contenu = `<div class="unites">${n.elements.filter(x => x.id.startsWith(onglet === 'grammaire' ? 'G' : 'V')).map(carte).join('')}</div>`;
    zone.innerHTML = `<div class="entete-page"><span class="surtitre">Anglais A1/A2</span><h1>La carte du niveau 1</h1><p>100 heures de plateforme et 10 heures de visio. Tous les contenus disponibles sont ouverts en relecture.</p></div><div class="onglets" role="tablist" aria-label="Contenu du niveau">${[['unites','Unités et tests'],['grammaire','Grammaire'],['vocabulaire','Vocabulaire']].map(([id,t]) => `<button type="button" role="tab" aria-selected="${onglet===id}" data-onglet="${id}">${t}</button>`).join('')}</div><div role="tabpanel">${contenu}</div>`;
    zone.querySelectorAll('[data-onglet]').forEach(b => b.onclick = () => { onglet = b.dataset.onglet; rendre(); });
  }
  rendre();
}
