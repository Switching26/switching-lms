"use client"

import { useEffect, useRef, useState } from "react"
import type Hls from "hls.js"

export default function HlsVideoPlayer({ chapterId, lastPosition, preview, onCompleted, onWatchProgress, takePendingSeconds }: {
  chapterId: string
  lastPosition: number
  preview: boolean
  onCompleted?: (chapterId: string) => void
  onWatchProgress?: (chapterId: string, watchedSeconds: number) => void
  takePendingSeconds?: () => number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const retryPosition = useRef<number | null>(null)
  const callbacks = useRef({ onCompleted, onWatchProgress, takePendingSeconds })
  callbacks.current = { onCompleted, onWatchProgress, takePendingSeconds }
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: Hls | undefined
    let disposed = false
    let ended = false
    let watched = 0
    let previous = -1
    let position = retryPosition.current ?? lastPosition
    const initialPosition = position
    retryPosition.current = null
    let resumePlaying = false
    let recoveryCount = 0
    let lastRecovery = 0
    setError("")
    const source = () => `/api/videos/${encodeURIComponent(chapterId)}/playlist?${preview ? "preview=1&" : ""}renew=${Date.now()}`
    const save = async (complete = false, keepalive = false) => {
      if (preview) return
      const body: { lastPosition: number; completedAt?: string; timeDeltaSeconds?: number } = { lastPosition: complete ? 0 : Math.floor(video.currentTime || 0) }
      if (complete) {
        body.completedAt = new Date().toISOString()
        const pending = callbacks.current.takePendingSeconds?.() || 0
        if (pending >= 1) body.timeDeltaSeconds = pending
      }
      try {
        const result = await fetch(`/api/progress/${chapterId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive })
        if (complete && result.ok && !disposed) callbacks.current.onCompleted?.(chapterId)
      } catch { /* Next heartbeat or page exit retries position. */ }
    }
    const metadata = () => {
      if (position > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position, Math.max(0, video.duration - 0.1))
      position = 0
      retryPosition.current = null
      if (resumePlaying) void video.play().catch(() => {})
    }
    const timeupdate = () => {
      const current = video.currentTime
      const delta = current - previous
      if (previous >= 0 && delta > 0 && delta <= 2 && !video.seeking) {
        watched += delta
        callbacks.current.onWatchProgress?.(chapterId, watched)
      }
      previous = current
    }
    const seeked = () => { previous = video.currentTime }
    const onEnded = () => { if (!ended) { ended = true; void save(true) } }
    const pagehide = () => { if (!ended && video.currentTime > 0) void save(false, true) }
    const recover = () => {
      if (disposed) return
      if (Date.now() - lastRecovery < 10000) { setError("Vidéo temporairement indisponible. Rechargez la vidéo."); return }
      lastRecovery = Date.now()
      if (++recoveryCount > 3) { setError("Lecture interrompue. Vérifiez votre connexion ou rechargez la vidéo."); return }
      position = video.currentTime
      retryPosition.current = position
      resumePlaying = !video.paused
      if (hls) hls.loadSource(source())
      else { video.src = source(); video.load() }
    }
    const nativeError = () => {
      if (video.error?.code === 3 || video.error?.code === 4) setError("Lecture impossible. Rechargez la vidéo.")
      else recover()
    }
    async function start() {
      if (!video) return
      // Native on Safari/iOS; hls.js keeps adaptive playback consistent on
      // Chromium desktops, including those reporting native support as "maybe".
      const native = Boolean(video.canPlayType("application/vnd.apple.mpegurl"))
      const preferNative = /iPhone|iPad|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
        || (/Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent))
      if (native && preferNative) {
        video.src = source()
        video.addEventListener("error", nativeError)
      } else {
        const { default: HlsClass } = await import("hls.js")
        if (disposed) return
        if (!HlsClass.isSupported()) {
          if (native) { video.src = source(); video.addEventListener("error", nativeError) }
          else setError("Ce navigateur ne prend pas en charge la lecture vidéo.")
          return
        }
        hls = new HlsClass({ maxBufferLength: 30, startPosition: initialPosition > 0 ? initialPosition : -1 })
        hls.on(HlsClass.Events.ERROR, (_, data) => {
          if (data.fatal) {
            if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) recover()
            else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR && recoveryCount++ < 3) hls?.recoverMediaError()
            else setError("Lecture impossible. Rechargez la vidéo.")
          }
        })
        hls.on(HlsClass.Events.MANIFEST_PARSED, () => { if (resumePlaying) void video.play().catch(() => {}) })
        hls.attachMedia(video)
        hls.loadSource(source())
      }
    }
    video.addEventListener("loadedmetadata", metadata)
    video.addEventListener("timeupdate", timeupdate)
    video.addEventListener("seeked", seeked)
    video.addEventListener("ended", onEnded)
    window.addEventListener("pagehide", pagehide)
    void start().catch(() => { if (!disposed) setError("Vidéo temporairement indisponible.") })
    const progress = setInterval(() => { if (!ended && video.currentTime > 0) void save() }, 30000)
    // Renew before the 3-hour segment links expire, keeping position and pause state.
    const renewal = setInterval(() => { recoveryCount = 0; recover() }, 150 * 60 * 1000)
    return () => {
      disposed = true
      pagehide()
      clearInterval(progress)
      clearInterval(renewal)
      window.removeEventListener("pagehide", pagehide)
      video.removeEventListener("loadedmetadata", metadata)
      video.removeEventListener("timeupdate", timeupdate)
      video.removeEventListener("seeked", seeked)
      video.removeEventListener("ended", onEnded)
      video.removeEventListener("error", nativeError)
      hls?.destroy()
      video.pause()
      video.removeAttribute("src")
      video.load()
    }
  }, [chapterId, lastPosition, preview, retry])

  return (
    <div className="relative aspect-video max-h-full max-w-full overflow-hidden rounded-[14px] bg-primary shadow-lg h-auto w-full min-[901px]:h-full min-[901px]:w-auto"
      style={{ boxShadow: "0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)" }}>
      <video ref={videoRef} data-video-provider="r2" crossOrigin="anonymous" controls playsInline preload="metadata" className="h-full w-full" />
      {error && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-5 text-center text-sm text-white">
        <p>{error}</p><button type="button" onClick={() => { retryPosition.current = videoRef.current?.currentTime || retryPosition.current || lastPosition; setRetry(v => v + 1) }} className="rounded-lg bg-white px-4 py-2 text-black">Recharger la vidéo</button>
      </div>}
    </div>
  )
}
