/** Import administratif par manifeste et morceaux. Aucun tar arbitraire à extraire. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash,timingSafeEqual,randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { NextRequest,NextResponse } from 'next/server'
import { volume,cheminBorne,cheminValide,corpsBorne } from '@/lib/anglais/fichiers'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'no-store'}})
async function hash(f:string){const h=createHash('sha256');for await(const c of createReadStream(f))h.update(c);return h.digest('hex')}
async function route(req:NextRequest){
 try {
  const secret=process.env.ANGLAIS_IMPORT_SECRET;const token=req.headers.get('authorization')?.replace(/^Bearer /,'')||''
  if(!secret||!timingSafeEqual(createHash('sha256').update(token).digest(),createHash('sha256').update(secret).digest()))return json({erreur:'Non autorisé'},401)
  const root=volume();await fs.mkdir(root,{recursive:true});await cheminBorne(root,'probe')
  const stage=path.join(root,'.imports');await fs.mkdir(stage,{recursive:true});if((await fs.lstat(stage)).isSymbolicLink())throw Error('Lien interdit')
  if(req.method==='POST'){
   const body=JSON.parse((await corpsBorne(req,4*1024*1024)).toString())
   if(body.action==='initialiser'){
    const files=body.fichiers
    if(!Array.isArray(files)||!files.length||files.length>20000)throw Error('Manifeste invalide')
    const seen=new Set()
    for(const f of files){
     if(!cheminValide(f.chemin)||!Number.isSafeInteger(f.taille)||f.taille<0||f.taille>1024*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256)||seen.has(f.chemin))throw Error('Manifeste invalide')
     seen.add(f.chemin)
    }
    const manifeste={fichiers:files,remplacer:body.remplacer===true}
    const id=createHash('sha256').update(JSON.stringify(manifeste)).digest('hex')
    const dir=path.join(stage,id);await fs.mkdir(dir,{recursive:true})
    const temporaire=path.join(dir,'manifest-'+randomUUID()+'.tmp')
    await fs.writeFile(temporaire,JSON.stringify(manifeste),{flag:'wx'})
    await fs.rename(temporaire,path.join(dir,'manifest.json'))
    return json({ok:true,id,nombre:files.length,octets:files.reduce((n,f)=>n+f.taille,0),remplacer:manifeste.remplacer})
   }
  }
  const id=req.nextUrl.searchParams.get('id')||''
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('Import invalide')
  const dir=path.join(stage,id);const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'))
  if(req.method==='POST'&&req.nextUrl.searchParams.get('action')==='verifier'){
   const erreurs=[];let octets=0
   for(const f of manifest.fichiers){const dest=await cheminBorne(root,f.chemin);const s=await fs.stat(dest).catch(()=>null);if(!s||s.size!==f.taille||await hash(dest)!==f.sha256)erreurs.push(f.chemin);else octets+=s.size}
   return json({ok:!erreurs.length,nombre:manifest.fichiers.length,octets,erreurs})
  }
  const index=Number(req.nextUrl.searchParams.get('fichier'))
  if(!Number.isInteger(index)||index<0||index>=manifest.fichiers.length)throw Error('Fichier invalide')
  const f=manifest.fichiers[index];const dest=await cheminBorne(root,f.chemin);const partial=path.join(dir,index+'.part')
  const existing=await fs.stat(dest).catch(()=>null)
  if(req.method==='GET'){
   const identique=existing?.isFile()&&existing.size===f.taille&&await hash(dest)===f.sha256
   if(existing&&!identique&&!manifest.remplacer)return json({erreur:'Fichier différent déjà présent ; --replace explicite requis',chemin:f.chemin},409)
   return json({ok:true,termine:!!identique,offset:identique?f.taille:(await fs.stat(partial).catch(()=>null))?.size||0})
  }
  if(req.method!=='PUT')return json({erreur:'Méthode refusée'},405)
  const bytes=await corpsBorne(req,4*1024*1024)
  // Verrou libéré automatiquement après coupure/redémarrage ; aucun .lock orphelin.
  return await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'anglais-import:'+f.chemin}))`
  const existing=await fs.stat(dest).catch(()=>null)
  if(existing&&!manifest.remplacer){if(existing.size===f.taille&&await hash(dest)===f.sha256)return json({ok:true,termine:true,offset:f.taille});return json({erreur:'Écrasement refusé'},409)}
  const offset=Number(req.nextUrl.searchParams.get('offset'));const size=(await fs.stat(partial).catch(()=>null))?.size||0
  if(!Number.isSafeInteger(offset)||offset!==size)return json({erreur:'Offset incohérent',offset:size},409)
  if(!bytes.length||size+bytes.length>f.taille)throw Error('Taille incohérente')
  await fs.appendFile(partial,bytes)
  if(size+bytes.length===f.taille){
   if(await hash(partial)!==f.sha256){await fs.unlink(partial);return json({erreur:'Empreinte incohérente, reprise à zéro'},422)}
   await fs.mkdir(path.dirname(dest),{recursive:true});await cheminBorne(root,f.chemin)
   await fs.rename(partial,dest)
   return json({ok:true,termine:true,offset:f.taille})
  }
  return json({ok:true,termine:false,offset:size+bytes.length})
  },{timeout:110000})
 }catch(e){return json({erreur:e instanceof Error?e.message:'Import refusé'},(e as any)?.code==='EEXIST'?409:400)}
}
export {route as POST,route as GET,route as PUT}
