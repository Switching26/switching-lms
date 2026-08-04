"use client"

/**
 * Hôte du traitement de texte. C'est le SEUL fichier qui connaît Univer Docs :
 * tout le reste du simulateur Word passe par l'interface `WordApi` définie ici.
 * Si l'on change un jour de moteur, c'est ce fichier qu'on réécrit.
 *
 * Même architecture qu'`ExcelGrid`, et pour les mêmes raisons — chacune payée
 * en production :
 *
 *  1. Le composant se monte UNE fois et ne se démonte JAMAIS au changement
 *     d'étape. Seul son contenu change, par appels impératifs. Démonter un
 *     sous-arbre qui héberge un moteur tiers laisse des instances orphelines et
 *     perd le travail de l'apprenant.
 *  2. Toutes les fonctions de rappel sont lues depuis des refs : l'effet de
 *     montage n'a aucune dépendance et ne se réexécute jamais, même si le parent
 *     se rerend à chaque frappe.
 *  3. Univer n'est PAS importable côté serveur. Ce composant doit toujours être
 *     chargé via `dynamic(..., { ssr: false })`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE MOTEUR SAIT ET NE SAIT PAS — mesuré au banc 8862, pas lu
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ✅ La mise en forme, les styles, l'alignement, les listes et les tableaux se
 *    pilotent par `executeCommand` sur une sélection posée programmatiquement.
 * ✅ `getSnapshot()` est vivant et fidèle : c'est l'`EXPECT_STATE` de Word.
 * ✅ `disposeUnit` + `createUniverDoc` remplace le document et REPEINT.
 *
 * ❌ La façade n'écrit PAS de texte. `appendText`, `insertText` et
 *    `insertParagraph` renvoient `true` et ne changent rien — vérifié avec et
 *    sans focus, et après un vrai clic. Le texte n'entre que par le clavier de
 *    l'apprenant. C'est pour cela que poser l'état d'un document passe par une
 *    RECRÉATION de l'unité, jamais par une écriture.
 * ❌ Aucun raccourci clavier n'est câblé : `Ctrl+A`, `Ctrl+B`, `Ctrl+I`,
 *    `Ctrl+U` n'émettent rien. On les intercepte ici.
 * ❌ `Maj+Flèche` n'étend aucune sélection et n'a aucune commande : une leçon
 *    qui l'exigerait serait injouable. Elle doit être un écran de lecture.
 */

import { useEffect, useRef } from "react"

// 🔴 Le preset n'apporte PAS son CSS. C'est exactement le bug qui a laissé la
// grille Excel entièrement blanche en production sur 246 chapitres : le banc la
// chargeait par un `<link>` à part, l'application ne l'a jamais eue.
import "@univerjs/preset-docs-core/lib/index.css"

import type { WordObservation, WordParagrapheObserve, WordPlage } from "@/lib/simulation/word/observations"
import {
  attributsDeFormat,
  corpsUniver,
  lireFormat,
  lireParagraphes,
  lireTableaux,
  resoudreZone,
  type CorpsInstantane,
  type ParagrapheLu,
  type WordDocumentState,
} from "@/lib/simulation/word/document"
import { RACCOURCIS_CABLES } from "@/lib/simulation/word/adaptateur"

/** Ce que le simulateur peut demander au traitement de texte. */
export type WordApi = {
  /** Remplace l'état du document — nouvelle étape, ou reprise. */
  applyDocument: (etat: WordDocumentState) => void
  /** Sélectionne une zone (`p1`, `p1:mot2`, `texte:Rapport`…). */
  setSelection: (zone: string) => boolean
  /** L'état courant, tel que le juge le lira. */
  lireEtat: (zones?: string[]) => Extract<WordObservation, { kind: "w:docState" }>
  /**
   * Rectangle d'une zone DANS le conteneur, en pixels.
   *
   * L'équivalent de `getCellRect`. Univer rend sur canvas : il n'existe aucun
   * élément de DOM par mot ni par paragraphe, la géométrie vient donc du
   * squelette de composition — position du glyphe dans sa ligne, de la ligne
   * dans sa page, de la page dans la scène.
   */
  getPlageRect: (zone: string) => { left: number; top: number; width: number; height: number } | null
  /** Exécute un bouton du ruban. Rend `false` si rien n'a pu être fait. */
  executer: (controle: string, argument?: string) => boolean
  /** Replace les ancres des zones désignées par l'étape courante. */
  replacerAncres: () => void
  /** Rend le focus au document — sans quoi l'apprenant tape dans le vide. */
  focus: () => void
  /** Le moteur est-il monté et le document composé ? */
  pret: () => boolean
}

type Props = {
  /** Hauteur imposée par le châssis, mesurée par `ResizeObserver`. */
  heightPx: number
  onReady?: (api: WordApi) => void
  onObservation?: (o: WordObservation) => void
  /** Zones que l'étape courante désigne : elles reçoivent une ancre invisible. */
  zonesCibles?: string[]
  className?: string
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMANDES — le vrai canal de pilotage
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `data-control` → commande Univer.
 *
 * Les 78 commandes `doc.command.*` ont été extraites du moteur puis appelées
 * une par une : celles qui figurent ici ont TOUTES eu un effet mesuré sur
 * `getSnapshot()`. Un bouton dont la commande n'aurait pas d'effet serait pire
 * qu'absent — l'apprenant cliquerait, rien ne se passerait, et l'étape se
 * validerait quand même puisque tout identifiant finit par émettre un
 * `control`. C'est le défaut que `check-controles` existe pour attraper.
 */
const COMMANDE_PAR_CONTROLE: Record<string, string> = {
  "w-gras": "doc.command.set-inline-format-bold",
  "w-italique": "doc.command.set-inline-format-italic",
  "w-souligne": "doc.command.set-inline-format-underline",
  "w-barre": "doc.command.set-inline-format-strikethrough",
  "w-align-gauche": "doc.command.align-left",
  "w-align-centre": "doc.command.align-center",
  "w-align-droite": "doc.command.align-right",
  "w-align-justifie": "doc.command.align-justify",
  "w-liste-puces": "doc.command.bullet-list",
  "w-liste-numerotee": "doc.command.order-list",
  "w-style-normal": "doc.command.set-paragraph-named-style",
  "w-style-titre": "doc.command.title",
  "w-style-soustitre": "doc.command.subtitle-heading",
  "w-style-titre1": "doc.command.h1-heading",
  "w-style-titre2": "doc.command.h2-heading",
  "w-style-titre3": "doc.command.h3-heading",
  /*
   * ═══ TABLEAU : LIGNES ET COLONNES ═══
   *
   * Ces cinq commandes exigent un point d'insertion DANS UNE CELLULE — sans
   * lui, elles rendent `false` en silence. Longtemps réputées inatteignables :
   * après `create-table`, le document paraissait n'avoir plus aucune zone
   * adressable. Il n'en est rien — les cellules SONT dans le flux, chacune un
   * paragraphe encadré de caractères de contrôle (`\u001c` ouvre une cellule,
   * `\u001d` la ferme), et le texte d'origine est repoussé APRÈS le tableau.
   * Une cellule s'atteint donc par son index de paragraphe : `p0` est la
   * première cellule d'un tableau inséré en tête.
   */
  "w-ligne-dessus": "doc.command.table-insert-row-above",
  "w-ligne-dessous": "doc.command.table-insert-row-bellow",
  "w-colonne-gauche": "doc.command.table-insert-column-left",
  "w-colonne-droite": "doc.command.table-insert-column-right",
  "w-supprimer-ligne": "doc.table.delete-rows",
  "w-supprimer-colonne": "doc.table.delete-columns",
  "w-annuler": "univer.command.undo",
  "w-retablir": "univer.command.redo",
}

/**
 * `layoutType` d'Univer → nom d'habillage en français.
 *
 * Les valeurs viennent de `PositionedObjectLayoutType` : 0 aligné sur le texte,
 * 3 rapproché (carré), 6 haut et bas, 1 sans habillage — devant ou derrière le
 * texte selon `behindDoc`.
 */
const HABILLAGE_PAR_TYPE: Record<number, string> = {
  0: "aligne",
  1: "devant",
  3: "carre",
  6: "hautbas",
}

/**
 * Bouton d'habillage → style d'habillage Univer.
 *
 * ⚠️ AU NIVEAU MODULE, pas dans la fonction : `check-controles` lit les tables
 * de commandes du source pour vérifier qu'aucun bouton n'est inerte. Une table
 * enfermée dans un `if` lui est invisible, et quatre boutons parfaitement
 * câblés étaient signalés comme « sans effet ».
 */
const HABILLAGE_COMMANDE: Record<string, string> = {
  "w-habillage-aligne": "inline",
  "w-habillage-carre": "wrapSquare",
  "w-habillage-hautbas": "wrapTopAndBottom",
  "w-habillage-devant": "inFrontOfText",
}

/** Contrôles qui prennent une valeur. */
const COMMANDE_AVEC_VALEUR: Record<string, string> = {
  "w-taille": "doc.command.set-inline-format-fontsize",
  "w-police": "doc.command.set-inline-format-font-family",
  "w-couleur": "doc.command.set-inline-format-text-color",
  "w-surlignage": "doc.command.set-inline-format-text-background-color",
}

/** Commandes du moteur → observation de la surface. */
function observationDeCommande(id: string): WordObservation["kind"] | null {
  if (id === "doc.command.insert-text" || id === "doc.command.break-line" || id === "doc.command.enter") {
    return "w:textChange"
  }
  if (id === "doc.operation.set-selections") return "w:selection"
  if (id === "doc.operation.move-cursor") return "w:cursor"
  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
   LE COMPOSANT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function WordSurface({
  heightPx,
  onReady,
  onObservation,
  zonesCibles,
  className,
}: Props) {
  const conteneurRef = useRef<HTMLDivElement | null>(null)
  const ancresRef = useRef<HTMLDivElement | null>(null)

  // Les rappels sont lus depuis des refs : l'effet de montage n'a donc aucune
  // dépendance et ne se réexécute jamais. Sans cela, la saisie d'une note dans
  // le châssis recâblerait le moteur à chaque frappe.
  const onReadyRef = useRef(onReady)
  const onObsRef = useRef(onObservation)
  onReadyRef.current = onReady
  onObsRef.current = onObservation

  const zonesRef = useRef<string[]>(zonesCibles ?? [])
  zonesRef.current = zonesCibles ?? []

  const hauteurRef = useRef(heightPx)
  hauteurRef.current = heightPx

  const apiRef = useRef<WordApi | null>(null)

  useEffect(() => {
    const conteneur = conteneurRef.current
    if (!conteneur) return
    let mort = false
    const jeter: (() => void)[] = []

    const boot = async () => {
      const [
        { createUniver, LocaleType, mergeLocales },
        presetDocs,
        locale,
        engineRender,
        dessin,
        presetDessin,
        presetLien,
      ] =
        await Promise.all([
          import("@univerjs/presets"),
          import("@univerjs/preset-docs-core"),
          import("@univerjs/preset-docs-core/locales/fr-FR"),
          import("@univerjs/engine-render"),
          // Le service d'images vit ici, pas dans le moteur de rendu.
          import("@univerjs/drawing"),
          /*
           * ⚠️ SANS CE PRESET, `doc.command.insert-doc-image` N'EXISTE PAS.
           * Le preset docs-core n'embarque pas le dessin : la commande est
           * rejetée par le service de commandes avec « is not registered »,
           * message qui n'apparaît qu'en console — l'insertion échoue en
           * silence côté simulateur.
           */
          import("@univerjs/preset-docs-drawing"),
          /*
           * ⚠️ LE PRÉFIXE EST `docs.` ET NON `doc.` — c'est ce qui avait rendu
           * ces commandes invisibles à tous les relevés précédents, spike
           * compris : le balayage portait sur `doc.command.*`.
           */
          import("@univerjs/preset-docs-hyper-link"),
        ])
      if (mort) return

      const cree = createUniver({
        locale: LocaleType.FR_FR,
        locales: {
          [LocaleType.FR_FR]: mergeLocales(
            ((locale as { default?: Record<string, unknown> }).default ??
              (locale as unknown as Record<string, unknown>)) as Parameters<
              typeof mergeLocales
            >[0],
          ),
        },
        presets: [
          presetDessin.UniverDocsDrawingPreset(),
          presetLien.UniverDocsHyperLinkPreset(),
          presetDocs.UniverDocsCorePreset({
            container: conteneur,
            /*
             * La chrome native est COUPÉE : le simulateur rend son propre ruban
             * (`WordChrome`), et laisser celui d'Univer donnerait deux rubans
             * concurrents à l'apprenant.
             *
             * ⚠️ CONSÉQUENCE MESURÉE, et elle n'est pas devinable : c'est un
             * contrôleur de l'interface native qui POSE la page dans la scène.
             * Sans lui, l'objet document reste à −10000/−10000 et l'écran est
             * BLANC — sans aucune erreur, avec un canvas correctement
             * dimensionné et un modèle correctement rempli. D'où `poserPage()`
             * ci-dessous, appelée après chaque composition.
             */
            header: false,
            footer: false,
            toolbar: false,
            contextMenu: false,
          }),
        ],
      })
      const univer = cree.univer as unknown as { __getInjector?: () => { get: (t: unknown) => unknown } }
      const univerAPI = cree.univerAPI as unknown as {
        createUniverDoc: (d: unknown) => DocFacade
        disposeUnit: (id: string) => boolean
        executeCommand: (id: string, params?: unknown) => Promise<boolean>
        onCommandExecuted: (cb: (c: { id: string; params?: unknown }) => void) => { dispose?: () => void }
      }

      type DocFacade = {
        getId: () => string
        getSnapshot: () => { body: CorpsInstantane; tableSource?: Record<string, unknown> }
        setSelection: (a: number, b: number) => void
      }

      let doc: DocFacade | null = null

      /* ── Accès à la scène de rendu ────────────────────────────────────── */

      /**
       * L'injecteur EST atteignable, et `IRenderManagerService` s'y résout.
       * Le spike concluait l'inverse : c'était un problème d'accès, pas un
       * verrou du moteur. Sans lui, ni géométrie, ni page posée, ni halo.
       */
      /**
       * Poser une image dans le document, depuis un data URI.
       *
       * `argument` vaut « id|dataURI ». L'identifiant sert de nom au dessin :
       * une étape peut ensuite le viser pour l'habillage ou la suppression.
       */
      const insererImage = async (argument: string) => {
        const sep = argument.indexOf("|")
        if (sep < 0) return
        const id = argument.slice(0, sep)
        const source = argument.slice(sep + 1)
        if (!doc) return

        // Mesurer l'image avant de la poser : sans dimensions réelles, le
        // dessin est inséré avec une boîte nulle et reste invisible.
        const taille = await new Promise<{ w: number; h: number } | null>((resoudre) => {
          const img = new Image()
          img.onload = () => resoudre({ w: img.naturalWidth, h: img.naturalHeight })
          img.onerror = () => resoudre(null)
          img.src = source
        })
        if (!taille) return

        // Réduire pour tenir dans la page — 480 px de large au maximum.
        const k = taille.w > 480 ? 480 / taille.w : 1
        const largeur = Math.round(taille.w * k)
        const hauteur = Math.round(taille.h * k)

        try {
          const injector = univer.__getInjector?.()
          const ioService = injector?.get(dessin.IImageIoService) as
            | { addImageSourceCache?: (id: string, type: string, image: unknown) => void }
            | undefined
          const img = new Image()
          img.src = source
          ioService?.addImageSourceCache?.(id, "BASE64", img)
        } catch {
          /* le cache est un confort de rendu : son absence ne doit pas casser
             l'insertion, seulement l'affichage immédiat */
        }

        const unitId = doc.getId()
        const transform = { left: 0, top: 0, width: largeur, height: hauteur, angle: 0 }
        await univerAPI.executeCommand("doc.command.insert-doc-image", {
          unitId,
          drawings: [
            {
              unitId,
              subUnitId: unitId,
              drawingId: id,
              drawingType: 0, // DrawingTypeEnum.DRAWING_IMAGE
              imageSourceType: "BASE64",
              source,
              transform,
              docTransform: {
                size: { width: largeur, height: hauteur },
                positionH: { relativeFrom: 0, posOffset: 0 },
                positionV: { relativeFrom: 0, posOffset: 0 },
                angle: 0,
              },
              behindDoc: 0,
              title: "",
              description: "",
              layoutType: 0, // INLINE
              wrapText: 0, // BOTH_SIDES
              distB: 0,
              distL: 0,
              distR: 0,
              distT: 0,
            },
          ],
        })
        planifierEtat()
      }

      const objetDocument = () => {
        try {
          const injector = univer.__getInjector?.()
          if (!injector) return null
          const rms = injector.get(engineRender.IRenderManagerService) as {
            getRenderById: (id: string) => { scene?: SceneLike } | null
          }
          const rendu = doc ? rms.getRenderById(doc.getId()) : null
          const scene = rendu?.scene
          if (!scene) return null
          const objets = scene.getAllObjectsByOrder?.() ?? []
          // ⚠️ DEUX objets exposent `getSkeleton` : le FOND et le DOCUMENT.
          // Prendre le premier venu donne un squelette sans aucun glyphe — et
          // l'on conclut à tort que la géométrie est impossible.
          const documents = objets.find((o) => o.oKey === "__Document_Render_Main__")
          return documents ? { scene, documents } : null
        } catch {
          return null
        }
      }

      type SceneLike = {
        getAllObjectsByOrder?: () => ObjetScene[]
        transformByState: (s: { width: number; height: number }) => void
        scale?: (x: number, y: number) => void
        makeDirty: (b: boolean) => void
        getViewports?: () => { actualScrollX?: number; actualScrollY?: number }[]
      }
      type ObjetScene = {
        oKey?: string
        left?: number
        top?: number
        width?: number
        height?: number
        transformByState: (s: { left: number; top: number }) => void
        getSkeleton?: () => SqueletteLike
      }
      type NoeudSquelette = {
        left?: number
        top?: number
        width?: number
        height?: number
        lineHeight?: number
        parent?: NoeudSquelette
      }
      type SqueletteLike = {
        findNodeByCharIndex?: (i: number) => NoeudSquelette | undefined
        getSkeletonData?: () => { pages?: { marginLeft?: number; marginTop?: number }[] }
      }

      /** Marge du cadre autour de la page, en pixels. */
      const MARGE_H = 24
      const MARGE_V = 16

      /**
       * Pose la page dans la scène et l'y centre.
       *
       * C'est ce que faisait le contrôleur de la chrome native. Le faire
       * nous-mêmes n'est pas un pis-aller : cela nous rend maîtres du cadrage,
       * ce qu'un atelier pédagogique veut de toute façon.
       */
      const poserPage = () => {
        const o = objetDocument()
        if (!o) return
        const largeurVue = conteneur.clientWidth
        const largeurDoc = o.documents.width ?? 794

        /*
         * ZOOM POUR TENIR DANS LA LARGEUR — sans quoi le téléphone est
         * inutilisable.
         *
         * Une page A4 fait 794 px ; un iPhone en fait 390. Le chapitre se JOUAIT
         * quand même — 6 étapes sur 6, aucun débordement du document — mais la
         * capture montrait un titre coupé au milieu d'un mot, l'apprenant ne
         * voyant qu'un fragment de sa page. Un tableur s'adapte à l'écran, une
         * page A4 non : il faut la mettre à l'échelle, exactement comme le fait
         * le zoom d'un vrai traitement de texte.
         *
         * Plancher à 0,4 : en deçà, le texte devient illisible et il vaut mieux
         * laisser défiler.
         */
        const dispo = Math.max(120, largeurVue - 2 * MARGE_H)
        const echelle = Math.min(1, Math.max(0.4, dispo / largeurDoc))
        if (typeof o.scene.scale === "function") o.scene.scale(echelle, echelle)

        const largeurAffichee = largeurDoc * echelle
        const gauche = Math.max(MARGE_H, Math.round((largeurVue - largeurAffichee) / 2)) / echelle
        o.scene.transformByState({
          width: Math.max(largeurVue, largeurAffichee + 2 * MARGE_H) / echelle,
          height: ((o.documents.height ?? 0) + 2 * MARGE_V),
        })
        o.documents.transformByState({ left: gauche, top: MARGE_V })
        o.scene.makeDirty(true)
        echelleRef.current = echelle
      }

      /** Échelle courante — la géométrie doit en tenir compte, sinon le halo
       *  et les gestes pilotés tombent à côté dès qu'on zoome. */
      const echelleRef = { current: 1 }

      /* ── Lecture du modèle ────────────────────────────────────────────── */

      /*
       * 🔴 `tableSource` VIT À LA RACINE DU DOCUMENT, PAS DANS LE CORPS.
       *
       * `create-table` l'écrit par `jsonX.insertOp(["tableSource", id], …)` —
       * un chemin racine, frère de `body`. Lire `getSnapshot().body` seul ne le
       * trouve donc JAMAIS : le tableau se dessinait bien dans la page, et
       * `lireTableaux` rendait une liste vide. L'étape refusait un geste
       * parfaitement accompli, ce qui est le pire refus possible.
       */
      const corps = (): CorpsInstantane => {
        const snap = doc?.getSnapshot() as
          | { body?: CorpsInstantane; tableSource?: Record<string, unknown> }
          | undefined
        if (!snap?.body) return {}
        return { ...snap.body, tableSource: snap.tableSource } as CorpsInstantane
      }
      const paragraphes = (): ParagrapheLu[] => lireParagraphes(corps())

      /**
       * Les liens du document.
       *
       * ⚠️ Un lien n'est pas un attribut de caractère : c'est une PLAGE
       * PERSONNALISÉE (`customRanges`) de type `HYPERLINK`, posée dans le corps.
       * La chercher dans `textRuns` ne rend jamais rien.
       */
      const lireLiens = (): { id: string; url: string; texte: string }[] => {
        const c = corps() as {
          dataStream?: string
          customRanges?: {
            rangeId?: string
            rangeType?: number | string
            startIndex?: number
            endIndex?: number
            properties?: { url?: string }
          }[]
        }
        const flux = c.dataStream ?? ""
        return (c.customRanges ?? [])
          .filter((r) => r.properties?.url)
          .map((r) => ({
            id: String(r.rangeId ?? ""),
            url: String(r.properties?.url ?? ""),
            texte: flux.slice(r.startIndex ?? 0, (r.endIndex ?? 0) + 1),
          }))
      }

      /** Les images posées, dans l'ordre du document. */
      const lireImages = (): { id: string; habillage: string }[] => {
        const snap = doc?.getSnapshot() as
          | {
              drawings?: Record<string, { drawingId?: string; layoutType?: number }>
              drawingsOrder?: string[]
            }
          | undefined
        const ordre = snap?.drawingsOrder ?? []
        const dess = snap?.drawings ?? {}
        return ordre
          .map((id) => {
            const d = dess[id]
            if (!d) return null
            return { id, habillage: HABILLAGE_PAR_TYPE[d.layoutType ?? 0] ?? "aligne" }
          })
          .filter((x): x is { id: string; habillage: string } => x !== null)
      }

      const lireEtat = (zones?: string[]) => {
        const c = corps()
        const p = lireParagraphes(c)
        const formats: Record<string, ReturnType<typeof lireFormat>> = {}
        for (const z of zones ?? zonesRef.current) {
          const plage = resoudreZone(z, p)
          if (plage) formats[z] = lireFormat(c, plage)
        }
        return {
          kind: "w:docState" as const,
          paragraphes: p.map(
            ({ texte, style, alignement, liste }): WordParagrapheObserve => ({
              texte,
              style,
              alignement,
              liste,
            }),
          ),
          formats,
          /*
           * Les images du document — identifiant et habillage.
           *
           * ⚠️ Comme `tableSource`, `drawings` vit à la RACINE du snapshot, pas
           * dans `body`. Le lire au mauvais endroit rend une liste vide alors
           * que l'image est visible à l'écran : l'étape refuserait un geste
           * parfaitement accompli, le pire refus possible.
           */
          images: lireImages(),
          /** Les liens hypertexte posés dans le corps. */
          liens: lireLiens(),
          tableaux: lireTableaux(c),
        }
      }

      /* ── Émission des observations ────────────────────────────────────── */

      let minuteurEtat: ReturnType<typeof setTimeout> | null = null
      /**
       * ⚠️ L'état ne se lit JAMAIS au moment où le moteur signale un
       * changement : la composition n'est pas finie et l'on relit des valeurs
       * périmées. Côté Excel, cela faisait échouer PAR INTERMITTENCE des étapes
       * justes — le pire type de défaut, parce qu'il n'est pas reproductible.
       */
      const planifierEtat = () => {
        if (minuteurEtat) clearTimeout(minuteurEtat)
        minuteurEtat = setTimeout(() => {
          if (mort) return
          onObsRef.current?.(lireEtat())
          poserPage()
          placerAncres()
        }, 320)
      }

      const derniereSelection = { debut: -1, fin: -1 }

      const abonnement = univerAPI.onCommandExecuted((cmd) => {
        if (mort || !doc) return
        const kind = observationDeCommande(cmd.id)
        if (!kind) return

        if (kind === "w:selection") {
          // 🔴 LA SÉLECTION VIENT DES PARAMÈTRES DE LA COMMANDE, pas d'un
          // service résolu par son nom.
          //
          // Première version : `injector.get("docs.doc-selection-manager.service")`.
          // Univer identifie ses services par un OBJET-fonction, pas par une
          // chaîne : la recherche échouait, le `catch` la rendait muette, et
          // AUCUNE observation ne partait — l'apprenant sélectionnait
          // parfaitement le titre et rien ne se passait. C'était deviner au lieu
          // de mesurer, sur le seul point où le spike avait déjà la réponse :
          // `doc.operation.set-selections` PORTE ses plages.
          const plage = plageDeCommande(cmd)
          if (!plage) return
          if (plage.debut === derniereSelection.debut && plage.fin === derniereSelection.fin) return
          derniereSelection.debut = plage.debut
          derniereSelection.fin = plage.fin
          const c = corps()
          const flux = c.dataStream ?? ""
          if (plage.debut === plage.fin) {
            onObsRef.current?.({ kind: "w:cursor", position: plage.debut })
          } else {
            onObsRef.current?.({
              kind: "w:selection",
              plage,
              texte: flux.slice(plage.debut, plage.fin),
              // La structure part AVEC l'observation : le juge est pur et
              // tourne aussi côté serveur, il n'a pas le document sous la main
              // pour résoudre une zone comme `p1:mot3`.
              paragraphes: lireEtat().paragraphes,
            })
          }
          return
        }

        if (kind === "w:textChange") {
          const p = paragraphes()
          const sel = selectionCourante()
          const i = sel ? p.findIndex((x) => sel.debut >= x.debut && sel.debut <= x.fin) : -1
          onObsRef.current?.({
            kind: "w:textChange",
            paragraphe: i >= 0 ? p[i].texte : undefined,
            indexParagraphe: i >= 0 ? i : undefined,
          })
        }

        if (kind === "w:cursor") {
          const sel = selectionCourante()
          if (sel) onObsRef.current?.({ kind: "w:cursor", position: sel.debut })
        }

        planifierEtat()
      })
      if (abonnement?.dispose) jeter.push(() => abonnement.dispose?.())

      /**
       * La plage portée par une commande de sélection.
       *
       * Mesuré : `doc.operation.set-selections` remonte
       * `params.ranges[0] = { startOffset, endOffset, collapsed, rangeType,
       * startNodePosition }`. C'est la source la plus sûre — elle vient du
       * moteur lui-même, au moment exact du geste.
       */
      const plageDeCommande = (cmd: { params?: unknown }): WordPlage | null => {
        const p = cmd.params as
          | { ranges?: { startOffset?: number; endOffset?: number }[]; textRanges?: { startOffset?: number; endOffset?: number }[] }
          | undefined
        const r = p?.ranges?.[0] ?? p?.textRanges?.[0]
        if (!r || r.startOffset === undefined || r.endOffset === undefined) return null
        const plage = {
          debut: Math.min(r.startOffset, r.endOffset),
          fin: Math.max(r.startOffset, r.endOffset),
        }
        memoireSelection.debut = plage.debut
        memoireSelection.fin = plage.fin
        return plage
      }

      /**
       * Dernière position connue du curseur.
       *
       * Une commande de SAISIE ne porte pas la sélection : il faut donc se
       * souvenir de la dernière que l'on a vue pour savoir dans quel paragraphe
       * l'apprenant vient d'écrire.
       */
      const memoireSelection: WordPlage = { debut: 0, fin: 0 }
      const selectionCourante = (): WordPlage | null =>
        memoireSelection.fin >= memoireSelection.debut ? { ...memoireSelection } : null

      /* ── Raccourcis clavier — aucun n'est natif ───────────────────────── */

      const surTouche = (e: KeyboardEvent) => {
        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
        const cle = `ctrl+${e.key.toLowerCase()}`
        const commande = RACCOURCIS_CABLES[cle]
        if (!commande) return
        e.preventDefault()
        e.stopPropagation()
        void univerAPI.executeCommand(commande, {})
        onObsRef.current?.({ kind: "w:key", touches: ["Ctrl", e.key.toUpperCase()] })
        planifierEtat()
      }
      // En capture : le moteur pose ses propres écouteurs sur le
      // `contenteditable` invisible, et sans capture on passerait après lui.
      document.addEventListener("keydown", surTouche, true)
      jeter.push(() => document.removeEventListener("keydown", surTouche, true))

      /* ── Ancres invisibles : le seul moyen de désigner du texte ───────── */

      /**
       * Univer rend sur canvas : aucun élément de DOM ne correspond à un mot.
       * On pose donc, au-dessus du canvas, une ancre par zone que l'étape
       * courante désigne, positionnée par notre propre géométrie. Le halo
       * d'aide et « Montrez-moi » y accrochent leurs cibles `dom`, sans qu'il
       * ait fallu inventer une variante de cible dans `demonstration.ts`, qui
       * est gelé.
       *
       * ⚠️ `pointer-events: none` — une surface décorative superposée qui avale
       * les clics, c'est le défaut qui faisait échouer 4 scénarios Excel sur 6
       * à l'étape SUIVANT une réussite.
       */
      const placerAncres = () => {
        const hote = ancresRef.current
        if (!hote) return
        const voulues = zonesRef.current
        hote.replaceChildren()
        for (const zone of voulues) {
          const r = getPlageRect(zone)
          if (!r) continue
          const d = document.createElement("div")
          d.setAttribute("data-word-zone", zone)
          d.style.cssText = `position:absolute;pointer-events:none;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`
          hote.appendChild(d)
        }
      }

      const getPlageRect = (zone: string) => {
        const o = objetDocument()
        if (!o || !doc) return null
        const sk = o.documents.getSkeleton?.()
        if (!sk?.findNodeByCharIndex) return null
        const plage = resoudreZone(zone, paragraphes())
        if (!plage || plage.fin <= plage.debut) return null

        const cumul = (n: NoeudSquelette | undefined) => {
          let x = 0
          let y = 0
          let cur = n
          let garde = 0
          while (cur && garde++ < 12) {
            x += cur.left ?? 0
            y += cur.top ?? 0
            cur = cur.parent
          }
          return { x, y }
        }
        const nd = sk.findNodeByCharIndex(plage.debut)
        const nf = sk.findNodeByCharIndex(plage.fin - 1)
        if (!nd || !nf) return null
        const a = cumul(nd)
        const b = cumul(nf)
        const page = sk.getSkeletonData?.().pages?.[0]
        // Les marges de page ne sont pas des `left`/`top` de nœud : elles
        // s'ajoutent au-dessus du cumul du squelette.
        const ox = (o.documents.left ?? 0) + (page?.marginLeft ?? 0)
        const oy = (o.documents.top ?? 0) + (page?.marginTop ?? 0)
        const vp = o.scene.getViewports?.()?.[0]
        const sx = vp?.actualScrollX ?? 0
        const sy = vp?.actualScrollY ?? 0
        const hauteur = nd.parent?.parent?.lineHeight ?? nd.height ?? 20
        const largeur = Math.max(b.x + (nf.width ?? 0) - a.x, 4)
        // ⚠️ L'échelle s'applique à TOUT : oublier de la répercuter ferait
        // tomber le halo et les gestes pilotés à côté du texte dès que la page
        // est réduite pour tenir dans un téléphone.
        const k = echelleRef.current
        return {
          left: (ox + a.x - sx) * k,
          top: (oy + a.y - sy) * k,
          width: (a.y === b.y ? largeur : Math.max(largeur, 40)) * k,
          height: hauteur * k,
        }
      }

      /* ── Poser un document ────────────────────────────────────────────── */

      /**
       * Remplace le document.
       *
       * 🔴 SEULE VOIE POSSIBLE : la façade n'écrit pas de texte (`insertText`,
       * `appendText` renvoient `true` et ne changent rien, avec ou sans focus,
       * mesuré). On dispose donc de l'unité et on la recrée — vérifié à l'écran,
       * la page se repeint et le moteur ne lève rien. Univer réattribue le même
       * identifiant d'unité.
       */
      const applyDocument = (etat: WordDocumentState) => {
        try {
          if (doc) univerAPI.disposeUnit(doc.getId())
        } catch {
          /* rien : une unité déjà disparue n'est pas une erreur */
        }
        const page = etat.page ?? {}
        doc = univerAPI.createUniverDoc({
          body: corpsUniver(etat),
          /*
           * 🔴 OBLIGATOIRE, MÊME VIDE. `doc.command.create-table` écrit dans
           * `tableSource` par une opération d'INSERTION JSON : sur un chemin
           * absent, elle lève « Cannot insert into missing item », le tableau
           * ne se pose pas et rien n'indique le chemin fautif. Deux accolades
           * vides suffisent — et c'est ce qui rendait tout le module « Les
           * tableaux » injouable.
           */
          tableSource: {},
          /*
           * 🔴 OBLIGATOIRE, MÊME VIDES — et c'est LE MÊME PIÈGE QUE
           * `tableSource`, rencontré une seconde fois.
           *
           * `doc.command.insert-doc-image` écrit dans `drawings` et
           * `drawingsOrder` par une opération d'INSERTION JSON : sur un chemin
           * absent, elle lève « Cannot insert into missing item ». L'image ne
           * se pose pas, et le message ne dit rien du chemin fautif.
           *
           * RÈGLE GÉNÉRALE À RETENIR : tout conteneur racine d'un snapshot
           * Univer doit exister à la création, même vide. Un objet manquant ne
           * se crée pas tout seul au premier usage.
           */
          drawings: {},
          drawingsOrder: [],
          documentStyle: {
            // 🔴 OBLIGATOIRE. Le défaut (2) produit un document SANS PAGE,
            // façon Google Docs : ni feuille A4, ni marques de marges. Ce n'est
            // pas un détail d'apparence — un cours Word enseigne la page.
            documentFlavor: 1,
            pageSize:
              page.orientation === "paysage"
                ? { width: 1123, height: 794 }
                : { width: 794, height: 1123 },
            marginTop: page.margeHaut ?? 72,
            marginBottom: page.margeBas ?? 72,
            marginLeft: page.margeGauche ?? 90,
            marginRight: page.margeDroite ?? 90,
          },
        }) as DocFacade
        derniereSelection.debut = -1
        derniereSelection.fin = -1
        // La composition n'est pas instantanée : poser la page trop tôt la
        // placerait contre un squelette encore vide.
        setTimeout(() => {
          if (mort) return
          poserPage()
          placerAncres()
        }, 60)
        setTimeout(() => {
          if (mort) return
          poserPage()
          placerAncres()
        }, 320)
      }

      /* ── L'interface offerte au simulateur ────────────────────────────── */

      const api: WordApi = {
        applyDocument,
        setSelection: (zone) => {
          const plage = resoudreZone(zone, paragraphes())
          if (!plage || !doc) return false
          doc.setSelection(plage.debut, plage.fin)
          return true
        },
        lireEtat,
        getPlageRect,
        executer: (controle, argument) => {
          const simple = COMMANDE_PAR_CONTROLE[controle]
          if (simple) {
            void univerAPI.executeCommand(simple, {})
            planifierEtat()
            return true
          }
          const avecValeur = COMMANDE_AVEC_VALEUR[controle]
          if (avecValeur && argument !== undefined) {
            /*
             * D15 — retirer un surlignage. `null` est la seule valeur que la
             * commande de couleur de fond interprète comme « plus de fond » ;
             * une chaîne vide serait posée telle quelle comme couleur.
             */
            const v =
              argument === "aucune"
                ? null
                : /^\d+$/.test(argument)
                ? Number(argument)
                : argument
            void univerAPI.executeCommand(avecValeur, { value: v })
            planifierEtat()
            return true
          }
          /*
           * Remplacer un mot par un autre — le geste du correcteur.
           *
           * `argument` vaut « ancien→nouveau ». On pose la sélection sur le mot
           * fautif puis on la remplace : c'est exactement ce que fait Word quand
           * on accepte une suggestion, et `replace-selection` est la seule
           * commande du moteur qui écrit sans passer par la frappe.
           */
          if (controle === "w-corriger-mot" && argument) {
            const [ancien, nouveau] = argument.split("→")
            if (!ancien || nouveau === undefined || !doc) return false
            const plage = resoudreZone(`texte:${ancien}`, paragraphes())
            if (!plage) return false
            doc.setSelection(plage.debut, plage.fin)
            /*
             * ⚠️ `unitId` EST OBLIGATOIRE. Le gestionnaire de
             * `replace-selection` fait `getUnit(unitId)` et rend `false` sans
             * rien dire si l'unité est introuvable : le panneau se comportait
             * normalement, le document ne changeait pas, et aucune erreur
             * n'apparaissait en console.
             */
            void univerAPI.executeCommand("doc.command.replace-selection", {
              unitId: doc.getId(),
              body: { dataStream: nouveau, textRuns: [] },
            })
            planifierEtat()
            return true
          }
          /*
           * ═══ INSÉRER UNE IMAGE ═══
           *
           * Le chemin normal d'Univer est INATTEIGNABLE depuis un simulateur :
           * `insert-doc-image` et `insert-float-image` appellent tous deux
           * `insertDocImage()`, qui ouvre un SÉLECTEUR DE FICHIER NATIF puis
           * confie le fichier à `IImageIoService.saveImage()` — un service
           * d'UPLOAD. Aucune des deux ne prend de paramètre.
           *
           * Mais la commande sous-jacente, elle, en prend : `insert-doc-image`
           * accepte `{ unitId, drawings }`. On construit donc le descripteur
           * nous-mêmes à partir d'un data URI, exactement comme le fait
           * `_insertFloatImages` après l'upload. Aucun réseau, aucun sélecteur.
           *
           * ⚠️ `addImageSourceCache` est OBLIGATOIRE : sans lui le descripteur
           * est bien inséré dans le modèle, mais le moteur n'a aucune source à
           * peindre — le document se réserve la place et n'affiche rien.
           */
          /*
           * L'habillage — le vrai sujet du métier. `argument` porte
           * l'identifiant du dessin ; le style vient du bouton pressé.
           */
          const style = HABILLAGE_COMMANDE[controle]
          if (style && argument && doc) {
            void univerAPI.executeCommand("doc.command.update-doc-drawing-wrapping-style", {
              unitId: doc.getId(),
              subUnitId: doc.getId(),
              drawings: [{ unitId: doc.getId(), subUnitId: doc.getId(), drawingId: argument }],
              wrappingStyle: style,
            })
            planifierEtat()
            return true
          }
          if (controle === "w-supprimer-image" && argument && doc) {
            /*
             * ⚠️ `delete-drawing` ne prend AUCUN paramètre : il supprime les
             * dessins qui ont le FOCUS, c'est-à-dire ceux que l'apprenant a
             * sélectionnés à la souris sur le canvas — inatteignable
             * programmatiquement. C'est `remove-doc-image` qui accepte une
             * liste de dessins, et c'est donc elle qu'il faut ici.
             */
            void univerAPI.executeCommand("doc.command.remove-doc-image", {
              unitId: doc.getId(),
              drawings: [{ unitId: doc.getId(), subUnitId: doc.getId(), drawingId: argument }],
            })
            planifierEtat()
            return true
          }
          /*
           * ═══ LIEN HYPERTEXTE ═══
           *
           * `argument` vaut l'adresse. Le lien s'applique à la SÉLECTION
           * courante : une étape doit donc faire sélectionner le texte avant.
           * Sans sélection, la commande n'a rien à envelopper et rend `false`.
           */
          if (controle === "w-inserer-lien" && argument && doc) {
            void univerAPI.executeCommand("docs.command.add-hyper-link", {
              unitId: doc.getId(),
              payload: argument,
            })
            planifierEtat()
            return true
          }
          if (controle === "w-retirer-lien" && doc) {
            const liens = lireLiens()
            const dernier = liens[liens.length - 1]
            if (!dernier) return false
            void univerAPI.executeCommand("docs.command.delete-hyper-link", {
              unitId: doc.getId(),
              linkId: dernier.id,
            })
            planifierEtat()
            return true
          }
          if (controle === "w-inserer-image" && argument) {
            void insererImage(argument)
            return true
          }
          if (controle === "w-inserer-tableau" && argument) {
            const m = /^(\d+)x(\d+)$/.exec(argument)
            if (m) {
              void univerAPI.executeCommand("doc.command.create-table", {
                rowCount: Number(m[1]),
                colCount: Number(m[2]),
              })
              planifierEtat()
              return true
            }
          }
          // Rien n'a pu être fait : l'appelant émettra `w:control`, de sorte que
          // l'apprenant reçoive un message au lieu d'un silence.
          return false
        },
        /**
         * Replace les ancres des zones désignées.
         *
         * 🔴 Appelée quand l'ÉTAPE change de zone. Les ancres n'étaient
         * replacées qu'au changement d'état du document ou de taille de la
         * fenêtre : en passant d'une étape visant `p0` à une étape visant `p1`,
         * l'ancre restait donc sur le paragraphe précédent. Tout ce qui s'appuie
         * dessus — halo d'aide, « Montrez-moi », pilotage en test — désignait le
         * mauvais endroit, sans la moindre erreur.
         */
        replacerAncres: () => placerAncres(),
        focus: () => {
          const cible =
            conteneur.querySelector<HTMLElement>("[contenteditable='true']") ??
            conteneur.querySelector<HTMLElement>("canvas") ??
            conteneur
          cible.focus?.()
        },
        pret: () => doc !== null,
      }
      apiRef.current = api

      // Document vide par défaut : le player posera le vrai état à la première
      // étape. Monter à vide plutôt que rien évite un écran gris au chargement.
      applyDocument({ paragraphes: [{ texte: "" }] })

      /* ── La barre flottante native ────────────────────────────────────── */

      /**
       * Univer affiche une barre de mise en forme flottante dès qu'une sélection
       * existe. Elle est rendue HORS de notre conteneur (mesuré : 26 nœuds dans
       * l'hôte, aucun candidat), donc un CSS local ne l'atteint pas — et elle
       * ferait double emploi avec notre ruban, en anglais partiel et avec des
       * boutons que le scénario n'attend pas.
       *
       * On la neutralise de façon CIBLÉE et RÉVERSIBLE : seuls les éléments de
       * premier niveau du corps dont la classe porte « univer » et qui ne
       * contiennent pas notre atelier sont masqués, et l'état est restauré au
       * démontage.
       */
      const masques: { el: HTMLElement; avant: string }[] = []
      /**
       * ⚠️ Elle n'est PAS un enfant direct du corps, et une première version qui
       * ne regardait que ceux-là ne l'a jamais trouvée — le contrôle disait
       * « aucun candidat » pendant qu'elle s'affichait à l'écran. Elle n'apparaît
       * d'ailleurs QUE sur une sélection à la souris : une sonde qui sélectionne
       * par l'API ne la voit pas non plus. Deux raisons de regarder la capture
       * plutôt que le compteur.
       */
      const masquerFlottantes = () => {
        const candidats = document.querySelectorAll<HTMLElement>(
          '[class*="univer"],[data-u-comp],[id*="univer"]',
        )
        for (const el of Array.from(candidats)) {
          if (el.contains(conteneur) || conteneur.contains(el)) continue
          const cs = getComputedStyle(el)
          if (cs.position !== "absolute" && cs.position !== "fixed") continue
          const r = el.getBoundingClientRect()
          // Seuil BAS : la grande barre de mise en forme n'est pas la seule —
          // Univer pose aussi une petite poignée de paragraphe, restée visible
          // sur la capture finale pendant que le compteur disait « masqué ».
          // Rien de dangereux à descendre le seuil : le canvas et tout notre
          // atelier sont exclus juste au-dessus.
          if (r.width < 20 || r.height < 14) continue
          if (masques.some((m) => m.el === el)) continue
          masques.push({ el, avant: el.style.display })
          el.style.display = "none"
        }
      }
      const observateur = new MutationObserver(masquerFlottantes)
      observateur.observe(document.body, { childList: true, subtree: true })
      // Une sélection à la souris la fait apparaître sans muter le corps : on
      // repasse aussi après chaque relâchement de souris.
      const surSouris = () => setTimeout(masquerFlottantes, 30)
      document.addEventListener("mouseup", surSouris, true)
      jeter.push(() => document.removeEventListener("mouseup", surSouris, true))
      jeter.push(() => {
        observateur.disconnect()
        for (const m of masques) m.el.style.display = m.avant
      })

      /* ── Redimensionnement ────────────────────────────────────────────── */

      const surTaille = () => {
        poserPage()
        placerAncres()
      }
      const ro = new ResizeObserver(surTaille)
      ro.observe(conteneur)
      jeter.push(() => ro.disconnect())

      onReadyRef.current?.(api)
    }

    boot().catch((e) => {
      // Un échec de montage doit être BRUYANT : un atelier muet ressemble à un
      // atelier vide, et l'on cherche alors le défaut dans le contenu.
      // eslint-disable-next-line no-console
      console.error("[WordSurface] montage impossible", e)
    })

    return () => {
      mort = true
      for (const f of jeter) {
        try {
          f()
        } catch {
          /* rien */
        }
      }
    }
    // Effet de montage SANS dépendance : voir la règle 2 en tête de fichier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Les ancres suivent les zones de l'étape courante.
   *
   * Deux temps : tout de suite, puis après 260 ms. La composition d'un document
   * n'est pas instantanée — un style de titre change la hauteur des lignes, donc
   * la position de tout ce qui suit — et une ancre posée trop tôt tomberait à
   * l'ancienne place.
   */
  useEffect(() => {
    const poser = () => apiRef.current?.replacerAncres()
    poser()
    const t = window.setTimeout(poser, 260)
    return () => window.clearTimeout(t)
  }, [zonesCibles])

  return (
    <div
      // 🔴 HAUTEUR DÉFINIE, en style inline. Un moteur canvas sous un parent en
      // hauteur automatique rend un canvas de taille nulle SANS lever la
      // moindre erreur — l'écran reste blanc et tous les compteurs sont verts.
      style={{ height: heightPx, width: "100%", position: "relative" }}
      className={className}
    >
      <div ref={conteneurRef} style={{ position: "absolute", inset: 0 }} />
      <div
        ref={ancresRef}
        data-word-ancres
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
    </div>
  )
}

export { attributsDeFormat }
