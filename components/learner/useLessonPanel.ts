"use client"
import { useEffect, useRef, useState } from 'react'
/** Le panneau garde ses nœuds ; seul son état visuel change. */
export function useLessonPanel(open:boolean,modal:boolean,onClose:()=>void) {
  const panel=useRef<HTMLElement>(null),latest=useRef(onClose)
  latest.current=onClose
  useEffect(()=>{
    const el=panel.current
    if(!el)return
    el.inert=modal&&!open
    if(!modal||!open)return
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null
    el.querySelector<HTMLElement>('button')?.focus({preventScroll:true})
    const siblings=Array.from(el.parentElement?.children||[]).filter((n):n is HTMLElement=>n instanceof HTMLElement&&n!==el&&!n.hasAttribute('data-lesson-veil'))
    const states=siblings.map(n=>({n,inert:n.inert}))
    siblings.forEach(n=>n.inert=true)
    const keyboard=(e:KeyboardEvent)=>{
      if(e.defaultPrevented)return
      if(e.key==='Escape'){e.preventDefault();latest.current();return}
      if(e.key!=='Tab')return
      const all=Array.from(el.querySelectorAll<HTMLElement>('button,input,a[href],[tabindex="0"]')).filter(n=>n.offsetHeight&&!n.closest('[hidden]'))
      const first=all[0],last=all[all.length-1]
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }
    window.addEventListener('keydown',keyboard)
    return ()=>{window.removeEventListener('keydown',keyboard);states.forEach(({n,inert})=>n.inert=inert);previous?.isConnected&&previous.focus({preventScroll:true})}
  },[open,modal])
  return panel
}
export function useSmallLessonScreen(){const [small,setSmall]=useState(false);useEffect(()=>{const m=matchMedia('(max-width:760px)');const update=()=>setSmall(m.matches);update();m.addEventListener('change',update);return()=>m.removeEventListener('change',update)},[]);return small}
