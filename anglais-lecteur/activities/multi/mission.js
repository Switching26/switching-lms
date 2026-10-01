import { e } from '../../app/ui.js';
import { corriger } from '../../services/evaluation.js';
export const meta={titre:'Votre mission'};
export async function monter(racine,ctx){
 const d=ctx.donnees, questions=[];
 for(const et of d.etapes_mission||[]){
  const items=et.questions?.length?et.questions:et.items?.length?et.items:et.saisie?[{...et.saisie,retours:et.retours}]:[et];
  for(const x of items)questions.push({et,x});
 }
 let i=0,essais=0,justes=0;const supports=[];
 for(const et of d.etapes_mission||[])if(et.audio){const seg=await ctx.segment(et.audio);supports.push({seg,info:ctx.services.voix.info(seg?.id)});}
 ctx.ajouterStyle('.multi-mission{padding:20px;display:grid;gap:16px}.multi-mission input{width:100%;padding:12px;font:inherit}.multi-mission button{min-height:44px;white-space:normal}.multi-mission blockquote{padding:12px;border-left:3px solid var(--filet)}');
 function rendre(){
  if(i>=questions.length){ctx.signaler.fin({score:questions.length?justes/questions.length:null});racine.innerHTML=`<div class="carte multi-mission"><h2>Mission accomplie</h2><p>${e(d.fin?.texte||d.fin?.message||'Vous avez transmis les informations demandées.')}</p><p>${justes} réponses justes au premier essai sur ${questions.length}.</p></div>`;return;}
  const {et,x}=questions[i];essais=0;
  const options=x.options||et.banque;const bonne=x.bonne||options?.find(o=>o.statut==='juste')?.texte;
  const q={...x,bonne,retours:x.retours||et.retours};
  const prompt=x.question||x.phrase||et.consigne||et.titre;
  racine.innerHTML=`<section class="carte multi-mission"><p>Mission · ${i+1} / ${questions.length}</p><h2>${e(et.titre)}</h2>${supports.map((s,n)=>`<div><button class="btn btn-secondaire" data-son="${n}" ${s.info?'':'disabled'}>Écouter le message${s.info?'':' · voix en préparation'}</button>${!s.info?`<blockquote lang="en">${e(s.seg?.texte||'')}</blockquote>`:''}</div>`).join('')}<p>${e(prompt)}</p>${et.texte_avec_trous?`<p lang="en">${e(et.texte_avec_trous)}</p>`:''}<div data-reponses style="display:flex;gap:10px;flex-wrap:wrap"></div><p data-retour aria-live="polite"></p><button class="btn btn-primaire" data-suite hidden>${i+1<questions.length?'Continuer la mission':'Terminer la mission'}</button></section>`;
  const zone=racine.querySelector('[data-reponses]'),retour=racine.querySelector('[data-retour]'),suite=racine.querySelector('[data-suite]');
  for(const b of racine.querySelectorAll('[data-son]'))if(!b.disabled)b.onclick=()=>ctx.services.voix.jouer(supports[Number(b.dataset.son)].seg.id);
  const aide=ctx.services.aide.barre(ctx,{item:()=>x.id||`${d.id}-${i}`,surSolution:()=>{
   const c=corriger(q,bonne||q.reponse?.attendues?.[0]);
   retour.textContent=`Réponse : ${c.attendu}. ${q.retours?.juste||''}`;
   zone.querySelectorAll('button,input').forEach(b=>b.disabled=true);suite.hidden=false;aide.element.hidden=true;
  }});
  retour.after(aide.element);
  function valider(val){const c=corriger(q,val);essais++;const texte=options?.find(o=>o.texte===val)?.retour||c.explication;retour.textContent=texte;ctx.signaler.essai({item:x.id||`${d.id}-${i}`,juste:c.juste,donne:val,attendu:c.attendu,explication:texte,premier_essai:essais===1});if(c.juste){if(essais===1)justes++;zone.querySelectorAll('button,input').forEach(b=>b.disabled=true);suite.hidden=false;aide.element.hidden=true;}else aide.erreur();}
  if(options?.length)for(const o of options){const texte=typeof o==='string'?o:o.texte;const b=document.createElement('button');b.className='btn btn-secondaire';b.textContent=texte;b.onclick=()=>valider(texte);zone.append(b);}
  else{zone.innerHTML='<label>Votre réponse<input lang="en" autocomplete="off"></label><button class="btn btn-secondaire">Vérifier</button>';zone.querySelector('button').onclick=()=>valider(zone.querySelector('input').value);}
  suite.onclick=()=>{i++;rendre();};
 }
 rendre();ctx.signaler.pret();return{demonter(){ctx.services.audio.arreter();}};
}
