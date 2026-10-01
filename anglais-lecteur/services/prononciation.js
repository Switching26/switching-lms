import { requete as fetch } from './base.js';
// CLIENT DE LA NOTE DE PRONONCIATION — POST /api/prononciation, calculée sur le Mac (whisper).
// Note PAR MOT : le mot a-t-il été reconnu, et avec quelle assurance. Pas une analyse des sons.
const DELAI_MS = 20000;

async function envoyer(chemin, blob, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DELAI_MS);
  const debut = performance.now();
  try {
    const r = await fetch(`${chemin}?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': (blob && blob.type) || 'application/octet-stream' },
      body: blob,
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({ ok: false, code: 'indisponible', message: 'Réponse illisible.' }));
    if (r.status === 503 && j.indisponible) Object.assign(j, { ok: false, code: 'indisponible', message: 'Note indisponible. Vous pouvez vous enregistrer, vous réécouter et vous comparer au modèle.' });
    j.aller_retour_ms = Math.round(performance.now() - debut);
    return j;
  } catch (e) {
    return { ok: false, code: 'indisponible', message: e.name === 'AbortError' ? 'Le serveur met trop de temps à répondre.' : 'Serveur injoignable.' };
  } finally { clearTimeout(t); }
}

/** Note un enregistrement par rapport au texte attendu. */
export function noter(blob, texte, opts = {}) {
  return envoyer('/api/prononciation', blob, { texte, candidats: (opts.candidats || []).join('|') });
}

/** Transcription seule (réponses libres, jeu de rôle, prise de parole). */
export function transcrire(blob, opts = {}) {
  return envoyer('/api/transcription', blob, { candidats: (opts.candidats || []).join('|') });
}

export const prononciation = { noter, transcrire };
