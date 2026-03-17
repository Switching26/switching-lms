"use client"

import { useState } from "react"
import Link from "next/link"
import Badge from "@/components/ui/Badge"

interface FormationItem {
  id: string
  title: string
  coverImageUrl: string | null
  isPublished: boolean
  deletedAt: string | null
  chaptersCount: number
  enrollmentsCount: number
}

function CoverThumb({ url, title, size = "sm" }: { url: string | null; title: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-[60px] h-[60px]" : "w-full aspect-video"
  if (url) {
    return (
      <div className={`${dim} rounded-lg overflow-hidden flex-shrink-0 bg-gray-100`}>
        <img src={url} alt={title} className="w-full h-full object-cover" />
      </div>
    )
  }
  const initials = title.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
  return (
    <div className={`${dim} rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0`}>
      <span className="text-gray-400 font-semibold text-sm">{initials}</span>
    </div>
  )
}

export default function FormationsList({ formations }: { formations: FormationItem[] }) {
  const [tab, setTab] = useState<"active" | "trash">("active")
  const [items, setItems] = useState(formations)
  const [modal, setModal] = useState<{ type: "soft" | "permanent"; formation: FormationItem } | null>(null)
  const [loading, setLoading] = useState(false)

  const active = items.filter((f) => !f.deletedAt)
  const trashed = items.filter((f) => f.deletedAt)
  const displayed = tab === "active" ? active : trashed

  const softDelete = async (f: FormationItem) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/formations/${f.id}`, { method: "DELETE" })
      if (res.ok) {
        setItems((prev) => prev.map((x) => x.id === f.id ? { ...x, deletedAt: new Date().toISOString() } : x))
      }
    } catch {}
    setLoading(false)
    setModal(null)
  }

  const restore = async (f: FormationItem) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/formations/${f.id}/restore`, { method: "POST" })
      if (res.ok) {
        setItems((prev) => prev.map((x) => x.id === f.id ? { ...x, deletedAt: null } : x))
      }
    } catch {}
    setLoading(false)
  }

  const permanentDelete = async (f: FormationItem) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/formations/${f.id}/permanent`, { method: "DELETE" })
      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.id !== f.id))
      }
    } catch {}
    setLoading(false)
    setModal(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Formations</h1>
        <Link
          href="/super-admin/formations/nouvelle"
          className="px-4 py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 transition-opacity text-center sm:w-auto"
          style={{ minHeight: 44 }}
        >
          + Nouvelle formation
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "active" ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Actives ({active.length})
        </button>
        <button
          onClick={() => setTab("trash")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "trash" ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Corbeille ({trashed.length})
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {tab === "active" ? (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {active.map((f) => (
                <div key={f.id} className="p-4 flex items-start gap-3">
                  <CoverThumb url={f.coverImageUrl} title={f.title} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant={f.isPublished ? "success" : "default"}>
                        {f.isPublished ? "En ligne" : "Brouillon"}
                      </Badge>
                      <span className="text-xs text-gray-400">{f.chaptersCount} ch. · {f.enrollmentsCount} appr.</span>
                    </div>
                    <div className="flex gap-4 mt-2">
                      <Link href={`/super-admin/formations/${f.id}/modifier`} className="text-gray-400 hover:text-primary text-sm" title="Modifier">✏️</Link>
                      <Link href={`/super-admin/formations/${f.id}/preview`} className="text-gray-400 hover:text-primary text-sm" title="Aperçu">👁</Link>
                      <button onClick={() => setModal({ type: "soft", formation: f })} className="text-gray-400 hover:text-red-500 text-sm" title="Supprimer">🗑</button>
                    </div>
                  </div>
                </div>
              ))}
              {active.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  Aucune formation — créez votre première formation
                </div>
              )}
            </div>
            {/* Desktop table */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 w-[80px]"></th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Titre</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Chapitres</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Apprenants</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Statut</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((f) => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <CoverThumb url={f.coverImageUrl} title={f.title} />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{f.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{f.chaptersCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{f.enrollmentsCount}</td>
                    <td className="px-4 py-3">
                      <Badge variant={f.isPublished ? "success" : "default"}>
                        {f.isPublished ? "En ligne" : "Brouillon"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 items-center">
                        <Link href={`/super-admin/formations/${f.id}/modifier`} className="text-gray-400 hover:text-primary text-sm transition-colors" title="Modifier">✏️</Link>
                        <Link href={`/super-admin/formations/${f.id}/preview`} className="text-gray-400 hover:text-primary text-sm transition-colors" title="Aperçu">👁</Link>
                        <button onClick={() => setModal({ type: "soft", formation: f })} className="text-gray-400 hover:text-red-500 text-sm transition-colors" title="Supprimer">🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {active.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                      Aucune formation — créez votre première formation
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        ) : (
          <div className="divide-y divide-gray-50">
            {trashed.map((f) => (
              <div key={f.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <CoverThumb url={f.coverImageUrl} title={f.title} />
                  <div>
                    <p className="text-sm font-medium text-gray-500 line-through">{f.title}</p>
                    <Badge variant="error">
                      Supprimée le {new Date(f.deletedAt!).toLocaleDateString("fr-FR")}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => restore(f)}
                    disabled={loading}
                    className="px-3 py-1.5 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    ↩ Restaurer
                  </button>
                  <button
                    onClick={() => setModal({ type: "permanent", formation: f })}
                    disabled={loading}
                    className="px-3 py-1.5 bg-red-50 text-red-600 text-sm rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    🗑 Supprimer définitivement
                  </button>
                </div>
              </div>
            ))}
            {trashed.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                La corbeille est vide
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-border p-6 max-w-md w-full mx-4 space-y-4">
            {modal.type === "soft" ? (
              <>
                <h3 className="text-base font-semibold">Supprimer la formation</h3>
                <p className="text-sm text-gray-600">
                  Êtes-vous sûr de vouloir supprimer <strong>{modal.formation.title}</strong> ?
                  La formation sera placée dans la corbeille.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setModal(null)}
                    className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => softDelete(modal.formation)}
                    disabled={loading}
                    className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {loading ? "..." : "Mettre à la corbeille"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-red-600">Suppression définitive</h3>
                <p className="text-sm text-gray-600">
                  Cette action est irréversible. La formation <strong>{modal.formation.title}</strong> et
                  tous ses chapitres seront supprimés définitivement.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setModal(null)}
                    className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => permanentDelete(modal.formation)}
                    disabled={loading}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? "..." : "Supprimer définitivement"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
