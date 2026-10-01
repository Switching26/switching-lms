import { modeLMS } from '../../services/base.js';
// LE BILAN DE FIN DE LEÇON (script/bilan.json de D) : score par compétence au barème de D, statut de la
// leçon, familles d'erreurs classées et EXPLIQUÉES avec quoi revoir, conseils, fiche pour le formateur.
// Chez le concurrent, la page de résultats n'affiche que des pourcentages par exercice.
import { e, coquille, chargement, COMPETENCES, anneau, duree, compte, pluriel } from '../ui.js';
import { chargerLecon, avancement } from '../donnees.js';
import { scriptOptionnel } from '../../services/script.js';
import { lire } from '../../services/stockage.js';
import { revisions } from '../../services/revisions.js';
import { icones } from '../../services/icones.js';
import { familleDe } from '../familles-erreurs.js';

const COULEURS = { ecouter: 'var(--c-ecouter)', lire: 'var(--c-lire)', parler: 'var(--c-parler)', ecrire: 'var(--c-ecrire)' };
const COULEUR_ETAT = { vert: 'var(--juste-fonce)', orange: 'var(--ambre)', rouge: 'var(--faux-fonce)' };
export const CLE_TEST = 'bilan-test-l01';


/** Scores au barème de D. Seules les réussites au premier essai comptent : c'est le score rapporté par l'activité. */
function calculer(l, bilan, test) {
  const a = avancement(l);
  const comps = {};
  for (const c of bilan?.calcul?.competences || []) {
    let gagne = 0; let possible = 0; let enAttente = 0;
    for (const src of c.sources || []) {
      if (src.etape === 'BILAN') {
        const ids = String(src.items || '').match(/T-\d/g) || [];
        for (const id of ids) {
          const part = src.points / ids.length;
          if (test?.[id] === undefined) enAttente += part; else { possible += part; if (test[id] === true) gagne += part; }
        }
        continue;
      }
      const s = a.etat.etapes[src.etape];
      if (s?.termine && typeof s.score === 'number') { possible += src.points; gagne += src.points * s.score; }
      else if (!s?.termine) enAttente += src.points;
    }
    comps[c.id] = { nom: c.nom, gagne, possible, total: c.total, enAttente, pct: possible ? Math.round((gagne / possible) * 100) : null };
  }
  const seuils = bilan?.seuils?.par_competence || [{ min_pct: 80, etat: 'Acquis', couleur: 'vert' }, { min_pct: 60, etat: 'En cours', couleur: 'orange' }, { min_pct: 0, etat: 'À revoir', couleur: 'rouge' }];
  const tries = [...seuils].sort((x, y) => y.min_pct - x.min_pct);
  for (const c of Object.values(comps)) c.seuil = c.pct == null ? null : tries.find((s) => c.pct >= s.min_pct);
  const G = Object.values(comps).reduce((s, c) => s + c.gagne, 0);
  const P = Object.values(comps).reduce((s, c) => s + c.possible, 0);
  const totalPct = P ? Math.round((G / P) * 100) : null;
  const toutFait = a.etapes.every((x) => a.etat.etapes[x.id]?.termine || x.id === 'BILAN');
  const sous50 = Object.values(comps).some((c) => c.pct != null && c.pct < 50);
  const statut = !toutFait ? 'en_cours' : totalPct != null && totalPct >= 70 && !sous50 ? 'validee' : 'a_consolider';
  return { a, comps, totalPct, statut };
}

export async function rendreBilan(el, l, opts = {}) {
  const bilanScript = await scriptOptionnel('bilan.json');
  const bilan = bilanScript?.etapes?.find((x) => x.type === 'bilan') || null;
  const test = opts.test || lire(CLE_TEST, null);
  const { a, comps, totalPct, statut } = calculer(l, bilan, test);
  const familles = bilan?.erreurs?.familles || [];

  const erreurs = [];
  // Le temps de l'étape en cours n'est versé qu'en la quittant : on l'ajoute pour l'affichage.
  let secondes = opts.secondesEnCours || 0; let sansNote = 0;
  for (const x of l.etapes) {
    const s = a.etat.etapes[x.id];
    if (!s) continue;
    secondes += s.duree_s || 0;
    if (s.termine && s.score == null && x.id !== 'BILAN' && x.regime !== 'comprendre') sansNote += 1;
    for (const er of s.erreurs || []) erreurs.push({ ...er, etapeId: x.id, etape: x });
  }
  const parFamille = new Map();
  for (const er of erreurs) {
    const f = familleDe(er, familles);
    if (!parFamille.has(f)) parFamille.set(f, []);
    parFamille.get(f).push(er);
  }
  const rangees = [...parFamille.entries()].sort((x, y) => y[1].length - x[1].length);
  const titreEtape = (id) => l.etapes.find((x) => x.id === id)?.titre || id;
  const STATUTS = {
    validee: ['Leçon validée', 'var(--juste-fonce)', 'var(--juste-voile)'],
    a_consolider: ['Leçon terminée, à consolider', 'var(--ambre)', 'var(--ambre-voile)'],
    en_cours: [`Leçon en cours · ${compte(a.faites.length, 'étape')} sur ${a.etapes.length}`, 'var(--marque-tres-fonce)', 'var(--marque-voile)'],
  };
  const [libStatut, encreStatut, fondStatut] = STATUTS[statut];
  const conseils = bilan?.conseils_par_competence || {};
  const aConseiller = Object.entries(comps).filter(([, c]) => c.seuil && c.seuil.min_pct < 80);

  el.innerHTML = `
    <div class="carte" style="padding:18px;background:${fondStatut};border-color:transparent;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center">
      <b style="color:${encreStatut};font-size:1.1rem">${e(libStatut)}</b>
      ${totalPct != null ? `<span style="color:${encreStatut}">${totalPct} % des points sur ce qui est fait</span>` : ''}
      <span class="discret">${duree(Math.round(secondes / 60))} de travail</span>
      ${sansNote ? `<span class="discret">${sansNote} étape${sansNote > 1 ? 's' : ''} faite${sansNote > 1 ? 's' : ''} en mode écoute, non notée${sansNote > 1 ? 's' : ''}</span>` : ''}
    </div>
    <div class="bilan-scores" style="margin-top:12px">
      ${Object.entries(COMPETENCES).map(([c, d]) => {
        const s = comps[c] || { pct: null };
        return `<div class="carte jauge">${anneau(s.pct == null ? null : s.pct / 100, COULEURS[c])}
          <div><b>${d.nom}</b>
          <span class="petit" style="display:block;color:${s.seuil ? COULEUR_ETAT[s.seuil.couleur] || 'var(--encre-70)' : 'var(--encre-50)'};font-weight:600">${s.seuil ? e(s.seuil.etat) : 'Pas encore évalué'}</span>
          <span class="petit discret" style="display:block">${s.seuil?.message ? e(s.seuil.message) : s.total ? (Math.round(s.enAttente) ? `${compte(Math.round(s.enAttente), 'point')} sur ${s.total} ${pluriel(Math.round(s.enAttente), 'reste', 'restent')} à jouer` : 'Tous les points sont joués') : ''}</span></div></div>`;
      }).join('')}
    </div>

    <div class="section-titre"><h2>Vos erreurs, classées et expliquées</h2><span class="petit discret">${erreurs.length}</span></div>
    ${rangees.length ? `<div class="pile">${rangees.map(([fid, liste]) => {
      const f = familles.find((x) => x.id === fid) || { nom: 'Autres erreurs', pourquoi: '' };
      const ex = liste[liste.length - 1];
      return `<div class="carte erreur-bilan">
        <div class="tete"><b>${e(f.nom)}</b><span class="pastille pastille-neutre">${liste.length} erreur${liste.length > 1 ? 's' : ''}</span></div>
        ${f.pourquoi ? `<span class="explication">${e(f.pourquoi)}</span>` : ''}
        ${ex ? `<span class="petit">${ex.element ? `<span lang="en">${e(ex.element)}</span> · ` : ''}${ex.donne != null ? `Votre réponse : <span class="donne" lang="en">${e(ex.donne)}</span>` : ''}${ex.attendu != null ? ` · Attendu : <span class="attendu" lang="en">${e(ex.attendu)}</span>` : ''}</span>` : ''}
        ${ex?.explication ? `<span class="explication">${e(ex.explication)}</span>` : '<span class="explication"><i>Erreur non expliquée par l’activité.</i></span>'}
        <span style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${(f.revoir || []).map((id) => `<a class="btn btn-secondaire" href="#/etape/${e(id)}">${icones.indice}<span>Revoir : ${e(titreEtape(id))}</span></a>`).join('')}</span>
      </div>`;
    }).join('')}</div>`
      : `<p class="discret">${a.faites.length ? 'Aucune erreur au premier essai pour l’instant.' : 'Faites quelques étapes : vos erreurs s’y rangeront, chacune avec son explication et ce qu’il faut revoir.'}</p>`}

    ${aConseiller.length ? `<div class="section-titre"><h2>Nos conseils</h2></div>
    <div class="pile">${aConseiller.map(([c]) => `<div class="carte" style="padding:14px 16px;display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap"><span class="pastille pastille-${c}">${e(COMPETENCES[c]?.nom || c)}</span><span style="flex:1;min-width:200px">${e(conseils[c] || '')}</span></div>`).join('')}</div>` : ''}

    ${bilan?.fiche_visio ? `<div class="section-titre"><h2>${e(bilan.fiche_visio.titre)}</h2></div>
    <div class="carte" style="padding:16px">
      <ul style="margin:0;padding-left:18px;display:grid;gap:6px">${bilan.fiche_visio.contenu.map((c) => `<li>${e(c)}</li>`).join('')}</ul>
      ${rangees.length ? `<p class="petit" style="margin-top:10px"><b>Vos familles d'erreurs les plus fréquentes :</b> ${rangees.slice(0, 3).map(([fid]) => e(familles.find((x) => x.id === fid)?.nom || 'Autres')).join(' · ')}</p>` : ''}
      <p class="petit discret" style="margin-top:10px">${e(bilan.fiche_visio.usage)}</p>
    </div>` : ''}

    ${bilan?.prochaine_etape ? `<div class="section-titre"><h2>Et ensuite</h2></div>
    <div class="pile">
      <a class="carte carte-survol carte-action" href="#/revisions"><span class="puce">${icones.cartes}</span><span class="texte"><b>Vos révisions</b><span class="petit discret" style="display:block">${e(bilan.prochaine_etape.revisions)}</span></span><span class="fleche">${icones.suivant}</span></a>
      <div class="carte carte-action" aria-disabled="true"><span class="puce" style="background:#F2F0EB;color:var(--encre-50)">${icones.cadenas}</span><span class="texte"><b>Leçon 2 · ${e(bilan.prochaine_etape.lecon_suivante?.titre_fr || '')}</b><span class="petit discret" style="display:block">${e(bilan.prochaine_etape.lecon_suivante?.lien_fil_rouge || '')}</span></span></div>
    </div>` : ''}

    ${!modeLMS && opts.comparaison !== false ? `<div class="section-titre"><h2>Chez Reflex'English</h2></div>
    <div class="carte" style="padding:16px;display:grid;gap:12px">
      <p>${e(bilan?.comparaison_resultats || 'Leur page de résultats n’affiche que des scores.')}</p>
      <figure class="capture" style="margin:0;max-width:520px"><img src="./captures/reflex/Y-Results.webp" alt="Page de résultats de Reflex'English" loading="lazy"><figcaption>Leur page de résultats (capture d'août 2026)</figcaption></figure>
    </div>` : ''}`;
  return { statut, totalPct, comps, bilan };
}

export async function afficher(racine) {
  const zone = coquille(racine, 'niveau', { aReviser: revisions.aReviser().length });
  chargement(zone);
  const l = await chargerLecon(true);
  zone.innerHTML = `<a class="btn btn-fantome" href="#/lecon" style="margin:-6px 0 10px -10px">${icones.retour}<span>La leçon</span></a>
    <div class="entete-page"><span class="surtitre">Unité 1 · bilan</span><h1>Votre bilan</h1>
    <p>Vos résultats par compétence, chaque erreur rangée et expliquée, et ce que nous vous conseillons de revoir.</p></div><div data-bilan></div>`;
  await rendreBilan(zone.querySelector('[data-bilan]'), l);
}
