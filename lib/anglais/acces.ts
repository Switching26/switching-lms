import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
export class RefusAnglais extends Error { constructor(public status:number,message:string){super(message)} }
export function identifiant(raw:string) {
 const id=raw.replace(/\.json$/,'').toUpperCase().replace(/^L0?1$/,'U01').replace(/^BLANC([12])$/,'EVAL-B$1')
 if(!/^(U(?:0[1-9]|1[0-9]|2[0-4])|T[1-6]|[GV](?:0[1-9]|1[0-9]|20)|EVAL(?:-B[12])?|BILAN)$/.test(id)) throw new RefusAnglais(404,'Chapitre inconnu')
 return id
}
export async function acces(id?:string,chapterId?:string) {
 const session=await auth();if(!session?.user)throw new RefusAnglais(401,'Session requise')
 const admin=session.user.role==='SUPER_ADMIN';const now=new Date()
 const formations=await prisma.formation.findMany({where:{deletedAt:null,chapters:{some:{simulation:{app:'ANGLAIS'}}},...(admin?{}:{isPublished:true,enrollments:{some:{userId:session.user.id,startedAt:{lte:now},OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}})},select:{id:true}})
 if(!formations.length)throw new RefusAnglais(403,'Inscription active requise')
 let simulation=null
 if(id||chapterId){
  simulation=await prisma.simulation.findFirst({where:{app:'ANGLAIS',...(chapterId?{chapterId}:{scenario:{path:['id'],equals:identifiant(id!)}}),chapter:{formationId:{in:formations.map(f=>f.id)},...(admin?{}:{isPublished:true})}},include:{chapter:true}})
  if(!simulation)throw new RefusAnglais(403,'Chapitre non accessible')
 }
 return {session,admin,formations,simulation}
}
