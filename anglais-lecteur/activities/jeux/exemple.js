// SQUELETTE D'ACTIVITÉ — famille « jeux » (voir CONTRAT-ACTIVITES.md à la racine du prototype).
//
// Pour jouer une étape de script/jeux.json dont le type est, par exemple, « mon_type » :
//   1. copie ce fichier en activities/jeux/mon_type.js ;
//   2. remplis monter() ; la leçon l'utilise aussitôt, sans rien déclarer ;
//   3. supprime ce fichier d'exemple quand tu n'en as plus besoin.
// Références complètes, écrites par le socle : activities/socle/repeter.js et activities/socle/texte_a_trous.js.

export const meta = { titre: 'Exemple (jeux)' };

export async function monter(racine, ctx) {
  const e = ctx.donnees || {};                        // l'étape complète écrite par D
  const { retour } = ctx.services;
  racine.innerHTML = `
    <div class="carte" style="padding:20px">
      <p class="discret petit">Étape ${ctx.etape?.id ?? '?'} · type ${ctx.etape?.type ?? '?'}</p>
      <button class="btn btn-primaire" type="button" data-ok>Je valide</button>
    </div>`;
  racine.querySelector('[data-ok]').addEventListener('click', () => {
    ctx.signaler.essai({ juste: true, item: 'exemple', premier_essai: true });
    racine.append(retour.juste('Le contrat fonctionne.'));
    ctx.signaler.fin({ score: 1 });
  }, { signal: ctx.signal });
  ctx.signaler.pret();
  return { demonter() {} };
}
