import { spawn } from "node:child_process"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { hlsReferences, resolveHlsReference } from "../../lib/video/hls"

export async function run(command: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { signal, stdio: ["ignore", "pipe", "pipe"] })
    let output = ""
    let errors = ""
    child.stdout.on("data", chunk => { output = (output + chunk).slice(-1024 * 1024) })
    child.stderr.on("data", chunk => { errors = (errors + chunk).slice(-16384) })
    child.on("error", reject)
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error(`${command} a échoué (${code}) : ${errors}`)))
  })
}

export async function convertHls(source: string, output: string, signal?: AbortSignal) {
  const probe = JSON.parse(await run(process.env.FFPROBE_BIN || "ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", source], signal))
  const stream = probe.streams.find((s: any) => s.codec_type === "video")
  const duration = Number(probe.format.duration)
  if (!stream || !Number.isFinite(duration) || duration <= 0 || duration > 12 * 3600) throw new Error("Vidéo invalide ou supérieure à 12 heures")
  await mkdir(output, { recursive: true })
  const variants = [{ height: 1080, width: 1920, bitrate: 2500 }, { height: 720, width: 1280, bitrate: 1400 }, { height: 480, width: 854, bitrate: 700 }]
  const master = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"]
  for (const variant of variants) {
    const dir = path.join(output, String(variant.height))
    await mkdir(dir, { recursive: true })
    await run(process.env.FFMPEG_BIN || "ffmpeg", ["-hide_banner", "-loglevel", "warning", "-nostdin", "-y", "-threads", "2", "-i", source,
      "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-vf", `scale=w='min(${variant.width},iw)':h='min(${variant.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
      "-filter_threads", "1", "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "23",
      "-maxrate", `${variant.bitrate}k`, "-bufsize", `${variant.bitrate * 2}k`, "-r", "30", "-g", "180", "-sc_threshold", "0", "-force_key_frames", "expr:gte(t,n_forced*6)",
      "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
      "-hls_segment_filename", path.join(dir, "segment_%06d.ts"), path.join(dir, "index.m3u8")], signal)
    const dimensions = JSON.parse(await run(process.env.FFPROBE_BIN || "ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", path.join(dir, "index.m3u8")], signal)).streams[0]
    master.push(`#EXT-X-STREAM-INF:BANDWIDTH=${(variant.bitrate + 96) * 1100},RESOLUTION=${dimensions.width}x${dimensions.height}`, `${variant.height}/index.m3u8`)
  }
  await writeFile(path.join(output, "master.m3u8"), master.join("\n") + "\n")
  await validateLocalPackage(output)
  return Math.ceil(duration)
}

/** Reject symlinks, missing segments, traversal and external playlist URIs. */
export async function validateLocalPackage(root: string) {
  const files: string[] = []
  async function list(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Lien symbolique interdit dans HLS")
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) await list(file)
      else if (entry.isFile()) {
        const relative = path.relative(root, file).split(path.sep).join("/")
        // Sidecar emitted by the backup mission: never uploaded or served.
        if (relative !== "verification.json") files.push(relative)
      }
      else throw new Error("Fichier HLS invalide")
    }
  }
  await list(root)
  const master = "videos/validation/master.m3u8"
  if (!files.includes("master.m3u8")) throw new Error("master.m3u8 manquant")
  const known = new Set(files)
  for (const file of files) {
    if (!/^[a-zA-Z0-9_./-]+\.(m3u8|ts|m4s|mp4|aac|key)$/.test(file)) throw new Error(`Fichier HLS inattendu : ${file}`)
    if (file.endsWith(".m3u8")) {
      const text = await readFile(path.join(root, file), "utf8")
      const refs = hlsReferences(text)
      if (!refs.length) throw new Error("Playlist vide")
      for (const ref of refs) {
        const key = resolveHlsReference(master, `videos/validation/${file}`, ref).slice("videos/validation/".length)
        if (!known.has(key)) throw new Error(`Segment manquant : ${key}`)
      }
      if (!text.includes("#EXT-X-STREAM-INF") && !text.includes("#EXT-X-ENDLIST")) throw new Error("Seules les vidéos HLS terminées sont acceptées")
    }
  }
  const sizes = await Promise.all(files.map(async file => (await stat(path.join(root, file))).size))
  return { files: files.sort((a, b) => Number(a.endsWith(".m3u8")) - Number(b.endsWith(".m3u8"))), bytes: sizes.reduce((a, b) => a + b, 0) }
}
