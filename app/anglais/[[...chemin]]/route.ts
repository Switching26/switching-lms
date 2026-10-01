import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { acces,identifiant,RefusAnglais } from '@/lib/anglais/acces'
import { fichier,volume,lecteurRoot,cheminValide,corpsBorne } from '@/lib/anglais/fichiers'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const repondre=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store'}})
async function route(req:NextRequest,{params}:{params:{chemin?:string[]}}){
 try {
  const parts=params.chemin||[];const rel=parts.join('/')
  if(rel&&!cheminValide(rel))throw new RefusAnglais(400,'Chemin interdit')
  const api=parts[0]==='api'?parts[1]:null
  const id=['medias','lecon','etat','progression'].includes(api||'')?identifiant(parts[2]||''):parts[0]==='contenu'?identifiant(parts[1]||''):undefined
  const ctx=await acces(id,api==='chapitre'?parts[2]:undefined)
  if(!rel)return NextResponse.redirect(new URL('/anglais/index.html'+req.nextUrl.search,req.url))
  const raw=ctx.simulation?.scenario as any
  const simulations=async()=>prisma.simulation.findMany({where:{app:'ANGLAIS',chapter:{formationId:{in:ctx.formations.map(f=>f.id)},...(ctx.admin?{}:{isPublished:true})}}})
  const commun=async()=>{
   // Le positionnement contient la bibliothèque commune ; l'accès formation est déjà vérifié.
   const s=await prisma.simulation.findFirst({where:{app:'ANGLAIS',scenario:{path:['id'],equals:'EVAL'},chapter:{formationId:{in:ctx.formations.map(f=>f.id)}}}})
   return (s?.scenario as any)?.commun
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){
   const origin=req.headers.get('origin')
   const host=req.headers.get('x-forwarded-host')||req.headers.get('host')
   const protocol=req.headers.get('x-forwarded-proto')||req.nextUrl.protocol.replace(':','')
   if(origin&&origin!==`${protocol}://${host}`)throw new RefusAnglais(403,'Origine refusée')
   if(req.headers.get('sec-fetch-site')==='cross-site')throw new RefusAnglais(403,'Origine refusée')
  }
  if(api==='sante')return repondre({ok:true,service:'lms-anglais',prononciation:{disponible:!!process.env.ANGLAIS_PRONONCIATION_URL}})
  if(api==='chapitre'&&raw)return repondre({id:raw.id,duree_min:raw.duree_min,preview:ctx.admin})
  if(api==='niveau'){
   const all=await simulations();const shared=await commun()
   return repondre({...shared?.catalogue,elements:all.map(s=>{const r=s.scenario as any;const p=r.lecon.lecon;return{id:r.id,nature:/^T|^EVAL/.test(r.id)?'test':/^[GV]/.test(r.id)?'fiche':'unite',titre:p.titre?.fr||p.titre,duree_min:r.duree_min,present:true,disponible:true}})})
  }
  if(api==='activites'){const a=(await commun())?.activites;return repondre({...a,familles:Object.fromEntries(Object.entries(a?.familles||{}).map(([k,v])=>[k,(v as any[]).map(m=>({...m,url:'/anglais'+m.url}))]))})}
  if(api==='lecon')return repondre(raw.lecon)
  if(api==='medias')return repondre({...raw.medias,segments:{...(await commun())?.audio?.segments,...raw.medias?.segments}})
  if(parts[0]==='contenu'&&parts[2]==='script'&&parts.length===4)return repondre(raw.fichiers[parts[3]]||{absent:true})
  if(api==='etat'||api==='progression'){
   if(!ctx.simulation)throw new RefusAnglais(404,'Chapitre inconnu')
   const key={simulationId:ctx.simulation.id,userId:ctx.session.user.id}
   if(req.method==='GET'){
    const a=await prisma.simulationAttempt.findUnique({where:{simulationId_userId:key}});const log=a?.stepLog as any
    return repondre(api==='etat'?(log?.etat||{version:1,valeurs:{},commun:{}}):{ok:true,id,...log?.progression,termine:!!a?.completedAt})
   }
   if(req.method!=='PUT'&&req.method!=='POST')throw new RefusAnglais(405,'Méthode refusée')
   if(ctx.admin||ctx.session.user.impersonating)return repondre({ok:true,preview:true,enregistre:false})
   const body=JSON.parse((await corpsBorne(req,api==='etat'?1024*1024:4096)).toString())
   if(!body||typeof body!=='object'||Array.isArray(body))throw new RefusAnglais(400,'État invalide')
   if(api==='etat' && (body.version!==1||!body.valeurs||Array.isArray(body.valeurs)||typeof body.valeurs!=='object'||!body.commun||Array.isArray(body.commun)||typeof body.commun!=='object'))throw new RefusAnglais(400,'Format d’état invalide')
   if(api==='progression'){
    const {vues,faites,total,termine}=body
    const attendu=raw.id==='BILAN'?1:ctx.simulation.stepCount
    if(![vues,faites,total].every(n=>Number.isInteger(n)&&n>=0&&n<=10000)||faites>vues||vues>total||total!==attendu||typeof termine!=='boolean'||termine!==(total>0&&faites===total))throw new RefusAnglais(400,'Progression invalide')
   }
   const result=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key.simulationId+':'+key.userId}))`
    const a=await tx.simulationAttempt.findUnique({where:{simulationId_userId:key}});const log=(a?.stepLog||{}) as any
    if(api==='etat'){
     // Fusion par horodatage : un appareil retardataire ne remplace pas les réponses récentes.
     const courant=log.etat||{version:1,valeurs:{},commun:{}}
     const merger=(avant:any,nouveau:any)=>Object.fromEntries(Array.from(new Set([...Object.keys(avant||{}),...Object.keys(nouveau||{})])).map(k=>[k, !avant?.[k] || (nouveau?.[k]?.modifie||0)>(avant[k]?.modifie||0)?nouveau[k]:avant[k]]))
     log.etat={...body,valeurs:merger(courant.valeurs,body.valeurs),commun:Object.fromEntries(Array.from(new Set([...Object.keys(courant.commun||{}),...Object.keys(body.commun)])).map(k=>[k,merger(courant.commun?.[k],body.commun[k])]))}
     if(Buffer.byteLength(JSON.stringify(log.etat))>1024*1024)throw new RefusAnglais(413,'État trop volumineux')
    }
    else log.progression=body
    const termine=api==='progression'&&(body.termine===true||body.completed===true)
    const date=a?.completedAt|| (termine?new Date():null)
    await tx.simulationAttempt.upsert({where:{simulationId_userId:key},create:{...key,stepLog:log,completedAt:date},update:{stepLog:log,completedAt:date}})
    if(termine)await tx.progress.upsert({where:{userId_chapterId:{userId:key.userId,chapterId:ctx.simulation!.chapterId}},create:{userId:key.userId,chapterId:ctx.simulation!.chapterId,completedAt:date},update:{completedAt:date}})
    return {ok:true,id,enregistre:true,termine:!!date}
   });return repondre(result)
  }
  if(api==='prononciation'||api==='transcription'){
   const upstream=process.env.ANGLAIS_PRONONCIATION_URL
   if(!upstream)return repondre({ok:false,disponible:false,indisponible:true,code:'indisponible',message:'Note indisponible. Vous pouvez vous enregistrer, vous réécouter et vous comparer au modèle.',erreur:'Note indisponible',raison:'Le service de prononciation n’est pas configuré.'})
   if(req.method!=='POST')throw new RefusAnglais(405,'Méthode refusée')
   const payload=await corpsBorne(req,12*1024*1024)
   try {
    const res=await fetch(new URL('api/'+api+req.nextUrl.search,upstream.endsWith('/')?upstream:upstream+'/'),{method:'POST',headers:{'Content-Type':req.headers.get('content-type')||'application/octet-stream'},body:payload,signal:AbortSignal.timeout(45000),redirect:'error'})
    return repondre(await res.json(),res.ok?200:503)
   }catch{return repondre({ok:false,disponible:false,indisponible:true,code:'indisponible',message:'Note indisponible. Vous pouvez vous enregistrer, vous réécouter et vous comparer au modèle.',erreur:'Note indisponible'})}
  }
  if(api)throw new RefusAnglais(404,'Route inconnue')
  if(req.method!=='GET'&&req.method!=='HEAD')throw new RefusAnglais(405,'Méthode refusée')
  if(['audio','assets','contenu','vignettes'].includes(parts[0]))return await fichier(req,volume(),parts[0]==='contenu'?[parts[0],id,...parts.slice(2)].join('/'):rel)
  const clientRel=['services','activities','data'].includes(parts[0])?rel:'public/'+(rel||'index.html')
  return await fichier(req,lecteurRoot(),clientRel)
 }catch(e){
  if(e instanceof RefusAnglais)return repondre({ok:false,erreur:e.message},e.status)
  if(e instanceof SyntaxError)return repondre({ok:false,erreur:'JSON invalide'},400)
  if(e instanceof Error&&e.message==='Trop volumineux')return repondre({ok:false,erreur:e.message},413)
  if(e instanceof Error&&/Chemin|Lien/.test(e.message))return repondre({ok:false,erreur:'Chemin interdit'},400)
  if((e as any)?.code==='ENOENT')return repondre({ok:false,erreur:'Fichier introuvable'},404)
  console.error('[anglais]',e);return repondre({ok:false,erreur:'Erreur interne'},500)
 }
}
export {route as GET,route as HEAD,route as PUT,route as POST}
