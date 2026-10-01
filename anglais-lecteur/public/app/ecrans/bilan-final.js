import { modeLMS } from '../../services/base.js';
import { definirPlan } from '../../services/etat-lms.js';
import { progression } from '../../services/progression.js';
import { unite } from '../../services/unite.js';
import { requete as fetch } from '../../services/base.js';
import { e, coquille } from '../ui.js';
import { lirePassation } from '../../services/passation.js';
import { etatTest } from '../../services/evaluation.js';
import { lien } from '../../services/unite.js';
export async function afficher(racine) {
  const zone=coquille(racine,'niveau');const spec=await(await fetch('/contenu/EVAL/script/bilan-final.json')).json();
  const sources=['EVAL','T1','T2','T3','T4','T5','T6','EVAL-B1','EVAL-B2'].map(id=>({id,t:id.startsWith('EVAL')?lirePassation(id,'note'):etatTest(id)})).filter(s=>s.t?.remis);
  const preuves=ids=>sources.flatMap(s=>Object.values(s.t.reponses).filter(r=>ids.includes(r.item)).map(r=>({s,r})));
  const liens=ps=>ps.length?ps.map(({s,r})=>`<a href="${lien('bilan',s.id)}">${e(s.id)} · ${e(r.item)} · ${new Date(r.date||s.t.remis).toLocaleDateString('fr-FR')} · ${r.incident||r.mediaAbsent?'non observé':r.manuel?'correction humaine attendue':'réponse disponible'}</a>`).join('<br>'):'Aucune preuve conservée pour cette capacité.';
  zone.innerHTML=`<div class="entete-page"><h1>${e(spec.titre)}</h1><p>Provisoire : corrections et observations du formateur attendues.</p><p>Objectif initial : non renseigné. Aucun niveau ni résultat officiel attribué.</p></div><div class="unites">${[['ecouter','Écouter'],['lire','Lire'],['parler','Parler'],['ecrire','Écrire']].map(([c,nom])=>`<section class="carte" style="padding:20px;min-width:0"><h2>${nom}</h2><p>Conclusion humaine non renseignée. Votre formateur vérifiera les preuves avec vous.</p>${spec.correspondances.filter(x=>x.competence===c).map(x=>`<details><summary>${e(x.capacite)}</summary><p>Au départ : ${liens(preuves(x.preuves_entree))}</p><p>Maintenant : ${liens(preuves(x.preuves_fin_candidates))}</p><p>${e(x.comparabilite)}</p><p>Révisions possibles : ${x.remediation.map(id=>`<a href="${lien('',id)}">${e(id)}</a>`).join(' · ')}</p></details>`).join('')}</section>`).join('')}</div><section class="carte" style="padding:20px;margin-top:20px"><h2>Vos deux priorités</h2><p>À convenir avec votre formateur à partir des corrections. Action, responsable et date : non renseignés.</p><h2>Pour votre certification</h2><p>Les blancs exercent les quatre compétences ; les lectures et répétitions sont distinctes de la parole libre. Aucune conversion des résultats en score VTest.</p><h2>Fiche formateur</h2><p>Observations visio, grilles et validation datée : non renseignées. Les relectures auteur sont exclues de ce rapport. Une branche non présentée ne constitue aucune preuve.</p>${sources.map(s=>`<p><a href="${lien('bilan',s.id)}">${e(s.id)}</a> · ${new Date(s.t.remis).toLocaleString('fr-FR')} · version ${e(s.t.version||'non renseignée')}</p>`).join('')||'<p>Aucune évaluation notée remise sur cet appareil.</p>'}</section>`;
  if(modeLMS && unite()==='BILAN') {
    definirPlan('BILAN',['lecture']); progression.ouvrir('lecture');
    zone.insertAdjacentHTML('beforeend','<div class="bas-lecon"><button class="btn btn-primaire" data-bilan-lu>J’ai consulté mon bilan</button><button class="btn btn-secondaire" data-lms-vers="mes-formations">Mes formations</button></div>');
    zone.querySelector('[data-bilan-lu]').onclick=()=>{progression.fin('lecture',{sans_note:true});zone.querySelector('[data-bilan-lu]').textContent='Bilan consulté';};
  }
}
