import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import taxonomy from '@/anglais-lecteur/data/niveau-1.json'
import type { LessonKind } from './model'
const themes = new Map([...taxonomy.grammaire, ...taxonomy.vocabulaire].map(x => [x.id[0].toUpperCase()+x.id.slice(1).padStart(2,'0'),x.titre]))
/** La DB extrait uniquement l'identifiant public, jamais le JSON du scénario. */
export async function withPublicEnglishThemes<T extends {id: string; simulation?: {app: string} | null}>(chapters: T[]): Promise<(T & {lessonKind?: LessonKind; searchTheme?: string})[]> {
  const ids = chapters.filter(c=>c.simulation?.app==='ANGLAIS').map(c=>c.id)
  if(!ids.length)return chapters
  const rows = await prisma.$queryRaw<{chapterId:string; semanticId:string | null}[]>(Prisma.sql`SELECT "chapterId", scenario->>'id' AS "semanticId" FROM "Simulation" WHERE app='ANGLAIS' AND "chapterId" IN (${Prisma.join(ids)})`)
  const byId=new Map(rows.map(r=>[r.chapterId,r.semanticId||'']))
  return chapters.map(c=>{
    if(!byId.has(c.id))return c
    const id=byId.get(c.id)!
    const kind: LessonKind=/^[GV]/.test(id)?'fiche':/^T/.test(id)?'test':['EVAL','BILAN'].includes(id)?'evaluation':'anglais'
    return {...c,lessonKind:kind,searchTheme:themes.get(id)||''}
  })
}
