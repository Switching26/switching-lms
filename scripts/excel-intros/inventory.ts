import { readFile, writeFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

async function main() {
  const [source, targetsPath, output] = process.argv.slice(2)
  if (!source || !targetsPath || !output) throw new Error("Usage: inventory.ts sources correspondances.json inventaire.json")
  const targets = JSON.parse(await readFile(targetsPath, "utf8")) as Array<Record<string, any>>
  if (targets.length !== 150 || new Set(targets.map(t => t.id)).size !== 150) throw new Error("150 cibles uniques requises")
  const files = await readdir(source)
  if (files.filter(f => f.endsWith(".mp4")).length !== 150 || files.filter(f => f.endsWith(".jpg")).length !== 150) throw new Error("150 vidéos et 150 vignettes requises")
  const entries = []
  for (const target of targets) {
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", resolve(source, `${target.id}.mp4`)], { encoding: "utf8", timeout: 10000 }))
    const v = probe.streams.find((s: any) => s.codec_type === "video")
    const a = probe.streams.find((s: any) => s.codec_type === "audio")
    const durationSeconds = Number(probe.format.duration)
    if (v?.codec_name !== "h264" || v.width !== 1920 || v.height !== 1080 || a?.codec_name !== "aac" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error(`Format non conforme : ${target.id}`)
    const objects = []
    for (const extension of ["mp4", "jpg"]) {
      const file = `${target.id}.${extension}`
      const bytes = await readFile(resolve(source, file))
      objects.push({ key: `introductions/excel/2026-10-v1/${file}`, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
    }
    entries.push({ ...target, durationSeconds, objects })
  }
  await writeFile(output, JSON.stringify({ version: 1, prefix: "introductions/excel/2026-10-v1/", entries }, null, 2) + "\n")
  console.log(`Inventaire : ${entries.length} vidéos, 300 objets, ${(entries.reduce((n, e) => n + e.durationSeconds, 0) / 60).toFixed(1)} min, ${entries.flatMap(e => e.objects).reduce((n, o) => n + o.size, 0)} octets`)
}
main().catch(() => { console.error("Inventaire refusé ; contrôler les cibles et les médias"); process.exitCode = 1 })
