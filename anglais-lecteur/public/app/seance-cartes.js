// UNE SÉANCE DE CARTES — partagée par l'écran « Révisions » et l'étape REV de la leçon.
// Mécanique de D (script/revisions.json) : recto, réponse dans sa tête ou à voix haute, verso, puis
// « Je ne savais pas / J'hésitais / Je savais ». À partir de la boîte 3, la carte se révise dans
// l'autre sens (français → anglais).
import { e } from './ui.js';
import { revisions } from '../services/revisions.js';
import { carnet } from '../services/carnet.js';
import { voix } from '../services/voix.js';
import { visuels } from '../services/visuels.js';
import { icones } from '../services/icones.js';

const FAMILLES = { grammaire: 'Grammaire', vocabulaire: 'Vocabulaire', formule: 'Formule', carnet: 'Mon carnet' };

/** Carte du script de D → carte du service de révisions. */
export function carteDepuisScript(c) {
  return {
    id: c.id, famille: c.famille || null, recto: c.recto, verso: c.verso,
    audio: c.audio_recto?.ref || c.audio_recto?.id || (typeof c.audio === 'string' ? c.audio : null),
    exemple: c.exemple?.en || (typeof c.exemple === 'string' ? c.exemple : ''), exemple_fr: c.exemple?.fr || '',
    exemple_audio: c.exemple?.audio?.ref || c.exemple?.audio?.id || null,
    note: c.note || '', image: c.image || null,
  };
}

/**
 * Monte une séance dans `el`. opts : { cartes (liste du service), surNote(carte, resultat), surFin(bilan), signal }
 * Rend { detruire }.
 */
export function seance(el, opts) {
  const file = [...opts.cartes];
  const total = file.length;
  const compte = { su: 0, hesite: 0, oublie: 0 };
  let retournee = false;

  const clavier = (ev) => {
    if (ev.target.closest('input, textarea')) return;
    if (!retournee && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); el.querySelector('[data-retourner]')?.click(); }
    else if (retournee && ['1', '2', '3'].includes(ev.key)) el.querySelector(`[data-note="${['oublie', 'hesite', 'su'][Number(ev.key) - 1]}"]`)?.click();
  };
  document.addEventListener('keydown', clavier, opts.signal ? { signal: opts.signal } : undefined);

  const rendre = () => {
    const c = file[0];
    retournee = false;
    if (!c) {
      const pro = revisions.prochaineDate();
      el.innerHTML = `<div class="carte vide apparait"><div class="puce">${icones.coche}</div>
        <h2>Séance terminée</h2>
        <p style="margin-top:8px">${total} carte${total > 1 ? 's' : ''} revue${total > 1 ? 's' : ''} : ${compte.su} sue${compte.su > 1 ? 's' : ''}, ${compte.hesite} en hésitation, ${compte.oublie} à revoir.</p>
        ${pro ? `<p class="discret" style="margin-top:6px">Prochaine révision ${e(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(pro)))}.</p>` : ''}
        <p class="petit discret" style="margin-top:10px">Une carte sue revient plus tard, une carte oubliée revient dès le lendemain : c'est ce qui fixe les mots dans la mémoire.</p></div>`;
      opts.surFin?.({ total, ...compte });
      return;
    }
    const sensProd = revisions.sens(c) === 'produire';
    const recto = sensProd ? c.verso : c.recto;
    const img = c.image ? visuels.image(c.image,c.source_unite || 'U01') : null;
    const son = c.audio && voix.info(c.audio);
    const sonEx = c.exemple_audio && voix.info(c.exemple_audio);
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;max-width:520px;margin:0 auto 10px">
        <span class="petit discret">Carte ${total - file.length + 1} sur ${total}</span>
        <span style="display:flex;gap:6px">${c.famille ? `<span class="pastille pastille-neutre">${e(FAMILLES[c.famille] || c.famille)}</span>` : ''}<span class="pastille">Boîte ${c.boite}</span></span>
      </div>
      <div class="carte-revision" data-carte>
        <div class="face-in">
          <button type="button" class="carte face recto" data-retourner aria-label="Retourner la carte">
            ${img ? `<img src="${e(img)}" alt="" style="width:88px;height:88px;object-fit:cover;border-radius:14px">` : ''}
            <span class="petit discret">${sensProd ? 'Dites-le en anglais' : 'Anglais'}</span>
            <span class="mot" ${sensProd ? '' : 'lang="en"'}>${e(recto)}</span>
            <span class="petit discret">Touchez pour voir la réponse</span>
          </button>
          <div class="carte face verso" aria-hidden="true">
            <span class="mot" ${sensProd ? 'lang="en"' : ''}>${e(sensProd ? c.recto : c.verso || '')}</span>
            ${c.exemple ? `<span lang="en" style="font-weight:600">${e(c.exemple)}</span>${c.exemple_fr ? `<span class="petit discret">${e(c.exemple_fr)}</span>` : ''}` : ''}
            ${c.note ? `<span class="petit" style="color:var(--encre-70)">${e(c.note)}</span>` : ''}
            <span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
              ${son ? `<button type="button" class="btn btn-secondaire" data-ecouter="${e(c.audio)}">${icones.ecouter}<span>Le mot</span></button>` : c.audio ? '<button type="button" class="btn btn-secondaire" disabled>Voix en préparation</button>' : ''}
              ${sonEx ? `<button type="button" class="btn btn-secondaire" data-ecouter="${e(c.exemple_audio)}">${icones.ecouter}<span>L'exemple</span></button>` : ''}
              ${c.famille !== 'carnet' ? `<button type="button" class="btn btn-fantome" data-carnet>${icones.carnet}<span>${carnet.contient(c.recto) ? 'Dans mon carnet' : 'Garder'}</span></button>` : ''}
            </span>
          </div>
        </div>
      </div>
      <div class="boutons-revision" data-notes hidden>
        <button class="btn btn-secondaire" type="button" data-note="oublie">Je ne savais pas<small>demain</small></button>
        <button class="btn btn-secondaire" type="button" data-note="hesite">J'hésitais<small>reste dans sa boîte</small></button>
        <button class="btn btn-primaire" type="button" data-note="su">Je savais<small style="color:#DDE3EC">monte d'une boîte</small></button>
      </div>`;
    const carteEl = el.querySelector('[data-carte]');
    el.querySelector('[data-retourner]').addEventListener('click', () => {
      retournee = true;
      carteEl.classList.add('retournee');
      carteEl.querySelector('.verso').setAttribute('aria-hidden', 'false');
      carteEl.querySelector('.recto').setAttribute('aria-hidden', 'true');
      el.querySelector('[data-notes]').hidden = false;
      if (son) voix.jouer(c.audio);
    });
    if (!sensProd && son) setTimeout(() => { if (file[0] === c && !retournee) voix.jouer(c.audio); }, 350);
    for (const b of el.querySelectorAll('[data-ecouter]')) b.addEventListener('click', () => voix.jouer(b.dataset.ecouter));
    el.querySelector('[data-carnet]')?.addEventListener('click', (ev) => {
      carnet.ajouter({ mot: c.recto, sens: c.verso, exemple: c.exemple, audio: c.audio, source: 'révisions' });
      ev.currentTarget.querySelector('span').textContent = 'Dans mon carnet';
    });
    for (const b of el.querySelectorAll('[data-note]')) {
      b.addEventListener('click', () => {
        const r = b.dataset.note;
        revisions.noter(c.id, r);
        compte[r] += 1;
        opts.surNote?.(c, r);
        file.shift();
        rendre();
      });
    }
  };
  rendre();
  return { detruire() { document.removeEventListener('keydown', clavier); } };
}
