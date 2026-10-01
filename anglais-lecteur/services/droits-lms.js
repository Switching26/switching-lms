import { modeLMS, requete } from './base.js';

let relecture = !modeLMS;
// Le paramètre d'aperçu seul ne donne aucun droit : le rôle vient de la session LMS.
export async function chargerDroitsLMS() {
  if (!modeLMS) return;
  relecture = false;
  if (new URLSearchParams(location.search).get('preview') !== '1') return;
  try {
    const r = await requete('api/sante');
    relecture = r.ok && (await r.json()).preview === true;
  } catch { /* En cas d'indisponibilité, rester en passation apprenant. */ }
}
export const relectureAutorisee = () => relecture;
