// activities/exercices/_etiquettes.js — moteur commun des exercices « poser une étiquette sur sa cible »
// (EX-01 appariement, EX-02 classement). Le module de chaque type ne fait que dessiner.
//
// ─── API STABLE (lue par B4) ───
//   lancerEtiquettes(racine, ctx, config) → { demonter, montrer, montrerSolution }
//   config : {
//     type, prefixe, css(prefixe),
//     cibles(etape) → [{ nom, libelle?, audio? }],
//     vue(hote, modele, api) → { etiquette(id) → Node, cible(nom) → Node, selection(id|null),
//                                succes(id, nom, { demo }), echec(id, nom), surligner?(id, mot), reinitialiser(), redessiner?() },
//     modeEmploi?(souris) → texte, second_indice?(item) → texte, libelleEtat?(n, total) → texte,
//   }
//   modele : { etiquettes: [{ id, texte, image, bonne }], cibles }
//   api : { ctx, R, signal, etape, choisir(id), poser(nom, id?, { demo }), estPlace(id), choisie(), cibleDe(id), jouerCible(nom) }
//
// Règles du script (exercices.json) : vérification étiquette par étiquette, au dépôt ; une étiquette
// juste reste en place, une étiquette fausse revient avec l'explication de SON erreur (retours.cibles,
// sinon faux_par_defaut). Un point par étiquette juste au premier dépôt. Aide aux paliers de D.
import {
  el, esc, icone, texteFr, liste, creerRng, melanger, retoursDe, preparerMedias, donneesEtape, afficherEnPreparation,
  regimeDe, creerSuivi, creerBarreAide, carteBilan, signalerFin, cssCommun, animerVers, attendre, jouerVoix, pointeurFin, rendreVisible,
} from './_commun.js';

/**
 * config : {
 *   type, prefixe, css(p),
 *   cibles(etape) → [{ nom, libelle?, audio? }],
 *   vue(hote, modele, api) → {
 *     element, etiquette(id) → Node, cible(nom) → Node,
 *     selection(id|null), succes(id, nom, { demo }), echec(id, nom), reinitialiser(), redessiner?(),
 *   },
 *   second_indice?(item) → string, libelleEtat?(n, total)
 * }
 */
export async function lancerEtiquettes(racine, ctx, config) {
  ctx.ajouterStyle?.(cssCommun(config.prefixe) + (config.css ? config.css(config.prefixe) : ''));
  const { etape, raison } = await donneesEtape(ctx, 'exercices.json', config.type);
  if (!etape) return afficherEnPreparation(racine, ctx, raison);
  await preparerMedias(ctx);

  const R = retoursDe(ctx);
  const regime = regimeDe(ctx, etape);
  const itemsScript = liste(etape.items).filter((i) => i && i.id && i.etiquette && i.bonne);
  if (!itemsScript.length) return afficherEnPreparation(racine, ctx, 'aucune étiquette');
  const cibles = config.cibles(etape);
  const graine = ctx?.params?.graine;
  let rng = creerRng(graine);

  let suivi, aide, vue, place, choisie, dernierFaux, fini, ac;
  const cadre = el('div', { class: 'b3-cadre' });
  racine.replaceChildren(cadre);

  function nouvellePartie() {
    ac?.abort();
    ac = new AbortController();
    ctx.signal?.addEventListener('abort', () => ac.abort(), { once: true });
    suivi = creerSuivi(ctx, etape);
    suivi.declarer(itemsScript.map((i) => i.id));
    place = new Map();       // id → nom de cible (étiquettes justes, verrouillées)
    choisie = null;
    dernierFaux = null;
    fini = false;

    const carte = el('div', { class: 'carte b3-carte' });
    const hote = el('div', { class: 'b3-plateau' });
    const etat = el('p', { class: 'b3-etat petit', 'aria-live': 'polite' });
    const zoneRetour = el('div', { class: 'b3-retour', 'aria-live': 'polite' });
    const modele = {
      etiquettes: melanger(itemsScript, rng).map((i) => ({ id: i.id, texte: i.etiquette, image: i.image || null, bonne: i.bonne })),
      cibles,
    };
    const api = {
      ctx, R, signal: ac.signal, etape,
      choisir, poser,
      estPlace: (id) => place.has(id),
      choisie: () => choisie,
      cibleDe: (id) => place.get(id),
      jouerCible: (nom) => { const c = cibles.find((x) => x.nom === nom); if (c?.audio) jouerVoix(ctx, c.audio); },
    };
    vue = config.vue(hote, modele, api);
    aide = creerBarreAide(ctx, {
      etape, regime,
      indices: () => [texteFr(etape.aide?.indice), dernierFaux && config.second_indice ? config.second_indice(itemDe(dernierFaux)) : null].filter(Boolean),
      surMontrer: () => montrer(),
      surSolution: () => solution(),
    });
    const mode = config.modeEmploi ? el('p', { class: 'b3-mode', html: `${icone(ctx, 'info')}<span>${esc(config.modeEmploi(pointeurFin()))}</span>` }) : null;
    const dock = el('div', { class: 'b3-dock' }, zoneRetour, aide.element);
    carte.append(...[mode, hote, etat, dock].filter(Boolean));
    cadre.replaceChildren(carte);
    majEtat();

    function majEtat() {
      etat.textContent = config.libelleEtat ? config.libelleEtat(place.size, itemsScript.length) : `${place.size} sur ${itemsScript.length} bien placées`;
    }
    function afficher(n) { zoneRetour.replaceChildren(n); rendreVisible(dock); }

    function choisir(id) {
      if (fini || place.has(id)) return;
      choisie = choisie === id ? null : id;
      vue.selection(choisie);
    }

    /** Pose l'étiquette `id` (ou celle choisie) sur la cible `nom` et vérifie aussitôt. */
    function poser(nom, id = choisie, { demo = false } = {}) {
      if (fini || !id || place.has(id)) return false;
      const item = itemDe(id);
      const juste = item.bonne === nom;
      choisie = null;
      vue.selection(null);
      if (!demo) {
        const cibleRetour = liste(item.retours?.cibles).find((c) => liste(c.si).includes(nom));
        const explication = juste ? '' : (cibleRetour?.retour || item.retours?.faux_par_defaut || '');
        suivi.essai({ item: id, juste, element: item.etiquette, attendu: item.bonne, donne: nom, explication });
        if (!juste) {
          dernierFaux = id;
          vue.echec(id, nom);
          try { ctx.services?.sons?.jouer?.('faux'); } catch { /* rien */ }
          afficher(R.faux(`« ${item.etiquette} » ne va pas avec ${nom}.`, { explication }));
          aide.erreur();
          return false;
        }
      } else {
        suivi.aide(id);
      }
      place.set(id, nom);
      vue.succes(id, nom, { demo });
      api.jouerCible(nom);
      if (!demo) {
        try { ctx.services?.sons?.jouer?.('juste'); } catch { /* rien */ }
        afficher(R.juste(texteFr(item.retours?.juste) || `Juste : « ${item.etiquette} », c'est ${nom}.`));
      }
      majEtat();
      try { ctx.signaler?.progression?.(place.size / itemsScript.length); } catch { /* rien */ }
      if (place.size === itemsScript.length) terminer();
      return true;
    }

    async function montrer() {
      // D décrit la démonstration en clair : « glisse l'étiquette « elle (la machine à café) » sur it »,
      // « range Claire and I dans we, puis Claire and Daniel dans they, en soulignant le mot I ».
      const texte = texteFr(etape.aide?.montrer);
      const gestes = gestesDemo(texte).filter((i) => !place.has(i.id));
      if (!gestes.length) {
        const i = itemsScript.find((x) => !place.has(x.id) && x.id === dernierFaux) || itemsScript.find((x) => !place.has(x.id));
        if (i) gestes.push(i);
      }
      const souligne = texte.match(/soulignant\s+(?:le\s+mot\s+)?«?\s*([A-Za-z']+)\s*»?/i)?.[1] || null;
      choisie = null; vue.selection(null);
      zoneRetour.replaceChildren();
      const lignes = [];
      for (const [k, item] of gestes.slice(0, 2).entries()) {
        if (ac.signal.aborted) return;
        if (k) await attendre(650, ac.signal);
        if (souligne) vue.surligner?.(item.id, souligne);
        const vers = vue.cible(item.bonne);
        // Au téléphone, la cible peut être sous le panneau du bas : on l'amène au centre avant le geste.
        if (window.innerWidth < 768) { vers?.scrollIntoView?.({ block: 'center', behavior: 'auto' }); await attendre(120, ac.signal); }
        await animerVers(vue.etiquette(item.id), vers, cadre, ac.signal);
        if (ac.signal.aborted) return;
        poser(item.bonne, item.id, { demo: true });
        lignes.push(`« ${item.etiquette} » va avec ${item.bonne}. ${texteFr(item.retours?.faux_par_defaut) || ''}`.trim());
      }
      if (lignes.length) afficher(R.info(lignes[0], { explication: lignes.slice(1).join(' ') }));
    }

    /** Les étiquettes citées dans le texte de démonstration, dans l'ordre du texte (la plus longue d'abord). */
    function gestesDemo(texte) {
      const pris = [];
      const trouves = [];
      for (const i of [...itemsScript].sort((a, b) => b.etiquette.length - a.etiquette.length)) {
        let pos = texte.indexOf(i.etiquette);
        while (pos >= 0 && pris.some(([a, b]) => pos < b && pos + i.etiquette.length > a)) pos = texte.indexOf(i.etiquette, pos + 1);
        if (pos < 0) continue;
        // Il faut que la bonne cible soit nommée juste après (« … » sur it / … dans we).
        const suite = texte.slice(pos + i.etiquette.length, pos + i.etiquette.length + 24);
        if (!new RegExp(`^\\s*»?\\s*(sur|dans)\\s+${i.bonne.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(suite)) continue;
        pris.push([pos, pos + i.etiquette.length]);
        trouves.push([pos, i]);
      }
      return trouves.sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    }

    async function solution() {
      if (fini) return;
      try { ctx.signaler?.solution?.({ item: etape.id }); } catch { /* rien */ }
      const restantes = itemsScript.filter((i) => !place.has(i.id));
      for (const i of restantes) suivi.solution(i.id);
      for (const i of restantes) {
        if (ac.signal.aborted) return;
        place.set(i.id, i.bonne);
        vue.succes(i.id, i.bonne, { demo: true, solution: true });
        await attendre(120, ac.signal);
      }
      majEtat();
      afficher(R.reponse('Chaque étiquette est maintenant à sa place.', { explication: texteFr(etape.retours?.fin) }));
      terminer({ parSolution: true });
    }

    function terminer({ parSolution = false } = {}) {
      if (fini) return;
      fini = true;
      aide.terminer();
      vue.redessiner?.();
      const { obtenus, total } = signalerFin(ctx, suivi, etape);
      if (!parSolution) afficher(R.juste('Tout est à sa place.'));
      const bilan = carteBilan(ctx, {
        obtenus, total, erreurs: suivi.erreurs,
        aRetenir: parSolution ? '' : texteFr(etape.retours?.fin),
        libelleScore: 'étiquettes bien placées du premier coup',
        surRecommencer: () => { rng = creerRng(graine === undefined ? undefined : `${graine}-${Date.now()}`); nouvellePartie(); },
      });
      cadre.append(bilan);
      requestAnimationFrame(() => bilan.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
    }

    racine.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && choisie) { choisie = null; vue.selection(null); }
    }, { signal: ac.signal });
  }

  const itemDe = (id) => itemsScript.find((i) => i.id === id);

  nouvellePartie();
  try { ctx.signaler?.pret?.(); } catch { /* rien */ }
  return {
    demonter() { ac?.abort(); },
    montrer() { aide?.montrer?.(); },
    montrerSolution() { aide?.solution?.(); },
  };
}

export { esc, icone };
