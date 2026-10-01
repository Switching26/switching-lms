// Une écoute logique par support, conservée dès le premier son réellement joué.
// Le retour à une question et le rechargement ne recréent pas de droits.
export function lecteurTest({bouton, infos, limite, lire, sauver, signal, surEtat, avantLecture}) {
  const cle=infos.map(i=>i.id).join('|');
  let audio=null, annuler=null, actif=true, occupe=false;
  const utilisees=()=>lire().ecoutes?.[cle]?.utilisees||0;
  const maj=()=>{bouton.disabled=occupe||utilisees()>=limite;bouton.textContent=Number.isFinite(limite)?`Écouter · ${Math.max(0,limite-utilisees())} écoute(s) restante(s)`:'Écouter';};
  bouton.onclick=async()=>{
    if(!actif||occupe||utilisees()>=limite)return;
    avantLecture?.();occupe=true;maj();let commence=false;
    try{
      for(const info of infos){
        if(!actif)return;
        await new Promise((ok,ko)=>{
          audio=new Audio(info.url);const a=audio;
          const garde=setTimeout(()=>fin(new Error('Lecture interrompue.')),((info.duree_s||60)+15)*1000);
          const fin=err=>{clearTimeout(garde);a.onplaying=a.onended=a.onerror=null;annuler=null;err?ko(err):ok();};
          annuler=()=>fin(new Error('Lecture interrompue.'));
          a.onplaying=()=>{if(!commence){commence=true;const t=lire();t.ecoutes||={};t.ecoutes[cle]={utilisees:utilisees()+1};sauver(t);maj();}};
          a.onended=()=>fin();a.onerror=()=>fin(new Error('Lecture indisponible.'));
          a.play().catch(fin);
        });
      }
    }catch{if(actif)surEtat?.(commence?'Lecture interrompue ; cette écoute a été comptée.':'Lecture impossible ; aucune écoute consommée.');}
    finally{audio?.pause();audio=null;occupe=false;if(actif)maj();}
  };
  const fermer=()=>{actif=false;audio?.pause();annuler?.();window.removeEventListener('pagehide',fermer);signal?.removeEventListener('abort',fermer);};
  window.addEventListener('pagehide',fermer,{once:true});signal?.addEventListener('abort',fermer,{once:true});maj();
  return fermer;
}
