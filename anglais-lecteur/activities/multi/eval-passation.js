import { e } from '../../app/ui.js';
import { lien } from '../../services/unite.js';
import { corriger, garderPrise } from '../../services/evaluation.js';
import { lirePassation, sauverPassation, demarrer, selection, cleQuestion, trace } from '../../services/passation.js';
export const meta = { titre: 'Évaluation du parcours' };
export async function monter(racine, ctx) {
  const d = ctx.donnees, id = ctx.unite, plan = await ctx.script('lecon.json');
  let t = lirePassation(id), prise, audio, arretAudio, actif = true, occupe = false, index = 0, autoCapture, sauveCapture = Promise.resolve();
  const q = s => racine.querySelector(s);
  const sauver = () => { try { sauverPassation(id,t); return true; } catch(err) { if(q('[data-etat]'))q('[data-etat]').textContent=err.message; return false; } };
  const bilan = () => { location.hash = lien('bilan',id); };
  const finir = () => { ctx.signaler.fin({score:null,sans_note:true}); racine.innerHTML='<div class="carte multi-question"><h2>Réponses conservées</h2><p>Aucune correction avant la remise finale.</p><a class="btn btn-primaire" href="'+lien('bilan',id)+'">Vérifier la couverture et remettre</a></div>'; };
  ctx.ajouterStyle('.multi-question{padding:20px;display:grid;gap:16px}.multi-question textarea{width:100%;min-height:180px;padding:12px;font:inherit}.multi-choix{display:flex;flex-wrap:wrap;gap:10px}.multi-support{white-space:pre-wrap;line-height:1.6}.multi-question button{min-height:44px;white-space:normal}.multi-question audio{max-width:100%}');
  function accueil() {
    racine.innerHTML=`<div class="carte multi-question"><h2>${plan.evaluation?.mode_fidele_disponible===false?'Contenu à intégrer':'Avant de commencer'}</h2><p>Ce travail décrit vos acquis actuels ; il ne prédit aucun score officiel. Vérifiez votre micro et votre casque avant le démarrage. Aucun envoi externe.</p><label><input type="checkbox" data-accord> J’accepte de conserver mes textes et ma voix sur cet appareil pour les relire avec mon formateur.</label><p>Sans cet accord, les productions seront « non observées » ; une observation en visio reste possible.</p><button class="btn btn-secondaire" data-relecture>Ouvrir en relecture auteur</button><button class="btn btn-primaire" data-note ${plan.evaluation?.mode_fidele_disponible===false?'disabled':''}>Commencer le mode noté</button><p data-etat></p></div>`;
    for (const [sel,mode] of [['[data-relecture]','relecture'],['[data-note]','note']])q(sel).onclick=()=>{try{t=demarrer(id,plan,mode,q('[data-accord]').checked);rendre();}catch(err){q('[data-etat]').textContent=err.message;}};
  }
  let courant, selectionCourante, validation = null;
  function incident(cle, code) { t.ecoutes[cle] ||= { utilisees:0 }; t.ecoutes[cle].incident=code; t.suspension ||= {depuis:Date.now(),code}; trace(t,'incident',{item:cle,code}); sauver(); }
  async function rendre() {
    if(!actif)return;
    if(!t){accueil();ctx.signaler.pret();return;}
    if(t.mode==='note' && plan.evaluation?.mode_fidele_disponible===false){racine.innerHTML='<div class="carte multi-question"><h2>Contenu à intégrer</h2><p>Mode noté bloqué. La relecture reste disponible.</p><button data-relecture class="btn">Ouvrir la relecture</button></div>';q('[data-relecture]').onclick=()=>{t=demarrer(id,plan,'relecture',false);rendre();};ctx.signaler.pret();return;}
    if(t.remis){racine.innerHTML=`<div class="carte multi-question"><p>Passation remise, réponses immuables.</p><a href="${lien('bilan',id)}">Voir les résultats</a></div>`;ctx.signaler.pret();return;}
    selectionCourante=selection(d,t);
    if(!selectionCourante.items.length){racine.innerHTML=`<div class="carte multi-question"><p>${selectionCourante.incident?'Incident dans la série commune : routage suspendu.':'Terminez les quatre questions communes avant cette branche.'}</p><a href="${lien('etape/'+selectionCourante.attente,id)}">Revenir à la série commune</a><a href="${lien('bilan',id)}">Voir la couverture</a>${t.mode==='relecture'?'<p>En relecture seulement : consulter une branche, sans routage ni note.</p><button class="btn btn-secondaire" data-apercu="consolidation">Voir la branche consolidation</button><button class="btn btn-secondaire" data-apercu="a2">Voir la branche A2</button>':''}</div>`;for(const b of racine.querySelectorAll('[data-apercu]'))b.onclick=()=>{t.apercus||={};t.apercus[d.id]=b.dataset.apercu;sauver();rendre();};ctx.signaler.pret();return;}
    const items=selectionCourante.items;
    index=items.findIndex(x=>!t.reponses[cleQuestion(d,x)]);
    if(index<0){finir();ctx.signaler.pret();return;}
    const x=items[index], cle=cleQuestion(d,x), oral=d.type==='prise_de_parole', libre=oral||d.type==='message_ecrit'||d.correction?.mode==='formateur';
    courant={x,cle,oral,libre};
    const pass={...d.passation,...x.passation};
    t.sections[d.id] ||= Date.now(); t.preparations[cle] ||= Date.now();
    const reps=[x.stimulus_audio||x.audio,...(x.suite_audio||[])].filter(Boolean);
    const segments=await Promise.all(reps.map(s=>ctx.segment(s)));
    if(!actif)return;
    const infos=segments.map(s=>ctx.services.voix.info(s?.id));
    const mediaAbsent=reps.length>0 && infos.some(s=>!s);
    if(mediaAbsent)t.suspension ||= {depuis:Date.now(),code:'media_absent'};
    t.ecoutes[cle] ||= {utilisees:0,terminee:false};
    const ecoute=t.ecoutes[cle];
    if(ecoute.enCours){ecoute.enCours=false;incident(cle,'lecture_interrompue');}
    if(t.captures[cle]?.enCours){t.captures[cle].enCours=false;t.captures[cle].incident='capture_interrompue';sauver();}
    const support=x.support?.texte||d.support?.texte||'';
    const maxPrises=Math.max(1,Number(d.enregistrement?.nombre_prises)||1), secondes=Number(d.enregistrement?.duree_max_prise_s)||15;
    t.captures[cle] ||= {prises:[]};const capture=t.captures[cle];
    let reponse=t.brouillons[cle]||'';
    racine.innerHTML=`<section class="carte multi-question"><p>${t.mode==='relecture'?'Relecture auteur · aucune note de passation':'Mode noté'} · ${selectionCourante.branche}${selectionCourante.apercu?' · aperçu choisi, non adaptatif':''} · question ${index+1}/${items.length}</p><p data-temps></p>${support&&d.modalite_vtest!=='ecoute_repetition'?`<p class="multi-support" lang="en">${e(support)}</p>`:''}<p><b>${e(x.question||x.situation||d.consigne?.fr||'')}</b></p>${reps.length?`<div><button class="btn btn-secondaire" data-son ${mediaAbsent||ecoute.incident||ecoute.utilisees>=(pass.ecoutes_max??1)?'disabled':''}>Écouter la conversation · ${Math.max(0,(pass.ecoutes_max??1)-ecoute.utilisees)} écoute(s) restante(s)</button><p data-locuteur aria-live="polite"></p><p>${mediaAbsent?'Audio en préparation : écoute non observée. Aucun texte dévoilé.':''}</p></div>`:''}<div data-saisie></div><p data-etat aria-live="polite">${e(ecoute.incident||capture.incident||'')}</p><div class="multi-choix"><button class="btn btn-secondaire" data-passer>Passer la question</button><button class="btn btn-primaire" data-valider disabled>Enregistrer la réponse</button></div></section>`;
    const val=q('[data-valider]'), saisie=q('[data-saisie]');
    const mediaValide=()=>!reps.length||(!mediaAbsent&&!ecoute.incident&&ecoute.terminee);
    const pret=()=> { if(!actif||!q('[data-valider]'))return; val.disabled=occupe||!!prise||!mediaValide()||(libre&&!t.accord)||(oral?capture.prises.length<maxPrises:!reponse.trim()); };
    if(oral){
      saisie.innerHTML=`<p>${maxPrises} prise(s) continue(s) de ${secondes} s maximum. ${pass.prise_unique?'Une seule prise ; aucune réécoute avant remise.':''}</p><p data-preparation></p><button class="btn btn-secondaire" data-micro>Enregistrer ma voix</button><p data-prises>${capture.prises.length}/${maxPrises} prise(s) conservée(s)</p>`;
      if(!t.accord)q('[data-etat]').textContent='Conservation refusée : production non observée, observation en visio possible.';
      async function enregistrerVoix(){
        if(prise){await prise.arreter();await sauveCapture;return;}
        if(!t.accord||capture.incident||capture.prises.length>=maxPrises||!mediaValide()||Date.now()<t.preparations[cle]+(pass.preparation_s||0)*1000)return;
        const b=q('[data-micro]');b.disabled=true;
        try{
          await ctx.services.micro.ouvrir();if(!actif)return;
          capture.enCours=true;sauver();prise=ctx.services.micro.enregistrer({dureeMax:secondes*1000});b.textContent='Arrêter';b.disabled=false;pret();
          const enCours=prise;
          sauveCapture=(async()=>{const r=await enCours.fin;prise=null;if(!actif)return;capture.enCours=false;
            if(!r?.blob?.size){capture.incident='capture_vide';trace(t,'incident',{item:x.id,code:'capture_vide'});sauver();if(actif){b.textContent='Capture indisponible';b.disabled=true;q('[data-etat]').textContent='Aucun son conservé : incident technique, production non observée. Vous pouvez passer la question.';}return;}
            const k=`eval:${t.id}:${cle}:${capture.prises.length}`;await garderPrise(k,r.blob);if(!actif)return;
            capture.prises.push({cle:k,duree_s:r.duree_s});trace(t,'capture',{item:x.id,duree_s:r.duree_s});
            if(!sauver())capture.incident='conservation_indisponible';
            if(actif){b.textContent=capture.prises.length>=maxPrises?'Prise conservée':'Enregistrer la prise suivante';b.disabled=capture.prises.length>=maxPrises;q('[data-prises]').textContent=`${capture.prises.length}/${maxPrises} prise(s) conservée(s)`;pret();}
            if(pass.remise_s && actif){autoCapture=setTimeout(()=>validation?.(false),pass.remise_s*1000);}
          })();await sauveCapture;
        }catch(err){capture.enCours=false;capture.incident=err.code||'capture_indisponible';trace(t,'incident',{item:x.id,code:capture.incident});sauver();if(actif){b.textContent='Capture indisponible';b.disabled=true;q('[data-etat]').textContent=err.message+' Incident technique : production non observée.';}}
      }
      q('[data-micro]').onclick=enregistrerVoix;
      courant.actualiser=()=>{if(!q('[data-micro]'))return;const attente=Math.max(0,Math.ceil((t.preparations[cle]+(pass.preparation_s||0)*1000-Date.now())/1000));q('[data-preparation]').textContent=attente?`Préparation : ${attente} s`:'Préparation terminée';q('[data-micro]').disabled=!prise&&(!t.accord||!!capture.incident||!!attente||!mediaValide()||capture.prises.length>=maxPrises);};
      courant.capturer=enregistrerVoix;
    } else if(x.options?.length){
      saisie.className='multi-choix';for(const o of x.options){const texte=typeof o==='string'?o:o.texte;const b=document.createElement('button');b.className='btn btn-secondaire';b.textContent=texte;b.setAttribute('aria-pressed',String(texte===reponse));b.onclick=()=>{reponse=texte;t.brouillons[cle]=texte;sauver();saisie.querySelectorAll('button').forEach(v=>v.setAttribute('aria-pressed',String(v===b)));pret();};saisie.append(b);}
    }else{saisie.innerHTML='<label>Votre réponse<textarea lang="en" rows="6"></textarea></label>';const input=saisie.querySelector('textarea');input.value=reponse;input.disabled=!t.accord;input.oninput=()=>{reponse=input.value;t.brouillons[cle]=reponse;sauver();pret();};}
    if(reps.length)q('[data-son]').onclick=async()=>{
      if(occupe||ecoute.incident||ecoute.utilisees>=(pass.ecoutes_max??1)||mediaAbsent)return;
      // Le micro est prêt AVANT le stimulus, sans consommer l'écoute en cas de refus.
      if(pass.demarrage_capture==='apres_fin_stimulus'){try{if(!t.accord)throw new Error('Accord de conservation nécessaire.');await ctx.services.micro.ouvrir();}catch(err){capture.incident=t.accord?(err.code||'micro_indisponible'):'refus_conservation';trace(t,'incident',{item:x.id,code:capture.incident});sauver();q('[data-etat]').textContent=err.message;return;}}
      occupe=true;q('[data-son]').disabled=true;let commence=false;
      try{for(let n=0;n<infos.length;n++){
        await new Promise((ok,ko)=>{audio=new Audio(infos[n].url);arretAudio=()=>ko(new Error('lecture_interrompue'));const a=audio;
          a.onplaying=()=>{if(!commence){commence=true;ecoute.utilisees++;ecoute.enCours=true;sauver();}if(actif)q('[data-locuteur]').textContent=(segments[n].personnage||'').replace(/^./,c=>c.toUpperCase());};
          const garde=setTimeout(()=>ko(new Error('lecture_interrompue')),((infos[n].duree_s||30)+15)*1000);
          const fin=f=>{clearTimeout(garde);f();};
          arretAudio=()=>fin(()=>ko(new Error('lecture_interrompue')));
          a.onended=()=>fin(ok);a.onerror=()=>fin(()=>ko(new Error('media_indisponible')));a.play().catch(err=>fin(()=>ko(err)));
        });if(!actif)throw new Error('lecture_interrompue');
      }ecoute.terminee=true;ecoute.enCours=false;sauver();
      }catch(err){if(!actif)return;ecoute.enCours=false;if(commence)incident(cle,'lecture_interrompue');if(actif)q('[data-etat]').textContent=commence?'Incident de lecture : écoute consommée, mesure suspendue.':'Lecture impossible : aucune écoute consommée. Réessayez.';}
      finally{audio?.pause();audio=null;arretAudio=null;occupe=false;if(actif){const b=q('[data-son]');b.disabled=!!ecoute.incident||ecoute.utilisees>=(pass.ecoutes_max??1);b.textContent=`Écouter · ${Math.max(0,(pass.ecoutes_max??1)-ecoute.utilisees)} écoute(s) restante(s)`;pret();courant.actualiser?.();}}
      if(actif&&ecoute.terminee&&pass.demarrage_capture==='apres_fin_stimulus')await courant.capturer();
    };
    validation=async(passe,expiration=false)=>{
      if(occupe||t.reponses[cle]||t.remis)return;
      if(prise){await prise.arreter();await sauveCapture;}if(!passe&&!expiration&&val.disabled)return;
      occupe=true;clearTimeout(autoCapture);
      const code=mediaAbsent?'media_absent':ecoute.incident||capture.incident||(libre&&!t.accord?'refus_conservation':null)||(reps.length&&!ecoute.terminee?'ecoute_non_effectuee':null);
      const c=libre?{juste:null,attendu:null,explication:'À relire avec votre formateur.'}:corriger(x,reponse);
      const nonRepondu=passe||(!reponse&&!capture.prises.length);
      t.reponses[cle]={...c,score:libre||code?null:nonRepondu?0:c.juste?1:0,juste:libre||code?null:nonRepondu?false:c.juste,etape:d.id,item:x.id,competence:d.competences[0],branche:selectionCourante.branche,modalite:d.modalite_vtest,manuel:libre,incident:code,mediaAbsent,passe:nonRepondu,donne:nonRepondu?'':reponse,prises:capture.prises.map(r=>r.cle),remediation:x.remediation||d.remediation||[],date:Date.now(),version:t.version,ecoutes:ecoute.utilisees};
      trace(t,'reponse',{item:x.id,etape:d.id,statut:code?'incident':nonRepondu?'passee':libre?'a_relire':c.juste?'juste':'faux'});
      delete t.brouillons[cle];const ok=sauver();occupe=false;if(ok&&actif)await rendre();
    };
    q('[data-passer]').onclick=()=>validation(true);val.onclick=()=>validation(false);
    sauver();pret();courant.actualiser?.();ctx.signaler.pret();
  }
  let precedent=Date.now(), expiration=false;
  const timer=setInterval(async()=>{
    if(!actif||!t||t.remis)return;const maintenant=Date.now();if(!document.hidden)t.actif_ms+=Math.min(2000,maintenant-precedent);precedent=maintenant;
    courant?.actualiser?.();
    const tempsMesure=t.suspension?.depuis||maintenant;
    const global=Math.max(0,t.debut+(plan.evaluation?.duree_min||plan.duree_min)*60000-tempsMesure);
    const section=Math.max(0,(t.sections[d.id]||maintenant)+d.duree_min*60000-tempsMesure);
    if(q('[data-temps]'))q('[data-temps]').textContent=t.suspension?'Mesure suspendue : incident, aucune erreur de langue attribuée.':t.mode==='relecture'?'Relecture sans chronométrage noté':`Test : ${Math.ceil(global/1000)} s · série/tâche : ${Math.ceil(section/1000)} s`;
    if(t.mode==='note'&&!t.suspension&&!expiration&&(!global||!section)){expiration=true;if(audio){incident(courant.cle,'lecture_interrompue');audio.pause();arretAudio?.();expiration=false;return;}await validation?.(false,true);if(!global){t.remis=Date.now();sauver();bilan();}else{for(const x of selectionCourante?.items||[])if(!t.reponses[cleQuestion(d,x)]){t.reponses[cleQuestion(d,x)]={etape:d.id,item:x.id,competence:d.competences[0],branche:selectionCourante.branche,passe:true,juste:false,score:0};}sauver();finir();}}
  },500);
  await rendre();
  const fermer=()=>{if(!actif)return;if(t&&courant){const c=t.captures[courant.cle];if(c?.enCours){c.enCours=false;c.incident='capture_interrompue';trace(t,'incident',{item:courant.x.id,code:'capture_interrompue'});}const a=t.ecoutes[courant.cle];if(a?.enCours){a.enCours=false;incident(courant.cle,'lecture_interrompue');}}actif=false;clearInterval(timer);clearTimeout(autoCapture);audio?.pause();arretAudio?.();prise?.annuler();if(t&&!t.remis)sauver();};
  window.addEventListener('pagehide',fermer,{once:true});
  return {demonter(){fermer();window.removeEventListener('pagehide',fermer);}};
}
