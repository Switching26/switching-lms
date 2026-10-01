// activities/jeux/course.js — JEU-1 « Course : be en 60 secondes » (script/jeux.json de D, étape de type « course »).
//
// Déroulé : accueil du jeu (record, mode sans chrono) → compte à rebours → partie → écran de fin.
// Pendant la partie : une phrase, trois gros boutons am / is / are, retour immédiat (vert si juste ; si faux,
// le bon mot s'affiche en vert à côté du mauvais), sans explication pour garder le rythme. Les explications
// (sujet remplacé par son pronom + la raison de D) arrivent sur l'écran de fin.
// Barème de D : 10 points par bonne réponse, 5 points de bonus à chaque série de 5, pas de points négatifs.
// Tests (banc d'essai seulement) : #/etape/JEU-1?banc=1&graine=3&duree=12 — sans banc=1, 60 s et vrai hasard.

import {
  el, icone, creerHasard, melanger, parametres, creerMinuteries, mouvementReduit, pointeurFin,
  retours, son, accueilJeu, pastille, listeErreurs, cssJeux,
} from './_jeux.js';

export const meta = { titre: 'Course contre la montre', entete: false };

const FORMES = ['am', 'is', 'are'];
const P = '.act-jeux-course';

/* ── Lecture du barème et des règles écrits en clair par D (avec des valeurs sûres si le texte change) ── */
function nombres(texte) { return (String(texte || '').match(/\d+/g) || []).map(Number); }
function lireRegles(etape, params) {
  const r = etape.regles || {};
  const b = etape.bareme || {};
  const [bonus = 5, tous = 5] = nombres(b.bonus_serie);
  const tranquille = Number(String(r.mode_tranquille || '').match(/(\d+)\s*phrases/)?.[1]) || 20;
  const duree = Math.min(600, Math.max(5, Number(params.duree) || Number(r.duree_s) || 60));
  const remarque = String(etape.note_team || '').match(/remarque\s*:\s*«\s*([^»]+?)\s*»/)?.[1]
    || 'Accepté : les Britanniques disent aussi the team are.';
  return { duree, tranquille, parBonne: Number(b.par_bonne_reponse) || 10, bonus, tous, remarque, reperes: lireReperes(b.reperes) };
}
function lireReperes(texte) {
  const niveaux = [];
  for (const part of String(texte || '').split(';')) {
    const [gauche, ...droite] = part.split(':');
    const libelle = droite.join(':').trim();
    if (!libelle) continue;
    let m;
    if ((m = gauche.match(/moins de\s*(\d+)/i))) niveaux.push({ min: 0, max: Number(m[1]) - 1, libelle });
    else if ((m = gauche.match(/(\d+)\s*à\s*(\d+)/i))) niveaux.push({ min: Number(m[1]), max: Number(m[2]), libelle });
    else if ((m = gauche.match(/(\d+)\s*et plus/i))) niveaux.push({ min: Number(m[1]), max: Infinity, libelle });
  }
  const maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (niveaux.length !== 3) {
    return [{ min: 0, max: 99, libelle: 'Continuez l’entraînement' }, { min: 100, max: 199, libelle: 'Bon réflexe' }, { min: 200, max: Infinity, libelle: 'Automatisme acquis' }];
  }
  return niveaux.map((n) => ({ ...n, libelle: maj(n.libelle) }));
}

/** L'explication d'un item : le sujet remplacé par son pronom (quand D l'écrit « X = y »), puis la raison. */
function explication(item) {
  const sujet = String(item.sujet || '');
  const pourquoi = String(item.pourquoi || '');
  const t = sujet.includes('=') ? `${sujet}. ${pourquoi}` : pourquoi;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** La phrase complétée, le bon mot en gras. */
function phraseJuste(item) {
  const [avant, apres = ''] = String(item.phrase).split('___');
  return el('span', { class: 'j-phrase-juste', lang: 'en' }, avant, el('b', { texte: item.bonne }), apres);
}

export async function monter(racine, ctx) {
  ctx.ajouterStyle(cssJeux(P) + css(P));
  let etape = ctx.donnees;
  if (!etape?.reserve) {
    try { etape = ((await ctx.script('jeux.json'))?.etapes || []).find((x) => x.type === 'course') || null; } catch { etape = null; }
  }
  if (!Array.isArray(etape?.reserve) || !etape.reserve.length) {
    racine.replaceChildren(el('div', { class: 'carte', style: { padding: '20px' } }, el('p', { texte: 'Le contenu de la course est en préparation.' })));
    ctx.signaler.pret();
    return { demonter() {} };
  }

  const R = retours(ctx);
  const m = creerMinuteries(ctx.signal);
  const params = parametres(ctx);
  const regles = lireRegles(etape, params);
  let hasard = creerHasard(params.graine);
  const tolerances = etape.tolerances_particulieres || {};
  const clavier = pointeurFin();

  const S = {
    mode: ctx.stockage.lire('mode', 'chrono') === 'tranquille' ? 'tranquille' : 'chrono',
    phase: 'accueil',
  };

  const cadre = el('div', { class: 'j-cadre' });
  racine.replaceChildren(cadre);

  /* ── Accueil du jeu ─────────────────────────────────────────────────────── */
  function afficherAccueil() {
    S.phase = 'accueil';
    m.toutArreter();
    const record = ctx.stockage.lire(`record-${S.mode}`, null);
    const pRecord = pastille(ctx, 'etoilePleine', record == null ? 'Pas encore de record' : `Votre record : ${record} points`, record == null ? '' : 'forte');
    const pTemps = pastille(ctx, 'chrono', S.mode === 'chrono' ? `${regles.duree} secondes` : `${regles.tranquille} phrases, sans chrono`);
    const pSerie = pastille(ctx, 'eclair', `Série de ${regles.tous} : +${regles.bonus} points`);

    const bareme = el('p', { class: 'petit discret j-bareme', texte: `${regles.parBonne} points par bonne réponse · ${etape.bareme?.bonus_serie || ''}` });
    const inter = el('label', { class: 'j-inter' });
    const case_ = el('input', { type: 'checkbox', role: 'switch', class: 'j-inter-case' });
    case_.checked = S.mode === 'tranquille';
    inter.append(case_, el('span', { class: 'j-inter-piste', 'aria-hidden': 'true' }, el('span')),
      el('span', { class: 'j-inter-texte' }, el('b', { texte: 'Sans chrono' }),
        el('span', { class: 'petit discret', texte: `Même contenu, pas de temps limite : ${regles.tranquille} phrases.` })));
    case_.addEventListener('change', () => {
      S.mode = case_.checked ? 'tranquille' : 'chrono';
      ctx.stockage.ecrire('mode', S.mode);
      afficherAccueil();
      cadre.querySelector('.j-inter-case')?.focus();
    });
    const corps = el('div', { class: 'j-lobby-corps' }, bareme, inter);
    if (clavier) corps.append(el('p', { class: 'petit discret', texte: 'Au clavier : touches 1, 2 et 3.' }));
    const { element, bouton } = accueilJeu(ctx, etape, {
      pastilles: [pTemps, pSerie, pRecord], corps,
      bouton: S.mode === 'chrono' ? 'Lancer la course' : 'Commencer',
      surCommencer: () => lancer(),
    });
    cadre.replaceChildren(element);
    ctx.signaler.progression(0);
    return bouton;
  }

  /* ── La partie ──────────────────────────────────────────────────────────── */
  let scene = null;
  const Q = {};   // éléments de la scène
  function construireScene() {
    const touches = FORMES.map((f, i) => {
      const b = el('button', { type: 'button', class: 'j-rep', 'data-forme': f, lang: 'en', 'aria-label': f });
      if (clavier) b.append(el('span', { class: 'j-kbd', 'aria-hidden': 'true', texte: String(i + 1) }));
      b.append(el('span', { class: 'j-rep-mot', texte: f }));
      b.addEventListener('click', () => repondre(f));
      return b;
    });
    Q.sec = el('b', { class: 'j-sec' });
    Q.unite = el('span', { class: 'j-unite' });
    Q.temps = el('div', { class: 'j-hud-temps' });
    Q.temps.innerHTML = icone(ctx, 'chrono');
    Q.temps.append(Q.sec, Q.unite);
    Q.points = el('b', { class: 'j-pts' });
    Q.score = el('div', { class: 'j-hud-score' }, Q.points, el('span', { texte: 'points' }));
    Q.points.textContent = '0';
    Q.pts = [];
    Q.serie = el('div', { class: 'j-hud-serie', role: 'img' });
    for (let i = 0; i < regles.tous; i++) { const d = el('i'); Q.pts.push(d); Q.serie.append(d); }
    Q.jauge = el('div', { class: 'j-jauge', 'aria-hidden': 'true' }, el('span'));
    Q.phrase = el('p', { class: 'j-phrase', lang: 'en', 'aria-live': 'off' });
    Q.piste = el('div', { class: 'j-piste' }, Q.phrase);
    Q.reponses = el('div', { class: 'j-reponses', role: 'group', 'aria-label': 'Votre réponse : am, is ou are' }, ...touches);
    Q.touches = touches;
    Q.voile = el('div', { class: 'j-voile', hidden: true });
    Q.flotte = el('div', { class: 'j-flottants', 'aria-hidden': 'true' });
    scene = el('div', { class: 'j-scene', tabindex: '-1', 'aria-label': 'Course : am, is ou are' },
      el('div', { class: 'j-hud' }, Q.temps, Q.serie, Q.score), Q.jauge, Q.piste, Q.reponses, Q.voile, Q.flotte);
    cadre.replaceChildren(scene);
  }

  function lancer() {
    hasard = creerHasard(params.graine === undefined ? undefined : `${params.graine}-${S.parties || 0}`);
    S.parties = (S.parties || 0) + 1;
    Object.assign(S, {
      phase: 'decompte', points: 0, justes: 0, reponses: 0, serie: 0, meilleureSerie: 0, bonusTotal: 0,
      erreurs: [], tolerees: new Set(), vus: new Set(), sac: [], dernier: null, courant: null, verrou: true, enAttente: false,
      debut: 0, fin: 0, pauseDepuis: 0, rendus: 0, derniereSeconde: null,
    });
    construireScene();
    majSerie();
    majTemps(S.mode === 'chrono' ? regles.duree * 1000 : 0);
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { /* rien */ }
    scene.focus({ preventScroll: true });
    decompte();
  }

  async function decompte() {
    Q.voile.hidden = false;
    Q.voile.className = 'j-voile j-voile-decompte';
    for (const n of ['3', '2', '1']) {
      Q.voile.replaceChildren(el('span', { class: 'j-decompte', texte: n }));
      son(ctx, 'clic');
      await m.attendre(620);
      if (ctx.signal.aborted || S.phase !== 'decompte') return;
    }
    Q.voile.hidden = true;
    S.phase = 'jeu';
    S.debut = performance.now();
    S.fin = S.debut + regles.duree * 1000;
    suivante();
    if (S.mode !== 'chrono') return;
    if (document.hidden) mettreEnPause();   // l'écran s'est éteint pendant le compte à rebours
    else m.image(boucle);
  }

  function tirer() {
    if (!S.sac.length) {
      S.sac = melanger(etape.reserve, hasard);
      if (S.sac.length > 1 && S.sac[S.sac.length - 1] === S.dernier) S.sac.unshift(S.sac.pop());
    }
    const it = S.sac.pop();
    S.dernier = it;
    return it;
  }

  function suivante() {
    if (S.phase !== 'jeu') return;
    if (S.mode === 'tranquille' && S.reponses >= regles.tranquille) { terminer(); return; }
    S.courant = tirer();
    if(ctx.unite !== 'U01') {
      const choix=S.courant.options || [...new Set(etape.reserve.map(r=>r.bonne))];
      Q.touches=choix.map((option,i)=>{const f=typeof option==='string'?option:option.texte;const b=el('button',{type:'button',class:'j-rep','data-forme':f,lang:'en','aria-label':f},el('span',{class:'j-rep-mot',texte:f}));b.addEventListener('click',()=>repondre(f));return b;});
      Q.reponses.classList.add('j-dynamiques');
      Q.reponses.replaceChildren(...Q.touches);
      Q.reponses.setAttribute('aria-label','Votre réponse');scene.setAttribute('aria-label',etape.titre);
    }
    const [avant, apres = ''] = String(S.courant.phrase).split('___');
    Q.trou = el('span', { class: 'j-trou', 'aria-label': 'mot manquant' }, ' ');
    Q.phrase.replaceChildren(avant, Q.trou, apres);
    Q.phrase.classList.remove('entre');
    void Q.phrase.offsetWidth;
    Q.phrase.classList.add('entre');
    for (const t of Q.touches) t.classList.remove('juste', 'faux', 'solution');
    S.verrou = false;
    R.annoncer(String(S.courant.phrase).replace('___', 'blanc'));
    if (S.mode === 'tranquille') majTemps(0);
  }

  function repondre(forme) {
    if (S.phase !== 'jeu' || S.verrou || !S.courant) return;
    S.verrou = true;
    const item = S.courant;
    const juste = forme === item.bonne;
    const toleree = !juste && (tolerances[item.id] || []).includes(forme);
    const premier = !S.vus.has(item.id);
    S.vus.add(item.id);
    S.reponses += 1;
    const touche = Q.touches.find((t) => t.dataset.forme === forme);

    if (juste || toleree) {
      S.justes += 1;
      S.serie += 1;
      S.meilleureSerie = Math.max(S.meilleureSerie, S.serie);
      let gain = regles.parBonne;
      const bonus = S.serie % regles.tous === 0;
      if (bonus) { gain += regles.bonus; S.bonusTotal += regles.bonus; }
      S.points += gain;
      if (toleree) S.tolerees.add(item.id);
      Q.trou.textContent = forme;
      Q.trou.classList.add('juste');
      touche?.classList.add('juste');
      flotter(`+${regles.parBonne}`, '', Q.trou);
      if (bonus) m.apres(160, () => flotter(`+${regles.bonus} série`, 'bonus', Q.serie));
      Q.points.textContent = String(S.points);
      Q.score.classList.remove('pulse'); void Q.score.offsetWidth; Q.score.classList.add('pulse');
      son(ctx, 'juste');
    } else {
      S.serie = 0;
      S.erreurs.push({ item, donne: forme });
      Q.trou.replaceChildren(el('s', { texte: forme }));
      Q.trou.classList.add('faux');
      Q.trou.after(el('span', { class: 'j-correction', texte: item.bonne }));
      touche?.classList.add('faux');
      Q.touches.find((t) => t.dataset.forme === item.bonne)?.classList.add('solution');
      son(ctx, 'faux');
    }
    majSerie(juste || toleree);
    try {
      ctx.signaler.essai({
        juste: juste ? true : toleree ? 'presque' : false,
        item: item.id, element: item.phrase, attendu: item.bonne, donne: forme,
        explication: toleree ? regles.remarque : explication(item),
        premier_essai: premier,
      });
    } catch { /* le lecteur ne doit jamais casser la partie */ }
    if (S.mode === 'tranquille') ctx.signaler.progression(S.reponses / regles.tranquille);
    m.apres(juste || toleree ? 380 : 1050, () => {
      if (S.phase === 'jeu') suivante();
      else if (S.phase === 'pause') S.enAttente = true;   // reprise : la phrase suivante arrive au retour
    });
  }

  function majSerie(vientDeReussir = false) {
    const n = S.serie % regles.tous;
    const plein = vientDeReussir && S.serie > 0 && n === 0;
    Q.pts.forEach((d, i) => d.classList.toggle('on', plein || i < n));
    Q.serie.classList.toggle('complete', plein);
    if (plein) m.apres(520, () => { Q.serie.classList.remove('complete'); Q.pts.forEach((d) => d.classList.remove('on')); });
    Q.serie.setAttribute('aria-label', `Série en cours : ${S.serie} bonne${S.serie > 1 ? 's' : ''} réponse${S.serie > 1 ? 's' : ''} d'affilée`);
  }

  /** « +10 » qui jaillit au-dessus du mot choisi (ou de la série), puis s'efface. */
  function flotter(texte, classe = '', ancre = null) {
    const f = el('span', { class: `j-flottant ${classe}`, texte });
    if (ancre && scene) {
      const a = ancre.getBoundingClientRect();
      const s = scene.getBoundingClientRect();
      f.style.left = `${Math.round(a.left - s.left + a.width / 2)}px`;
      f.style.top = `${Math.round(a.top - s.top - (classe === 'bonus' ? -30 : 8))}px`;
    }
    Q.flotte.append(f);
    m.apres(mouvementReduit() ? 500 : 900, () => f.remove());
  }

  function majTemps(restantMs) {
    if (S.mode === 'tranquille') {
      Q.sec.textContent = `${Math.min(S.reponses + (S.phase === 'jeu' ? 1 : 0), regles.tranquille) || 1}`;
      Q.unite.textContent = `sur ${regles.tranquille}`;
      Q.jauge.firstChild.style.transform = `scaleX(${Math.min(1, S.reponses / regles.tranquille)})`;
      Q.temps.classList.remove('urgent');
      Q.temps.classList.add('sans-chrono');
      return;
    }
    const s = Math.max(0, Math.ceil(restantMs / 1000));
    if (s !== S.derniereSeconde) {
      S.derniereSeconde = s;
      Q.sec.textContent = String(s);
      Q.unite.textContent = 's';
      Q.temps.classList.toggle('urgent', s <= 10 && S.phase === 'jeu');
      if (S.phase === 'jeu' && s <= 5 && s > 0) son(ctx, 'clic');
    }
    Q.jauge.firstChild.style.transform = `scaleX(${Math.max(0, restantMs / (regles.duree * 1000))})`;
  }

  function boucle() {
    if (S.phase !== 'jeu') return;
    const restant = S.fin - performance.now();
    majTemps(restant);
    if (++S.rendus % 15 === 0) ctx.signaler.progression(1 - Math.max(0, restant) / (regles.duree * 1000));
    if (restant <= 0) { terminer(); return; }
    m.image(boucle);
  }

  /* Pause automatique quand l'onglet passe en arrière-plan (appel, écran verrouillé) : le temps ne file pas. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.phase === 'jeu' && S.mode === 'chrono') mettreEnPause();
  }, { signal: ctx.signal });
  function mettreEnPause() {
    S.phase = 'pause';
    S.pauseDepuis = performance.now();
    Q.voile.hidden = false;
    Q.voile.className = 'j-voile';
    const b = el('button', { type: 'button', class: 'btn btn-primaire j-reprendre' });
    b.innerHTML = `${icone(ctx, 'lecture')}<span>Reprendre la course</span>`;
    b.addEventListener('click', () => {
      S.fin += performance.now() - S.pauseDepuis;
      Q.voile.hidden = true;
      S.phase = 'jeu';
      scene.focus({ preventScroll: true });
      if (S.enAttente) { S.enAttente = false; suivante(); }
      m.image(boucle);
    });
    Q.voile.replaceChildren(el('div', { class: 'j-pause' }, el('p', { class: 'j-pause-titre', texte: 'Course en pause' }),
      el('p', { class: 'petit', texte: `Il vous reste ${Math.max(0, Math.ceil((S.fin - S.pauseDepuis) / 1000))} secondes.` }), b));
  }

  window.addEventListener('keydown', (ev) => {
    if (S.phase !== 'jeu' || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const i = ['1', '2', '3'].indexOf(ev.key);
    if (i < 0) return;
    ev.preventDefault();
    if(Q.touches[i])repondre(Q.touches[i].dataset.forme);
  }, { signal: ctx.signal });

  async function terminer() {
    if (S.phase === 'fin') return;
    S.phase = 'fin';
    S.verrou = true;
    majTemps(0);
    Q.temps.classList.remove('urgent');
    son(ctx, 'fin');
    if (S.mode === 'chrono') {
      Q.voile.hidden = false;
      Q.voile.className = 'j-voile j-voile-fin';
      Q.voile.replaceChildren(el('span', { class: 'j-voile-titre', texte: 'Temps écoulé' }));
      await m.attendre(950);
      if (ctx.signal.aborted) return;
    }
    afficherResultats();
  }

  /* ── Écran de fin ───────────────────────────────────────────────────────── */
  function afficherResultats() {
    const cle = `record-${S.mode}`;
    const ancien = ctx.stockage.lire(cle, null);
    const nouveau = S.reponses > 0 && (ancien == null || S.points > ancien);
    if (nouveau) ctx.stockage.ecrire(cle, S.points);
    const record = nouveau ? S.points : ancien;

    const carte = el('section', { class: 'carte j-fin apparait' });
    carte.append(el('p', { class: 'j-surtitre', texte: S.mode === 'chrono' ? 'Course terminée' : 'Partie sans chrono terminée' }));
    const ligne = el('div', { class: 'j-fin-score' },
      el('span', { class: 'j-fin-nombre', texte: String(S.points) }), el('span', { class: 'j-fin-unite', texte: 'points' }));
    carte.append(ligne);
    if (S.reponses > 0) {
      if (nouveau && ancien != null) carte.append(pastille(ctx, 'etoilePleine', `Nouveau record · ancien : ${ancien} points`, 'forte'));
      else if (nouveau) carte.append(pastille(ctx, 'etoilePleine', 'Votre premier record', 'forte'));
      else if (S.points === record) carte.append(pastille(ctx, 'etoilePleine', `Record égalé : ${record} points`, 'forte'));
      else carte.append(pastille(ctx, 'etoile', `Votre record : ${record} points`));
    }

    if (S.mode === 'chrono') carte.append(echelle());

    const stats = el('div', { class: 'j-stats' },
      tuile('Bonnes réponses', `${S.justes}`, `sur ${S.reponses}`),
      tuile('Meilleure série', `${S.meilleureSerie}`, S.meilleureSerie > 1 ? 'd’affilée' : ''),
      tuile('Bonus de série', S.bonusTotal ? `+${S.bonusTotal}` : '0', 'points'));
    carte.append(stats);

    const vues = new Set();
    const erreurs = [];
    for (const e of S.erreurs) {
      if (vues.has(e.item.id)) continue;
      vues.add(e.item.id);
      erreurs.push({ phrase: phraseJuste(e.item), donne: e.donne, attendu: e.item.bonne, explication: explication(e.item) });
    }
    if (erreurs.length) carte.append(listeErreurs(erreurs));
    else if (S.reponses) carte.append(R.juste(ctx.unite==='U01'?'Aucune erreur : am, is et are sont bien en place.':'Aucune erreur dans cette partie.'));
    else carte.append(R.info('Aucune réponse pendant cette partie : relancez-la quand vous le souhaitez.'));
    if (S.tolerees.size) carte.append(R.info(regles.remarque));

    const rejouer = el('button', { type: 'button', class: 'btn btn-primaire' });
    rejouer.innerHTML = `${icone(ctx, 'rejouer')}<span>Rejouer</span>`;
    rejouer.addEventListener('click', () => lancer());
    const mode = el('button', { type: 'button', class: 'btn btn-secondaire', texte: 'Changer de mode' });
    mode.addEventListener('click', () => { afficherAccueil()?.focus(); });
    carte.append(el('div', { class: 'j-actions' }, rejouer, mode));
    cadre.replaceChildren(carte);
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { /* rien */ }
    rejouer.focus({ preventScroll: true });
    compterJusqua(carte.querySelector('.j-fin-nombre'), S.points);

    try { ctx.tracer('jeu_termine', { jeu: 'course', mode: S.mode, points: S.points, justes: S.justes, reponses: S.reponses, record: nouveau }); } catch { /* rien */ }
    if (S.reponses > 0) {
      try { ctx.signaler.fin({ score: Math.round((S.justes / S.reponses) * 100) / 100 }); } catch { /* rien */ }
    }
    ctx.signaler.progression(1);
    R.annoncer(`Partie terminée : ${S.points} points, ${S.justes} bonnes réponses sur ${S.reponses}.`);
  }

  /** Le score final défile de 0 à sa valeur (0,7 s), sauf si l'apprenant a réduit les animations. */
  function compterJusqua(noeud, cible) {
    if (!noeud || mouvementReduit() || cible <= 0) return;
    const t0 = performance.now();
    const pas = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      noeud.textContent = String(Math.round(cible * (1 - Math.pow(1 - k, 3))));
      if (k < 1) m.image(pas);
    };
    noeud.textContent = '0';
    m.image(pas);
  }

  function tuile(titre, valeur, detail) {
    return el('div', { class: 'j-tuile' }, el('span', { class: 'j-tuile-titre', texte: titre }),
      el('span', { class: 'j-tuile-valeur' }, el('b', { texte: valeur }), detail ? el('span', { texte: ` ${detail}` }) : null));
  }

  function echelle() {
    const bloc = el('div', { class: 'j-echelle', role: 'list', 'aria-label': 'Repères du barème' });
    for (const n of regles.reperes) {
      const ici = S.points >= n.min && S.points <= n.max;
      const bornes = n.max === Infinity ? `${n.min} et plus` : n.min === 0 ? `moins de ${n.max + 1}` : `${n.min} à ${n.max}`;
      bloc.append(el('div', { class: `j-echelon${ici ? ' ici' : ''}`, role: 'listitem', 'aria-current': ici ? 'true' : null },
        el('span', { class: 'j-echelon-bornes', texte: bornes }), el('b', { texte: n.libelle }),
        ici ? el('span', { class: 'j-echelon-vous', texte: 'Vous êtes ici' }) : null));
    }
    return bloc;
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
${p} .j-lobby-corps { display: grid; gap: 12px; }
${p} .j-inter { display: flex; align-items: center; gap: 12px; min-height: 48px; cursor: pointer; padding: 10px 12px; border-radius: var(--rayon-bloc); border: 1px solid var(--filet); background: var(--fond); }
${p} .j-inter-case { position: absolute; opacity: 0; width: 1px; height: 1px; }
${p} .j-inter-piste { position: relative; flex: none; width: 44px; height: 26px; border-radius: 999px; background: var(--filet-fort); transition: background-color 0.2s; }
${p} .j-inter-piste > span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(12,21,40,0.25); transition: transform 0.25s var(--ressort); }
${p} .j-inter-case:checked + .j-inter-piste { background: var(--marque); }
${p} .j-inter-case:checked + .j-inter-piste > span { transform: translateX(18px); }
${p} .j-inter-case:focus-visible + .j-inter-piste { outline: 3px solid var(--marque-clair); outline-offset: 2px; }
${p} .j-inter-texte { display: grid; gap: 1px; }

/* La scène de jeu : un plateau nuit, sobre, qui tient dans l'écran du téléphone. */
${p} .j-scene { position: relative; display: flex; flex-direction: column; overflow: hidden; outline: none;
  height: clamp(430px, var(--j-scene), 640px); border-radius: var(--rayon-carte); color: #fff;
  background:
    radial-gradient(120% 70% at 50% 0%, rgba(58,85,133,0.34) 0%, rgba(58,85,133,0) 62%),
    radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1.2px) 0 0 / 22px 22px,
    linear-gradient(165deg, var(--j-nuit) 0%, var(--j-nuit-2) 100%);
  box-shadow: 0 18px 40px rgba(12,21,40,0.18); user-select: none; -webkit-user-select: none; touch-action: manipulation; }
@media (min-width: 768px) { ${p} .j-scene { height: clamp(460px, var(--j-scene), 560px); } }
${p} .j-hud { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; padding: 14px 16px 10px; }
${p} .j-hud-temps { display: inline-flex; align-items: baseline; gap: 5px; color: var(--j-clair); font-variant-numeric: tabular-nums; }
${p} .j-hud-temps svg { width: 18px; height: 18px; align-self: center; opacity: 0.8; }
${p} .j-sec { font-size: 1.5rem; font-weight: 700; line-height: 1; color: #fff; min-width: 1.4ch; }
${p} .j-unite { font-size: 0.8125rem; font-weight: 600; opacity: 0.75; }
${p} .j-hud-temps.sans-chrono svg { display: none; }
${p} .j-hud-temps.urgent .j-sec { animation: j-battement 1s ease-in-out infinite; }
@keyframes j-battement { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); } }
${p} .j-hud-serie { display: inline-flex; gap: 6px; padding: 7px 10px; border-radius: 999px; background: var(--j-verre); border: 1px solid var(--j-verre-bord); }
${p} .j-hud-serie i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.18); transition: background-color 0.2s, transform 0.25s var(--ressort); }
${p} .j-hud-serie i.on { background: #9AA9C2; transform: scale(1.15); }
${p} .j-hud-serie.complete i { background: #DDE3EC; box-shadow: 0 0 10px rgba(165,180,252,0.9); }
${p} .j-hud-score { justify-self: end; display: inline-flex; align-items: baseline; gap: 5px; color: var(--j-clair); font-variant-numeric: tabular-nums; }
${p} .j-pts { font-size: 1.5rem; font-weight: 700; line-height: 1; color: #fff; }
${p} .j-hud-score span { font-size: 0.8125rem; font-weight: 600; opacity: 0.75; }
${p} .j-hud-score.pulse .j-pts { animation: j-pop 0.35s var(--ressort); }
@keyframes j-pop { 0% { transform: scale(1); } 45% { transform: scale(1.22); } 100% { transform: scale(1); } }
${p} .j-jauge { height: 4px; margin: 0 16px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
${p} .j-jauge > span { display: block; height: 100%; background: linear-gradient(90deg, #6F84A8, #C3CCDC); transform-origin: left center; transform: scaleX(1); }
${p} .j-piste { flex: 1; display: grid; place-items: center; padding: 18px 18px 8px; min-height: 0; }
${p} .j-phrase { margin: 0; text-align: center; font-weight: 600; font-size: clamp(1.45rem, 1.1rem + 1.9vw, 2.2rem); line-height: 1.35; letter-spacing: -0.01em; max-width: 22ch; overflow-wrap: anywhere; }
${p} .j-phrase.entre { animation: j-entree 0.22s var(--doux) both; }
@keyframes j-entree { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
${p} .j-trou { display: inline-block; min-width: 2.5em; padding: 0 0.12em; border-bottom: 3px solid rgba(255,255,255,0.45); color: var(--j-clair); text-align: center; line-height: 1.15; }
${p} .j-trou.juste { color: var(--j-juste-clair); border-bottom-color: var(--j-juste-clair); animation: j-pop 0.3s var(--ressort); }
${p} .j-trou.faux { color: var(--j-faux-clair); border-bottom-color: var(--j-faux-clair); animation: j-secoue 0.3s ease-in-out; }
${p} .j-trou.faux s { text-decoration-thickness: 3px; }
${p} .j-correction { display: inline-block; margin-left: 0.3em; padding: 0 0.12em; color: var(--j-juste-clair); border-bottom: 3px solid var(--j-juste-clair); animation: j-pop 0.35s var(--ressort) 0.08s both; }
@keyframes j-secoue { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
${p} .j-reponses { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 12px 14px 16px; }
${p} .j-rep { position: relative; min-height: 64px; border-radius: 16px; border: 1px solid var(--j-verre-bord); background: var(--j-verre); color: #fff;
  font: inherit; font-size: 1.55rem; font-weight: 700; cursor: pointer; touch-action: manipulation; display: grid; place-items: center;
  transition: transform 0.15s var(--ressort), background-color 0.15s, border-color 0.15s, box-shadow 0.15s; }
${p} .j-reponses.j-dynamiques { grid-template-columns: repeat(3,minmax(0,1fr)); }
${p} .j-dynamiques .j-rep { min-width:0; font-size:clamp(.9rem,2.8vw,1.35rem); overflow-wrap:anywhere; white-space:normal; padding:12px 6px; }
${p} .j-rep:focus-visible { outline: 3px solid #9AA9C2; outline-offset: 2px; }
@media (hover: hover) { ${p} .j-rep:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.3); } }
${p} .j-rep:active { transform: scale(0.96); }
${p} .j-rep.juste { background: var(--juste); border-color: var(--juste); box-shadow: 0 0 0 3px rgba(110,231,183,0.35); }
${p} .j-rep.faux { background: var(--faux); border-color: var(--faux); }
${p} .j-rep.solution { border-color: var(--j-juste-clair); box-shadow: inset 0 0 0 2px var(--j-juste-clair); }
${p} .j-rep .j-kbd { position: absolute; top: 7px; left: 8px; }
@media (min-width: 768px) { ${p} .j-reponses { gap: 14px; padding: 14px 22px 22px; } ${p} .j-rep { min-height: 76px; font-size: 1.8rem; } }
${p} .j-flottants { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
${p} .j-flottant { position: absolute; left: 50%; top: 40%; transform: translate(-50%, 0); white-space: nowrap; font-weight: 700; font-size: 1.05rem; color: var(--j-juste-clair); animation: j-flotte 0.9s var(--doux) both; }
${p} .j-flottant.bonus { color: #fff; padding: 2px 8px; border-radius: 999px; background: rgba(129,140,248,0.45); }
@keyframes j-flotte { 0% { opacity: 0; transform: translate(-50%, 4px) scale(0.9); } 20% { opacity: 1; transform: translate(-50%, -8px) scale(1); } 100% { opacity: 0; transform: translate(-50%, -34px); } }
${p} .j-voile { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(12,21,40,0.62); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); z-index: 2; padding: 20px; text-align: center; }
${p} .j-decompte { font-family: var(--police-titre); font-size: 5.5rem; font-weight: 600; line-height: 1; animation: j-decompte 0.6s var(--doux) both; }
@keyframes j-decompte { 0% { opacity: 0; transform: scale(1.35); } 30% { opacity: 1; transform: scale(1); } 100% { opacity: 0.15; transform: scale(0.92); } }
${p} .j-voile-titre { font-family: var(--police-titre); font-size: 2.2rem; font-weight: 600; animation: j-entree 0.3s var(--doux) both; }
${p} .j-pause { display: grid; gap: 12px; justify-items: center; }
${p} .j-pause-titre { font-family: var(--police-titre); font-size: 1.7rem; font-weight: 600; }

/* Écran de fin */
${p} .j-fin { padding: 20px 16px 18px; display: flex; flex-direction: column; gap: 16px; align-items: stretch; }
@media (min-width: 768px) { ${p} .j-fin { padding: 26px 28px 24px; } }
${p} .j-fin > .j-pastille { align-self: flex-start; }
${p} .j-fin-score { display: flex; align-items: baseline; gap: 10px; }
${p} .j-fin-nombre { font-family: var(--police-titre); font-weight: 600; font-size: clamp(3rem, 2.4rem + 3vw, 4.2rem); line-height: 1; letter-spacing: -0.02em; color: var(--encre); font-variant-numeric: tabular-nums; }
${p} .j-fin-unite { font-size: 1.05rem; font-weight: 600; color: var(--encre-50); }
${p} .j-echelle { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
${p} .j-echelon { display: grid; gap: 2px; align-content: start; padding: 10px 10px 11px; border-radius: var(--rayon-bloc); border: 1px solid var(--filet); background: var(--fond); color: var(--encre-70); min-width: 0; }
${p} .j-echelon b { font-size: 0.875rem; line-height: 1.25; }
${p} .j-echelon-bornes { font-size: 0.8125rem; color: var(--encre-50); font-variant-numeric: tabular-nums; }
${p} .j-echelon.ici { background: var(--marque-voile); border-color: var(--marque-voile-bord); color: var(--marque-tres-fonce); box-shadow: inset 0 -3px 0 var(--marque); }
${p} .j-echelon-vous { font-size: 0.8125rem; font-weight: 700; color: var(--marque); }
${p} .j-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
${p} .j-tuile { display: grid; gap: 2px; padding: 10px 12px; border-radius: var(--rayon-bloc); border: 1px solid var(--filet); min-width: 0; }
${p} .j-tuile-titre { font-size: 0.8125rem; color: var(--encre-50); font-weight: 600; }
${p} .j-tuile-valeur { font-variant-numeric: tabular-nums; }
${p} .j-tuile-valeur b { font-size: 1.3rem; }
${p} .j-tuile-valeur span { font-size: 0.8125rem; color: var(--encre-50); }
@media (max-width: 420px) { ${p} .j-tuile { padding: 9px 9px; } ${p} .j-tuile-valeur b { font-size: 1.15rem; } }
`;
}
