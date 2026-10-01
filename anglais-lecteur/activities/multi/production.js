import { modeLMS } from '../../services/base.js';
import { e } from '../../app/ui.js';
import { unite } from '../../services/unite.js';
import { garderPrise, lirePrise } from '../../services/evaluation.js';
export const meta={titre:'Votre production'};
export async function monter(racine,ctx){
  const d=ctx.donnees, oral=d.type==='prise_de_parole', cle=`${unite()}:${d.id}`;
  let prise=null, enr=null; const prises=[]; const maxPrises=Math.max(1,Number(d.enregistrement?.nombre_prises_max||d.enregistrement?.nombre_prises)||1); const secondes=Math.min(120,Number(d.enregistrement?.duree_max_prise_s)||15);
  const criteres=d.grille_de_relecture||d.verification?.criteres||[];
  racine.innerHTML=`<div class="carte" style="padding:20px;display:grid;gap:16px">${d.support?.texte?`<p style="white-space:pre-wrap">${e(d.support.texte)}</p>`:''}${!oral&&d.support?.message_helen?.texte?`<blockquote lang="en">${e(d.support.message_helen.texte)}</blockquote>`:''}${oral?`<p>Enregistrez jusqu’à ${maxPrises} prise(s) de ${secondes} secondes, puis réécoutez-vous.</p><button class="btn btn-secondaire" data-micro>Enregistrer ma voix</button><audio controls hidden></audio><div data-prises></div>`:`<label>Votre message<textarea style="display:block;width:100%;padding:12px;font:inherit" rows="6" maxlength="${d.saisie?.max_caracteres||2000}" lang="en"></textarea></label>`}<div>${criteres.map(c=>`<label style="display:block;margin:12px 0"><input type="checkbox"> ${e(c.critere||c.nom)}</label>`).join('')}</div><p class="discret">Cette production sera à relire avec votre formateur. ${modeLMS ? (oral ? 'L’enregistrement audio reste sur cet appareil.' : 'Votre texte est sauvegardé dans votre formation.') : "La sauvegarde reste sur cet appareil ; aucun envoi n'est effectué."}</p><button class="btn btn-primaire" data-sauver>Garder ma production</button><p aria-live="polite" data-etat></p></div>`;
  const q=s=>racine.querySelector(s);
  let modeleAudio=null;
  if(oral&&d.modele?.en){
    const seg=await ctx.segment(d.modele.audio); const info=ctx.services.voix.info(seg?.id);
    const modele=document.createElement('section');modele.dataset.modele='';
    modele.innerHTML=`<h3>Modèle avant votre prise</h3><p lang="en">${e(d.modele.en)}</p><button class="btn btn-secondaire" data-modele-son ${info?'':'disabled'}>Écouter le modèle${info?'':' · voix en préparation'}</button>`;
    q('[data-micro]').before(modele);
    if(info)modele.querySelector('button').onclick=()=>ctx.services.voix.jouer(info.id);
    modeleAudio=modele;
  }
  const montrerModele=(visible)=>{if(modeleAudio)modeleAudio.hidden=!visible;};
  if(!oral) { q('textarea').value=ctx.stockage.lire(d.id,''); if(modeLMS)q('textarea').addEventListener('input',()=>ctx.stockage.ecrire(d.id,q('textarea').value)); }
  else{
    try{const n=ctx.stockage.lire(d.id+':prises',1);for(let i=0;i<n;i++){const b=await lirePrise(i?`${cle}:${i}`:cle);if(b){enr={blob:b,url:URL.createObjectURL(b)};prises.push(enr);}}if(enr){q('audio').src=enr.url;q('audio').hidden=false;q('[data-prises]').innerHTML=prises.map((r,i)=>`<p>Prise ${i+1}<audio controls style="max-width:100%" src="${r.url}"></audio></p>`).join('');}}catch{}
    q('[data-micro]').onclick=async()=>{if(prise){await prise.arreter();return;}try{await ctx.services.micro.ouvrir();if(ctx.signal.aborted){ctx.services.micro.fermer();return;}ctx.services.audio.arreter();montrerModele(!/masqu/i.test(d.modele?.affichage||''));q('[data-sauver]').disabled=true;prise=ctx.services.micro.enregistrer({dureeMax:secondes*1000});q('[data-micro]').textContent='Arrêter';enr=await prise.fin;prise=null;if(ctx.signal.aborted)return;montrerModele(true);q('[data-sauver]').disabled=false;q('[data-micro]').textContent='Refaire la prise';if(enr){prises.push(enr);if(prises.length>maxPrises)prises.shift();q('audio').src=enr.url;q('audio').hidden=false;q('[data-prises]').innerHTML=prises.map((r,i)=>`<p>Prise ${i+1}<audio controls style="max-width:100%" src="${r.url}"></audio></p>`).join('');q('[data-micro]').textContent=prises.length<maxPrises?'Enregistrer la prise suivante':'Remplacer la prise la plus ancienne';}}catch(err){montrerModele(true);q('[data-sauver]').disabled=false;q('[data-etat]').textContent=err.message;}};
  }
  q('[data-sauver]').onclick=async()=>{if(oral&&!enr || !oral&&q('textarea').value.trim().length<(d.saisie?.min_caracteres||1)){q('[data-etat]').textContent='Préparez votre production avant de la garder.';return;}try{if(oral){if(!prises.length)prises.push(enr);for(const [i,r] of prises.entries())await garderPrise(i?`${cle}:${i}`:cle,r.blob);ctx.stockage.ecrire(d.id+':prises',prises.length);}else if(!ctx.stockage.ecrire(d.id,q('textarea').value)) throw new Error('Sauvegarde refusée');if(ctx.signal.aborted)return;ctx.signaler.fin({score:null,sans_note:true});q('[data-etat]').textContent=modeLMS && !oral ? 'Production conservée dans votre formation. À relire avec votre formateur.' : 'Production conservée sur cet appareil. À relire avec votre formateur.';}catch{q('[data-etat]').textContent='Sauvegarde indisponible. Gardez cet écran ouvert.';}};
  ctx.signaler.pret();return{demonter(){ctx.services.audio.arreter();prise?.annuler();prises.forEach(r=>URL.revokeObjectURL(r.url));}};
}
