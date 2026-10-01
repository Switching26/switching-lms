// Écouter et choisir (ECO-1) — agent B1.
// Une phrase dite à vitesse normale, une question, deux ou trois réponses illustrées. La phrase écrite
// n'apparaît qu'après la bonne réponse : on écoute, on ne lit pas. Chaque mauvais choix a son explication.

import { ICONES, echapper, decouperMots, estFormeDeBe, retourTypo, typo } from '../video/_commun.js';
import { CSS_ECOUTE, RACINES, infoSon, boutonEcoute, pastilles, carteFin, vignette } from './_ecoute.js';

export const meta = { titre: 'Écouter et choisir', entete: true };

export async function monter(racine, ctx) {
  ctx.ajouterStyle(CSS_ECOUTE + CSS);
  const S = ctx.services || {};
  const R = retourTypo(S.retour);
  try { await S.voix?.pret?.(); } catch { /* manifeste absent : les items sans son sont sautés */ }
  const etape = ctx.donnees;
  const tous = etape.items || [];
  // Un item d'écoute sans son n'a pas de sens : il est sauté, et le bilan le dit.
  const items = tous;
  const sautes = tous.length - items.length;
  const suivi = items.map(() => ({ essais: 0, premierJuste: null, fait: false }));
  let i = 0;
  let barre = null;
  let dejaJoue = false;

  racine.innerHTML = `
    <section class="ec-carte carte ecc">
      <div class="ecc-tete"></div>
      <div class="ec-ecoutes"></div>
      <h3 class="ec-question"></h3>
      <div class="ecc-options" role="group"></div>
      <div class="ec-retour" aria-live="polite"></div>
      <div class="ecc-phrase" hidden></div>
      <div class="ec-aide"></div>
      <div class="ec-actions"><button type="button" class="btn btn-primaire" data-suivant hidden>Phrase suivante ${ICONES.suite}</button></div>
    </section>
    <div class="ecc-fin"></div>`;
  const $ = (s) => racine.querySelector(s);
  const prog = pastilles(items.length, 'Phrase');
  $('.ecc-tete').append(prog.element);
  const lecture = boutonEcoute(ctx, { obtenir: () => items[i].audio, libelle: 'Écouter la phrase', principal: true, surEcoute: () => trace() });
  const lent = boutonEcoute(ctx, { obtenir: () => items[i].audio, libelle: 'Lentement', vitesse: 0.75, surEcoute: () => trace() });
  $('.ec-ecoutes').append(lecture.element, lent.element);
  const trace = () => { try { ctx.tracer?.('audio_ecoute', { item: items[i]?.id }); } catch { /* facultatif */ } };
  // La phrase affichée est celle qui est DITE : le texte du fichier de voix (il peut avoir été allongé pour être
  // intelligible, ex. « We're new here. » à la place de « We're new. », décision du chef du 30/09), sinon celui du script.
  const texteDit = (it) => infoSon(ctx, it.audio)?.texte || it.audio.texte;

  $('[data-suivant]').addEventListener('click', () => {
    if (i < items.length - 1) { i += 1; afficher(true); } else terminer();
  });

  function etats() { return suivi.map((s, k) => (s.fait ? (s.premierJuste ? 'ok' : 'aide') : (k === i ? 'en-cours' : ''))); }

  function afficher(jouerTout) {
    const it = items[i];
    const boutons = [lecture, lent];
    boutons.forEach(b => b.element.disabled = !infoSon(ctx, it.audio));
    let texteAbsent = racine.querySelector('[data-texte-absent]');
    if (!texteAbsent) { texteAbsent = document.createElement('p'); texteAbsent.dataset.texteAbsent=''; racine.querySelector('.ec-ecoutes').after(texteAbsent); }
    texteAbsent.hidden = Boolean(infoSon(ctx, it.audio));
    texteAbsent.textContent = infoSon(ctx, it.audio) ? '' : 'Voix en préparation · ' + (it.audio?.texte || it.reponse?.attendues?.[0] || '');
    prog.maj(i, etats());
    $('.ec-question').textContent = typo(it.question);
    $('.ec-retour').innerHTML = '';
    $('.ecc-phrase').hidden = true;
    $('.ecc-phrase').innerHTML = '';
    $('[data-suivant]').hidden = true;
    $('[data-suivant]').innerHTML = i < items.length - 1 ? `Phrase suivante ${ICONES.suite}` : `Voir le bilan ${ICONES.suite}`;
    const opts = $('.ecc-options');
    opts.setAttribute('aria-label', it.question);
    const avecImages = it.options.some((o) => o.image && vignette(ctx, o.image, o.texte));
    opts.classList.toggle('avec-images', avecImages);
    opts.innerHTML = it.options.map((o, k) => `<button type="button" class="ecc-option" data-o="${k}">${vignette(ctx, o.image, o.texte)}<span class="ecc-option-texte">${echapper(o.texte)}</span><span class="ecc-option-icone"></span></button>`).join('');
    opts.querySelectorAll('.ecc-option').forEach((b) => b.addEventListener('click', () => repondre(b)));
    $('.ec-aide').innerHTML = '';
    barre = null;
    if (ctx.regime !== 'evaluation' && S.aide?.barre) {
      try {
        barre = S.aide.barre(ctx, { item: () => it.id, surMontrer: () => montrer(), surSolution: () => solution() });
        $('.ec-aide').append(barre.element);
      } catch { barre = null; }
    }
    // La première phrase attend le geste de l'apprenant (le guide parle) ; les suivantes partent seules.
    if (jouerTout && dejaJoue) lecture.jouer();
    if (jouerTout) racine.querySelector('.ecc').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function repondre(b) {
    const it = items[i];
    const s = suivi[i];
    if (s.fait) return;
    dejaJoue = true;
    const choix = it.options[Number(b.dataset.o)].texte;
    const juste = choix === it.bonne;
    const premier = s.essais === 0;
    s.essais += 1;
    const zone = $('.ec-retour');
    zone.innerHTML = '';
    let explication;
    if (juste) {
      s.fait = true;
      s.premierJuste = premier;
      explication = it.retours?.juste || 'Oui.';
      b.classList.add('juste');
      b.querySelector('.ecc-option-icone').innerHTML = ICONES.coche;
      racine.querySelectorAll('.ecc-option').forEach((x) => { x.disabled = true; });
      zone.append(R?.juste ? R.juste(explication) : encart('juste', explication));
      montrerPhrase();
      $('.ec-aide').innerHTML = '';
      $('[data-suivant]').hidden = false;
      S.sons?.jouer?.('juste');
      prog.maj(i, etats());
      visible($('.ec-actions'));
    } else {
      const d = (it.distracteurs || []).find((x) => x.texte === choix);
      explication = d?.retour || 'Pas encore. Réécoutez le tout début de la phrase.';
      b.classList.add('faux');
      b.disabled = true;
      b.querySelector('.ecc-option-icone').innerHTML = ICONES.croix;
      zone.append(R?.faux ? R.faux('Pas tout à fait.', { explication }) : encart('faux', explication));
      S.sons?.jouer?.('faux');
      barre?.erreur?.();
      if (ctx.regime !== 'evaluation' && ![...racine.querySelectorAll('.ecc-option')].some(x => !x.disabled && it.options[Number(x.dataset.o)].texte !== it.bonne)) barre?.ouvrirSolution?.();
      visible(zone);
    }
    ctx.signaler?.essai?.({
      juste, item: it.id, element: it.question, attendu: it.bonne, donne: choix, explication,
      remediation: etape.remediation, premier_essai: premier,
    });
  }

  function montrerPhrase() {
    const it = items[i];
    const mots = decouperMots(texteDit(it));
    const z = $('.ecc-phrase');
    z.innerHTML = `<p class="ecc-phrase-sur">Vous avez entendu</p><p class="ec-texte-en" lang="en">${mots.map((m) => `<span class="${estFormeDeBe(m) ? 'ec-be' : ''}">${echapper(m)}</span>`).join(' ')}</p>`;
    z.hidden = false;
  }

  // « Montrez-moi » : la phrase rejouée au ralenti, son premier mot écrit et surligné.
  async function montrer() {
    const it = items[i];
    const mots = decouperMots(texteDit(it));
    const z = $('.ecc-phrase');
    z.innerHTML = `<p class="ecc-phrase-sur">Écoutez le début de la phrase</p><p class="ec-texte-en" lang="en"><span class="ec-be">${echapper(mots[0])}</span> ${mots.slice(1).map((m) => `<span class="ecc-cache">${'•'.repeat(Math.min(6, m.replace(/[^a-z']/gi, '').length || 1))}</span>`).join(' ')}</p>`;
    z.hidden = false;
    await lent.jouer();
  }

  function solution() {
    const it = items[i];
    const s = suivi[i];
    s.fait = true;
    s.premierJuste = false;
    racine.querySelectorAll('.ecc-option').forEach((x) => {
      x.disabled = true;
      if (it.options[Number(x.dataset.o)].texte === it.bonne) { x.classList.add('juste'); x.querySelector('.ecc-option-icone').innerHTML = ICONES.coche; }
    });
    const z = $('.ec-retour');
    z.innerHTML = '';
    z.append(R?.reponse ? R.reponse(it.bonne, { explication: it.retours?.juste }) : encart('reponse', `${it.bonne}. ${it.retours?.juste || ''}`));
    $('.ec-aide').innerHTML = '';
    montrerPhrase();
    $('[data-suivant]').hidden = false;
    prog.maj(i, etats());
    visible($('.ec-actions'));
  }

  function terminer() {
    const bons = suivi.filter((s) => s.premierJuste).length;
    const score = items.length ? bons / items.length : 0;
    ctx.signaler?.fin?.({ score, reussi: score >= 0.5, points_obtenus: bons });
    S.sons?.jouer?.('fin');
    racine.querySelector('.ecc').hidden = true;
    const fin = carteFin({
      titre: `${bons} phrase${bons > 1 ? 's' : ''} sur ${items.length} reconnue${bons > 1 ? 's' : ''} du premier coup`,
      sousTitre: sautes ? `${sautes} phrase${sautes > 1 ? 's' : ''} en cours de réenregistrement, pas encore proposée${sautes > 1 ? 's' : ''}.` : 'Touchez « Recommencer » pour réentraîner votre oreille.',
      lignes: items.map((it, k) => ({
        ok: suivi[k].premierJuste,
        html: decouperMots(texteDit(it)).map((m) => (estFormeDeBe(m) ? `<span class="ec-be">${echapper(m)}</span>` : echapper(m))).join(' '),
        detail: suivi[k].premierJuste ? null : (it.retours?.juste || ''),
      })),
      surRecommencer: () => {
        suivi.forEach((s) => { s.essais = 0; s.premierJuste = null; s.fait = false; });
        i = 0;
        $('.ecc-fin').innerHTML = '';
        racine.querySelector('.ecc').hidden = false;
        afficher(true);
      },
    });
    $('.ecc-fin').replaceChildren(fin);
    fin.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function visible(elt) {
    requestAnimationFrame(() => elt?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
  function encart(type, texte) { const d = document.createElement('div'); d.className = `encart encart-${type}`; d.textContent = typo(texte); return d; }

  if (!items.length) {
    racine.innerHTML = '<div class="carte ec-carte"><p>Les phrases de cette activité sont en cours d\'enregistrement.</p></div>';
    ctx.signaler?.pret?.();
    return { demonter() {} };
  }
  afficher(false);
  ctx.signaler?.pret?.();
  return {
    demonter() { lecture.arreter(); lent.arreter(); },
    montrer() { montrer(); },
    montrerSolution() { solution(); },
  };
}

const CSS = `
${RACINES} .ecc-options { display: grid; gap: 8px; }
@media (min-width: 640px) { ${RACINES} .ecc-options.avec-images { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
${RACINES} .ecc-option { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 14px 8px 8px; border-radius: var(--rayon-bloc); border: 1.5px solid var(--filet-fort); background: var(--surface); color: var(--encre); font: inherit; font-weight: 600; text-align: left; cursor: pointer; transition: border-color .15s, background-color .15s, transform .2s var(--ressort); }
${RACINES} .ecc-options:not(.avec-images) .ecc-option { padding-left: 16px; }
@media (min-width: 640px) { ${RACINES} .ecc-options.avec-images .ecc-option { flex-direction: column; align-items: stretch; text-align: center; padding: 8px 8px 12px; } ${RACINES} .ecc-options.avec-images .ec-vignette { width: 100%; height: auto; aspect-ratio: 4 / 3; } ${RACINES} .ecc-options.avec-images .ecc-option-icone { position: absolute; } ${RACINES} .ecc-option { position: relative; } }
${RACINES} .ecc-option:hover:not(:disabled) { border-color: var(--c-ecouter); background: var(--c-ecouter-voile); }
${RACINES} .ecc-option:active:not(:disabled) { transform: scale(.985); }
${RACINES} .ecc-option-texte { flex: 1; }
${RACINES} .ecc-option-icone { width: 22px; height: 22px; flex: none; }
${RACINES} .ecc-option-icone svg { width: 22px; height: 22px; }
@media (min-width: 640px) { ${RACINES} .ecc-options.avec-images .ecc-option-icone { top: 14px; right: 14px; width: 26px; height: 26px; border-radius: 999px; background: var(--surface); display: grid; place-items: center; } ${RACINES} .ecc-options.avec-images .ecc-option-icone:empty { display: none; } }
${RACINES} .ecc-option.juste { border-color: var(--juste); background: var(--juste-voile); color: var(--juste-fonce); }
${RACINES} .ecc-option.faux { border-color: var(--faux-bord); background: var(--faux-voile); color: var(--faux-fonce); }
${RACINES} .ecc-option:disabled { cursor: default; }
${RACINES} .ecc-option:disabled:not(.juste):not(.faux) { opacity: .5; }
${RACINES} .ecc-phrase { padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); }
${RACINES} .ecc-phrase-sur { font-size: .75rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-50); }
${RACINES} .ecc-cache { color: var(--encre-30); letter-spacing: .1em; }
`;
