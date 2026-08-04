"use client"

/**
 * La RÈGLE HORIZONTALE de Word, et ses taquets de tabulation.
 *
 * POURQUOI ELLE EST MAISON
 *
 * Le moteur ne connaît AUCUN taquet : ni le modèle de paragraphe, ni aucune des
 * 78 commandes `doc.command.*` relevées. Il n'y a rien à piloter — la règle est
 * donc entièrement à nous, et c'est elle qui rend ses taquets au juge.
 *
 * CE QU'ELLE ENSEIGNE, ET CE QU'ELLE NE FAIT PAS
 *
 * Elle enseigne les trois gestes qui comptent : choisir un TYPE de taquet dans
 * le sélecteur de gauche, le POSER en cliquant sur la règle, le RETIRER en le
 * faisant glisser hors de la règle. Ce sont les gestes de Word, à l'identique.
 *
 * ⚠️ Ce qu'elle ne fait pas : la touche Tab n'aligne pas le texte sur les
 * taquets, puisque le moteur les ignore. Une leçon ne doit donc JAMAIS demander
 * « appuyez sur Tab et constatez l'alignement » — elle mentirait. Les taquets
 * s'enseignent ici comme un réglage qu'on pose et qu'on lit sur la règle, ce que
 * la règle montre fidèlement.
 *
 * ⚠️ Les positions sont arrondies au QUART de centimètre. Une pose à la souris
 * ne tombe jamais au pixel, et sans arrondi aucune étape ne serait franchissable
 * deux fois de suite. Le juge tolère 0,05 cm par-dessus.
 *
 * ⚠️ Styles INLINE, jamais de classe Tailwind inédite.
 */

import { useRef, useState } from "react"

export type TypeTaquet = "gauche" | "centre" | "droite" | "decimal"
export type Taquet = { position: number; type: TypeTaquet }

/** Les taquets, par index de paragraphe. */
export type EtatTaquets = Record<string, Taquet[]>

const CYCLE: TypeTaquet[] = ["gauche", "centre", "droite", "decimal"]

const MARQUE: Readonly<Record<TypeTaquet, string>> = {
  gauche: "L",
  centre: "⊥",
  droite: "⌐",
  decimal: "⊦",
}

const LIBELLE: Readonly<Record<TypeTaquet, string>> = {
  gauche: "Taquet gauche",
  centre: "Taquet centré",
  droite: "Taquet droit",
  decimal: "Taquet décimal",
}

/** Largeur utile de la règle, en centimètres — la largeur de page moins les marges. */
const LARGEUR_CM = 16

export default function WordRuler({
  indexParagraphe,
  taquets,
  onChange,
}: {
  /** Le paragraphe où est le curseur. Les taquets posés lui appartiennent. */
  indexParagraphe: number
  taquets: EtatTaquets
  onChange: (t: EtatTaquets) => void
}) {
  const [type, setType] = useState<TypeTaquet>("gauche")
  const pisteRef = useRef<HTMLDivElement | null>(null)

  const cle = String(indexParagraphe)
  const poses = taquets[cle] ?? []

  const poser = (liste: Taquet[]) => onChange({ ...taquets, [cle]: liste })

  /** Clic sur la règle : pose un taquet du type courant, au quart de cm. */
  const surClicPiste = (e: React.MouseEvent<HTMLDivElement>) => {
    const piste = pisteRef.current
    if (!piste) return
    const rect = piste.getBoundingClientRect()
    if (rect.width <= 0) return
    const cm = ((e.clientX - rect.left) / rect.width) * LARGEUR_CM
    const arrondi = Math.round(cm * 4) / 4
    if (arrondi < 0 || arrondi > LARGEUR_CM) return
    // Reposer au même endroit remplace le taquet au lieu d'en empiler deux.
    const sansDoublon = poses.filter((t) => Math.abs(t.position - arrondi) > 0.12)
    poser([...sansDoublon, { position: arrondi, type }].sort((a, b) => a.position - b.position))
  }

  return (
    <div
      data-regle-word
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 6,
        padding: "4px 8px",
        background: "#f7f5f2",
        borderBottom: "1px solid #e4e0d9",
        userSelect: "none",
      }}
    >
      {/* Le sélecteur de type — le petit carré à gauche de la règle, dans Word.
          Il CYCLE au clic, exactement comme l'original. */}
      <button
        type="button"
        data-control="w-taquet-type"
        aria-label={LIBELLE[type]}
        title={LIBELLE[type]}
        onClick={() => setType((t) => CYCLE[(CYCLE.indexOf(t) + 1) % CYCLE.length])}
        style={{
          minWidth: 34,
          minHeight: 34,
          borderRadius: 6,
          border: "1px solid #d8d4cd",
          background: "#fff",
          cursor: "pointer",
          fontSize: 15,
          lineHeight: 1,
          fontWeight: 700,
          color: "#1b5e3a",
          flexShrink: 0,
        }}
      >
        {MARQUE[type]}
      </button>

      {/* La règle graduée. */}
      <div
        ref={pisteRef}
        data-regle-piste
        onClick={surClicPiste}
        style={{
          position: "relative",
          flex: 1,
          height: 34,
          background: "#fff",
          border: "1px solid #d8d4cd",
          borderRadius: 4,
          cursor: "copy",
          overflow: "hidden",
        }}
      >
        {/* Graduations : un trait par centimètre, chiffré. */}
        {Array.from({ length: LARGEUR_CM + 1 }, (_, cm) => (
          <div
            key={cm}
            style={{
              position: "absolute",
              left: `${(cm / LARGEUR_CM) * 100}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: "#e0dcd5",
            }}
          >
            {cm > 0 && cm < LARGEUR_CM ? (
              <span
                style={{
                  position: "absolute",
                  top: 1,
                  left: 2,
                  fontSize: 9,
                  color: "#a8a29a",
                }}
              >
                {cm}
              </span>
            ) : null}
          </div>
        ))}

        {/* Les taquets posés. Cliquer sur un taquet le retire — c'est le
            « glisser hors de la règle » de Word, rendu atteignable au doigt. */}
        {poses.map((t) => (
          <button
            key={`${t.position}-${t.type}`}
            type="button"
            data-taquet={t.position}
            aria-label={`${LIBELLE[t.type]} à ${t.position.toFixed(2).replace(".", ",")} cm — cliquer pour retirer`}
            title={`${LIBELLE[t.type]} à ${t.position.toFixed(2).replace(".", ",")} cm`}
            onClick={(e) => {
              e.stopPropagation()
              poser(poses.filter((x) => x !== t))
            }}
            style={{
              position: "absolute",
              left: `calc(${(t.position / LARGEUR_CM) * 100}% - 9px)`,
              bottom: 2,
              width: 18,
              height: 20,
              border: "none",
              background: "transparent",
              color: "#1b5e3a",
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {MARQUE[t.type]}
          </button>
        ))}
      </div>
    </div>
  )
}
