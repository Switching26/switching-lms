// Jeu de rôle à embranchements (DLG) — agent B1.
// Daniel accueille l'apprenant (son vrai prénom, son vrai métier). À chaque réplique, l'apprenant répond en
// choisissant une phrase ou à voix haute (transcription locale du socle, puis règles d'acceptation du script
// de D, avec tolérance). La conversation suit sa réponse : une réponse inadaptée fait réagir le personnage,
// elle est expliquée, puis on réessaie — ou la conversation continue quand le personnage reformule.

import { ICONES, echapper, personnage, melanger, visage, retourTypo, typo } from '../video/_commun.js';

export const meta = { titre: 'Jeu de rôle', entete: true };

const RACINE = '.act-dialogue-jeu_de_role';

/**
 * Règles du mode « Parler », nœud par nœud : elles traduisent en vérifications les champs `oral` du script
 * de D (accepte_si, accepte_partiel, declencheurs). t = transcription normalisée (minuscules, sans ponctuation).
 * Rend { accepte } | { partiel: index } | { choix: index } | null (non reconnu).
 */
const ORAL = {
  N1: (t) => {
    const moi = /\b(?:i'm|im|i am) ([a-z']+)/.exec(t);
    if (/\b(?:good ?bye|bye)\b/.test(t)) return { choix: 1 };
    if (moi && moi[1] === 'daniel') return { choix: 2 };
    const salut = /\b(?:hello|hi|hey|good morning|morning)\b/.test(t);
    if (salut && moi) return { accepte: true };
    if (moi) return { partiel: 0 };
    if (salut) return { partiel: 1 };
    return null;
  },
  N2: (t) => {
    if (/\b(?:you're|you are|your|youre) welcome\b/.test(t)) return { choix: 1 };
    if (/\bnice to meet you too\b/.test(t) || /\byou too\b/.test(t) || /\bnice to meet you to\b/.test(t)) return { accepte: true };
    if (/\bnice to meet you\b/.test(t)) return { partiel: 0 };
    return null;
  },
  N3: (t, metiers) => {
    if (/\b(?:i'm|im|i am) (?:a|an|the) [a-z]+/.test(t) || /\b(?:i'm|im|i am) retired\b/.test(t)) return { accepte: true };
    const m = /\b(?:i'm|im|i am) ([a-z]+)/.exec(t);
    if (m && (metiers.has(m[1]) || m[1].length > 3)) return { partiel: 0 };
    return null;
  },
  N4: (t) => {
    if (/\b(?:she's|she is|shes) claire\b/.test(t)) return { choix: 2 };
    const claire = /\b(?:claire|clare|clair)\b/.test(t);
    if (/\bdaniel\b/.test(t) && !claire) return { choix: 1 };
    const salut = /\b(?:nice to meet you|hello|hi|hey)\b/.test(t);
    if (salut && claire) return { accepte: true };
    if (/\bnice to meet you\b/.test(t)) return { partiel: 0 };
    return null;
  },
  N5: (t) => {
    if (/\b(?:they're|they are|theyre|there|their) new\b/.test(t)) return { choix: 1 };
    // « were new » : c'est ainsi qu'une transcription écrit souvent « we're new ».
    if (/\b(?:we're|we are|were|were're) new\b/.test(t)) return { accepte: true };
    return null;
  },
};

export async function monter(racine, ctx) {
  ctx.ajouterStyle(CSS);
  const S = ctx.services || {};
  const R = retourTypo(S.retour);
  try { await S.voix?.pret?.(); } catch { /* sans manifeste : bulles en texte */ }
  const etape = ctx.donnees;
  const noeuds = etape.noeuds || {};
  const fin = etape.ecran_de_fin || {};

  // Tous les segments de voix de l'étape, pour résoudre les { ref }.
  const segments = new Map();
  (function collecter(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(collecter); return; }
    if (o.id && o.voix && o.texte) segments.set(o.id, o);
    Object.values(o).forEach(collecter);
  })(etape);
  async function seg(s) {
    if (!s) return null;
    if (!s.ref) return s;
    if (segments.has(s.ref)) return segments.get(s.ref);
    try { const r = await ctx.segment?.(s.ref); if (r) return r; } catch { /* hors script */ }
    return { id: s.ref, texte: '' };
  }
  const infoSon = (s) => { try { const i = s?.id ? S.voix?.info(s.id) : null; return i?.url ? i : null; } catch { return null; } };

  // Les métiers de PRO-4, pour l'aide du nœud « et vous ? » et la tolérance du mode Parler.
  let metiersListe = [];
  try {
    const pro = await ctx.script('prononciation.json');
    metiersListe = (pro?.etapes || []).find((e) => e.id === 'PRO-4')?.aide_metier?.liste || [];
  } catch { metiersListe = []; }
  const metiers = new Set(metiersListe.map((m) => String(m.en).toLowerCase().replace(/^(a|an)\s+/, '').split(' ').pop()));

  const ordreBase = Object.keys(noeuds).filter((k) => !k.endsWith('-reprise') && !noeuds[k].fin);
  const totalPoints = ordreBase.reduce((s, k) => s + (Number(noeuds[k].points) || 0), 0) || 1;
  const dispoMicro = (() => { try { return S.micro?.disponible?.() || { ok: false, raison: 'non-supporte' }; } catch { return { ok: false, raison: 'non-supporte' }; } })();
  const grandEcran = window.matchMedia?.('(pointer: fine) and (min-width: 900px)').matches;

  const st = {
    prenom: String(ctx.stockage?.lire('prenom', '') || ''),
    mode: dispoMicro.ok && grandEcran ? 'parler' : 'choisir',
    noeud: null,
    base: null,
    recap: new Map(),      // base → { premier: {texte, statut, retour}, justeAuPremier }
    points: 0,
    toutChoisir: true,
    jeton: 0,
    prise: null,
    occupe: false,
  };
  let barre = null;

  const imgFond = (() => { try { return ctx.image?.((etape.images || [])[0] || 'S05'); } catch { return null; } })();
  const interlocuteur = ctx.unite === 'U01' ? 'claire' : [...segments.values()].find(s => s.personnage)?.personnage || 'daniel';
  const imgClaire = visage(ctx, interlocuteur);
  const nomInterlocuteur = interlocuteur.charAt(0).toUpperCase() + interlocuteur.slice(1);
  racine.innerHTML = `
    <section class="jr carte">
      <div class="jr-scene">
        ${imgFond ? `<img class="jr-fond" src="${echapper(imgFond)}" alt="${ctx.unite === 'U01' ? "Daniel vous accueille à l'accueil de l'agence." : 'La situation de votre dialogue.'}">` : ''}
        ${imgClaire ? `<span class="jr-invitee" aria-hidden="true"><img src="${echapper(imgClaire)}" alt=""><b>${echapper(nomInterlocuteur)}</b></span>` : ''}
      </div>
      <div class="jr-prenom">
        <p class="jr-sur">Avant de commencer</p>
        <label for="jr-prenom-champ" class="jr-prenom-label">Votre prénom</label>
        <p class="petit discret">${ctx.unite === 'U01' ? 'Vous jouez votre propre rôle : Daniel vous accueille, vous répondez avec vos vraies informations.' : 'Suivez la situation et les informations de la consigne. Votre prénom sert à vous nommer dans ce dialogue.'}</p>
        <div class="jr-prenom-ligne">
          <input id="jr-prenom-champ" type="text" autocomplete="given-name" autocapitalize="words" spellcheck="false" enterkeyhint="go" maxlength="30" value="${echapper(st.prenom)}" placeholder="Par exemple : Sophie">
          <button type="button" class="btn btn-primaire" data-commencer>Commencer ${ICONES.suite}</button>
        </div>
        <p class="jr-prenom-erreur petit" hidden>Écrivez votre prénom pour commencer.</p>
      </div>
      <ol class="jr-fil" aria-live="polite" aria-label="La conversation" hidden></ol>
      <div class="jr-reponse" hidden></div>
      <div class="jr-fin" hidden></div>
    </section>`;
  const $ = (s) => racine.querySelector(s);
  const fil = $('.jr-fil');
  const zoneReponse = $('.jr-reponse');

  // ── Démarrage ───────────────────────────────────────────────────────────
  function commencer() {
    const v = $('#jr-prenom-champ').value.trim().replace(/\s+/g, ' ');
    if (!v) { $('.jr-prenom-erreur').hidden = false; $('#jr-prenom-champ').focus(); return; }
    st.prenom = v.charAt(0).toUpperCase() + v.slice(1);
    try { ctx.stockage?.ecrire('prenom', st.prenom); } catch { /* facultatif */ }
    $('.jr-prenom').hidden = true;
    fil.hidden = false;
    allerA(etape.demarrage || 'N1');
  }
  $('[data-commencer]').addEventListener('click', commencer);
  $('#jr-prenom-champ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commencer(); } });

  const avecPrenom = (t) => String(t || '').replace(/\{prenom\}/g, st.prenom || 'Alex');

  function resoudre(id) {
    const n = noeuds[id];
    if (!n) return null;
    if (n.choix_identiques_a) {
      const src = noeuds[n.choix_identiques_a] || {};
      return { ...src, ...n, choix: src.choix, oral: src.oral, but: src.but, fr: n.fr || src.fr, id, base: n.choix_identiques_a };
    }
    return { ...n, id, base: id };
  }

  // ── Bulles ──────────────────────────────────────────────────────────────
  function ajouter(html) {
    const li = document.createElement('li');
    li.className = 'jr-item apparait';
    li.innerHTML = html;
    fil.append(li);
    requestAnimationFrame(() => li.scrollIntoView({ block: 'nearest', behavior: reduit() ? 'auto' : 'smooth' }));
    return li;
  }
  const reduit = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const pause = (ms) => new Promise((r) => { const t = setTimeout(r, reduit() ? Math.min(ms, 150) : ms); ctx.surDemontage?.(() => clearTimeout(t)); });

  async function direPersonnage(idPerso, s, fr) {
    const moi = st.jeton;
    const p = personnage(idPerso);
    const portrait = visage(ctx, idPerso);
    const li = ajouter(`<div class="jr-bulle jr-perso" style="--c:${p.couleur}">
      ${portrait ? `<img class="jr-avatar" src="${echapper(portrait)}" alt="">` : `<span class="jr-avatar jr-avatar-vide"></span>`}
      <div class="jr-bulle-corps"><b class="jr-nom">${echapper(p.nom)}</b><span class="jr-tape" aria-label="${echapper(p.nom)} parle"><i></i><i></i><i></i></span></div></div>`);
    await pause(520);
    if (moi !== st.jeton) return;
    const info = infoSon(s);
    li.querySelector('.jr-bulle-corps').innerHTML = `
      <b class="jr-nom">${echapper(p.nom)}</b>
      <p class="jr-en" lang="en">${echapper(s?.texte || '')}</p>
      ${fr ? `<p class="jr-fr" lang="fr" hidden>${echapper(fr)}</p>` : ''}
      <span class="jr-bulle-actions">
        ${info ? `<button type="button" class="jr-mini" data-rejouer aria-label="Réécouter ${echapper(p.nom)}">${ICONES.ecouter}</button>` : ''}
        ${fr ? '<button type="button" class="jr-mini jr-mini-fr" data-fr aria-pressed="false">FR</button>' : ''}
      </span>`;
    li.querySelector('[data-rejouer]')?.addEventListener('click', () => jouer(info));
    li.querySelector('[data-fr]')?.addEventListener('click', (e) => {
      const f = li.querySelector('.jr-fr');
      f.hidden = !f.hidden;
      e.currentTarget.setAttribute('aria-pressed', String(!f.hidden));
    });
    if (info) await jouer(info);
  }

  async function jouer(info) {
    if (!info) return 'absent';
    try { ctx.tracer?.('audio_ecoute', { item: info.id }); } catch { /* facultatif */ }
    try { return await S.audio.jouer(info.url, { canal: 'media', garde: info.duree_s || 6 }); } catch { return 'erreur'; }
  }

  function direVous(texte, { oral = false } = {}) {
    ajouter(`<div class="jr-bulle jr-vous"><div class="jr-bulle-corps"><b class="jr-nom">Vous${oral ? ' <span class="jr-oral">à l\'oral</span>' : ''}</b><p class="jr-en" lang="en">${echapper(texte)}</p></div></div>`);
  }

  function retourDansFil(type, texte, explication) {
    const li = document.createElement('li');
    li.className = 'jr-item jr-retour apparait';
    const e = type === 'juste' ? R?.juste?.(texte) : type === 'faux' ? R?.faux?.(texte, { explication }) : R?.info?.(explication ? `${texte} ${explication}` : texte);
    if (e) li.append(e); else li.textContent = typo(`${texte} ${explication || ''}`);
    fil.append(li);
    requestAnimationFrame(() => li.scrollIntoView({ block: 'nearest', behavior: reduit() ? 'auto' : 'smooth' }));
  }

  // ── Nœuds ───────────────────────────────────────────────────────────────
  async function allerA(id) {
    const n = resoudre(id);
    if (!n) return;
    st.jeton++;
    st.noeud = n;
    st.base = n.base;
    zoneReponse.hidden = true;
    zoneReponse.innerHTML = '';
    // Mise en scène : Claire rejoint Daniel à partir de N4.
    const rangBase = ordreBase.indexOf(n.base);
    if (rangBase >= 3 || n.personnage === 'claire') $('.jr-invitee')?.classList.add('la');
    const s = await seg(n.replique);
    await direPersonnage(n.personnage, s, n.fr);
    if (st.noeud !== n) return;
    if (n.fin) { await pause(700); terminer(); return; }
    afficherReponse(n);
  }

  function afficherReponse(n) {
    const graine = [...n.base].reduce((a, c) => a + c.charCodeAt(0), 0);
    const ordre = melanger(n.choix.map((_, k) => k), graine);
    const aideMetier = n.base === 'N3' && metiersListe.length;
    zoneReponse.innerHTML = `
      <p class="jr-but"><span class="jr-but-libelle">Votre objectif</span> ${echapper(n.but || '')}</p>
      <div class="jr-modes" role="tablist" aria-label="Façon de répondre">
        <button type="button" role="tab" data-mode="choisir" aria-selected="${st.mode === 'choisir'}">Choisir une phrase</button>
        <button type="button" role="tab" data-mode="parler" aria-selected="${st.mode === 'parler'}" ${dispoMicro.ok ? '' : 'aria-disabled="true"'}>${ICONES.micro}<span>Parler</span></button>
      </div>
      <div class="jr-choisir" ${st.mode === 'choisir' ? '' : 'hidden'}>
        ${n.note_choix && n.base === 'N3' ? '<p class="petit discret jr-note">Ici, les trois phrases parlent du même métier : choisissez la forme correcte. En mode Parler, dites votre vrai métier.</p>' : ''}
        <div class="jr-options">${ordre.map((k) => `<button type="button" class="jr-option" data-k="${k}" lang="en">${echapper(avecPrenom(n.choix[k].texte))}</button>`).join('')}</div>
      </div>
      <div class="jr-parler" ${st.mode === 'parler' ? '' : 'hidden'}>
        <div class="jr-micro-ligne">
          <button type="button" class="jr-micro" aria-label="Parler : toucher pour commencer" ${dispoMicro.ok ? '' : 'disabled'}>${ICONES.micro}</button>
          <p class="jr-micro-aide">${dispoMicro.ok ? 'Touchez le micro et répondez à voix haute. Touchez à nouveau pour arrêter.' : (dispoMicro.raison === 'non-securise' ? 'Le micro ne fonctionne que sur l\'adresse sécurisée du prototype (https). Choisissez une phrase.' : 'Ce navigateur ne permet pas d\'enregistrer la voix. Choisissez une phrase.')}</p>
        </div>
        <p class="jr-entendu" hidden></p>
      </div>
      ${aideMetier ? `<details class="jr-metiers"><summary>Votre métier en anglais</summary><ul>${metiersListe.map((m) => `<li><b lang="en">${echapper(m.en)}</b> <span>${echapper(m.fr)}</span></li>`).join('')}</ul></details>` : ''}
      <div class="jr-aide"></div>
      <div class="jr-suite"></div>`;
    zoneReponse.hidden = false;
    zoneReponse.querySelectorAll('.jr-option').forEach((b) => b.addEventListener('click', () => choisir(n, Number(b.dataset.k), { oral: false })));
    zoneReponse.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.mode === 'parler' && !dispoMicro.ok) {
        zoneReponse.querySelector('.jr-parler').hidden = false;
        zoneReponse.querySelector('.jr-choisir').hidden = true;
      }
      changerMode(b.dataset.mode);
    }));
    zoneReponse.querySelector('.jr-micro').addEventListener('click', () => (st.prise ? arreterEcoute() : ecouter(n)));
    barre = null;
    if (ctx.regime !== 'evaluation' && S.aide?.barre) {
      try {
        barre = S.aide.barre(ctx, {
          item: () => n.base,
          indice: `Relisez votre objectif : ${n.but || ''} Cherchez la phrase qui y répond exactement.`,
          surMontrer: () => ecouterModele(n),
          surSolution: () => montrerSolution(n),
        });
        zoneReponse.querySelector('.jr-aide').append(barre.element);
      } catch { barre = null; }
    }
    requestAnimationFrame(() => zoneReponse.scrollIntoView({ block: 'nearest', behavior: reduit() ? 'auto' : 'smooth' }));
  }

  function changerMode(m) {
    st.mode = m;
    zoneReponse.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    zoneReponse.querySelector('.jr-choisir').hidden = m !== 'choisir';
    zoneReponse.querySelector('.jr-parler').hidden = m !== 'parler';
    if (m !== 'parler') annulerEcoute();
  }

  function modeleDe(base) {
    const k = ordreBase.indexOf(base);
    if(ctx.unite !== 'U01' && noeuds[base]?.modele_reponse) {
      const audio=noeuds[base].modele_reponse;
      return {en:audio.texte||noeuds[base].choix?.find(c=>c.statut==='juste')?.texte, audio};
    }
    return (fin.phrases_modeles || [])[k] || null;
  }
  async function ecouterModele(n) {
    const m = modeleDe(n.base);
    if (!m) return;
    const s = await seg(m.audio);
    let info = infoSon(s);
    const comparable = (t) => String(t || '').toLowerCase().replace(/\{prenom\}/g, 'alex').replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (info && comparable(info.texte || s?.texte) !== comparable(m.en)) info = null;
    const z = zoneReponse.querySelector('.jr-suite');
    z.innerHTML = '';
    const texte = avecPrenom(m.en);
    z.append(R?.info ? R.info(`Une bonne réponse : ${texte}${/\{prenom\}/.test(m.en) ? ' (l\'exemple audio dit le prénom Alex)' : ''}`) : document.createTextNode(texte));
    if (info) await jouer(info);
  }
  function montrerSolution(n) {
    const k = n.choix.findIndex((c) => c.statut === 'juste');
    const b = zoneReponse.querySelector(`.jr-option[data-k="${k}"]`);
    changerMode('choisir');
    b?.classList.add('jr-option-solution');
    const z = zoneReponse.querySelector('.jr-suite');
    z.innerHTML = '';
    z.append(R?.reponse ? R.reponse(avecPrenom(n.choix[k].texte), { explication: avecPrenom(n.choix[k].retour || '') }) : document.createTextNode(n.choix[k].texte));
    b?.focus({ preventScroll: true });
  }

  // ── Répondre ────────────────────────────────────────────────────────────
  async function choisir(n, k, { oral = false, transcription = '', partiel = null } = {}) {
    if (st.occupe || st.noeud !== n) return;
    st.occupe = true;
    annulerEcoute();
    try { S.audio?.arreter?.('media'); } catch { /* rien */ }
    const moi = ++st.jeton;
    if (oral) st.toutChoisir = false;
    const c = partiel !== null ? { ...(n.oral?.accepte_partiel?.[partiel] || {}), statut: 'partiel' } : n.choix[k];
    const texteVous = oral ? transcription : avecPrenom(c.texte);
    zoneReponse.hidden = true;
    direVous(texteVous, { oral });

    const deja = st.recap.has(n.base);
    const premier = !deja;
    const juste = c.statut === 'juste';
    const accepte = juste || c.statut === 'partiel';
    const point = juste && premier && !n.id.endsWith('-reprise') && Number(n.points) > 0;
    if (point) st.points += Number(n.points) || 1;
    const retour = avecPrenom(c.retour || (juste ? 'Oui.' : ''));
    if (!deja) st.recap.set(n.base, { texte: texteVous, statut: c.statut, retour, juste: juste });
    const modele = n.choix.find((x) => x.statut === 'juste');
    ctx.signaler?.essai?.({
      juste: juste ? true : c.statut === 'partiel' ? 'presque' : false,
      item: `DLG-${n.base}`,
      element: segments.get(n.replique?.id || n.replique?.ref)?.texte || n.but,
      attendu: String(modele?.texte || '').replace(/\{prenom\}/g, '[votre prénom]'),
      donne: oral ? '(réponse à l\'oral)' : String(c.texte || '').replace(/\{prenom\}/g, '[votre prénom]'),
      explication: retour || undefined,
      remediation: etape.remediation, premier_essai: premier,
    });
    try { ctx.tracer?.('reponse_donnee', { item: `DLG-${n.base}`, juste }); } catch { /* facultatif */ }

    // Réaction du personnage (reformulation, étonnement), puis l'explication.
    const reaction = await seg(c.reaction || (juste && oral ? n.oral?.reaction_si_accepte : null) || (juste ? n.choix?.find((x) => x.statut === 'juste')?.reaction : null));
    if (juste) {
      retourDansFil('juste', retour);
      S.sons?.jouer?.('juste');
      if (reaction?.texte) { await pause(350); await direPersonnage(personnageDe(reaction, n), reaction); }
      await pause(900);
      st.occupe = false;
      if (moi === st.jeton) allerA(c.suite || suiteJuste(n));
      return;
    }
    if (reaction?.texte) { await pause(300); await direPersonnage(personnageDe(reaction, n), reaction); }
    if (moi !== st.jeton) { st.occupe = false; return; }
    if (c.statut === 'partiel') { retourDansFil('info', retour); S.sons?.jouer?.('juste'); }
    else { retourDansFil('faux', 'Pas tout à fait.', retour); S.sons?.jouer?.('faux'); barre?.erreur?.(); }
    const suite = c.suite || suiteJuste(n);
    const reprise = suite.endsWith('-reprise');
    const li = document.createElement('li');
    li.className = 'jr-item jr-continuer apparait';
    li.innerHTML = `<button type="button" class="btn ${reprise ? 'btn-primaire' : 'btn-secondaire'}">${reprise ? `${ICONES.rejouer}<span>Réessayer</span>` : `<span>Continuer la conversation</span>${ICONES.suite}`}</button>`;
    fil.append(li);
    const b = li.querySelector('button');
    b.addEventListener('click', () => { li.remove(); allerA(suite); }, { once: true });
    requestAnimationFrame(() => li.scrollIntoView({ block: 'nearest', behavior: reduit() ? 'auto' : 'smooth' }));
    b.focus({ preventScroll: true });
    st.occupe = false;
  }
  const suiteJuste = (n) => n.choix.find((x) => x.statut === 'juste')?.suite || 'N6';
  const personnageDe = (s, n) => s.personnage || n.personnage;

  // ── Mode Parler : micro, transcription locale, règles du script ─────────
  async function ecouter(n) {
    const bouton = zoneReponse.querySelector('.jr-micro');
    const aide = zoneReponse.querySelector('.jr-micro-aide');
    const entendu = zoneReponse.querySelector('.jr-entendu');
    entendu.hidden = true;
    try { S.audio?.arreter?.('media'); } catch { /* rien */ }
    try { await S.micro.ouvrir(); } catch (e) {
      aide.textContent = e?.code === 'refuse' ? typo('Le micro est refusé : autorisez-le dans les réglages du navigateur, ou choisissez une phrase.')
        : e?.code === 'absent' ? 'Aucun micro trouvé : choisissez une phrase.' : 'Le micro est occupé par une autre application.';
      return;
    }
    if (st.noeud !== n) return;
    let parole = false; let silenceDepuis = 0;
    const debut = Date.now();
    st.prise = S.micro.enregistrer({
      dureeMax: 15000,
      surNiveau: (v) => {
        bouton.style.setProperty('--niveau', String(Math.min(1, v * 1.6)));
        // Arrêt automatique : 1,3 s de silence après avoir parlé.
        if (v > 0.08) { parole = true; silenceDepuis = 0; }
        else if (parole && v < 0.03) {
          if (!silenceDepuis) silenceDepuis = Date.now();
          else if (Date.now() - silenceDepuis > 1300 && Date.now() - debut > 1200) arreterEcoute();
        }
      },
    });
    st.minuterie = setTimeout(() => arreterEcoute(), 15100);
    st.ecoute = n;
    bouton.classList.add('enregistre');
    bouton.innerHTML = ICONES.stop;
    bouton.setAttribute('aria-label', 'Arrêter l\'enregistrement');
    aide.textContent = 'Je vous écoute… (arrêt automatique après votre phrase)';
  }

  async function arreterEcoute() {
    clearTimeout(st.minuterie);
    const prise = st.prise;
    const n = st.ecoute;
    if (!prise || !n) return;
    st.prise = null;
    const bouton = zoneReponse.querySelector('.jr-micro');
    const aide = zoneReponse.querySelector('.jr-micro-aide');
    const entendu = zoneReponse.querySelector('.jr-entendu');
    if (bouton) { bouton.classList.remove('enregistre'); bouton.innerHTML = ICONES.micro; bouton.disabled = true; bouton.style.setProperty('--niveau', '0'); }
    let enr;
    try { enr = await prise.arreter(); } catch { if (aide) aide.textContent = 'L\'enregistrement a échoué. Réessayez.'; if (bouton) bouton.disabled = false; return; }
    if (st.noeud !== n) return;
    try { ctx.tracer?.('enregistrement_depose', { item: `DLG-${n.base}` }); } catch { /* facultatif */ }
    aide.textContent = 'Transcription en cours…';
    let r;
    try { r = await S.prononciation.transcrire(enr.blob); } catch { r = { ok: false, code: 'indisponible' }; }
    if (st.noeud !== n) return;
    bouton.disabled = false;
    bouton.setAttribute('aria-label', 'Parler à nouveau');
    if (!r?.ok || !String(r.texte || '').trim()) {
      const raisons = { 'trop-court': 'L\'enregistrement est trop court.', silence: 'Nous n\'avons rien entendu.', indisponible: 'La transcription est indisponible pour le moment : choisissez une phrase.' };
      aide.textContent = typo(`${raisons[r?.code] || n.oral?.non_reconnu || 'Nous n\'avons pas bien entendu.'} Touchez le micro pour réessayer.`);
      return;
    }
    const texte = String(r.texte).trim();
    const t = texte.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
    const regle = ORAL[n.base];
    let verdict = regle ? regle(t, metiers) : null;
    if(ctx.unite !== 'U01') {
      const normaliser=s=>avecPrenom(s).toLowerCase().replace(/[’‘]/g,"'").replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
      const k=n.choix.findIndex(c=>normaliser(c.texte)===normaliser(texte));
      verdict=k<0?null:{choix:k};
    }
    if (!verdict) {
      entendu.hidden = false;
      entendu.innerHTML = `<span class="jr-entendu-libelle">Nous avons entendu</span> <span lang="en">« ${echapper(texte)} »</span>`;
      aide.textContent = typo(ctx.unite !== 'U01' ? 'Cette formulation libre demande une relecture humaine. Vous pouvez choisir une phrase pour poursuivre ; ce choix compte en lecture.' : `${n.oral?.non_reconnu || 'Nous n\'avons pas bien entendu.'} Touchez le micro pour réessayer.`);
      barre?.erreur?.();
      return;
    }
    if (verdict.accepte) choisir(n, n.choix.findIndex((c) => c.statut === 'juste'), { oral: true, transcription: texte });
    else if (verdict.choix !== undefined) choisir(n, verdict.choix, { oral: true, transcription: texte });
    else if (verdict.partiel !== undefined) choisir(n, -1, { oral: true, transcription: texte, partiel: verdict.partiel });
  }

  function annulerEcoute() {
    clearTimeout(st.minuterie);
    if (st.prise) { try { st.prise.annuler(); } catch { /* déjà fini */ } st.prise = null; }
  }

  // ── Fin ─────────────────────────────────────────────────────────────────
  async function terminer() {
    zoneReponse.hidden = true;
    const score = st.points / totalPoints;
    ctx.signaler?.fin?.({ score, reussi: true, points_obtenus: st.points });
    S.sons?.jouer?.('fin');
    const lignes = await Promise.all(ordreBase.map(async (base) => {
      const n = resoudre(base);
      const r = st.recap.get(base);
      const m = modeleDe(base);
      const s = m ? await seg(m.audio) : null;
      // On ne propose d'écouter que si l'audio dit bien la phrase affichée (au prénom d'exemple près).
      let info = infoSon(s);
      const comparable = (t) => String(t || '').toLowerCase().replace(/\{prenom\}/g, 'alex').replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (info && m && comparable(info.texte || s?.texte) !== comparable(m.en)) info = null;
      return { base, n, r, m, info };
    }));
    const z = $('.jr-fin');
    z.innerHTML = `
      <p class="jr-sur">${echapper(fin.titre || 'Conversation terminée')}</p>
      <h3 class="jr-fin-titre">${st.points} réponse${st.points > 1 ? 's' : ''} juste${st.points > 1 ? 's' : ''} du premier coup, sur ${totalPoints}</h3>
      <ol class="jr-recap">${lignes.map(({ base, n, r, m, info }) => `
        <li class="${r?.juste ? 'jr-recap-ok' : 'jr-recap-a-revoir'}">
          <span class="jr-recap-marque">${r?.juste ? ICONES.coche : ICONES.rejouer}</span>
          <div>
            <p class="jr-recap-but">${echapper(n.but || base)}</p>
            ${r ? `<p class="jr-recap-vous"><span>Vous :</span> <span lang="en">${echapper(r.texte)}</span></p>` : ''}
            ${!r?.juste && m ? `<p class="jr-recap-modele"><span>Phrase modèle :</span> <span lang="en">${echapper(avecPrenom(m.en))}</span></p>` : ''}
            ${!r?.juste && r?.retour ? `<p class="jr-recap-pourquoi">${echapper(r.retour)}</p>` : ''}
          </div>
          ${info ? `<button type="button" class="jr-mini" data-modele="${echapper(base)}" aria-label="Écouter la phrase modèle">${ICONES.ecouter}</button>` : ''}
        </li>`).join('')}</ol>
      ${lignes.some((l) => /\{prenom\}/.test(l.m?.en || '')) ? '<p class="petit discret">Les exemples audio utilisent le prénom Alex.</p>' : ''}
      <div class="jr-fin-actions">
        ${st.toutChoisir && dispoMicro.ok ? `<button type="button" class="btn btn-primaire" data-rejouer-parler>${ICONES.micro}<span>Rejouer en mode Parler</span></button>` : ''}
        <button type="button" class="btn btn-secondaire" data-rejouer-tout>${ICONES.rejouer}<span>Rejouer la conversation</span></button>
      </div>`;
    z.hidden = false;
    z.querySelectorAll('[data-modele]').forEach((b) => {
      const l = lignes.find((x) => x.base === b.dataset.modele);
      b.addEventListener('click', () => jouer(l.info));
    });
    z.querySelector('[data-rejouer-parler]')?.addEventListener('click', () => rejouer('parler'));
    z.querySelector('[data-rejouer-tout]').addEventListener('click', () => rejouer(st.mode));
    requestAnimationFrame(() => z.scrollIntoView({ block: 'nearest', behavior: reduit() ? 'auto' : 'smooth' }));
  }

  function rejouer(mode) {
    st.jeton++;
    st.mode = mode;
    st.recap.clear();
    st.points = 0;
    st.toutChoisir = true;
    st.occupe = false;
    fil.innerHTML = '';
    $('.jr-fin').hidden = true;
    $('.jr-invitee')?.classList.remove('la');
    allerA(etape.demarrage || 'N1');
  }

  ctx.signaler?.pret?.();
  return {
    demonter() { st.jeton++; annulerEcoute(); },
    montrer() { if (st.noeud && !st.noeud.fin) ecouterModele(st.noeud); },
    montrerSolution() { if (st.noeud && !st.noeud.fin) montrerSolution(st.noeud); },
  };
}

const CSS = `
${RACINE} .jr { padding: 0; overflow: hidden; display: grid; }
${RACINE} .jr-scene { position: relative; aspect-ratio: 16 / 8; background: #1F2A30; overflow: hidden; }
@media (max-width: 599px) { ${RACINE} .jr-scene { aspect-ratio: 16 / 9; } }
${RACINE} .jr-fond { width: 100%; height: 100%; object-fit: cover; object-position: 50% 35%; }
${RACINE} .jr-invitee { position: absolute; right: 14px; bottom: 12px; display: grid; justify-items: center; gap: 4px; color: #fff; opacity: 0; transform: translateX(40px); transition: opacity .6s var(--doux), transform .7s var(--ressort); pointer-events: none; }
${RACINE} .jr-invitee.la { opacity: 1; transform: none; }
${RACINE} .jr-invitee img { width: 64px; height: 64px; border-radius: 999px; object-fit: cover; border: 3px solid #fff; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
${RACINE} .jr-invitee b { font-size: .8125rem; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
${RACINE} .jr-prenom { padding: 18px; display: grid; gap: 8px; }
${RACINE} .jr-sur { font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--c-parler); }
${RACINE} .jr-prenom-label { font-family: var(--police-titre); font-weight: 600; font-size: 1.25rem; }
${RACINE} .jr-prenom-ligne { display: flex; gap: 8px; margin-top: 4px; }
${RACINE} .jr-prenom-ligne input { flex: 1; min-width: 0; min-height: 52px; padding: 10px 14px; border-radius: var(--rayon-bouton); border: 1.5px solid var(--filet-fort); background: var(--surface); font-size: 1.05rem; }
${RACINE} .jr-prenom-ligne input:focus { outline: none; border-color: var(--c-parler); box-shadow: 0 0 0 3px var(--c-parler-voile); }
${RACINE} .jr-prenom-erreur { color: var(--faux-fonce); }
@media (max-width: 479px) { ${RACINE} .jr-prenom-ligne { flex-direction: column; } }
${RACINE} .jr-fil { list-style: none; margin: 0; padding: 16px 16px 4px; display: grid; gap: 10px; }
${RACINE} .jr-item { scroll-margin-bottom: 110px; }
${RACINE} .jr-bulle { display: flex; gap: 10px; align-items: flex-end; max-width: 92%; }
${RACINE} .jr-vous { margin-left: auto; justify-content: flex-end; }
${RACINE} .jr-avatar { width: 40px; height: 40px; border-radius: 999px; object-fit: cover; flex: none; background: var(--filet); }
${RACINE} .jr-bulle-corps { position: relative; padding: 10px 14px; border-radius: 18px; background: var(--fond); border: 1px solid var(--filet); min-width: 0; }
${RACINE} .jr-perso .jr-bulle-corps { border-bottom-left-radius: 6px; }
${RACINE} .jr-vous .jr-bulle-corps { background: var(--c-parler-voile); border-color: #F0D5C6; border-bottom-right-radius: 6px; }
${RACINE} .jr-nom { display: block; font-size: .75rem; font-weight: 700; color: var(--c, var(--c-parler)); }
${RACINE} .jr-oral { font-weight: 500; color: var(--encre-50); }
${RACINE} .jr-en { font-size: 1.05rem; font-weight: 500; line-height: 1.45; }
${RACINE} .jr-fr { font-size: .9rem; color: var(--encre-70); margin-top: 2px; }
${RACINE} .jr-bulle-actions { display: flex; gap: 4px; margin-top: 4px; margin-left: -8px; }
${RACINE} .jr-mini { min-width: 44px; min-height: 36px; display: inline-grid; place-items: center; padding: 0 8px; border-radius: 999px; border: 0; background: none; color: var(--encre-50); font: inherit; font-size: .75rem; font-weight: 700; cursor: pointer; }
${RACINE} .jr-mini svg { width: 18px; height: 18px; }
${RACINE} .jr-mini:hover { color: var(--marque); background: var(--marque-voile); }
${RACINE} .jr-mini-fr[aria-pressed="true"] { color: var(--marque-tres-fonce); background: var(--marque-voile); }
${RACINE} .jr-tape { display: inline-flex; gap: 4px; padding: 6px 0 2px; }
${RACINE} .jr-tape i { width: 7px; height: 7px; border-radius: 999px; background: var(--encre-30); animation: jr-tape 1s ease-in-out infinite; }
${RACINE} .jr-tape i:nth-child(2) { animation-delay: .15s; } ${RACINE} .jr-tape i:nth-child(3) { animation-delay: .3s; }
@keyframes jr-tape { 0%, 100% { opacity: .35; transform: none; } 50% { opacity: 1; transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) { ${RACINE} .jr-tape i { animation: none; opacity: .6; } }
${RACINE} .jr-retour .encart { font-size: .9rem; }
${RACINE} .jr-continuer { display: flex; justify-content: center; }
${RACINE} .jr-reponse { padding: 8px 16px 18px; display: grid; gap: 12px; border-top: 1px solid var(--filet); background: linear-gradient(180deg, var(--surface), var(--fond)); scroll-margin-bottom: 96px; }
${RACINE} .jr-but { font-size: .95rem; font-weight: 600; margin-top: 8px; }
${RACINE} .jr-but-libelle { display: block; font-size: .75rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--c-parler); }
${RACINE} .jr-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 999px; background: var(--filet); }
${RACINE} .jr-modes button { min-height: 40px; border-radius: 999px; border: 0; background: none; font: inherit; font-weight: 600; font-size: .9rem; color: var(--encre-70); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
${RACINE} .jr-modes button svg { width: 18px; height: 18px; }
${RACINE} .jr-modes button[aria-selected="true"] { background: var(--surface); color: var(--encre); box-shadow: var(--ombre-carte); }
${RACINE} .jr-modes button[aria-disabled="true"] { opacity: .55; }
${RACINE} .jr-options { display: grid; gap: 8px; }
${RACINE} .jr-option { min-height: 52px; padding: 10px 16px; border-radius: var(--rayon-bloc); border: 1.5px solid var(--filet-fort); background: var(--surface); font: inherit; font-weight: 600; font-size: 1.02rem; text-align: left; color: var(--encre); cursor: pointer; transition: border-color .15s, background-color .15s, transform .2s var(--ressort); }
${RACINE} .jr-option:hover { border-color: var(--c-parler); background: var(--c-parler-voile); }
${RACINE} .jr-option:active { transform: scale(.985); }
${RACINE} .jr-option-solution { border-color: var(--reponse-bord); background: var(--reponse-fond); color: var(--reponse-encre); }
${RACINE} .jr-note { margin-bottom: 6px; }
${RACINE} .jr-micro-ligne { display: flex; align-items: center; gap: 14px; }
${RACINE} .jr-micro { --niveau: 0; width: 68px; height: 68px; flex: none; border-radius: 999px; border: 0; display: grid; place-items: center; background: var(--c-parler); color: #fff; cursor: pointer; box-shadow: 0 0 0 calc(var(--niveau) * 12px) var(--c-parler-voile); transition: box-shadow .08s linear; }
${RACINE} .jr-micro svg { width: 30px; height: 30px; }
${RACINE} .jr-micro.enregistre { background: var(--faux-fonce); box-shadow: 0 0 0 calc(4px + var(--niveau) * 14px) var(--faux-voile); }
${RACINE} .jr-micro:disabled { opacity: .45; cursor: not-allowed; }
${RACINE} .jr-micro-aide { font-size: .9rem; color: var(--encre-70); }
${RACINE} .jr-entendu { padding: 10px 12px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); font-size: .95rem; }
${RACINE} .jr-entendu-libelle { display: block; font-size: .75rem; font-weight: 700; color: var(--encre-50); text-transform: uppercase; letter-spacing: .05em; }
${RACINE} .jr-metiers { border: 1px solid var(--filet); border-radius: var(--rayon-bloc); padding: 0 14px; background: var(--surface); }
${RACINE} .jr-metiers summary { min-height: 44px; display: flex; align-items: center; font-weight: 600; font-size: .9rem; cursor: pointer; }
${RACINE} .jr-metiers ul { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 4px; font-size: .9rem; }
${RACINE} .jr-metiers li span { color: var(--encre-70); }
${RACINE} .jr-metiers li span::before { content: '— '; color: var(--encre-50); }
${RACINE} .jr-aide:empty, ${RACINE} .jr-suite:empty { display: none; }
${RACINE} .jr-fin { padding: 18px; display: grid; gap: 8px; border-top: 1px solid var(--filet); }
${RACINE} .jr-fin-titre { font-family: var(--police-titre); font-weight: 600; font-size: clamp(1.15rem, 1rem + .6vw, 1.4rem); }
${RACINE} .jr-recap { list-style: none; margin: 4px 0 0; padding: 0; display: grid; }
${RACINE} .jr-recap li { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 10px 0; border-top: 1px solid var(--filet); }
${RACINE} .jr-recap-marque { color: var(--encre-50); } ${RACINE} .jr-recap-marque svg { width: 20px; height: 20px; }
${RACINE} .jr-recap-ok .jr-recap-marque { color: var(--juste); }
${RACINE} .jr-recap-but { font-weight: 700; font-size: .9rem; }
${RACINE} .jr-recap-vous, ${RACINE} .jr-recap-modele { font-size: .95rem; margin-top: 2px; }
${RACINE} .jr-recap-vous > span:first-child, ${RACINE} .jr-recap-modele > span:first-child { color: var(--encre-50); font-size: .8125rem; }
${RACINE} .jr-recap-modele span[lang] { font-weight: 600; color: var(--reponse-encre); }
${RACINE} .jr-recap-pourquoi { font-size: .875rem; color: var(--encre-70); margin-top: 2px; }
${RACINE} .jr-fin-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 6px; }
`;
