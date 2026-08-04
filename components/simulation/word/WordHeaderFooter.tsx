"use client"

/**
 * Le panneau EN-TÊTE ET PIED DE PAGE de Word — plus le filigrane.
 *
 * POURQUOI IL EST MAISON
 *
 * Un en-tête n'est pas dans le corps du document : il se répète sur chaque page
 * et possède son propre point d'insertion. C'est une SECONDE surface d'édition,
 * qu'un document Univer unique ne porte pas. Mesuré : aucune des 78 commandes
 * `doc.command.*` relevées ne concerne un en-tête, un pied ni un filigrane, et
 * la façade n'expose aucun `headerFooter` atteignable.
 *
 * Même partage que `WordPageLayout` : on enseigne le geste — ouvrir la zone,
 * saisir, refermer — et son effet visuel sur la page.
 *
 * ⚠️ CE QUE L'APPRENANT NE VOIT PAS : la répétition sur une seconde page,
 * puisque la surface n'en rend qu'une. Le numéro de page affiche donc toujours
 * « 1 ». C'est une limite assumée, la même que le non-reflow des marges.
 *
 * ⚠️ Styles INLINE, jamais de classe Tailwind inédite : le JIT ne génère que
 * les classes présentes au build, une classe neuve est inerte en production
 * comme au banc.
 */

import { useEffect, useState } from "react"

export type EtatHorsFlux = {
  entete: string
  pied: string
  filigrane: string
  numeroPage: boolean
}

export const HORS_FLUX_PAR_DEFAUT: EtatHorsFlux = {
  entete: "",
  pied: "",
  filigrane: "",
  numeroPage: false,
}

const CHAMPS: { cle: "entete" | "pied" | "filigrane"; libelle: string; controle: string; aide: string }[] = [
  {
    cle: "entete",
    libelle: "En-tête",
    controle: "w-entete-zone",
    aide: "Se répète en haut de chaque page.",
  },
  {
    cle: "pied",
    libelle: "Pied de page",
    controle: "w-pied-zone",
    aide: "Se répète en bas de chaque page.",
  },
  {
    cle: "filigrane",
    libelle: "Filigrane",
    controle: "w-filigrane-zone",
    aide: "S'affiche en diagonale, derrière le texte.",
  },
]

export default function WordHeaderFooter({
  valeur,
  onChange,
  onFermer,
}: {
  valeur: EtatHorsFlux
  onChange: (v: EtatHorsFlux) => void
  onFermer: () => void
}) {
  const [brouillon, setBrouillon] = useState<EtatHorsFlux>(valeur)

  // Rouvrir après une saisie doit proposer l'état courant, pas les valeurs
  // d'origine.
  useEffect(() => setBrouillon(valeur), [valeur])

  const poser = (v: EtatHorsFlux) => {
    setBrouillon(v)
    onChange(v)
  }

  return (
    <div
      role="dialog"
      aria-label="En-tête et pied de page"
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
        gap: 12,
        width: 320,
        maxWidth: "94%",
        // Un réglage hors champ est un réglage inatteignable, et rien ne le
        // signale à l'apprenant.
        maxHeight: "88%",
        overflowY: "auto",
      }}
    >
      <strong style={{ fontSize: 14 }}>En-tête et pied de page</strong>

      {CHAMPS.map((c) => (
        <label key={c.cle} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#7a746b" }}>{c.libelle}</span>
          <input
            type="text"
            data-control={c.controle}
            value={brouillon[c.cle]}
            placeholder={c.cle === "filigrane" ? "ex. BROUILLON" : "Saisissez le texte…"}
            onChange={(e) => poser({ ...brouillon, [c.cle]: e.target.value })}
            // 16 px minimum : en dessous, iOS zoome sur le champ.
            style={{
              fontSize: 16,
              padding: "8px 10px",
              border: "1px solid #d8d4cd",
              borderRadius: 6,
            }}
          />
          <span style={{ fontSize: 11, color: "#9a938a" }}>{c.aide}</span>
        </label>
      ))}

      <label
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, minHeight: 44 }}
      >
        <input
          type="checkbox"
          data-control="w-numero-page"
          checked={brouillon.numeroPage}
          onChange={(e) => poser({ ...brouillon, numeroPage: e.target.checked })}
          style={{ width: 18, height: 18 }}
        />
        Numéroter les pages
      </label>

      <button
        type="button"
        data-control="w-entete-fermer"
        onClick={onFermer}
        style={{
          minHeight: 44,
          borderRadius: 8,
          border: "none",
          background: "#1b5e3a",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Fermer l'en-tête
      </button>
    </div>
  )
}

/**
 * Ce que l'en-tête, le pied et le filigrane DESSINENT sur la page.
 *
 * Rendu séparément du panneau : le panneau se referme, la trace visible reste.
 * Sans ce calque, l'apprenant saisirait un en-tête sans jamais le voir — et une
 * étape « vérifiez que l'en-tête porte X » n'aurait aucun sens à l'écran.
 */
export function CalqueHorsFlux({ etat }: { etat: EtatHorsFlux }) {
  const rien = !etat.entete && !etat.pied && !etat.filigrane && !etat.numeroPage
  if (rien) return null

  return (
    <div
      data-calque-hors-flux
      style={{
        position: "absolute",
        inset: 0,
        // Décoratif : ne doit JAMAIS avaler un clic destiné au document.
        pointerEvents: "none",
        zIndex: 6,
      }}
    >
      {etat.entete ? (
        <div
          data-zone-entete
          style={{
            position: "absolute",
            top: 8,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 12,
            color: "#6b6a66",
            borderBottom: "1px dashed #d8d4cd",
            paddingBottom: 4,
          }}
        >
          {etat.entete}
        </div>
      ) : null}

      {etat.filigrane ? (
        <div
          data-zone-filigrane
          style={{
            position: "absolute",
            top: "42%",
            left: 0,
            right: 0,
            textAlign: "center",
            transform: "rotate(-28deg)",
            fontSize: 46,
            fontWeight: 700,
            letterSpacing: 4,
            color: "rgba(120,120,120,.16)",
            textTransform: "uppercase",
            userSelect: "none",
          }}
        >
          {etat.filigrane}
        </div>
      ) : null}

      {etat.pied || etat.numeroPage ? (
        <div
          data-zone-pied
          style={{
            position: "absolute",
            bottom: 8,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 12,
            color: "#6b6a66",
            borderTop: "1px dashed #d8d4cd",
            paddingTop: 4,
          }}
        >
          {etat.pied}
          {etat.pied && etat.numeroPage ? " · " : ""}
          {/* Toujours « 1 » : la surface ne rend qu'une page. */}
          {etat.numeroPage ? "1" : ""}
        </div>
      ) : null}
    </div>
  )
}
