/** Strictement local : comptes fictifs et publication dans la base jetable uniquement. */
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import fs from 'node:fs/promises'
const db=new PrismaClient()
async function main(){
 const url=new URL(process.env.DATABASE_URL||'')
 if(url.hostname!=='127.0.0.1'||url.port!=='55432'||url.pathname!=='/anglais')throw Error('Base locale jetable 127.0.0.1:55432/anglais obligatoire')
 const password='Anglais-Recette-2026!';const hashed=await hash(password,10)
 const partner=await db.partner.upsert({where:{slug:'anglais-local'},create:{slug:'anglais-local',name:'Switching Formation',isInternal:true,primaryColor:'#278d91'},update:{}})
 const users=[]
 for(const [email,role,firstName] of [['admin-anglais@example.invalid','SUPER_ADMIN','Admin'],['apprenant-anglais@example.invalid','LEARNER','Camille'],['sans-inscription@example.invalid','LEARNER','Sans inscription']] as const){
  users.push(await db.user.upsert({where:{email},create:{email,password:hashed,role,firstName,lastName:'Recette',partnerId:partner.id},update:{password:hashed}}))
 }
 const f=await db.formation.findFirstOrThrow({where:{title:'Anglais niveau 1',deletedAt:null},include:{chapters:{include:{simulation:true}}}})
 await db.formation.update({where:{id:f.id},data:{isPublished:true}})
 for(const c of f.chapters)await db.chapter.update({where:{id:c.id},data:{isPublished:!/^EVAL-B/.test((c.simulation?.scenario as any)?.id)}})
 await db.enrollment.upsert({where:{userId_formationId:{userId:users[1].id,formationId:f.id}},create:{userId:users[1].id,formationId:f.id,startedAt:new Date('2026-01-01'),expiresAt:new Date('2027-12-31')},update:{}})
 const report={formationId:f.id,admin:users[0].email,apprenant:users[1].email,sansInscription:users[2].email,password,chapitres:Object.fromEntries(f.chapters.map(c=>[(c.simulation?.scenario as any)?.id,c.id]))}
 await fs.mkdir('.local',{recursive:true});await fs.writeFile('.local/comptes.json',JSON.stringify(report,null,2),{mode:0o600})
 console.log(`Recette locale prête : formation ${f.id}, 72 chapitres ouverts et 2 blancs fermés. Comptes dans .local/comptes.json.`)
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect())
