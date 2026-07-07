"use client"

import { useEffect } from "react"

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  headerAction,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Modale large (fiches riches en tableaux) — sm:max-w-4xl au lieu de 2xl */
  wide?: boolean
  /** Action affichée dans le header, à côté du titre (ex. bouton Export CSV) */
  headerAction?: React.ReactNode
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden"
    else document.body.style.overflow = ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  if (!open) return null

  return (
    // Centrage ADAPTATIF dans la zone libre sous la navbar (padding-top du
    // conteneur = navbar sticky + bandeau d'impersonation éventuel, padding-bottom
    // = marge basse garantie). Petite modale → centrée dans cette zone ; grande
    // modale → la remplit sans jamais passer sous la barre du haut ni toucher le
    // bas. Mobile : bottom sheet inchangé.
    <div className="app-modal-overlay">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className={`app-modal-panel relative flex min-h-0 flex-col bg-white sm:rounded-xl rounded-t-xl border border-border shadow-lg w-full ${wide ? "sm:max-w-4xl" : "sm:max-w-2xl"}`}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6 sm:pt-6 border-b border-border">
          <h2 className="text-lg font-semibold min-w-0 truncate">{title}</h2>
          <div className="flex items-center gap-2 shrink-0">
            {headerAction}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none w-11 h-11 flex items-center justify-center shrink-0 -mr-2">&times;</button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  )
}
