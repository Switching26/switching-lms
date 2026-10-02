/** Contre-épreuves sans mutation ; doit être lancé sur une base locale déjà semée. */
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { planifierMiseAJour, mettreAJour, stable } from './mise-a-jour'
const url = new URL(process.env.DATABASE_URL || '')
if (url.hostname !== '127.0.0.1' || url.port !== '55432') throw Error('Base locale exclusivement')
const db = new PrismaClient()
async function main() {
  const original = await db.formation.findFirstOrThrow({ where: { chapters: { some: { simulation: { app: 'ANGLAIS' } } } },
    include: { sections: { orderBy: { order: 'asc' } }, chapters: { orderBy: { order: 'asc' }, include: { simulation: true } } } })
  const sections = original.sections.map(s => s.title)
  const prepared = original.sections.flatMap(s => original.chapters.filter(c => c.sectionId === s.id).map(c => {
    const scenario: any = c.simulation!.scenario
    return { id: scenario.id, section: s.order, plan: { titre: { fr: c.title }, duree_min: c.videoDuration! / 60 }, scenario }
  }))
  let tested = 0
  const verify = async (change: (f: any, p: any[]) => void, reject: boolean) => {
    const f = structuredClone(original), p = structuredClone(prepared)
    change(f, p)
    const fake: any = { formation: { findMany: async () => [f] }, enrollment: { findMany: async () => [{ id: 'fictif' }] },
      simulationAttempt: { findMany: async () => [] }, simulationRun: { findMany: async () => [] } }
    const call = () => planifierMiseAJour(fake, f.title, sections, p)
    if (reject) await assert.rejects(call); else await call()
    tested++
  }
  await verify(() => {}, false)
  await verify(f => { f.chapters[0].title += ' renommé' }, true)
  await verify(f => { f.chapters.pop() }, true)
  await verify(f => { f.chapters.push(structuredClone(f.chapters[0])) }, true)
  await verify(f => { f.sections[0].title += ' renommée' }, true)
  await verify(f => { f.chapters[0].order += 10 }, true)
  await verify(f => { f.chapters[0].videoDuration += 60 }, true)
  await verify((_, p) => { p[0].scenario.lecon.etapes.shift() }, true)
  await verify((_, p) => { p[0].scenario.lecon.etapes.reverse() }, true)
  await verify((_, p) => { p[0].scenario.lecon.etapes.push(p[0].scenario.lecon.etapes[0]) }, true)
  await verify(f => { f.chapters.find((c: any) => c.simulation.scenario.id === 'EVAL-B1').isPublished = true }, true)
  const before = await db.simulation.findMany({ orderBy: { id: 'asc' } })
  const log = console.log; console.log = () => {}
  try { await assert.rejects(() => mettreAJour(db, original.title, sections, prepared, true), /Empreinte/) }
  finally { console.log = log }
  assert.equal(stable(await db.simulation.findMany({ orderBy: { id: 'asc' } })), stable(before))
  console.log(`${++tested}/${tested} contre-épreuves : structure, états existants et essai à blanc obligatoire ; zéro mutation`)
}
main().catch(e => { console.error(e.message); process.exitCode = 1 }).finally(() => db.$disconnect())
