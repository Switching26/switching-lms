"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import Badge from "@/components/ui/Badge"

/* ═══════════ TYPES ═══════════ */

interface Attachment {
  id: string
  name: string
  fileUrl: string
  fileSize: number
}

interface Choice {
  id?: string
  text: string
  isCorrect: boolean
}

interface Question {
  id: string
  text: string
  type: string
  order: number
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

interface Chapter {
  id: string
  title: string
  description: string | null
  content: string | null
  videoUrl: string | null
  videoDuration: number
  order: number
  isPublished: boolean
  sectionId: string | null
  attachments: Attachment[]
}

interface Section {
  id: string
  title: string
  description: string | null
  order: number
}

interface Formation {
  id?: string
  title: string
  description: string | null
  coverImageUrl: string | null
  isPublished: boolean
  chapters: Chapter[]
  sections?: Section[]
  attachments?: Attachment[]
}

/* ═══════════ VIDEO UPLOAD STATES ═══════════ */
type VideoUploadState = "idle" | "uploading" | "processing" | "ready" | "error"

/* ═══════════ MAIN EDITOR ═══════════ */

export default function FormationEditor({ initial }: { initial?: Formation }) {
  const router = useRouter()
  const isEditing = !!initial?.id

  const [title, setTitle] = useState(initial?.title || "")
  const [description, setDescription] = useState(initial?.description || "")
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.coverImageUrl || "")
  const [isPublished, setIsPublished] = useState(initial?.isPublished || false)
  const [chapters, setChapters] = useState<Chapter[]>(
    (initial?.chapters || []).map((c) => ({ ...c, sectionId: (c as any).sectionId || null }))
  )
  const [sections, setSections] = useState<Section[]>(initial?.sections || [])
  const [formationAttachments, setFormationAttachments] = useState<Attachment[]>(initial?.attachments || [])
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [formationId, setFormationId] = useState(initial?.id || "")
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingFormationFile, setUploadingFormationFile] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const formationFileRef = useRef<HTMLInputElement>(null)

  const activeChapter = chapters.find((c) => c.id === activeChapterId) || null

  const flash = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 4000)
  }

  // Save formation
  const saveFormation = async () => {
    if (!title.trim()) { flash("Erreur : Le titre est requis"); return }
    setSaving(true)
    setMessage("")
    try {
      const url = formationId ? `/api/formations/${formationId}` : "/api/formations"
      const method = formationId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || null, coverImageUrl: coverImageUrl || null, isPublished }),
      })
      if (!res.ok) { flash("Erreur : Enregistrement échoué"); return }
      const data = await res.json()
      if (!formationId) {
        setFormationId(data.id)
        router.replace(`/super-admin/formations/${data.id}/modifier`)
      }
      flash("Formation enregistrée")
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  // Cover image upload
  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/upload/file", { method: "POST", body: formData })
      if (!res.ok) { flash("Erreur : Upload échoué"); return }
      const data = await res.json()
      const imageUrl = `/api/files/${data.filename}`
      setCoverImageUrl(imageUrl)
      flash("Image uploadée")
    } catch { flash("Erreur réseau") }
    finally { setUploadingCover(false) }
  }

  // Add section
  const addSection = async () => {
    if (!formationId) { flash("Erreur : Enregistrez la formation d'abord"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/formations/${formationId}/sections`, { method: "POST" })
      if (!res.ok) { flash("Erreur : Ajout section échoué"); return }
      const section = await res.json()
      setSections((prev) => [...prev, section])
      flash("Section ajoutée")
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  // Save section
  const saveSection = async (sectionId: string, updates: Partial<Section>) => {
    try {
      await fetch(`/api/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
    } catch {}
  }

  // Delete section
  const deleteSection = async (sectionId: string) => {
    if (!confirm("Supprimer cette section ? Les chapitres seront détachés (non supprimés).")) return
    setSaving(true)
    try {
      await fetch(`/api/sections/${sectionId}`, { method: "DELETE" })
      setSections((prev) => prev.filter((s) => s.id !== sectionId))
      setChapters((prev) => prev.map((c) => c.sectionId === sectionId ? { ...c, sectionId: null } : c))
      flash("Section supprimée")
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  // Add chapter (optionally in a section)
  const addChapter = async (sectionId?: string) => {
    if (!formationId) { flash("Erreur : Enregistrez la formation d'abord"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/formations/${formationId}/chapitres`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: sectionId || null }),
      })
      if (!res.ok) { flash("Erreur : Ajout chapitre échoué"); return }
      const chapter = await res.json()
      chapter.sectionId = sectionId || null
      setChapters((prev) => [...prev, chapter])
      setActiveChapterId(chapter.id)
      setMessage("")
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  // Save chapter
  const saveChapter = async (ch: Chapter) => {
    setSaving(true)
    setMessage("")
    try {
      const res = await fetch(`/api/chapitres/${ch.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ch.title,
          description: ch.description,
          content: ch.content,
          videoUrl: ch.videoUrl,
          videoDuration: ch.videoDuration,
          isPublished: ch.isPublished,
          order: ch.order,
          sectionId: ch.sectionId,
        }),
      })
      if (res.ok) flash("Chapitre enregistré")
      else flash("Erreur : Enregistrement du chapitre échoué")
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  // Delete chapter
  const deleteChapter = async (chapterId: string) => {
    if (!confirm("Supprimer ce chapitre ?")) return
    setSaving(true)
    try {
      await fetch(`/api/chapitres/${chapterId}`, { method: "DELETE" })
      setChapters((prev) => prev.filter((c) => c.id !== chapterId))
      if (activeChapterId === chapterId) setActiveChapterId(null)
      flash("Chapitre supprimé")
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  // Move chapter
  const moveChapter = (index: number, direction: "up" | "down") => {
    const sorted = [...chapters].sort((a, b) => a.order - b.order)
    const swapIndex = direction === "up" ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= sorted.length) return
    const tempOrder = sorted[index].order
    sorted[index].order = sorted[swapIndex].order
    sorted[swapIndex].order = tempOrder;
    [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]]
    setChapters(sorted)
    fetch(`/api/chapitres/${sorted[index].id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: sorted[index].order }),
    })
    fetch(`/api/chapitres/${sorted[swapIndex].id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: sorted[swapIndex].order }),
    })
  }

  // Update chapter locally
  const updateChapterLocal = (id: string, updates: Partial<Chapter>) => {
    setChapters((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c))
  }

  // Add attachment to chapter
  const addAttachment = async (chapterId: string, name: string, fileUrl: string, fileSize: number = 0) => {
    if (!name.trim() || !fileUrl.trim()) return
    try {
      const res = await fetch(`/api/chapitres/${chapterId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, fileUrl, fileSize }),
      })
      if (res.ok) {
        const att = await res.json()
        setChapters((prev) =>
          prev.map((c) =>
            c.id === chapterId ? { ...c, attachments: [...c.attachments, att] } : c
          )
        )
      }
    } catch {}
  }

  // Delete attachment from chapter
  const deleteAttachment = async (attachmentId: string, chapterId: string) => {
    try {
      await fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" })
      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapterId
            ? { ...c, attachments: c.attachments.filter((a) => a.id !== attachmentId) }
            : c
        )
      )
    } catch {}
  }

  // Formation-level attachments
  const handleFormationFileUpload = async (file: File) => {
    if (!formationId) { flash("Erreur : Enregistrez la formation d'abord"); return }
    setUploadingFormationFile(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/upload/file", { method: "POST", body: formData })
      if (!res.ok) { flash("Erreur : Upload échoué"); return }
      const data = await res.json()
      const attRes = await fetch(`/api/formations/${formationId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.originalName, fileUrl: data.url, fileSize: data.size }),
      })
      if (attRes.ok) {
        const att = await attRes.json()
        setFormationAttachments((prev) => [...prev, att])
        flash("Document racine ajouté")
      }
    } catch { flash("Erreur réseau") }
    finally { setUploadingFormationFile(false) }
  }

  const deleteFormationAttachment = async (attId: string) => {
    try {
      await fetch(`/api/formations/${formationId}/attachments?attachmentId=${attId}`, { method: "DELETE" })
      setFormationAttachments((prev) => prev.filter((a) => a.id !== attId))
    } catch {}
  }

  // Group chapters
  const rootChapters = chapters.filter((c) => !c.sectionId).sort((a, b) => a.order - b.order)
  const chaptersBySection = (sectionId: string) =>
    chapters.filter((c) => c.sectionId === sectionId).sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-6">
      {/* Banner with cover image */}
      {isEditing && coverImageUrl ? (
        <div className="relative h-[200px] rounded-xl overflow-hidden border border-border">
          <img src={coverImageUrl} alt={title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/20" />
          <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between">
            <h1 className="text-xl font-semibold text-white">{title || "Modifier la formation"}</h1>
            <button
              onClick={() => router.push("/super-admin/formations")}
              className="text-sm text-white/80 hover:text-white"
            >
              ← Retour
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            {isEditing ? "Modifier la formation" : "Nouvelle formation"}
          </h1>
          <button
            onClick={() => router.push("/super-admin/formations")}
            className="text-sm text-gray-400 hover:text-primary"
          >
            ← Retour
          </button>
        </div>
      )}

      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 ${message.includes("Erreur") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {message}
        </div>
      )}

      {/* Section 1 — Informations générales */}
      <div className="bg-white rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-base font-semibold">Informations générales</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Titre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la formation"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description de la formation..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary resize-none"
          />
        </div>

        {/* Image de couverture — upload fichier */}
        <div>
          <label className="block text-sm font-medium mb-1">Image de couverture</label>
          {coverImageUrl && (
            <div className="mb-3 relative inline-block">
              <img
                src={coverImageUrl}
                alt="Couverture"
                className="h-32 rounded-lg object-cover border border-border"
              />
              <button
                onClick={() => setCoverImageUrl("")}
                className="absolute top-1 right-1 bg-white rounded-full w-5 h-5 flex items-center justify-center text-xs text-red-500 shadow"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {uploadingCover ? "Upload..." : "Choisir une image"}
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleCoverUpload(file)
                e.target.value = ""
              }}
            />
            <span className="text-xs text-gray-400">JPG, PNG, WebP</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Statut</span>
            <button
              onClick={() => setIsPublished(!isPublished)}
              className={`relative w-10 h-5 rounded-full transition-colors ${isPublished ? "bg-green-500" : "bg-gray-200"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isPublished ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
            <Badge variant={isPublished ? "success" : "default"}>
              {isPublished ? "En ligne" : "Brouillon"}
            </Badge>
          </div>

          <button
            onClick={saveFormation}
            disabled={saving}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Section 2 — Documents racine de la formation */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Documents racine ({formationAttachments.length})</h2>
          <button
            onClick={() => formationFileRef.current?.click()}
            disabled={uploadingFormationFile || !formationId}
            className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {uploadingFormationFile ? "Upload..." : "+ Ajouter un document racine"}
          </button>
          <input
            ref={formationFileRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFormationFileUpload(file)
              e.target.value = ""
            }}
          />
        </div>
        {formationAttachments.length > 0 ? (
          <div className="space-y-1">
            {formationAttachments.map((att) => (
              <div key={att.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📄</span>
                  <span className="text-sm">{att.name}</span>
                  {att.fileSize > 0 && (
                    <span className="text-xs text-gray-400">({(att.fileSize / 1024 / 1024).toFixed(1)} MB)</span>
                  )}
                </div>
                <button onClick={() => deleteFormationAttachment(att.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-2">
            {formationId ? "Aucun document racine" : "Enregistrez la formation d'abord"}
          </p>
        )}
      </div>

      {/* Section 3 — Sections & Chapitres */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Contenu</h2>
          <div className="flex gap-2">
            <button
              onClick={addSection}
              disabled={saving || !formationId}
              className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              + Ajouter une section
            </button>
            <button
              onClick={() => addChapter()}
              disabled={saving || !formationId}
              className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              + Ajouter un chapitre
            </button>
          </div>
        </div>

        {!formationId && (
          <p className="text-sm text-gray-400 text-center py-4">Enregistrez la formation d'abord pour ajouter du contenu</p>
        )}

        {/* Root chapters (no section) */}
        {rootChapters.length > 0 && (
          <div className="space-y-1 mb-4">
            {rootChapters.map((ch, index) => (
              <ChapterRow
                key={ch.id}
                chapter={ch}
                index={index}
                total={chapters.length}
                isActive={ch.id === activeChapterId}
                onSelect={() => setActiveChapterId(ch.id === activeChapterId ? null : ch.id)}
                onMove={(dir) => moveChapter(chapters.indexOf(ch), dir)}
              />
            ))}
          </div>
        )}

        {/* Sections with their chapters */}
        {sections.map((section) => (
          <div key={section.id} className="mb-4 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1 mr-3">
                <input
                  value={section.title}
                  onChange={(e) => {
                    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, title: e.target.value } : s))
                  }}
                  onBlur={() => saveSection(section.id, { title: section.title })}
                  className="text-sm font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-full"
                  placeholder="Titre de la section"
                />
                <input
                  value={section.description || ""}
                  onChange={(e) => {
                    setSections((prev) => prev.map((s) => s.id === section.id ? { ...s, description: e.target.value } : s))
                  }}
                  onBlur={() => saveSection(section.id, { description: section.description })}
                  className="text-xs text-gray-400 bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-full mt-1"
                  placeholder="Description (optionnel)"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => addChapter(section.id)}
                  disabled={saving}
                  className="px-2 py-1 bg-gray-100 text-xs rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  + Chapitre
                </button>
                <button
                  onClick={() => deleteSection(section.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Supprimer
                </button>
              </div>
            </div>

            {chaptersBySection(section.id).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Aucun chapitre dans cette section</p>
            ) : (
              <div className="space-y-1">
                {chaptersBySection(section.id).map((ch, index) => (
                  <ChapterRow
                    key={ch.id}
                    chapter={ch}
                    index={index}
                    total={chaptersBySection(section.id).length}
                    isActive={ch.id === activeChapterId}
                    onSelect={() => setActiveChapterId(ch.id === activeChapterId ? null : ch.id)}
                    onMove={(dir) => moveChapter(chapters.indexOf(ch), dir)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Section 4 — Panneau édition chapitre */}
      {activeChapter && (
        <ChapterPanel
          chapter={activeChapter}
          onUpdate={(updates) => updateChapterLocal(activeChapter.id, updates)}
          onSave={() => saveChapter(chapters.find((c) => c.id === activeChapterId)!)}
          onDelete={() => deleteChapter(activeChapter.id)}
          onAddAttachment={(name, url, size) => addAttachment(activeChapter.id, name, url, size)}
          onDeleteAttachment={(attId) => deleteAttachment(attId, activeChapter.id)}
          saving={saving}
        />
      )}
    </div>
  )
}

/* ═══════════ CHAPTER ROW ═══════════ */

function ChapterRow({
  chapter,
  index,
  total,
  isActive,
  onSelect,
  onMove,
}: {
  chapter: Chapter
  index: number
  total: number
  isActive: boolean
  onSelect: () => void
  onMove: (dir: "up" | "down") => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
        isActive ? "bg-gray-100 border border-border" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 w-6 text-center">{index + 1}</span>
        <span className="text-sm font-medium">{chapter.title}</span>
        <Badge variant={chapter.isPublished ? "success" : "default"}>
          {chapter.isPublished ? "Publié" : "Brouillon"}
        </Badge>
      </div>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onMove("up")} disabled={index === 0} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-primary disabled:opacity-30">▲</button>
        <button onClick={() => onMove("down")} disabled={index === total - 1} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-primary disabled:opacity-30">▼</button>
      </div>
    </div>
  )
}

/* ═══════════ CHAPTER PANEL ═══════════ */

function ChapterPanel({
  chapter,
  onUpdate,
  onSave,
  onDelete,
  onAddAttachment,
  onDeleteAttachment,
  saving,
}: {
  chapter: Chapter
  onUpdate: (updates: Partial<Chapter>) => void
  onSave: () => void
  onDelete: () => void
  onAddAttachment: (name: string, url: string, size: number) => void
  onDeleteAttachment: (id: string) => void
  saving: boolean
}) {
  const [videoState, setVideoState] = useState<VideoUploadState>(chapter.videoUrl ? "ready" : "idle")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processingPct, setProcessingPct] = useState<number | null>(null)
  const [videoError, setVideoError] = useState("")
  const [uploadingFile, setUploadingFile] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [vimeoIdInput, setVimeoIdInput] = useState("")
  const [linkingVimeo, setLinkingVimeo] = useState(false)
  const [activeTab, setActiveTab] = useState<"contenu" | "exercices">("contenu")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachFileRef = useRef<HTMLInputElement>(null)
  const tusUploadRef = useRef<any>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
  }, [])

  const pollCountRef = useRef(0)
  const MAX_POLL_ATTEMPTS = 60 // 60 × 5s = 5 minutes max

  const pollProcessingStatus = useCallback((vimeoId: string) => {
    stopPolling()
    pollCountRef.current = 0
    pollingRef.current = setInterval(async () => {
      pollCountRef.current++
      if (pollCountRef.current > MAX_POLL_ATTEMPTS) {
        stopPolling()
        setVideoState("error")
        setVideoError("Le traitement de la vidéo prend trop de temps. Vérifiez dans quelques minutes.")
        return
      }
      try {
        const res = await fetch(`/api/upload/video/${vimeoId}/status`)
        const data = await res.json()
        if (data.status === "available") {
          stopPolling()
          setVideoState("ready")
          if (data.duration) onUpdate({ videoDuration: data.duration })
        } else if (data.status === "error") {
          stopPolling()
          setVideoState("error")
          setVideoError(data.error || "Erreur de traitement vidéo")
        } else {
          setProcessingPct(null)
        }
      } catch {
        // Keep polling on network error
      }
    }, 5000)
  }, [stopPolling, onUpdate])

  // Cleanup polling when component unmounts
  useEffect(() => {
    return () => { stopPolling() }
  }, [stopPolling])

  const handleVideoUpload = async (file: File) => {
    if (!file.type.startsWith("video/")) { setVideoError("Format de fichier non supporté"); return }
    const maxSize = 5 * 1024 * 1024 * 1024
    if (file.size > maxSize) { setVideoError("Fichier trop volumineux (max 5 Go)"); return }

    // Delete old video from Vimeo if replacing
    const oldVimeoId = chapter.videoUrl
    if (oldVimeoId) {
      fetch(`/api/upload/video/${oldVimeoId}`, { method: "DELETE" }).catch(() => {})
    }

    setVideoState("uploading")
    setUploadProgress(0)
    setVideoError("")

    try {
      // Step 1: Get upload URL from our API
      const initRes = await fetch("/api/upload/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
      })

      if (!initRes.ok) {
        const err = await initRes.json()
        setVideoState("error")
        setVideoError(err.error || "Erreur lors de la création de l'upload")
        return
      }

      const { uploadUrl, vimeoId } = await initRes.json()

      // Store the Vimeo ID as videoUrl
      onUpdate({ videoUrl: vimeoId })

      // Step 2: Upload via tus-js-client
      const { Upload } = await import("tus-js-client")
      const tusUpload = new Upload(file, {
        uploadUrl: uploadUrl,
        chunkSize: 50 * 1024 * 1024, // 50MB chunks
        retryDelays: [0, 1000, 3000, 5000],
        metadata: {
          filename: file.name,
          filetype: file.type,
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const pct = Math.round((bytesUploaded / bytesTotal) * 100)
          setUploadProgress(pct)
        },
        onSuccess: () => {
          setVideoState("processing")
          setProcessingPct(null)
          pollProcessingStatus(vimeoId)
        },
        onError: (error) => {
          setVideoState("error")
          setVideoError(error.message || "Erreur lors de l'upload")
        },
      })

      tusUploadRef.current = tusUpload
      tusUpload.start()
    } catch {
      setVideoState("error")
      setVideoError("Erreur réseau lors de l'upload")
    }
  }

  const handleCancelUpload = () => {
    if (tusUploadRef.current) {
      tusUploadRef.current.abort()
      tusUploadRef.current = null
    }
    setVideoState("idle")
    setUploadProgress(0)
  }

  const handleRemoveVideo = async () => {
    const oldVimeoId = chapter.videoUrl
    stopPolling()
    onUpdate({ videoUrl: null, videoDuration: 0 })
    setVideoState("idle")
    setUploadProgress(0)
    setProcessingPct(null)

    // Delete video from Vimeo (non-blocking)
    if (oldVimeoId) {
      fetch(`/api/upload/video/${oldVimeoId}`, { method: "DELETE" }).catch(() => {})
    }
  }

  const handleRetry = () => {
    setVideoState("idle")
    setVideoError("")
    fileInputRef.current?.click()
  }

  const handleLinkVimeoId = async () => {
    // Extract numeric ID from URL or plain ID
    const input = vimeoIdInput.trim()
    const match = input.match(/(?:vimeo\.com\/)?(\d+)/)
    const id = match?.[1]
    if (!id) {
      setVideoError("Entrez un ID Vimeo valide (ex: 123456789 ou https://vimeo.com/123456789)")
      return
    }

    setLinkingVimeo(true)
    setVideoError("")

    try {
      // Verify the video exists on Vimeo
      const res = await fetch(`/api/upload/video/${id}/status`)
      const data = await res.json()

      if (data.status === "error" && data.error === "Vidéo introuvable") {
        setVideoError("Cette vidéo n'existe pas sur votre compte Vimeo")
        setLinkingVimeo(false)
        return
      }

      // Save the Vimeo ID
      onUpdate({ videoUrl: id })
      if (data.duration) {
        onUpdate({ videoDuration: data.duration })
      }
      setVideoState("ready")
      setVimeoIdInput("")
    } catch {
      setVideoError("Erreur lors de la vérification de la vidéo Vimeo")
    } finally {
      setLinkingVimeo(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleVideoUpload(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/upload/file", { method: "POST", body: formData })
      if (!res.ok) {
        const err = await res.json()
        alert("Erreur : " + (err.error || "Upload échoué"))
        return
      }
      const data = await res.json()
      onAddAttachment(data.originalName, data.url, data.size)
    } catch {
      alert("Erreur réseau lors de l'upload")
    } finally {
      setUploadingFile(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Édition du chapitre</h2>
        <button onClick={onDelete} className="text-sm text-red-500 hover:text-red-700 transition-colors">
          Supprimer ce chapitre
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("contenu")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "contenu" ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Contenu
        </button>
        <button
          onClick={() => setActiveTab("exercices")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "exercices" ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Exercices
        </button>
      </div>

      {activeTab === "contenu" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Titre</label>
              <input
                value={chapter.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description courte</label>
              <input
                value={chapter.description || ""}
                onChange={(e) => onUpdate({ description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Contenu texte</label>
            <textarea
              value={chapter.content || ""}
              onChange={(e) => onUpdate({ content: e.target.value })}
              placeholder="Contenu du chapitre..."
              rows={6}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Vidéo Vimeo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Vidéo</h3>
              {chapter.videoUrl && videoState === "ready" && (
                <button
                  onClick={handleRemoveVideo}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Supprimer la vidéo
                </button>
              )}
            </div>

            {/* Ready state — show preview */}
            {videoState === "ready" && chapter.videoUrl && (
              <div className="space-y-3">
                <div className="aspect-video rounded-xl overflow-hidden border border-border">
                  <iframe
                    src={`https://player.vimeo.com/video/${chapter.videoUrl}?title=0&byline=0&portrait=0&dnt=1&outro=0`}
                    style={{ border: "none", width: "100%", height: "100%" }}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400">Vimeo ID : {chapter.videoUrl}</p>
                  <button
                    onClick={() => { setVideoState("idle"); fileInputRef.current?.click() }}
                    className="px-3 py-1.5 bg-gray-100 text-xs rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Remplacer la vidéo
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Durée vidéo (secondes)</label>
                  <input
                    type="number"
                    value={chapter.videoDuration || 0}
                    onChange={(e) => onUpdate({ videoDuration: parseInt(e.target.value) || 0 })}
                    min={0}
                    className="w-32 px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}

            {/* Uploading state */}
            {videoState === "uploading" && (
              <div className="border-2 border-dashed border-primary bg-blue-50 rounded-xl p-8 text-center space-y-3">
                <p className="text-sm font-medium text-gray-700">Upload en cours...</p>
                <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-2.5">
                  <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-sm text-gray-500">{uploadProgress}%</p>
                <button
                  onClick={handleCancelUpload}
                  className="px-3 py-1.5 bg-white border border-border text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
              </div>
            )}

            {/* Processing state */}
            {videoState === "processing" && (
              <div className="border-2 border-dashed border-yellow-400 bg-yellow-50 rounded-xl p-8 text-center space-y-3">
                <div className="inline-block w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-yellow-700">Vidéo en cours de traitement...</p>
                {processingPct !== null && (
                  <p className="text-xs text-yellow-600">{processingPct}% terminé</p>
                )}
                <p className="text-xs text-gray-400">Vous pouvez continuer l'édition, la vidéo sera disponible dans quelques instants.</p>
              </div>
            )}

            {/* Error state */}
            {videoState === "error" && (
              <div className="border-2 border-dashed border-red-300 bg-red-50 rounded-xl p-8 text-center space-y-3">
                <p className="text-sm font-medium text-red-600">{videoError || "Erreur lors de l'upload"}</p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90"
                >
                  Réessayer
                </button>
              </div>
            )}

            {/* Idle state — upload or link */}
            {videoState === "idle" && !chapter.videoUrl && (
              <div className="space-y-3">
                {/* Option 1: Upload file */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                    dragActive ? "border-primary bg-blue-50" : "border-border hover:border-gray-300"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-xl bg-warm-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-warm-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-600 font-medium">Uploader une vidéo</p>
                    <p className="text-xs text-gray-400">Déposez votre fichier ou cliquez — MP4, MOV, AVI — 5 Go max</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-msvideo,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleVideoUpload(file)
                      e.target.value = ""
                    }}
                  />
                </div>

                {/* Separator */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs text-gray-400 font-medium">ou</span>
                  <div className="flex-1 border-t border-border" />
                </div>

                {/* Option 2: Link existing Vimeo video */}
                <div className="border border-border rounded-xl p-4">
                  <p className="text-sm text-gray-600 font-medium mb-2">Lier une vidéo Vimeo existante</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={vimeoIdInput}
                      onChange={(e) => setVimeoIdInput(e.target.value)}
                      placeholder="ID Vimeo ou URL (ex: 123456789)"
                      className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
                      onKeyDown={(e) => { if (e.key === "Enter") handleLinkVimeoId() }}
                    />
                    <button
                      onClick={handleLinkVimeoId}
                      disabled={!vimeoIdInput.trim() || linkingVimeo}
                      className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
                    >
                      {linkingVimeo ? "Vérification..." : "Lier"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Collez l'ID ou l'URL d'une vidéo déjà présente sur votre compte Vimeo</p>
                </div>

                {videoError && (
                  <p className="text-sm text-red-500 px-1">{videoError}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Publié</span>
            <button
              onClick={() => onUpdate({ isPublished: !chapter.isPublished })}
              className={`relative w-10 h-5 rounded-full transition-colors ${chapter.isPublished ? "bg-green-500" : "bg-gray-200"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${chapter.isPublished ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Pièces jointes */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Pièces jointes ({chapter.attachments.length})</h3>
            {chapter.attachments.length > 0 && (
              <div className="space-y-1 mb-3">
                {chapter.attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📄</span>
                      <span className="text-sm">{att.name}</span>
                      {att.fileSize > 0 && (
                        <span className="text-xs text-gray-400">({(att.fileSize / 1024 / 1024).toFixed(1)} MB)</span>
                      )}
                    </div>
                    <button onClick={() => onDeleteAttachment(att.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => attachFileRef.current?.click()}
                disabled={uploadingFile}
                className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {uploadingFile ? "Upload..." : "+ Uploader un fichier"}
              </button>
              <input
                ref={attachFileRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                  e.target.value = ""
                }}
              />
              <p className="text-xs text-gray-400 self-center">PDF, DOC, XLS, PPT, JPG, PNG — max 50 MB</p>
            </div>
          </div>
        </>
      ) : (
        <ExercisesTab chapterId={chapter.id} />
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : "Enregistrer chapitre"}
        </button>
      </div>
    </div>
  )
}

/* ═══════════ EXERCISES TAB ═══════════ */

interface ExerciseLocal {
  id: string
  type: string
  title: string
  instructions: string | null
  order: number
  questions: QuestionLocal[]
}

interface QuestionLocal {
  id: string
  text: string
  type: string
  order: number
  choices: ChoiceLocal[]
}

interface ChoiceLocal {
  id?: string
  text: string
  isCorrect: boolean
}

function ExercisesTab({ chapterId }: { chapterId: string }) {
  const [exercises, setExercises] = useState<ExerciseLocal[]>([])
  const [loading, setLoading] = useState(true)
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null)
  const [savingEx, setSavingEx] = useState(false)
  const [msg, setMsg] = useState("")

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000) }

  // Load exercises
  const loadExercises = async () => {
    try {
      const res = await fetch(`/api/chapitres/${chapterId}/exercises`)
      if (res.ok) setExercises(await res.json())
    } catch {}
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { loadExercises() })

  const addExercise = async (type: string) => {
    setSavingEx(true)
    try {
      const res = await fetch(`/api/chapitres/${chapterId}/exercises`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      if (res.ok) {
        const ex = await res.json()
        setExercises((prev) => [...prev, ex])
        setActiveExerciseId(ex.id)
        flash("Exercice ajouté")
      }
    } catch { flash("Erreur réseau") }
    finally { setSavingEx(false) }
  }

  const deleteExercise = async (exId: string) => {
    if (!confirm("Supprimer cet exercice ?")) return
    try {
      await fetch(`/api/exercises/${exId}`, { method: "DELETE" })
      setExercises((prev) => prev.filter((e) => e.id !== exId))
      if (activeExerciseId === exId) setActiveExerciseId(null)
      flash("Exercice supprimé")
    } catch { flash("Erreur réseau") }
  }

  const saveExercise = async (ex: ExerciseLocal) => {
    setSavingEx(true)
    try {
      await fetch(`/api/exercises/${ex.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: ex.title, instructions: ex.instructions, type: ex.type }),
      })
      flash("Exercice enregistré")
    } catch { flash("Erreur réseau") }
    finally { setSavingEx(false) }
  }

  const updateExercise = (exId: string, updates: Partial<ExerciseLocal>) => {
    setExercises((prev) => prev.map((e) => e.id === exId ? { ...e, ...updates } : e))
  }

  // Question management
  const addQuestion = async (exId: string) => {
    const ex = exercises.find((e) => e.id === exId)
    if (!ex) return
    const defaultChoices = ex.type === "VRAI_FAUX"
      ? [{ text: "Vrai", isCorrect: true }, { text: "Faux", isCorrect: false }]
      : ex.type === "QCM"
      ? [{ text: "Choix 1", isCorrect: true }, { text: "Choix 2", isCorrect: false }]
      : []

    try {
      const res = await fetch(`/api/exercises/${exId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Nouvelle question", type: ex.type, choices: defaultChoices }),
      })
      if (res.ok) {
        const q = await res.json()
        setExercises((prev) =>
          prev.map((e) => e.id === exId ? { ...e, questions: [...e.questions, q] } : e)
        )
      }
    } catch {}
  }

  const deleteQuestion = async (exId: string, qId: string) => {
    try {
      await fetch(`/api/questions/${qId}`, { method: "DELETE" })
      setExercises((prev) =>
        prev.map((e) => e.id === exId ? { ...e, questions: e.questions.filter((q) => q.id !== qId) } : e)
      )
    } catch {}
  }

  const updateQuestion = (exId: string, qId: string, updates: Partial<QuestionLocal>) => {
    setExercises((prev) =>
      prev.map((e) => e.id === exId
        ? { ...e, questions: e.questions.map((q) => q.id === qId ? { ...q, ...updates } : q) }
        : e
      )
    )
  }

  const saveQuestion = async (qId: string, q: QuestionLocal) => {
    try {
      await fetch(`/api/questions/${qId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q.text, choices: q.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })) }),
      })
      flash("Question enregistrée")
    } catch { flash("Erreur réseau") }
  }

  if (loading) return <p className="text-sm text-gray-400">Chargement des exercices...</p>

  const activeEx = exercises.find((e) => e.id === activeExerciseId)

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`text-sm rounded-lg px-3 py-2 ${msg.includes("Erreur") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {msg}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Ajouter un exercice :</span>
        <button onClick={() => addExercise("QCM")} disabled={savingEx} className="px-2 py-1 bg-gray-100 text-xs rounded hover:bg-gray-200 disabled:opacity-50">QCM</button>
        <button onClick={() => addExercise("VRAI_FAUX")} disabled={savingEx} className="px-2 py-1 bg-gray-100 text-xs rounded hover:bg-gray-200 disabled:opacity-50">Vrai/Faux</button>
        <button onClick={() => addExercise("REDACTION")} disabled={savingEx} className="px-2 py-1 bg-gray-100 text-xs rounded hover:bg-gray-200 disabled:opacity-50">Rédaction</button>
      </div>

      {exercises.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Aucun exercice pour ce chapitre</p>
      )}

      {/* Exercise list */}
      <div className="space-y-1">
        {exercises.map((ex) => (
          <div
            key={ex.id}
            onClick={() => setActiveExerciseId(ex.id === activeExerciseId ? null : ex.id)}
            className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
              ex.id === activeExerciseId ? "bg-gray-100 border border-border" : "hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <Badge variant="default">{ex.type === "QCM" ? "QCM" : ex.type === "VRAI_FAUX" ? "V/F" : "Réd."}</Badge>
              <span className="text-sm font-medium">{ex.title}</span>
              <span className="text-xs text-gray-400">({ex.questions.length} question{ex.questions.length > 1 ? "s" : ""})</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); deleteExercise(ex.id) }}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>

      {/* Exercise detail editor */}
      {activeEx && (
        <div className="border border-border rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Titre</label>
              <input
                value={activeEx.title}
                onChange={(e) => updateExercise(activeEx.id, { title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={activeEx.type}
                onChange={(e) => updateExercise(activeEx.id, { type: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
              >
                <option value="QCM">QCM</option>
                <option value="VRAI_FAUX">Vrai / Faux</option>
                <option value="REDACTION">Rédaction</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Instructions</label>
            <textarea
              value={activeEx.instructions || ""}
              onChange={(e) => updateExercise(activeEx.id, { instructions: e.target.value })}
              placeholder="Instructions de l'exercice..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary resize-none"
            />
          </div>

          <button
            onClick={() => saveExercise(activeEx)}
            disabled={savingEx}
            className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {savingEx ? "..." : "Enregistrer exercice"}
          </button>

          {/* Questions */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Questions ({activeEx.questions.length})</h4>
              <button
                onClick={() => addQuestion(activeEx.id)}
                className="px-2 py-1 bg-gray-100 text-xs rounded hover:bg-gray-200"
              >
                + Ajouter une question
              </button>
            </div>

            <div className="space-y-3">
              {activeEx.questions.map((q, qi) => (
                <div key={q.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Question {qi + 1}</span>
                    <button
                      onClick={() => deleteQuestion(activeEx.id, q.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Supprimer
                    </button>
                  </div>

                  <textarea
                    value={q.text}
                    onChange={(e) => updateQuestion(activeEx.id, q.id, { text: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary resize-none"
                  />

                  {/* Choices for QCM/VRAI_FAUX */}
                  {activeEx.type !== "REDACTION" && (
                    <div className="space-y-1 ml-4">
                      {q.choices.map((c, ci) => (
                        <div key={ci} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={c.isCorrect}
                            onChange={() => {
                              const newChoices = q.choices.map((ch, i) => ({ ...ch, isCorrect: i === ci }))
                              updateQuestion(activeEx.id, q.id, { choices: newChoices })
                            }}
                            className="accent-green-500"
                          />
                          <input
                            value={c.text}
                            onChange={(e) => {
                              const newChoices = [...q.choices]
                              newChoices[ci] = { ...newChoices[ci], text: e.target.value }
                              updateQuestion(activeEx.id, q.id, { choices: newChoices })
                            }}
                            className="flex-1 px-2 py-1 text-sm border border-border rounded outline-none focus:border-primary"
                          />
                          {activeEx.type === "QCM" && (
                            <button
                              onClick={() => {
                                const newChoices = q.choices.filter((_, i) => i !== ci)
                                updateQuestion(activeEx.id, q.id, { choices: newChoices })
                              }}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {activeEx.type === "QCM" && (
                        <button
                          onClick={() => {
                            const newChoices = [...q.choices, { text: `Choix ${q.choices.length + 1}`, isCorrect: false }]
                            updateQuestion(activeEx.id, q.id, { choices: newChoices })
                          }}
                          className="text-xs text-primary hover:underline ml-6"
                        >
                          + Ajouter un choix
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => saveQuestion(q.id, q)}
                    className="px-2 py-1 bg-gray-100 text-xs rounded hover:bg-gray-200"
                  >
                    Sauvegarder question
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
