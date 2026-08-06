"use client"

/**
 * Le panneau de MISE EN PAGE de Word — marges et orientation.
 *
 * POURQUOI IL EXISTE, ET POURQUOI IL EST MAISON
 *
 * `W_EXPECT_PAGE` était déclaré depuis le lot moteur : l'action existe,
 * `w:docState` porte déjà son champ `page`, le juge la traite, `publier()`
 * l'expurge. Tout était là — sauf la surface. Le module « Mise en page » était
 * donc entièrement injouable faute d'un composant d'une centaine de lignes.
 *
 * Il est maison parce qu'il DOIT l'être : mesuré au spike, le moteur n'a AUCUNE
 * commande de marges ni d'orientation, et muter son modèle directement ne
 * repeint pas. C'est exactement la situation de `pagesetup.ts` côté Excel — on
 * enseigne le geste et son effet visuel, le moteur ne bouge pas.
 *
 * ⚠️ CE QUE LE PANNEAU CHANGE VRAIMENT : l'aperçu de page qu'il dessine, et
 * l'état que le player renvoie au juge. Le document Univer, lui, n'est pas
 * reflowé — un texte ne se recompose pas quand on change les marges. C'est une
 * limite assumée, la même que celle acceptée côté Excel pour la mise en page :
 * l'apprenant apprend où se règle une marge et ce qu'elle produit, pas à voir
 * son texte se recomposer.
 *
 * ⚠️ Styles INLINE, jamais de classe Tailwind inédite : le JIT ne génère que
 * les classes présentes au build, une classe neuve est inerte en production
 * comme au banc.
 */

import { useEffect, useRef, useState } from "react"
import { C } from "@/lib/simulation/couleurs"

export type EtatPage = {
  orientation?: "portrait" | "paysage"
  margeHaut?: number
  margeBas?: number
  margeGauche?: number
  margeDroite?: number
}

/** Les marges par défaut de Word, en centimètres. */
export const PAGE_PAR_DEFAUT: Required<EtatPage> = {
  orientation: "portrait",
  margeHaut: 2.5,
  margeBas: 2.5,
  margeGauche: 2.5,
  margeDroite: 2.5,
}

const MARGES_PREDEFINIES: { id: string; libelle: string; valeurs: number }[] = [
  { id: "w-marges-normales", libelle: "Normales — 2,5 cm", valeurs: 2.5 },
  { id: "w-marges-etroites", libelle: "Étroites — 1,25 cm", valeurs: 1.25 },
  { id: "w-marges-larges", libelle: "Larges — 5 cm", valeurs: 5 },
]

const CHAMPS: { cle: keyof EtatPage; libelle: string; controle: string }[] = [
  { cle: "margeHaut", libelle: "Haut", controle: "w-marge-haut" },
  { cle: "margeBas", libelle: "Bas", controle: "w-marge-bas" },
  { cle: "margeGauche", libelle: "Gauche", controle: "w-marge-gauche" },
  { cle: "margeDroite", libelle: "Droite", controle: "w-marge-droite" },
]

export default function WordPageLayout({
  page,
  onChange,
  onFermer,
}: {
  page: Required<EtatPage>
  onChange: (p: Required<EtatPage>) => void
  onFermer: () => void
}) {
  const [brouillon, setBrouillon] = useState<Required<EtatPage>>(page)
  const hoteRef = useRef<HTMLDivElement | null>(null)

  // Le panneau s'ouvre sur l'état courant : rouvrir après un réglage ne doit
  // pas proposer les valeurs d'origine.
  useEffect(() => setBrouillon(page), [page])

  const poser = (p: Required<EtatPage>) => {
    setBrouillon(p)
    onChange(p)
  }

  /* L'aperçu : une page dessinée à l'échelle, avec ses marges réelles. */
  const paysage = brouillon.orientation === "paysage"
  const largeurCm = paysage ? 29.7 : 21
  const hauteurCm = paysage ? 21 : 29.7
  const k = 108 / hauteurCm

  return (
    <div
      ref={hoteRef}
      role="dialog"
      aria-label="Mise en page"
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
        gap: 18,
        maxWidth: "94%",
        // Un panneau plus haut que la zone de travail doit défiler : un réglage
        // hors champ est un réglage inatteignable, et rien ne le signale.
        maxHeight: "88%",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 240 }}>
        <strong style={{ fontSize: 14 }}>Mise en page</strong>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#7a746b" }}>Orientation</span>
          <div style={{ display: "flex", gap: 8 }}>
            {(["portrait", "paysage"] as const).map((o) => (
              <button
                key={o}
                type="button"
                data-control={`w-orientation-${o}`}
                onClick={() => poser({ ...brouillon, orientation: o })}
                style={{
                  minHeight: 44,
                  padding: "0 14px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  border: brouillon.orientation === o ? `2px solid ${C.accentF}` : "1px solid #d8d4cd",
                  background: brouillon.orientation === o ? C.voile : "#fff",
                  fontWeight: brouillon.orientation === o ? 600 : 400,
                }}
              >
                {o === "portrait" ? "Portrait" : "Paysage"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#7a746b" }}>Marges prédéfinies</span>
          {MARGES_PREDEFINIES.map((m) => (
            <button
              key={m.id}
              type="button"
              data-control={m.id}
              onClick={() =>
                poser({
                  ...brouillon,
                  margeHaut: m.valeurs,
                  margeBas: m.valeurs,
                  margeGauche: m.valeurs,
                  margeDroite: m.valeurs,
                })
              }
              style={{
                minHeight: 44,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid #d8d4cd",
                background: "#fff",
                cursor: "pointer",
                fontSize: 13,
                textAlign: "left",
              }}
            >
              {m.libelle}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#7a746b" }}>Marges personnalisées (cm)</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {CHAMPS.map((c) => (
              <label key={c.cle} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span style={{ minWidth: 52 }}>{c.libelle}</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.25}
                  data-control={c.controle}
                  value={brouillon[c.cle] as number}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(10, Number(e.target.value) || 0))
                    poser({ ...brouillon, [c.cle]: v })
                  }}
                  // 16 px minimum : en dessous, iOS zoome sur le champ.
                  style={{
                    width: 68,
                    fontSize: 16,
                    padding: "6px 8px",
                    border: "1px solid #d8d4cd",
                    borderRadius: 6,
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          data-control="w-mise-en-page-fermer"
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
          Fermer
        </button>
      </div>

      {/* L'aperçu — c'est lui qui fait comprendre ce qu'une marge change. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#7a746b" }}>Aperçu</span>
        <div
          data-apercu-page
          style={{
            position: "relative",
            width: largeurCm * k,
            height: hauteurCm * k,
            background: "#fff",
            border: "1px solid #c9c4bc",
            boxShadow: "0 1px 4px rgba(0,0,0,.08)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: brouillon.margeGauche * k,
              right: brouillon.margeDroite * k,
              top: brouillon.margeHaut * k,
              bottom: brouillon.margeBas * k,
              border: "1px dashed #9aa3a0",
              background:
                "repeating-linear-gradient(#eceae6 0 2px, transparent 2px 6px)",
              // Décoratif : ne doit jamais avaler un clic.
              pointerEvents: "none",
            }}
          />
        </div>
        <span style={{ fontSize: 11, color: "#9a938a" }}>
          {paysage ? "29,7 × 21 cm" : "21 × 29,7 cm"}
        </span>
      </div>
    </div>
  )
}
