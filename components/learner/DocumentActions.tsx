"use client"

/**
 * Les deux actions d'un document pédagogique — composant PARTAGÉ.
 *
 * Le même balisage sert au player classique (SEO / SEA / VBA) et au cockpit du
 * simulateur : c'est la seule façon de garantir que les deux formats offrent
 * exactement le même geste. Toute évolution se fait ici, jamais en double.
 *
 * Ordre : ŒIL puis FLÈCHE. Consulter est le geste courant et non destructif ;
 * télécharger sort le fichier de la plateforme, il vient en second.
 *
 * Les boutons n'ont AUCUN texte visible — leur libellé vit dans `aria-label`
 * (lecteurs d'écran) ET `title` (infobulle desktop), et nomme toujours le
 * document. Cible tactile 44 × 44 px, minimum retenu pour tout le LMS.
 */

import {
  toApiFileUrl,
  typeDeFichier,
  tailleLisible,
  estDocumentExploitable,
  libelleConsulter,
  libelleTelecharger,
  nomTelechargement,
  type LearnerDocument,
} from "@/lib/learner-files"

const ICONE = "h-[18px] w-[18px]"

function IconeOeil() {
  return (
    <svg className={ICONE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
      />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  )
}

function IconeFleche() {
  return (
    <svg className={ICONE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5v11.5m0 0l-4.2-4.2M12 15l4.2-4.2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16.5v2A2.5 2.5 0 006.5 21h11a2.5 2.5 0 002.5-2.5v-2" />
    </svg>
  )
}

function Rotor() {
  return (
    <span
      aria-hidden
      className="h-[17px] w-[17px] animate-spin rounded-full border-2 border-warm-200"
      style={{ borderTopColor: "#7d6e5e" }}
    />
  )
}

/** Style commun aux deux boutons — vert « document », jamais la couleur du partenaire. */
const BOUTON =
  "relative inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl " +
  "transition-colors hover:bg-[#eaf4ee] focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-[-2px] focus-visible:outline-[#107C41] focus-visible:bg-[#eaf4ee] " +
  "disabled:cursor-not-allowed disabled:text-warm-400 disabled:hover:bg-transparent"

export type EtatConsultation = "chargement" | "erreur" | null

export function ActionsDocument({
  doc,
  onConsulter,
  etat = null,
}: {
  doc: LearnerDocument
  /** Ouvre la visionneuse. Le parent porte l'état, un seul document à la fois. */
  onConsulter: (doc: LearnerDocument) => void
  /** État de CE document dans la visionneuse : rotor puis, le cas échéant, erreur. */
  etat?: EtatConsultation
}) {
  const ouvrable = estDocumentExploitable(doc)
  const nom = (doc.name || "").trim()
  const href = ouvrable ? toApiFileUrl(doc.fileUrl) : undefined
  const libelleVoir = ouvrable ? libelleConsulter(nom) : "Fichier indisponible"
  const libelleDl = ouvrable ? libelleTelecharger(nom) : "Fichier indisponible"

  return (
    <div className="flex flex-shrink-0 items-center gap-0.5">
      <button
        type="button"
        data-action="consulter"
        data-doc={doc.id}
        aria-label={libelleVoir}
        title={libelleVoir}
        disabled={!ouvrable}
        onClick={(e) => {
          e.stopPropagation()
          if (ouvrable) onConsulter(doc)
        }}
        className={BOUTON}
        style={ouvrable ? { color: etat === "erreur" ? "#e11d48" : "#107C41" } : undefined}
      >
        {etat === "chargement" ? <Rotor /> : etat === "erreur" ? (
          <span aria-hidden className="text-[15px] font-extrabold leading-none">!</span>
        ) : (
          <IconeOeil />
        )}
      </button>

      {/* Ancre native : le navigateur télécharge en flux, sans passer le fichier
          en mémoire, et iOS Safari la respecte là où un blob échoue. */}
      {ouvrable ? (
        <a
          href={href}
          download={nomTelechargement(doc) ?? undefined}
          data-action="telecharger"
          data-doc={doc.id}
          aria-label={libelleDl}
          title={libelleDl}
          onClick={(e) => e.stopPropagation()}
          className={BOUTON}
          style={{ color: "#107C41" }}
        >
          <IconeFleche />
        </a>
      ) : (
        // Même `data-action` que l'ancre active : sans lui, la variante
        // désactivée devient invisible aux contrôles et à toute QA.
        <button
          type="button"
          disabled
          data-action="telecharger"
          data-doc={doc.id}
          aria-label={libelleDl}
          title={libelleDl}
          className={BOUTON}
        >
          <IconeFleche />
        </button>
      )}
    </div>
  )
}

/**
 * Une ligne complète : vignette, identité, puis les deux actions.
 *
 * Ce n'est PAS un bouton : deux boutons ne peuvent pas s'imbriquer dans un
 * troisième. La ligne est un conteneur inerte, seules les actions sont
 * cliquables — c'est aussi plus clair pour l'apprenant.
 */
export function LigneDocument({
  doc,
  onConsulter,
  etat = null,
}: {
  doc: LearnerDocument
  onConsulter: (doc: LearnerDocument) => void
  etat?: EtatConsultation
}) {
  const ouvrable = estDocumentExploitable(doc)
  const type = ouvrable ? typeDeFichier(doc.fileUrl) : null
  const taille = ouvrable ? tailleLisible(doc.fileSize) : null
  const meta = ouvrable ? [type, taille].filter(Boolean).join(" · ") : "Fichier indisponible"

  return (
    <div
      className={`mb-1.5 flex items-center gap-2.5 rounded-xl border border-border p-2 pl-2.5 transition-colors hover:border-warm-300 hover:bg-warm-50 ${
        ouvrable ? "" : "opacity-70"
      }`}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[9.5px] font-extrabold"
        style={ouvrable ? { background: "#eaf4ee", color: "#107C41" } : { background: "#efece5", color: "#9a938a" }}
      >
        {type && type.length <= 4 ? type : "DOC"}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[12.5px] font-semibold text-ink">{doc.name}</span>
        {meta && <span className="text-[11px] text-warm-400">{meta}</span>}
      </span>
      <ActionsDocument doc={doc} onConsulter={onConsulter} etat={etat} />
    </div>
  )
}
