import { adresse, modeLMS } from './base.js';
import { medias, mediasPour, unite } from './unite.js';
let besoins = [];
const tables=new Map();
// LES IMAGES DE V (assets/visuels/visuels.json) : identifiant de la bible (P01, S06…) → URL.
// Lecture tolérante : tableau d'objets ou table ; une image absente ou « à refaire » rend null.
let table = null;
let chargement = null;

function normaliser(brut) {
  const t = new Map();
  const liste = Array.isArray(brut) ? brut : Array.isArray(brut?.assets) ? brut.assets : Array.isArray(brut?.visuels) ? brut.visuels : Array.isArray(brut?.images) ? brut.images
    : brut && typeof brut === 'object' ? Object.entries(brut).map(([id, v]) => (typeof v === 'string' ? { id, fichier: v } : { id, ...v })) : [];
  for (const v of liste) {
    const id = v?.id || v?.identifiant;
    const f = v?.fichier || v?.file || v?.chemin || v?.url;
    if (!id || !f) continue;
    if (v.statut && !/retenu|ok|valid/i.test(String(v.statut))) continue;
    const url = /^(https?:)?\//.test(f) ? f : `/assets/visuels/${String(f).replace(/^\.?\/?(assets\/visuels\/)?/, '')}`;
    t.set(String(id), { ...v, url: adresse(url) });
  }
  return t;
}

export function charger() {
  chargement = medias().then(m => { table = normaliser(m.images); tables.set(unite(),table); besoins = m.besoins || []; return table; });
  return chargement;
}
export async function pret() { return table || chargement || charger(); }
/** URL de l'image, ou null (synchrone : appeler `pret()` avant). */
export function image(id, chapitre=unite()) { return (tables.get(chapitre)|| (chapitre===unite()?table:null))?.get(String(id))?.url || null; }
export async function chargerPour(id) { if(!tables.has(id)) tables.set(id,normaliser((await mediasPour(id)).images)); }
export function infoImage(id) { return table?.get(String(id)) || null; }

export function description(id) { const b = besoins.find(x => (x.id || x.identifiant) === id); return b?.description_fr || b?.sujet || b?.description || b?.prompt || `Illustration ${id} en préparation`; }
export const visuels = { chargerPour, charger, pret, image, infoImage, description };
