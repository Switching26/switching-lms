import { requete as fetch } from '../services/base.js';
import { unite } from '../services/unite.js';
// Données partagées des écrans : leçon assemblée par le serveur, carte du niveau, calculs de progression.
import { lireEtat } from '../services/progression.js';

let lecon = null;
export async function chargerLecon(forcer = false) {
  if (lecon?.lecon?.dossier === unite() && !forcer) return lecon;
  const r = await fetch(`/api/lecon/${unite()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Leçon indisponible (${r.status})`);
  lecon = await r.json();
  return lecon;
}

let niveau = null;
export async function chargerNiveau() {
  niveau = await fetch('/api/niveau', { cache: 'no-store' }).then((r) => r.json());
  return niveau;
}

/** Avancement de la leçon : étapes faites, prochaine étape, scores par compétence. */
export function avancement(l) {
  const etat = lireEtat();
  const etapes = l?.etapes || [];
  const faites = etapes.filter((x) => etat.etapes[x.id]?.termine);
  const prochaine = etapes.find((x) => !etat.etapes[x.id]?.termine) || null;
  const parComp = {};
  for (const c of ['ecouter', 'lire', 'parler', 'ecrire']) parComp[c] = { total: 0, faites: 0, somme: 0, notees: 0 };
  for (const x of etapes) {
    const s = etat.etapes[x.id];
    for (const c of x.competences || []) {
      if (!parComp[c]) continue;
      parComp[c].total += 1;
      if (s?.termine) {
        parComp[c].faites += 1;
        if (typeof s.score === 'number') { parComp[c].somme += s.score; parComp[c].notees += 1; }
      }
    }
  }
  for (const c of Object.keys(parComp)) {
    const p = parComp[c];
    p.moyenne = p.notees ? p.somme / p.notees : null;
    p.part = p.total ? p.faites / p.total : 0;
  }
  // Le total annoncé est celui de D (2 h, ouverture comprise), le même que sur la page de la leçon et la carte.
  const minutes = l?.lecon?.duree_min || etapes.reduce((a, x) => a + (x.duree_min || 0), 0);
  const minutesFaites = faites.reduce((a, x) => a + (x.duree_min || 0), 0);
  return { etat, etapes, faites, prochaine, parComp, part: etapes.length ? faites.length / etapes.length : 0, minutes, minutesFaites };
}
