// CLASSEMENT DES ERREURS dans les familles du bilan (script/bilan.json de D). Module pur, testé par
// tools/qa/familles.test.mjs. Ordre de décision (recette Q n° 16) :
//   1. la famille déclarée par l'activité (famille_erreur) ;
//   2. la VRAIE différence entre la réponse attendue et la réponse donnée ;
//   3. l'explication affichée à l'apprenant ;
//   4. l'exercice, seulement s'il ne relève que d'une famille et qu'il n'y a rien d'autre à lire ;
//   sinon « Autres » — jamais une famille choisie au hasard parmi celles de l'exercice.

const norm = (t) => String(t ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
const mots = (t) => norm(t).split(' ').filter(Boolean);
const ARTICLES = new Set(['a', 'an', 'the']);
const BE = new Set(['am', 'is', 'are', 'be', "'m", "'s", "'re", "i'm", "you're", "he's", "she's", "it's", "we're", "they're", 'was', 'were']);
const HOMOPHONES = [['his', "he's"], ['your', "you're"], ['its', "it's"], ['there', "they're"], ['their', "they're"], ['there', 'their']];
const FORMULES = /\b(good (morning|afternoon|evening|night)|hello|hi|hey|goodbye|bye|see you|nice to meet you|how are you|thanks?|thank you|sorry|excuse me|please|welcome)\b/;

export function familleDe(er, familles) {
  const existe = (id) => familles.some((f) => f.id === id);
  const si = (id) => (existe(id) ? id : null);
  if (er.famille_erreur && existe(er.famille_erreur)) return er.famille_erreur;
  if (/^pro-/i.test(er.etapeId || '') && existe('prononciation')) return 'prononciation';

  const brutA = String(er.attendu ?? '').trim();
  const brutD = String(er.donne ?? '').trim();
  const a = norm(brutA);
  const d = norm(brutD);
  if (a && d) {
    if (a === d) return brutA.toLowerCase() === brutD.toLowerCase() && brutA !== brutD ? si('majuscules') || 'autres' : 'autres';
    if (a.replace(/'/g, '') === d.replace(/'/g, '')) return si('apostrophe') || 'autres';
    const mA = mots(a); const mD = mots(d);
    const retires = mA.filter((w) => !mD.includes(w));
    const ajoutes = mD.filter((w) => !mA.includes(w));
    const ecart = [...retires, ...ajoutes];
    const dans = (ens) => ecart.length > 0 && ecart.every((w) => ens.has(w));
    if (HOMOPHONES.some(([x, y]) => (retires.includes(x) && ajoutes.includes(y)) || (retires.includes(y) && ajoutes.includes(x)))) return si('homophones') || 'autres';
    if (dans(ARTICLES)) return si('article_metier') || 'autres';
    if (dans(BE)) return (/\band\b/.test(norm(er.element)) && si('sujet_compose')) || si('am_is_are') || 'autres';
    if (retires.includes('it') && ajoutes.some((w) => w === 'he' || w === 'she')) return si('genre_objet') || 'autres';
    if (dans(new Set(['we', 'they']))) return si('we_they') || 'autres';
    if (FORMULES.test(a) || FORMULES.test(d)) return si('formules') || 'autres';
  }
  const x = norm(er.explication);
  if (x) {
    if (/devant un (son de )?voyelle|\ba ou an\b|\barticle\b/.test(x)) return si('article_metier') || 'autres';
    if (/majuscule/.test(x)) return si('majuscules') || 'autres';
    if (/apostrophe/.test(x)) return si('apostrophe') || 'autres';
    if (/\bsalu|en arrivant|en partant|au revoir|\bformule|politesse/.test(x)) return si('formules') || 'autres';
    if (/\bun objet\b|n'a pas de genre/.test(x)) return si('genre_objet') || 'autres';
  }
  const candidates = familles.filter((f) => (f.exercices || []).includes(er.etapeId));
  if (candidates.length === 1 && !a && !d) return candidates[0].id;
  return 'autres';
}
