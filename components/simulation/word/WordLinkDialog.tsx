"use client"

/**
 * La boîte « Insérer un lien hypertexte ».
 *
 * POURQUOI ELLE EST MAISON ALORS QUE LA COMMANDE EXISTE
 *
 * Le moteur porte bien `docs.command.add-hyper-link`, mais son interface native
 * est une bulle flottante attachée au ruban d'Univer — ruban que le simulateur
 * coupe, puisqu'il rend le sien. Il faut donc une boîte à nous pour saisir
 * l'adresse, exactement comme pour l'insertion de tableau.
 *
 * ⚠️ UN LIEN S'APPLIQUE À LA SÉLECTION. Sans texte sélectionné, la commande
 * n'a rien à envelopper et rend `false` en silence. C'est pour cela que chaque
 * chapitre fait sélectionner le passage AVANT d'ouvrir cette boîte — et que la
 * boîte le rappelle à l'écran quand la sélection est vide.
 *
 * ⚠️ Styles INLINE, jamais de classe Tailwind inédite.
 */

import { useState } from "react"
import { C } from "@/lib/simulation/couleurs"

/** Adresses proposées : un apprenant sur mobile ne doit pas tout retaper. */
const SUGGESTIONS = [
  "https://www.service-public.fr",
  "https://www.legifrance.gouv.fr",
  "contact@rivedoux.fr",
]

export default function WordLinkDialog({
  onValider,
  onFermer,
  texteSelectionne,
}: {
  onValider: (url: string) => void
  onFermer: () => void
  /** Ce que le lien va couvrir — vide si rien n'est sélectionné. */
  texteSelectionne: string
}) {
  const [adresse, setAdresse] = useState("")
  const sansSelection = texteSelectionne.trim() === ""

  return (
    <div
      role="dialog"
      aria-label="Insérer un lien"
      style={{
        position: "absolute",
        left: "50%",
        top: 24,
        transform: "translateX(-50%)",
        zIndex: 40,
        background: "#fff",
        border: "1px solid #d8d4cd",
        borderRadius: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,.16)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 340,
        maxWidth: "94%",
        maxHeight: "88%",
        overflowY: "auto",
      }}
    >
      <strong style={{ fontSize: 14 }}>Insérer un lien</strong>

      <div style={{ fontSize: 12, color: "#7a746b" }}>
        Texte à afficher
        <div
          style={{
            marginTop: 4,
            padding: "8px 10px",
            background: sansSelection ? "#fdf3f2" : "#f7f5f2",
            border: `1px solid ${sansSelection ? "#e2b8b2" : "#d8d4cd"}`,
            borderRadius: 6,
            fontSize: 13,
            color: sansSelection ? "#a8443a" : "#2c2a26",
          }}
        >
          {sansSelection
            ? "Aucun texte sélectionné — sélectionnez d'abord le passage à lier."
            : texteSelectionne}
        </div>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "#7a746b" }}>Adresse</span>
        <input
          type="text"
          data-control="w-lien-adresse"
          value={adresse}
          placeholder="https://…"
          onChange={(e) => setAdresse(e.target.value)}
          // 16 px minimum : en dessous, iOS zoome sur le champ.
          style={{
            fontSize: 16,
            padding: "8px 10px",
            border: "1px solid #d8d4cd",
            borderRadius: 6,
          }}
        />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, color: "#9a938a" }}>Adresses fréquentes</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            data-suggestion={s}
            onClick={() => setAdresse(s)}
            style={{
              minHeight: 40,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid #d8d4cd",
              background: "#fff",
              cursor: "pointer",
              fontSize: 12,
              textAlign: "left",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          data-control="w-lien-valider"
          onClick={() => adresse.trim() && onValider(adresse.trim())}
          disabled={!adresse.trim() || sansSelection}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 8,
            border: "none",
            background: !adresse.trim() || sansSelection ? "#c9c4bc" : C.accentF,
            color: "#fff",
            fontWeight: 600,
            cursor: !adresse.trim() || sansSelection ? "default" : "pointer",
          }}
        >
          Valider
        </button>
        <button
          type="button"
          data-control="w-lien-fermer"
          onClick={onFermer}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 8,
            border: "1px solid #d8d4cd",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
