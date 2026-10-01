"use client"
import { useEffect,useRef,useState } from 'react'
import { useCadranActions } from '@/components/learner/CadranFormation'
type Props={chapterId:string,preview?:boolean,onCompleted?:()=>void,onPrecedent?:()=>void,onSuivant?:()=>void,onQuitter?:()=>void}
/** Le même iframe persiste en immersion : aucun exercice ou enregistrement perdu. */
export default function AnglaisChapter(p:Props){
 const frame=useRef<HTMLIFrameElement>(null);const [id,setId]=useState('');const [error,setError]=useState('');const [hauteur,setHauteur]=useState(900)
 const actions=useCadranActions();const callbacks=useRef(p);callbacks.current=p
 useEffect(()=>{let alive=true;setId('');setError('');setHauteur(900)
  fetch('/anglais/api/chapitre/'+encodeURIComponent(p.chapterId)).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.erreur||'Leçon indisponible');if(alive)setId(d.id)}).catch(e=>{if(alive)setError(e.message)})
  return()=>{alive=false;actions.immersion(false)}
 },[p.chapterId,actions])
 useEffect(()=>{
  const recevoir=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return
   const d=event.data;if(!d||typeof d!=='object')return
   if(d.type==='anglais:hauteur'&&Number.isFinite(d.px))setHauteur(Math.min(50000,Math.max(200,Math.ceil(d.px))))
   if(d.type==='anglais:immersion'&&typeof d.active==='boolean')actions.immersion(d.active)
   if(d.type==='anglais:outil') {if(d.outil==='notes')actions.ouvrirNotes();if(d.outil==='ressources')actions.ouvrirRessources()}
   if(d.type==='anglais:naviguer') {if(d.vers==='chapitre-suivant')callbacks.current.onSuivant?.();if(d.vers==='chapitre-precedent')callbacks.current.onPrecedent?.();if(d.vers==='mes-formations')callbacks.current.onQuitter?.()}
   if(d.type==='anglais:termine'&&d.id===id&&!callbacks.current.preview){
    // Le lecteur a déjà envoyé la progression ; relire avant de peindre la coche.
    fetch('/anglais/api/progression/'+id).then(r=>r.json()).then(s=>{if(s.termine)callbacks.current.onCompleted?.()}).catch(()=>{})
   }
  }
  window.addEventListener('message',recevoir);return()=>window.removeEventListener('message',recevoir)
 },[id,actions])
 if(error)return <p role="alert">{error}</p>
 if(!id)return <p role="status">Ouverture de la leçon…</p>
 return <iframe ref={frame} className="anglais-frame" title="Leçon d’anglais" src={`/anglais/index.html?lms=1&id=${encodeURIComponent(id)}${p.preview?'&preview=1':''}`} allow="microphone 'self'; fullscreen" style={{height:hauteur,width:'100%',border:0,display:'block'}} />
}
