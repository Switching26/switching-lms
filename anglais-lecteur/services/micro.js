// L'ENREGISTREUR MICRO. Le micro n'existe que sur une page sécurisée (HTTPS ou localhost) : c'est
// pourquoi le prototype est servi en HTTPS par Tailscale. 15 secondes par défaut ; jusqu’à 120 secondes sur demande explicite.
import { contexteAudio, reprendreContexte } from './contexte-audio.js';

let flux = null;
const urls = new Set();
const enCours = new Set();

export function disponible() {
  if (!window.isSecureContext) return { ok: false, raison: 'non-securise' };
  if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== 'function') return { ok: false, raison: 'non-supporte' };
  return { ok: true };
}

function erreur(code, message) { return Object.assign(new Error(message), { code }); }

/** Demande l'autorisation (à appeler depuis un clic). Rejette avec e.code. */
export async function ouvrir() {
  const d = disponible();
  if (!d.ok) throw erreur(d.raison, 'Micro indisponible sur cette page.');
  if (flux && flux.getAudioTracks().some((t) => t.readyState === 'live')) return;
  reprendreContexte(true);
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') throw erreur('refuse', 'Accès au micro refusé.');
    if (n === 'NotFoundError' || n === 'OverconstrainedError') throw erreur('absent', 'Aucun micro trouvé.');
    if (n === 'NotReadableError' || n === 'AbortError') throw erreur('occupe', 'Le micro est utilisé par une autre application.');
    throw erreur('inconnu', 'Le micro ne répond pas.');
  }
}

function choisirFormat() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || '';
}

/**
 * Démarre un enregistrement. Rend { arreter(): Promise<{ blob, type, duree_s, url }>, annuler(), fin }.
 * opts : { dureeMax = 15000 (ms), surNiveau(v 0..1) }
 */
export function enregistrer(opts = {}) {
  if (!flux) throw erreur('ferme', 'Appeler micro.ouvrir() avant enregistrer().');
  const dureeMax = Math.min(120000, Math.max(500, opts.dureeMax || 15000));
  const format = choisirFormat();
  const rec = new MediaRecorder(flux, format ? { mimeType: format } : undefined);
  const morceaux = [];
  const debut = performance.now();
  let annule = false;
  let raf = 0;
  let source = null;

  // Vumètre : niveau RMS lu à chaque image, sans rien enregistrer de plus.
  const actx = opts.surNiveau ? contexteAudio() : null;
  if (actx) {
    try {
      source = actx.createMediaStreamSource(flux);
      const an = actx.createAnalyser();
      an.fftSize = 512;
      source.connect(an);
      const buf = new Float32Array(an.fftSize);
      const boucle = () => {
        an.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i += 1) s += buf[i] * buf[i];
        const rms = Math.sqrt(s / buf.length);
        try { opts.surNiveau(Math.min(1, rms * 6)); } catch { /* rien */ }
        raf = requestAnimationFrame(boucle);
      };
      raf = requestAnimationFrame(boucle);
    } catch { /* vumètre facultatif */ }
  }

  let resoudre;
  const fin = new Promise((r) => { resoudre = r; });
  rec.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.push(e.data); };
  rec.onstop = () => {
    cancelAnimationFrame(raf);
    try { source?.disconnect(); } catch { /* rien */ }
    clearTimeout(minuteur);
    enCours.delete(controle);
    if (annule) { resoudre(null); return; }
    const blob = new Blob(morceaux, { type: rec.mimeType || format || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    urls.add(url);
    resoudre({ blob, type: blob.type, duree_s: Math.round((performance.now() - debut) / 100) / 10, url });
  };
  rec.onerror = () => { annule = true; if (rec.state !== 'inactive') rec.stop(); else resoudre(null); };
  rec.start(200);
  const minuteur = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, dureeMax);
  const controle = {
    fin,
    arreter() { if (rec.state !== 'inactive') rec.stop(); return fin; },
    annuler() { annule = true; if (rec.state !== 'inactive') rec.stop(); },
  };
  enCours.add(controle);
  return controle;
}

/** Coupe le micro (le témoin rouge du téléphone s'éteint) et libère les enregistrements. */
export function fermer() {
  for (const c of enCours) c.annuler();
  if (flux) { for (const t of flux.getTracks()) t.stop(); flux = null; }
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}

export const micro = { disponible, ouvrir, enregistrer, fermer };
