"use client"

import { useState, useEffect } from "react"

export default function ParametresPage() {
  // SMTP
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("587")
  const [smtpEmail, setSmtpEmail] = useState("")
  const [smtpPassword, setSmtpPassword] = useState("")
  const [smtpFromName, setSmtpFromName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [hasStoredPassword, setHasStoredPassword] = useState(false)

  // Vimeo
  const [vimeoToken, setVimeoToken] = useState("")
  const [showVimeoToken, setShowVimeoToken] = useState(false)
  const [hasVimeoToken, setHasVimeoToken] = useState(false)
  const [testingVimeo, setTestingVimeo] = useState(false)
  const [vimeoTestResult, setVimeoTestResult] = useState("")

  // Storage
  const [storagePath, setStoragePath] = useState("/mnt/uploads")
  const [storageBaseUrl, setStorageBaseUrl] = useState("")

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setSmtpHost(data.config.smtp_host || "")
          setSmtpPort(data.config.smtp_port || "587")
          setSmtpEmail(data.config.smtp_email || "")
          setSmtpFromName(data.config.smtp_from_name || "")
          setHasStoredPassword(data.hasPassword)
          setHasVimeoToken(data.hasVimeoToken)
          setStoragePath(data.config.storage_path || "/mnt/uploads")
          setStorageBaseUrl(data.config.storage_base_url || "")
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const flash = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(""), 4000)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            smtp_host: smtpHost,
            smtp_port: smtpPort,
            smtp_email: smtpEmail,
            smtp_password: smtpPassword,
            smtp_from_name: smtpFromName,
            vimeo_token: vimeoToken,
            storage_path: storagePath,
            storage_base_url: storageBaseUrl,
          },
        }),
      })
      if (res.ok) {
        flash("Configuration enregistrée avec succès")
        if (smtpPassword) setHasStoredPassword(true)
        if (vimeoToken) setHasVimeoToken(true)
        setSmtpPassword("")
        setVimeoToken("")
      } else flash("Erreur : " + ((await res.json()).error || "Échec"))
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    if (!smtpEmail) { flash("Erreur : Email expéditeur requis"); return }
    setTesting(true)
    try {
      const res = await fetch("/api/admin/config/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: smtpEmail }),
      })
      const data = await res.json()
      if (data.success) flash("Email de test envoyé avec succès !")
      else flash("Erreur : " + (data.error || "Échec de l'envoi"))
    } catch { flash("Erreur réseau") }
    finally { setTesting(false) }
  }

  const handleTestVimeo = async () => {
    setTestingVimeo(true)
    setVimeoTestResult("")
    try {
      // Save token before testing so the API reads fresh value
      await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { vimeo_token: vimeoToken },
        }),
      })

      const res = await fetch("/api/admin/config/test-vimeo", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setVimeoTestResult(data.message)
        flash("Connexion Vimeo réussie !")
      } else {
        flash("Erreur : " + (data.error || "Identifiants invalides"))
      }
    } catch { flash("Erreur réseau") }
    finally { setTestingVimeo(false) }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Paramètres</h1>
        <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-gray-400">
          Chargement...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Paramètres</h1>

      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 ${message.includes("Erreur") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {message}
        </div>
      )}

      {/* SMTP */}
      <div className="bg-white rounded-xl border border-border p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold mb-1">Configuration email par défaut</h2>
          <p className="text-sm text-gray-400">
            Ces paramètres sont utilisés pour tous les envois d'emails, sauf si un partenaire a configuré son propre SMTP.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Serveur SMTP</label>
            <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Port</label>
            <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email expéditeur</label>
            <input type="email" value={smtpEmail} onChange={(e) => setSmtpEmail(e.target.value)} placeholder="noreply@mondomaine.fr" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Mot de passe {hasStoredPassword && <span className="text-xs text-gray-400">(enregistré)</span>}
            </label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder={hasStoredPassword ? "••••••••" : "Mot de passe SMTP"} className="w-full px-3 py-2 pr-10 text-sm border border-border rounded-lg outline-none focus:border-primary" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
                {showPassword ? "Cacher" : "Voir"}
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Nom de l'expéditeur</label>
          <input value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="Switching Formation" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary sm:max-w-sm" />
        </div>

        <div className="flex gap-3 pt-2 border-t border-border">
          <button onClick={handleTest} disabled={testing || !smtpEmail} className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
            {testing ? "Envoi en cours..." : "Tester l'email"}
          </button>
        </div>
      </div>

      {/* VIMEO */}
      <div className="bg-white rounded-xl border border-border p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold mb-1">Configuration vidéo Vimeo</h2>
          <p className="text-sm text-gray-400">
            Vimeo pour l'hébergement et le streaming des vidéos de formation.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Token API Vimeo {hasVimeoToken && <span className="text-xs text-gray-400">(enregistré)</span>}
          </label>
          <div className="relative sm:max-w-md">
            <input
              type={showVimeoToken ? "text" : "password"}
              value={vimeoToken}
              onChange={(e) => setVimeoToken(e.target.value)}
              placeholder={hasVimeoToken ? "••••••••" : "Token API Vimeo"}
              className="w-full px-3 py-2 pr-10 text-sm border border-border rounded-lg outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowVimeoToken(!showVimeoToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
            >
              {showVimeoToken ? "Cacher" : "Voir"}
            </button>
          </div>
        </div>

        {vimeoTestResult && (
          <div className="text-sm text-green-600 bg-green-50 rounded-lg px-4 py-3">
            {vimeoTestResult}
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-border">
          <button
            onClick={handleTestVimeo}
            disabled={testingVimeo || (!hasVimeoToken && !vimeoToken)}
            className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {testingVimeo ? "Test en cours..." : "Tester la connexion"}
          </button>
        </div>
      </div>

      {/* STOCKAGE FICHIERS */}
      <div className="bg-white rounded-xl border border-border p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold mb-1">Stockage fichiers</h2>
          <p className="text-sm text-gray-400">
            Chemin de stockage local pour les PDFs et pièces jointes (Railway Volume).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Chemin de stockage</label>
            <input value={storagePath} onChange={(e) => setStoragePath(e.target.value)} placeholder="/mnt/uploads" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">URL publique de base</label>
            <input value={storageBaseUrl} onChange={(e) => setStorageBaseUrl(e.target.value)} placeholder="https://votre-app.up.railway.app/api/files" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" />
          </div>
        </div>
      </div>

      {/* BOUTON GLOBAL */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer tous les paramètres"}
        </button>
      </div>
    </div>
  )
}
