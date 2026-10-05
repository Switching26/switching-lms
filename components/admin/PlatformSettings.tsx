"use client"

import { useState, useEffect } from "react"

export default function PlatformSettings() {
  // Gmail API
  const [gmailClientId, setGmailClientId] = useState("")
  const [gmailClientSecret, setGmailClientSecret] = useState("")
  const [gmailRefreshToken, setGmailRefreshToken] = useState("")
  const [senderEmail, setSenderEmail] = useState("contact@switchingformation.com")
  const [senderName, setSenderName] = useState("Switching Formation")
  const [showGmailClientSecret, setShowGmailClientSecret] = useState(false)
  const [showGmailRefreshToken, setShowGmailRefreshToken] = useState(false)
  const [hasGmailClientSecret, setHasGmailClientSecret] = useState(false)
  const [hasGmailRefreshToken, setHasGmailRefreshToken] = useState(false)
  const [envGmailConfigured, setEnvGmailConfigured] = useState(false)

  // Storage
  const [storagePath, setStoragePath] = useState("/mnt/uploads")
  const [storageBaseUrl, setStorageBaseUrl] = useState("")
  const [r2, setR2] = useState<Record<string, string>>({ r2_endpoint: "", r2_bucket: "", r2_access_key: "", r2_secret_key: "", video_worker_token: "" })
  const [configuredR2, setConfiguredR2] = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setGmailClientId(data.config.gmail_client_id || "")
          setSenderEmail(data.config.sender_email || "contact@switchingformation.com")
          setSenderName(data.config.sender_name || "Switching Formation")
          setHasGmailClientSecret(data.hasGmailClientSecret)
          setHasGmailRefreshToken(data.hasGmailRefreshToken)
          setEnvGmailConfigured(data.envGmailConfigured)
          setStoragePath(data.config.storage_path || "/mnt/uploads")
          setStorageBaseUrl(data.config.storage_base_url || "")
          setR2(value => ({ ...value, r2_endpoint: data.config.r2_endpoint || "", r2_bucket: data.config.r2_bucket || "" }))
          setConfiguredR2(data.configuredR2Keys || [])
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
            gmail_client_id: gmailClientId,
            gmail_client_secret: gmailClientSecret,
            gmail_refresh_token: gmailRefreshToken,
            sender_email: senderEmail,
            sender_name: senderName,
            storage_path: storagePath,
            storage_base_url: storageBaseUrl,
            ...r2,
          },
        }),
      })
      if (res.ok) {
        flash("Configuration enregistrée avec succès")
        if (gmailClientSecret) setHasGmailClientSecret(true)
        if (gmailRefreshToken) setHasGmailRefreshToken(true)
        setGmailClientSecret("")
        setGmailRefreshToken("")
        setConfiguredR2(keys => Array.from(new Set([...keys, ...Object.keys(r2).filter(key => r2[key])])))
        setR2(value => ({ ...value, r2_access_key: "", r2_secret_key: "", video_worker_token: "" }))
      } else flash("Erreur : " + ((await res.json()).error || "Échec"))
    } catch { flash("Erreur réseau") }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      // Save config before testing so the API reads fresh values
      await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            gmail_client_id: gmailClientId,
            gmail_client_secret: gmailClientSecret,
            gmail_refresh_token: gmailRefreshToken,
            sender_email: senderEmail,
            sender_name: senderName,
          },
        }),
      })
      if (gmailClientSecret) setHasGmailClientSecret(true)
      if (gmailRefreshToken) setHasGmailRefreshToken(true)
      setGmailClientSecret("")
      setGmailRefreshToken("")

      const res = await fetch("/api/admin/config/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: senderEmail }),
      })
      const data = await res.json()
      if (data.success) flash("Email de test envoyé avec succès !")
      else flash("Erreur : " + (data.error || "Échec de l'envoi"))
    } catch { flash("Erreur réseau") }
    finally { setTesting(false) }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-gray-400">
        Chargement...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`text-sm rounded-lg px-4 py-3 ${message.includes("Erreur") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {message}
        </div>
      )}

      {/* GMAIL EMAIL */}
      <div className="bg-white rounded-xl border border-border p-6 space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-1">Configuration email (Gmail API)</h3>
          <p className="text-sm text-gray-400">
            Envoi des emails transactionnels via OAuth Gmail pour contact@switchingformation.com.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Client ID OAuth</label>
          <input
            value={gmailClientId}
            onChange={(e) => setGmailClientId(e.target.value)}
            placeholder={envGmailConfigured ? "Configuré par variable Railway" : "Client ID Google OAuth"}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Client secret {hasGmailClientSecret && <span className="text-xs text-gray-400">(enregistré)</span>}
            </label>
            <div className="relative">
              <input
                type={showGmailClientSecret ? "text" : "password"}
                value={gmailClientSecret}
                onChange={(e) => setGmailClientSecret(e.target.value)}
                placeholder={hasGmailClientSecret || envGmailConfigured ? "••••••••" : "Client secret Google OAuth"}
                className="w-full px-3 py-2 pr-14 text-sm border border-border rounded-lg outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowGmailClientSecret(!showGmailClientSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              >
                {showGmailClientSecret ? "Cacher" : "Voir"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Refresh token {hasGmailRefreshToken && <span className="text-xs text-gray-400">(enregistré)</span>}
            </label>
            <div className="relative">
              <input
                type={showGmailRefreshToken ? "text" : "password"}
                value={gmailRefreshToken}
                onChange={(e) => setGmailRefreshToken(e.target.value)}
                placeholder={hasGmailRefreshToken || envGmailConfigured ? "••••••••" : "Refresh token Gmail"}
                className="w-full px-3 py-2 pr-14 text-sm border border-border rounded-lg outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowGmailRefreshToken(!showGmailRefreshToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              >
                {showGmailRefreshToken ? "Cacher" : "Voir"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email expéditeur</label>
            <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="contact@switchingformation.com" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nom de l'expéditeur</label>
            <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Switching Formation" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" />
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-border">
          <button
            onClick={handleTest}
            disabled={testing || (!envGmailConfigured && (!gmailClientId || (!hasGmailClientSecret && !gmailClientSecret) || (!hasGmailRefreshToken && !gmailRefreshToken)))}
            className="px-4 py-2 bg-gray-100 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {testing ? "Envoi en cours..." : "Tester l'email"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-6 space-y-5">
        <div><h3 className="text-base font-semibold mb-1">Vidéos privées du LMS · Cloudflare R2</h3><p className="text-sm text-gray-500">Déposez les vidéos dans le LMS. Le worker sur le Mac les convertit pour la lecture privée.</p></div>
        {[
          ["r2_endpoint", "Endpoint S3", "https://ACCOUNT_ID.r2.cloudflarestorage.com"],
          ["r2_bucket", "Bucket privé", "switching-lms-videos"],
          ["r2_access_key", "Access key", "Identifiant R2"],
          ["r2_secret_key", "Secret key", "Secret R2"],
          ["video_worker_token", "Token du worker", "Au moins 32 caractères aléatoires"],
        ].map(([key, label, placeholder]) => <div key={key}><label className="block text-sm font-medium mb-1" htmlFor={key}>{label}{configuredR2.includes(key) && <span className="text-xs text-gray-400"> (enregistré)</span>}</label>
          <input id={key} type={key === "r2_endpoint" || key === "r2_bucket" ? "text" : "password"} autoComplete="off" value={r2[key]} onChange={e => setR2(value => ({ ...value, [key]: e.target.value }))} placeholder={configuredR2.includes(key) && key !== "r2_endpoint" && key !== "r2_bucket" ? "••••••••" : placeholder} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary" /></div>)}
        <p className="text-xs text-gray-500">Conserver le bucket privé et autoriser les requêtes CORS du domaine LMS uniquement. Un champ secret vide conserve sa valeur enregistrée.</p>
      </div>

      {/* STOCKAGE FICHIERS */}
      <div className="bg-white rounded-xl border border-border p-6 space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-1">Stockage fichiers</h3>
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
