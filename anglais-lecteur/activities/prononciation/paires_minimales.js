import { requete as fetch } from '../../services/base.js';
// PAIRES DE SONS PIÈGES (PRO-2) — agent B2.
//
// Pour chaque paire (I / hi, is / his, day / they…), d'après le déroulement de D :
//   1. ENTENDRE : on écoute les deux mots, puis deux « mots mystère » tirés au hasard ; on touche
//      celui qu'on a entendu. Jeu rapide : réponse immédiate, série de bonnes réponses, temps de réponse.
//   2. DIRE : l'apprenant dit chacun des deux mots ; la reconnaissance reçoit les DEUX mots possibles
//      (sans savoir lequel est attendu) et dit lequel elle a compris.
// La lettre qui change est mise en évidence dans chaque mot : c'est là que tout se joue.
// Honnêteté : sur un mot isolé, la reconnaissance est moins fiable (texte de D affiché).

import { icones } from '../../services/icones.js';
import {
  CSS_COMMUN, RACINES, echapper, typo, norm, memeSon, nettoyerTranscription, messageMicro, messageNote,
  panneau, microBloqueDAvance, creerEnregistreur, attendreNote, boutonSon, infoSon, jouerALaSuite,
  montrerDansLaVue,
} from './_commun.js';

// Encarts du socle avec la typographie française (insère du texte brut : on corrige avant).
function retourTypo(S, type, texte, opts) {
  const o = opts ? { ...opts, explication: opts.explication ? typo(opts.explication) : opts.explication } : opts;
  return S.retour[type](typo(texte), o);
}

export const meta = { titre: 'Paires de sons pièges', entete: true };

const ECOUTES_PAR_PAIRE = 2;
const R = RACINES;
const CSS = `
${R} .pro-son-tete { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; margin-bottom: 14px; }
${R} .pro-son-nom { font-weight: 700; color: var(--c-parler); }
${R} .pro-paire { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
${R} .pro-mc { position: relative; display: grid; gap: 4px; justify-items: center; text-align: center; padding: 18px 10px 14px;
  border: 1.5px solid var(--filet); border-radius: var(--rayon-carte); background: var(--surface); cursor: pointer; min-height: 132px;
  transition: border-color .15s, background-color .15s, transform .2s var(--ressort), box-shadow .2s; font: inherit; color: inherit; }
${R} .pro-mc:hover:not(:disabled) { border-color: var(--marque-voile-bord); box-shadow: var(--ombre-survol); }
${R} .pro-mc:active:not(:disabled) { transform: scale(0.98); }
${R} .pro-mc:disabled { cursor: default; }
${R} .pro-mc-mot { font-size: clamp(1.9rem, 1.5rem + 2vw, 2.6rem); font-weight: 700; letter-spacing: -0.01em; line-height: 1.1; color: var(--encre); }
${R} .pro-mc-mot mark { background: none; color: var(--c-parler); border-bottom: 3px solid color-mix(in srgb, var(--c-parler) 55%, transparent); padding: 0 1px; }
${R} .pro-mc-sens { font-size: .875rem; color: var(--encre-50); line-height: 1.3; }
${R} .pro-mc-ico { display: inline-flex; align-items: center; gap: 6px; font-size: .8125rem; font-weight: 600; color: var(--marque); margin-top: 6px; }
${R} .pro-mc-ico svg { width: 18px; height: 18px; }
${R} .pro-paire[data-mode="question"] .pro-mc { border-color: var(--marque-voile-bord); background: var(--marque-voile); }
${R} .pro-paire[data-mode="question"] .pro-mc-ico { visibility: hidden; }
${R} .pro-mc[data-r="juste"] { border-color: var(--juste); background: var(--juste-voile); }
${R} .pro-mc[data-r="faux"] { border-color: var(--faux); background: var(--faux-voile); }
${R} .pro-mc[data-cible] { border-color: var(--marque); box-shadow: 0 0 0 3px var(--marque-voile-bord); }
${R} .pro-mc.pro-dit { border-color: var(--marque); background: var(--marque-voile); }
${R} .pro-piege-paire { margin-top: 14px; display: grid; gap: 6px; font-size: .95rem; color: var(--encre-70); }
${R} .pro-piege-paire b { color: var(--encre); }
${R} .pro-phase { margin-top: 20px; display: grid; gap: 12px; }
${R} .pro-phase-titre { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
${R} .pro-phase-titre h3 { font-size: 1rem; }
${R} .pro-serie { font-size: .8125rem; font-weight: 700; color: var(--marque-tres-fonce); background: var(--marque-voile); border-radius: 999px; padding: 3px 10px; }
${R} .pro-consigne-dire { font-size: 1.1rem; font-weight: 600; }
${R} .pro-consigne-dire span { color: var(--c-parler); font-size: 1.35rem; }
${R} .pro-pied { margin-top: 20px; justify-content: flex-end; }
${R} .pro-score { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
${R} .pro-score > div { border: 1px solid var(--filet); border-radius: var(--rayon-bloc); padding: 14px; background: var(--fond); }
${R} .pro-score b { display: block; font-size: 1.6rem; font-family: var(--police-titre); }
@media (max-width: 380px) { ${R} .pro-paire { gap: 8px; } ${R} .pro-mc { padding: 14px 6px 12px; } }
`;

/** Les lettres qui changent entre deux mots : préfixe et suffixe communs retirés. */
function difference(a, b) {
  const x = a.toLowerCase(); const y = b.toLowerCase();
  // th contre une consonne (they / day, thank / sank) : seules les consonnes du début comptent.
  const debutTh = (m) => m.startsWith('th');
  if (debutTh(x) !== debutTh(y)) {
    const attaque = (m) => (debutTh(m.toLowerCase()) ? 2 : Math.max(1, m.search(/[aeiouy]/i)));
    const marque = (m) => { const k = attaque(m); return `<mark>${echapper(m.slice(0, k))}</mark>${echapper(m.slice(k))}`; };
    return [marque(a), marque(b)];
  }
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p += 1;
  let s = 0;
  while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s += 1;
  const marquer = (mot) => {
    const fin = mot.length - s;
    if (fin <= p) return echapper(mot);
    return `${echapper(mot.slice(0, p))}<mark>${echapper(mot.slice(p, fin))}</mark>${echapper(mot.slice(fin))}`;
  };
  return [marquer(a), marquer(b)];
}

function melanger(n) {
  const t = [];
  for (let i = 0; i < n; i += 1) t.push(Math.random() < 0.5 ? 'a' : 'b');
  return t;
}

export async function monter(racine, ctx) {
  const S = ctx.services;
  // Le lecteur n'injecte qu'UNE feuille par type d'activité : commune + propre, en un seul appel.
  ctx.ajouterStyle(CSS_COMMUN + CSS);
  const e = ctx.donnees || {};
  const paires = Array.isArray(e.paires) ? e.paires : [];
  if (!paires.length) {
    racine.innerHTML = '<div class="pro-carte"><p class="discret">Les paires de cette étape ne sont pas encore écrites.</p></div>';
    ctx.signaler.pret();
    return { demonter() {} };
  }
  const honnete = e.limite_honnete || 'Sur un mot isolé, la reconnaissance automatique est moins fiable que sur une phrase : si votre mot est refusé alors que vous pensez l’avoir bien dit, réécoutez-vous.';

  const sons = await Promise.all(paires.map(async (p) => ({ a: await infoSon(ctx, p.mot_a?.audio), b: await infoSon(ctx, p.mot_b?.audio) })));
  // Étalonnage mesuré (calibrage.json) : les mots que la reconnaissance ne sait pas départager seuls
  // (« I » toujours écrit « Hi », « is » parfois « His »…) sont jugés à l'oreille, jamais par un faux verdict.
  let calibrage = {};
  try { calibrage = (await (await fetch(ctx.asset('activities/prononciation/calibrage.json'), { signal: ctx.signal })).json()).mots || {}; } catch { /* tout à la machine */ }
  const controleDe = (motScript) => calibrage[motScript?.audio?.id]?.controle || 'machine';
  try { await S.audio.precharger(sons.flatMap((s) => [s.a?.url, s.b?.url]).filter(Boolean)); } catch { /* facultatif */ }

  const etats = paires.map(() => ({ tirages: melanger(ECOUTES_PAR_PAIRE), reponses: [], dits: { a: null, b: null } }));
  let index = 0;
  let serie = 0;
  let modeEcoute = false;
  let enregistreur = null;
  let barre = null;
  let jetonPaire = 0;
  const blocageInitial = await microBloqueDAvance(ctx);

  const totalEcoutes = () => paires.reduce((n, p, i) => n + (sons[i].a && sons[i].b ? ECOUTES_PAR_PAIRE : 0), 0);
  const bonnesEcoutes = () => etats.reduce((n, s) => n + s.reponses.filter((r) => r.juste).length, 0);

  function afficherPaire() {
    const jeton = ++jetonPaire;
    const actuel = () => jeton === jetonPaire && racine.isConnected;
    const p = paires[index];
    const st = etats[index];
    const son = sons[index];
    enregistreur?.detruire();
    barre?.detruire();
    ctx.signaler.progression(index / paires.length);
    const [ma, mb] = difference(p.mot_a.en, p.mot_b.en);
    racine.innerHTML = `
      <div class="pro-carte">
        <div class="pro-compteur">
          <span class="petit">Paire ${index + 1} sur ${paires.length}</span>
          <span class="pro-points-etapes" aria-hidden="true">${paires.map((_, i) => `<i data-e="${i === index ? 'courant' : i < index ? 'fait' : ''}"></i>`).join('')}</span>
        </div>
        <div class="pro-son-tete"><span class="pro-son-nom">${echapper(p.son || 'Deux sons proches')}</span><span class="petit discret">Un seul son change, et le sens avec lui.</span></div>
        <div class="pro-paire" data-mode="libre">
          <button type="button" class="pro-mc" data-cote="a"><span class="pro-mc-mot" lang="en">${ma}</span><span class="pro-mc-sens">${echapper(p.mot_a.fr || '')}</span><span class="pro-mc-ico">${icones.ecouter}<span>Écouter</span></span></button>
          <button type="button" class="pro-mc" data-cote="b"><span class="pro-mc-mot" lang="en">${mb}</span><span class="pro-mc-sens">${echapper(p.mot_b.fr || '')}</span><span class="pro-mc-ico">${icones.ecouter}<span>Écouter</span></span></button>
        </div>
        <div class="pro-piege-paire">
          ${p.pourquoi_c_est_un_piege ? `<p><b>Le piège.</b> ${echapper(p.pourquoi_c_est_un_piege)}</p>` : ''}
          ${p.astuce ? `<p><b>Le geste.</b> ${echapper(p.astuce)}</p>` : ''}
        </div>
        <div class="pro-phase pro-phase-entendre"></div>
        <div class="pro-phase pro-phase-dire" hidden></div>
        <div class="pro-aide"></div>
        <div class="pro-pied pro-actions"></div>
      </div>`;
    const grille = racine.querySelector('.pro-paire');
    const cartes = { a: grille.querySelector('[data-cote="a"]'), b: grille.querySelector('[data-cote="b"]') };
    const motDe = (c) => (c === 'a' ? p.mot_a.en : p.mot_b.en);
    const sonDe = (c) => (c === 'a' ? son.a : son.b);
    let question = null; // { cote, t0, n }

    const jouerCarte = async (c) => {
      const inf = sonDe(c);
      if (!inf) return 'absent';
      ctx.tracer('audio_ecoute', { item: p.id, mot: c });
      cartes[c].classList.add('pro-dit');
      try { return await S.audio.jouer(inf.url); } finally { cartes[c].classList.remove('pro-dit'); }
    };
    for (const c of ['a', 'b']) {
      cartes[c].setAttribute('aria-label', `${motDe(c)} : ${c === 'a' ? p.mot_a.fr : p.mot_b.fr}. Écouter.`);
      cartes[c].addEventListener('click', () => {
        if (question) repondre(c);
        else jouerCarte(c);
      });
    }

    barre = S.aide.barre(ctx, {
      item: () => `${p.id}-ecoute-${question?.n ?? 0}`,
      surMontrer: () => montrerDifference(),
      surSolution: () => {
        if (!question) return;
        const z = racine.querySelector('.pro-phase-entendre .pro-retour');
        z?.replaceChildren(retourTypo(S, 'reponse', `C'était « ${motDe(question.cote)} ».`, { explication: p.astuce || '' }));
      },
    });
    barre.nouvelItem();
    racine.querySelector('.pro-aide').append(barre.element);

    // Démonstration : les deux mots au ralenti, l'un après l'autre, deux fois, la carte allumée.
    async function montrerDifference() {
      for (let k = 0; k < 2; k += 1) {
        for (const c of ['a', 'b']) {
          const inf = sonDe(c);
          if (!inf || !actuel()) return;
          cartes[c].classList.add('pro-dit');
          const r = await S.audio.jouer(inf.url, { vitesse: 0.7 });
          cartes[c].classList.remove('pro-dit');
          if (r !== 'fin') return;
          await new Promise((ok) => setTimeout(ok, 350));
        }
      }
    }

    const zoneE = racine.querySelector('.pro-phase-entendre');
    const zoneD = racine.querySelector('.pro-phase-dire');
    const ecouteImpossible = !son.a || !son.b;

    function phaseEntendre() {
      if (ecouteImpossible) {
        zoneE.innerHTML = '<p class="petit discret">Les sons de cette paire sont en préparation : passez directement à la prononciation.</p>';
        phaseDire();
        return;
      }
      const n = st.reponses.length;
      if (n >= ECOUTES_PAR_PAIRE) { resumeEntendre(); phaseDire(); return; }
      zoneE.innerHTML = `
        <div class="pro-phase-titre"><h3>1. Entendre la différence · écoute ${n + 1} sur ${ECOUTES_PAR_PAIRE}</h3>${serie >= 2 ? `<span class="pro-serie">Série : ${serie}</span>` : ''}</div>
        <p class="discret petit">Touchez « Mot mystère », puis la carte du mot que vous avez entendu.</p>
        <div class="pro-actions pro-mystere"></div>
        <div class="pro-retour" aria-live="polite"></div>`;
      zoneE.querySelector('.pro-mystere').append(boutonSon({
        libelle: question ? 'Réécouter le mot mystère' : 'Mot mystère', icone: 'lecture', classe: 'btn-primaire',
        action: () => poserQuestion(),
      }));
    }

    async function poserQuestion() {
      const n = st.reponses.length;
      const cote = st.tirages[n];
      if (!question) question = { cote, n, t0: 0 };
      grille.dataset.mode = 'question';
      for (const c of ['a', 'b']) { delete cartes[c].dataset.r; cartes[c].setAttribute('aria-label', `Réponse : ${motDe(c)}`); }
      const bouton = zoneE.querySelector('.pro-mystere .btn span');
      if (bouton) bouton.textContent = 'Réécouter le mot mystère';
      ctx.tracer('audio_ecoute', { item: p.id, mystere: n + 1 });
      const r = await S.audio.jouer(sonDe(cote).url);
      if (question && !question.t0 && r === 'fin') question.t0 = performance.now();
    }

    function repondre(c) {
      const q = question;
      if (!q) return;
      question = null;
      grille.dataset.mode = 'libre';
      S.audio.arreter('media');
      const juste = c === q.cote;
      const temps = q.t0 ? (performance.now() - q.t0) / 1000 : null;
      st.reponses.push({ juste, donne: c });
      serie = juste ? serie + 1 : 0;
      cartes[c].dataset.r = juste ? 'juste' : 'faux';
      if (!juste) cartes[q.cote].dataset.r = 'juste';
      const attendu = motDe(q.cote);
      const explication = juste
        ? `Oui, c'était « ${attendu} ».`
        : `C'était « ${attendu} », pas « ${motDe(c)} ». ${p.pourquoi_c_est_un_piege || ''}`.trim();
      ctx.signaler.essai({ juste, item: `${p.id}-ecoute-${q.n + 1}`, element: `${p.mot_a.en} / ${p.mot_b.en}`, attendu, donne: motDe(c), explication, premier_essai: true });
      ctx.tracer('reponse_donnee', { item: `${p.id}-ecoute-${q.n + 1}`, juste });
      S.sons?.jouer?.(juste ? 'juste' : 'faux');
      if (!juste) barre.erreur();
      for (const k of ['a', 'b']) cartes[k].setAttribute('aria-label', `${motDe(k)} : ${k === 'a' ? p.mot_a.fr : p.mot_b.fr}. Écouter.`);
      const zr = zoneE.querySelector('.pro-retour');
      zoneE.querySelector('.pro-mystere')?.replaceChildren();
      const suite = () => { for (const k of ['a', 'b']) delete cartes[k].dataset.r; if (actuel()) phaseEntendre(); };
      if (juste) {
        zr.replaceChildren(retourTypo(S, 'juste', `${explication}${temps ? ` Réponse en ${temps.toFixed(1).replace('.', ',')} s.` : ''}${serie >= 3 ? ` ${serie} bonnes réponses d'affilée.` : ''}`));
        const t = setTimeout(suite, 1300);
        ctx.surDemontage(() => clearTimeout(t));
      } else {
        zr.replaceChildren(retourTypo(S, 'faux', `C'était « ${attendu} ».`, { explication: `${p.pourquoi_c_est_un_piege || ''} ${p.astuce || ''}`.trim() }));
        const actions = document.createElement('div');
        actions.className = 'pro-actions';
        actions.style.marginTop = '10px';
        actions.append(
          boutonSon({ libelle: 'Réécouter les deux', icone: 'comparer', action: () => jouerALaSuite(ctx, [son.a.url, son.b.url]) }),
        );
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-primaire';
        b.innerHTML = `<span>Continuer</span>${icones.suivant}`;
        b.addEventListener('click', suite);
        actions.append(b);
        zr.append(actions);
      }
    }

    function resumeEntendre() {
      const bonnes = st.reponses.filter((r) => r.juste).length;
      zoneE.innerHTML = `<div class="pro-phase-titre"><h3>1. Entendre la différence</h3><span class="petit discret">${bonnes} sur ${ECOUTES_PAR_PAIRE}</span></div>`;
    }

    // ── 2. DIRE LES DEUX MOTS ─────────────────────────────────────────────────────────────────
    function phaseDire() {
      zoneD.hidden = false;
      const aFaire = ['a', 'b'].find((c) => st.dits[c] === null);
      if (modeEcoute) {
        zoneD.innerHTML = '';
        zoneD.append(panneau({
          titre: 'Mode écoute',
          texte: `Dites « ${p.mot_a.en} » puis « ${p.mot_b.en} » à voix haute, en touchant chaque carte pour vous comparer au modèle. Cette partie ne sera pas notée.`,
          actions: [{ libelle: 'Réessayer le micro', icone: 'micro', action: () => { modeEcoute = false; phaseDire(); } }],
        }));
        afficherPied(true);
        return;
      }
      if (!aFaire) { resumeDire(); afficherPied(true); return; }
      for (const c of ['a', 'b']) delete cartes[c].dataset.cible;
      cartes[aFaire].dataset.cible = '';
      zoneD.innerHTML = `
        <div class="pro-phase-titre"><h3>2. Dire les deux mots · ${aFaire === 'a' ? '1' : '2'} sur 2</h3></div>
        <p class="pro-consigne-dire">Dites : <span lang="en">${echapper(motDe(aFaire))}</span></p>
        <div class="pro-dire-enr"></div>
        <div class="pro-dire-note"></div>
        <p class="pro-honnete">${icones.info}<span>${echapper(honnete)}</span></p>`;
      const zoneNote = zoneD.querySelector('.pro-dire-note');
      const oreille = controleDe(aFaire === 'a' ? p.mot_a : p.mot_b) === 'oreille';
      if (oreille) {
        zoneD.querySelector('.pro-honnete span').textContent = typo(`Sur ce mot seul, notre reconnaissance se trompe, même avec la voix modèle : c'est votre oreille qui juge. Enregistrez-vous, puis comparez.`);
      }
      enregistreur?.detruire();
      enregistreur = creerEnregistreur(ctx, {
        dureeMax: 4000, dureeMin: 250, finSilence: 900, attenteParole: 4000,
        libelle: `Touchez et dites « ${motDe(aFaire)} »`,
        surDebut: () => zoneNote.replaceChildren(),
        surResultat: (res) => (oreille ? comparerALOreille(aFaire, res, zoneNote) : traiter(aFaire, res, zoneNote, controleDe(aFaire === 'a' ? p.mot_a : p.mot_b))),
      });
      zoneD.querySelector('.pro-dire-enr').append(enregistreur.element);
      if (blocageInitial && index === 0 && aFaire === 'a') montrerMicro(blocageInitial, zoneNote);
    }

    function montrerMicro(code, zone) {
      const m = messageMicro(code);
      const actions = [];
      if (m.reessayer) actions.push({ libelle: 'Réessayer', icone: 'rejouer', action: () => { zone.replaceChildren(); enregistreur?.demarrer(); } });
      actions.push({ libelle: 'Continuer sans micro', icone: 'ecouter', primaire: !m.reessayer, action: () => { modeEcoute = true; for (const c of ['a', 'b']) delete cartes[c].dataset.cible; phaseDire(); } });
      zone.replaceChildren(panneau({ titre: m.titre, texte: m.texte, actions, ton: 'alerte' }));
    }

    function comparerALOreille(cote, res, zoneNote) {
      if (!res.ok && res.micro) { montrerMicro(res.code, zoneNote); return; }
      if (!res.ok) { const m = messageNote(res.code); zoneNote.replaceChildren(panneau({ titre: m.titre, texte: m.texte, ton: 'alerte' })); return; }
      const cible = motDe(cote);
      ctx.tracer('enregistrement_depose', { item: `${p.id}-${cote}`, duree_s: res.enr.duree_s });
      const box = document.createElement('div');
      box.className = 'pro-panneau apparait';
      box.innerHTML = `<div class="pro-panneau-tete">${icones.info}<b>${echapper(`Comparez à l'oreille : « ${cible} »`)}</b></div><p>${echapper(p.astuce || '')}</p><div class="pro-actions pro-o-sons"></div><div class="pro-actions pro-o-choix"></div>`;
      box.querySelector('.pro-o-sons').append(
        boutonSon({ libelle: 'Ma voix', icone: 'micro', action: () => S.audio.jouer(res.enr.url) }),
        boutonSon({ libelle: 'Le modèle', icone: 'ecouter', disponible: Boolean(sonDe(cote)), action: () => jouerCarte(cote) }),
        boutonSon({ libelle: 'Les deux à la suite', icone: 'comparer', disponible: Boolean(sonDe(cote)), action: () => jouerALaSuite(ctx, [res.enr.url, sonDe(cote)?.url]) }),
      );
      const choix = box.querySelector('.pro-o-choix');
      const opt = (libelle, pareil) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn ${pareil ? 'btn-primaire' : 'btn-secondaire'}`;
        b.textContent = libelle;
        b.addEventListener('click', () => {
          ctx.tracer('reponse_donnee', { item: `${p.id}-dire-${cote}-oreille`, juste: pareil });
          if (pareil) { st.dits[cote] = 'oreille'; phaseDire(); }
          else choix.replaceChildren(retourTypo(S, 'info', `Réessayez en exagérant le son : ${p.astuce || 'réécoutez le modèle, puis redites le mot bien détaché.'}`));
        });
        return b;
      };
      choix.append(opt('Je l’entends pareil', true), opt('Pas encore, je réessaie', false));
      zoneNote.replaceChildren(box);
      montrerDansLaVue(box);
    }

    async function traiter(cote, res, zoneNote, controle = 'machine') {
      if (!res.ok && res.micro) { montrerMicro(res.code, zoneNote); return; }
      if (!res.ok) { const m = messageNote(res.code, { mot: true }); zoneNote.replaceChildren(panneau({ titre: m.titre, texte: m.texte, ton: 'alerte' })); return; }
      const cible = motDe(cote);
      const autre = motDe(cote === 'a' ? 'b' : 'a');
      const indicatif = controle === 'indicatif';
      ctx.tracer('enregistrement_depose', { item: `${p.id}-${cote}`, duree_s: res.enr.duree_s });
      enregistreur.attente();
      const r = await attendreNote(ctx, zoneNote, () => S.prononciation.noter(res.enr.blob, cible, { candidats: [p.mot_a.en, p.mot_b.en] }));
      if (!actuel()) return;
      enregistreur.pret(`Touchez et redites « ${cible} »`);
      const comparer = document.createElement('div');
      comparer.className = 'pro-actions';
      comparer.style.marginTop = '10px';
      comparer.append(
        boutonSon({ libelle: 'Le modèle', icone: 'ecouter', disponible: Boolean(sonDe(cote)), action: () => jouerCarte(cote) }),
        boutonSon({ libelle: 'Ma voix', icone: 'micro', action: () => S.audio.jouer(res.enr.url) }),
      );
      if (!r || !r.ok) {
        const code = r?.code || 'indisponible';
        const m = messageNote(code, { mot: true });
        const actions = [];
        if (code === 'indisponible') actions.push({ libelle: 'Renvoyer', icone: 'rejouer', primaire: true, action: () => traiter(cote, res, zoneNote, controle) });
        actions.push({ libelle: 'Passer ce mot', icone: 'suivant', action: () => { st.dits[cote] = 'non-note'; phaseDire(); } });
        zoneNote.replaceChildren(panneau({ titre: m.titre, texte: m.texte, actions, ton: 'alerte' }), comparer);
        return;
      }
      // Lequel des deux mots la machine a-t-elle compris ? (champ `candidat` si le socle le donne, demande D6)
      const brut = r.candidat ?? r.mots?.[0]?.entendu ?? '';
      const transcription = nettoyerTranscription(r.transcription);
      const compris = (norm(brut) ? brut : transcription.split(/\s+/)[0] || '').replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
      const estCible = memeSon(compris, cible);
      const estAutre = !estCible && memeSon(compris, autre);
      const juste = estCible;
      let explication;
      if (juste) explication = `« ${cible} » a bien été reconnu.`;
      else if (estAutre) explication = `On a compris « ${autre} » au lieu de « ${cible} ». ${p.astuce || ''}`.trim();
      else if (compris) explication = `On a compris « ${compris} », ni « ${p.mot_a.en} » ni « ${p.mot_b.en} ». Réécoutez le modèle, puis redites le mot bien détaché.`;
      else explication = 'Aucun mot n’a été reconnu. Parlez un peu plus fort, près du micro.';
      const premier = st.dits[cote] === null && !st[`essai_${cote}`];
      st[`essai_${cote}`] = (st[`essai_${cote}`] || 0) + 1;
      ctx.signaler.essai({ juste, item: `${p.id}-dire-${cote}`, element: `Dire « ${cible} »`, attendu: cible, donne: compris || '(rien de reconnu)', explication, premier_essai: premier });
      ctx.tracer('note_prononciation', { item: `${p.id}-dire-${cote}`, reussi: juste });
      const prudence = 'Sur un mot seul, la machine se trompe parfois : réécoutez-vous pour confirmer.';
      montrerDansLaVue(zoneNote);
      if (juste) {
        S.sons?.jouer?.('juste');
        zoneNote.replaceChildren(retourTypo(S, 'juste', indicatif ? `La machine a compris « ${cible} ».` : explication, indicatif ? { explication: prudence } : undefined), comparer);
        st.dits[cote] = true;
        const t = setTimeout(() => { if (actuel()) phaseDire(); }, 1400);
        ctx.surDemontage(() => clearTimeout(t));
      } else {
        S.sons?.jouer?.('faux');
        const titre = estAutre ? `On a compris « ${autre} » au lieu de « ${cible} ».` : compris ? `On a compris « ${compris} ».` : 'Aucun mot n’a été reconnu.';
        let conseil = estAutre ? (p.astuce || '') : compris ? 'Ni l’un ni l’autre mot : réécoutez le modèle, puis redites le mot bien détaché.' : 'Parlez un peu plus fort, près du micro.';
        if (indicatif) conseil = `${conseil} ${prudence}`.trim();
        zoneNote.replaceChildren(retourTypo(S, 'faux', titre, { explication: conseil }), comparer);
        if (indicatif) {
          // La machine peut se tromper sur ce mot (étalonnage) : l'apprenant compare et tranche, c'est compté « à l'oreille ».
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-secondaire';
          b.textContent = 'Je l’entends pareil que le modèle';
          b.addEventListener('click', () => { ctx.tracer('reponse_donnee', { item: `${p.id}-dire-${cote}-oreille`, juste: true }); st.dits[cote] = 'oreille'; phaseDire(); });
          comparer.append(b);
        }
        if (st[`essai_${cote}`] >= 3) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-secondaire';
          b.innerHTML = `<span>Passer ce mot</span>${icones.suivant}`;
          b.addEventListener('click', () => { st.dits[cote] = false; phaseDire(); });
          comparer.append(b);
        }
      }
    }

    function resumeDire() {
      for (const c of ['a', 'b']) delete cartes[c].dataset.cible;
      const lignes = ['a', 'b'].map((c) => {
        const v = st.dits[c];
        const etat = v === true ? 'reconnu' : v === 'oreille' ? 'jugé à l’oreille' : v === 'non-note' ? 'non noté' : 'pas encore reconnu';
        return `« ${echapper(motDe(c))} » : ${etat}`;
      }).join(' · ');
      zoneD.innerHTML = `<div class="pro-phase-titre"><h3>2. Dire les deux mots</h3></div><p class="petit discret">${lignes}</p>`;
    }

    function afficherPied(montrer) {
      const pied = racine.querySelector('.pro-pied');
      pied.replaceChildren();
      if (!montrer) return;
      const dernier = index === paires.length - 1;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-primaire';
      b.innerHTML = `<span>${dernier ? 'Voir le résultat' : 'Paire suivante'}</span>${icones.suivant}`;
      b.addEventListener('click', () => {
        S.audio.arreter('media');
        if (dernier) afficherBilan();
        else { index += 1; afficherPaire(); racine.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }
      });
      pied.append(b);
    }

    phaseEntendre();
  }

  function afficherBilan() {
    enregistreur?.detruire();
    barre?.detruire();
    const tE = totalEcoutes();
    const bE = bonnesEcoutes();
    let dits = 0; let bons = 0; let oreille = 0;
    for (const s of etats) for (const c of ['a', 'b']) {
      if (s.dits[c] === true || s.dits[c] === false) { dits += 1; if (s.dits[c] === true) bons += 1; }
      if (s.dits[c] === 'oreille') oreille += 1;
    }
    const seuil = Math.ceil(tE * (11 / 14));
    ctx.signaler.progression(1);
    racine.innerHTML = `
      <div class="pro-carte apparait">
        <h2>Vos paires de sons</h2>
        <div class="pro-score">
          <div><span class="petit discret">Entendre</span><b>${bE} / ${tE}</b><span class="petit discret">${tE ? (bE >= seuil ? 'Objectif atteint' : `Objectif : ${seuil}`) : 'sons en préparation'}</span></div>
          <div><span class="petit discret">Dire</span><b>${dits ? `${bons} / ${dits}` : '—'}</b><span class="petit discret">${dits ? 'mots reconnus comme le bon mot' : 'non noté (mode écoute)'}${oreille ? ` · ${oreille} jugé${oreille > 1 ? 's' : ''} à l’oreille` : ''}</span></div>
        </div>
        <p class="pro-honnete" style="margin-top:14px">${icones.info}<span>${echapper(honnete)}</span></p>
      </div>`;
    const parts = []; let total = 0;
    if (tE) { parts.push(bE); total += tE; }
    if (dits) { parts.push(bons); total += dits; }
    if (total) ctx.signaler.fin({ score: parts.reduce((a, b) => a + b, 0) / total, reussi: (tE ? bE >= seuil : true) && (dits ? bons === dits : true), points_obtenus: bE });
    else ctx.signaler.fin({ score: null, reussi: true, sans_note: true });
    S.sons?.jouer?.('fin');
  }

  afficherPaire();
  ctx.signaler.pret();
  return {
    demonter() { enregistreur?.detruire(); barre?.detruire(); },
    montrer() { racine.querySelector('.aide-barre [data-aide="montrer"]')?.click(); },
  };
}
