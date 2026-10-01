// ACTIVITÉ DE RÉFÉRENCE DU CONTRAT — « écouter et répéter » (type repeter de script/prononciation.json).
// Volontairement simple : modèle normal et lent, enregistrement, note mot par mot, conseil du script
// sur le mot faible, réécoute de sa voix. La version riche de la leçon est celle de B2
// (activities/prononciation/repeter.js). Pour jouer cette référence malgré tout : #/etape/PRO-1?module=socle
export const meta = { titre: 'Écouter et répéter (référence du socle)' };

const STYLE = `
.act-socle-repeter { display: grid; gap: 14px; }
.rp-carte { padding: 18px; display: grid; gap: 12px; }
.rp-phrase { font-family: var(--police-titre); font-size: clamp(1.35rem, 1.1rem + 1vw, 1.8rem); line-height: 1.3; }
.rp-ligne { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.rp-mots { display: flex; flex-wrap: wrap; gap: 6px; }
.rp-mot { padding: 4px 10px; border-radius: 999px; font-weight: 600; border: 1px solid; }
.rp-mot.juste { color: var(--juste-fonce); background: var(--juste-voile); border-color: var(--juste-bord); }
.rp-mot.approche { color: var(--ambre); background: var(--ambre-voile); border-color: #EBD3A6; }
.rp-mot.faux, .rp-mot.absent { color: var(--faux-fonce); background: var(--faux-voile); border-color: var(--faux-bord); }
.rp-mot.absent { text-decoration: line-through; }
.rp-niveau { width: 90px; height: 6px; border-radius: 3px; background: var(--filet); overflow: hidden; }
.rp-niveau span { display: block; height: 100%; width: 0; background: var(--c-parler); transition: width .08s; }
.rp-note { font-size: 1.6rem; font-family: var(--police-titre); font-weight: 600; }
`;

export async function monter(racine, ctx) {
  ctx.ajouterStyle(STYLE);
  const { voix, micro, prononciation, retour, icones, sons } = ctx.services;
  const items = ctx.donnees?.items || [];
  await voix.pret();
  const notes = [];
  let i = 0;
  let prise = null;
  let modeEcoute = !micro.disponible().ok;

  function rendre() {
    const it = items[i];
    if (!it) {
      const moy = notes.length ? notes.reduce((s, n) => s + n, 0) / notes.length : null;
      racine.innerHTML = `<div class="carte rp-carte apparait"><h2>Série terminée</h2>
        <p>${moy == null ? 'Faite en mode écoute : non notée.' : `Note moyenne : ${Math.round(moy)} sur 100 (note calculée mot par mot).`}</p></div>`;
      ctx.signaler.fin(moy == null ? { score: null, reussi: true, sans_note: true } : { score: moy / 100 });
      return;
    }
    racine.innerHTML = `
      <div class="carte rp-carte apparait">
        <span class="surtitre">Phrase ${i + 1} sur ${items.length}</span>
        <p class="rp-phrase" lang="en"></p>
        <p class="discret"></p>
        <div class="rp-ligne" data-voix>
          <button type="button" class="btn btn-secondaire" data-modele>${icones.ecouter}<span>Écouter</span></button>
          <button type="button" class="btn btn-secondaire" data-lent>${icones.lent}<span>Lent</span></button>
        </div>
        ${it.piege ? `<div data-piege></div>` : ''}
        <div class="rp-ligne">
          ${modeEcoute ? '<span class="petit discret">Micro indisponible : écoutez, répétez à voix haute, puis passez à la suite.</span>'
            : `<button type="button" class="btn btn-primaire" data-enr>${icones.micro}<span>M'enregistrer</span></button><span class="rp-niveau" aria-hidden="true"><span></span></span>`}
          <span class="petit discret" data-etat aria-live="polite"></span>
        </div>
        <div data-resultat></div>
        <div class="rp-ligne"><button type="button" class="btn btn-fantome" data-suivant>${i + 1 < items.length ? 'Phrase suivante' : 'Terminer'}${icones.suivant}</button></div>
      </div>`;
    racine.querySelector('.rp-phrase').textContent = it.en;
    racine.querySelector('p.discret').textContent = it.fr || '';
    if (it.piege) racine.querySelector('[data-piege]').append(retour.info(it.piege));
    racine.querySelector('[data-modele]').addEventListener('click', () => { voix.jouer(it.modele?.id); ctx.tracer('audio_ecoute', { segment: it.modele?.id }); });
    racine.querySelector('[data-lent]').addEventListener('click', () => { voix.jouer(it.modele_lent?.id || it.modele?.id, { vitesse: it.modele_lent ? 1 : 0.75 }); ctx.tracer('audio_ecoute', { segment: it.modele_lent?.id }); });
    racine.querySelector('[data-suivant]').addEventListener('click', () => { prise?.annuler(); prise = null; i += 1; rendre(); });
    racine.querySelector('[data-enr]')?.addEventListener('click', enregistrer);
    setTimeout(() => { if (items[i] === it) voix.jouer(it.modele?.id); }, 400);
  }

  async function enregistrer(ev) {
    const bt = ev.currentTarget;
    const etat = racine.querySelector('[data-etat]');
    const it = items[i];
    if (prise) { const p = prise; prise = null; bt.disabled = true; etat.textContent = 'Analyse…'; return noter(await p.arreter(), it, bt, etat); }
    try { await micro.ouvrir(); }
    catch (err) {
      modeEcoute = true;
      etat.textContent = err.code === 'refuse' ? 'Micro refusé : mode écoute.' : 'Micro indisponible : mode écoute.';
      bt.remove();
      return;
    }
    const moi = micro.enregistrer({ dureeMax: 8000, surNiveau: (v) => { const n = racine.querySelector('.rp-niveau span'); if (n) n.style.width = `${Math.round(v * 100)}%`; } });
    prise = moi;
    bt.innerHTML = `${icones.stop}<span>J'ai fini</span>`;
    etat.textContent = 'Je vous écoute…';
    // Arrêt automatique au bout de 8 s : seulement si l'apprenant n'a pas déjà arrêté lui-même.
    moi.fin.then((enr) => { if (prise === moi && enr) { prise = null; bt.disabled = true; etat.textContent = 'Analyse…'; noter(enr, it, bt, etat); } });
  }

  async function noter(enr, it, bt, etat) {
    if (!enr) return;
    const r = await prononciation.noter(enr.blob, it.en);
    ctx.tracer('enregistrement_depose', { item: it.id });
    bt.disabled = false;
    bt.innerHTML = `${icones.micro}<span>Recommencer</span>`;
    const zone = racine.querySelector('[data-resultat]');
    if (!r.ok) { etat.textContent = r.message || 'Réessayez.'; zone.replaceChildren(); return; }
    etat.textContent = '';
    ctx.tracer('note_prononciation', { item: it.id, note: r.notes.globale });
    notes.push(r.notes.globale);
    const faibles = r.mots.filter((m) => m.statut !== 'juste');
    const conseil = faibles.map((m) => it.si_mot_faible?.[m.attendu.replace(/[.,!?]+$/, '')] || it.si_mot_faible?.[m.attendu.toLowerCase().replace(/[.,!?]+$/, '')]).find(Boolean);
    zone.innerHTML = `<div class="rp-ligne"><span class="rp-note">${r.notes.globale}</span><span class="petit discret">sur 100 · ${r.avertissement ? 'note calculée mot par mot' : ''}</span></div><div class="rp-mots" lang="en"></div>`;
    for (const m of r.mots) { const s = document.createElement('span'); s.className = `rp-mot ${m.statut}`; s.textContent = m.attendu; s.title = m.entendu ? `entendu : ${m.entendu}` : 'non entendu'; zone.querySelector('.rp-mots').append(s); }
    if (faibles.length) {
      zone.append(retour.faux('À retravailler.', { explication: conseil || `Mot${faibles.length > 1 ? 's' : ''} à reprendre : ${faibles.map((m) => m.attendu).join(', ')}.` }));
      ctx.signaler.essai({ juste: false, item: it.id, element: it.en, attendu: faibles.map((m) => m.attendu).join(' '), donne: r.transcription, explication: conseil || '', premier_essai: notes.length === 1, famille_erreur: 'prononciation' });
    } else {
      zone.append(retour.juste('Tous les mots ont été reconnus.'));
      ctx.signaler.essai({ juste: true, item: it.id, premier_essai: true });
      sons.jouer('juste');
    }
    const moi = document.createElement('button');
    moi.type = 'button'; moi.className = 'btn btn-secondaire'; moi.setAttribute('data-voix', '');
    moi.innerHTML = `${icones.ecouter}<span>Réécouter ma voix</span>`;
    moi.addEventListener('click', () => ctx.services.audio.jouer(enr.url));
    zone.append(moi);
  }

  rendre();
  ctx.signaler.pret();
  return { demonter() { prise?.annuler(); } };
}
