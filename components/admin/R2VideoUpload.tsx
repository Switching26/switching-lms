"use client"

import { useEffect, useRef, useState } from "react"
import HlsVideoPlayer from "@/components/learner/HlsVideoPlayer"

type Job = { id: string; status: string; hlsKey: string | null; duration: number | null; error: string | null }
export default function R2VideoUpload({ chapterId, videoR2Key, hasVimeo, onUpdate }: {
  chapterId: string; videoR2Key?: string | null; hasVimeo: boolean
  onUpdate: (updates: { videoR2Key: string | null; videoDuration?: number }) => void
}) {
  const [job, setJob] = useState<Job | null>(null)
  const [activeKey, setActiveKey] = useState(videoR2Key)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const poll = async () => {
      try {
        const response = await fetch(`/api/upload/video/r2?chapterId=${encodeURIComponent(chapterId)}`, { cache: "no-store" })
        if (response.ok && mounted.current) {
          const data = await response.json()
          setJob(data)
          if (data) setActiveKey(data.activeKey)
        }
      } catch {}
    }
    void poll()
    const timer = setInterval(poll, 4000)
    return () => { mounted.current = false; clearInterval(timer); abort.current?.abort() }
  }, [chapterId])

  async function api(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/upload/video/r2/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Échec du dépôt")
    return data
  }
  async function upload(file: File) {
    if (progress !== null) return
    if ((!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) || file.size > 5 * 1024 ** 3) { setError("Choisissez une vidéo de 5 Go maximum."); return }
    setError("")
    setProgress(0)
    const controller = new AbortController()
    abort.current = controller
    let id = ""
    try {
      const response = await fetch("/api/upload/video/r2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId, fileName: file.name, fileSize: file.size }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Échec du dépôt")
      id = data.id
      setJob({ id, status: "UPLOADING", hlsKey: null, duration: null, error: null })
      const count = Math.ceil(file.size / data.partSize)
      for (let part = 1; part <= count; part++) {
        let sent = false
        for (let attempt = 0; attempt < 3 && !sent; attempt++) {
          controller.signal.throwIfAborted()
          try {
            const { url } = await api(id, { action: "part", partNumber: part })
            const put = await fetch(url, { method: "PUT", body: file.slice((part - 1) * data.partSize, part * data.partSize), signal: controller.signal })
            if (!put.ok) throw new Error("Stockage vidéo indisponible")
            sent = true
          } catch (failure) { if (attempt === 2 || controller.signal.aborted) throw failure }
        }
        if (mounted.current) setProgress(Math.round(part / count * 100))
      }
      await api(id, { action: "complete" })
      if (mounted.current) setJob({ id, status: "QUEUED", hlsKey: null, duration: null, error: null })
    } catch (failure) {
      if (id) void api(id, { action: "cancel" }).catch(() => {})
      if (mounted.current) setError(controller.signal.aborted ? "Dépôt annulé." : failure instanceof Error ? failure.message : "Échec du dépôt")
    } finally { if (mounted.current) setProgress(null); abort.current = null }
  }
  const pending = progress !== null || job?.status === "QUEUED" || job?.status === "PROCESSING"
  return <div className="space-y-3 rounded-xl border border-border p-4">
    <h3 className="text-sm font-semibold">Vidéo hébergée dans le LMS</h3>
    {videoR2Key && videoR2Key === activeKey && <div className="aspect-video"><HlsVideoPlayer chapterId={chapterId} lastPosition={0} preview /></div>}
    {videoR2Key && videoR2Key !== activeKey && <p className="text-sm text-gray-600">Enregistrez le chapitre pour activer la nouvelle vidéo.</p>}
    <input ref={input} type="file" accept="video/*,.mkv" className="hidden" aria-label="Déposer une vidéo dans le LMS" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = "" }} />
    {!pending && <button type="button" onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) void upload(file) }}
      className={`w-full rounded-lg border-2 border-dashed p-5 text-sm ${dragging ? "border-primary bg-gray-50" : "border-border"}`}>{videoR2Key ? "Remplacer la vidéo" : "Déposer ou choisir une vidéo"} · 5 Go maximum</button>}
    {progress !== null && <div><p className="text-sm">Dépôt : {progress} %</p><progress max={100} value={progress} className="w-full" /><button type="button" className="text-xs text-red-600" onClick={() => abort.current?.abort()}>Annuler le dépôt</button></div>}
    {job?.status === "QUEUED" && <p role="status" className="text-sm text-gray-600">Vidéo déposée. En attente de conversion.</p>}
    {job?.status === "PROCESSING" && <p role="status" className="text-sm text-gray-600">Conversion en cours. Vous pouvez quitter cette page.</p>}
    {job?.status === "FAILED" && <p role="alert" className="text-sm text-red-600">{job.error}</p>}
    {job?.status === "READY" && job.hlsKey !== videoR2Key && <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm text-white" onClick={() => onUpdate({ videoR2Key: job.hlsKey, videoDuration: job.duration || 0 })}>Utiliser la vidéo prête, puis enregistrer le chapitre</button>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {videoR2Key && <button type="button" className="text-xs text-gray-600 underline" onClick={() => onUpdate({ videoR2Key: null })}>{hasVimeo ? "Revenir à la vidéo Vimeo, puis enregistrer" : "Retirer cette vidéo, puis enregistrer"}</button>}
  </div>
}
