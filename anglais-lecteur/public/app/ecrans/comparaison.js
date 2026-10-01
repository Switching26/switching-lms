// LE VOLET « COMPARER AVEC REFLEX'ENGLISH » : leur page équivalente (captures) et ce que nous faisons
// mieux (texte de D, script/comparaison.json). Lecture tolérante : le format exact appartient à D.
import { e } from '../ui.js';
import { scriptOptionnel } from '../../services/script.js';
import { icones } from '../../services/icones.js';

const CLES_MIEUX = ['nous_mieux', 'mieux', 'ce_que_nous_faisons_mieux', 'notre_plus', 'avantage', 'phrase', 'nous'];
const CLES_EUX = ['leur_page', 'leurs_pages', 'pages', 'eux', 'chez_eux', 'reflex', 'concurrent'];

function captures(noeud, acc = new Set()) {
  if (typeof noeud === 'string') {
    const m = noeud.match(/([A-Za-z0-9_-]+)\.(png|jpe?g|webp)$/i);
    if (m) acc.add(m[1]);
  } else if (Array.isArray(noeud)) noeud.forEach((n) => captures(n, acc));
  else if (noeud && typeof noeud === 'object') Object.values(noeud).forEach((n) => captures(n, acc));
  return acc;
}

function textes(noeud, cles) {
  const out = [];
  const visiter = (n) => {
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      if (cles.includes(k)) {
        if (typeof v === 'string') out.push(v);
        else if (Array.isArray(v)) v.forEach((x) => (typeof x === 'string' ? out.push(x) : x?.nom ? out.push(x.nom) : x?.titre ? out.push(x.titre) : null));
        else if (v?.nom || v?.titre) out.push(v.nom || v.titre);
      } else if (typeof v === 'object') visiter(v);
    }
  };
  visiter(noeud);
  return [...new Set(out)];
}

async function entreePour(id) {
  const c = await scriptOptionnel('comparaison.json');
  if (!c) return { entree: null, global: null };
  const listes = [c?.correspondances, c?.etapes, c?.comparaisons, c?.items, Array.isArray(c) ? c : null].filter(Array.isArray);
  for (const l of listes) {
    const t = l.find((x) => x && (x.notre_etape === id || x.id === id || x.etape === id || x.ref === id));
    if (t) return { entree: t, global: c };
  }
  return { entree: null, global: c };
}

export async function ouvrirComparaison(etape) {
  const voile = document.createElement('div');
  voile.className = 'voile';
  const volet = document.createElement('aside');
  volet.className = 'volet';
  volet.setAttribute('role', 'dialog');
  volet.setAttribute('aria-modal', 'true');
  volet.setAttribute('aria-label', 'Comparer avec Reflex’English');
  volet.setAttribute('data-voix', '');
  volet.innerHTML = `<div class="poignee" aria-hidden="true"></div>
    <div class="volet-tete"><h2>Chez Reflex'English</h2><button class="btn-icone" type="button" data-fermer aria-label="Fermer la comparaison">${icones.fermer}</button></div>
    <div class="volet-corps"><div class="chargement" style="min-height:20vh"><div class="rond-chargement"></div></div></div>`;
  document.body.append(voile, volet);
  const avant = document.activeElement;
  const fermer = () => {
    voile.classList.remove('ouvert'); volet.classList.remove('ouvert');
    document.removeEventListener('keydown', surTouche);
    setTimeout(() => { voile.remove(); volet.remove(); avant?.focus?.(); }, 350);
  };
  const surTouche = (ev) => { if (ev.key === 'Escape') fermer(); };
  document.addEventListener('keydown', surTouche);
  voile.addEventListener('click', fermer);
  volet.querySelector('[data-fermer]').addEventListener('click', fermer);
  window.addEventListener('hashchange', fermer, { once: true });
  requestAnimationFrame(() => { voile.classList.add('ouvert'); volet.classList.add('ouvert'); volet.querySelector('[data-fermer]').focus(); });

  const { entree } = await entreePour(etape.id);
  const corps = volet.querySelector('.volet-corps');
  const nomCapture = (chemin) => (String(chemin || '').match(/([A-Za-z0-9_-]+)\.(png|jpe?g|webp)$/i) || [])[1] || null;
  const reserve = entree?.reserve ? `<p class="petit discret" style="margin-top:10px"><b>Réserve :</b> ${e(entree.reserve)}</p>` : '';
  const bien = entree?.ils_font_bien ? `<div class="mieux"><h3>Ce qu'ils font bien</h3><p class="discret">${e(entree.ils_font_bien)}</p></div>` : '';
  if (entree && Array.isArray(entree.leurs_pages) && !entree.leurs_pages.length) {
    // Pas d'équivalent chez eux : on le dit en une phrase, sans titre vide ni carte « aucune page ».
    corps.innerHTML = `
      <p style="font-weight:600">${e(entree.sans_equivalent || 'Reflex\u2019English n\u2019a pas d\u2019équivalent à cette étape dans sa leçon 1.')}</p>
      ${entree.mieux ? `<div class="mieux"><h3>Chez nous</h3><ul><li>${icones.coche}<span>${e(entree.mieux)}</span></li></ul></div>` : ''}
      ${reserve}${bien}`;
    return;
  }
  if (entree && Array.isArray(entree.leurs_pages)) {
    // Format de D : leurs pages (capture, ce qu'ils y font), ce que nous faisons mieux, ce qu'ils font bien.
    corps.innerHTML = `
      <p class="discret petit">Leur page équivalente dans «\u00a0Lesson 01 - Starting out\u00a0»</p>
      <div style="display:grid;gap:12px;margin-top:10px">
        ${entree.leurs_pages.map((pg) => {
          const n = nomCapture(pg.capture);
          return `<div class="bloc" style="padding:12px;display:grid;gap:8px;background:var(--surface)">
            <b>${e(pg.page || '')}</b>
            ${n ? `<figure class="capture" style="margin:0"><img src="./captures/reflex/${e(n)}.webp" alt="Capture de leur page : ${e(pg.page || n)}" loading="lazy" onerror="this.closest('figure').remove()"><figcaption>Leur page, telle qu'elle s'affiche chez eux</figcaption></figure>` : '<p class="petit discret" data-sans-capture>Capture non disponible</p>'}
            ${pg.ce_qu_ils_font ? `<span class="petit" style="color:var(--encre-70)">${e(pg.ce_qu_ils_font)}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${entree.mieux ? `<div class="mieux"><h3>Ce que nous faisons mieux</h3><ul><li>${icones.coche}<span>${e(entree.mieux)}</span></li></ul></div>` : ''}
      ${reserve}${bien}`;
    return;
  }
  const noms = entree ? [...captures(entree)] : ['M-L01-lecon-p1', 'X-L01-lecon-page4'];
  const eux = entree ? textes(entree, CLES_EUX) : [];
  const mieux = entree ? textes(entree, CLES_MIEUX) : [];
  corps.innerHTML = `
    ${eux.length ? `<p class="discret petit">Page équivalente : ${eux.map(e).join(' · ')}</p>` : ''}
    <div style="display:grid;gap:12px;margin-top:12px">
      ${noms.map((n) => `<figure class="capture" style="margin:0"><img src="./captures/reflex/${e(n)}.webp" alt="Capture de la plateforme Reflex'English : ${e(n)}" loading="lazy" onerror="this.closest('figure').remove()"><figcaption>Capture d'août 2026 · ${e(n)}</figcaption></figure>`).join('')}
    </div>
    <div class="mieux">
      <h3>Ce que nous faisons mieux</h3>
      ${mieux.length
        ? `<ul>${mieux.map((m) => `<li>${icones.coche}<span>${e(m)}</span></li>`).join('')}</ul>`
        : `<p class="discret">La comparaison détaillée de cette étape est en cours de rédaction par l'équipe contenu.</p>`}
    </div>`;
}
