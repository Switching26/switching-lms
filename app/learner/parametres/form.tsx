"use client"

import { useState } from "react"
import { MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENT_LABEL } from "@/lib/validate-password"

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
}

export default function SettingsForm({ user }: { user: User }) {
  const [firstName, setFirstName] = useState(user.firstName)
  const [lastName, setLastName] = useState(user.lastName)
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage("")
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email }),
      })
      if (res.ok) setMessage("Profil mis à jour")
      else setMessage("Erreur lors de la mise à jour")
    } finally {
      setLoading(false)
    }
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage("")
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setMessage("Mot de passe modifié")
        setCurrentPassword("")
        setNewPassword("")
      } else {
        const data = await res.json()
        setMessage(data.error || "Erreur")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="text-sm bg-gray-100 rounded-lg px-4 py-3">{message}</div>
      )}

      <form onSubmit={handleProfile} className="bg-white rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-base font-semibold">Informations personnelles</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Prénom</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nom</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          Enregistrer
        </button>
      </form>

      <form onSubmit={handlePassword} className="bg-white rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-base font-semibold">Changer le mot de passe</h2>
        <div>
          <label className="block text-sm font-medium mb-1">Mot de passe actuel</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Nouveau mot de passe</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={PASSWORD_REQUIREMENT_LABEL}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          Modifier
        </button>
      </form>
    </div>
  )
}
