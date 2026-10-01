// Une carte garde son chapitre d'origine : ses images et voix restent celles de ce chapitre.
import { unite } from './unite.js';
import { voix } from './voix.js';
import { visuels } from './visuels.js';
export async function preparerMedias(entrees) {
  const ids=[...new Set(entrees.map(x=>x.source_unite||'U01'))].filter(id=>id!==unite());
  for(const id of ids) await Promise.all([voix.chargerPour(id),visuels.chargerPour(id)]);
}
