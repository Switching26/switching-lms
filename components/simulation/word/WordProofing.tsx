"use client"

/*
 * ⚠️ Les boutons « Corriger », « Ignorer » et chaque synonyme ne portent PAS de
 * `data-control` : leur identifiant dépendrait du mot, donc du scénario, et ne
 * pourrait jamais figurer dans la table des libellés que `check-controles`
 * exige. Ils portent `data-corriger`, `data-ignorer`, `data-synonyme`. Ce n'est
 * pas un contournement : ces boutons ne sont pas jugés en tant que clics — le
 * jugement porte sur le TEXTE qu'ils produisent, via `W_EXPECT_DOC`.
 */

/**
 * Le panneau VÉRIFICATION de Word — orthographe, dictionnaire, synonymes.
 *
 * POURQUOI IL EST MAISON, ET POURQUOI IL EST HONNÊTE
 *
 * Univer Docs n'embarque aucun correcteur : ni dictionnaire, ni détection, ni
 * suggestion. Il n'y a donc rien à piloter — mais la NOTION s'enseigne très
 * bien, parce que ce qu'un apprenant doit acquérir n'est pas l'algorithme du
 * correcteur : c'est le réflexe de lire la suggestion avant de l'accepter, et de
 * savoir qu'un correcteur se trompe.
 *
 * ⚠️ Ce panneau ne DEVINE rien. Il compare le texte du document à une liste de
 * fautes connues, fournie par le scénario. C'est volontaire : un correcteur
 * approximatif écrit à la main proposerait de fausses corrections et
 * apprendrait le contraire de ce qu'on veut. Ici, chaque suggestion affichée est
 * une suggestion que l'auteur du chapitre a écrite — y compris les mauvaises,
 * quand la leçon porte justement sur le refus d'une suggestion.
 *
 * La correction acceptée est APPLIQUÉE AU DOCUMENT, via `w-corriger-mot` : le
 * jugement se fait donc sur le texte réel, avec `W_EXPECT_DOC`, sans qu'aucune
 * action nouvelle soit nécessaire.
 *
 * ⚠️ Styles INLINE, jamais de classe Tailwind inédite.
 */

import { useState } from "react"

/** Une entrée du correcteur, telle que le scénario la déclare. */
export type EntreeCorrecteur = {
  /** Le mot tel qu'il est dans le document. */
  mot: string
  /** Ce que le correcteur propose. */
  suggestion: string
  /** Pourquoi — affiché sous la suggestion. */
  motif?: string
}

/** Une entrée du dictionnaire des synonymes. */
export type EntreeSynonymes = { mot: string; synonymes: string[] }

export type ReglagesCorrecteur = {
  fautes?: EntreeCorrecteur[]
  synonymes?: EntreeSynonymes[]
}

/**
 * Les deux onglets du panneau.
 *
 * ⚠️ Écrits comme une TABLE À CHAMP `controle:`, pas comme des tuples : c'est le
 * motif que `check-controles` sait lire. Un tuple aurait rendu ces deux boutons
 * invisibles au contrôle, donc signalés comme libellés orphelins.
 */
const ONGLETS_VERIF = [
  { id: "orthographe" as const, libelle: "Orthographe", controle: "w-verif-orthographe" },
  { id: "synonymes" as const, libelle: "Synonymes", controle: "w-verif-synonymes" },
]

export default function WordProofing({
  reglages,
  textes,
  onCorriger,
  onFermer,
  onControle,
}: {
  reglages: ReglagesCorrecteur
  /** Les textes du document, pour ne proposer que ce qui s'y trouve encore. */
  textes: string[]
  /** Applique un remplacement dans le document. */
  onCorriger: (mot: string, remplacement: string) => void
  onFermer: () => void
  onControle: (id: string) => void
}) {
  const [onglet, setOnglet] = useState<"orthographe" | "synonymes">("orthographe")
  const [ignores, setIgnores] = useState<string[]>([])

  // ⚠️ Comparaison INSENSIBLE À LA CASSE : un mot en début de phrase porte une
  // majuscule que le scénario n'a pas à dupliquer. Sans cela, « Conventio »
  // dans le document ne correspondait pas à « conventio » déclaré, et l'entrée
  // ne s'affichait tout simplement pas.
  const corpus = textes.join(" ")
  const contient = (mot: string) => corpus.toLowerCase().includes(mot.toLowerCase())
  // Une faute déjà corrigée disparaît de la liste : c'est ce qui fait qu'un
  // correcteur « se vide » à mesure qu'on le traite, et que l'apprenant voit
  // son travail avancer.
  const restantes = (reglages.fautes ?? []).filter(
    (f) => contient(f.mot) && !ignores.includes(f.mot),
  )

  return (
    <div
      role="dialog"
      aria-label="Vérification"
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        bottom: 12,
        zIndex: 40,
        width: 290,
        maxWidth: "92%",
        background: "#fff",
        border: "1px solid #d8d4cd",
        borderRadius: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,.16)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
      }}
    >
      <strong style={{ fontSize: 14 }}>Vérification</strong>

      <div style={{ display: "flex", gap: 6 }}>
        {ONGLETS_VERIF.map(({ id, libelle, controle }) => (
          <button
            key={id}
            type="button"
            data-control={controle}
            onClick={() => {
              setOnglet(id)
              onControle(controle)
            }}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
              border: onglet === id ? "2px solid #1b5e3a" : "1px solid #d8d4cd",
              background: onglet === id ? "#eef6f1" : "#fff",
              fontWeight: onglet === id ? 600 : 400,
            }}
          >
            {libelle}
          </button>
        ))}
      </div>

      {onglet === "orthographe" ? (
        restantes.length === 0 ? (
          <p style={{ fontSize: 13, color: "#5c8f72", margin: 0 }}>
            Aucune erreur restante dans ce document.
          </p>
        ) : (
          restantes.map((f) => (
            <div
              key={f.mot}
              style={{
                border: "1px solid #e4e0d9",
                borderRadius: 8,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 13 }}>
                <s style={{ color: "#a8443a" }}>{f.mot}</s> → <strong>{f.suggestion}</strong>
              </span>
              {f.motif ? (
                <span style={{ fontSize: 11, color: "#9a938a" }}>{f.motif}</span>
              ) : null}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  data-corriger={f.mot}
                  onClick={() => onCorriger(f.mot, f.suggestion)}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    borderRadius: 8,
                    border: "none",
                    background: "#1b5e3a",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Corriger
                </button>
                {/*
                 * « Ignorer » n'est pas décoratif : la moitié de ce qu'un
                 * correcteur signale est juste — noms propres, jargon métier,
                 * sigles. Savoir refuser une suggestion est une compétence.
                 */}
                <button
                  type="button"
                  data-ignorer={f.mot}
                  onClick={() => setIgnores((l) => [...l, f.mot])}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    borderRadius: 8,
                    border: "1px solid #d8d4cd",
                    background: "#fff",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Ignorer
                </button>
              </div>
            </div>
          ))
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(reglages.synonymes ?? []).map((e) => (
            <div
              key={e.mot}
              style={{
                border: "1px solid #e4e0d9",
                borderRadius: 8,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 13 }}>
                Synonymes de <strong>{e.mot}</strong>
              </span>
              {e.synonymes.map((syn) => (
                <button
                  key={syn}
                  type="button"
                  data-synonyme={syn}
                  onClick={() => onCorriger(e.mot, syn)}
                  disabled={!contient(e.mot)}
                  style={{
                    minHeight: 40,
                    borderRadius: 8,
                    border: "1px solid #d8d4cd",
                    background: contient(e.mot) ? "#fff" : "#f3f1ee",
                    fontSize: 13,
                    cursor: contient(e.mot) ? "pointer" : "default",
                    color: contient(e.mot) ? "#2c2a26" : "#a8a29a",
                  }}
                >
                  {syn}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        data-control="w-verif-fermer"
        onClick={onFermer}
        style={{
          marginTop: "auto",
          minHeight: 44,
          borderRadius: 8,
          border: "none",
          background: "#1b5e3a",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Fermer
      </button>
    </div>
  )
}
