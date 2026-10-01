// activities/jeux/memory.js — JEU-2 « Memory : le son et l'image » (script/jeux.json de D, étape de type « memory »).
//
// 12 cartes au dos commun : 6 cartes son (la carte retournée fait entendre sa phrase, sans texte) et 6 cartes
// image. Une paire trouvée reste visible et la carte son affiche alors la phrase écrite et sa traduction ;
// une paire ratée se retourne après 1,2 s (ou dès que l'apprenant touche une autre carte).
// Piège voulu par D : office et desk se disent tous deux « bureau » — il faut écouter, pas traduire.
// Une erreur n'est comptée comme telle que si l'apprenant associe VOLONTAIREMENT un son et une image qu'il
// connaissait déjà tous les deux : retourner une carte encore jamais vue, c'est explorer, pas se tromper.
// Barème de D : 3 étoiles en 14 coups ou moins, 2 jusqu'à 20, 1 au-delà. Non noté dans le bilan.
// Tests (banc d'essai seulement) : #/etape/JEU-2?banc=1&graine=3 — les cartes y portent data-paire.

import {
  el, icone, creerHasard, melanger, parametres, creerMinuteries, mouvementReduit, pointeurFin,
  retours, son, accueilJeu, pastille, etoiles, listeErreurs, voixInfo, jouerVoix, prechargerVoix, prechargerImages, cssJeux,
} from './_jeux.js';

export const meta = { titre: 'Memory son-image', entete: false };
const P = '.act-jeux-memory';

function lireBareme(etape) {
  const t = String(etape.bareme?.etoiles || '');
  const trois = Number(t.match(/3\s*étoiles?\s*en\s*(\d+)/i)?.[1]) || 14;
  const deux = Number(t.match(/2\s*étoiles?\s*jusqu.{1,3}\s*(\d+)/i)?.[1]) || 20;
  const retour = Number(String(etape.regles?.paire_ratee || '').match(/(\d+(?:[.,]\d+)?)\s*seconde/)?.[1]?.replace(',', '.')) || 1.2;
  return { trois, deux, retourMs: Math.round(retour * 1000) };
}
const etoilesPour = (coups, b) => (coups <= b.trois ? 3 : coups <= b.deux ? 2 : 1);

export async function monter(racine, ctx) {
  ctx.ajouterStyle(cssJeux(P) + css(P));
  let etape = ctx.donnees;
  if (!etape?.paires) {
    try { etape = ((await ctx.script('jeux.json'))?.etapes || []).find((x) => x.type === 'memory') || null; } catch { etape = null; }
  }
  const paires = (etape?.paires || []).filter((p) => p?.id && p.audio?.id && p.image);
  if (paires.length < 2) {
    racine.replaceChildren(el('div', { class: 'carte', style: { padding: '20px' } }, el('p', { texte: 'Le contenu du memory est en préparation.' })));
    ctx.signaler.pret();
    return { demonter() {} };
  }

  const R = retours(ctx);
  const m = creerMinuteries(ctx.signal);
  const params = parametres(ctx);
  const bareme = lireBareme(etape);
  const banc = ctx.mode === 'banc';
  const audio = ctx.services.audio;
  const image = (id) => { try { return ctx.image(id); } catch { return null; } };
  await Promise.resolve(ctx.services.visuels?.pret?.()).catch(() => null);
  await Promise.resolve(ctx.services.voix?.pret?.()).catch(() => null);

  // Préchargement pendant la lecture de l'accueil : sons en mémoire, images décodées.
  prechargerVoix(ctx, paires.map((p) => p.audio.id));
  prechargerImages(paires.map((p) => image(p.image)));

  const S = { phase: 'accueil', parties: 0 };
  const cadre = el('div', { class: 'j-cadre' });
  racine.replaceChildren(cadre);

  /* ── Accueil ────────────────────────────────────────────────────────────── */
  function afficherAccueil() {
    S.phase = 'accueil';
    const meilleur = ctx.stockage.lire('meilleur', null);
    const pastilles = [
      pastille(ctx, 'melanger', `${paires.length} paires, ${paires.length * 2} cartes`),
      pastille(ctx, 'etoilePleine', `3 étoiles en ${bareme.trois} coups ou moins`),
      pastille(ctx, 'rejouer', meilleur == null ? 'Première partie' : `Meilleur résultat : ${meilleur} coups`, meilleur == null ? '' : 'forte'),
    ];
    const deux = el('div', { class: 'j-types' },
      el('div', { class: 'j-type' }, el('span', { class: 'j-type-carte j-type-son', html: icone(ctx, 'ecouter') }),
        el('span', {}, el('b', { texte: 'Carte son' }), el('span', { class: 'petit discret', texte: 'Elle fait entendre une phrase, sans texte.' }))),
      el('div', { class: 'j-type' }, el('span', { class: 'j-type-carte j-type-image' }, el('img', { src: image(paires[0].image) || '', alt: '' })),
        el('span', {}, el('b', { texte: 'Carte image' }), el('span', { class: 'petit discret', texte: 'Elle montre une photo.' }))));
    const { element, bouton } = accueilJeu(ctx, etape, { pastilles, corps: deux, bouton: 'Retourner les cartes', surCommencer: () => lancer() });
    cadre.replaceChildren(element);
    ctx.signaler.progression(0);
    return bouton;
  }

  /* ── Le plateau ─────────────────────────────────────────────────────────── */
  let Q = {};
  function lancer() {
    const hasard = creerHasard(params.graine === undefined ? undefined : `${params.graine}-${S.parties}`);
    S.parties += 1;
    audio.arreter('media');
    m.toutArreter();
    const cartes = melanger(paires.flatMap((p) => [{ paire: p, type: 'son' }, { paire: p, type: 'image' }]), hasard)
      .map((c, i) => ({ ...c, i, vue: false, trouvee: false, noeud: null }));
    Object.assign(S, { phase: 'jeu', cartes, ouvertes: [], connues: [], trouvees: 0, coups: 0, erreurs: [], ratees: new Set(), attente: 0, finAudio: 0, joue: null });

    Q.paires = el('b', { texte: '0' });
    Q.coups = el('b', { texte: '0' });
    Q.cible = el('span', { class: 'j-cible' });
    const barre = el('div', { class: 'j-barre' },
      el('span', { class: 'j-compteur' }, el('span', { class: 'j-compteur-lib', texte: 'Paires' }), Q.paires, el('span', { class: 'j-sur', texte: `sur ${paires.length}` })),
      el('span', { class: 'j-compteur' }, el('span', { class: 'j-compteur-lib', texte: 'Coups' }), Q.coups),
      Q.cible);
    Q.grille = el('div', { class: 'j-grille', role: 'group', 'aria-label': `Plateau de ${cartes.length} cartes` });
    for (const c of cartes) Q.grille.append(creerCarte(c));
    Q.note = el('div', { class: 'j-note', 'aria-live': 'polite' });
    cadre.replaceChildren(el('div', { class: 'j-plateau apparait' }, barre, Q.grille, Q.note));
    majCible();
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { /* rien */ }
    cartes[0].noeud.focus({ preventScroll: true });
  }

  function creerCarte(c) {
    const b = el('button', { type: 'button', class: `j-carte j-carte-${c.type}`, 'aria-label': `Carte ${c.i + 1}, face cachée` });
    if (banc) { b.dataset.paire = c.paire.id; b.dataset.type = c.type; }
    const dos = el('span', { class: 'j-face j-dos', 'aria-hidden': 'true' }, el('span', { class: 'j-dos-sceau', texte: 'W&H' }));
    let recto;
    if (c.type === 'son') {
      const sansVoix = !voixInfo(ctx, c.paire.audio.id);
      recto = el('span', { class: 'j-face j-recto j-recto-son' },
        el('span', { class: 'j-hp', html: icone(ctx, 'ecouter') }),
        el('span', { class: 'j-mini-hp', 'aria-hidden': 'true', html: icone(ctx, 'ecouter') }),
        el('span', { class: 'j-ondes', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i')),
        el('span', { class: 'j-son-texte', lang: 'en', texte: c.paire.audio.texte }),
        el('span', { class: 'j-son-sens', texte: c.paire.sens || '' }),
        el('span', { class: 'j-son-bloque', texte: 'Touchez pour écouter' }));
      if (sansVoix) b.classList.add('sans-voix');
    } else {
      recto = el('span', { class: 'j-face j-recto j-recto-image' }, el('img', { alt: '', decoding: 'async', draggable: 'false' }));
    }
    const coche = el('span', { class: 'j-coche', 'aria-hidden': 'true', html: icone(ctx, 'coche') });
    b.append(el('span', { class: 'j-carte-in' }, dos, recto), coche);
    b.addEventListener('click', () => toucher(c));
    c.noeud = b;
    return b;
  }

  function libelle(c) {
    if (!c.noeud) return;
    const ouverte = c.trouvee || S.ouvertes.includes(c);
    let l = `Carte ${c.i + 1}, face cachée`;
    if (ouverte && c.type === 'son') l = c.trouvee ? `Carte son, paire trouvée : ${c.paire.audio.texte} (${c.paire.sens}). Touchez pour réécouter.` : 'Carte son : touchez pour réécouter la phrase';
    if (ouverte && c.type === 'image') l = c.trouvee ? `Carte image, paire trouvée : ${c.paire.sens}` : `Carte image : ${c.paire.sens}`;
    c.noeud.setAttribute('aria-label', l);
  }

  async function ecouter(c) {
    if (c.type !== 'son') return;
    const info = voixInfo(ctx, c.paire.audio.id);
    if (!info) return;
    S.joue = c;
    S.finAudio = performance.now() + (info.duree_s || 1.5) * 1000;
    c.noeud.classList.add('joue');
    c.noeud.classList.remove('bloque');
    const r = await jouerVoix(ctx, c.paire.audio.id);
    if (ctx.signal.aborted) return;
    c.noeud.classList.remove('joue');
    if (r === 'bloque') c.noeud.classList.add('bloque');
    if (S.joue === c) S.joue = null;
  }

  function toucher(c) {
    if (S.phase !== 'jeu') return;
    if (c.trouvee || S.ouvertes.includes(c)) { ecouter(c); return; }
    if (S.ouvertes.length === 2) refermer();          // joueur rapide : une 3e carte referme la paire ratée
    S.connues.push(c.vue);
    c.vue = true;
    S.ouvertes.push(c);
    if (c.type === 'image') {
      const img = c.noeud.querySelector('img');
      if (img && !img.getAttribute('src')) img.src = image(c.paire.image) || '';
    }
    c.noeud.classList.add('ouverte');
    libelle(c);
    son(ctx, 'clic');
    if (c.type === 'son') ecouter(c);
    if (S.ouvertes.length === 2) evaluerPaire();
  }

  function evaluerPaire() {
    const [a, b] = S.ouvertes;
    const [connueA, connueB] = S.connues;
    S.coups += 1;
    Q.coups.textContent = String(S.coups);
    majCible();
    if (a.paire.id === b.paire.id && a.type !== b.type) {
      a.trouvee = b.trouvee = true;
      S.trouvees += 1;
      S.ouvertes = []; S.connues = [];
      for (const c of [a, b]) { c.noeud.classList.add('trouvee'); libelle(c); }
      Q.paires.textContent = String(S.trouvees);
      const sonC = a.type === 'son' ? a : b;
      Q.note.replaceChildren(R.juste(`« ${sonC.paire.audio.texte} » : ${sonC.paire.sens}`));
      son(ctx, 'juste');
      try {
        ctx.signaler.essai({ juste: true, item: a.paire.id, element: sonC.paire.audio.texte, attendu: sonC.paire.sens, premier_essai: !S.ratees.has(a.paire.id) });
      } catch { /* rien */ }
      ctx.signaler.progression(S.trouvees / paires.length);
      if (S.trouvees === paires.length) { S.phase = 'fin'; m.apres(900, finir); }
      return;
    }
    // Paire ratée. Erreur de compréhension seulement si les deux cartes, un son et une image, étaient déjà connues.
    if (a.type !== b.type && connueA && connueB) {
      const s = a.type === 'son' ? a : b;
      const im = a.type === 'image' ? a : b;
      const bureau = /bureau/i.test(s.paire.sens || '') && /bureau/i.test(im.paire.sens || '');
      const explication = `« ${s.paire.audio.texte} » : ${s.paire.sens}. Cette photo, c'est « ${im.paire.audio.texte} » : ${im.paire.sens}.`
        + (bureau ? ' Office et desk se disent tous deux « bureau » en français : fiez-vous au son, pas à la traduction.' : '');
      S.erreurs.push({ element: s.paire.audio.texte, donne: im.paire.sens, attendu: s.paire.sens, explication });
      const premier = !S.ratees.has(s.paire.id);
      S.ratees.add(s.paire.id);
      Q.note.replaceChildren(R.faux(explication));
      son(ctx, 'faux');
      try {
        ctx.signaler.essai({ juste: false, item: s.paire.id, element: s.paire.audio.texte, attendu: s.paire.sens, donne: im.paire.sens, explication, premier_essai: premier });
      } catch { /* rien */ }
    } else {
      Q.note.replaceChildren();
    }
    const delai = Math.min(3500, Math.max(bareme.retourMs, S.finAudio - performance.now() + 250));
    S.attente = m.apres(delai, refermer);
  }

  function refermer() {
    m.annuler(S.attente);
    S.attente = 0;
    for (const c of S.ouvertes) {
      if (c.trouvee) continue;
      c.noeud.classList.remove('ouverte', 'joue', 'bloque');
      if (S.joue === c) { audio.arreter('media'); S.joue = null; }
    }
    const fermees = S.ouvertes;
    S.ouvertes = []; S.connues = [];
    for (const c of fermees) libelle(c);
  }

  function majCible() {
    const n = etoilesPour(S.coups, bareme);
    const texte = n === 3 ? `3 étoiles jusqu'à ${bareme.trois} coups` : n === 2 ? `2 étoiles jusqu'à ${bareme.deux} coups` : '1 étoile';
    Q.cible.replaceChildren(etoiles(ctx, n), el('span', { class: 'j-cible-texte', texte }));
  }

  /* ── Fin de partie ──────────────────────────────────────────────────────── */
  function finir() {
    if (ctx.signal.aborted) return;
    S.phase = 'fin';
    son(ctx, 'fin');
    const n = etoilesPour(S.coups, bareme);
    const ancien = ctx.stockage.lire('meilleur', null);
    const nouveau = ancien == null || S.coups < ancien;
    if (nouveau) ctx.stockage.ecrire('meilleur', S.coups);
    try { ctx.tracer('jeu_termine', { jeu: 'memory', coups: S.coups, etoiles: n, erreurs: S.erreurs.length }); } catch { /* rien */ }
    try { ctx.signaler.fin({ score: Math.round((n / 3) * 100) / 100, reussi: true }); } catch { /* rien */ }
    ctx.signaler.progression(1);

    const carte = el('section', { class: 'carte j-fin apparait' });
    carte.append(el('p', { class: 'j-surtitre', texte: 'Memory terminé' }));
    carte.append(el('h2', { class: 'j-titre-fin', texte: 'Toutes les paires sont trouvées' }));
    carte.append(el('div', { class: 'j-fin-etoiles' }, etoiles(ctx, n, 3, { taille: 'grandes' }),
      el('span', { class: 'j-fin-coups' }, el('b', { texte: String(S.coups) }), ' coups')));
    if (ancien != null && nouveau) carte.append(pastille(ctx, 'etoilePleine', `Nouveau meilleur résultat · avant : ${ancien} coups`, 'forte'));
    else if (ancien != null) carte.append(pastille(ctx, 'rejouer', `Meilleur résultat : ${ancien} coups`));
    carte.append(el('p', { class: 'petit discret', texte: `Barème : ${etape.bareme?.etoiles || ''}.` }));

    if (S.erreurs.length) carte.append(listeErreurs(S.erreurs.filter((e, i, t) => t.findIndex((x) => x.explication === e.explication) === i)));
    const bureaux = paires.filter((p) => /bureau/i.test(p.sens || ''));
    if (bureaux.length === 2 && !S.erreurs.some((e) => /« bureau »/.test(e.explication))) {
      carte.append(R.info(`Office et desk se disent tous deux « bureau » en français. « ${bureaux[0].audio.texte} » : ${bureaux[0].sens}. « ${bureaux[1].audio.texte} » : ${bureaux[1].sens}.`));
    }
    const liste = el('ul', { class: 'j-paires' });
    for (const p of paires) liste.append(lignePaire(p));
    carte.append(el('div', { class: 'j-paires-bloc' }, el('h3', { texte: `Les ${paires.length} paires : touchez la photo pour réécouter` }), liste));

    const rejouer = el('button', { type: 'button', class: 'btn btn-primaire' });
    rejouer.innerHTML = `${icone(ctx, 'rejouer')}<span>Rejouer avec de nouvelles places</span>`;
    rejouer.addEventListener('click', () => lancer());
    carte.append(el('div', { class: 'j-actions' }, rejouer));
    cadre.replaceChildren(carte);
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { /* rien */ }
    rejouer.focus({ preventScroll: true });
    R.annoncer(`Toutes les paires sont trouvées en ${S.coups} coups : ${n} étoile${n > 1 ? 's' : ''} sur 3.`);
  }

  function lignePaire(p) {
    const li = el('li', { class: 'j-paire' });
    const src = image(p.image);
    const vignette = src ? el('img', { src, alt: '', loading: 'lazy' }) : null;
    if (voixInfo(ctx, p.audio.id)) {
      const e = el('button', { type: 'button', class: 'j-paire-img', 'aria-label': `Écouter « ${p.audio.texte} »` }, vignette,
        el('span', { class: 'j-paire-hp', 'aria-hidden': 'true', html: icone(ctx, 'ecouter') }));
      e.addEventListener('click', async () => { e.classList.add('joue'); await jouerVoix(ctx, p.audio.id); e.classList.remove('joue'); });
      li.append(e);
    } else {
      li.append(el('span', { class: 'j-paire-img' }, vignette));
    }
    li.append(el('span', { class: 'j-paire-texte' }, el('b', { lang: 'en', texte: p.audio.texte }), el('span', { class: 'discret', texte: p.sens || '' })));
    const actions = el('span', { class: 'j-paire-actions' });
    const carnet = ctx.services.carnet;
    const k = el('button', { type: 'button', class: 'btn btn-secondaire j-carnet' });
    const majK = () => {
      const dedans = Boolean(carnet?.contient?.(p.audio.texte));
      k.disabled = dedans || !carnet;
      k.innerHTML = `${icone(ctx, dedans ? 'coche' : 'plus')}<span>${dedans ? 'Dans mon carnet' : 'Ajouter à mon carnet'}</span>`;
      k.setAttribute('aria-label', dedans ? `« ${p.audio.texte} » est dans mon carnet` : `Ajouter « ${p.audio.texte} » à mon carnet`);
    };
    k.addEventListener('click', () => {
      try { carnet.ajouter({ mot: p.audio.texte, sens: p.sens || '', audio: p.audio.id, source: ctx.etape?.id || 'JEU-2' }); } catch { /* rien */ }
      try { ctx.tracer('mot_consulte', { id: p.id, carnet: true }); } catch { /* rien */ }
      majK();
      R.annoncer(`« ${p.audio.texte} » est ajouté à votre carnet.`);
    });
    majK();
    actions.append(k);
    li.append(actions);
    return li;
  }

  const bouton = afficherAccueil();
  ctx.signaler.pret();
  if (bouton && pointeurFin()) bouton.focus({ preventScroll: true });

  return {
    demonter() {
      S.phase = 'fin';
      m.toutArreter();
    },
  };
}

function css(p) {
  return `
${p} .j-types { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 420px) { ${p} .j-types { grid-template-columns: 1fr; } }
${p} .j-type { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--filet); border-radius: var(--rayon-bloc); background: var(--fond); min-width: 0; }
${p} .j-type > span:last-child { display: grid; gap: 1px; min-width: 0; }
${p} .j-type-carte { flex: none; width: 48px; height: 48px; border-radius: 10px; display: grid; place-items: center; overflow: hidden; }
${p} .j-type-son { background: var(--surface); border: 1px solid var(--marque-voile-bord); color: var(--marque); }
${p} .j-type-son svg { width: 24px; height: 24px; }
${p} .j-type-image img { width: 100%; height: 100%; object-fit: cover; }

${p} .j-plateau { display: flex; flex-direction: column; gap: 12px; }
${p} .j-barre { display: flex; align-items: center; gap: 8px 16px; flex-wrap: wrap; padding: 10px 14px; border-radius: var(--rayon-bloc); background: var(--surface); border: 1px solid var(--filet); box-shadow: var(--ombre-carte); }
${p} .j-compteur { display: inline-flex; align-items: baseline; gap: 6px; font-variant-numeric: tabular-nums; }
${p} .j-compteur-lib { font-size: 0.8125rem; font-weight: 600; color: var(--encre-50); }
${p} .j-compteur b { font-size: 1.25rem; line-height: 1; }
${p} .j-sur { font-size: 0.8125rem; color: var(--encre-50); }
${p} .j-cible { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 0.8125rem; font-weight: 600; color: var(--encre-70); }
${p} .j-cible .j-etoile svg { width: 16px; height: 16px; }
@media (max-width: 479px) { ${p} .j-cible-texte { display: none; } ${p} .j-barre { flex-wrap: nowrap; } }

${p} .j-grille { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; margin: 0 auto; }
@media (min-width: 600px) { ${p} .j-grille { grid-template-columns: repeat(4, 1fr); gap: 12px; max-width: min(760px, calc((100svh - 250px) / 3 * 4 + 36px)); } }
${p} .j-carte { position: relative; aspect-ratio: 1 / 1; padding: 0; border: 0; background: none; cursor: pointer; perspective: 900px; border-radius: 14px; touch-action: manipulation; -webkit-tap-highlight-color: transparent; min-width: 0; }
${p} .j-carte:focus-visible { outline: 3px solid var(--marque-clair); outline-offset: 3px; }
${p} .j-carte-in { position: absolute; inset: 0; transform-style: preserve-3d; -webkit-transform-style: preserve-3d; transition: transform 0.42s var(--doux); }
${p} .j-carte.ouverte .j-carte-in, ${p} .j-carte.trouvee .j-carte-in { transform: rotateY(180deg); }
${p} .j-face { position: absolute; inset: 0; border-radius: 14px; overflow: hidden; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
${p} .j-dos { transform: rotateY(0deg); display: grid; place-items: center;
  background: radial-gradient(90% 70% at 30% 15%, rgba(129,140,248,0.38) 0%, rgba(129,140,248,0) 60%),
    repeating-linear-gradient(45deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 9px),
    linear-gradient(160deg, var(--j-nuit) 0%, var(--j-nuit-2) 100%);
  box-shadow: 0 2px 8px rgba(12,21,40,0.16); transition: box-shadow 0.2s, transform 0.2s var(--ressort); }
${p} .j-dos::before { content: ''; position: absolute; inset: 6px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); }
${p} .j-dos-sceau { font-family: var(--police-titre); font-style: italic; font-weight: 600; font-size: clamp(0.9rem, 0.7rem + 1vw, 1.25rem); letter-spacing: 0.06em; color: rgba(224,231,255,0.62); }
@media (hover: hover) { ${p} .j-carte:not(.ouverte):not(.trouvee):hover .j-dos { box-shadow: 0 8px 20px rgba(27,42,74,0.28); } }
${p} .j-carte:not(.ouverte):not(.trouvee):active .j-carte-in { transform: scale(0.97); }
${p} .j-recto { transform: rotateY(180deg); background: var(--surface); border: 1px solid var(--filet); box-shadow: 0 2px 8px rgba(12,21,40,0.08); }
${p} .j-recto-image img { width: 100%; height: 100%; object-fit: cover; display: block; background: var(--fond); }
${p} .j-recto-son { display: grid; place-items: center; align-content: center; gap: 6px; padding: 8px; text-align: center; background: linear-gradient(180deg, #FFFFFF 0%, var(--marque-voile) 100%); border-color: var(--marque-voile-bord); }
${p} .j-hp { width: 44%; max-width: 64px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; background: var(--marque); color: #fff; box-shadow: 0 6px 16px rgba(27,42,74,0.3); }
${p} .j-hp svg { width: 55%; height: 55%; }
${p} .j-ondes { display: inline-flex; align-items: flex-end; gap: 3px; height: 14px; }
${p} .j-ondes i { width: 3px; height: 4px; border-radius: 2px; background: var(--marque); opacity: 0.35; }
${p} .j-carte.joue .j-ondes i { opacity: 1; animation: j-onde 0.8s ease-in-out infinite; }
${p} .j-carte.joue .j-ondes i:nth-child(2) { animation-delay: 0.12s; }
${p} .j-carte.joue .j-ondes i:nth-child(3) { animation-delay: 0.24s; }
${p} .j-carte.joue .j-ondes i:nth-child(4) { animation-delay: 0.36s; }
@keyframes j-onde { 0%, 100% { height: 4px; } 50% { height: 14px; } }
${p} .j-son-texte, ${p} .j-son-sens, ${p} .j-son-bloque { display: none; }
${p} .j-carte.bloque .j-son-bloque { display: block; font-size: 0.75rem; font-weight: 600; color: var(--marque-tres-fonce); }
${p} .j-carte.sans-voix .j-son-texte { display: block; }
${p} .j-carte-son.trouvee .j-recto-son { place-items: stretch; align-content: center; justify-items: center; gap: 4px; background: var(--surface); }
${p} .j-carte-son.trouvee .j-hp { display: none; }
${p} .j-carte-son.trouvee .j-ondes { position: absolute; top: 10px; left: 29px; height: 10px; opacity: 0; }
${p} .j-carte-son.trouvee.joue .j-ondes { opacity: 1; }
${p} .j-carte-son.trouvee .j-son-texte { display: block; font-weight: 700; font-size: clamp(0.8125rem, 0.72rem + 0.5vw, 1.02rem); line-height: 1.25; color: var(--encre); }
${p} .j-carte-son.trouvee .j-son-sens { display: block; font-size: clamp(0.75rem, 0.7rem + 0.3vw, 0.875rem); line-height: 1.25; color: var(--encre-50); }
${p} .j-carte.trouvee .j-recto { border-color: var(--juste-bord); box-shadow: 0 0 0 2px var(--juste-bord); }
${p} .j-carte.trouvee { animation: j-trouvee 0.45s var(--ressort) 0.25s; }
@keyframes j-trouvee { 0%, 100% { transform: scale(1); } 45% { transform: scale(1.05); } }
${p} .j-coche { position: absolute; right: -5px; top: -5px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--juste); color: #fff; box-shadow: 0 2px 6px rgba(5,150,105,0.35); opacity: 0; transform: scale(0.5); transition: opacity 0.2s 0.3s, transform 0.3s var(--ressort) 0.3s; z-index: 2; pointer-events: none; }
${p} .j-coche svg { width: 14px; height: 14px; }
${p} .j-carte.trouvee .j-coche { opacity: 1; transform: scale(1); }
${p} .j-note { position: sticky; bottom: calc(78px + var(--bas-sur, 0px)); z-index: 5; }
${p} .j-note .encart { box-shadow: 0 10px 24px rgba(12,21,40,0.12); }
${p} .j-note:empty { display: none; }
${p} .j-mini-hp { display: none; }
${p} .j-carte-son.trouvee .j-mini-hp { display: grid; position: absolute; top: 6px; left: 7px; width: 18px; height: 18px; color: var(--marque); }
${p} .j-carte-son.trouvee .j-mini-hp svg { width: 18px; height: 18px; }

${p} .j-fin { padding: 20px 16px 18px; display: flex; flex-direction: column; gap: 16px; }
@media (min-width: 768px) { ${p} .j-fin { padding: 26px 28px 24px; } }
${p} .j-fin > .j-pastille { align-self: flex-start; }
${p} .j-fin-etoiles { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
${p} .j-fin-coups { font-size: 1.05rem; color: var(--encre-70); }
${p} .j-fin-coups b { font-family: var(--police-titre); font-size: 2rem; color: var(--encre); font-variant-numeric: tabular-nums; }
${p} .j-paires-bloc { display: grid; gap: 10px; }
${p} .j-paires-bloc h3 { font-size: 1rem; }
${p} .j-paires { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
${p} .j-paire { display: grid; grid-template-columns: 56px 1fr; grid-template-areas: 'img texte' 'img actions'; align-items: center; gap: 6px 12px; padding: 10px; border-radius: var(--rayon-bloc); border: 1px solid var(--filet); background: var(--fond); min-width: 0; }
@media (min-width: 640px) { ${p} .j-paire { grid-template-columns: 64px 1fr auto; grid-template-areas: 'img texte actions'; } }
${p} .j-paire-img { grid-area: img; position: relative; width: 100%; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: var(--filet); padding: 0; border: 0; display: block; }
${p} button.j-paire-img { cursor: pointer; }
${p} button.j-paire-img:focus-visible { outline: 3px solid var(--marque-clair); outline-offset: 2px; }
${p} .j-paire-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
${p} .j-paire-hp { position: absolute; right: 4px; bottom: 4px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--marque); color: #fff; box-shadow: 0 2px 6px rgba(12,21,40,0.3); }
${p} .j-paire-hp svg { width: 14px; height: 14px; }
${p} .j-paire-img.joue .j-paire-hp { animation: j-pop 0.8s ease-in-out infinite; }
@keyframes j-pop { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
${p} .j-paire-texte { grid-area: texte; display: grid; gap: 1px; min-width: 0; }
${p} .j-paire-texte .discret { font-size: 0.9rem; }
${p} .j-paire-actions { grid-area: actions; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
${p} .j-carnet { min-height: 44px; font-size: 0.875rem; padding: 0.5rem 0.85rem; }
${p} .j-carnet:disabled { opacity: 1; color: var(--juste-fonce); border-color: var(--juste-bord); background: var(--juste-voile); }
@media (prefers-reduced-motion: reduce) { ${p} .j-carte-in { transition: none; } ${p} .j-carte.trouvee { animation: none; } }
`;
}
