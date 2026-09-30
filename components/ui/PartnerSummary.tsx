"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import Modal from "@/components/ui/Modal"

type Partner = { id: string; name: string; primaryColor: string; logoUrl: string | null; isInternal: boolean; learners: number; courses: number; seats: number; adminId?: string }
export default function PartnerSummary({ partners }: { partners: Partner[] }) {
  const [selected, setSelected] = useState<Partner | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState("")
  const visit = async () => {
    if (!selected?.adminId) return
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/impersonate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selected.adminId }) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error || "Cet espace n’a pas pu être ouvert.")
      window.location.href = data.redirectUrl || "/partner-admin/dashboard"
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur réseau"); setBusy(false) }
  }
  return <>
    {partners.map(p => <button className="lms-partner-row" key={p.id} onClick={() => { setSelected(p); setError("") }}><span className="lms-avatar" style={{ color: p.primaryColor, background: `color-mix(in srgb,${p.primaryColor} 9%,white)` }}>{p.logoUrl ? <img src={p.logoUrl} alt="" /> : p.name.split(/\s+/).map(w => w[0]).slice(0, 3).join("")}</span><span className="grow min-w-0"><strong>{p.name}</strong><small>{p.isInternal ? "Catalogue interne" : `${p.courses} formation${p.courses > 1 ? "s" : ""} sous licence`}</small></span><ChevronRight size={18} /></button>)}
    <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || "Partenaire"}>
      {selected && <div className="space-y-5"><div className="lms-detail-metrics"><div><strong>{selected.learners}</strong><small>Apprenants actifs</small></div><div><strong>{selected.courses}</strong><small>{selected.isInternal ? "Formations au catalogue" : "Formations sous licence"}</small></div><div><strong>{selected.seats}</strong><small>Licences</small></div></div>{error && <p role="alert">{error}</p>}<div className="flex flex-wrap gap-3"><Link className="lms-primary" href="/super-admin/partenaires">Gérer ce partenaire</Link>{selected.adminId && <button className="lms-primary" disabled={busy} onClick={visit}>{busy ? "Ouverture…" : "Voir l’espace administrateur"}</button>}</div></div>}
    </Modal>
  </>
}
