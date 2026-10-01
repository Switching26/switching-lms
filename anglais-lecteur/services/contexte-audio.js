// Un seul AudioContext pour tout le prototype (sons d'interface, vumètre du micro).
// Sur iPhone il naît « suspendu » : il faut le reprendre pendant un geste de l'apprenant.
let ctx = null;
export function contexteAudio() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch { return null; }
  }
  return ctx;
}
/** Reprend le contexte s'il existe déjà (on ne le crée qu'au premier besoin réel : sons, vumètre). */
export function reprendreContexte(creer = false) {
  const c = creer ? contexteAudio() : ctx;
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
