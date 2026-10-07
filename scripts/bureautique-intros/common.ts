import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { validIntroKey } from "../../lib/video/intro-keys"

export const APPS = {
  word: { app: "WORD", formationId: "cmsen0rtg0001x9hqgppbbqq9", modules: 19, lessons: 41 },
  powerpoint: { app: "POWERPOINT", formationId: "cmsen125j0001opavuj3tlc69", modules: 16, lessons: 64 },
  outlook: { app: "OUTLOOK", formationId: "cmsen1lis00016xxgaf6xtweu", modules: 16, lessons: 51 },
} as const
export type Application = keyof typeof APPS
export type Target = { id: string; introId: string; app: string; formationId: string; formationTitle: string;
  title: string; moduleNumber: number; sectionTitle: string; sectionId?: string; chapterId?: string; chapterOrder?: number; firstChapterId?: string }
export type ObjectEntry = { key: string; size: number; sha256: string }
export type Entry = Target & { durationSeconds: number; objects: ObjectEntry[] }
export type Inventory = { version: 1; application: Application; prefix: string; finalizedAt?: string; entries: Entry[] }
export function application(value: string): Application {
  if (!Object.hasOwn(APPS, value)) throw new Error("Application inconnue")
  return value as Application
}
export const prefixFor = (app: Application) => `introductions/${app}/2026-10-v1/`
export function validateTargets(targets: Target[], app: Application) {
  const spec = APPS[app], count = spec.modules + spec.lessons
  if (targets.length !== count || new Set(targets.map(t => t.id)).size !== count ||
      new Set(targets.map(t => t.introId)).size !== count ||
      new Set(targets.map(t => t.chapterId || t.sectionId)).size !== count ||
      targets.filter(t => t.chapterId).length !== spec.lessons || targets.filter(t => t.sectionId).length !== spec.modules) throw new Error("Cibles incomplètes ou en doublon")
  for (const t of targets) {
    const match = /^m(\d{2})-(intro|l\d{2})$/.exec(t.id)
    if (!match || Number(match[1]) !== t.moduleNumber || t.moduleNumber < 1 || t.moduleNumber > spec.modules ||
        t.introId !== `${app}-${t.id}` || t.app !== spec.app || t.formationId !== spec.formationId || !t.title || !t.sectionTitle || !t.formationTitle ||
        Boolean(t.chapterId) === Boolean(t.sectionId) ||
        (t.sectionId && (match[2] !== "intro" || t.title !== t.sectionTitle || !t.firstChapterId)) ||
        (t.chapterId && (match[2] === "intro" || t.chapterOrder !== 100 + Number(match[2].slice(1))))) throw new Error("Identité source incohérente")
  }
  const modules = targets.filter(t => t.sectionId)
  if (new Set(modules.map(t => t.moduleNumber)).size !== spec.modules || new Set(modules.map(t => t.firstChapterId)).size !== spec.modules) throw new Error("Modules incomplets")
  for (const module of modules) {
    const lessons = targets.filter(t => t.chapterId && t.moduleNumber === module.moduleNumber).sort((a, b) => a.chapterOrder! - b.chapterOrder!)
    if (!lessons.length || lessons[0].chapterId !== module.firstChapterId || lessons.some(t => t.sectionTitle !== module.title)) throw new Error("Première leçon incohérente")
  }
}
export function validateInventory(inventory: Inventory) {
  const app = application(inventory.application)
  if (inventory.version !== 1 || inventory.prefix !== prefixFor(app)) throw new Error("Préfixe inattendu")
  validateTargets(inventory.entries, app)
  for (const e of inventory.entries) {
    if (!Number.isFinite(e.durationSeconds) || e.durationSeconds <= 0 || e.durationSeconds > 300 || e.objects.length !== 2) throw new Error("Durée/objets invalides")
    for (const ext of ["mp4", "jpg"] as const) {
      const object = e.objects.find(o => o.key === `${inventory.prefix}${e.id}.${ext}`)
      if (!object || !validIntroKey(object.key, ext === "mp4" ? "video" : "poster", APPS[app].app) ||
          !Number.isSafeInteger(object.size) || object.size <= 0 || !/^[a-f0-9]{64}$/.test(object.sha256)) throw new Error("Objet invalide")
    }
  }
  return inventory
}
export async function readInventory(path: string) {
  return validateInventory(JSON.parse(await readFile(path, "utf8")))
}
export async function verifyBackupProof(production: boolean) {
  const proof = JSON.parse(await readFile(process.env.INTRO_BACKUP_VERIFIED || "", "utf8"))
  if (!proof.dumpPath || !Number.isSafeInteger(proof.dumpBytes) || proof.dumpBytes < 10000 || !/^[a-f0-9]{64}$/.test(proof.sha256)) throw new Error("Preuve de sauvegarde invalide")
  const bytes = await readFile(proof.dumpPath)
  if (bytes.length !== proof.dumpBytes || createHash("sha256").update(bytes).digest("hex") !== proof.sha256) throw new Error("Sauvegarde altérée")
  if (production) {
    const age = Date.now() - Date.parse(proof.verifiedAt)
    if (proof.purpose !== "before-bureautique-intros" || !Number.isFinite(age) || age < 0 || age > 3600000 || proof.compressionVerified !== true) throw new Error("Sauvegarde production fraîche et contrôlée exigée")
  } else if (proof.restore !== "PASS") throw new Error("Restauration locale vérifiée exigée")
}
export function localDatabaseOnly() {
  const url = new URL(process.env.DATABASE_URL || "")
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lms_bureautique_intros_test_20261007") throw new Error("Base locale jetable exigée")
}
