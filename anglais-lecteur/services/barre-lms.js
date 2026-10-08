// Relais du contrat lib/anglais/barre-contrat.ts. Aucun effet hors du LMS.
import { modeLMS } from './base.js';
import { guide } from './guide.js';
import { debloquer } from './audio.js';
import { lien } from './unite.js';
import { message } from './lms.js';

let ecran = null;
const notesDisponibles = new URLSearchParams(location.search).get('preview') !== '1';

function publier() {
  if (!modeLMS || !ecran) return;
  const voix = guide.etat();
  message('etat', {
    sequence: ecran.sequence || '', titre: ecran.titre,
    etape: ecran.etape || null,
    voix: { disponible: voix.disponible, active: !voix.coupe, enLecture: voix.enLecture },
    retourLecon: Boolean(ecran.retourLecon),
    outils: (ecran.outils || []).map(({ id, libelle }) => ({ id, libelle })),
  });
}

export function commencerEcranBarre() {
  if (!modeLMS) return;
  ecran = null;
  guide.oublier();
}

export function configurerBarre(configuration) {
  if (!modeLMS) return;
  ecran = configuration;
  publier();
}

// Bilans, carnet, révisions, écrans indisponibles : aucun contexte d'étape ne fuit.
export function terminerEcranBarre(racine, route) {
  if (!modeLMS) return;
  if (!ecran) ecran = {
    titre: racine.querySelector('h1, h2')?.textContent.trim() || 'Leçon d’anglais',
    retourLecon: route !== '#/lecon' && route !== '#/bilan-final',
  };
  publier();
}

if (modeLMS) {
  guide.surChangement(publier);
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== parent || parent === window) return;
    const commande = event.data;
    if (!commande || typeof commande !== 'object' || commande.type !== 'anglais:commande' || !ecran) return;
    switch (commande.action) {
      case 'voix:rejouer':
      case 'voix:arreter':
      case 'voix:activer':
      case 'voix:couper':
        ecran.avantCommandeVoix?.();
        if (commande.action === 'voix:arreter') guide.arreter();
        if (commande.action === 'voix:couper' && !guide.estCoupe()) guide.basculer();
        if (commande.action === 'voix:activer' && guide.estCoupe()) { debloquer(); guide.basculer(); }
        if (commande.action === 'voix:rejouer' && guide.etat().disponible) { debloquer(); guide.rejouer(); }
        publier();
        break;
      case 'retour-lecon':
        if (ecran.retourLecon) location.hash = lien();
        break;
      case 'outil': {
        const outil = ecran.outils?.find((o) => o.id === commande.id);
        if (outil) outil.executer();
        else if (commande.id === 'ressources' || (commande.id === 'notes' && notesDisponibles)) message('outil', { outil: commande.id });
        break;
      }
    }
  });
}
