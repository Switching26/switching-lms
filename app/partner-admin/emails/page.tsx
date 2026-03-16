"use client"

import { useState, useEffect } from "react"
import Badge from "@/components/ui/Badge"

const templates = [
  { id: "ACCOUNT_CREATED", label: "Création de compte", variant: "blue", description: "Envoyé quand un nouvel apprenant est créé" },
  { id: "FORMATION_ASSIGNED", label: "Formation attribuée", variant: "success", description: "Envoyé quand une formation est assignée" },
  { id: "CHAPTER_COMPLETED", label: "Chapitre terminé", variant: "purple", description: "Envoyé quand un chapitre est complété" },
  { id: "FORMATION_COMPLETED", label: "Formation terminée", variant: "warning", description: "Envoyé quand la formation est terminée" },
]

export default function PartnerEmailsPage() {
  const [active, setActive] = useState<Record<string, boolean>>({
    ACCOUNT_CREATED: true,
    FORMATION_ASSIGNED: true,
    CHAPTER_COMPLETED: false,
    FORMATION_COMPLETED: true,
  })

  // SMTP config state
  const [useCustomSmtp, setUseCustomSmtp] = useState(false)
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("587")
  const [smtpEmail, setSmtpEmail] = useState("")
  const [smtpPassword, setSmtpPassword] = useState("")
  const [smtpFromName, setSmtpFromName] = useState("")
  const [hasStoredPassword, setHasStoredPassword] = useState(false)
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [smtpTesting, setSmtpTesting] = useState(false)
  const [smtpMessage, setSmtpMessage] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/partner/smtp")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setUseCustomSmtp(!data.useDefaultSmtp)
          setSmtpHost(data.smtpHost || "")
          setSmtpPort(String(data.smtpPort || 587))
          setSmtpEmail(data.smtpEmail || "")
          setSmtpFromName(data.smtpFromName || "")
          setHasStoredPassword(data.hasPassword)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) => {
    setActive((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const flash = (msg: string) => {
    setSmtpMessage(msg)
    setTimeout(() => setSmtpMessage(""), 4000)
  }

  const handleSmtpSave = async () => {
    setSmtpSaving(true)
    try {
      const res = await fetch("/api/partner/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpHost, smtpPort, smtpEmail, smtpPassword,
          smtpFromName, useDefaultSmtp: !useCustomSmtp,
        }),
      })
      if (res.ok) {
        flash("Configuration SMTP enregistrée")
        if (smtpPassword) setHasStoredPassword(true)
        setSmtpPassword("")
      } else flash("Erreur : " + ((await res.json()).error || "Échec"))
    } catch { flash("Erreur réseau") }
    finally { setSmtpSaving(false) }
  }

  const handleSmtpTest = async () => {
    setSmtpTesting(true)
    try {
      const res = await fetch("/api/partner/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtpHost, smtpPort, smtpEmail, smtpPassword, smtpFromName }),
      })
      const data = await res.json()
      if (data.success) flash("Email de test envoyé avec succès !")
      else flash("Erreur : " + (data.error || "Échec de l'envoi"))
    } catch { flash("Erreur réseau") }
    finally { setSmtpTesting(false) }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Emails</h1>

      {/* Templates section */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Templates automatiques</h2>
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-border p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant={t.variant}>{t.label}</Badge>
                <span className="text-sm text-gray-500">{t.description}</span>
              </div>
              <button
                onClick={() => toggle(t.id)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  active[t.id] ? "bg-primary" : "bg-gray-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    active[t.id] ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* SMTP Configuration section */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Configuration email</h2>
        <div className="bg-white rounded-xl border border-border p-6 space-y-5">
          {smtpMessage && (
            <div className={`text-sm rounded-lg px-4 py-3 ${smtpMessage.includes("Erreur") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
              {smtpMessage}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Utiliser mon propre serveur email</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {useCustomSmtp ? "Les emails seront envoyés depuis votre serveur SMTP" : "Les emails sont envoyés depuis le serveur par défaut"}
              </p>
            </div>
            <button
              onClick={() => setUseCustomSmtp(!useCustomSmtp)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                useCustomSmtp ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  useCustomSmtp ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {useCustomSmtp && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Serveur SMTP</label>
                  <input
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Port</label>
                  <input
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email SMTP</label>
                  <input
                    type="email"
                    value={smtpEmail}
                    onChange={(e) => setSmtpEmail(e.target.value)}
                    placeholder="noreply@mondomaine.fr"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Mot de passe {hasStoredPassword && <span className="text-xs text-gray-400">(enregistré)</span>}
                  </label>
                  <input
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={hasStoredPassword ? "••••••••" : "Mot de passe SMTP"}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nom de l'expéditeur</label>
                <input
                  value={smtpFromName}
                  onChange={(e) => setSmtpFromName(e.target.value)}
                  placeholder="Mon Organisme Formation"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary sm:max-w-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSmtpSave}
                  disabled={smtpSaving}
                  className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {smtpSaving ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button
                  onClick={handleSmtpTest}
                  disabled={smtpTesting || !smtpHost || !smtpEmail}
                  className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  {smtpTesting ? "Envoi en cours..." : "Tester la configuration"}
                </button>
              </div>
            </>
          )}

          {!useCustomSmtp && !loading && (
            <p className="text-xs text-gray-400">
              Les emails sont envoyés depuis le serveur par défaut de la plateforme.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
