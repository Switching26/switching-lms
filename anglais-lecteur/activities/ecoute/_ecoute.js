// Outils communs aux trois activités d'écoute de B1 (le « _ » : pas une activité).
// Bouton d'écoute avec état, points de progression, bilan de fin, styles partagés.

import { ICONES, echapper, personnage } from '../video/_commun.js';

export const RACINES = ':is(.act-ecoute-ecouter_choisir,.act-ecoute-ecouter_ordonner,.act-ecoute-dictee)';

/** Info de voix d'un segment de D (ou d'une référence), ou null si le son n'a pas été produit. */
export function infoSon(ctx, segment) {
  const id = typeof segment === 'string' ? segment : (segment?.ref || segment?.id);
  if (!id) return null;
  try {
    const i = ctx.services?.voix?.info(id);
    return i && i.url ? i : null;
  } catch { return null; }
}

/**
 * Bouton d'écoute : joue un segment (vitesse 1 ou ralentie), montre l'état (lecture, bloqué, absent).
 * `obtenir()` rend le segment à jouer au moment du clic (l'item courant change).
 */
export function boutonEcoute(ctx, { obtenir, libelle = 'Écouter', vitesse = 1, principal = false, surEcoute, surTemps }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `ec-ecoute${principal ? ' ec-ecoute--principal' : ''}`;
  b.innerHTML = `<span class="ec-ecoute-rond">${vitesse < 1 ? ICONES.lent : ICONES.ecouter}</span><span class="ec-ecoute-texte">${echapper(libelle)}</span>`;
  let jeton = 0;
  async function jouer() {
    const seg = obtenir();
    const info = infoSon(ctx, seg);
    if (!info) { b.classList.add('absent'); b.querySelector('.ec-ecoute-texte').textContent = 'Son indisponible'; return 'absent'; }
    const moi = ++jeton;
    b.classList.add('joue');
    b.setAttribute('aria-pressed', 'true');
    surEcoute?.(info);
    let r;
    try { r = await ctx.services.audio.jouer(info.url, { vitesse, canal: 'media', garde: info.duree_s || 8, surTemps }); } catch { r = 'erreur'; }
    if (moi !== jeton) return r;
    b.classList.remove('joue');
    b.setAttribute('aria-pressed', 'false');
    if (r === 'bloque') { b.classList.add('bloque'); b.querySelector('.ec-ecoute-texte').textContent = 'Toucher pour écouter'; }
    else b.classList.remove('bloque');
    return r;
  }
  b.addEventListener('click', () => { b.classList.remove('bloque'); b.querySelector('.ec-ecoute-texte').textContent = libelle; jouer(); });
  return { element: b, jouer, arreter() { jeton++; b.classList.remove('joue'); } };
}

/** Points de progression « 1 sur n », avec l'état de chaque item (juste du premier coup, aidé, en cours). */
export function pastilles(n, libelle = 'Phrase') {
  const e = document.createElement('div');
  e.className = 'ec-pastilles';
  e.innerHTML = `<span class="ec-pastilles-texte"></span><span class="ec-pastilles-points" aria-hidden="true">${Array.from({ length: n }, () => '<i></i>').join('')}</span>`;
  const points = [...e.querySelectorAll('i')];
  return {
    element: e,
    maj(i, etats = []) {
      e.querySelector('.ec-pastilles-texte').textContent = `${libelle} ${Math.min(i + 1, n)} sur ${n}`;
      points.forEach((p, k) => { p.className = etats[k] || (k === i ? 'en-cours' : ''); });
    },
  };
}

/** Carte de fin d'activité : score du premier coup, détail, bouton recommencer. */
export function carteFin({ titre, sousTitre, lignes = [], surRecommencer, libelleRecommencer = 'Recommencer' }) {
  const e = document.createElement('section');
  e.className = 'ec-fin carte apparait';
  e.innerHTML = `
    <p class="ec-sur">Activité terminée</p>
    <h3 class="ec-fin-titre">${echapper(titre)}</h3>
    ${sousTitre ? `<p class="petit discret">${echapper(sousTitre)}</p>` : ''}
    ${lignes.length ? `<ol class="ec-fin-liste">${lignes.map((l) => `<li class="${l.ok ? 'ec-ok' : 'ec-aide-vue'}"><span class="ec-fin-marque">${l.ok ? ICONES.coche : ICONES.rejouer}</span><span><span lang="en" class="ec-fin-en">${l.html || echapper(l.en)}</span>${l.detail ? `<span class="ec-fin-detail">${echapper(l.detail)}</span>` : ''}</span></li>`).join('')}</ol>` : ''}
    <div class="ec-fin-actions"><button type="button" class="btn btn-secondaire" data-recommencer>${ICONES.rejouer}<span>${echapper(libelleRecommencer)}</span></button></div>`;
  e.querySelector('[data-recommencer]').addEventListener('click', () => surRecommencer?.());
  return e;
}

/** Vignette d'une option : portrait, scène recadrée (S06 → moitié gauche pour « Helen et Rob »), sinon rien. */
export function vignette(ctx, idImage, texte) {
  if (!idImage) return '';
  let url = null;
  try { url = ctx.image?.(idImage) || null; } catch { url = null; }
  if (!url) return '';
  // S06 montre les quatre collègues : pour « Helen et Rob », un recadrage exact de la moitié gauche
  // de la photo (fichier dérivé rangé dans le dossier de B1, l'original de V n'est pas touché).
  if (idImage === 'S06' && /helen/i.test(texte) && /rob/i.test(texte)) {
    url = ctx.asset ? ctx.asset('activities/ecoute/images/S06-helen-rob.jpg') : '/activities/ecoute/images/S06-helen-rob.jpg';
  }
  return `<span class="ec-vignette"><img src="${echapper(url)}" alt="" loading="lazy" style="object-position:50% 30%"></span>`;
}

export function nomPersonnage(id) { return personnage(id); }

export const CSS_ECOUTE = `
${RACINES} { --ec-ecart: 14px; }
${RACINES} .ec-carte { padding: 18px; display: grid; gap: var(--ec-ecart); }
${RACINES} .ec-sur { font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--c-ecouter); }
${RACINES} .ec-pastilles { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
${RACINES} .ec-pastilles-texte { font-size: .8125rem; font-weight: 700; color: var(--encre-50); letter-spacing: .02em; }
${RACINES} .ec-pastilles-points { display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
${RACINES} .ec-pastilles-points i { width: 10px; height: 10px; border-radius: 999px; background: var(--filet); display: block; transition: background-color .2s; }
${RACINES} .ec-pastilles-points i.en-cours { background: var(--c-ecouter); box-shadow: 0 0 0 3px var(--c-ecouter-voile); }
${RACINES} .ec-pastilles-points i.ok { background: var(--c-ecouter); }
${RACINES} .ec-pastilles-points i.aide { background: var(--encre-30); }
${RACINES} .ec-ecoutes { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
${RACINES} .ec-ecoute { display: inline-flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 16px 6px 6px; border-radius: 999px; border: 1px solid var(--filet); background: var(--surface); color: var(--encre); font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation; transition: border-color .15s, background-color .15s, transform .2s var(--ressort); }
${RACINES} .ec-ecoute:hover { border-color: var(--c-ecouter); }
${RACINES} .ec-ecoute:active { transform: scale(.98); }
${RACINES} .ec-ecoute-rond { width: 40px; height: 40px; border-radius: 999px; display: grid; place-items: center; background: var(--c-ecouter-voile); color: var(--c-ecouter); flex: none; }
${RACINES} .ec-ecoute-rond svg { width: 22px; height: 22px; }
${RACINES} .ec-ecoute--principal { min-height: 60px; padding-right: 22px; font-size: 1.02rem; }
${RACINES} .ec-ecoute--principal .ec-ecoute-rond { width: 48px; height: 48px; background: var(--c-ecouter); color: #fff; }
${RACINES} .ec-ecoute.joue .ec-ecoute-rond { box-shadow: 0 0 0 5px var(--c-ecouter-voile); }
${RACINES} .ec-ecoute.bloque { border-color: var(--c-ecouter); background: var(--c-ecouter-voile); }
${RACINES} .ec-ecoute.absent { opacity: .6; cursor: default; }
${RACINES} .ec-question { font-family: var(--police-titre); font-weight: 600; font-size: clamp(1.15rem, 1rem + .6vw, 1.4rem); line-height: 1.25; }
${RACINES} .ec-vignette { width: 56px; height: 56px; border-radius: 12px; overflow: hidden; flex: none; background: var(--filet); }
${RACINES} .ec-vignette img { width: 100%; height: 100%; object-fit: cover; }
${RACINES} .ec-texte-en { font-size: 1.15rem; font-weight: 600; line-height: 1.5; }
${RACINES} .ec-be { background: var(--marque-voile); color: var(--marque-tres-fonce); border-radius: 4px; padding: 0 3px; }
${RACINES} .ec-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
${RACINES} .ec-retour:empty, ${RACINES} .ec-aide:empty { display: none; }
${RACINES} .ec-retour, ${RACINES} .ec-actions, ${RACINES} .ec-aide { scroll-margin-bottom: 96px; }
${RACINES} .ec-fin { padding: 18px; display: grid; gap: 8px; }
${RACINES} .ec-fin-titre { font-family: var(--police-titre); font-weight: 600; font-size: clamp(1.15rem, 1rem + .6vw, 1.4rem); }
${RACINES} .ec-fin-liste { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; }
${RACINES} .ec-fin-liste li { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-top: 1px solid var(--filet); }
${RACINES} .ec-fin-marque { width: 22px; height: 22px; flex: none; color: var(--encre-50); }
${RACINES} .ec-fin-liste li.ec-ok .ec-fin-marque { color: var(--juste); }
${RACINES} .ec-fin-marque svg { width: 20px; height: 20px; }
${RACINES} .ec-fin-en { display: block; font-weight: 600; }
${RACINES} .ec-fin-detail { display: block; font-size: .875rem; color: var(--encre-70); margin-top: 2px; }
${RACINES} .ec-fin-actions { display: flex; justify-content: flex-end; margin-top: 6px; }
`;
