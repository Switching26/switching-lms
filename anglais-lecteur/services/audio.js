import { requete as fetch } from './base.js';
// LE LECTEUR AUDIO DU PROTOTYPE — tous les sons passent par ici.
//
// Deux canaux, un élément <audio> chacun, réutilisé d'un son à l'autre :
//   · `media` : les sons de l'activité (voix anglaises, écoutes, modèles) ;
//   · `guide` : la voix française du LMS.
// Règle de notre LMS : ils ne se superposent JAMAIS. Jouer sur `media` coupe le guide ; le guide ne
// démarre pas pendant un `media`.
//
// ⚠️ iPhone : Safari refuse tout son qui ne suit pas un geste de l'apprenant (`NotAllowedError`, sans
// bruit ni erreur visible). Au premier geste, n'importe lequel, on joue un silence sur les deux
// éléments : ils restent débloqués pour la suite. Si un son est quand même refusé, `jouer` rend
// 'bloque' : l'appelant affiche un bouton « Écouter », dont le clic est le geste manquant.
//
// Lecture lente : `playbackRate` avec `preservesPitch` — la voix ralentit sans devenir grave.

import { reprendreContexte } from './contexte-audio.js';

const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

function creerCanal(nom) {
  const el = new Audio();
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  el.setAttribute('data-canal', nom);
  el.preservesPitch = true;
  el.webkitPreservesPitch = true;
  el.mozPreservesPitch = true;
  return { nom, el, jeton: 0, fin: null, url: null };
}

const canaux = { media: creerCanal('media'), guide: creerCanal('guide') };
const abonnes = new Set();
const blobs = new Map(); // url d'origine → url blob préchargée
let debloque = false;

function notifier() {
  const etat = { media: enLecture('media'), guide: enLecture('guide'), debloque };
  for (const f of abonnes) { try { f(etat); } catch { /* un abonné fautif ne casse pas les autres */ } }
}

/** À appeler PENDANT un geste de l'apprenant. Sans effet après le premier succès. */
export function debloquer() {
  reprendreContexte();
  if (debloque) return;
  let reussi = 0;
  for (const c of Object.values(canaux)) {
    if (c.fin) continue; // déjà en lecture : il est donc débloqué
    const el = c.el;
    el.src = SILENCE;
    const p = el.play();
    if (p && p.then) p.then(() => { reussi += 1; if (!c.fin) el.pause(); if (reussi >= 1) { debloque = true; notifier(); } }).catch(() => {});
  }
}

// Le premier geste de la page, quel qu'il soit, débloque le son.
for (const ev of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(ev, () => debloquer(), { capture: true, passive: true });
}

export function estDebloque() { return debloque; }

export function enLecture(nom) {
  if (!nom) return Boolean(canaux.media.fin || canaux.guide.fin);
  return Boolean(canaux[nom]?.fin);
}

function terminer(c, valeur) {
  const fin = c.fin;
  if (!fin) return;
  c.fin = null;
  fin.nettoyer();
  fin.resoudre(valeur);
  notifier();
}

/**
 * Joue `url` sur un canal. Rend une promesse résolue par :
 * 'fin' (joué jusqu'au bout) · 'arret' (interrompu) · 'bloque' (refus du navigateur) · 'erreur'.
 * opts : { canal: 'media' | 'guide', vitesse: 0.5..1, surTemps: (secondes) => {} , depuis: secondes,
 *          garde: secondes }
 *
 * ⚠️ `garde` : durée au-delà de laquelle le son est considéré comme fini, même si le navigateur n'a
 * jamais signalé la fin (pas de sortie son, flux bloqué, onglet en veille). Règle de notre LMS : une
 * animation n'attend JAMAIS la voix indéfiniment. `voix.jouer` la calcule seul depuis le manifeste.
 */
export function jouer(url, opts = {}) {
  const nom = opts.canal === 'guide' ? 'guide' : 'media';
  if (!url) return Promise.resolve('erreur');
  if (nom === 'media') arreter('guide');
  else if (enLecture('media')) return Promise.resolve('arret');
  const c = canaux[nom];
  terminer(c, 'arret');
  const jeton = ++c.jeton;
  const el = c.el;
  const vitesse = Math.min(1.5, Math.max(0.5, Number(opts.vitesse) || 1));

  return new Promise((resoudre) => {
    let raf = 0;
    const surFin = () => { if (c.jeton === jeton) terminer(c, 'fin'); };
    const surErreur = () => { if (c.jeton === jeton && el.src !== SILENCE) terminer(c, 'erreur'); };
    const surMeta = () => { el.playbackRate = vitesse; };
    const boucle = () => {
      if (c.jeton !== jeton || !c.fin) return;
      try { opts.surTemps?.(el.currentTime); } catch { /* rien */ }
      raf = requestAnimationFrame(boucle);
    };
    let minuteurGarde = 0;
    if (opts.garde > 0) {
      minuteurGarde = setTimeout(() => {
        if (c.jeton !== jeton || !c.fin) return;
        try { el.pause(); } catch { /* rien */ }
        terminer(c, 'fin');
      }, (opts.garde / vitesse + 2) * 1000);
    }
    c.fin = {
      resoudre,
      nettoyer() {
        clearTimeout(minuteurGarde);
        el.removeEventListener('ended', surFin);
        el.removeEventListener('error', surErreur);
        el.removeEventListener('loadedmetadata', surMeta);
        cancelAnimationFrame(raf);
      },
    };
    el.addEventListener('ended', surFin);
    el.addEventListener('error', surErreur);
    el.addEventListener('loadedmetadata', surMeta);
    c.url = url;
    el.src = blobs.get(url) || url;
    el.defaultPlaybackRate = vitesse;
    el.playbackRate = vitesse;
    if (opts.depuis > 0) { try { el.currentTime = opts.depuis; } catch { /* avant métadonnées */ } }
    notifier();
    const p = el.play();
    if (p && p.then) {
      p.then(() => {
        if (c.jeton !== jeton) return;
        debloque = true;
        el.playbackRate = vitesse;
        if (opts.surTemps) raf = requestAnimationFrame(boucle);
      }).catch((e) => {
        if (c.jeton !== jeton) return;
        terminer(c, e && e.name === 'NotAllowedError' ? 'bloque' : e && e.name === 'AbortError' ? 'arret' : 'erreur');
      });
    }
  });
}

/** Coupe un canal, ou tout. */
export function arreter(nom) {
  const liste = nom ? [canaux[nom]].filter(Boolean) : Object.values(canaux);
  for (const c of liste) {
    c.jeton += 1;
    try { c.el.pause(); } catch { /* rien */ }
    terminer(c, 'arret');
  }
}

/** Temps courant d'un canal (secondes), pour synchroniser des sous-titres. */
export function temps(nom = 'media') { return canaux[nom]?.el.currentTime || 0; }

/** Précharge des fichiers en mémoire : la lecture démarre ensuite sans attente réseau. */
export async function precharger(urls) {
  const liste = (Array.isArray(urls) ? urls : [urls]).filter((u) => u && !blobs.has(u));
  await Promise.allSettled(liste.map(async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`${u} : ${r.status}`);
    const b = await r.blob();
    blobs.set(u, URL.createObjectURL(b));
  }));
}

/** Abonnement aux changements d'état ({ media, guide, debloque }). Rend la fonction de désabonnement. */
export function surChangement(f) { abonnes.add(f); return () => abonnes.delete(f); }

export const audio = { jouer, arreter, precharger, enLecture, temps, debloquer, estDebloque, surChangement };
