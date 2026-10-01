import { adresse, modeLMS } from '../../services/base.js';
import { unite, lien, medias } from '../../services/unite.js';
// LE LECTEUR D'ÉTAPE — commun à toutes les activités (voir CONTRAT-ACTIVITES.md).
//
// Il affiche l'en-tête (séquence, progression, guide vocal, comparaison), la consigne et l'objectif
// de l'étape, monte l'activité dans sa zone, et la démonte proprement : plus aucun son, micro fermé,
// écouteurs retirés, au changement d'étape comme à la sortie.
import { e, REGIMES, chargement, pastilleCompetence } from '../ui.js';
import { chargerLecon } from '../donnees.js';
import { services } from '../../services/index.js';
import { script, scriptOptionnel, segment, rafraichirScript } from '../../services/script.js';
import * as progression from '../../services/progression.js';
import { icones } from '../../services/icones.js';
import { ouvrirComparaison } from './comparaison.js';

const { audio, guide, micro, voix, visuels, stockage, retour } = services;

export async function afficher(racine, id) {
  chargement(racine, 'Préparation de l’étape…');
  rafraichirScript();
  const [l] = await Promise.all([chargerLecon(true), voix.recharger(), visuels.charger()]);
  const idx = l.etapes.findIndex((x) => x.id === id);
  if (idx < 0) {
    racine.innerHTML = `<main class="contenu"><div class="carte panne"><h2>Étape introuvable</h2><p class="discret" style="margin-top:8px">L'étape « ${e(id)} » n'existe pas dans cette leçon.</p><a class="btn btn-secondaire" style="margin-top:16px" href="${lien()}">Revenir à la leçon</a></div></main>`;
    return null;
  }
  const etape = { ...l.etapes[idx] };
  // `?module=socle` : joue la version de référence du socle à la place de celle du constructeur (comparaison).
  if (/[?&]module=socle/.test(location.hash) && etape.type) {
    Object.assign(etape, { module: `/activities/socle/${etape.type}.js`, activite: `socle.${etape.type}`, par: 'socle', disponible: true });
  }
  const precedente = l.etapes[idx - 1] || null;
  const suivante = l.etapes[idx + 1] || null;
  const sequence = l.lecon.sequences.find((s) => s.id === etape.sequence);
  const banc = /[?&]banc=1/.test(location.hash);

  let donnees = null;
  if (etape.fichier) {
    donnees = ((await scriptOptionnel(etape.fichier))?.etapes || []).find((x) => x.id === etape.id) || null;
  }
  const regime = donnees?.regime || etape.regime || 'a_vous_de_jouer';
  const consigne = donnees?.consigne || null;
  const objectif = donnees?.objectif_apprenant || etape.objectif_apprenant || null;

  // Activité large (la vidéo) : la colonne passe de 760 à 992 px, toujours centrée sur le même axe.
  const large = etape.famille === 'video';
  racine.innerHTML = `
  <div class="lecteur${large ? ' large' : ''}" data-etape="${e(etape.id)}">
    <header class="lecteur-haut">
      <div class="rang">
        <a class="btn-icone" href="${lien()}" aria-label="Fermer l'étape et revenir à la leçon">${icones.fermer}</a>
        <div class="titre-seq">
          <small>${e(sequence?.titre || '')} · étape ${etape.rang} sur ${l.etapes.length}</small>
          <b>${e(etape.titre || '')}</b>
        </div>
        <button class="btn-icone" type="button" data-voix data-guide aria-label="Guide vocal" hidden>${icones.voix}<span class="onde"></span></button>
        ${modeLMS ? `<span class="outils-lms"><button type="button" class="btn btn-secondaire" data-lms-outil="notes" aria-label="Notes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M15 3H5v18h14V7zM14 3v5h5"/></svg><span>Notes</span></button><button type="button" class="btn btn-secondaire" data-lms-outil="ressources" aria-label="Ressources"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 0 0 8.485 8.485l8.379-8.551"/></svg><span>Ressources</span></button></span>` : `        <button class="btn btn-secondaire btn-comparer" type="button" data-voix data-comparer>${icones.comparer}<span>Comparer avec Reflex'English</span></button>
        <button class="btn-icone btn-comparer-icone" type="button" data-voix data-comparer aria-label="Comparer avec Reflex'English">${icones.comparer}</button>`}

      </div>
      <div class="progression" aria-hidden="true"><span style="width:${(etape.rang - 1) / l.etapes.length * 100}%"></span></div>
    </header>
    <main class="lecteur-corps">
      <section class="consigne-etape" data-entete>
        <span class="regime regime-${e(regime)}">${e(REGIMES[regime] || 'À vous de jouer')}</span>
        <h1>${e(donnees?.titre || etape.titre || '')}</h1>
        ${objectif ? `<p class="objectif">${icones.coche}<span><b>Objectif</b> ${e(objectif)}</span></p>` : ''}
        ${consigne?.fr ? `<p class="consigne">${e(consigne.fr)}${consigne.en ? `<span class="en" lang="en">${e(consigne.en)}</span>` : ''}</p>` : ''}
      </section>
      <div class="zone-activite"></div>
      <div class="zone-retour"></div>
      <div class="visuellement-cache" aria-live="polite" data-annonce></div>
    </main>
    <footer class="lecteur-bas"><div class="rang">
      ${precedente ? `<a class="btn btn-secondaire" href="${lien(`etape/${e(precedente.id)}`)}" aria-label="Étape précédente">${icones.retour}<span class="visuellement-cache">Précédente</span></a>` : ''}
      <span class="etat-etape" data-etat></span>
      <span class="espace"></span>
      <a class="btn btn-fantome" data-passer href="${suivante ? lien(`etape/${e(suivante.id)}`) : lien()}">Passer l'étape</a>
      <a class="btn btn-primaire" data-continuer href="${suivante ? lien(`etape/${e(suivante.id)}`) : lien()}" hidden>${suivante ? 'Continuer' : 'Terminer la leçon'}${icones.suivant}</a>
    </div></footer>
  </div>`;

  const q = (s) => racine.querySelector(s);
  const zone = q('.zone-activite');
  retour.definirZone(q('[data-annonce]'));

  // ── Guide vocal ────────────────────────────────────────────────────────
  const btnGuide = q('[data-guide]');
  const majGuide = (g) => {
    btnGuide.hidden = !g.disponible;
    btnGuide.classList.toggle('actif', !g.coupe);
    btnGuide.classList.toggle('parle', g.enLecture);
    btnGuide.innerHTML = `${g.coupe ? icones.voixCoupee : icones.voix}<span class="onde"></span>`;
    btnGuide.setAttribute('aria-label', g.coupe ? 'Remettre le guide vocal' : g.enLecture ? 'Arrêter le guide vocal' : g.bloque ? 'Activer la voix' : 'Réécouter la consigne');
    btnGuide.setAttribute('aria-pressed', String(!g.coupe));
  };
  const desabonnerGuide = guide.surChangement(majGuide);
  btnGuide.addEventListener('click', () => {
    const g = guide.etat();
    if (g.coupe) guide.basculer();
    else if (g.enLecture) guide.arreter();
    else guide.rejouer();
  });
  // Appui long ou double action inutiles : un second bouton explicite coupe définitivement.
  btnGuide.addEventListener('contextmenu', (ev) => { ev.preventDefault(); guide.basculer(); });
  guide.planifier(donnees?.voix_consigne || null);
  majGuide(guide.etat());

  // Le premier geste de l'apprenant dans l'activité arrête le guide (sauf les commandes marquées data-voix).
  const arretGeste = (ev) => { if (!ev.target.closest('[data-voix]')) guide.arreter(); };
  zone.addEventListener('pointerdown', arretGeste, true);
  zone.addEventListener('keydown', arretGeste, true);

  // ── Comparaison ────────────────────────────────────────────────────────
  for (const b of racine.querySelectorAll('[data-comparer]')) b.addEventListener('click', () => ouvrirComparaison(etape, donnees));

  if (unite() !== 'U01') for (const b of racine.querySelectorAll('[data-comparer]')) b.hidden = true;

  // ── Suivi ─────────────────────────────────────────────────────────────
  const debut = Date.now();
  progression.ouvrir(etape.id);
  const etatEl = q('[data-etat]');
  const btnContinuer = q('[data-continuer]');
  const btnPasser = q('[data-passer]');
  const marquerFini = () => {
    btnContinuer.hidden = false;
    btnContinuer.classList.add('pret');
    btnPasser.hidden = true;
    etatEl.textContent = 'Étape terminée';
  };
  if (progression.lireEtat().etapes[etape.id]?.termine) marquerFini();

  // ── Montage de l'activité ─────────────────────────────────────────────
  const controleur = new AbortController();
  const nettoyages = [];
  let instance = null;
  const typeAct = etape.activite || `${etape.famille}.${etape.type}`;
  const [famille, nomType] = typeAct.split('.');

  const ctx = {
    etape: { ...etape },
    donnees,
    unite: unite(),
    medias: await medias(),
    params: {},
    regime,
    mode: banc ? 'banc' : 'lecon',
    script,
    segment,
    image: (idImage) => visuels.image(idImage),
    asset: adresse,
    signal: controleur.signal,
    surDemontage: (f) => { if (typeof f === 'function') nettoyages.push(f); },
    ajouterStyle(css, cle = '') {
      const id = cle ? `${typeAct}:${cle}` : typeAct;
      if (document.head.querySelector(`style[data-act="${CSS.escape(id)}"]`)) return;
      const s = document.createElement('style');
      s.dataset.act = id;
      s.textContent = css;
      document.head.append(s);
    },
    chargerCss(url) {
      const existant = document.head.querySelector(`link[data-act-css="${CSS.escape(url)}"]`);
      if (existant) return Promise.resolve();
      return new Promise((ok) => {
        const lk = document.createElement('link');
        lk.rel = 'stylesheet'; lk.href = adresse(url); lk.dataset.actCss = url;
        lk.onload = () => ok(); lk.onerror = () => ok();
        document.head.append(lk);
      });
    },
    stockage: stockage.espace(unite() === 'U01' ? `act:${typeAct}` : `act:${unite()}:${typeAct}`),
    tracer: (ev, d = {}) => progression.tracer(ev, { etape: etape.id, ...d }),
    signaler: {
      pret() { zone.dataset.pret = '1'; },
      progression(v) {
        const p = Math.max(0, Math.min(1, Number(v) || 0));
        q('.lecteur-haut .progression > span').style.width = `${(etape.rang - 1 + p) / l.etapes.length * 100}%`;
      },
      essai(d = {}) {
        const comp = d.competence || etape.competences?.[0] || null;
        progression.essai(etape.id, { ...d, competence: comp, remediation: d.remediation || donnees?.remediation || null });
      },
      aide(d = {}) { progression.aide(etape.id, d.niveau); },
      solution(d = {}) { progression.solution(etape.id, d.item); },
      fin(d = {}) { progression.fin(etape.id, d); marquerFini(); },
    },
    services,
  };

  if (!etape.disponible) {
    zone.innerHTML = `<div class="carte construction-carte">
      <div class="puce">${icones.horloge}</div>
      <h2>Cette activité est en construction</h2>
      <p class="discret" style="margin-top:8px">${e(etape.raison || 'Elle arrive bientôt.')}</p>
      ${etape.type ? `<p class="petit discret" style="margin-top:8px">Type prévu : ${e(etape.type)}</p>` : ''}
    </div>`;
  } else {
    zone.innerHTML = `<div class="activite act-${e(famille)}-${e(nomType)}"></div>`;
    const racineAct = zone.firstElementChild;
    try {
      const module = unite().startsWith('EVAL') ? '/activities/multi/eval-passation.js' : unite() !== 'U01' && etape.type === 'mission' ? '/activities/multi/mission.js' : l.lecon.nature === 'test' || /^T|^EVAL/.test(unite()) ? '/activities/multi/evaluation.js' : unite() !== 'U01' && ['message_ecrit', 'prise_de_parole'].includes(etape.type) ? '/activities/multi/production.js' : unite() !== 'U01' && etape.type === 'bilan' ? '/activities/multi/bilan.js' : etape.module;
      const mod = await import(adresse(module));
      if (mod.meta?.entete === false) q('[data-entete]').hidden = true;
      if (mod.meta?.largeur === 'large') q('.lecteur').classList.add('large');
      if (typeof mod.monter !== 'function') throw new Error(`${etape.module} n'exporte pas de fonction monter()`);
      instance = (await mod.monter(racineAct, ctx)) || null;
      if (!instance || typeof instance.demonter !== 'function') console.warn(`[socle] ${etape.module} : monter() doit rendre { demonter() }`);
    } catch (err) {
      console.error(`[socle] l'activité ${typeAct} (${etape.module}) n'a pas pu démarrer`, err);
      zone.innerHTML = `<div class="carte panne">
        <h2>Cette activité n'a pas pu démarrer</h2>
        <p class="discret" style="margin-top:8px">Vous pouvez passer à l'étape suivante : votre progression est gardée.</p>
      </div>`;
    }
  }

  // Déclarations d'images sans fichier : descriptions lisibles, aucune URL fabriquée.
  const manquantes = new Set();
  const visiter = x => { if (!x || typeof x !== 'object') return; if (typeof x.image === 'string' && !visuels.image(x.image)) manquantes.add(x.image); for (const id of Array.isArray(x.images) ? x.images : []) if (typeof id === 'string' && !visuels.image(id)) manquantes.add(id); Object.values(x).forEach(v => { if (v && typeof v === 'object') visiter(v); }); };
  visiter(donnees);
  if (manquantes.size && etape.type !== 'episode_video') {
    const panneau = document.createElement('details'); panneau.className='carte'; panneau.open=true; panneau.style.cssText='padding:16px;margin-top:16px';
    panneau.innerHTML='<summary>Illustrations en préparation</summary>';
    for (const id of manquantes) { const p=document.createElement('p'); p.style.marginTop='10px'; p.textContent=visuels.description(id); panneau.append(p); }
    zone.append(panneau);
  }
  // ── Habillage de l'en-tête (visuel v2) : numéro d'étape et compétences, pour l'en-tête du lecteur
  // comme pour ceux que la vidéo et les jeux dessinent eux-mêmes (mêmes classes). Présentation seule.
  const pastilles = (etape.competences || []).map(pastilleCompetence).join('');
  const habiller = () => {
    for (const sec of racine.querySelectorAll('.consigne-etape')) {
      const reg = sec.querySelector(':scope > .regime');
      if (!reg || sec.querySelector('.num-etape')) continue;
      reg.insertAdjacentHTML('beforebegin', `<span class="num-etape" aria-label="Étape ${etape.rang}">${etape.rang}</span>`);
      if (pastilles) reg.insertAdjacentHTML('afterend', `<span class="comps-etape">${pastilles}</span>`);
    }
  };
  habiller();
  requestAnimationFrame(habiller);

  // ── Démontage ─────────────────────────────────────────────────────────
  return async () => {
    try { await instance?.demonter?.(); } catch (err) { console.warn('[socle] demonter()', err); }
    controleur.abort();
    for (const f of nettoyages.splice(0)) { try { f(); } catch (err) { console.warn('[socle] nettoyage', err); } }
    audio.arreter();
    guide.oublier();
    micro.fermer();
    desabonnerGuide();
    retour.definirZone(null);
    progression.fermer(etape.id, (Date.now() - debut) / 1000);
    racine.innerHTML = '';
  };
}
