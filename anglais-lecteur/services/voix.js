import { adresse, modeLMS } from './base.js';
import { medias, mediasPour } from './unite.js';
// Les voix produites par l'outil de voix (tools/tts), décrites dans /audio/manifest.json.
// L'identifiant d'un fichier est celui du segment de D. Un segment non produit rend null :
// l'appelant affiche son texte et continue, rien ne bloque.
import { jouer as jouerAudio } from './audio.js';
import { segment } from './script.js';

let manifeste = null;
let chargement = null;

export function recharger() {
  chargement = medias().then(m => { manifeste = { segments: m.segments || {} }; return manifeste; });
  return chargement;
}

export async function pret() { return manifeste || chargement || recharger(); }

/** Infos d'un fichier produit : { id, texte, voix, url, duree_s, mots, debit } ou null (synchrone). */
export function info(id) {
  const s = manifeste?.segments?.[id];
  if (!s || s.controle?.statut === 'echec' || !s.fichier) return null;
  return {
    id,
    texte: s.texte,
    voix: s.voix,
    debit: s.debit,
    url: adresse(s.fichier),
    duree_s: s.duree_s,
    mots: Array.isArray(s.mots) ? s.mots : [],
  };
}

/** Joue un fichier produit. Rend 'absent' s'il n'existe pas. */
export async function jouer(id, opts = {}) {
  await pret();
  const i = info(id);
  if (!i) return 'absent';
  return jouerAudio(i.url, { canal: opts.canal || 'media', vitesse: opts.vitesse, surTemps: opts.surTemps, garde: i.duree_s || 0 });
}

/**
 * Joue une « sequence » de D (segments fr / en, ou { ref }) sans blanc entre les segments.
 * surSegment(segment, index) est appelé au début de chacun (pour surligner le sous-titre).
 * Rend 'fin' | 'arret' | 'bloque' | 'erreur'. Un segment non produit est sauté.
 */
export async function jouerSequence(sequence, opts = {}) {
  await pret();
  const liste = Array.isArray(sequence) ? sequence : [sequence];
  for (let i = 0; i < liste.length; i += 1) {
    const brut = liste[i];
    const seg = typeof brut === 'string' ? { id: brut } : brut?.ref ? (await segment(brut)) || { id: brut.ref } : brut;
    if (!seg?.id) continue;
    const inf = info(seg.id);
    if (!inf) continue;
    try { opts.surSegment?.(seg, i); } catch { /* rien */ }
    const r = await jouerAudio(inf.url, { canal: opts.canal || 'media', vitesse: opts.vitesse, surTemps: opts.surTemps, garde: inf.duree_s || 0 });
    if (r !== 'fin') return r;
  }
  return 'fin';
}

export async function chargerPour(id) { const m=await mediasPour(id); manifeste ||= {segments:{}}; Object.assign(manifeste.segments,m.segments||{}); }

export const voix = { chargerPour, info, jouer, jouerSequence, recharger, pret };
