"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import SimulationChapter from "@/components/simulation/SimulationChapter"
import type { EntreeSommaire } from "@/components/simulation/SimulationPlayer"
import { dureeLisible, estimatedSimulationSeconds } from "@/lib/simulation/duree"
import {
  toApiFileUrl,
  filtrerDocuments,
  documentsDeLaFormation,
  type LearnerDocument,
} from "@/lib/learner-files"
import {
  ActionsDocument,
  LigneDocument,
  type EtatConsultation,
} from "@/components/learner/DocumentActions"
import PdfViewer from "@/components/learner/PdfViewer"

/* ═══════════ HELPERS ═══════════ */

type ChapterKind = "video" | "simulation" | "exercise" | "pdf" | "text"

function getChapterKind(ch: {
  videoUrl: string | null
  simulation?: { id: string; mode: string; stepCount: number } | null
  exercises?: { id: string }[]
  attachments?: { fileUrl: string }[]
}): ChapterKind {
  if (ch.videoUrl) return "video"
  // Une simulation passe avant le quiz : un chapitre de simulation peut porter
  // en plus un QCM de fin, c'est la simulation qui définit le chapitre.
  if (ch.simulation) return "simulation"
  if (ch.exercises && ch.exercises.length > 0) return "exercise"
  if (ch.attachments?.some((a) => /\.pdf(\?|$)/i.test(a.fileUrl))) return "pdf"
  return "text"
}

/**
 * Durée d'un chapitre pour l'affichage : la vidéo a une durée mesurée, un
 * atelier de simulation a une durée ESTIMÉE depuis son mode et son nombre
 * d'étapes (mêmes coefficients que l'écran d'intro — un seul chiffre partout).
 */
function chapterDurationSeconds(c: {
  videoDuration?: number | null
  simulation?: { mode: string; stepCount: number } | null
}): number {
  if (c.videoDuration) return c.videoDuration
  if (c.simulation) return estimatedSimulationSeconds(c.simulation.mode, c.simulation.stepCount)
  return 0
}

/** Alias local : la règle vit dans `lib/simulation/duree` et sert aussi au sommaire. */
const formatDuration = dureeLisible

/* ═══════════ TYPES ═══════════ */

interface Choice {
  id: string
  text: string
  isCorrect?: boolean
}

interface Question {
  id: string
  text: string
  type: string
  order: number
  multiple?: boolean
  choices: Choice[]
}

interface Exercise {
  id: string
  type: string
  title: string
  instructions: string | null
  order: number
  questions: Question[]
}

interface ChapterAttachment {
  id: string
  name: string
  fileUrl: string
  /**
   * Renseignée en base (`Attachment.fileSize`, défaut 0) et bien présente dans
   * le payload : le loader inclut la relation entière. Elle n'était simplement
   * pas déclarée ici tant que rien ne l'affichait.
   */
  fileSize?: number
}

interface Chapter {
  id: string
  title: string
  description: string | null
  order: number
  videoUrl: string | null
  videoDuration: number
  content: string | null
  completed: boolean
  inProgress: boolean
  lastPosition: number
  timeSpentSeconds?: number
  sectionId?: string | null
  attachments: ChapterAttachment[]
  exercises: Exercise[]
  /**
   * Métadonnées de simulation seulement — le scénario lui-même est chargé à la
   * demande par le composant de simulation via GET /api/simulations/[chapterId].
   */
  simulation?: { id: string; app: string; mode: string; stepCount: number } | null
}

interface Section {
  id: string
  title: string
  description: string | null
  order: number
}

interface FormationAttachment {
  id: string
  name: string
  fileUrl: string
  fileSize: number
}

/* ═══════════ MAIN PLAYER ═══════════ */

export default function FormationPlayer({
  formationTitle,
  formationCoverUrl,
  chapters,
  sections,
  formationAttachments,
  userId,
  preview,
  formationId,
  initialChapterId,
  initialNotes,
  quizGlobal,
}: {
  formationTitle: string
  formationCoverUrl?: string | null
  chapters: Chapter[]
  sections?: Section[]
  formationAttachments?: FormationAttachment[]
  userId: string
  preview?: boolean
  formationId?: string
  initialChapterId?: string
  initialNotes?: Record<string, string>
  quizGlobal?: number | null
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const sortedSections = useMemo(
    () => (sections || []).slice().sort((a, b) => a.order - b.order),
    [sections]
  )
  const rootChapters = useMemo(
    () => chapters.filter((c) => !c.sectionId).slice().sort((a, b) => a.order - b.order),
    [chapters]
  )
  const chaptersBySection = useCallback(
    (sectionId: string) =>
      chapters.filter((c) => c.sectionId === sectionId).slice().sort((a, b) => a.order - b.order),
    [chapters]
  )

  // Ordre logique d'affichage (root → section1.chapters → section2.chapters → …)
  const orderedChapters = useMemo(() => {
    const arr: Chapter[] = [...rootChapters]
    sortedSections.forEach((s) => {
      arr.push(...chaptersBySection(s.id))
    })
    return arr
  }, [rootChapters, sortedSections, chaptersBySection])

  const [activeIndex, setActiveIndex] = useState(() => {
    // Deep-link ?chapitre=<id> (depuis « Mes notes » notamment)
    if (initialChapterId) {
      const requestedIndex = chapters.findIndex((c) => c.id === initialChapterId)
      if (requestedIndex >= 0) return requestedIndex
    }
    const initialChapter =
      orderedChapters.find((c) => c.inProgress && !c.completed) ||
      orderedChapters.find((c) => !c.completed) ||
      orderedChapters[0]
    const initialIndex = initialChapter ? chapters.findIndex((c) => c.id === initialChapter.id) : -1
    return initialIndex >= 0 ? initialIndex : 0
  })
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    chapters.forEach((c) => { map[c.id] = c.completed })
    return map
  })
  const [showChapters, setShowChapters] = useState(false)
  /**
   * Document consulté dans la visionneuse — un seul à la fois, comme dans le
   * cockpit du simulateur. Le player classique porte trois surfaces de
   * documents (en-tête d'un chapitre PDF, pièces jointes du chapitre,
   * documents de la formation) : un seul état les sert toutes.
   */
  const [docConsulte, setDocConsulte] = useState<LearnerDocument | null>(null)
  const [etatConsultation, setEtatConsultation] = useState<EtatConsultation>(null)
  const fermerVisionneuse = useCallback(() => setDocConsulte(null), [])
  // Contenu des notes par chapitre (préchargé serveur, mis à jour au fil de la saisie)
  const [notesMap, setNotesMap] = useState<Record<string, string>>(initialNotes || {})
  const router = useRouter()

  /**
   * Sommaire passé à l'atelier de simulation, pour son panneau « Leçons ».
   *
   * Il suit l'ordre d'apprentissage réel (chapitres hors section, puis section
   * par section) et porte le module d'appartenance : l'atelier regroupe dessus.
   */
  const sommaireAtelier: EntreeSommaire[] = useMemo(() => {
    const titreSection: Record<string, string> = {}
    sortedSections.forEach((s) => {
      titreSection[s.id] = s.title
    })
    return orderedChapters.map((c) => ({
      id: c.id,
      titre: c.title,
      module: c.sectionId ? (titreSection[c.sectionId] ?? null) : null,
      genre:
        c.simulation?.mode === "EXERCISE"
          ? "exercice"
          : c.simulation?.mode === "EVALUATION"
            ? "evaluation"
            : c.simulation
              ? "lecon"
              : "autre",
      termine: !!completedMap[c.id],
      // Charge du chapitre : déjà chargée en métadonnées, aucune requête de plus.
      etapes: c.simulation?.stepCount ?? 0,
      secondes: c.simulation ? estimatedSimulationSeconds(c.simulation.mode, c.simulation.stepCount) : 0,
    }))
  }, [orderedChapters, sortedSections, completedMap])

  /**
   * TOUS les documents de la formation : pièces jointes de la formation ET de
   * chacun de ses chapitres.
   *
   * Un support peut n'exister que comme pièce jointe d'UN chapitre — c'est le
   * cas en production du PDF « Document pédagogique téléchargeable - VBA », sans
   * aucune pièce jointe au niveau formation. Ne passer que `formationAttachments`
   * ouvrait donc un panneau vide depuis tous les autres chapitres.
   */
  const documentsDeLaFormationEntiere = useMemo(
    () => documentsDeLaFormation(formationAttachments, chapters),
    [formationAttachments, chapters],
  )

  /**
   * La formation porte-t-elle au moins un document réellement ouvrable ?
   *
   * Déduit de la MÊME source que la liste affichée — sinon le bouton et le
   * panneau peuvent se contredire. C'est ce drapeau, et non le contenu du
   * chapitre courant, qui décide de l'affichage du contrôle : un bouton qui
   * apparaîtrait et disparaîtrait d'un chapitre à l'autre serait désorientant.
   */
  const formationADesDocuments = useMemo(
    () => filtrerDocuments(documentsDeLaFormationEntiere).length > 0,
    [documentsDeLaFormationEntiere],
  )

  /**
   * Enregistrement des notes prises DEPUIS l'atelier.
   *
   * Le bloc « Prise de notes » de la page porte son propre autosave, mais il est
   * recouvert par l'atelier : sans ce chemin, une note écrite dans le panneau
   * latéral ne serait jamais envoyée au serveur.
   */
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteEnAttenteRef = useRef<{ chapterId: string; content: string } | null>(null)
  const envoyerNote = useCallback((chapterId: string, content: string) => {
    fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId, content }),
      keepalive: true,
    }).catch(() => {})
  }, [])
  const noterDepuisAtelier = useCallback(
    (chapterId: string, content: string) => {
      setNotesMap((prev) => ({ ...prev, [chapterId]: content }))
      noteEnAttenteRef.current = { chapterId, content }
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current)
      noteDebounceRef.current = setTimeout(() => {
        const p = noteEnAttenteRef.current
        noteEnAttenteRef.current = null
        if (p) envoyerNote(p.chapterId, p.content)
      }, 1200)
    },
    [envoyerNote],
  )
  useEffect(() => {
    // Flush si l'apprenant quitte la page ou change de chapitre avant l'échéance.
    return () => {
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current)
      const p = noteEnAttenteRef.current
      noteEnAttenteRef.current = null
      if (p) envoyerNote(p.chapterId, p.content)
    }
  }, [envoyerNote])

  const active = chapters[activeIndex]
  const completedCount = Object.values(completedMap).filter(Boolean).length
  const progressPercent = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0

  // Position du chapitre actif dans l'ordre d'apprentissage (root → sections)
  const orderedIndex = active ? orderedChapters.findIndex((c) => c.id === active.id) : -1
  const prevChapter = orderedIndex > 0 ? orderedChapters[orderedIndex - 1] : null
  const nextChapter =
    orderedIndex >= 0 && orderedIndex < orderedChapters.length - 1
      ? orderedChapters[orderedIndex + 1]
      : null
  const [marking, setMarking] = useState(false)

  const isAccessible = (_index: number) => {
    // Accès libre : tous les chapitres sont accessibles en permanence
    // (style Rise Up — apprenant adulte autonome)
    return true
  }

  // Identité stable : évite de re-câbler les listeners Vimeo à chaque re-render
  // (la saisie de notes re-rendait le player et flushait la progression à chaque frappe)
  const handleChapterCompleted = useCallback((chapterId: string) => {
    setCompletedMap((prev) => ({ ...prev, [chapterId]: true }))
  }, [])

  // Map id → displayNumber séquentiel (1-based)
  const displayNumberMap = useMemo(() => {
    const m: Record<string, number> = {}
    orderedChapters.forEach((c, i) => { m[c.id] = i + 1 })
    return m
  }, [orderedChapters])

  const totalDuration = useMemo(
    () => chapters.reduce((sum, c) => sum + chapterDurationSeconds(c), 0),
    [chapters]
  )
  const completedDuration = useMemo(
    () => chapters.filter((c) => completedMap[c.id]).reduce((sum, c) => sum + chapterDurationSeconds(c), 0),
    [chapters, completedMap]
  )

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {}
    ;(sections || []).forEach((s) => { m[s.id] = true })
    return m
  })
  const toggleSection = (id: string) =>
    setExpandedSections((prev) => ({ ...prev, [id]: prev[id] === false ? true : false }))

  const handleSelectChapter = useCallback((chapter: Chapter) => {
    const nextIndex = chapters.findIndex((c) => c.id === chapter.id)
    if (nextIndex < 0) return
    setActiveIndex(nextIndex)

    if (window.matchMedia("(max-width: 1023px)").matches) {
      setShowChapters(false)
      window.requestAnimationFrame(() => {
        contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    }
  }, [chapters])

  // ─── Temps passé par chapitre (traçabilité Qualiopi) ───
  // 100 % en refs : aucun state, aucun re-render (piège VimeoPlayer persistant).
  // Tick 15 s quand l'onglet est visible → flush ≥ 60 s, au changement de
  // chapitre, quand l'onglet passe en arrière-plan et à la sortie (keepalive).
  const timeChapterIdRef = useRef<string | null>(null)
  const timePendingRef = useRef(0)

  // ─── Visionnage réel par chapitre (session courante) ───
  // Secondes de vidéo réellement lues (les sauts de curseur ne comptent pas),
  // remontées par VimeoPlayer. setState seulement par palier de 5 s : pas de
  // re-render à chaque timeupdate (piège VimeoPlayer persistant).
  const [watchMap, setWatchMap] = useState<Record<string, number>>({})
  const handleWatchProgress = useCallback((chapterId: string, watchedSeconds: number) => {
    setWatchMap((prev) => {
      const cur = prev[chapterId] || 0
      if (watchedSeconds - cur < 5) return prev
      return { ...prev, [chapterId]: watchedSeconds }
    })
  }, [])
  // Récupère (et vide) le temps de présence accumulé, pour le créditer dans le
  // même PUT que le completedAt (le verrou serveur évalue après ce crédit).
  const takePendingSeconds = useCallback(() => {
    const secs = Math.round(timePendingRef.current)
    timePendingRef.current = 0
    return secs
  }, [])

  // Déblocage du bouton « Marquer comme terminé » : 50 % de la vidéo réellement
  // vus (visionnage de la session + temps déjà passé les sessions précédentes).
  // La navigation entre chapitres, elle, reste toujours totalement libre.
  const watchGate = useMemo(() => {
    if (!active?.videoUrl || !active.videoDuration || completedMap[active.id]) {
      return { locked: false, pct: 100 }
    }
    const seen = (watchMap[active.id] || 0) + (active.timeSpentSeconds || 0)
    const required = active.videoDuration * 0.5
    return {
      locked: seen < required,
      pct: Math.min(100, Math.floor((seen / required) * 100)),
    }
  }, [active, watchMap, completedMap])

  // Marquer le chapitre courant comme terminé (bouton manuel).
  // Contrat API : PUT /api/progress/{chapterId} avec { completedAt } + crédit
  // du temps de présence en attente (le verrou serveur évalue après ce crédit).
  const markCompleted = useCallback(async () => {
    if (!active || preview || marking || completedMap[active.id] || watchGate.locked) return
    setMarking(true)
    const chapterId = active.id
    try {
      const pending = takePendingSeconds()
      const res = await fetch(`/api/progress/${chapterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedAt: new Date().toISOString(),
          ...(pending >= 1 && { timeDeltaSeconds: pending }),
        }),
      })
      if (res.ok) {
        handleChapterCompleted(chapterId)
        // Enchaîner sur le chapitre suivant si disponible
        if (nextChapter) handleSelectChapter(nextChapter)
      }
    } catch {}
    finally { setMarking(false) }
  }, [active, preview, marking, completedMap, watchGate.locked, nextChapter, handleSelectChapter, takePendingSeconds])
  const flushTimeSpent = useCallback((useKeepalive = false) => {
    const chapterId = timeChapterIdRef.current
    const secs = Math.round(timePendingRef.current)
    if (!chapterId || secs < 1) return
    timePendingRef.current = 0
    fetch(`/api/progress/${chapterId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeDeltaSeconds: secs }),
      keepalive: useKeepalive,
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (preview) return
    // Changement de chapitre : créditer le temps accumulé à l'ANCIEN chapitre.
    flushTimeSpent()
    timeChapterIdRef.current = active?.id || null
  }, [active?.id, preview, flushTimeSpent])

  useEffect(() => {
    if (preview) return
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") {
        timePendingRef.current += 15
        if (timePendingRef.current >= 60) flushTimeSpent()
      }
    }, 15_000)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushTimeSpent(true)
    }
    const onPageHide = () => flushTimeSpent(true)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      clearInterval(tick)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
      flushTimeSpent(true)
    }
  }, [preview, flushTimeSpent])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
      {/* Barre chapitres — sticky en haut sur mobile, toujours accessible pendant la formation */}
      <div className="lg:hidden sticky z-30" style={{ top: "calc(var(--app-impersonation-offset, 0px) + 64px)" }}>
        <button
          onClick={() => setShowChapters(true)}
          className="w-full py-3 bg-white/95 backdrop-blur rounded-2xl border border-border text-sm font-semibold text-warm-600 hover:bg-warm-50 transition-colors flex items-center justify-center gap-2 shadow-md"
          style={{ minHeight: 48 }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Voir les chapitres ({completedCount}/{chapters.length})
        </button>
      </div>
      {/* Main content */}
      <div ref={contentRef} className="space-y-5 min-w-0 scroll-mt-20 animate-fade-in-up">
        {/* Encart de fin : affiché quand tous les chapitres de la formation sont terminés */}
        {!preview && chapters.length > 0 && chapters.every((c) => c.completed) && (
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-5 flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" /></svg>
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-ink">Félicitations, vous avez terminé la formation ! 🎉</h3>
              <p className="text-sm text-warm-700 mt-0.5">
                {quizGlobal != null
                  ? <>Votre score global aux évaluations est de <span className="font-semibold text-emerald-700">{Math.round(quizGlobal * 100)}%</span>.</>
                  : "Retrouvez le récapitulatif de vos évaluations dans votre bilan."}
              </p>
            </div>
            <a href="/learner/resultats" className="sm:ml-auto text-xs font-semibold px-4 py-2 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity whitespace-nowrap">
              Voir mon bilan
            </a>
          </div>
        )}
        {/* Video — hôte PERSISTANT : ce composant n'est JAMAIS démonté au changement
            de chapitre (seule la src de l'iframe change). Le démontage/remontage keyé
            laissait des players orphelins empilés dans le DOM (bug de suppression
            silencieux constaté en prod, spécifique à ce sous-arbre iframe). */}
        <VimeoPlayer
          vimeoId={active?.videoUrl || null}
          chapterId={active?.id || ""}
          lastPosition={active?.videoUrl ? active.lastPosition : 0}
          preview={!!preview}
          onCompleted={handleChapterCompleted}
          onWatchProgress={handleWatchProgress}
          takePendingSeconds={takePendingSeconds}
        />
        {/* Atelier bureautique : passe avant le quiz, car un chapitre de simulation
            peut aussi porter un QCM de fin — c'est la simulation qui le définit. */}
        {!active?.videoUrl && active?.simulation && (
          <SimulationChapter
            chapterId={active.id}
            preview={!!preview}
            onCompleted={() => handleChapterCompleted(active.id)}
            sommaire={sommaireAtelier}
            onNaviguer={(id) => {
              const i = chapters.findIndex((c) => c.id === id)
              if (i >= 0) setActiveIndex(i)
            }}
            onQuitter={() => router.push("/learner/accueil")}
            note={notesMap[active.id] || ""}
            onNote={(v) => noterDepuisAtelier(active.id, v)}
            notesHref={`/learner/notes?id=${formationId || ""}&chapitre=${active.id}`}
            documentsChapitre={active.attachments}
            documentsFormation={documentsDeLaFormationEntiere}
            afficherRessources={formationADesDocuments}
            documentsHref="/learner/documents"
          />
        )}
        {!active?.videoUrl && !active?.simulation && (active?.exercises?.length > 0 ? (
          (() => {
            const ex = active.exercises[0]
            const questionsCount = ex.questions?.length || 0
            return (
              <div className="bg-white rounded-2xl border border-border shadow-sm p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-warm-400 uppercase tracking-wider mb-1">
                      Quiz · {questionsCount} question{questionsCount > 1 ? "s" : ""} · essais illimités
                    </p>
                    <h2 className="font-display text-lg sm:text-xl font-semibold text-primary">
                      Répondez aux questions ci-dessous
                    </h2>
                    <p className="text-sm text-warm-500 mt-1">
                      Les réponses sont validées en bas du questionnaire.
                    </p>
                  </div>
                </div>
              </div>
            )
          })()
        ) : active?.attachments?.find((a) => /\.pdf(\?|$)/i.test(a.fileUrl)) ? (
          // PDF viewer inline (style Rise Up) — chapter PDF sans vidéo
          (() => {
            const pdf = active.attachments.find((a) => /\.pdf(\?|$)/i.test(a.fileUrl))!
            const pdfHref = toApiFileUrl(pdf.fileUrl)
            return (
              <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface-subtle">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold text-primary truncate">{pdf.name}</h3>
                      <p className="text-[11px] text-warm-400 uppercase tracking-wider">Document</p>
                    </div>
                  </div>
                  {/* Mêmes deux actions que dans le panneau du simulateur :
                      un seul composant, partout. */}
                  <ActionsDocument
                    doc={pdf}
                    onConsulter={setDocConsulte}
                    etat={docConsulte?.id === pdf.id ? etatConsultation : null}
                  />
                </div>
                {/* Mobile : l'iframe en flux ne rend qu'une page illisible sur
                    iOS. La carte ouvre donc la visionneuse plein cadre, qui
                    laisse au document toute la hauteur de l'écran. */}
                <button
                  type="button"
                  data-action="consulter-mobile"
                  onClick={() => setDocConsulte(pdf)}
                  className="sm:hidden flex w-[calc(100%-2rem)] items-center gap-3 m-4 p-4 rounded-xl border border-border bg-surface-subtle hover:bg-warm-50 transition-colors text-left"
                >
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-brand-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-primary">Consulter le document</p>
                    <p className="text-xs text-warm-500 mt-0.5">La lecture plein cadre est plus confortable sur mobile.</p>
                  </div>
                  <svg className="w-5 h-5 text-warm-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                {/* Desktop/tablette : viewer inline */}
                <iframe
                  src={`${pdfHref}#toolbar=0&navpanes=0`}
                  className="hidden sm:block w-full h-[600px] sm:h-[720px] bg-warm-50"
                  title={pdf.name}
                />
              </div>
            )
          })()
        ) : (
          <div className="aspect-video bg-warm-100 rounded-2xl flex items-center justify-center border border-warm-200">
            <div className="text-center">
              <svg className="w-10 h-10 text-warm-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
              </svg>
              <p className="text-warm-400 text-sm">Aucune vidéo pour ce chapitre</p>
            </div>
          </div>
        ))}

        {/* Chapter info */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[11px] font-semibold text-warm-400 uppercase tracking-wider">
                  Chapitre {active ? displayNumberMap[active.id] : 1} / {chapters.length}
                </p>
                {active?.videoDuration ? (
                  <>
                    <span className="text-warm-300">·</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warm-500">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatDuration(active.videoDuration)}
                    </span>
                  </>
                ) : null}
                {totalDuration > 0 && (
                  <>
                    <span className="text-warm-300">·</span>
                    <span className="text-[11px] text-warm-400">Formation : {formatDuration(totalDuration)}</span>
                  </>
                )}
              </div>
              <h2 className="font-display text-xl font-semibold text-primary">{active?.title}</h2>
            </div>
            {completedMap[active?.id] && (
              <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Terminé
              </span>
            )}
          </div>
          {active?.description && (
            <p className="text-warm-500 text-sm leading-relaxed mb-4 whitespace-pre-line">{active.description}</p>
          )}
          {active?.content && (
            <div className="text-sm text-warm-600 leading-relaxed whitespace-pre-wrap border-t border-border pt-4">{active.content}</div>
          )}
          {active?.attachments?.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border">
              <h3 className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-3">Pièces jointes</h3>
              <div>
                {active.attachments.map((att) => (
                  <LigneDocument
                    key={att.id}
                    doc={att}
                    onConsulter={setDocConsulte}
                    etat={docConsulte?.id === att.id ? etatConsultation : null}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Barre d'actions : navigation + complétion manuelle */}
        {active && (
          <div className="space-y-2">
          <div className="bg-white rounded-2xl border border-border p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={() => prevChapter && handleSelectChapter(prevChapter)}
                disabled={!prevChapter}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-warm-600 border border-border hover:bg-warm-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ minHeight: 44 }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Précédent
              </button>
              <button
                type="button"
                onClick={() => nextChapter && handleSelectChapter(nextChapter)}
                disabled={!nextChapter}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-warm-600 border border-border hover:bg-warm-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ minHeight: 44 }}
              >
                Suivant
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
            {completedMap[active.id] ? (
              <div
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-100 text-emerald-700 sm:ml-auto"
                style={{ minHeight: 44 }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Chapitre terminé
              </div>
            ) : (
              <button
                type="button"
                onClick={markCompleted}
                disabled={marking || preview || watchGate.locked}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 sm:ml-auto"
                style={{ background: "var(--partner-primary, #4F46E5)", minHeight: 44 }}
              >
                {marking ? (
                  "Enregistrement…"
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Marquer comme terminé
                  </>
                )}
              </button>
            )}
          </div>
          {/* Explication du déblocage : la navigation reste libre, seul le statut
              « terminé » attend un vrai visionnage (fiabilité de la progression) */}
          {watchGate.locked && (
            <p className="text-xs text-warm-500 leading-relaxed px-1">
              <span className="font-semibold text-warm-600">
                Regardez au moins la moitié de la vidéo pour valider ce chapitre
              </span>
              {watchGate.pct > 0 ? <> ({watchGate.pct} % du visionnage requis)</> : null}
              {" "}— vous pouvez tout à fait passer aux chapitres suivants et y revenir plus
              tard : il restera simplement affiché comme « à terminer ».
            </p>
          )}
          </div>
        )}

        {/* Exercises */}
        {active?.exercises?.length > 0 && (
          <div className="space-y-4">
            {active.exercises.map((ex) => (
              <ExerciseBlock key={ex.id} exercise={ex} userId={userId} preview={preview} />
            ))}
          </div>
        )}

        {/* Prise de notes du chapitre (autosave, personnelle — masquée en preview admin) */}
        {active && !preview && (
          <ChapterNotes
            key={active.id}
            chapterId={active.id}
            value={notesMap[active.id] || ""}
            onChange={(v) => setNotesMap((prev) => ({ ...prev, [active.id]: v }))}
            notesHref={`/learner/notes?id=${formationId || ""}&chapitre=${active.id}`}
          />
        )}

        {/* Formation-level attachments */}
        {formationAttachments && formationAttachments.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-3">Documents de la formation</h3>
            <div>
              {formationAttachments.map((att) => (
                <LigneDocument
                  key={att.id}
                  doc={att}
                  onConsulter={setDocConsulte}
                  etat={docConsulte?.id === att.id ? etatConsultation : null}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Backdrop du drawer chapitres (mobile) */}
      {showChapters && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
          style={{ top: "calc(var(--app-impersonation-offset, 0px) + 64px)" }}
          onClick={() => setShowChapters(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — drawer plein écran sur mobile (glisse depuis la droite), colonne sur desktop */}
      <div
        className={`${showChapters ? "fixed right-0 bottom-0 z-50 w-full max-w-[88vw] sm:max-w-[360px] overflow-y-auto overscroll-contain" : "hidden"} lg:static lg:block lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible`}
        style={showChapters ? { top: "calc(var(--app-impersonation-offset, 0px) + 64px)" } : undefined}
      >
        <div className="bg-white min-h-full lg:min-h-0 lg:rounded-2xl border-l lg:border border-border shadow-2xl lg:shadow-sm lg:sticky lg:top-[80px] overflow-hidden">
          {/* Sidebar header */}
          <div className="p-4 border-b border-border bg-warm-50/50">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-display text-sm font-semibold text-primary truncate">{formationTitle}</h3>
              <button onClick={() => setShowChapters(false)} className="lg:hidden -mt-1 -mr-1 p-1.5 rounded-lg text-warm-500 hover:bg-warm-100 flex-shrink-0" aria-label="Fermer les chapitres">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Barre % chapitres complétés */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 bg-warm-200/50 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.max(progressPercent, 2)}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-emerald-600 tabular-nums w-9 text-right">{progressPercent}%</span>
            </div>
            {/* Barre heures visualisées */}
            {totalDuration > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-warm-200/50 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${Math.max((completedDuration / totalDuration) * 100, 2)}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-warm-500 tabular-nums whitespace-nowrap">
                  {formatDuration(completedDuration) || "0 min"} / {formatDuration(totalDuration)}
                </span>
              </div>
            )}
          </div>

          {/* Chapter list */}
          <div className="p-2 max-h-[calc(100dvh-200px)] overflow-y-auto">
            {rootChapters.map((ch) => (
              <ChapterButton
                key={ch.id}
                chapter={ch}
                displayNumber={displayNumberMap[ch.id]}
                kind={getChapterKind(ch)}
                isActive={chapters[activeIndex]?.id === ch.id}
                completed={!!completedMap[ch.id]}
                onClick={() => handleSelectChapter(ch)}
              />
            ))}

            {sortedSections.map((section) => {
              const sectionChapters = chaptersBySection(section.id)
              if (sectionChapters.length === 0 && rootChapters.length > 0) return null
              const expanded = expandedSections[section.id] !== false
              const sectionDone = sectionChapters.filter((c) => completedMap[c.id]).length
              return (
                <div key={section.id} className="mt-3">
                  {/* Header section cliquable — pill teintée */}
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-lg transition-colors group hover:brightness-95"
                    style={{ background: "color-mix(in srgb, var(--partner-primary, #4F46E5) 6%, transparent)" }}
                  >
                    <svg
                      className={`w-3.5 h-3.5 text-primary transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider truncate" style={{ color: "var(--partner-primary, #3730a3)" }}>{section.title}</p>
                      {section.description && (
                        <p className="text-[10px] text-warm-500 mt-0.5 leading-snug truncate">{section.description}</p>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold bg-white px-1.5 py-0.5 rounded-full tabular-nums flex-shrink-0" style={{ color: "var(--partner-primary, #6366f1)" }}>
                      {sectionDone}/{sectionChapters.length}
                    </span>
                  </button>
                  {/* Chapitres de la section */}
                  {expanded && sectionChapters.map((ch) => (
                    <ChapterButton
                      key={ch.id}
                      chapter={ch}
                      displayNumber={displayNumberMap[ch.id]}
                      kind={getChapterKind(ch)}
                      isActive={chapters[activeIndex]?.id === ch.id}
                      completed={!!completedMap[ch.id]}
                      onClick={() => handleSelectChapter(ch)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Visionneuse partagée avec le simulateur. Elle se rend par un portail
          vers le corps du document : ni la grille du player, ni le `transform`
          résiduel de la page ne peuvent la contraindre. */}
      <PdfViewer doc={docConsulte} onClose={fermerVisionneuse} onEtat={setEtatConsultation} />
    </div>
  )
}

/* ═══════════ CHAPTER NOTES ═══════════ */

function ChapterNotes({
  chapterId,
  value,
  onChange,
  notesHref,
}: {
  chapterId: string
  value: string
  onChange: (value: string) => void
  notesHref: string
}) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [savedAt, setSavedAt] = useState<string>("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const valueRef = useRef(value)
  valueRef.current = value

  const save = useCallback(async (content: string) => {
    setSaveState("saving")
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, content }),
      })
      if (!res.ok) throw new Error("save failed")
      dirtyRef.current = false
      setSaveState("saved")
      setSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }))
    } catch {
      setSaveState("error")
    }
  }, [chapterId])

  const handleChange = (v: string) => {
    onChange(v)
    dirtyRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(v), 1200)
  }

  // Flush de la note en attente au changement de chapitre / sortie de page
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (dirtyRef.current) {
        fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterId, content: valueRef.current }),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [chapterId])

  return (
    <div className="bg-white rounded-2xl border border-border p-5 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </div>
          <h3 className="font-display text-sm font-semibold text-primary">Prise de notes</h3>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saveState === "saving" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-warm-400">
              <span className="w-3 h-3 rounded-full border-2 border-warm-200 border-t-warm-500 animate-spin" />
              Enregistrement…
            </span>
          )}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Enregistré{savedAt ? ` à ${savedAt}` : ""}
            </span>
          )}
          {saveState === "error" && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M12 3a9 9 0 100 18 9 9 0 000-18z" />
              </svg>
              Échec de l'enregistrement
            </span>
          )}
          <a
            href={notesHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            Toutes mes notes
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </a>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Notez ici ce que vous retenez de ce chapitre — l'enregistrement est automatique."
        className="w-full min-h-[120px] text-sm border border-border rounded-xl p-3.5 outline-none resize-y focus:border-primary transition-colors bg-surface-subtle/50 focus:bg-white"
        style={{ fontSize: 16 }}
      />
    </div>
  )
}

/* ═══════════ CHAPTER BUTTON ═══════════ */

function ChapterButton({
  chapter,
  displayNumber,
  kind,
  isActive,
  completed,
  onClick,
}: {
  chapter: Chapter
  displayNumber: number
  kind: ChapterKind
  isActive: boolean
  completed: boolean
  onClick: () => void
}) {
  // Config par type (icône + couleurs)
  // Icône vidéo en gris clair neutre (indépendant du partenaire) : plus lisible
  // et cohérent quelle que soit la palette du partenaire (feedback Samuel 07/07).
  // Les autres types gardent des couleurs sémantiques fixes (quiz ambre, PDF rose).
  const kindConfig: Record<ChapterKind, { bg: string; text: string; bgStyle?: React.CSSProperties; textStyle?: React.CSSProperties; icon: React.ReactNode }> = {
    video: {
      bg: "bg-warm-100", text: "text-warm-500",
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M8 5v14l11-7z" /></svg>,
    },
    // Icône grille : la simulation se reconnaît immédiatement comme un exercice
    // « dans le logiciel ». Bleu ciel volontairement distinct de l'ambre du quiz,
    // du rose des PDF et du vert de la complétion.
    simulation: {
      bg: "bg-sky-100", text: "text-sky-700",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 6v12h16V6M9 6v12m6-12v12M4 12h16" /></svg>,
    },
    exercise: {
      bg: "bg-amber-100", text: "text-amber-700",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    pdf: {
      bg: "bg-rose-100", text: "text-rose-700",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    },
    text: {
      bg: "bg-warm-100", text: "text-warm-600",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" /></svg>,
    },
  }
  const cfg = kindConfig[kind]
  const duration = formatDuration(chapterDurationSeconds(chapter))

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] transition-all duration-200 flex items-center gap-2.5 group ${
        isActive
          ? "bg-primary text-white font-medium shadow-sm"
          : "hover:bg-warm-50 text-warm-700"
      }`}
    >
      {/* Badge type (sans numéro overlay — feedback Samuel) */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
          isActive ? "bg-white/20" : completed ? "bg-emerald-100" : cfg.bg
        }`}
        style={!isActive && !completed ? cfg.bgStyle : undefined}
      >
        {completed && !isActive ? (
          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <span className={isActive ? "text-white" : cfg.text} style={!isActive ? cfg.textStyle : undefined}>{cfg.icon}</span>
        )}
      </div>
      {/* Titre */}
      <span className="truncate flex-1">{chapter.title}</span>
      {/* Durée discrète à droite */}
      {duration && (
        <span className={`flex-shrink-0 text-[10px] tabular-nums font-medium ${
          isActive ? "text-white/70" : "text-warm-400"
        }`}>
          {duration}
        </span>
      )}
    </button>
  )
}

/* ═══════════ EXERCISE BLOCK ═══════════ */

function ExerciseBlock({
  exercise,
  userId,
  preview,
}: {
  exercise: Exercise
  userId: string
  preview?: boolean
}) {
  const [answers, setAnswers] = useState<Record<string, { selectedChoiceIds?: string[]; responseText?: string }>>({})
  const [submitted, setSubmitted] = useState(false)
  const [corrections, setCorrections] = useState<any[]>([])
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [existingResponse, setExistingResponse] = useState<any>(null)

  useEffect(() => {
    if (preview) return
    fetch(`/api/exercises/${exercise.id}/responses`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) setExistingResponse(data)
      })
      .catch(() => {})
  }, [exercise.id, preview])

  const handleSubmit = async () => {
    setSubmitting(true)
    const answerList = exercise.questions.map((q) => ({
      questionId: q.id,
      selectedChoiceIds: answers[q.id]?.selectedChoiceIds || [],
      responseText: answers[q.id]?.responseText,
    }))

    try {
      const res = await fetch(`/api/exercises/${exercise.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answerList, preview: !!preview }),
      })
      if (res.ok) {
        const data = await res.json()
        setCorrections(data.corrections)
        setScore({ correct: data.correct, total: data.total })
        setSubmitted(true)
      }
    } catch {}
    finally { setSubmitting(false) }
  }

  const getCorrection = (questionId: string) =>
    corrections.find((c) => c.questionId === questionId)

  const typeLabel = exercise.type === "QCM" ? "QCM" : exercise.type === "VRAI_FAUX" ? "Vrai / Faux" : "Rédaction"

  return (
    <div id={`exercise-${exercise.id}`} className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-5 scroll-mt-24">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700">
          {typeLabel}
        </span>
        <h3 className="font-display text-base font-semibold text-primary">{exercise.title}</h3>
      </div>

      {exercise.instructions && (
        <p className="text-sm text-warm-500 leading-relaxed">{exercise.instructions}</p>
      )}

      {existingResponse && !submitted && (
        <div className="flex items-center gap-2 text-sm bg-emerald-50 text-emerald-700 rounded-xl px-4 py-3 border border-emerald-100">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Exercice complété{existingResponse.score != null ? ` — Score : ${Math.round(existingResponse.score * 100)}%` : ""}
        </div>
      )}

      <div className="space-y-5">
        {exercise.questions.map((q, qi) => {
          const correction = getCorrection(q.id)
          return (
            <div key={q.id} className="space-y-2.5">
              <p className="text-sm font-semibold text-primary">{qi + 1}. {q.text}</p>

              {(exercise.type === "QCM" || exercise.type === "VRAI_FAUX") && (
                <div className="space-y-1.5 ml-1">
                  {q.multiple && !submitted && (
                    <p className="text-[11px] font-semibold text-violet-500 uppercase tracking-wide mb-1">Plusieurs réponses possibles</p>
                  )}
                  {q.choices.map((choice) => {
                    const selectedIds = answers[q.id]?.selectedChoiceIds || []
                    const selected = selectedIds.includes(choice.id)
                    const correctIds: string[] = correction?.correctChoiceIds || []
                    const isCorrectChoice = correctIds.includes(choice.id)
                    let classes = "border-border hover:border-warm-300 hover:bg-warm-50"
                    if (submitted && correction) {
                      if (isCorrectChoice) classes = "border-emerald-300 bg-emerald-50"
                      else if (selected) classes = "border-rose-300 bg-rose-50"
                    } else if (selected) {
                      classes = "border-primary bg-primary/5"
                    }

                    const toggle = () => setAnswers((prev) => {
                      const cur = prev[q.id]?.selectedChoiceIds || []
                      if (q.multiple) {
                        const next = cur.includes(choice.id) ? cur.filter((id) => id !== choice.id) : [...cur, choice.id]
                        return { ...prev, [q.id]: { selectedChoiceIds: next } }
                      }
                      return { ...prev, [q.id]: { selectedChoiceIds: [choice.id] } }
                    })

                    return (
                      <label
                        key={choice.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${classes} ${submitted ? "pointer-events-none" : ""}`}
                      >
                        <input
                          type={q.multiple ? "checkbox" : "radio"}
                          name={`q-${q.id}`}
                          checked={selected}
                          onChange={toggle}
                          disabled={submitted}
                          className={`accent-primary w-4 h-4 ${q.multiple ? "rounded" : ""}`}
                        />
                        <span className="text-sm text-warm-700 flex-1">{choice.text}</span>
                        {submitted && isCorrectChoice && (
                          <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                        {submitted && selected && !isCorrectChoice && (
                          <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}

              {exercise.type === "REDACTION" && (
                <textarea
                  value={answers[q.id]?.responseText || ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: { responseText: e.target.value } }))}
                  placeholder="Votre réponse..."
                  rows={4}
                  disabled={submitted}
                  className="w-full px-4 py-3 text-sm border border-border rounded-xl outline-none focus:border-primary focus:ring-1 focus:ring-primary/10 resize-none disabled:bg-warm-50 transition-all"
                />
              )}
            </div>
          )
        })}
      </div>

      {!submitted ? (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98]"
        >
          {submitting ? "Validation..." : "Valider mes réponses"}
        </button>
      ) : (
        <div className="space-y-2">
          {score && (
            <div className={`flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-3 ${
              score.correct === score.total ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
            }`}>
              {score.correct === score.total ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
              Score : {score.correct}/{score.total} bonne{score.correct > 1 ? "s" : ""} réponse{score.correct > 1 ? "s" : ""}
            </div>
          )}
          {exercise.type === "REDACTION" && (
            <p className="text-xs text-warm-400 italic">Réponse enregistrée. Pas de correction automatique pour les questions de rédaction.</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════ VIMEO PLAYER ═══════════ */

function VimeoPlayer({
  vimeoId,
  chapterId,
  lastPosition,
  preview,
  onCompleted,
  onWatchProgress,
  takePendingSeconds,
}: {
  vimeoId: string | null
  chapterId: string
  lastPosition: number
  preview: boolean
  onCompleted: (chapterId: string) => void
  onWatchProgress?: (chapterId: string, watchedSeconds: number) => void
  takePendingSeconds?: () => number
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasEndedRef = useRef(false)
  const currentTimeRef = useRef(0)
  // Visionnage réel : cumul des secondes effectivement lues (session courante)
  const watchedRef = useRef(0)
  const lastTimeRef = useRef(-1)
  const [processing, setProcessing] = useState(false)
  const playerReadyRef = useRef(false)

  const saveProgress = useCallback(async (position: number, completed: boolean = false) => {
    if (preview || !chapterId) return
    try {
      const body: Record<string, any> = { lastPosition: Math.floor(position) }
      if (completed) {
        body.completedAt = new Date().toISOString()
        // Créditer le temps de présence en attente dans le même PUT : le verrou
        // serveur (plancher de visionnage) évalue APRÈS ce crédit.
        const pending = takePendingSeconds?.() || 0
        if (pending >= 1) body.timeDeltaSeconds = pending
      }
      const res = await fetch(`/api/progress/${chapterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      // Ne marquer « terminé » côté UI que si le serveur l'a accepté
      // (il peut refuser : plancher de visionnage non atteint).
      if (completed && res.ok) onCompleted(chapterId)
    } catch {}
  }, [chapterId, preview, onCompleted, takePendingSeconds])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !vimeoId) return

    // Nouveau chapitre : réinitialiser l'état de lecture (le composant persiste)
    hasEndedRef.current = false
    currentTimeRef.current = 0
    watchedRef.current = 0
    lastTimeRef.current = -1
    playerReadyRef.current = false
    setProcessing(false)

    const postToVimeo = (method: string, value?: any) => {
      const msg: Record<string, any> = { method }
      if (value !== undefined) msg.value = value
      iframe.contentWindow?.postMessage(JSON.stringify(msg), "https://player.vimeo.com")
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://player.vimeo.com") return
      if (event.source !== iframe.contentWindow) return
      let data: any
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
      } catch { return }

      if (data.event === "ready") {
        playerReadyRef.current = true
        postToVimeo("addEventListener", "timeupdate")
        postToVimeo("addEventListener", "ended")
        if (lastPosition > 0) {
          postToVimeo("setCurrentTime", lastPosition)
        }
      }

      if (data.event === "timeupdate" && typeof data.data?.seconds === "number") {
        const s = data.data.seconds
        // Visionnage réel : cumuler les petits deltas de lecture continue.
        // Un saut de curseur (delta > 2 s ou négatif) ne compte pas.
        const prevS = lastTimeRef.current
        if (prevS >= 0) {
          const delta = s - prevS
          if (delta > 0 && delta <= 2) {
            watchedRef.current += delta
            onWatchProgress?.(chapterId, watchedRef.current)
          }
        }
        lastTimeRef.current = s
        currentTimeRef.current = s
      }

      if (data.event === "ended") {
        if (hasEndedRef.current) return
        hasEndedRef.current = true
        saveProgress(0, true)
      }
    }

    window.addEventListener("message", handleMessage)

    progressTimerRef.current = setInterval(() => {
      if (currentTimeRef.current > 0 && !hasEndedRef.current) {
        saveProgress(currentTimeRef.current)
      }
    }, 30000)

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/upload/video/${vimeoId}/status`)
        const data = await res.json()
        if (data.status === "transcoding" || data.status === "transcode_starting") {
          setProcessing(true)
        }
      } catch {}
    }
    if (!preview) checkStatus()

    return () => {
      window.removeEventListener("message", handleMessage)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      if (!preview && chapterId && currentTimeRef.current > 0 && !hasEndedRef.current) {
        fetch(`/api/progress/${chapterId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastPosition: Math.floor(currentTimeRef.current) }),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [vimeoId, chapterId, lastPosition, preview, saveProgress, onWatchProgress])

  // Hôte persistant : le wrapper et l'iframe restent montés en permanence,
  // seule la src change. Sans vidéo → masqué + about:blank (stoppe la lecture).
  const src = vimeoId
    ? `https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0&dnt=1&api=1&outro=0`
    : "about:blank"

  return (
    <div className={`relative aspect-video bg-primary rounded-2xl overflow-hidden shadow-lg ${vimeoId ? "" : "hidden"}`}>
      <iframe
        ref={iframeRef}
        src={src}
        style={{ border: "none", width: "100%", height: "100%" }}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
      {processing && (
        <div className="absolute inset-0 bg-warm-100 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-warm-300 border-t-warm-500 animate-spin" />
            <p className="text-warm-600 text-sm font-medium">Vidéo en cours de traitement</p>
            <p className="text-warm-400 text-xs mt-1">Revenez dans quelques minutes</p>
          </div>
        </div>
      )}
    </div>
  )
}
