import { e, coquille } from '../ui.js';
import { unite, lien } from '../../services/unite.js';
import { lirePassation, sauverPassation, chargerEtapes, selection, cleQuestion, scoreAutomatique, trace } from '../../services/passation.js';
import { effacer, ecrire } from '../../services/stockage.js';
import { lirePrise } from '../../services/evaluation.js';
export async function afficher(racine) {
  const id=unite(), zone=coquille(racine,'niveau');const {etapes}=await chargerEtapes(id), t=lirePassation(id);
  if(!t){zone.innerHTML=`<h1>Votre évaluation</h1><p>Aucune passation commencée.</p><a href="${lien('',id)}">Ouvrir les questions</a>`;return;}
  const questions=[],attentes=[];
  for(const d of etapes){const s=selection(d,t);if(!s.items.length)attentes.push({d,s});for(const x of s.items)questions.push({d,x,cle:cleQuestion(d,x),branche:s.branche});}
  const sans=questions.filter(q=>!t.reponses[q.cle]||t.reponses[q.cle].passe);
  const liens=refs=>(refs||[]).map(ref=>`<a href="${lien('',ref)}">${e(ref)}</a>`).join(' · ');
  zone.innerHTML=`<div class="entete-page"><h1>Résultats · ${e(id)}</h1><p>${t.mode==='relecture'?'Relecture auteur — aucun résultat noté':'Première tentative notée'} · ${t.remis?'remise le '+new Date(t.remis).toLocaleString('fr-FR'):'en cours'}</p><p>${Object.keys(t.reponses).length}/${questions.length+attentes.reduce((n,a)=>n+a.d.selection_items.nombre_items_presentes,0)} tâches/questions parcourues · ${sans.length} sans réponse · ${attentes.length} branche(s) en attente.</p></div><div data-resultats class="unites"></div>${!t.remis?'<button class="btn btn-primaire" data-remettre>Remettre mon test</button>':''}${t.mode==='relecture'&&t.remis?'<button class="btn btn-secondaire" data-recommencer>Nouvelle relecture auteur</button>':''}<p><a href="${lien('',id)}">Revenir aux questions</a> · <a href="#/unite/EVAL/bilan-final">Votre bilan final</a></p>`;
  const res=zone.querySelector('[data-resultats]');
  for(const [c,nom] of [['ecouter','Écouter'],['lire','Lire'],['parler','Parler'],['ecrire','Écrire']]){
    const qs=questions.filter(q=>q.d.competences[0]===c), rs=qs.map(q=>t.reponses[q.cle]).filter(Boolean);
    let contenu=`<h2>${nom}</h2><p>${rs.length}/${qs.length} questions parcourues · ${rs.filter(r=>r.incident).length} incident(s) · ${rs.filter(r=>r.manuel&&!r.incident&&!r.passe).length} à relire</p>`;
    if(t.remis){
      for(const branche of [...new Set(qs.map(q=>q.branche))]){const selectionnees=qs.filter(q=>q.branche===branche);const br=selectionnees.map(q=>t.reponses[q.cle]||{juste:q.x.audio||q.x.stimulus_audio?null:false,incident:q.x.audio||q.x.stimulus_audio?'ecoute_non_effectuee':null,manuel:q.d.correction?.mode==='formateur'});const s=scoreAutomatique(br);contenu+=`<p>${e(branche)} : ${s?`${s.justes}/${s.sur} observées (${selectionnees.length} présentées)`:'score null · correction humaine ou non observé'}</p>`;}
      if(c==='parler')contenu+='<p>Grilles humaines distinctes : lecture /36 · répétition /72 · parole libre /48. Aucun score avant correction humaine.</p>';
      for(const {d,x,cle} of qs){const r=t.reponses[cle];const segs=[x.audio||x.stimulus_audio,...(x.suite_audio||[])].filter(Boolean);contenu+=`<details style="margin:14px 0"><summary>${e(x.id)} · ${r?.incident?'Non observé':r?.manuel?(r.passe?'Non répondu':'À relire'):!r||r.passe?'Non répondu':r.juste?'Juste':'À revoir'}</summary>${x.support?.texte?`<p style="white-space:pre-wrap">${e(x.support.texte)}</p>`:''}${segs.map(s=>`<p><b>${e(s.personnage||'')}</b> ${e(s.texte||'')}</p>`).join('')}<p>${e(r?.donne||'')}</p>${x.bonne?`<p>Réponse attendue : ${e(x.bonne)}</p>`:''}<p>${e(r?.incident||r?.explication||'Question non répondue.')}</p>${(r?.prises||[]).map(k=>`<button class="btn btn-secondaire" data-prise="${e(k)}">Réécouter ma production</button><audio controls hidden style="max-width:100%"></audio>`).join('')}<p>Révisions : ${liens(x.remediation||d.remediation)}</p></details>`;}
    } else contenu+=qs.filter(q=>!t.reponses[q.cle]).map(q=>`<p><a href="${lien('etape/'+q.d.id,id)}">${e(q.x.id)} · sans réponse</a></p>`).join('');
    contenu+=attentes.filter(a=>a.d.competences[0]===c).map(a=>`<p>${a.s.incident?'Branche suspendue : incident dans la série commune.':'Branche non encore déterminée.'} Quatre questions réservées ; aucune question de l’autre branche comptée.</p>`).join('');
    res.insertAdjacentHTML('beforeend',`<section class="carte" style="padding:20px;min-width:0">${contenu}</section>`);
  }
  zone.querySelector('[data-remettre]')?.addEventListener('click',()=>{if(t.remis)return;t.remis=Date.now();trace(t,'remise');sauverPassation(id,t);afficher(racine);});
  zone.querySelector('[data-recommencer]')?.addEventListener('click',()=>{effacer(`eval:${id}:relecture`);ecrire(`eval-mode:${id}`,'relecture');location.hash=lien('',id);});
  const urls=[];for(const b of zone.querySelectorAll('[data-prise]'))b.onclick=async()=>{const blob=await lirePrise(b.dataset.prise);if(!blob){b.textContent='Production indisponible sur cet appareil';return;}const url=URL.createObjectURL(blob);urls.push(url);b.nextElementSibling.src=url;b.nextElementSibling.hidden=false;b.hidden=true;};
  return ()=>urls.forEach(URL.revokeObjectURL);
}
