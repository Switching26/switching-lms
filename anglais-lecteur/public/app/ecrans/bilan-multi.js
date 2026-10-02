import { e, coquille } from '../ui.js';
import { chargerLecon, avancement } from '../donnees.js';
import { lien, unite } from '../../services/unite.js';
import { scriptOptionnel } from '../../services/script.js';
import { etatTest, remettreTest, lirePrise } from '../../services/evaluation.js';
export async function afficher(racine) {
  const zone=coquille(racine,'niveau'); const l=await chargerLecon(true);
  const test=l.lecon.nature==='test'||/^T|^EVAL/.test(unite());
  const a=avancement(l); const t=etatTest();
  const questions=[];
  if(test)for(const et of l.etapes){const d=(await scriptOptionnel(et.fichier))?.etapes?.find(x=>x.id===et.id);if(!d)continue;for(const [i,x] of (d.items?.length?d.items:[d]).entries())questions.push({id:`${d.id}:${x.id||i}`,etape:d.id,competence:d.competences?.[0],poids:(d.points??1)/(d.items?.length||1),manuel:['message_ecrit','prise_de_parole'].includes(d.type),remediation:d.remediation||[]});}
  const sans=questions.filter(q=>!t.reponses[q.id]||t.reponses[q.id].passe);
  const liens=refs=>refs.map(ref=>{const r=/^((?:U|G|V)\d{2}|T[1-6]|EVAL)(?:\/(.*))?$/.exec(ref);return `<a href="${r?lien(r[2]||'',r[1]):lien('etape/'+ref)}">${e(ref)}</a>`;}).join(' · ');
  zone.innerHTML=`<div class="entete-page"><h1>${test?'Résultats du test':'Bilan'} ${e(unite())}</h1><p>${test&&!t.remis?`${Object.keys(t.reponses).length} questions parcourues sur ${questions.length}. ${sans.length} sans réponse.`:test?'Test remis. Les productions libres attendent une relecture.':`${a.faites.length} étapes terminées sur ${l.etapes.length}.`}</p></div>${test&&!t.remis?`<div class="carte" style="padding:20px"><h2>Avant de remettre</h2><p>La remise affiche les corrections et clôt cette passation.</p>${sans.map(q=>`<p><a href="${lien('etape/'+q.etape)}">${e(q.etape)} · ${e(q.competence)}</a></p>`).join('')}<button class="btn btn-primaire" data-remettre>Remettre mon test</button></div>`:''}<div class="unites" data-resultats></div><p style="margin-top:20px"><a class="btn btn-secondaire" href="${lien()}">Revenir au contenu</a></p>`;
  zone.querySelector('[data-remettre]')?.addEventListener('click',()=>{remettreTest();afficher(racine);});
  const resultat=zone.querySelector('[data-resultats]');
  if(test&&t.remis){
    for(const [c,nom] of [['ecouter','Écouter'],['lire','Lire'],['ecrire','Écrire'],['parler','Parler']]){
      const qs=questions.filter(q=>q.competence===c); const rs=qs.map(q=>{const reponse=t.reponses[q.id];return {...q,...(reponse||{passe:true,juste:false}),manuel:q.manuel,nonRendue:q.manuel&&(!reponse||reponse.passe)};});
      const auto=rs.filter(r=>!r.manuel&&!r.mediaAbsent);const poids=auto.reduce((s,r)=>s+r.poids,0);const score=poids?Math.round(100*auto.reduce((s,r)=>s+(r.juste?r.poids:0),0)/poids):null;
      resultat.insertAdjacentHTML('beforeend',`<section class="carte" style="padding:20px"><h2>${nom}</h2><p>${score==null?'Pas de score automatique':`${score} % sur les questions corrigées automatiquement`} · ${rs.filter(r=>r.manuel&&!r.nonRendue).length} à relire · ${rs.filter(r=>r.nonRendue).length} production${rs.filter(r=>r.nonRendue).length>1?'s':''} non rendue${rs.filter(r=>r.nonRendue).length>1?'s':''} · ${rs.filter(r=>r.mediaAbsent).length} sans audio · ${rs.filter(r=>r.passe&&!r.manuel).length} sans réponse</p>${rs.map(r=>`<div style="border-top:1px solid var(--filet);padding:12px 0"><b>${e(r.etape)}</b><p>${e(r.nonRendue?'Production non rendue':r.donne || 'Sans réponse')}</p>${r.attendu?`<p>Réponse attendue : <span lang="en">${e(r.attendu)}</span></p>`:''}<p>${e(r.nonRendue?'Hors du score automatique.':r.explication||'Question non répondue.')}</p>${(r.prises||[r.prise]).filter(Boolean).map((cle,i)=>`<button class="btn btn-secondaire" data-prise="${e(cle)}">Réécouter ma prise ${i+1}</button><audio controls hidden></audio>`).join('')}${!r.juste?`<p>À revoir : ${liens(r.remediation||[])}</p>`:''}</div>`).join('')}</section>`);
    }
  } else if(!test) for(const [c,p] of Object.entries(a.parComp))resultat.insertAdjacentHTML('beforeend',`<section class="carte" style="padding:20px"><h2>${e(c)}</h2><p>${p.faites} / ${p.total} étapes · ${p.moyenne==null?'pas de note automatique':Math.round(p.moyenne*100)+' %'}</p></section>`);
  const urls=[];
  for(const b of zone.querySelectorAll('[data-prise]'))b.onclick=async()=>{try{const blob=await lirePrise(b.dataset.prise);if(!blob){b.textContent='Prise indisponible sur cet appareil';return;}const url=URL.createObjectURL(blob);urls.push(url);const audio=b.nextElementSibling;audio.src=url;audio.hidden=false;b.hidden=true;}catch{b.textContent='Enregistrement indisponible';}};
  return ()=>urls.forEach(URL.revokeObjectURL);
}
