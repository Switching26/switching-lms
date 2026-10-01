import { adresse, modeLMS } from '../../services/base.js';
// L'ACCUEIL APPRENANT : où j'en suis, ce que je fais maintenant, ce que je révise aujourd'hui.
import { e, coquille, chargement, COMPETENCES, duree, compte, pluriel } from '../ui.js';
import { chargerLecon, avancement } from '../donnees.js';
import { revisions } from '../../services/revisions.js';
import { carnet } from '../../services/carnet.js';
import { visuels } from '../../services/visuels.js';
import { icones } from '../../services/icones.js';
import { vignetteEtape } from '../vignettes.js';

const COULEURS = { ecouter: 'var(--c-ecouter)', lire: 'var(--c-lire)', parler: 'var(--c-parler)', ecrire: 'var(--c-ecrire)' };
const VOILES = { ecouter: 'var(--c-ecouter-voile)', lire: 'var(--c-lire-voile)', parler: 'var(--c-parler-voile)', ecrire: 'var(--c-ecrire-voile)' };

function salutation() {
  const h = Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(new Date()));
  return h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour';
}

export async function afficher(racine) {
  const aReviser = revisions.aReviser();
  const zone = coquille(racine, 'accueil', { aReviser: aReviser.length });
  chargement(zone);
  const [l] = await Promise.all([chargerLecon(true), visuels.charger()]);
  const a = avancement(l);
  const p = a.prochaine;
  // Photo d'ouverture de l'unité : l'image de bandeau de la leçon (D : `image_bandeau`), en version réduite.
  const photo = l.lecon.image_bandeau ? adresse(`vignettes/${l.lecon.image_bandeau}-grand.jpg`) : null;
  const mots = carnet.liste().length;
  const pct = Math.round(a.part * 100);
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date());

  zone.innerHTML = `
    <div class="entete-page">
      <span class="surtitre">${e(date)}</span>
      <h1>${salutation()}, votre anglais vous attend.</h1>
      <p>Niveau 1 · A1/A2 — 100 heures en ligne et 10 heures de visio avec votre formateur.</p>
    </div>
    <div class="grille-accueil">
      <section class="carte carte-niveau" aria-labelledby="t-niveau">
        ${photo ? `<div class="photo-ouverture" style="background-image:url('${e(photo)}')" role="img" aria-label="${e(l.lecon.sous_titre?.fr || 'Bristol')}"></div>` : ''}
        <div class="corps-niveau">
        <div class="ligne" style="margin-top:0">
          <div><span class="surtitre">Unité 1 en cours</span><h2 id="t-niveau" style="margin-top:6px">${e(l.lecon.titre?.fr || '')}</h2></div>
          <span class="pct">${pct}<small>&nbsp;%</small></span>
        </div>
        <div class="progression" style="margin-top:16px" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progression de l'unité 1"><span style="width:${pct}%"></span></div>
        <p class="petit discret" style="margin-top:8px">${compte(a.faites.length, 'étape')} sur ${a.etapes.length} · ${duree(a.minutesFaites)} sur ${duree(a.minutes)}</p>
        ${p ? `
        <div class="prochaine">
          ${vignetteEtape(p)}
          <div class="texte"><span class="petit">Prochaine étape · ${duree(p.duree_min)}</span><b>${e(p.titre || p.id)}</b></div>
        </div>
        <a class="btn btn-primaire btn-plein" href="#/etape/${e(p.id)}">${a.faites.length ? 'Reprendre' : 'Commencer'}${icones.suivant}</a>`
        : `<div class="encart encart-juste" style="margin-top:16px"><span><b>Unité terminée.</b> Votre bilan vous attend.</span></div>
        <a class="btn btn-primaire btn-plein" href="#/bilan">Voir mon bilan${icones.suivant}</a>`}
        </div>
      </section>
      <div class="carte pile-actions">
        <a class="carte-action" href="#/revisions">
          <span class="puce">${icones.cartes}</span>
          <span class="texte"><b>Révisions du jour</b><span class="petit discret" style="display:block">${aReviser.length ? `${compte(aReviser.length, 'carte')} à revoir, environ ${compte(revisions.minutesSeance(aReviser.length), 'minute')}` : 'Rien à revoir aujourd’hui'}</span></span>
          <span class="fleche">${icones.suivant}</span>
        </a>
        <a class="carte-action" href="#/carnet">
          <span class="puce">${icones.carnet}</span>
          <span class="texte"><b>Mon carnet</b><span class="petit discret" style="display:block">${mots ? `${compte(mots, 'mot')} ${pluriel(mots, 'gardé')}` : 'Gardez ici les mots que vous voulez retenir'}</span></span>
          <span class="fleche">${icones.suivant}</span>
        </a>
        <a class="carte-action" href="#/niveau">
          <span class="puce">${icones.carte}</span>
          <span class="texte"><b>Le niveau 1 en entier</b><span class="petit discret" style="display:block">24 unités, 6 tests, grammaire, vocabulaire, oral</span></span>
          <span class="fleche">${icones.suivant}</span>
        </a>
      </div>
    </div>
    <div class="section-titre"><h2>Vos 4 compétences</h2><span class="petit discret">sur l'unité 1</span></div>
    <div class="competences">
      ${Object.entries(COMPETENCES).map(([c, d]) => {
        const s = a.parComp[c];
        const note = s.moyenne == null ? '—' : `${Math.round(s.moyenne * 100)} %`;
        return `<div class="carte competence" style="color:${COULEURS[c]}">
          <div class="haut"><span class="puce" style="background:${VOILES[c]}">${d.icone}</span><b style="color:var(--encre)">${d.nom}</b></div>
          <div class="val"><b style="color:var(--encre)">${note}</b><span class="petit discret">${s.faites}/${s.total} étapes</span></div>
          <div class="progression" style="margin-top:8px" aria-hidden="true"><span style="width:${Math.round(s.part * 100)}%"></span></div>
        </div>`;
      }).join('')}
    </div>`;
}
