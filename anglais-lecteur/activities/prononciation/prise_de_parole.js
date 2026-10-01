// PRÉSENTEZ-VOUS À VOIX HAUTE (PRO-4) — agent B2.
//
// L'apprenant se présente en trois phrases, avec SES informations. Pas de texte attendu :
//   · on affiche ce que la reconnaissance a compris (« Voici ce que nous avons compris ») ;
//   · on coche les critères de D (salutation, I'm + prénom, métier avec a / an, trois phrases),
//     on explique ce qui manque, avec l'erreur n° 1 des francophones (I'm teacher) repérée à part ;
//   · on propose un modèle : celui de Claire, et SA présentation complétée avec ses propres mots.
// Confidentialité : la transcription n'est jamais envoyée dans les traces ni dans le bilan ; seule la
// réussite des critères l'est. L'audio part au serveur pour être transcrit : c'est dit à l'écran.

import { icones } from '../../services/icones.js';
import {
  CSS_COMMUN, RACINES, echapper, typo, norm, nettoyerTranscription, messageMicro, messageNote, panneau,
  microBloqueDAvance, creerEnregistreur, attendreNote, boutonSon, infoSon, jouerExtrait, motsHorodates, memeSon,
  montrerDansLaVue,
} from './_commun.js';

// Encarts du socle avec la typographie française (insère du texte brut : on corrige avant).
function retourTypo(S, type, texte, opts) {
  const o = opts ? { ...opts, explication: opts.explication ? typo(opts.explication) : opts.explication } : opts;
  return S.retour[type](typo(texte), o);
}

export const meta = { titre: 'Présentez-vous à voix haute', entete: true };

const R = RACINES;
const CSS = `
${R} .pro-etapes-parole { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; counter-reset: pp; }
${R} .pro-etapes-parole li { display: flex; gap: 12px; align-items: flex-start; counter-increment: pp; }
${R} .pro-etapes-parole li::before { content: counter(pp); flex: none; width: 28px; height: 28px; border-radius: 99px; display: grid; place-items: center;
  background: var(--c-parler-voile); color: var(--c-parler); font-weight: 700; font-size: .875rem; }
${R} .pro-modele { margin-top: 18px; padding: 14px 16px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); display: grid; gap: 10px; }
${R} .pro-modele-texte { font-size: 1.05rem; font-weight: 500; color: var(--encre); }
${R} .pro-modele[data-masque] .pro-modele-texte { filter: blur(6px); user-select: none; }
${R} .pro-metiers { margin-top: 14px; border: 1px solid var(--filet); border-radius: var(--rayon-bloc); background: var(--surface); }
${R} .pro-metiers > summary { cursor: pointer; padding: 12px 14px; font-weight: 600; min-height: var(--cible); display: flex; align-items: center; gap: 8px; list-style: none; }
${R} .pro-metiers > summary::-webkit-details-marker { display: none; }
${R} .pro-metiers > summary svg { width: 20px; height: 20px; flex: none; color: var(--c-parler); }
${R} .pro-metiers > summary::after { content: ''; margin-left: auto; width: 8px; height: 8px; border-right: 2px solid var(--encre-50); border-bottom: 2px solid var(--encre-50); transform: rotate(45deg); transition: transform .2s; }
${R} .pro-metiers[open] > summary::after { transform: rotate(-135deg); }
${R} .pro-metiers-corps { padding: 0 14px 14px; display: grid; gap: 10px; }
${R} .pro-metiers-liste { display: flex; flex-wrap: wrap; gap: 8px; }
${R} .pro-metier { min-height: 40px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--filet); background: var(--fond); font: inherit; font-size: .9rem; cursor: pointer; color: var(--encre); }
${R} .pro-metier span { color: var(--encre-50); font-size: .8125rem; }
${R} .pro-metier.pro-joue { border-color: var(--marque-voile-bord); background: var(--marque-voile); }
${R} .pro-criteres { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
${R} .pro-criteres li { display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: start; padding: 10px 12px; border-radius: var(--rayon-bloc); border: 1px solid var(--filet); background: var(--surface); }
${R} .pro-criteres li svg { width: 22px; height: 22px; }
${R} .pro-criteres li[data-e="attente"] svg { color: var(--encre-30); }
${R} .pro-criteres li[data-e="ok"] { border-color: var(--juste-bord); background: var(--juste-voile); }
${R} .pro-criteres li[data-e="ok"] svg { color: var(--juste); }
${R} .pro-criteres li[data-e="ko"] { border-color: var(--pro-orange-bord); background: var(--pro-orange-fond); }
${R} .pro-criteres li[data-e="ko"] svg { color: var(--pro-orange); }
${R} .pro-criteres li p { font-size: .9rem; color: var(--encre-70); margin-top: 2px; }
${R} .pro-criteres li p[lang="en"] { font-style: italic; }
${R} .pro-zone-parole { margin-top: 20px; display: grid; gap: 12px; }
${R} .pro-vie-privee { font-size: .8125rem; color: var(--encre-50); }
${R} .pro-compris-bloc { padding: 14px 16px; border-radius: var(--rayon-bloc); border: 1px dashed var(--filet-fort); background: var(--surface); }
${R} .pro-compris-bloc q { display: block; margin-top: 6px; font-size: 1.1rem; font-style: italic; quotes: '« ' ' »'; color: var(--encre); }
${R} .pro-proposition { padding: 14px 16px; border-radius: var(--rayon-bloc); background: var(--c-parler-voile); display: grid; gap: 6px; }
${R} .pro-proposition p[lang="en"] { font-size: 1.1rem; font-weight: 600; color: var(--encre); }
${R} .pro-proposition mark { background: color-mix(in srgb, var(--c-parler) 18%, transparent); color: var(--c-parler); border-radius: 4px; padding: 0 3px; }
${R} .pro-res-parole { display: grid; gap: 14px; margin-top: 4px; }
`;

// Mots qui suivent « I'm » sans être un prénom : articles, adjectifs de la leçon, nationalités, métiers.
const PAS_UN_PRENOM = new Set(('a an the from here very so really not just also too happy nervous busy tired late ready new fine good great well glad '
  + 'pleased sorry okay ok back working looking going married single retired french english british american spanish italian german '
  + 'portuguese belgian swiss canadian moroccan algerian tunisian polish romanian chinese japanese indian irish scottish welsh '
  + 'teacher nurse student accountant assistant manager developer driver hairdresser engineer director organiser organizer seeker '
  + 'doctor lawyer secretary consultant designer cook chef waiter waitress cashier mechanic electrician plumber builder farmer '
  + 'pharmacist dentist architect trainer coach receptionist employee worker unemployed salesman saleswoman project event web job sales in at on with and').split(' '));
const METIERS = ['teacher', 'nurse', 'student', 'accountant', 'assistant', 'manager', 'developer', 'driver', 'hairdresser', 'engineer', 'director',
  'organiser', 'organizer', 'doctor', 'lawyer', 'secretary', 'consultant', 'designer', 'cook', 'chef', 'waiter', 'waitress', 'cashier', 'mechanic',
  'electrician', 'plumber', 'builder', 'farmer', 'pharmacist', 'dentist', 'architect', 'trainer', 'coach', 'receptionist', 'employee', 'worker',
  'salesman', 'saleswoman', 'job seeker', 'project manager', 'sales manager', 'web developer'];

function normPhrase(t) {
  return ` ${String(t || '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}
const majuscule = (m) => (m ? m.charAt(0).toUpperCase() + m.slice(1) : m);
const article = (mot) => (/^(a|e|i|o|u|hour|honest)/i.test(mot) && !/^(uni|use|eu|one)/i.test(mot) ? 'an' : 'a');

/** Analyse la transcription sur les critères de D. Rend { k: {K1..K5}, prenom, metier, erreurMetier, … }. */
function analyser(texte, motsConf) {
  const n = normPhrase(texte);
  const salutation = /\b(hello|hi|hey|good morning|good afternoon|good evening)\b/.exec(n);
  let prenom = null;
  const reNom = /\b(?:i'm|i am|my name is|my name's)\s+([a-z][a-z'-]*)/g;
  let m;
  while ((m = reNom.exec(n))) { if (!PAS_UN_PRENOM.has(m[1])) { prenom = m[1]; break; } }
  const metierOk = /\b(?:i'm|i am)\s+(a|an|the)\s+([a-z]+(?:\s+(?:manager|developer|seeker|organiser|organizer))?)/.exec(n) || /\b(?:i'm|i am)\s+(retired)\b/.exec(n);
  const reSansArticle = new RegExp(`\\b(?:i'm|i am)\\s+(${METIERS.map((x) => x.replace(' ', '\\s+')).join('|')})\\b`);
  const sansArticle = metierOk ? null : reSansArticle.exec(n);
  const mauvaisArticle = /\b(?:i'm|i am)\s+a\s+([aeiou][a-z]+)/.exec(n);
  const be = (n.match(/\b(i'm|i am|you're|you are|he's|he is|she's|she is|it's|it is|we're|we are|they're|they are|am|is|are)\b/g) || []).length;
  const phrases = String(texte || '').split(/[.!?]+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2).length;
  let intelligible = true;
  if (Array.isArray(motsConf) && motsConf.length && motsConf.some((w) => typeof w.confiance === 'number')) {
    // Assurance rendue sur 100 par le serveur (sur 1 par précaution si un jour elle change d'échelle).
    const surs = motsConf.filter((w) => { const c = Number(w.confiance ?? 100); return (c > 1 ? c / 100 : c) >= 0.5; }).length;
    intelligible = surs / motsConf.length >= 0.8;
  }
  // Une autre phrase en I'm (ni le prénom ni le métier) : on la garde dans la proposition.
  // (lue dans la transcription d'origine pour garder les majuscules : French, Lyon)
  const orig = String(texte || '').replace(/[’‘`´]/g, "'");
  const clauses = [...orig.matchAll(/\b(?:I'm|I am)\s+(.*?)(?=\b(?:I'm|I am)\b|$)/gi)]
    .map((x) => x[1].replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s+(and|but|so)$/i, '').trim()).filter(Boolean);
  const autre = clauses.filter((c) => {
    const b = c.toLowerCase();
    return !(prenom && b.startsWith(prenom)) && !/^(a|an|the)\s/.test(b) && !/^retired\b/.test(b) && !METIERS.some((mt) => b.startsWith(mt));
  }).pop() || null;
  return {
    k: { K1: Boolean(salutation), K2: Boolean(prenom), K3: Boolean(metierOk), K4: be >= 3 || phrases >= 3, K5: intelligible },
    autre,
    salutation: salutation ? salutation[1] : null,
    prenom,
    metier: metierOk ? (metierOk[2] ? `${metierOk[1]} ${metierOk[2]}` : metierOk[1]) : null,
    erreurMetier: sansArticle ? sansArticle[1].replace(/\s+/g, ' ') : null,
    mauvaisArticle: mauvaisArticle ? mauvaisArticle[1] : null,
    be,
    phrases,
  };
}

/** Sa présentation complétée avec ses propres mots ; ce qui a été ajouté est marqué. */
function proposition(a) {
  const morceaux = [];
  morceaux.push(a.salutation ? `${echapper(majuscule(a.salutation))},` : '<mark>Hello</mark>,');
  morceaux.push(a.prenom ? `I'm ${echapper(majuscule(a.prenom))}.` : "I'm <mark>[votre prénom]</mark>.");
  if (a.metier && /^a\s+[aeiou]/i.test(a.metier)) morceaux.push(`I'm <mark>an</mark> ${echapper(a.metier.replace(/^a\s+/i, ''))}.`);
  else if (a.metier) morceaux.push(`I'm ${echapper(a.metier)}.`);
  else if (a.erreurMetier) morceaux.push(`I'm <mark>${article(a.erreurMetier)}</mark> ${echapper(a.erreurMetier)}.`);
  else morceaux.push("I'm <mark>a [votre métier]</mark>.");
  if (a.autre) morceaux.push(`I'm ${echapper(a.autre)}.`);
  else if (!a.k.K4) morceaux.push("<mark>I'm happy to be here.</mark>");
  return morceaux.filter(Boolean).join(' ');
}

export async function monter(racine, ctx) {
  const S = ctx.services;
  // Le lecteur n'injecte qu'UNE feuille par type d'activité : commune + propre, en un seul appel.
  ctx.ajouterStyle(CSS_COMMUN + CSS);
  const e = ctx.donnees || {};
  const criteres = (e.verification?.criteres || []).filter((c) => /^K[1-4]$/.test(c.id));
  const k5 = (e.verification?.criteres || []).find((c) => c.id === 'K5');
  const modele = e.modele || {};
  const retours = e.retours || {};
  const dureeMin = (Number(/en dessous de (\d+) secondes/.exec(e.verification?.duree || '')?.[1]) || 4) * 1000;
  const sonModele = await infoSon(ctx, modele.audio);
  const sonMetiers = await infoSon(ctx, e.aide_metier?.audio_liste);
  try { await S.audio.precharger([sonModele?.url, sonMetiers?.url].filter(Boolean)); } catch { /* facultatif */ }
  const blocageInitial = await microBloqueDAvance(ctx);

  let essais = 0;
  let meilleur = 0;
  let modeEcoute = false;
  let enregistreur = null;
  let dernierEnr = null;

  racine.innerHTML = `
    <div class="pro-carte">
      <div class="pro-modele" style="margin-top:0">
        <div class="pro-actions pro-modele-sons"></div>
        <p class="pro-modele-texte" lang="en">${echapper(modele.en || '')}</p>
      </div>
      ${e.aide_metier ? `
      <details class="pro-metiers">
        <summary>${icones.carnet}<span>${echapper(e.aide_metier.titre || 'Votre métier en anglais')}</span></summary>
        <div class="pro-metiers-corps">
          <p class="petit discret">${echapper(e.aide_metier.note || '')}</p>
          <div class="pro-metiers-liste">${(e.aide_metier.liste || []).map((x, i) => `<button type="button" class="pro-metier" data-i="${i}"><b lang="en">${echapper(x.en)}</b> <span>${echapper(String(x.fr).split(' — ')[0])}</span></button>`).join('')}</div>
        </div>
      </details>` : ''}
      <div class="pro-zone-parole">
        <p class="petit discret" style="font-weight:600">Ce que nous allons vérifier :</p>
        <ul class="pro-criteres">${criteres.map((c) => `<li data-k="${c.id}" data-e="attente">${icones.info}<div><b>${echapper(c.nom)}</b><p class="pro-crit-detail" hidden></p></div></li>`).join('')}</ul>
        <div class="pro-enr-parole"></div>
        <p class="pro-vie-privee">Votre voix est envoyée à notre serveur pour être transcrite, puis effacée. Seule la réussite des critères est gardée dans votre suivi.</p>
        <div class="pro-note-parole"></div>
        <div class="pro-res-parole"></div>
        <div class="pro-aide"></div>
      </div>
    </div>`;

  const blocModele = racine.querySelector('.pro-modele');
  racine.querySelector('.pro-modele-sons').append(
    boutonSon({ libelle: 'Écouter Claire', icone: 'ecouter', classe: 'btn-secondaire', disponible: Boolean(sonModele), action: () => { ctx.tracer('audio_ecoute', { item: 'PRO-4-modele' }); return S.audio.jouer(sonModele.url); } }),
  );
  if (!sonModele) racine.querySelector('.pro-modele-sons').insertAdjacentHTML('beforeend', '<span class="petit discret">La voix de Claire est en préparation : lisez son modèle.</span>');

  // Un métier touché : on joue son passage dans le fichier de la liste (d'après les temps des mots).
  racine.querySelectorAll('.pro-metier').forEach((b) => b.addEventListener('click', async () => {
    const x = e.aide_metier.liste[Number(b.dataset.i)];
    if (!sonMetiers) { S.retour.annoncer?.(`${x.en} : ${x.fr}`); return; }
    const cible = x.en.split(/\s+/).map(norm);
    const h = motsHorodates(sonMetiers);
    let debut = -1;
    for (let i = 0; i + cible.length <= h.length; i += 1) {
      if (cible.every((c, k) => memeSon(c, h[i + k].mot))) { debut = i; break; }
    }
    b.classList.add('pro-joue');
    try {
      if (debut >= 0) await jouerExtrait(ctx, sonMetiers.url, h[debut].debut, h[debut + cible.length - 1].fin);
      else S.retour.annoncer?.(`${x.en} : ${x.fr}`);
    } finally { b.classList.remove('pro-joue'); }
  }));

  const zoneNote = racine.querySelector('.pro-note-parole');
  const zoneRes = racine.querySelector('.pro-res-parole');

  const barre = S.aide.barre(ctx, {
    item: () => 'PRO-4',
    surMontrer: () => {
      zoneRes.prepend(retourTypo(S, 'info', "Hello, I'm … . I'm a … . I'm … .", { explication: 'Reprenez les phrases de Claire, et remplacez ses informations par les vôtres.' }));
    },
    surSolution: () => {
      zoneRes.prepend(retourTypo(S, 'reponse', modele.en || '', { explication: 'Le modèle de Claire. Gardez la forme, changez les informations.' }));
      if (sonModele) S.audio.jouer(sonModele.url);
    },
  });
  racine.querySelector('.pro-aide').append(barre.element);

  function montrerMicro(code) {
    const m = messageMicro(code);
    const actions = [];
    if (m.reessayer) actions.push({ libelle: 'Réessayer', icone: 'rejouer', action: () => { zoneNote.replaceChildren(); enregistreur?.demarrer(); } });
    actions.push({ libelle: 'Continuer sans micro', icone: 'ecouter', primaire: !m.reessayer, action: () => { modeEcoute = true; afficherEnregistreur(); } });
    zoneNote.replaceChildren(panneau({ titre: m.titre, texte: m.texte, actions, ton: 'alerte' }));
  }

  function afficherEnregistreur() {
    const zone = racine.querySelector('.pro-enr-parole');
    enregistreur?.detruire();
    zone.replaceChildren();
    if (modeEcoute) {
      zoneNote.replaceChildren();
      zone.append(panneau({
        titre: 'Mode écoute',
        texte: 'Écoutez Claire, puis présentez-vous à voix haute avec vos informations, en suivant les trois étapes. Cette présentation ne sera pas notée.',
        actions: [
          { libelle: 'C’est fait', icone: 'coche', primaire: true, action: () => { ctx.tracer('reponse_donnee', { item: 'PRO-4', juste: null }); ctx.signaler.fin({ score: null, reussi: true, sans_note: true }); zone.querySelector('.pro-panneau p').textContent = typo('Merci. Pensez à refaire cette présentation avec un micro : c’est le meilleur entraînement avant votre première visio.'); } },
          { libelle: 'Réessayer le micro', icone: 'micro', action: () => { modeEcoute = false; afficherEnregistreur(); } },
        ],
      }));
      return;
    }
    enregistreur = creerEnregistreur(ctx, {
      dureeMax: 15000,
      dureeMin,
      finSilence: 3500,
      attenteParole: 7000,
      libelle: essais ? 'Touchez pour recommencer' : 'Touchez et présentez-vous',
      surDebut: () => { blocModele.dataset.masque = ''; zoneNote.replaceChildren(); zoneRes.replaceChildren(); },
      surResultat: (res) => traiter(res),
    });
    zone.append(enregistreur.element);
    if (blocageInitial && !essais) montrerMicro(blocageInitial);
  }

  async function traiter(res) {
    delete blocModele.dataset.masque;
    if (!res.ok && res.micro) { montrerMicro(res.code); return; }
    if (!res.ok) { const m = messageNote(res.code, { dureeMin }); zoneNote.replaceChildren(panneau({ titre: m.titre, texte: m.texte, ton: 'alerte' })); return; }
    dernierEnr = res.enr;
    ctx.tracer('enregistrement_depose', { item: 'PRO-4', duree_s: res.enr.duree_s });
    enregistreur.attente('Transcription en cours…');
    const t = await attendreNote(ctx, zoneNote, () => S.prononciation.transcrire(res.enr.blob));
    if (!racine.isConnected) return;
    enregistreur.pret('Touchez pour recommencer');
    if (res.limite) zoneNote.append(retourTypo(S, 'info', 'Les 15 secondes sont écoulées : l’enregistrement s’est arrêté seul.'));
    if (!t || !t.ok) {
      const code = t?.code || 'indisponible';
      const m = messageNote(code, { dureeMin });
      const actions = code === 'indisponible' ? [{ libelle: 'Renvoyer', icone: 'rejouer', primaire: true, action: () => traiter(res) }] : [];
      zoneNote.replaceChildren(panneau({ titre: m.titre, texte: m.texte, actions, ton: 'alerte' }));
      montrerSons(zoneRes);
      return;
    }
    const compris = nettoyerTranscription(t.texte ?? t.transcription);
    if (!compris) {
      const m = messageNote('non-reconnu');
      zoneNote.replaceChildren(panneau({ titre: m.titre, texte: `${m.texte} Vous pouvez aussi écouter Claire, puis la suivre phrase par phrase.`, ton: 'alerte' }));
      compter({ k: { K1: false, K2: false, K3: false, K4: false, K5: false } }, []);
      montrerSons(zoneRes);
      return;
    }
    const a = analyser(compris, t.mots);
    const manquants = compter(a, criteres.filter((c) => !a.k[c.id]));
    montrerResultat(a, compris, manquants);
  }

  function compter(a, manquants) {
    essais += 1;
    const faits = criteres.filter((c) => a.k[c.id]).length;
    const reussi = criteres.length > 0 && faits === criteres.length;
    meilleur = Math.max(meilleur, criteres.length ? faits / criteres.length : 0);
    const explication = reussi
      ? (retours.juste || 'Présentation complète.')
      : manquants.map((c) => (c.id === 'K3' && a.erreurMetier ? c.erreur_ciblee?.retour || c.si_absent : c.si_absent)).join(' ');
    // Jamais la transcription ici : c'est la vie de l'apprenant (prénom, métier, ville).
    ctx.signaler.essai({
      juste: reussi, item: 'PRO-4', element: 'Présentation orale en trois phrases',
      attendu: criteres.map((c) => c.nom).join(', '),
      donne: `${faits} critère${faits > 1 ? 's' : ''} sur ${criteres.length}${manquants.length ? ` (à revoir : ${manquants.map((c) => c.nom.toLowerCase()).join(', ')})` : ''}`,
      explication, remediation: e.remediation, premier_essai: essais === 1,
    });
    ctx.tracer('reponse_donnee', { item: 'PRO-4', juste: reussi });
    if (!reussi) barre.erreur();
    ctx.signaler.fin({ score: meilleur, reussi: meilleur === 1 });
    return manquants;
  }

  function montrerResultat(a, compris, manquants) {
    zoneNote.replaceChildren();
    for (const c of criteres) {
      const li = racine.querySelector(`.pro-criteres li[data-k="${c.id}"]`);
      if (!li) continue;
      const ok = a.k[c.id];
      li.dataset.e = ok ? 'ok' : 'ko';
      li.firstElementChild.outerHTML = ok ? icones.juste : icones.presque;
      const p = li.querySelector('.pro-crit-detail');
      p.hidden = false;
      p.removeAttribute('lang');
      if (ok) {
        if (c.id === 'K2' && a.prenom) p.textContent = typo(`Prénom compris : ${majuscule(a.prenom)}.`);
        else if (c.id === 'K3' && a.metier) { p.textContent = `I'm ${a.metier}.`; p.setAttribute('lang', 'en'); }
        else if (c.id === 'K4') p.textContent = `${Math.max(a.phrases, Math.min(a.be, 9))} phrases ou formes de be repérées.`;
        else p.textContent = 'Fait.';
      } else if (c.id === 'K3' && a.erreurMetier) {
        p.textContent = typo(c.erreur_ciblee?.retour || c.si_absent);
      } else {
        p.textContent = typo(c.si_absent || '');
      }
    }
    const reussi = criteres.length > 0 && manquants.length === 0;
    const conseils = [];
    if (a.mauvaisArticle) conseils.push(`Devant un son voyelle, on dit an : I'm an ${a.mauvaisArticle}.`);
    if (!a.k.K5 && k5) conseils.push(k5.si_absent);
    zoneRes.innerHTML = `
      <div class="pro-compris-bloc apparait"><span class="petit discret">Voici ce que nous avons compris :</span><q lang="en">${echapper(compris)}</q></div>
      <div class="pro-verdict-parole"></div>
      ${!reussi || conseils.length ? `<div class="pro-proposition apparait"><span class="petit" style="font-weight:700;color:var(--c-parler)">Votre présentation, complétée</span><p lang="en">${proposition(a)}</p><span class="petit discret">Construite à partir de ce que nous avons compris ; ce qui est surligné est ajouté.</span></div>` : ''}
      <div class="pro-sons-parole"></div>`;
    const verdict = zoneRes.querySelector('.pro-verdict-parole');
    if (reussi) verdict.append(retourTypo(S, 'juste', retours.juste || 'Bravo : présentation complète.'));
    else verdict.append(retourTypo(S, 'faux', retours.faux_par_defaut || 'Presque. Regardez ce qui manque, puis recommencez.', { explication: manquants.map((c) => c.nom).join(' · ') }));
    for (const c of conseils) verdict.append(retourTypo(S, 'info', c));
    montrerSons(zoneRes.querySelector('.pro-sons-parole'));
    montrerDansLaVue(zoneRes.querySelector('.pro-compris-bloc'));
    if (reussi) S.sons?.jouer?.('juste');
    S.retour.annoncer?.(reussi ? 'Présentation complète.' : `À compléter : ${manquants.map((c) => c.nom).join(', ')}.`);
  }

  function montrerSons(zone) {
    const box = document.createElement('div');
    box.className = 'pro-actions';
    box.append(
      boutonSon({ libelle: 'Ma présentation', icone: 'micro', disponible: Boolean(dernierEnr), action: () => S.audio.jouer(dernierEnr.url) }),
      boutonSon({ libelle: 'Claire', icone: 'ecouter', disponible: Boolean(sonModele), action: () => S.audio.jouer(sonModele.url) }),
    );
    if (dernierEnr && e.lien_visio) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-fantome';
      b.innerHTML = `${icones.carnet}<span>Garder pour ma visio</span>`;
      b.addEventListener('click', () => {
        ctx.stockage.ecrire('visio', { garde: true, le: new Date().toISOString() });
        ctx.tracer('enregistrement_depose', { item: 'PRO-4-visio' });
        b.replaceWith(retourTypo(S, 'info', 'C’est noté. Dans la formation, votre formateur l’écoutera avant votre première visio. Dans ce prototype, l’enregistrement reste sur cet appareil jusqu’à la fermeture de la page.'));
      });
      box.append(b);
    }
    zone.append(box);
  }

  afficherEnregistreur();
  ctx.signaler.pret();
  return {
    demonter() { enregistreur?.detruire(); barre?.detruire?.(); },
    montrer() { racine.querySelector('.aide-barre [data-aide="montrer"]')?.click(); },
    montrerSolution() { racine.querySelector('.aide-barre [data-aide="solution"]')?.click(); },
  };
}
