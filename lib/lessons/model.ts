export type LessonKind = 'video' | 'evaluation' | 'document' | 'atelier' | 'exercice' | 'anglais' | 'test' | 'fiche' | 'texte'
export type LessonMetadata = { lessonKind?: LessonKind; searchTheme?: string; sectionId?: string | null; formationTitle?: string; formationMinutes?: number | null }
export type LessonEntry = { id: string; titre: string; module: string | null; termine: boolean; secondes?: number } & LessonMetadata
/** Classification du sommaire seulement : ne change jamais le lecteur choisi. */
export function lessonKind(c: { simulation?: { app?: string; mode: string } | null; lessonKind?: LessonKind; videoR2Key?: string | null; exercises?: unknown[]; attachments?: unknown[] }): LessonKind {
  if(c.lessonKind)return c.lessonKind
  if(c.simulation?.app==='ANGLAIS')return 'anglais'
  if(c.simulation)return c.simulation.mode==='EVALUATION'?'evaluation':c.simulation.mode==='EXERCISE'?'exercice':'atelier'
  return c.videoR2Key?'video':c.exercises?.length?'evaluation':c.attachments?.length?'document':'texte'
}
