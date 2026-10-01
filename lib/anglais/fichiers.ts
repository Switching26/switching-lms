import fs from 'node:fs/promises'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
export function cheminValide(rel:string) {
 return !!rel && !rel.includes('\\') && !/[\x00-\x1f%]/.test(rel) && !path.isAbsolute(rel) && rel.split('/').every(p=>p!==''&&p!=='.'&&p!=='..'&&!p.startsWith('.'))
}
/** Refuse chaque lien symbolique, même si sa cible serait dans le volume. */
export async function cheminBorne(base:string,rel:string,creer=false) {
 if(!cheminValide(rel)) throw new Error('Chemin interdit')
 const root=path.resolve(base)
 if(creer) await fs.mkdir(root,{recursive:true})
 if((await fs.lstat(root)).isSymbolicLink()) throw new Error('Lien interdit')
 let current=root
 for(const part of rel.split('/')) {
  current=path.join(current,part)
  const s=await fs.lstat(current).catch((e)=>{if(e.code==='ENOENT')return null;throw e})
  if(s?.isSymbolicLink()) throw new Error('Lien interdit')
 }
 const realRoot=await fs.realpath(root)
 const parent=await fs.realpath(path.dirname(current)).catch(()=>null)
 if(parent && parent!==realRoot&&!parent.startsWith(realRoot+path.sep)) throw new Error('Chemin interdit')
 return current
}
export const volume=()=>path.join(process.env.UPLOAD_DIR||path.join(process.cwd(),'public/uploads'),'anglais')
export const lecteurRoot=()=>path.join(process.cwd(),'anglais-lecteur')
const MIME:Record<string,string>={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',woff2:'font/woff2',mp3:'audio/mpeg',wav:'audio/wav',mp4:'video/mp4',webm:'video/webm',vtt:'text/vtt',ico:'image/x-icon'}
export async function fichier(req:Request,base:string,rel:string) {
 const f=await cheminBorne(base,rel);const s=await fs.stat(f)
 if(!s.isFile()) return new Response(null,{status:404})
 const headers=new Headers({'Content-Type':MIME[path.extname(f).slice(1)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
 let start=0,end=s.size-1,status=200
 const range=req.headers.get('range')
 if(range){
  const m=/^bytes=(\d*)-(\d*)$/.exec(range)
  if(!m||(!m[1]&&!m[2])) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${s.size}`}})
  if(!m[1]){const suffix=Number(m[2]);start=Math.max(0,s.size-suffix)} else {start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=s.size) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${s.size}`}})
  status=206;headers.set('Content-Range',`bytes ${start}-${end}/${s.size}`)
 }
 headers.set('Content-Length',String(Math.max(0,end-start+1)))
 if(req.method==='HEAD'||s.size===0)return new Response(null,{status,headers})
 const stream=createReadStream(f,{start,end});req.signal.addEventListener('abort',()=>stream.destroy(),{once:true})
 return new Response(Readable.toWeb(stream) as ReadableStream,{status,headers})
}
export async function corpsBorne(req:Request,max:number) {
 if(Number(req.headers.get('content-length')||0)>max) throw new Error('Trop volumineux')
 const reader=req.body?.getReader();if(!reader)return Buffer.alloc(0)
 const chunks:Uint8Array[]=[];let total=0
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw new Error('Trop volumineux')}chunks.push(value)}
 return Buffer.concat(chunks)
}
