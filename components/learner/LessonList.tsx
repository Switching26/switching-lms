"use client"
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { dureeLisible } from '@/lib/simulation/duree'
import { findLessons, normalize, prepareIndex, tokens, wordScore } from '@/lib/lessons/search'
import type { LessonEntry, LessonKind } from '@/lib/lessons/model'

const paths={list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',close:'m6 6 12 12M6 18 18 6',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',chevron:'m8 10 4 4 4-4',video:'M4 3h16v18H4zM10 8l6 4-6 4z',evaluation:'M8 4H5v17h14V4h-3M9 2h6v4H9zM8 12l2 2 5-5M8 18h7',document:'M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8',atelier:'M3 3h18v18H3zM3 9h18M9 3v18M15 9v12M3 15h18',exercice:'m4 16-1 5 5-1L20 8l-4-4ZM14 6l4 4',anglais:'M3 4h6l3 2 3-2h6v16h-6l-3 2-3-2H3zM12 6v16',test:'M8 4H5v17h14V4h-3M9 2h6v4H9zM9 11h6M9 15h6',fiche:'M6 2h14v18H6zM3 6v17h13M9 6h8M9 10h8M9 14h5',texte:'M4 4h16M12 4v16M8 20h8',done:'m5 12 4 4L19 6',current:'M12 4v8l5 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',todo:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0'}
export function LessonIcon({kind,size=18}: {kind:keyof typeof paths;size?:number}) { return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]}/></svg> }
const names: Record<LessonKind,string>={video:'Vidéo',evaluation:'Évaluation',document:'Document',atelier:'Atelier guidé',exercice:'Exercice',anglais:'Leçon d’anglais',test:'Test',fiche:'Fiche',texte:'Lecture'}
const stateNames={current:'En cours',done:'Fait',todo:'À faire'}

export default function LessonList({entrees,courant,onNaviguer,active=true,anglais=false,title,minutes,onClose,position}: {
  entrees:LessonEntry[];courant:string;onNaviguer:(id:string)=>void;active?:boolean;anglais?:boolean;title?:string;minutes?:number|null;onClose?:()=>void;position?:ReactNode
}) {
  const uid=useId(), listRef=useRef<HTMLDivElement>(null), inputRef=useRef<HTMLInputElement>(null)
  const [query,setQuery]=useState(''),[selected,setSelected]=useState(0),[opened,setOpened]=useState<Set<string>>(new Set())
  // La clé exclut la progression : ni heartbeat ni validation ne retokenisent le catalogue.
  const catalogueKey=JSON.stringify(entrees.map((e,index)=>({id:e.id,title:e.titre,module:e.module||'Chapitres',theme:e.searchTheme||'',index,group:e.sectionId||e.module||'Chapitres'})))
  const catalogue=useMemo(()=>JSON.parse(catalogueKey) as {id:string;title:string;module:string;theme:string;index:number;group:string}[],[catalogueKey])
  const index=useMemo(()=>prepareIndex(catalogue),[catalogue])
  const groups=useMemo(()=>{const out: {id:string;title:string;ids:string[]}[]=[];for(const c of catalogue){let g=out.find(g=>g.id===c.group);if(!g){g={id:c.group,title:c.module,ids:[]};out.push(g)}g.ids.push(c.id)}return out},[catalogue])
  const entries=new Map(entrees.map(e=>[e.id,e]))
  const currentGroup=catalogue.find(c=>c.id===courant)?.group
  const results=useMemo(()=>findLessons(index,query),[index,query])
  const searching=!!query.trim(), selectedIndex=Math.min(selected,Math.max(0,results.length-1))
  const done=entrees.filter(e=>e.termine).length,percent=entrees.length?Math.round(done/entrees.length*100):0
  const duration=(minutes??entrees[0]?.formationMinutes)?(minutes??entrees[0]?.formationMinutes)!*60:entrees.reduce((n,e)=>n+(e.secondes||0),0)
  useEffect(()=>{if(!active)return;setQuery('');setSelected(0);if(currentGroup)setOpened(o=>new Set(o).add(currentGroup))},[active,courant,currentGroup])
  useEffect(()=>{
    if(!active||searching)return
    const list=listRef.current,el=list?.querySelector<HTMLElement>('[aria-current=step]')
    if(!list||!el)return
    const rect=el.getBoundingClientRect(),box=list.getBoundingClientRect()
    if(rect.bottom>box.bottom||rect.top<box.top)list.scrollTop+=rect.top-box.top-80
  },[active,courant,opened,searching])
  const clear=()=>{setQuery('');setSelected(0)}
  function mark(text:string){const qs=tokens(query);return text.split(new RegExp('([\\p{L}\\p{N}]+)', 'u')).map((w,i)=>query&&qs.some(q=>wordScore(q,normalize(w))>=.53)?<mark key={i}>{w}</mark>:w)}
  function row(id:string,resultIndex?:number) {
    const e=entries.get(id)!;const kind=e.lessonKind||'texte',state=id===courant?'current':e.termine?'done':'todo'
    const result=resultIndex!==undefined
    return <button type="button" key={id} className={`lesson ${result?'result':''}`} data-lesson-id={id} aria-current={state==='current'?'step':undefined} id={result?`${uid}-result-${resultIndex}`:undefined} role={result?'option':undefined} aria-selected={result?resultIndex===selectedIndex:undefined} onClick={()=>{clear();onNaviguer(id)}}>
      <span className="typeIcon" data-kind={kind} role="img" aria-label={names[kind]} title={names[kind]}><LessonIcon kind={kind}/></span>
      <span className="lessonContent">{result&&<span className="context">{mark(e.module||'Chapitres')}</span>}<span className="lessonName">{mark(e.titre)}</span>{result&&e.searchTheme&&<span className="theme">Thème : {mark(e.searchTheme)}</span>}<span className="lessonMeta"><span>{names[kind]}</span><span aria-hidden="true">·</span><span className={`state ${state}`}><LessonIcon kind={state} size={12}/>{stateNames[state]}</span></span>{state==='current'&&position&&<span className="lessonPosition">{position}</span>}</span>
      <span className="duration">{e.secondes?dureeLisible(e.secondes):'—'}</span>
    </button>
  }
  return <div className={`lms-lecons ${anglais?'lms-lecons-anglais':''}`} onKeyDown={e=>{if(e.key==='Escape'&&query){e.preventDefault();e.stopPropagation();clear();inputRef.current?.focus()}}}>
    <header><div className="eyebrow"><span>Votre formation</span>{onClose&&<button type="button" className="close" onClick={onClose} aria-label="Fermer les leçons"><LessonIcon kind="close"/></button>}</div><h2>{title||entrees[0]?.formationTitle||'Toutes les leçons'}</h2><div className="courseMeta">{entrees.length} chapitres · {dureeLisible(duration)}</div><div className="progressLine"><strong>{done} chapitre{done>1?'s':''} terminé{done>1?'s':''}</strong><span>{percent} %</span></div><div className="track" role="progressbar" aria-label="Progression de la formation" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${percent}%`}}/></div></header>
    <div className="searchWrap"><LessonIcon kind="search" size={19}/><input ref={inputRef} type="search" maxLength={120} autoComplete="off" aria-label="Rechercher une leçon" role="combobox" aria-autocomplete="list" aria-controls={`${uid}-list`} aria-expanded={searching} aria-activedescendant={searching&&results.length?`${uid}-result-${selectedIndex}`:undefined} placeholder="Rechercher une leçon…" value={query} onChange={e=>{setQuery(e.target.value);setSelected(0);if(listRef.current)listRef.current.scrollTop=0}} onKeyDown={e=>{if(!results.length||!['ArrowDown','ArrowUp','Enter'].includes(e.key))return;e.preventDefault();if(e.key==='Enter'){clear();onNaviguer(results[selectedIndex].c.id);return}const next=(selectedIndex+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;setSelected(next);const el=document.getElementById(`${uid}-result-${next}`);el?.scrollIntoView({block:'nearest'})}}/>{query&&<button type="button" className="clear" aria-label="Effacer la recherche" onClick={()=>{clear();inputRef.current?.focus()}}><LessonIcon kind="close" size={16}/></button>}</div>
    <div className="listHeading"><span aria-live="polite">{searching?`${results.length} résultat${results.length>1?'s':''}`:'Votre parcours'}</span><span>{groups.length} modules</span></div>
    <div ref={listRef} id={`${uid}-list`} className="lessonList" role={searching?'listbox':undefined} aria-label={searching?'Résultats de recherche':undefined}>{searching?(results.length?results.map((r,i)=>row(r.c.id,i)):<div className="empty"><strong>Aucune leçon trouvée</strong>Essayez un mot plus court ou un autre thème.<br/>La recherche accepte les fautes de frappe.</div>):groups.map((g,i)=>{const open=opened.has(g.id),n=g.ids.filter(id=>entries.get(id)?.termine).length,is=g.id===currentGroup;return <section className="module" key={g.id}><button type="button" className="moduleButton" aria-expanded={open} aria-controls={`${uid}-group-${i}`} onClick={()=>setOpened(prev=>{const next=new Set(prev);if(open)next.delete(g.id);else next.add(g.id);return next})}><span className="number">{String(i+1).padStart(2,'0')}</span><span className="moduleText"><span className="moduleName">{g.title}</span><span className="moduleMeta"><span className="track"><i style={{width:`${n/g.ids.length*100}%`}}/></span>{n} / {g.ids.length} terminé{n>1?'s':''}{is?' · En cours':''}</span></span><span className="chevron" style={{transform:`rotate(${open?180:0}deg)`}}><LessonIcon kind="chevron" size={14}/></span></button><ul id={`${uid}-group-${i}`} className="rows" hidden={!open}>{g.ids.map(id=><li key={id}>{row(id)}</li>)}</ul></section>})}</div>
    <div className="bottom"><kbd>↑</kbd> <kbd>↓</kbd> Choisir · <kbd>Entrée</kbd> Ouvrir · <kbd>Échap</kbd> Effacer / fermer</div>
  </div>
}
