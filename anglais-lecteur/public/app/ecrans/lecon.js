import { adresse, modeLMS } from '../../services/base.js';
import { relectureAutorisee } from '../../services/droits-lms.js';
import { unite, lien, medias } from '../../services/unite.js';
// LA PAGE DE LA LEÇON : bandeau, promesse, séquences et étapes (durée, compétence, état).
import { e, coquille, chargement, duree, pastilleCompetence, REGIMES, compte } from '../ui.js';
import { chargerLecon, avancement } from '../donnees.js';
import { visuels } from '../../services/visuels.js';
import { revisions } from '../../services/revisions.js';
import { icones } from '../../services/icones.js';
import { voix } from '../../services/voix.js';
import { guide } from '../../services/guide.js';
import { lire, ecrire } from '../../services/stockage.js';
import { vignetteEtape } from '../vignettes.js';
import { ressourcesUnite, ressourcesHTML, brancherMots } from '../mots-a-retenir.js';

export async function afficher(racine) {
  const zone = coquille(racine, 'niveau', { aReviser: revisions.aReviser().length });
  chargement(zone);
  const [l] = await Promise.all([chargerLecon(true), visuels.charger()]);
  if (l.en_preparation) { zone.innerHTML = `<div class="carte" style="padding:24px"><h1>${e(unite())} · en préparation</h1><p>Ce contenu est encore en cours de rédaction.</p><a href="#/niveau">Revenir à la carte du niveau</a></div>`; return; }
  const a = avancement(l);
  const L = l.lecon;
  const [ressources] = await Promise.all([ressourcesUnite(l), voix.recharger().catch(() => null)]);
  const test = L.nature === 'test' || /^T|^EVAL/.test(unite());
  const image = visuels.image(L.image_bandeau);
  const reprise = a.prochaine;
  const cta = a.faites.length === 0 ? 'Commencer la leçon' : reprise ? 'Reprendre la leçon' : 'Revoir la leçon';
  const cible = reprise ? reprise.id : l.etapes[0]?.id;
  // Photo d'ouverture du chapitre : l'image de bandeau de D, réduite (repli : l'originale de V).
  const photo = unite() === 'U01' && L.image_bandeau ? adresse(`vignettes/${L.image_bandeau}-grand.jpg`) : image;
  // Les grandes phases de la leçon (séquences de D) : étapes faites / total, pour l'aperçu du parcours.
  const phases = L.sequences.map((s, i) => {
    const ids = s.etapes.filter((id) => l.etapes.some((y) => y.id === id));
    const faites = ids.filter((id) => a.etat.etapes[id]?.termine).length;
    const minutes = ids.reduce((t, id) => t + (l.etapes.find((y) => y.id === id)?.duree_min || 0), 0);
    return { s, i, ids, faites, minutes };
  });
  zone.innerHTML = `
    ${modeLMS ? '' : `<a class="btn btn-fantome retour-niveau" href="#/niveau">${icones.retour}<span>Niveau 1</span></a>`}
    <article class="carte lecon-tete">
      <div class="image" ${photo ? `style="background-image:url('${e(photo)}')"` : ''} role="img" aria-label="${e(L.sous_titre?.fr || '')}"></div>
      <div class="corps">
        <div class="chapitre-tete">
          <span class="chapitre-num" aria-hidden="true">${e(unite().replace(/^U0/, 'U'))}</span>
          <div>
            <span class="surtitre">${e(/^U/.test(unite()) ? `Unité ${Number(unite().slice(1))}` : L.dossier)} · ${e(L.niveau || 'A1')}</span>
            <h1>${e(L.titre?.fr || L.titre || '')}</h1>
            <p class="titre-en" lang="en">${e(L.titre?.en || '')}</p>
          </div>
        </div>
        <dl class="chiffres">
          <div><dt>Durée</dt><dd>${duree(L.duree_min)}</dd></div>
          <div><dt>Étapes</dt><dd>${l.etapes.length}</dd></div>
          <div><dt>Fait</dt><dd>${Math.round(a.part * 100)} %</dd></div>
        </dl>
        <div class="actions">
          ${cible ? `<a class="btn btn-primaire" href="${lien(`etape/${e(cible)}`)}">${cta}${icones.suivant}</a>` : ''}
          <button type="button" class="btn btn-secondaire" data-voix data-ouverture hidden>${icones.ecouter}<span class="ouverture-libelle"><span data-ouverture-texte>Écouter la présentation</span><span aria-hidden="true" class="ouverture-reserve">Écouter la présentation</span></span></button>
        </div>
        ${L.promesse ? `<div class="objectifs-lecon"><span class="surtitre-encre">Objectifs de la leçon</span><p class="promesse">${e(L.promesse)}</p></div>` : ''}
      </div>
    </article>
    ${test && unite().startsWith('EVAL') && relectureAutorisee() ? '<button class="btn btn-secondaire" data-mode-relecture>Choisir la relecture auteur</button>' : ''}
    ${test ? `<p class="carte" style="padding:16px;margin-top:16px">Évaluation · ${L.evaluation?.duree_min || L.duree_min} minutes prévues. ${L.evaluation?.mode_fidele_disponible === false ? (relectureAutorisee() ? 'Contenu à intégrer : mode noté bloqué, relecture auteur disponible.' : 'Évaluation actuellement indisponible.') : 'Aucune correction avant remise.'}</p>` : ''}
    ${L.unites_liees?.length ? `<p style="margin-top:16px">Unités liées : ${L.unites_liees.map(id => `<a href="${lien('', id)}">${e(id)}</a>`).join(' · ')}</p>` : ''}
    ${ressourcesHTML(ressources)}
    <section class="parcours-apercu" aria-labelledby="t-parcours">
      <h2 class="titre-filet" id="t-parcours">Le parcours en ${compte(phases.length, 'phase')}</h2>
      <ol class="phases">
        ${phases.map((f) => {
          const cls = f.ids.length && f.faites === f.ids.length ? 'faite' : f.faites ? 'encours' : '';
          const part = f.ids.length ? Math.round((f.faites / f.ids.length) * 100) : 0;
          return `<li class="phase ${cls}" style="--part:${part}%">
            <span class="n">${String(f.i + 1).padStart(2, '0')}</span>
            <span class="t">${e(f.s.titre)}</span>
            <span class="m">${f.faites}/${f.ids.length} · ${duree(f.minutes)}</span>
            <span class="etat-phase" role="img" aria-label="${cls === 'faite' ? 'phase terminée' : `${f.faites} sur ${f.ids.length} étapes faites`}">${icones.coche}</span>
          </li>`;
        }).join('')}
      </ol>
    </section>
    ${phases.map(({ s, i, ids, minutes }) => `
      <section class="sequence">
        <header class="sequence-tete"><span class="n">${String(i + 1).padStart(2, '0')}</span><h2>${e(s.titre)}</h2><span class="meta">${compte(ids.length, 'étape')} · ${duree(minutes)}</span></header>
        <div class="etapes">
          ${s.etapes.map((id) => {
            const x = l.etapes.find((y) => y.id === id);
            if (!x) return '';
            const st = a.etat.etapes[id];
            const cls = st?.termine ? 'faite' : reprise?.id === id ? 'courante' : '';
            return `<a class="ligne-etape ${cls} ${x.disponible ? '' : 'construction'}" href="${lien(`etape/${e(id)}`)}">
              ${vignetteEtape(x)}
              <span class="texte"><b>${e(x.titre || id)}</b>
                <span class="sous"><span class="regime regime-${e(x.regime)}">${e(REGIMES[x.regime] || '')}</span>
                  <span>${duree(x.duree_min)}</span>${(x.competences || []).slice(0, 1).map(pastilleCompetence).join('')}
                  ${x.disponible ? '' : '<span>en construction</span>'}</span></span>
              <span class="etat" role="img" aria-label="${st?.termine ? 'étape faite' : reprise?.id === id ? 'étape à faire maintenant' : 'étape à faire'}">${st?.termine ? icones.coche : reprise?.id === id ? icones.lecture : ''}</span>
            </a>`;
          }).join('')}
        </div>
      </section>`).join('')}
    <div class="bas-lecon">
      <a class="btn btn-secondaire" href="${lien('bilan')}">Voir mon bilan</a>
      ${modeLMS ? `<a class="btn btn-secondaire" href="#/revisions">Révisions</a><a class="btn btn-secondaire" href="#/carnet">Mon carnet</a>` : `<a class="btn btn-fantome" href="#/banc">Banc d'essai</a>`}
    </div>
    ${modeLMS ? `<nav class="navigation-chapitres" aria-label="Chapitres"><button class="btn btn-fantome" data-lms-vers="chapitre-precedent">Précédent</button><button class="btn btn-fantome" data-lms-vers="mes-formations">Mes formations</button><button class="btn btn-secondaire" data-lms-vers="chapitre-suivant">Suivant</button></nav>` : ''}`;

  zone.querySelector('[data-mode-relecture]')?.addEventListener('click', () => { ecrire(`eval-mode:${unite()}`, 'relecture'); if(cible)location.hash=lien(`etape/${cible}`); });

  // La présentation de la leçon, par la voix du LMS (voix_ouverture de D) : proposée d'un bouton, et
  // jouée d'elle-même à la toute première visite. Elle s'arrête dès qu'on touche autre chose.
  const couperMots = brancherMots(zone);
  let ouvertureTimer;
  const sequence = L.voix_ouverture?.sequence || [];
  const btn = zone.querySelector('[data-ouverture]');
  if (sequence.some((s) => voix.info(s.id))) {
    btn.hidden = false;
    const jouer = () => { btn.querySelector('[data-ouverture-texte]').textContent = 'Arrêter'; guide.dire(sequence).then(() => { btn.querySelector('[data-ouverture-texte]').textContent = 'Écouter la présentation'; }); };
    btn.addEventListener('click', () => { if (guide.etat().enLecture) guide.arreter(); else jouer(); });
    if (!lire('ouverture-entendue', false) && !guide.estCoupe()) { ecrire('ouverture-entendue', true); ouvertureTimer = setTimeout(jouer, 600); }
  }
  const couper = (ev) => { if (!ev.target.closest('[data-voix]')) guide.arreter(); };
  zone.addEventListener('pointerdown', couper, true);
  return () => { clearTimeout(ouvertureTimer); guide.arreter(); couperMots(); zone.removeEventListener('pointerdown', couper, true); };
}
