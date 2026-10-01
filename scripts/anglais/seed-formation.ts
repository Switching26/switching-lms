/** Essai à blanc par défaut. --apply --confirm SEED_ANGLAIS pour écrire, jamais publier. */
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { ids, contenu, prototype, dossier, json, inventaire } from './sources'
const db=new PrismaClient(); const titre='Anglais niveau 1 — Débutant (A1/A2)'
async function main() {
 const apply=process.argv.includes('--apply')
 if(apply && process.argv[process.argv.indexOf('--confirm')+1]!=='SEED_ANGLAIS') throw Error('Confirmation SEED_ANGLAIS requise')
 let existing=await db.formation.findMany({where:{title:titre,deletedAt:null},include:{sections:true,chapters:{include:{simulation:true}}}})
 if(existing.length>1) throw Error('Plusieurs formations homonymes : arrêt sans écriture')
 const verifierExistant=(list:typeof existing)=>{
  if(list.length>1)throw Error('Plusieurs formations homonymes')
  const f=list[0];if(!f)return
  if(f.isPublished)throw Error('Formation déjà publiée : semis refusé pour préserver sa publication')
  const connus=f.chapters.map(c=>(c.simulation?.scenario as any)?.id)
  if(f.chapters.some(c=>c.simulation?.app!=='ANGLAIS')||connus.some(id=>!ids.includes(id))||new Set(connus).size!==connus.length)throw Error('Formation existante incompatible ou chapitres dupliqués')
  if(new Set(f.sections.map(s=>s.order)).size!==f.sections.length||f.sections.some(s=>s.order<0||s.order>9))throw Error('Sections existantes incompatibles')
 }
 verifierExistant(existing)
 const {routeLecon,routeActivites}=await import(pathToFileURL(path.join(prototype,'serveur/lecon.mjs')).href)
 const capter=async(fn:any,id?:string)=>{let value:any; await fn({}, {writeHead(){},end(v:string){value=JSON.parse(v)}},id);return value}
 const activites=await capter(routeActivites)
 const base=await json(path.join(prototype,'data/niveau-1.json'))
 const pedagogie=await fs.readFile(path.join(contenu,'bible/PEDAGOGIE.md'),'utf8')
 const blocs=[...pedagogie.matchAll(/^### Bloc (\d) — « (.+?) »/gm)].map(x=>`Bloc ${x[1]} — ${x[2]}`)
 if(blocs.length!==6) throw Error('Les six titres de blocs sont introuvables')
 const sections=['Démarrer',...blocs,'Fiches de grammaire','Fiches de vocabulaire','Examens blancs et bilan']
 const {audio,medias}=await inventaire()
 const prepared=[]
 for(const id of ids){
  const fichiers:Record<string,any>={}
  for(const n of await fs.readdir(dossier(id))) if(/^[a-z0-9_-]+\.json$/.test(n)) fichiers[n]=await json(path.join(dossier(id),n))
  const bilan=fichiers['bilan-final.json']
  const plan=id==='BILAN'?{id:'BILAN',titre:{fr:'Bilan final'},duree_min:bilan.duree_travail_apprenant_min,sequences:[],ecran:'bilan-final'}:fichiers['lecon.json']
  if(!plan?.titre?.fr || !Number.isFinite(plan.duree_min)) throw Error(`${id}: titre.fr ou duree_min manquant`)
  const assemble=id==='BILAN'?{ok:true,lecon:{...plan,dossier:id},etapes:[],problemes:[]}:await capter(routeLecon,id)
  if(assemble.problemes.length || assemble.etapes.some((e:any)=>!e.disponible)) throw Error(`${id}: étapes non disponibles: ${JSON.stringify(assemble.problemes)}`)
  // Seuls les chemins d'infrastructure sont préfixés. Les scripts pédagogiques restent intacts.
  for(const e of assemble.etapes) if(e.module?.startsWith('/')) e.module='/anglais'+e.module
  const section=id==='EVAL'?0:/^U/.test(id)?1+Math.floor((Number(id.slice(1))-1)/4):/^T/.test(id)?Number(id.slice(1)):/^G/.test(id)?7:/^V/.test(id)?8:9
  const scenario:any={id,duree_min:plan.duree_min,fichiers,lecon:assemble,medias:medias[id]}
  if(id==='EVAL') scenario.commun={catalogue:base,activites,audio}
  const hash=createHash('sha256').update(JSON.stringify(scenario)).digest('hex')
  prepared.push({id,section,plan,scenario,hash})
 }
 if(prepared.length!==74) throw Error(`Attendu 74, obtenu ${prepared.length}`)
 console.log(JSON.stringify({mode:apply?'écriture':'essai à blanc',formation:existing[0]?.id||'à créer',sections:sections.length,chapitres:prepared.length,etapes:prepared.reduce((n,p)=>n+p.scenario.lecon.etapes.length,0),minutes:prepared.reduce((n,p)=>n+p.plan.duree_min,0),blancs:'non publiés'},null,2))
 if(!apply)return
 const formation=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('seed-anglais-niveau1'))`
  existing=await tx.formation.findMany({where:{title:titre,deletedAt:null},include:{sections:true,chapters:{include:{simulation:true}}}})
  verifierExistant(existing)
  const f=existing[0]||await tx.formation.create({data:{title:titre,description:'Anglais niveau 1 — A1/A2. Parcours adulte de 110 h : plateforme et accompagnement en visioconférence.',coverImageUrl:'/covers/atelier-anglais.svg',isPublished:false}})
  await tx.formation.update({where:{id:f.id},data:{coverImageUrl:'/covers/atelier-anglais.svg'}})
  for(let s=0;s<sections.length;s++){
   const prev=existing[0]?.sections.find(x=>x.order===s)
   const sec=prev?await tx.section.update({where:{id:prev.id},data:{title:sections[s]}}):await tx.section.create({data:{formationId:f.id,title:sections[s],order:s}})
   for(const [order,p] of prepared.filter(p=>p.section===s).entries()){
    const old=existing[0]?.chapters.find(c=>c.simulation?.app==='ANGLAIS' && (c.simulation.scenario as any)?.id===p.id)
    const data={title:p.plan.titre.fr,sectionId:sec.id,order,videoDuration:p.plan.duree_min*60,description:p.id==='BILAN'?'Bilan de parcours à relire avec votre formateur.':null, ...(/^EVAL-B/.test(p.id)?{isPublished:false}:{})}
    const ch=old?await tx.chapter.update({where:{id:old.id},data}):await tx.chapter.create({data:{...data,formationId:f.id,isPublished:false}})
    // PostgreSQL JSONB change l'ordre des clés : comparer après normalisation ci-dessous.
    const stable=(o:any):string=>JSON.stringify(o,(_k,v)=>v && !Array.isArray(v) && typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)
    if(!old?.simulation || stable(old.simulation.scenario)!==stable(p.scenario)) await tx.simulation.upsert({where:{chapterId:ch.id},create:{chapterId:ch.id,app:'ANGLAIS',mode:'LESSON',scenario:p.scenario,stepCount:p.scenario.lecon.etapes.length},update:{scenario:p.scenario,stepCount:p.scenario.lecon.etapes.length,version:{increment:1}}})
   }
  }
  return f
 },{timeout:110000})
 const relecture=await db.formation.findUniqueOrThrow({where:{id:formation.id},include:{sections:true,chapters:{include:{simulation:true}}}})
 if(relecture.isPublished || relecture.sections.length!==10 || relecture.chapters.length!==74 || relecture.chapters.some(c=>c.simulation?.app!=='ANGLAIS'||(/^EVAL-B/.test((c.simulation.scenario as any).id)&&c.isPublished))) throw Error('Relecture non conforme')
 console.log(`Relu : ${formation.id}, 10 sections, 74 chapitres ANGLAIS, brouillon, blancs fermés.`)
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect())
