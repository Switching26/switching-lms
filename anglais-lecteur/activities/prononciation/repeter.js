// ÉCOUTER ET RÉPÉTER (PRO-1) — agent B2.
//
// Chez le concurrent : écouter, s'enregistrer, voir des mots en rouge, orange ou vert. Ici, en plus :
//   · le modèle à vitesse normale ou lente, chaque mot s'allumant au moment où il est dit ;
//   · la réécoute de sa voix à côté du modèle (l'un, l'autre, ou les deux à la suite) ;
//   · une explication sur LE mot raté : ce que la machine a compris, le piège francophone, le geste ;
//   · « Retravailler ce mot » : le mot seul, écouté puis dit, avant de reprendre la phrase ;
//   · une note honnête : mot reconnu ou non (par mot), jamais présentée comme une analyse des sons.
// Contenu : script/prononciation.json de D (items, mots_cles, piege, si_mot_faible, seuils).

import { icones } from '../../services/icones.js';
import {
  CSS_COMMUN, RACINES, echapper, typo, norm, jetons, lireNote, diagnostic, nettoyerTranscription,
  messageMicro, messageNote, panneau, microBloqueDAvance, creerEnregistreur, attendreNote,
  jouerSurligne, jouerMot, jouerExtrait, jouerALaSuite, boutonSon, infoSon, memeSon, lentUtile, VITESSE_LENTE,
  montrerDansLaVue,
} from './_commun.js';

// Encarts du socle avec la typographie française (insère du texte brut : on corrige avant).
function retourTypo(S, type, texte, opts) {
  const o = opts ? { ...opts, explication: opts.explication ? typo(opts.explication) : opts.explication } : opts;
  return S.retour[type](typo(texte), o);
}

export const meta = { titre: 'Écouter et répéter', entete: true };

const ESSAIS_MAX = 3;
const HONNETE_PAR_DEFAUT = 'Cette note vérifie que chaque mot a été reconnu. Elle ne juge pas encore chaque son un par un : un h oublié peut passer inaperçu. Réécoutez-vous, puis comparez avec le modèle.';

const R = RACINES;
const CSS = `
${R} .pro-trad { color: var(--encre-50); margin-top: 6px; }
${R} .pro-ecoute { margin-top: 18px; }
${R} .pro-piege { margin-top: 16px; font-size: .95rem; color: var(--encre-70); padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--c-parler-voile); }
${R} .pro-piege b { color: var(--c-parler); }
${R} .pro-zone-enr { display: flex; flex-direction: column; gap: 14px; }
${R} .pro-essais { font-size: .8125rem; color: var(--encre-50); }
${R} .pro-res { display: grid; gap: 14px; margin-top: 16px; }
${R} .pro-res-tete { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
${R} .pro-verdict { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; padding: 4px 10px; border-radius: 999px; font-size: .875rem; }
${R} .pro-verdict svg { width: 18px; height: 18px; }
${R} .pro-verdict[data-v="ok"] { background: var(--juste-voile); color: var(--juste-fonce); }
${R} .pro-verdict[data-v="ko"] { background: var(--pro-orange-fond); color: var(--pro-orange); }
${R} .pro-compte { color: var(--encre-70); font-size: .95rem; }
${R} .pro-phrase.pro-phrase-res { font-size: 1.15rem; line-height: 1.7; }
${R} .pro-compris { font-size: .9rem; color: var(--encre-70); }
${R} .pro-compris q { font-style: italic; quotes: '« ' ' »'; color: var(--encre); }
${R} .pro-explication { border: 1px solid var(--filet); border-left: 4px solid var(--c-parler); border-radius: var(--rayon-bloc); padding: 14px 16px; background: var(--surface); display: grid; gap: 8px; }
${R} .pro-explication[data-ton="bonus"] { border-left-color: var(--pro-orange-bord); background: var(--fond); }
${R} .pro-explication-sur { font-size: .8125rem; font-weight: 700; color: var(--encre-50); text-transform: uppercase; letter-spacing: .04em; }
${R} .pro-explication-tete { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; }
${R} .pro-explication-mot { font-weight: 700; font-size: 1.2rem; color: var(--encre); }
${R} .pro-explication-diag { color: var(--encre) !important; font-weight: 500; }
${R} .pro-niveau { font-size: .8125rem; font-weight: 700; padding: 2px 9px; border-radius: 999px; }
${R} .pro-niveau[data-niveau="orange"] { background: var(--pro-orange-fond); color: var(--pro-orange); }
${R} .pro-niveau[data-niveau="rouge"], ${R} .pro-niveau[data-niveau="absent"] { background: var(--pro-rouge-fond); color: var(--pro-rouge); }
${R} .pro-explication p { color: var(--encre-70); }
${R} .pro-focus { display: grid; gap: 14px; margin-top: 16px; padding: 18px; border-radius: var(--rayon-carte); background: var(--fond); border: 1px solid var(--filet); }
${R} .pro-focus-mot { font-size: clamp(1.8rem, 1.4rem + 2vw, 2.4rem); font-weight: 700; color: var(--encre); letter-spacing: -0.01em; }
${R} .pro-pied { margin-top: 20px; justify-content: flex-end; }
${R} .pro-bilan-liste { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 8px; }
${R} .pro-bilan-liste li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--filet); border-radius: var(--rayon-bloc); background: var(--surface); }
${R} .pro-bilan-liste li svg { width: 20px; height: 20px; flex: none; }
${R} .pro-bilan-liste li[data-e="ok"] svg { color: var(--juste); }
${R} .pro-bilan-liste li[data-e="ko"] svg { color: var(--pro-orange); }
${R} .pro-bilan-liste li[data-e="non"] svg { color: var(--encre-30); }
${R} .pro-bilan-liste .pro-bilan-texte { flex: 1; min-width: 0; }
${R} .pro-bilan-liste .btn { min-height: 40px; padding: 6px 12px; }
@media (max-width: 480px) {
  ${R} .pro-ecoute .btn, ${R} .pro-res .pro-actions .btn, ${R} .pro-focus .pro-actions .btn { flex: 1 1 auto; }
  ${R} .pro-focus { padding: 14px; }
}
${R} .pro-focus-note { display: grid; gap: 10px; }
`;

export async function monter(racine, ctx) {
  const S = ctx.services;
  // Le lecteur n'injecte qu'UNE feuille par type d'activité : commune + propre, en un seul appel.
  ctx.ajouterStyle(CSS_COMMUN + CSS);

  const e = ctx.donnees || {};
  const items = Array.isArray(e.items) ? e.items : [];
  let fichier = null;
  try { fichier = await ctx.script('prononciation.json'); } catch { /* texte par défaut */ }
  const honnete = fichier?.note_de_prononciation?.phrase_honnete_affichee || HONNETE_PAR_DEFAUT;

  if (!items.length) {
    racine.innerHTML = '<div class="pro-carte"><p class="discret">Les phrases de cette étape ne sont pas encore écrites.</p></div>';
    ctx.signaler.pret();
    return { demonter() {} };
  }

  // Sons disponibles (un segment non produit rend null : on affiche son texte, rien ne bloque).
  const sons = await Promise.all(items.map(async (it) => {
    const normal = await infoSon(ctx, it.modele);
    const lent = await infoSon(ctx, it.modele_lent);
    // Version lente gardée seulement si elle est vraiment plus lente ; sinon le normal ralenti.
    return { normal, lent: lentUtile(normal, lent) ? lent : null };
  }));
  try { await S.audio.precharger(sons.flatMap((s) => [s.normal?.url, s.lent?.url]).filter(Boolean)); } catch { /* facultatif */ }

  const etats = items.map(() => ({ essais: 0, reussi: false, premier: null, meilleur: null, ecoute: false }));
  let index = 0;
  let modeEcoute = false;
  let enregistreur = null;
  let barre = null;
  let dernierEnr = null;
  let finie = false;
  let jetonItem = 0;

  const blocageInitial = await microBloqueDAvance(ctx);

  function afficherItem(auto = false) {
    const jeton = ++jetonItem;
    const actuel = () => jeton === jetonItem && racine.isConnected;
    const it = items[index];
    const st = etats[index];
    const son = sons[index];
    enregistreur?.detruire();
    barre?.detruire();
    dernierEnr = null;
    ctx.signaler.progression(index / items.length);
    const cles = (it.mots_cles || []).map(norm);
    const tj = jetons(it.en || it.modele?.texte || '');
    racine.innerHTML = `
      <div class="pro-carte">
        <div class="pro-compteur">
          <span class="petit">Phrase ${index + 1} sur ${items.length}</span>
          <span class="pro-points-etapes" aria-hidden="true">${items.map((_, i) => `<i data-e="${i === index ? 'courant' : etats[i].reussi ? 'fait' : etats[i].essais ? 'rate' : ''}"></i>`).join('')}</span>
        </div>
        <p class="pro-phrase anglais" lang="en">${tj.map((t) => (t.type === 'mot'
          ? `<span class="pro-mot${cles.some((c) => memeSon(c, t.mot)) ? ' pro-cle' : ''}" data-mot="${echapper(t.mot)}">${echapper(t.brut)}</span>`
          : echapper(t.brut))).join('')}</p>
        ${it.fr ? `<p class="pro-trad">${echapper(it.fr)}</p>` : ''}
        <div class="pro-ecoute pro-actions"></div>
        ${it.piege ? `<p class="pro-piege"><b>À surveiller.</b> ${echapper(it.piege)}</p>` : ''}
        <hr class="pro-sep">
        <div class="pro-zone-enr"></div>
        <div class="pro-zone-note"></div>
        <div class="pro-resultat"></div>
        <div class="pro-aide"></div>
        <div class="pro-pied pro-actions"></div>
      </div>`;
    const elsMots = [...racine.querySelectorAll('.pro-phrase .pro-mot')];
    const motsNorm = elsMots.map((x) => x.dataset.mot);
    const zoneEcoute = racine.querySelector('.pro-ecoute');
    const ecouter = async (lent) => {
      st.ecoute = true;
      ctx.tracer('audio_ecoute', { item: it.id, lent });
      effacerCouleurs();
      if (lent && son.lent) return jouerSurligne(ctx, son.lent, elsMots, motsNorm);
      if (lent) return jouerSurligne(ctx, son.normal, elsMots, motsNorm, { vitesse: VITESSE_LENTE });
      return jouerSurligne(ctx, son.normal, elsMots, motsNorm);
    };
    zoneEcoute.append(
      boutonSon({ libelle: 'Écouter', icone: 'ecouter', disponible: Boolean(son.normal), action: () => ecouter(false) }),
      boutonSon({ libelle: 'Lent', icone: 'lent', disponible: Boolean(son.lent || son.normal), action: () => ecouter(true) }),
    );
    if (!son.normal) {
      const p = document.createElement('p');
      p.className = 'petit discret';
      p.textContent = typo('Le son de cette phrase est en préparation : lisez-la à voix haute.');
      zoneEcoute.append(p);
    }

    function effacerCouleurs() { elsMots.forEach((x) => { delete x.dataset.niveau; x.classList.remove('pro-dit'); }); }

    // Barre d'aide du socle (paliers de D : indice après 2 erreurs, démonstration et solution après 3).
    barre = S.aide.barre(ctx, {
      item: () => it.id,
      surMontrer: () => { effacerCouleurs(); jouerSurligne(ctx, son.lent || son.normal, elsMots, motsNorm, { vitesse: son.lent ? 1 : VITESSE_LENTE }); },
      surSolution: () => {
        const zone = racine.querySelector('.pro-resultat');
        zone.replaceChildren(retourTypo(S, 'reponse', it.en, { explication: [it.fr, it.piege].filter(Boolean).join(' — ') }));
        effacerCouleurs();
        jouerSurligne(ctx, son.lent || son.normal, elsMots, motsNorm, { vitesse: son.lent ? 1 : VITESSE_LENTE });
        afficherPied(true);
      },
    });
    barre.nouvelItem();
    for (let k = 0; k < Math.min(st.essais, ESSAIS_MAX); k += 1) barre.erreur();
    racine.querySelector('.pro-aide').append(barre.element);

    afficherZoneEnregistrement();
    afficherPied(st.essais > 0 || modeEcoute);
    if (st.meilleur) montrerResultat(st.meilleur.note, st.meilleur.r, null, { rappel: true });
    if (auto && son.normal) ecouter(false);

    function afficherZoneEnregistrement() {
      const zone = racine.querySelector('.pro-zone-enr');
      zone.replaceChildren();
      if (modeEcoute) {
        zone.append(panneau({
          titre: 'Mode écoute',
          texte: 'Écoutez le modèle, répétez-le à voix haute, puis réécoutez-le pour vous comparer. Cette phrase ne sera pas notée.',
          actions: [{ libelle: 'Réessayer le micro', icone: 'micro', action: () => { modeEcoute = false; afficherZoneEnregistrement(); } }],
        }));
        st.vu = true;
        return;
      }
      if (st.essais >= ESSAIS_MAX && !st.reussi) {
        zone.append(panneau({ titre: 'Trois essais faits', texte: 'Passez à la phrase suivante : vous pourrez revenir sur celle-ci à la fin. Vous pouvez encore retravailler un mot ci-dessous.' }));
        return;
      }
      enregistreur = creerEnregistreur(ctx, {
        dureeMax: 8000,
        dureeMin: 600,
        finSilence: 1500,
        libelle: st.essais ? 'Touchez pour réessayer' : 'Touchez pour répéter la phrase',
        surDebut: () => { effacerCouleurs(); racine.querySelector('.pro-zone-note').replaceChildren(); },
        surResultat: (res) => traiterEnregistrement(res),
      });
      zone.append(enregistreur.element);
      if (st.essais) {
        const n = document.createElement('p');
        n.className = 'pro-essais';
        n.textContent = `Essai ${Math.min(st.essais + 1, ESSAIS_MAX)} sur ${ESSAIS_MAX}.`;
        zone.append(n);
      }
      if (blocageInitial && st.essais === 0 && index === 0) montrerProblemeMicro(blocageInitial);
    }

    function montrerProblemeMicro(code) {
      const m = messageMicro(code);
      const zone = racine.querySelector('.pro-zone-note');
      const actions = [];
      if (m.reessayer) actions.push({ libelle: 'Réessayer', icone: 'rejouer', action: () => { zone.replaceChildren(); enregistreur?.demarrer(); } });
      actions.push({ libelle: 'Continuer sans micro', icone: 'ecouter', primaire: !m.reessayer, action: () => { zone.replaceChildren(); modeEcoute = true; afficherZoneEnregistrement(); afficherPied(true); } });
      zone.replaceChildren(panneau({ titre: m.titre, texte: m.texte, actions, ton: 'alerte' }));
    }

    async function traiterEnregistrement(res) {
      const zoneNote = racine.querySelector('.pro-zone-note');
      if (!res.ok && res.micro) { montrerProblemeMicro(res.code); return; }
      if (!res.ok) {
        const m = messageNote(res.code);
        zoneNote.replaceChildren(panneau({ titre: m.titre, texte: m.texte, ton: 'alerte' }));
        return;
      }
      dernierEnr = res.enr;
      ctx.tracer('enregistrement_depose', { item: it.id, duree_s: res.enr.duree_s });
      enregistreur.attente();
      const r = await attendreNote(ctx, zoneNote, () => S.prononciation.noter(res.enr.blob, it.en));
      if (!actuel()) return;
      enregistreur.pret('Touchez pour réessayer');
      if (!r || !r.ok) {
        const code = r?.code || 'indisponible';
        const m = messageNote(code);
        const actions = [];
        if (code === 'indisponible') actions.push({ libelle: 'Renvoyer', icone: 'rejouer', primaire: true, action: () => traiterEnregistrement(res) });
        zoneNote.replaceChildren(panneau({ titre: m.titre, texte: m.texte, actions, ton: 'alerte' }));
        montrerComparaison(racine.querySelector('.pro-resultat'), res.enr.url);
        afficherPied(true);
        return;
      }
      const compris = nettoyerTranscription(r.transcription);
      if (!compris) {
        const m = messageNote('non-reconnu');
        zoneNote.replaceChildren(panneau({ titre: m.titre, texte: m.texte, ton: 'alerte' }));
        compterEssai(false, 'aucun mot anglais reconnu', 'Aucun mot anglais n’a été reconnu.', r);
        montrerComparaison(racine.querySelector('.pro-resultat'), res.enr.url);
        return;
      }
      const note = lireNote(r, it.mots_cles || []);
      const expl = expliquer(note.cible);
      compterEssai(note.reussi, note.cible ? `${note.cible.attendu}${note.cible.entendu ? ` (entendu : ${note.cible.entendu})` : ' (non entendu)'}` : '', expl?.texte, r, note);
      montrerResultat(note, r, res.enr);
      if (res.limite) racine.querySelector('.pro-res')?.prepend(retourTypo(S, 'info', 'Enregistrement arrêté au bout de 8 secondes : une phrase se dit en 2 à 4 secondes.'));
    }

    function compterEssai(reussi, donne, explication, r, note) {
      st.essais += 1;
      if (st.premier === null) st.premier = reussi;
      if (reussi) st.reussi = true;
      if (note && (!st.meilleur || note.completude > st.meilleur.note.completude || (note.reussi && !st.meilleur.note.reussi))) st.meilleur = { note, r };
      ctx.tracer('note_prononciation', { item: it.id, reussi, globale: r?.notes?.globale ?? null });
      ctx.signaler.essai({
        juste: reussi,
        item: it.id,
        element: it.en,
        attendu: it.en,
        donne: reussi ? it.en : donne,
        explication: reussi ? 'Phrase reconnue, mots clés compris.' : (explication || 'Un mot clé n’a pas été reconnu.'),
        remediation: e.remediation,
        premier_essai: st.essais === 1,
      });
      if (!reussi) barre.erreur();
      afficherPied(true);
      if (st.essais >= ESSAIS_MAX && !st.reussi) afficherZoneEnregistrement();
      else if (!st.reussi) {
        // « Essai 2 sur 3 » tenu à jour sous le micro après chaque essai (pas seulement au retour sur la phrase).
        const zone = racine.querySelector('.pro-zone-enr');
        let n = zone?.querySelector('.pro-essais');
        if (zone && !n) { n = document.createElement('p'); n.className = 'pro-essais'; zone.append(n); }
        if (n) n.textContent = `Essai ${st.essais + 1} sur ${ESSAIS_MAX}.`;
      }
    }

    function expliquer(m) {
      if (!m) return null;
      let d = diagnostic(m.attendu, m.niveau === 'absent' ? '' : m.entendu);
      if (m.colle) {
        d = { son: 'colle', texte: `« ${m.attendu} » s'est collé au mot d'avant : on a entendu « ${m.colle.entendu} » pour « ${m.colle.avec} ${m.attendu} ».${/^h/i.test(m.attendu) ? ' C’est le signe d’un h non soufflé.' : ''}` };
      }
      const cle = Object.keys(it.si_mot_faible || {}).find((k) => memeSon(k, m.attendu));
      // La première phrase de D (« X n'a pas été bien reconnu. ») répète l'étiquette : on garde le geste.
      let conseil = cle ? it.si_mot_faible[cle].replace(/^[^.]*n['’]a pas été (bien )?reconnu\.\s*/i, '') : '';
      if (!conseil) conseil = m.niveau === 'orange'
        ? 'Réécoutez-le au ralenti, puis redites-le en articulant un peu plus.'
        : 'Réécoutez le modèle au ralenti en vous concentrant sur ce mot, puis redites-le seul.';
      const etiquette = { orange: 'reconnu de justesse', rouge: 'non reconnu', absent: 'non entendu' }[m.niveau] || '';
      const diag = d?.texte || null;
      return { etiquette, diag, conseil, texte: `« ${m.attendu} » : ${etiquette}. ${diag ? `${diag} ` : ''}${conseil}`.trim() };
    }

    function montrerResultat(note, r, enr, { rappel = false } = {}) {
      const zone = racine.querySelector('.pro-resultat');
      if (!zone) return;
      racine.querySelector('.pro-zone-note')?.replaceChildren();
      // Couleurs sur la phrase elle-même : vert, orange, rouge (et barré si le mot manque).
      elsMots.forEach((x) => { delete x.dataset.niveau; x.removeAttribute('aria-label'); });
      note.mots.forEach((m, i) => {
        const el = elsMots[i] && memeSon(elsMots[i].dataset.mot, m.attendu) ? elsMots[i] : elsMots.find((x) => memeSon(x.dataset.mot, m.attendu) && !x.dataset.niveau);
        if (!el) return;
        el.dataset.niveau = m.niveau;
        const lib = { vert: 'bien reconnu', orange: 'reconnu de justesse', rouge: 'non reconnu', absent: 'non entendu' }[m.niveau];
        el.setAttribute('aria-label', `${m.attendu} : ${lib}${m.memeSon ? ' (même son, autre orthographe)' : ''}`);
      });
      const compris = nettoyerTranscription(r?.transcription);
      const expl = expliquer(note.cible);
      zone.innerHTML = `
        <div class="pro-res apparait">
          <div class="pro-res-tete">
            <span class="pro-verdict" data-v="${note.reussi ? 'ok' : 'ko'}">${note.reussi ? icones.juste : icones.presque}${note.reussi ? 'Phrase réussie' : 'À retravailler'}</span>
            <span class="pro-compte">Mots reconnus : ${note.bons} sur ${note.total}${note.clesTotal ? ` · mots clés : ${note.clesBons} sur ${note.clesTotal}` : ''}</span>
          </div>
          <div class="pro-legende" aria-hidden="true"><span><i data-n="vert"></i>bien reconnu</span><span><i data-n="orange"></i>de justesse</span><span><i data-n="rouge"></i>non reconnu</span></div>
          ${compris ? `<p class="pro-compris">La machine a compris : <q lang="en">${echapper(compris)}</q>${rappel ? ' (meilleur essai)' : ''}</p>` : ''}
          <div class="pro-comparer"></div>
          ${expl ? `<div class="pro-explication" data-ton="${note.reussi ? 'bonus' : 'travail'}">
            ${note.reussi ? '<span class="pro-explication-sur">Pour aller plus loin</span>' : ''}
            <div class="pro-explication-tete"><span class="pro-explication-mot" lang="en">${echapper(note.cible.attendu)}</span><span class="pro-niveau" data-niveau="${note.cible.niveau}">${echapper(expl.etiquette)}</span></div>
            ${expl.diag ? `<p class="pro-explication-diag">${echapper(expl.diag)}</p>` : ''}
            <p>${echapper(expl.conseil)}</p>
            <div class="pro-actions pro-explication-actions"></div></div>` : ''}
          <p class="pro-honnete">${icones.info}<span>Note calculée mot par mot. ${echapper(honnete)}</span></p>
        </div>`;
      // La phrase colorée, répétée en tête du résultat : au téléphone, la phrase du haut sort de l'écran.
      const copie = racine.querySelector('.pro-phrase')?.cloneNode(true);
      if (copie) {
        copie.classList.add('pro-phrase-res');
        copie.setAttribute('aria-hidden', 'true');
        copie.querySelectorAll('.pro-dit').forEach((x) => x.classList.remove('pro-dit'));
        zone.querySelector('.pro-res-tete')?.after(copie);
      }
      montrerComparaison(zone.querySelector('.pro-comparer'), enr?.url || null, note, r);
      if (expl) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn ${note.reussi ? 'btn-secondaire' : 'btn-primaire'}`;
        b.innerHTML = `${icones.micro}<span>Retravailler « ${echapper(note.cible.attendu)} »</span>`;
        b.addEventListener('click', () => retravailler(note.cible, expl));
        zone.querySelector('.pro-explication-actions').append(b);
      }
      montrerDansLaVue(zone.querySelector('.pro-res'));
      if (note.reussi) { S.sons?.jouer?.('juste'); S.retour.annoncer?.(`Phrase réussie. ${note.bons} mots reconnus sur ${note.total}.`); }
      else S.retour.annoncer?.(`À retravailler. ${expl ? expl.texte : ''}`);
    }

    function montrerComparaison(zone, urlVoix, note, r) {
      if (!zone) return;
      const box = document.createElement('div');
      box.className = 'pro-actions';
      box.append(
        boutonSon({ libelle: 'Le modèle', icone: 'ecouter', disponible: Boolean(son.normal), action: () => jouerSurligne(ctx, son.normal, elsMots, motsNorm) }),
        boutonSon({ libelle: 'Ma voix', icone: 'micro', disponible: Boolean(urlVoix), action: () => S.audio.jouer(urlVoix) }),
        boutonSon({ libelle: 'Les deux à la suite', icone: 'comparer', disponible: Boolean(urlVoix && son.normal), action: () => jouerALaSuite(ctx, [son.normal?.url, urlVoix]) }),
      );
      // Le mot raté dans MA voix, si le serveur donne ses temps (demande D3).
      const c = note?.cible;
      if (c && urlVoix && c.debut !== undefined && c.fin > c.debut) {
        box.append(boutonSon({ libelle: `Mon « ${c.attendu} »`, icone: 'micro', action: () => jouerExtrait(ctx, urlVoix, c.debut, c.fin) }));
      }
      zone.replaceChildren(box);
    }

    // Retravailler un seul mot, puis reprendre la phrase.
    function retravailler(m, expl) {
      const zone = racine.querySelector('.pro-resultat');
      const mot = m.attendu;
      let enrMot = null;
      zone.innerHTML = `
        <div class="pro-focus apparait">
          <p class="petit discret">Retravailler un mot, puis reprendre la phrase</p>
          <p class="pro-focus-mot" lang="en">${echapper(mot)}</p>
          <p>${echapper(expl.conseil)}</p>
          <div class="pro-actions pro-focus-ecoute"></div>
          <div class="pro-focus-enr"></div>
          <div class="pro-focus-note"></div>
          <div class="pro-actions pro-focus-pied"></div>
        </div>`;
      const ecoute = zone.querySelector('.pro-focus-ecoute');
      ecoute.append(
        boutonSon({ libelle: 'Écouter le mot', icone: 'ecouter', disponible: Boolean(son.normal), action: () => jouerMot(ctx, son.normal, mot) }),
        boutonSon({ libelle: 'Lent', icone: 'lent', disponible: Boolean(son.lent || son.normal), action: () => (son.lent ? jouerMot(ctx, son.lent, mot) : jouerMot(ctx, son.normal, mot, { vitesse: VITESSE_LENTE })) }),
      );
      const zoneNote = zone.querySelector('.pro-focus-note');
      const pied = zone.querySelector('.pro-focus-pied');
      const reprendre = (primaire) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn ${primaire ? 'btn-primaire' : 'btn-secondaire'}`;
        b.innerHTML = `${icones.rejouer}<span>Reprendre la phrase</span>`;
        b.addEventListener('click', () => {
          zone.replaceChildren();
          const n = racine.querySelector('.pro-zone-note');
          if (n) n.replaceChildren(retourTypo(S, 'info', 'Maintenant, dites toute la phrase, en gardant ce que vous venez de travailler.'));
          enregistreur?.pret('Touchez pour répéter la phrase');
          racine.querySelector('.pro-zone-enr')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        });
        pied.replaceChildren(b);
      };
      reprendre(false);
      if (modeEcoute) {
        zoneNote.replaceChildren(retourTypo(S, 'info', 'Mode écoute : dites le mot à voix haute après le modèle, puis réécoutez-le.'));
        return;
      }
      const enrMotUi = creerEnregistreur(ctx, {
        dureeMax: 4000, dureeMin: 250, finSilence: 900, attenteParole: 4000,
        libelle: 'Touchez et dites le mot',
        surDebut: () => zoneNote.replaceChildren(),
        surResultat: async (res) => {
          if (!res.ok && res.micro) { const mm = messageMicro(res.code); zoneNote.replaceChildren(panneau({ titre: mm.titre, texte: mm.texte, ton: 'alerte' })); return; }
          if (!res.ok) { const mm = messageNote(res.code); zoneNote.replaceChildren(panneau({ titre: mm.titre, texte: mm.texte, ton: 'alerte' })); return; }
          enrMot = res.enr;
          ctx.tracer('enregistrement_depose', { item: `${it.id}-mot`, duree_s: res.enr.duree_s });
          enrMotUi.attente();
          const r = await attendreNote(ctx, zoneNote, () => S.prononciation.noter(res.enr.blob, mot));
          if (!zone.isConnected || !actuel()) return;
          enrMotUi.pret('Touchez pour redire le mot');
          if (!r || !r.ok) { const mm = messageNote(r?.code || 'indisponible'); zoneNote.replaceChildren(panneau({ titre: mm.titre, texte: mm.texte, ton: 'alerte' })); return; }
          const nm = lireNote(r, [mot]);
          const w = nm.mots[0];
          const ok = w && (w.niveau === 'vert' || w.niveau === 'orange');
          const compris = nettoyerTranscription(r.transcription);
          ctx.tracer('note_prononciation', { item: `${it.id}-mot`, reussi: Boolean(ok) });
          const comparer = document.createElement('div');
          comparer.className = 'pro-actions';
          comparer.append(
            boutonSon({ libelle: 'Le modèle', icone: 'ecouter', disponible: Boolean(son.normal), action: () => jouerMot(ctx, son.normal, mot) }),
            boutonSon({ libelle: 'Ma voix', icone: 'micro', action: () => S.audio.jouer(enrMot.url) }),
          );
          if (ok) {
            montrerDansLaVue(zoneNote);
            zoneNote.replaceChildren(retourTypo(S, 'juste', w.niveau === 'vert' ? `« ${mot} » est bien reconnu.` : `« ${mot} » est reconnu, de justesse.`, { explication: 'Reprenez maintenant la phrase entière.' }), comparer);
            S.sons?.jouer?.('juste');
            reprendre(true);
          } else {
            const d = diagnostic(mot, w?.niveau === 'absent' ? '' : (w?.entendu || compris));
            zoneNote.replaceChildren(retourTypo(S, 'faux', d?.texte || `« ${mot} » n’a pas encore été reconnu.`, { explication: expl.conseil }), comparer);
          }
        },
      });
      zone.querySelector('.pro-focus-enr').append(enrMotUi.element);
      ctx.surDemontage(() => enrMotUi.detruire());
      zone.querySelector('.pro-focus')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }

    function afficherPied(montrer) {
      const pied = racine.querySelector('.pro-pied');
      if (!pied) return;
      pied.replaceChildren();
      if (!montrer) return;
      const dernier = index === items.length - 1;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${st.reussi || st.essais >= ESSAIS_MAX || modeEcoute ? 'btn-primaire' : 'btn-secondaire'}`;
      b.innerHTML = `<span>${dernier ? 'Voir le bilan des phrases' : 'Phrase suivante'}</span>${icones.suivant}`;
      b.addEventListener('click', () => {
        S.audio.arreter('media');
        if (dernier) afficherBilan();
        else { index += 1; afficherItem(true); racine.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }
      });
      pied.append(b);
    }
  }

  function afficherBilan() {
    enregistreur?.detruire();
    barre?.detruire();
    const notes = etats.filter((s) => s.essais > 0);
    const reussies = etats.filter((s) => s.reussi).length;
    const premier = etats.filter((s) => s.premier === true).length;
    ctx.signaler.progression(1);
    racine.innerHTML = `
      <div class="pro-carte apparait">
        <h2>Vos huit phrases</h2>
        <p class="discret" style="margin-top:6px">${notes.length
          ? `${reussies} phrase${reussies > 1 ? 's' : ''} réussie${reussies > 1 ? 's' : ''} sur ${items.length}. Une phrase est réussie quand tous ses mots clés sont reconnus et presque toute la phrase est comprise.`
          : 'Fait en mode écoute : ces phrases n’ont pas été notées.'}</p>
        <ul class="pro-bilan-liste"></ul>
        <p class="pro-honnete" style="margin-top:14px">${icones.info}<span>Note calculée mot par mot : elle dit si chaque mot a été reconnu, pas la qualité de chaque son.</span></p>
      </div>`;
    const ul = racine.querySelector('.pro-bilan-liste');
    items.forEach((it, i) => {
      const s = etats[i];
      const li = document.createElement('li');
      li.dataset.e = s.reussi ? 'ok' : s.essais ? 'ko' : 'non';
      li.innerHTML = `${s.reussi ? icones.juste : s.essais ? icones.presque : icones.info}<span class="pro-bilan-texte"><span lang="en">${echapper(it.en)}</span><br><span class="petit discret">${s.reussi ? 'réussie' : s.essais ? `${s.essais} essai${s.essais > 1 ? 's' : ''}, à retravailler` : 'non enregistrée'}</span></span>`;
      if (!s.reussi) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-secondaire';
        b.textContent = 'Reprendre';
        b.addEventListener('click', () => { index = i; if (s.essais >= ESSAIS_MAX) s.essais = ESSAIS_MAX - 1; afficherItem(true); });
        li.append(b);
      }
      ul.append(li);
    });
    finie = true;
    if (notes.length) {
      ctx.signaler.fin({ score: reussies / items.length, reussi: reussies / items.length >= 0.6, points_obtenus: premier });
    } else {
      ctx.signaler.fin({ score: null, reussi: true, sans_note: true });
    }
    S.sons?.jouer?.('fin');
  }

  afficherItem(false);
  ctx.signaler.pret();

  return {
    demonter() { enregistreur?.detruire(); barre?.detruire(); finie = true; },
    montrer() { racine.querySelector('.aide-barre [data-aide="montrer"]')?.click(); },
    montrerSolution() { racine.querySelector('.aide-barre [data-aide="solution"]')?.click(); },
  };
}
