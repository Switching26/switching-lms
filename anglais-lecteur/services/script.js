import { requete as fetch } from './base.js';
import { unite } from './unite.js';
// Accès au script de D, servi sous /script/. Un cache unique pour tout le prototype.
const cache = new Map();
let index = null;

export function script(fichier) {
  if (!cache.has(fichier)) {
    cache.set(fichier, fetch(`/contenu/${unite()}/script/${fichier}`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`/contenu/${unite()}/script/${fichier} : ${r.status}`);
      return r.json();
    }).catch((e) => { cache.delete(fichier); throw e; }));
  }
  return cache.get(fichier);
}

/** Comme script(), mais rend null si le fichier n'existe pas encore (sans erreur dans la console). */
export async function scriptOptionnel(fichier) {
  const cle = `?${fichier}`;
  if (!cache.has(cle)) {
    cache.set(cle, fetch(`/contenu/${unite()}/script/${fichier}?optionnel=1`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => (j && j.absent === true ? null : j)));
  }
  return cache.get(cle);
}

/** Oublie les fichiers en cache (appelé à chaque ouverture d'étape : D écrit encore). */
export function rafraichirScript() { cache.clear(); index = null; }

function indexer(noeud, table) {
  if (Array.isArray(noeud)) { for (const n of noeud) indexer(n, table); return; }
  if (!noeud || typeof noeud !== 'object') return;
  if (typeof noeud.id === 'string' && typeof noeud.voix === 'string' && !table.has(noeud.id)) table.set(noeud.id, noeud);
  for (const v of Object.values(noeud)) if (v && typeof v === 'object') indexer(v, table);
}

/** Tous les segments de voix du script, par identifiant. */
async function indexSegments() {
  if (!index) {
    index = (async () => {
      const table = new Map();
      const plan = await script('lecon.json');
      indexer(plan, table);
      const fichiers = new Set();
      for (const s of plan.sequences || []) for (const e of s.etapes || []) if (e.fichier) fichiers.add(e.fichier);
      const lus = await Promise.all([...fichiers].map((f) => scriptOptionnel(f)));
      for (const r of lus) if (r) indexer(r, table);
      return table;
    })();
  }
  return index;
}

/** Le segment `id` (ou la cible d'un `{ ref }`), ou null. */
export async function segment(idOuRef) {
  const id = typeof idOuRef === 'string' ? idOuRef : idOuRef?.ref || idOuRef?.id;
  if (!id) return null;
  if (idOuRef && typeof idOuRef === 'object' && idOuRef.voix && !idOuRef.ref) return idOuRef;
  return (await indexSegments()).get(id) || null;
}
