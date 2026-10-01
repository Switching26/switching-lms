// activities/jeux/mission.js — JEU-3 « Mission : le badge de Claire » (script/jeux.json de D, étape de type « mission »).
//
// Mardi, 8 h 55 : Daniel est en retard, Claire attend son badge à l'accueil. Quatre étapes où l'anglais sert
// à quelque chose : 1) le message vocal de Daniel et le plan de l'agence, 2) le badge à remplir, 3) ce qu'on
// dit à Claire à l'accueil, 4) le message à transmettre (étiquettes). Écran de fin sobre : « Mission accomplie ».
//
// Barème de D (8 points) : seule la réussite au premier essai, sans aide, rapporte les points de l'item.
// Aide (paliers de D : indice après 1 erreur, « Montrez-moi » après 2, solution après 3) : la barre d'aide du
// socle. « Montrez-moi » rejoue le message de Daniel avec la phrase utile surlignée mot à mot (badge : la
// réplique de Claire dans l'épisode, « I'm the new project manager »).
// Le message de Daniel se réécoute à toute étape (bouton dans la barre de progression de la mission).

import {
  el, icone, creerHasard, melanger, parametres, creerMinuteries, pointeurFin, retours, son,
  accueilJeu, pastille, listeErreurs, voixInfo, jouerVoix, prechargerVoix, prechargerImages, lecteurTranscrit,
  chargerOutilsB3, evaluer, rendreVisible, cssJeux,
} from './_jeux.js';

export const meta = { titre: 'Mission', entete: false };
const P = '.act-jeux-mission';
const REPLIQUE_CLAIRE_EPISODE = 'l01-vid-l03';   // « Hello! I'm Claire. I'm the new project manager. » (video.json de D)

const liste = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const maj = (s) => { const t = String(s || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const sansOui = (t) => maj(String(t || '').replace(/^\s*Oui\s*[:.,]\s*/i, '').trim());
const citation = (t) => String(t || '').match(/«\s*([^»]+?)\s*»/)?.[1] || null;
const MOTS_VIDES = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'is', 'are', 'am', 'and', 'very', 'this', 'to', 'by']);
const motsDe = (t) => String(t || '').toLowerCase().replace(/[’']/g, "'").split(/[^a-z']+/).filter(Boolean);

/* ── Lectures tolérantes du texte de D ─────────────────────────────────────────── */
function lireZones(etape) {
  const d = String(etape.decor || '');
  const noms = d.match(/zones touchables,\s*(.+?),\s*avec/i)?.[1]?.split(/,\s*/).map((s) => s.trim()).filter(Boolean) || [];
  const images = d.match(/V\d{2}/g) || [];
  if (noms.length === 4 && images.length >= 4) return noms.map((id, i) => ({ id, image: images[i] }));
  return [{ id: 'reception', image: 'V06' }, { id: 'office', image: 'V01' }, { id: 'meeting room', image: 'V03' }, { id: 'kitchen', image: 'V04' }];
}
function lireReperes(texte) {
  const res = [];
  for (const part of String(texte || '').split(';')) {
    const [gauche, ...droite] = part.split(':');
    const d = droite.join(':').trim();
    if (!d) continue;
    const [libelle, ...reste] = d.split(/,\s*revoir/i);
    const revoir = (reste.join(' ').match(/C\d/g)) || [];
    let m;
    if ((m = gauche.match(/moins de\s*(\d+)/i))) res.push({ min: 0, max: Number(m[1]) - 1, libelle: maj(libelle.trim()), revoir });
    else if ((m = gauche.match(/(\d+)\s*ou\s*(\d+)/i))) res.push({ min: Number(m[1]), max: Number(m[2]), libelle: maj(libelle.trim()), revoir });
    else if ((m = gauche.match(/(\d+)/))) res.push({ min: Number(m[1]), max: Infinity, libelle: maj(libelle.trim()), revoir });
  }
  return res;
}
function lireChamps(support) {
  const s = String(support || '');
  const val = (nom) => s.match(new RegExp(`${nom}\\s*:\\s*([^»]+?)\\s*»`, 'i'))?.[1] || null;
  return { nom: val('Name') || 'Claire Dubois', societe: val('Company') || 'Wren & Holt' };
}

export async function monter(racine, ctx) {
  ctx.ajouterStyle(cssJeux(P) + css(P));
  let etape = ctx.donnees;
  if (!etape?.etapes_mission) {
    try { etape = ((await ctx.script('jeux.json'))?.etapes || []).find((x) => x.type === 'mission') || null; } catch { etape = null; }
  }
  const EM = [...(etape?.etapes_mission || [])].sort((a, b) => a.n - b.n);
  if (EM.length < 4 || !EM[0].questions?.length || !EM[3].items?.length) {
    racine.replaceChildren(el('div', { class: 'carte', style: { padding: '20px' } }, el('p', { texte: 'Le contenu de la mission est en préparation.' })));
    ctx.signaler.pret();
    return { demonter() {} };
  }
  const [E1, E2, E3, E4] = EM;
  const [Q1, Q2] = E1.questions;

  const R = retours(ctx);
  const m = creerMinuteries(ctx.signal);
  const params = parametres(ctx);
  const audio = ctx.services.audio;
  const image = (id) => { try { return ctx.image(id); } catch { return null; } };
  await Promise.all([
    Promise.resolve(ctx.services.visuels?.pret?.()).catch(() => null),
    Promise.resolve(ctx.services.voix?.pret?.()).catch(() => null),
    chargerOutilsB3(),
  ]);
  const zones = lireZones(etape);
  const champs = lireChamps(E2.support);
  const reperes = lireReperes(etape.bareme?.reperes);
  const heure = String(etape.consigne?.fr || '').match(/^([A-ZÉa-zéû]+),\s*(\d+\s*h\s*\d+)/);
  const idMessage = E1.audio?.id;
  const texteMessage = E1.audio?.texte || '';
  prechargerVoix(ctx, [idMessage, E3.reponse_claire?.id, etape.fin?.audio?.id, REPLIQUE_CLAIRE_EPISODE].filter(Boolean));
  prechargerImages(['V11', 'P01', 'P02', 'P03', 'P04', E3.image, ...zones.map((z) => z.image)].map(image));

  /* Barème : un item = ses points, gagnés seulement au premier essai et sans aide. */
  const ITEMS = [
    { id: Q1.id, points: Number(Q1.points ?? 1) },
    { id: Q2.id, points: Number(Q2.points ?? 1) },
    { id: E2.saisie?.id || 'J3-Q3', points: Number(E2.points ?? 2) },
    { id: 'J3-accueil', points: Number(E3.points ?? 1) },
    ...E4.items.map((it) => ({ id: it.id, points: Number(E4.points ?? E4.items.length) / E4.items.length })),
  ];
  const TOTAL = Number(etape.bareme?.total) || ITEMS.reduce((s, i) => s + i.points, 0);

  let S = {};
  const cadre = el('div', { class: 'j-cadre' });
  racine.replaceChildren(cadre);

  /* ── Suivi des essais ──────────────────────────────────────────────────── */
  const fiche = (id) => { if (!S.fiches.has(id)) S.fiches.set(id, { essais: 0, premier: null, aide: false }); return S.fiches.get(id); };
  function noter(id, juste, d = {}) {
    const f = fiche(id);
    f.essais += 1;
    const premier = f.essais === 1;
    if (premier) f.premier = juste !== false && !f.aide;
    if (juste === false) S.erreurs.push({ element: d.element, donne: d.donne, attendu: d.attendu, explication: d.explication });
    try { ctx.signaler.essai({ juste, item: id, element: d.element, attendu: d.attendu, donne: d.donne, explication: d.explication, premier_essai: premier }); } catch { /* rien */ }
  }
  function aideVue(id) { const f = fiche(id); f.aide = true; if (f.premier === null) f.premier = false; }
  const points = () => ITEMS.reduce((s, it) => s + (S.fiches.get(it.id)?.premier === true ? it.points : 0), 0);

  /** Barre d'aide du socle pour un item (paliers de D), avec repli si le service manque. */
  function barreAide(id, { indice = undefined, surMontrer, surSolution }) {
    const service = ctx.services.aide;
    const opts = {
      indice,
      item: () => id,
      surMontrer: surMontrer ? () => { aideVue(id); surMontrer(); } : undefined,
      surSolution: surSolution ? () => { aideVue(id); surSolution(); } : undefined,
    };
    try { const b = service.barre(ctx, opts); if (b?.element) return b; } catch { /* repli */ }
    return { element: el('div', { hidden: true }), erreur() {}, nouvelItem() {}, detruire() {} };
  }

  /* ── Accueil de la mission ─────────────────────────────────────────────── */
  function afficherAccueil() {
    const meilleur = ctx.stockage.lire('meilleur', null);
    const pastilles = [
      heure ? pastille(ctx, 'chrono', `${heure[1]} · ${heure[2].replace(/\s+/g, ' ')}`) : null,
      pastille(ctx, 'epingle', `${EM.length} étapes, ${TOTAL} points`),
      pastille(ctx, 'etoilePleine', meilleur == null ? 'Première mission' : `Meilleur score : ${meilleur} sur ${TOTAL}`, meilleur == null ? '' : 'forte'),
    ].filter(Boolean);
    const personnages = el('div', { class: 'j-casting' },
      personnage('P01', 'Claire', 'attend à l’accueil'),
      personnage('P02', 'Daniel', 'en retard'));
    const etapes = el('ol', { class: 'j-plan-mission' }, ...EM.map((e) => el('li', {}, el('span', { class: 'j-num', texte: String(e.n) }), el('span', { texte: e.titre }))));
    const { element, bouton } = accueilJeu(ctx, etape, { pastilles, corps: el('div', { class: 'j-lobby-corps' }, personnages, etapes), bouton: 'Commencer la mission', surCommencer: () => lancer() });
    cadre.replaceChildren(element);
    ctx.signaler.progression(0);
    return bouton;
  }
  function personnage(idImage, nom, statut) {
    const src = image(idImage);
    return el('div', { class: 'j-perso' }, src ? el('img', { src, alt: '' }) : el('span', { class: 'j-perso-vide' }),
      el('span', {}, el('b', { texte: nom }), el('span', { class: 'petit discret', texte: statut })));
  }

  /* ── La mission ────────────────────────────────────────────────────────── */
  let Q = {};
  function lancer() {
    audio.arreter('media');
    m.toutArreter();
    S = { hasard: creerHasard(params.graine === undefined ? undefined : `${params.graine}-${(S.parties || 0)}`), parties: (S.parties || 0) + 1,
      fiches: new Map(), erreurs: [], etape: 0, job: null, phraseAccueil: null };
    Q = {};
    // Barre de progression de la mission + message de Daniel réécoutable à toute étape.
    Q.pas = EM.map((e) => el('li', { class: 'j-pas' }, el('span', { class: 'j-pas-num', texte: String(e.n) }), el('span', { class: 'j-pas-titre', texte: e.titre })));
    Q.titrePas = el('p', { class: 'j-pas-courant' });
    Q.btnMessage = el('button', { type: 'button', class: 'btn btn-secondaire j-reecouter', 'data-voix': '' });
    Q.btnMessage.innerHTML = `${icone(ctx, 'telephone')}<span>Message de Daniel</span>`;
    Q.btnMessage.setAttribute('aria-label', 'Réécouter le message vocal de Daniel');
    Q.btnMessage.hidden = !voixInfo(ctx, idMessage);
    Q.btnMessage.addEventListener('click', async () => {
      if (Q.btnMessage.classList.contains('joue')) { audio.arreter('media'); return; }
      Q.btnMessage.classList.add('joue');
      await jouerVoix(ctx, idMessage);
      Q.btnMessage.classList.remove('joue');
    });
    const tete = el('div', { class: 'j-tete' },
      heure ? el('span', { class: 'j-heure' }, el('span', { html: icone(ctx, 'chrono') }), `${heure[1]} · ${heure[2].replace(/\s+/g, ' ')}`) : null,
      Q.btnMessage);
    const progression = el('div', { class: 'carte j-progression' }, tete, el('ol', { class: 'j-pas-liste', 'aria-label': 'Étapes de la mission' }, ...Q.pas), Q.titrePas);
    Q.hote = el('div', { class: 'j-hote' });
    cadre.replaceChildren(el('div', { class: 'j-mission' }, progression, Q.hote));
    allerA(1);
  }

  function allerA(n) {
    S.etape = n;
    Q.pas.forEach((p, i) => {
      p.classList.toggle('fait', i < n - 1);
      p.classList.toggle('courant', i === n - 1);
      p.querySelector('.j-pas-num').innerHTML = i < n - 1 ? icone(ctx, 'coche') : String(i + 1);
      if (i === n - 1) p.setAttribute('aria-current', 'step'); else p.removeAttribute('aria-current');
    });
    Q.titrePas.textContent = `Étape ${n} sur ${EM.length} · ${EM[n - 1].titre}`;
    ctx.signaler.progression((n - 1) / EM.length);
    const vue = [null, etape1, etape2, etape3, etape4][n]();
    Q.hote.replaceChildren(vue);
    if (n > 1) { try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { /* rien */ } }
    const cible = vue.querySelector('[data-focus]');
    if (cible && n > 1) cible.focus({ preventScroll: true });
  }

  function enteteEtape(e, consigne) {
    return el('div', { class: 'j-etape-tete' },
      el('p', { class: 'j-surtitre', texte: `Étape ${e.n} sur ${EM.length}` }),
      el('h2', { class: 'j-etape-titre', tabindex: '-1', 'data-focus': '', texte: e.titre }),
      consigne ? el('p', { class: 'j-etape-consigne', texte: consigne }) : null);
  }
  function boutonSuite(texte, action) {
    const b = el('button', { type: 'button', class: 'btn btn-primaire j-suite apparait' });
    b.innerHTML = `<span>${texte}</span>${icone(ctx, 'suivant')}`;
    b.addEventListener('click', action);
    return b;
  }
  function afficherRetour(zone, noeud) { zone.replaceChildren(noeud); rendreVisible(noeud); }

  /* ── Étape 1 : le message vocal de Daniel + le plan ─────────────────────── */
  function etape1() {
    const carte = el('section', { class: 'carte j-etape j-etape-1 apparait' });
    carte.append(enteteEtape(E1, null));
    const vm = messagerie();
    const colonneG = el('div', { class: 'j-col' }, vm.element);
    const colonneD = el('div', { class: 'j-col' });

    // Q1 : toucher la zone du plan
    const plan = construirePlan();
    const retourQ1 = el('div', { class: 'j-retour' });
    const blocQ1 = el('div', { class: 'j-question' }, el('p', { class: 'j-q-texte', texte: Q1.question }), plan.element, retourQ1);
    const utile1 = citation(Q1.retours?.juste);
    const barre1 = barreAide(Q1.id, {
      surMontrer: () => vm.montrer(utile1, sansOui(Q1.retours?.juste), () => plan.montrer(Q1.bonne)),
      surSolution: () => resoudreQ1(true),
    });
    blocQ1.append(barre1.element);
    colonneD.append(blocQ1);
    let q1Fini = false;
    const essaisZones = new Set();
    plan.surZone = (id) => {
      if (q1Fini || essaisZones.has(id)) return;
      if (id === Q1.bonne) { noter(Q1.id, true, { element: Q1.question, attendu: Q1.bonne, donne: id }); resoudreQ1(false); return; }
      essaisZones.add(id);
      const cible = liste(Q1.retours?.cibles).find((c) => liste(c.si).includes(id));
      const explication = cible?.retour || Q1.retours?.faux_par_defaut || '';
      noter(Q1.id, false, { element: Q1.question, attendu: Q1.bonne, donne: id, explication });
      plan.marquer(id, 'faux');
      son(ctx, 'faux');
      afficherRetour(retourQ1, R.faux(explication));
      barre1.erreur();
    };
    function resoudreQ1(parSolution) {
      q1Fini = true;
      plan.marquer(Q1.bonne, 'juste');
      plan.poserBadges(Q1.bonne);
      plan.verrouiller();
      son(ctx, 'juste');
      barre1.detruire?.();
      barre1.element.remove();
      afficherRetour(retourQ1, parSolution
        ? R.reponse(`${maj(Q1.bonne)} : ${sansOui(Q1.retours?.juste)}`)
        : R.juste(Q1.retours?.juste || 'Oui.'));
      montrerQ2();
    }

    // Q2 : trois choix (apparaît quand Q1 est résolue)
    const blocQ2 = el('div', { class: 'j-question', hidden: true });
    colonneD.append(blocQ2);
    function montrerQ2() {
      blocQ2.hidden = false;
      const retourQ2 = el('div', { class: 'j-retour' });
      const choix = el('div', { class: 'j-choix', role: 'group', 'aria-label': Q2.question });
      const utile2 = citation(Q2.retours?.juste);
      const barre2 = barreAide(Q2.id, {
        surMontrer: () => vm.montrer(utile2, sansOui(Q2.retours?.juste)),
        surSolution: () => resoudreQ2(null, true),
      });
      for (const opt of melanger(liste(Q2.options), S.hasard)) {
        const b = el('button', { type: 'button', class: 'btn btn-secondaire j-option', lang: 'en', texte: opt });
        b.addEventListener('click', () => {
          if (blocQ2.dataset.fini) return;
          if (opt === Q2.bonne) { noter(Q2.id, true, { element: Q2.question, attendu: Q2.bonne, donne: opt }); resoudreQ2(b, false); return; }
          const explication = Q2.retours?.faux_par_defaut || '';
          noter(Q2.id, false, { element: Q2.question, attendu: Q2.bonne, donne: opt, explication });
          b.classList.add('faux'); b.disabled = true;
          son(ctx, 'faux');
          afficherRetour(retourQ2, R.faux(explication));
          barre2.erreur();
        });
        choix.append(b);
      }
      function resoudreQ2(bouton, parSolution) {
        blocQ2.dataset.fini = '1';
        const b = bouton || [...choix.children].find((x) => x.textContent === Q2.bonne);
        b?.classList.add('juste');
        for (const x of choix.children) x.disabled = true;
        plan.poserPersonnes(Q2.bonne);
        son(ctx, 'juste');
        barre2.element.remove();
        afficherRetour(retourQ2, parSolution ? R.reponse(`${Q2.bonne}. ${sansOui(Q2.retours?.juste)}`) : R.juste(Q2.retours?.juste || 'Oui.'));
        vm.revelerTranscription([utile1, utile2]);
        const suite = boutonSuite(`Étape suivante : ${E2.titre.toLowerCase()}`, () => allerA(2));
        blocQ2.append(suite);
        rendreVisible(suite);
      }
      blocQ2.append(el('p', { class: 'j-q-texte', texte: Q2.question }), choix, retourQ2, barre2.element);
      rendreVisible(blocQ2);
    }

    carte.append(el('div', { class: 'j-grille-etape' }, colonneG, colonneD));
    return carte;
  }

  /** Le message vocal de Daniel : lecture, remarque de langue après la 1re écoute, transcription mot à mot. */
  function messagerie() {
    const src = image('V11');
    const tr = lecteurTranscrit(ctx, idMessage, texteMessage);
    const zoneTr = el('div', { class: 'j-transcription', hidden: true }, el('p', { class: 'j-transcription-titre', texte: 'Le message de Daniel' }), tr.element);
    const remarque = el('div', { class: 'j-remarque', hidden: true });
    const noteLangue = E1.note_langue ? E1.note_langue.replace(/\s*Petite remarque affichée après l'écoute\.?\s*$/i, '') : null;
    const disponible = Boolean(voixInfo(ctx, idMessage));
    const duree = voixInfo(ctx, idMessage)?.duree_s;
    const lire = el('button', { type: 'button', class: 'btn btn-primaire j-lire', 'data-voix': '', disabled: !disponible });
    const majLire = (enCours) => { lire.innerHTML = `${icone(ctx, enCours ? 'pause' : 'lecture')}<span>${enCours ? 'Arrêter' : S.ecoute ? 'Réécouter le message' : 'Écouter le message'}</span>`; };
    majLire(false);
    const barre = el('span', { class: 'j-vm-barre', 'aria-hidden': 'true' }, el('span'));
    const temps = el('span', { class: 'j-vm-temps', texte: duree ? `0:${String(Math.round(duree)).padStart(2, '0')}` : '' });
    let enCours = false;
    async function jouer(utile = null) {
      if (enCours) { audio.arreter('media'); return 'arret'; }
      enCours = true;
      majLire(true);
      lire.parentElement?.parentElement?.classList.add('joue');
      const t0 = performance.now();
      const d = (duree || 11) * 1000;
      const anim = () => { if (!enCours) return; barre.firstChild.style.transform = `scaleX(${Math.min(1, (performance.now() - t0) / d)})`; m.image(anim); };
      m.image(anim);
      const r = await tr.jouer({ utile });
      if (ctx.signal.aborted) return r;
      enCours = false;
      barre.firstChild.style.transform = 'scaleX(0)';
      lire.parentElement?.parentElement?.classList.remove('joue');
      if (r === 'fin') {
        S.ecoute = true;
        if (noteLangue && remarque.hidden) { remarque.hidden = false; remarque.replaceChildren(R.info(noteLangue)); }
      }
      majLire(false);
      if (r === 'bloque') lire.focus();
      return r;
    }
    lire.addEventListener('click', () => { jouer(); });
    const element = el('div', { class: 'j-messagerie' },
      el('div', { class: 'j-vm-visuel' }, src ? el('img', { src, alt: 'Daniel presse le pas sur le quai.' }) : null,
        el('span', { class: 'j-vm-etiquette' }, el('span', { html: icone(ctx, 'telephone') }), 'Message vocal · Daniel')),
      el('div', { class: 'j-vm-commandes' }, lire, el('span', { class: 'j-vm-piste' }, barre, temps)),
      disponible ? null : el('p', { class: 'petit discret', lang: 'en', texte: texteMessage }),
      remarque, zoneTr);
    return {
      element,
      /** « Montrez-moi » : transcription visible, phrase utile surlignée, message rejoué ; puis la légende. */
      async montrer(utile, legende, apres) {
        zoneTr.hidden = false;
        if (utile) tr.marquer(utile);
        rendreVisible(zoneTr);
        const r = await jouer(utile);
        if (ctx.signal.aborted) return;
        if (legende && !zoneTr.querySelector('.encart')) zoneTr.append(R.info(legende));
        if (typeof apres === 'function') apres(r);
      },
      revelerTranscription(phrases) {
        zoneTr.hidden = false;
        tr.vider();
        tr.marquer(phrases);
      },
    };
  }

  /** Le plan de l'agence, dessiné en HTML : quatre pièces touchables, murs, portes, entrée. */
  function construirePlan() {
    const plan = el('div', { class: 'j-plan', role: 'group', 'aria-label': 'Plan de l’agence Wren & Holt' });
    const boutons = new Map();
    for (const z of zones) {
      const src = image(z.image);
      const b = el('button', { type: 'button', class: `j-zone j-zone-${z.id.replace(/\s+/g, '-')}`, 'data-zone': z.id, lang: 'en', 'aria-label': maj(z.id) },
        src ? el('img', { src, alt: '', draggable: 'false' }) : null,
        el('span', { class: 'j-zone-nom', texte: maj(z.id) }),
        el('span', { class: 'j-zone-occupants' }));
      b.addEventListener('click', () => api.surZone?.(z.id));
      boutons.set(z.id, b);
      plan.append(b);
    }
    const occupants = (id) => boutons.get(id)?.querySelector('.j-zone-occupants');
    const avatar = (idImage, titre) => { const s = image(idImage); return s ? el('img', { class: 'j-avatar apparait', src: s, alt: titre, title: '' }) : null; };
    const recep = zones.find((z) => /reception/.test(z.id))?.id;
    if (recep) occupants(recep)?.append(avatar('P01', 'Claire'));
    const api = {
      element: plan,
      surZone: null,
      marquer(id, etat) {
        const b = boutons.get(id);
        if (!b) return;
        b.classList.remove('faux', 'juste', 'montree');
        void b.offsetWidth;
        b.classList.add(etat);
        if (etat === 'faux') { b.setAttribute('aria-disabled', 'true'); m.apres(1400, () => b.classList.remove('faux')); b.classList.add('essayee'); }
      },
      montrer(id) { const b = boutons.get(id); if (b && !b.classList.contains('juste')) { b.classList.add('montree'); m.apres(2600, () => b.classList.remove('montree')); } },
      poserBadges(id) { const o = occupants(id); if (o) o.append(el('span', { class: 'j-pastille-badges apparait', title: '', html: icone(ctx, 'badge') })); },
      poserPersonnes(reponse) {
        const z = zones.find((x) => String(reponse || '').toLowerCase().includes(x.id));
        const o = z && occupants(z.id);
        if (o) { o.append(avatar('P03', 'Helen')); o.append(avatar('P04', 'Rob')); }
      },
      verrouiller() { for (const b of boutons.values()) { b.disabled = !b.classList.contains('juste'); b.tabIndex = -1; } },
    };
    return api;
  }

  /* ── Étape 2 : le badge ─────────────────────────────────────────────────── */
  function etape2() {
    const carte = el('section', { class: 'carte j-etape apparait' });
    carte.append(enteteEtape(E2, E2.consigne));
    const saisie = el('input', { type: 'text', class: 'j-badge-saisie', lang: 'en', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Job : le poste de Claire, en anglais', placeholder: '…' });
    const photo = image('P01');
    const badge = el('div', { class: 'j-badge', role: 'group', 'aria-label': 'Badge d’accès de Claire' },
      el('span', { class: 'j-badge-trou', 'aria-hidden': 'true' }),
      el('div', { class: 'j-badge-bande' }, el('span', { class: 'j-badge-sceau', texte: 'W&H' }), el('span', { class: 'j-badge-societe', texte: champs.societe })),
      el('div', { class: 'j-badge-corps' },
        photo ? el('img', { class: 'j-badge-photo', src: photo, alt: 'Photo de Claire' }) : el('span', { class: 'j-badge-photo' }),
        el('dl', { class: 'j-badge-champs', lang: 'en' },
          el('div', {}, el('dt', { texte: 'Name' }), el('dd', { texte: champs.nom })),
          el('div', { class: 'j-badge-job' }, el('dt', {}, el('label', { texte: 'Job' })), el('dd', {}, saisie)),
          el('div', {}, el('dt', { texte: 'Company' }), el('dd', { texte: champs.societe })))));
    saisie.id = `j-job-${Math.random().toString(36).slice(2, 8)}`;
    badge.querySelector('label').setAttribute('for', saisie.id);
    const valider = el('button', { type: 'button', class: 'btn btn-primaire', texte: 'Valider le badge' });
    const retour = el('div', { class: 'j-retour' });
    const idQ3 = E2.saisie?.id || 'J3-Q3';
    const replique = voixInfo(ctx, REPLIQUE_CLAIRE_EPISODE);
    const zoneMontrer = el('div', { class: 'j-transcription', hidden: true });
    const barre = barreAide(idQ3, {
      indice: '',
      surMontrer: replique ? async () => {
        const tr = lecteurTranscrit(ctx, REPLIQUE_CLAIRE_EPISODE, replique.texte);
        zoneMontrer.hidden = false;
        zoneMontrer.replaceChildren(el('p', { class: 'j-transcription-titre', texte: 'Claire se présente dans l’épisode' }), tr.element);
        rendreVisible(zoneMontrer);
        await tr.jouer({ utile: citation(E2.retours?.faux_par_defaut) || 'project manager' });
      } : undefined,
      surSolution: () => { terminer(true); },
    });
    let fini = false;
    function terminer(parSolution, r = null) {
      fini = true;
      const attendue = liste(E2.saisie?.reponse?.attendues)[0] || 'project manager';
      S.job = attendue;
      saisie.value = attendue;
      saisie.readOnly = true;
      badge.classList.add('rempli');
      valider.remove();
      barre.element.remove();
      son(ctx, 'juste');
      if (parSolution) afficherRetour(retour, R.reponse(`${attendue}. ${sansOui(E2.retours?.juste)}`));
      else if (r?.verdict === 'presque') afficherRetour(retour, R.presque(r.note || E2.retours?.presque || 'Accepté.', { correction: attendue }));
      else afficherRetour(retour, R.juste(E2.retours?.juste || 'Oui.'));
      const suite = boutonSuite(`Étape suivante : ${E3.titre.toLowerCase()}`, () => allerA(3));
      carte.append(suite);
      rendreVisible(suite);
    }
    function verifier() {
      if (fini) return;
      const r = evaluer(saisie.value, E2.saisie?.reponse || {}, E2.retours || {});
      if (r.verdict === 'vide') { afficherRetour(retour, R.info('Écrivez le poste de Claire en anglais, puis validez.')); saisie.focus(); return; }
      const attendue = liste(E2.saisie?.reponse?.attendues)[0] || 'project manager';
      if (r.verdict === 'juste' || r.verdict === 'presque') {
        noter(idQ3, r.verdict === 'juste' ? true : 'presque', { element: 'Job', attendu: attendue, donne: saisie.value.trim(), explication: r.verdict === 'presque' ? (r.note || E2.retours?.presque) : undefined });
        terminer(false, r);
        return;
      }
      const explication = r.retour || E2.retours?.faux_par_defaut || '';
      noter(idQ3, false, { element: 'Job', attendu: attendue, donne: saisie.value.trim(), explication });
      son(ctx, 'faux');
      badge.classList.remove('secoue'); void badge.offsetWidth; badge.classList.add('secoue');
      afficherRetour(retour, R.faux(explication));
      barre.erreur();
      saisie.select();
    }
    valider.addEventListener('click', verifier);
    saisie.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); verifier(); } });
    carte.append(el('div', { class: 'j-badge-scene' }, badge), el('div', { class: 'j-actions' }, valider), retour, zoneMontrer, barre.element);
    return carte;
  }

  /* ── Étape 3 : à l'accueil ──────────────────────────────────────────────── */
  function etape3() {
    const carte = el('section', { class: 'carte j-etape apparait' });
    carte.append(enteteEtape(E3, E3.consigne));
    const fond = image(E3.image || 'V06');
    const fil = el('div', { class: 'j-fil', 'aria-live': 'polite' });
    const scene = el('div', { class: 'j-accueil-scene' }, fond ? el('img', { class: 'j-accueil-fond', src: fond, alt: 'L’accueil de Wren & Holt.' }) : null,
      el('div', { class: 'j-accueil-claire' }, image('P01') ? el('img', { src: image('P01'), alt: '' }) : null, el('span', { texte: 'Claire' })));
    const choix = el('div', { class: 'j-choix j-choix-phrases', role: 'group', 'aria-label': E3.consigne });
    const retour = el('div', { class: 'j-retour' });
    const bonne = liste(E3.options).find((o) => o.statut === 'juste');
    let fini = false;
    for (const opt of melanger(liste(E3.options), S.hasard)) {
      const b = el('button', { type: 'button', class: 'j-phrase-choix', lang: 'en' }, el('span', { class: 'j-guillemet', 'aria-hidden': 'true', texte: '“' }), el('span', { texte: opt.texte }));
      b.addEventListener('click', async () => {
        if (fini || b.disabled) return;
        if (opt.statut === 'juste') {
          fini = true;
          noter('J3-accueil', true, { element: E3.consigne, attendu: opt.texte, donne: opt.texte });
          S.phraseAccueil = opt.texte;
          b.classList.add('juste');
          for (const x of choix.children) x.disabled = true;
          son(ctx, 'juste');
          afficherRetour(retour, R.juste(opt.retour || 'Oui.'));
          await dialogue(opt.texte);
          return;
        }
        noter('J3-accueil', false, { element: E3.consigne, attendu: bonne?.texte, donne: opt.texte, explication: opt.retour });
        b.classList.add('faux');
        b.disabled = true;
        son(ctx, 'faux');
        afficherRetour(retour, R.faux(opt.retour || ''));
      });
      choix.append(b);
    }
    async function dialogue(phrase) {
      choix.hidden = true;
      fil.append(el('div', { class: 'j-bulle j-bulle-vous apparait', lang: 'en' }, el('span', { class: 'j-bulle-qui', texte: 'Vous' }), el('p', { texte: phrase })));
      await m.attendre(650);
      if (ctx.signal.aborted) return;
      const rep = E3.reponse_claire;
      const gl = liste(E3.glossaire)[0];
      const ecouter = el('button', { type: 'button', class: 'btn btn-fantome j-bulle-ecouter', 'aria-label': 'Réécouter Claire', 'data-voix': '', html: icone(ctx, 'ecouter') });
      ecouter.addEventListener('click', () => jouerVoix(ctx, rep?.id));
      const bulle = el('div', { class: 'j-bulle j-bulle-claire apparait' },
        image('P01') ? el('img', { class: 'j-bulle-avatar', src: image('P01'), alt: '' }) : null,
        el('div', { class: 'j-bulle-corps' }, el('span', { class: 'j-bulle-qui', texte: 'Claire' }),
          el('p', { lang: 'en', texte: rep?.texte || '' }),
          gl ? el('p', { class: 'j-glose' }, el('b', { lang: 'en', texte: gl.en }), ` ${gl.fr}`) : null),
        voixInfo(ctx, rep?.id) ? ecouter : null);
      fil.append(bulle);
      rendreVisible(bulle);
      const suite = boutonSuite(`Étape suivante : ${E4.titre.toLowerCase()}`, () => allerA(4));
      carte.append(suite);
      await jouerVoix(ctx, rep?.id);
    }
    carte.append(scene, fil, choix, retour);
    return carte;
  }

  /* ── Étape 4 : transmettre le message (étiquettes) ─────────────────────── */
  function etape4() {
    const carte = el('section', { class: 'carte j-etape apparait' });
    carte.append(enteteEtape(E4, E4.consigne));
    const morceaux = String(E4.texte_avec_trous || '').split(/\[(\d+)\]/);
    const texte = el('p', { class: 'j-trous', lang: 'en' });
    const trous = [];
    morceaux.forEach((mc, i) => {
      if (i % 2 === 0) { if (mc) texte.append(mc); return; }
      const item = E4.items[Number(mc) - 1];
      if (!item) return;
      const t = el('button', { type: 'button', class: 'j-trou-msg', 'aria-label': `Trou ${mc}, vide` }, ' ');
      const trou = { n: Number(mc), item, noeud: t, fini: false };
      t.addEventListener('click', () => { if (!trou.fini) activer(trou); });
      trous.push(trou);
      texte.append(t);
    });
    // La phrase du message de Daniel qui aide pour chaque trou (mots après le trou, sinon celle du trou précédent).
    const phrasesMessage = texteMessage.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) || [texteMessage];
    const phraseUtile = (trou, k) => {
      const suite = morceaux[k * 2 + 2] || '';
      const mots = motsDe(suite.split(/[.!?]/)[0]).filter((w) => !MOTS_VIDES.has(w));
      const trouvee = phrasesMessage.find((ph) => mots.some((w) => motsDe(ph).includes(w)));
      return trouvee || (k > 0 ? phraseUtile(trous[k - 1], k - 1) : null);
    };
    const bulle = el('div', { class: 'j-bulle j-bulle-vous j-bulle-large' }, el('span', { class: 'j-bulle-qui', texte: 'Vous, à Claire' }), texte);
    const banque = el('div', { class: 'j-banque', role: 'group', 'aria-label': 'Étiquettes' });
    const retour = el('div', { class: 'j-retour' });
    const zoneMontrer = el('div', { class: 'j-transcription', hidden: true });
    let actif = null;
    let barre = null;
    const hoteBarre = el('div', { class: 'j-hote-barre' });
    function activer(trou) {
      actif = trou;
      for (const t of trous) { t.noeud.classList.toggle('actif', t === trou); t.noeud.setAttribute('aria-pressed', String(t === trou)); }
      barre?.element.remove();
      const k = trous.indexOf(trou);
      barre = barreAide(trou.item.id, {
        surMontrer: async () => {
          const utile = phraseUtile(trou, k);
          const tr = lecteurTranscrit(ctx, idMessage, texteMessage);
          zoneMontrer.hidden = false;
          zoneMontrer.replaceChildren(el('p', { class: 'j-transcription-titre', texte: 'Le message de Daniel' }), tr.element);
          if (utile) tr.marquer(utile);
          rendreVisible(zoneMontrer);
          await tr.jouer({ utile });
          if (ctx.signal.aborted) return;
          zoneMontrer.append(R.info(sansOui(trou.item.retours?.juste)));
        },
        surSolution: () => placer(trou.item.bonne, { solution: true }),
      });
      hoteBarre.replaceChildren(barre.element);
    }
    for (const mot of melanger(liste(E4.banque), S.hasard)) {
      const b = el('button', { type: 'button', class: 'j-etiquette', lang: 'en', texte: mot });
      b.addEventListener('click', () => placer(mot, { bouton: b }));
      banque.append(b);
    }
    function placer(mot, { bouton = null, solution = false } = {}) {
      if (!actif || actif.fini) return;
      const trou = actif;
      const it = trou.item;
      const b = bouton || [...banque.children].find((x) => x.textContent === mot && !x.hidden);
      if (mot === it.bonne) {
        if (!solution) noter(it.id, true, { element: E4.texte_avec_trous, attendu: it.bonne, donne: mot });
        trou.fini = true;
        trou.noeud.textContent = mot;
        trou.noeud.classList.remove('actif', 'faux');
        trou.noeud.classList.add('juste');
        trou.noeud.setAttribute('aria-label', `Trou ${trou.n} : ${mot}`);
        trou.noeud.disabled = true;
        if (b) { b.hidden = true; }
        son(ctx, 'juste');
        afficherRetour(retour, solution ? R.reponse(`${mot}. ${sansOui(it.retours?.juste)}`) : R.juste(it.retours?.juste || 'Oui.'));
        zoneMontrer.hidden = true;
        const suivant = trous.find((t) => !t.fini);
        if (suivant) activer(suivant);
        else fin4();
        return;
      }
      const cible = liste(it.retours?.cibles).find((c) => liste(c.si).includes(mot));
      const explication = cible?.retour || it.retours?.faux_par_defaut || '';
      noter(it.id, false, { element: E4.texte_avec_trous, attendu: it.bonne, donne: mot, explication });
      trou.noeud.textContent = mot;
      trou.noeud.classList.remove('faux'); void trou.noeud.offsetWidth;
      trou.noeud.classList.add('faux');
      m.apres(900, () => { if (!trou.fini) { trou.noeud.textContent = ' '; trou.noeud.classList.remove('faux'); } });
      son(ctx, 'faux');
      afficherRetour(retour, R.faux(explication));
      barre?.erreur();
    }
    function fin4() {
      barre?.element.remove();
      banque.hidden = true;
      bulle.classList.add('complete');
      const suite = boutonSuite('Terminer la mission', () => finir());
      carte.append(suite);
      rendreVisible(suite);
    }
    carte.append(bulle, banque, retour, zoneMontrer, hoteBarre);
    activer(trous[0]);
    return carte;
  }

  /* ── Fin : « Mission accomplie » ───────────────────────────────────────── */
  async function finir() {
    audio.arreter('media');
    const pts = points();
    const ancien = ctx.stockage.lire('meilleur', null);
    if (ancien == null || pts > ancien) ctx.stockage.ecrire('meilleur', pts);
    const repere = reperes.find((r) => pts >= r.min && pts <= r.max) || null;
    try { ctx.tracer('jeu_termine', { jeu: 'mission', points: pts, total: TOTAL }); } catch { /* rien */ }
    try { ctx.signaler.fin({ score: Math.round((pts / TOTAL) * 100) / 100, points_obtenus: pts }); } catch { /* rien */ }
    ctx.signaler.progression(1);
    Q.pas.forEach((p) => { p.classList.add('fait'); p.classList.remove('courant'); p.querySelector('.j-pas-num').innerHTML = icone(ctx, 'coche'); });
    Q.titrePas.textContent = 'Mission accomplie';
    son(ctx, 'fin');

    const carte = el('section', { class: 'carte j-fin apparait' });
    const sceau = el('div', { class: 'j-sceau', html: icone(ctx, 'sceau') });
    carte.append(el('div', { class: 'j-fin-tete' }, sceau, el('div', {},
      el('p', { class: 'j-surtitre', texte: 'Mission : le badge de Claire' }),
      el('h2', { class: 'j-titre-fin', texte: 'Mission accomplie' }))));

    // Daniel arrive.
    const fa = etape.fin?.audio;
    if (fa) {
      const ecouter = el('button', { type: 'button', class: 'btn btn-fantome j-bulle-ecouter', 'aria-label': 'Réécouter Daniel', 'data-voix': '', html: icone(ctx, 'ecouter') });
      ecouter.addEventListener('click', () => jouerVoix(ctx, fa.id));
      carte.append(el('div', { class: 'j-bulle j-bulle-claire' },
        image('P02') ? el('img', { class: 'j-bulle-avatar', src: image('P02'), alt: '' }) : null,
        el('div', { class: 'j-bulle-corps' }, el('span', { class: 'j-bulle-qui', texte: 'Daniel' }), el('p', { lang: 'en', texte: fa.texte }),
          etape.fin?.fr ? el('p', { class: 'j-glose', texte: etape.fin.fr }) : null),
        voixInfo(ctx, fa.id) ? ecouter : null));
    }

    const score = el('div', { class: 'j-fin-score' }, el('span', { class: 'j-fin-nombre', texte: String(pts) }), el('span', { class: 'j-fin-unite', texte: `sur ${TOTAL}` }));
    carte.append(el('div', { class: 'j-fin-bilan' }, score, repere ? el('p', { class: 'j-repere', texte: repere.libelle }) : null));
    if (ancien != null && pts > ancien) carte.append(pastille(ctx, 'etoilePleine', `Nouveau meilleur score · avant : ${ancien} sur ${TOTAL}`, 'forte'));
    if (repere?.revoir?.length) {
      let titres = repere.revoir;
      try {
        const c = await ctx.script('comprendre.json');
        titres = repere.revoir.map((id) => c?.etapes?.find((x) => x.id === id)?.titre || id);
      } catch { /* on garde les identifiants */ }
      if (ctx.signal.aborted) return;
      carte.append(R.info(`À revoir : ${titres.map((t) => `« ${t} »`).join(' et ')}.`));
    }

    // Les phrases de la mission.
    const phrases = el('div', { class: 'j-rappel' }, el('h3', { texte: 'Les phrases de votre mission' }));
    const ligne = (titre, texte) => el('div', { class: 'j-rappel-ligne' }, el('span', { class: 'j-rappel-titre', texte: titre }), el('p', { lang: 'en', texte }));
    phrases.append(ligne('Le poste de Claire', `Job: ${S.job || liste(E2.saisie?.reponse?.attendues)[0] || ''}`));
    const bonneAccueil = liste(E3.options).find((o) => o.statut === 'juste')?.texte;
    phrases.append(ligne('À Claire, à l’accueil', S.phraseAccueil || bonneAccueil || ''));
    phrases.append(ligne('Votre message à Claire', String(E4.texte_avec_trous || '').replace(/\[(\d+)\]/g, (_, n) => E4.items[Number(n) - 1]?.bonne || '')));
    const tr = lecteurTranscrit(ctx, idMessage, texteMessage);
    const reecouter = el('button', { type: 'button', class: 'btn btn-secondaire', 'data-voix': '' });
    reecouter.innerHTML = `${icone(ctx, 'ecouter')}<span>Réécouter Daniel</span>`;
    reecouter.addEventListener('click', () => tr.jouer());
    phrases.append(el('div', { class: 'j-rappel-ligne' }, el('span', { class: 'j-rappel-titre', texte: 'Le message de Daniel' }), tr.element, voixInfo(ctx, idMessage) ? reecouter : null));
    carte.append(phrases);

    const actions = el('div', { class: 'j-actions' });
    if (pts < TOTAL && S.erreurs.length) {
      const zone = el('div', { class: 'j-erreurs-zone', hidden: true }, listeErreurs(S.erreurs.filter((e, i, t) => e.explication && t.findIndex((x) => x.explication === e.explication && x.donne === e.donne) === i)));
      const revoir = el('button', { type: 'button', class: 'btn btn-secondaire', 'aria-expanded': 'false', texte: 'Revoir mes erreurs' });
      revoir.addEventListener('click', () => {
        zone.hidden = !zone.hidden;
        revoir.setAttribute('aria-expanded', String(!zone.hidden));
        revoir.textContent = zone.hidden ? 'Revoir mes erreurs' : 'Masquer mes erreurs';
        if (!zone.hidden) rendreVisible(zone);
      });
      actions.append(revoir);
      carte.append(zone);
    }
    const rejouer = el('button', { type: 'button', class: 'btn btn-primaire' });
    rejouer.innerHTML = `${icone(ctx, 'rejouer')}<span>Rejouer la mission</span>`;
    rejouer.addEventListener('click', () => lancer());
    actions.prepend(rejouer);
    carte.append(actions);
    Q.hote.replaceChildren(carte);
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { /* rien */ }
    rejouer.focus({ preventScroll: true });
    R.annoncer(`Mission accomplie : ${pts} points sur ${TOTAL}.`);
    if (fa) { await m.attendre(500); if (!ctx.signal.aborted) jouerVoix(ctx, fa.id); }
  }

  const bouton = afficherAccueil();
  ctx.signaler.pret();
  if (bouton && pointeurFin()) bouton.focus({ preventScroll: true });
  return {
    demonter() { m.toutArreter(); },
  };
}

function css(p) {
  return `
${p} .j-cadre { max-width: 900px; }
${p} .j-accueil { max-width: var(--largeur-lecture, 760px); width: 100%; margin: 0 auto; }
${p} .j-lobby-corps { display: grid; gap: 12px; }
${p} .j-casting { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
${p} .j-perso { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--rayon-bloc); border: 1px solid var(--filet); background: var(--fond); min-width: 0; }
${p} .j-perso img, ${p} .j-perso-vide { flex: none; width: 48px; height: 48px; border-radius: 50%; object-fit: cover; object-position: 50% 18%; background: var(--filet); }
${p} .j-perso > span:last-child { display: grid; gap: 1px; min-width: 0; }
${p} .j-plan-mission { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
${p} .j-plan-mission li { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 0.95rem; color: var(--encre-70); }
${p} .j-num { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 0.8125rem; font-weight: 700; background: var(--marque-voile); color: var(--marque-tres-fonce); }
@media (max-width: 559px) { ${p} .j-plan-mission { display: none; } ${p} .j-perso { padding: 8px 10px; gap: 10px; } ${p} .j-perso img, ${p} .j-perso-vide { width: 40px; height: 40px; } }

${p} .j-mission { display: flex; flex-direction: column; gap: 14px; }
${p} .j-progression { padding: 12px 14px; display: grid; gap: 10px; }
@media (min-width: 768px) and (min-height: 700px) { ${p} .j-progression { padding: 14px 18px; position: sticky; top: calc(76px + var(--haut-sur, 0px)); z-index: 6; } }
${p} .j-tete { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
${p} .j-heure { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.875rem; color: var(--encre-70); font-variant-numeric: tabular-nums; }
${p} .j-heure svg { width: 18px; height: 18px; color: var(--marque); }
${p} .j-reecouter { min-height: 40px; padding: 0.4rem 0.8rem; font-size: 0.875rem; }
${p} .j-reecouter.joue { color: var(--marque-tres-fonce); border-color: var(--marque-voile-bord); background: var(--marque-voile); }
${p} .j-pas-liste { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
${p} .j-pas { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 0.8125rem; font-weight: 600; color: var(--encre-50); }
${p} .j-pas::after { content: ''; flex: 1; height: 2px; border-radius: 2px; background: var(--filet); min-width: 8px; }
${p} .j-pas:last-child::after { display: none; }
${p} .j-pas-num { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 0.8125rem; font-weight: 700; border: 2px solid var(--filet-fort); color: var(--encre-50); background: var(--surface); transition: background-color 0.25s, border-color 0.25s, color 0.25s; }
${p} .j-pas-num svg { width: 14px; height: 14px; }
${p} .j-pas-titre { display: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (min-width: 900px) { ${p} .j-pas-titre { display: block; } ${p} .j-pas::after { display: none; } ${p} .j-pas-courant { display: none; } }
${p} .j-pas.courant .j-pas-num { border-color: var(--marque); background: var(--marque); color: #fff; }
${p} .j-pas.courant { color: var(--encre); }
${p} .j-pas.fait .j-pas-num { border-color: var(--marque); color: var(--marque); background: var(--marque-voile); }
${p} .j-pas.fait::after { background: var(--marque-voile-bord); }
${p} .j-pas-courant { margin: 0; font-size: 0.875rem; font-weight: 700; color: var(--encre); }

${p} .j-etape { padding: 18px 16px 18px; display: flex; flex-direction: column; gap: 14px; scroll-margin-top: 180px; }
@media (min-width: 768px) { ${p} .j-etape { padding: 24px 26px; gap: 16px; } }
${p} .j-etape-tete { display: grid; gap: 4px; }
${p} .j-etape-titre { font-family: var(--police-titre); font-weight: 600; font-size: clamp(1.25rem, 1.05rem + 0.8vw, 1.55rem); outline: none; }
${p} .j-etape-consigne { font-weight: 500; font-size: 1rem; color: var(--encre-70); margin-top: 2px; }
${p} .j-grille-etape { display: grid; gap: 16px; }
@media (min-width: 900px) { ${p} .j-grille-etape { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: start; gap: 24px; } }
${p} .j-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
${p} .j-question { display: flex; flex-direction: column; gap: 10px; }
${p} .j-q-texte { font-weight: 700; font-size: 1.02rem; }
${p} .j-retour:empty { display: none; }
${p} .j-retour { display: grid; gap: 8px; }
${p} .j-suite { align-self: stretch; min-height: 50px; }
@media (min-width: 640px) { ${p} .j-suite { align-self: flex-start; } }

/* Message vocal */
${p} .j-messagerie { display: grid; gap: 10px; }
${p} .j-vm-visuel { position: relative; border-radius: var(--rayon-bloc); overflow: hidden; aspect-ratio: 2.3 / 1; background: var(--fond); }
${p} .j-vm-visuel img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 40%; }
${p} .j-vm-visuel::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(12,21,40,0.72) 0%, rgba(12,21,40,0) 55%); }
${p} .j-vm-etiquette { position: absolute; left: 12px; bottom: 10px; z-index: 1; display: inline-flex; align-items: center; gap: 8px; color: #fff; font-weight: 700; font-size: 0.95rem; }
${p} .j-vm-etiquette svg { width: 18px; height: 18px; }
${p} .j-vm-commandes { display: flex; align-items: center; gap: 12px; }
${p} .j-lire { flex: none; }
${p} .j-vm-piste { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; }
${p} .j-vm-barre { flex: 1; height: 6px; border-radius: 999px; background: var(--filet); overflow: hidden; }
${p} .j-vm-barre > span { display: block; height: 100%; background: linear-gradient(90deg, var(--marque), var(--marque-clair)); transform-origin: left center; transform: scaleX(0); }
${p} .j-vm-temps { font-size: 0.8125rem; font-weight: 600; color: var(--encre-50); font-variant-numeric: tabular-nums; }
${p} .j-transcription { display: grid; gap: 8px; padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); }
${p} .j-transcription-titre { font-size: 0.8125rem; font-weight: 700; color: var(--encre-50); text-transform: uppercase; letter-spacing: 0.05em; }

/* Plan de l'agence */
${p} .j-plan { position: relative; display: grid; grid-template-columns: 1.35fr 1fr; grid-template-rows: 1.15fr 1fr;
  grid-template-areas: 'office meeting' 'reception kitchen'; gap: 5px; padding: 5px; border-radius: 16px; background: #2B2F3A; aspect-ratio: 1.3 / 1; box-shadow: var(--ombre-carte-forte); }
${p} .j-zone { position: relative; overflow: hidden; border: 0; padding: 0; border-radius: 6px; cursor: pointer; background: var(--fond); min-width: 0; min-height: 0; touch-action: manipulation; transition: transform 0.2s var(--ressort), box-shadow 0.2s, filter 0.2s; }
${p} .j-zone-office { grid-area: office; border-top-left-radius: 11px; }
${p} .j-zone-meeting-room { grid-area: meeting; border-top-right-radius: 11px; }
${p} .j-zone-reception { grid-area: reception; border-bottom-left-radius: 11px; }
${p} .j-zone-kitchen { grid-area: kitchen; border-bottom-right-radius: 11px; }
${p} .j-zone > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
${p} .j-zone::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(12,21,40,0.78) 0%, rgba(12,21,40,0.05) 58%); transition: background 0.2s; }
${p} .j-zone-nom { position: absolute; left: 10px; bottom: 8px; z-index: 1; color: #fff; font-weight: 700; font-size: clamp(0.875rem, 0.8rem + 0.35vw, 1.02rem); letter-spacing: 0.01em; text-shadow: 0 1px 2px rgba(0,0,0,0.35); }
${p} .j-zone-occupants { position: absolute; top: 8px; right: 8px; z-index: 1; display: flex; gap: 4px; }
${p} .j-avatar { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; object-position: 50% 18%; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
${p} .j-pastille-badges { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--marque); color: #fff; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
${p} .j-pastille-badges svg { width: 18px; height: 18px; }
${p} .j-zone:focus-visible { outline: 3px solid var(--marque-clair); outline-offset: 2px; z-index: 2; }
@media (hover: hover) { ${p} .j-zone:not(:disabled):hover::after { background: linear-gradient(to top, rgba(27,42,74,0.78) 0%, rgba(27,42,74,0.12) 60%); } }
${p} .j-zone:not(:disabled):active { transform: scale(0.98); }
${p} .j-zone.essayee { filter: grayscale(0.6) brightness(0.85); }
${p} .j-zone.faux { box-shadow: inset 0 0 0 3px var(--faux); animation: j-secoue 0.35s ease-in-out; }
${p} .j-zone.juste { box-shadow: inset 0 0 0 3px var(--juste); filter: none; }
${p} .j-zone.juste .j-zone-nom { background: var(--juste); padding: 2px 8px; border-radius: 999px; text-shadow: none; }
${p} .j-zone.montree { box-shadow: inset 0 0 0 3px var(--marque-clair); animation: j-appel 1.2s ease-in-out 2; }
${p} .j-zone:disabled { cursor: default; }
@keyframes j-appel { 0%, 100% { box-shadow: inset 0 0 0 3px var(--marque-clair); } 50% { box-shadow: inset 0 0 0 6px var(--marque-clair); } }
@keyframes j-secoue { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }

/* Choix */
${p} .j-choix { display: flex; flex-wrap: wrap; gap: 8px; }
${p} .j-option { font-size: 1rem; }
${p} .j-option.faux, ${p} .j-phrase-choix.faux { border-color: var(--faux-bord); background: var(--faux-voile); color: var(--faux-fonce); text-decoration: line-through; opacity: 1; }
${p} .j-option.juste, ${p} .j-phrase-choix.juste { border-color: var(--juste); background: var(--juste-voile); color: var(--juste-fonce); opacity: 1; }
${p} .j-choix-phrases { flex-direction: column; max-width: 680px; }
${p} .j-phrase-choix { display: flex; gap: 10px; align-items: flex-start; text-align: left; width: 100%; min-height: 52px; padding: 12px 14px; border-radius: var(--rayon-bloc); border: 1px solid var(--filet); background: var(--surface); font: inherit; font-size: 1.02rem; font-weight: 600; color: var(--encre); cursor: pointer; transition: border-color 0.15s, background-color 0.15s, transform 0.15s var(--ressort); }
@media (hover: hover) { ${p} .j-phrase-choix:not(:disabled):hover { border-color: var(--marque-voile-bord); background: var(--marque-voile); } }
${p} .j-phrase-choix:not(:disabled):active { transform: scale(0.99); }
${p} .j-phrase-choix:disabled { cursor: default; }
${p} .j-guillemet { font-family: var(--police-titre); font-size: 1.6rem; line-height: 0.9; color: var(--marque); }

/* Badge */
${p} .j-badge-scene { display: grid; place-items: center; padding: 18px 8px 6px; border-radius: var(--rayon-bloc); background: repeating-linear-gradient(135deg, var(--fond) 0 12px, #F2F0EB 12px 13px); }
${p} .j-badge { position: relative; width: min(100%, 400px); border-radius: 16px; background: var(--surface); box-shadow: 0 18px 36px rgba(12,21,40,0.16), 0 2px 6px rgba(12,21,40,0.08); overflow: hidden; border: 1px solid var(--filet); }
${p} .j-badge.secoue { animation: j-secoue 0.35s ease-in-out; }
${p} .j-badge.rempli { box-shadow: 0 0 0 3px var(--juste-bord), 0 18px 36px rgba(12,21,40,0.16); }
${p} .j-badge-trou { position: absolute; top: 8px; left: 50%; width: 42px; height: 8px; margin-left: -21px; border-radius: 999px; background: var(--fond); box-shadow: inset 0 1px 2px rgba(12,21,40,0.25); z-index: 1; }
${p} .j-badge-bande { display: flex; align-items: center; gap: 10px; padding: 24px 16px 12px; color: #fff;
  background: radial-gradient(90% 120% at 20% 0%, rgba(129,140,248,0.45) 0%, rgba(129,140,248,0) 60%), linear-gradient(160deg, var(--j-nuit) 0%, var(--j-nuit-2) 100%); }
${p} .j-badge-sceau { font-family: var(--police-titre); font-style: italic; font-weight: 600; font-size: 1.1rem; letter-spacing: 0.05em; color: rgba(224,231,255,0.85); padding-right: 10px; border-right: 1px solid rgba(255,255,255,0.25); }
${p} .j-badge-societe { font-weight: 600; letter-spacing: 0.02em; font-size: 0.95rem; }
${p} .j-badge-corps { display: grid; grid-template-columns: 96px 1fr; gap: 14px; padding: 14px 16px 16px; align-items: start; }
${p} .j-badge-photo { width: 96px; height: 120px; border-radius: 10px; object-fit: cover; object-position: 50% 15%; background: var(--filet); }
${p} .j-badge-champs { margin: 0; display: grid; gap: 8px; min-width: 0; }
${p} .j-badge-champs > div { display: grid; gap: 1px; min-width: 0; }
${p} .j-badge-champs dt { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--encre-50); }
${p} .j-badge-champs dd { margin: 0; font-weight: 700; font-size: 1rem; color: var(--encre); overflow-wrap: anywhere; }
${p} .j-badge-saisie { width: 100%; min-height: 44px; padding: 6px 10px; border: 0; border-bottom: 2px dashed var(--marque-voile-bord); border-radius: 8px 8px 0 0; background: var(--marque-voile); font-weight: 700; font-size: 16px; color: var(--marque-tres-fonce); outline: none; }
${p} .j-badge-saisie:focus { border-bottom-style: solid; border-bottom-color: var(--marque); background: #DDE3EC; }
${p} .j-badge.rempli .j-badge-saisie { background: transparent; border-bottom-color: transparent; color: var(--encre); padding-left: 0; }
@media (max-width: 380px) { ${p} .j-badge-corps { grid-template-columns: 76px 1fr; } ${p} .j-badge-photo { width: 76px; height: 96px; } }

/* Accueil et dialogue */
${p} .j-accueil-scene { position: relative; border-radius: var(--rayon-bloc); overflow: hidden; aspect-ratio: 2.4 / 1; max-height: 230px; width: 100%; background: var(--fond); }
${p} .j-accueil-fond { width: 100%; height: 100%; object-fit: cover; object-position: 50% 55%; }
${p} .j-accueil-claire { position: absolute; left: 12px; bottom: 10px; display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; border-radius: 999px; background: rgba(255,255,255,0.92); font-weight: 700; font-size: 0.875rem; box-shadow: 0 4px 12px rgba(12,21,40,0.18); }
${p} .j-accueil-claire img { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; object-position: 50% 18%; }
${p} .j-fil { display: grid; gap: 10px; }
${p} .j-fil:empty { display: none; }
${p} .j-bulle { position: relative; display: flex; gap: 10px; align-items: flex-start; max-width: 92%; padding: 10px 14px; border-radius: 18px; }
${p} .j-bulle p { margin: 0; font-size: 1.02rem; font-weight: 600; line-height: 1.45; }
${p} .j-bulle-qui { display: block; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.75; margin-bottom: 2px; }
${p} .j-bulle-vous { justify-self: end; margin-left: auto; flex-direction: column; gap: 0; background: var(--marque); color: #fff; border-bottom-right-radius: 6px; }
${p} .j-bulle-claire { background: var(--surface); border: 1px solid var(--filet); border-bottom-left-radius: 6px; box-shadow: var(--ombre-carte); }
${p} .j-bulle-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; object-fit: cover; object-position: 50% 18%; }
${p} .j-bulle-corps { flex: 1; min-width: 0; display: grid; gap: 2px; }
${p} .j-glose { font-size: 0.925rem !important; font-weight: 400 !important; color: var(--encre-70); }
${p} .j-glose b { font-weight: 700; color: var(--encre); }
${p} .j-bulle-ecouter { flex: none; width: 44px; padding: 0; }

/* Étiquettes */
${p} .j-bulle-large { max-width: 100%; width: 100%; padding: 14px 16px; }
${p} .j-trous { font-size: clamp(1.1rem, 1rem + 0.5vw, 1.3rem) !important; line-height: 2.1 !important; }
${p} .j-trou-msg { display: inline-block; min-width: 4.2em; min-height: 36px; padding: 0 10px; margin: 0 2px; vertical-align: baseline; border-radius: 10px; border: 2px dashed rgba(255,255,255,0.55); background: rgba(255,255,255,0.12); color: #fff; font: inherit; font-weight: 700; line-height: 32px; cursor: pointer; text-align: center; transition: background-color 0.15s, border-color 0.15s; }
${p} .j-trou-msg.actif { border-style: solid; border-color: #fff; background: rgba(255,255,255,0.24); box-shadow: 0 0 0 3px rgba(255,255,255,0.25); }
${p} .j-trou-msg.juste { border-style: solid; border-color: var(--j-juste-clair); background: rgba(110,231,183,0.2); color: #fff; cursor: default; }
${p} .j-trou-msg.faux { border-style: solid; border-color: var(--j-faux-clair); background: rgba(253,164,175,0.25); animation: j-secoue 0.35s ease-in-out; }
${p} .j-trou-msg:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
${p} .j-bulle-large.complete .j-trou-msg { border-color: transparent; background: rgba(255,255,255,0.14); }
${p} .j-banque { display: flex; flex-wrap: wrap; gap: 8px; }
${p} .j-etiquette { min-height: 46px; min-width: 64px; padding: 8px 16px; border-radius: 12px; border: 1px solid var(--marque-voile-bord); background: var(--surface); color: var(--marque-tres-fonce); font: inherit; font-weight: 700; font-size: 1.05rem; cursor: pointer; box-shadow: 0 2px 0 var(--marque-voile-bord); transition: transform 0.12s var(--ressort), background-color 0.15s; touch-action: manipulation; }
@media (hover: hover) { ${p} .j-etiquette:hover { background: var(--marque-voile); } }
${p} .j-etiquette:active { transform: translateY(1px) scale(0.98); box-shadow: 0 1px 0 var(--marque-voile-bord); }
${p} .j-etiquette:focus-visible { outline: 3px solid var(--marque-clair); outline-offset: 2px; }

/* Fin */
${p} .j-fin { padding: 20px 16px 18px; display: flex; flex-direction: column; gap: 16px; }
@media (min-width: 768px) { ${p} .j-fin { padding: 26px 28px 24px; max-width: var(--largeur-lecture, 760px); width: 100%; margin: 0 auto; } }
${p} .j-fin-tete { display: flex; align-items: center; gap: 14px; }
${p} .j-sceau { flex: none; width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; color: #fff;
  background: radial-gradient(90% 90% at 30% 20%, rgba(129,140,248,0.6) 0%, rgba(129,140,248,0) 60%), linear-gradient(160deg, var(--j-nuit) 0%, var(--j-nuit-2) 100%);
  box-shadow: 0 0 0 4px var(--marque-voile), 0 10px 24px rgba(27,42,74,0.25); animation: j-sceau 0.6s var(--ressort) both; }
${p} .j-sceau svg { width: 32px; height: 32px; }
@keyframes j-sceau { from { transform: scale(0.6) rotate(-12deg); opacity: 0; } to { transform: none; opacity: 1; } }
${p} .j-fin > .j-pastille { align-self: flex-start; }
${p} .j-fin-bilan { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
${p} .j-fin-score { display: flex; align-items: baseline; gap: 8px; }
${p} .j-fin-nombre { font-family: var(--police-titre); font-weight: 600; font-size: clamp(2.8rem, 2.3rem + 2.5vw, 3.8rem); line-height: 1; color: var(--encre); font-variant-numeric: tabular-nums; }
${p} .j-fin-unite { font-size: 1.05rem; font-weight: 600; color: var(--encre-50); }
${p} .j-repere { font-weight: 700; color: var(--marque-tres-fonce); padding: 4px 12px; border-radius: 999px; background: var(--marque-voile); }
${p} .j-rappel { display: grid; gap: 10px; }
${p} .j-rappel h3 { font-size: 1rem; }
${p} .j-rappel-ligne { display: grid; gap: 6px; padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); }
${p} .j-rappel-ligne > p { font-weight: 600; font-size: 1.02rem; }
${p} .j-rappel-ligne .btn { justify-self: start; }
${p} .j-rappel-titre { font-size: 0.8125rem; font-weight: 700; color: var(--encre-50); text-transform: uppercase; letter-spacing: 0.05em; }
${p} .j-erreurs-zone { display: grid; }
`;
}
