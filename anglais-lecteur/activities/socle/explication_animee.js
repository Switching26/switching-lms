// « À COMPRENDRE » — l'explication animée commentée par le guide vocal (script/comprendre.json de D).
//
// Chaque réplique enchaîne ses segments (voix française, puis voix anglaises) et anime l'écran à partir
// des indications de D (champ `animation`) : image et projecteur sur une personne, bulle anglaise dont
// chaque mot s'allume au moment où il est dit, cartes qui se retournent, colonnes, formes barrées,
// lettres qui s'envolent. Sans voix produite, la réplique s'affiche et avance au rythme de lecture :
// l'animation va TOUJOURS au bout.
import { typo } from '../../services/typo.js';

export const meta = { titre: 'Explication animée' };

// Zones des personnes sur la photo d'équipe S06 (en % de l'image), relevées sur l'image de V.
const ZONES = {
  S06: { helen: [14, 20, 23, 80], rob: [36.5, 16, 20.5, 84], claire: [56, 24, 18, 76], daniel: [73, 15, 21.5, 85] },
};
const PERSONNES = ['claire', 'daniel', 'helen', 'rob'];
const STYLE = `
.act-socle-explication_animee { display: grid; gap: 14px; scroll-margin-top: 76px; }
.xa-scene { position: relative; border-radius: var(--rayon-carte); overflow: hidden; background: #0C1528; aspect-ratio: 16 / 10; box-shadow: var(--ombre-carte-forte); width: 100%; margin: 0 auto; }
@media (min-width: 768px) { .xa-scene { aspect-ratio: 16 / 9; width: min(100%, calc(52vh * 16 / 9)); } }
@media (min-width: 768px) { .xa-soustitre, .xa-tableau, .xa-controles, [data-fin] { width: min(100%, calc(52vh * 16 / 9)); margin-inline: auto; } }
.xa-image { position: absolute; inset: 0; background: center / cover no-repeat; transform: scale(1.04); transition: opacity .6s var(--doux), transform 9s linear; }
.xa-image.vivante { transform: scale(1.1); }
.xa-voile { position: absolute; inset: 0; background: rgba(12,21,40,.28); transition: background .5s; }
.xa-projecteur { position: absolute; border-radius: 40% / 30%; box-shadow: 0 0 0 200vmax rgba(12,21,40,.5); border: 2px solid rgba(255,255,255,.85); transition: all .7s var(--doux); opacity: 0; pointer-events: none; }
.xa-projecteur.visible { opacity: 1; }
.xa-bulle { position: absolute; left: 50%; bottom: 7%; transform: translate(-50%, 8px); max-width: min(88%, 560px); padding: 10px 16px; border-radius: 16px; background: rgba(255,255,255,.96); color: var(--encre); font-size: clamp(1rem, .9rem + .8vw, 1.35rem); font-weight: 600; line-height: 1.35; box-shadow: 0 10px 30px rgba(12,21,40,.25); opacity: 0; transition: opacity .35s, transform .35s var(--doux); text-align: center; }
.xa-bulle.visible { opacity: 1; transform: translate(-50%, 0); }
.xa-bulle .m { transition: color .12s, background-color .12s; border-radius: 4px; padding: 0 1px; }
.xa-bulle .m.dit { color: var(--marque); }
.xa-bulle .m.cible { color: var(--marque-fonce); text-decoration: underline 3px var(--marque-voile-bord); text-underline-offset: 4px; }
.xa-bulle .m.dit.cible { background: var(--marque-voile); }
.xa-lancer { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(12,21,40,.35); border: 0; cursor: pointer; color: #fff; width: 100%; }
.xa-lancer span { display: inline-flex; align-items: center; gap: 10px; padding: 14px 22px; border-radius: 999px; background: var(--marque); font-weight: 700; font-size: 1.05rem; box-shadow: 0 10px 30px rgba(27,42,74,.45); }
.xa-lancer svg { width: 22px; height: 22px; }
.xa-soustitre { min-height: 3.2em; font-size: 1.02rem; color: var(--encre-70); max-width: 64ch; }
.xa-soustitre b { color: var(--encre); font-weight: 600; }
.xa-tableau { display: grid; gap: 12px; }
.xa-cartes { display: flex; flex-wrap: wrap; gap: 8px; }
.xa-carte { perspective: 600px; width: 84px; height: 84px; border: 0; padding: 0; background: none; cursor: pointer; }
.xa-carte .in { position: relative; width: 100%; height: 100%; transition: transform .6s var(--doux); transform-style: preserve-3d; }
.xa-carte.retournee .in { transform: rotateY(180deg); }
.xa-carte .f { position: absolute; inset: 0; border-radius: 14px; backface-visibility: hidden; -webkit-backface-visibility: hidden; display: grid; place-items: center; align-content: center; gap: 2px; border: 1px solid var(--filet); background: var(--surface); box-shadow: var(--ombre-carte); }
.xa-carte .dos { background: repeating-linear-gradient(135deg, #F2F0EB 0 8px, #EEF0F3 8px 16px); }
.xa-carte .face { transform: rotateY(180deg); }
.xa-carte .mot { font-family: var(--police-titre); font-size: 1.45rem; font-weight: 600; line-height: 1; color: var(--encre); }
.xa-carte .etiq { font-size: .75rem; color: var(--encre-50); padding: 0 4px; text-align: center; line-height: 1.15; }
.xa-carte.allumee .face { border-color: var(--marque); box-shadow: 0 0 0 4px var(--marque-voile); }
.xa-carte.allumee .mot { color: var(--marque); }
.xa-colonnes { display: grid; grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); gap: 8px; }
.xa-colonne { border-radius: var(--rayon-bloc); background: var(--surface); border: 1px solid var(--filet); padding: 10px; min-height: 120px; display: flex; flex-direction: column; gap: 8px; align-items: center; transition: box-shadow .3s, border-color .3s; }
.xa-colonne h4 { margin: 0; font-family: var(--police-titre); font-size: 1.35rem; color: var(--marque-fonce); }
.xa-colonne.eclairee { border-color: var(--marque); box-shadow: 0 0 0 4px var(--marque-voile); }
.xa-colonne .xa-cartes { justify-content: center; }
.xa-colonne .xa-carte { width: 64px; height: 64px; }
.xa-colonne .xa-carte .mot { font-size: 1.15rem; }
.xa-lignes { display: grid; gap: 8px; }
.xa-barre, .xa-transfo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; padding: 10px 14px; border-radius: var(--rayon-bloc); background: var(--surface); border: 1px solid var(--filet); font-size: 1.1rem; font-weight: 600; }
.xa-barre .faux { color: var(--encre-30); text-decoration: line-through 2px var(--faux); }
.xa-barre .juste { color: var(--juste-fonce); opacity: 0; transform: translateX(-6px); transition: all .4s var(--doux); }
.xa-barre.corrige .juste { opacity: 1; transform: none; }
.xa-transfo .avant .l { display: inline-block; transition: all .6s var(--doux); }
.xa-transfo .avant .l.part { color: var(--faux); }
.xa-transfo.fait .avant .l.part { opacity: 0; transform: translateY(-14px); }
.xa-transfo .apres { color: var(--marque-fonce); opacity: 0; transition: opacity .4s .5s; }
.xa-transfo.fait .apres { opacity: 1; }
.xa-transfo .fleche { color: var(--encre-30); }
.xa-controles { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.xa-points { display: flex; gap: 6px; margin-left: auto; }
.xa-points i { width: 8px; height: 8px; border-radius: 50%; background: var(--filet-fort); }
.xa-points i.fait { background: var(--marque-clair); }
.xa-points i.courant { background: var(--marque); transform: scale(1.3); }
.xa-memo { padding: 18px; }
.xa-memo ul { margin: 10px 0 0; padding-left: 18px; display: grid; gap: 6px; }
.xa-memo table { width:100%; border-collapse:collapse; margin-top:12px; }
.xa-memo td { padding:8px; border-bottom:1px solid var(--filet); overflow-wrap:anywhere; }
.xa-question { padding: 18px; display: grid; gap: 12px; }
.xa-options { display: flex; flex-wrap: wrap; gap: 8px; }
.xa-options .btn { min-width: 76px; font-size: 1.05rem; }
.xa-options .btn.choisi-juste { background: var(--juste-voile); border-color: var(--juste); color: var(--juste-fonce); }
.xa-options .btn.choisi-faux { background: var(--faux-voile); border-color: var(--faux-bord); color: var(--faux-fonce); }
@media (max-width: 420px) { .xa-carte { width: 72px; height: 72px; } .xa-carte .mot { font-size: 1.25rem; } }
`;

const citations = (t) => [...String(t || '').matchAll(/« ([^»]+) »/g)].map((m) => m[1].trim());
const norm = (t) => String(t || '').toLowerCase().replace(/[’]/g, "'").replace(/[.!?,;:]+$/g, '').trim();
const attendre = (ms, signal) => new Promise((ok) => { const t = setTimeout(ok, ms); signal?.addEventListener('abort', () => { clearTimeout(t); ok(); }, { once: true }); });

/** Étiquettes françaises tirées du mémo de D : « he = il (un homme) · she = elle… » → { he: 'il', she: 'elle' }. */
function etiquettesDuMemo(memo) {
  const t = {};
  for (const ligne of memo?.lignes || []) {
    for (const bout of ligne.split('·')) {
      const m = /^\s*([A-Za-z][A-Za-z']*)\s*=\s*(.+)$/.exec(bout);
      if (!m) continue;
      let v = m[2].split(/\s(?:pour|toujours|quand)\s|[(.]/)[0].replace(/,\s*$/, '').trim();
      if (v.length > 22) v = v.slice(0, 22).replace(/\s+\S*$/, '') + '…';
      t[norm(m[1])] = v;
    }
  }
  return t;
}

/** Ce que l'écran doit faire pendant une réplique, lu dans le texte d'animation de D. */
function lireAnimation(texte, etape) {
  const a = { image: null, personnes: [], surlignages: [], cartesRetournees: [], colonnes: null, versColonne: [], barres: [], transfos: [], lister: false };
  const t = String(texte || '');
  const id = /\b((?:(?:U|G|V)\d{2}|T\d)-[A-Z]\d{2}|[PSV]\d{2})\b/.exec(t);
  if (id) a.image = id[1];
  for (const phrase of t.split(/(?<=\.)\s+/)) {
    if (/surlign/i.test(phrase)) {
      // « Rob est surligné… Puis Helen est surlignée » : un projecteur par phrase, dans l'ordre.
      for (const morceau of phrase.split(/\bpuis\b/i)) {
        const noms = PERSONNES.filter((p) => new RegExp(`\\b${p}\\b`, 'i').test(morceau) && /surlign/i.test(morceau));
        if (noms.length) { a.surlignages.push(noms); a.personnes.push(...noms); }
      }
    }
    const cols = /colonnes?[^«]*titrées? ((?:« [^»]+ »[, et]*)+)/i.exec(phrase);
    if (cols) a.colonnes = citations(cols[1]);
    const vers = /cartes? ((?:« [^»]+ »[, et]*)+)\s+gliss\w*(?:\s+seule)?\s+dans la colonne « ([^»]+) »/i.exec(phrase);
    if (vers) a.versColonne.push({ cartes: citations(vers[1]), colonne: vers[2] });
    const ret = /carte[^«.]*?(?:se retourne\s*:?\s*)?« ([^»]+) »[^.]*se retourne|carte se retourne\s*:\s*« ([^»]+) »|carte « ([^»]+) » se retourne/i.exec(phrase);
    if (ret) a.cartesRetournees.push(ret[1] || ret[2] || ret[3]);
    for (const m of phrase.matchAll(/« ([^»]+) » devient « ([^»]+) »/g)) a.barres.push({ faux: m[1], juste: m[2] });
    for (const m of phrase.matchAll(/« ([^»]+) » → « ([^»]+) »/g)) a.transfos.push({ avant: m[1], apres: m[2] });
    if (/s'allume au moment où|chaque pronom s'allume|chacune s'allume/i.test(phrase)) a.lister = true;
  }
  if (!a.image && etape.images?.length) a.image = null;
  return a;
}

export async function monter(racine, ctx) {
  ctx.ajouterStyle(STYLE);
  const { voix, audio, icones, retour, visuels } = ctx.services;
  const e = ctx.donnees || {};
  const repliques = e.repliques || [];
  await Promise.all([voix.pret(), visuels.pret()]);
  const cartesAudio = new Map();
  try { for (const c of (await ctx.script('comprendre.json')).cartes_audio || []) cartesAudio.set(norm(c.texte), c); } catch { /* sans cartes audio */ }
  const etiquettes = etiquettesDuMemo(e.memo);

  racine.innerHTML = `
    <div class="xa-scene" data-voix>
      <div class="xa-image"></div><div class="xa-voile"></div><div class="xa-projecteur"></div>
      <div class="xa-bulle" lang="en" aria-live="polite"></div>
      <button type="button" class="xa-lancer" data-lancer><span>${icones.lecture}Lancer l'explication</span></button>
    </div>
    <p class="xa-soustitre" aria-live="polite"></p>
    <div class="xa-tableau"><div class="xa-lignes"></div><div class="xa-colonnes" hidden></div><div class="xa-cartes"></div></div>
    <div class="xa-controles" data-voix>
      <button type="button" class="btn btn-secondaire" data-pause>${icones.pause}<span>Pause</span></button>
      <button type="button" class="btn-icone" data-prec aria-label="Réplique précédente">${icones.retour}</button>
      <button type="button" class="btn-icone" data-rejouer aria-label="Rejouer la réplique">${icones.rejouer}</button>
      <button type="button" class="btn-icone" data-suiv aria-label="Réplique suivante">${icones.suivant}</button>
      <div class="xa-points" aria-hidden="true">${repliques.map(() => '<i></i>').join('')}</div>
    </div>
    <div data-fin></div>`;
  const q = (s) => racine.querySelector(s);
  const scene = { image: q('.xa-image'), proj: q('.xa-projecteur'), bulle: q('.xa-bulle'), sous: q('.xa-soustitre'), cartes: q('.xa-tableau > .xa-cartes'), colonnes: q('.xa-colonnes'), lignes: q('.xa-lignes') };
  const cartes = new Map();   // norm(texte) → élément
  let imageCourante = null;

  function poserImage(id) {
    const idImg = id || imageCourante || e.images?.[0];
    if (!idImg || idImg === imageCourante) return;
    imageCourante = idImg;
    const url = visuels.image(idImg);
    scene.image.style.backgroundImage = url ? `url('${url}')` : 'linear-gradient(135deg,#0C1528,#121D36)';
    scene.image.textContent = url ? '' : visuels.description(idImg);
    if (!url) Object.assign(scene.image.style, { padding: '28px', color: 'white', fontSize: '1rem' });
    scene.image.classList.remove('vivante'); void scene.image.offsetWidth; scene.image.classList.add('vivante');
  }
  function projeter(noms) {
    const z = ZONES[imageCourante];
    const zones = (noms || []).map((n) => z?.[n]).filter(Boolean);
    if (!zones.length) { scene.proj.classList.remove('visible'); return; }
    const x0 = Math.min(...zones.map((r) => r[0])); const y0 = Math.min(...zones.map((r) => r[1]));
    const x1 = Math.max(...zones.map((r) => r[0] + r[2])); const y1 = Math.max(...zones.map((r) => r[1] + r[3]));
    Object.assign(scene.proj.style, { left: `${x0}%`, top: `${y0}%`, width: `${x1 - x0}%`, height: `${y1 - y0}%` });
    scene.proj.classList.add('visible');
  }
  function carte(texte, { retournee = false } = {}) {
    const k = norm(texte);
    if (!k) return null;
    let el = cartes.get(k);
    if (!el) {
      const ca = cartesAudio.get(k);
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'xa-carte apparait';
      el.setAttribute('data-voix', '');
      el.setAttribute('aria-label', `Écouter « ${texte} »`);
      el.innerHTML = `<span class="in"><span class="f dos"></span><span class="f face"><span class="mot" lang="en"></span><span class="etiq"></span></span></span>`;
      el.querySelector('.mot').textContent = ca?.texte || texte;
      el.querySelector('.etiq').textContent = etiquettes[k] || '';
      el.addEventListener('click', () => { if (ca && voix.info(ca.id)) voix.jouer(ca.id); el.classList.add('retournee'); ctx.tracer('audio_ecoute', { segment: ca?.id }); });
      cartes.set(k, el);
      scene.cartes.append(el);
    }
    if (retournee) el.classList.add('retournee');
    return el;
  }
  function allumer(el) { for (const c of cartes.values()) c.classList.toggle('allumee', c === el); }
  function bulle(texte, cibles = []) {
    scene.bulle.replaceChildren();
    const mots = String(texte || '').split(/\s+/).filter(Boolean);
    const set = new Set(cibles.map(norm));
    mots.forEach((m, i) => {
      const s = document.createElement('span');
      s.className = 'm';
      s.textContent = m;
      if (set.has(norm(m)) || set.has(norm(m).replace(/'.*$/, ''))) s.classList.add('cible');
      scene.bulle.append(s);
      if (i < mots.length - 1) scene.bulle.append(' ');
    });
    scene.bulle.classList.toggle('visible', mots.length > 0);
    return [...scene.bulle.querySelectorAll('.m')];
  }

  const ctrl = new AbortController();
  ctx.surDemontage(() => ctrl.abort());
  let rang = 0; let enPause = false; let jeton = 0; let fini = false;
  const points = [...racine.querySelectorAll('.xa-points i')];

  async function jouerSegment(seg, a, monJeton) {
    const plein = seg.ref ? (await ctx.segment(seg.ref)) || { id: seg.ref } : seg;
    const anglais = String(plein.voix || '').startsWith('en');
    const info = plein.id ? voix.info(plein.id) : null;
    const texte = plein.texte || info?.texte || '';
    let spans = [];
    if (anglais) {
      if (a.surlignages.length) { projeter(a.surlignages[Math.min(a.enCours, a.surlignages.length - 1)]); a.enCours += 1; }
      const k = norm(texte);
      const estListe = /,/.test(texte) && texte.split(',').length >= 3;
      if (cartesAudio.has(k) || (texte.split(/\s+/).length <= 2 && !estListe)) {
        const el = carte(texte, { retournee: true });
        allumer(el);
        spans = bulle(texte, [texte]);
      } else {
        spans = bulle(texte, citations(a.brut).filter((c) => c.length <= 12));
        if (estListe && (a.lister || cartes.size)) for (const w of texte.split(',')) carte(w.trim(), { retournee: false });
      }
    } else {
      scene.sous.textContent = typo(texte);
      if (!a.bulleGardee) scene.bulle.classList.remove('visible');
    }
    const motsListe = anglais && /,/.test(texte) ? texte.split(',').map((w) => norm(w)) : null;
    const minutage = info?.mots || [];
    // Horloge de secours : si le navigateur ne fait pas avancer le son (pas de sortie audio, flux
    // bloqué), les mots s'allument quand même au rythme du minutage connu.
    const depart = performance.now();
    let dernier = -1;
    const horloge = setInterval(() => { if (dernier <= 0 && performance.now() - depart > 1200) majMots((performance.now() - depart) / 1000); }, 100);
    const surTemps = (t) => { dernier = t; majMots(t); };
    const majMots = (t) => {
      let courant = -1;
      minutage.forEach((m, i) => { if (m.debut != null && t >= m.debut - 0.03) courant = i; });
      spans.forEach((s, i) => s.classList.toggle('dit', i <= courant));
      if (motsListe && courant >= 0) {
        const el = cartes.get(norm(minutage[courant]?.mot || ''));
        if (el) { el.classList.add('retournee'); allumer(el); }
      }
    };
    if (info) {
      const r = await audio.jouer(info.url, { canal: 'media', surTemps, garde: info.duree_s || 0 }).finally(() => clearInterval(horloge));
      if (r === 'bloque') { enPause = true; montrerLancer(true); return 'arret'; }
      if (monJeton !== jeton) return 'arret';
      spans.forEach((s) => s.classList.add('dit'));
      if (r !== 'fin' && r !== 'erreur') return 'arret';
      await attendre(anglais ? 350 : 200, ctrl.signal);
    } else {
      clearInterval(horloge);
      // Voix non produite : on lit à l'écran, au rythme de lecture, et on avance quand même.
      const duree = Math.min(9000, Math.max(1800, texte.length * 55));
      const pas = spans.length ? duree / spans.length : duree;
      for (let i = 0; i < spans.length; i += 1) { if (monJeton !== jeton) return 'arret'; spans[i].classList.add('dit'); await attendre(pas, ctrl.signal); }
      if (!spans.length) await attendre(duree, ctrl.signal);
    }
    return monJeton === jeton ? 'fin' : 'arret';
  }

  async function jouerReplique(i) {
    const monJeton = ++jeton;
    rang = i;
    points.forEach((p, k) => { p.classList.toggle('courant', k === i); p.classList.toggle('fait', k < i); });
    const r = repliques[i];
    if (!r) return;
    const a = { ...lireAnimation(r.animation, e), brut: r.animation, enCours: 0 };
    poserImage(a.image);
    projeter(a.surlignages[0] || []);
    scene.sous.textContent = '';
    if (a.colonnes) {
      scene.colonnes.hidden = false;
      scene.colonnes.style.setProperty('--n', a.colonnes.length);
      if (!scene.colonnes.childElementCount) {
        for (const c of a.colonnes) {
          const col = document.createElement('div');
          col.className = 'xa-colonne apparait';
          col.dataset.col = norm(c);
          col.innerHTML = '<h4 lang="en"></h4><div class="xa-cartes"></div>';
          col.querySelector('h4').textContent = c;
          scene.colonnes.append(col);
        }
      }
    }
    for (const c of a.cartesRetournees) carte(c, { retournee: true });
    for (const v of a.versColonne) {
      const col = scene.colonnes.querySelector(`[data-col="${CSS.escape(norm(v.colonne))}"]`);
      for (const c of v.cartes) { const el = carte(c, { retournee: true }); if (col && el) col.querySelector('.xa-cartes').append(el); }
      if (col) { col.classList.add('eclairee'); setTimeout(() => col.classList.remove('eclairee'), 1600); }
    }
    for (const b of a.barres) {
      const el = document.createElement('div');
      el.className = 'xa-barre apparait';
      el.innerHTML = '<span class="faux" lang="en"></span><span class="juste" lang="en"></span>';
      el.querySelector('.faux').textContent = b.faux;
      el.querySelector('.juste').textContent = b.juste;
      scene.lignes.append(el);
      setTimeout(() => el.classList.add('corrige'), 900 + scene.lignes.childElementCount * 500);
    }
    a.transfos.forEach((tr, k) => {
      const el = document.createElement('div');
      el.className = 'xa-transfo apparait';
      const avant = document.createElement('span'); avant.className = 'avant'; avant.lang = 'en';
      // Les lettres qui disparaissent : ce que « avant » a de plus que « après » (hors apostrophe).
      const apresL = tr.apres.replace(/'/g, '');
      let j = 0;
      for (const ch of tr.avant) {
        const s = document.createElement('span'); s.className = 'l'; s.textContent = ch === ' ' ? ' ' : ch;
        if (ch !== ' ' && apresL[j] === ch) j += 1; else if (ch !== ' ') s.classList.add('part');
        avant.append(s);
      }
      el.append(avant);
      el.insertAdjacentHTML('beforeend', '<span class="fleche" aria-hidden="true">→</span><span class="apres" lang="en"></span>');
      el.querySelector('.apres').textContent = tr.apres;
      scene.lignes.append(el);
      setTimeout(() => el.classList.add('fait'), 1200 + k * 1400);
    });
    for (const seg of r.sequence || []) {
      if (monJeton !== jeton) return;
      while (enPause && monJeton === jeton) await attendre(150, ctrl.signal);
      const res = await jouerSegment(seg, a, monJeton);
      if (res !== 'fin') return;
    }
    if (monJeton !== jeton) return;
    points[i]?.classList.add('fait');
    if (i + 1 < repliques.length) { await attendre(500, ctrl.signal); if (monJeton === jeton && !enPause) jouerReplique(i + 1); }
    else terminer();
  }

  function montrerLancer(oui) { q('[data-lancer]').hidden = !oui; }
  function arreterTout() { jeton += 1; audio.arreter('media'); }

  const enVue = () => { try { racine.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* rien */ } };
  q('[data-lancer]').addEventListener('click', () => { enVue(); montrerLancer(false); enPause = false; majPause(); jouerReplique(fini ? 0 : rang); fini = false; });
  const btnPause = q('[data-pause]');
  function majPause() { btnPause.innerHTML = enPause ? `${icones.lecture}<span>Reprendre</span>` : `${icones.pause}<span>Pause</span>`; }
  btnPause.addEventListener('click', () => {
    enPause = !enPause; majPause();
    if (enPause) arreterTout(); else jouerReplique(rang);
  });
  q('[data-rejouer]').addEventListener('click', () => { arreterTout(); enPause = false; majPause(); montrerLancer(false); jouerReplique(rang); });
  q('[data-prec]').addEventListener('click', () => { arreterTout(); enPause = false; majPause(); montrerLancer(false); jouerReplique(Math.max(0, rang - 1)); });
  q('[data-suiv]').addEventListener('click', () => {
    arreterTout(); enPause = false; majPause(); montrerLancer(false);
    if (rang + 1 < repliques.length) jouerReplique(rang + 1); else terminer();
  });

  function terminer() {
    fini = true;
    projeter([]);
    scene.bulle.classList.remove('visible');
    points.forEach((p) => { p.classList.remove('courant'); p.classList.add('fait'); });
    const zone = q('[data-fin]');
    if (zone.childElementCount) return;
    const memo = e.memo;
    if (memo?.lignes?.length || memo?.tableau?.length) {
      const m = document.createElement('div');
      m.className = 'carte xa-memo apparait';
      m.innerHTML = `<h3></h3><ul></ul>`;
      m.querySelector('h3').textContent = memo.titre || 'À retenir';
      for (const l of memo.lignes || []) { const li = document.createElement('li'); li.textContent = typo(l); m.querySelector('ul').append(li); }
      if (!memo.lignes?.length) m.querySelector('ul').remove();
      if (memo.tableau?.length) {
        const table=document.createElement('table');table.setAttribute('aria-label',memo.titre||'À retenir');
        for(const ligne of memo.tableau){const tr=table.insertRow();for(const cellule of ligne)tr.insertCell().textContent=typo(cellule);}
        m.append(table);
      }
      if(memo.note){const note=document.createElement('p');note.textContent=typo(memo.note);m.append(note);}
      zone.append(m);
    }
    const qe = e.question_eclair;
    if (qe?.options?.length) {
      const b = document.createElement('div');
      b.className = 'carte xa-question apparait';
      b.innerHTML = `<span class="surtitre">Question éclair · non notée</span><p style="font-weight:600"></p><div class="xa-options"></div><div data-retour></div>`;
      b.querySelector('p').textContent = typo(qe.question);
      let premier = true;
      for (const o of qe.options) {
        const bt = document.createElement('button');
        bt.type = 'button'; bt.className = 'btn btn-secondaire'; bt.lang = 'en'; bt.textContent = o;
        bt.addEventListener('click', () => {
          const juste = norm(o) === norm(qe.bonne);
          const cible = (qe.retours?.cibles || []).find((c) => (c.si || []).map(norm).includes(norm(o)));
          const explication = juste ? qe.retours?.juste : cible?.retour || qe.retours?.faux_par_defaut || '';
          bt.classList.add(juste ? 'choisi-juste' : 'choisi-faux');
          b.querySelector('[data-retour]').replaceChildren(juste ? retour.juste(explication) : retour.faux('Pas tout à fait.', { explication }));
          ctx.signaler.essai({ juste, item: `${e.id}-question`, element: qe.question, attendu: qe.bonne, donne: o, explication, premier_essai: premier, remediation: [e.id] });
          ctx.tracer('reponse_donnee', { item: `${e.id}-question`, juste });
          premier = false;
          if (juste) { for (const x of b.querySelectorAll('.xa-options .btn')) x.disabled = true; ctx.signaler.fin({ score: null, reussi: true, sans_note: true }); }
        });
        b.querySelector('.xa-options').append(bt);
      }
      if (memo?.tableau?.length) zone.prepend(b); else zone.append(b);
    } else ctx.signaler.fin({ score: null, reussi: true, sans_note: true });
  }

  poserImage(null);
  ctx.signaler.pret();
  // Démarrage automatique si le son est déjà débloqué (arrivée par un clic) ; sinon le bouton attend un geste.
  if (audio.estDebloque()) { montrerLancer(false); setTimeout(() => { if (!ctrl.signal.aborted) { enVue(); jouerReplique(0); } }, 700); }
  return {
    demonter() { jeton += 1; ctrl.abort(); audio.arreter('media'); },
  };
}
