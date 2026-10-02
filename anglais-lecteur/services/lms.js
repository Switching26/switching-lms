import { modeLMS, idChapitre } from './base.js';
import { synchroniser } from './etat-lms.js';
export function message(type, details={}) { if(modeLMS) parent.postMessage({type:`anglais:${type}`,...details},location.origin); }
let observateur, raf, derniereHauteur=0, immersion=false;
export function afficherLMS(racine,id,etape) {
  if(!modeLMS) return;
  observateur?.disconnect(); cancelAnimationFrame(raf);
  document.documentElement.classList.add('mode-lms');
  document.documentElement.classList.toggle('mode-immersion',etape);
  if(immersion!==etape) { immersion=etape; message('immersion',{active:etape}); }
  message('pret',{id:idChapitre(id)});
  if(!etape) {
    const mesurer=()=>{ cancelAnimationFrame(raf); raf=requestAnimationFrame(()=>{
      const px=Math.ceil(racine.getBoundingClientRect().height);
      if(px>0 && px!==derniereHauteur) { derniereHauteur=px; message('hauteur',{px}); }
    }); };
    observateur=new ResizeObserver(mesurer); observateur.observe(racine); mesurer();
  }
}
if(modeLMS) {
  document.documentElement.classList.add('mode-lms');
  const adapter=()=>{ let largeur=innerWidth; try { largeur=parent.innerWidth; } catch {} document.documentElement.classList.toggle('lms-grand-ecran',largeur>=900);document.documentElement.classList.toggle('lms-tablette',largeur>=768);document.documentElement.classList.toggle('lms-photo-tablette',largeur>=600&&largeur<900);document.documentElement.classList.toggle('lms-avec-libelles',largeur>760);document.documentElement.style.setProperty('--lms-vw',`${largeur/100}px`); };
  adapter();window.addEventListener('resize',adapter);
  try { if(parent!==window) parent.addEventListener('resize',adapter); } catch {}
  document.addEventListener('click',async ev=>{
    const lien=ev.target.closest('a[href^="#/unite/"]');
    const cible=lien?.getAttribute('href')?.match(/^#\/unite\/([A-Z0-9-]+)$/)?.[1];
    if(cible && idChapitre(cible)!==idChapitre(new URLSearchParams(location.search).get('id'))) {
      ev.preventDefault(); await synchroniser(); message('naviguer',{vers:'chapitre',id:idChapitre(cible)}); return;
    }
    const outil=ev.target.closest('[data-lms-outil]');
    if(outil) { ev.preventDefault(); message('outil',{outil:outil.dataset.lmsOutil}); }
    const nav=ev.target.closest('[data-lms-vers]');
    if(nav) { ev.preventDefault(); await synchroniser(); message('naviguer',{vers:nav.dataset.lmsVers}); }
  });
  let texte='';
  const montrer=()=>{
    let p=document.getElementById('etat-sauvegarde');
    if(!texte) { p?.remove(); return; }
    if(!p) { p=document.createElement('p'); p.id='etat-sauvegarde';p.setAttribute('role','status');document.body.append(p); }
    p.textContent=texte;
  };
  window.addEventListener('anglais:sauvegarde',ev=>{texte=ev.detail;montrer();});
}
