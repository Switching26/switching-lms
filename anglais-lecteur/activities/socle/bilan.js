// ÉTAPE BILAN — le test éclair de D (4 questions, une par compétence, en régime d'évaluation : pas
// d'indice, pas de solution, une seule réponse) puis le bilan complet, avec sa voix de résultat.
import { rendreBilan, CLE_TEST } from '../../app/ecrans/bilan.js';
import { chargerLecon } from '../../app/donnees.js';
import { ecrire } from '../../services/stockage.js';
import { typo } from '../../services/typo.js';

export const meta = { titre: 'Bilan de leçon' };

const STYLE = `
.act-socle-bilan { display: grid; gap: 14px; }
.bt-question { padding: 18px; display: grid; gap: 12px; }
.bt-question .options { display: flex; flex-wrap: wrap; gap: 8px; }
.bt-question .options .btn { min-width: 96px; }
.bt-question .options .btn.choisi { border-color: var(--marque); background: var(--marque-voile); color: var(--marque-tres-fonce); }
.bt-saisie { display: flex; gap: 8px; flex-wrap: wrap; }
.bt-saisie input { flex: 1; min-width: 200px; min-height: 44px; padding: 10px 12px; border: 1px solid var(--filet-fort); border-radius: var(--rayon-bouton); background: var(--surface); }
.bt-saisie input:focus { outline: none; border-color: var(--marque); box-shadow: 0 0 0 3px rgba(27,42,74,.12); }
.bt-avancement { display: flex; gap: 6px; }
.bt-avancement i { flex: 1; height: 4px; border-radius: 2px; background: var(--filet); }
.bt-avancement i.fait { background: var(--marque); }
.bt-micro { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.bt-niveau { width: 80px; height: 6px; border-radius: 3px; background: var(--filet); overflow: hidden; }
.bt-niveau span { display: block; height: 100%; width: 0; background: var(--c-parler); transition: width .08s; }
`;

const norm = (t) => String(t ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();

/** Réponse tapée : tolérances du script (casse, ponctuation finale, apostrophes, une faute de frappe → presque). */
function jugerSaisie(saisie, reponse) {
  const s = norm(saisie);
  const ok = [...(reponse?.attendues || []), ...(reponse?.variantes || [])].map(norm);
  if (ok.includes(s)) return 'juste';
  const distance = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  // Une seule faute de frappe sur un mot de 4 lettres ou plus → « presque », jamais sur he/she, is/his.
  for (const o of ok) {
    const mo = o.split(' '); const ms = s.split(' ');
    if (mo.length !== ms.length) continue;
    const diff = mo.map((m, i) => [m, ms[i]]).filter(([m, x]) => m !== x);
    if (diff.length === 1 && diff[0][0].length >= 4 && distance(diff[0][0], diff[0][1]) === 1) return 'presque';
  }
  return 'faux';
}

export async function monter(racine, ctx) {
  ctx.ajouterStyle(STYLE);
  const { voix, audio, retour, micro, prononciation, icones } = ctx.services;
  const e = ctx.donnees || {};
  const questions = e.test_eclair?.questions || [];
  await voix.pret();
  const resultats = {};
  const monte = Date.now();
  let i = 0;

  const fin = async () => {
    // Le bilan lit le test sous une clé commune : il est aussi affiché hors de la leçon (#/bilan).
    ecrire(CLE_TEST, resultats);
    // L'étape est close AVANT d'afficher le bilan : il la compte parmi les étapes faites.
    const justes = Object.values(resultats).filter((x) => x === true).length;
    ctx.signaler.fin({ score: questions.length ? justes / questions.length : null, reussi: true });
    racine.innerHTML = '<div data-bilan></div>';
    const l = await chargerLecon();
    const r = await rendreBilan(racine.querySelector('[data-bilan]'), l, { test: resultats, secondesEnCours: (Date.now() - monte) / 1000 });
    ctx.tracer('etape_terminee', { etape: 'BILAN', statut: r.statut, total_pct: r.totalPct, competences: Object.fromEntries(Object.entries(r.comps).map(([k, v]) => [k, v.pct])) });
    const cas = r.statut === 'validee' ? 'validee' : r.statut === 'a_consolider' ? 'a_consolider' : null;
    const seg = cas && (e.voix_resultat || []).find((v) => v.cas === cas)?.segment;
    if (seg && voix.info(seg.id)) voix.jouer(seg.id);
  };

  const suivante = () => { i += 1; if (i < questions.length) rendre(); else fin(); };

  // Verdict normalisé : jugerSaisie rend 'juste' | 'presque' | 'faux', les choix rendent un booléen.
  // Recette Q n° 15 : 'juste' (texte) tombait dans la branche « faux ». Une seule forme en aval.
  const normaliser = (v) => (v === true || v === 'juste' ? true : v === 'presque' ? 'presque' : false);
  const repondre = (q, verdict, donne, zoneRetour, attendu) => {
    const juste = normaliser(verdict);
    resultats[q.id] = juste === true || juste === 'presque';
    const explication = q.explication_apres || '';
    zoneRetour.replaceChildren(
      juste === true ? retour.juste('Juste.', { explication })
        : juste === 'presque' ? retour.presque('Accepté, avec une petite faute.', { explication })
          : retour.faux('Pas tout à fait.', { explication }),
    );
    const cible = (q.erreurs_ciblees || []).find((c) => (c.si || []).map(norm).includes(norm(donne)));
    if (juste !== true) {
      ctx.signaler.essai({ juste: juste === 'presque' ? 'presque' : false, item: q.id, element: q.question, attendu, donne, explication, competence: q.competence, famille_erreur: cible?.categorie, premier_essai: true });
    } else ctx.signaler.essai({ juste: true, item: q.id, competence: q.competence, premier_essai: true });
    ctx.tracer('reponse_donnee', { item: q.id, juste: resultats[q.id] });
    const bt = document.createElement('button');
    bt.type = 'button'; bt.className = 'btn btn-primaire';
    bt.innerHTML = `<span>${i + 1 < questions.length ? 'Question suivante' : 'Voir mon bilan'}</span>${icones.suivant}`;
    bt.addEventListener('click', suivante);
    zoneRetour.append(bt);
    bt.focus({ preventScroll: true });
  };

  function rendre() {
    const q = questions[i];
    audio.arreter('media');
    racine.innerHTML = `
      <div class="bt-avancement" aria-hidden="true">${questions.map((_, k) => `<i class="${k < i ? 'fait' : ''}"></i>`).join('')}</div>
      <div class="carte bt-question apparait">
        <span class="surtitre">Question ${i + 1} sur ${questions.length} · ${{ ecouter: 'Écouter', lire: 'Lire', ecrire: 'Écrire', parler: 'Parler' }[q.competence] || ''} · sans aide</span>
        <p style="font-weight:600;font-size:1.08rem"></p>
        <div data-zone></div>
        <div data-retour style="display:grid;gap:10px"></div>
        <div><button type="button" class="btn btn-fantome" data-passer>Passer la question</button></div>
      </div>`;
    racine.querySelector('p').textContent = typo(q.question);
    const zone = racine.querySelector('[data-zone]');
    const zoneRetour = racine.querySelector('[data-retour]');
    const verrouiller = () => { for (const b of racine.querySelectorAll('[data-zone] button, [data-zone] input')) b.disabled = true; racine.querySelector('[data-passer]').hidden = true; };
    racine.querySelector('[data-passer]').addEventListener('click', () => { resultats[q.id] = false; ctx.tracer('reponse_donnee', { item: q.id, juste: false, passee: true }); suivante(); });

    if (q.audio?.id && voix.info(q.audio.id)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-secondaire'; b.setAttribute('data-voix', '');
      b.innerHTML = `${icones.ecouter}<span>Écouter</span>`;
      b.addEventListener('click', () => { voix.jouer(q.audio.id); ctx.tracer('audio_ecoute', { segment: q.audio.id }); });
      zone.append(b);
      setTimeout(() => voix.jouer(q.audio.id), 500);
    }
    if (q.options && q.competence !== 'parler') {
      const box = document.createElement('div'); box.className = 'options'; box.style.marginTop = '10px';
      for (const o of q.options) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-secondaire'; b.textContent = o;
        if (/[a-z]/i.test(o) && !/[éèàùç]/i.test(o)) b.lang = 'en';
        b.addEventListener('click', () => { b.classList.add('choisi'); verrouiller(); repondre(q, norm(o) === norm(q.bonne), o, zoneRetour, q.bonne); });
        box.append(b);
      }
      zone.append(box);
    } else if (q.reponse) {
      const f = document.createElement('form'); f.className = 'bt-saisie'; f.style.marginTop = '4px';
      f.innerHTML = `<input type="text" lang="en" autocomplete="off" autocapitalize="sentences" spellcheck="false" aria-label="Votre réponse en anglais"><button class="btn btn-primaire" type="submit">Valider</button>`;
      f.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const v = f.querySelector('input').value.trim();
        if (!v) return;
        verrouiller();
        repondre(q, jugerSaisie(v, q.reponse), v, zoneRetour, q.reponse.attendues?.[0]);
      });
      zone.append(f);
      setTimeout(() => f.querySelector('input').focus({ preventScroll: true }), 50);
    } else if (q.competence === 'parler') {
      // À voix haute ; sans micro, la question devient un choix (repli prévu par D).
      const replis = (q.repli_sans_micro || '').split(':').slice(1).join(':').split('/').map((x) => x.trim().replace(/\.$/, '.')).filter(Boolean);
      const bonneRepli = replis[0] || 'Nice to meet you too.';
      const choix = (message) => {
        zone.querySelector('.bt-micro')?.remove();
        if (message) zone.append(retour.info(message));
        const box = document.createElement('div'); box.className = 'options'; box.style.marginTop = '10px';
        for (const o of [...replis].sort()) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-secondaire'; b.lang = 'en'; b.textContent = o;
          b.addEventListener('click', () => { b.classList.add('choisi'); verrouiller(); repondre(q, norm(o) === norm(bonneRepli), o, zoneRetour, bonneRepli); });
          box.append(b);
        }
        zone.append(box);
      };
      if (!micro.disponible().ok) choix('Le micro n\u2019est pas disponible ici : choisissez la bonne réponse.');
      else {
        const m = document.createElement('div'); m.className = 'bt-micro'; m.style.marginTop = '10px';
        m.innerHTML = `<button type="button" class="btn btn-primaire" data-enr>${icones.micro}<span>Répondre à voix haute</span></button><span class="bt-niveau" aria-hidden="true"><span></span></span><button type="button" class="btn btn-fantome" data-sans>Je ne peux pas parler maintenant</button><span class="petit discret" data-etat></span>`;
        zone.append(m);
        m.querySelector('[data-sans]').addEventListener('click', () => choix());
        let prise = null;
        m.querySelector('[data-enr]').addEventListener('click', async (ev) => {
          const bt = ev.currentTarget;
          const etat = m.querySelector('[data-etat]');
          if (prise) {
            bt.disabled = true; etat.textContent = 'Analyse…';
            const enr = await prise.arreter(); prise = null;
            const t = await prononciation.transcrire(enr.blob);
            ctx.tracer('enregistrement_depose', { item: q.id });
            if (!t.ok) { etat.textContent = t.message || 'Réessayez.'; bt.disabled = false; bt.innerHTML = `${icones.micro}<span>Réessayer</span>`; return; }
            const juste = /\byou too\b/i.test(t.texte);
            verrouiller();
            repondre(q, juste, t.texte, zoneRetour, 'Nice to meet you too.');
            return;
          }
          try { await micro.ouvrir(); } catch (err) { choix(err.code === 'refuse' ? 'Micro refusé : répondez en choisissant la bonne phrase.' : 'Micro indisponible : répondez en choisissant la bonne phrase.'); return; }
          prise = micro.enregistrer({ dureeMax: 8000, surNiveau: (v) => { const n = m.querySelector('.bt-niveau span'); if (n) n.style.width = `${Math.round(v * 100)}%`; } });
          bt.innerHTML = `${icones.stop}<span>J'ai fini</span>`;
          etat.textContent = 'Je vous écoute…';
          prise.fin.then(() => { if (prise) bt.click(); });
        });
      }
    }
  }

  racine.innerHTML = `<div class="carte" style="padding:18px;display:grid;gap:10px">
    <span class="surtitre">Évaluation · 4 questions</span>
    <p>${questions.length} questions sans aide, une par compétence. Ensuite, votre bilan : vos résultats, vos erreurs expliquées, et ce que nous vous conseillons de revoir.</p>
    <div><button type="button" class="btn btn-primaire" data-go>Commencer le test${icones.suivant}</button> <button type="button" class="btn btn-fantome" data-direct>Voir mon bilan sans le test</button></div></div>`;
  racine.querySelector('[data-go]').addEventListener('click', () => rendre());
  racine.querySelector('[data-direct]').addEventListener('click', async () => {
    racine.innerHTML = '<div data-bilan></div>';
    await rendreBilan(racine.querySelector('[data-bilan]'), await chargerLecon());
  });
  ctx.signaler.pret();
  return { demonter() { audio.arreter('media'); micro.fermer(); } };
}
