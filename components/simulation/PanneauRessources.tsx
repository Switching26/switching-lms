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

import { useCallback, useMemo, useState } from "react"
import { dedupeDocuments, type LearnerDocument } from "@/lib/learner-files"
import { LigneDocument, type EtatConsultation } from "@/components/learner/DocumentActions"
import PdfViewer from "@/components/learner/PdfViewer"
import { C } from "@/lib/simulation/couleurs"

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

  // Un seul document consulté à la fois : l'état vit ici, la visionneuse se
  // superpose à TOUT l'atelier par un portail vers le corps du document.
  const [consulte, setConsulte] = useState<LearnerDocument | null>(null)
  const [etat, setEtat] = useState<EtatConsultation>(null)
  const fermerVisionneuse = useCallback(() => setConsulte(null), [])

  return (
    <>
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
        .res-focus:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: 10px; }
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
            duChapitre.map((doc) => (
              <LigneDocument
                key={doc.id}
                doc={doc}
                onConsulter={setConsulte}
                etat={consulte?.id === doc.id ? etat : null}
              />
            ))
          )}
        </Section>

        {deLaFormation.length > 0 && (
          <Section titre="Toute la formation" nombre={deLaFormation.length}>
            {deLaFormation.map((doc) => (
              <LigneDocument
                key={doc.id}
                doc={doc}
                onConsulter={setConsulte}
                etat={consulte?.id === doc.id ? etat : null}
              />
            ))}
          </Section>
        )}

        {documentsHref && (
          <a
            href={documentsHref}
            className="res-focus mt-1 inline-block text-[12.5px] font-semibold"
            style={{ color: C.accent }}
          >
            Voir tous mes documents →
          </a>
        )}
      </div>
      </aside>

      {/* Portail vers le corps du document : la visionneuse doit passer AU-DESSUS
          de l'atelier, qui vit lui-même dans un portail en `z-index: 30`. */}
      <PdfViewer doc={consulte} onClose={fermerVisionneuse} onEtat={setEtat} />
    </>
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
