// Dictée courte (ECO-3) — agent B1.
// On écoute (normal ou lent), on écrit, on valide. Correction mot par mot : les mots justes en vert, les
// autres soulignés, avec l'explication ciblée du script. Verdicts de D : juste, presque (forme longue,
// virgule, une faute de frappe sur un mot long), faux. Le correcteur du téléphone est coupé : il écrirait
// à la place de l'apprenant.

import { ICONES, echapper, decouperMots, estFormeDeBe, distance, retourTypo, typo } from '../video/_commun.js';
import { CSS_ECOUTE, RACINES, infoSon, boutonEcoute, pastilles, carteFin } from './_ecoute.js';

export const meta = { titre: 'Dictée courte', entete: true };

// Mots où une lettre change le sens : jamais « presque » (SCHEMA §3).
const PROTEGES = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'am', 'is', 'are', 'his', 'her', 'its', "i'm", "you're", "he's", "she's", "it's", "we're", "they're", 'a', 'an', 'the', 'there', 'their', 'your']);
const LONGUES = [[/\bi'm\b/g, 'i am'], [/\byou're\b/g, 'you are'], [/\bhe's\b/g, 'he is'], [/\bshe's\b/g, 'she is'], [/\bit's\b/g, 'it is'], [/\bwe're\b/g, 'we are'], [/\bthey're\b/g, 'they are']];

/** Forme de comparaison : casse, apostrophes et ponctuation finale neutralisées (tolérance de D). */
export function forme(t) {
  return String(t || '').trim().replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').replace(/[\s.!?…]+$/g, '').toLowerCase();
}
const jetons = (t) => forme(t).replace(/[,;:"«»()]/g, ' ').split(/\s+/).filter(Boolean);
const enLongue = (t) => LONGUES.reduce((s, [re, r]) => s.replace(re, r), forme(t));

/** Verdict d'une saisie : { verdict: 'juste'|'presque'|'faux'|'vide', message?, correction? }. */
export function juger(saisie, item, tolerance = {}) {
  const f = forme(saisie);
  if (!f) return { verdict: 'vide' };
  const attendues = [...(item.reponse?.attendues || []), ...(item.reponse?.variantes || [])];
  const presques = item.reponse?.variantes_presque || [];
  if (attendues.some((a) => forme(a) === f)) {
    if (item.reponse?.tolerance?.casse === false) {
      const casse = x => String(x).trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
      if (!attendues.some(a => casse(a) === casse(saisie))) return { verdict: 'faux', message: 'Le sens est juste. Vérifiez les majuscules : début de phrase, prénom, jour ou mois.' };
    }
    return { verdict: 'juste' };
  }
  if (presques.some((a) => forme(a) === f)) {
    const longue = attendues.some((a) => enLongue(a) === enLongue(f)) && f !== forme(attendues[0]);
    return { verdict: 'presque', message: longue ? 'Le sens est juste, mais vous avez entendu la forme courte.' : 'Presque : regardez la ponctuation de la phrase modèle.' };
  }
  if (tolerance.forme_longue && attendues.some((a) => enLongue(a) === enLongue(f))) {
    return { verdict: 'presque', message: 'Le sens est juste, mais vous avez entendu la forme courte.' };
  }
  if (tolerance.une_faute_de_frappe) {
    const s = jetons(f);
    for (const a of attendues) {
      const m = jetons(a);
      if (m.length !== s.length) continue;
      const diff = m.map((x, k) => (x === s[k] ? null : [x, s[k]])).filter(Boolean);
      if (diff.length === 1) {
        const [att, don] = diff[0];
        if (att.length >= 4 && !PROTEGES.has(att) && !PROTEGES.has(don) && distance(att, don) === 1) {
          return { verdict: 'presque', message: `Presque : ${att} s'écrit ${att.split('').join('-')}.`, correction: att };
        }
      }
    }
  }
  return { verdict: 'faux' };
}

/** Correction mot par mot : chaque mot de l'apprenant, juste ou non (alignement sur la phrase modèle). */
export function motsCorriges(saisie, modele) {
  const bruts = String(saisie || '').trim().split(/\s+/).filter(Boolean);
  const a = bruts.map((m) => forme(m).replace(/[,;:"«»()]/g, ''));
  const b = jetons(modele).map((m) => m.replace(/[,;:"«»()]/g, ''));
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? 1 + L[i + 1][j + 1] : Math.max(L[i + 1][j], L[i][j + 1]);
  const ok = new Array(a.length).fill(false);
  let i = 0; let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { ok[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  // Un mot n'est « manquant » que si l'apprenant en a écrit moins que la phrase n'en compte.
  const manquants = Math.max(0, b.length - a.length);
  return { mots: bruts.map((m, k) => ({ mot: m, ok: ok[k] })), manquants };
}

export async function monter(racine, ctx) {
  ctx.ajouterStyle(CSS_ECOUTE + CSS);
  const S = ctx.services || {};
  const R = retourTypo(S.retour);
  try { await S.voix?.pret?.(); } catch { /* sans manifeste : items sans son sautés */ }
  const etape = ctx.donnees;
  const tolerance = etape.tolerance_commune || { casse: true, ponctuation_finale: true, apostrophes: true, une_faute_de_frappe: 'presque', forme_longue: 'presque' };
  const tous = etape.items || [];
  const items = tous;
  const sautes = tous.length - items.length;
  const suivi = items.map(() => ({ essais: 0, premier: null, fait: false, verdict: null, saisie: '' }));
  let i = 0;
  let barre = null;
  let dejaJoue = false;
  let jetonTirets = 0;

  racine.innerHTML = `
    <section class="ec-carte carte ecd">
      <div class="ecd-tete"></div>
      <div class="ec-ecoutes"></div>
      <div class="ecd-tirets" hidden aria-hidden="true"></div>
      <label class="ecd-label" for="ecd-saisie">Écrivez la phrase entendue</label>
      <div class="ecd-ligne">
        <input id="ecd-saisie" class="ecd-saisie" type="text" lang="en" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="done" placeholder="Écrivez en anglais…">
        <button type="button" class="btn btn-primaire" data-valider>Valider</button>
      </div>
      <div class="ecd-correction" hidden></div>
      <div class="ec-retour" aria-live="polite"></div>
      <div class="ec-aide"></div>
      <div class="ec-actions"><button type="button" class="btn btn-primaire" data-suivant hidden>Phrase suivante ${ICONES.suite}</button></div>
    </section>
    <div class="ecd-fin"></div>`;
  const $ = (s) => racine.querySelector(s);
  const saisie = $('.ecd-saisie');
  const prog = pastilles(items.length, 'Phrase');
  $('.ecd-tete').append(prog.element);
  const trace = (id) => { try { ctx.tracer?.('audio_ecoute', { item: id }); } catch { /* facultatif */ } };
  const normal = boutonEcoute(ctx, { obtenir: () => items[i].audio, libelle: 'Écouter', principal: true, surEcoute: () => trace(items[i].audio.id) });
  const lent = boutonEcoute(ctx, {
    obtenir: () => (infoSon(ctx, items[i].audio_lent) ? items[i].audio_lent : items[i].audio),
    // la version lente produite existe ; sinon la normale est ralentie sans changer la voix
    libelle: 'Lentement', vitesse: 1, surEcoute: () => trace(items[i].audio_lent?.id),
  });
  $('.ec-ecoutes').append(normal.element, lent.element);
  // L'icône « lent » pour le second bouton, même quand la vitesse de lecture reste 1 (fichier déjà ralenti).
  lent.element.querySelector('.ec-ecoute-rond').innerHTML = ICONES.lent;

  const etats = () => suivi.map((s, k) => (s.fait ? (s.premier ? 'ok' : 'aide') : (k === i ? 'en-cours' : '')));

  function afficher(auto) {
    const it = items[i];
    [normal,lent].forEach(b => b.element.disabled = !infoSon(ctx, it.audio));
    let absent = racine.querySelector('[data-texte-absent]');
    if (!absent) { absent = document.createElement('p'); absent.dataset.texteAbsent=''; $('.ec-ecoutes').after(absent); }
    absent.hidden = Boolean(infoSon(ctx, it.audio));
    absent.textContent = absent.hidden ? '' : 'Voix en préparation · ' + (it.audio?.texte || it.reponse?.attendues?.[0] || '');
    jetonTirets++;
    prog.maj(i, etats());
    saisie.value = '';
    saisie.disabled = false;
    saisie.classList.remove('juste', 'presque');
    $('[data-valider]').hidden = false;
    $('[data-suivant]').hidden = true;
    $('[data-suivant]').innerHTML = i < items.length - 1 ? `Phrase suivante ${ICONES.suite}` : `Voir le bilan ${ICONES.suite}`;
    $('.ecd-correction').hidden = true;
    $('.ecd-tirets').hidden = true;
    $('.ec-retour').innerHTML = '';
    $('.ec-aide').innerHTML = '';
    barre = null;
    if (ctx.regime !== 'evaluation' && S.aide?.barre) {
      try {
        barre = S.aide.barre(ctx, { item: () => it.id, surMontrer: () => montrer(), surSolution: () => solution() });
        $('.ec-aide').append(barre.element);
      } catch { barre = null; }
    }
    if (auto && dejaJoue) normal.jouer();
    if (auto) racine.querySelector('.ecd').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function valider() {
    const it = items[i];
    const s = suivi[i];
    if (s.fait) return;
    dejaJoue = true;
    const texte = saisie.value;
    const j = juger(texte, it, tolerance);
    const zone = $('.ec-retour');
    if (j.verdict === 'vide') {
      zone.innerHTML = '';
      zone.append(R?.info ? R.info('Écrivez d\'abord la phrase, puis validez.') : encart('info', 'Écrivez d\'abord la phrase.'));
      saisie.focus();
      return;
    }
    const premier = s.essais === 0;
    s.essais += 1;
    zone.innerHTML = '';
    const modele = it.reponse?.attendues?.[0] || it.audio.texte;
    const cible = (it.retours?.cibles || []).find((c) => (c.si || []).some((x) => forme(x) === forme(texte)));
    const corr = motsCorriges(texte, j.verdict === 'juste' ? texte : modele);
    const zc = $('.ecd-correction');
    zc.innerHTML = `<p class="ecd-sur">Votre phrase</p><p class="ecd-mots" lang="en">${corr.mots.map((m) => `<span class="${m.ok ? 'bon' : 'mauvais'}">${echapper(m.mot)}</span>`).join(' ')}${corr.manquants > 0 && j.verdict === 'faux' ? ` <span class="ecd-manque" title="mot manquant">${'_'.repeat(3)}</span>` : ''}</p>`;
    zc.hidden = false;
    let explication;
    if (j.verdict === 'juste' || j.verdict === 'presque') {
      s.fait = true;
      s.premier = premier;
      s.verdict = j.verdict;
      s.saisie = texte;
      saisie.disabled = true;
      saisie.classList.add(j.verdict);
      explication = j.verdict === 'juste' ? (it.retours?.juste || 'Juste.') : (cible?.retour || j.message);
      if (j.verdict === 'juste') zone.append(R?.juste ? R.juste(explication) : encart('juste', explication));
      else zone.append(R?.presque ? R.presque('Accepté.', { correction: modele, explication }) : encart('juste', `Accepté. ${explication} ${modele}`));
      zc.insertAdjacentHTML('beforeend', `<p class="ecd-sur">La phrase</p><p class="ec-texte-en" lang="en">${decouperMots(modele).map((m) => (estFormeDeBe(m) ? `<span class="ec-be">${echapper(m)}</span>` : echapper(m))).join(' ')}</p>`);
      $('[data-valider]').hidden = true;
      $('.ec-aide').innerHTML = '';
      $('[data-suivant]').hidden = false;
      $('[data-suivant]').focus({ preventScroll: true });
      S.sons?.jouer?.('juste');
      prog.maj(i, etats());
    } else {
      explication = j.message || cible?.retour || (corr.manquants > 0
        ? 'Il manque au moins un mot. Réécoutez lentement : chaque petit mot compte (a, an, the).'
        : 'Les mots soulignés ne sont pas ceux de la phrase. Réécoutez lentement.');
      zone.append(R?.faux ? R.faux('Pas encore.', { explication }) : encart('faux', explication));
      S.sons?.jouer?.('faux');
      barre?.erreur?.();
      saisie.focus({ preventScroll: true });
      saisie.select();
    }
    ctx.signaler?.essai?.({
      juste: j.verdict === 'juste' ? true : j.verdict === 'presque' ? 'presque' : false,
      item: it.id, element: 'Dictée', attendu: modele, donne: texte, explication,
      remediation: etape.remediation, premier_essai: premier,
    });
    requestAnimationFrame(() => ($('[data-suivant]').hidden ? zone : $('.ec-actions')).scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  // « Montrez-moi » : la phrase au ralenti, un tiret par lettre qui apparaît quand le mot est dit.
  async function montrer() {
    const it = items[i];
    const moi = ++jetonTirets;
    const mots = decouperMots(it.reponse?.attendues?.[0] || it.audio.texte);
    const z = $('.ecd-tirets');
    z.innerHTML = mots.map((m) => `<span class="ecd-tiret">${echapper(m.replace(/[A-Za-z]/g, '_'))}</span>`).join(' ');
    z.hidden = false;
    const segLent = infoSon(ctx, it.audio_lent) ? it.audio_lent : it.audio;
    const info = infoSon(ctx, segLent);
    const temps = (info?.mots || []).map((m) => m.debut);
    const tirets = [...z.querySelectorAll('.ecd-tiret')];
    if (!info) { tirets.forEach((t) => t.classList.add('vu')); return; }
    await S.audio.jouer(info.url, {
      canal: 'media', garde: info.duree_s || 6,
      surTemps: (t) => {
        if (moi !== jetonTirets) return;
        tirets.forEach((x, k) => { const tk = temps[Math.min(k, temps.length - 1)] ?? (k * (info.duree_s || 3) / tirets.length); if (t >= tk - 0.05) x.classList.add('vu'); });
      },
    });
    if (moi === jetonTirets) tirets.forEach((x) => x.classList.add('vu'));
  }

  function solution() {
    const it = items[i];
    const s = suivi[i];
    s.fait = true;
    s.premier = false;
    s.verdict = 'solution';
    const modele = it.reponse?.attendues?.[0] || it.audio.texte;
    const z = $('.ec-retour');
    z.innerHTML = '';
    z.append(R?.reponse ? R.reponse(modele, { explication: 'Réécoutez la phrase en la lisant, puis passez à la suivante.' }) : encart('reponse', modele));
    saisie.disabled = true;
    $('[data-valider]').hidden = true;
    $('.ec-aide').innerHTML = '';
    $('[data-suivant]').hidden = false;
    prog.maj(i, etats());
  }

  function terminer() {
    const bons = suivi.filter((s) => s.premier).length;
    const score = items.length ? bons / items.length : 0;
    ctx.signaler?.fin?.({ score, reussi: score >= 0.5, points_obtenus: bons });
    S.sons?.jouer?.('fin');
    racine.querySelector('.ecd').hidden = true;
    const fin = carteFin({
      titre: `${bons} phrase${bons > 1 ? 's' : ''} sur ${items.length} écrite${bons > 1 ? 's' : ''} du premier coup`,
      sousTitre: sautes ? `${sautes} phrase${sautes > 1 ? 's' : ''} en cours de réenregistrement.` : 'Les formes courtes et leur apostrophe : c\'est ce qui fait la différence à l\'écrit.',
      lignes: items.map((it, k) => ({
        ok: suivi[k].premier,
        html: decouperMots(it.reponse?.attendues?.[0] || it.audio.texte).map((m) => (estFormeDeBe(m) ? `<span class="ec-be">${echapper(m)}</span>` : echapper(m))).join(' '),
        detail: suivi[k].verdict === 'presque' ? `Vous avez écrit : ${suivi[k].saisie}` : null,
      })),
      surRecommencer: () => {
        suivi.forEach((s) => Object.assign(s, { essais: 0, premier: null, fait: false, verdict: null, saisie: '' }));
        i = 0;
        $('.ecd-fin').innerHTML = '';
        racine.querySelector('.ecd').hidden = false;
        afficher(true);
      },
    });
    $('.ecd-fin').replaceChildren(fin);
    fin.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  $('[data-valider]').addEventListener('click', valider);
  saisie.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } });
  saisie.addEventListener('focus', () => { setTimeout(() => $('.ecd-ligne').scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 250); });
  $('[data-suivant]').addEventListener('click', () => { if (i < items.length - 1) { i += 1; afficher(true); } else terminer(); });

  function encart(type, texte) { const d = document.createElement('div'); d.className = `encart encart-${type}`; d.textContent = typo(texte); return d; }

  if (!items.length) {
    racine.innerHTML = '<div class="carte ec-carte"><p>Les phrases de cette dictée sont en cours d\'enregistrement.</p></div>';
    ctx.signaler?.pret?.();
    return { demonter() {} };
  }
  afficher(false);
  ctx.signaler?.pret?.();
  return {
    demonter() { jetonTirets++; normal.arreter(); lent.arreter(); },
    montrer() { montrer(); },
    montrerSolution() { solution(); },
  };
}

const CSS = `
${RACINES} .ecd-label { font-weight: 600; font-size: .95rem; }
${RACINES} .ecd-ligne { display: flex; gap: 8px; align-items: stretch; scroll-margin-bottom: 110px; }
${RACINES} .ecd-saisie { flex: 1; min-width: 0; min-height: 52px; padding: 10px 14px; border-radius: var(--rayon-bouton); border: 1.5px solid var(--filet-fort); background: var(--surface); font-size: 1.1rem; font-weight: 500; color: var(--encre); }
${RACINES} .ecd-saisie:focus { outline: none; border-color: var(--c-ecouter); box-shadow: 0 0 0 3px var(--c-ecouter-voile); }
${RACINES} .ecd-saisie.juste { border-color: var(--juste); background: var(--juste-voile); color: var(--juste-fonce); }
${RACINES} .ecd-saisie.presque { border-color: #EBD3A6; background: var(--ambre-voile); color: var(--ambre); }
${RACINES} .ecd-saisie:disabled { opacity: 1; }
@media (max-width: 479px) { ${RACINES} .ecd-ligne { flex-direction: column; } ${RACINES} .ecd-ligne .btn { width: 100%; } }
${RACINES} .ecd-correction { padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); display: grid; gap: 2px; }
${RACINES} .ecd-sur { font-size: .75rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-50); }
${RACINES} .ecd-sur:not(:first-child) { margin-top: 8px; }
${RACINES} .ecd-mots { font-size: 1.1rem; font-weight: 600; line-height: 1.7; }
${RACINES} .ecd-mots .bon { color: var(--juste-fonce); }
${RACINES} .ecd-mots .mauvais { color: var(--faux-fonce); text-decoration: underline wavy var(--faux); text-decoration-thickness: 1.5px; text-underline-offset: 4px; }
${RACINES} .ecd-manque { color: var(--faux); letter-spacing: .1em; }
${RACINES} .ecd-tirets { padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--c-ecouter-voile); font-size: 1.25rem; font-weight: 700; letter-spacing: .12em; color: var(--c-ecouter); line-height: 1.6; }
${RACINES} .ecd-tiret { opacity: 0; transition: opacity .25s var(--doux); }
${RACINES} .ecd-tiret.vu { opacity: 1; }
`;
