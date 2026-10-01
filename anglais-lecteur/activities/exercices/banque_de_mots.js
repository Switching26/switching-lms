// activities/exercices/banque_de_mots.js — EX-04 « Présenter l'équipe avec les formes courtes » (type banque_de_mots).
//
// Le discours d'Helen avec des trous, et une banque d'étiquettes (les bonnes formes + des pièges qui
// s'entendent pareil : his, your, are). Toucher une étiquette puis un trou (ou l'inverse), ou glisser.
// Chaque étiquette ne sert qu'une fois. Une étiquette mal placée revient dans la banque avec
// l'explication de SON erreur, tirée du script.
import {
  el, esc, icone, texteFr, liste, retoursDe, preparerMedias, donneesEtape, afficherEnPreparation, regimeDe,
  creerSuivi, creerBarreAide, carteBilan, signalerFin, cssCommun, attendre, mouvementReduit, urlImage, boutonEcouter,
  rendreGlissable, depotSous, animerVers, melanger, creerRng, pointeurFin, rendreVisible, sansOui,
} from './_commun.js';

export const meta = { titre: 'Banque de mots', entete: true };
const P = '.act-exercices-banque_de_mots';

export async function monter(racine, ctx) {
  ctx.ajouterStyle?.(cssCommun(P) + css(P));
  const { etape, raison } = await donneesEtape(ctx, 'exercices.json', 'banque_de_mots');
  if (!etape) return afficherEnPreparation(racine, ctx, raison);
  await preparerMedias(ctx);
  const texte = String(etape.support?.texte_avec_trous || '');
  const morceaux = texte.split(/\[(\d+)\]/);
  const items = liste(etape.items);
  const banque = liste(etape.banque).map(String);
  if (morceaux.length < 3 || !items.length || !banque.length) return afficherEnPreparation(racine, ctx, 'texte ou banque absents');
  const itemDuTrou = (n) => items.find((i) => String(i.id).endsWith(`-${n}`)) || items[n - 1];
  const distracteurs = liste(etape.distracteurs);

  const R = retoursDe(ctx);
  const regime = regimeDe(ctx, etape);
  const graine = ctx?.params?.graine;
  let rng = creerRng(graine);
  let ac, suivi, aide, trous, jetons, fini, dernierFaux, choisi, trouActif;
  const cadre = el('div', { class: 'b3-cadre' });
  racine.replaceChildren(cadre);

  function partie() {
    ac?.abort();
    ac = new AbortController();
    ctx.signal?.addEventListener('abort', () => ac.abort(), { once: true });
    suivi = creerSuivi(ctx, etape);
    suivi.declarer(items.map((i) => i.id));
    trous = []; jetons = []; fini = false; dernierFaux = null; choisi = null; trouActif = null;

    const carte = el('div', { class: 'carte b3-carte' });
    const scene = urlImage(ctx, liste(etape.images)[0]);
    const helen = /Helen/.test(texteFr(etape.consigne)) ? { nom: 'Helen', role: 'réunion du lundi', image: 'P03' } : null;
    const tete = el('div', { class: 'b3-bdm-tete' });
    if (scene) tete.append(el('img', { class: 'b3-bdm-scene', src: scene, alt: '', decoding: 'async' }));
    if (helen) {
      const img = urlImage(ctx, helen.image);
      tete.append(el('div', { class: 'b3-bdm-auteur' },
        img ? el('img', { class: 'b3-bdm-avatar', src: img, alt: '' }) : null,
        el('span', {}, el('b', { texte: helen.nom }), el('span', { class: 'b3-bdm-role', texte: helen.role }))));
    }
    const bulle = el('p', { class: 'b3-bdm-bulle', lang: 'en' });
    morceaux.forEach((m, k) => {
      if (k % 2 === 0) { bulle.append(el('span', { class: 'b3-bdm-seg', 'data-seg': String(k / 2) }, m)); return; }
      const n = Number(m);
      const item = itemDuTrou(n);
      if (!item) return;
      const b = el('button', { type: 'button', class: 'b3-bdm-trou', 'data-trou': String(n), 'aria-label': `Trou ${n}, vide` },
        el('span', { class: 'b3-bdm-num', 'aria-hidden': 'true', texte: String(n) }), el('span', { class: 'b3-bdm-contenu' }));
      b.addEventListener('click', () => toucherTrou(trouDe(n)));
      bulle.append(b);
      trous.push({ n, item, b, resolu: false });
    });

    const mode = el('p', { class: 'b3-mode', html: `${icone(ctx, 'info')}<span>${esc(pointeurFin()
      ? 'Cliquez une étiquette puis un trou, ou faites-la glisser.'
      : 'Touchez une étiquette, puis le trou. Appui long pour la faire glisser.')}</span>` });
    const reserve = el('div', { class: 'b3-bdm-banque', role: 'group', 'aria-label': 'Étiquettes' });
    for (const [k, mot] of melanger(banque, rng).entries()) {
      const j = el('button', { type: 'button', class: 'b3-jeton b3-bdm-jeton', lang: 'en', 'aria-pressed': 'false', 'data-jeton': String(k) }, mot);
      const jeton = { mot, b: j, utilise: false, ecarte: false };
      j.addEventListener('click', () => toucherJeton(jeton));
      rendreGlissable(j, {
        hote: carte, signal: ac.signal,
        actif: () => !jeton.utilise && !jeton.ecarte && !fini,
        cibleSous: (x, y) => depotSous(x, y, 'data-trou', bulle),
        deposer: (c) => poser(jeton, trouDe(Number(c.dataset.trou))),
      });
      jetons.push(jeton);
      reserve.append(j);
    }

    const zoneRetour = el('div', { class: 'b3-retour', 'aria-live': 'polite' });
    aide = creerBarreAide(ctx, {
      etape, regime,
      indices: () => [texteFr(etape.aide?.indice), secondIndice()].filter(Boolean),
      surMontrer: () => montrer(),
      surSolution: () => solution(),
    });
    const etat = el('p', { class: 'b3-etat petit', 'aria-live': 'polite' });
    // La banque vit dans le panneau du bas : au téléphone il reste collé à l'écran, comme un clavier.
    const dock = el('div', { class: 'b3-dock b3-bdm-dock' }, zoneRetour, aide.element, reserve);
    carte.append(tete, mode, bulle, etat, dock);
    cadre.replaceChildren(carte);
    majEtat();

    racine.addEventListener('keydown', (e) => { if (e.key === 'Escape') { choisir(null); activerTrou(null); } }, { signal: ac.signal });

    function trouDe(n) { return trous.find((t) => t.n === n); }
    function majEtat() { etat.textContent = `${trous.filter((t) => t.resolu).length} sur ${trous.length} trous complétés`; }
    function afficher(...n) { zoneRetour.replaceChildren(...n); rendreVisible(dock); }
    function choisir(j) {
      choisi = j;
      for (const x of jetons) x.b.setAttribute('aria-pressed', String(x === j));
      bulle.classList.toggle('b3-bdm-attente', !!j);
    }
    function activerTrou(t) {
      trouActif = t;
      for (const x of trous) x.b.classList.toggle('b3-bdm-actif', x === t);
      reserve.classList.toggle('b3-bdm-attente', !!t);
    }
    function toucherJeton(j) {
      if (fini || j.utilise || j.ecarte) return;
      if (trouActif && !trouActif.resolu) { poser(j, trouActif); return; }
      choisir(choisi === j ? null : j);
      if (choisi) zoneRetour.replaceChildren();   // l'explication précédente a été lue : le panneau se resserre
      if (choisi && j.b.dataset.clavier === '1') trous.find((t) => !t.resolu)?.b.focus();
    }
    function toucherTrou(t) {
      if (fini || !t || t.resolu) return;
      if (choisi) { poser(choisi, t); return; }
      activerTrou(trouActif === t ? null : t);
      if (trouActif) zoneRetour.replaceChildren();
    }
    for (const j of jetons) {
      j.b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') j.b.dataset.clavier = '1'; });
      j.b.addEventListener('pointerdown', () => { j.b.dataset.clavier = '0'; });
    }

    function explicationPour(item, mot) {
      const cible = liste(item.retours?.cibles).find((c) => liste(c.si).includes(mot));
      if (cible) return cible.retour;
      const d = distracteurs.find((x) => x.texte === mot);
      if (d?.retour) return d.retour;
      return item.retours?.faux_par_defaut || '';
    }

    function poser(j, t, { demo = false } = {}) {
      if (fini || !j || !t || t.resolu || j.utilise) return false;
      choisir(null); activerTrou(null);
      const juste = j.mot === t.item.bonne;
      if (demo) suivi.aide(t.item.id);
      else {
        const explication = juste ? '' : explicationPour(t.item, j.mot);
        suivi.essai({ item: t.item.id, juste, element: `Trou ${t.n}`, attendu: t.item.bonne, donne: j.mot, explication });
        if (!juste) {
          dernierFaux = t.n;
          t.b.classList.remove('b3-bdm-refus'); void t.b.offsetWidth; t.b.classList.add('b3-bdm-refus');
          j.b.classList.remove('b3-secoue'); void j.b.offsetWidth; j.b.classList.add('b3-secoue');
          aide.erreur();
          try { ctx.services?.sons?.jouer?.('faux'); } catch { /* rien */ }
          afficher(R.faux(`Trou ${t.n} : « ${j.mot} » ne convient pas.`, { explication }));
          return false;
        }
      }
      remplir(t, j, { parAide: demo });
      if (!demo) {
        try { ctx.services?.sons?.jouer?.('juste'); } catch { /* rien */ }
        afficher(R.juste(t.item.retours?.juste || 'Juste.'));
      }
      majEtat();
      try { ctx.signaler?.progression?.(trous.filter((x) => x.resolu).length / trous.length); } catch { /* rien */ }
      if (trous.every((x) => x.resolu)) terminer();
      else if (t.b.matches(':focus-visible') || j.b.dataset.clavier === '1') jetons.find((x) => !x.utilise && !x.ecarte)?.b.focus();
      return true;
    }

    /** Le trou ouvre-t-il une phrase ? (début du texte, ou après . ! ?) — recette Q n° 3. */
    function debutDePhrase(n) {
      const avant = (morceaux[(n - 1) * 2] || '').replace(/\s+$/, '');
      return avant === '' ? n === 1 : /[.!?]["»”’']?$/.test(avant);
    }

    function remplir(t, j, { parAide = false } = {}) {
      t.resolu = true;
      t.b.classList.add('b3-bdm-plein');
      if (parAide) t.b.classList.add('b3-par-aide');
      // L'étiquette garde sa forme (la réponse vérifiée ne change pas) ; seul l'affichage prend la
      // majuscule quand le mot ouvre la phrase : « This is Claire. She's the new project manager. »
      const mot = String(t.item.bonne || '');
      const affiche = debutDePhrase(t.n) ? mot.charAt(0).toUpperCase() + mot.slice(1) : mot;
      t.b.querySelector('.b3-bdm-contenu').textContent = affiche;
      t.b.setAttribute('aria-label', `Trou ${t.n} : ${affiche}`);
      t.b.disabled = true;
      if (j) { j.utilise = true; j.b.classList.add('b3-bdm-parti'); j.b.disabled = true; j.b.setAttribute('aria-hidden', 'true'); }
    }

    function secondIndice() {
      const t = trous.find((x) => x.n === dernierFaux && !x.resolu) || trous.find((x) => !x.resolu);
      if (!t) return null;
      return `Trou ${t.n} : relisez « ${contexte(t.n)} ». De qui ou de quoi Helen parle-t-elle ?`;
    }
    /** La phrase du trou, précédée de la phrase d'avant si le trou ouvre la phrase. */
    function contexte(n) {
      const avant = morceaux[(n - 1) * 2] || '', apres = morceaux[n * 2] || '';
      const phrasesAvant = avant.split(/(?<=[.!?])\s+/);
      let debut = phrasesAvant.pop() || '';
      if (!debut.trim() && phrasesAvant.length) debut = `${phrasesAvant.pop()} `;
      const fin = (apres.match(/^[^.!?]*[.!?]?/) || [''])[0];
      return `${debut}___${fin}`.replace(/\s+/g, ' ').trim();
    }

    async function montrer() {
      // « La démonstration place they're dans le trou 6 en surlignant « The new laptops »,
      //   puis écarte his en rappelant qu'il n'a pas d'apostrophe. »
      const txt = texteFr(etape.aide?.montrer);
      const nTrou = Number(txt.match(/trou\s+(\d+)/i)?.[1]);
      const t = trous.find((x) => x.n === nTrou && !x.resolu) || trous.find((x) => x.n === dernierFaux && !x.resolu) || trous.find((x) => !x.resolu);
      if (!t) return;
      const signal = ac.signal;
      t.b.scrollIntoView?.({ block: 'center', behavior: mouvementReduit() ? 'auto' : 'smooth' });
      await attendre(350, signal);
      const cite = txt.match(/«\s*([^»]+?)\s*»/)?.[1];
      if (cite && t.n === nTrou) surligner(cite, t.n);
      await attendre(600, signal);
      const j = jetons.find((x) => !x.utilise && x.mot === t.item.bonne);
      if (j) await animerVers(j.b, t.b, carte, signal);
      if (signal.aborted) return;
      poser(j, t, { demo: true });
      const lignes = [`Trou ${t.n} : ${t.item.bonne}. ${sansOui(t.item.retours?.juste)}`.trim()];
      const ecarte = txt.match(/écarte\s+([A-Za-z']+)/i)?.[1];
      const d = ecarte && jetons.find((x) => x.mot === ecarte && !x.utilise);
      if (d) {
        await attendre(500, signal);
        d.ecarte = true;
        d.b.classList.add('b3-ecarte');
        d.b.disabled = true;
        const expl = distracteurs.find((x) => x.texte === ecarte)?.retour;
        if (expl) lignes.push(`« ${ecarte} » est écarté : ${expl}`);
      }
      afficher(R.info(lignes[0], { explication: lignes.slice(1).join(' ') }));
    }

    function surligner(cite, n) {
      const seg = bulle.querySelector(`[data-seg="${n - 1}"]`);
      if (!seg) return;
      const i = seg.textContent.lastIndexOf(cite);
      if (i < 0) return;
      const t = seg.textContent;
      seg.replaceChildren(t.slice(0, i), el('mark', { class: 'b3-surligne', texte: cite }), t.slice(i + cite.length));
    }

    function solution() {
      if (fini) return;
      try { ctx.signaler?.solution?.({ item: etape.id }); } catch { /* rien */ }
      for (const t of trous) {
        if (t.resolu) continue;
        suivi.solution(t.item.id);
        remplir(t, jetons.find((x) => !x.utilise && x.mot === t.item.bonne), { parAide: true });
      }
      for (const j of jetons) if (!j.utilise) { j.ecarte = true; j.b.classList.add('b3-ecarte'); j.b.disabled = true; }
      majEtat();
      const pieges = distracteurs.map((d) => `${d.texte} : ${d.retour}`).join(' ');
      afficher(R.reponse('Le discours d\'Helen est complet.', { explication: pieges ? `Les étiquettes en trop : ${pieges}` : '' }));
      terminer({ parSolution: true });
    }

    function terminer({ parSolution = false } = {}) {
      if (fini) return;
      fini = true;
      aide.terminer();
      for (const j of jetons) if (!j.utilise) { j.b.disabled = true; j.b.classList.add('b3-ecarte'); }
      const { obtenus, total } = signalerFin(ctx, suivi, etape);
      const noms = distracteurs.map((d) => d.texte);
      const listeNoms = noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms[0];
      if (!parSolution) afficher(R.juste('Le discours d\'Helen est complet.', { explication: listeNoms ? `Les étiquettes restantes étaient les pièges : ${listeNoms}.` : '' }));
      const ar = etape.apres_reussite;
      const ecoute = ar?.audio ? boutonEcouter(ctx, ar.audio, { libelle: 'Écouter Helen' }) : null;
      const bilan = carteBilan(ctx, {
        obtenus, total, erreurs: suivi.erreurs,
        libelleScore: 'trous justes du premier coup',
        ecoute, texteEcoute: ecoute ? texteFr(ar?.texte) : '',
        surRecommencer: () => { rng = creerRng(graine === undefined ? undefined : `${graine}-${Date.now()}`); partie(); },
      });
      cadre.append(bilan);
      requestAnimationFrame(() => bilan.scrollIntoView?.({ block: 'nearest', behavior: mouvementReduit() ? 'auto' : 'smooth' }));
    }
  }

  partie();
  try { ctx.signaler?.pret?.(); } catch { /* rien */ }
  return {
    demonter() { ac?.abort(); },
    montrer() { aide?.montrer?.(); },
    montrerSolution() { aide?.solution?.(); },
  };
}

function css(p) {
  return `
${p} .b3-bdm-tete { display: flex; flex-direction: column; gap: 12px; }
${p} .b3-bdm-scene { width: 100%; aspect-ratio: 16 / 7; object-fit: cover; object-position: 50% 35%; border-radius: var(--rayon-bloc); background: var(--filet); }
${p} .b3-bdm-auteur { display: flex; align-items: center; gap: 10px; }
${p} .b3-bdm-auteur > span { display: flex; flex-direction: column; line-height: 1.25; }
${p} .b3-bdm-role { color: var(--encre-50); font-size: 0.8125rem; }
${p} .b3-bdm-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; object-position: 50% 20%; background: var(--filet); flex: none; }
${p} .b3-bdm-bulle { margin: 0; padding: 14px 16px; border-radius: 4px 18px 18px 18px; background: var(--fond); border: 1px solid var(--filet); font-size: 1.05rem; line-height: 2.6; color: var(--encre); overflow-wrap: anywhere; }
@media (min-width: 768px) { ${p} .b3-bdm-bulle { padding: 18px 22px; font-size: 1.1rem; } }
${p} .b3-bdm-trou { position: relative; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; min-width: 5.4em; height: 44px; margin: 0 2px; padding: 0 12px; border-radius: 10px; border: 1.5px dashed var(--filet-fort); background: var(--surface); font: inherit; font-weight: 700; color: var(--encre); cursor: pointer; touch-action: manipulation; transition: border-color .15s, background-color .15s, box-shadow .15s; }
${p} .b3-bdm-trou::after { content: ''; position: absolute; inset: -3px 0; }
${p} .b3-bdm-num { position: absolute; top: -8px; left: 8px; font-size: 0.625rem; font-weight: 700; color: var(--encre-50); line-height: 1; background: var(--fond); padding: 0 3px; border-radius: 4px; }
${p} .b3-bdm-attente .b3-bdm-trou:not(.b3-bdm-plein) { border-color: var(--marque); background: var(--marque-voile); }
${p} .b3-bdm-trou.b3-bdm-actif { border-style: solid; border-color: var(--marque); box-shadow: 0 0 0 3px var(--marque-voile-bord); }
${p} .b3-bdm-trou.b3-cible-survol { border-style: solid; border-color: var(--marque); outline: none; }
${p} .b3-bdm-plein { border-style: solid; border-color: var(--juste-bord); background: var(--juste-voile); color: var(--juste-fonce); cursor: default; }
${p} .b3-bdm-plein.b3-par-aide { border-style: dashed; background: var(--surface); }
@keyframes b3-bdm-refus { 0%, 100% { border-color: var(--filet-fort); background: var(--surface); } 20%, 60% { border-color: var(--faux); background: var(--faux-voile); } }
${p} .b3-bdm-refus { animation: b3-bdm-refus .9s ease 1; }
${p} .b3-bdm-banque { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px dashed var(--filet-fort); }
${p} .b3-bdm-banque.b3-bdm-attente { border-color: var(--marque); }
${p} .b3-bdm-jeton { min-width: 4.2em; }
${p} .b3-bdm-parti { visibility: hidden; }
${p} .b3-etat { color: var(--encre-50); font-weight: 600; }
@media (max-width: 767px) {
  ${p} .b3-bdm-dock { max-height: 52vh; }
  ${p} .b3-bdm-banque { padding: 8px; background: transparent; border: 0; justify-content: center; gap: 6px; }
  ${p} .b3-bdm-banque .b3-jeton { min-width: 3.9em; padding: 0 12px; }
}
`;
}
