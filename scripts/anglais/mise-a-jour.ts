/** Mise à jour atomique des scénarios, sans mutation de la structure pédagogique. */
import { createHash } from 'node:crypto'
import type { PrismaClient, Prisma } from '@prisma/client'

export const stable = (value: any): string => JSON.stringify(value, (_k, v) =>
  v && !Array.isArray(v) && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
const hash = (value: any) => createHash('sha256').update(stable(value)).digest('hex')
type Prepared = { id: string, section: number, plan: any, scenario: any }
type DB = PrismaClient | Prisma.TransactionClient
const include = { sections: { orderBy: { id: 'asc' } }, chapters: { orderBy: { id: 'asc' }, include: { simulation: true } } } as const
const references = (value: any, result = new Set<string>()): Set<string> => {
  if (typeof value === 'string' && /\.(mp3|mp4|png|jpg|webp|svg|vtt)$/.test(value)) result.add(value)
  else if (Array.isArray(value)) value.forEach(v => references(v, result))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => references(v, result))
  return result
}

export async function planifierMiseAJour(db: DB, title: string, sections: string[], prepared: Prepared[]) {
  const formations = await db.formation.findMany({ where: { title, deletedAt: null }, include })
  if (formations.length !== 1) throw Error('Mise à jour : une formation existante unique est obligatoire')
  const f = formations[0]
  if (f.sections.length !== sections.length || f.chapters.length !== prepared.length || prepared.length !== 74)
    throw Error('Mise à jour : création ou suppression de section/chapitre refusée')
  const secIds = new Map<number, string>()
  sections.forEach((title, order) => {
    const matches = f.sections.filter(s => s.title === title && s.order === order)
    if (matches.length !== 1) throw Error(`Section renommée, déplacée ou dupliquée : ${title}`)
    secIds.set(order, matches[0].id)
  })
  const inscriptions = await db.enrollment.findMany({ where: { formationId: f.id }, orderBy: { id: 'asc' } })
  const simulations = f.chapters.map(c => c.simulation?.id).filter(Boolean) as string[]
  const tentatives = await db.simulationAttempt.findMany({ where: { simulationId: { in: simulations } }, orderBy: { id: 'asc' } })
  const passages = await db.simulationRun.findMany({ where: { simulationId: { in: simulations } }, orderBy: { id: 'asc' } })
  const hasStates = inscriptions.length > 0 || tentatives.length > 0 || passages.length > 0
  const used = new Set<string>()
  const modifications = prepared.map(p => {
    const matches = f.chapters.filter(c => c.title === p.plan.titre.fr && c.sectionId === secIds.get(p.section))
    if (matches.length !== 1) throw Error(`${p.id} : chapitre créé, renommé ou dupliqué ; arrêt`)
    const chapter = matches[0], simulation = chapter.simulation
    const old: any = simulation?.scenario
    if (!simulation || simulation.app !== 'ANGLAIS' || old?.id !== p.id || used.has(chapter.id))
      throw Error(`${p.id} : identité du chapitre incompatible`)
    used.add(chapter.id)
    const order = prepared.filter(x => x.section === p.section).findIndex(x => x.id === p.id)
    if (chapter.order !== order || chapter.videoDuration !== p.plan.duree_min * 60 || old.duree_min !== p.plan.duree_min)
      throw Error(`${p.id} : ordre ou durée modifiés ; arrêt`)
    if (/^EVAL-B/.test(p.id) && chapter.isPublished) throw Error(`${p.id} : examen blanc ouvert ; arrêt`)
    const before: string[] = old.lecon.etapes.map((e: any) => e.id)
    const after: string[] = p.scenario.lecon.etapes.map((e: any) => e.id)
    if (after.some(id => typeof id !== 'string') || new Set(after).size !== after.length)
      throw Error(`${p.id} : identifiants d'étapes invalides ou dupliqués`)
    const removed = before.filter(id => !after.includes(id))
    const preservedOrder = after.filter(id => before.includes(id))
    const compatible = !removed.length && stable(before) === stable(preservedOrder)
    if (hasStates && !compatible) throw Error(`${p.id} : états apprenants incompatibles (étapes retirées ou déplacées)`)
    const previousMedia = references(old)
    return { chapter, simulation, prepared: p, changed: stable(old) !== stable(p.scenario),
      rapport: { id: p.id, titre: chapter.title, change: stable(old) !== stable(p.scenario),
        etapesAvant: before.length, etapesApres: after.length, etapesRetirees: removed,
        anciensIdentifiantsEtOrdreConserves: compatible,
        mediasAjoutes: [...references(p.scenario)].filter(x => !previousMedia.has(x)).sort() } }
  })
  // Le jeton lie l'essai à blanc aux données relues, aux apprenants et au nouveau contenu.
  const empreinte = hash({ formation: f, inscriptions, tentatives, passages, nouveaux: prepared.map(p => p.scenario) })
  return { formation: f, modifications, empreinte, rapport: { formationId: f.id,
    inscriptions: inscriptions.length, tentatives: tentatives.length, passages: passages.length,
    etatsLisibles: modifications.every(m => m.rapport.anciensIdentifiantsEtOrdreConserves),
    empreinte, chapitres: modifications.map(m => m.rapport) } }
}

export async function mettreAJour(db: PrismaClient, title: string, sections: string[], prepared: Prepared[], apply: boolean) {
  const before = await planifierMiseAJour(db, title, sections, prepared)
  console.log(JSON.stringify({ mode: apply ? 'mise à jour' : 'essai à blanc mise à jour', ...before.rapport }, null, 2))
  if (!apply) return
  const expected = process.argv[process.argv.indexOf('--expect') + 1]
  if (!process.argv.includes('--expect') || expected !== before.empreinte)
    throw Error('Empreinte --expect de l’essai à blanc obligatoire et identique')
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('seed-anglais-niveau1'))`
    const current = await planifierMiseAJour(tx, title, sections, prepared)
    if (current.empreinte !== expected) throw Error('Données modifiées depuis l’essai à blanc : arrêt sans écriture')
    for (const m of current.modifications) if (m.changed) {
      await tx.simulation.update({ where: { id: m.simulation.id }, data: {
        scenario: m.prepared.scenario, stepCount: m.prepared.scenario.lecon.etapes.length, version: { increment: 1 }
      } })
    }
    const after = await tx.formation.findUniqueOrThrow({ where: { id: current.formation.id }, include })
    const sansScenarios = (f: typeof after) => ({ ...f, chapters: f.chapters.map(({ simulation, ...c }) => c) })
    if (stable(sansScenarios(after)) !== stable(sansScenarios(current.formation)))
      throw Error('Structure modifiée : annulation de la transaction')
    for (const m of current.modifications) {
      const s = after.chapters.find(c => c.id === m.chapter.id)!.simulation!
      if (stable(s.scenario) !== stable(m.prepared.scenario) || s.stepCount !== m.prepared.scenario.lecon.etapes.length)
        throw Error(`${m.prepared.id} : relecture différente ; annulation`)
    }
  }, { isolationLevel: 'Serializable', timeout: 110000 })
  console.log(JSON.stringify({ ok: true, formationId: before.formation.id,
    scenariosModifies: before.modifications.filter(m => m.changed).length, structureEtPublicationConservees: true }))
}
