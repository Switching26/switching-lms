"use client"

/**
 * Panneau « Ressource pédagogique téléchargeable » de l'atelier.
 *
 * Il n'expose QUE des documents déjà présents en base — pièces jointes du
 * chapitre courant (`Attachment`) puis de la formation (`FormationAttachment`),
 * toutes deux déjà chargées par `getLearnerFormationById` et passées en props.
 * Aucune requête n'est faite ici : rien à charger, rien à inventer.
 *
 * Géométrie reprise à l'identique du panneau « Mes notes » : superposé depuis
 * `top: 44`, il ne pousse jamais le contenu — la règle « l'atelier ne défile
 * jamais » tient donc panneau ouvert.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  toApiFileUrl,
  typeDeFichier,
  tailleLisible,
  estDocumentExploitable,
  dedupeDocuments,
  type LearnerDocument,
} from "@/lib/learner-files"

/** Libellé exact demandé, employé tel quel en titre et en `aria-label`. */
export const LIBELLE_RESSOURCES = "Ressource pédagogique téléchargeable"

type Props = {
  /** Identifiant du panneau, cible du `aria-controls` du bouton du cockpit. */
  id: string
  ouvert: boolean
  onFermer: () => void
  /** Pièces jointes du chapitre affiché, telles quelles. */
  documentsChapitre?: LearnerDocument[]
  /** Pièces jointes de la formation, telles quelles. */
  documentsFormation?: LearnerDocument[]
  /** Lien vers la page « Documents » de l'apprenant, en accès secondaire. */
  documentsHref?: string
}

export default function PanneauRessources({
  id,
  ouvert,
  onFermer,
  documentsChapitre,
  documentsFormation,
  documentsHref,
}: Props) {
  // Le dédoublonnage vit ICI plutôt que chez l'appelant : il dépend du chapitre
  // affiché, et le contrat reste « passe les pièces jointes telles que le
  // serveur les a chargées ».
  //
  // On ne FILTRE PAS les lignes incomplètes : les masquer ferait disparaître un
  // document en silence, alors que l'apprenant en attend un. Chaque ligne rend
  // son propre état, « Fichier indisponible » compris. Le filtrage ne sert qu'à
  // décider de l'affichage du contrôle, et il se fait en amont (`player.tsx`).
  const duChapitre = useMemo(() => documentsChapitre ?? [], [documentsChapitre])
  const deLaFormation = useMemo(
    () => dedupeDocuments(documentsFormation ?? [], duChapitre),
    [documentsFormation, duChapitre],
  )

  return (
    <aside
      id={id}
      aria-label={LIBELLE_RESSOURCES}
      aria-hidden={!ouvert}
      className="absolute bottom-0 right-0 flex flex-col bg-white shadow-2xl"
      style={{
        top: 44,
        // Un peu plus large que « Mes notes » (340) : un nom de document et sa
        // taille tiennent sur une ligne. Toujours plus étroit que « Leçons »
        // (460), la feuille de calcul restant l'écran de travail.
        width: "min(380px, 86%)",
        zIndex: 70,
        transform: ouvert ? "translateX(0)" : "translateX(101%)",
        transition: "transform .26s cubic-bezier(.32,.72,0,1)",
        visibility: ouvert ? "visible" : "hidden",
      }}
    >
      {/* Focus visible : les utilitaires `focus-visible:` ne sont pas garantis
          dans la feuille compilée servie au banc. Règle du player : toute
          nouveauté visuelle passe en style embarqué. */}
      <style>{`
        .res-focus:focus-visible { outline: 2px solid #107C41; outline-offset: 2px; border-radius: 10px; }
      `}</style>

      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-warm-50 px-3 py-2.5">
        <h4 className="flex-1 text-[13.5px] font-bold leading-tight">{LIBELLE_RESSOURCES}</h4>
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer"
          className="res-focus flex-shrink-0 rounded-lg bg-warm-100 px-2 py-1 text-[12px] text-warm-600"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Section titre="Ce chapitre" nombre={duChapitre.length}>
          {duChapitre.length === 0 ? (
            <p className="px-0.5 pb-1 text-[12px] text-warm-400">
              Aucun document propre à ce chapitre.
            </p>
          ) : (
            duChapitre.map((doc) => <Ligne key={doc.id} doc={doc} />)
          )}
        </Section>

        {deLaFormation.length > 0 && (
          <Section titre="Toute la formation" nombre={deLaFormation.length}>
            {deLaFormation.map((doc) => (
              <Ligne key={doc.id} doc={doc} />
            ))}
          </Section>
        )}

        {documentsHref && (
          <a
            href={documentsHref}
            className="res-focus mt-1 inline-block text-[12.5px] font-semibold"
            style={{ color: "#107C41" }}
          >
            Voir tous mes documents →
          </a>
        )}
      </div>
    </aside>
  )
}

function Section({
  titre,
  nombre,
  children,
}: {
  titre: string
  nombre: number
  children: React.ReactNode
}) {
  return (
    <section className="mb-3">
      <h5 className="mb-2 flex items-baseline gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-warm-400">
        {titre}
        {nombre > 0 && <span className="tabular-nums font-normal">· {nombre}</span>}
      </h5>
      {children}
    </section>
  )
}

/**
 * Une ligne de document.
 *
 * `download` + `target="_blank"` : sur navigateur de bureau, l'origine étant la
 * même, `download` l'emporte et le fichier est enregistré sans ouvrir d'onglet.
 * iOS Safari ignore `download` et ouvre le document dans un onglet — c'est le
 * comportement souhaitable là-bas, le visionneuse PDF intégrée y étant la seule
 * façon confortable de lire (même raison que la carte « Ouvrir le document » du
 * player sur mobile).
 */
function Ligne({ doc }: { doc: LearnerDocument }) {
  const [ouverture, setOuverture] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const ouvrable = estDocumentExploitable(doc)
  const href = ouvrable ? toApiFileUrl(doc.fileUrl) : null
  const type = ouvrable ? typeDeFichier(doc.fileUrl) : null
  const taille = tailleLisible(doc.fileSize)
  const meta = [type, taille].filter(Boolean).join(" · ")

  // Un document sans fichier exploitable est le SEUL échec connaissable sans
  // requête : on le dit, plutôt que de proposer un lien qui n'ouvrirait rien.
  if (!href) {
    return (
      <div className="mb-1.5 flex items-center gap-2.5 rounded-xl border border-border p-2.5 opacity-70">
        <Vignette type={null} sourd />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-warm-500">{doc.name}</p>
          <p className="text-[11px] text-warm-400">Fichier indisponible</p>
        </div>
      </div>
    )
  }

  return (
    <a
      href={href}
      download
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // Aucune progression réseau n'est observable sur un lien de
        // téléchargement : on ne signale que le DÉPART de l'ouverture, le temps
        // que le navigateur prenne la main.
        setOuverture(true)
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setOuverture(false), 2200)
      }}
      className="res-focus mb-1.5 flex items-center gap-2.5 rounded-xl border border-border p-2.5 transition-colors hover:bg-warm-50"
    >
      <Vignette type={type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold text-ink">{doc.name}</p>
        {meta && <p className="text-[11px] text-warm-400">{meta}</p>}
      </div>
      <span
        aria-live="polite"
        className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold"
        style={{ background: "#eaf4ee", color: "#107C41" }}
      >
        {ouverture ? "Ouverture…" : "Télécharger"}
      </span>
    </a>
  )
}

/** Vignette du document : l'extension quand on la connaît, une icône sinon. */
function Vignette({ type, sourd }: { type: string | null; sourd?: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[9.5px] font-extrabold"
      style={
        sourd
          ? { background: "#efece5", color: "#9a938a" }
          : { background: "#eaf4ee", color: "#107C41" }
      }
    >
      {type && type.length <= 4 ? (
        type
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 3v5h5M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"
          />
        </svg>
      )}
    </span>
  )
}
