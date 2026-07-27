"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

const DISMISS_KEY = "lms-pwa-banner-dismissed-at"
const DISMISS_DAYS = 30

/**
 * Pages où proposer l'installation n'a aucun sens et gêne : un candidat invité
 * à une évaluation vient répondre une seule fois, il n'a pas d'espace à
 * installer — et la bannière recouvrait les questions.
 */
const HIDDEN_PREFIXES = ["/evaluation/"]

type Mode = "ios" | "android" | "desktop"

function StepDot({ n }: { n: number }) {
  return (
    <span
      className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 mt-px rounded-full text-[11px] font-bold"
      style={{
        background: "color-mix(in srgb, var(--partner-primary, #4F46E5) 12%, white)",
        color: "var(--partner-primary, #4F46E5)",
      }}
    >
      {n}
    </span>
  )
}

// Bannière d'installation PWA, montée globalement (root layout).
//  - Android/Chrome : vrai bouton « Installer » (beforeinstallprompt)
//  - iOS/Safari : guide pas-à-pas (Apple n'expose aucun bouton direct)
//  - Desktop : message « installez l'app sur votre téléphone » (+ installation
//    desktop quand le navigateur la propose)
// Masquée en mode app installée ; refus mémorisé 30 jours par appareil.
export default function PwaInstallBanner() {
  const pathname = usePathname()
  const hidden = HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p))
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<Mode>("desktop")
  const [deferred, setDeferred] = useState<any>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Prérequis d'installabilité : service worker enregistré
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }

    // Déjà dans l'app installée → rien à proposer
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true
    if (standalone) return

    // Refus récent → ne pas harceler
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
      if (at && Date.now() - at < DISMISS_DAYS * 86400000) return
    } catch {}

    const ua = navigator.userAgent
    const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document)
    const isMobile = isIos || /Android|Mobi/i.test(ua)
    setMode(isIos ? "ios" : isMobile ? "android" : "desktop")
    setVisible(true)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setTimeout(() => setVisible(false), 3000)
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (hidden || !visible) return null

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {}
  }

  const install = async () => {
    if (!deferred) {
      setShowGuide(true)
      return
    }
    deferred.prompt()
    try {
      const { outcome } = await deferred.userChoice
      if (outcome === "accepted") setVisible(false)
    } catch {}
    setDeferred(null)
  }

  const appIcon = (
    <div
      className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
      style={{ background: "color-mix(in srgb, var(--partner-primary, #4F46E5) 10%, white)" }}
    >
      <svg viewBox="0 0 64 64" className="w-7 h-7" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 22 L32 14 L52 22 L32 30 Z" fill="#27272A" />
        <path d="M21 26 L21 37 C25 43 39 43 43 37 L43 26" fill="none" stroke="#52525B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="52" y1="22" x2="52" y2="33" stroke="#52525B" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="52" cy="36" r="2.5" fill="#52525B" />
        <rect x="14" y="48" width="36" height="5" rx="2.5" fill="#E4E4E7" />
        <rect x="14" y="48" width="22" height="5" rx="2.5" fill="var(--partner-primary, #A855F7)" />
      </svg>
    </div>
  )

  const closeButton = (
    <button
      type="button"
      onClick={dismiss}
      aria-label="Ne plus afficher"
      className="flex-shrink-0 p-1.5 rounded-lg text-warm-400 hover:bg-warm-100 hover:text-warm-600 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )

  if (installed) {
    return (
      <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 z-40 sm:max-w-sm">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl shadow-lg px-4 py-3 flex items-center gap-2.5">
          <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <p className="text-sm font-semibold text-emerald-700">Application installée sur votre écran d'accueil !</p>
        </div>
      </div>
    )
  }

  // ── Desktop : message discret en bas à droite ──
  if (mode === "desktop") {
    return (
      <div className="fixed bottom-4 right-4 z-40 max-w-sm">
        <div className="bg-white border border-border rounded-2xl shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-warm-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary">Disponible en application</p>
              <p className="text-xs text-warm-500 mt-1 leading-relaxed">
                Sur smartphone ou tablette, ouvrez cette page pour installer l'application
                directement sur votre écran d'accueil — comme une vraie app, sans passer par un store.
              </p>
              {deferred && (
                <button
                  type="button"
                  onClick={install}
                  className="mt-2.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
                  style={{ background: "var(--partner-primary, #4F46E5)" }}
                >
                  Installer sur cet ordinateur
                </button>
              )}
            </div>
            {closeButton}
          </div>
        </div>
      </div>
    )
  }

  // ── Mobile (iOS + Android) : carte en bas de l'écran ──
  return (
    <div className="fixed bottom-3 inset-x-3 z-40">
      <div className="bg-white border border-border rounded-2xl shadow-xl p-4 max-w-md mx-auto">
        <div className="flex items-start gap-3">
          {appIcon}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary">Installez l'application</p>
            <p className="text-xs text-warm-500 mt-0.5 leading-relaxed">
              Retrouvez vos formations depuis votre écran d'accueil, en plein écran comme une vraie app.
            </p>
          </div>
          {closeButton}
        </div>

        {!showGuide ? (
          <button
            type="button"
            onClick={install}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
            style={{ background: "var(--partner-primary, #4F46E5)", minHeight: 44 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {mode === "android" && deferred ? "Installer l'application" : "Voir comment installer"}
          </button>
        ) : mode === "ios" ? (
          <ol className="mt-3 space-y-2 text-[13px] text-warm-600 leading-relaxed">
            <li className="flex items-start gap-2.5">
              <StepDot n={1} />
              <span>
                Ouvrez cette page dans <strong>Safari</strong>, puis touchez le bouton{" "}
                <strong>Partager</strong>{" "}
                <svg className="inline w-4 h-4 -mt-0.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15" />
                </svg>{" "}
                (en bas de l'écran).
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <StepDot n={2} />
              <span>Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong>.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <StepDot n={3} />
              <span>Touchez <strong>Ajouter</strong> — l'application apparaît sur votre écran d'accueil.</span>
            </li>
          </ol>
        ) : (
          <ol className="mt-3 space-y-2 text-[13px] text-warm-600 leading-relaxed">
            <li className="flex items-start gap-2.5">
              <StepDot n={1} />
              <span>Ouvrez le <strong>menu ⋮</strong> de votre navigateur (en haut à droite).</span>
            </li>
            <li className="flex items-start gap-2.5">
              <StepDot n={2} />
              <span>Touchez <strong>« Ajouter à l'écran d'accueil »</strong> ou <strong>« Installer l'application »</strong>.</span>
            </li>
          </ol>
        )}
      </div>
    </div>
  )
}
