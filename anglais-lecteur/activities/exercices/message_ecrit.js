// activities/exercices/message_ecrit.js — EX-08 « Votre message de présentation à l'équipe » (type message_ecrit).
//
// Un fil de messagerie d'équipe dessiné en HTML (Helen, puis Claire), et votre message à écrire.
// « Relire mon message » passe la grille du script (G1…G7) : chaque critère est vérifié sur le texte,
// ceux qui manquent s'affichent en orange avec leur conseil. La limite de la relecture automatique est
// dite honnêtement. Confidentialité (règle du LMS) : le texte n'entre dans aucune trace ; il n'est gardé
// pour le formateur qu'avec l'accord coché par l'apprenant — et, dans ce prototype, il reste sur l'appareil.
import {
  el, esc, icone, texteFr, liste, retoursDe, preparerMedias, donneesEtape, afficherEnPreparation, regimeDe,
  creerSuivi, creerBarreAide, carteBilan, signalerFin, cssCommun, urlImage, attendre, mouvementReduit,
  texteAvecGloses, rendreVisible,
} from './_commun.js';

export const meta = { titre: 'Message écrit', entete: true };
const P = '.act-exercices-message_ecrit';
const NATIONALITES = ['french', 'english', 'spanish', 'italian', 'german', 'british', 'scottish', 'american', 'portuguese', 'belgian', 'swiss', 'moroccan', 'algerian', 'tunisian'];
const NOMS = { helen: { nom: 'Helen', image: 'P03' }, claire: { nom: 'Claire', image: 'P01' }, daniel: { nom: 'Daniel', image: 'P02' }, rob: { nom: 'Rob', image: 'P04' } };

// Famille d'erreur du bilan (script/bilan.json) pour chaque critère de la grille : l'erreur y est rangée
// directement, sans deviner (recette Q n° 16).
const FAMILLE_CRITERE = { G1: 'formules', G3: 'article_metier', G4: 'majuscules', G5: 'am_is_are', G6: 'apostrophe' };

export async function monter(racine, ctx) {
  ctx.ajouterStyle?.(cssCommun(P) + css(P));
  const { etape, raison } = await donneesEtape(ctx, 'exercices.json', 'message_ecrit');
  if (!etape) return afficherEnPreparation(racine, ctx, raison);
  await preparerMedias(ctx);
  // La liste des métiers vient de PRO-4 (aide_metier), comme le demande le script.
  let metiers = [];
  try {
    const pro = await ctx.script('prononciation.json');
    metiers = liste(liste(pro?.etapes).find((e) => e?.aide_metier)?.aide_metier?.liste);
  } catch { metiers = []; }

  const R = retoursDe(ctx);
  const regime = regimeDe(ctx, etape);
  const grille = liste(etape.grille_de_relecture);
  const min = Number(etape.saisie?.min_caracteres) || 30;
  const max = Number(etape.saisie?.max_caracteres) || 300;
  const sansArticle = metiers.map((m) => String(m.en || '').replace(/^(a|an)\s+/i, '')).filter((m) => m && !/^retired$/i.test(m));
  let ac, suivi, aide, fini, envois;
  const cadre = el('div', { class: 'b3-cadre' });
  racine.replaceChildren(cadre);

  function partie() {
    ac?.abort();
    ac = new AbortController();
    ctx.signal?.addEventListener('abort', () => ac.abort(), { once: true });
    suivi = creerSuivi(ctx, etape);
    suivi.declarer(grille.filter((g) => !/case/i.test(g.controle_auto || '')).map((g) => `${etape.id}-${g.id}`));
    fini = false;
    envois = 0;

    const carte = el('div', { class: 'carte b3-carte' });
    const fil = el('div', { class: 'b3-msg-fil', role: 'log', 'aria-label': 'Messagerie de l\'équipe' });
    fil.append(el('p', { class: 'b3-msg-canal', html: `${icone(ctx, 'message')}<span>Équipe Wren &amp; Holt</span>` }));
    const support = etape.support || {};
    for (const cle of ['message_helen', 'message_claire']) {
      const m = support[cle];
      if (!m?.texte) continue;
      const qui = NOMS[m.auteur] || { nom: m.auteur || '' };
      const gloses = glossesDepuisNote(m.note, m.texte);
      fil.append(bulle(qui, texteAvecGloses(ctx, m.texte, gloses, { signal: ac.signal }), cle === 'message_claire' ? 'claire' : ''));
    }
    const modele = el('div', { class: 'b3-msg-modele', hidden: true });
    fil.append(modele);

    const idZone = `b3-msg-${etape.id}`;
    const zone = el('textarea', { id: idZone, class: 'b3-msg-saisie', lang: 'en', rows: '5', maxlength: String(max), autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false', placeholder: 'Hi everyone! I\'m …' });
    const compteur = el('span', { class: 'b3-msg-compteur', 'aria-live': 'polite' });
    const relu = el('input', { type: 'checkbox', id: `${idZone}-relu` });
    const accord = el('input', { type: 'checkbox', id: `${idZone}-accord` });
    const bRelire = el('button', { type: 'button', class: 'btn btn-primaire', html: `<span>Relire mon message</span>` });
    const listeMetiers = metiers.length ? el('details', { class: 'b3-msg-metiers' },
      el('summary', { texte: 'Votre métier en anglais' }),
      el('ul', {}, ...metiers.map((m) => el('li', {}, el('b', { lang: 'en', texte: m.en }), el('span', { texte: ` — ${m.fr}` })))),
    ) : null;
    const composeur = el('div', { class: 'b3-msg-composeur' },
      el('label', { class: 'b3-msg-lib', for: idZone, texte: 'Votre message' }),
      zone,
      el('div', { class: 'b3-msg-sous' }, compteur, el('span', { class: 'discret', texte: '3 à 5 phrases' })),
      listeMetiers,
      el('label', { class: 'b3-msg-case', for: relu.id }, relu, el('span', { texte: 'Je me suis relu(e), si possible à voix haute.' })),
      el('label', { class: 'b3-msg-case', for: accord.id }, accord, el('span', { texte: 'Envoyer à mon formateur, qui pourra le commenter en visio.' })),
      el('p', { class: 'b3-msg-prive petit discret', texte: 'Prototype : votre message reste sur cet appareil. Le suivi ne garde que les critères remplis, jamais le texte.' }),
    );
    const resultat = el('div', { class: 'b3-msg-resultat', 'aria-live': 'polite' });
    const zoneRetour = el('div', { class: 'b3-retour', 'aria-live': 'polite' });
    aide = creerBarreAide(ctx, {
      etape, regime,
      indices: () => [texteFr(etape.aide?.indice)].filter(Boolean),
      surMontrer: () => montrer(),
      surSolution: null,
    });
    const actions = el('div', { class: 'b3-actions' }, el('div', { class: 'b3-actions-pri' }, bRelire));
    const dock = el('div', { class: 'b3-dock' }, zoneRetour, aide.element, actions);
    carte.append(fil, composeur, resultat, dock);
    cadre.replaceChildren(carte);

    const majCompteur = () => {
      const n = zone.value.length;
      compteur.textContent = `${n} / ${max} caractères`;
      compteur.classList.toggle('b3-msg-court', n > 0 && n < min);
    };
    majCompteur();
    zone.addEventListener('input', majCompteur, { signal: ac.signal });
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); relire(); } }, { signal: ac.signal });
    bRelire.addEventListener('click', () => relire());

    function relire() {
      if (fini) return;
      const texte = zone.value.trim();
      if (texte.length < min) {
        zoneRetour.replaceChildren(R.info(`Écrivez au moins ${min} caractères : trois à cinq phrases courtes.`));
        rendreVisible(dock);
        zone.focus();
        return;
      }
      envois += 1;
      const verdicts = grille.map((g) => ({ g, ...controler(g, texte, relu.checked) }));
      // Suivi : un essai par critère automatique, sans jamais le texte (confidentialité).
      for (const v of verdicts) {
        if (/case/i.test(v.g.controle_auto || '')) continue;
        // Le texte de l'apprenant n'est jamais repris ; seule la forme attendue l'est, quand elle est connue.
        suivi.essai({ item: `${etape.id}-${v.g.id}`, juste: v.ok, element: v.g.critere, attendu: v.attendu || '', donne: '', explication: v.ok ? '' : v.conseil, famille_erreur: FAMILLE_CRITERE[v.g.id] });
      }
      afficherGrille(verdicts);
      const tousBons = verdicts.every((v) => v.ok);
      if (tousBons) {
        if (accord.checked) { try { ctx.stockage?.ecrire?.('message-formateur', { texte, le: new Date().toISOString() }); } catch { /* rien */ } }
        const [phrase1, ...suite] = String(etape.retours?.juste || 'Votre message est prêt.').split(/(?<=\.)\s+/);
        zoneRetour.replaceChildren(R.juste(accord.checked ? etape.retours?.juste : phrase1,
          { explication: accord.checked ? '' : 'Il n\'est pas envoyé : cochez « Envoyer à mon formateur » si vous voulez qu\'il le relise.' }));
        void suite;
        publier(texte);
        terminer();
      } else {
        zoneRetour.replaceChildren(R.presque(etape.retours?.presque || 'Corrigez les points signalés en orange.', {}));
        aide.erreur();
      }
      rendreVisible(dock);
    }

    function afficherGrille(verdicts) {
      const ul = el('ul', { class: 'b3-msg-grille' });
      for (const v of verdicts) {
        ul.append(el('li', { class: v.ok ? 'b3-msg-ok' : 'b3-msg-arevoir' },
          el('span', { class: 'b3-msg-puce', html: icone(ctx, v.ok ? 'coche' : 'info'), 'aria-hidden': 'true' }),
          el('span', {}, el('b', { texte: v.g.critere }), v.ok ? null : el('span', { class: 'b3-msg-conseil', texte: v.conseil }))));
      }
      resultat.replaceChildren(
        el('h3', { texte: 'Relecture de votre message' }), ul,
        el('p', { class: 'b3-msg-limite petit', html: `${icone(ctx, 'info')}<span>${esc(etape.retours?.limite_honnete || '')}</span>` }));
    }

    function publier(texte) {
      fil.append(bulle({ nom: 'Vous' }, texte, 'moi'));
      // Le message est publié dans le fil : la zone d'écriture et le modèle n'ont plus lieu d'être.
      zone.value = ''; zone.disabled = true; bRelire.hidden = true;
      relu.disabled = true; accord.disabled = true;
      composeur.hidden = true; modele.hidden = true;
    }

    async function montrer() {
      // « transforme le message de Claire en modèle à trous : Hi everyone! I'm … . I'm a … . I'm … . »
      const gabarit = texteFr(etape.aide?.montrer).split(/\s:\s/).slice(1).join(' : ').trim();
      if (!gabarit) return;
      const signal = ac.signal;
      const claire = fil.querySelector('.b3-msg-ligne.claire .b3-msg-texte');
      claire?.classList.add('b3-msg-eclaire');
      await attendre(mouvementReduit() ? 60 : 700, signal);
      const pieces = gabarit.split('…');
      const p = el('p', { class: 'b3-msg-gabarit', lang: 'en' });
      pieces.forEach((morceau, i) => { p.append(morceau.replace(/\s+\./g, '.')); if (i < pieces.length - 1) p.append(el('span', { class: 'b3-msg-trou', texte: '…' })); });
      const utiliser = el('button', { type: 'button', class: 'btn btn-secondaire', html: `<span>Partir de ce modèle</span>` });
      utiliser.addEventListener('click', () => {
        zone.value = gabarit.replace(/\s+\./g, '.').replace(/…/g, '…');
        majCompteur(); zone.focus();
        const i = zone.value.indexOf('…');
        if (i >= 0) zone.setSelectionRange(i, i + 1);
      });
      modele.replaceChildren(el('span', { class: 'b3-msg-modele-lib', texte: 'Le message de Claire, en modèle : remplacez chaque … par vos informations.' }), p, utiliser);
      modele.hidden = false;
      modele.scrollIntoView?.({ block: 'center', behavior: mouvementReduit() ? 'auto' : 'smooth' });
      claire?.classList.remove('b3-msg-eclaire');
    }

    function terminer() {
      fini = true;
      aide.terminer();
      const { obtenus, total } = signalerFin(ctx, suivi, etape);
      const exemples = liste(etape.exemples_de_reussite);
      const bilan = carteBilan(ctx, {
        obtenus, total, erreurs: suivi.erreurs,
        libelleScore: 'critères remplis au premier envoi',
        surRecommencer: () => partie(),
      });
      if (exemples.length) {
        bilan.insertBefore(el('details', { class: 'b3-msg-exemples' },
          el('summary', { texte: 'D\'autres messages réussis' }),
          el('ul', {}, ...exemples.map((x) => el('li', { lang: 'en', texte: x })))), bilan.querySelector('.b3-actions'));
      }
      cadre.append(bilan);
      requestAnimationFrame(() => bilan.scrollIntoView?.({ block: 'nearest', behavior: mouvementReduit() ? 'auto' : 'smooth' }));
    }
  }

  function bulle(qui, contenu, classe = '') {
    const img = qui.image ? urlImage(ctx, qui.image) : null;
    return el('div', { class: `b3-msg-ligne ${classe}` },
      classe === 'moi' ? null : (img ? el('img', { class: 'b3-msg-avatar', src: img, alt: '' }) : el('span', { class: 'b3-msg-avatar b3-msg-initiale', texte: (qui.nom || '?')[0] })),
      el('div', { class: 'b3-msg-bulle' }, el('b', { class: 'b3-msg-nom', texte: qui.nom }), el('p', { class: 'b3-msg-texte', lang: 'en' }, contenu)));
  }

  /**
   * a ou an ? Règle enseignée en EX-05 à EX-07 : an devant un SON de voyelle, a devant un son de consonne.
   * Exceptions courantes : an hour, an honest… (h muet) ; a university, a European, a one-… (son « you », « wu ») ;
   * sigles lus lettre à lettre : an IT manager, an HR assistant, a PA.
   */
  function articleAttendu(mot) {
    const brut = String(mot || '');
    if (/^[A-Z]{2,}/.test(brut)) return /^[AEFHILMNORSX]/.test(brut) ? 'an' : 'a';
    const m = brut.toLowerCase();
    if (/^(hour|honest|honou?r|heir)/.test(m)) return 'an';
    if (/^(uni|use|usu|uro|eu|one\b|once)/.test(m)) return 'a';
    return /^[aeiou]/.test(m) ? 'an' : 'a';
  }

  /** Vérifie un critère de la grille sur le texte. Rend { ok, conseil }. */
  function controler(g, texte, reluCoche) {
    const t = texte.replace(/[\u2019\u2018]/g, "'");
    const conseil = g.si_absent || '';
    switch (g.id) {
      case 'G1': return { ok: /^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(t), conseil };
      case 'G2': {
        const re = /\b[Ii](?:'m| am)\s+([A-ZÀ-Ý][\p{L}'-]*)/gu;
        let ok = false;
        for (const m of t.matchAll(re)) if (!NATIONALITES.includes(m[1].toLowerCase()) && !/^(A|An|The)$/.test(m[1])) ok = true;
        return { ok, conseil };
      }
      case 'G3': {
        const metierNu = sansArticle.length && new RegExp(`\\b[Ii](?:'m| am)\\s+(${sansArticle.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i').test(t);
        if (metierNu) return { ok: false, conseil: g.erreur_ciblee || conseil };
        // Recette Q n° 14 : « I'm a accountant » était validé. L'article doit aussi être le BON.
        for (const m of t.matchAll(/\b[Ii](?:'m| am)\s+(a|an)\s+([\p{L}][\p{L}'-]*)/gu)) {
          const bon = articleAttendu(m[2]);
          if (m[1].toLowerCase() !== bon) {
            return {
              ok: false,
              attendu: `${bon} ${m[2]}`,
              conseil: `Devant « ${m[2]} », on dit ${bon} : I'm ${bon} ${m[2]}. On met an devant un son de voyelle (an accountant, an engineer) et a devant un son de consonne (a teacher, a manager).`,
            };
          }
        }
        return { ok: /\b[Ii](?:'m| am)\s+(?:(?:a|an|the)\s+\p{L}|retired\b)/iu.test(t), conseil };
      }
      case 'G4': {
        const iMin = /(^|[^\p{L}'])i(?=('m)?(?![\p{L}]))/u.test(t);
        const nat = new RegExp(`\\b(${NATIONALITES.join('|')})\\b`).test(t);
        return { ok: !iMin && !nat, conseil };
      }
      case 'G5': return { ok: (t.match(/\b(?:I'm|I am|is|are)\b|\p{L}'(?:s|re)\b/giu) || []).length >= 3, conseil };
      case 'G6': return { ok: !/\b(im|youre|hes|shes|theyre)\b/i.test(t), conseil };
      case 'G7': return { ok: !!reluCoche, conseil };
      default: return { ok: true, conseil };
    }
  }

  partie();
  try { ctx.signaler?.pret?.(); } catch { /* rien */ }
  return {
    demonter() { ac?.abort(); },
    montrer() { aide?.montrer?.(); },
  };
}

/** « please welcome (accueillez) et introduce yourselves (présentez-vous) » → Map, pour les expressions du texte. */
export function glossesDepuisNote(note, texte) {
  const m = new Map();
  const bas = String(texte || '').toLowerCase();
  for (const x of String(note || '').matchAll(/\(([^)]+)\)/g)) {
    const avant = String(note).slice(0, x.index).trim().split(/\s+/);
    let meilleure = null;
    for (let n = 1; n <= Math.min(4, avant.length); n++) {
      const essai = avant.slice(-n).join(' ').replace(/^[^A-Za-z]+/, '');
      if (essai && bas.includes(essai.toLowerCase())) meilleure = essai;
    }
    if (meilleure) m.set(meilleure, x[1].trim());
  }
  return m;
}

function css(p) {
  return `
${p} .b3-msg-fil { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); }
${p} .b3-msg-canal { display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; font-weight: 700; color: var(--encre-50); }
${p} .b3-msg-canal svg { width: 16px; height: 16px; }
${p} .b3-msg-ligne { display: flex; align-items: flex-start; gap: 10px; }
${p} .b3-msg-ligne.moi { justify-content: flex-end; }
${p} .b3-msg-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; object-position: 50% 20%; flex: none; background: var(--filet); }
${p} .b3-msg-initiale { display: grid; place-items: center; font-weight: 700; color: var(--encre-70); }
${p} .b3-msg-bulle { max-width: 88%; padding: 9px 13px 11px; border-radius: 4px 16px 16px 16px; background: var(--surface); border: 1px solid var(--filet); box-shadow: 0 1px 2px rgba(12,21,40,0.04); }
${p} .b3-msg-ligne.moi .b3-msg-bulle { border-radius: 16px 4px 16px 16px; background: var(--marque-voile); border-color: var(--marque-voile-bord); }
${p} .b3-msg-nom { display: block; font-size: 0.8125rem; color: var(--encre-70); margin-bottom: 2px; }
${p} .b3-msg-texte { margin: 0; font-size: 1rem; line-height: 1.6; color: var(--encre); white-space: pre-wrap; overflow-wrap: anywhere; }
${p} .b3-msg-eclaire { background: linear-gradient(transparent 60%, var(--marque-voile-bord) 60%); transition: background .3s; }
${p} .b3-msg-modele { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: var(--rayon-bloc); background: var(--marque-voile); border: 1px dashed var(--marque-voile-bord); animation: monter .45s var(--doux) both; }
${p} .b3-msg-modele-lib { font-size: 0.875rem; font-weight: 600; color: var(--marque-tres-fonce); }
${p} .b3-msg-gabarit { margin: 0; font-size: 1.02rem; line-height: 2; }
${p} .b3-msg-trou { display: inline-block; min-width: 3.2em; margin: 0 3px; padding: 0 8px; border-radius: 8px; background: var(--surface); border: 1px dashed var(--marque); color: var(--marque); text-align: center; font-weight: 700; line-height: 1.6; }
${p} .b3-msg-modele .btn { align-self: flex-start; }
${p} .b3-msg-composeur { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
${p} .b3-msg-lib { font-weight: 700; }
${p} .b3-msg-saisie { width: 100%; min-height: 128px; padding: 12px 14px; border-radius: 14px; border: 1.5px solid var(--filet-fort); background: var(--surface); font: inherit; font-size: 16px; line-height: 1.55; resize: vertical; }
${p} .b3-msg-saisie:focus { outline: none; border-color: var(--marque); box-shadow: 0 0 0 3px var(--marque-voile-bord); }
${p} .b3-msg-saisie:disabled { background: var(--fond); color: var(--encre-50); }
${p} .b3-msg-sous { display: flex; justify-content: space-between; gap: 8px; font-size: 0.8125rem; color: var(--encre-50); }
${p} .b3-msg-court { color: var(--ambre); font-weight: 600; }
${p} .b3-msg-metiers { border-radius: var(--rayon-bloc); border: 1px solid var(--filet); background: var(--surface); }
${p} .b3-msg-metiers summary, ${p} .b3-msg-exemples summary { min-height: var(--cible); display: flex; align-items: center; padding: 0 14px; cursor: pointer; font-weight: 600; color: var(--marque-fonce); }
${p} .b3-msg-metiers ul, ${p} .b3-msg-exemples ul { margin: 0; padding: 4px 14px 12px 32px; display: grid; gap: 6px; font-size: 0.95rem; }
${p} .b3-msg-case { display: flex; align-items: flex-start; gap: 10px; min-height: var(--cible); padding: 8px 2px; cursor: pointer; font-size: 0.95rem; line-height: 1.4; }
${p} .b3-msg-case input { width: 22px; height: 22px; margin: 0; flex: none; accent-color: var(--marque); }
${p} .b3-msg-prive { margin-top: -2px; }
${p} .b3-msg-resultat:empty { display: none; }
${p} .b3-msg-resultat { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: var(--rayon-bloc); border: 1px solid var(--filet); background: var(--surface); }
${p} .b3-msg-grille { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
${p} .b3-msg-grille li { display: flex; gap: 10px; align-items: flex-start; font-size: 0.95rem; line-height: 1.45; }
${p} .b3-msg-grille li > span:last-child { display: flex; flex-direction: column; gap: 2px; }
${p} .b3-msg-puce { width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; margin-top: 1px; }
${p} .b3-msg-puce svg { width: 15px; height: 15px; }
${p} .b3-msg-ok .b3-msg-puce { background: var(--juste-voile); color: var(--juste-fonce); }
${p} .b3-msg-ok b { font-weight: 600; color: var(--encre-70); }
${p} .b3-msg-arevoir .b3-msg-puce { background: var(--ambre-voile); color: var(--ambre); }
${p} .b3-msg-arevoir b { color: var(--ambre); }
${p} .b3-msg-conseil { color: var(--encre-70); }
${p} .b3-msg-limite { display: flex; gap: 8px; align-items: flex-start; color: var(--encre-50); }
${p} .b3-msg-limite svg { width: 16px; height: 16px; flex: none; margin-top: 2px; }
${p} .b3-msg-exemples { border-radius: var(--rayon-bloc); border: 1px solid var(--filet); background: var(--surface); }
`;
}
