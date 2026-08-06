"use client"

/**
 * L'écran IMPRIMER de Word — aperçu avant impression et réglages.
 *
 * POURQUOI IL EST MAISON, ET CE QU'IL ENSEIGNE VRAIMENT
 *
 * Rien ne s'imprime, évidemment. Ce que l'apprenant apprend ici est ce qui
 * s'apprend réellement dans cet écran de Word : OÙ se choisit une plage de
 * pages, ce que « recto verso » change, et surtout que l'aperçu est le dernier
 * endroit où l'on voit ce qu'on s'apprête à sortir. Le même partage que côté
 * Excel, où l'aperçu enseigne la mise en page sans jamais piloter d'imprimante.
 *
 * ⚠️ L'aperçu rend une MAQUETTE du document, pas le document lui-même : Univer
 * peint sur un canvas dont on ne peut pas prendre d'instantané fidèle sans
 * remonter tout le moteur de rendu. Les paragraphes sont donc redessinés en
 * lignes grises proportionnelles à leur longueur, dans les marges réelles. Cela
 * suffit à montrer l'effet d'une orientation ou d'une marge — ce qui est le
 * sujet — et ne prétend à rien de plus.
 *
 * ⚠️ Styles INLINE, jamais de classe Tailwind inédite.
 */

import { useState } from "react"
import { C } from "@/lib/simulation/couleurs"

export type EtatImpression = {
  copies: number
  plage: "tout" | "courante" | "selection"
  rectoVerso: boolean
}

export const IMPRESSION_PAR_DEFAUT: EtatImpression = {
  copies: 1,
  plage: "tout",
  rectoVerso: false,
}

const PLAGES: { id: EtatImpression["plage"]; libelle: string; controle: string }[] = [
  { id: "tout", libelle: "Tout le document", controle: "w-print-plage-tout" },
  { id: "courante", libelle: "Page courante", controle: "w-print-plage-courante" },
  { id: "selection", libelle: "Sélection", controle: "w-print-plage-selection" },
]

export default function WordPrintPreview({
  valeur,
  onChange,
  onFermer,
  onControle,
  paragraphes,
  orientation,
  marges,
}: {
  valeur: EtatImpression
  onChange: (v: EtatImpression) => void
  onFermer: () => void
  /**
   * ⚠️ Tout bouton de cet écran doit le signaler au player.
   *
   * Le zoom ne change aucun réglage jugé, mais une étape peut le DEMANDER. Sans
   * cette remontée, le bouton agit à l'écran et l'atelier reste bloqué sur la
   * consigne — l'apprenant fait le bon geste et rien ne se passe.
   */
  onControle: (id: string) => void
  /** Longueur des paragraphes, pour dessiner la maquette. */
  paragraphes: string[]
  orientation: "portrait" | "paysage"
  marges: { haut: number; bas: number; gauche: number; droite: number }
}) {
  const [zoom, setZoom] = useState(1)

  const paysage = orientation === "paysage"
  const largeurCm = paysage ? 29.7 : 21
  const hauteurCm = paysage ? 21 : 29.7
  const k = (paysage ? 200 : 280) / hauteurCm

  return (
    <div
      role="dialog"
      aria-label="Imprimer"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 45,
        background: "#f3f1ee",
        display: "flex",
        gap: 18,
        padding: 16,
        overflowY: "auto",
      }}
    >
      {/* ── Les réglages ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 230 }}>
        <strong style={{ fontSize: 15 }}>Imprimer</strong>

        <div style={{ fontSize: 12, color: "#7a746b" }}>
          Imprimante
          <div
            style={{
              marginTop: 4,
              padding: "8px 10px",
              background: "#fff",
              border: "1px solid #d8d4cd",
              borderRadius: 6,
              fontSize: 13,
              color: "#2c2a26",
            }}
          >
            Imprimante du bureau
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#7a746b" }}>Copies</span>
          <input
            type="number"
            min={1}
            max={99}
            data-control="w-print-copies"
            value={valeur.copies}
            onChange={(e) =>
              onChange({ ...valeur, copies: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })
            }
            style={{
              width: 78,
              fontSize: 16,
              padding: "6px 8px",
              border: "1px solid #d8d4cd",
              borderRadius: 6,
            }}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#7a746b" }}>Pages à imprimer</span>
          {PLAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              data-control={p.controle}
              onClick={() => onChange({ ...valeur, plage: p.id })}
              style={{
                minHeight: 44,
                padding: "0 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                textAlign: "left",
                border: valeur.plage === p.id ? `2px solid ${C.accentF}` : "1px solid #d8d4cd",
                background: valeur.plage === p.id ? C.voile : "#fff",
                fontWeight: valeur.plage === p.id ? 600 : 400,
              }}
            >
              {p.libelle}
            </button>
          ))}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, minHeight: 44 }}>
          <input
            type="checkbox"
            data-control="w-print-rectoverso"
            checked={valeur.rectoVerso}
            onChange={(e) => onChange({ ...valeur, rectoVerso: e.target.checked })}
            style={{ width: 18, height: 18 }}
          />
          Recto verso
        </label>

        <button
          type="button"
          data-control="w-print-fermer"
          onClick={onFermer}
          style={{
            minHeight: 44,
            borderRadius: 8,
            border: "none",
            background: C.accentF,
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Fermer l'aperçu
        </button>
      </div>

      {/* ── L'aperçu ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", flex: 1 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            data-control="w-print-zoom-moins"
            onClick={() => {
              setZoom((z) => Math.max(0.6, z - 0.2))
              onControle("w-print-zoom-moins")
            }}
            style={boutonZoom}
          >
            −
          </button>
          <span style={{ fontSize: 12, color: "#7a746b", minWidth: 46, textAlign: "center" }}>
            {Math.round(zoom * 100)} %
          </span>
          <button
            type="button"
            data-control="w-print-zoom-plus"
            onClick={() => {
              setZoom((z) => Math.min(1.4, z + 0.2))
              onControle("w-print-zoom-plus")
            }}
            style={boutonZoom}
          >
            +
          </button>
        </div>

        <div
          data-apercu-impression
          style={{
            position: "relative",
            width: largeurCm * k * zoom,
            height: hauteurCm * k * zoom,
            background: "#fff",
            border: "1px solid #c9c4bc",
            boxShadow: "0 2px 10px rgba(0,0,0,.12)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: marges.gauche * k * zoom,
              right: marges.droite * k * zoom,
              top: marges.haut * k * zoom,
              bottom: marges.bas * k * zoom,
              display: "flex",
              flexDirection: "column",
              gap: 5,
              overflow: "hidden",
            }}
          >
            {/* La maquette : une ligne grise par paragraphe, largeur
                proportionnelle au texte réel. */}
            {paragraphes.slice(0, 22).map((p, i) => (
              <div
                key={i}
                style={{
                  height: p.trim() === "" ? 6 : 7,
                  width: `${Math.min(100, Math.max(12, p.length * 1.4))}%`,
                  background: p.trim() === "" ? "transparent" : "#d4d0ca",
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        </div>

        <span style={{ fontSize: 11, color: "#9a938a" }}>
          Page 1 sur 1 · {paysage ? "29,7 × 21 cm" : "21 × 29,7 cm"}
        </span>
      </div>
    </div>
  )
}

const boutonZoom: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  borderRadius: 8,
  border: "1px solid #d8d4cd",
  background: "#fff",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
}
