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
 * DES ONGLETS, ET POURQUOI LE CHOIX INVERSE ÉTAIT DÉFENDABLE
 *
 * Le lot 1 rendait une seule ligne défilante, sans onglet, et le motivait ainsi :
 * le ruban d'Excel a sept onglets dont un seul est rendu à la fois, ce qui a
 * produit une classe entière de défauts — 55 gestes de démonstration visaient un
 * bouton logé sous un autre onglet, donc introuvable, et le pilote y perdait
 * 30 s de délai d'attente par onglet exploré. Un ruban sans onglet ne peut pas
 * avoir ce défaut.
 *
 * Le raisonnement est juste. Il payait seulement ce risque avec une compétence :
 * « aller dans l'onglet Insertion » est le geste le plus élémentaire de
 * PowerPoint, et il n'était enseigné nulle part — le lot 1 l'écrivait d'ailleurs
 * noir sur blanc comme une dette.
 *
 * Les onglets sont donc rendus, et le défaut qu'ils rouvrent est fermé par
 * construction : `ongletDuControle` est la SOURCE UNIQUE qui décide où vit un
 * bouton. C'est elle qui range les groupes ci-dessous, elle qui ouvre l'onglet
 * attendu par l'étape courante (`ongletSuggere`), et elle qui fait basculer une
 * démonstration avant de presser. Un bouton ne peut pas être hors de portée pour
 * l'un sans l'être pour les trois — et cela se voit immédiatement.
 *
 * Six onglets et pas dix : Fichier, Dessin, Création et Révision n'ont aucune
 * commande dans le moteur. Un onglet vide serait un bouton fictif, ce que la
 * règle des contrôles interdit.
 *
 * La ligne de groupes reste à 56 px et défile horizontalement — le motif éprouvé
 * du ruban mobile d'Excel. Les onglets ajoutent 30 px (44 sur écran étroit, pour
 * la cible tactile) : le ruban complet tient donc sous 100 px, loin des 150 px
 * empilés que le prototype avait rejetés.
 */

import { useEffect, useRef, useState } from "react"
import {
  CONTROLES_PPT,
  LAYOUTS,
  LAYOUTS_ORDRE,
  LIBELLE_ONGLET_PPT,
  ONGLETS_PPT,
  type DeckState,
  type GestePpt,
  type OngletPpt,
  type SlideObject,
  type SlideState,
} from "@/lib/simulation/ppt/document"
import { FORMES, NOM_FORME } from "./formes"
import { ICONE_SEULE_PPT, iconePpt } from "./icones"

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
  /**
   * L'onglet que l'étape courante rend nécessaire, déduit du bouton qu'elle
   * attend. Il ouvre l'onglet SANS l'imposer : l'apprenant peut en changer
   * juste après, explorer le ruban n'est pas une faute.
   *
   * C'est ce qui permet d'ajouter les onglets sans rendre injouable une seule
   * des 1 348 étapes déjà écrites — aucune ne déclarait d'onglet, puisqu'il n'y
   * en avait pas.
   */
  ongletSuggere?: OngletPpt | null
}

/** Hauteur de la ligne de groupes. 56 px, la valeur éprouvée sur Excel mobile. */
export const HAUTEUR_GROUPES = 56
/** Hauteur de la barre d'onglets — 44 px sur écran étroit pour la cible tactile. */
export const hauteurOnglets = (etroit: boolean) => (etroit ? 44 : 30)
/** Hauteur totale du ruban, onglets compris. */
export const hauteurRuban = (etroit: boolean) => HAUTEUR_GROUPES + hauteurOnglets(etroit)

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
  ongletSuggere,
}: Props) {
  const [menu, setMenu] = useState<null | "disposition" | "forme">(null)
  const [onglet, setOnglet] = useState<OngletPpt>("accueil")
  const rubanRef = useRef<HTMLDivElement | null>(null)

  /* L'étape courante ouvre l'onglet qui porte le bouton qu'elle attend. Sans
     cela, une étape écrite avant les onglets demanderait un bouton que rien
     n'aurait ouvert : 1 348 étapes seraient devenues injouables d'un coup. */
  useEffect(() => {
    if (ongletSuggere) setOnglet(ongletSuggere)
  }, [ongletSuggere])

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
  ) => {
    const pict = opts?.icone ?? iconePpt(id)
    // Un bouton dont l'icône EST le libellé afficherait « G » sous un « G » :
    // c'est le défaut qui doublait toute la rangée Police sur le ruban d'Excel.
    const sansTexte = pict != null && ICONE_SEULE_PPT.has(id)
    return (
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
            gap: pict && !sansTexte ? 4 : 0,
            border: "1px solid " + (opts?.actif ? ACCENT : BORD),
            background: opts?.actif ? "#FBEDE9" : "#fff",
            color: opts?.actif ? ACCENT : ENCRE,
            borderRadius: 4,
            padding: sansTexte ? "0 6px" : "0 8px",
            height: 28,
            fontSize: 11.5,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {pict}
          {sansTexte ? null : libelle}
        </span>
      </button>
    )
  }

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
        display: "flex",
        alignItems: "center",
        gap: 8,
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
      {iconePpt(id)}
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

  /* ═══════════ LES GROUPES, RANGÉS PAR ONGLET ═══════════ */

  const groupes: Record<OngletPpt, React.ReactNode> = {
    accueil: (
      <>
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
          {btn(CONTROLES_PPT.monterDiapo, "Monter", () => {
            if (iActive > 0) onGeste({ type: "moveSlide", from: iActive, to: iActive - 1 }, "ribbon")
          })}
          {btn(CONTROLES_PPT.descendreDiapo, "Descendre", () => {
            if (iActive < deck.slides.length - 1)
              onGeste({ type: "moveSlide", from: iActive, to: iActive + 1 }, "ribbon")
          })}
        </Groupe>

        <Separateur />

        <Groupe nom="Police">
          {basculer(CONTROLES_PPT.gras, "bold", "G")}
          {basculer(CONTROLES_PPT.italique, "italic", "I")}
          {basculer(CONTROLES_PPT.souligne, "underline", "S")}
        </Groupe>

        <Separateur />

        <Groupe nom="Paragraphe">
          {btn(CONTROLES_PPT.alignGauche, "Gauche", () =>
            selection.forEach((oid) => onGeste({ type: "format", objectId: oid, style: { align: "left" } }, "ribbon")),
            { titre: "Aligner à gauche" },
          )}
          {btn(CONTROLES_PPT.alignCentre, "Centrer", () =>
            selection.forEach((oid) => onGeste({ type: "format", objectId: oid, style: { align: "center" } }, "ribbon")),
            { titre: "Centrer" },
          )}
          {btn(CONTROLES_PPT.alignDroite, "Droite", () =>
            selection.forEach((oid) => onGeste({ type: "format", objectId: oid, style: { align: "right" } }, "ribbon")),
            { titre: "Aligner à droite" },
          )}
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
      </>
    ),

    insertion: (
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
    ),

    transitions: (
      <Groupe nom="Accès à cette diapositive">
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
            onGeste({ type: "setTransition", index: iActive, transition: { kind: "balayage", duree: 0.7 } }, "ribbon"),
          { actif: slide.transition?.kind === "balayage", titre: "Transition Balayage" },
        )}
        {btn(
          CONTROLES_PPT.transition("aucune"),
          "Aucune",
          () => onGeste({ type: "setTransition", index: iActive, transition: { kind: "aucune" } }, "ribbon"),
          { actif: !slide.transition || slide.transition.kind === "aucune", titre: "Aucune transition" },
        )}
      </Groupe>
    ),

    animations: (
      <Groupe nom="Animation">
        {btn(CONTROLES_PPT.animation("apparaitre"), "Apparaître", () =>
          selection.forEach((oid) => onGeste({ type: "addAnimation", objectId: oid, kind: "apparaitre" }, "ribbon")),
          { titre: "Animation Apparaître" },
        )}
        {btn(CONTROLES_PPT.animation("fondu"), "Fondu", () =>
          selection.forEach((oid) => onGeste({ type: "addAnimation", objectId: oid, kind: "fondu" }, "ribbon")),
          { titre: "Animation Fondu" },
        )}
      </Groupe>
    ),

    diaporama: (
      <Groupe nom="Démarrage du diaporama">
        {btn(CONTROLES_PPT.lancerDebut, "Depuis le début", () => onGeste({ type: "startShow", depuis: "debut" }, "ribbon"), {
          titre: "Diaporama depuis le début",
        })}
        {btn(
          CONTROLES_PPT.lancerCourante,
          "À partir d'ici",
          () => onGeste({ type: "startShow", depuis: "courante" }, "ribbon"),
          { titre: "Diaporama depuis cette diapositive" },
        )}
        {btn(CONTROLES_PPT.masquerDiapo, "Masquer", () => onGeste({ type: "toggleMasquee", index: iActive }, "ribbon"), {
          actif: !!slide.masquee,
          titre: "Masquer la diapositive",
        })}
      </Groupe>
    ),

    affichage: (
      <Groupe nom="Modes d'affichage">
        {btn(CONTROLES_PPT.vue("normal"), "Normal", () => onGeste({ type: "setView", view: "normal" }, "ribbon"), {
          actif: (deck.view ?? "normal") === "normal",
          titre: "Affichage Normal",
        })}
        {btn(CONTROLES_PPT.vue("trieuse"), "Trieuse", () => onGeste({ type: "setView", view: "trieuse" }, "ribbon"), {
          actif: deck.view === "trieuse",
          titre: "Trieuse de diapositives",
        })}
      </Groupe>
    ),
  }

  return (
    <div ref={rubanRef} data-zone="ruban" style={{ flexShrink: 0, background: "#fff" }}>
      {/* ─── Les onglets ─── */}
      <div
        data-zone="onglets"
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 2,
          /**
           * `minHeight`, et non `height`.
           *
           * Avec `box-sizing: border-box`, le trait de séparation d'un pixel est
           * COMPRIS dans la hauteur : une barre de 44 px ne laissait que 43 px à
           * ses boutons, et les six onglets tombaient sous la cible tactile
           * réglementaire — mesuré au banc à 390 px, invisible autrement. Le
           * bouton porte lui aussi son propre `minHeight` : deux garanties
           * valent mieux qu'un calcul juste aujourd'hui et faux après le
           * prochain ajustement de bordure.
           */
          minHeight: hauteurOnglets(etroit),
          padding: "0 6px",
          background: "#F6F7F9",
          borderBottom: "1px solid " + BORD,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {ONGLETS_PPT.map((o) => {
          const actif = o === onglet
          return (
            <button
              key={o}
              type="button"
              data-control={CONTROLES_PPT.onglet(o)}
              data-ppt-onglet={o}
              aria-pressed={actif}
              aria-label={`Onglet ${LIBELLE_ONGLET_PPT[o]}`}
              onClick={() => {
                if (lecture) return
                // Changer d'onglet n'est JAMAIS une faute : le ruban s'explore.
                // Le menu ouvert se referme, sinon il resterait posé sur un
                // onglet qui ne le contient plus.
                setMenu(null)
                setOnglet(o)
              }}
              style={{
                flexShrink: 0,
                border: "none",
                borderBottom: "2px solid " + (actif ? ACCENT : "transparent"),
                background: actif ? "#fff" : "transparent",
                color: actif ? ACCENT : "#5A636D",
                fontWeight: actif ? 600 : 400,
                fontSize: 11.5,
                padding: "0 12px",
                minWidth: etroit ? 60 : 0,
                minHeight: etroit ? 44 : 0,
                cursor: lecture ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {LIBELLE_ONGLET_PPT[o]}
            </button>
          )
        })}
      </div>

      {/* ─── Les groupes de l'onglet ouvert ─── */}
      <div
        data-zone="groupes"
        style={{
          borderBottom: "1px solid " + BORD,
          height: HAUTEUR_GROUPES,
          // UNE seule ligne, qui défile horizontalement. `overflow-x: auto` et non
          // `wrap` : c'est ce qui garantit que le ruban ne mange jamais plus de
          // 56 px de hauteur, quelle que soit la largeur de l'écran.
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 8px",
            height: "100%",
            width: "max-content",
          }}
        >
          {groupes[onglet]}
        </div>
      </div>
    </div>
  )
}
