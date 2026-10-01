import { e } from '../../app/ui.js';
export const meta={titre:'Épisode en story-board'};
export async function monter(racine,ctx){
  const d=ctx.donnees, repliques=d.repliques||[], plans=d.plans?.length?d.plans:[{n:1,visuel:d.images?.[0],repliques:repliques.map(r=>r.id)}];
  let i=0; const reponses=new Map();
  function rendre(){
    const p=plans[i];const image=ctx.image(p.visuel);const pauses=(d.pauses||[]).filter(q=>q.apres_plan===p.n||p.pause_apres===q.id);
    racine.innerHTML=`<section class="carte" style="padding:20px;display:grid;gap:16px"><span class="surtitre">Story-board · plan ${i+1} sur ${plans.length}</span>${image&&!/\.(mp4|webm)$/i.test(image)?`<img style="width:100%;max-height:360px;object-fit:contain;border-radius:16px" src="${e(image)}" alt="${e(ctx.services.visuels.description(p.visuel))}">`:`<div class="media-attente">${e(ctx.services.visuels.description(p.visuel))}</div>`}${p.carton?`<h2>${e(p.carton.en)}</h2><p>${e(p.carton.fr)}</p>`:''}<div data-repliques></div><div data-pauses></div><div style="display:flex;justify-content:space-between;gap:10px"><button class="btn btn-secondaire" data-prec ${i?'':'disabled'}>Précédent</button><button class="btn btn-primaire" data-suiv>${i+1<plans.length?'Plan suivant':'Terminer l’épisode'}</button></div></section>`;
    for(const r of repliques.filter(r=>(p.repliques||[]).includes(r.id)||r.plan===p.n)){
      const info=ctx.services.voix.info(r.segment?.id||r.segment?.ref);
      const bloc=document.createElement('div');bloc.style.marginBottom='14px';bloc.innerHTML=`<b>${e(r.personnage)}</b><p lang="en">${e(r.en)}</p><p class="discret">${e(r.fr)}</p><button class="btn btn-secondaire" ${info?'':'disabled'}>${info?'Écouter':'Voix en préparation'}</button>`;
      if(info)bloc.querySelector('button').onclick=()=>ctx.services.voix.jouer(info.id);racine.querySelector('[data-repliques]').append(bloc);
    }
    for(const q of pauses){const bloc=document.createElement('div');bloc.innerHTML=`<h3>${e(q.question)}</h3><div style="display:flex;gap:8px;flex-wrap:wrap" data-choix></div><p aria-live="polite" data-retour></p>`;for(const o of q.options||[]){const b=document.createElement('button');b.className='btn btn-secondaire';b.textContent=typeof o==='string'?o:o.texte;b.onclick=()=>{const texte=b.textContent,juste=texte===q.bonne;const exp=juste?q.retours?.juste:q.retours?.cibles?.find(c=>c.si?.includes(texte))?.retour||q.retours?.faux_par_defaut;bloc.querySelector('[data-retour]').textContent=exp||`Réponse attendue : ${q.bonne}`;if(!reponses.has(q.id)){ctx.signaler.essai({item:q.id,juste,donne:texte,attendu:q.bonne,explication:exp,premier_essai:true});reponses.set(q.id,juste);}};bloc.querySelector('[data-choix]').append(b);}racine.querySelector('[data-pauses]').append(bloc);}
    racine.querySelector('[data-prec]').onclick=()=>{i--;rendre();};
    racine.querySelector('[data-suiv]').onclick=()=>{if(i+1<plans.length){i++;rendre();}else{ctx.signaler.fin({sans_note:true,score:null});racine.querySelector('[data-suiv]').textContent='Épisode parcouru';}};
  }
  ctx.ajouterStyle('.media-attente{padding:28px;border:1px dashed var(--filet);border-radius:16px;background:var(--surface);color:var(--encre-70);line-height:1.5}');rendre();ctx.signaler.pret();return{demonter(){ctx.services.audio.arreter();}};
}
