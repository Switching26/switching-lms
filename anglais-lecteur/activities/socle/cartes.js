// ÉTAPE REV — première séance de cartes, juste après la leçon (script/revisions.json de D).
// Toutes les cartes de la leçon entrent en boîte 1 ; la séance en montre au plus 20, puis les révisions
// du jour prennent le relais depuis l'accueil.
import { seance } from '../../app/seance-cartes.js';
import { semerCartesLecon } from '../../app/ecrans/revisions.js';

export const meta = { titre: 'Cartes de révision' };

export async function monter(racine, ctx) {
  const { revisions, voix, visuels } = ctx.services;
  await Promise.all([semerCartesLecon(), voix.pret(), visuels.pret()]);
  const ids = new Set((ctx.donnees?.cartes || []).map(c => c.id));
  let dues = revisions.aReviser(Date.now(), 10000).filter(c => ids.has(c.id)).slice(0, revisions.PAR_SEANCE);
  if (!dues.length) dues = revisions.liste().filter(c => ids.has(c.id)).sort((a, b) => a.boite - b.boite).slice(0, revisions.PAR_SEANCE);
  const s = seance(racine, {
    cartes: dues,
    signal: ctx.signal,
    surNote: (c, r) => ctx.tracer('carte_revue', { carte: c.id, resultat: r }),
    surFin: ({ total, su }) => ctx.signaler.fin({ score: total ? su / total : null, reussi: true }),
  });
  ctx.signaler.pret();
  return { demonter() { s.detruire(); } };
}
