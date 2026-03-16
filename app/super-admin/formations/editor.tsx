"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Badge from "@/components/ui/Badge"

interface Attachment {
  id: string
  name: string
  fileUrl: string
  fileSize: number
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
  attachments: Attachment[]
}

interface Formation {
  id?: string
  title: string
  description: string | null
  coverImageUrl: string | null
  isPublished: boolean
  chapters: Chapter[]
}

export default function FormationEditor({ initial }: { initial?: Formation }) {
  const router = useRouter()
  const isEditing = !!initial?.id

  const [title, setTitle] = useState(initial?.title || "")
  const [description, setDescription] = useState(initial?.description || "")
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.coverImageUrl || "")
  const [isPublished, setIsPublished] = useState(initial?.isPublished || false)
  const [chapters, setChapters] = useState<Chapter[]>(initial?.chapters || [])
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [formationId, setFormationId] = useState(initial?.id || "")

  const activeChapter = chapters.find((c) => c.id === activeChapterId) || null

  // Save formation
  const saveFormation = async () => {
    if (!title.trim()) { setMessage("Le titre est requis"); return }
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
      if (!res.ok) { setMessage("Erreur lors de l'enregistrement"); return }
      const data = await res.json()
      if (!formationId) {
        setFormationId(data.id)
        router.replace(`/super-admin/formations/${data.id}/modifier`)
      }
      setMessage("Formation enregistrée")
    } catch { setMessage("Erreur réseau") }
    finally { setSaving(false) }
  }

  // Add chapter
  const addChapter = async () => {
    if (!formationId) { setMessage("Enregistrez la formation d'abord"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/formations/${formationId}/chapitres`, { method: "POST" })
      if (!res.ok) { setMessage("Erreur lors de l'ajout"); return }
      const chapter = await res.json()
      setChapters((prev) => [...prev, chapter])
      setActiveChapterId(chapter.id)
      setMessage("")
    } catch { setMessage("Erreur réseau") }
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
        }),
      })
      if (res.ok) setMessage("Chapitre enregistré")
      else setMessage("Erreur lors de l'enregistrement du chapitre")
    } catch { setMessage("Erreur réseau") }
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
      setMessage("Chapitre supprimé")
    } catch { setMessage("Erreur réseau") }
    finally { setSaving(false) }
  }

  // Move chapter
  const moveChapter = (index: number, direction: "up" | "down") => {
    const newChapters = [...chapters]
    const swapIndex = direction === "up" ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= newChapters.length) return
    const tempOrder = newChapters[index].order
    newChapters[index].order = newChapters[swapIndex].order
    newChapters[swapIndex].order = tempOrder;
    [newChapters[index], newChapters[swapIndex]] = [newChapters[swapIndex], newChapters[index]]
    setChapters(newChapters)
    // Save new orders
    fetch(`/api/chapitres/${newChapters[index].id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: newChapters[index].order }),
    })
    fetch(`/api/chapitres/${newChapters[swapIndex].id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: newChapters[swapIndex].order }),
    })
  }

  // Update chapter locally
  const updateChapterLocal = (id: string, updates: Partial<Chapter>) => {
    setChapters((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c))
  }

  // Add attachment
  const addAttachment = async (chapterId: string, name: string, fileUrl: string) => {
    if (!name.trim() || !fileUrl.trim()) return
    try {
      const res = await fetch(`/api/chapitres/${chapterId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, fileUrl }),
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

  // Delete attachment
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

  return (
    <div className="space-y-6">
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

        <div>
          <label className="block text-sm font-medium mb-1">Image de couverture (URL)</label>
          <input
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
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

      {/* Section 2 — Chapitres */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Chapitres ({chapters.length})</h2>
          <button
            onClick={addChapter}
            disabled={saving || !formationId}
            className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            + Ajouter un chapitre
          </button>
        </div>

        {chapters.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            {formationId ? "Aucun chapitre — ajoutez votre premier chapitre" : "Enregistrez la formation d'abord pour ajouter des chapitres"}
          </p>
        ) : (
          <div className="space-y-1">
            {chapters.map((ch, index) => (
              <div
                key={ch.id}
                onClick={() => setActiveChapterId(ch.id === activeChapterId ? null : ch.id)}
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  ch.id === activeChapterId ? "bg-gray-100 border border-border" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-6 text-center">{index + 1}</span>
                  <span className="text-sm font-medium">{ch.title}</span>
                  <Badge variant={ch.isPublished ? "success" : "default"}>
                    {ch.isPublished ? "Publié" : "Brouillon"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => moveChapter(index, "up")}
                    disabled={index === 0}
                    className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-primary disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveChapter(index, "down")}
                    disabled={index === chapters.length - 1}
                    className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-primary disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3 — Panneau édition chapitre */}
      {activeChapter && (
        <ChapterPanel
          chapter={activeChapter}
          onUpdate={(updates) => updateChapterLocal(activeChapter.id, updates)}
          onSave={() => saveChapter(chapters.find((c) => c.id === activeChapterId)!)}
          onDelete={() => deleteChapter(activeChapter.id)}
          onAddAttachment={(name, url) => addAttachment(activeChapter.id, name, url)}
          onDeleteAttachment={(attId) => deleteAttachment(attId, activeChapter.id)}
          saving={saving}
        />
      )}
    </div>
  )
}

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
  onAddAttachment: (name: string, url: string) => void
  onDeleteAttachment: (id: string) => void
  saving: boolean
}) {
  const [newAttName, setNewAttName] = useState("")
  const [newAttUrl, setNewAttUrl] = useState("")

  const handleAddAttachment = () => {
    if (!newAttName.trim() || !newAttUrl.trim()) return
    onAddAttachment(newAttName, newAttUrl)
    setNewAttName("")
    setNewAttUrl("")
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Édition du chapitre</h2>
        <button
          onClick={onDelete}
          className="text-sm text-red-500 hover:text-red-700 transition-colors"
        >
          Supprimer ce chapitre
        </button>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">URL vidéo</label>
          <input
            value={chapter.videoUrl || ""}
            onChange={(e) => onUpdate({ videoUrl: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Durée vidéo (minutes)</label>
          <input
            type="number"
            value={chapter.videoDuration || 0}
            onChange={(e) => onUpdate({ videoDuration: parseInt(e.target.value) || 0 })}
            min={0}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
        </div>
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
                  <span className="text-xs text-gray-400 truncate max-w-[200px]">{att.fileUrl}</span>
                </div>
                <button
                  onClick={() => onDeleteAttachment(att.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newAttName}
            onChange={(e) => setNewAttName(e.target.value)}
            placeholder="Nom du fichier"
            className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
          <input
            value={newAttUrl}
            onChange={(e) => setNewAttUrl(e.target.value)}
            placeholder="URL du fichier"
            className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
          <button
            onClick={handleAddAttachment}
            className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            + Ajouter
          </button>
        </div>
      </div>

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
