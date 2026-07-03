"use client"

import { useState } from "react"
import { MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENT_LABEL } from "@/lib/validate-password"

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
}

export default function ProfileForm({ user }: { user: User }) {
  const [firstName, setFirstName] = useState(user.firstName)
  const [lastName, setLastName] = useState(user.lastName)
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null)
  const [loading, setLoading] = useState(false)

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage("")
    setMessageType(null)
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email }),
      })
      if (res.ok) {
        setMessage("Profil mis à jour")
        setMessageType("success")
      } else {
        setMessage("Erreur lors de la mise à jour")
        setMessageType("error")
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage("")
    setMessageType(null)
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setMessage("Mot de passe modifié")
        setMessageType("success")
        setCurrentPassword("")
        setNewPassword("")
      } else {
        const data = await res.json()
        setMessage(data.error || "Erreur")
        setMessageType("error")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`text-sm rounded-lg px-4 py-3 ${
            messageType === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleProfile} className="bg-white rounded-2xl border border-border p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 mb-2">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <h2 className="text-base font-semibold">Informations personnelles</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-warm-700">Prénom</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-border rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-warm-700">Nom</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-border rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 text-warm-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition shadow-sm"
        >
          Enregistrer les modifications
        </button>
      </form>

      <form onSubmit={handlePassword} className="bg-white rounded-2xl border border-border p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 mb-2">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <h2 className="text-base font-semibold">Changer le mot de passe</h2>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 text-warm-700">Mot de passe actuel</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 text-warm-700">Nouveau mot de passe</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={PASSWORD_REQUIREMENT_LABEL}
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition shadow-sm"
        >
          Modifier le mot de passe
        </button>
      </form>
    </div>
  )
}
