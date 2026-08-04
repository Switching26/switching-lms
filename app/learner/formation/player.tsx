"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import SimulationChapter from "@/components/simulation/SimulationChapter"
import type { EntreeSommaire } from "@/components/simulation/SimulationPlayer"
import { estimatedSimulationSeconds } from "@/lib/simulation/duree"
import {
  toApiFileUrl,
  filtrerDocuments,
  documentsDeLaFormation,
  type LearnerDocument,
} from "@/lib/learner-files"
import {
  ActionsDocument,
  type EtatConsultation,
} from "@/components/learner/DocumentActions"
import PdfViewer from "@/components/learner/PdfViewer"
import CadranFormation, {
  type EntreeCadran,
  type GenreChapitre,
  type ValidationChapitre,
} from "@/components/learner/CadranFormation"

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

/**
 * Genre d'un chapitre pour le cadran : même arbitrage que `getChapterKind`,
 * traduit dans le vocabulaire de l'apprenant. Un seul point de vérité pour le
 * badge de la bande, la pastille du sommaire et le contenu de la scène.
 */
function genreCadran(kind: ChapterKind): GenreChapitre {
  if (kind === "video") return "video"
  if (kind === "simulation") return "atelier"
  if (kind === "exercise") return "quiz"
  if (kind === "pdf") return "document"
  return "texte"
}

/**
 * Durée en `m:ss`, pour tout ce qui se compare à la barre de lecture d'une
 * vidéo. `dureeLisible` arrondit à la minute : elle convient au sommaire, pas à
 * un seuil de validation que l'apprenant regarde défiler.
 */
function mmss(secondes: number): string {
  const s = Math.max(0, Math.round(secondes))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** Le PDF affiché en pleine page pour un chapitre de type document. */
function pdfDuChapitre(ch?: { attachments?: ChapterAttachment[] } | null) {
  return ch?.attachments?.find((a) => /\.pdf(\?|$)/i.test(a.fileUrl)) ?? null
}

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
  const progressPercent =
    chapters.length > 0
      ? Math.round((Object.values(completedMap).filter(Boolean).length / chapters.length) * 100)
      : 0

  // Position du chapitre actif dans l'ordre d'apprentissage (root → sections)
  const orderedIndex = active ? orderedChapters.findIndex((c) => c.id === active.id) : -1
  const prevChapter = orderedIndex > 0 ? orderedChapters[orderedIndex - 1] : null
  const nextChapter =
    orderedIndex >= 0 && orderedIndex < orderedChapters.length - 1
      ? orderedChapters[orderedIndex + 1]
      : null
  const [marking, setMarking] = useState(false)

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

  /**
   * Sommaire du cadran — même ordre d'apprentissage que `sommaireAtelier`, mais
   * dans le vocabulaire des chapitres classiques (vidéo, quiz, document).
   * Aucune requête : tout vient de ce que la page a déjà chargé.
   */
  const sommaireCadran: EntreeCadran[] = useMemo(() => {
    const titreSection: Record<string, string> = {}
    sortedSections.forEach((s) => {
      titreSection[s.id] = s.title
    })
    return orderedChapters.map((c) => ({
      id: c.id,
      titre: c.title,
      module: c.sectionId ? (titreSection[c.sectionId] ?? null) : null,
      genre: genreCadran(getChapterKind(c)),
      termine: !!completedMap[c.id],
      secondes: chapterDurationSeconds(c),
    }))
  }, [orderedChapters, sortedSections, completedMap])

  const handleSelectChapter = useCallback((chapter: Chapter) => {
    const nextIndex = chapters.findIndex((c) => c.id === chapter.id)
    if (nextIndex < 0) return
    setActiveIndex(nextIndex)
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

  /* ── Ce que la bande de consigne doit dire du chapitre ouvert ──────────── */
  const kind: ChapterKind = active ? getChapterKind(active) : "text"
  const genre = genreCadran(kind)
  const pdfActif = kind === "pdf" ? pdfDuChapitre(active) : null
  // Un atelier prend l'écran entier lui-même : le cadran s'efface, sans se
  // démonter (hôte Vimeo persistant).
  const estAtelier = kind === "simulation"
  const seuilSecondes =
    active?.videoUrl && active.videoDuration ? Math.round(active.videoDuration * 0.5) : 0
  const vuSecondes = active ? (watchMap[active.id] || 0) + (active.timeSpentSeconds || 0) : 0

  const validation: ValidationChapitre = !active
    ? { etat: "possible" }
    : completedMap[active.id]
      ? { etat: "termine" }
      : preview
        ? {
            etat: "verrouille",
            libelle: "Aperçu — non enregistré",
            explication: "En aperçu, la progression de l'apprenant n'est pas modifiée.",
          }
        : marking
          ? { etat: "enregistrement" }
          : watchGate.locked
            ? {
                etat: "verrouille",
                libelle: `Validation à ${mmss(seuilSecondes)}`,
                explication:
                  "Regardez au moins la moitié de la leçon pour la valider. La navigation, elle, reste libre.",
              }
            : { etat: "possible" }

  const attendu =
    kind === "video" && seuilSecondes > 0 ? (
      <>
        Attendu : <b className="font-semibold text-ink">regarder au moins la moitié de la leçon</b>
        <span className="inline-block h-1 w-[88px] overflow-hidden rounded-full bg-warm-200 align-middle">
          <span
            className="block h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, seuilSecondes ? (vuSecondes / seuilSecondes) * 100 : 100)}%`,
              background: "var(--partner-primary, #4F46E5)",
            }}
          />
        </span>
        <span className="tabular-nums">
          {mmss(Math.min(vuSecondes, seuilSecondes))} / {mmss(seuilSecondes)}
        </span>
        {!watchGate.locked && (
          <span className="font-semibold text-emerald-600">· seuil atteint</span>
        )}
      </>
    ) : kind === "exercise" ? (
      <>
        Attendu :{" "}
        <b className="font-semibold text-ink">
          répondre aux {active?.exercises?.[0]?.questions?.length ?? 0} questions
        </b>{" "}
        — la validation se fait en bas du questionnaire.
      </>
    ) : kind === "pdf" ? (
      <>
        Attendu : <b className="font-semibold text-ink">ouvrir le support au moins une fois</b>.
      </>
    ) : (
      <>
        Attendu : <b className="font-semibold text-ink">lire ce chapitre</b>.
      </>
    )

  const toutTermine = !preview && chapters.length > 0 && chapters.every((c) => !!completedMap[c.id])

  return (
    <>
      {/* Atelier de simulation : il monte son propre cadre plein écran. */}
      {estAtelier && active && (
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
          cleGuide={userId}
        />
      )}

      <CadranFormation
        chapterId={active?.id || ""}
        filModule={
          active?.sectionId
            ? (sortedSections.find((s) => s.id === active.sectionId)?.title ?? null)
            : null
        }
        filChapitre={active?.title || formationTitle}
        index={active ? (displayNumberMap[active.id] ?? 1) : 1}
        total={chapters.length}
        progression={progressPercent}
        sommaire={sommaireCadran}
        positionCourante={
          active?.videoUrl && active.videoDuration
            ? { vu: Math.min(vuSecondes, active.videoDuration), total: active.videoDuration }
            : null
        }
        onNaviguer={(id) => {
          const ch = chapters.find((c) => c.id === id)
          if (ch) handleSelectChapter(ch)
        }}
        note={active && !preview ? notesMap[active.id] || "" : undefined}
        onNote={active && !preview ? (v) => noterDepuisAtelier(active.id, v) : undefined}
        notesHref={active ? `/learner/notes?id=${formationId || ""}&chapitre=${active.id}` : undefined}
        afficherRessources={formationADesDocuments}
        documentsChapitre={active?.attachments}
        documentsFormation={documentsDeLaFormationEntiere}
        documentsHref="/learner/documents"
        onQuitter={preview ? undefined : () => router.push("/learner/accueil")}
        genre={genre}
        titre={active?.title || formationTitle}
        description={active?.description}
        contenu={kind === "text" ? null : active?.content}
        attendu={attendu}
        validation={validation}
        onTerminer={markCompleted}
        precedent={prevChapter ? () => handleSelectChapter(prevChapter) : undefined}
        suivant={nextChapter ? () => handleSelectChapter(nextChapter) : undefined}
        bilan={
          toutTermine ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-lg backdrop-blur">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[14px] font-semibold text-ink">
                  Félicitations, vous avez terminé la formation ! 🎉
                </p>
                <p className="text-[12.5px] text-warm-600">
                  {quizGlobal != null ? (
                    <>
                      Votre score global aux évaluations est de{" "}
                      <span className="font-semibold text-emerald-700">{Math.round(quizGlobal * 100)}%</span>.
                    </>
                  ) : (
                    "Retrouvez le récapitulatif de vos évaluations dans votre bilan."
                  )}
                </p>
              </div>
              <a
                href="/learner/resultats"
                className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-xs font-semibold text-white"
                style={{ background: "var(--partner-primary, #4F46E5)" }}
              >
                Voir mon bilan
              </a>
            </div>
          ) : null
        }
        pleinCadre={!preview}
        visible={!estAtelier}
      >
        {/* ── La scène ────────────────────────────────────────────────────
            L'hôte Vimeo est PERSISTANT : jamais démonté, jamais keyé — seule
            la `src` de son iframe change. Le démontage laissait des lecteurs
            orphelins empilés dans le document. */}
        <VimeoPlayer
          vimeoId={active?.videoUrl || null}
          chapterId={active?.id || ""}
          lastPosition={active?.videoUrl ? active.lastPosition : 0}
          preview={!!preview}
          onCompleted={handleChapterCompleted}
          onWatchProgress={handleWatchProgress}
          takePendingSeconds={takePendingSeconds}
        />

        {kind === "exercise" && active && (
          <div
            className="max-h-full w-full max-w-[760px] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6"
            style={{ boxShadow: "0 22px 60px rgba(0,0,0,.5)" }}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              {/* Pas de titre ici : `ExerciseBlock` porte déjà le sien, juste
                  en dessous, et la bande porte celui du chapitre. Le répéter
                  affichait trois fois le même intitulé sur un seul écran. */}
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-warm-400">
                  Quiz · {active.exercises[0]?.questions?.length || 0} question
                  {(active.exercises[0]?.questions?.length || 0) > 1 ? "s" : ""} · essais illimités
                </p>
                <p className="mt-0.5 text-[13px] text-warm-500">
                  Répondez aux questions ci-dessous, puis validez en bas du questionnaire.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {active.exercises.map((ex) => (
                <ExerciseBlock key={ex.id} exercise={ex} userId={userId} preview={preview} />
              ))}
            </div>
          </div>
        )}

        {kind === "pdf" && pdfActif && (
          <div
            className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white"
            style={{ boxShadow: "0 22px 60px rgba(0,0,0,.5)" }}
          >
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-subtle px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-100">
                  <svg className="h-4 w-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-display text-[14px] font-semibold text-primary">{pdfActif.name}</h3>
                  <p className="text-[10px] uppercase tracking-wider text-warm-400">Document</p>
                </div>
              </div>
              <ActionsDocument
                doc={pdfActif}
                onConsulter={setDocConsulte}
                etat={docConsulte?.id === pdfActif.id ? etatConsultation : null}
              />
            </div>
            {/* Mobile : l'iframe en flux ne rend qu'une page illisible sur iOS.
                La carte ouvre donc la visionneuse plein cadre. */}
            <button
              type="button"
              data-action="consulter-mobile"
              onClick={() => setDocConsulte(pdfActif)}
              className="m-4 flex items-center gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-left transition-colors hover:bg-warm-50 sm:hidden"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-100">
                <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">Consulter le document</p>
                <p className="mt-0.5 text-xs text-warm-500">La lecture plein cadre est plus confortable sur mobile.</p>
              </div>
            </button>
            <iframe
              src={`${toApiFileUrl(pdfActif.fileUrl)}#toolbar=0&navpanes=0`}
              className="hidden min-h-0 w-full flex-1 bg-warm-50 sm:block"
              title={pdfActif.name}
            />
          </div>
        )}

        {kind === "text" && (
          <div
            className="max-h-full w-full max-w-[720px] overflow-y-auto rounded-2xl bg-white p-6 sm:p-8"
            style={{ boxShadow: "0 22px 60px rgba(0,0,0,.5)" }}
          >
            {active?.content ? (
              <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-warm-700">{active.content}</div>
            ) : (
              <div className="py-10 text-center">
                <svg className="mx-auto mb-2 h-10 w-10 text-warm-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                </svg>
                <p className="text-sm text-warm-400">Ce chapitre n'a pas encore de contenu.</p>
              </div>
            )}
          </div>
        )}
      </CadranFormation>

      {/* Visionneuse partagée avec le simulateur : portail vers le corps du
          document, elle passe au-dessus du cadran comme de l'atelier. */}
      <PdfViewer doc={docConsulte} onClose={fermerVisionneuse} onEtat={setEtatConsultation} />
    </>
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
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
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
    /*
     * La vidéo s'inscrit dans la salle sans jamais être rognée ni déformée.
     *
     * Deux régimes, et il en faut bien deux : au-delà de 900 px c'est la
     * HAUTEUR disponible qui commande (`h-full w-auto`), en dessous c'est la
     * LARGEUR (`w-full h-auto`). Contraindre les deux axes en même temps fait
     * ignorer `aspect-ratio` par le navigateur, et l'image se déforme.
     */
    <div
      className={`relative aspect-video max-h-full max-w-full overflow-hidden rounded-[14px] bg-primary shadow-lg
        h-auto w-full min-[901px]:h-full min-[901px]:w-auto ${vimeoId ? "" : "hidden"}`}
      style={{ boxShadow: "0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)" }}
    >
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
