"use client"

import { useMemo, useState } from "react"
import Badge from "@/components/ui/Badge"
import type { RiseUpMigrationFormationStat, RiseUpMigrationLearner } from "@/lib/data/riseup-migration"

type StatusFilter = "all" | "silent" | "active" | "notified"
type ProgressFilter = "all" | "none" | "started" | "advanced"

function formatDate(value: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function formatDuration(seconds: number) {
  if (!seconds) return "0 min"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  if (hours <= 0) return `${minutes} min`
  return `${hours} h ${minutes.toString().padStart(2, "0")}`
}

function statusBadge(learner: RiseUpMigrationLearner) {
  if (learner.silentStatus === "active") return <Badge variant="blue">Compte actif</Badge>
  if (learner.silentStatus === "notified") return <Badge variant="warning">Email/token détecté</Badge>
  return <Badge variant="success">Silencieux</Badge>
}

function progressFilterMatch(learner: RiseUpMigrationLearner, filter: ProgressFilter) {
  if (filter === "none") return learner.progressPercent === 0
  if (filter === "started") return learner.progressPercent > 0 && learner.progressPercent < 75
  if (filter === "advanced") return learner.progressPercent >= 75
  return true
}

export default function RiseUpMigrationTable({
  learners,
  formationStats,
}: {
  learners: RiseUpMigrationLearner[]
  formationStats: RiseUpMigrationFormationStat[]
}) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [progress, setProgress] = useState<ProgressFilter>("all")
  const [formationId, setFormationId] = useState("all")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return learners.filter((learner) => {
      if (status !== "all" && learner.silentStatus !== status) return false
      if (!progressFilterMatch(learner, progress)) return false
      if (formationId !== "all" && !learner.formations.some((formation) => formation.id === formationId)) return false
      if (!q) return true

      return [
        learner.fullName,
        learner.email,
        learner.reference || "",
        learner.partnerName,
        ...learner.formations.map((formation) => formation.title),
      ].some((value) => value.toLowerCase().includes(q))
    })
  }, [formationId, learners, progress, search, status])

  return (
    <div className="bg-white rounded-2xl border border-ink-10 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-ink-10 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label htmlFor="riseup-search" className="block text-xs font-semibold uppercase tracking-wide text-ink-50 mb-1.5">
              Recherche
            </label>
            <input
              id="riseup-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, email, référence, formation..."
              className="w-full rounded-xl border border-ink-10 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:w-[720px]">
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wide text-ink-50 mb-1.5">Statut</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className="w-full rounded-xl border border-ink-10 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              >
                <option value="all">Tous</option>
                <option value="silent">Silencieux</option>
                <option value="active">Compte actif</option>
                <option value="notified">Email/token détecté</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wide text-ink-50 mb-1.5">Progression</span>
              <select
                value={progress}
                onChange={(event) => setProgress(event.target.value as ProgressFilter)}
                className="w-full rounded-xl border border-ink-10 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              >
                <option value="all">Toutes</option>
                <option value="none">0%</option>
                <option value="started">1 à 74%</option>
                <option value="advanced">75% et plus</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wide text-ink-50 mb-1.5">Formation</span>
              <select
                value={formationId}
                onChange={(event) => setFormationId(event.target.value)}
                className="w-full rounded-xl border border-ink-10 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              >
                <option value="all">Toutes</option>
                {formationStats.map((formation) => (
                  <option key={formation.id} value={formation.id}>
                    {formation.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-50">
          <span className="font-medium text-ink">{filtered.length}</span>
          <span>apprenant{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}</span>
          <span className="hidden sm:inline">·</span>
          <span>Aucune action d'envoi ou d'activation sur cette vue</span>
        </div>
      </div>

      <div className="md:hidden divide-y divide-ink-10">
        {filtered.map((learner) => (
          <div key={learner.id} className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-ink truncate">{learner.fullName}</div>
                <div className="text-xs text-ink-50 break-all mt-1">{learner.email}</div>
                <div className="text-[11px] text-ink-40 font-mono mt-1">{learner.reference}</div>
              </div>
              <div className="shrink-0">{statusBadge(learner)}</div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-ink">Progression reprise</span>
                <span className="text-ink-50">{learner.completedChapters}/{learner.totalChapters}</span>
              </div>
              <div className="h-2 rounded-full bg-ink-10 overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${learner.progressPercent}%` }} />
              </div>
              <div className="text-xs text-ink-50 mt-1">{learner.progressPercent}% · {formatDuration(learner.timeSpentSeconds)}</div>
            </div>

            <div className="space-y-2">
              {learner.formations.map((formation) => (
                <div key={formation.id} className="rounded-lg border border-ink-10 px-3 py-2">
                  <div className="font-medium text-ink text-sm leading-snug">{formation.title}</div>
                  <div className="text-xs text-ink-50 mt-1">
                    {formation.completedChapters}/{formation.totalChapters} chapitres · {formation.progressPercent}%
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-surface-subtle px-3 py-2">
                <div className="text-ink-40">Compte</div>
                <div className="text-ink font-medium mt-0.5">{learner.isActive ? "Actif" : "Inactif"}</div>
              </div>
              <div className="rounded-lg bg-surface-subtle px-3 py-2">
                <div className="text-ink-40">Dernière connexion</div>
                <div className="text-ink font-medium mt-0.5">{formatDate(learner.lastLoginAt)}</div>
              </div>
              <div className="rounded-lg bg-surface-subtle px-3 py-2">
                <div className="text-ink-40">Emails</div>
                <div className="text-ink font-medium mt-0.5">{learner.emailCount}</div>
              </div>
              <div className="rounded-lg bg-surface-subtle px-3 py-2">
                <div className="text-ink-40">Tokens</div>
                <div className="text-ink font-medium mt-0.5">{learner.tokenCount}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-[1080px] w-full text-sm">
          <thead className="bg-surface-subtle text-left text-xs uppercase tracking-wide text-ink-50">
            <tr>
              <th className="px-4 py-3 font-semibold">Apprenant</th>
              <th className="px-4 py-3 font-semibold">Compte</th>
              <th className="px-4 py-3 font-semibold">Formations</th>
              <th className="px-4 py-3 font-semibold">Progression reprise</th>
              <th className="px-4 py-3 font-semibold">Silence email</th>
              <th className="px-4 py-3 font-semibold">Dates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-10">
            {filtered.map((learner) => (
              <tr key={learner.id} className="align-top hover:bg-surface-subtle/60">
                <td className="px-4 py-4">
                  <div className="font-semibold text-ink">{learner.fullName}</div>
                  <div className="text-xs text-ink-50 break-all mt-1">{learner.email}</div>
                  <div className="text-[11px] text-ink-40 font-mono mt-1">{learner.reference}</div>
                </td>
                <td className="px-4 py-4">
                  <div>{statusBadge(learner)}</div>
                  <div className="text-xs text-ink-50 mt-2">
                    {learner.isActive ? "Actif" : "Inactif"} · {learner.partnerName}
                  </div>
                  <div className="text-xs text-ink-40 mt-1">Dernière connexion : {formatDate(learner.lastLoginAt)}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-2">
                    {learner.formations.map((formation) => (
                      <div key={formation.id} className="rounded-lg border border-ink-10 px-3 py-2">
                        <div className="font-medium text-ink leading-snug">{formation.title}</div>
                        <div className="text-xs text-ink-50 mt-1">
                          {formation.completedChapters}/{formation.totalChapters} chapitres · {formation.progressPercent}%
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="w-36">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-ink">{learner.progressPercent}%</span>
                      <span className="text-ink-50">{learner.completedChapters}/{learner.totalChapters}</span>
                    </div>
                    <div className="h-2 rounded-full bg-ink-10 overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${learner.progressPercent}%` }} />
                    </div>
                  </div>
                  <div className="text-xs text-ink-50 mt-2">Temps repris : {formatDuration(learner.timeSpentSeconds)}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={learner.emailCount === 0 ? "success" : "warning"}>{learner.emailCount} email</Badge>
                    <Badge variant={learner.tokenCount === 0 ? "success" : "warning"}>{learner.tokenCount} token</Badge>
                  </div>
                  <div className="text-xs text-ink-50 mt-2">Dernier email : {formatDate(learner.lastEmailAt)}</div>
                  {learner.activeTokenCount > 0 && (
                    <div className="text-xs text-amber-700 mt-1">{learner.activeTokenCount} token actif</div>
                  )}
                </td>
                <td className="px-4 py-4 text-xs text-ink-50">
                  <div>Import : {formatDate(learner.createdAt)}</div>
                  <div className="mt-1">
                    Expiration :{" "}
                    {learner.formations.length === 0
                      ? "-"
                      : learner.formations.map((formation) => formatDate(formation.expiresAt)).join(", ")}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-ink-50">Aucun apprenant ne correspond aux filtres.</div>
      )}
    </div>
  )
}
