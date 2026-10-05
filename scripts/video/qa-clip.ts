import { run } from "./transcode"
async function main() {
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "smptebars=size=1920x1080:rate=30:duration=42", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=42",
    "-c:v", "libx264", "-threads", "2", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-shortest", ".local/qa-video.mp4"])
  console.log("Vidéo QA créée : 42 s, 1920×1080, audio AAC")
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
