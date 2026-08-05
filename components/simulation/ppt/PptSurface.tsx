"use client"

/**
 * PowerPoint — la surface de travail.
 *
 * PUREMENT PRÉSENTATIONNELLE, comme `ChartLayer` : ce composant ne connaît ni le
 * scénario, ni la validation, ni la note. Il reçoit un `DeckState`, il dessine,
 * et il remonte le geste par `onGeste`. C'est ce qui permet au même rendu de
 * servir en leçon, en exercice, en évaluation et en démonstration automatique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DU DOM ET PAS DU CANVAS
 *
 * Excel rend sur canvas parce qu'Univer l'impose : c'était le prix du moteur de
 * formules, un actif qu'on ne pouvait pas réécrire. Ce prix a été lourd —
 * `getCellRect` reconstruit depuis les métriques internes du squelette, une
 * géométrie qui dérivait entre le banc et le lecteur, la position du canvas qui
 * changeait EN COURS de leçon parce que la barre d'état apparaît selon la
 * sélection, et huit « limites du pilote » au balayage final des 246 chapitres.
 *
 * PowerPoint n'a aucun moteur à récupérer : payer le canvas sans l'actif serait
 * absurde. En DOM, chaque objet est un nœud portant `data-object` — le halo
 * d'aide, la démonstration « Montrez-moi » (qui résout déjà `dom:<sélecteur>`)
 * et le pilote automatique fonctionnent sans une ligne de géométrie ; la
 * géométrie est DÉCLARÉE dans la scène logique, donc connue avant le rendu ; et
 * le texte est du vrai texte, éditable par un champ natif — en canvas il aurait
 * fallu réécrire un éditeur de texte sur une application dont le texte EST la
 * matière.
 *
 * ⚠️ STYLES INLINE, keyframes embarquées (invariant §6.5).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { PptRect } from "@/lib/simulation/ppt/actions"
import {
  CONTROLES_PPT,
  cibleDAuteur,
  inviteDe,
  type DeckState,
  type GestePpt,
  type OngletPpt,
  type SlideObject,
  type SlideState,
} from "@/lib/simulation/ppt/document"
import { FORMES } from "./formes"
import PptChrome from "./PptChrome"

type Props = {
  deck: DeckState
  onGeste: (geste: GestePpt, canal?: string) => void
  /** Identifiants d'objets à mettre en évidence (halo d'aide). */
  halo?: string[]
  /** Aperçu admin : rien n'est modifiable. */
  lecture?: boolean
  /** Largeur mesurée de la zone de travail — 0 tant qu'elle n'est pas connue. */
  largeurZone?: number
  /**
   * L'onglet du ruban que l'étape courante rend nécessaire. Traversée depuis le
   * player, qui est le seul à connaître l'étape ; la surface ne fait que la
   * passer au ruban.
   */
  ongletSuggere?: OngletPpt | null
}

/**
 * Sous cette largeur, la scène ne tient plus à côté du volet des miniatures :
 * le volet passe en tiroir (décision D2, aménagement n°1).
 *
 * Mesuré : à 390 px de large, le volet fixe prenait 147 px, soit 38 % de la
 * largeur, et la scène tombait à 208 × 116 px — un titre rendu à 8,7 px, donc
 * inéditable. En tiroir, elle remonte à ≈ 374 × 210 px et le titre à 15,6 px.
 */
const SEUIL_TIROIR = 720

const BORD = "#D6DBE1"
const SELECTION = "#B7472A"

/* ═══════════ STYLES ═══════════ */

function StyleGlobal() {
  return (
    <style>{`
      @keyframes ppt-halo { 0%,100% { box-shadow: 0 0 0 3px rgba(183,71,42,.85); } 50% { box-shadow: 0 0 0 8px rgba(183,71,42,.22); } }
      @keyframes ppt-tiroir { from { transform: translateX(-101%); } to { transform: translateX(0); } }
      @media (prefers-reduced-motion: reduce) {
        [data-anim], [data-zone="volet"] { animation: none !important; }
      }
    `}</style>
  )
}

/* ═══════════ UN OBJET DE LA SCÈNE ═══════════ */

function Objet({
  obj,
  slide,
  echelle,
  selectionne,
  halo,
  cibleAuteur,
  onPointerDown,
  onClick,
  onDoubleClick,
}: {
  obj: SlideObject
  slide: SlideState
  echelle: number
  selectionne: boolean
  halo: boolean
  onPointerDown: (e: React.PointerEvent, obj: SlideObject, poignee: string | null) => void
  onClick: (obj: SlideObject) => void
  onDoubleClick: (obj: SlideObject) => void
  /** Forme d'auteur de l'espace réservé (`contenu#2`), pour le pilotage. */
  cibleAuteur?: string | null
}) {
  const r = obj.rect ?? { x: 0, y: 0, w: 100, h: 100 }
  const vide = !obj.paragraphs?.length
  const invite = obj.placeholder ? inviteDe(slide.layout, obj.placeholder) : ""
  const st = obj.style ?? {}
  const estTitre = obj.placeholder === "titre"

  return (
    <div
      data-object={obj.id}
      data-placeholder={obj.placeholder ?? undefined}
      /* Forme d'AUTEUR, rang compris : `titre`, `contenu`, `contenu#2`.
         `data-placeholder` seul ne distingue pas les deux colonnes d'une
         disposition à deux contenus — halo, démonstration et pilotage visaient
         alors toujours celle de gauche, en silence. Défaut trouvé au rejeu, pas
         à la lecture : le juge, lui, résout par `trouverObjet` et voyait juste. */
      data-ph={obj.placeholder ? cibleAuteur ?? undefined : undefined}
      data-selected={selectionne ? "1" : undefined}
      role="group"
      aria-label={obj.placeholder ? `Espace réservé ${obj.placeholder}` : `Élément ${obj.type}`}
      style={{
        position: "absolute",
        left: r.x * echelle,
        top: r.y * echelle,
        width: r.w * echelle,
        height: r.h * echelle,
        transform: obj.angle ? `rotate(${obj.angle}deg)` : undefined,
        zIndex: (obj.z ?? 0) + 1,
        cursor: obj.locked ? "default" : "move",
        // Sans cela, le premier mouvement du doigt fait défiler la page au lieu
        // de déplacer l'objet.
        touchAction: "none",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: estTitre ? "center" : "flex-start",
        padding: 6 * echelle,
        outline: selectionne
          ? `${Math.max(1, 2 * echelle)}px solid ${SELECTION}`
          : vide && obj.placeholder
            ? `${Math.max(1, 1 * echelle)}px dashed #9AA5B1`
            : "none",
        animation: halo ? "ppt-halo 1.4s ease-in-out infinite" : undefined,
        color: st.color ?? "#1F2933",
        fontFamily: st.font ?? "Calibri, system-ui, sans-serif",
        fontSize: (st.size ?? (estTitre ? 40 : 22)) * echelle,
        fontWeight: st.bold ? 700 : estTitre ? 600 : 400,
        fontStyle: st.italic ? "italic" : "normal",
        textDecoration: st.underline ? "underline" : "none",
        textAlign: st.align ?? "left",
      }}
      onPointerDown={(e) => onPointerDown(e, obj, null)}
      /* L'ÉDITION S'OUVRE AU CLIC, JAMAIS AU `pointerdown`.
         Ouverte au `pointerdown`, la zone de saisie prend le focus par
         `autoFocus`, puis le `pointerup` qui suit le rend au document : le
         `onBlur` referme le champ dans la foulée. À l'écran, l'apprenant voit le
         champ clignoter et disparaître — défaut trouvé au banc, invisible à la
         lecture du code. */
      onClick={() => onClick(obj)}
      onDoubleClick={() => onDoubleClick(obj)}
    >
      {obj.type === "forme" && obj.shape ? (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          <path
            d={FORMES[obj.shape] ?? FORMES.rectangle}
            fill={obj.fill ?? "#2F6FB0"}
            stroke={obj.stroke?.color ?? "none"}
            strokeWidth={obj.stroke?.width ?? 0}
          />
        </svg>
      ) : null}

      {obj.type === "image" && obj.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={obj.src}
          alt={obj.alt ?? ""}
          style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
        />
      ) : null}

      {obj.type === "image" && !obj.src ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#9AA5B1",
            fontSize: 14 * echelle,
            pointerEvents: "none",
          }}
        >
          Image
        </span>
      ) : null}

      {vide && obj.placeholder && obj.type !== "image" ? (
        <span style={{ color: "#9AA5B1", pointerEvents: "none", position: "relative" }}>{invite}</span>
      ) : (
        (obj.paragraphs ?? []).map((p, i) => (
          <div
            key={i}
            data-paragraphe={i}
            style={{
              position: "relative",
              paddingLeft: obj.placeholder === "contenu" ? 18 * echelle : 0,
              marginBottom: 4 * echelle,
              fontWeight: p.style?.bold ? 700 : undefined,
              fontStyle: p.style?.italic ? "italic" : undefined,
              pointerEvents: "none",
              whiteSpace: "pre-wrap",
            }}
          >
            {obj.placeholder === "contenu" ? (
              <span aria-hidden style={{ position: "absolute", left: 0, color: SELECTION }}>
                •
              </span>
            ) : null}
            {p.text}
          </div>
        ))
      )}

      {/* Poignée de redimensionnement. Le coin bas-droit suffit au programme. */}
      {selectionne && !obj.locked ? (
        <span
          data-poignee="se"
          onPointerDown={(e) => {
            e.stopPropagation()
            onPointerDown(e, obj, "se")
          }}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "#fff",
            border: `1.5px solid ${SELECTION}`,
            borderRadius: 2,
            cursor: "nwse-resize",
            touchAction: "none",
          }}
        />
      ) : null}
    </div>
  )
}

/* ═══════════ COMPOSANT PRINCIPAL ═══════════ */

export default function PptSurface({
  deck,
  onGeste,
  halo = [],
  lecture = false,
  largeurZone = 0,
  ongletSuggere = null,
}: Props) {
  const [edition, setEdition] = useState<{ objectId: string; valeur: string } | null>(null)
  const [tiroirOuvert, setTiroirOuvert] = useState(false)
  /**
   * Panneau de notes du petit écran — refermé dès qu'on quitte l'affichage
   * Normal.
   *
   * Il est superposé et occupe le bas de l'écran. En Trieuse, qui est elle-même
   * une surcouche, il RECOUVRAIT les dernières vignettes : au centre de la
   * quatrième miniature, c'est le champ de notes qui répondait au doigt. Un
   * apprenant qui venait d'écrire une note ne pouvait plus atteindre les
   * diapositives du bas — mesuré sur `m11-ev01` à 390 px, étape 8. Les notes
   * n'ont de toute façon aucun sens hors de l'affichage Normal : la Trieuse
   * montre l'ensemble, le diaporama montre ce que voit le public.
   */
  const [notesOuvertes, setNotesOuvertes] = useState(false)
  /**
   * Les notes s'émettent à la SORTIE du champ, pas à chaque frappe.
   *
   * `onChange` produisait un geste par caractère : une note de quarante signes
   * envoyait quarante `deckChange`, donc quarante tâtonnements — l'encart
   * « Vous bloquez ? » s'ouvrait au milieu de la saisie, et le journal
   * pédagogique se remplissait de gestes que l'apprenant n'a pas faits. C'est
   * le motif déjà retenu pour l'éditeur de texte des objets, qui valide au blur.
   */
  const [notesLocal, setNotesLocal] = useState<string | null>(null)

  const iActive = deck.activeSlide ?? 0
  const slide = deck.slides[iActive]
  const selection = deck.selection ?? []
  const show = deck.show
  const etroit = largeurZone > 0 && largeurZone < SEUIL_TIROIR

  /**
   * `onGeste` lu par RÉFÉRENCE.
   *
   * Le prototype l'appelait depuis un updater `setState`, et React s'en est
   * plaint : un updater doit être PUR, et React est libre de le rejouer — le
   * geste `moveObject` aurait été compté DEUX fois. Dans un simulateur, un geste
   * compté en double fausse le journal pédagogique et peut ajouter une faute que
   * l'apprenant n'a pas commise.
   */
  const gesteRef = useRef(onGeste)
  gesteRef.current = onGeste

  /* ─────────── TAILLE DE LA SCÈNE ───────────
   *
   * 🔴 LA SCÈNE EST CALCULÉE, PAS LAISSÉE À `aspect-ratio`.
   *
   * La première version donnait à la scène `width: 100%` + `aspect-ratio` +
   * `max-height: 100%`. Vu à l'écran : 1260 × 587 px pour un 16:9, soit un
   * rapport de 2,15 — la diapositive était ÉTIRÉE, et son quart inférieur
   * (540 × 1,3125 = 708 px pour 587 px de cadre) était rogné par le
   * `overflow: hidden`. Un objet posé en bas de diapositive aurait été
   * simplement invisible, sans le moindre message.
   *
   * La cause : `width: 100%` est une contrainte FERME, donc `max-height` clampe
   * la hauteur sans que le navigateur puisse réduire la largeur en retour —
   * `aspect-ratio` est abandonné en silence. Aucun compteur ne pouvait le voir :
   * le débordement valait bien zéro, la scène rendait bien ses objets, et les
   * étapes passaient. C'est en REGARDANT la capture que ça se voit.
   *
   * On mesure donc le CONTENEUR et on calcule la boîte qui y tient en gardant le
   * rapport. C'est déterministe, sans dépendre d'une subtilité de cascade, et
   * `echelle` en découle directement.
   */
  const boiteRef = useRef<HTMLDivElement | null>(null)
  const [boite, setBoite] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = boiteRef.current
    if (!el) return
    /* Une mesure à 0 signifie que le nœud est masqué ou détaché, jamais que la
       scène fait zéro pixel de large. La retenir ferait disparaître TOUS les
       objets — c'est ce qui vidait la diapositive au retour du diaporama. */
    const mesurer = () =>
      setBoite((b) => (el.clientWidth > 0 && el.clientHeight > 0 ? { w: el.clientWidth, h: el.clientHeight } : b))
    mesurer()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ratio = deck.pageSize.w / deck.pageSize.h
  const tailleScene =
    boite.w > 0 && boite.h > 0
      ? boite.w / boite.h > ratio
        ? { w: Math.round(boite.h * ratio), h: boite.h }
        : { w: boite.w, h: Math.round(boite.w / ratio) }
      : { w: 0, h: 0 }
  const echelle = tailleScene.w > 0 && slide ? tailleScene.w / deck.pageSize.w : 0

  /* ── Glissement ──
     Le geste vit dans une RÉFÉRENCE et non dans un état : `pointerup` doit
     savoir tout de suite si le doigt a bougé, or un état posé par `pointermove`
     peut ne pas être encore appliqué au relâchement. Le piège est documenté sur
     `PivotLayer`, où le dépôt était purement ignoré. */
  const glisse = useRef<{
    id: string
    x0: number
    y0: number
    base: PptRect
    poignee: string | null
    bouge: boolean
  } | null>(null)
  const [apercu, setApercu] = useState<{ id: string; rect: PptRect } | null>(null)
  const apercuRef = useRef<{ id: string; rect: PptRect } | null>(null)
  /* Horodatage du dernier glissement conclu. Un DRAPEAU ne suffit pas : quand le
     relâchement a lieu ailleurs, aucun clic n'arrive et le drapeau resterait
     levé, avalant le clic suivant — celui de l'apprenant. */
  const finGlisse = useRef(0)
  const nettoyage = useRef<(() => void) | null>(null)
  useEffect(() => () => nettoyage.current?.(), [])

  const surPointerDown = useCallback(
    (e: React.PointerEvent, obj: SlideObject, poignee: string | null) => {
      if (lecture || show?.actif) return
      gesteRef.current({ type: "selectObject", objectId: obj.id, ajouter: e.shiftKey }, "mouse")
      if (obj.locked || !obj.rect) return

      const base = { ...obj.rect }
      glisse.current = { id: obj.id, x0: e.clientX, y0: e.clientY, base, poignee, bouge: false }

      const surMove = (ev: PointerEvent) => {
        const g = glisse.current
        if (!g || echelle === 0) return
        // Seuil mesuré depuis l'ORIGINE : un glissement lent ne franchirait
        // jamais un seuil calculé d'un point au suivant.
        if (!g.bouge && Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) < 4) return
        g.bouge = true
        const dx = (ev.clientX - g.x0) / echelle
        const dy = (ev.clientY - g.y0) / echelle
        const r = g.poignee
          ? { ...g.base, w: Math.max(40, g.base.w + dx), h: Math.max(30, g.base.h + dy) }
          : { ...g.base, x: g.base.x + dx, y: g.base.y + dy }
        apercuRef.current = { id: g.id, rect: r }
        setApercu(apercuRef.current)
      }

      const surFin = () => {
        const g = glisse.current
        const a = apercuRef.current
        glisse.current = null
        apercuRef.current = null
        nettoyage.current?.()
        nettoyage.current = null
        setApercu(null)
        if (g?.bouge && a) {
          finGlisse.current = performance.now()
          gesteRef.current(
            { type: "moveObject", objectId: g.id, rect: a.rect, resize: !!g.poignee },
            "mouse",
          )
          // Retour tactile bref : sur téléphone, la zone est souvent masquée par
          // le doigt au moment du relâchement.
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8)
        }
      }

      window.addEventListener("pointermove", surMove)
      window.addEventListener("pointerup", surFin)
      window.addEventListener("pointercancel", surFin)
      nettoyage.current = () => {
        window.removeEventListener("pointermove", surMove)
        window.removeEventListener("pointerup", surFin)
        window.removeEventListener("pointercancel", surFin)
      }
    },
    [echelle, lecture, show?.actif],
  )

  const ouvrirEdition = useCallback(
    (obj: SlideObject) => {
      if (lecture || show?.actif) return
      if (performance.now() - finGlisse.current < 250) return
      setEdition({ objectId: obj.id, valeur: (obj.paragraphs ?? []).map((p) => p.text).join("\n") })
    },
    [lecture, show?.actif],
  )

  /* Un clic simple sur un espace réservé VIDE ouvre la saisie — c'est ce que
     l'invite « Cliquez pour ajouter un titre » promet. Exiger un double-clic
     contredirait le texte affiché, et un débutant resterait bloqué devant une
     consigne qu'il applique pourtant à la lettre. */
  const surClicObjet = useCallback(
    (obj: SlideObject) => {
      if (!obj.paragraphs?.length && obj.placeholder && obj.type !== "image") ouvrirEdition(obj)
    },
    [ouvrirEdition],
  )

  const validerEdition = useCallback(() => {
    if (!edition) return
    // Une saisie INCHANGÉE n'émet rien. Sans ce garde-fou, un simple clic dans
    // un espace réservé puis à côté produirait un `editText` vide : l'atelier
    // compterait un geste que l'apprenant n'a pas fait.
    const obj = slide?.objects.find((o) => o.id === edition.objectId)
    const avant = (obj?.paragraphs ?? []).map((p) => p.text).join("\n")
    if (edition.valeur !== avant) {
      gesteRef.current(
        { type: "editText", objectId: edition.objectId, paragraphe: 0, text: edition.valeur },
        "keyboard",
      )
    }
    setEdition(null)
  }, [edition, slide])

  const objEdite = edition && slide ? slide.objects.find((o) => o.id === edition.objectId) : null

  /* ── Clavier du diaporama ── */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (!show?.actif) return
      if (e.key === "Escape") gesteRef.current({ type: "endShow" }, "keyboard")
      else if (["ArrowRight", " ", "Enter", "PageDown"].includes(e.key))
        gesteRef.current({ type: "showNext" }, "keyboard")
      else if (["ArrowLeft", "PageUp"].includes(e.key)) gesteRef.current({ type: "showPrev" }, "keyboard")
    }
    window.addEventListener("keydown", surTouche)
    return () => window.removeEventListener("keydown", surTouche)
  }, [show?.actif])

  /* ── Suppr : effacer les éléments sélectionnés — décision D11 ──
   *
   * Trois garde-fous, chacun évitant une destruction que l'apprenant n'a pas
   * demandée :
   *   · pas pendant le diaporama, où Suppr n'a aucun sens ;
   *   · pas pendant une saisie — la touche appartient alors au texte, et
   *     l'intercepter effacerait la zone au lieu d'un caractère ;
   *   · pas quand le focus est dans un champ, même hors de la scène (le volet
   *     de notes est un `textarea` de plein droit).
   *
   * `Backspace` est volontairement ÉCARTÉ : sur un navigateur, hors champ de
   * saisie, il a longtemps déclenché le retour arrière — perdre son travail
   * pour une frappe malheureuse n'est pas une leçon.
   */
  useEffect(() => {
    const surSuppr = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return
      if (lecture || show?.actif || edition) return
      const cible = e.target as HTMLElement | null
      const balise = cible?.tagName?.toLowerCase()
      if (balise === "input" || balise === "textarea" || cible?.isContentEditable) return
      if (!selection.length) return
      e.preventDefault()
      for (const oid of selection) gesteRef.current({ type: "deleteObject", objectId: oid }, "keyboard")
    }
    window.addEventListener("keydown", surSuppr)
    return () => window.removeEventListener("keydown", surSuppr)
  }, [lecture, show?.actif, edition, selection])

  /* Le tiroir se referme dès qu'on change de diapositive : le garder ouvert
     masquerait la scène que l'apprenant vient justement d'appeler. */
  useEffect(() => {
    setTiroirOuvert(false)
    setNotesLocal(null)
  }, [iActive])

  if (!slide) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#6E6A62", fontSize: 13 }}>
        Présentation vide.
      </div>
    )
  }

  const miniature = (s: SlideState, i: number, dansTrieuse: boolean) => (
    <button
      key={s.id}
      type="button"
      data-control={CONTROLES_PPT.miniature(i)}
      data-slide-index={i}
      aria-label={`Diapositive ${i + 1}${s.masquee ? " (masquée)" : ""}`}
      aria-current={i === iActive ? "true" : undefined}
      onClick={() => {
        /* Fermer ICI, et pas seulement sur changement d'`iActive` : toucher la
         * diapositive DÉJÀ affichée ne changeait pas l'index, donc le tiroir
         * restait ouvert et masquait la scène que l'apprenant venait d'appeler
         * — plus le champ de notes, qu'il recouvre entièrement. */
        setTiroirOuvert(false)
        gesteRef.current({ type: "selectSlide", index: i }, "mouse")
      }}
      style={{
        position: "relative",
        width: dansTrieuse ? 190 : "100%",
        aspectRatio: `${deck.pageSize.w} / ${deck.pageSize.h}`,
        border: i === iActive ? `2px solid ${SELECTION}` : `1px solid ${BORD}`,
        borderRadius: 3,
        background: "#fff",
        padding: 0,
        cursor: "pointer",
        opacity: s.masquee ? 0.45 : 1,
        flexShrink: 0,
      }}
    >
      <ScenePure slide={s} deck={deck} />
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: dansTrieuse ? -20 : -6,
          top: dansTrieuse ? "50%" : 2,
          transform: dansTrieuse ? "translateY(-50%)" : undefined,
          background: dansTrieuse ? "transparent" : "#616E7C",
          color: dansTrieuse ? "#616E7C" : "#fff",
          fontSize: dansTrieuse ? 12 : 10,
          borderRadius: 2,
          padding: dansTrieuse ? 0 : "0 4px",
        }}
      >
        {i + 1}
      </span>
    </button>
  )

  /* ─────────── DIAPORAMA ───────────
   *
   * SURCOUCHE, jamais un `return` anticipé.
   *
   * Le diaporama a d'abord été rendu par un `return` qui remplaçait tout
   * l'arbre : la scène d'édition était donc DÉMONTÉE. Au retour, la diapositive
   * revenait VIDE — le `ResizeObserver` posé au montage notifiait
   * `clientWidth = 0` sur le nœud détaché, l'échelle tombait à 0, et plus aucun
   * objet n'était dessiné. Les douze étapes du banc passaient quand même : c'est
   * en REGARDANT la capture que le défaut a été vu. Invariant §6.6 : ne jamais
   * démonter la surface de travail, la masquer.
   *
   * `absolute` et non `fixed` : l'invariant §6.3 proscrit le plein écran
   * navigateur, et un `fixed` serait de toute façon capturé par le `transform`
   * résiduel de la page apprenante.
   */
  const diaporama =
    show?.actif && deck.slides[show.index] ? (
      <div
        data-mode="diaporama"
        onClick={() => gesteRef.current({ type: "showNext" }, "mouse")}
        style={{
          position: "absolute",
          inset: 0,
          background: "#000",
          display: "grid",
          placeItems: "center",
          zIndex: 50,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: "min(96%, 160vh)",
            aspectRatio: `${deck.pageSize.w} / ${deck.pageSize.h}`,
            position: "relative",
          }}
        >
          <ScenePure slide={deck.slides[show.index]} deck={deck} />
        </div>
        <span
          aria-hidden
          style={{ position: "absolute", bottom: 12, right: 16, color: "#9AA5B1", fontSize: 13, pointerEvents: "none" }}
        >
          {show.index + 1} / {deck.slides.length} — Échap pour quitter
        </span>
        <button
          type="button"
          data-control={CONTROLES_PPT.quitterShow}
          aria-label="Quitter le diaporama"
          onClick={(e) => {
            e.stopPropagation()
            gesteRef.current({ type: "endShow" }, "mouse")
          }}
          style={{
            position: "absolute",
            top: 12,
            right: 16,
            minHeight: 44,
            background: "#1F2933",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "0 14px",
            cursor: "pointer",
          }}
        >
          Quitter
        </button>
      </div>
    ) : null

  /* ─────────── TRIEUSE ───────────
     Même raison que le diaporama : surcouche, jamais un `return` anticipé. */
  const trieuse =
    deck.view === "trieuse" ? (
      <div
        data-mode="trieuse"
        style={{ position: "absolute", inset: 0, background: "#F5F7FA", zIndex: 20, overflow: "auto" }}
      >
        <div data-zone="trieuse" style={{ padding: "16px 16px 16px 34px", display: "flex", flexWrap: "wrap", gap: 14 }}>
          {deck.slides.map((s, i) => miniature(s, i, true))}
        </div>
      </div>
    ) : null

  /* ─────────── ARBRE UNIQUE ─────────── */
  return (
    <div
      data-zone="ppt"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: "#F5F7FA",
        position: "relative",
        // La garantie « rien ne défile » est STRUCTURELLE : cette colonne est en
        // `hidden`, le ruban est `flex-shrink-0`, la scène prend le reste.
        overflow: "hidden",
      }}
    >
      <StyleGlobal />
      <PptChrome
        deck={deck}
        slide={slide}
        iActive={iActive}
        selection={selection}
        onGeste={onGeste}
        lecture={lecture}
        imageDemo={IMAGE_DEMO}
        etroit={etroit}
        ongletSuggere={ongletSuggere}
      />

      <div style={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
        {trieuse}

        {/* ── Volet des miniatures ──
            Fixe au large, EN TIROIR à l'étroit (décision D2, aménagement n°1).
            Le tiroir se SUPERPOSE au lieu de pousser la scène : la pousser
            changerait sa largeur, donc l'échelle, donc la géométrie sous les
            doigts de l'apprenant au moment même où il ouvre le volet. */}
        {etroit ? (
          <>
            <button
              type="button"
              data-control={CONTROLES_PPT.voletBascule}
              aria-label="Volet des diapositives"
              aria-expanded={tiroirOuvert}
              onClick={() => setTiroirOuvert((v) => !v)}
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                zIndex: 25,
                minWidth: 44,
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                background: "#fff",
                border: `1px solid ${BORD}`,
                borderRadius: 8,
                boxShadow: "0 1px 4px rgba(16,24,32,.12)",
                color: "#1F2933",
                fontSize: 11.5,
                padding: "0 10px",
                cursor: "pointer",
              }}
            >
              <span aria-hidden>▤</span>
              {iActive + 1}/{deck.slides.length}
            </button>
            {tiroirOuvert ? (
              <>
                <div
                  role="presentation"
                  onClick={() => setTiroirOuvert(false)}
                  style={{ position: "absolute", inset: 0, background: "rgba(8,17,14,.4)", zIndex: 26 }}
                />
                <div
                  data-zone="volet"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: 156,
                    zIndex: 27,
                    background: "#fff",
                    borderRight: `1px solid ${BORD}`,
                    overflowY: "auto",
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    animation: "ppt-tiroir .22s cubic-bezier(.32,.72,0,1) both",
                  }}
                >
                  {deck.slides.map((s, i) => miniature(s, i, false))}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div
            data-zone="volet"
            style={{
              width: 148,
              flexShrink: 0,
              borderRight: `1px solid ${BORD}`,
              background: "#fff",
              overflowY: "auto",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {deck.slides.map((s, i) => miniature(s, i, false))}
          </div>
        )}

        {/* ── Scène ── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: etroit ? 8 : 16,
            paddingTop: etroit ? 58 : 16,
            gap: etroit ? 6 : 10,
          }}
        >
          {/* Boîte MESURÉE dans laquelle la diapositive doit tenir. La scène en
              déduit ses pixels ; elle ne les demande pas à la cascade. */}
          <div
            ref={boiteRef}
            style={{ flex: 1, minHeight: 0, minWidth: 0, display: "grid", placeItems: "center", overflow: "hidden" }}
          >
            <div
              data-zone="scene"
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) gesteRef.current({ type: "selectObject", objectId: null }, "mouse")
              }}
              style={{
                width: tailleScene.w || undefined,
                height: tailleScene.h || undefined,
                background: slide.fond ?? deck.master?.theme?.fond ?? "#fff",
                border: `1px solid ${BORD}`,
                boxShadow: "0 2px 10px rgba(0,0,0,.07)",
                position: "relative",
                overflow: "hidden",
              }}
            >
            {echelle > 0
              ? slide.objects
                  .slice()
                  .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
                  .map((obj) => (
                    <Objet
                      key={obj.id}
                      obj={apercu?.id === obj.id ? { ...obj, rect: apercu.rect } : obj}
                      slide={slide}
                      echelle={echelle}
                      selectionne={selection.includes(obj.id)}
                      halo={halo.includes(obj.id)}
                      cibleAuteur={cibleDAuteur(slide, obj.id)}
                      onPointerDown={surPointerDown}
                      onClick={surClicObjet}
                      onDoubleClick={ouvrirEdition}
                    />
                  ))
              : null}

            {/* Saisie : un champ natif superposé plutôt qu'un `contenteditable` —
                le curseur ne saute pas au re-rendu, l'accessibilité est acquise,
                et un pilote automatique peut le remplir sans simuler de frappe. */}
            {edition && objEdite && echelle > 0 ? (
              <textarea
                data-editeur={edition.objectId}
                autoFocus
                aria-label="Saisie de texte"
                value={edition.valeur}
                /**
                 * OUVRIR SUR UN CADRE DÉJÀ REMPLI SÉLECTIONNE TOUT SON TEXTE.
                 *
                 * Double-cliquer un cadre qui porte déjà du texte, c'est vouloir
                 * le REFAIRE. Sans cette sélection, la seule issue était
                 * d'effacer caractère par caractère : mesuré en production le
                 * 05/08/2026, un apprenant qui se trompait puis retapait
                 * obtenait « NimportequoiVerdeval » sans comprendre pourquoi.
                 * Un cadre vide, lui, s'ouvre normalement — il n'y a rien à
                 * remplacer.
                 */
                onFocus={(e) => {
                  if (e.currentTarget.value) e.currentTarget.select()
                }}
                onChange={(e) => setEdition({ ...edition, valeur: e.target.value })}
                onBlur={validerEdition}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEdition(null)
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) validerEdition()
                  /**
                   * « TOUT SÉLECTIONNER » DOIT MARCHER AVEC LES DEUX RÉFLEXES.
                   *
                   * Dans un champ natif sur macOS, `Ctrl+A` n'est pas « tout
                   * sélectionner » : c'est « aller en début de ligne », hérité
                   * d'Emacs. Mesuré au navigateur — `Control+a` rendait une
                   * sélection `{0, 0}`, `Meta+a` la sélection complète. Le
                   * réflexe le plus répandu ne sélectionnait donc rien, et la
                   * frappe suivante venait s'ajouter au texte au lieu de le
                   * remplacer.
                   *
                   * L'apprenant vient apprendre PowerPoint, pas les conventions
                   * clavier de son système : les deux raccourcis sélectionnent.
                   */
                  if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    e.currentTarget.select()
                  }
                }}
                style={{
                  position: "absolute",
                  left: (objEdite.rect?.x ?? 0) * echelle,
                  top: (objEdite.rect?.y ?? 0) * echelle,
                  width: (objEdite.rect?.w ?? 100) * echelle,
                  height: (objEdite.rect?.h ?? 60) * echelle,
                  zIndex: 40,
                  border: `2px solid ${SELECTION}`,
                  padding: 6 * echelle,
                  font: "inherit",
                  fontSize: (objEdite.style?.size ?? (objEdite.placeholder === "titre" ? 40 : 22)) * echelle,
                  fontFamily: "Calibri, system-ui, sans-serif",
                  resize: "none",
                  background: "#fff",
                  boxSizing: "border-box",
                }}
              />
            ) : null}
            </div>
          </div>

          {/* Notes de l'orateur.
              En large, elles occupent leur bande sous la scène. À l'étroit,
              elles coûteraient 70 px à une scène qui n'en a déjà pas assez :
              elles passent donc en panneau SUPERPOSÉ, ouvert par un bouton —
              même motif que le tiroir des miniatures, et même raison. Les
              masquer purement, comme avant, rendait toute compétence de notes
              inenseignable à un apprenant sur téléphone. */}
          {!etroit ? (
            <div style={{ flexShrink: 0 }}>
              <label htmlFor="ppt-notes" style={{ fontSize: 11, color: "#616E7C" }}>
                Notes de l&apos;orateur
              </label>
              <textarea
                id="ppt-notes"
                data-control={CONTROLES_PPT.notes}
                value={notesLocal ?? slide.notes ?? ""}
                onChange={(e) => setNotesLocal(e.target.value)}
                onBlur={() => {
                  if (notesLocal !== null && notesLocal !== (slide.notes ?? ""))
                    gesteRef.current({ type: "setNotes", index: iActive, notes: notesLocal }, "panel")
                  setNotesLocal(null)
                }}
                placeholder="Cliquez pour ajouter des notes"
                style={{
                  width: "100%",
                  height: 52,
                  border: `1px solid ${BORD}`,
                  borderRadius: 3,
                  padding: 6,
                  fontSize: 12,
                  resize: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
          ) : deck.view !== "normal" || show?.actif ? null : (
            <>
              <button
                type="button"
                data-control={CONTROLES_PPT.notesBascule}
                aria-label="Ouvrir les notes de l'orateur"
                aria-expanded={notesOuvertes}
                onClick={() => setNotesOuvertes((v) => !v)}
                style={{
                  position: "absolute",
                  right: 8,
                  bottom: 8,
                  zIndex: 26,
                  minWidth: 44,
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "0 12px",
                  border: `1px solid ${BORD}`,
                  borderRadius: 6,
                  background: notesOuvertes ? "#FBEDE9" : "#fff",
                  color: notesOuvertes ? SELECTION : "#1F2933",
                  fontSize: 12,
                  boxShadow: "0 2px 8px rgba(16,24,32,.14)",
                }}
              >
                {slide.notes ? "✎ Notes •" : "✎ Notes"}
              </button>
              {notesOuvertes ? (
                <div
                  data-zone="notes"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 25,
                    background: "#fff",
                    borderTop: `1px solid ${BORD}`,
                    padding: "8px 8px 60px",
                    boxShadow: "0 -6px 18px rgba(16,24,32,.12)",
                  }}
                >
                  <label htmlFor="ppt-notes-m" style={{ fontSize: 11, color: "#616E7C" }}>
                    Notes de l&apos;orateur
                  </label>
                  <textarea
                    id="ppt-notes-m"
                    data-control={CONTROLES_PPT.notes}
                    value={notesLocal ?? slide.notes ?? ""}
                    onChange={(e) => setNotesLocal(e.target.value)}
                    onBlur={() => {
                      if (notesLocal !== null && notesLocal !== (slide.notes ?? ""))
                        gesteRef.current({ type: "setNotes", index: iActive, notes: notesLocal }, "panel")
                      setNotesLocal(null)
                    }}
                    placeholder="Cliquez pour ajouter des notes"
                    style={{
                      width: "100%",
                      height: 92,
                      border: `1px solid ${BORD}`,
                      borderRadius: 3,
                      padding: 6,
                      // 16 px : en dessous, iOS zoome sur le champ à la mise au
                      // point et déforme toute la mise en page.
                      fontSize: 16,
                      resize: "none",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* ─── Barre d'état ───
          Absente jusqu'ici, alors qu'elle est en bas de PowerPoint depuis
          toujours : la fenêtre se terminait sur le bord de la scène. Elle est
          PERMANENTE, comme celle d'Excel — qui n'apparaissait d'abord qu'en
          présence de nombres sélectionnés, si bien que la fenêtre se terminait
          le plus souvent sur une barre de défilement grise (défaut relevé par
          Samuel le 29/07).

          Elle porte deux repères que l'apprenant cherche vraiment : où il en est
          dans le jeu de diapositives, et s'il a bien quelque chose de
          sélectionné — l'oubli de sélection est le premier motif de blocage
          devant un bouton de mise en forme qui « ne fait rien ». */}
      <div
        data-zone="barre-etat"
        aria-label="Barre d'état"
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 14,
          borderTop: `1px solid ${BORD}`,
          background: "#F6F7F9",
          padding: "0 12px",
          height: 24,
          fontSize: 11,
          color: "#5A636D",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <span data-etat="position" style={{ flexShrink: 0 }}>
          Diapositive {iActive + 1} sur {deck.slides.length}
        </span>
        {slide.masquee ? (
          <span data-etat="masquee" style={{ flexShrink: 0, color: "#8D96A0" }}>
            masquée
          </span>
        ) : null}
        <span data-etat="selection" style={{ marginLeft: "auto", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {selection.length === 0
            ? "Aucun élément sélectionné"
            : selection.length === 1
              ? "1 élément sélectionné"
              : `${selection.length} éléments sélectionnés`}
        </span>
        <span data-etat="zoom" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums", color: "#8D96A0" }}>
          100 %
        </span>
      </div>

      {diaporama}
    </div>
  )
}

/**
 * Rendu NON INTERACTIF d'une diapositive : miniatures, trieuse, diaporama.
 *
 * `pointer-events: none` sur toute la surface — une surface décorative qui avale
 * les clics est le défaut le plus coûteux du lecteur d'Excel : le jalon de
 * franchissement recouvrait la feuille et cassait quatre scénarios sur six
 * (invariant §6.4).
 */
function ScenePure({ slide, deck }: { slide: SlideState; deck: DeckState }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const m = () => setW((v) => (el.clientWidth > 0 ? el.clientWidth : v))
    m()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(m)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const e = w > 0 ? w / deck.pageSize.w : 0

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: slide.fond ?? deck.master?.theme?.fond ?? "#fff",
        pointerEvents: "none",
      }}
    >
      {e > 0 &&
        slide.objects
          .slice()
          .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
          .map((o) => {
            const r = o.rect ?? { x: 0, y: 0, w: 0, h: 0 }
            const st = o.style ?? {}
            return (
              <div
                key={o.id}
                style={{
                  position: "absolute",
                  left: r.x * e,
                  top: r.y * e,
                  width: r.w * e,
                  height: r.h * e,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: o.placeholder === "titre" ? "center" : "flex-start",
                  padding: 6 * e,
                  boxSizing: "border-box",
                  color: st.color ?? "#1F2933",
                  fontSize: (st.size ?? (o.placeholder === "titre" ? 40 : 22)) * e,
                  fontWeight: st.bold ? 700 : o.placeholder === "titre" ? 600 : 400,
                  fontStyle: st.italic ? "italic" : undefined,
                  textAlign: st.align ?? "left",
                  fontFamily: "Calibri, system-ui, sans-serif",
                  overflow: "hidden",
                }}
              >
                {o.type === "forme" && o.shape ? (
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                  >
                    <path d={FORMES[o.shape] ?? FORMES.rectangle} fill={o.fill ?? "#2F6FB0"} />
                  </svg>
                ) : null}
                {o.type === "image" && o.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : null}
                {(o.paragraphs ?? []).map((p, i) => (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      paddingLeft: o.placeholder === "contenu" ? 14 * e : 0,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {o.placeholder === "contenu" ? (
                      <span style={{ position: "absolute", left: 0, color: SELECTION }}>•</span>
                    ) : null}
                    {p.text}
                  </div>
                ))}
              </div>
            )
          })}
    </div>
  )
}

/**
 * Image d'exemple, en data URI.
 *
 * Constante de module et non `useMemo` : `btoa` n'existe pas côté serveur, et
 * une constante calculée au premier rendu client suffit — elle ne dépend de
 * rien. La règle « zéro asset » interdit de servir un fichier : c'est ce qui met
 * PowerPoint à l'abri du piège des 404 sur `public/` en standalone Railway.
 */
const IMAGE_DEMO =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F6FB0"/><stop offset="1" stop-color="#7BB0DE"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><circle cx="80" cy="60" r="26" fill="#FFD98E"/><path d="M0 200 L110 92 L190 148 L250 108 L320 168 L320 200 Z" fill="#1B4C7E"/></svg>`,
  )
