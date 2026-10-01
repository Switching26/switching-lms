// activities/exercices/appariement.js — EX-01 « Associer les pronoms » (exercices.json, type appariement).
//
// Étiquettes françaises à gauche, pronoms anglais fixes à droite (avec leur son).
// Au doigt (téléphone, tablette) : on TOUCHE un mot, puis son pronom ; la paire se forme : le pronom
// vient s'accrocher au mot. Aucune ligne au doigt.
// À la souris (ordinateur) : clic puis clic, ou on TRACE la ligne du mot jusqu'au pronom ; chaque bonne
// association laisse sa ligne. Clavier : Entrée sur un mot, puis Entrée sur un pronom.
// Une mauvaise association revient avec l'explication de l'erreur, tirée du script.
import { lancerEtiquettes } from './_etiquettes.js';
import { el, esc, icone, liste, voixDisponible, jouerVoix, pointeurFin } from './_commun.js';

export const meta = { titre: 'Associer', entete: true };
const P = '.act-exercices-appariement';

export async function monter(racine, ctx) {
  return lancerEtiquettes(racine, ctx, {
    type: 'appariement',
    prefixe: P,
    css,
    cibles: (etape) => liste(etape.cibles).map((c) => (typeof c === 'string' ? { nom: c } : { nom: c.en ?? c.nom ?? c.texte, audio: c.audio })),
    libelleEtat: (n, t) => `${n} sur ${t} associées`,
    modeEmploi: (souris) => ctx.unite && ctx.unite !== 'U01' ? 'Choisissez une étiquette, puis la réponse qui lui correspond.' : (souris
      ? 'Cliquez un mot français puis son pronom, ou tracez la ligne à la souris.'
      : 'Touchez un mot français, puis le pronom anglais qui lui correspond.'),
    second_indice: (item) => {
      const paren = item?.etiquette?.match(/\(([^)]+)\)/);
      return paren ? `Pour « ${item.etiquette} », lisez bien la précision entre parenthèses : ${paren[1]}.` : null;
    },
    vue,
  });
}

function vue(hote, modele, api) {
  const { ctx, signal } = api;
  const lignesActives = pointeurFin();   // souris : lignes ; doigt : paires accrochées
  const plateau = el('div', { class: `b3-app ${lignesActives ? 'b3-app-lignes-on' : 'b3-app-doigt'}` });
  if(ctx.unite !== 'U01') plateau.classList.add('b3-app-textes');
  const gauche = el('div', { class: 'b3-app-col b3-app-gauche', role: 'group', 'aria-label': 'Mots français' });
  const droite = el('div', { class: 'b3-app-col b3-app-droite', role: 'group', 'aria-label': ctx.unite && ctx.unite !== 'U01' ? 'Réponses à associer' : 'Pronoms anglais' });
  const NS = 'http://www.w3.org/2000/svg';
  const lignes = document.createElementNS(NS, 'svg');
  lignes.setAttribute('class', 'b3-app-lignes');
  lignes.setAttribute('aria-hidden', 'true');
  if (lignesActives) plateau.append(lignes);
  plateau.append(gauche, droite);
  hote.append(plateau);

  const boutonsEtiq = new Map();
  const cartesCible = new Map();
  const tracees = new Map();        // id → path (lignes justes, souris)
  let ligneLibre = null;            // ligne qui suit la souris pendant un tracé

  for (const e of modele.etiquettes) {
    const b = el('button', { type: 'button', class: 'b3-jeton b3-app-etiq', 'data-etiq': e.id, 'aria-pressed': 'false' },
      el('span', { class: 'b3-app-texte', texte: e.texte }),
      el('span', { class: 'b3-app-paire', lang: 'en', 'aria-hidden': 'true' }),
      lignesActives ? el('span', { class: 'b3-app-port', 'aria-hidden': 'true' }) : null);
    b.addEventListener('click', () => {
      api.choisir(e.id);
      // Au clavier, on file directement vers les pronoms.
      if (api.choisie() === e.id && b.dataset.clavier === '1') cartesCible.values().next().value?.querySelector('.b3-app-cible-btn')?.focus();
    });
    b.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') b.dataset.clavier = '1'; });
    b.addEventListener('pointerdown', () => { b.dataset.clavier = '0'; });
    if (lignesActives) tracable(b, e.id);
    boutonsEtiq.set(e.id, b);
    gauche.append(b);
  }

  for (const c of modele.cibles) {
    const carte = el('div', { class: 'b3-app-cible', 'data-cible': c.nom });
    const btn = el('button', { type: 'button', class: 'b3-app-cible-btn', lang: 'en', 'aria-label': `Associer à ${c.nom}` },
      lignesActives ? el('span', { class: 'b3-app-port b3-app-port-g', 'aria-hidden': 'true' }) : null,
      el('span', { class: 'b3-app-mot', texte: c.nom }));
    btn.addEventListener('click', () => {
      const id = api.choisie();
      if (!id) { if (c.audio) jouerVoix(ctx, c.audio); inviter(); return; }
      const ok = api.poser(c.nom);
      if (btn.matches(':focus-visible')) {
        const suivante = [...boutonsEtiq.entries()].find(([k]) => !api.estPlace(k));
        (ok ? suivante?.[1] : boutonsEtiq.get(id))?.focus();
      }
    });
    carte.append(btn);
    if (c.audio && voixDisponible(ctx, c.audio)) {
      const ec = el('button', { type: 'button', class: 'b3-app-ecoute', 'data-voix': '', 'aria-label': `Écouter ${c.nom}`, html: icone(ctx, 'ecouter') });
      ec.addEventListener('click', (ev) => { ev.stopPropagation(); jouerVoix(ctx, c.audio); });
      carte.append(ec);
    }
    cartesCible.set(c.nom, carte);
    droite.append(carte);
  }

  function inviter() {
    // Rien de choisi : on rappelle qu'il faut d'abord toucher un mot français.
    gauche.classList.remove('b3-app-invite');
    void gauche.offsetWidth;
    gauche.classList.add('b3-app-invite');
  }

  // ── Lignes (souris seulement) ──
  const centre = (n, cote) => {
    const r = n.getBoundingClientRect(), p = plateau.getBoundingClientRect();
    return { x: (cote === 'd' ? r.right : r.left) - p.left, y: r.top + r.height / 2 - p.top };
  };
  const chemin = (a, b) => {
    const dx = Math.max(24, (b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };
  function tracer(id, nom, classe) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', chemin(centre(boutonsEtiq.get(id), 'd'), centre(cartesCible.get(nom), 'g')));
    path.setAttribute('class', classe);
    lignes.append(path);
    return path;
  }
  function redessiner() {
    if (!lignesActives) return;
    const p = plateau.getBoundingClientRect();
    lignes.setAttribute('viewBox', `0 0 ${Math.max(1, p.width)} ${Math.max(1, p.height)}`);
    for (const [id, path] of tracees) {
      const nom = api.cibleDe(id);
      if (nom) path.setAttribute('d', chemin(centre(boutonsEtiq.get(id), 'd'), centre(cartesCible.get(nom), 'g')));
    }
  }
  if (lignesActives) {
    const obs = new ResizeObserver(() => redessiner());
    obs.observe(plateau);
    signal.addEventListener('abort', () => obs.disconnect(), { once: true });
    requestAnimationFrame(redessiner);
  }

  // ── Tracer à la souris, de l'étiquette jusqu'au pronom ──
  function tracable(b, id) {
    let actif = false, pid = null, x0 = 0, y0 = 0;
    b.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'mouse' || ev.button !== 0 || api.estPlace(id)) return;
      actif = true; pid = ev.pointerId; x0 = ev.clientX; y0 = ev.clientY;
    }, { signal });
    b.addEventListener('pointermove', (ev) => {
      if (!actif || ev.pointerId !== pid) return;
      if (!ligneLibre && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!ligneLibre) {
        try { b.setPointerCapture(pid); } catch { /* rien */ }
        if (api.choisie() !== id) api.choisir(id);
        ligneLibre = document.createElementNS(NS, 'path');
        ligneLibre.setAttribute('class', 'b3-ligne-libre');
        lignes.append(ligneLibre);
      }
      const p = plateau.getBoundingClientRect();
      ligneLibre.setAttribute('d', chemin(centre(b, 'd'), { x: ev.clientX - p.left, y: ev.clientY - p.top }));
      const sous = cibleSous(ev.clientX, ev.clientY);
      for (const c of cartesCible.values()) c.classList.toggle('b3-cible-survol', c === sous);
    }, { signal });
    const fin = (ev, annule) => {
      if (!actif) return;
      actif = false;
      const trace = !!ligneLibre;
      ligneLibre?.remove(); ligneLibre = null;
      for (const c of cartesCible.values()) c.classList.remove('b3-cible-survol');
      try { b.releasePointerCapture(pid); } catch { /* rien */ }
      if (!trace || annule) return;
      b.dataset.trace = '1';
      setTimeout(() => { delete b.dataset.trace; }, 50);
      const sous = cibleSous(ev.clientX, ev.clientY);
      if (sous) api.poser(sous.dataset.cible, id);
      else api.choisir(id);   // tracé lâché dans le vide : on désélectionne
    };
    b.addEventListener('pointerup', (ev) => fin(ev, false), { signal });
    b.addEventListener('pointercancel', (ev) => fin(ev, true), { signal });
    // Un tracé terminé n'est pas aussi un clic.
    b.addEventListener('click', (ev) => { if (b.dataset.trace) { ev.stopImmediatePropagation(); ev.preventDefault(); } }, { capture: true, signal });
  }
  function cibleSous(x, y) {
    for (const c of cartesCible.values()) {
      const r = c.getBoundingClientRect();
      if (x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 6 && y <= r.bottom + 6) return c;
    }
    return null;
  }

  return {
    element: plateau,
    etiquette: (id) => boutonsEtiq.get(id),
    cible: (nom) => cartesCible.get(nom)?.querySelector('.b3-app-cible-btn') || cartesCible.get(nom),
    selection(id) {
      for (const [k, b] of boutonsEtiq) b.setAttribute('aria-pressed', String(k === id));
      plateau.classList.toggle('b3-app-attente', !!id);
    },
    succes(id, nom, { demo } = {}) {
      const b = boutonsEtiq.get(id);
      b.classList.add('b3-ok');
      if (demo) b.classList.add('b3-par-aide');
      b.disabled = true;
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', `${b.querySelector('.b3-app-texte').textContent} : associé à ${nom}`);
      const paire = b.querySelector('.b3-app-paire');
      paire.textContent = nom;
      paire.classList.add('b3-app-paire-on');
      const carte = cartesCible.get(nom);
      const n = Number(carte.dataset.recus || 0) + 1;
      carte.dataset.recus = String(n);
      carte.classList.remove('b3-app-recoit'); void carte.offsetWidth; carte.classList.add('b3-app-recoit');
      if (lignesActives) { redessiner(); tracees.set(id, tracer(id, nom, `b3-ligne-juste${demo ? ' b3-ligne-demo' : ''}`)); }
    },
    echec(id, nom) {
      const b = boutonsEtiq.get(id);
      b.classList.remove('b3-secoue'); void b.offsetWidth; b.classList.add('b3-secoue');
      const carte = cartesCible.get(nom);
      carte.classList.remove('b3-app-refus'); void carte.offsetWidth; carte.classList.add('b3-app-refus');
      if (lignesActives) { redessiner(); const path = tracer(id, nom, 'b3-ligne-fausse'); setTimeout(() => path.remove(), 900); }
    },
    reinitialiser() { lignes.replaceChildren(); tracees.clear(); },
    redessiner,
  };
}

function css(p) {
  return `
${p} .b3-app { position: relative; display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); column-gap: 14px; align-items: stretch; }
${p} .b3-app-lignes-on { column-gap: 34px; }
@media (min-width: 768px) { ${p} .b3-app-lignes-on { grid-template-columns: minmax(0, 300px) minmax(0, 220px); column-gap: clamp(64px, 12vw, 140px); justify-content: center; } }
@media (min-width: 768px) { ${p} .b3-app-doigt { grid-template-columns: minmax(0, 340px) minmax(0, 220px); column-gap: 48px; justify-content: center; } }
${p} .b3-app-lignes { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 0; }
${p} .b3-app-col { display: flex; flex-direction: column; gap: 8px; position: relative; z-index: 1; min-width: 0; }
${p} .b3-app-droite { justify-content: space-around; gap: 10px; }
${p} .b3-app-etiq { justify-content: flex-start; text-align: left; padding: 8px 12px; min-height: 46px; font-weight: 500; font-size: 0.97rem; position: relative; gap: 8px; }
${p} .b3-app-texte { flex: 1; min-width: 0; }
${p} .b3-app-paire { display: none; flex: none; font-weight: 700; font-size: 0.95rem; padding: 2px 9px; border-radius: 999px; background: var(--surface); color: var(--juste-fonce); border: 1px solid var(--juste-bord); }
${p} .b3-app-doigt .b3-app-paire-on { display: inline-block; animation: b3-accroche .35s var(--ressort) both; }
@keyframes b3-accroche { from { opacity: 0; transform: translateX(14px) scale(.8); } to { opacity: 1; transform: none; } }
${p} .b3-app-port { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--filet-fort); background: var(--surface); flex: none; }
${p} .b3-app-etiq .b3-app-port { position: absolute; right: -6px; top: 50%; transform: translateY(-50%); }
${p} .b3-app-etiq[aria-pressed="true"] .b3-app-port { border-color: var(--marque); background: var(--marque); }
${p} .b3-app-etiq.b3-ok .b3-app-port { border-color: var(--juste); background: var(--juste); }
${p} .b3-app-cible { position: relative; display: flex; align-items: center; min-height: 48px; border-radius: 12px; background: var(--surface); border: 1px solid var(--filet-fort); box-shadow: 0 1px 0 rgba(12,21,40,0.05); transition: border-color .15s, box-shadow .2s, background-color .15s; }
${p} .b3-app-cible-btn { flex: 1; min-width: 0; min-height: 48px; display: flex; align-items: center; gap: 8px; padding: 0 6px 0 14px; background: none; border: 0; border-radius: 12px; cursor: pointer; font: inherit; color: var(--encre); text-align: left; touch-action: manipulation; }
${p} .b3-app-port-g { position: absolute; left: -6px; top: 50%; transform: translateY(-50%); }
${p} .b3-app-mot { overflow-wrap: anywhere; min-width: 0; font-weight: 700; font-size: 1.15rem; letter-spacing: 0.01em; }
@media (max-width: 767px) { ${p} .b3-app-textes { grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); } ${p} .b3-app-textes .b3-app-mot { font-size: .95rem; } }
${p} .b3-app-ecoute { flex: none; width: 44px; height: 44px; margin-right: 2px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 10px; background: transparent; color: var(--c-ecouter); cursor: pointer; touch-action: manipulation; }
${p} .b3-app-ecoute svg { width: 20px; height: 20px; }
@media (hover: hover) { ${p} .b3-app-ecoute:hover { background: var(--c-ecouter-voile); } ${p} .b3-app-cible:hover { border-color: var(--marque-voile-bord); } }
${p} .b3-app-attente .b3-app-cible { border-color: var(--marque-voile-bord); box-shadow: 0 0 0 3px var(--marque-voile); }
${p} .b3-app-cible.b3-cible-survol { border-color: var(--marque); box-shadow: 0 0 0 3px var(--marque-voile-bord); outline: none; }
@keyframes b3-recoit { 0% { box-shadow: 0 0 0 0 rgba(5,150,105,0.35); } 100% { box-shadow: 0 0 0 10px rgba(5,150,105,0); } }
${p} .b3-app-recoit { animation: b3-recoit .6s var(--doux) 1; }
@keyframes b3-refus { 0%, 100% { border-color: var(--filet-fort); } 20%, 60% { border-color: var(--faux); } }
${p} .b3-app-refus { animation: b3-refus .8s ease 1; }
${p} .b3-ligne-juste, ${p} .b3-ligne-fausse, ${p} .b3-ligne-libre { fill: none; stroke-width: 2.5; stroke-linecap: round; }
${p} .b3-ligne-juste { stroke: var(--juste); opacity: 0.75; stroke-dasharray: 800; stroke-dashoffset: 800; animation: b3-trace .5s var(--doux) forwards; }
${p} .b3-ligne-fausse { stroke: var(--faux); stroke-dasharray: 6 6; animation: b3-efface .9s ease forwards; }
${p} .b3-ligne-libre { stroke: var(--marque); stroke-dasharray: 2 7; }
@keyframes b3-trace { to { stroke-dashoffset: 0; } }
@keyframes b3-efface { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
@keyframes b3-invite { 0%,100% { transform: none; } 40% { transform: translateX(3px); } }
${p} .b3-app-invite .b3-app-etiq:not(.b3-ok) { animation: b3-invite .35s ease 1; }
${p} .b3-etat { color: var(--encre-50); font-weight: 600; }
@media (prefers-reduced-motion: reduce) { ${p} .b3-ligne-juste { animation: none; stroke-dashoffset: 0; } ${p} .b3-app-invite .b3-app-etiq, ${p} .b3-app-paire-on { animation: none; } }
`;
}
export { esc };
