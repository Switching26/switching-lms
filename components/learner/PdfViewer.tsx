"use client"

/**
 * Visionneuse de document — composant PARTAGÉ par les deux players.
 *
 * Elle sert la CONSULTATION : le document s'affiche, et aucune action de
 * téléchargement n'y figure. Le téléchargement explicite reste la flèche de la
 * ligne de ressource, jamais ici.
 *
 * ── Honnêteté technique, à ne pas oublier en relisant ce fichier ───────────
 * `/api/files/[filename]` sert les PDF SANS en-tête `Content-Disposition` :
 * le navigateur les affiche donc en ligne, et une `iframe` suffit — aucune
 * dépendance ajoutée, aucune route nouvelle. L'accès reste gardé par la route
 * (401 sans session, 403 sans inscription active).
 * En revanche :
 *  · `#toolbar=0` masque la barre native du lecteur intégré de Chrome et Edge ;
 *    Firefox (pdf.js) l'ignore, et iOS Safari garde sa propre barre de partage ;
 *  · un COMPTEUR DE PAGES fiable est impossible avec une `iframe` — le lecteur
 *    PDF du navigateur n'expose rien à la page hôte. Il faudrait embarquer
 *    pdf.js et rendre nous-mêmes chaque page. On affiche donc le type et la
 *    taille, qui viennent des props serveur et sont exacts, plutôt qu'un
 *    compteur approximatif ;
 *  · AUCUN rendu web n'empêche à 100 % la copie, la mise en cache ou la
 *    capture d'écran. On retire notre bouton, pas la possibilité physique.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toApiFileUrl, typeDeFichier, tailleLisible, type LearnerDocument } from "@/lib/learner-files"

/** Au-delà, on considère que le document ne viendra pas (réseau, 403, 404). */
const DELAI_CHARGEMENT_MS = 15_000

export default function PdfViewer({
  doc,
  onClose,
  onEtat,
}: {
  /** Document affiché ; `null` ferme la visionneuse. */
  doc: LearnerDocument | null
  onClose: () => void
  /** Remonte l'état au parent, pour le rotor du bouton œil qui a ouvert. */
  onEtat?: (etat: "chargement" | "erreur" | null) => void
}) {
  const [monte, setMonte] = useState(false)
  const [charge, setCharge] = useState(false)
  const [echec, setEchec] = useState(false)
  const boiteRef = useRef<HTMLDivElement>(null)
  const declencheurRef = useRef<HTMLElement | null>(null)

  // `document` n'existe pas au rendu serveur.
  useEffect(() => setMonte(true), [])

  const ouvert = monte && !!doc

  // Mémorise QUI a ouvert, pour lui rendre le focus à la fermeture. Se lit au
  // moment de l'ouverture : après, le focus a déjà bougé dans la boîte.
  useEffect(() => {
    if (!doc) return
    declencheurRef.current = document.activeElement as HTMLElement | null
    setCharge(false)
    setEchec(false)
  }, [doc])

  useEffect(() => {
    onEtat?.(!doc ? null : echec ? "erreur" : charge ? null : "chargement")
  }, [doc, charge, echec, onEtat])

  // Le document ne vient pas : on le dit plutôt que de laisser tourner.
  useEffect(() => {
    if (!ouvert || charge || echec) return
    const t = window.setTimeout(() => setEchec(true), DELAI_CHARGEMENT_MS)
    return () => window.clearTimeout(t)
  }, [ouvert, charge, echec])

  /**
   * Verrou de défilement COMPOSABLE : on restaure la valeur PRÉCÉDENTE, pas
   * une chaîne vide. L'atelier de simulation pose déjà `overflow: hidden` sur
   * le corps ; l'écraser rendrait la page défilante en refermant la
   * visionneuse ouverte depuis le cockpit.
   */
  useEffect(() => {
    if (!ouvert) return
    const avant = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = avant
    }
  }, [ouvert])

  /**
   * `aria-modal` n'est vrai que si le reste de la page est hors de portée :
   * sans cela la tabulation continue de parcourir le player derrière le voile.
   * On rend inertes les frères de la boîte, en restaurant l'état d'origine.
   */
  useEffect(() => {
    if (!ouvert) return
    const boite = boiteRef.current
    const modifies: HTMLElement[] = []
    Array.from(document.body.children).forEach((el) => {
      const noeud = el as HTMLElement
      if (boite && noeud.contains(boite)) return
      if (noeud.hasAttribute("inert")) return
      noeud.setAttribute("inert", "")
      modifies.push(noeud)
    })
    return () => modifies.forEach((n) => n.removeAttribute("inert"))
  }, [ouvert])

  const fermer = useCallback(() => {
    const cible = declencheurRef.current
    declencheurRef.current = null
    onClose()
    // Après le démontage, sinon le focus retombe en tête de document.
    window.setTimeout(() => cible?.focus?.({ preventScroll: true }), 0)
  }, [onClose])

  useEffect(() => {
    if (!ouvert) return
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        fermer()
      }
    }
    // En capture : l'atelier de simulation écoute aussi Échap, et c'est la
    // surface la plus haute à l'écran qui doit se fermer en premier.
    document.addEventListener("keydown", surTouche, true)
    return () => document.removeEventListener("keydown", surTouche, true)
  }, [ouvert, fermer])

  useEffect(() => {
    if (ouvert) boiteRef.current?.focus({ preventScroll: true })
  }, [ouvert])

  if (!ouvert || !doc) return null

  const href = toApiFileUrl(doc.fileUrl)
  const type = typeDeFichier(doc.fileUrl)
  const taille = tailleLisible(doc.fileSize)
  const meta = [type, taille].filter(Boolean).join(" · ")

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <div
        role="presentation"
        onClick={fermer}
        className="absolute inset-0 bg-[rgba(8,17,14,.72)]"
        aria-hidden
      />
      <div
        ref={boiteRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="visionneuse-titre"
        tabIndex={-1}
        data-visionneuse
        className="relative flex h-full max-h-[92dvh] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
      >
        <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-border bg-warm-50 px-3 py-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[9.5px] font-extrabold"
            style={{ background: "#eaf4ee", color: "#107C41" }}
          >
            {type && type.length <= 4 ? type : "DOC"}
          </span>
          <div className="min-w-0 flex-1">
            <p id="visionneuse-titre" className="truncate text-[13.5px] font-bold text-ink">
              {doc.name}
            </p>
            {meta && <p className="text-[11px] text-warm-400">{meta}</p>}
          </div>
          <button
            type="button"
            data-action="fermer-visionneuse"
            onClick={fermer}
            aria-label="Fermer la visionneuse"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-warm-100 text-[15px] text-warm-600 transition-colors hover:bg-warm-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#107C41]"
          >
            ✕
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-warm-200">
          {!charge && !echec && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-warm-600">
              <span
                aria-hidden
                className="h-7 w-7 animate-spin rounded-full border-2 border-warm-300"
                style={{ borderTopColor: "#107C41" }}
              />
              <p className="text-[12.5px]">Ouverture du document…</p>
            </div>
          )}
          {echec && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[13.5px] font-semibold text-ink">Ce document n&apos;a pas pu être affiché.</p>
              <p className="max-w-[38ch] text-[12px] leading-relaxed text-warm-500">
                Votre accès à la formation est peut-être arrivé à échéance, ou la connexion a été interrompue.
              </p>
              <button
                type="button"
                data-action="reessayer"
                onClick={() => {
                  setEchec(false)
                  setCharge(false)
                }}
                className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white"
                style={{ background: "#107C41" }}
              >
                Réessayer
              </button>
            </div>
          )}
          <iframe
            // `key` sur l'URL + l'essai : « Réessayer » doit vraiment relancer
            // le chargement, pas réutiliser l'iframe déjà en échec.
            key={`${href}#${echec ? "e" : "n"}`}
            src={`${href}#toolbar=0&navpanes=0&view=FitH`}
            title={doc.name}
            onLoad={() => setCharge(true)}
            onError={() => setEchec(true)}
            className={`h-full w-full border-0 ${charge && !echec ? "" : "invisible"}`}
          />
        </div>

        <p className="flex-shrink-0 border-t border-border bg-white px-3 py-2 text-[11px] leading-relaxed text-warm-500">
          Consultation seule : aucune action de téléchargement ici. Pour conserver le document, utilisez la
          flèche de la ligne de ressource.
        </p>
      </div>
    </div>,
    document.body,
  )
}
