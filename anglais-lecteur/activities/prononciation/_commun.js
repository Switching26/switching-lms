// BRIQUES COMMUNES AUX QUATRE ACTIVITÉS D'ORAL — agent B2 (famille « prononciation »).
//
// Ce fichier n'est pas un type d'activité : son nom commence par « _ », le serveur ne le liste pas.
// Il regroupe ce qui doit se comporter pareil partout :
//   · le micro et ses états délicats (refusé, absent, occupé, page non sécurisée) ;
//   · l'enregistreur : vumètre, arrêt automatique après la phrase, trop court, silence ;
//   · l'attente du serveur de note (message si c'est lent, issue sans note) ;
//   · la lecture d'un seul mot dans un fichier modèle, le surlignage mot à mot, la comparaison
//     « le modèle / ma voix » ;
//   · la lecture honnête d'une note : note PAR MOT (mot reconnu ou non), jamais une analyse des sons.
//
// Les services avec un état (audio, micro, voix…) passent TOUJOURS par ctx.services : les importer
// une seconde fois créerait un second lecteur audio que le socle ne saurait pas couper.

import { icones } from '../../services/icones.js';

/** Paliers de D (prononciation.json › note_de_prononciation) : vert ≥ 80, orange 60 à 79, rouge < 60. */
export const SEUILS = { vert: 80, orange: 60 };

/** Toutes mes règles CSS vivent sous l'une de mes quatre racines (contrat §3, règle 4). */
export const RACINES = ':is(.act-prononciation-repeter,.act-prononciation-paires_minimales,.act-prononciation-accent_de_mot,.act-prononciation-prise_de_parole)';

const SEUIL_PAROLE = 0.08;         // niveau (0..1, fourni par le socle) au-dessus duquel on parle
const SEUIL_SILENCE_TOTAL = 0.03;  // niveau maximal d'un enregistrement considéré comme vide

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Texte
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Typographie française : espaces insécables dans « … » et avant : ; ? ! (pas de guillemet orphelin). */
export function typo(s) {
  return String(s ?? '').replace(/«\s+/g, '«\u00a0').replace(/\s+»/g, '\u00a0»').replace(/\s+([:;?!])(?=\s|$)/g, '\u00a0$1');
}

export function echapper(s) {
  return typo(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Un mot comparable : minuscules, apostrophes droites, sans ponctuation autour. */
export function norm(m) {
  return String(m ?? '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '').replace(/^'+|'+$/g, '');
}

/** Découpe une phrase en jetons d'affichage : mots, ponctuation, espaces. */
export function jetons(phrase) {
  const out = [];
  const re = /([A-Za-z0-9][A-Za-z0-9’'-]*)|(\s+)|([^A-Za-z0-9\s]+)/g;
  let m;
  while ((m = re.exec(String(phrase || '')))) {
    if (m[1]) out.push({ type: 'mot', brut: m[1], mot: norm(m[1]) });
    else if (m[2]) out.push({ type: 'espace', brut: ' ' });
    else out.push({ type: 'ponct', brut: m[3] });
  }
  return out;
}

// Même son, autre orthographe : la reconnaissance écrit le mot le plus probable, pas forcément le
// nôtre. « there » pour « they're » n'est PAS une faute de prononciation (demande D7 au socle).
const HOMOPHONES = [
  ["they're", 'there', 'their'], ['here', 'hear'], ['meet', 'meat'], ['be', 'bee'], ['to', 'too', 'two'],
  ['new', 'knew'], ['i', 'eye'], ['hi', 'high'], ["you're", 'your'], ["it's", 'its'], ['see', 'sea'],
  ['for', 'four'], ['no', 'know'], ['by', 'buy', 'bye'], ['right', 'write'], ['week', 'weak'], ['wear', 'where'],
];
const CARTE_HOMO = new Map();
for (const g of HOMOPHONES) for (const m of g) CARTE_HOMO.set(m, g[0]);

/** Orthographe britannique → américaine (la reconnaissance a appris l'américain : demande D1). */
function ortho(m) {
  let x = m.replace(/is(e|es|ed|ing|er|ers)$/, 'iz$1').replace(/isation(s?)$/, 'ization$1');
  if (x.length > 4) x = x.replace(/our(s?)$/, 'or$1').replace(/tre(s?)$/, 'ter$1').replace(/mme(s?)$/, 'm$1');
  return x;
}

/** Vrai si deux écritures correspondent au même mot prononcé. */
export function memeSon(a, b) {
  const x = norm(a); const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if ((CARTE_HOMO.get(x) || x) === (CARTE_HOMO.get(y) || y)) return true;
  return ortho(x) === ortho(y);
}

// Annotations que la reconnaissance écrit à la place de la parole (demande D2).
const ANNOTATION = /\[[^\]]*\]|\((?:[^)]*(?:speak|foreign|music|silence|blank|inaudible|laugh|noise|applause)[^)]*)\)|\*[^*]*\*/gi;

/** Transcription affichable : annotations retirées. Chaîne vide s'il ne reste rien. */
export function nettoyerTranscription(t) {
  return String(t || '').replace(ANNOTATION, ' ').replace(/\s+/g, ' ').trim();
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Diagnostic d'un mot raté : ce que la transcription laisse deviner, dit avec prudence
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Phrase courte qui dit ce que l'on a entendu et, si un schéma connu se dessine, le son en jeu.
 * Toujours au conditionnel de prudence : la machine compare des mots, pas des sons.
 */
export function diagnostic(attendu, entendu) {
  const a = norm(attendu);
  const e = norm(entendu);
  if (!a) return null;
  if (!e) return { son: null, texte: `« ${attendu} » n'a pas été entendu : il a peut-être été avalé, ou dit trop bas.` };
  if (memeSon(a, e)) return null;
  const vu = String(entendu).replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
  const dit = `On a entendu « ${vu} » au lieu de « ${attendu} »`;
  if (a.startsWith('h') && !e.startsWith('h') && (/^[aeiouy]/.test(e) || e === a.slice(1))) {
    return { son: 'h', texte: `${dit} : le h du début ne s'est sans doute pas entendu.` };
  }
  if (a.startsWith('th') && !e.startsWith('th') && /^[dzstfv]/.test(e)) {
    const r = e[0];
    return { son: 'th', texte: `${dit} : le th a probablement été dit comme un ${r}.` };
  }
  if (/(ee|ea|e's)/.test(a) && /i/.test(e) && !/(ee|ea|e's)/.test(e) && e[0] === a[0]) {
    return { son: 'i-long', texte: `${dit} : le i était sans doute trop court.` };
  }
  if (a === 'work' && e === 'walk') return { son: 'work', texte: `${dit} : la voyelle de work ressemblait à un « o ».` };
  if (/'s$/.test(a) && (e === a.slice(0, -2) || !/s$/.test(e))) {
    return { son: 'z', texte: `${dit} : la fin en z ne s'est sans doute pas entendue.` };
  }
  if (a.startsWith(e) && e.length < a.length) return { son: 'fin', texte: `${dit} : la fin du mot a peut-être été avalée.` };
  return { son: null, texte: `${dit}.` };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Lecture d'une note du socle
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Le niveau d'un mot noté : 'vert' | 'orange' | 'rouge' | 'absent' (+ drapeau même son). */
export function niveauMot(m) {
  if (!m || m.statut === 'absent' || (!m.entendu && m.statut !== 'juste')) return { niveau: 'absent', memeSon: false };
  if (m.entendu && norm(m.entendu) !== norm(m.attendu) && memeSon(m.attendu, m.entendu)) return { niveau: 'vert', memeSon: true };
  if (m.statut === 'faux') return { niveau: 'rouge', memeSon: false };
  const note = typeof m.note === 'number' ? m.note : m.statut === 'juste' ? 90 : m.statut === 'approche' ? 70 : 0;
  return { niveau: note >= SEUILS.vert ? 'vert' : note >= SEUILS.orange ? 'orange' : 'rouge', memeSon: false };
}

/**
 * Relit la réponse de prononciation.noter avec les règles de D :
 * réussite = tous les mots clés en vert ou orange, et complétude d'au moins 80.
 */
export function lireNote(r, motsCles = []) {
  const cles = new Set(motsCles.map(norm));
  const mots = (Array.isArray(r?.mots) ? r.mots : []).map((m) => {
    const n = niveauMot(m);
    return { ...m, niveau: n.niveau, memeSon: n.memeSon, cle: cles.has(norm(m.attendu)) };
  });
  // Un mot absent collé au précédent (« new here » entendu « newer ») : typique d'un h muet ou d'une liaison.
  mots.forEach((m, i) => {
    const p = mots[i - 1];
    if (m.niveau !== 'absent' || !p || !p.entendu) return;
    const pe = norm(p.entendu); const pa = norm(p.attendu);
    if (pe.length > pa.length && pe.startsWith(pa.slice(0, Math.max(2, pa.length - 1)))) m.colle = { avec: p.attendu, entendu: p.entendu.replace(/[^A-Za-z0-9' ]+/g, '') };
  });
  const bons = mots.filter((m) => m.niveau === 'vert' || m.niveau === 'orange').length;
  const motsClesVus = mots.filter((m) => m.cle);
  const clesBons = motsClesVus.filter((m) => m.niveau === 'vert' || m.niveau === 'orange').length;
  // Complétude recalculée avec « même son » : sinon un homophone ferait échouer une phrase juste.
  const completude = mots.length ? Math.round((bons / mots.length) * 100) : Number(r?.notes?.completude) || 0;
  const reussi = mots.length > 0 && clesBons === motsClesVus.length && completude >= 80;
  const ordre = { absent: 0, rouge: 1, orange: 2, vert: 3 };
  const cibles = mots.filter((m) => m.niveau !== 'vert')
    .sort((x, y) => (Number(y.cle) - Number(x.cle)) || (ordre[x.niveau] - ordre[y.niveau]));
  return { mots, bons, total: mots.length, clesBons, clesTotal: motsClesVus.length, completude, reussi, cible: cibles[0] || null };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Micro : états délicats, avec une issue pour chacun
// ────────────────────────────────────────────────────────────────────────────────────────────────

function plateforme() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'ordinateur';
}

const COMMENT_AUTORISER = {
  ios: 'Sur iPhone : touchez « aA » à gauche de l’adresse, puis « Réglages du site web », puis « Micro » → « Autoriser ». Revenez ensuite ici.',
  android: 'Sur Android : touchez le cadenas à gauche de l’adresse, puis « Autorisations » → « Micro » → « Autoriser ». Revenez ensuite ici.',
  ordinateur: 'Sur ordinateur : cliquez sur l’icône à gauche de l’adresse, autorisez le micro, puis rechargez la page si besoin.',
};

/** Message et issues pour chaque problème de micro. */
export function messageMicro(code) {
  switch (code) {
    case 'refuse': return { titre: 'Le micro est refusé', texte: `Votre navigateur n’autorise pas le micro pour ce site. ${COMMENT_AUTORISER[plateforme()]}`, reessayer: true };
    case 'absent': return { titre: 'Aucun micro trouvé', texte: 'Cet appareil ne présente aucun micro. Branchez un casque avec micro, ou continuez en mode écoute : vous répéterez à voix haute sans être noté.', reessayer: true };
    case 'occupe': return { titre: 'Le micro est déjà utilisé', texte: 'Une autre application se sert du micro (appel, visio, dictaphone). Fermez-la, puis réessayez.', reessayer: true };
    case 'non-securise': return { titre: 'Micro impossible sur cette adresse', texte: 'Le navigateur ne permet le micro que sur une adresse sécurisée (https). Ouvrez le prototype par son adresse https, ou continuez en mode écoute.', reessayer: false };
    case 'non-supporte': return { titre: 'Ce navigateur n’enregistre pas le son', texte: 'Mettez à jour Safari ou Chrome, ou continuez en mode écoute.', reessayer: false };
    default: return { titre: 'Le micro ne répond pas', texte: 'Débranchez puis rebranchez votre casque, ou rechargez la page. Vous pouvez aussi continuer en mode écoute.', reessayer: true };
  }
}

/** Message pour un enregistrement refusé par l'activité ou par le serveur de note. */
export function messageNote(code, contexte = {}) {
  const min = contexte.dureeMin ? Math.round(contexte.dureeMin / 1000) : 0;
  switch (code) {
    case 'trop-court': if (contexte.mot) return { titre: 'La machine n’a presque rien entendu', texte: 'Redites le mot un peu plus fort, bien détaché, près du micro. S’il est refusé encore, comparez-vous au modèle à l’oreille.' };
      return min >= 2
      ? { titre: 'Un peu court', texte: `Parlez au moins ${min} secondes : dites vos trois phrases d’affilée, puis touchez « Terminer ».` }
      : { titre: 'Enregistrement trop court', texte: 'Touchez le micro, dites toute la phrase, puis attendez : l’enregistrement s’arrête seul quand vous vous taisez.' };
    case 'trop-long': return { titre: 'Enregistrement trop long', texte: 'La note accepte 15 secondes au plus. Dites seulement la phrase demandée, puis touchez « Terminer ».' };
    case 'silence': return { titre: 'Nous n’avons rien entendu', texte: 'Vérifiez que le micro n’est pas coupé, rapprochez-vous de l’appareil et parlez à voix normale.' };
    case 'non-reconnu': return { titre: 'Aucun mot anglais reconnu', texte: 'Écoutez le modèle au ralenti, puis répétez en articulant chaque mot. Parler un peu plus lentement aide beaucoup.' };
    case 'format': return { titre: 'Enregistrement illisible', texte: 'Ce navigateur a produit un fichier que le serveur ne sait pas lire. Réessayez ; si cela recommence, utilisez Safari ou Chrome à jour.' };
    case 'abandon': return { titre: 'Note non attendue', texte: 'Vous avez continué sans attendre la note. Réécoutez-vous et comparez avec le modèle : votre oreille reste un très bon juge.' };
    default: return { titre: 'La note n’est pas disponible', texte: 'Le serveur de note ne répond pas pour le moment. Vous pouvez quand même vous réécouter et vous comparer au modèle, puis réessayer.' };
  }
}

/** Encart de problème, avec ses boutons d'issue. actions : [{ libelle, icone, primaire, action }]. */
export function panneau({ titre, texte, actions = [], ton = 'info' }) {
  const el = document.createElement('div');
  el.className = `pro-panneau pro-panneau-${ton} apparait`;
  el.setAttribute('role', ton === 'alerte' ? 'alert' : 'status');
  el.innerHTML = `
    <div class="pro-panneau-tete">${ton === 'alerte' ? icones.presque : icones.info}<b>${echapper(titre)}</b></div>
    <p>${echapper(texte)}</p>
    <div class="pro-actions"></div>`;
  const zone = el.querySelector('.pro-actions');
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${a.primaire ? 'btn-primaire' : 'btn-secondaire'}`;
    b.innerHTML = `${a.icone ? icones[a.icone] || '' : ''}<span>${echapper(a.libelle)}</span>`;
    b.addEventListener('click', a.action);
    zone.append(b);
  }
  if (!actions.length) zone.remove();
  return el;
}

/** État du micro connu d'avance (permission déjà refusée), sans rien demander à l'apprenant. */
export async function microBloqueDAvance(ctx) {
  const d = ctx.services.micro.disponible();
  if (!d.ok) return d.raison;
  try {
    const p = await navigator.permissions?.query?.({ name: 'microphone' });
    if (p && p.state === 'denied') return 'refuse';
  } catch { /* Safari ancien : on saura au premier essai */ }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// L'enregistreur
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Un gros bouton micro avec vumètre et barre de temps.
 * opts : { dureeMax, dureeMin, finSilence, attenteParole, libelle, surDebut(), surResultat(res) }
 * res : { ok: true, enr, limite } · { ok: false, code, micro: true|false }
 * Toucher pendant l'enregistrement le termine. Il s'arrête aussi seul, après la phrase (silence),
 * ou au bout de dureeMax.
 */
export function creerEnregistreur(ctx, opts = {}) {
  const S = ctx.services;
  const o = { dureeMax: 8000, dureeMin: 600, finSilence: 1500, attenteParole: 6000, libelle: 'Touchez pour parler', ...opts };
  const el = document.createElement('div');
  el.className = 'pro-enr';
  el.dataset.etat = 'pret';
  el.innerHTML = `
    <button type="button" class="pro-enr-btn">
      <span class="pro-enr-anneau" aria-hidden="true"></span>
      <span class="pro-enr-ico pro-enr-ico-micro">${icones.micro}</span>
      <span class="pro-enr-ico pro-enr-ico-stop">${icones.stop}</span>
    </button>
    <div class="pro-enr-texte">
      <span class="pro-enr-libelle"></span>
      <span class="pro-enr-temps" aria-hidden="true"><span></span></span>
    </div>`;
  const btn = el.querySelector('.pro-enr-btn');
  const lib = el.querySelector('.pro-enr-libelle');
  const barre = el.querySelector('.pro-enr-temps > span');
  let etat = 'pret';
  let prise = null;
  let arretDemande = null;
  let raf = 0;
  let t0 = 0;
  let detruit = false;

  function poser(e, texte) {
    etat = e;
    el.dataset.etat = e;
    lib.textContent = typo(texte);
    btn.setAttribute('aria-label', texte);
    btn.disabled = e === 'ouverture' || e === 'attente' || e === 'inactif';
  }
  poser('pret', o.libelle);

  function arreter(raison) {
    if (!prise || arretDemande) return;
    arretDemande = raison;
    prise.arreter();
  }

  async function demarrer() {
    if (etat !== 'pret' || detruit) return;
    try { S.guide?.arreter?.(); S.audio.arreter('media'); } catch { /* rien */ }
    poser('ouverture', 'Autorisation du micro…');
    try {
      await S.micro.ouvrir();
    } catch (e) {
      if (detruit) return;
      poser('pret', o.libelle);
      o.surResultat?.({ ok: false, code: e?.code || 'inconnu', micro: true });
      return;
    }
    if (detruit) return;
    arretDemande = null;
    let debutParole = 0; let derniereParole = 0; let niveauVu = false; let maxNiveau = 0; let lisse = 0;
    t0 = performance.now();
    try {
      prise = S.micro.enregistrer({
        dureeMax: o.dureeMax,
        surNiveau: (v) => {
          const t = performance.now() - t0;
          if (v > 0.0005) niveauVu = true;
          if (v > maxNiveau) maxNiveau = v;
          lisse = lisse * 0.65 + v * 0.35;
          el.style.setProperty('--niveau', Math.min(1, lisse * 1.6).toFixed(3));
          if (v >= SEUIL_PAROLE) { if (!debutParole) debutParole = t; derniereParole = t; }
          if (debutParole && t - debutParole > 300 && t - derniereParole > o.finSilence) arreter('fin-parole');
          else if (!debutParole && niveauVu && t > o.attenteParole) arreter('silence');
        },
      });
    } catch (e) {
      poser('pret', o.libelle);
      o.surResultat?.({ ok: false, code: e?.code || 'inconnu', micro: true });
      return;
    }
    poser('enregistre', 'Parlez… touchez pour terminer');
    o.surDebut?.();
    const boucle = () => {
      const p = Math.min(1, (performance.now() - t0) / o.dureeMax);
      barre.style.width = `${(p * 100).toFixed(1)}%`;
      if (etat === 'enregistre') raf = requestAnimationFrame(boucle);
    };
    raf = requestAnimationFrame(boucle);

    const enr = await prise.fin;
    cancelAnimationFrame(raf);
    prise = null;
    el.style.setProperty('--niveau', '0');
    barre.style.width = '0%';
    if (detruit) return;
    if (!enr) { poser('pret', o.libelle); return; }
    const dureeMs = (enr.duree_s || 0) * 1000;
    // Copie à nous de l'URL de réécoute : celle du socle disparaît si le micro est refermé.
    const url = URL.createObjectURL(enr.blob);
    ctx.surDemontage(() => URL.revokeObjectURL(url));
    const enregistrement = { ...enr, url };
    poser('pret', o.libelleApres || o.libelle);
    if (arretDemande === 'silence' || (niveauVu && maxNiveau < SEUIL_SILENCE_TOTAL)) {
      o.surResultat?.({ ok: false, code: 'silence', micro: false, enr: enregistrement });
    } else if (dureeMs < o.dureeMin) {
      o.surResultat?.({ ok: false, code: 'trop-court', micro: false, enr: enregistrement });
    } else {
      o.surResultat?.({ ok: true, enr: enregistrement, limite: arretDemande === null, dureeMs });
    }
  }

  btn.addEventListener('click', () => {
    if (etat === 'enregistre') arreter('bouton');
    else demarrer();
  });

  return {
    element: el,
    demarrer,
    arreter: () => arreter('bouton'),
    attente(texte = 'Analyse de votre voix…') { poser('attente', texte); },
    inactif(texte) { poser('inactif', texte); },
    pret(texte) { if (texte) o.libelleApres = texte; poser('pret', texte || o.libelleApres || o.libelle); },
    get etat() { return etat; },
    detruire() { detruit = true; cancelAnimationFrame(raf); if (prise) { try { prise.annuler(); } catch { /* rien */ } } },
  };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Attente du serveur de note
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lance `appel()` (une promesse de prononciation.noter / transcrire) en affichant l'attente dans
 * `zone`. Après `lentApres` ms, dit que c'est lent et propose de continuer sans note.
 * Rend la réponse du serveur, ou { ok: false, code: 'abandon' | 'indisponible' }.
 */
export function attendreNote(ctx, zone, appel, { lentApres = 3500 } = {}) {
  return new Promise((resoudre) => {
    let fini = false;
    const boite = document.createElement('div');
    boite.className = 'pro-attente';
    boite.setAttribute('role', 'status');
    boite.innerHTML = '<span class="pro-points" aria-hidden="true"><i></i><i></i><i></i></span><span class="pro-attente-texte">Analyse de votre voix…</span>';
    zone.replaceChildren(boite);
    const t0 = performance.now();
    const fin = (r) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      boite.remove();
      if (r && typeof r === 'object' && r.latence_client_ms === undefined) r.latence_client_ms = Math.round(performance.now() - t0);
      resoudre(r);
    };
    const minuteur = setTimeout(() => {
      if (fini) return;
      boite.querySelector('.pro-attente-texte').textContent = 'C’est plus long que d’habitude : le serveur de note est occupé.';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-fantome';
      b.textContent = 'Continuer sans note';
      b.addEventListener('click', () => fin({ ok: false, code: 'abandon' }));
      boite.append(b);
    }, lentApres);
    ctx.surDemontage(() => { fini = true; clearTimeout(minuteur); });
    Promise.resolve().then(appel).then(fin, () => fin({ ok: false, code: 'indisponible' }));
  });
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Sons : un mot seul dans un fichier, surlignage mot à mot, comparaison modèle / ma voix
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Mots horodatés du manifeste, fusionnés (« I » + « 'm » → « I'm »). */
export function motsHorodates(info) {
  const out = [];
  for (const m of info?.mots || []) {
    const t = String(m.mot || m.texte || '').trim();
    if (!t) continue;
    if (/^['’]/.test(t) && out.length) { const p = out[out.length - 1]; p.mot += t; p.fin = m.fin; continue; }
    out.push({ mot: t, debut: Number(m.debut) || 0, fin: Number(m.fin) || 0 });
  }
  return out;
}

/** Associe à chaque mot affiché (liste de mots normalisés) ses temps dans le fichier, ou null. */
export function alignerTemps(motsAffiches, info) {
  const h = motsHorodates(info);
  const res = motsAffiches.map(() => null);
  let j = 0;
  for (let i = 0; i < motsAffiches.length; i += 1) {
    for (let k = j; k < Math.min(h.length, j + 3); k += 1) {
      if (memeSon(motsAffiches[i], h[k].mot)) { res[i] = h[k]; j = k + 1; break; }
    }
  }
  return res;
}

/** Joue un extrait [debut, fin] (secondes) d'une URL : un mot de l'enregistrement de l'apprenant. */
export async function jouerExtrait(ctx, url, debut, fin, { vitesse = 1 } = {}) {
  const S = ctx.services;
  if (!url || !(fin > debut)) return 'absent';
  let coupe = false;
  const r = await S.audio.jouer(url, {
    vitesse,
    depuis: Math.max(0, debut - 0.08),
    surTemps: (t) => { if (!coupe && t >= fin + 0.12) { coupe = true; S.audio.arreter('media'); } },
  });
  return coupe ? 'fin' : r;
}

/** Joue un seul mot d'un fichier modèle (d'après ses temps). Sans temps : le fichier entier. */
export async function jouerMot(ctx, info, mot, { vitesse = 1 } = {}) {
  const S = ctx.services;
  if (!info) return 'absent';
  const h = motsHorodates(info).find((x) => memeSon(x.mot, mot));
  if (!h || !(h.fin > h.debut)) return S.audio.jouer(info.url, { vitesse });
  const fin = h.fin + 0.12;
  let coupe = false;
  const r = await S.audio.jouer(info.url, {
    vitesse,
    depuis: Math.max(0, h.debut - 0.06),
    surTemps: (t) => { if (!coupe && t >= fin) { coupe = true; S.audio.arreter('media'); } },
  });
  return coupe ? 'fin' : r;
}

/** Joue un fichier en allumant les mots affichés au moment où ils sont dits. */
export async function jouerSurligne(ctx, info, elementsMots, motsNorm, { vitesse = 1, classe = 'pro-dit' } = {}) {
  const S = ctx.services;
  if (!info) return 'absent';
  const temps = alignerTemps(motsNorm, info);
  const nettoyer = () => elementsMots.forEach((e) => e.classList.remove(classe));
  nettoyer();
  const r = await S.audio.jouer(info.url, {
    vitesse,
    surTemps: (t) => {
      elementsMots.forEach((e, i) => {
        const tm = temps[i];
        e.classList.toggle(classe, Boolean(tm && t >= tm.debut - 0.03 && t <= tm.fin + 0.05));
      });
    },
  });
  nettoyer();
  return r;
}

/** Joue plusieurs URL à la suite ; s'arrête si l'apprenant coupe. */
export async function jouerALaSuite(ctx, urls, { pause = 350 } = {}) {
  for (let i = 0; i < urls.length; i += 1) {
    if (!urls[i]) continue;
    const r = await ctx.services.audio.jouer(urls[i]);
    if (r !== 'fin') return r;
    if (i < urls.length - 1) await new Promise((ok) => { const t = setTimeout(ok, pause); ctx.surDemontage(() => clearTimeout(t)); });
  }
  return 'fin';
}

/** Bouton d'écoute : icône + libellé ; désactivé avec une mention si le son n'existe pas. */
export function boutonSon({ libelle, icone = 'ecouter', classe = 'btn-secondaire', disponible = true, action }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${classe} pro-btn-son`;
  b.innerHTML = `${icones[icone] || ''}<span>${echapper(libelle)}</span>`;
  if (!disponible) { b.disabled = true; b.title = ''; b.setAttribute('aria-label', `${libelle} (son en préparation)`); }
  b.addEventListener('click', async () => {
    b.classList.add('pro-joue');
    try { await action(); } finally { b.classList.remove('pro-joue'); }
  });
  return b;
}

/** Durée de parole d'un fichier (du premier au dernier mot horodaté), sinon durée du fichier. */
function dureeParole(info) {
  const m = motsHorodates(info);
  if (m.length && m[m.length - 1].fin > m[0].debut) return m[m.length - 1].fin - m[0].debut;
  return Number(info?.duree_s) || 0;
}

/**
 * La version « lente » produite par la voix est-elle vraiment plus lente ? Mesuré le 30/09 : pas toujours
 * (« Nice to meet you » lent : 0,73 s de parole contre 1,15 s au débit normal). Sinon on ralentit le normal.
 */
export function lentUtile(normal, lent) {
  if (!lent) return false;
  if (!normal) return true;
  const n = dureeParole(normal); const l = dureeParole(lent);
  return n > 0 && l / n >= 1.2;
}
export const VITESSE_LENTE = 0.7;

/** Amène un résultat dans la vue (il apparaît sous le micro, souvent caché derrière le pied du lecteur). */
export function montrerDansLaVue(el) {
  if (!el || !el.scrollIntoView) return;
  const doux = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => { try { el.scrollIntoView({ block: 'nearest', behavior: doux ? 'smooth' : 'auto' }); } catch { /* rien */ } });
}

/** Charge le manifeste des voix puis rend l'info d'un segment (ou null). */
export async function infoSon(ctx, segmentOuId) {
  const S = ctx.services;
  try { await S.voix.pret(); } catch { return null; }
  const id = typeof segmentOuId === 'string' ? segmentOuId : segmentOuId?.id || segmentOuId?.ref;
  return id ? S.voix.info(id) : null;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Styles communs
// ────────────────────────────────────────────────────────────────────────────────────────────────

const R = RACINES;
export const CSS_COMMUN = `
${R} { --pro-vert: var(--juste-fonce); --pro-vert-fond: var(--juste-voile); --pro-vert-bord: var(--juste-bord);
  --pro-orange: #8A5A12; --pro-orange-fond: #FBF3E4; --pro-orange-bord: #EBD3A6;
  --pro-rouge: var(--faux-fonce); --pro-rouge-fond: var(--faux-voile); --pro-rouge-bord: var(--faux-bord);
  display: block; max-width: var(--largeur-lecture); margin: 0; } /* même colonne que la consigne du lecteur */
${R} .pro-carte { background: var(--surface); border: 1px solid var(--filet); border-radius: var(--rayon-carte); box-shadow: var(--ombre-carte); padding: 20px; }
@media (min-width: 768px) { ${R} .pro-carte { padding: 28px 32px; } }
${R} .pro-compteur { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
${R} .pro-compteur .petit { color: var(--encre-50); font-weight: 600; }
${R} .pro-points-etapes { display: flex; gap: 6px; flex-wrap: wrap; }
${R} .pro-points-etapes i { width: 8px; height: 8px; border-radius: 99px; background: var(--filet-fort); }
${R} .pro-points-etapes i[data-e="fait"] { background: var(--juste); }
${R} .pro-points-etapes i[data-e="rate"] { background: var(--encre-30); }
${R} .pro-points-etapes i[data-e="courant"] { background: var(--marque); width: 20px; }
${R} .pro-actions { display: flex; flex-wrap: wrap; gap: 10px; }
${R} .pro-actions:empty { display: none; }
${R} .pro-btn-son.pro-joue { border-color: var(--marque-voile-bord); color: var(--marque-fonce); background: var(--marque-voile); }
${R} .pro-sep { height: 1px; background: var(--filet); margin: 20px 0; border: 0; }
${R} .pro-res, ${R} .pro-focus, ${R} .pro-dire-note, ${R} .pro-auto, ${R} .pro-res-parole, ${R} .pro-panneau { scroll-margin-top: 96px; scroll-margin-bottom: 120px; }

/* Enregistreur */
${R} .pro-enr { --niveau: 0; display: flex; align-items: center; gap: 16px; }
${R} .pro-enr-btn { position: relative; flex: none; width: 72px; height: 72px; border-radius: 999px; border: 0;
  background: var(--marque); color: #fff; cursor: pointer; display: grid; place-items: center;
  box-shadow: 0 6px 18px rgba(27,42,74,0.28); transition: transform .2s var(--ressort), background-color .15s; }
${R} .pro-enr-btn:hover:not(:disabled) { background: var(--marque-fonce); }
${R} .pro-enr-btn:active:not(:disabled) { transform: scale(0.96); }
${R} .pro-enr-btn:disabled { background: var(--encre-30); box-shadow: none; cursor: not-allowed; }
${R} .pro-enr-btn svg { width: 28px; height: 28px; position: relative; z-index: 1; }
${R} .pro-enr-anneau { position: absolute; inset: 0; border-radius: inherit; background: var(--marque-voile-bord);
  transform: scale(calc(1 + var(--niveau) * 0.42)); opacity: 0; transition: transform .08s linear, opacity .2s; z-index: 0; }
${R} .pro-enr[data-etat="enregistre"] .pro-enr-anneau { opacity: .75; }
${R} .pro-enr[data-etat="enregistre"] .pro-enr-btn { background: var(--marque-tres-fonce); }
${R} .pro-enr-ico { display: grid; place-items: center; }
${R} .pro-enr-ico-stop { display: none; }
${R} .pro-enr[data-etat="enregistre"] .pro-enr-ico-micro { display: none; }
${R} .pro-enr[data-etat="enregistre"] .pro-enr-ico-stop { display: grid; }
${R} .pro-enr-texte { display: flex; flex-direction: column; gap: 8px; min-width: 0; flex: 1; }
${R} .pro-enr-libelle { font-weight: 600; color: var(--encre-70); }
${R} .pro-enr[data-etat="enregistre"] .pro-enr-libelle { color: var(--marque-tres-fonce); }
${R} .pro-enr-temps { display: block; height: 4px; border-radius: 99px; background: var(--filet); overflow: hidden; visibility: hidden; max-width: 220px; }
${R} .pro-enr[data-etat="enregistre"] .pro-enr-temps { visibility: visible; }
${R} .pro-enr-temps > span { display: block; height: 100%; width: 0; background: var(--marque); border-radius: 99px; }

/* Attente */
${R} .pro-attente { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px; color: var(--encre-70); font-weight: 500; padding: 10px 0; }
${R} .pro-points { display: inline-flex; gap: 5px; }
${R} .pro-points i { width: 7px; height: 7px; border-radius: 99px; background: var(--marque); animation: pro-point 1.1s infinite ease-in-out both; }
${R} .pro-points i:nth-child(2) { animation-delay: .15s; } ${R} .pro-points i:nth-child(3) { animation-delay: .3s; }
@keyframes pro-point { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { ${R} .pro-points i { animation: none; opacity: .7; } }

/* Panneaux de problème */
${R} .pro-panneau { border-radius: var(--rayon-bloc); border: 1px solid var(--marque-voile-bord); background: var(--marque-voile); color: var(--marque-tres-fonce); padding: 14px 16px; display: grid; gap: 8px; }
${R} .pro-panneau-alerte { border-color: var(--pro-orange-bord); background: var(--pro-orange-fond); color: var(--pro-orange); }
${R} .pro-panneau-tete { display: flex; align-items: center; gap: 8px; }
${R} .pro-panneau-tete svg { width: 20px; height: 20px; flex: none; }
${R} .pro-panneau p { color: var(--encre-70); font-size: .95rem; }
${R} .pro-panneau .pro-actions { margin-top: 4px; }

/* Mots notés */
${R} .pro-phrase { font-size: clamp(1.3rem, 1.1rem + 1vw, 1.7rem); font-weight: 600; line-height: 1.5; color: var(--encre); letter-spacing: -0.005em; }
${R} .pro-mot { border-radius: 8px; padding: 0 3px; margin: 0 -3px; transition: background-color .15s, color .15s; }
${R} .pro-mot.pro-cle { color: var(--c-parler); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 5px; text-decoration-color: color-mix(in srgb, var(--c-parler) 45%, transparent); }
${R} .pro-mot.pro-dit { background: var(--marque-voile); color: var(--marque-tres-fonce); }
${R} .pro-mot[data-niveau] { text-decoration: none; }
${R} .pro-mot[data-niveau="vert"] { background: var(--pro-vert-fond); color: var(--pro-vert); box-shadow: inset 0 -2px 0 var(--pro-vert-bord); }
${R} .pro-mot[data-niveau="orange"] { background: var(--pro-orange-fond); color: var(--pro-orange); box-shadow: inset 0 -2px 0 var(--pro-orange-bord); }
${R} .pro-mot[data-niveau="rouge"], ${R} .pro-mot[data-niveau="absent"] { background: var(--pro-rouge-fond); color: var(--pro-rouge); box-shadow: inset 0 -2px 0 var(--pro-rouge-bord); }
${R} .pro-mot[data-niveau="absent"] { text-decoration: line-through; text-decoration-thickness: 1.5px; }
${R} .pro-legende { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: .8125rem; color: var(--encre-50); }
${R} .pro-legende span { display: inline-flex; align-items: center; gap: 6px; }
${R} .pro-legende i { width: 10px; height: 10px; border-radius: 3px; }
${R} .pro-legende i[data-n="vert"] { background: var(--juste); } ${R} .pro-legende i[data-n="orange"] { background: #C98A1E; } ${R} .pro-legende i[data-n="rouge"] { background: var(--faux); }
${R} .pro-honnete { display: flex; gap: 8px; align-items: flex-start; font-size: .8125rem; color: var(--encre-50); line-height: 1.45; }
${R} .pro-honnete svg { width: 16px; height: 16px; flex: none; margin-top: 2px; }
`;
