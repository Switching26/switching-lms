import { requete } from '../services/base.js';
import { lien } from '../services/unite.js';
import { audio } from '../services/audio.js';
import { voix } from '../services/voix.js';
import { chargerNiveau } from './donnees.js';
import { e } from './ui.js';
import { icones } from '../services/icones.js';
import { scriptOptionnel } from '../services/script.js';

export async function ressourcesUnite(l) {
  const cartes = new Map();
  const ids = Array.isArray(l.lecon.mots_a_retenir) ? [...new Set(l.lecon.mots_a_retenir)] : [];
  if (ids.length) {
    // L’API de leçon renvoie les métadonnées, pas le corps des étapes.
    const rev = await scriptOptionnel('revisions.json');
    const references = new Set((l.etapes || []).filter(x => x.type === 'cartes').map(x => x.id));
    for (const etape of rev?.etapes || []) if (references.has(etape.id)) for (const c of etape.cartes || []) if (!cartes.has(c.id)) cartes.set(c.id, c);
  }
  const mots = ids.map(id => cartes.get(id)).filter(c => typeof c?.recto === 'string' && c.recto.trim() && typeof c?.verso === 'string' && c.verso.trim());
  const refs = Array.isArray(l.lecon.fiches_liees) ? [...new Set(l.lecon.fiches_liees)] : [];
  let fiches = [];
  if (refs.length) {
    const n = await chargerNiveau().catch(() => ({ elements: [] }));
    fiches = await Promise.all(refs.map(async id => {
      const f = n.elements?.find(x => x.id === id && /^[GV]\d{2}$/.test(id) && x.disponible);
      if (!f) return null;
      const plan = await requete(`/contenu/${id}/script/lecon.json`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
      return { ...f, note: plan.parcours_complet_apres ? `Parcours complet après ${plan.parcours_complet_apres}` : plan.parcours_conseille || '' };
    }));
  }
  return { mots, fiches: fiches.filter(Boolean) };
}

export function ressourcesHTML({ mots, fiches }) {
  return `${mots.length ? `<section class="ressources-unite" aria-labelledby="titre-mots"><h2 class="titre-filet" id="titre-mots">Les mots à retenir</h2><ul class="mots-unite">${mots.map(c => {
    const id = c.audio_recto?.ref || c.audio_recto?.id;
    const son = id && voix.info(id);
    return `<li><span class="mot-traduction"><b lang="en-GB">${e(c.recto)}</b><span>${e(c.verso)}</span></span><button class="btn btn-secondaire" type="button" data-mot-audio="${e(id || '')}" data-voix aria-label="${e(son ? `Écouter ${c.recto}` : 'Audio indisponible')}" ${son ? '' : 'disabled'}>${icones.ecouter}<span>${son ? 'Écouter' : 'Audio indisponible'}</span></button></li>`;
  }).join('')}</ul><p class="petit" data-mot-statut role="status"></p></section>` : ''}
  ${fiches.length ? `<section class="ressources-unite" aria-labelledby="titre-fiches"><h2 class="titre-filet" id="titre-fiches">Fiches pour cette unité</h2><ul class="fiches-unite">${fiches.map(f => `<li><a class="carte" href="${lien('', f.id)}"><b>${e(f.id)} · ${e(f.titre)}</b>${f.note ? `<span class="petit">${e(f.note)}</span>` : ''}</a></li>`).join('')}</ul></section>` : ''}`;
}

export function brancherMots(zone) {
  let actif = null, jeton = 0;
  const reset = b => { b?.setAttribute('aria-pressed', 'false'); if (b) b.querySelector('span').textContent = 'Écouter'; };
  for (const b of zone.querySelectorAll('[data-mot-audio]:not(:disabled)')) {
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', async () => {
      const meme = actif === b; const moi = ++jeton;
      audio.arreter(); reset(actif); actif = null;
      if (meme) return;
      actif = b; b.setAttribute('aria-pressed', 'true'); b.querySelector('span').textContent = 'Arrêter';
      const fin = await voix.jouer(b.dataset.motAudio);
      if (moi !== jeton) return;
      reset(b); actif = null;
      zone.querySelector('[data-mot-statut]').textContent = ['erreur', 'bloque'].includes(fin) ? 'Lecture indisponible. Réessayez avec le bouton Écouter.' : '';
    });
  }
  return () => { ++jeton; audio.arreter(); reset(actif); };
}
