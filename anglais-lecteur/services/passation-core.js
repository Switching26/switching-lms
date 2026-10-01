// Routage pédagogique local : traduction exacte de EVAL/routage.py.
export function choisirBranche(resultats) {
  if (resultats.length !== 4 || resultats.some(x => !['juste','faux','passee','incident'].includes(x))) throw new Error('Quatre résultats valides sont nécessaires.');
  return resultats.includes('incident') ? null : resultats.filter(x => x === 'juste').length >= 3 ? 'a2' : 'consolidation';
}
export const cleQuestion = (d, x) => `${d.id}:${x.id || d.id}`;
export function selection(d, t) {
  if (!d.selection_items) return { items: d.items?.length ? d.items : [d], branche: 'commun' };
  const s = d.selection_items;
  if(t.mode === 'relecture' && s.branches[t.apercus?.[d.id]]) { const branche=t.apercus[d.id]; return {branche,apercu:true,items:s.branches[branche].map(id=>d.items.find(x=>x.id===id)).filter(Boolean)}; }
  const rs = Object.values(t.reponses).filter(r => r.etape === s.etape_source);
  if (rs.length !== 4) return { items: [], attente: s.etape_source };
  const branche = choisirBranche(rs.map(r => r.incident || r.mediaAbsent ? 'incident' : r.passe ? 'passee' : r.juste ? 'juste' : 'faux'));
  return branche ? { branche, items: s.branches[branche].map(id => d.items.find(x => x.id === id)).filter(Boolean) } : { items: [], incident: true, attente: s.etape_source };
}
export function nouveau(plan, mode, accord, maintenant = Date.now()) {
  if (mode === 'note' && plan.evaluation?.mode_fidele_disponible === false) throw new Error('Contenu à intégrer : mode noté indisponible.');
  return { id: `${plan.lecon}-${maintenant}`, version: plan.version, mode, accord, debut: maintenant, remis: null, reponses: {}, brouillons: {}, ecoutes: {}, captures: {}, preparations: {}, sections: {}, journal: [], actif_ms: 0 };
}
export function scoreAutomatique(rs) {
  const valides = rs.filter(r => !r.manuel && !r.incident && !r.mediaAbsent && r.juste !== null);
  return valides.length ? { justes: valides.filter(r => r.juste).length, sur: valides.length } : null;
}
export function trace(t, evenement, donnees = {}) {
  // Jamais de texte candidat ni de blob dans ce journal.
  const { item, etape, statut, code, duree_s } = donnees;
  t.journal.push({ date: Date.now(), evenement, item, etape, statut, code, duree_s, version: t.version });
}
