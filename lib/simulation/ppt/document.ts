/**
 * PowerPoint — l'état du document, son évolution, et son juge.
 *
 * Aucune dépendance à React, au DOM ni à aucune bibliothèque : le MÊME code sert
 * à jouer côté navigateur et à corriger côté serveur. C'est cette séparation qui
 * rend `validate.ts` utilisable comme juge unique pour Excel ; sans elle, une
 * évaluation notée ne pourrait pas être corrigée hors du navigateur de
 * l'apprenant, et le contrat §6.16 impose que la note vienne du serveur.
 *
 * Sens des dépendances : `actions.ts` (la feuille, sans aucun import) →
 * `document.ts` → `adaptateur.ts`. Jamais l'inverse.
 */

import type {
  PptAction,
  PptAnimation,
  PptLayoutId,
  PptObjectType,
  PptPlaceholder,
  PptRect,
  PptShape,
  PptTextStyle,
  PptTransition,
  PptViewMode,
} from "./actions"
import { SCENE_16_9, TOLERANCE_DEFAUT } from "./actions"
import type { PptObservation } from "./observations"
import type { Verdict } from "../contrats"

export type { Verdict }

/* ═══════════ ÉTAT DU DOCUMENT ═══════════ */

export type Paragraph = { text: string; style?: PptTextStyle }

export type SlideObject = {
  id: string
  type: PptObjectType
  /** Emplacement hérité de la disposition ; la position vient alors du masque. */
  placeholder?: PptPlaceholder
  rect?: PptRect
  /** Rotation en degrés, sens horaire. */
  angle?: number
  /** Ordre de superposition, manipulé par les modules « Organiser ». */
  z?: number
  paragraphs?: Paragraph[]
  style?: PptTextStyle
  shape?: PptShape
  fill?: string
  stroke?: { color: string; width?: number }
  /**
   * Data URI uniquement : le scénario reste autonome, sans fichier à servir.
   * Règle « zéro asset », motivée par les 404 sur `public/` en standalone
   * Railway — un piège qui ne peut donc pas se produire ici.
   */
  src?: string
  alt?: string
  table?: { rows: number; cols: number; cells?: string[][] }
  /** Ni déplaçable ni supprimable : objets venus du masque. */
  locked?: boolean
}

export type LayoutDef = {
  id: PptLayoutId
  nom: string
  placeholders: Array<{ type: PptPlaceholder; rect: PptRect; invite: string }>
}

/**
 * Le masque : ce qui se répète sur toutes les diapositives. Son enjeu
 * pédagogique est « modifier le masque change TOUTES les diapositives », donc il
 * doit être un état à part et non une copie par page.
 */
export type MasterState = {
  theme?: { fond?: string; accent?: string; police?: string; couleurTexte?: string }
  objets?: SlideObject[]
  numeroVisible?: boolean
  piedVisible?: boolean
  piedTexte?: string
}

export type SlideState = {
  id: string
  layout: PptLayoutId
  objects: SlideObject[]
  fond?: string
  transition?: PptTransition
  animations?: PptAnimation[]
  /** Notes de l'orateur. */
  notes?: string
  /** Masquée : sautée en diaporama, grisée dans la trieuse. */
  masquee?: boolean
}

/**
 * L'état du diaporama est SÉPARÉ du document : lancer un diaporama ne modifie
 * pas la présentation. Les confondre ferait qu'une étape « lancez le diaporama »
 * salirait le document, et déclencherait une remise d'aplomb sur un geste juste.
 */
export type ShowState = {
  actif: boolean
  index: number
  depuis?: "debut" | "courante"
  ecran?: "normal" | "noir" | "blanc"
  presentateur?: boolean
}

export type DeckState = {
  fileName: string
  pageSize: { w: number; h: number }
  slides: SlideState[]
  master?: MasterState
  activeSlide?: number
  /** Objets sélectionnés sur la diapositive active. Plusieurs = sélection multiple. */
  selection?: string[]
  view?: PptViewMode
  show?: ShowState
  /**
   * Presse-papiers. Il SURVIT au changement d'étape : on copie à une étape, on
   * colle à la suivante — comme le liseré animé d'Excel, dont c'est justement la
   * leçon.
   */
  presse?: { objets: SlideObject[] } | { slides: SlideState[] } | null
}

/* ═══════════ DISPOSITIONS ═══════════ */

/**
 * Les cadres sont donnés dans la scène 960 × 540. Ils reprennent les proportions
 * de PowerPoint : titre dans le tiers haut, contenu en dessous, marges égales.
 *
 * `invite` est le texte grisé affiché tant que l'espace réservé est vide
 * (« Cliquez pour ajouter un titre »). Ce n'est pas de la décoration : c'est ce
 * qui apprend au débutant qu'une zone l'attend, et c'est le repère que la
 * consigne nomme.
 */
export const LAYOUTS: Record<PptLayoutId, LayoutDef> = {
  "diapositive-de-titre": {
    id: "diapositive-de-titre",
    nom: "Diapositive de titre",
    placeholders: [
      { type: "titre", rect: { x: 90, y: 170, w: 780, h: 120 }, invite: "Cliquez pour ajouter un titre" },
      { type: "sous-titre", rect: { x: 140, y: 310, w: 680, h: 80 }, invite: "Cliquez pour ajouter un sous-titre" },
    ],
  },
  "titre-et-contenu": {
    id: "titre-et-contenu",
    nom: "Titre et contenu",
    placeholders: [
      { type: "titre", rect: { x: 60, y: 40, w: 840, h: 90 }, invite: "Cliquez pour ajouter un titre" },
      { type: "contenu", rect: { x: 60, y: 155, w: 840, h: 330 }, invite: "Cliquez pour ajouter du texte" },
    ],
  },
  "titre-seul": {
    id: "titre-seul",
    nom: "Titre seul",
    placeholders: [
      { type: "titre", rect: { x: 60, y: 40, w: 840, h: 90 }, invite: "Cliquez pour ajouter un titre" },
    ],
  },
  "deux-contenus": {
    id: "deux-contenus",
    nom: "Deux contenus",
    placeholders: [
      { type: "titre", rect: { x: 60, y: 40, w: 840, h: 90 }, invite: "Cliquez pour ajouter un titre" },
      { type: "contenu", rect: { x: 60, y: 155, w: 405, h: 330 }, invite: "Cliquez pour ajouter du texte" },
      { type: "contenu", rect: { x: 495, y: 155, w: 405, h: 330 }, invite: "Cliquez pour ajouter du texte" },
    ],
  },
  comparaison: {
    id: "comparaison",
    nom: "Comparaison",
    placeholders: [
      { type: "titre", rect: { x: 60, y: 30, w: 840, h: 70 }, invite: "Cliquez pour ajouter un titre" },
      { type: "texte", rect: { x: 60, y: 115, w: 405, h: 55 }, invite: "Ajouter un intitulé" },
      { type: "texte", rect: { x: 495, y: 115, w: 405, h: 55 }, invite: "Ajouter un intitulé" },
      { type: "contenu", rect: { x: 60, y: 185, w: 405, h: 300 }, invite: "Cliquez pour ajouter du texte" },
      { type: "contenu", rect: { x: 495, y: 185, w: 405, h: 300 }, invite: "Cliquez pour ajouter du texte" },
    ],
  },
  vide: { id: "vide", nom: "Vide", placeholders: [] },
}

export const LAYOUTS_ORDRE: PptLayoutId[] = [
  "diapositive-de-titre",
  "titre-et-contenu",
  "titre-seul",
  "deux-contenus",
  "comparaison",
  "vide",
]

/* ═══════════ CONSTRUCTION ═══════════ */

/**
 * Compteur d'identifiants, remis à zéro à chaque construction de présentation.
 *
 * `Math.random()` et `Date.now()` sont volontairement écartés : un identifiant
 * non déterministe rendrait un scénario non rejouable, et le LMS a déjà payé ce
 * principe sur son semeur (identifiants déterministes `xl24sup_*`, qui rendent
 * l'injection idempotente et le retrait exact).
 *
 * ⚠️ Corollaire pour les auteurs : un objet qu'un scénario DÉSIGNE
 * (`P_SELECT_OBJECT`, `P_MOVE_OBJECT`, `P_DELETE_OBJECT`) doit porter un
 * identifiant écrit dans la déclaration. Un identifiant généré change dès qu'on
 * insère un objet plus haut dans le scénario — l'étape deviendrait injouable
 * sans que rien ne le signale.
 */
let compteur = 0
export function reinitialiserIds(): void {
  compteur = 0
}
function nouvelId(prefixe: string): string {
  compteur += 1
  return `${prefixe}${compteur}`
}

/** Crée les objets d'espace réservé d'une disposition, vides. */
export function objetsDeDisposition(layout: PptLayoutId): SlideObject[] {
  return LAYOUTS[layout].placeholders.map((ph, i) => ({
    id: nouvelId("obj"),
    type: ph.type === "image" ? "image" : "texte",
    placeholder: ph.type,
    rect: { ...ph.rect },
    z: i,
    paragraphs: [],
  }))
}

export function nouvelleDiapositive(layout: PptLayoutId = "titre-et-contenu"): SlideState {
  return { id: nouvelId("slide"), layout, objects: objetsDeDisposition(layout), animations: [] }
}

export function deckInitial(options?: Partial<DeckState>): DeckState {
  return {
    fileName: options?.fileName ?? "Présentation1.pptx",
    pageSize: options?.pageSize ?? { ...SCENE_16_9 },
    slides: options?.slides ?? [nouvelleDiapositive("diapositive-de-titre")],
    master: options?.master,
    activeSlide: options?.activeSlide ?? 0,
    selection: options?.selection ?? [],
    view: options?.view ?? "normal",
    show: options?.show ?? { actif: false, index: 0 },
    presse: options?.presse ?? null,
  }
}

/* ═══════════ DÉCLARATION D'AUTEUR ═══════════ */

/**
 * La présentation de départ, telle qu'un scénario la déclare.
 *
 * Volontairement plus pauvre que `DeckState` : un auteur écrit du texte et des
 * dispositions, pas des identifiants d'objets d'espace réservé ni des cadres
 * qu'une disposition connaît déjà.
 */
export type DeclarationDeck = {
  fileName?: string
  format?: "16:9" | "4:3"
  master?: MasterState
  activeSlide?: number
  view?: PptViewMode
  slides?: Array<{
    layout?: PptLayoutId
    fond?: string
    notes?: string
    masquee?: boolean
    transition?: PptTransition
    animations?: PptAnimation[]
    /**
     * Textes déjà présents, par espace réservé.
     *
     * La clé porte le rang quand la disposition a des espaces réservés en
     * double : `contenu` pour la colonne de gauche, `contenu#2` pour celle de
     * droite. Même convention que `ph:<type>#<rang>` côté étapes.
     */
    textes?: Partial<Record<PptPlaceholder | `${PptPlaceholder}#${number}`, string | string[]>>
    /** Objets libres. `id` est celui que les étapes désigneront. */
    objets?: Array<{
      id?: string
      objectType: PptObjectType
      shape?: PptShape
      rect?: PptRect
      texte?: string | string[]
      style?: PptTextStyle
      fill?: string
      src?: string
      alt?: string
      locked?: boolean
    }>
  }>
}

function paragraphesDe(t: string | string[] | undefined): Paragraph[] {
  if (t === undefined) return []
  return (Array.isArray(t) ? t : [t]).map((text) => ({ text }))
}

/**
 * Construit la présentation initiale à partir de la déclaration du scénario.
 *
 * Les identifiants sont remis à zéro : deux montages du même chapitre donnent
 * exactement les mêmes, donc une reprise retrouve les objets que les étapes
 * désignent.
 */
export function deckDepuisDeclaration(d?: DeclarationDeck | null): DeckState {
  reinitialiserIds()
  const pageSize = d?.format === "4:3" ? { w: 960, h: 720 } : { ...SCENE_16_9 }
  const slides: SlideState[] = (d?.slides ?? [{ layout: "diapositive-de-titre" }]).map((sd) => {
    const layout = sd.layout ?? "titre-et-contenu"
    /* Chaque espace réservé lit SA clé, rang compris.
     *
     * Avant : `textes.contenu` remplissait les DEUX colonnes d'une disposition
     * à deux contenus avec le même texte — une déclaration ne pouvait donc pas
     * décrire une comparaison, qui est pourtant sa raison d'être. La clé
     * `contenu#2` désigne la seconde ; `contenu` reste la première, donc aucun
     * scénario déjà écrit ne change. */
    const rangs: Record<string, number> = {}
    const objets = objetsDeDisposition(layout).map((o) => {
      if (!o.placeholder) return o
      const n = (rangs[o.placeholder] = (rangs[o.placeholder] ?? 0) + 1)
      const cle = n === 1 ? o.placeholder : `${o.placeholder}#${n}`
      const t = (sd.textes as Record<string, string | string[]> | undefined)?.[cle]
      return t === undefined ? o : { ...o, paragraphs: paragraphesDe(t) }
    })
    const libres: SlideObject[] = (sd.objets ?? []).map((od, i) => ({
      id: od.id ?? nouvelId("obj"),
      type: od.objectType,
      shape: od.shape,
      rect: od.rect ?? { x: 300, y: 220, w: 300, h: 120 },
      z: objets.length + i,
      paragraphs: od.texte === undefined ? undefined : paragraphesDe(od.texte),
      style: od.style,
      fill: od.fill,
      src: od.src,
      alt: od.alt,
      locked: od.locked,
    }))
    return {
      id: nouvelId("slide"),
      layout,
      objects: [...objets, ...libres],
      fond: sd.fond,
      notes: sd.notes,
      masquee: sd.masquee,
      transition: sd.transition,
      animations: sd.animations ?? [],
    }
  })
  return deckInitial({
    fileName: d?.fileName,
    pageSize,
    slides,
    master: d?.master,
    activeSlide: d?.activeSlide ?? 0,
    view: d?.view ?? "normal",
  })
}

/* ═══════════ LECTURE ═══════════ */

export function diapoActive(deck: DeckState): SlideState | null {
  return deck.slides[deck.activeSlide ?? 0] ?? null
}

/**
 * Retrouve un objet par identifiant, ou par `ph:<type>` d'espace réservé.
 *
 * ⚠️ Deux dispositions ont des espaces réservés EN DOUBLE — « Deux contenus »
 * et « Comparaison » en ont chacune deux de contenu, la seconde ayant en plus
 * deux intitulés. Sans rang, `ph:contenu` désignait toujours celui de GAUCHE :
 * la colonne de droite existait à l'écran, l'apprenant pouvait y écrire, et
 * aucune étape ne pouvait le juger. La moitié de ces deux dispositions était
 * donc inenseignable.
 *
 * D'où `ph:<type>#<rang>`, le rang commençant à 1. `ph:contenu` reste le
 * premier — les scénarios déjà écrits ne bougent pas.
 */
export function trouverObjet(slide: SlideState, cible: string): SlideObject | null {
  if (cible.startsWith("ph:")) {
    const [nom, rang] = cible.slice(3).split("#")
    const n = rang ? Number(rang) : 1
    if (!Number.isFinite(n) || n < 1) return null
    return slide.objects.filter((o) => o.placeholder === (nom as PptPlaceholder))[n - 1] ?? null
  }
  return slide.objects.find((o) => o.id === cible) ?? null
}

/** Forme d'auteur d'un objet d'espace réservé : `ph:contenu`, `ph:contenu#2`. */
export function cibleDAuteur(slide: SlideState, objectId: string): string | null {
  const obj = slide.objects.find((o) => o.id === objectId)
  if (!obj?.placeholder) return null
  const memes = slide.objects.filter((o) => o.placeholder === obj.placeholder)
  const rang = memes.indexOf(obj) + 1
  return rang <= 1 ? `ph:${obj.placeholder}` : `ph:${obj.placeholder}#${rang}`
}

/** Texte d'un objet, paragraphes joints par un retour à la ligne. */
export function texteDe(obj: SlideObject | null): string {
  if (!obj?.paragraphs?.length) return ""
  return obj.paragraphs.map((p) => p.text).join("\n")
}

/** Invite affichée pour un espace réservé vide. */
export function inviteDe(layout: PptLayoutId, type: PptPlaceholder): string {
  return LAYOUTS[layout].placeholders.find((p) => p.type === type)?.invite ?? "Cliquez pour ajouter du texte"
}

/**
 * Un cadre tient-il dans la scène ?
 *
 * Le spike s'est piégé lui-même en visant `y = 400` pour un objet haut de 200
 * dans une scène de 540 unités : l'étape était injouable, l'objet ne pouvant pas
 * atteindre la position demandée. C'est le contrôle que `check-jouabilite`
 * décliné PowerPoint fait respecter — et il vit ICI, pur, pour que le contrôle
 * et le moteur ne puissent pas diverger.
 */
export function cadreDansLaScene(
  rect: Partial<PptRect>,
  pageSize: { w: number; h: number },
  reference?: Partial<PptRect>,
): boolean {
  const x = rect.x ?? reference?.x ?? 0
  const y = rect.y ?? reference?.y ?? 0
  const w = rect.w ?? reference?.w ?? 0
  const h = rect.h ?? reference?.h ?? 0
  return x >= 0 && y >= 0 && x + w <= pageSize.w && y + h <= pageSize.h
}

/* ═══════════ GESTES ═══════════ */

/**
 * Les gestes que l'interface peut produire. Séparés des ACTIONS de scénario :
 * une action décrit ce qu'on ATTEND de l'apprenant, un geste décrit ce qu'il
 * vient de FAIRE. Confondre les deux revient à valider l'intention de l'auteur
 * au lieu du travail de l'apprenant.
 */
export type GestePpt =
  | { type: "selectSlide"; index: number }
  | { type: "addSlide"; layout?: PptLayoutId; index?: number }
  | { type: "deleteSlide"; index: number }
  | { type: "duplicateSlide"; index: number }
  | { type: "moveSlide"; from: number; to: number }
  | { type: "setLayout"; index: number; layout: PptLayoutId }
  | { type: "setView"; view: PptViewMode }
  | { type: "selectObject"; objectId: string | null; ajouter?: boolean }
  | {
      type: "addObject"
      objectType: SlideObject["type"]
      shape?: SlideObject["shape"]
      rect?: PptRect
      src?: string
    }
  | { type: "deleteObject"; objectId: string }
  | { type: "moveObject"; objectId: string; rect: PptRect; resize?: boolean }
  | { type: "editText"; objectId: string; paragraphe: number; text: string }
  | { type: "format"; objectId: string; style?: Partial<PptTextStyle>; fill?: string }
  | { type: "setTransition"; index: number; transition: PptTransition }
  | { type: "addAnimation"; objectId: string; kind: PptAnimation["kind"] }
  | { type: "setNotes"; index: number; notes: string }
  | { type: "toggleMasquee"; index: number }
  | { type: "startShow"; depuis?: "debut" | "courante" }
  | { type: "showNext" }
  | { type: "showPrev" }
  | { type: "endShow" }

function borner(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * Applique un geste. Fonction PURE : elle renvoie un nouvel état.
 *
 * Un geste impossible renvoie l'état INCHANGÉ plutôt que de lever : dans un
 * simulateur, l'apprenant a le droit de cliquer n'importe où, et une exception
 * remontée jusqu'au lecteur casserait la leçon au lieu de la corriger.
 */
export function appliquerGeste(deck: DeckState, geste: GestePpt): DeckState {
  const iActive = deck.activeSlide ?? 0

  switch (geste.type) {
    case "selectSlide":
      if (!deck.slides[geste.index]) return deck
      return { ...deck, activeSlide: geste.index, selection: [] }

    case "addSlide": {
      // PowerPoint insère APRÈS la diapositive courante et hérite de sa
      // disposition — sauf après une diapositive de titre, qui est unique et
      // suivie d'un « Titre et contenu ». Reproduire cette règle EST la leçon :
      // l'apprenant doit constater que la nouvelle ressemble à la précédente.
      const courante = deck.slides[iActive]
      const heritee: PptLayoutId =
        courante?.layout === "diapositive-de-titre"
          ? "titre-et-contenu"
          : courante?.layout ?? "titre-et-contenu"
      const layout = geste.layout ?? heritee
      const at = geste.index ?? iActive + 1
      const slides = [...deck.slides]
      slides.splice(borner(at, 0, slides.length), 0, nouvelleDiapositive(layout))
      return { ...deck, slides, activeSlide: borner(at, 0, slides.length - 1), selection: [] }
    }

    case "deleteSlide": {
      // Une présentation ne peut pas être vide : le vrai PowerPoint refuse aussi.
      if (deck.slides.length <= 1 || !deck.slides[geste.index]) return deck
      const slides = deck.slides.filter((_, i) => i !== geste.index)
      return { ...deck, slides, activeSlide: borner(iActive, 0, slides.length - 1), selection: [] }
    }

    case "duplicateSlide": {
      const src = deck.slides[geste.index]
      if (!src) return deck
      const copie: SlideState = {
        ...src,
        id: nouvelId("slide"),
        objects: src.objects.map((o) => ({
          ...o,
          id: nouvelId("obj"),
          rect: o.rect ? { ...o.rect } : undefined,
          paragraphs: o.paragraphs ? o.paragraphs.map((p) => ({ ...p })) : undefined,
        })),
      }
      const slides = [...deck.slides]
      slides.splice(geste.index + 1, 0, copie)
      return { ...deck, slides, activeSlide: geste.index + 1, selection: [] }
    }

    case "moveSlide": {
      const { from, to } = geste
      if (from === to || !deck.slides[from]) return deck
      const slides = [...deck.slides]
      const [dep] = slides.splice(from, 1)
      slides.splice(borner(to, 0, slides.length), 0, dep)
      return { ...deck, slides, activeSlide: borner(to, 0, slides.length - 1) }
    }

    case "setLayout": {
      const slide = deck.slides[geste.index]
      if (!slide) return deck
      const hauteurScene = deck.pageSize?.h ?? SCENE_16_9.h
      // Le cœur de la leçon « changer de disposition » : les espaces réservés
      // SUIVENT la nouvelle disposition en gardant leur contenu. Un espace
      // réservé que la nouvelle disposition ne propose plus est conservé à sa
      // place — le vrai PowerPoint fait de même, et perdre le texte d'un
      // apprenant serait indéfendable.
      const cibles = LAYOUTS[geste.layout].placeholders
      const pris = new Set<number>()
      const objects = slide.objects
        .map((o) => {
          if (!o.placeholder) return o
          const i = cibles.findIndex((c, k) => c.type === o.placeholder && !pris.has(k))
          if (i < 0) return o
          pris.add(i)
          return { ...o, rect: { ...cibles[i].rect } }
        })
        /* Un espace réservé que la nouvelle disposition n'a plus, et qui est
         * VIDE, disparaît — comme dans le vrai PowerPoint.
         *
         * Le garder était un défaut trouvé en JOUANT, invisible au juge : en
         * passant de « Titre et contenu » à « Diapositive de titre », le cadre
         * de contenu orphelin restait à sa place, RECOUVRAIT le nouveau titre
         * (dont le cadre descend au milieu de la scène), et interceptait le
         * clic. L'apprenant cliquait sur le titre et n'ouvrait rien.
         *
         * Un espace réservé orphelin REMPLI, lui, est conservé : perdre le
         * texte de l'apprenant serait indéfendable, et c'est la règle que la
         * leçon « changer de disposition ne perd rien » enseigne. */
        .filter((o) => {
          if (!o.placeholder) return true
          const orphelin = !cibles.some((c) => c.type === o.placeholder)
          return !orphelin || !!o.paragraphs?.length
        })
        /* Un orphelin CONSERVÉ est repoussé sous les nouveaux espaces réservés.
         *
         * Sans cela il gardait le cadre de son ancienne disposition et pouvait
         * RECOUVRIR ceux de la nouvelle : en passant de « Titre et contenu » à
         * « Diapositive de titre », le contenu (qui occupait toute la moitié
         * basse) se retrouvait par-dessus le titre, qui descend au milieu de la
         * scène. Le texte était visible, cliquable — et le titre inatteignable.
         * Défaut trouvé en jouant, invisible au juge comme au contrôle statique. */
        .map((o) => {
          if (!o.placeholder || !o.rect) return o
          const orphelin = !cibles.some((c) => c.type === o.placeholder)
          if (!orphelin || !cibles.length) return o
          const bas = Math.max(...cibles.map((c) => c.rect.y + c.rect.h))
          if (o.rect.y >= bas) return o
          const hauteur = Math.min(o.rect.h, Math.max(40, hauteurScene - bas - 12))
          return { ...o, rect: { ...o.rect, y: Math.min(bas + 10, hauteurScene - hauteur), h: hauteur } }
        })
      const ajouts: SlideObject[] = cibles
        .map((c, k) => ({ c, k }))
        .filter(({ k }) => !pris.has(k))
        .map(({ c }) => ({
          id: nouvelId("obj"),
          type: (c.type === "image" ? "image" : "texte") as PptObjectType,
          placeholder: c.type,
          rect: { ...c.rect },
          z: 0,
          paragraphs: [],
        }))
      /* Les nouveaux espaces réservés passent SOUS les objets libres.
       *
       * Ajoutés en fin de liste, ils se posaient PAR-DESSUS une zone de texte
       * que l'apprenant avait dessinée : la zone restait visible mais son
       * centre répondait au nouveau cadre de contenu, donc plus moyen de la
       * sélectionner ni de la supprimer. Le vrai PowerPoint place les cadres
       * d'une disposition derrière ce que l'utilisateur a dessiné, et c'est
       * aussi le seul ordre qui laisse « changer la disposition puis nettoyer »
       * jouable. Mesuré sur cinq chapitres de m15, au banc, invisible au juge.
       * `z` est recalculé par position : le rendu trie dessus. */
      const ordonnes = [
        ...objects.filter((o) => o.placeholder),
        ...ajouts,
        ...objects.filter((o) => !o.placeholder),
      ].map((o, i) => ({ ...o, z: i }))
      const slides = [...deck.slides]
      slides[geste.index] = { ...slide, layout: geste.layout, objects: ordonnes }
      return { ...deck, slides }
    }

    case "setView":
      return { ...deck, view: geste.view }

    case "selectObject": {
      if (geste.objectId === null) return { ...deck, selection: [] }
      const dejaLa = (deck.selection ?? []).includes(geste.objectId)
      if (geste.ajouter) {
        return {
          ...deck,
          selection: dejaLa
            ? (deck.selection ?? []).filter((s) => s !== geste.objectId)
            : [...(deck.selection ?? []), geste.objectId],
        }
      }
      return { ...deck, selection: [geste.objectId] }
    }

    case "addObject": {
      const slide = deck.slides[iActive]
      if (!slide) return deck
      const obj: SlideObject = {
        id: nouvelId("obj"),
        type: geste.objectType,
        shape: geste.shape,
        rect: geste.rect ?? { x: 300, y: 220, w: 300, h: 120 },
        z: slide.objects.length,
        paragraphs: geste.objectType === "texte" || geste.shape ? [] : undefined,
        fill: geste.shape ? "#2F6FB0" : undefined,
        src: geste.src,
      }
      const slides = [...deck.slides]
      slides[iActive] = { ...slide, objects: [...slide.objects, obj] }
      return { ...deck, slides, selection: [obj.id] }
    }

    case "deleteObject": {
      const slide = deck.slides[iActive]
      if (!slide) return deck
      const obj = slide.objects.find((o) => o.id === geste.objectId)
      if (!obj || obj.locked) return deck
      const slides = [...deck.slides]
      slides[iActive] = {
        ...slide,
        objects: slide.objects.filter((o) => o.id !== geste.objectId),
        animations: (slide.animations ?? []).filter((a) => a.objectId !== geste.objectId),
      }
      return { ...deck, slides, selection: [] }
    }

    case "moveObject": {
      const slide = deck.slides[iActive]
      if (!slide) return deck
      const slides = [...deck.slides]
      slides[iActive] = {
        ...slide,
        objects: slide.objects.map((o) =>
          o.id === geste.objectId && !o.locked ? { ...o, rect: geste.rect } : o,
        ),
      }
      return { ...deck, slides }
    }

    case "editText": {
      const slide = deck.slides[iActive]
      if (!slide) return deck
      const slides = [...deck.slides]
      slides[iActive] = {
        ...slide,
        objects: slide.objects.map((o) => {
          if (o.id !== geste.objectId) return o
          const paras: Paragraph[] = [...(o.paragraphs ?? [])]
          // Une saisie multi-lignes crée autant de paragraphes : c'est ainsi
          // qu'une liste à puces se remplit, et ce que le mode plan relit.
          const lignes = geste.text.split("\n")
          paras.splice(
            geste.paragraphe,
            Math.max(1, paras.length - geste.paragraphe),
            ...lignes.map((text) => ({ text })),
          )
          return { ...o, paragraphs: paras.filter((p, i) => p.text !== "" || i === 0) }
        }),
      }
      return { ...deck, slides }
    }

    case "format": {
      const slide = deck.slides[iActive]
      if (!slide) return deck
      const slides = [...deck.slides]
      slides[iActive] = {
        ...slide,
        objects: slide.objects.map((o) =>
          o.id === geste.objectId
            ? { ...o, style: { ...(o.style ?? {}), ...(geste.style ?? {}) }, fill: geste.fill ?? o.fill }
            : o,
        ),
      }
      return { ...deck, slides }
    }

    case "setTransition": {
      const slide = deck.slides[geste.index]
      if (!slide) return deck
      const slides = [...deck.slides]
      slides[geste.index] = { ...slide, transition: geste.transition }
      return { ...deck, slides }
    }

    case "addAnimation": {
      const slide = deck.slides[iActive]
      if (!slide) return deck
      const anims = [...(slide.animations ?? [])]
      anims.push({
        objectId: geste.objectId,
        kind: geste.kind,
        categorie: "ouverture",
        declencheur: "clic",
        ordre: anims.length + 1,
      })
      const slides = [...deck.slides]
      slides[iActive] = { ...slide, animations: anims }
      return { ...deck, slides }
    }

    case "setNotes": {
      const slide = deck.slides[geste.index]
      if (!slide) return deck
      const slides = [...deck.slides]
      slides[geste.index] = { ...slide, notes: geste.notes }
      return { ...deck, slides }
    }

    case "toggleMasquee": {
      const slide = deck.slides[geste.index]
      if (!slide) return deck
      const slides = [...deck.slides]
      slides[geste.index] = { ...slide, masquee: !slide.masquee }
      return { ...deck, slides }
    }

    /* ── Diaporama. Il ne touche JAMAIS aux diapositives. ── */
    case "startShow": {
      /* Le départ SAUTE les diapositives masquées, comme `showNext`.
       *
       * Sans cela, un diaporama lancé depuis le début s'ouvrait sur une
       * diapositive masquée quand c'était la première — exactement le cas d'une
       * ancienne version d'ouverture qu'on vient d'écarter. Le masquage
       * paraissait ne pas fonctionner, alors qu'il fonctionnait partout
       * ailleurs. Défaut trouvé en jouant une leçon de reprise de présentation.
       *
       * Repli assumé : si TOUT est masqué, on démarre quand même là où on a
       * demandé — un diaporama vide serait plus déroutant qu'une diapositive
       * masquée affichée. */
      let depart = geste.depuis === "courante" ? iActive : 0
      while (deck.slides[depart]?.masquee && depart < deck.slides.length - 1) depart += 1
      if (deck.slides[depart]?.masquee) depart = geste.depuis === "courante" ? iActive : 0
      return {
        ...deck,
        show: { actif: true, index: depart, depuis: geste.depuis ?? "debut", ecran: "normal" },
      }
    }

    case "showNext": {
      const show = deck.show ?? { actif: false, index: 0 }
      if (!show.actif) return deck
      // Une diapositive masquée est SAUTÉE : c'est tout l'intérêt de la masquer,
      // et la seule façon de le prouver à l'apprenant.
      let i = show.index + 1
      while (deck.slides[i]?.masquee) i += 1
      // Passé la dernière, le diaporama se termine — comme le vrai.
      if (i >= deck.slides.length)
        return { ...deck, show: { ...show, actif: false, index: deck.slides.length - 1 } }
      return { ...deck, show: { ...show, index: i } }
    }

    case "showPrev": {
      const show = deck.show ?? { actif: false, index: 0 }
      if (!show.actif) return deck
      let i = show.index - 1
      while (i >= 0 && deck.slides[i]?.masquee) i -= 1
      return { ...deck, show: { ...show, index: Math.max(0, i) } }
    }

    case "endShow":
      return { ...deck, show: { ...(deck.show ?? { index: 0 }), actif: false } }

    default:
      return deck
  }
}

/* ═══════════ VALIDATION ═══════════ */

const KO = (reason: string, message: string): Verdict => ({ ok: false, reason, message })
const OK: Verdict = { ok: true }

/**
 * Normalise un texte saisi : ni la casse ni les accents ne sont la leçon.
 *
 * Les diacritiques sont retirés par leur plage Unicode ÉCHAPPÉE, et non par des
 * caractères combinants écrits littéralement dans la source : ces derniers
 * survivent mal à une copie de fichier ou à un changement d'encodage, et l'échec
 * serait SILENCIEUX — « Présentation » cesserait d'égaler « presentation » sans
 * le moindre message, sur toutes les saisies de la formation à la fois.
 * `check-texte-ppt.ts` piège précisément ce cas.
 */
export function normaliserTexte(s: string, strict = false): string {
  const t = String(s ?? "").trim().replace(/\s+/g, " ")
  if (strict) return t
  return t.toLocaleUpperCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Deux cadres sont-ils équivalents ?
 *
 * Un déplacement à la souris n'atteint jamais le pixel exact : exiger l'égalité
 * rendrait toute étape de déplacement infranchissable. Voir `TOLERANCE_DEFAUT`
 * et `TOLERANCE_TACTILE` dans `actions.ts`.
 */
export function memeCadre(
  a: PptRect | undefined,
  b: Partial<PptRect>,
  tolerance = TOLERANCE_DEFAUT,
): boolean {
  if (!a) return false
  const proche = (x: number | undefined, y: number | undefined) =>
    x === undefined || y === undefined || Math.abs(x - y) <= tolerance
  return proche(a.x, b.x) && proche(a.y, b.y) && proche(a.w, b.w) && proche(a.h, b.h)
}

/**
 * Rétrécit l'état rapporté par l'observation.
 *
 * L'état arrive en `unknown` — `observations.ts` est une feuille sans import, et
 * cet état traverse le réseau jusqu'au juge serveur. Une forme inattendue doit
 * donner un verdict, jamais une exception : une exception dans la route de
 * correction ferait perdre le passage entier d'une évaluation.
 */
export function lireDeck(u: unknown): DeckState | null {
  if (!u || typeof u !== "object") return null
  const d = u as Partial<DeckState>
  if (!Array.isArray(d.slides)) return null
  if (!d.pageSize || typeof d.pageSize.w !== "number" || typeof d.pageSize.h !== "number") return null
  return d as DeckState
}

/** L'état du document au moment de l'observation, ou `null` si elle n'en porte pas. */
function deckDe(obs: PptObservation): DeckState | null {
  return obs.kind === "p:deckChange" ? lireDeck(obs.deck) : null
}

const PAS_ENCORE = KO("no_deck", "Ce n'est pas encore fait.")

/**
 * Le juge unique — client ET serveur.
 *
 * Reçoit l'action attendue par l'étape et ce que le simulateur a observé, rend
 * un verdict. `message` s'adresse à l'apprenant et ne doit jamais laisser filtrer
 * de jargon d'état interne ni la réponse ; `reason` alimente le journal
 * pédagogique.
 *
 * ⚠️ Les quatre actions jugées sur l'ÉTAT ne se prononcent que sur
 * `p:deckChange`, seule observation qui porte le document complet. Sur toute
 * autre, elles rendent `no_deck` — un préfixe `no_` et non `wrong_`, parce que
 * `frappe.ts` traite le premier comme un passage obligé et le second comme une
 * faute. Ouvrir un menu avant d'agir ne doit rien coûter.
 */
export function validerGeste(
  action: PptAction,
  obs: PptObservation,
  requiredChannel?: string,
): Verdict {
  // Le canal se contrôle AVANT le reste : 30 % des exercices de référence
  // imposent le moyen, et un résultat juste obtenu autrement ne vaut pas la
  // compétence enseignée.
  if (requiredChannel && obs.channel !== requiredChannel) {
    return KO(
      "wrong_channel",
      requiredChannel === "ribbon"
        ? "La consigne demande de passer par un bouton du ruban."
        : "Ce n'est pas le moyen demandé par la consigne.",
    )
  }

  switch (action.type) {
    case "P_SELECT_SLIDE":
      if (obs.kind !== "p:slideSelect")
        return KO("wrong_gesture", "Sélectionnez une diapositive dans le volet.")
      return obs.index === action.index
        ? OK
        : KO("wrong_slide", `Vous avez sélectionné la diapositive ${obs.index + 1}, pas la ${action.index + 1}.`)

    case "P_ADD_SLIDE":
      if (obs.kind !== "p:slideAdd") return KO("wrong_gesture", "Ajoutez une nouvelle diapositive.")
      if (action.layout && obs.layout !== action.layout)
        return KO(
          "wrong_layout",
          `La diapositive ajoutée utilise « ${nomLayout(obs.layout)} », pas « ${nomLayout(action.layout)} ».`,
        )
      return OK

    case "P_DELETE_SLIDE":
      if (obs.kind !== "p:slideDelete") return KO("wrong_gesture", "Supprimez la diapositive demandée.")
      return obs.index === action.index
        ? OK
        : KO("wrong_slide", `C'est la diapositive ${action.index + 1} qu'il fallait supprimer.`)

    case "P_DUPLICATE_SLIDE":
      if (obs.kind !== "p:slideDuplicate") return KO("wrong_gesture", "Dupliquez la diapositive demandée.")
      return obs.index === action.index
        ? OK
        : KO("wrong_slide", `C'est la diapositive ${action.index + 1} qu'il fallait dupliquer.`)

    case "P_MOVE_SLIDE":
      if (obs.kind !== "p:slideMove")
        return KO("wrong_gesture", "Faites glisser la diapositive à sa nouvelle place.")
      return obs.from === action.from && obs.to === action.to
        ? OK
        : KO("wrong_move", `La diapositive ${action.from + 1} doit venir en position ${action.to + 1}.`)

    case "P_SET_LAYOUT":
      if (obs.kind !== "p:layoutChange")
        return KO("wrong_gesture", "Changez la disposition de la diapositive.")
      return obs.layout === action.layout
        ? OK
        : KO(
            "wrong_layout",
            `Vous avez choisi « ${nomLayout(obs.layout)} ». La consigne demande « ${nomLayout(action.layout)} ».`,
          )

    case "P_SET_VIEW":
      if (obs.kind !== "p:viewChange") return KO("wrong_gesture", "Changez de mode d'affichage.")
      return obs.view === action.view
        ? OK
        : KO("wrong_view", `Vous êtes passé en mode « ${obs.view} ».`)

    case "P_SELECT_OBJECT":
      if (obs.kind !== "p:objectSelect") return KO("wrong_gesture", "Cliquez sur l'élément demandé.")
      return obs.objectId === action.objectId
        ? OK
        : KO("wrong_object", "Ce n'est pas l'élément demandé.")

    case "P_ADD_OBJECT":
      if (obs.kind !== "p:objectAdd") return KO("wrong_gesture", "Insérez l'élément demandé.")
      if (obs.objectType !== action.objectType)
        return KO("wrong_type", `Vous avez inséré un élément de type « ${obs.objectType} ».`)
      if (action.shape && obs.shape !== action.shape)
        return KO("wrong_shape", "Ce n'est pas la forme demandée.")
      return OK

    case "P_DELETE_OBJECT":
      if (obs.kind !== "p:objectDelete") return KO("wrong_gesture", "Supprimez l'élément demandé.")
      return obs.objectId === action.objectId
        ? OK
        : KO("wrong_object", "Ce n'est pas l'élément demandé.")

    case "P_MOVE_OBJECT":
      if (obs.kind !== "p:objectMove")
        return KO("wrong_gesture", "Faites glisser l'élément à l'endroit demandé.")
      if (obs.objectId !== action.objectId) return KO("wrong_object", "Ce n'est pas l'élément demandé.")
      return memeCadre(obs.rect, action.rect, action.tolerance ?? TOLERANCE_DEFAUT)
        ? OK
        : KO("wrong_position", "L'élément n'est pas encore à la place demandée.")

    case "P_TYPE_TEXT": {
      if (obs.kind !== "p:typed") return KO("wrong_gesture", "Saisissez le texte demandé.")
      if (obs.cible !== action.cible && obs.objectId !== action.cible)
        return KO("wrong_target", "Le texte n'a pas été saisi au bon endroit.")
      if (action.paragraphe !== undefined && obs.paragraphe !== action.paragraphe)
        return KO("wrong_paragraph", "Ce n'est pas la ligne demandée.")
      const norm = (s: string) => normaliserTexte(s, action.caseSensitive)
      return action.accept.some((a) => norm(a) === norm(obs.text))
        ? OK
        : KO("wrong_text", `« ${obs.text} » ne correspond pas à ce qui est demandé.`)
    }

    case "P_EXPECT_DECK": {
      const deck = deckDe(obs)
      return deck ? validerDeck(action.deck, deck) : PAS_ENCORE
    }

    case "P_EXPECT_FORMAT": {
      const deck = deckDe(obs)
      if (!deck) return PAS_ENCORE
      const slide = diapoActive(deck)
      const obj = slide ? trouverObjet(slide, action.objectId) : null
      if (!obj) return KO("no_object", "L'élément demandé n'est pas encore là.")
      for (const [cle, val] of Object.entries(action.style)) {
        if ((obj.style as Record<string, unknown> | undefined)?.[cle] !== val)
          return KO("wrong_format", "La mise en forme demandée n'est pas encore appliquée.")
      }
      if (action.fill !== undefined && obj.fill !== action.fill)
        return KO("wrong_fill", "La couleur de remplissage n'est pas celle demandée.")
      return OK
    }

    case "P_EXPECT_ANIMATIONS": {
      const deck = deckDe(obs)
      if (!deck) return PAS_ENCORE
      const anims = diapoActive(deck)?.animations ?? []
      if (anims.length < action.animations.length)
        return KO("no_animation", `Il manque une animation : ${action.animations.length} sont attendues.`)
      for (let i = 0; i < action.animations.length; i += 1) {
        const att = action.animations[i] as Record<string, unknown>
        const obt = anims[i] as unknown as Record<string, unknown>
        for (const [cle, val] of Object.entries(att)) {
          if (obt[cle] !== val)
            return KO("wrong_animation", `L'animation ${i + 1} ne correspond pas à ce qui est demandé.`)
        }
      }
      return OK
    }

    case "P_EXPECT_SHOW": {
      const deck = deckDe(obs)
      if (!deck) return PAS_ENCORE
      const show = deck.show ?? { actif: false, index: 0 }
      for (const [cle, val] of Object.entries(action.show)) {
        if ((show as unknown as Record<string, unknown>)[cle] !== val) {
          if (cle === "actif")
            return KO("show_state", val ? "Le diaporama n'est pas lancé." : "Le diaporama est encore en cours.")
          if (cle === "index")
            return KO("show_index", `Le diaporama est sur la diapositive ${show.index + 1}.`)
          return KO("show_state", "Le diaporama n'est pas dans l'état demandé.")
        }
      }
      return OK
    }

    /**
     * `P_MONTRER` n'est PAS une action d'étape : elle ne vit que dans le tableau
     * `montrer` d'un écran de lecture, où elle décrit ce que la démonstration
     * fait voir. Rien ne l'émet, donc rien ne peut la valider — et une étape qui
     * la porterait attendrait indéfiniment un geste qui n'arrivera jamais.
     *
     * Le refus est explicite plutôt que silencieux : c'est `check-scenario-ppt`
     * qui doit attraper l'erreur d'écriture, mais si elle passait, l'apprenant
     * lirait un motif net au lieu de rester bloqué sans explication.
     */
    case "P_MONTRER":
      return KO("action_non_jouable", "Cet écran se lit : il n'attend aucun geste.")

    default: {
      // Exhaustivité de l'application, garantie ICI et non dans `validate.ts` :
      // c'est ce qui permet d'ajouter une action sans toucher un fichier gelé.
      const _exhaustif: never = action
      void _exhaustif
      return KO("unknown_action", "Action inconnue.")
    }
  }
}

function nomLayout(id: string): string {
  return LAYOUTS[id as PptLayoutId]?.nom ?? id
}

/** Compare l'état du document à ce que l'étape attend. */
export function validerDeck(
  attendu: NonNullable<Extract<PptAction, { type: "P_EXPECT_DECK" }>["deck"]>,
  deck: DeckState,
): Verdict {
  if (attendu.nbSlides !== undefined && deck.slides.length !== attendu.nbSlides)
    return KO(
      "wrong_count",
      `La présentation compte ${deck.slides.length} diapositives, il en faut ${attendu.nbSlides}.`,
    )

  for (const att of attendu.slides ?? []) {
    const slide = deck.slides[att.index]
    if (!slide) return KO("no_slide", `La diapositive ${att.index + 1} n'existe pas encore.`)

    if (att.layout && slide.layout !== att.layout)
      return KO(
        "wrong_layout",
        `La diapositive ${att.index + 1} n'utilise pas la disposition « ${nomLayout(att.layout)} ».`,
      )
    if (att.masquee !== undefined && !!slide.masquee !== att.masquee)
      return KO("wrong_hidden", `La diapositive ${att.index + 1} n'est pas dans l'état demandé.`)
    if (att.notes !== undefined && normaliserTexte(slide.notes ?? "") !== normaliserTexte(att.notes))
      return KO("wrong_notes", `Les notes de la diapositive ${att.index + 1} ne correspondent pas.`)
    if (att.nbObjets !== undefined && slide.objects.length !== att.nbObjets)
      return KO(
        "wrong_object_count",
        `La diapositive ${att.index + 1} ne contient pas le bon nombre d'éléments.`,
      )

    if (att.transition) {
      const tr = slide.transition as unknown as Record<string, unknown> | undefined
      for (const [cle, val] of Object.entries(att.transition)) {
        if (tr?.[cle] !== val)
          return KO(
            "wrong_transition",
            `La transition de la diapositive ${att.index + 1} n'est pas celle demandée.`,
          )
      }
    }

    for (const [ph, textes] of Object.entries(att.textes ?? {})) {
      const obj = trouverObjet(slide, `ph:${ph}`)
      const obtenu = normaliserTexte(texteDe(obj))
      if (!(textes as string[]).some((t) => normaliserTexte(t) === obtenu))
        return KO(
          "wrong_text",
          `Le texte attendu n'est pas encore saisi dans la zone « ${ph} » de la diapositive ${att.index + 1}.`,
        )
    }

    for (const attObj of att.objets ?? []) {
      const cible = attObj.id
        ? trouverObjet(slide, attObj.id)
        : attObj.placeholder
          ? trouverObjet(slide, `ph:${attObj.placeholder}`)
          : slide.objects.find(
              (o) => o.type === attObj.objectType && (!attObj.shape || o.shape === attObj.shape),
            )
      if (!cible)
        return KO("no_object", `Un élément attendu manque sur la diapositive ${att.index + 1}.`)
      if (attObj.rect && !memeCadre(cible.rect, attObj.rect, attObj.tolerance ?? TOLERANCE_DEFAUT))
        return KO("wrong_position", "Un élément n'est pas à la place demandée.")
      if (attObj.fill !== undefined && cible.fill !== attObj.fill)
        return KO("wrong_fill", "La couleur de remplissage n'est pas celle demandée.")
      if (attObj.texte && !attObj.texte.some((t) => normaliserTexte(t) === normaliserTexte(texteDe(cible))))
        return KO("wrong_text", "Le texte d'un élément ne correspond pas.")
      for (const [cle, val] of Object.entries(attObj.style ?? {})) {
        if ((cible.style as Record<string, unknown> | undefined)?.[cle] !== val)
          return KO("wrong_format", "La mise en forme d'un élément n'est pas celle demandée.")
      }
    }
  }

  for (const [cle, val] of Object.entries(attendu.master ?? {})) {
    if (
      JSON.stringify((deck.master as unknown as Record<string, unknown> | undefined)?.[cle]) !==
      JSON.stringify(val)
    )
      return KO("wrong_master", "Le masque n'est pas dans l'état demandé.")
  }

  return OK
}

/* ═══════════ CONTRÔLES ═══════════ */

/**
 * Identifiants des boutons, même convention qu'Excel : le préfixe dit l'onglet.
 *
 * Chaque identifiant doit être RENDU par le chrome et FAIRE quelque chose. Sur
 * Excel, neuf boutons n'avaient aucun traitement et validaient quand même
 * l'étape, parce que tout identifiant finissait par émettre une observation
 * `control` — l'apprenant cliquait, rien ne bougeait, et l'étape passait.
 * `check-controles` décliné PowerPoint vérifie les deux sens.
 */
export const CONTROLES_PPT = {
  // Accueil
  nouvelleDiapo: "acc-nouvelle-diapo",
  disposition: "acc-disposition",
  dispositionChoix: (id: PptLayoutId) => `acc-disposition-${id}`,
  supprimerDiapo: "acc-supprimer-diapo",
  dupliquerDiapo: "acc-dupliquer-diapo",
  /**
   * Réordonnancement — décision D11, PAR BOUTONS et jamais par glisser-déposer.
   *
   * Le vrai PowerPoint fait glisser les miniatures. On ne le reproduit pas : D2
   * fait du mobile une contrainte de premier rang, et à 390 px le volet est un
   * TIROIR de quelques dizaines de pixels de large. Y faire glisser une vignette
   * au doigt est le geste le moins fiable de toute la surface — et un geste que
   * l'apprenant rate sans comprendre pourquoi est pire qu'un geste absent.
   *
   * Les deux boutons agissent sur la diapositive AFFICHÉE, comme « Dupliquer »
   * et « Supprimer » : une seule règle à retenir pour tout le groupe.
   */
  monterDiapo: "acc-monter-diapo",
  descendreDiapo: "acc-descendre-diapo",
  gras: "acc-gras",
  italique: "acc-italique",
  souligne: "acc-souligne",
  alignGauche: "acc-align-gauche",
  alignCentre: "acc-align-centre",
  alignDroite: "acc-align-droite",
  // RÉSERVÉS AU LOT 2 (décision D3) : déclarés pour que l'intention reste
  // écrite, volontairement NON rendus par le chrome. Un bouton rendu mais inerte
  // est le pire des trois états — sur Excel, neuf d'entre eux validaient l'étape
  // sans rien faire.
  taillePlus: "acc-taille-plus",
  tailleMoins: "acc-taille-moins",
  // Insertion
  zoneTexte: "ins-zone-texte",
  image: "ins-image",
  forme: "ins-forme",
  formeChoix: (s: string) => `ins-forme-${s}`,
  tableau: "ins-tableau", // lot 2
  /**
   * Suppression d'un objet — décision D11 : la touche Suppr ET un bouton.
   *
   * La touche seule aurait laissé la compétence hors de portée sur téléphone,
   * où il n'y a pas de clavier tant qu'aucune saisie n'est ouverte. Le bouton
   * seule aurait enseigné un geste que personne ne fait dans le vrai
   * PowerPoint. Les deux émettent le MÊME geste, donc la même observation :
   * l'étape ne juge pas le chemin, seulement le résultat.
   */
  supprimerObjet: "obj-supprimer",
  // Transitions
  transition: (k: string) => `tra-${k}`,
  // Animations
  animation: (k: string) => `ani-${k}`,
  // Diaporama
  lancerDebut: "dia-depuis-debut",
  lancerCourante: "dia-depuis-courante",
  masquerDiapo: "dia-masquer",
  quitterShow: "dia-quitter",
  // Affichage
  vue: (v: string) => `aff-${v}`,
  // Volet des miniatures
  miniature: (i: number) => `vol-diapo-${i}`,
  voletBascule: "vol-bascule",
  notes: "vol-notes",
  /**
   * Ouvre les notes de l'orateur sur petit écran.
   *
   * Le champ de notes était purement DESKTOP : sous 720 px il n'existait pas,
   * et toute compétence qui en dépend restait donc inenseignable à un apprenant
   * sur téléphone — la moitié d'entre eux. Un panneau superposé, comme le
   * tiroir des miniatures, coûte un bouton et rend la notion jouable partout.
   */
  notesBascule: "vol-notes-bascule",
  /** Onglets du ruban. Un onglet est un bouton comme un autre : il se presse. */
  onglet: (o: OngletPpt) => `ong-${o}`,
} as const

/* ═══════════ LES ONGLETS DU RUBAN ═══════════ */

/**
 * Les six onglets rendus par le ruban.
 *
 * Le lot 1 avait fait le choix inverse — une seule ligne défilante, sans onglet
 * — et l'avait motivé : un ruban sans onglet ne peut pas produire la classe de
 * défauts d'Excel, où 55 gestes de démonstration visaient un bouton logé sous un
 * autre onglet, donc introuvable. Ce raisonnement était juste, mais il payait le
 * risque avec une compétence : « aller dans l'onglet Insertion » est le geste le
 * plus élémentaire de PowerPoint, et il n'était enseigné nulle part.
 *
 * Les onglets sont donc rendus, et le défaut qu'ils rouvrent est fermé par
 * ailleurs — voir `ongletDuControle` : c'est la MÊME source qui décide où vit un
 * bouton, qui ouvre l'onglet attendu par une étape, et qui fait basculer une
 * démonstration avant de presser. Un bouton ne peut donc pas être hors de portée
 * sans que les trois le soient ensemble, ce qui se voit tout de suite.
 *
 * Six et pas dix : le vrai PowerPoint a aussi Fichier, Dessin, Création et
 * Révision. Aucune commande du moteur n'y vit. Un onglet vide serait un bouton
 * fictif — exactement ce que la règle des contrôles interdit.
 */
export const ONGLETS_PPT = ["accueil", "insertion", "transitions", "animations", "diaporama", "affichage"] as const
export type OngletPpt = (typeof ONGLETS_PPT)[number]

export const LIBELLE_ONGLET_PPT: Record<OngletPpt, string> = {
  accueil: "Accueil",
  insertion: "Insertion",
  transitions: "Transitions",
  animations: "Animations",
  diaporama: "Diaporama",
  affichage: "Affichage",
}

/**
 * Sous quel onglet vit un bouton — déduit de son PRÉFIXE, jamais d'une table.
 *
 * Une table à tenir à jour à la main dériverait le jour où un bouton naîtrait
 * sans y être inscrit : il deviendrait injoignable, et l'étape qui le demande
 * infranchissable. Le préfixe est déjà la convention de nommage de
 * `CONTROLES_PPT` ; s'en servir rend l'oubli impossible par construction.
 *
 * `null` = le bouton ne vit pas dans le ruban (volet des miniatures, notes,
 * barre d'état, boutons du diaporama en plein écran). Il est alors toujours
 * atteignable, et aucune bascule d'onglet ne doit être tentée pour lui.
 */
export function ongletDuControle(id: string): OngletPpt | null {
  if (id.startsWith("ong-")) {
    const o = id.slice(4) as OngletPpt
    return (ONGLETS_PPT as readonly string[]).includes(o) ? o : null
  }
  // « Objet » est un groupe de l'onglet Accueil, pas un onglet : dans le vrai
  // PowerPoint, supprimer un élément sélectionné se fait depuis Accueil.
  if (id.startsWith("acc-") || id.startsWith("obj-")) return "accueil"
  if (id.startsWith("ins-")) return "insertion"
  if (id.startsWith("tra-")) return "transitions"
  if (id.startsWith("ani-")) return "animations"
  // « Quitter » vit dans le diaporama en plein écran, pas dans le ruban — qui
  // n'est même plus affiché à ce moment-là. Le ranger sous l'onglet Diaporama
  // ferait tenter une bascule impossible avant de le presser.
  if (id === CONTROLES_PPT.quitterShow) return null
  if (id.startsWith("dia-")) return "diaporama"
  if (id.startsWith("aff-")) return "affichage"
  return null
}
