import { requete as fetch } from '../../services/base.js';
// LE BANC D'ESSAI — pour les constructeurs et le chef : les 26 étapes, le module qui les joue
// (constructeur ou repli du socle), les problèmes du plan, et l'état des services.
import { e, coquille, chargement } from '../ui.js';
import { chargerLecon } from '../donnees.js';
import { micro } from '../../services/micro.js';

export async function afficher(racine) {
  const zone = coquille(racine, 'banc');
  chargement(zone);
  const [l, sante, acts] = await Promise.all([
    chargerLecon(true),
    fetch('/api/sante', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    fetch('/api/activites', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
  ]);
  const m = micro.disponible();
  const dispo = l.etapes.filter((x) => x.disponible).length;
  zone.innerHTML = `
    <div class="entete-page"><span class="surtitre">Banc d'essai</span><h1>Les ${l.etapes.length} étapes de la leçon</h1>
      <p>${dispo} jouables · ${l.etapes.length - dispo} en attente. Chaque ligne ouvre l'étape dans le vrai lecteur.</p></div>
    ${l.problemes.length ? `<div class="encart encart-faux" style="margin-bottom:16px"><span><b>Problèmes du plan</b><span class="explication">${l.problemes.map(e).join('<br>')}</span></span></div>` : `<div class="encart encart-juste" style="margin-bottom:16px"><span>Aucun problème dans le plan.</span></div>`}
    <div class="carte defile-x" style="padding:6px 12px">
      <table class="table-banc"><thead><tr><th>#</th><th>Étape</th><th>Type</th><th>Joué par</th><th>État</th></tr></thead><tbody>
      ${l.etapes.map((x) => `<tr>
        <td>${x.rang}</td>
        <td><a href="#/etape/${e(x.id)}?banc=1"><b>${e(x.id)}</b></a><br><span class="discret">${e(x.titre || '')}</span></td>
        <td><code>${e(x.type || '—')}</code></td>
        <td>${x.module ? `<code>${e(x.module)}</code>${x.par === 'socle' ? '<br><span class="discret">repli du socle</span>' : ''}` : '—'}</td>
        <td>${x.disponible ? '<span class="ok">jouable</span>' : `<span class="ko">${e(x.raison || 'indisponible')}</span>`}</td></tr>`).join('')}
      </tbody></table></div>
    <div class="section-titre"><h2>Services</h2></div>
    <div class="carte" style="padding:16px;display:grid;gap:8px">
      <p>Serveur : ${sante?.ok ? `<span class="ok">en ligne</span> (port ${e(sante.port)})` : '<span class="ko">injoignable</span>'}</p>
      <p>Note de prononciation : ${sante?.prononciation?.pret ? `<span class="ok">prête</span> — ${e(sante.prononciation.modele || '')}` : `<span class="ko">${e(sante?.prononciation?.raison || 'indisponible')}</span>`}</p>
      <p>Micro sur cette page : ${m.ok ? '<span class="ok">disponible</span>' : `<span class="ko">${e(m.raison)}</span> (le micro exige l'adresse HTTPS)`}</p>
      <p>Modules trouvés : ${acts ? Object.entries(acts.familles).map(([f, l2]) => `${e(f)} (${l2.length})`).join(' · ') : '—'}</p>
    </div>`;
}
