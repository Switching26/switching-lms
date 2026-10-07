import { readFile, writeFile, readdir, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { APPS, application, prefixFor, validateTargets, validateInventory, type Target, type Entry } from "./common"

async function main() {
  const [appArg, source, targetsPath, output, flag] = process.argv.slice(2)
  const app = application(appArg)
  if (!source || !targetsPath || !output || flag !== "--renders-finalized") throw new Error("Attendre la fin et la validation des rendus : inventory.ts app rendus cibles.json inventaire.json --renders-finalized")
  const targets: Target[] = JSON.parse(await readFile(targetsPath, "utf8"))
  const selected = targets.filter(t => t.app === APPS[app].app)
  validateTargets(selected, app)
  const files = await readdir(source)
  const expected = selected.flatMap(t => [`${t.id}.mp4`, `${t.id}.jpg`]).sort()
  // Bancs de validation produits par l'équipe : jamais des cibles LMS.
  const benches = new Set(["banc-l.mp4", "banc-l.jpg", "banc-m.mp4", "banc-m.jpg"])
  // Images de contre-contrôle livrées par les agents PowerPoint, sans cible LMS.
  if (app === "powerpoint") {
    benches.add("m08-l03-projection-corrigee.jpg")
    benches.add("m09-l01-controle-bulle.jpg")
  }
  const actual = files.filter(f => /\.(mp4|jpg)$/.test(f) && !benches.has(f)).sort()
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Médias manquants ou supplémentaires")
  const entries: Entry[] = []
  const deadline = Date.now() + 270000
  for (const target of selected) {
    if (Date.now() > deadline - 12000) throw new Error("Inventaire interrompu avant cinq minutes : relancer")
    const videoPath = resolve(source, `${target.id}.mp4`)
    const beforeVideo = await stat(videoPath)
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", videoPath], { encoding: "utf8", timeout: 10000 }))
    const v = probe.streams.find((s: any) => s.codec_type === "video"), a = probe.streams.find((s: any) => s.codec_type === "audio")
    const durationSeconds = Number(probe.format.duration)
    if (v?.codec_name !== "h264" || v.width !== 1920 || v.height !== 1080 || a?.codec_name !== "aac") throw new Error("Format MP4 non conforme")
    const objects = []
    for (const extension of ["mp4", "jpg"]) {
      const file = resolve(source, `${target.id}.${extension}`), before = await stat(file), bytes = await readFile(file), after = await stat(file)
      if (before.mtimeMs !== after.mtimeMs || before.size !== after.size || bytes.length !== before.size ||
          (extension === "mp4" && (beforeVideo.mtimeMs !== after.mtimeMs || beforeVideo.size !== after.size))) throw new Error("Rendu modifié pendant l'inventaire")
      if (extension === "jpg" && !(bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217)) throw new Error("Vignette JPEG invalide")
      objects.push({ key: `${prefixFor(app)}${target.id}.${extension}`, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
    }
    entries.push({ ...target, durationSeconds, objects })
  }
  const inventory = validateInventory({ version: 1, application: app, prefix: prefixFor(app), finalizedAt: new Date().toISOString(), entries })
  await writeFile(output, JSON.stringify(inventory, null, 2) + "\n")
  console.log(`${app} : ${entries.length} vidéos, ${entries.length * 2} objets inventoriés`)
}
main().catch(() => { console.error("Inventaire refusé : contrôler fin de fabrication, cibles et médias"); process.exitCode = 1 })
