import { requete as fetch } from '../../services/base.js';
// L'ACCENT DE MOT (PRO-3) — agent B2.
//
// On écoute le mot, on touche la syllabe la plus forte. Une fois trouvée, elle grossit et prend la
// couleur d'accent, avec la notation des professeurs d'anglais (gros point = syllabe forte).
// « Montrez-moi » rejoue le mot en allumant chaque syllabe au moment où elle est dite.
// Puis l'apprenant répète le mot et se compare au modèle, À L'OREILLE : la note locale ne mesure pas
// l'accent de mot (elle note des mots reconnus), donc on ne prétend pas le noter.
//
// Le moment où chaque syllabe est dite est une ESTIMATION : début et fin de la voix mesurés dans le
// fichier, puis partage proportionnel (la syllabe forte dure plus longtemps). Repère visuel, pas mesure.

import { icones } from '../../services/icones.js';
import {
  CSS_COMMUN, RACINES, echapper, typo, messageMicro, messageNote, panneau, microBloqueDAvance,
  creerEnregistreur, boutonSon, infoSon, jouerALaSuite, lentUtile, VITESSE_LENTE,
  montrerDansLaVue,
} from './_commun.js';

// Encarts du socle avec la typographie française (insère du texte brut : on corrige avant).
function retourTypo(S, type, texte, opts) {
  const o = opts ? { ...opts, explication: opts.explication ? typo(opts.explication) : opts.explication } : opts;
  return S.retour[type](typo(texte), o);
}

export const meta = { titre: "L'accent de mot", entete: true };

const R = RACINES;
const CSS = `
${R} .pro-mot-tete { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
${R} .pro-mot-en { font-size: clamp(1.5rem, 1.2rem + 1.4vw, 2rem); font-weight: 700; letter-spacing: -0.01em; }
${R} .pro-mot-fr { color: var(--encre-50); }
${R} .pro-ecoute { margin-top: 14px; }
${R} .pro-question { margin-top: 22px; font-weight: 600; color: var(--encre-70); }
${R} .pro-syllabes { display: flex; justify-content: center; align-items: flex-end; gap: 8px; margin-top: 14px; flex-wrap: nowrap; }
${R} .pro-syl { display: grid; justify-items: center; gap: 8px; min-width: 64px; padding: 14px 12px 12px; border-radius: var(--rayon-bloc);
  border: 1.5px solid var(--filet-fort); background: var(--surface); cursor: pointer; font: inherit; color: var(--encre);
  transition: transform .35s var(--ressort), border-color .15s, background-color .15s, box-shadow .2s; }
${R} .pro-syl:hover:not(:disabled) { border-color: var(--marque-voile-bord); box-shadow: var(--ombre-survol); }
${R} .pro-syl:disabled { cursor: default; }
${R} .pro-syl-texte { font-size: 1.5rem; font-weight: 600; line-height: 1; transition: font-size .35s var(--ressort); }
${R} .pro-syl-point { width: 10px; height: 10px; border-radius: 99px; background: var(--filet-fort); transition: all .35s var(--ressort); }
${R} .pro-syllabes[data-trouve] .pro-syl { border-color: transparent; background: transparent; box-shadow: none; }
${R} .pro-syllabes[data-trouve] .pro-syl[data-forte] { background: var(--c-parler-voile); }
${R} .pro-syllabes[data-trouve] .pro-syl[data-forte] .pro-syl-texte { font-size: 2.3rem; font-weight: 800; color: var(--c-parler); }
${R} .pro-syllabes[data-trouve] .pro-syl[data-forte] .pro-syl-point { width: 20px; height: 20px; background: var(--c-parler); }
${R} .pro-syllabes[data-trouve] .pro-syl:not([data-forte]) .pro-syl-texte { color: var(--encre-50); font-size: 1.25rem; }
${R} .pro-syllabes[data-trouve] .pro-syl:not([data-forte]) .pro-syl-point { width: 8px; height: 8px; background: var(--encre-30); }
${R} .pro-syl.pro-allume { transform: translateY(-4px) scale(1.06); }
${R} .pro-syl.pro-allume .pro-syl-texte { color: var(--marque-tres-fonce) !important; }
${R} .pro-syl[data-r="faux"] { border-color: var(--faux); background: var(--faux-voile); animation: pro-non .35s ease-in-out; }
@keyframes pro-non { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
@media (prefers-reduced-motion: reduce) { ${R} .pro-syl[data-r="faux"] { animation: none; } ${R} .pro-syl.pro-allume { transform: none; } }
${R} .pro-notation { text-align: center; margin-top: 8px; font-size: .8125rem; color: var(--encre-50); }
${R} .pro-retour-syl { margin-top: 16px; }
${R} .pro-repeter { margin-top: 18px; display: grid; gap: 12px; }
${R} .pro-auto { display: grid; gap: 10px; padding: 14px; border-radius: var(--rayon-bloc); background: var(--fond); border: 1px solid var(--filet); }
${R} .pro-pied { margin-top: 20px; justify-content: flex-end; }
@media (max-width: 380px) { ${R} .pro-syl { min-width: 56px; padding: 12px 8px 10px; } ${R} .pro-syl-texte { font-size: 1.3rem; } }
`;

/** Début et fin de la voix dans un fichier (secondes), mesurés sur l'énergie. Repli : le fichier entier. */
async function bornesVoix(url, dureeConnue) {
  try {
    const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!C) throw new Error('pas de décodage');
    const buf = await (await fetch(url)).arrayBuffer();
    const oac = new C(1, 16000, 16000);
    const audio = await new Promise((ok, ko) => {
      const p = oac.decodeAudioData(buf, ok, ko);
      if (p && p.then) p.then(ok, ko);
    });
    const d = audio.getChannelData(0);
    const pas = Math.max(1, Math.round(audio.sampleRate * 0.01));
    const env = [];
    for (let i = 0; i < d.length; i += pas) {
      let s = 0; const f = Math.min(d.length, i + pas);
      for (let j = i; j < f; j += 1) s += d[j] * d[j];
      env.push(Math.sqrt(s / (f - i)));
    }
    const max = Math.max(...env);
    if (!(max > 0)) throw new Error('muet');
    const seuil = max * 0.08;
    const debut = env.findIndex((v) => v > seuil);
    let fin = env.length - 1;
    while (fin > debut && env[fin] <= seuil) fin -= 1;
    return { debut: (debut * pas) / audio.sampleRate, fin: ((fin + 1) * pas) / audio.sampleRate };
  } catch {
    const t = Number(dureeConnue) || 1;
    return { debut: 0.05, fin: Math.max(0.3, t - 0.05) };
  }
}

/** Temps estimés de chaque syllabe : la forte compte 1,6 fois plus que les autres. */
function tempsSyllabes(n, forte, bornes) {
  const poids = Array.from({ length: n }, (_, i) => (i === forte ? 1.6 : 1));
  const total = poids.reduce((a, b) => a + b, 0);
  const duree = bornes.fin - bornes.debut;
  let t = bornes.debut;
  return poids.map((p) => { const d = (p / total) * duree; const r = { debut: t, fin: t + d }; t += d; return r; });
}

export async function monter(racine, ctx) {
  const S = ctx.services;
  // Le lecteur n'injecte qu'UNE feuille par type d'activité : commune + propre, en un seul appel.
  ctx.ajouterStyle(CSS_COMMUN + CSS);
  const e = ctx.donnees || {};
  const mots = Array.isArray(e.mots) ? e.mots : [];
  if (!mots.length) {
    racine.innerHTML = '<div class="pro-carte"><p class="discret">Les mots de cette étape ne sont pas encore écrits.</p></div>';
    ctx.signaler.pret();
    return { demonter() {} };
  }
  const retours = e.retours || {};
  const sons = await Promise.all(mots.map(async (m) => {
    const normal = await infoSon(ctx, m.audio);
    const lent = await infoSon(ctx, m.audio_lent);
    return { normal, lent: lentUtile(normal, lent) ? lent : null };
  }));
  try { await S.audio.precharger(sons.flatMap((s) => [s.normal?.url, s.lent?.url]).filter(Boolean)); } catch { /* facultatif */ }
  const bornesCache = new Map();
  const bornes = async (inf) => {
    if (!inf) return null;
    if (!bornesCache.has(inf.url)) bornesCache.set(inf.url, bornesVoix(inf.url, inf.duree_s));
    return bornesCache.get(inf.url);
  };

  const etats = mots.map(() => ({ essais: 0, trouve: false, premier: null, repete: false }));
  let index = 0;
  let modeEcoute = false;
  let enregistreur = null;
  let barre = null;
  let jeton = 0;
  const blocageInitial = await microBloqueDAvance(ctx);

  function afficherMot() {
    const monJeton = ++jeton;
    const actuel = () => monJeton === jeton && racine.isConnected;
    const m = mots[index];
    const st = etats[index];
    const son = sons[index];
    const syl = Array.isArray(m.syllabes) ? m.syllabes : [m.en];
    const forte = Number.isInteger(m.forte) ? m.forte : 0;
    enregistreur?.detruire();
    barre?.detruire();
    ctx.signaler.progression(index / mots.length);
    racine.innerHTML = `
      <div class="pro-carte">
        <div class="pro-compteur">
          <span class="petit">Mot ${index + 1} sur ${mots.length}</span>
          <span class="pro-points-etapes" aria-hidden="true">${mots.map((_, i) => `<i data-e="${i === index ? 'courant' : etats[i].trouve ? 'fait' : etats[i].essais ? 'rate' : ''}"></i>`).join('')}</span>
        </div>
        <div class="pro-mot-tete"><span class="pro-mot-en" lang="en">${echapper(m.en)}</span><span class="pro-mot-fr">${echapper(m.fr || '')}</span></div>
        <div class="pro-ecoute pro-actions"></div>
        <p class="pro-question">Quelle syllabe est la plus forte ?</p>
        <div class="pro-syllabes" role="group" aria-label="Syllabes de ${echapper(m.en)}">
          ${syl.map((s, i) => `<button type="button" class="pro-syl" data-i="${i}" aria-label="Syllabe ${i + 1} : ${echapper(s)}" lang="en"><span class="pro-syl-point" aria-hidden="true"></span><span class="pro-syl-texte">${echapper(s)}</span></button>`).join('')}
        </div>
        <p class="pro-notation" hidden>Gros point : la syllabe forte. Petits points : les syllabes faibles.</p>
        <div class="pro-retour-syl" aria-live="polite"></div>
        <div class="pro-repeter" hidden></div>
        <div class="pro-aide"></div>
        <div class="pro-pied pro-actions"></div>
      </div>`;
    const grille = racine.querySelector('.pro-syllabes');
    const boutons = [...grille.querySelectorAll('.pro-syl')];
    const zoneRetour = racine.querySelector('.pro-retour-syl');
    const zoneRep = racine.querySelector('.pro-repeter');

    const jouer = (lent) => {
      ctx.tracer('audio_ecoute', { item: m.id, lent });
      if (lent && son.lent) return S.audio.jouer(son.lent.url);
      return S.audio.jouer(son.normal?.url, { vitesse: lent ? VITESSE_LENTE : 1 });
    };
    racine.querySelector('.pro-ecoute').append(
      boutonSon({ libelle: 'Écouter', icone: 'ecouter', disponible: Boolean(son.normal), action: () => jouer(false) }),
      boutonSon({ libelle: 'Lent', icone: 'lent', disponible: Boolean(son.lent || son.normal), action: () => jouer(true) }),
    );
    if (!son.normal) {
      const p = document.createElement('p');
      p.className = 'petit discret';
      p.textContent = typo('Le son de ce mot est en préparation.');
      racine.querySelector('.pro-ecoute').append(p);
    }

    // Démonstration : le mot rejoué, chaque syllabe allumée au moment (estimé) où elle est dite.
    async function demontrer({ lent = true } = {}) {
      const inf = lent && son.lent ? son.lent : son.normal;
      if (!inf) return;
      const b = await bornes(inf);
      if (!actuel()) return;
      const vitesse = lent && !son.lent ? VITESSE_LENTE : 1;
      const temps = tempsSyllabes(syl.length, forte, b);
      const eteindre = () => boutons.forEach((x) => x.classList.remove('pro-allume'));
      await S.audio.jouer(inf.url, {
        vitesse,
        surTemps: (t) => boutons.forEach((x, i) => x.classList.toggle('pro-allume', t >= temps[i].debut && t < temps[i].fin)),
      });
      eteindre();
    }

    barre = S.aide.barre(ctx, {
      item: () => m.id,
      surMontrer: () => demontrer({ lent: true }),
      surSolution: () => { revelerForte(); zoneRetour.replaceChildren(retourTypo(S, 'reponse', syl.map((s, i) => (i === forte ? s.toUpperCase() : s)).join('-'), { explication: m.piege || '' })); demontrer({ lent: true }); passerARepeter(); },
    });
    barre.nouvelItem();
    racine.querySelector('.pro-aide').append(barre.element);

    function revelerForte() {
      // La syllabe forte n'est inscrite dans la page qu'une fois trouvée (sinon elle se devinerait).
      boutons.forEach((b, i) => { if (i === forte) b.setAttribute('data-forte', ''); b.disabled = true; delete b.dataset.r; });
      grille.dataset.trouve = '';
      racine.querySelector('.pro-notation').hidden = false;
      st.trouve = true;
    }

    boutons.forEach((b, i) => b.addEventListener('click', () => {
      if (st.trouve) return;
      st.essais += 1;
      const juste = i === forte;
      if (st.premier === null) st.premier = juste;
      const attendu = syl.map((s, k) => (k === forte ? s.toUpperCase() : s)).join('-');
      ctx.signaler.essai({
        juste, item: m.id, element: `${m.en} : syllabe forte`, attendu, donne: syl[i],
        explication: juste ? (retours.juste || 'C’est la syllabe forte.') : `${retours.faux_par_defaut || 'Pas cette syllabe.'} ${m.piege || ''}`.trim(),
        premier_essai: st.essais === 1,
      });
      ctx.tracer('reponse_donnee', { item: m.id, juste });
      if (juste) {
        S.sons?.jouer?.('juste');
        revelerForte();
        zoneRetour.replaceChildren(retourTypo(S, 'juste', retours.juste || 'Oui, c’est la syllabe forte.', { explication: m.piege || '' }));
        const t = setTimeout(() => { if (actuel()) demontrer({ lent: false }); }, 450);
        ctx.surDemontage(() => clearTimeout(t));
        passerARepeter();
      } else {
        S.sons?.jouer?.('faux');
        b.dataset.r = 'faux';
        const t = setTimeout(() => { delete b.dataset.r; }, 900);
        ctx.surDemontage(() => clearTimeout(t));
        zoneRetour.replaceChildren(retourTypo(S, 'faux', retours.faux_par_defaut || 'Pas cette syllabe.', { explication: 'Réécoutez le mot, lentement si besoin.' }));
        barre.erreur();
      }
    }));

    function passerARepeter() {
      zoneRep.hidden = false;
      afficherPied();
      if (modeEcoute) {
        zoneRep.replaceChildren(panneau({
          titre: 'À voix haute',
          texte: `Dites « ${m.en} » en appuyant sur « ${syl[forte]} », puis réécoutez le modèle pour vous comparer.`,
          actions: [{ libelle: 'Réessayer le micro', icone: 'micro', action: () => { modeEcoute = false; passerARepeter(); } }],
        }));
        return;
      }
      zoneRep.innerHTML = `
        <p><b>Répétez le mot</b> en appuyant sur <span lang="en" style="color:var(--c-parler);font-weight:700">${echapper(syl[forte].toUpperCase())}</span>.</p>
        <div class="pro-rep-enr"></div>
        <div class="pro-rep-note"></div>`;
      const zoneNote = zoneRep.querySelector('.pro-rep-note');
      enregistreur?.detruire();
      enregistreur = creerEnregistreur(ctx, {
        dureeMax: 4000, dureeMin: 250, finSilence: 900, attenteParole: 4000,
        libelle: `Touchez et dites « ${m.en} »`,
        surDebut: () => zoneNote.replaceChildren(),
        surResultat: (res) => {
          if (!res.ok && res.micro) {
            const mm = messageMicro(res.code);
            const actions = [];
            if (mm.reessayer) actions.push({ libelle: 'Réessayer', icone: 'rejouer', action: () => enregistreur?.demarrer() });
            actions.push({ libelle: 'Continuer sans micro', icone: 'ecouter', primaire: !mm.reessayer, action: () => { modeEcoute = true; passerARepeter(); } });
            zoneNote.replaceChildren(panneau({ titre: mm.titre, texte: mm.texte, actions, ton: 'alerte' }));
            return;
          }
          if (!res.ok) { const mm = messageNote(res.code); zoneNote.replaceChildren(panneau({ titre: mm.titre, texte: mm.texte, ton: 'alerte' })); return; }
          ctx.tracer('enregistrement_depose', { item: m.id, duree_s: res.enr.duree_s });
          st.repete = true;
          const box = document.createElement('div');
          box.className = 'pro-auto apparait';
          box.innerHTML = `<p>Écoutez-vous, puis le modèle : la syllabe forte tombe-t-elle au même endroit ?</p><div class="pro-actions pro-auto-sons"></div><div class="pro-actions pro-auto-choix"></div><p class="pro-honnete">${icones.info}<span>Ici, rien n’est noté : la reconnaissance vérifie des mots, pas l’accent. Votre oreille est le juge.</span></p>`;
          box.querySelector('.pro-auto-sons').append(
            boutonSon({ libelle: 'Ma voix', icone: 'micro', action: () => S.audio.jouer(res.enr.url) }),
            boutonSon({ libelle: 'Le modèle', icone: 'ecouter', disponible: Boolean(son.normal), action: () => S.audio.jouer(son.normal.url) }),
            boutonSon({ libelle: 'Les deux à la suite', icone: 'comparer', disponible: Boolean(son.normal), action: () => jouerALaSuite(ctx, [res.enr.url, son.normal?.url]) }),
          );
          const choix = box.querySelector('.pro-auto-choix');
          const opt = (libelle, valeur) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-secondaire';
            b.textContent = libelle;
            b.addEventListener('click', () => {
              ctx.tracer('reponse_donnee', { item: `${m.id}-auto`, juste: valeur });
              choix.replaceChildren(valeur
                ? retourTypo(S, 'juste', 'Parfait. Gardez ce réflexe : chaque nouveau mot anglais a sa syllabe forte.')
                : retourTypo(S, 'info', `Réessayez en exagérant : « ${syl.map((s, k) => (k === forte ? s.toUpperCase() : s)).join('-')} », la syllabe forte plus longue et plus haute.`));
            });
            return b;
          };
          choix.append(opt('Oui, au même endroit', true), opt('Pas sûr, je réessaie', false));
          zoneNote.replaceChildren(box);
          montrerDansLaVue(box);
        },
      });
      zoneRep.querySelector('.pro-rep-enr').append(enregistreur.element);
      if (blocageInitial && index === 0) {
        const mm = messageMicro(blocageInitial);
        zoneNote.replaceChildren(panneau({ titre: mm.titre, texte: mm.texte, ton: 'alerte', actions: [{ libelle: 'Continuer sans micro', icone: 'ecouter', primaire: true, action: () => { modeEcoute = true; passerARepeter(); } }] }));
      }
    }

    function afficherPied() {
      const pied = racine.querySelector('.pro-pied');
      pied.replaceChildren();
      const dernier = index === mots.length - 1;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-primaire';
      b.innerHTML = `<span>${dernier ? 'Voir le résultat' : 'Mot suivant'}</span>${icones.suivant}`;
      b.addEventListener('click', () => {
        S.audio.arreter('media');
        if (dernier) afficherBilan();
        else { index += 1; afficherMot(); racine.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }
      });
      pied.append(b);
    }

    if (st.trouve) { revelerForte(); passerARepeter(); }
  }

  function afficherBilan() {
    enregistreur?.detruire();
    barre?.detruire();
    const premier = etats.filter((s) => s.premier === true).length;
    ctx.signaler.progression(1);
    racine.innerHTML = `
      <div class="pro-carte apparait">
        <h2>Les syllabes fortes</h2>
        <p class="discret" style="margin-top:6px">${premier} mot${premier > 1 ? 's' : ''} sur ${mots.length} trouvé${premier > 1 ? 's' : ''} du premier coup.</p>
        <ul class="pro-bilan-accents" style="list-style:none;padding:0;margin:16px 0 0;display:grid;gap:8px"></ul>
        <p class="pro-honnete" style="margin-top:14px">${icones.info}<span>Le français appuie sur la fin des mots ; l'anglais, sur une syllabe fixe par mot. Pour les nouveaux mots, écoutez d'abord où tombe la syllabe forte.</span></p>
      </div>`;
    const ul = racine.querySelector('.pro-bilan-accents');
    mots.forEach((m, i) => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--filet);border-radius:var(--rayon-bloc);background:var(--surface)';
      const syl = Array.isArray(m.syllabes) ? m.syllabes : [m.en];
      li.innerHTML = `<span lang="en" style="font-weight:600">${syl.map((s, k) => (k === m.forte ? `<b style="color:var(--c-parler);font-weight:800">${echapper(s.toUpperCase())}</b>` : echapper(s))).join('·')}</span><span class="petit discret">${etats[i].premier === true ? 'du premier coup' : etats[i].trouve ? 'trouvé' : 'à revoir'}</span>`;
      ul.append(li);
    });
    ctx.signaler.fin({ score: premier / mots.length, reussi: premier / mots.length >= 0.5, points_obtenus: premier });
    S.sons?.jouer?.('fin');
  }

  afficherMot();
  ctx.signaler.pret();
  return {
    demonter() { enregistreur?.detruire(); barre?.detruire(); },
    montrer() { racine.querySelector('.aide-barre [data-aide="montrer"]')?.click(); },
    montrerSolution() { racine.querySelector('.aide-barre [data-aide="solution"]')?.click(); },
  };
}
