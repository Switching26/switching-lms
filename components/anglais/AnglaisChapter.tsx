"use client"
import { useEffect,useRef,useState } from 'react'
import { useCadranActions } from '@/components/learner/CadranFormation'
import { estEtatLecteurAnglais, type PropsBarreAnglais } from '@/lib/anglais/barre-contrat'
type Props=PropsBarreAnglais & {chapterId:string,preview?:boolean,onCompleted?:()=>void,onPrecedent?:()=>void,onSuivant?:()=>void,onQuitter?:()=>void,onNaviguer?:(chapterId:string)=>void}
/** Le même iframe persiste en immersion : aucun exercice ou enregistrement perdu. */
export default function AnglaisChapter(p:Props){
 const frame=useRef<HTMLIFrameElement>(null);const [id,setId]=useState('');const [error,setError]=useState('');const [hauteur,setHauteur]=useState(900)
 const actions=useCadranActions();const callbacks=useRef(p);callbacks.current=p
 const commandes=useRef(actions);commandes.current=actions
 const lecteurPret=useRef(false);const dernierEnvoi=useRef<number|null>(null)
 const transmettre=useRef(()=>{})
 transmettre.current=()=>{
  const envoi=callbacks.current.commandeLecteur
  if(!lecteurPret.current||!envoi||envoi.n===dernierEnvoi.current||!frame.current?.contentWindow)return
  frame.current.contentWindow.postMessage(envoi.commande,window.location.origin)
  dernierEnvoi.current=envoi.n
 }
 useEffect(()=>{let alive=true;lecteurPret.current=false;setId('');setError('');setHauteur(900)
  fetch('/anglais/api/chapitre/'+encodeURIComponent(p.chapterId)).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.erreur||'Leçon indisponible');if(alive)setId(d.id)}).catch(e=>{if(alive)setError(e.message)})
  return()=>{alive=false;commandes.current.immersion(false)}
 },[p.chapterId])
 useEffect(()=>{lecteurPret.current=false},[p.preview])
 useEffect(()=>{transmettre.current()},[p.commandeLecteur?.n,id])
 useEffect(()=>{
  const navigation=new AbortController()
  const recevoir=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return
   const d=event.data;if(!d||typeof d!=='object')return
   if(estEtatLecteurAnglais(d))callbacks.current.onEtatLecteur?.(d)
   if(d.type==='anglais:pret'&&d.id===id){lecteurPret.current=true;transmettre.current()}
   if(d.type==='anglais:hauteur'&&Number.isFinite(d.px))setHauteur(Math.min(50000,Math.max(200,Math.ceil(d.px))))
   if(d.type==='anglais:immersion'&&typeof d.active==='boolean')commandes.current.immersion(d.active)
   if(d.type==='anglais:outil') {if(d.outil==='notes')commandes.current.ouvrirNotes();if(d.outil==='ressources')commandes.current.ouvrirRessources()}
   if(d.type==='anglais:naviguer') {if(d.vers==='chapitre-suivant')callbacks.current.onSuivant?.();if(d.vers==='chapitre-precedent')callbacks.current.onPrecedent?.();if(d.vers==='mes-formations')callbacks.current.onQuitter?.()}
   if(d.type==='anglais:naviguer'&&d.vers==='chapitre'&&typeof d.id==='string'){
    const chapitre=callbacks.current.chapterId
    fetch('/anglais/api/chapitre/'+encodeURIComponent(chapitre)+'?cible='+encodeURIComponent(d.id),{signal:navigation.signal})
     .then(async r=>{const cible=await r.json();if(!r.ok)throw Error(cible.erreur||'Fiche indisponible');if(!navigation.signal.aborted&&callbacks.current.chapterId===chapitre)callbacks.current.onNaviguer?.(cible.chapterId)})
     .catch(e=>{if(!navigation.signal.aborted)setError(e.message)})
   }
   if(d.type==='anglais:termine'&&d.id===id&&!callbacks.current.preview){
    // Le lecteur a déjà envoyé la progression ; relire avant de peindre la coche.
    fetch('/anglais/api/progression/'+id).then(r=>r.json()).then(s=>{if(s.termine)callbacks.current.onCompleted?.()}).catch(()=>{})
   }
  }
  window.addEventListener('message',recevoir);return()=>{navigation.abort();window.removeEventListener('message',recevoir)}
 },[id])
 if(error)return <p role="alert">{error}</p>
 if(!id)return <p role="status">Ouverture de la leçon…</p>
 return <iframe ref={frame} className="anglais-frame" title="Leçon d’anglais" src={`/anglais/index.html?lms=1&id=${encodeURIComponent(id)}${p.preview?'&preview=1':''}`} allow="microphone 'self'; autoplay 'self'; fullscreen" style={{height:hauteur,width:'100%',border:0,display:'block'}} />
}
