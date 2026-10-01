/** Inventaire commun au semis et à l'import. Aucun dossier source n'est modifié. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
export const contenu = process.env.ANGLAIS_CONTENU || path.join(process.env.HOME!, 'checkos/work/lms-anglais-contenu')
export const prototype = process.env.ANGLAIS_PROTOTYPE || path.join(process.env.HOME!, 'checkos/work/lms-anglais-prototype-multi')
export const assetsU01 = process.env.ANGLAIS_ASSETS_U01 || path.join(process.env.HOME!, 'checkos/work/lms-anglais-prototype')
export const lecteur = process.env.ANGLAIS_LECTEUR || path.join(process.cwd(), 'anglais-lecteur')
export const ids = ['EVAL', ...Array.from({length:6},(_,b)=>[...Array.from({length:4},(_,u)=>`U${String(b*4+u+1).padStart(2,'0')}`),`T${b+1}`]).flat(), ...['G','V'].flatMap(p=>Array.from({length:20},(_,i)=>`${p}${String(i+1).padStart(2,'0')}`)), 'EVAL-B1','EVAL-B2','BILAN']
export const dossier = (id:string)=>path.join(contenu, id==='BILAN'?'EVAL':id.replace(/^EVAL-B([12])$/, 'EVAL/BLANC$1'))
export const json = async (p:string)=>JSON.parse(await fs.readFile(p,'utf8'))
export const existe = async (p:string)=>fs.stat(p).then(s=>s.isFile()).catch(()=>false)
export async function empreinte(p:string) { const h=createHash('sha256'); for await(const c of createReadStream(p)) h.update(c); return h.digest('hex') }
export type Media = { chemin:string, source:string, taille:number, sha256:string }
export async function inventaire() {
 const fichiers = new Map<string,string>(); const medias:Record<string,any> = {}
 const ajouter = async (rel:string, source:string)=>{
  if (rel.startsWith('/') || rel.split('/').some(x=>!x||x==='..'||x==='.') || rel.includes('\\')) throw Error(`Chemin interdit ${rel}`)
  if (!await existe(source)) throw Error(`Média absent: ${source}`)
  if((await fs.lstat(source)).isSymbolicLink()) throw Error(`Lien interdit: ${source}`)
  fichiers.set(rel,source)
 }
 const audio = await json(path.join(prototype,'audio/manifest.json'))
 await ajouter('audio/manifest.json',path.join(prototype,'audio/manifest.json'))
 for(const s of Object.values(audio.segments||{}) as any[]) if(s.fichier) await ajouter(s.fichier.replace(/^\//,''),path.join(prototype,s.fichier.replace(/^\//,'')))
 // Toutes les images publiées par les manifestes, puis uniquement les fichiers vidéo cités.
 for(const id of ids) {
  const images:any[]=[]; const segments:Record<string,any>={}; const base=id==='U01'?assetsU01:dossier(id); const prefixe=id==='U01'?'':`contenu/${id}/`
  const vpath=path.join(base,'assets/visuels/visuels.json')
  if(await existe(vpath)) {
   const v=await json(vpath); const liste=Array.isArray(v)?v:v.assets||v.visuels||v.images||[]
   await ajouter(prefixe+'assets/visuels/visuels.json',vpath)
   for(const x of liste) { let rel=String(x.fichier||x.file||x.chemin||'').replace(/^\//,''); if(!rel.startsWith('assets/')) rel='assets/visuels/'+rel; if(!await existe(path.join(base,rel))) continue; await ajouter(prefixe+rel,path.join(base,rel)); images.push({...x,fichier:'/anglais/'+prefixe+rel}) }
  }
  const localAudio=path.join(dossier(id),'audio/manifest.json')
  if(await existe(localAudio)) { const m=await json(localAudio); for(const [k,s] of Object.entries(m.segments||{}) as any) { await ajouter(`contenu/${id}/`+s.fichier,path.join(dossier(id),s.fichier)); segments[k]={...s,fichier:`contenu/${id}/`+s.fichier} } }
  const chronoRel=`assets/video-montage/episode-${id==='U01'?'l01':id.toLowerCase()}.json`; let video=null
  if(await existe(path.join(base,chronoRel))) {
   const chrono=await json(path.join(base,chronoRel));
   await ajouter(prefixe+chronoRel,path.join(base,chronoRel))
   for(const rel of Object.values(chrono.fichiers||{}) as string[]) await ajouter(prefixe+rel,path.join(base,rel))
   video={chrono:'/anglais/'+prefixe+chronoRel,chronologie:chrono,prefixe:'/anglais/'+prefixe}
  }
  const besoins=await json(path.join(dossier(id),'besoins-images.json')).catch(()=>[])
  medias[id]={segments,images,besoins:Array.isArray(besoins)?besoins:besoins.images||besoins.besoins||[],video}
 }
 // Les vignettes proviennent de la version importée (ou du lecteur final indiqué).
 const vignetteSource=process.env.ANGLAIS_VIGNETTES || path.join(process.env.HOME!,'checkos/work/lms-anglais-lecteur-lms/public/vignettes')
 if(await fs.stat(vignetteSource).catch(()=>null)) for(const n of await fs.readdir(vignetteSource)) if(/\.(jpg|png|webp|svg)$/.test(n)) await ajouter('vignettes/'+n,path.join(vignetteSource,n))
 return {audio,medias,fichiers}
}
