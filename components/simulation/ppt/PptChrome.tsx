"use client"

/**
 * PowerPoint — le ruban.
 *
 * Composant de MODULE, jamais une fonction déclarée dans le corps de la surface.
 * Un composant défini dans le parent a une identité neuve à chaque rendu : React
 * démonte puis remonte tout son sous-arbre. Sur `PivotLayer`, ce défaut faisait
 * disparaître le nœud en plein glisser-déposer et le dépôt était perdu ; ici il
 * ferait perdre le focus et refermerait les menus tout seuls.
 *
 * ⚠️ STYLES EN INLINE, keyframes embarquées. Le JIT Tailwind ne génère que les
 * classes présentes à la compilation : une classe inédite est inerte, au banc
 * comme en production (invariant §6.5). C'est le défaut qui a rendu invisible
 * tout le premier retour visuel du player d'Excel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE SEULE LIGNE, DÉFILANTE — décision D2, et pas seulement pour le mobile
 *
 * Le prototype empilait ses groupes sur quatre lignes : 150 px de haut à 390 px,
 * soit 18 % de la hauteur d'écran pour un ruban. Le motif retenu est celui,
 * éprouvé, du ruban mobile d'Excel : une ligne de 56 px qui défile
 * horizontalement.
 *
 * Il est appliqué à TOUTES les tailles d'écran, et ce n'est pas de la paresse :
 *
 *  · le ruban d'Excel a sept onglets, dont un seul est rendu à la fois. C'est ce
 *    qui a produit une classe entière de défauts — 55 gestes de démonstration
 *    visaient un bouton logé sous un autre onglet, donc introuvable, et le
 *    pilote perdait 30 s de délai d'attente par onglet exploré. Un ruban sans
 *    onglet ne peut pas avoir ce défaut ;
 *  · les groupes restent NOMMÉS (« Diapositives », « Police », « Insertion »…),
 *    donc la structure du vrai ruban reste enseignée.
 *
 * Contrepartie assumée, à porter au lot 2 : on n'enseigne pas encore le geste
 * « aller dans l'onglet Insertion ». Les onglets sont une brique à part entière,
 * avec son propre risque, et le contrat demande de reporter ce qui coûte plutôt
 * que de le bâcler.
 */

import { useEffect, useRef, useState } from "react"
import {
  CONTROLES_PPT,
  LAYOUTS,
  LAYOUTS_ORDRE,
  type DeckState,
  type GestePpt,
  type SlideObject,
  type SlideState,
} from "@/lib/simulation/ppt/document"
import { FORMES, NOM_FORME } from "./formes"

type Props = {
  deck: DeckState
  slide: SlideState
  iActive: number
  selection: string[]
  onGeste: (geste: GestePpt, canal?: string) => void
  /** Aperçu admin : le ruban se voit, il n'agit pas. */
  lecture: boolean
  /** Image d'exemple, en data URI — voir la règle « zéro asset ». */
  imageDemo: string
  /** Vrai quand la zone de travail est étroite : cibles tactiles agrandies. */
  etroit: boolean
}

/** Hauteur du ruban. 56 px sur une ligne, la valeur éprouvée sur Excel mobile. */
export const HAUTEUR_RUBAN = 56

const ENCRE = "#1F2933"
const BORD = "#D6DBE1"
const ACCENT = "#B7472A" // le rouge brique de PowerPoint, pas le vert d'Excel

/* ═══════════ PRIMITIVES ═══════════ */

function Separateur() {
  return <span aria-hidden style={{ width: 1, height: 26, background: BORD, flexShrink: 0, margin: "0 2px" }} />
}

function Groupe({ nom, children }: { nom: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, flexShrink: 0 }}>
      <span style={{ display: "flex", gap: 3, alignItems: "center" }}>{children}</span>
      <span
        aria-hidden
        style={{ fontSize: 8.5, color: "#8D96A0", letterSpacing: ".02em", lineHeight: 1, pointerEvents: "none" }}
      >
        {nom}
      </span>
    </span>
  )
}

/* ═══════════ COMPOSANT ═══════════ */

export default function PptChrome({
  deck,
  slide,
  iActive,
  selection,
  onGeste,
  lecture,
  imageDemo,
  etroit,
}: Props) {
  const [menu, setMenu] = useState<null | "disposition" | "forme">(null)
  const rubanRef = useRef<HTMLDivElement | null>(null)

  /* Un menu ouvert se referme au clic ailleurs et à Échap — sans quoi il reste
     posé sur la scène et masque la diapositive que la consigne désigne. */
  useEffect(() => {
    if (!menu) return
    const ailleurs = (e: MouseEvent) => {
      if (!rubanRef.current?.contains(e.target as Node)) setMenu(null)
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null)
    }
    window.addEventListener("mousedown", ailleurs)
    window.addEventListener("keydown", echap)
    return () => {
      window.removeEventListener("mousedown", ailleurs)
      window.removeEventListener("keydown", echap)
    }
  }, [menu])

  /**
   * Cible tactile : le LMS impose 44 px sur mobile — EN LARGEUR COMME EN HAUTEUR.
   *
   * La première version ne posait que `minHeight`. Mesuré au banc à 390 px : les
   * boutons à icône seule (G, I, S, les trois alignements) sortaient à 21 × 44,
   * 25 × 44, 27 × 44 — conformes en hauteur, inatteignables au doigt en largeur.
   * C'est exactement le défaut du guide de la formation le 03/08, où un premier
   * contrôle avait toléré des pastilles de 18 × 44 : un contrôle de cible
   * tactile qui ne mesure qu'une dimension ne prouve rien.
   *
   * Le BOUTON porte les 44 px, sa pastille visible en garde 28 : la cible est
   * réglementaire sans que le ruban change d'allure — même motif que le bouton
   * Guide du cockpit, dont la boîte fait 44 px et le fond 28.
   */
  const cible = etroit ? 44 : 30

  const btn = (
    id: string,
    libelle: string,
    action: () => void,
    opts?: { actif?: boolean; icone?: React.ReactNode; titre?: string },
  ) => (
    <button
      key={id}
      type="button"
      data-control={id}
      aria-label={opts?.titre ?? libelle}
      title={opts?.titre ?? libelle}
      aria-pressed={opts?.actif ? true : undefined}
      onClick={() => {
        if (lecture) return
        action()
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: "none",
        padding: 0,
        minHeight: cible,
        minWidth: cible,
        flexShrink: 0,
        cursor: lecture ? "default" : "pointer",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          border: "1px solid " + (opts?.actif ? ACCENT : BORD),
          background: opts?.actif ? "#FBEDE9" : "#fff",
          color: opts?.actif ? ACCENT : ENCRE,
          borderRadius: 4,
          padding: "0 8px",
          height: 28,
          fontSize: 11.5,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {opts?.icone}
        {libelle}
      </span>
    </button>
  )

  const optionMenu = (id: string, libelle: string, action: () => void, actif = false) => (
    <button
      key={id}
      type="button"
      data-control={id}
      onClick={() => {
        if (lecture) return
        setMenu(null)
        action()
      }}
      style={{
        border: "none",
        background: actif ? "#FBEDE9" : "transparent",
        color: ENCRE,
        textAlign: "left",
        padding: "0 14px",
        fontSize: 12,
        // 44 px : ces options sont la cible tactile la plus fine du ruban.
        minHeight: 44,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {libelle}
    </button>
  )

  const panneauMenu = (etiquette: string, contenu: React.ReactNode) => (
    <span
      role="menu"
      aria-label={etiquette}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 2,
        background: "#fff",
        border: "1px solid " + BORD,
        borderRadius: 6,
        boxShadow: "0 8px 22px rgba(16,24,32,.16)",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        minWidth: 200,
        overflow: "hidden",
      }}
    >
      {contenu}
    </span>
  )

  /** Bascule un attribut de style sur toute la sélection. */
  const basculer = (id: string, cle: "bold" | "italic" | "underline", libelle: string) => {
    const actif = selection.some((oid) => slide.objects.find((o) => o.id === oid)?.style?.[cle])
    return btn(
      id,
      libelle,
      () =>
        selection.forEach((oid) =>
          onGeste(
            { type: "format", objectId: oid, style: { [cle]: !slide.objects.find((o) => o.id === oid)?.style?.[cle] } },
            "ribbon",
          ),
        ),
      { actif },
    )
  }

  return (
    <div
      ref={rubanRef}
      data-zone="ruban"
      style={{
        borderBottom: "1px solid " + BORD,
        background: "#fff",
        flexShrink: 0,
        height: HAUTEUR_RUBAN,
        // UNE seule ligne, qui défile horizontalement. `overflow-x: auto` et non
        // `wrap` : c'est ce qui garantit que le ruban ne mange jamais plus de
        // 56 px de hauteur, quelle que soit la largeur de l'écran.
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px", height: "100%", width: "max-content" }}>
        <Groupe nom="Diapositives">
          {btn(CONTROLES_PPT.nouvelleDiapo, "Nouvelle", () => onGeste({ type: "addSlide" }, "ribbon"), {
            titre: "Nouvelle diapositive",
          })}
          <span style={{ position: "relative", display: "flex" }}>
            {btn(
              CONTROLES_PPT.disposition,
              "Disposition ▾",
              () => setMenu((m) => (m === "disposition" ? null : "disposition")),
              { actif: menu === "disposition" },
            )}
            {menu === "disposition"
              ? panneauMenu(
                  "Dispositions",
                  LAYOUTS_ORDRE.map((id) =>
                    optionMenu(
                      CONTROLES_PPT.dispositionChoix(id),
                      LAYOUTS[id].nom,
                      () => onGeste({ type: "setLayout", index: iActive, layout: id }, "ribbon"),
                      slide.layout === id,
                    ),
                  ),
                )
              : null}
          </span>
          {btn(CONTROLES_PPT.dupliquerDiapo, "Dupliquer", () =>
            onGeste({ type: "duplicateSlide", index: iActive }, "ribbon"),
          )}
          {btn(CONTROLES_PPT.supprimerDiapo, "Supprimer", () =>
            onGeste({ type: "deleteSlide", index: iActive }, "ribbon"),
          )}
          {/* Réordonnancement — décision D11. Par boutons, jamais par glisser :
              le volet devient un tiroir de quelques dizaines de pixels à 390 px,
              où tirer une vignette au doigt échoue plus souvent qu'il ne
              réussit. Les deux boutons agissent sur la diapositive AFFICHÉE,
              comme leurs voisins : une seule règle pour tout le groupe. */}
          {btn(CONTROLES_PPT.monterDiapo, "↑ Monter", () => {
            if (iActive > 0) onGeste({ type: "moveSlide", from: iActive, to: iActive - 1 }, "ribbon")
          })}
          {btn(CONTROLES_PPT.descendreDiapo, "↓ Descendre", () => {
            if (iActive < deck.slides.length - 1)
              onGeste({ type: "moveSlide", from: iActive, to: iActive + 1 }, "ribbon")
          })}
        </Groupe>

        <Separateur />

        <Groupe nom="Police">
          {basculer(CONTROLES_PPT.gras, "bold", "G")}
          {basculer(CONTROLES_PPT.italique, "italic", "I")}
          {basculer(CONTROLES_PPT.souligne, "underline", "S")}
          {btn(CONTROLES_PPT.alignGauche, "◧", () =>
            selection.forEach((oid) => onGeste({ type: "format", objectId: oid, style: { align: "left" } }, "ribbon")),
            { titre: "Aligner à gauche" },
          )}
          {btn(CONTROLES_PPT.alignCentre, "▣", () =>
            selection.forEach((oid) => onGeste({ type: "format", objectId: oid, style: { align: "center" } }, "ribbon")),
            { titre: "Centrer" },
          )}
          {btn(CONTROLES_PPT.alignDroite, "◨", () =>
            selection.forEach((oid) => onGeste({ type: "format", objectId: oid, style: { align: "right" } }, "ribbon")),
            { titre: "Aligner à droite" },
          )}
        </Groupe>

        <Separateur />

        <Groupe nom="Insertion">
          {btn(CONTROLES_PPT.zoneTexte, "Zone de texte", () =>
            onGeste({ type: "addObject", objectType: "texte", rect: { x: 320, y: 400, w: 320, h: 70 } }, "ribbon"),
          )}
          {btn(CONTROLES_PPT.image, "Image", () =>
            onGeste(
              { type: "addObject", objectType: "image", rect: { x: 560, y: 180, w: 320, h: 200 }, src: imageDemo },
              "ribbon",
            ),
          )}
          <span style={{ position: "relative", display: "flex" }}>
            {btn(CONTROLES_PPT.forme, "Formes ▾", () => setMenu((m) => (m === "forme" ? null : "forme")), {
              actif: menu === "forme",
            })}
            {menu === "forme"
              ? panneauMenu(
                  "Formes",
                  Object.keys(FORMES).map((s) =>
                    optionMenu(CONTROLES_PPT.formeChoix(s), NOM_FORME[s] ?? s, () =>
                      onGeste({ type: "addObject", objectType: "forme", shape: s as SlideObject["shape"] }, "ribbon"),
                    ),
                  ),
                )
              : null}
          </span>
        </Groupe>

        <Separateur />

        {/* Groupe à part, et non un quatrième bouton du groupe Diapositives : le
            mot « Supprimer » y désignerait alors deux choses différentes selon
            sa position dans la barre. L'étiquette du groupe lève l'ambiguïté. */}
        <Groupe nom="Objet">
          {btn(CONTROLES_PPT.supprimerObjet, "Supprimer", () =>
            selection.forEach((oid) => onGeste({ type: "deleteObject", objectId: oid }, "ribbon")),
            { titre: "Supprimer l'élément" },
          )}
        </Groupe>

        <Separateur />

        <Groupe nom="Transitions">
          {btn(
            CONTROLES_PPT.transition("fondu"),
            "Fondu",
            () => onGeste({ type: "setTransition", index: iActive, transition: { kind: "fondu", duree: 0.7 } }, "ribbon"),
            { actif: slide.transition?.kind === "fondu", titre: "Transition Fondu" },
          )}
          {btn(
            CONTROLES_PPT.transition("balayage"),
            "Balayage",
            () =>
              onGeste(
                { type: "setTransition", index: iActive, transition: { kind: "balayage", duree: 0.7 } },
                "ribbon",
              ),
            { actif: slide.transition?.kind === "balayage", titre: "Transition Balayage" },
          )}
          {btn(
            CONTROLES_PPT.transition("aucune"),
            "Aucune",
            () => onGeste({ type: "setTransition", index: iActive, transition: { kind: "aucune" } }, "ribbon"),
            { actif: !slide.transition || slide.transition.kind === "aucune", titre: "Aucune transition" },
          )}
        </Groupe>

        <Separateur />

        <Groupe nom="Animations">
          {btn(CONTROLES_PPT.animation("apparaitre"), "Apparaître", () =>
            selection.forEach((oid) => onGeste({ type: "addAnimation", objectId: oid, kind: "apparaitre" }, "ribbon")),
            { titre: "Animation Apparaître" },
          )}
          {btn(CONTROLES_PPT.animation("fondu"), "Fondu", () =>
            selection.forEach((oid) => onGeste({ type: "addAnimation", objectId: oid, kind: "fondu" }, "ribbon")),
            { titre: "Animation Fondu" },
          )}
        </Groupe>

        <Separateur />

        <Groupe nom="Diaporama">
          {btn(CONTROLES_PPT.lancerDebut, "▶ Début", () => onGeste({ type: "startShow", depuis: "debut" }, "ribbon"), {
            titre: "Diaporama depuis le début",
          })}
          {btn(
            CONTROLES_PPT.lancerCourante,
            "▶ Ici",
            () => onGeste({ type: "startShow", depuis: "courante" }, "ribbon"),
            { titre: "Diaporama depuis cette diapositive" },
          )}
          {btn(
            CONTROLES_PPT.masquerDiapo,
            "Masquer",
            () => onGeste({ type: "toggleMasquee", index: iActive }, "ribbon"),
            { actif: !!slide.masquee, titre: "Masquer la diapositive" },
          )}
        </Groupe>

        <Separateur />

        <Groupe nom="Affichage">
          {btn(CONTROLES_PPT.vue("normal"), "Normal", () => onGeste({ type: "setView", view: "normal" }, "ribbon"), {
            actif: (deck.view ?? "normal") === "normal",
            titre: "Affichage Normal",
          })}
          {btn(CONTROLES_PPT.vue("trieuse"), "Trieuse", () => onGeste({ type: "setView", view: "trieuse" }, "ribbon"), {
            actif: deck.view === "trieuse",
            titre: "Trieuse de diapositives",
          })}
        </Groupe>
      </div>
    </div>
  )
}
