// SONS D'INTERFACE — synthétisés à la volée, très discrets, coupés en même temps que le guide.
import { contexteAudio } from './contexte-audio.js';
import { estCoupe } from './guide.js';

const MOTIFS = {
  juste: [[659.3, 0, 0.09], [880, 0.08, 0.14]],
  faux: [[311.1, 0, 0.12], [277.2, 0.1, 0.16]],
  clic: [[1800, 0, 0.018]],
  fin: [[523.3, 0, 0.12], [659.3, 0.1, 0.12], [784, 0.2, 0.22]],
};

export function jouer(nom) {
  if (estCoupe()) return;
  const motif = MOTIFS[nom];
  const ctx = contexteAudio();
  if (!motif || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + 0.01;
  for (const [f, d, duree] of motif) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const vol = nom === 'clic' ? 0.025 : 0.05;
    g.gain.setValueAtTime(0, t0 + d);
    g.gain.linearRampToValueAtTime(vol, t0 + d + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + duree);
    o.connect(g).connect(ctx.destination);
    o.start(t0 + d);
    o.stop(t0 + d + duree + 0.02);
  }
}

export const sons = { jouer };
