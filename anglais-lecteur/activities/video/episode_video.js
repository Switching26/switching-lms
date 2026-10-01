import { adresse, modeLMS } from '../../services/base.js';
import { requete as fetch } from '../../services/base.js';
// Épisode vidéo interactif — agent B1.
//
// Un vrai fichier mp4 (monté par B1 avec ffmpeg : plans de V, voix de l'outil de voix), et par-dessus
// un lecteur qui apprend : sous-titres synchronisés mot à mot (anglais, anglais + français, aucun),
// mots cliquables vers « Mon carnet », réécoute d'une réplique, lecture ralentie, quatre pauses avec
// une question de compréhension expliquée, mode « répéter après le personnage » noté mot par mot,
// puis une transcription interactive où les formes de be sont surlignées.
//
// Données : ctx.donnees (étape VID de script/video.json, écrite par D) + la chronologie du montage
// (assets/video-montage/episode-l01.json : début et fin de chaque réplique et de chaque mot, pauses).

import { personnage, ICONES, echapper, decouperMots, repererExpressions, estFormeDeBe, normaliserMot, retourTypo, typo } from './_commun.js';

// En-tête du socle remplacé par un en-tête compact : sur téléphone, la vidéo doit rester en haut
// de l'écran, avec ses sous-titres et ses commandes visibles sans faire défiler.
export const meta = { titre: 'Épisode vidéo interactif', entete: false };

const REGIMES = { comprendre: 'À comprendre', a_vous_de_jouer: 'À vous de jouer', evaluation: 'Évaluation' };

const CHRONO = 'assets/video-montage/episode-l01.json';

export async function monter(racine, ctx) {
  if (!ctx.medias?.video) return (await import('../multi/storyboard.js')).monter(racine, ctx);
  ctx.ajouterStyle(CSS);
  const S = ctx.services || {};
  const R = retourTypo(S.retour);
  const etape = ctx.donnees?.repliques ? ctx.donnees
    : (await ctx.script('video.json')).etapes.find((e) => e.type === 'episode_video');
  const chrono = ctx.medias.video.chronologie || await (await fetch(ctx.medias.video.chrono, { signal: ctx.signal, cache: 'no-cache' })).json();

  // ── Données ───────────────────────────────────────────────────────────────
  const scriptRepl = new Map(etape.repliques.map((r) => [r.id, r]));
  const lignes = chrono.repliques
    .filter((l) => scriptRepl.has(l.id))
    .map((l) => {
      const r = scriptRepl.get(l.id);
      const mots = l.mots?.length ? l.mots : decouperMots(r.en).map((m, i, a) => ({ mot: m, debut: l.debut + (l.fin - l.debut) * i / a.length, fin: l.debut + (l.fin - l.debut) * (i + 1) / a.length }));
      return { ...l, r, mots, expressions: repererExpressions(mots.map((m) => m.mot), r.mots_cliquables || []) };
    });
  const pauses = chrono.pauses
    .map((p) => ({ ...p, q: etape.pauses.find((x) => x.id === p.id) }))
    .filter((p) => p.q)
    .sort((a, b) => a.t - b.t);
  const plans = chrono.plans || [];
  const duree = Number(chrono.duree) || 0;
  const glossaire = lireGlossaire(etape);
  const prefs = { soustitres: 'en', lent: false, ...(ctx.stockage?.lire('prefs', {}) || {}) };
  const regime = ctx.regime || etape.regime || 'a_vous_de_jouer';
  const [titreSur, titreFr] = (() => {
    const t = String(etape.titre || 'Épisode 1');
    const i = t.indexOf(':');
    return i > 0 ? [t.slice(0, i).trim(), t.slice(i + 1).trim().replace(/^./, (c) => c.toUpperCase())] : ['Épisode', t];
  })();
  const titreEn = String(etape.titre_en || '').split('—').slice(1).join('—').trim();

  const st = {
    mode: 'accueil',          // accueil | lecture | question | repeter | fin
    lecture: false,
    vuMax: 0,
    pctSignale: 0,
    paliersTraces: new Set(),
    ligne: -1,                // réplique affichée
    mot: -1,
    frLigne: false,           // traduction de la réplique courante dévoilée
    extrait: null,            // { fin, apres } : lecture d'un extrait (réécoute), puis pause
    pauses: new Map(),        // id → { essais, premierJuste, fait }
    repetees: new Set(),      // répliques déjà proposées en mode répéter pendant ce passage
    repeter: false,
    glose: null,
    raf: 0,
    prise: null,
  };

  // ── Structure ─────────────────────────────────────────────────────────────
  const assetVideo = chemin => adresse(ctx.medias.video.prefixe + String(chemin || '').replace(/^\/+/, ''));
  const hd = assetVideo(chrono.fichiers.hd);
  const sd = assetVideo(chrono.fichiers.sd);
  const lente = navigator.connection && (navigator.connection.saveData || /(^|-)2g|3g/.test(navigator.connection.effectiveType || ''));
  racine.innerHTML = `
    <div class="ev" data-mode="accueil">
      <div class="ev-scene">
        <video playsinline webkit-playsinline preload="metadata" ${chrono.fichiers.affiche ? `poster="${echapper(assetVideo(chrono.fichiers.affiche))}"` : ''} aria-label="${echapper(etape.titre || 'Épisode vidéo')}">
          <source src="${echapper(lente ? sd : hd)}" type='video/mp4; codecs="${lente ? 'avc1.4D401F' : 'avc1.640028'}, mp4a.40.2"'>
          ${chrono.fichiers.webm ? `<source src="${echapper(assetVideo(chrono.fichiers.webm))}" type='video/webm; codecs="vp9, opus"'>` : ''}
        </video>
        <div class="ev-carton" aria-hidden="true"></div>
        <div class="ev-voile" hidden><span class="ev-voile-texte"></span></div>
        <button type="button" class="ev-demarrer">
          <span class="ev-couverture" aria-hidden="true">
            <span class="ev-couverture-sur">${echapper(titreSur)}</span>
            <span class="ev-couverture-titre">${echapper(titreFr)}</span>
            ${titreEn ? `<span class="ev-couverture-en" lang="en">${echapper(titreEn)}</span>` : ''}
          </span>
          <span class="ev-demarrer-rond">${ICONES.lecture}</span>
          <span class="ev-demarrer-texte">Regarder l'épisode <span class="ev-demarrer-duree">${formatDuree(duree)}</span></span>
        </button>
        ${chrono.provisoire?.visuels ? '<span class="ev-provisoire">Images provisoires</span>' : ''}
      </div>
      <section class="consigne-etape ev-intro">
        <span class="regime regime-${echapper(regime)}">${echapper(REGIMES[regime] || 'À vous de jouer')}</span>
        ${etape.objectif_apprenant ? `<p class="objectif">${ICONES.coche}<span><b>Objectif</b> ${echapper(etape.objectif_apprenant)}</span></p>` : ''}
        ${etape.consigne?.fr ? `<p class="consigne">${echapper(etape.consigne.fr)}${etape.consigne.en ? `<span class="en" lang="en">${echapper(etape.consigne.en)}</span>` : ''}</p>` : ''}
      </section>
      <div class="ev-temps">
        <div class="ev-piste" role="slider" tabindex="0" aria-label="Position dans l'épisode" aria-valuemin="0" aria-valuemax="${Math.round(duree)}" aria-valuenow="0">
          <div class="ev-piste-fond"><div class="ev-piste-vu"></div><div class="ev-piste-lu"></div></div>
          ${pauses.map((p, i) => `<span class="ev-repere" data-pause="${p.id}" style="left:${(100 * p.t / duree).toFixed(2)}%" title="Question ${i + 1}"></span>`).join('')}
          <span class="ev-curseur"></span>
        </div>
        <span class="ev-horloge"><span class="ev-t">0:00</span> / ${formatDuree(duree)}</span>
      </div>
      <section class="ev-panneau" aria-label="Sous-titres">
        <div class="ev-qui"><span class="ev-nom"></span><span class="ev-etat"></span>
          <button type="button" class="ev-fr" aria-pressed="false" hidden>FR</button></div>
        <p class="ev-ligne" lang="en"></p>
        <p class="ev-trad" lang="fr" hidden></p>
        <div class="ev-glose" hidden></div>
        ${chrono.provisoire?.voix ? '<p class="ev-note-voix">Les voix des personnages arrivent : pour l\'instant, l\'épisode est muet, suivez les sous-titres.</p>' : ''}
      </section>
      <section class="ev-question carte" hidden aria-live="polite"></section>
      <section class="ev-repeter carte" hidden aria-live="polite"></section>
      <div class="ev-commandes" role="toolbar" aria-label="Commandes de l'épisode">
        <button type="button" class="ev-cmd" data-cmd="replique">${ICONES.rejouer}<span>Réplique</span></button>
        <button type="button" class="ev-cmd ev-cmd--principal" data-cmd="lecture">${ICONES.lecture}<span>Lecture</span></button>
        <button type="button" class="ev-cmd" data-cmd="lent" aria-pressed="${prefs.lent}">${ICONES.lent}<span>Lent</span></button>
        <button type="button" class="ev-cmd" data-cmd="soustitres">${ICONES.sousTitres}<span class="ev-cmd-st"></span></button>
        <button type="button" class="ev-cmd" data-cmd="repeter" aria-pressed="false">${ICONES.repeter}<span>Répéter</span></button>
      </div>
      <section class="ev-fin" hidden></section>
    </div>`;

  const $ = (s) => racine.querySelector(s);
  const boite = $('.ev');
  const video = $('video');
  const carton = $('.ev-carton');
  const voile = $('.ev-voile');
  const piste = $('.ev-piste');
  const lu = $('.ev-piste-lu');
  const vu = $('.ev-piste-vu');
  const curseur = $('.ev-curseur');
  const horloge = $('.ev-t');
  const panneau = $('.ev-panneau');
  const nom = $('.ev-nom');
  const etat = $('.ev-etat');
  const btnFr = $('.ev-fr');
  const ligneEl = $('.ev-ligne');
  const trad = $('.ev-trad');
  const glose = $('.ev-glose');
  const zoneQ = $('.ev-question');
  const zoneR = $('.ev-repeter');
  const zoneFin = $('.ev-fin');
  const cmd = (n) => racine.querySelector(`[data-cmd="${n}"]`);

  video.playbackRate = prefs.lent ? 0.75 : 1;
  video.preservesPitch = true;
  if ('webkitPreservesPitch' in video) video.webkitPreservesPitch = true;
  majSousTitresBouton();

  // ── Lecture ───────────────────────────────────────────────────────────────
  async function jouer() {
    try { S.guide?.arreter?.(); } catch { /* guide absent */ }
    video.playbackRate = prefs.lent ? 0.75 : 1;
    try {
      await video.play();
    } catch (e) {
      if (e?.name !== 'AbortError') montrerDemarrer(true);
    }
  }
  function mettreEnPause() { video.pause(); }

  function montrerDemarrer(oui) { $('.ev-demarrer').hidden = !oui; }

  video.addEventListener('play', () => {
    st.lecture = true;
    if (st.mode === 'accueil') changerMode('lecture');
    montrerDemarrer(false);
    majBoutonLecture();
    boucle();
  });
  video.addEventListener('pause', () => { st.lecture = false; majBoutonLecture(); cancelAnimationFrame(st.raf); rendre(video.currentTime); });
  video.addEventListener('ended', () => { st.lecture = false; majBoutonLecture(); terminer(); });
  video.addEventListener('seeked', () => rendre(video.currentTime));
  // Avec des balises <source>, l'échec se signale sur la dernière source essayée, pas sur la vidéo.
  const sources = [...video.querySelectorAll('source')];
  sources[sources.length - 1]?.addEventListener('error', () => {
    if (racine.querySelector('.ev-panne')) return;
    boite.insertAdjacentHTML('afterbegin', '<p class="ev-panne encart encart-info">La vidéo ne se charge pas. Vérifiez la connexion puis rechargez la page.</p>');
  });
  video.addEventListener('click', () => { if (st.mode === 'lecture') basculer(); });

  function basculer() {
    if (st.mode === 'question' || st.mode === 'repeter') return;
    if (video.paused) { if (st.mode === 'fin') revoir(prefs.soustitres); else jouer(); } else mettreEnPause();
  }

  function boucle() {
    cancelAnimationFrame(st.raf);
    const pas = () => {
      if (video.paused) return;
      const t = video.currentTime;
      if (!controler(t)) return;
      rendre(t);
      st.raf = requestAnimationFrame(pas);
    };
    st.raf = requestAnimationFrame(pas);
  }

  /** Arrêts programmés : fin d'extrait, pauses de question, mode répéter. Rend false si on s'arrête. */
  function controler(t) {
    if (st.extrait) {
      if (t >= st.extrait.fin) {
        const apres = st.extrait.apres;
        st.extrait = null;
        video.pause();
        apres?.();
        return false;
      }
      return true;
    }
    if (st.mode !== 'lecture') return true;
    if (st.repeter) {
      const l = lignes.find((x) => t >= x.fin + 0.08 && t < x.fin + 0.9 && !st.repetees.has(x.id));
      if (l) { st.repetees.add(l.id); video.pause(); ouvrirRepeter(l); return false; }
    }
    const p = pauses.find((x) => !st.pauses.get(x.id)?.fait && t >= x.t - 0.02 && t < x.t + 1.2);
    if (p) { video.pause(); video.currentTime = p.t; ouvrirQuestion(p); return false; }
    return true;
  }

  // ── Rendu de l'instant t ──────────────────────────────────────────────────
  function rendre(t) {
    const d = duree || video.duration || 1;
    const f = Math.min(1, t / d);
    st.vuMax = Math.max(st.vuMax, t);
    lu.style.transform = `scaleX(${f})`;
    vu.style.transform = `scaleX(${Math.min(1, st.vuMax / d)})`;
    curseur.style.left = `${(f * 100).toFixed(2)}%`;
    horloge.textContent = formatDuree(t);
    piste.setAttribute('aria-valuenow', String(Math.round(t)));
    piste.setAttribute('aria-valuetext', `${formatDuree(t)} sur ${formatDuree(d)}`);
    signalerVu(d);

    // Carton du titre (plan 2)
    const planCarton = plans.find((p) => p.carton && t >= p.debut + 0.3 && t < p.fin - 0.5);
    if (planCarton && !carton.dataset.plan) {
      carton.innerHTML = `<span class="ev-carton-sur">${echapper(planCarton.carton.en.split('—')[0].trim())}</span><span class="ev-carton-titre" lang="en">${echapper((planCarton.carton.en.split('—')[1] || planCarton.carton.en).trim())}</span><span class="ev-carton-fr">${echapper((planCarton.carton.fr.split('—')[1] || planCarton.carton.fr).trim())}</span>`;
      carton.dataset.plan = String(planCarton.n);
    }
    carton.classList.toggle('visible', !!planCarton);
    if (!planCarton && carton.dataset.plan) delete carton.dataset.plan;

    // Réplique : celle qui se dit, sinon la dernière dite dans le même plan.
    let i = lignes.findIndex((l) => t >= l.debut - 0.05 && t < l.fin + 0.05);
    let active = i >= 0;
    if (i < 0) {
      const plan = plans.find((p) => t >= p.debut && t < p.fin);
      for (let k = lignes.length - 1; k >= 0; k--) {
        if (lignes[k].fin <= t && (!plan || lignes[k].plan === plan.n || st.mode !== 'lecture')) { i = k; break; }
      }
      if (i >= 0 && plan && lignes[i].plan !== plan.n && st.mode === 'lecture') i = -1;
    }
    if (i !== st.ligne) afficherLigne(i);
    boite.classList.toggle('ev-parle', active && !video.paused);
    if (i >= 0) {
      const l = lignes[i];
      let m = -1;
      if (active) for (let k = 0; k < l.mots.length; k++) { if (t >= l.mots[k].debut - 0.03) m = k; else break; }
      else if (t >= l.fin) m = l.mots.length - 1;
      const cle = `${m}:${active}`;
      if (cle !== st.mot) {
        st.mot = cle;
        ligneEl.querySelectorAll('.ev-mot').forEach((s) => {
          const k = Number(s.dataset.i);
          s.classList.toggle('dit', k <= m);
          s.classList.toggle('actuel', active && k === m);
        });
      }
    }
  }

  function afficherLigne(i) {
    st.ligne = i;
    st.mot = -2;
    st.frLigne = false;
    fermerGlose(false);
    if (i < 0) {
      nom.textContent = ''; etat.textContent = ''; ligneEl.innerHTML = ''; trad.hidden = true; btnFr.hidden = true;
      panneau.classList.add('vide');
      return;
    }
    panneau.classList.remove('vide');
    const l = lignes[i];
    const p = personnage(l.personnage);
    nom.textContent = p.nom;
    nom.style.color = p.couleur;
    etat.textContent = l.pensee ? 'pense' : '';
    ligneEl.classList.toggle('pensee', !!l.pensee);
    ligneEl.innerHTML = htmlLigne(l, { karaoke: true });
    trad.textContent = typo(l.r.fr);
    majTraduction();
  }

  function majTraduction() {
    const aucun = prefs.soustitres === 'aucun';
    panneau.classList.toggle('sans', aucun);
    ligneEl.hidden = aucun;
    const montrerFr = st.ligne >= 0 && !aucun && (prefs.soustitres === 'en-fr' || st.frLigne);
    trad.hidden = !montrerFr;
    btnFr.hidden = st.ligne < 0 || aucun || prefs.soustitres === 'en-fr';
    btnFr.setAttribute('aria-pressed', String(st.frLigne));
    if (aucun && st.ligne >= 0) {
      etat.innerHTML = `${lignes[st.ligne].pensee ? 'pense · ' : ''}<span class="ev-ondes" aria-hidden="true"><i></i><i></i><i></i></span><span class="visuellement-cache">parle</span>`;
    } else if (st.ligne >= 0) etat.textContent = lignes[st.ligne].pensee ? 'pense' : '';
  }

  function htmlLigne(l, { karaoke = false, be = false } = {}) {
    const debutExpr = new Map(l.expressions.map((x) => [x.debut, x]));
    let html = '';
    for (let k = 0; k < l.mots.length; k++) {
      const x = debutExpr.get(k);
      if (x) {
        const inner = [];
        for (let q = x.debut; q <= x.fin; q++) inner.push(motHtml(l, q, be));
        html += `<button type="button" class="ev-expr" data-ligne="${l.id}" data-expr="${echapper(x.expression)}" data-de="${x.debut}" data-a="${x.fin}" aria-label="${echapper(x.expression)} : voir la traduction">${inner.join(' ')}</button> `;
        k = x.fin;
      } else html += `${motHtml(l, k, be)} `;
    }
    return html.trim();
    function motHtml(li, q, surligner) {
      const m = li.mots[q].mot;
      const cls = `ev-mot${!karaoke ? ' dit' : ''}${surligner && estFormeDeBe(m) ? ' ev-be' : ''}`;
      return `<span class="${cls}" data-i="${q}">${echapper(m)}</span>`;
    }
  }

  // ── Mots cliquables → sens → « Mon carnet » ───────────────────────────────
  racine.addEventListener('click', (e) => {
    const b = e.target.closest('.ev-expr');
    if (!b || !racine.contains(b)) return;
    const l = lignes.find((x) => x.id === b.dataset.ligne);
    if (!l) return;
    ouvrirGlose(l, b.dataset.expr, Number(b.dataset.de), Number(b.dataset.a), b.closest('.ev-fin') ? b.closest('.ev-fin-ligne') : null);
  });

  function ouvrirGlose(l, expr, de, a, dansFin) {
    const reprendre = !video.paused && st.mode === 'lecture';
    if (reprendre) mettreEnPause();
    const g = glossaire.get(normaliserExpr(expr));
    const dejaCarnet = (() => { try { return !!S.carnet?.contient?.(expr); } catch { return false; } })();
    const html = `
      <div class="ev-glose-tete">
        <span class="ev-glose-mot" lang="en">${echapper(expr)}</span>
        ${g ? `<span class="ev-glose-sens">${echapper(g.fr)}</span>` : ''}
        <button type="button" class="ev-glose-fermer btn btn-fantome btn-rond" aria-label="Fermer">${ICONES.croix}</button>
      </div>
      ${g?.note ? `<p class="ev-glose-note">${echapper(g.note)}</p>` : ''}
      ${g ? '' : `<p class="ev-glose-note"><span class="ev-glose-etiquette">Traduction de la réplique</span> ${echapper(l.r.fr)}</p>`}
      <div class="ev-glose-actions">
        <button type="button" class="btn btn-secondaire" data-g="ecouter">${ICONES.ecouter}<span>Écouter</span></button>
        <button type="button" class="btn btn-secondaire" data-g="carnet" ${dejaCarnet ? 'disabled' : ''}>${dejaCarnet ? ICONES.coche : ICONES.carnet}<span>${dejaCarnet ? 'Dans mon carnet' : 'Ajouter au carnet'}</span></button>
      </div>`;
    const cible = dansFin ? dansFin.querySelector('.ev-glose-fin') : glose;
    zoneFin.querySelectorAll('.ev-glose-fin').forEach((z) => { if (z !== cible) { z.hidden = true; z.innerHTML = ''; } });
    if (!dansFin) glose.hidden = false;
    cible.hidden = false;
    cible.innerHTML = html;
    st.glose = { l, expr, reprendre, cible };
    try { ctx.tracer?.('mot_consulte', { item: `${l.id}:${expr}` }); } catch { /* traces facultatives */ }
    cible.querySelector('.ev-glose-fermer').addEventListener('click', () => fermerGlose(true));
    cible.querySelector('[data-g="ecouter"]').addEventListener('click', () => {
      const t0 = Math.max(0, l.mots[de].debut - 0.08);
      const t1 = l.mots[a].fin + 0.12;
      const retour = video.currentTime;
      jouerExtrait(t0, t1, () => { video.currentTime = retour; });
    });
    const bc = cible.querySelector('[data-g="carnet"]');
    bc.addEventListener('click', () => {
      try {
        S.carnet?.ajouter?.({ mot: expr, sens: g?.fr || l.r.fr, exemple: l.r.en, audio: l.r.segment?.id });
        bc.disabled = true;
        bc.innerHTML = `${ICONES.coche}<span>Dans mon carnet</span>`;
        S.sons?.jouer?.('clic');
        R?.annoncer?.(`« ${expr} » est dans votre carnet.`);
      } catch { /* carnet absent */ }
    });
    cible.querySelector('[data-g="ecouter"]').focus({ preventScroll: true });
    montrerDansEcran(cible);
  }

  function fermerGlose(reprendreLecture) {
    if (!st.glose) return;
    const { reprendre, cible } = st.glose;
    st.glose = null;
    cible.hidden = true;
    cible.innerHTML = '';
    if (reprendreLecture && reprendre && st.mode === 'lecture') jouer();
  }

  // ── Extraits (réécouter une réplique ou un mot) ───────────────────────────
  function jouerExtrait(debut, fin, apres) {
    st.extrait = { fin, apres };
    video.currentTime = Math.max(0, debut);
    jouer();
  }

  function rejouerLignes(ids, { surligner = false } = {}) {
    const liste = ids.map((id) => lignes.find((l) => l.id === id)).filter(Boolean);
    if (!liste.length) return;
    const retour = video.currentTime;
    const modeAvant = st.mode;
    panneau.hidden = false;
    boite.classList.toggle('ev-surligne', surligner);
    let k = 0;
    const suivante = () => {
      if (k >= liste.length) {
        boite.classList.remove('ev-surligne');
        video.currentTime = retour;
        if (modeAvant === 'question') panneau.hidden = prefs.soustitres === 'aucun' ? true : panneau.hidden;
        return;
      }
      const l = liste[k++];
      jouerExtrait(l.debut - 0.05, l.fin + 0.15, suivante);
    };
    suivante();
  }

  // ── Questions de compréhension ────────────────────────────────────────────
  let barre = null;
  function ouvrirQuestion(p) {
    changerMode('question');
    const rang = pauses.indexOf(p) + 1;
    const suivi = st.pauses.get(p.id) || { essais: 0, premierJuste: null, fait: false };
    st.pauses.set(p.id, suivi);
    voile.hidden = false;
    voile.querySelector('.ev-voile-texte').textContent = `Question ${rang} sur ${pauses.length}`;
    panneau.hidden = true;
    const q = p.q;
    zoneQ.innerHTML = `
      <p class="ev-q-sur">Question ${rang} sur ${pauses.length}</p>
      <h3 class="ev-q-titre" id="evq-${p.id}">${echapper(q.question)}</h3>
      ${q.question_en ? `<p class="ev-q-en" lang="en">${echapper(q.question_en)}</p>` : ''}
      <div class="ev-q-options" role="group" aria-labelledby="evq-${p.id}">
        ${q.options.map((o, i) => `<button type="button" class="ev-option" data-o="${i}"${/^[a-z]+$/.test(o) ? ' lang="en"' : ''}><span class="ev-option-texte">${echapper(o)}</span><span class="ev-option-icone"></span></button>`).join('')}
      </div>
      <div class="ev-q-retour"></div>
      <div class="ev-q-aide"></div>
      <div class="ev-q-pied">
        <button type="button" class="btn btn-secondaire" data-q="rejouer">${ICONES.rejouer}<span>Réécouter ${q.rejouer?.length > 1 ? 'les répliques' : 'la réplique'}</span></button>
        <button type="button" class="btn btn-primaire" data-q="continuer" hidden>Continuer la vidéo ${ICONES.suite}</button>
      </div>`;
    zoneQ.hidden = false;
    zoneQ.classList.remove('apparait'); void zoneQ.offsetWidth; zoneQ.classList.add('apparait');

    barre = null;
    if (ctx.regime !== 'evaluation' && S.aide?.barre) {
      try {
        barre = S.aide.barre(ctx, {
          item: () => `VID-${p.id}`,
          surMontrer: () => rejouerLignes(q.rejouer || [], { surligner: true }),
          surSolution: () => montrerSolution(p, { signale: true }),
        });
        barre.nouvelItem?.();
        zoneQ.querySelector('.ev-q-aide').append(barre.element);
      } catch { barre = null; }
    }

    zoneQ.querySelector('[data-q="rejouer"]').addEventListener('click', () => rejouerLignes(q.rejouer || []));
    zoneQ.querySelector('[data-q="continuer"]').addEventListener('click', () => fermerQuestion(p));
    zoneQ.querySelectorAll('.ev-option').forEach((b) => b.addEventListener('click', () => repondre(p, b)));
    zoneQ.querySelector('.ev-option')?.focus({ preventScroll: true });
    montrerDansEcran(zoneQ);
    marquerRepere(p);
  }

  function repondre(p, bouton) {
    const q = p.q;
    const suivi = st.pauses.get(p.id);
    if (suivi.fait) return;
    const choix = q.options[Number(bouton.dataset.o)];
    const juste = choix === q.bonne;
    const premier = suivi.essais === 0;
    suivi.essais += 1;
    const zoneRetour = zoneQ.querySelector('.ev-q-retour');
    zoneRetour.innerHTML = '';
    let explication;
    if (juste) {
      explication = q.retours?.juste || 'Oui.';
      suivi.fait = true;
      suivi.premierJuste = premier;
      bouton.classList.add('juste');
      bouton.querySelector('.ev-option-icone').innerHTML = ICONES.coche;
      zoneQ.querySelectorAll('.ev-option').forEach((b) => { b.disabled = true; });
      zoneRetour.append(R?.juste ? R.juste(explication) : texteEncart('juste', explication));
      zoneQ.querySelector('.ev-q-aide').replaceChildren();
      zoneQ.querySelector('[data-q="continuer"]').hidden = false;
      zoneQ.querySelector('[data-q="continuer"]').focus({ preventScroll: true });
      S.sons?.jouer?.('juste');
    } else {
      const cible = (q.retours?.cibles || []).find((c) => (c.si || []).includes(choix));
      explication = cible?.retour || q.retours?.faux_par_defaut || `La bonne réponse se trouve dans la réplique de ${personnage(lignes.find((l) => l.id === q.rejouer?.[0])?.personnage).nom}.`;
      bouton.classList.add('faux');
      bouton.disabled = true;
      bouton.querySelector('.ev-option-icone').innerHTML = ICONES.croix;
      zoneRetour.append(R?.faux ? R.faux('Pas tout à fait.', { explication }) : texteEncart('faux', explication));
      S.sons?.jouer?.('faux');
      barre?.erreur?.();
      if (ctx.regime !== 'evaluation' && ![...zoneQ.querySelectorAll('.ev-option')].some(b => !b.disabled && q.options[Number(b.dataset.o)] !== q.bonne)) barre?.ouvrirSolution?.();
      if (!barre && suivi.essais >= 2) rejouerLignes(q.rejouer || [], { surligner: true });
    }
    montrerDansEcran(juste ? zoneQ.querySelector('.ev-q-pied') : zoneRetour);
    ctx.signaler?.essai?.({
      juste, item: `VID-${p.id}`, element: q.question, attendu: q.bonne, donne: choix, explication,
      remediation: q.remediation || etape.remediation, premier_essai: premier,
    });
    try { ctx.tracer?.('pause_repondue', { item: `VID-${p.id}`, juste }); } catch { /* facultatif */ }
    marquerRepere(p);
  }

  function montrerSolution(p, { signale = false } = {}) {
    const q = p.q;
    const suivi = st.pauses.get(p.id);
    suivi.fait = true;
    suivi.premierJuste = false;
    zoneQ.querySelectorAll('.ev-option').forEach((b) => {
      b.disabled = true;
      if (q.options[Number(b.dataset.o)] === q.bonne) { b.classList.add('juste'); b.querySelector('.ev-option-icone').innerHTML = ICONES.coche; }
    });
    const z = zoneQ.querySelector('.ev-q-retour');
    z.innerHTML = '';
    z.append(R?.reponse ? R.reponse(q.bonne, { explication: q.retours?.juste }) : texteEncart('reponse', `${q.bonne}. ${q.retours?.juste || ''}`));
    if (!signale) ctx.signaler?.solution?.({ item: `VID-${p.id}` });
    zoneQ.querySelector('.ev-q-aide').replaceChildren();
    zoneQ.querySelector('[data-q="continuer"]').hidden = false;
    montrerDansEcran(zoneQ.querySelector('.ev-q-pied'));
    marquerRepere(p);
  }

  function fermerQuestion(p) {
    zoneQ.hidden = true;
    zoneQ.innerHTML = '';
    voile.hidden = true;
    panneau.hidden = false;
    barre = null;
    changerMode('lecture');
    video.currentTime = Math.max(video.currentTime, p.t + 0.01);
    jouer();
  }

  function marquerRepere(p) {
    const r = piste.querySelector(`[data-pause="${p.id}"]`);
    const s = st.pauses.get(p.id);
    if (!r) return;
    r.classList.toggle('fait', !!s?.fait);
    r.classList.toggle('en-cours', st.mode === 'question' && !s?.fait);
  }

  // ── Mode « répéter après le personnage » ──────────────────────────────────
  function ouvrirRepeter(l) {
    changerMode('repeter');
    const p = personnage(l.personnage);
    zoneR.innerHTML = `
      <p class="ev-q-sur">À vous : répétez après ${echapper(p.nom)}</p>
      <p class="ev-r-ligne" lang="en">${echapper(l.r.en)}</p>
      <p class="ev-r-fr" lang="fr">${echapper(l.r.fr)}</p>
      <div class="ev-r-action">
        <button type="button" class="ev-r-micro" aria-label="Enregistrer ma voix">${ICONES.micro}</button>
        <p class="ev-r-aide">Touchez le micro, dites la phrase, puis touchez à nouveau pour arrêter.</p>
      </div>
      <div class="ev-r-resultat"></div>
      <div class="ev-q-pied">
        <button type="button" class="btn btn-secondaire" data-r="modele">${ICONES.rejouer}<span>Réécouter ${echapper(p.nom)}</span></button>
        <button type="button" class="btn btn-fantome" data-r="passer">Continuer ${ICONES.suite}</button>
      </div>`;
    zoneR.hidden = false;
    zoneR.classList.remove('apparait'); void zoneR.offsetWidth; zoneR.classList.add('apparait');
    const dispo = S.micro?.disponible?.() || { ok: false, raison: 'non-supporte' };
    const bMicro = zoneR.querySelector('.ev-r-micro');
    if (!dispo.ok) {
      bMicro.disabled = true;
      zoneR.querySelector('.ev-r-aide').textContent = dispo.raison === 'non-securise'
        ? 'Le micro ne fonctionne que sur l\'adresse sécurisée du prototype (https).'
        : 'Ce navigateur ne permet pas d\'enregistrer la voix. Vous pouvez répéter à voix haute sans note.';
    }
    bMicro.addEventListener('click', () => (st.prise ? arreterPrise() : enregistrer(l)));
    zoneR.querySelector('[data-r="modele"]').addEventListener('click', () => { annulerPrise(); jouerExtrait(l.debut - 0.05, l.fin + 0.12, () => { video.currentTime = l.fin + 0.9; }); });
    zoneR.querySelector('[data-r="passer"]').addEventListener('click', () => fermerRepeter(l));
    zoneR.querySelector('[data-r="modele"]').focus({ preventScroll: true });
  }

  async function enregistrer(l) {
    const aide = zoneR.querySelector('.ev-r-aide');
    const bMicro = zoneR.querySelector('.ev-r-micro');
    const res = zoneR.querySelector('.ev-r-resultat');
    res.innerHTML = '';
    try { await S.micro.ouvrir(); } catch (e) {
      aide.textContent = e?.code === 'refuse' ? 'Le micro est refusé. Autorisez-le dans les réglages du navigateur, puis réessayez.'
        : e?.code === 'absent' ? 'Aucun micro trouvé sur cet appareil.' : 'Le micro est occupé par une autre application.';
      return;
    }
    const dureeMax = Math.min(15000, Math.round((l.fin - l.debut) * 1000 * 2.4 + 2500));
    let parole = false; let silenceDepuis = 0;
    const debut = Date.now();
    st.prise = S.micro.enregistrer({
      dureeMax,
      surNiveau: (v) => {
        bMicro.style.setProperty('--niveau', String(Math.min(1, v * 1.6)));
        // Arrêt automatique : 1,3 s de silence après avoir parlé.
        if (v > 0.08) { parole = true; silenceDepuis = 0; }
        else if (parole && v < 0.03) {
          if (!silenceDepuis) silenceDepuis = Date.now();
          else if (Date.now() - silenceDepuis > 1300 && Date.now() - debut > 1200) arreterPrise();
        }
      },
    });
    bMicro.classList.add('enregistre');
    bMicro.innerHTML = ICONES.stop;
    bMicro.setAttribute('aria-label', 'Arrêter l\'enregistrement');
    aide.textContent = 'Je vous écoute… (arrêt automatique après votre phrase)';
    st.minuterie = setTimeout(() => arreterPrise(), dureeMax + 100);
    st.ligneRepetee = l;
  }

  async function arreterPrise() {
    clearTimeout(st.minuterie);
    const prise = st.prise;
    if (!prise) return;
    st.prise = null;
    const l = st.ligneRepetee;
    const bMicro = zoneR.querySelector('.ev-r-micro');
    const aide = zoneR.querySelector('.ev-r-aide');
    const res = zoneR.querySelector('.ev-r-resultat');
    if (bMicro) { bMicro.classList.remove('enregistre'); bMicro.innerHTML = ICONES.micro; bMicro.setAttribute('aria-label', 'Enregistrer à nouveau'); bMicro.disabled = true; }
    let enr;
    try { enr = await prise.arreter(); } catch { if (aide) aide.textContent = 'L\'enregistrement a échoué. Réessayez.'; if (bMicro) bMicro.disabled = false; return; }
    if (!zoneR.isConnected || st.mode !== 'repeter') return;
    try { ctx.tracer?.('enregistrement_depose', { item: l.id }); } catch { /* facultatif */ }
    aide.textContent = 'Calcul de la note…';
    let r;
    try { r = await S.prononciation.noter(enr.blob, l.r.en); } catch { r = { ok: false, code: 'indisponible' }; }
    if (!zoneR.isConnected || st.mode !== 'repeter') return;
    bMicro.disabled = false;
    if (!r?.ok) {
      const raisons = { 'trop-court': 'L\'enregistrement est trop court.', silence: 'Je n\'ai rien entendu. Parlez un peu plus près du micro.', 'trop-long': 'L\'enregistrement est trop long.', format: 'Ce format d\'enregistrement n\'est pas lu.', indisponible: 'La note de prononciation est indisponible pour le moment.' };
      aide.textContent = `${raisons[r?.code] || 'La note n\'a pas pu être calculée.'} Touchez le micro pour réessayer.`;
      return;
    }
    try { ctx.tracer?.('note_prononciation', { item: l.id, note: r.notes?.globale }); } catch { /* facultatif */ }
    aide.textContent = 'Touchez le micro pour réessayer.';
    const g = Math.round(r.notes?.globale ?? 0);
    res.innerHTML = `
      <div class="ev-r-note"><span class="ev-r-chiffre">${g}</span><span class="ev-r-sur">/100</span>
        <span class="ev-r-libelle">Note calculée mot par mot<br><span class="discret">le mot a-t-il été reconnu, et avec quelle assurance</span></span></div>
      <p class="ev-r-mots" lang="en">${(r.mots || []).map((m) => `<span class="ev-r-mot ${echapper(m.statut)}" title="${echapper(m.entendu || '')}">${echapper(m.attendu)}</span>`).join(' ')}</p>
      <p class="ev-r-legende petit discret"><span class="ev-r-pastille juste"></span>reconnu <span class="ev-r-pastille approche"></span>presque <span class="ev-r-pastille faux"></span>autre mot entendu <span class="ev-r-pastille absent"></span>pas entendu</p>
      <button type="button" class="btn btn-fantome" data-r="ma-voix">${ICONES.ecouter}<span>Réécouter ma voix</span></button>`;
    res.querySelector('[data-r="ma-voix"]').addEventListener('click', () => { if (enr?.url) S.audio?.jouer?.(enr.url, { canal: 'media' }); });
    montrerDansEcran(res);
  }

  function annulerPrise() {
    clearTimeout(st.minuterie);
    if (st.prise) { try { st.prise.annuler(); } catch { /* déjà fini */ } st.prise = null; }
  }

  function fermerRepeter(l) {
    annulerPrise();
    zoneR.hidden = true;
    zoneR.innerHTML = '';
    changerMode('lecture');
    video.currentTime = Math.max(video.currentTime, l.fin + 0.12);
    jouer();
  }

  // ── Fin : bilan de l'épisode et transcription interactive ─────────────────
  function terminer() {
    if (st.mode === 'fin') return;
    if (pauses.some((p) => !st.pauses.get(p.id)?.fait)) return; // une question n'a pas été vue (ne devrait pas arriver)
    changerMode('fin');
    st.vuMax = duree;
    signalerVu(duree);
    const bonnes = pauses.filter((p) => st.pauses.get(p.id)?.premierJuste).length;
    const score = pauses.length ? bonnes / pauses.length : 1;
    ctx.signaler?.fin?.({ score, reussi: true, points_obtenus: bonnes });
    S.sons?.jouer?.('fin');
    const groupes = [];
    for (const l of lignes) {
      const g = groupes[groupes.length - 1];
      if (g && g.plan === l.plan) g.lignes.push(l); else groupes.push({ plan: l.plan, lignes: [l] });
    }
    zoneFin.innerHTML = `
      <div class="ev-fin-tete carte">
        <div>
          <p class="ev-q-sur">Épisode terminé</p>
          <h3 class="ev-fin-titre">${bonnes} question${bonnes > 1 ? 's' : ''} sur ${pauses.length} réussie${bonnes > 1 ? 's' : ''} du premier coup</h3>
          <p class="petit discret">${bonnes === pauses.length ? 'Vous avez tout compris à la première écoute.' : 'Relisez la transcription : chaque réplique se réécoute d\'un toucher.'}</p>
        </div>
        <div class="ev-fin-boutons">
          <button type="button" class="btn btn-primaire" data-f="sans">${ICONES.lecture}<span>Revoir sans sous-titres</span></button>
          <button type="button" class="btn btn-secondaire" data-f="avec">${ICONES.rejouer}<span>Revoir avec sous-titres</span></button>
        </div>
      </div>
      <div class="ev-transcription carte">
        <div class="ev-transcription-tete">
          <h3>La transcription</h3>
          <p class="petit discret">Touchez une réplique pour la réécouter. <mark class="ev-be">am</mark> <mark class="ev-be">is</mark> <mark class="ev-be">are</mark> et leurs formes courtes sont surlignés.</p>
        </div>
        <ol class="ev-fin-liste">
          ${groupes.map((g) => g.lignes.map((l, k) => {
            const p = personnage(l.personnage);
            return `<li class="ev-fin-ligne${k === 0 ? ' ev-fin-scene' : ''}" data-l="${l.id}">
              <span class="ev-fin-nom" style="color:${p.couleur}">${echapper(p.nom)}${l.pensee ? ' <span class="ev-fin-pense">pense</span>' : ''}</span>
              <p class="ev-fin-en${l.pensee ? ' pensee' : ''}" lang="en">${htmlLigne(l, { be: true })}</p>
              <p class="ev-fin-fr" lang="fr" hidden>${echapper(l.r.fr)}</p>
              <div class="ev-glose ev-glose-fin" hidden></div>
              <div class="ev-fin-actions">
                <button type="button" class="btn btn-fantome" data-f="ecouter" aria-label="Réécouter la réplique de ${echapper(p.nom)}">${ICONES.ecouter}<span>Écouter</span></button>
                <button type="button" class="btn btn-fantome" data-f="fr" aria-pressed="false">FR</button>
              </div>
            </li>`;
          }).join('')).join('')}
        </ol>
      </div>`;
    zoneFin.hidden = false;
    zoneFin.classList.remove('apparait'); void zoneFin.offsetWidth; zoneFin.classList.add('apparait');
    zoneFin.querySelector('[data-f="sans"]').addEventListener('click', () => revoir('aucun'));
    zoneFin.querySelector('[data-f="avec"]').addEventListener('click', () => revoir('en'));
    zoneFin.querySelectorAll('.ev-fin-ligne').forEach((li) => {
      const l = lignes.find((x) => x.id === li.dataset.l);
      li.querySelector('[data-f="ecouter"]').addEventListener('click', () => {
        zoneFin.querySelectorAll('.ev-fin-ligne.joue').forEach((x) => x.classList.remove('joue'));
        li.classList.add('joue');
        jouerExtrait(l.debut - 0.05, l.fin + 0.15, () => li.classList.remove('joue'));
      });
      const bFr = li.querySelector('[data-f="fr"]');
      bFr.addEventListener('click', () => {
        const fr = li.querySelector('.ev-fin-fr');
        fr.hidden = !fr.hidden;
        bFr.setAttribute('aria-pressed', String(!fr.hidden));
      });
    });
    zoneFin.querySelector('[data-f="sans"]').focus({ preventScroll: true });
  }

  function revoir(mode) {
    prefs.soustitres = mode;
    enregistrerPrefs();
    majSousTitresBouton();
    zoneFin.hidden = true;
    zoneFin.innerHTML = '';
    st.repetees.clear();
    changerMode('lecture');
    afficherLigne(-1);
    video.currentTime = 0;
    jouer();
  }

  // ── Barre de temps : aller à un moment (jamais au-delà d'une question non vue) ──
  function limite() {
    const p = pauses.find((x) => !st.pauses.get(x.id)?.fait);
    return p ? p.t : duree;
  }
  function allerA(t) {
    if (st.mode === 'question' || st.mode === 'repeter') return;
    const cible = Math.max(0, Math.min(t, limite(), duree - 0.1));
    if (cible < video.currentTime - 0.5) {
      for (const l of lignes) if (l.fin > cible) st.repetees.delete(l.id);
    }
    if (st.mode === 'fin' && cible < duree - 0.2) { zoneFin.hidden = true; changerMode('lecture'); }
    video.currentTime = cible;
    rendre(cible);
  }
  function tempsDepuisPointeur(e) {
    const r = piste.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duree;
  }
  let glisse = false;
  piste.addEventListener('pointerdown', (e) => {
    if (st.mode === 'question' || st.mode === 'repeter') return;
    glisse = true;
    try { piste.setPointerCapture(e.pointerId); } catch { /* ancien navigateur */ }
    allerA(tempsDepuisPointeur(e));
  });
  piste.addEventListener('pointermove', (e) => { if (glisse) allerA(tempsDepuisPointeur(e)); });
  piste.addEventListener('pointerup', () => { glisse = false; });
  piste.addEventListener('pointercancel', () => { glisse = false; });
  piste.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); allerA(video.currentTime - 5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); allerA(video.currentTime + 5); }
    else if (e.key === 'Home') { e.preventDefault(); allerA(0); }
  });

  // ── Commandes ─────────────────────────────────────────────────────────────
  $('.ev-demarrer').addEventListener('click', () => { changerMode('lecture'); jouer(); });
  cmd('lecture').addEventListener('click', basculer);
  cmd('replique').addEventListener('click', () => {
    if (st.mode !== 'lecture' && st.mode !== 'fin') return;
    const t = video.currentTime;
    let l = [...lignes].reverse().find((x) => x.debut < t - 0.25);
    if (l && t - l.debut < 0.8) l = [...lignes].reverse().find((x) => x.debut < l.debut - 0.1) || l;
    if (!l) l = lignes[0];
    if (st.mode === 'fin') { zoneFin.hidden = true; changerMode('lecture'); }
    st.repetees.delete(l.id);
    video.currentTime = Math.max(0, l.debut - 0.1);
    rendre(video.currentTime);
    jouer();
  });
  cmd('lent').addEventListener('click', () => {
    prefs.lent = !prefs.lent;
    video.playbackRate = prefs.lent ? 0.75 : 1;
    cmd('lent').setAttribute('aria-pressed', String(prefs.lent));
    cmd('lent').querySelector('span').textContent = prefs.lent ? '0,75 ×' : 'Lent';
    R?.annoncer?.(prefs.lent ? 'Lecture ralentie' : 'Vitesse normale');
    enregistrerPrefs();
  });
  cmd('soustitres').addEventListener('click', () => {
    const ordre = ['en', 'en-fr', 'aucun'];
    prefs.soustitres = ordre[(ordre.indexOf(prefs.soustitres) + 1) % ordre.length];
    majSousTitresBouton();
    majTraduction();
    enregistrerPrefs();
    R?.annoncer?.(`Sous-titres : ${libelleSousTitres()}`);
  });
  cmd('repeter').addEventListener('click', () => {
    st.repeter = !st.repeter;
    cmd('repeter').setAttribute('aria-pressed', String(st.repeter));
    if (st.repeter) {
      const t = video.currentTime;
      for (const l of lignes) { if (l.fin + 0.08 <= t) st.repetees.add(l.id); else st.repetees.delete(l.id); }
    }
    R?.annoncer?.(st.repeter ? 'Mode répéter : la vidéo s\'arrête après chaque réplique.' : 'Mode répéter désactivé.');
  });
  btnFr.addEventListener('click', () => { st.frLigne = !st.frLigne; majTraduction(); });
  if (prefs.lent) cmd('lent').querySelector('span').textContent = '0,75 ×';

  function majBoutonLecture() {
    const b = cmd('lecture');
    const enLecture = !video.paused;
    b.innerHTML = `${enLecture ? ICONES.pause : ICONES.lecture}<span>${enLecture ? 'Pause' : (st.mode === 'fin' ? 'Revoir' : 'Lecture')}</span>`;
    b.setAttribute('aria-label', enLecture ? 'Mettre en pause' : 'Lire');
  }
  function libelleSousTitres() {
    return { en: 'anglais', 'en-fr': 'anglais et français', aucun: 'aucun' }[prefs.soustitres];
  }
  function majSousTitresBouton() {
    const b = cmd('soustitres');
    b.querySelector('.ev-cmd-st').textContent = { en: 'EN', 'en-fr': 'EN + FR', aucun: 'Aucun' }[prefs.soustitres] || 'EN';
    b.setAttribute('aria-label', `Sous-titres : ${libelleSousTitres()}. Toucher pour changer.`);
    b.setAttribute('aria-pressed', String(prefs.soustitres !== 'aucun'));
  }
  function enregistrerPrefs() { try { ctx.stockage?.ecrire('prefs', { soustitres: prefs.soustitres, lent: prefs.lent }); } catch { /* stockage facultatif */ } }

  function changerMode(m) {
    st.mode = m;
    boite.dataset.mode = m;
    const bloque = m === 'question' || m === 'repeter';
    racine.querySelectorAll('.ev-cmd').forEach((b) => { b.disabled = bloque; });
    if (m !== 'question') voile.hidden = true;
    if (m === 'lecture') panneau.hidden = false;
    majBoutonLecture();
  }

  function signalerVu(d) {
    const pct = Math.min(1, st.vuMax / d);
    if (pct - st.pctSignale >= 0.05 || (pct >= 0.999 && st.pctSignale < 0.999)) {
      st.pctSignale = pct;
      ctx.signaler?.progression?.(pct);
    }
    for (const palier of [25, 50, 75, 100]) {
      if (pct * 100 >= palier - 0.5 && !st.paliersTraces.has(palier)) {
        st.paliersTraces.add(palier);
        try { ctx.tracer?.('video_vue_pct', { pct: palier }); } catch { /* facultatif */ }
      }
    }
  }

  /** Amène un élément dans l'écran (au-dessus du pied du lecteur), sans secousse si possible. */
  function montrerDansEcran(elt) {
    if (!elt) return;
    const doux = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => elt.scrollIntoView({ block: 'nearest', behavior: doux ? 'smooth' : 'auto' }));
  }

  function texteEncart(type, texte) {
    const d = document.createElement('div');
    d.className = `encart encart-${type}`;
    d.textContent = typo(texte);
    return d;
  }

  afficherLigne(-1);
  rendre(0);
  ctx.signaler?.pret?.();

  return {
    demonter() {
      cancelAnimationFrame(st.raf);
      clearTimeout(st.minuterie);
      annulerPrise();
      st.extrait = null;
      try { video.pause(); video.querySelectorAll('source').forEach((x) => x.remove()); video.removeAttribute('src'); video.load(); } catch { /* déjà détaché */ }
    },
    montrer() { const p = pauses.find((x) => st.mode === 'question' && !st.pauses.get(x.id)?.fait); if (p) rejouerLignes(p.q.rejouer || [], { surligner: true }); },
    montrerSolution() { const p = pauses.find((x) => st.mode === 'question' && !st.pauses.get(x.id)?.fait); if (p) montrerSolution(p); },
  };
}

function lireGlossaire(etape) {
  const m = new Map();
  const g = etape.glossaire || etape.mots_cliquables_sens || null;
  const ajouter = (en, fr, note) => { if (en && fr) m.set(normaliserExpr(en), { en, fr, note }); };
  if (Array.isArray(g)) for (const x of g) ajouter(x.en || x.mot, x.fr || x.sens, x.note);
  else if (g && typeof g === 'object') for (const [en, v] of Object.entries(g)) ajouter(en, typeof v === 'string' ? v : v?.fr || v?.sens, v?.note);
  for (const x of etape.mots_cliquables || []) if (x && typeof x === 'object') ajouter(x.en || x.mot, x.fr || x.sens, x.note);
  for (const r of etape.repliques || []) for (const x of r.mots_cliquables || []) if (x && typeof x === 'object') ajouter(x.en || x.mot, x.fr || x.sens, x.note);
  return m;
}

function normaliserExpr(e) { return decouperMots(e).map(normaliserMot).join(' '); }

function formatDuree(s) {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const CSS = `
.act-video-episode_video { --ev-nuit: #0E1116; }
.act-video-episode_video .ev { display: grid; gap: 12px; width: 100%; max-width: min(960px, max(560px, calc((100svh - 380px) * 16 / 9))); min-width: 0; margin: 0 auto; }
@supports not (height: 100svh) { .act-video-episode_video .ev { max-width: min(960px, max(560px, calc((100vh - 380px) * 16 / 9))); } }
@media (max-width: 767px) { .act-video-episode_video .ev { max-width: 100%; } }

.act-video-episode_video .ev-scene { position: relative; aspect-ratio: 16 / 9; background: var(--ev-nuit); border-radius: var(--rayon-carte); overflow: hidden; box-shadow: var(--ombre-carte-forte); isolation: isolate; }
@media (max-width: 599px) { .act-video-episode_video .ev-scene { border-radius: var(--rayon-bloc); } }
.act-video-episode_video .ev-scene video { width: 100%; height: 100%; object-fit: cover; background: var(--ev-nuit); }
.act-video-episode_video .ev-provisoire { position: absolute; top: 10px; left: 10px; padding: 3px 9px; border-radius: 999px; background: rgba(14,17,22,.55); color: #fff; font-size: 12px; font-weight: 600; letter-spacing: .01em; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); pointer-events: none; }

.act-video-episode_video .ev-demarrer { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 12px; border: 0; padding: 0; background: linear-gradient(180deg, rgba(14,17,22,.55) 0%, rgba(14,17,22,.12) 45%, rgba(14,17,22,.5) 100%); color: #fff; cursor: pointer; font: inherit; }
.act-video-episode_video .ev-couverture { position: absolute; left: clamp(14px, 3.2%, 32px); top: clamp(12px, 4%, 30px); right: 30%; display: grid; gap: 2px; text-align: left; }
.act-video-episode_video .ev-couverture-sur { font-size: clamp(.6875rem, .6rem + .3vw, .8125rem); font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .92; }
.act-video-episode_video .ev-couverture-titre { font-family: var(--police-titre); font-weight: 600; font-size: clamp(1.1rem, .8rem + 1.6vw, 2rem); line-height: 1.12; text-shadow: 0 2px 16px rgba(0,0,0,.4); }
.act-video-episode_video .ev-couverture-en { font-size: clamp(.75rem, .7rem + .25vw, .9rem); opacity: .85; margin-top: 2px; }
.act-video-episode_video .ev-intro { margin: 2px 0 0; max-width: none; }
.act-video-episode_video .ev-intro .objectif { margin-top: 8px; }
.act-video-episode_video .ev:not([data-mode="accueil"]) .ev-intro { display: none; }
.act-video-episode_video .ev[data-mode="accueil"] .ev-temps,
.act-video-episode_video .ev[data-mode="accueil"] .ev-panneau,
.act-video-episode_video .ev[data-mode="accueil"] .ev-commandes { display: none; }
.act-video-episode_video .ev-demarrer-rond { width: 76px; height: 76px; border-radius: 999px; display: grid; place-items: center; background: rgba(255,255,255,.94); color: var(--marque-tres-fonce); box-shadow: 0 10px 30px rgba(0,0,0,.28); transition: transform .25s var(--ressort); }
.act-video-episode_video .ev-demarrer-rond svg { width: 34px; height: 34px; margin-left: 4px; }
.act-video-episode_video .ev-demarrer:hover .ev-demarrer-rond, .act-video-episode_video .ev-demarrer:focus-visible .ev-demarrer-rond { transform: scale(1.06); }
.act-video-episode_video .ev-demarrer-texte { font-weight: 600; font-size: 1rem; text-shadow: 0 1px 8px rgba(0,0,0,.5); }
@media (max-width: 599px) { .act-video-episode_video .ev-demarrer { place-content: end center; padding-bottom: 14px; gap: 8px; } .act-video-episode_video .ev-demarrer-texte { font-size: .9rem; } }
.act-video-episode_video .ev-demarrer-duree { font-weight: 500; opacity: .85; margin-left: 4px; font-variant-numeric: tabular-nums; }
@media (max-width: 599px) { .act-video-episode_video .ev-demarrer-rond { width: 60px; height: 60px; } .act-video-episode_video .ev-demarrer-rond svg { width: 28px; height: 28px; } }

.act-video-episode_video .ev-carton { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; gap: 6px; padding: 0 8%; color: #fff; background: radial-gradient(ellipse at center, rgba(14,17,22,.42), rgba(14,17,22,.12) 70%); opacity: 0; transition: opacity .7s var(--doux); pointer-events: none; }
.act-video-episode_video .ev-carton.visible { opacity: 1; }
.act-video-episode_video .ev-carton-sur { font-size: clamp(.75rem, .6rem + .6vw, .95rem); font-weight: 600; letter-spacing: .16em; text-transform: uppercase; opacity: .9; }
.act-video-episode_video .ev-carton-titre { font-family: var(--police-titre); font-weight: 600; font-size: clamp(1.35rem, .9rem + 2.4vw, 2.6rem); line-height: 1.1; text-shadow: 0 2px 18px rgba(0,0,0,.45); }
.act-video-episode_video .ev-carton-fr { font-size: clamp(.8rem, .7rem + .4vw, 1rem); opacity: .88; }

.act-video-episode_video .ev-voile { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(14,17,22,.5); animation: ev-fondu .35s var(--doux) both; }
.act-video-episode_video .ev-voile[hidden] { display: none; }
.act-video-episode_video .ev-voile-texte { padding: 6px 14px; border-radius: 999px; background: rgba(255,255,255,.95); color: var(--encre); font-weight: 700; font-size: .9rem; }
@keyframes ev-fondu { from { opacity: 0; } to { opacity: 1; } }

.act-video-episode_video .ev-temps { display: flex; align-items: center; gap: 12px; min-width: 0; }
.act-video-episode_video .ev-piste { position: relative; flex: 1; min-width: 0; height: 32px; cursor: pointer; touch-action: none; outline-offset: 4px; }
.act-video-episode_video .ev-piste-fond { position: absolute; left: 0; right: 0; top: 13px; height: 6px; border-radius: 999px; background: var(--filet); overflow: hidden; }
.act-video-episode_video .ev-piste-vu, .act-video-episode_video .ev-piste-lu { position: absolute; inset: 0; transform-origin: left center; transform: scaleX(0); }
.act-video-episode_video .ev-piste-vu { background: var(--marque-voile-bord); }
.act-video-episode_video .ev-piste-lu { background: linear-gradient(90deg, var(--marque), var(--marque-clair)); }
.act-video-episode_video .ev-curseur { position: absolute; top: 9px; width: 14px; height: 14px; margin-left: -7px; border-radius: 999px; background: var(--surface); border: 2px solid var(--marque); box-shadow: 0 1px 4px rgba(12,21,40,.2); pointer-events: none; }
.act-video-episode_video .ev-repere { position: absolute; top: 10px; width: 12px; height: 12px; margin-left: -6px; border-radius: 3px; transform: rotate(45deg); background: var(--surface); border: 2px solid var(--encre-50); pointer-events: none; }
.act-video-episode_video .ev-repere.en-cours { border-color: var(--marque); background: var(--marque-voile); }
.act-video-episode_video .ev-repere.fait { border-color: var(--marque); background: var(--marque); }
.act-video-episode_video .ev-horloge { flex: none; font-size: .8125rem; color: var(--encre-50); font-variant-numeric: tabular-nums; }

.act-video-episode_video .ev-panneau { background: var(--surface); border: 1px solid var(--filet); border-radius: var(--rayon-carte); padding: 12px 16px 14px; min-height: 108px; box-shadow: var(--ombre-carte); }
.act-video-episode_video .ev-qui { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.act-video-episode_video .ev-nom { font-weight: 700; font-size: .875rem; letter-spacing: .01em; }
.act-video-episode_video .ev-etat { font-size: .8125rem; color: var(--encre-50); display: inline-flex; align-items: center; gap: 6px; }
.act-video-episode_video .ev-fr { margin-left: auto; min-height: 36px; min-width: 44px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--filet); background: var(--surface); font-weight: 700; font-size: .8125rem; color: var(--encre-70); cursor: pointer; position: relative; }
.act-video-episode_video .ev-fr::after { content: ''; position: absolute; inset: -4px 0; }
.act-video-episode_video .ev-fr[aria-pressed="true"] { background: var(--marque-voile); color: var(--marque-tres-fonce); border-color: var(--marque-voile-bord); }
.act-video-episode_video .ev-ligne { margin-top: 4px; font-size: clamp(1.125rem, 1rem + .5vw, 1.375rem); line-height: 1.75; font-weight: 500; color: var(--encre-50); overflow-wrap: anywhere; }
.act-video-episode_video .ev-ligne.pensee, .act-video-episode_video .ev-fin-en.pensee { font-style: italic; }
.act-video-episode_video .ev-mot { transition: color .12s linear, background-color .12s linear; border-radius: 5px; }
.act-video-episode_video .ev-mot.dit { color: var(--encre); }
.act-video-episode_video .ev-mot.actuel { background: var(--marque-voile); box-shadow: 0 0 0 2px var(--marque-voile); color: var(--marque-tres-fonce); }
.act-video-episode_video .ev-surligne .ev-ligne .ev-mot.dit { background: var(--marque-voile); }
.act-video-episode_video .ev-expr { font: inherit; color: inherit; background: none; border: 0; margin: -8px 0; padding: 8px 0; cursor: pointer; text-decoration: underline dotted var(--marque-clair); text-decoration-thickness: 2px; text-underline-offset: 5px; border-radius: 4px; }
.act-video-episode_video .ev-expr:hover .ev-mot { color: var(--marque-fonce); }
.act-video-episode_video .ev-trad { margin-top: 2px; font-size: .95rem; color: var(--encre-70); }
.act-video-episode_video .ev-trad::before { content: 'FR'; font-size: .6875rem; font-weight: 700; letter-spacing: .06em; color: var(--encre-50); margin-right: 8px; }
.act-video-episode_video .ev-panneau.vide .ev-qui::after { content: 'Les sous-titres s\\'affichent ici.'; font-size: .875rem; color: var(--encre-50); }
.act-video-episode_video .ev-panneau.sans .ev-qui::after { content: none; }
.act-video-episode_video .ev-note-voix { margin-top: 8px; font-size: .8125rem; color: var(--encre-50); }
.act-video-episode_video .ev-ondes { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
.act-video-episode_video .ev-ondes i { display: block; width: 3px; height: 5px; border-radius: 2px; background: var(--marque-clair); }
.act-video-episode_video .ev-parle .ev-ondes i { animation: ev-onde .9s ease-in-out infinite alternate; }
.act-video-episode_video .ev-ondes i:nth-child(2) { animation-delay: .15s; } .act-video-episode_video .ev-ondes i:nth-child(3) { animation-delay: .3s; }
@keyframes ev-onde { from { height: 4px; } to { height: 14px; } }
@media (prefers-reduced-motion: reduce) { .act-video-episode_video .ev-parle .ev-ondes i { animation: none; height: 10px; } }

.act-video-episode_video .ev-glose { position: relative; margin-top: 10px; padding: 12px 52px 14px 14px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); scroll-margin-bottom: 96px; }
.act-video-episode_video .ev-glose-tete { display: grid; gap: 2px; }
.act-video-episode_video .ev-glose-mot { font-weight: 700; font-size: 1.05rem; }
.act-video-episode_video .ev-glose-sens { color: var(--encre-70); }
.act-video-episode_video .ev-glose-fermer { position: absolute; top: 4px; right: 4px; color: var(--encre-50); }
.act-video-episode_video .ev-glose-note { margin-top: 4px; font-size: .9rem; color: var(--encre-70); }
.act-video-episode_video .ev-glose-etiquette { display: block; font-size: .75rem; font-weight: 700; color: var(--encre-50); text-transform: uppercase; letter-spacing: .05em; }
.act-video-episode_video .ev-glose-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; margin-right: -38px; }
.act-video-episode_video .ev-glose-actions .btn { padding-inline: 0.875rem; }

.act-video-episode_video .ev-commandes { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.act-video-episode_video .ev-cmd { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-height: 58px; padding: 6px 4px; border-radius: var(--rayon-bouton); border: 1px solid var(--filet); background: var(--surface); color: var(--encre-70); font: inherit; font-size: .78rem; font-weight: 600; cursor: pointer; touch-action: manipulation; transition: background-color .15s, border-color .15s, color .15s, transform .2s var(--ressort); min-width: 0; }
.act-video-episode_video .ev-cmd span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.act-video-episode_video .ev-cmd svg { width: 22px; height: 22px; flex: none; }
.act-video-episode_video .ev-cmd:hover:not(:disabled) { border-color: var(--marque-voile-bord); color: var(--marque-fonce); }
.act-video-episode_video .ev-cmd:active:not(:disabled) { transform: scale(.97); }
.act-video-episode_video .ev-cmd[aria-pressed="true"] { background: var(--marque-voile); color: var(--marque-tres-fonce); border-color: var(--marque-voile-bord); }
.act-video-episode_video .ev-cmd--principal { background: var(--marque); border-color: var(--marque); color: #fff; }
.act-video-episode_video .ev-cmd--principal:hover:not(:disabled) { background: var(--marque-fonce); color: #fff; border-color: var(--marque-fonce); }
.act-video-episode_video .ev-cmd:disabled { opacity: .45; cursor: not-allowed; }
@media (min-width: 768px) {
  .act-video-episode_video .ev-cmd { flex-direction: row; gap: 8px; min-height: 48px; font-size: .875rem; }
  .act-video-episode_video .ev-cmd svg { width: 20px; height: 20px; }
}

.act-video-episode_video .ev-question, .act-video-episode_video .ev-repeter { padding: 18px 18px 16px; }
.act-video-episode_video .ev-q-sur { font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--marque); }
.act-video-episode_video .ev-q-titre { margin-top: 6px; font-family: var(--police-titre); font-weight: 600; font-size: clamp(1.15rem, 1rem + .6vw, 1.4rem); line-height: 1.25; }
.act-video-episode_video .ev-q-en { margin-top: 2px; color: var(--encre-50); font-size: .9rem; }
.act-video-episode_video .ev-q-options { display: grid; gap: 8px; margin-top: 14px; }
@media (min-width: 768px) { .act-video-episode_video .ev-q-options { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); } }
.act-video-episode_video .ev-option { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 52px; padding: 10px 14px; border-radius: var(--rayon-bouton); border: 1.5px solid var(--filet-fort); background: var(--surface); color: var(--encre); font: inherit; font-weight: 600; text-align: left; cursor: pointer; transition: border-color .15s, background-color .15s, transform .2s var(--ressort); }
.act-video-episode_video .ev-option:hover:not(:disabled) { border-color: var(--marque-clair); background: var(--marque-voile); }
.act-video-episode_video .ev-option:active:not(:disabled) { transform: scale(.98); }
.act-video-episode_video .ev-option-icone { display: inline-grid; width: 22px; height: 22px; flex: none; }
.act-video-episode_video .ev-option-icone svg { width: 22px; height: 22px; }
.act-video-episode_video .ev-option.juste { border-color: var(--juste); background: var(--juste-voile); color: var(--juste-fonce); opacity: 1; }
.act-video-episode_video .ev-option.faux { border-color: var(--faux-bord); background: var(--faux-voile); color: var(--faux-fonce); }
.act-video-episode_video .ev-option:disabled { cursor: default; }
.act-video-episode_video .ev-option:disabled:not(.juste):not(.faux) { opacity: .55; }
.act-video-episode_video .ev-q-retour:not(:empty) { margin-top: 12px; }
.act-video-episode_video .ev-q-aide:not(:empty) { margin-top: 10px; }
.act-video-episode_video .ev-q-pied { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; margin-top: 14px; }
.act-video-episode_video .ev-q-pied .btn-primaire { margin-left: auto; }

.act-video-episode_video .ev-r-ligne { margin-top: 8px; font-size: clamp(1.15rem, 1rem + .6vw, 1.4rem); font-weight: 600; line-height: 1.4; }
.act-video-episode_video .ev-r-fr { margin-top: 2px; color: var(--encre-50); font-size: .9rem; }
.act-video-episode_video .ev-r-action { display: flex; align-items: center; gap: 14px; margin-top: 14px; }
.act-video-episode_video .ev-r-micro { --niveau: 0; position: relative; flex: none; width: 64px; height: 64px; border-radius: 999px; border: 0; background: var(--c-parler); color: #fff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 0 0 calc(var(--niveau) * 12px) var(--c-parler-voile); transition: box-shadow .08s linear, transform .2s var(--ressort); }
.act-video-episode_video .ev-r-micro svg { width: 28px; height: 28px; }
.act-video-episode_video .ev-r-micro:disabled { opacity: .45; cursor: not-allowed; }
.act-video-episode_video .ev-r-micro.enregistre { background: var(--faux-fonce); box-shadow: 0 0 0 calc(4px + var(--niveau) * 14px) var(--faux-voile); }
.act-video-episode_video .ev-r-aide { font-size: .9rem; color: var(--encre-70); }
.act-video-episode_video .ev-r-resultat:not(:empty) { margin-top: 14px; padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); }
.act-video-episode_video .ev-r-note { display: flex; align-items: baseline; gap: 4px; }
.act-video-episode_video .ev-r-chiffre { font-family: var(--police-titre); font-size: 2rem; font-weight: 600; }
.act-video-episode_video .ev-r-sur { color: var(--encre-50); font-weight: 600; }
.act-video-episode_video .ev-r-libelle { margin-left: 12px; font-size: .8125rem; font-weight: 600; line-height: 1.35; }
.act-video-episode_video .ev-r-mots { margin-top: 8px; font-size: 1.1rem; line-height: 2; }
.act-video-episode_video .ev-r-mot { padding: 2px 6px; border-radius: 6px; font-weight: 600; }
.act-video-episode_video .ev-r-mot.juste, .act-video-episode_video .ev-r-pastille.juste { background: var(--juste-voile); color: var(--juste-fonce); }
.act-video-episode_video .ev-r-mot.approche, .act-video-episode_video .ev-r-pastille.approche { background: var(--ambre-voile); color: var(--ambre); }
.act-video-episode_video .ev-r-mot.faux, .act-video-episode_video .ev-r-pastille.faux { background: var(--faux-voile); color: var(--faux-fonce); }
.act-video-episode_video .ev-r-mot.absent { color: var(--encre-50); text-decoration: line-through; }
.act-video-episode_video .ev-r-pastille { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin: 0 4px 0 10px; vertical-align: -1px; border: 1px solid currentColor; }
.act-video-episode_video .ev-r-pastille.absent { background: var(--surface); color: var(--encre-50); }
.act-video-episode_video .ev-r-legende { margin-top: 4px; }

.act-video-episode_video .ev-fin { display: grid; gap: 12px; }
.act-video-episode_video .ev-fin-tete { padding: 18px; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between; }
.act-video-episode_video .ev-fin-titre { font-family: var(--police-titre); font-weight: 600; font-size: clamp(1.15rem, 1rem + .6vw, 1.4rem); margin-top: 4px; }
.act-video-episode_video .ev-fin-boutons { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 599px) { .act-video-episode_video .ev-fin-boutons, .act-video-episode_video .ev-fin-boutons .btn { width: 100%; } }
.act-video-episode_video .ev-transcription { padding: 18px 18px 8px; }
.act-video-episode_video .ev-transcription-tete p { margin-top: 4px; }
.act-video-episode_video .ev-fin-liste { list-style: none; margin: 12px 0 0; padding: 0; }
.act-video-episode_video .ev-fin-ligne { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 10px 0; border-top: 1px solid var(--filet); }
.act-video-episode_video .ev-fin-ligne.ev-fin-scene { border-top-color: var(--filet-fort); }
.act-video-episode_video .ev-fin-ligne.joue { background: linear-gradient(90deg, var(--marque-voile), transparent 85%); border-radius: 8px; }
.act-video-episode_video .ev-fin-nom { grid-column: 1; font-weight: 700; font-size: .8125rem; }
.act-video-episode_video .ev-fin-pense { font-weight: 500; color: var(--encre-50); }
.act-video-episode_video .ev-fin-en { grid-column: 1; font-size: 1.05rem; line-height: 1.7; }
.act-video-episode_video .ev-fin-fr { grid-column: 1; font-size: .9rem; color: var(--encre-70); }
.act-video-episode_video .ev-glose-fin { grid-column: 1 / -1; }
.act-video-episode_video .ev-fin-actions { grid-column: 2; grid-row: 1 / span 3; display: flex; align-items: center; gap: 2px; }
.act-video-episode_video .ev-fin-actions .btn { min-width: 44px; padding-inline: 10px; }
@media (max-width: 599px) { .act-video-episode_video .ev-fin-actions .btn span { display: none; } }
.act-video-episode_video .ev-be, .act-video-episode_video mark.ev-be { background: var(--marque-voile); color: var(--marque-tres-fonce); border-radius: 4px; padding: 0 3px; font-weight: 700; }

.act-video-episode_video .ev[data-mode="question"] .ev-commandes,
.act-video-episode_video .ev[data-mode="repeter"] .ev-commandes,
.act-video-episode_video .ev[data-mode="fin"] .ev-commandes,
.act-video-episode_video .ev[data-mode="fin"] .ev-panneau { display: none; }
.act-video-episode_video .ev-question, .act-video-episode_video .ev-repeter, .act-video-episode_video .ev-q-retour, .act-video-episode_video .ev-q-pied { scroll-margin-bottom: 96px; scroll-margin-top: 72px; }
`;
