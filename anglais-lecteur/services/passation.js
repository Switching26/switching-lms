import { requete as fetch } from './base.js';
import { lire, ecrire } from './stockage.js';
import { nouveau } from './passation-core.js';
import { relectureAutorisee } from './droits-lms.js';
export * from './passation-core.js';
export const modeCourant = id => relectureAutorisee() ? lire(`eval-mode:${id}`, 'relecture') : 'note';
export const lirePassation = (id, mode = modeCourant(id)) => lire(`eval:${id}:${relectureAutorisee() ? mode : 'note'}`, null);
export function sauverPassation(id, t) {
  if (!ecrire(`eval:${id}:${t.mode}`, t)) throw new Error('Conservation indisponible sur cet appareil. Gardez cet écran ouvert.');
}
export function demarrer(id, plan, mode, accord) {
  if (mode === 'relecture' && !relectureAutorisee()) throw new Error('La relecture auteur est réservée à l’aperçu super-admin.');
  if (mode === 'note' && plan.evaluation?.mode_fidele_disponible === false) throw new Error('Contenu à intégrer : mode noté bloqué.');
  ecrire(`eval-mode:${id}`, mode);
  const t = lirePassation(id, mode) || nouveau(plan, mode, accord);
  sauverPassation(id, t); return t;
}
export async function chargerEtapes(id) {
  const plan = await (await fetch(`/contenu/${id}/script/lecon.json`)).json();
  const fichiers = [...new Set(plan.sequences.flatMap(s => s.etapes.map(e => e.fichier)))];
  const familles = await Promise.all(fichiers.map(async f => [f, await (await fetch(`/contenu/${id}/script/${f}`)).json()]));
  const map = Object.fromEntries(familles);
  return { plan, etapes: plan.sequences.flatMap(s => s.etapes.map(e => map[e.fichier].etapes.find(d => d.id === e.ref))) };
}
