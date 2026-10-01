// Remettre la conversation dans l'ordre (ECO-2) — agent B1.
// La conversation est d'abord écoutée en entier (le portrait de celui qui parle s'allume). Puis les
// répliques arrivent en cartes mélangées : on les touche dans l'ordre, chacune se réécoute seule.
// À la validation, les cartes bien placées se fixent ; les autres reviennent avec l'explication de leur place.

import { ICONES, echapper, personnage, visage, retourTypo, typo } from '../video/_commun.js';
import { CSS_ECOUTE, RACINES, infoSon } from './_ecoute.js';

export const meta = { titre: 'Remettre la conversation dans l\'ordre', entete: true };

const ECART = 400; // ms entre deux répliques (script de D)

export async function monter(racine, ctx) {
  ctx.ajouterStyle(CSS_ECOUTE + CSS);
  const S = ctx.services || {};
  const R = retourTypo(S.retour);
  try { await S.voix?.pret?.(); } catch { /* sans manifeste : les cartes restent lisibles */ }
  const etape = ctx.donnees;
  const cartes = (etape.repliques_dans_l_ordre || []).slice().sort((a, b) => a.rang - b.rang);
  const n = cartes.length;
  const parRang = new Map(cartes.map((c) => [c.rang, c]));
  const melange = (etape.ordre_initial_melange || cartes.map((c) => c.rang)).filter((r) => parRang.has(r));
  const acteurs = [...new Set(cartes.map((c) => c.personnage))];

  const st = {
    phase: 'ecoute',          // ecoute | exercice | fini
    places: new Array(n).fill(null), // rang de la carte posée dans chaque case
    fixes: new Set(),         // rangs verrouillés (bien placés)
    pourquoi: new Set(),      // rangs dont l'explication de place est montrée (revenus dans la pile)
    essais: 0,
    scorePremier: null,
    jeton: 0,
    ecouteFaite: false,
  };
  let barre = null;

  // Le script prévoit S04, mais S04 montre Claire avec DANIEL au café, alors que la conversation est entre
  // Rob et Claire (remarque B1 à D). Fond neutre sans personne (l'open space, V01) + les deux portraits.
  const idFond = (etape.images || [])[0] === 'S04' ? 'V01' : (etape.images || [])[0];
  const img = (() => { try { return ctx.image?.(idFond) || null; } catch { return null; } })();
  racine.innerHTML = `
    <section class="ec-carte carte eco">
      <div class="eco-scene">
        ${img ? `<img class="eco-fond" src="${echapper(img)}" alt="">` : ''}
        <div class="eco-voix">${acteurs.map((a) => {
          const p = personnage(a);
          const u = visage(ctx, a);
          return `<span class="eco-acteur" data-acteur="${a}">${u ? `<img src="${echapper(u)}" alt="">` : ''}<b style="--c:${p.couleur}">${echapper(p.nom)}</b></span>`;
        }).join('')}</div>
      </div>
      <div class="ec-ecoutes">
        <button type="button" class="ec-ecoute ec-ecoute--principal" data-tout><span class="ec-ecoute-rond">${ICONES.ecouter}</span><span class="ec-ecoute-texte">Écouter la conversation</span></button>
        <button type="button" class="btn btn-fantome" data-commencer>Placer les répliques ${ICONES.suite}</button>
      </div>
      <p class="eco-etat petit discret" aria-live="polite">Écoutez d'abord toute la conversation, puis remettez les répliques dans l'ordre.</p>
      ${(etape.glossaire || []).length ? `<details class="eco-mots"><summary>Mots utiles <span class="discret">(${etape.glossaire.length})</span></summary><ul>${etape.glossaire.map((g) => `<li><b lang="en">${echapper(g.en)}</b> <span>${echapper(g.fr)}</span></li>`).join('')}</ul></details>` : ''}
      <div class="eco-exercice" hidden>
        <ol class="eco-cases" aria-label="La conversation, dans l'ordre"></ol>
        <div class="eco-pile-tete"><span class="petit discret">Touchez les répliques dans l'ordre de la conversation.</span></div>
        <div class="eco-pile" aria-label="Répliques à placer"></div>
        <div class="ec-retour" aria-live="polite"></div>
        <div class="ec-aide"></div>
        <div class="ec-actions">
          <button type="button" class="btn btn-secondaire" data-vider>${ICONES.rejouer}<span>Tout reprendre</span></button>
          <button type="button" class="btn btn-primaire" data-valider disabled>Valider l'ordre</button>
        </div>
      </div>
    </section>`;
  const $ = (s) => racine.querySelector(s);

  // ── Écoute de toute la conversation ─────────────────────────────────────
  async function jouerConversation({ suivreCartes = false } = {}) {
    const moi = ++st.jeton;
    const b = $('[data-tout]');
    b.classList.add('joue');
    b.querySelector('.ec-ecoute-texte').textContent = 'Conversation en cours…';
    try { ctx.tracer?.('audio_ecoute', { item: `${etape.id}-conversation` }); } catch { /* facultatif */ }
    let resultat = 'fin';
    for (const c of cartes) {
      if (moi !== st.jeton) return 'arret';
      const info = infoSon(ctx, c.audio);
      allumer(c.personnage, suivreCartes ? c.rang : null);
      if (!info) continue;
      let r;
      try { r = await S.audio.jouer(info.url, { canal: 'media', garde: info.duree_s || 6 }); } catch { r = 'erreur'; }
      if (moi !== st.jeton) return 'arret';
      if (r === 'bloque') { resultat = 'bloque'; break; }
      if (r === 'arret') { resultat = 'arret'; break; }
      await attendre(ECART);
    }
    if (moi !== st.jeton) return resultat;
    allumer(null, null);
    b.classList.remove('joue');
    b.querySelector('.ec-ecoute-texte').textContent = resultat === 'bloque' ? 'Toucher pour écouter' : 'Réécouter la conversation';
    if (resultat === 'fin' && !st.ecouteFaite) { st.ecouteFaite = true; ouvrirExercice(); }
    return resultat;
  }
  function allumer(acteur, rang) {
    racine.querySelectorAll('.eco-acteur').forEach((a) => a.classList.toggle('parle', a.dataset.acteur === acteur));
    racine.querySelectorAll('.eco-carte').forEach((x) => x.classList.toggle('joue', rang !== null && Number(x.dataset.rang) === rang));
  }
  const attendre = (ms) => new Promise((r) => { const t = setTimeout(r, ms); ctx.surDemontage?.(() => clearTimeout(t)); });

  $('[data-tout]').addEventListener('click', () => jouerConversation({ suivreCartes: st.phase === 'fini' }));
  $('[data-commencer]').addEventListener('click', () => { st.ecouteFaite = true; ouvrirExercice(); });

  function ouvrirExercice() {
    if (st.phase !== 'ecoute') return;
    st.phase = 'exercice';
    $('[data-commencer]').hidden = true;
    $('.eco-etat').textContent = 'Chaque carte se réécoute seule. Touchez une carte posée pour la retirer.';
    $('.eco-exercice').hidden = false;
    if (ctx.regime !== 'evaluation' && S.aide?.barre) {
      try {
        barre = S.aide.barre(ctx, { item: () => etape.id, surMontrer: () => montrer(), surSolution: () => solution() });
        $('.ec-aide').append(barre.element);
      } catch { barre = null; }
    }
    rendre();
    $('.eco-exercice').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ── Cartes ──────────────────────────────────────────────────────────────
  function htmlCarte(c, { posee = false } = {}) {
    const p = personnage(c.personnage);
    const fixe = st.fixes.has(c.rang);
    return `<div class="eco-carte${fixe ? ' fixe' : ''}${posee && st.derniere === c.rang ? ' neuve' : ''}" data-rang="${c.rang}">
      <button type="button" class="eco-carte-corps" ${fixe || st.phase === 'fini' ? 'disabled' : ''} aria-label="${posee ? 'Retirer' : 'Placer'} : ${echapper(p.nom)}, ${echapper(c.en)}">
        <b class="eco-nom" style="color:${p.couleur}">${echapper(p.nom)}</b>
        <span class="eco-en" lang="en">${echapper(c.en)}</span>
        ${!posee && st.pourquoi.has(c.rang) && c.pourquoi_ici ? `<span class="eco-pourquoi">${echapper(c.pourquoi_ici)}</span>` : ''}
      </button>
      <button type="button" class="eco-ecouter" ${infoSon(ctx, c.audio) ? '' : 'disabled'} data-ecouter="${c.rang}" aria-label="Réécouter la réplique de ${echapper(p.nom)}">${ICONES.ecouter}</button>
      ${fixe ? `<span class="eco-coche" aria-hidden="true">${ICONES.coche}</span>` : ''}
    </div>`;
  }

  function rendre() {
    const cases = $('.eco-cases');
    cases.innerHTML = st.places.map((rang, k) => `<li class="eco-case${rang ? ' pleine' : ''}"><span class="eco-num">${k + 1}</span>${rang ? htmlCarte(parRang.get(rang), { posee: true }) : '<span class="eco-vide">Réplique ' + (k + 1) + '</span>'}</li>`).join('');
    const posees = new Set(st.places.filter(Boolean));
    const pile = melange.filter((r) => !posees.has(r));
    $('.eco-pile').innerHTML = pile.map((r) => htmlCarte(parRang.get(r))).join('') || '<p class="petit discret eco-pile-vide">Toutes les répliques sont placées.</p>';
    $('.eco-pile-tete').hidden = !pile.length;
    const pleine = st.places.every(Boolean);
    $('[data-valider]').disabled = !pleine || st.phase === 'fini';
    $('[data-vider]').hidden = st.phase === 'fini' || !st.places.some((r, k) => r && !st.fixes.has(r));
  }

  racine.addEventListener('click', (e) => {
    const ec = e.target.closest('[data-ecouter]');
    if (ec && racine.contains(ec)) {
      const c = parRang.get(Number(ec.dataset.ecouter));
      const info = infoSon(ctx, c.audio);
      if (info) {
        st.jeton++;
        allumer(c.personnage, c.rang);
        try { ctx.tracer?.('audio_ecoute', { item: c.audio?.id }); } catch { /* facultatif */ }
        S.audio.jouer(info.url, { canal: 'media', garde: info.duree_s || 6 }).finally(() => allumer(null, null));
      }
      return;
    }
    const corps = e.target.closest('.eco-carte-corps');
    if (!corps || !racine.contains(corps) || corps.disabled || st.phase !== 'exercice') return;
    const rang = Number(corps.closest('.eco-carte').dataset.rang);
    const k = st.places.indexOf(rang);
    if (k >= 0) st.places[k] = null;                    // retirer
    else {                                               // poser dans la première case libre
      const libre = st.places.indexOf(null);
      if (libre < 0) return;
      st.places[libre] = rang;
      st.derniere = rang;
      st.pourquoi.delete(rang);
    }
    S.sons?.jouer?.('clic');
    $('.ec-retour').innerHTML = '';
    rendre();
    st.derniere = null;
  });

  $('[data-vider]').addEventListener('click', () => {
    st.places = st.places.map((r) => (r && st.fixes.has(r) ? r : null));
    rendre();
  });

  // ── Validation ──────────────────────────────────────────────────────────
  $('[data-valider]').addEventListener('click', () => {
    const ordre = st.places.slice();
    const bien = ordre.map((r, k) => r === k + 1);
    const nbBien = bien.filter(Boolean).length;
    const juste = nbBien === n;
    const premier = st.essais === 0;
    st.essais += 1;
    if (st.scorePremier === null) st.scorePremier = nbBien / n;
    const zone = $('.ec-retour');
    zone.innerHTML = '';
    const violees = reglesViolees(ordre);
    let explication;
    if (juste) {
      explication = etape.retours?.juste || 'Parfait.';
      cartes.forEach((c) => st.fixes.add(c.rang));
      zone.append(R?.juste ? R.juste(explication) : encart('juste', explication));
      finir();
      S.sons?.jouer?.('juste');
    } else {
      explication = violees.length ? violees.join(' ') : (etape.retours?.faux_par_defaut || 'Pas encore.');
      ordre.forEach((r, k) => {
        if (bien[k]) st.fixes.add(r);
        else { st.places[k] = null; st.pourquoi.add(r); }
      });
      zone.append(R?.faux
        ? R.faux(`${nbBien} réplique${nbBien > 1 ? 's' : ''} sur ${n} à la bonne place : ${nbBien > 1 ? 'elles restent' : 'elle reste'}.`, { explication })
        : encart('faux', explication));
      S.sons?.jouer?.('faux');
      barre?.erreur?.();
      rendre();
    }
    ctx.signaler?.essai?.({
      juste, item: etape.id, element: 'Ordre de la conversation',
      attendu: cartes.map((c) => c.en).join(' / '),
      donne: ordre.map((r) => parRang.get(r)?.en || '').join(' / '),
      explication, remediation: etape.remediation, premier_essai: premier,
    });
    requestAnimationFrame(() => zone.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  });

  /** Les « cibles » de D sont des phrases ; on en tire la règle vérifiable qu'elles décrivent. */
  function reglesViolees(ordre) {
    const pos = (texte) => {
      const t = norm(texte);
      const c = cartes.find((x) => norm(x.en).includes(t));
      return c ? ordre.indexOf(c.rang) : -1;
    };
    const res = [];
    for (const cible of etape.retours?.cibles || []) {
      const si = Array.isArray(cible.si) ? cible.si.join(' ') : String(cible.si || '');
      let m;
      let viole = false;
      if ((m = /^(.*) n'est pas en dernier$/.exec(si))) viole = pos(m[1]) !== n - 1;
      else if ((m = /^(.*) n'est pas juste après (.*)$/.exec(si))) { const a = pos(m[1]); const b = pos(m[2]); viole = a >= 0 && b >= 0 && a !== b + 1; }
      else if ((m = /^(.*) est avant (.*)$/.exec(si))) { const a = pos(m[1]); const b = pos(m[2]); viole = a >= 0 && b >= 0 && a < b; }
      if (viole && cible.retour) res.push(cible.retour);
    }
    return res;
  }

  // « Montrez-moi » : la première et la dernière carte, avec le pourquoi.
  function montrer() {
    const bouts = [cartes[0], cartes[n - 1]];
    for (const c of bouts) {
      const k = st.places.indexOf(c.rang);
      if (k >= 0) st.places[k] = null;
      const cible = c.rang - 1;
      st.places[cible] = c.rang;
      st.fixes.add(c.rang);
      st.pourquoi.delete(c.rang);
    }
    rendre();
    const z = $('.ec-retour');
    z.innerHTML = '';
    const texte = bouts.map((c) => `« ${c.en} » ${c.rang === 1 ? 'ouvre' : 'ferme'} la conversation : ${c.pourquoi_ici}`).join(' ');
    z.append(R?.info ? R.info(texte) : encart('info', texte));
  }

  function solution() {
    st.places = cartes.map((c) => c.rang);
    cartes.forEach((c) => st.fixes.add(c.rang));
    const z = $('.ec-retour');
    z.innerHTML = '';
    z.append(R?.reponse ? R.reponse(cartes.map((c) => c.en).join(' — '), { explication: etape.retours?.juste }) : encart('reponse', cartes.map((c) => c.en).join(' — ')));
    finir();
  }

  function finir() {
    st.phase = 'fini';
    st.places = cartes.map((c) => c.rang);
    $('.ec-aide').innerHTML = '';
    rendre();
    // Pourquoi chaque réplique est à sa place : la correction complète, sous chaque carte.
    racine.querySelectorAll('.eco-case .eco-carte').forEach((x) => {
      const c = parRang.get(Number(x.dataset.rang));
      if (c?.pourquoi_ici) x.querySelector('.eco-carte-corps').insertAdjacentHTML('beforeend', `<span class="eco-pourquoi">${echapper(c.pourquoi_ici)}</span>`);
    });
    $('[data-tout] .ec-ecoute-texte').textContent = 'Réécouter en suivant le texte';
    $('.eco-etat').textContent = typo('Réécoutez la conversation : chaque carte s\'allume quand elle est dite.');
    const score = st.scorePremier ?? 1;
    ctx.signaler?.fin?.({ score, reussi: true, points_obtenus: Math.round(score * n) });
  }

  function encart(type, texte) { const d = document.createElement('div'); d.className = `encart encart-${type}`; d.textContent = typo(texte); return d; }

  ctx.signaler?.pret?.();
  if (cartes.every(c => !infoSon(ctx, c.audio))) { $('[data-tout]').disabled = true; $('.eco-etat').textContent = 'Voix en préparation · reconstituez la conversation en lisant.'; st.ecouteFaite = true; ouvrirExercice(); }
  return {
    demonter() { st.jeton++; },
    montrer() { if (st.phase === 'exercice') montrer(); },
    montrerSolution() { if (st.phase === 'exercice') solution(); },
  };
}

function norm(t) { return String(t || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim(); }

const CSS = `
${RACINES} .eco-scene { position: relative; border-radius: var(--rayon-bloc); overflow: hidden; background: #1F2A30; aspect-ratio: 16 / 7; }
${RACINES} .eco-fond { width: 100%; height: 100%; object-fit: cover; opacity: .9; }
${RACINES} .eco-voix { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 18px; padding: 28px 12px 10px; background: linear-gradient(180deg, transparent, rgba(14,17,22,.62)); }
${RACINES} .eco-acteur { display: grid; justify-items: center; gap: 4px; color: #fff; opacity: .72; transition: opacity .2s, transform .25s var(--ressort); }
${RACINES} .eco-acteur img { width: 56px; height: 56px; border-radius: 999px; object-fit: cover; border: 2px solid rgba(255,255,255,.7); }
${RACINES} .eco-acteur b { font-size: .8125rem; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
${RACINES} .eco-acteur.parle { opacity: 1; transform: translateY(-3px); }
${RACINES} .eco-acteur.parle img { border-color: #fff; box-shadow: 0 0 0 4px rgba(255,255,255,.28); }
${RACINES} .eco-mots { border: 1px solid var(--filet); border-radius: var(--rayon-bloc); padding: 0 14px; background: var(--fond); }
${RACINES} .eco-mots summary { min-height: 44px; display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; font-size: .9rem; }
${RACINES} .eco-mots ul { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 4px; font-size: .9rem; }
${RACINES} .eco-mots li span { color: var(--encre-70); }
${RACINES} .eco-mots li span::before { content: '— '; color: var(--encre-50); }
${RACINES} .eco-exercice { display: grid; gap: 12px; }
${RACINES} .eco-cases { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
${RACINES} .eco-case { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 8px; }
${RACINES} .eco-num { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; font-weight: 700; font-size: .8125rem; background: var(--c-ecouter-voile); color: var(--c-ecouter); }
${RACINES} .eco-vide { display: flex; align-items: center; min-height: 56px; padding: 0 14px; border-radius: var(--rayon-bloc); border: 1.5px dashed var(--filet-fort); color: var(--encre-50); font-size: .875rem; }
${RACINES} .eco-pile { display: grid; gap: 8px; padding: 12px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); }
${RACINES} .eco-pile-vide { text-align: center; padding: 6px; }
${RACINES} .eco-carte { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 44px; align-items: stretch; border-radius: var(--rayon-bloc); border: 1.5px solid var(--filet-fort); background: var(--surface); transition: border-color .15s, box-shadow .2s, transform .2s var(--ressort); }
${RACINES} .eco-carte:hover { border-color: var(--c-ecouter); }
${RACINES} .eco-carte.joue { border-color: var(--c-ecouter); box-shadow: 0 0 0 3px var(--c-ecouter-voile); }
${RACINES} .eco-carte.fixe { border-color: var(--juste-bord); background: var(--juste-voile); }
${RACINES} .eco-carte-corps { display: grid; gap: 2px; min-height: 56px; padding: 8px 12px; text-align: left; background: none; border: 0; font: inherit; color: var(--encre); cursor: pointer; border-radius: var(--rayon-bloc) 0 0 var(--rayon-bloc); }
${RACINES} .eco-carte-corps:disabled { cursor: default; }
${RACINES} .eco-nom { font-size: .75rem; font-weight: 700; letter-spacing: .02em; }
${RACINES} .eco-en { font-weight: 600; line-height: 1.4; }
${RACINES} .eco-pourquoi { font-size: .8125rem; color: var(--encre-70); font-weight: 400; margin-top: 2px; }
${RACINES} .eco-ecouter { display: grid; place-items: center; border: 0; border-left: 1px solid var(--filet); background: none; color: var(--c-ecouter); cursor: pointer; border-radius: 0 var(--rayon-bloc) var(--rayon-bloc) 0; }
${RACINES} .eco-ecouter svg { width: 20px; height: 20px; }
${RACINES} .eco-coche { position: absolute; top: -8px; left: -8px; width: 22px; height: 22px; border-radius: 999px; background: var(--juste); color: #fff; display: grid; place-items: center; }
${RACINES} .eco-coche svg { width: 14px; height: 14px; }
${RACINES} .eco-carte.neuve { animation: monter .3s var(--doux) both; }
`;
