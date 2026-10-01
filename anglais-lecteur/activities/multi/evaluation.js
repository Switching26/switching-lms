import { lecteurTest } from '../../services/ecoutes-test.js';
import { e } from '../../app/ui.js';
import { lien, unite } from '../../services/unite.js';
import { commencerTest as commencer, etatTest as lireTest, sauverTest as sauver, remettreTest as remettre, corriger, garderPrise, lirePrise } from '../../services/evaluation.js';
export const meta = { titre: 'Évaluation' };
export async function monter(racine, ctx) {
  const d = ctx.donnees;
  const dossier = unite();
  const etatTest = () => lireTest(dossier), sauverTest = t => sauver(t, dossier), commencerTest = () => commencer(dossier), remettreTest = () => remettre(dossier);
  let sauvegardeEnCours = false, sauvegardePromise = Promise.resolve(), expirerQuestion = null, expirationEnCours = false;
  let editer=false, fermerEcoute=()=>{};
  const ordre = d.type === 'ecouter_ordonner';
  const items = d.items?.length ? d.items : [d];
  const ids = items.map((x,i) => `${d.id}:${x.id || i}`);
  let index = Math.max(0, ids.findIndex(id => !etatTest().reponses[id]));
  let prise = null, enregistrements = [], reponse = '', mediaAbsent = false;
  const fin = () => { if (ctx.testUnite) { remettreTest(); const rs=Object.values(etatTest().reponses).filter(r=>r.etape===d.id); racine.innerHTML=`<div class="carte multi-question"><h2>Votre test éclair</h2>${rs.map(r=>`<section><h3>${e(r.competence)}</h3><p>${r.manuel?'Oral conservé, à relire avec le formateur':r.mediaAbsent?'Écoute non évaluée : voix en préparation':r.passe?'Question passée':r.juste?'Réponse juste':'À revoir'}</p><p>${e(r.explication)}</p></section>`).join('')}<a class="btn btn-primaire" href="${lien('bilan')}">Voir mon avancement</a></div>`; ctx.signaler.fin({score:null,sans_note:true}); return; } ctx.signaler.fin({ score: null, sans_note: true }); racine.innerHTML = `<div class="carte" style="padding:22px"><h3>Réponses enregistrées</h3><p>Les corrections seront disponibles après remise du test.</p>${!etatTest().remis&&!tempsTacheEcoule()?'<button class="btn btn-secondaire" data-modifier>Revoir et modifier mes réponses</button>':''}<a class="btn btn-primaire" href="${lien('bilan')}">Voir les questions restantes et remettre le test</a></div>`; const b=racine.querySelector('[data-modifier]');if(b)b.onclick=()=>{editer=true;index=0;rendre();}; };
  const t0 = commencerTest();
  const plan = await ctx.script('lecon.json');
  const limite = (ctx.testUnite ? (d.duree_min || 3) : (plan.evaluation?.duree_min || plan.duree_min || 60)) * 60000;
  if (d.temps_limite_s && !t0.sections?.[d.id]) { t0.sections ||= {}; t0.sections[d.id] = Date.now(); sauverTest(t0); }
  const tempsTacheEcoule=()=>!!d.temps_limite_s&&Date.now()>=(etatTest().sections?.[d.id]||Date.now())+d.temps_limite_s*1000;
  const verifierTemps = () => { const t=etatTest(); const reste=Math.max(0,limite-(Date.now()-t0.debut)); const el=racine.querySelector('[data-temps]'); const section=d.temps_limite_s?Math.max(0,d.temps_limite_s*1000-(Date.now()-(t.sections?.[d.id]||Date.now()))):null; if(el)el.textContent=`Temps restant : ${Math.ceil(reste/60000)} min${section===null?'':` · tâche : ${Math.ceil(section/1000)} s`}`; if(section===0&&!t.remis&&!expirationEnCours&&!sauvegardeEnCours&&expirerQuestion){expirationEnCours=true;sauvegardePromise=expirerQuestion();return;} if (!reste&&!t.remis) { remettreTest(); location.hash=lien('bilan'); } };
  const timer = setInterval(verifierTemps,1000);
  ctx.surDemontage(() => { clearInterval(timer); prise?.annuler(); });
  ctx.ajouterStyle('.multi-question{padding:20px;display:grid;gap:16px}.multi-question textarea,.multi-question input,.multi-question select{max-width:100%;width:100%;padding:12px;border:1px solid var(--filet);border-radius:10px;font:inherit}.multi-choix{display:flex;gap:10px;flex-wrap:wrap}.multi-support{white-space:pre-wrap;line-height:1.6}.multi-question button{min-height:44px}');
  async function rendre() {
    fermerEcoute();fermerEcoute=()=>{};
    if (ctx.signal.aborted) return;
    if (etatTest().remis && ctx.testUnite) { fin(); return; }
    if (etatTest().remis) { racine.innerHTML=`<div class="carte multi-question"><p>Test remis. Vos réponses sont conservées.</p><a href="${lien('bilan')}">Voir les résultats</a></div>`; return; }
    if ((!editer||tempsTacheEcoule()) && ids.every(id => etatTest().reponses[id])) { fin(); return; }
    const x=items[index];
    const oral=d.type==='prise_de_parole'||(ctx.testUnite&&x.competence==='parler');
    const libre=oral||d.type==='message_ecrit';
    const precedente=etatTest().reponses[ids[index]];
    reponse=etatTest().brouillons?.[ids[index]]??precedente?.donne??''; enregistrements=[]; mediaAbsent=false;
    const brouillon=()=>{const t=etatTest();t.brouillons ||= {};t.brouillons[ids[index]]=reponse;sauverTest(t);};
    const support = x.support?.texte_avec_trous || x.support?.texte || d.support?.texte_avec_trous || d.support?.texte || d.support?.message_helen?.texte || '';
    const sansErreur=d.type==='trouver_erreur'&&!x.mot_faux;
    const options = (sansErreur?['Aucune erreur']:x.options) || (d.type==='appariement' ? d.cibles?.map(c=>c.en) : d.type==='classement' ? d.categories : d.type==='banque_de_mots' ? d.banque : null);
    racine.innerHTML=`<section class="carte multi-question"><p class="petit discret" data-temps></p><p>Question ${index+1} sur ${items.length}</p>${!ctx.testUnite?`<label>Revoir une question<select data-question>${items.map((it,n)=>`<option value="${n}" ${n===index?'selected':''}>Question ${n+1}${etatTest().reponses[ids[n]]?' · enregistrée':''}</option>`).join('')}</select></label>`:''}${support?`<p class="multi-support" lang="en">${e(support)}</p>`:''}<p><b>${e(x.question || x.situation || x.traduction || x.phrase || x.etiquette || x.sujet || d.consigne?.fr || '')}</b></p><div data-audio></div>${x.etiquettes?`<p lang="en">Mots à remettre en ordre : ${x.etiquettes.map(e).join(' · ')}</p>`:''}<div data-saisie></div><p data-etat aria-live="polite"></p><div class="multi-choix"><button class="btn btn-secondaire" data-passer>Passer la question</button><button class="btn btn-primaire" data-valider disabled>Enregistrer la réponse</button></div></section>`;
    const q=s=>racine.querySelector(s); const val=q('[data-valider]');
    if(q('[data-question]'))q('[data-question]').onchange=()=>{if(prise||sauvegardeEnCours)return;editer=true;index=Number(q('[data-question]').value);rendre();};
    const brancherEcoute=(bouton,infos)=>{const max=Number(x.ecoutes_max_par_support??d.ecoutes_max_par_support??d.nombre_ecoutes_max??plan.evaluation?.ecoutes_max_par_support);fermerEcoute=lecteurTest({bouton,infos,avantLecture:()=>ctx.services.audio.arreter(),limite:max>0?max:Infinity,lire:etatTest,sauver:sauverTest,signal:ctx.signal,surEtat:texte=>{if(!ctx.signal.aborted)q('[data-etat]').textContent=texte;}});};
    if (x.audio) {
      const seg=await ctx.segment(x.audio); const info=ctx.services.voix.info(seg?.id); if(ctx.signal.aborted)return;
      mediaAbsent=!info;
      q('[data-audio]').innerHTML=`<button class="btn btn-secondaire" data-son ${info?'':'disabled'}>Écouter</button>${!info?`<p class="discret">Audio en préparation : écoute non observée. Transcription masquée pendant le test.</p>`:''}`;
      if(info) brancherEcoute(q('[data-son]'),[info]);
    }
    const saisie=q('[data-saisie]');
    if(oral) {
      const nombre=Math.max(1,Math.min(12,Number(d.enregistrement?.nombre_prises)||1));
      const secondes=Math.max(1,Math.min(120,Number(d.enregistrement?.duree_max_prise_s)||15));
      saisie.innerHTML=`<p>${nombre} prise${nombre>1?'s':''} de ${secondes} secondes au maximum. Elles restent sur cet appareil pour votre relecture avec le formateur.</p>${Array.from({length:nombre},(_,i)=>`<div><button class="btn btn-secondaire" data-micro="${i}">Enregistrer ma voix${nombre>1?' · prise '+(i+1):''}</button><audio controls hidden></audio></div>`).join('')}`;
      for(const [i,cle] of (precedente?.prises||[]).entries()){const blob=await lirePrise(cle);if(ctx.signal.aborted)return;if(blob){const url=URL.createObjectURL(blob);enregistrements[i]={blob,url};const a=saisie.querySelectorAll('audio')[i];if(a){a.src=url;a.hidden=false;}}}
      val.disabled=Array.from({length:nombre},(_,i)=>enregistrements[i]).some(r=>!r);
      for(const bouton of saisie.querySelectorAll('[data-micro]'))bouton.onclick=async()=>{
        if(prise) { await prise.arreter(); return; }
        try {
          await ctx.services.micro.ouvrir(); if(ctx.signal.aborted){ctx.services.micro.fermer();return;}
          prise=ctx.services.micro.enregistrer({dureeMax:secondes*1000}); bouton.textContent='Arrêter';
          saisie.querySelectorAll('[data-micro]').forEach(b=>b.disabled=b!==bouton);val.disabled=true;
          const res=await prise.fin; prise=null; if(ctx.signal.aborted)return;
          saisie.querySelectorAll('[data-micro]').forEach(b=>b.disabled=false);
          bouton.textContent='Refaire la prise '+(Number(bouton.dataset.micro)+1);
          if(res?.blob?.size){enregistrements[Number(bouton.dataset.micro)]=res;const a=bouton.nextElementSibling;a.src=res.url;a.hidden=false;}
          val.disabled=Array.from({length:nombre},(_,i)=>enregistrements[i]).some(r=>!r);
        }catch(err){if(!ctx.signal.aborted)q('[data-etat]').textContent=err.message+' Vous pouvez passer la question.';}
      };
    } else if(ordre) {
      const repl=d.repliques_dans_l_ordre || [];
      const depart=d.ordre_initial_melange || repl.map(r=>r.id ?? r.rang).reverse();
      saisie.innerHTML=depart.map(id=>{const r=repl.find(r=>String(r.id ?? r.rang)===String(id));return `<label>${e(r?.en || r?.texte || id)} <select data-ordre="${e(id)}"><option value="">Position…</option>${repl.map((_,i)=>`<option>${i+1}</option>`).join('')}</select></label>`;}).join('');
      const sons=await Promise.all(repl.map(async r=>({r,seg:await ctx.segment(r.audio||r.segment)})));
      for(const {r,seg} of sons){ if(!ctx.services.voix.info(seg?.id))mediaAbsent=true; }
      q('[data-audio]').innerHTML=`<button class="btn btn-secondaire" data-conversation ${mediaAbsent?'disabled':''}>Écouter la conversation</button>${mediaAbsent?'<p>Audio en préparation : écoute non observée. Transcription masquée pendant le test.</p>':''}`;
      if(mediaAbsent)saisie.querySelectorAll('label').forEach((l,i)=>{l.firstChild.textContent=`Réplique ${i+1} (audio en préparation) `;});
      if(!mediaAbsent)brancherEcoute(q('[data-conversation]'),sons.map(s=>ctx.services.voix.info(s.seg.id)));
      saisie.onchange=()=>{const selects=[...saisie.querySelectorAll('select')];val.disabled=selects.some(s=>!s.value)||new Set(selects.map(s=>s.value)).size!==selects.length;reponse=selects.sort((a,b)=>Number(a.value)-Number(b.value)).map(s=>s.dataset.ordre).join('|');const t=etatTest();t.ordresBrouillons||={};t.ordresBrouillons[ids[index]]=Object.fromEntries(selects.map(s=>[s.dataset.ordre,s.value]));sauverTest(t);};
      for(const select of saisie.querySelectorAll('select')){const positions=etatTest().ordresBrouillons?.[ids[index]];const rang=reponse.split('|').indexOf(select.dataset.ordre);if(positions)select.value=positions[select.dataset.ordre]||'';else if(rang>=0)select.value=String(rang+1);}
      if(reponse||etatTest().ordresBrouillons?.[ids[index]])saisie.onchange();
    } else if(options?.length){
      saisie.className='multi-choix';
      for(const o of options){const texte=typeof o==='string'?o:o.texte || o.nom;const b=document.createElement('button');b.className='btn btn-secondaire';b.textContent=texte;b.setAttribute('aria-pressed',String(reponse===texte));b.onclick=()=>{reponse=texte;brouillon();val.disabled=false;saisie.querySelectorAll('button').forEach(v=>v.setAttribute('aria-pressed',String(v===b)));};saisie.append(b);}
      val.disabled=!reponse;
    } else {
      saisie.innerHTML=`<label>Votre réponse${libre?`<textarea rows="6" maxlength="${Number(d.saisie?.max_caracteres)||2000}" lang="en"></textarea>`:'<input lang="en" autocomplete="off">'}</label>`;
      const input=saisie.querySelector('textarea,input'); input.value=reponse;val.disabled=reponse.trim().length<(libre?(d.saisie?.min_caracteres||1):1); input.oninput=()=>{reponse=input.value;brouillon();val.disabled=reponse.trim().length<(libre?(d.saisie?.min_caracteres||1):1);};
    }
    async function enregistrer(passe, expiration=false) {
      if(sauvegardeEnCours) return; sauvegardeEnCours=true;
      val.disabled=true; q('[data-passer]').disabled=true;
      const idQuestion=ids[index];
      let correction=libre?{juste:null,attendu:null,explication:'À relire avec votre formateur.'}:corriger(sansErreur?{...x,bonne:'Aucune erreur'}:ordre?{bonne:(d.repliques_dans_l_ordre||[]).map(r=>r.id ?? r.rang).join('|'),retours:d.retours}:x,reponse,d.tolerance_commune);
      if(passe)correction={juste:libre?null:false,attendu:correction.attendu,explication:'Question non répondue.'};
      if(mediaAbsent)correction={juste:null,attendu:correction.attendu,explication:'Écoute non observée : média absent.'};
      const cle=`${dossier}:${idQuestion}`;
      const clesPrises=[];
      if(enregistrements.length&&!passe)try{for(const [i,res] of enregistrements.entries()){if(!res)continue;const k=i?`${cle}:${i}`:cle;await garderPrise(k,res.blob);clesPrises.push(k);}}catch{q('[data-etat]').textContent='La prise n’a pas pu être conservée. Réessayez avant de continuer.';val.disabled=false;sauvegardeEnCours=false;q('[data-passer]').disabled=false;return;}
      const t=etatTest();
      if(t.remis) { sauvegardeEnCours=false; return; }
      t.reponses[idQuestion]={...correction,explication:x.explication_apres||correction.explication,etape:d.id,item:x.id||d.id,competence:x.competence||d.competences?.[0]||ctx.etape.competences?.[0],poids:(d.points??1)/items.length,donne:passe?'':oral?'Enregistrement conservé sur cet appareil':reponse,prise:clesPrises[0]||null,prises:clesPrises,passe,manuel:libre,mediaAbsent,remediation:x.remediation||d.remediation||[]};
      if(t.brouillons)delete t.brouillons[idQuestion];if(t.ordresBrouillons)delete t.ordresBrouillons[idQuestion];
      sauverTest(t); sauvegardeEnCours=false;
      if(ctx.signal.aborted) return;
      if(expiration)return;
      fermerEcoute();editer=false;index=ids.findIndex(id=>!t.reponses[id]); if(index<0)fin(); else rendre();
    }
    expirerQuestion=async()=>{if(sauvegardeEnCours)await sauvegardePromise;if(prise)await prise.arreter();await enregistrer(!reponse.trim()&&!enregistrements.some(Boolean),true);const t=etatTest();for(const [i,k]of ids.entries())if(!t.reponses[k])t.reponses[k]={etape:d.id,item:items[i].id||d.id,competence:d.competences?.[0],juste:libre||mediaAbsent?null:false,manuel:libre,mediaAbsent,passe:true,donne:'',explication:'Temps de la tâche écoulé.',poids:(d.points??1)/items.length};sauverTest(t);if(!ctx.signal.aborted)fin();};
    q('[data-passer]').onclick=()=>{sauvegardePromise=enregistrer(true);return sauvegardePromise;}; val.onclick=()=>{sauvegardePromise=enregistrer(false);return sauvegardePromise;}; verifierTemps();
  }
  await rendre(); ctx.signaler.pret();
  return {async demonter(){fermerEcoute();clearInterval(timer);prise?.annuler();await sauvegardePromise;}};
}
