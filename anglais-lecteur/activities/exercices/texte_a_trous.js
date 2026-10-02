// activities/exercices/texte_a_trous.js — EX-03 « Compléter avec am, is ou are » (exercices.json, type texte_a_trous).
//
// Un texte continu (le message de Daniel à sa sœur) avec des champs à taper. Chaque champ est vérifié
// en le quittant, avec Entrée (qui passe au trou suivant), ou tous ensemble avec « Vérifier ».
// Tolérances du script : casse et espaces ignorés, aucune faute de frappe (is / his).
// Les mots expliqués par la note du script (trade fair, quiet) s'ouvrent d'un toucher.
import {
  el, esc, icone, texteFr, liste, retoursDe, preparerMedias, donneesEtape, afficherEnPreparation, regimeDe,
  creerSuivi, creerBarreAide, carteBilan, signalerFin, cssCommun, evaluerSaisie, attendre, mouvementReduit,
  lireGlossaireNote, texteAvecGloses, urlImage, boutonEcouter, rendreVisible, sansOui,
} from './_commun.js';

export const meta = { titre: 'Texte à trous', entete: true };
const P = '.act-exercices-texte_a_trous';
const PRONOMS = ['I', 'you', 'he', 'she', 'it', 'we', 'they'];

export async function monter(racine, ctx) {
  ctx.ajouterStyle?.(cssCommun(P) + css(P));
  const { etape, raison } = await donneesEtape(ctx, 'exercices.json', 'texte_a_trous');
  if (!etape) return afficherEnPreparation(racine, ctx, raison);
  await preparerMedias(ctx);
  const texte = String(etape.support?.texte_avec_trous || '');
  const morceaux = texte.split(/\[(\d+)\]/);
  const items = liste(etape.items);
  const historique = ctx.unite === 'U01' && etape.id === 'EX-03';
  if (morceaux.length < 3 || !items.length) return afficherEnPreparation(racine, ctx, 'texte à trous absent');
  const itemDuTrou = (n) => items.find((i) => String(i.id).endsWith(`-${n}`)) || items[n - 1];

  const R = retoursDe(ctx);
  const regime = regimeDe(ctx, etape);
  const glossaire = lireGlossaireNote(etape.support?.note);
  let ac, suivi, aide, trous, fini, dernierFaux;
  const cadre = el('div', { class: 'b3-cadre' });
  racine.replaceChildren(cadre);

  function partie() {
    ac?.abort();
    ac = new AbortController();
    ctx.signal?.addEventListener('abort', () => ac.abort(), { once: true });
    suivi = creerSuivi(ctx, etape);
    suivi.declarer(items.map((i) => i.id));
    trous = [];
    fini = false;
    dernierFaux = null;

    const carte = el('div', { class: 'carte b3-carte' });
    const auteur = /Daniel/.test(texteFr(etape.consigne)) ? { nom: 'Daniel', image: 'P02' } : null;
    const message = el('div', { class: 'b3-tat-message' });
    if (auteur) {
      const img = urlImage(ctx, auteur.image);
      message.append(el('div', { class: 'b3-tat-auteur' },
        img ? el('img', { class: 'b3-tat-avatar', src: img, alt: '' }) : el('span', { class: 'b3-tat-avatar b3-tat-initiale', texte: auteur.nom[0] }),
        el('span', {}, el('b', { texte: auteur.nom }), el('span', { class: 'b3-tat-format', texte: etape.support?.format || '' }))));
    }
    const bulle = el('p', { class: 'b3-tat-bulle', lang: 'en' });
    morceaux.forEach((m, k) => {
      if (k % 2 === 0) { bulle.append(el('span', { class: 'b3-tat-seg', 'data-seg': String(k / 2) }, texteAvecGloses(ctx, m, glossaire, { signal: ac.signal }))); return; }
      const n = Number(m);
      const item = itemDuTrou(n);
      if (!item) return;
      const input = el('input', {
        class: 'b3-trou', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
        maxlength: '14', 'aria-label': `Trou ${n}${item.sujet ? `, sujet : ${item.sujet}` : ''}`, 'data-trou': String(n),
      });
      if (!historique) { const longueur = Math.max(5, ...[...(item.reponse?.attendues || []), ...(item.reponse?.variantes || [])].map(x => String(x).length)); input.maxLength = Math.max(80,longueur); input.style.width = `min(${longueur + 4}ch, 100%)`; }
      const marque = el('span', { class: 'b3-trou-marque', 'aria-hidden': 'true' });
      const env = el('label', { class: 'b3-trou-env' }, el('span', { class: 'b3-trou-num', 'aria-hidden': 'true', texte: String(n) }), input, marque);
      const stimulus = item.stimulus;
      if (stimulus?.description_fr) {
        const visuel = el('span', { class: 'b3-stimulus', role: 'img', 'aria-label': stimulus.description_fr, lang: 'fr' });
        if (/^#[0-9a-f]{6}$/i.test(stimulus.couleur) && ['bag', 'cup'].includes(stimulus.objet)) {
          const objet = el('span', { class: `b3-objet b3-objet-${stimulus.objet}`, 'aria-hidden': 'true' });
          objet.style.backgroundColor = stimulus.couleur;
          visuel.append(objet);
        } else if (stimulus.image && urlImage(ctx, stimulus.image)) {
          const img = el('img', { src: urlImage(ctx, stimulus.image), alt: '', 'aria-hidden': 'true' });
          if (stimulus.taille === 'petite') img.style.width = '88px';
          if ([0, 10].includes(stimulus.rotation)) img.style.transform = `rotate(${stimulus.rotation}deg)`;
          visuel.append(img);
        }
        if (visuel.childElementCount) { env.classList.add('b3-trou-illustre'); env.prepend(visuel); }
      }
      bulle.append(env);
      trous.push({ n, item, input, env, resolu: false, derniere: '', ko: false, explication: '' });
    });
    message.append(bulle);
    if (glossaire.size) message.append(el('p', { class: 'b3-tat-glose-aide petit', html: `${icone(ctx, 'info')}<span>Les mots soulignés en pointillé s'expliquent d'un toucher.</span>` }));

    const zoneRetour = el('div', { class: 'b3-retour', 'aria-live': 'polite' });
    aide = creerBarreAide(ctx, {
      etape, regime,
      indices: () => [texteFr(etape.aide?.indice), secondIndice()].filter(Boolean),
      surMontrer: () => montrer(),
      surSolution: () => solution(),
    });
    const bVerifier = el('button', { type: 'button', class: 'btn btn-primaire', html: '<span>Vérifier</span>' });
    const actions = el('div', { class: 'b3-actions' }, el('div', { class: 'b3-actions-pri' }, bVerifier));
    const dock = el('div', { class: 'b3-dock' }, zoneRetour, aide.element, actions);
    const etat = el('p', { class: 'b3-etat petit', 'aria-live': 'polite' });
    carte.append(message, etat, dock);
    cadre.replaceChildren(carte);
    majEtat();

    for (const t of trous) {
      t.input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        if (t.input.value.trim()) verifierTrou(t);
        allerAuSuivant(t);
      }, { signal: ac.signal });
      // Vérification en quittant le champ, mais jamais pendant un appui : le retour qui s'affiche
      // décalerait le bouton sous le doigt ou la souris, et le toucher serait perdu.
      t.input.addEventListener('change', () => apresAppui(() => { if (t.input.value.trim() && !t.resolu) verifierTrou(t); }), { signal: ac.signal });
      t.input.addEventListener('input', () => { t.env.classList.remove('b3-trou-ko'); t.ko = false; majBouton(); }, { signal: ac.signal });
    }
    let appui = false;
    document.addEventListener('pointerdown', () => { appui = true; }, { capture: true, signal: ac.signal });
    document.addEventListener('pointerup', () => { setTimeout(() => { appui = false; }, 0); }, { capture: true, signal: ac.signal });
    document.addEventListener('pointercancel', () => { appui = false; }, { capture: true, signal: ac.signal });
    function apresAppui(f, essais = 0) {
      setTimeout(() => {
        if (ac.signal.aborted) return;
        if (appui && essais < 40) { apresAppui(f, essais + 1); return; }
        f();
      }, 120);
    }
    bVerifier.addEventListener('click', () => verifierTout());
    majBouton();

    function majEtat() { const r = trous.filter((t) => t.resolu).length; etat.textContent = `${r} sur ${trous.length} trous complétés`; }
    function majBouton() { bVerifier.disabled = fini || !trous.some((t) => !t.resolu && t.input.value.trim()); }
    function afficher(...n) { zoneRetour.replaceChildren(...n); rendreVisible(dock); }
    function allerAuSuivant(t) {
      const i = trous.indexOf(t);
      const suivant = [...trous.slice(i + 1), ...trous.slice(0, i)].find((x) => !x.resolu);
      if (suivant) suivant.input.focus(); else t.input.blur();
    }

    function secondIndice() {
      if (!historique) return texteFr(etape.aide?.indice) || 'Relisez la phrase autour du trou.';
      const t = trous.find((x) => x.n === dernierFaux && !x.resolu) || trous.find((x) => !x.resolu);
      return t?.item?.sujet ? `Trou ${t.n} : le sujet est « ${t.item.sujet} ». Remplacez-le par un pronom, puis choisissez am, is ou are.` : null;
    }

    /** Vérifie un trou ; rend le résultat sans toucher à la zone de retour si `silencieux`. */
    function verifierTrou(t, { silencieux = false } = {}) {
      if (t.resolu || fini) return null;
      const valeur = t.input.value;
      if (!valeur.trim() || valeur === t.derniere) return null;   // même saisie : pas un nouvel essai
      t.derniere = valeur;
      const r = evaluerSaisie(valeur, t.item.reponse, t.item.retours);
      const juste = r.verdict === 'juste' ? true : r.verdict === 'presque' ? 'presque' : false;
      const explication = juste === false ? (r.retour || t.item.retours?.faux_par_defaut || '') : '';
      suivi.essai({ item: t.item.id, juste, element: `Trou ${t.n}${t.item.sujet ? ` (${t.item.sujet} …)` : ''}`, attendu: liste(t.item.reponse?.attendues)[0] || '', donne: valeur.trim(), explication });
      if (juste !== false) {
        resoudre(t, liste(t.item.reponse?.attendues)[0] ?? valeur.trim());
        if (!silencieux) afficher(R.juste(t.item.retours?.juste || 'Juste.'));
        try { ctx.services?.sons?.jouer?.('juste'); } catch { /* rien */ }
      } else {
        dernierFaux = t.n;
        t.ko = true;
        t.explication = explication;
        t.env.classList.remove('b3-trou-ko', 'b3-secoue'); void t.env.offsetWidth; t.env.classList.add('b3-trou-ko', 'b3-secoue');
        aide.erreur();
        try { ctx.services?.sons?.jouer?.('faux'); } catch { /* rien */ }
        if (!silencieux) afficher(R.faux(`Trou ${t.n} : « ${valeur.trim()} » ne convient pas.`, { explication }));
      }
      majEtat(); majBouton();
      if (trous.every((x) => x.resolu)) terminer();
      return { t, juste, explication, valeur: valeur.trim() };
    }

    function verifierTout() {
      const nouveaux = trous.filter((t) => !t.resolu && t.input.value.trim()).map((t) => verifierTrou(t, { silencieux: true })).filter(Boolean);
      if (fini) return;
      // Le récapitulatif porte sur TOUTES les erreurs en cours, même vérifiées juste avant (en quittant le champ).
      const faux = trous.filter((t) => !t.resolu && t.ko);
      const justes = nouveaux.filter((r) => r.juste !== false);
      const restants = trous.filter((t) => !t.resolu && !t.input.value.trim()).length;
      const noeuds = [];
      const reste = restants ? ` Il reste ${restants} trou${restants > 1 ? 's' : ''} à compléter.` : '';
      if (faux.length === 1) noeuds.push(R.faux(`Trou ${faux[0].n} : « ${faux[0].input.value.trim()} » ne convient pas.${reste}`, { explication: faux[0].explication }));
      else if (faux.length > 1) {
        const n = R.faux(`${faux.length} trous à revoir.${reste}`, {});
        const ul = el('ul', { class: 'b3-liste-erreurs petit' });
        for (const t of faux) ul.append(el('li', {}, el('b', { texte: `Trou ${t.n} : ` }), el('s', { lang: 'en', texte: t.input.value.trim() }), ` — ${t.explication}`));
        (n.querySelector('span') || n).append(ul);
        noeuds.push(n);
      } else if (justes.length) noeuds.push(R.juste(`${justes.length > 1 ? `${justes.length} trous justes.` : (justes[0].t.item.retours?.juste || 'Juste.')}${reste}`));
      else if (restants) noeuds.push(R.info(reste.trim()));
      if (noeuds.length) afficher(...noeuds);
      (faux[0]?.input || trous.find((t) => !t.resolu && !t.input.value.trim())?.input)?.focus({ preventScroll: true });
    }

    function resoudre(t, valeur, { parAide = false } = {}) {
      t.resolu = true;
      t.input.value = valeur;
      t.input.readOnly = true;
      t.input.setAttribute('aria-readonly', 'true');
      t.env.classList.remove('b3-trou-ko');
      t.env.classList.add('b3-trou-ok');
      if (parAide) t.env.classList.add('b3-par-aide');
      t.env.querySelector('.b3-trou-marque').innerHTML = icone(ctx, 'coche');
    }

    async function montrer() {
      // « La démonstration surligne « Helen and Rob », le remplace par they, puis écrit are dans le trou. »
      const cite = texteFr(etape.aide?.montrer).match(/«\s*([^»]+?)\s*»/)?.[1];
      const t = trous.find((x) => !x.resolu && cite && x.item.sujet === cite)
        || trous.find((x) => !x.resolu && x.n === dernierFaux) || trous.find((x) => !x.resolu);
      if (!t) return;
      const signal = ac.signal;
      suivi.aide(t.item.id);
      t.env.scrollIntoView?.({ block: 'center', behavior: mouvementReduit() ? 'auto' : 'smooth' });
      await attendre(350, signal);
      const marque = surlignerSujet(t);
      const pronom = historique ? pronomDe(t.item) : null;
      if (marque && pronom && pronom.toLowerCase() !== String(t.item.sujet).toLowerCase()) {
        const badge = el('span', { class: 'b3-tat-pronom', lang: 'en', texte: `= ${pronom}` });
        marque.after(badge);
      }
      await attendre(900, signal);
      const reponse = liste(t.item.reponse?.attendues)[0] || '';
      t.input.value = '';
      for (const c of reponse) { if (signal.aborted) return; t.input.value += c; await attendre(mouvementReduit() ? 0 : 160, signal); }
      if (signal.aborted) return;
      resoudre(t, reponse, { parAide: true });
      majEtat(); majBouton();
      const phrase = sansOui(t.item.retours?.juste);
      afficher(R.info(`Démonstration, trou ${t.n}.`, { explication: phrase || `${t.item.sujet} : ${reponse}.` }));
      if (trous.every((x) => x.resolu)) terminer();
    }

    function surlignerSujet(t) {
      const sujet = t.item.sujet;
      const seg = bulle.querySelector(`[data-seg="${t.n - 1}"]`);
      if (!sujet || !seg) return null;
      const noeuds = [];
      const w = document.createTreeWalker(seg, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) noeuds.push(w.currentNode);
      for (const n of noeuds.reverse()) {
        const i = n.data.lastIndexOf(sujet);
        if (i < 0) continue;
        const debut = n.splitText(i);
        debut.splitText(sujet.length);
        const m = el('mark', { class: 'b3-surligne b3-tat-sujet' });
        debut.replaceWith(m);
        m.append(debut);
        return m;
      }
      return null;
    }

    function solution() {
      if (fini) return;
      try { ctx.signaler?.solution?.({ item: etape.id }); } catch { /* rien */ }
      for (const t of trous) if (!t.resolu) { suivi.solution(t.item.id); resoudre(t, liste(t.item.reponse?.attendues)[0] || '', { parAide: true }); }
      majEtat();
      afficher(R.reponse('Les réponses sont maintenant dans le message.', { explication: regle() }));
      terminer({ parSolution: true });
    }

    /** « am : I · is : Claire, she… · are : … » construit depuis les items du script. */
    function regle() {
      const groupes = new Map();
      for (const i of items) {
        const f = liste(i.reponse?.attendues)[0];
        if (!f || !i.sujet) continue;
        if (!groupes.has(f)) groupes.set(f, []);
        const s = groupes.get(f);
        const sujet = /^(The|She|He|It|We|They|You)\b/.test(i.sujet) ? i.sujet[0].toLowerCase() + i.sujet.slice(1) : i.sujet;
        if (!s.some((x) => x.toLowerCase() === sujet.toLowerCase())) s.push(sujet);
      }
      return [...groupes.entries()].map(([f, s]) => `${f} avec ${s.join(', ')}`).join(' · ');
    }

    function terminer({ parSolution = false } = {}) {
      if (fini) return;
      fini = true;
      aide.terminer();
      bVerifier.hidden = true;
      majBouton();
      const { obtenus, total } = signalerFin(ctx, suivi, etape);
      if (!parSolution) afficher(R.juste('Le message est complet.', { explication: regle() }));
      const ar = etape.apres_reussite;
      const ecoute = ar?.audio ? boutonEcouter(ctx, ar.audio, { libelle: 'Écouter le message' }) : null;
      const bilan = carteBilan(ctx, {
        obtenus, total, erreurs: suivi.erreurs,
        libelleScore: 'trous justes du premier coup',
        ecoute, texteEcoute: ecoute ? texteFr(ar?.texte) : '',
        surRecommencer: () => partie(),
      });
      cadre.append(bilan);
      requestAnimationFrame(() => bilan.scrollIntoView?.({ block: 'nearest', behavior: mouvementReduit() ? 'auto' : 'smooth' }));
    }
  }

  function pronomDe(item) {
    const m = String(item.retours?.juste || '').match(/=\s*(I|you|he|she|it|we|they)\b/i);
    if (m) return m[1];
    const s = String(item.sujet || '');
    return PRONOMS.find((p) => p.toLowerCase() === s.toLowerCase()) || null;
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
${p} .b3-tat-message { display: flex; flex-direction: column; gap: 12px; }
${p} .b3-tat-auteur { display: flex; align-items: center; gap: 10px; }
${p} .b3-tat-auteur > span { display: flex; flex-direction: column; line-height: 1.25; }
${p} .b3-tat-format { color: var(--encre-50); font-size: 0.8125rem; }
${p} .b3-tat-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; object-position: 50% 20%; background: var(--filet); flex: none; }
${p} .b3-tat-initiale { display: grid; place-items: center; font-weight: 700; color: var(--encre-70); }
${p} .b3-tat-bulle { margin: 0; padding: 14px 16px; border-radius: 4px 18px 18px 18px; background: var(--fond); border: 1px solid var(--filet); font-size: 1.05rem; line-height: 2.55; color: var(--encre); overflow-wrap: anywhere; }
@media (min-width: 768px) { ${p} .b3-tat-bulle { padding: 18px 22px; font-size: 1.1rem; } }
${p} .b3-trou-env { position: relative; display: inline-flex; align-items: center; vertical-align: middle; padding: 3px 0; margin: 0 2px; cursor: text; }
${p} .b3-trou-env { max-width: 100%; }
${p} .b3-trou-illustre { flex-wrap: wrap; gap: 12px; }
${p} .b3-stimulus { width: 130px; height: 130px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
${p} .b3-stimulus img { width: 112px; height: 112px; object-fit: contain; }
${p} .b3-objet { display: block; width: 68px; height: 66px; border: 2px solid #1B2A4A; position: relative; }
${p} .b3-objet-bag { border-radius: 4px 4px 12px 12px; }
${p} .b3-objet-bag::before { content: ''; position: absolute; width: 28px; height: 22px; border: 2px solid #1B2A4A; border-bottom: 0; border-radius: 18px 18px 0 0; left: 17px; top: -24px; }
${p} .b3-objet-cup { border-radius: 3px 3px 18px 18px; }
${p} .b3-objet-cup::after { content: ''; position: absolute; width: 18px; height: 30px; border: 3px solid #1B2A4A; border-left: 0; border-radius: 0 14px 14px 0; right: -21px; top: 8px; }
${p} .b3-trou-num { position: absolute; top: -4px; left: 6px; font-size: 0.625rem; font-weight: 700; color: var(--encre-50); line-height: 1; background: var(--fond); padding: 0 3px; border-radius: 4px; pointer-events: none; }
${p} .b3-trou { width: 4.2em; height: 38px; padding: 0 22px 0 10px; border-radius: 10px; border: 1.5px solid var(--filet-fort); background: var(--surface); color: var(--encre); font: inherit; font-size: 16px; font-weight: 700; line-height: 1; text-align: left; transition: border-color .15s, box-shadow .15s, background-color .15s; }
${p} .b3-trou:focus { outline: none; border-color: var(--marque); box-shadow: 0 0 0 3px var(--marque-voile-bord); }
${p} .b3-trou-marque { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--juste); pointer-events: none; }
${p} .b3-trou-marque svg { width: 14px; height: 14px; display: block; }
${p} .b3-trou-ok .b3-trou { border-color: var(--juste-bord); background: var(--juste-voile); color: var(--juste-fonce); }
${p} .b3-trou-ok.b3-par-aide .b3-trou { border-style: dashed; background: var(--surface); }
${p} .b3-trou-ko .b3-trou { border-color: var(--faux); background: var(--faux-voile); color: var(--faux-fonce); }
${p} .b3-tat-sujet { padding: 0 2px; }
${p} .b3-tat-pronom { display: inline-block; margin: 0 4px; padding: 0 8px; border-radius: 999px; background: var(--marque); color: #fff; font-weight: 700; font-size: 0.9em; line-height: 1.6; animation: b3-tat-pop .35s var(--ressort) both; }
@keyframes b3-tat-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
${p} .b3-tat-glose-aide { display: flex; align-items: center; gap: 8px; color: var(--encre-50); }
${p} .b3-tat-glose-aide svg { width: 16px; height: 16px; flex: none; color: var(--marque); }
${p} .b3-etat { color: var(--encre-50); font-weight: 600; }
${p} .encart .b3-liste-erreurs { margin-top: 6px; color: var(--encre-70); }
@media (prefers-reduced-motion: reduce) { ${p} .b3-tat-pronom { animation: none; } }
`;
}
export { esc };
