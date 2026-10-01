import { unite } from './unite.js';
// « MON CARNET » : les mots que l'apprenant a choisi de garder.
import { lire, ecrire } from './stockage.js';
import { ajouter as ajouterCarte } from './revisions.js';

const CLE = 'carnet';
const abonnes = new Set();
const cle = (mot) => String(mot || '').trim().toLowerCase();
function notifier() { for (const f of abonnes) { try { f(liste()); } catch { /* rien */ } } }

export function liste() { return lire(CLE, []); }
export function contient(mot) { return liste().some((m) => cle(m.mot) === cle(mot)); }
export function ajouter(entree) {
  if (!entree?.mot) return false;
  const l = liste();
  if (l.some((m) => cle(m.mot) === cle(entree.mot))) return false;
  l.unshift({ source_unite: entree.source_unite || unite(), mot: entree.mot, sens: entree.sens || '', exemple: entree.exemple || '', audio: entree.audio || null, source: entree.source || null, ajoute_le: Date.now() });
  ecrire(CLE, l);
  // Mécanique de D : un mot gardé dans le carnet devient une carte de révision (sans audio s'il n'en a pas).
  ajouterCarte({ id: `carnet-${cle(entree.mot).replace(/[^a-z0-9]+/g, '-')}`, recto: entree.mot, verso: entree.sens || '', exemple: entree.exemple || '', audio: entree.audio || null, famille: 'carnet' });
  notifier();
  return true;
}
export function retirer(mot) { ecrire(CLE, liste().filter((m) => cle(m.mot) !== cle(mot))); notifier(); }
export function surChangement(f) { abonnes.add(f); return () => abonnes.delete(f); }

export const carnet = { liste, contient, ajouter, retirer, surChangement };
