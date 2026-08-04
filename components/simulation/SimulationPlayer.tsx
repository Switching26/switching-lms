"use client"

/**
 * Le simulateur, vu par l'apprenant.
 *
 * Il assemble l'habillage Excel, la grille, la barre de consigne, et surtout il
 * arbitre : à chaque geste il demande à `validateStep` si c'était le bon, avance
 * ou signale l'erreur, et fait remonter la progression au serveur.
 *
 * Trois choix pédagogiques sont câblés ici, et ils viennent de l'analyse des
 * 2 748 étapes de la formation de référence :
 *
 *  - En LEÇON, la cible est montrée d'emblée (halo). En EXERCICE, l'aide existe
 *    mais se demande. En ÉVALUATION, il n'y a pas d'aide.
 *  - Une mauvaise action ne fait pas perdre l'étape : on explique et on laisse
 *    réessayer. Seule la réussite AU PREMIER ESSAI compte pour la note, ce qui
 *    distingue une évaluation d'un exercice.
 *  - Le nombre d'erreurs et d'aides ouvertes est journalisé. C'est ce qui donne au
 *    formateur une vision réelle des difficultés, là où une vidéo ne dit rien.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { GridApi } from "./ExcelGrid"
import SimulationChrome, { SimulationFooter } from "./SimulationChrome"
import { BoiteFonction, BoiteFormatCellule } from "./BoiteExcel"
import {
  cibleDemonstration,
  natureEtape,
  reponseAttendue,
  resumerAttendu,
  resumerFait,
} from "@/lib/simulation/attendu"
import {
  MOTIF_PAR_FAMILLE,
  cellulesHorsEtatAplomb,
  cellulesLues,
  cellulesParasites,
  divergences,
  etatAplomb,
  famillesLegitimes,
  phraseAplomb,
  refsConnues,
  refsDeLaZone,
  zoneClasseur,
  type Divergence,
  type LectureCellule,
} from "@/lib/simulation/aplomb"
import DesktopLayer from "./DesktopLayer"
import AfficheModule, { numeroModule } from "./AfficheModule"
import DemonstrationGeste, { type Rect } from "./DemonstrationGeste"
import AtelierShell, { type EntreeSommaire } from "./AtelierShell"
import {
  useAideProgressive,
  useMesureZoneTravail,
  usePersistance,
  useProgression,
  useRetourVisuel,
  type RectCible,
} from "./hooks/useAtelier"
import BilanFin from "./BilanFin"
import type { BilanPublie } from "@/lib/simulation/bilan"
import type { LearnerDocument } from "@/lib/learner-files"

/**
 * Clé stable d'une cible de démonstration, pour la trace d'audit hors
 * production. Deux gestes qui visent le même endroit partagent la même clé :
 * c'est voulu, la question posée est « ce repère a-t-il été dessiné ? ».
 */
function cleCible(c: CibleDemo): string {
  return c.k === "cellule" || c.k === "plage" ? `${c.k}:${c.ref}`
    : c.k === "enteteColonne" ? `col:${c.col}`
    : c.k === "enteteLigne" ? `ligne:${c.ligne}`
    : c.k === "dom" ? `dom:${c.sel}`
    : "clavier"
}

/** Copie défensive : une démonstration doit pouvoir revenir exactement à
 * l'entrée de l'étape, même si un premier passage a ajouté un fichier ou
 * modifié une collection du poste. */
function clonerPoste(p: PosteState): PosteState {
  return {
    ...p,
    fichiers: p.fichiers.map((f) => ({ ...f })),
    apps: p.apps.map((a) => ({ ...a })),
    modeles: p.modeles.map((m) => ({ ...m })),
  }
}

/**
 * Clique un élément comme le ferait un vrai doigt — et sur N'IMPORTE QUEL
 * élément.
 *
 * ⚠️ `el.click()` n'existe que sur `HTMLElement`. Les éléments d'un graphique
 * sont des nœuds **SVG** : l'appel levait « el.click is not a function » au beau
 * milieu de la phase de validation du geste, la séquence s'arrêtait là et la
 * démonstration ne se terminait jamais — quatre chapitres du module 17 restaient
 * bloqués sans marqueur de fin, sans un mot à l'écran.
 *
 * On émet donc la séquence complète en `MouseEvent`/`PointerEvent`, qui vaut
 * pour tout `Element`. Le `pointerdown` n'est pas décoratif : le volet des
 * champs du tableau croisé arme sa puce là-dessus, et sans lui le clic suivant
 * sur la zone de dépôt ne déposait rien.
 */
function cliquerElement(el: Element): void {
  const opts = { bubbles: true, cancelable: true, composed: true, view: window }
  try {
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, isPrimary: true }))
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1, isPrimary: true }))
    el.dispatchEvent(new MouseEvent("click", opts))
  } catch {
    /* un moteur sans PointerEvent : le clic simple suffit */
    try {
      el.dispatchEvent(new MouseEvent("click", opts))
    } catch {
      /* on ne casse jamais la leçon pour un geste de démonstration */
    }
  }
}

/** Contenu d'une cellule dans un cliché, déjà à la forme qu'attend `applyCells`. */
type CelluleCliche = { f?: string; v?: unknown }

/**
 * LE CLICHÉ DE DÉPART D'UNE DÉMONSTRATION.
 *
 * POURQUOI IL EXISTE
 * Le correctif du 03/08/2026 (`2987e3a`) a établi le bon principe — « une
 * démonstration est une reconstitution, pas la poursuite de la précédente » —
 * mais ne l'a appliqué qu'au POSTE DE TRAVAIL, la famille que Samuel avait
 * filmée. L'audit du rejeu a montré que la même mécanique manque partout
 * ailleurs : le premier passage écrit sa réponse dans la feuille, pose son
 * format monétaire, marque le presse-papiers, ouvre son onglet de ruban — et
 * « Revoir la démonstration » rejoue alors sur un tableau DÉJÀ rempli. Le
 * curseur refait le geste, la bulle réaffirme la réponse, et il ne se passe
 * plus rien à l'écran : c'est la même illusion que « Enregistrer sous », en
 * moins spectaculaire et en beaucoup plus fréquent.
 *
 * CE QU'IL CONTIENT, ET PAS DAVANTAGE
 * Le classeur dans la ZONE DÉCLARÉE par le scénario — la même frontière que la
 * remise d'aplomb, donc ni trop étroite (on manquerait une cellule écrite par
 * la démonstration) ni sans fin — et les quelques états de châssis qu'une
 * démonstration peut changer : onglet du ruban, boîte de dialogue, menu Format,
 * presse-papiers, plage entourée par la somme automatique.
 *
 * Le poste de travail garde SON mécanisme (`posteDepartEtapeRef`) : il se
 * restaure dès le clic, avant même le rendu, parce que le plan lit la boîte
 * ouverte pour choisir entre « Ouvrir » et « Enregistrer sous ».
 */
type ClicheDemo = {
  cellules: Record<string, CelluleCliche>
  formats: Record<string, string>
  onglet: RibbonTab
  boite: "fonction" | "format-cellule" | null
  menuFormat: boolean
  presseP: string | null
  plageSomme: string | null
  /**
   * Les MODÈLES : graphique, tableau croisé, mise en page, macros.
   *
   * Ce sont eux que le balayage du 03/08 a montrés les plus abîmés — 71 étapes
   * de graphique, 25 de tableau croisé, 15 de mise en page où le rejeu repartait
   * de l'objet transformé par le premier passage. Ils vivent entièrement dans
   * l'état React : les reposer, c'est retrouver l'écran exact du départ.
   */
  graphique: ChartState | null
  tcd: EtatTcd | null
  reglages: PageSetupState
  macros: MacroState[]
  macroCourante: string | null
  /**
   * Nombre de règles de mise en forme conditionnelle, et la plage que l'étape
   * déclare. `acc-mfc-regle` AJOUTE une règle à chaque pression : au rejeu la
   * feuille en portait deux, empilées sur la même plage. Mesuré sur les six
   * chapitres du module 11.
   */
  reglesMfc: number
  plageMfc: string | null
  /**
   * Les règles de mise en forme conditionnelle des étapes DÉJÀ FRANCHIES.
   *
   * `acc-mfc-effacer` les supprime — c'est son geste. Le rejeu doit donc
   * pouvoir les remettre, sinon « effacez toutes les règles » se rejoue sur une
   * colonne déjà propre et ne montre plus rien (m11-l03).
   */
  reglesAPoser: Array<{ range: string; rule: ConditionalRule }>
  /** Noms de plage définis au départ : une démonstration en ajoute à chaque passage. */
  noms: string[]
  /**
   * Largeurs de colonnes et hauteurs de lignes de la zone.
   *
   * « Largeur de colonne » la porte à 160 px et « Masquer » la met à zéro : deux
   * gestes du module 4 qu'aucun autre relevé ne voit. Sans eux, le rejeu
   * repartait d'une colonne déjà élargie et le geste ne montrait plus rien.
   */
  /**
   * Les dimensions, INDEXÉES PAR FEUILLE.
   *
   * `{ "Ventes": { colonnes: { "1": 210 }, lignes: {} }, … }`. Un seul tableau
   * plat contaminait la feuille voisine dès qu'un chapitre en comparait deux :
   * les colonnes 1 et 2 alternaient 210/90 puis 95/200 d'un passage à l'autre
   * (m15-e02, m15-l04, m21-l05).
   */
  dimensions: Record<string, { colonnes: Record<string, number>; lignes: Record<string, number> }>
  /** Un filtre était-il posé au départ ? Le poser ne masque encore aucune ligne. */
  filtrePose: boolean
  /**
   * Les VOLETS FIGÉS.
   *
   * « Figez la ligne d'en-tête » les pose ; rien ne les levait. Au rejeu la
   * ligne était déjà figée, et la démonstration rejouait un geste sans effet
   * visible (m25-e01).
   */
  volets: { rows: number; cols: number }
  /** Les plages FUSIONNÉES : « fusionnez A1:D1 » doit pouvoir se rejouer. */
  fusions: string[]
  /**
   * Les COMMENTAIRES (notes de cellule).
   *
   * « Insérez un commentaire » en pose un, « Supprimer » l'enlève. Sans relevé,
   * le rejeu de m25-l02 repartait d'une cellule déjà commentée et le geste de
   * suppression ne montrait plus rien à supprimer.
   */
  notes: Record<string, string>
  /**
   * Les plages sur lesquelles une VALIDATION DE DONNÉES a été posée par les
   * étapes déjà franchies.
   *
   * Sans elles, `don-validation` se rejouait sur une plage déjà validée : le
   * bouton était pressé, Univer n'avait rien à faire, et l'effet visible de la
   * pose — la flèche de liste, le renvoi à la ligne qui l'accompagne — ne
   * réapparaissait pas (m21-e01, m21-e02, m21-l01).
   */
  validations: Array<{ range: string; rule: ValidationRule }>
  /**
   * Le FILTRE des étapes déjà franchies : sa plage et ses critères.
   *
   * `filtrePose` dit seulement s'il y en avait un. Pour le rendre, il faut
   * savoir sur quoi : sans cela « effacez le filtre » se rejouait sur un
   * tableau non filtré et ne montrait plus rien (m19-e01).
   */
  filtreAPoser: { range: string; colonnes: Array<{ column: string; values: string[] }> } | null
  plageValidee: string | null
  /**
   * Style BRUT de chaque cellule, sérialisé. C'est lui qui permet de rendre
   * l'écran EXACTEMENT tel qu'il était : alignement « général », absence de
   * format de nombre, gras, bordures — tout ce qu'aucun setter par attribut ne
   * sait remettre à sa valeur par défaut.
   */
  visuels: Record<string, string>
  /** Plage occupée par le tableau croisé au départ, pour effacer ce qui déborde. */
  posePivot: string | null
  /** Feuille sur laquelle le cliché a été pris : y revenir avant de le reposer. */
  feuilleCliche: string | null
  /**
   * L'enregistrement de macro EN COURS, en entier.
   *
   * Un booléen ne suffisait pas : quand l'étape d'entrée était déjà en train
   * d'enregistrer, le rejeu repartait sans enregistreur, « Arrêter » ne
   * produisait plus rien et la macro disparaissait du classeur (`m27-l01`).
   * Le premier passage démarre ou arrête ; dans les deux sens, il faut rendre
   * exactement l'état de départ.
   */
  enregistrement: EtatEnregistrement | null
  /**
   * Feuilles du classeur, et laquelle est active. « Nouvelle feuille » en crée
   * une à chaque pression : sans ce relevé, un rejeu laissait « Feuille1 » ET
   * « Feuille2 » là où la leçon n'en demande qu'une.
   */
  feuilles: string[]
  feuilleActive: string | null
}

/** Deux clichés de cellule décrivent-ils le même contenu ? */
function memeCellule(a: CelluleCliche, b: CelluleCliche): boolean {
  if ((a.f ?? "") !== (b.f ?? "")) return false
  const x = a.v ?? ""
  const y = b.v ?? ""
  if (typeof x === "number" && typeof y === "number") return Math.abs(x - y) < 1e-9
  return String(x) === String(y)
}
import { planDemonstration, type CibleDemo, type PlanDemo } from "@/lib/simulation/demonstration"
import { CONTROLES_POSTE, appliquerGeste, posteInitial } from "@/lib/simulation/poste"
import ChartLayer from "./ChartLayer"
import PivotLayer from "./PivotLayer"
import PageLayoutLayer from "./PageLayoutLayer"
import MacroPanel from "./MacroPanel"
import { estimatedSimulationMinutes } from "@/lib/simulation/duree"
import type {
  CellState,
  ChartState,
  ChartType,
  ConditionalRule,
  ValidationRule,
  GestePoste,
  MacroState,
  PageSetupState,
  PivotAgg,
  PosteState,
  SimulationScenario,
  SimulationStep,
  RibbonTab,
} from "@/lib/simulation/types"
import { cellsOf, columnIndexToLetter, formatRange, parseRange } from "@/lib/simulation/grid"
import {
  CADRE_DEFAUT,
  creerDepuisPlage,
  creerGraphique,
  modifierGraphique,
  selectionnerElement,
  type PatchGraphique,
} from "@/lib/simulation/chart"
import {
  aggParDefaut,
  calculerTcd,
  champsDisponibles,
  creerTcd,
  lecturesTcd,
  modifierTcd,
  posterTcd,
  sourceAChange,
  type EtatTcd,
  type PatchTcd,
  type PosePivot,
  type TableauCroise,
  type ZoneTcd,
} from "@/lib/simulation/pivot"
import {
  REGLAGES_PAR_DEFAUT,
  appliquerReglages,
  calculerPages,
  type Pagination,
} from "@/lib/simulation/pagesetup"
import {
  analyserCode,
  arreterEnregistrement,
  demarrerEnregistrement,
  executerMacro,
  genererCode,
  gesteDepuisControle,
  gesteDepuisSaisie,
  transcrire,
  type EtatEnregistrement,
  type GesteMacro,
  type OptionsMacro,
  type PiloteMacro,
} from "@/lib/simulation/macro"
import { computeScore, type ObservedAction, type Verdict } from "@/lib/simulation/validate"
import { jugerEtape, type JugementEtape } from "@/lib/simulation/frappe"
import { deciderApresCompletion } from "@/lib/simulation/journal"
import { creerFileDeVerdicts, creerFileEnvois, creerVerrouEnvoi, type FileDeVerdicts } from "@/lib/simulation/file-verdicts"

/**
 * Attente maximale d'un verdict serveur. Au-delà, la requête est abandonnée et
 * l'observation ne compte ni comme réussite ni comme faute : une requête qui ne
 * revient jamais ne doit pas figer l'étape pour le reste de l'évaluation.
 */
const DELAI_VERDICT_MS = 15000

// Univer casse à l'import côté serveur : le chargement différé est obligatoire,
// pas une optimisation.

const ExcelGrid = dynamic(() => import("./ExcelGrid"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[13px] text-neutral-500">
      Chargement du classeur…
    </div>
  ),
})

type Mode = "LESSON" | "EXERCISE" | "EVALUATION"

/**
 * Une entrée du sommaire. Le type appartient désormais au châssis — c'est lui
 * qui rend le panneau « Leçons », pour les quatre apps. On le réexporte ici :
 * `SimulationChapter` et la page apprenant l'importent depuis ce fichier depuis
 * l'origine, et rien ne justifie de les toucher pour un déménagement de type.
 */
export type { EntreeSommaire }

type Props = {
  chapterId: string
  mode: Mode
  scenario: SimulationScenario
  /** Étape de reprise, fournie par l'API. */
  initialStep?: number
  /**
   * L'apprenant avait commencé cette ÉVALUATION puis l'a quittée : elle repart
   * du début (choix Samuel du 02/08/2026 — le score compte chaque geste au
   * premier essai, or les réussites d'une session fermée ne sont pas
   * persistées ; reprendre au milieu enregistrait ~0 % à un apprenant qui
   * avait tout juste). Sert uniquement à le lui DIRE sur l'écran d'ouverture.
   */
  repriseEvaluation?: boolean
  /**
   * Meilleur score déjà obtenu à cette ÉVALUATION (0..1), ou null.
   *
   * Une évaluation TERMINÉE ne remplissait aucune des conditions de
   * `repriseEvaluation` : elle rouvrait sur un écran d'ouverture strictement
   * vierge, sans rien rappeler du passage précédent. L'apprenant en concluait
   * que sa tentative n'avait pas été enregistrée — alors que le score était
   * bien en base. On le lui redit ici, à l'endroit exact où il en doutait.
   */
  scorePrecedent?: number | null
  /** Nombre de passages déjà enregistrés (`attemptCount`). */
  passagesPrecedents?: number
  /**
   * « Repasser l'évaluation » depuis la carte de fin.
   *
   * Le parent REMONTE l'atelier plutôt que de le réinitialiser en place : une
   * évaluation remet à zéro un classeur, ses graphiques, ses tableaux croisés et
   * ses macros, et le seul chemin déjà éprouvé pour tout cela est le montage.
   * Le rejeu recharge aussi la meilleure note, qui vient de changer.
   */
  onRejouer?: () => void
  /**
   * Ce montage fait suite à un « Repasser l'évaluation » : le passage serveur
   * doit être NEUF. Sans cela, l'atelier reprendrait le passage encore ouvert et
   * ses verdicts, donc la note du tour précédent.
   */
  nouveauPassage?: boolean
  /**
   * L'atelier a-t-il le droit de corriger lui-même ? C'est `clientValidation`,
   * tel que l'API le renvoie : vrai en leçon et en exercice, FAUX en évaluation
   * notée — le scénario y est servi sans ses réponses, la correction passe alors
   * par la route `verify`. Le champ existait déjà côté API et n'était lu nulle
   * part : les réponses partaient quand même au navigateur.
   */
  validationLocale?: boolean
  /** Aperçu admin : aucune écriture de progression. */
  preview?: boolean
  onCompleted?: () => void
  /**
   * Atelier plein cadre : l'écran occupe toute la hauteur de son conteneur et
   * ne défile jamais. Faux en aperçu admin, où le player reste une carte dans
   * le flux de la page.
   */
  pleinCadre?: boolean
  /** Sommaire de la formation, pour le panneau « Leçons ». */
  sommaire?: EntreeSommaire[]
  onNaviguer?: (chapterId: string) => void
  /** Sortie de l'atelier : retour à la liste des chapitres. */
  onQuitter?: () => void
  /** Prise de notes du chapitre, tenue par la page apprenant. */
  note?: string
  onNote?: (valeur: string) => void
  notesHref?: string
  /**
   * Documents de la formation, pour le panneau « Ressource pédagogique
   * téléchargeable ».
   *
   * Ils viennent des props DÉJÀ chargées par `getLearnerFormationById` : le
   * panneau ne déclenche aucune requête, et surtout pas
   * `GET /api/formations/[id]/attachments`, qui n'est cloisonnée ni par
   * inscription ni par organisme.
   */
  documentsChapitre?: LearnerDocument[]
  /**
   * TOUS les documents de la formation : pièces jointes de la formation ET de
   * chacun de ses chapitres. Un support peut n'exister que sur UN chapitre.
   */
  documentsFormation?: LearnerDocument[]
  /**
   * La formation porte au moins un document réel (pièce jointe de formation ou
   * de n'importe quel chapitre).
   *
   * C'est ce drapeau, et non le contenu du chapitre courant, qui décide de
   * l'affichage du contrôle : sinon il apparaîtrait et disparaîtrait d'un
   * chapitre à l'autre. Il doit être déduit de la même source que
   * `documentsFormation`, faute de quoi le bouton et le panneau se
   * contrediraient.
   */
  afficherRessources?: boolean
  /** Lien vers la page « Documents » de l'apprenant, en accès secondaire. */
  documentsHref?: string
  /**
   * Identifiant apprenant, pour que le guide se souvienne de la première visite
   * dans `localStorage`. Passe-plat pur : le guide ne s'en sert que comme clé,
   * jamais pour lire ou écrire quoi que ce soit côté serveur.
   */
  cleGuide?: string | null
}

/* ═══════════ COUCHES MONTÉES À LA DEMANDE ═══════════ */

type Besoins = { graphique: boolean; tcd: boolean; miseEnPage: boolean; macros: boolean }

/**
 * De quelles couches ce scénario a-t-il besoin ?
 *
 * On le déduit de TROIS sources — le classeur de départ, les onglets déclarés et
 * ce que les étapes demandent — plutôt que de monter les quatre couches partout.
 * Un module qui n'enseigne que des formules ne doit voir ni volet de champs, ni
 * feuille de papier : les 78 chapitres écrits avant ces couches doivent rendre
 * exactement comme avant.
 *
 * L'onglet `affichage` est volontairement ABSENT de la liste : il sert aussi à
 * figer les volets, et trois anciens chapitres le déclarent sans avoir la moindre
 * mise en page à montrer.
 */
function besoinsDe(scenario: SimulationScenario): Besoins {
  const b: Besoins = {
    graphique: Boolean(scenario.workbook.charts?.length),
    tcd: Boolean(scenario.workbook.pivots?.length),
    miseEnPage: Boolean(scenario.workbook.pageSetup),
    macros: Boolean(scenario.workbook.macros?.length),
  }
  for (const t of scenario.ribbon) {
    if (t === "graph-creation" || t === "graph-mise-en-forme" || t === "graph-analyse") b.graphique = true
    if (t === "tableau-creation") b.tcd = true
    if (t === "mise-en-page" || t === "entete-pied") b.miseEnPage = true
    if (t === "developpeur") b.macros = true
  }
  for (const s of scenario.steps) {
    if (s.setup?.chart || s.setup?.chartEdit) b.graphique = true
    if (s.setup?.pivot || s.setup?.pivotEdit) b.tcd = true
    if (s.setup?.pageSetup) b.miseEnPage = true
    if (s.setup?.macro) b.macros = true
    const t = s.action.type
    if (t === "EXPECT_CHART" || t === "SELECT_CHART_ELEMENT") b.graphique = true
    if (t === "EXPECT_PIVOT") b.tcd = true
    if (t === "EXPECT_PAGE_SETUP") b.miseEnPage = true
    if (t === "EXPECT_MACRO" || t === "RECORD_MACRO") b.macros = true
  }
  return b
}

/**
 * Étendue réellement occupée par la feuille active, en A1. La pagination en a
 * besoin pour savoir où le tableau s'arrête : sans elle, elle paginerait le
 * million de lignes qu'Univer offre et annoncerait des milliers de pages.
 */
function etendueUtile(scenario: SimulationScenario): string {
  const feuille = scenario.workbook.sheets[scenario.workbook.activeSheetIndex ?? 0]
  let maxRow = 0
  let maxCol = 0
  for (const ref of Object.keys(feuille?.cells ?? {})) {
    const p = parseRange(ref)
    if (!p) continue
    maxRow = Math.max(maxRow, p.endRow)
    maxCol = Math.max(maxCol, p.endCol)
  }
  return formatRange({ startRow: 0, startCol: 0, endRow: maxRow, endCol: maxCol })
}

/** Type de graphique attaché à un bouton de la galerie du ruban. */
const TYPE_PAR_CONTROLE: Record<string, ChartType> = {
  "ins-graph-histogramme": "histogramme",
  "ins-graph-barres": "barres",
  "ins-graph-courbes": "courbes",
  "ins-graph-secteurs": "secteurs",
  "ins-graph-aires": "aires",
  "ins-graph-nuage": "nuage",
}

/** Élément du graphique que chaque bouton « Ajouter un élément » fait basculer. */
const ELEMENT_PAR_CONTROLE: Record<string, keyof NonNullable<ChartState["elements"]>> = {
  "ins-graph-element-titre": "titre",
  "ins-graph-element-titres-axes": "titresAxes",
  "ins-graph-element-legende": "legende",
  "ins-graph-element-etiquettes": "etiquettes",
  "ins-graph-element-quadrillage": "quadrillage",
}

/** Index de la série sélectionnée, quand la sélection porte bien sur une série. */
function serieSelectionnee(chart: ChartState | null): number | null {
  const m = /^(?:serie|point):(\d+)/.exec(chart?.selectedElement ?? "")
  return m ? Number(m[1]) : null
}

/**
 * Cadre d'un graphique créé sans position déclarée : juste à DROITE de la plage
 * source. Le cadre par défaut du modèle recouvre les premières colonnes, donc les
 * données elles-mêmes — et un exercice qui demande « créez maintenant un second
 * graphique sur la même plage » devenait injouable, la plage étant sous le
 * graphique. Un scénario qui déclare son propre cadre garde le dernier mot.
 */
function cadreHorsSource(grid: GridApi, source: string): NonNullable<ChartState["frame"]> {
  const aire = parseRange(source)
  if (!aire) return { ...CADRE_DEFAUT }
  const apres = grid.getCellRect(`${columnIndexToLetter(aire.endCol + 1)}1`)
  const x = apres ? Math.round(apres.left) + 8 : CADRE_DEFAUT.x
  return { ...CADRE_DEFAUT, x, y: CADRE_DEFAUT.y }
}

/**
 * Les étapes jugées sur un ÉTAT (classeur, format, modèle, poste) : une frappe
 * n'y est jamais le canal attendu — hors des cellules attendues d'un
 * `EXPECT_STATE`, elle vaut tâtonnement, pas faute.
 */
const ETAPES_SUR_ETAT = new Set([
  "EXPECT_STATE",
  "EXPECT_FORMAT",
  "EXPECT_CHART",
  "EXPECT_PIVOT",
  "EXPECT_PAGE_SETUP",
  "EXPECT_MACRO",
  "EXPECT_POSTE",
])

export default function SimulationPlayer({
  chapterId,
  mode,
  scenario,
  initialStep = 0,
  repriseEvaluation = false,
  scorePrecedent = null,
  passagesPrecedents = 0,
  // Défaut prudent côté atelier : sans consigne explicite de l'API, on corrige
  // localement — c'est le comportement des leçons, et l'aperçu admin en dépend.
  validationLocale = true,
  onRejouer,
  nouveauPassage = false,
  preview,
  onCompleted,
  pleinCadre,
  sommaire,
  onNaviguer,
  onQuitter,
  note,
  onNote,
  notesHref,
  documentsChapitre,
  documentsFormation,
  afficherRessources = false,
  documentsHref,
  cleGuide,
}: Props) {
  const steps = scenario.steps
  const total = steps.length

  /**
   * Une ÉVALUATION ne reprend JAMAIS au milieu : les réussites au premier
   * essai (`firstTryRef`) vivent en mémoire de session, donc terminer en deux
   * fois calculait la note sur la seule dernière session — « Score : 0 % »
   * pour un apprenant qui avait tout réussi la veille. Le garde vit ICI et pas
   * seulement chez l'appelant : quel que soit le chemin (page apprenant, banc,
   * futur usage), une évaluation entamée repart de la première question, sur
   * le classeur d'origine (`rejouerAvant(0)` ne rejoue rien).
   */
  const departForce = mode === "EVALUATION" ? 0 : initialStep
  const [gridReady, setGridReady] = useState(false)
  /*
   * RETOUR VISUEL — verdict, effet ancré, jalon, relais. Générique : seule la
   * géométrie de la cible est propre à Excel, et c'est `rectDeLEtape` qui la
   * calcule, juste en dessous.
   */
  const {
    verdict,
    setVerdict,
    fx,
    lancerFx: poserFx,
    relais,
    relaisActif,
    marquerRelais,
    jalon,
    poserJalon,
  } = useRetourVisuel()
  /** Rappel du geste de l'étape franchie, pour le jalon. */
  const resumerEtapeCourante = useCallback(
    (i: number) => (steps[i] ? resumerFait(steps[i].action) : null),
    [steps],
  )
  /*
   * PROGRESSION — index, écran d'ouverture, avancer, reculer, fin de chapitre.
   *
   * `onAvancer` et `onTerminer` sont remplis plus bas, quand `persist` et
   * `cloturer` existent : c'est le motif de refs déjà employé ici pour
   * `goNextRef` et `cloturerRef`, et il disparaîtra quand la persistance
   * rejoindra le hook au dernier étage.
   */
  const {
    index,
    indexRef,
    introVue,
    ouvrirLAtelier,
    introVueRef,
    finished,
    setFinished,
    goNext,
    reculPossible,
    reculDemande,
    setReculDemande,
    reculer,
    onAvancer: onAvancerRef,
    onTerminer: onTerminerRef,
  } = useProgression({
    total,
    departForce,
    mode,
    resumerEtape: resumerEtapeCourante,
    retour: { marquerRelais, poserJalon },
  })
  const evaluationRepart = mode === "EVALUATION" && (repriseEvaluation || initialStep > 0)
  // Passage précédent DÉJÀ TERMINÉ, avec sa note : cas qu'aucun message ne
  // couvrait jusqu'ici.
  const dejaPassee = mode === "EVALUATION" && scorePrecedent != null
  /**
   * Conteneur de TOUT l'atelier — bureau compris.
   *
   * Le calque de démonstration vivait dans la zone de grille, que `DesktopLayer`
   * masque (`display:none`) tant que le classeur n'est pas ouvert : sur les
   * écrans du module 1 où l'on démarre Excel, la démonstration tournait
   * entièrement invisible. Elle se pose désormais ici, au-dessus du bureau comme
   * de la feuille.
   */
  const zoneAtelierRef = useRef<HTMLDivElement>(null)
  /**
   * La feuille de calcul : c'est la zone de travail d'Excel, donc celle que le
   * châssis mesure. La mesure elle-même est générique — voir
   * `useMesureZoneTravail`, qui porte la garantie « rien ne défile ».
   */
  const zoneGrilleRef = useRef<HTMLDivElement>(null)
  const { hauteur: hauteurGrille, largeur: largeurGrille } = useMesureZoneTravail(
    zoneGrilleRef,
    introVue,
  )
  useEffect(() => {
    // Univer ne réagit qu'au resize de la fenêtre : sans cela son canvas garde
    // l'ancienne hauteur et la feuille flotte dans un cadre trop grand.
    const t = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 90)
    return () => window.clearTimeout(t)
  }, [hauteurGrille])
  /**
   * Relais de consigne (traitement « A », choix Samuel du 29/07).
   *
   * Le passage d'étape se voyait « à peine » : la consigne était remplacée sans
   * transition, on pouvait franchir une étape sans s'en apercevoir. À chaque
   * avancée, la bande verdit brièvement, une coche remplace le numéro d'étape et
   * la nouvelle consigne entre par le bas.
   *
   * Rien de tout cela ne retarde la saisie : `applyStep` rend le focus à la
   * feuille immédiatement, l'animation se joue par-dessus.
   */
  /**
   * Essais ratés sur l'étape courante, et aide qui monte en puissance.
   *
   * Le nombre d'erreurs était déjà compté — mais seulement pour l'enregistrer.
   * Après une erreur ou après dix, l'apprenant voyait le même message rouge, et
   * 174 étapes d'action n'ont même pas d'indice à demander : celui qui bloque ne
   * pouvait ni comprendre, ni passer. Paliers retenus avec Samuel : 2 / 3 / 5.
   */
  /**
   * Phrase du bandeau quand des cellules ont été remises d'aplomb. Volontairement
   * factuelle et sans reproche : l'apprenant n'a rien fait de mal, il a exploré.
   * Mais elle ne peut pas être tue — une remise en ordre invisible se vit comme
   * « mon travail a disparu » (arbitrage Samuel du 31/07/2026).
   */
  const [aplomb, setAplomb] = useState<string | null>(null)
  /**
   * TEMPS DE LECTURE GARANTI.
   *
   * La phrase était effacée par le changement d'étape (`setAplomb(null)` en
   * tête de `applyStep`). Or la remise a lieu à l'arrivée sur une étape, et
   * l'étape suivante peut tomber tout de suite après — l'apprenant enchaîne, ou
   * le rattrapage d'observation la franchit lui-même parce que la feuille est
   * déjà juste. Filmé au banc sur `m01-l05` : message posé à 966 ms, effacé à
   * 2 643 ms par un franchissement automatique. Des cases disparaissaient donc
   * bel et bien sans un mot lisible.
   *
   * Le message a maintenant sa propre durée : il survit au changement d'étape
   * jusqu'à son échéance, ou jusqu'à ce qu'une nouvelle remise le remplace. Il
   * ne parle que du CLASSEUR, jamais de l'étape en cours : le laisser vivre
   * quelques secondes de plus ne peut pas devenir faux.
   */
  const APLOMB_LECTURE_MS = 6000
  const aplombFinRef = useRef(0)
  const aplombTimerRef = useRef<number | null>(null)
  const poserAplomb = useCallback((p: string | null) => {
    if (!p) return
    setAplomb(p)
    aplombFinRef.current = Date.now() + APLOMB_LECTURE_MS
    if (aplombTimerRef.current) window.clearTimeout(aplombTimerRef.current)
    aplombTimerRef.current = window.setTimeout(() => setAplomb(null), APLOMB_LECTURE_MS)
  }, [])
  useEffect(() => () => { if (aplombTimerRef.current) window.clearTimeout(aplombTimerRef.current) }, [])
  /**
   * Gestes faits sans succès sur une étape jugée sur l'ÉTAT du classeur.
   *
   * Sur ces étapes — 466 au total : EXPECT_STATE, EXPECT_FORMAT, mise en page,
   * graphiques, tableaux croisés, macros, poste — le chemin est libre et un
   * geste faux n'est PAS compté comme erreur, à dessein. Conséquence non voulue :
   * `essais` restait à zéro, donc « Montrez-moi » n'apparaissait jamais. C'est
   * la cause du « des fois c'est absent » signalé par Samuel. Ce compteur-ci
   * n'entre pas dans le score : il ne sert qu'à proposer l'aide.
   */
  /**
   * Compteur de salves de modification du classeur. Il ne sert qu'à faire
   * relire au graphique ses plages : sans lui, elles n'étaient relues qu'au
   * changement d'étape, donc jamais entre le montage et la première étape
   * franchie — le temps que le moteur recalcule.
   */
  const [versionClasseur, setVersionClasseur] = useState(0)
  /**
   * L'apprenant est-il resté longtemps sur l'étape sans la franchir ? Dernier
   * filet : certains blocages ne produisent AUCUN geste — on ne sait pas quoi
   * faire, donc on ne fait rien, et aucun compteur ne bouge. Au bout de 45 s,
   * l'aide se propose d'elle-même.
   */
  /** La consigne dépasse-t-elle son cadre ? Décide du voile qui annonce la suite. */
  /**
   * Poste de travail (direction C). Absent du scénario — le cas des 243
   * chapitres existants — l'atelier s'ouvre directement dans le classeur.
   */
  const posteActif = !!scenario.poste
  const [poste, setPoste] = useState<PosteState>(() =>
    posteInitial({
      excelOuvert: scenario.poste?.excelOuvert,
      classeur: scenario.poste?.classeur ?? null,
      fichiers: scenario.poste?.fichiers,
      modeles: scenario.poste?.modeles,
    }),
  )
  const posteRef = useRef(poste)
  posteRef.current = poste
  /** État réel à l'arrivée sur l'étape, avant les essais de l'apprenant et
   * avant qu'une première démonstration n'accomplisse le geste à sa place. */
  const posteDepartEtapeRef = useRef<PosteState>(clonerPoste(poste))
  useEffect(() => {
    // Univer ne se rend pas dans un conteneur masqué : au retour dans le
    // classeur, il faut le prévenir que sa surface existe à nouveau. Plusieurs
    // rappels échelonnés, et non un seul : mesuré au banc, un unique resize à
    // 90 ms pouvait tomber avant que la fenêtre n'ait fini son animation
    // d'ouverture — le canvas restait alors à zéro et la grille invisible.
    if (poste.excel !== "classeur") return
    const t = [90, 320, 700].map((d) =>
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), d),
    )
    return () => t.forEach(window.clearTimeout)
  }, [poste.excel])
  /*
   * Les panneaux (leçons / notes / ressources) et le guide vivent désormais
   * dans `AtelierShell`, qui garde leur état pour lui : le player n'a aucune
   * raison de savoir quel tiroir est ouvert. C'est ce qui permet aux trois
   * autres apps de les avoir sans rien réécrire.
   */
  const [selection, setSelection] = useState(scenario.workbook.selection ?? "A1")
  const [formulaText, setFormulaText] = useState("")
  // Agrégats de la sélection, rafraîchis à chaque geste : c'est ce que la barre
  // d'état d'Excel affiche, et la leçon « calculs à la volée » repose dessus.
  const [stats, setStats] = useState<ReturnType<GridApi["getSelectionStats"]>>(null)
  // Saisie en cours dans la zone Nom. null = on y affiche la sélection courante.
  const [nameBoxDraft, setNameBoxDraft] = useState<string | null>(null)
  const [sheets, setSheets] = useState<Array<{ name: string; active: boolean }>>([])

  /* ── Menu Format, boîtes de dialogue et presse-papiers ──────────────────────
     Trois surfaces ajoutées le 31/07/2026, après que Samuel a filmé la flèche ▾
     du groupe Cellules : la démonstration promettait qu'elle ouvre la boîte de
     dialogue, il a cliqué, rien ne s'est ouvert. L'audit a montré que huit
     boutons du ruban n'avaient AUCUN traitement — dont `bf-fx`, que la leçon
     M01-L02-04 fait cliquer en annonçant une fenêtre, et `acc-copier`, que cinq
     consignes accompagnent d'un « liseré animé entoure la sélection ». */
  const [menuFormat, setMenuFormat] = useState(false)
  // Référence miroir : le cliché de démonstration est pris depuis un effet,
  // qui lirait sinon la valeur du premier rendu.
  const menuFormatRef = useRef(menuFormat)
  menuFormatRef.current = menuFormat
  const [boite, setBoite] = useState<"fonction" | "format-cellule" | null>(null)
  // `handleAction` est mémoïsé : il lirait sinon un `boite` figé au montage.
  const boiteRef = useRef<"fonction" | "format-cellule" | null>(null)
  boiteRef.current = boite
  /** Ce qu'il reste à faire quand l'apprenant referme la boîte. */
  const apresBoiteRef = useRef<(() => void) | null>(null)
  const fermerBoite = useCallback(() => {
    boiteRef.current = null
    setBoite(null)
    const suite = apresBoiteRef.current
    apresBoiteRef.current = null
    if (suite) window.setTimeout(suite, 260)
  }, [])
  /** Plage mise au presse-papiers : c'est elle que le liseré animé entoure. */
  const [presseP, setPresseP] = useState<string | null>(null)
  const pressePRef = useRef(presseP)
  pressePRef.current = presseP
  /** Plage devinée par la somme automatique, entourée le temps qu'on la lise. */
  const [plageSomme, setPlageSomme] = useState<string | null>(null)
  const plageSommeRef = useRef<string | null>(null)
  const poserPlageSomme = useCallback((plage: string | null) => {
    plageSommeRef.current = plage
    setPlageSomme(plage)
  }, [])

  /* ── Modèles des modules 13, 17, 18, 20 et 27 ──────────────────────────── */

  const besoins = useMemo(() => besoinsDe(scenario), [scenario])
  const etendue = useMemo(() => etendueUtile(scenario), [scenario])

  // Chaque modèle est doublé d'une référence. `handleControl` et les rappels des
  // couches sont mémoïsés sur `handleAction` seul : sans ces références ils
  // liraient l'état du premier rendu, et le deuxième clic repartirait du premier
  // graphique. Le même schéma que `stepRef`, pour la même raison.
  const [graphique, setGraphique] = useState<ChartState | null>(null)
  const graphiqueRef = useRef<ChartState | null>(null)
  const poserGraphique = useCallback((g: ChartState | null) => {
    graphiqueRef.current = g
    setGraphique(g)
  }, [])

  const [tcd, setTcd] = useState<EtatTcd | null>(null)
  const tcdRef = useRef<EtatTcd | null>(null)
  // Plage occupée par la pose précédente : `posterTcd` s'en sert pour effacer ce
  // que le nouveau tableau n'occupe plus. Sans elle, un tableau qui rétrécit
  // laisse des chiffres fantômes dans la feuille.
  const posePivotRef = useRef<PosePivot | null>(null)

  const [reglages, setReglages] = useState<PageSetupState>(() =>
    appliquerReglages(REGLAGES_PAR_DEFAUT, scenario.workbook.pageSetup ?? {}),
  )
  const reglagesRef = useRef<PageSetupState>(reglages)
  const poserReglages = useCallback((r: PageSetupState) => {
    reglagesRef.current = r
    setReglages(r)
  }, [])

  const [macros, setMacros] = useState<MacroState[]>(() =>
    (scenario.workbook.macros ?? []).map((m) => ({ ...m, statements: [...m.statements] })),
  )
  const macrosRef = useRef<MacroState[]>(macros)
  const [macroCourante, setMacroCourante] = useState<string | null>(
    () => scenario.workbook.macros?.[0]?.name ?? null,
  )
  const macroCouranteRef = useRef<string | null>(macroCourante)
  // Code affiché dans l'éditeur. Il vit à part du modèle : l'apprenant le
  // modifie librement, et ce n'est qu'à l'exécution qu'on le relit.
  const [codeMacro, setCodeMacro] = useState("")
  const codeMacroRef = useRef("")
  const [enregistrement, setEnregistrement] = useState<EtatEnregistrement | null>(null)
  const enregistrementRef = useRef<EtatEnregistrement | null>(null)
  // Relais ruban → panneau des macros (voir la prop `commande` de MacroPanel).
  const [commandeMacro, setCommandeMacro] = useState<{ nonce: number; controle: string } | null>(null)

  const gridRef = useRef<GridApi | null>(null)
  // Réussite au premier essai, par étape : c'est la base du score d'évaluation.
  const firstTryRef = useRef<Record<string, boolean>>({})
  const attemptedRef = useRef<Set<string>>(new Set())
  /**
   * Étape déjà réussie, en attente du changement d'écran. Un même geste produit
   * parfois DEUX observations — un clic de panneau signale le bouton puis le
   * réglage obtenu — et la seconde, arrivant après la réussite, comptait une
   * faute sur une étape pourtant validée.
   */
  const resoluRef = useRef(false)
  /**
   * ÉCHÉANCE du verrou de démonstration, en millisecondes.
   *
   * Pendant que la démonstration agit — écriture de cellules, pression d'un
   * bouton, création d'un nom de plage — les observations du classeur sont
   * ignorées : sans cela, poser la réponse validerait l'étape et ferait sauter à
   * la suivante en pleine explication.
   *
   * C'était un simple booléen, et cela ne tenait pas dès que deux effets se
   * chevauchaient : la minuterie du premier remettait le verrou à faux alors que
   * le second était encore en cours, et l'observation retardée du bouton (220 ms
   * après le clic, le temps qu'Univer applique le style) passait au travers.
   * L'étape se validait toute seule — bandeau « C'est exact » au milieu de la
   * démonstration, et une étape comptée réussie du premier coup sans que
   * l'apprenant ait rien fait. Une échéance ne peut pas être raccourcie par
   * quelqu'un d'autre.
   */
  /**
   * TRAVAUX ASYNCHRONES EN COURS, lancés par un geste de la démonstration.
   *
   * « Valeur cible » itère sur le classeur : la promesse peut se résoudre APRÈS
   * la dernière image de la démonstration. Le premier passage s'arrêtait alors
   * sur une valeur intermédiaire (B6 = 5,5), la recherche continuait ensuite
   * jusqu'à 2,61, et le rejeu repartait donc d'un classeur que personne n'avait
   * vu. Tant que ce compteur n'est pas nul, la démonstration n'est pas finie.
   */
  const travauxDemoRef = useRef(0)
  const verrouDemoRef = useRef(0)
  const verrouillerDemo = useCallback((ms: number) => {
    verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + ms)
  }, [])
  /**
   * Cellules touchées par une démonstration jouée sur un écran de LECTURE, avec
   * leur valeur d'avant. Une lecture illustre : elle ne doit pas laisser le
   * classeur modifié pour l'étape suivante.
   */
  const avantDemoRef = useRef<Record<string, string>>({})

  const step: SimulationStep | undefined = steps[index]
  /**
   * Le décor du poste (bureau, corbeille, barre des tâches) n'est montré que
   * quand l'étape en cours s'en sert. Sur les leçons du module 1, seules les
   * premières et les dernières étapes sortent du classeur : garder le bureau
   * visible pendant la saisie ne montrait rien et brouillait la lecture.
   */
  const decorPoste =
    posteActif &&
    (poste.excel !== "classeur" ||
      poste.boite !== "aucune" ||
      poste.menu ||
      step?.action.type === "EXPECT_POSTE" ||
      (!!step?.setup?.poste && step.setup.poste.excel !== undefined && step.setup.poste.excel !== "classeur"))
  const stepRef = useRef<SimulationStep | undefined>(step)
  stepRef.current = step

  const goNextRef = useRef<(() => void) | null>(null)
  /*
   * PERSISTANCE ET PASSAGE D'ÉVALUATION.
   *
   * Tout le chemin de la note : file d'envois scellée, verrous anti-double-tap,
   * ouverture et clôture du passage serveur. Générique par construction — c'est
   * la pièce que les quatre apps DOIVENT partager, sous peine d'avoir deux
   * calculs de note pour un même parcours (décision D6).
   */
  const {
    pendingRef,
    runIdRef,
    persist,
    commencer,
    ouvertureEnCours,
    passerLaQuestion,
    passageEnCours,
    cloturer,
    cloturerRef,
    clotureEnCours,
    bilan,
    bilanEnAttente,
    setBilanEnAttente,
    noteEnregistree,
    pannneJuge,
    setPanneJuge,
  } = usePersistance({
    chapterId,
    mode,
    preview,
    nouveauPassage,
    onCompleted,
    indexRef,
    stepRef,
    goNextRef,
  })

  /**
   * Une démonstration est une reconstitution, pas la poursuite de la précédente.
   *
   * En particulier, « Enregistrer sous » ferme sa boîte et crée le fichier au
   * premier passage. Relancer uniquement le calque faisait ensuite avancer le
   * compteur 1/2 puis 2/2 sur deux contrôles absents : exactement le replay
   * invisible filmé par Samuel le 03/08/2026.
   */
  const restaurerDepartPostePourDemo = useCallback(() => {
    if (!posteActif) return
    const depart = clonerPoste(posteDepartEtapeRef.current)
    // La ref est mise à jour sans attendre le rendu : le plan lit notamment la
    // boîte ouverte pour distinguer « Ouvrir » d'« Enregistrer sous ».
    posteRef.current = depart
    setPoste(depart)
  }, [posteActif])

  /**
   * Cliché du classeur et du châssis au moment où la démonstration a commencé.
   * `null` tant qu'aucune n'a été lancée sur l'étape courante : le premier
   * lancement le PREND, chaque « Revoir » le REPOSE.
   */
  /**
   * Miroir de `arreterMacro`, déclaré plus bas. Le cliché doit pouvoir arrêter
   * un enregistreur lancé au passage précédent, et une référence évite d'avoir
   * à remonter toute la chaîne de rappels mémoïsés pour un seul appel.
   */
  const arreterMacroRef = useRef<(() => void) | null>(null)

  const clicheDemoRef = useRef<ClicheDemo | null>(null)

  /*
   * AIDE PROGRESSIVE — essais, tâtonnements, chrono, paliers 2 / 3 / 5.
   *
   * Entièrement générique : rien ici ne parle de cellules. Le seul crochet
   * d'app est `avantDemonstration`, où Excel restaure l'état de départ du
   * poste. Il est appelé ICI, et non plus haut avec les autres états, parce
   * qu'il a besoin de `restaurerDepartPostePourDemo`, défini juste au-dessus.
   */
  const {
    essais,
    tatonnements,
    tropLong,
    hintShown,
    montrerIndice,
    compterEssai,
    compterTatonnement,
    demonstration,
    demoFinie,
    setDemoFinie,
    rejeu,
    demarrerDemonstration,
    rejouerDemonstration,
    reinitialiserPourEtape,
    reinitialiserAAlArrivee,
    ouvrirFenetreMiseEnPlace,
    dansFenetreMiseEnPlace,
  } = useAideProgressive({
    mode,
    index,
    finished,
    aUneEtape: !!step,
    avantDemonstration: restaurerDepartPostePourDemo,
  })

  /* ── Lecture du classeur pour les modèles ──────────────────────────────── */

  /** Lecture d'une cellule, signature attendue par le moteur de tableaux croisés. */
  const lireCellule = useCallback((ref: string): unknown => gridRef.current?.getValue(ref) ?? null, [])

  /** Lecture d'une plage à plat, ligne par ligne : ce qu'attend le modèle graphique. */
  const lirePlage = useCallback(
    (ref: string): unknown[] => cellsOf(ref).map((c) => gridRef.current?.getValue(c) ?? null),
    [],
  )

  /**
   * Pose le tableau croisé dans la feuille. `effacer` est OBLIGATOIRE : poser un
   * filtre de rapport décale le tableau de deux lignes comme dans Excel, et sans
   * effacement la pose précédente laisserait des chiffres fantômes.
   */
  const poserTcdDansFeuille = useCallback((etat: EtatTcd | null) => {
    tcdRef.current = etat
    setTcd(etat)
    const grid = gridRef.current
    if (!etat || !grid) return
    const pose = posterTcd(etat, calculerTcd(etat), { effacer: posePivotRef.current?.range })
    posePivotRef.current = pose
    grid.applyCells(pose.cells)
  }, [])

  // Onglet du ruban : l'étape peut en imposer un, mais l'apprenant doit pouvoir
  // en changer librement. Explorer le ruban n'est pas une faute.
  const [onglet, setOnglet] = useState<RibbonTab>(
    step?.setup?.ribbon?.activeTab ?? scenario.ribbon[0] ?? "accueil"
  )
  /** Onglet courant, lisible sans créer de dépendance — voir le plan de démonstration. */
  const ongletRef = useRef(onglet)
  ongletRef.current = onglet

  /* ── Mise en place de l'étape ──────────────────────────────────────────── */

  /**
   * Pose les modèles déclarés par une étape : graphique, tableau croisé, mise
   * en page, macro.
   *
   * `passe` distingue les deux usages. Sur l'étape COURANTE, un modèle que
   * l'étape va justement juger ne doit pas être posé — elle serait répondue
   * avant que l'apprenant ne fasse quoi que ce soit. Sur une étape DÉJÀ FAITE
   * qu'on rejoue, c'est l'inverse : son résultat fait partie du décor, il faut
   * le poser.
   */
  const appliquerModeles = useCallback(
    (s: SimulationStep, passe: boolean) => {
      const juge = passe ? "" : s.action.type
      if (s.setup?.chart && juge !== "EXPECT_CHART" && juge !== "CLICK_CONTROL") {
        poserGraphique(creerGraphique(s.setup.chart))
      }
      if (s.setup?.chartEdit && graphiqueRef.current && juge !== "EXPECT_CHART" && juge !== "CLICK_CONTROL") {
        poserGraphique(modifierGraphique(graphiqueRef.current, s.setup.chartEdit))
      }
      if (s.setup?.pivot && juge !== "EXPECT_PIVOT") {
        poserTcdDansFeuille(creerTcd(s.setup.pivot, lireCellule))
      }
      if (s.setup?.pivotEdit && tcdRef.current && juge !== "EXPECT_PIVOT") {
        poserTcdDansFeuille(modifierTcd(tcdRef.current, s.setup.pivotEdit, lireCellule))
      }
      if (s.setup?.pageSetup && juge !== "EXPECT_PAGE_SETUP") {
        poserReglages(appliquerReglages(reglagesRef.current, s.setup.pageSetup))
      }
      if (s.setup?.macro && juge !== "EXPECT_MACRO") {
        const m = s.setup.macro
        const suite = macrosRef.current.some((x) => x.name === m.name)
          ? macrosRef.current.map((x) => (x.name === m.name ? { ...x, ...m, statements: m.statements ?? x.statements } : x))
          : [...macrosRef.current, { statements: [], ...m }]
        macrosRef.current = suite
        setMacros(suite)
        macroCouranteRef.current = m.name
        setMacroCourante(m.name)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /**
   * Échéance en deçà de laquelle un `stateChange` vient de la mise en place de
   * l'étape, pas de l'apprenant. Une ref, pas un state : `handleAction` la lit
   * sans que sa mémoïsation en dépende.
   */

  const applyStep = useCallback(
    (s: SimulationStep | undefined) => {
      const grid = gridRef.current
      if (!grid || !s) return
      // Une étape qui exige un onglet précis le reprend ; sinon on laisse
      // l'apprenant sur celui qu'il consultait.
      if (s.setup?.ribbon?.activeTab) setOnglet(s.setup.ribbon.activeTab)
      // Un menu resté déplié ou une boîte restée ouverte d'une étape à l'autre
      // masqueraient la feuille de l'étape suivante. Le presse-papiers, lui, se
      // vide comme dans Excel quand on change de contexte.
      setMenuFormat(false)
      setBoite(null)
      boiteRef.current = null
      apresBoiteRef.current = null
      // `presseP` n'est PAS vidé ici : dans Excel le liseré du presse-papiers
      // survit au geste suivant et ne s'éteint qu'au collage. C'est justement
      // ce que M04-L06 enseigne — copier à une étape, coller à la suivante.
      // La proposition de Somme automatique doit survivre au passage de
      // l'étape « cliquez sur Σ » à l'étape « validez ». Sinon Entrée n'a plus
      // rien à valider et seul un clic qui force un blur peut débloquer la
      // leçon. Toute autre transition éteint normalement le liseré.
      if (!(plageSommeRef.current && s.action.type === "EXPECT_STATE")) poserPlageSomme(null)
      // La mise en place écrit dans la feuille, donc la grille émettra un
      // `stateChange` un peu plus tard. Ce n'est PAS un geste de l'apprenant :
      // sans ce garde-fou, chaque étape démarrait avec un tâtonnement déjà
      // compté (mesuré : `tatonnements = 1` à l'arrivée, sans rien toucher),
      // ce qui rapprochait d'un cran l'indice automatique et l'encart d'aide.
      //
      // Le délai n'est pas fixe : la mise en place écrit par vagues — cellules,
      // puis formats à +220 ms, puis francisation des décimales — et le
      // regroupement de la grille repart à chaque vague. Mesuré au banc : sur
      // les chapitres « poste » et sur le module 11, il en arrive DEUX — le
      // classeur d'abord, les formats ensuite. On ignore donc tous ceux de la
      // fenêtre, et pas seulement le premier. Si l'apprenant modifie la feuille
      // dans les 2,5 s, son geste ne sera pas compté : sans conséquence, le
      // score ne bouge pas et l'aide arrive un cran plus tard.
      ouvrirFenetreMiseEnPlace()
      if (s.setup?.cells) grid.applyCells(s.setup.cells)
      if (s.setup?.selection) {
        grid.setSelection(s.setup.selection)
        setSelection(s.setup.selection)
      }

      /* Modèles graphique / tableau croisé / impression / macro.
       *
       * Un `setup` de modèle décrit le RÉSULTAT du geste de l'étape — comme
       * `setup.cf` décrit la règle que le bouton de mise en forme
       * conditionnelle appliquera. On ne l'applique donc PAS à l'ouverture de
       * l'étape quand c'est ce modèle qui sera jugé : l'étape serait répondue
       * avant que l'apprenant n'ait rien fait, et n'importe quel réglage sans
       * rapport la validerait ensuite. C'est exactement l'avertissement de la
       * couche de mise en page : `onChange` propose, l'étape n'est satisfaite
       * que par le geste attendu.
       *
       * Le cas inverse — un `setup` de modèle sur une étape qui juge autre
       * chose — sert à planter le décor, et là on applique tout de suite.
       */
      appliquerModeles(s, false)
      resoluRef.current = false
      // Verrou d'édition, calibré selon ce que l'étape demande :
      //  - saisie ciblée : seule la cellule attendue est modifiable, ce qui évite
      //    qu'un apprenant remplisse une cellule hors sujet et casse la suite ;
      //  - validation par l'état : AUCUNE restriction, sinon l'apprenant ne peut
      //    ni tirer la poignée de recopie ni coller — donc l'étape est injouable.
      //    C'est tout l'intérêt de ce mode : le chemin est libre ;
      //  - lecture ou clic : rien à saisir, on verrouille par précaution.
      if (s.action.type === "TYPE" && s.action.target !== "formula-bar") {
        // ⚠️ EN ÉVALUATION NOTÉE, LA CIBLE PEUT NE PAS ÊTRE SERVIE.
        // Quand la consigne ne la nomme pas, la trouver fait partie de la
        // question : on ne verrouille alors AUCUNE cellule — verrouiller la
        // bonne reviendrait à la désigner. Le serveur juge ce qui a réellement
        // été saisi, et où.
        grid.setEditableCells(s.action.target ? [s.action.target] : null)
      } else if (
        s.action.type === "EXPECT_STATE" ||
        s.action.type === "EXPECT_FORMAT" ||
        s.action.type === "SORT_RANGE" ||
        s.action.type === "FILTER_COLUMN"
      ) {
        // Trier ou filtrer réécrit des lignes entières : le verrou de cellules
        // faisait échouer la commande en silence, l'étape restait injouable.
        grid.setEditableCells(null)
      } else {
        grid.setEditableCells([])
      }
      // La barre de formule reflète la cellule sélectionnée, comme dans Excel.
      // Elle était systématiquement vidée à chaque étape : une leçon qui dit
      // « la barre de formule affiche toujours =3+2 » la montrait vide, et
      // l'illustration qui la désigne pointait sur du néant.
      const refFormule = s.setup?.selection
      setFormulaText(refFormule ? (grid.getFormula(refFormule) ?? "") : "")
      // Les cellules que l'étape vient de poser ne sont lisibles qu'après le
      // recalcul d'Univer (60-120 ms mesurés) : on relit une fois.
      if (refFormule) {
        window.setTimeout(() => {
          const g = gridRef.current
          if (g && stepRef.current?.id === s.id) setFormulaText(g.getFormula(refFormule) ?? "")
        }, 320)
      }
      setVerdict(null)
      avantDemoRef.current = {}
      // Chaque étape repart d'une ardoise vierge : l'aide progressive se
      // rejoue depuis le premier palier.
      reinitialiserPourEtape()
      // Le focus revient à la grille : sans cela, après un clic sur « Suivant »
      // ou sur un bouton du ruban, l'apprenant tape dans le vide jusqu'à ce qu'il
      // pense à recliquer dans une cellule.
      grid.focus()
      if (s.setup?.selection) setStats(grid.getSelectionStats(s.setup.selection))
      setNameBoxDraft(null)
      setSheets(grid.getSheets())
    },
    [mode, lireCellule, poserGraphique, poserReglages, poserTcdDansFeuille, appliquerModeles],
  )

  /**
   * REPRISE D'UN CHAPITRE EN COURS : reconstituer le travail déjà fait.
   *
   * Le player rouvre à `attempt.currentStep`, mais `applyStep` ne pose que le
   * `setup` de CETTE étape-là. Tout ce que l'apprenant avait saisi aux étapes
   * précédentes n'existe dans aucun `setup` : il retombait sur le classeur
   * initial. L'exercice « Créer un classeur de zéro » repris à l'étape 4
   * demandait ainsi le total des inscriptions sur une feuille VIDE — étape
   * impossible, et aucune valeur ne pouvait la valider. Mesuré sur le corpus :
   * 136 chapitres sur 246 ont au moins une étape dans ce cas.
   *
   * On rejoue donc le RÉSULTAT déclaré des étapes déjà franchies. C'est une
   * reconstitution, pas la copie exacte du classeur de l'apprenant : quand une
   * étape laisse le chemin libre sans déclarer de valeur, la cellule reste
   * vide. Elle suffit à rendre l'étape courante jouable et cohérente.
   *
   * Le rejeu doit être INVISIBLE : aucune animation, aucune démonstration,
   * aucune validation. Les écritures passent par `applyCells`, qui ne fait
   * qu'écrire ; le verrou d'observation couvre le `stateChange` que la grille
   * émet 350 ms plus tard, sinon l'étape courante se croirait franchie.
   */
  const rejouerAvant = useCallback(
    (jusqua: number) => {
      const grid = gridRef.current
      if (!grid || jusqua <= 0) return
      // Large : le débounce de la grille est à 350 ms, et les modèles posés
      // ci-dessous écrivent eux aussi dans la feuille.
      verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + 2000)
      /**
       * LA MACHINE À MACROS SE RECONSTRUIT AUSSI.
       *
       * `rejouerAvant` restituait les CELLULES des étapes franchies, jamais les
       * macros. Or le module 27 en enregistre une au début du chapitre et la
       * fait EXÉCUTER plus loin : reprendre le chapitre à cette étape-là — ou y
       * sauter — laissait « Pied_relatif » inexistante, et la consigne
       * « exécutez la macro » n'avait plus d'objet. Même famille que la feuille
       * vide du correctif `a1a7ca4`, appliquée à un autre modèle.
       *
       * On rejoue donc l'enregistreur : démarrage, gestes déclarés par les
       * étapes intermédiaires, arrêt. Le nom, le raccourci et le mode relatif
       * viennent du seul endroit qui les déclare — l'`EXPECT_MACRO` que le
       * chapitre pose plus loin.
       */
      const macroDeclaree = (depuis: number) => {
        for (let j = depuis; j < steps.length; j++) {
          const a2 = steps[j]?.action
          if (a2?.type === "EXPECT_MACRO" && a2.macro?.name) return a2.macro
        }
        return null
      }
      let enrRejeu: EtatEnregistrement | null = null
      const macrosRejouees: MacroState[] = []
      /**
       * LA SÉLECTION SUIT LE REJEU.
       *
       * L'ancre d'une macro RELATIVE, c'est la cellule sélectionnée au moment du
       * démarrage : `m27-e01` clique D10 avant d'enregistrer, et c'est ce qui
       * fait que la macro clôture « le tableau où l'on se trouve ». Sans suivre
       * la sélection pendant la reconstitution, l'ancre valait A1 et la macro
       * écrivait deux lignes trop haut — un total juste, au mauvais endroit.
       */
      let selCourante = grid.getSelection() || "A1"
      /**
       * LA FEUILLE ACTIVE SUIT LE REJEU, ELLE AUSSI.
       *
       * `rejouerAvant` écrivait le résultat de chaque étape franchie sur la
       * feuille active du MOMENT, sans jamais suivre les `SELECT_SHEET` du
       * chapitre. Sur `m03-e03` — Est, Ouest, Synthèse — les deux totaux
       * reportés à l'étape 4 atterrissaient donc sur la première feuille du
       * classeur, et l'étape suivante totalisait deux cellules vides. Même
       * famille que la sélection : une reprise doit rendre l'endroit où l'on
       * était, feuille comprise.
       */
      let feuilleCourante: string | null = null
      const allerSurLaFeuille = (nom: string) => {
        if (!nom || nom === feuilleCourante) return
        try {
          grid.activateSheet(nom)
          feuilleCourante = nom
        } catch {
          /* feuille absente : on écrit là où l'on est */
        }
      }
      const suivreSelection = (s2: SimulationStep) => {
        const f = (s2.setup as { activeSheet?: string } | undefined)?.activeSheet
        if (f) allerSurLaFeuille(f)
        if (s2.action.type === "SELECT_SHEET") allerSurLaFeuille(s2.action.name)
        const r = s2.setup?.selection
        if (r) selCourante = r
        const a2 = s2.action
        if (a2.type === "CLICK_CELL" || a2.type === "CLICK_CELL_MODIFIER") selCourante = a2.cell
        else if (a2.type === "GOTO_REF") selCourante = a2.ref
        else if (a2.type === "DRAG_RANGE") selCourante = a2.range
        /* UNE COLONNE ET UNE LIGNE ENTIÈRES AUSSI. « Masquer », « Largeur de
           colonne », « Insérer » et « Supprimer » ne font RIEN si la sélection
           n'est pas reconnue comme colonne ou ligne : `getSelectionKind` exige
           qu'elle aille d'un bout à l'autre. Les quatre chapitres du module 4
           sélectionnent à une étape et agissent à la suivante — reprendre là
           sans la sélection rendait le bouton muet, pour la démonstration comme
           pour l'apprenant. */
        else if (a2.type === "SELECT_COLUMN") selCourante = `col:${a2.column}`
        else if (a2.type === "SELECT_ROW") selCourante = `ligne:${a2.row}`
      }
      for (let k = 0; k < jusqua && k < steps.length; k++) {
        const s = steps[k]
        if (!s) continue
        suivreSelection(s)
        if (s.setup?.cells) grid.applyCells(s.setup.cells)
        const a = s.action
        const ecrites: Record<string, CellState> = {}
        if (a.type === "TYPE" && a.target !== "formula-bar" && a.accept?.length) {
          // La première écriture acceptée est la réponse de référence : c'est
          // celle que la démonstration montre déjà quand l'apprenant bloque.
          const rep = a.accept[0]
          ecrites[a.target] = rep.trim().startsWith("=") ? { f: rep } : { v: rep }
        }
        /**
         * UNE ÉTAPE `EXPECT_MACRO` DÉJÀ FRANCHIE A PRODUIT SON EFFET.
         *
         * Elle n'écrit rien par elle-même : c'est la macro, exécutée par
         * l'apprenant, qui a rempli les cellules. La reprise doit donc les
         * restituer — sans quoi `m27-e02` rouvert à l'étape 4 demandait un
         * « total général » sur un tableau dont les deux totaux mensuels
         * n'existaient pas. On en profite pour reposer les métadonnées
         * déclarées — le raccourci surtout — sur la macro DÉJÀ enregistrée,
         * sans jamais toucher à ses instructions : elles viennent du geste de
         * l'apprenant, pas d'une déclaration.
         */
        if (a.type === "EXPECT_MACRO" && a.macro) {
          for (const [ref, att] of Object.entries(a.macro.effet ?? {})) {
            const f2 = (att as { f?: string; v?: unknown }).f
            const v2 = (att as { f?: string; v?: unknown }).v
            if (f2 !== undefined) ecrites[ref] = { f: f2 }
            else if (v2 !== undefined) ecrites[ref] = { v: v2 as string | number }
          }
          const nomM = a.macro.name
          if (nomM) {
            const maj = (l: MacroState[]) =>
              l.map((m) =>
                m.name === nomM
                  ? {
                      ...m,
                      shortcut: a.macro?.shortcut ?? m.shortcut,
                      relative: a.macro?.relative ?? m.relative,
                    }
                  : m,
              )
            macrosRef.current = maj(macrosRef.current)
            for (let i2 = 0; i2 < macrosRejouees.length; i2++) {
              if (macrosRejouees[i2].name === nomM) {
                macrosRejouees[i2] = {
                  ...macrosRejouees[i2],
                  shortcut: a.macro.shortcut ?? macrosRejouees[i2].shortcut,
                  relative: a.macro.relative ?? macrosRejouees[i2].relative,
                }
              }
            }
          }
        }
        if (a.type === "EXPECT_STATE") {
          for (const [ref, att] of Object.entries(a.cells)) {
            const formule = att.f ?? att.anyOf?.[0]
            if (formule && formule.trim().startsWith("=")) ecrites[ref] = { f: formule }
            else if (formule !== undefined) ecrites[ref] = { v: formule }
            else if (att.v !== undefined) ecrites[ref] = { v: att.v }
            // Attente vide = l'étape effaçait la cellule : on l'efface aussi.
            else ecrites[ref] = { v: "" }
          }
        }
        if (Object.keys(ecrites).length) grid.applyCells(ecrites)

        /* ── l'enregistreur, rejoué à sec ─────────────────────────────────── */
        if (a.type === "RECORD_MACRO" && a.expect === "started") {
          const d = macroDeclaree(k)
          const r = demarrerEnregistrement(d?.name ?? `Macro${macrosRejouees.length + 1}`, {
            shortcut: d?.shortcut,
            relative: d?.relative,
            // L'ancre donne leur sens aux références relatives : c'est la
            // sélection au démarrage, celle que l'étape précédente a posée.
            ancre: selCourante,
            existantes: [...macrosRef.current, ...macrosRejouees],
          })
          if (r.ok) enrRejeu = r.etat
        } else if (a.type === "RECORD_MACRO" && a.expect === "stopped" && enrRejeu) {
          macrosRejouees.push(arreterEnregistrement(enrRejeu))
          enrRejeu = null
        } else if (enrRejeu) {
          // Tout ce que l'étape a produit entre le démarrage et l'arrêt entre
          // dans la macro, dans l'ordre : c'est ce que l'apprenant a fait.
          /**
           * TOUT CE QUE L'ENREGISTREUR VIVANT TRANSCRIT, LA REPRISE AUSSI.
           *
           * Le direct transcrit trois choses : la saisie, la SÉLECTION (clic de
           * cellule ET glissé de plage) et le BOUTON de mise en forme
           * (`gesteDepuisControle`). La reprise n'en connaissait que deux : sur
           * `m27-l01`, les étapes « glissez A10:D10 », « gras » et
           * « remplissage » ne laissaient aucune trace, la macro
           * `Pied_de_tableau` se reconstruisait avec 4 instructions au lieu de
           * 7, et l'étape qui l'exécute — 5 instructions minimum, dont
           * `Selection.Font.Bold = True` — ne pouvait plus être atteinte.
           */
          if (a.type === "CLICK_CELL") enrRejeu = transcrire(enrRejeu, { kind: "select", ref: a.cell })
          if (a.type === "DRAG_RANGE" && a.range) enrRejeu = transcrire(enrRejeu, { kind: "select", ref: a.range })
          if (a.type === "GOTO_REF" && a.ref) enrRejeu = transcrire(enrRejeu, { kind: "select", ref: a.ref })
          for (const [ref, cel] of Object.entries(ecrites)) {
            const c2 = cel as { f?: string; v?: unknown }
            enrRejeu = transcrire(enrRejeu, { kind: "select", ref })
            enrRejeu = transcrire(
              enrRejeu,
              c2.f !== undefined
                ? { kind: "formula", ref, formula: c2.f }
                : { kind: "value", ref, value: (c2.v ?? "") as string | number },
            )
          }
          if (a.type === "EXPECT_FORMAT") {
            for (const [ref, att] of Object.entries(a.cells ?? {})) {
              const g2 = gesteDepuisControle(
                (att as { numberFormat?: string }).numberFormat ? "acc-format-monetaire" : "acc-gras",
                ref,
              )
              if (g2) enrRejeu = transcrire(enrRejeu, g2)
            }
          }
          /* Le bouton du ruban, exactement comme en direct : sur la sélection
             du moment, lue AVANT que l'effet ne la déplace. */
          if (a.type === "CLICK_CONTROL" && a.control) {
            const g3 = gesteDepuisControle(a.control, selCourante || "A1")
            if (g3) enrRejeu = transcrire(enrRejeu, g3)
          }
        }
        if (a.type === "DEFINE_NAME" && a.ref) grid.defineName(a.name, a.ref)
        /* Le commentaire posé par une étape franchie : sans lui, « supprimez le
           commentaire » n'a rien à supprimer (m25-l02). */
        if (s.setup?.note?.texte) {
          try {
            grid.setNote(s.setup.note.ref, s.setup.note.texte)
          } catch {
            /* note refusée : la reprise continue */
          }
        }
        /* Le FILTRE des étapes franchies : sans lui, « effacez le filtre » se
           rejoue sur un tableau qui n'en porte aucun (m19-e01). */
        if (a.type === "CLICK_CONTROL" && a.control === "don-filtrer") {
          try {
            /* La plage du TABLEAU, pas la sélection : au moment du clic la
               sélection peut être une cellule isolée — c'est exactement ce que
               fait `don-filtrer` en direct. */
            if (!grid.aUnFiltre()) grid.createFilter(scenario.workbook.filterRange ?? etendue)
          } catch {
            /* filtre refusé : la reprise continue */
          }
        }
        if (a.type === "FILTER_COLUMN" && a.column) {
          try {
            grid.setFilterCriteria(a.column, a.values ?? [])
          } catch {
            /* filtre refusé : la reprise continue */
          }
        }
        /* …ET LE RETRAIT. Rejouer les poses sans rejouer l'effacement laissait
           le tableau filtré à une étape qui vient justement de le déplier : les
           lignes restaient masquées, et les cellules qu'elles portent — H3 du
           bloc de synthèse — se réduisaient à un rectangle de hauteur nulle
           (m19-e03). */
        /* Les VOLETS FIGÉS d'une étape franchie : sans eux, « libérez les
           volets » se rejoue sur une feuille qui n'en a aucun (m25-l01). */
        if (a.type === "CLICK_CONTROL" && a.control === "aff-figer-volets") {
          try {
            grid.setFreeze(s.setup?.freeze?.rows ?? 1, s.setup?.freeze?.cols ?? 0)
          } catch {
            /* volets refusés : la reprise continue */
          }
        }
        if (a.type === "CLICK_CONTROL" && a.control === "aff-liberer-volets") {
          try {
            grid.cancelFreeze()
          } catch {
            /* volets déjà libres */
          }
        }
        if (a.type === "CLICK_CONTROL" && a.control === "don-effacer-filtre") {
          try {
            grid.removeFilter()
          } catch {
            /* filtre déjà absent */
          }
        }
        /* La validation posée par une étape franchie. */
        if (s.setup?.dv) {
          try {
            grid.addValidation(s.setup.dv.range, s.setup.dv.rule)
          } catch {
            /* règle refusée : la reprise continue */
          }
        }
        /* Une règle de mise en forme conditionnelle posée à une étape franchie :
           sans elle, « effacez toutes les règles de la colonne » n'a rien à
           effacer, et le bouton paraît mort (m11-l03). */
        if (a.type === "CLICK_CONTROL" && a.control === "acc-mfc-regle" && s.setup?.cf) {
          try {
            grid.addConditionalRule(s.setup.cf.range, s.setup.cf.rule)
          } catch {
            /* règle refusée : la reprise continue */
          }
        }
        // Un format posé par l'apprenant à une étape déjà franchie fait partie
        // de son travail : sans ce rejeu, la reprise rouvrait le chapitre avec
        // les colonnes démonétisées, et la remise d'aplomb les reposait ensuite
        // en annonçant une réparation que personne n'avait rendue nécessaire.
        if (a.type === "EXPECT_FORMAT" && a.cells) {
          for (const [ref, att] of Object.entries(a.cells)) {
            const fam = (att as { numberFormat?: string }).numberFormat
            if (!fam) continue
            const motif = MOTIF_PAR_FAMILLE[fam]
            if (!motif) continue
            try {
              grid.setNumberFormat([ref], motif)
            } catch {
              /* un motif refusé ne doit pas empêcher la reprise */
            }
          }
        }
        // Une étape déjà faite a produit son modèle : on le pose.
        appliquerModeles(s, true)
      }
      // Un enregistrement resté ouvert appartient à l'étape en cours : on le
      // laisse tel quel, c'est l'apprenant qui l'arrêtera.
      if (macrosRejouees.length || macrosRef.current.length) {
        const suite = [
          ...macrosRef.current.filter((m) => !macrosRejouees.some((r) => r.name === m.name)),
          ...macrosRejouees,
        ]
        macrosRef.current = suite
        setMacros(suite)
        const derniere = macrosRejouees[macrosRejouees.length - 1] ?? suite[suite.length - 1]
        if (derniere) {
          macroCouranteRef.current = derniere.name
          setMacroCourante(derniere.name)
          codeMacroRef.current = genererCode(derniere)
          setCodeMacro(codeMacroRef.current)
        }
      }
      if (enrRejeu) {
        enregistrementRef.current = enrRejeu
        setEnregistrement(enrRejeu)
      }
      /**
       * ET LA SÉLECTION, POSÉE POUR DE VRAI.
       *
       * On la suivait pour l'ancre de la macro sans jamais la rendre à la
       * grille : la reprise laissait le curseur en A1. Sur `m27-e01`, la
       * consigne « placez-vous en D21 » avait été franchie, et la macro
       * relative exécutée juste après repartait du haut de la feuille — le
       * total s'inscrivait à côté de la première ligne du tableau de juillet.
       * Une reprise doit rendre l'endroit où l'on était, pas seulement ce qu'on
       * avait écrit.
       */
      /* Et la feuille de l'étape VISÉE : la reprise s'arrête avant elle, donc
         c'est le dernier changement rencontré qui fait foi. */
      {
        const s2 = steps[jusqua]
        const f = (s2?.setup as { activeSheet?: string } | undefined)?.activeSheet
        if (f) allerSurLaFeuille(f)
        else if (s2?.action.type === "SELECT_SHEET") {
          /* L'étape à jouer DEMANDE le changement : on ne le fait pas à sa
             place, c'est son geste. */
        }
      }
      if (selCourante) {
        try {
          // `col:B` / `ligne:6` passent par le même résolveur que la
          // démonstration : lui seul connaît les bornes réelles de la feuille.
          const m = /^(col|ligne):(.+)$/.exec(selCourante)
          if (m) {
            const b2 = grid.getBornes()
            selCourante = m[1] === "col"
              ? `${m[2]}1:${m[2]}${b2.rows}`
              : `A${m[2]}:${columnIndexToLetter(b2.cols - 1)}${m[2]}`
          }
          grid.setSelection(selCourante)
          setSelection(selCourante)
        } catch {
          /* référence devenue invalide : la sélection par défaut fera l'affaire */
        }
      }
    },
    [steps, appliquerModeles],
  )

  /**
   * REMETTRE LA FEUILLE D'APLOMB.
   *
   * Le classeur d'un chapitre se construit d'étape en étape, et rien
   * n'empêchait un apprenant de vider une cellule produite plus tôt, d'y écrire
   * n'importe quoi ou d'y poser un format absurde. Tout ce qui suivait se
   * déroulait alors sur un classeur faux, SANS UN MESSAGE : la facture du
   * module 9 totalisait 495 au lieu de 3 165, et la leçon enchaînait remise,
   * TVA et net à payer sur ce faux total.
   *
   * On ne remet donc en place que ce qui a réellement divergé de l'état
   * d'aplomb (`lib/simulation/aplomb.ts`), jamais tout le classeur : une remise
   * à zéro brutale effacerait le travail légitime des étapes précédentes, et
   * réécrirait `=SOMME(B4:B7)` par-dessus le `=B4+B5+B6+B7` de l'apprenant.
   *
   * DEUX PORTÉES POUR LE CONTENU, et c'est volontaire :
   *
   *  · `"dependances"` au changement d'étape — seules les cellules dont la
   *    nouvelle étape a besoin. Le reste ne gêne personne, et l'effacer
   *    reviendrait à supprimer l'exploration de l'apprenant.
   *
   *  · `"tout"` avant une démonstration — l'apprenant regarde l'écran ENTIER.
   *    Un total faux trois lignes plus haut rend la démonstration illisible
   *    même si l'étape courante ne le lit pas. C'est le défaut que Samuel a
   *    trouvé le 31/07 : « Montrez-moi » annonçait « voici la réponse » puis
   *    affichait 495, parce que la démonstration jouait sur le classeur abîmé.
   *
   * LE FORMAT DE NOMBRE, LUI, SE TRAITE TOUJOURS EN PORTÉE LARGE. Un pourcentage
   * posé sur un total de durées affiche « 131,25% » : ce nombre MENT, à l'écran,
   * en permanence, que l'étape suivante le lise ou non — et c'est exactement le
   * « 11400,00% » que Samuel a filmé. Le retirer ne détruit jamais rien : sur
   * 17 525 cellules déclarées dans les 246 scénarios, 22 seulement portent un
   * format de nombre, et un format que l'apprenant DOIT poser est déclaré par
   * l'étape `EXPECT_FORMAT` qui le lui demande — il devient donc d'aplomb dès
   * qu'elle est franchie. Les autres attributs (gras, couleur, bordures) ne
   * sont jamais touchés : ils ne font mentir aucun chiffre.
   *
   * Le verrou d'observation est indispensable : `applyCells` fait émettre à la
   * grille un `stateChange` 350 ms plus tard, qui ferait croire l'étape
   * courante franchie et sauterait à la suivante.
   */
  /**
   * Ce qu'on dit à l'apprenant. En ÉVALUATION on ne nomme pas les cellules :
   * « j'ai remis D5 en ordre » désignerait la cellule qui compte, donc une
   * partie de la réponse. On répare quand même — noter quelqu'un sur un
   * classeur cassé serait pire — mais sans détailler.
   */
  const direAplomb = useCallback(
    (ds: Divergence[]): string | null => {
      if (!ds.length) return null
      if (mode === "EVALUATION") {
        // Aucune cellule nommée — ce serait désigner la réponse. Mais le geste
        // se dit quand même : « remis en ordre » sur une feuille dont on vient
        // seulement d'effacer des cases hors sujet est faux, et c'est
        // précisément le cas où l'apprenant voit son contenu disparaître.
        const parasites = ds.filter((d) => d.motif === "parasite").length
        if (parasites === ds.length)
          return "J'ai vidé des cellules qui ne font pas partie de l'exercice."
        if (parasites)
          return "J'ai remis la feuille en ordre et vidé des cellules qui ne font pas partie de l'exercice."
        return "J'ai remis la feuille en ordre pour que la suite reste juste."
      }
      return phraseAplomb(ds)
    },
    [mode],
  )

  /**
   * `handleAction` est défini plus bas ; le rattrapage doit pouvoir l'appeler
   * sans créer de dépendance circulaire entre les deux rappels mémoïsés.
   */
  const handleActionRef = useRef<
    ((o: ObservedAction, options?: { siJuste?: boolean }) => void) | null
  >(null)
  /**
   * `appliquerJugement` est défini après `handleAction`, qui doit pourtant
   * l'appeler une fois le verdict revenu. La référence évite à la fois la
   * dépendance circulaire et la capture d'une version périmée.
   */
  const appliquerJugementRef = useRef<
    ((s: SimulationStep, o: ObservedAction, j: JugementEtape) => void) | null
  >(null)

  /**
   * RATTRAPAGE APRÈS LE VERROU.
   *
   * Pendant qu'une remise d'aplomb écrit, les observations sont ignorées —
   * sinon l'écriture ferait croire l'étape franchie. Mais une réponse tapée
   * dans cette fenêtre était jetée EN SILENCE, et la retaper ne réémettait
   * rien : la grille n'émet que sur changement. L'apprenant restait devant une
   * feuille parfaitement juste avec une étape figée, sans indice, et la seule
   * issue était d'effacer puis de retaper.
   *
   * On relit donc l'état une fois le verrou levé, et on ne redéclenche QUE si
   * la réponse est effectivement bonne — d'où `siJuste`. Une observation qui
   * échouerait compterait une faute que l'apprenant n'a pas commise.
   *
   * Le filtre a migré DANS `handleAction` : en évaluation notée le scénario ne
   * porte plus les réponses, l'atelier ne peut donc plus pré-juger lui-même. Le
   * verdict revient du serveur, et `siJuste` fait le tri au retour.
   */
  const reobserverEtat = useCallback(() => {
    const grid = gridRef.current
    const s = stepRef.current
    if (!grid || !s || resoluRef.current) return
    const a = s.action
    let obs: ObservedAction | null = null
    if (a.type === "TYPE" && a.target !== "formula-bar") {
      const formule = grid.getFormula(a.target) ?? ""
      const valeur = grid.getValue(a.target)
      const text = formule || (valeur == null ? "" : String(valeur))
      if (!text) return
      obs = {
        kind: "typed",
        target: a.target,
        text,
        displayed: grid.getDisplayValue(a.target),
        channel: "keyboard",
        computed: valeur,
      }
    } else if (a.type === "EXPECT_STATE") {
      const readings: Record<string, { formula: string; value: unknown }> = {}
      for (const ref of cellulesARelever(a.cells ? Object.keys(a.cells) : null)) {
        try {
          readings[ref] = { formula: grid.getFormula(ref), value: grid.getValue(ref) }
        } catch {
          /* hors bornes : on relève ce qu'on peut */
        }
      }
      obs = { kind: "stateChange", readings }
    }
    if (!obs) return
    handleActionRef.current?.(obs, { siJuste: true })
  }, [])

  /** Lecture d'une cellule à la forme du cliché : la formule prime sur la valeur. */
  const lireCelluleCliche = useCallback((grid: GridApi, ref: string): CelluleCliche => {
    const f = grid.getFormula(ref)
    /* Le « = » est CONSERVÉ : `applyCells` ne reconnaît une formule qu'à ce
       signe, et `frToEngine` en a besoin. Le retirer transformait la remise en
       écriture de texte — sur `m05-l03`, `=B11*B13` revenait en « 447,3 », le
       résultat figé à la place du calcul. */
    if (f) return { f: f.startsWith("=") ? f : `=${f}` }
    const v = grid.getValue(ref)
    return v === null || v === undefined || v === "" ? {} : { v }
  }, [])

  /**
   * Prend le cliché. La ZONE est celle de la remise d'aplomb : le rectangle
   * englobant de tout ce que le scénario déclare quelque part.
   *
   * On garde la VALEUR telle que le moteur la tient, jamais sa forme texte :
   * `String(21.5)` donne « 21.5 », que la grille relit comme le 21 mai. C'est
   * le piège de `commeTape()`, et il attend au tournant tout code qui
   * sérialise une cellule pour la réécrire ensuite.
   */
  const prendreClicheDemo = useCallback((): ClicheDemo => {
    const grid = gridRef.current
    const notes: Record<string, string> = grid
      ? (() => { try { return grid.getNotes() } catch { return {} } })()
      : {}
    const cellules: Record<string, CelluleCliche> = {}
    const formats: Record<string, string> = {}
    const visuels: Record<string, string> = {}
    const dimensions: ClicheDemo["dimensions"] = {}
    if (grid) {
      let active: string | undefined
      try {
        active = grid.getSheets().find((f) => f.active)?.name
      } catch {
        /* la grille peut ne pas être prête */
      }
      const { zone } = zoneClasseur(steps, scenario.workbook, active)
      if (zone) {
        /* CHAQUE feuille, pas seulement l'active : le rejeu doit rendre à la
           feuille « Ventes » les largeurs de « Ventes », et à « Synthèse »
           celles de « Synthèse ». */
        try {
          Object.assign(dimensions, grid.getDimensionsFeuilles(zone.c1, zone.c2, zone.r1, zone.r2))
        } catch {
          /* squelette pas prêt */
        }
      }
      /**
       * La zone du TABLEAU CROISÉ en plus.
       *
       * `zoneClasseur` ne connaît que ce que le scénario DÉCLARE ; les cellules
       * qu'un tableau croisé écrit — « Somme de Montant », « Étiquettes de
       * lignes », les totaux — n'y figurent pas. Sans elles, le cliché ne les
       * voyait pas, donc ne les remettait pas, et le rejeu repartait d'un
       * emplacement vidé.
       */
      const refs = refsDeLaZone(zone)
      /* Ce que l'ÉTAPE déclare attendre : les cellules d'un effet de macro, la
         plage d'un tri, les cases d'un tableau croisé. `zoneClasseur` ne les
         connaît pas toutes, et une cellule non relevée ne peut pas être remise
         — les macros du module 27 laissaient leur écriture à l'écran d'un rejeu
         à l'autre. */
      const ajouterRef = (r: string) => {
        const R = String(r).toUpperCase()
        if (/^[A-Z]{1,3}\d{1,5}$/.test(R) && !refs.includes(R)) refs.push(R)
      }
      /**
       * TOUTE référence que l'étape nomme, quelle que soit la famille.
       *
       * L'énumération par famille laissait toujours un trou : `goalSeek.inputRef`
       * n'y était pas, et « Valeur cible » réécrivait B3 sans que le cliché
       * puisse la rendre — B3 partait de 45 et le rejeu repartait de 50,22. On
       * parcourt donc l'action et le `setup` en entier : toute chaîne qui a la
       * forme d'une référence ou d'une plage entre dans le cliché, y compris les
       * CLÉS (`cells`, `effet`, `pivot.cells` sont indexés par référence).
       */
      const moissonner = (v: unknown, profondeur = 0): void => {
        if (profondeur > 6) return
        if (typeof v === "string") {
          if (/^[A-Z]{1,3}\d{1,5}(:[A-Z]{1,3}\d{1,5})?$/i.test(v)) {
            for (const r of cellsOf(v.toUpperCase())) ajouterRef(r)
          }
          return
        }
        if (Array.isArray(v)) {
          for (const e of v) moissonner(e, profondeur + 1)
          return
        }
        if (v && typeof v === "object") {
          for (const [cle, val] of Object.entries(v as Record<string, unknown>)) {
            moissonner(cle, profondeur + 1)
            moissonner(val, profondeur + 1)
          }
        }
      }
      const acte = stepRef.current?.action as Record<string, unknown> | undefined
      moissonner(acte)
      moissonner(stepRef.current?.setup)
      const posePivot = posePivotRef.current?.range
      if (posePivot) {
        /* AVEC MARGE. Modifier un tableau croisé le fait GRANDIR : ajouter un
           champ en colonnes ajoute des colonnes, poser un filtre décale de deux
           lignes. Relever la seule pose du départ laissait ces cellules-là hors
           du cliché — ni restaurées, ni effaçables — et le rejeu repartait avec
           les restes de la version précédente. */
        const p = parseRange(posePivot)
        if (p) {
          const large = formatRange({
            startRow: p.startRow, startCol: p.startCol,
            endRow: p.endRow + 8, endCol: p.endCol + 8,
          })
          for (const r of cellsOf(large)) if (!refs.includes(r)) refs.push(r)
        }
      }
      for (const ref of refs) {
        try {
          cellules[ref] = lireCelluleCliche(grid, ref)
          formats[ref] = grid.getNumberFormat(ref) ?? ""
          visuels[ref] = JSON.stringify(grid.getStyleBrut(ref) ?? null)

        } catch {
          /* référence hors bornes après un tri : on la laisse de côté */
        }
      }
    }
    return {
      cellules,
      formats,
      onglet: ongletRef.current,
      boite: boiteRef.current,
      menuFormat: menuFormatRef.current,
      presseP: pressePRef.current,
      plageSomme: plageSommeRef.current,
      // Copies défensives : `modifierGraphique` et `modifierTcd` rendent de
      // nouveaux objets, mais les tableaux internes sont partagés. Un cliché qui
      // pointerait sur eux se ferait modifier sous les pieds.
      graphique: graphiqueRef.current ? structuredClone(graphiqueRef.current) : null,
      tcd: tcdRef.current ? structuredClone(tcdRef.current) : null,
      reglages: structuredClone(reglagesRef.current),
      macros: macrosRef.current.map((m) => ({ ...m, statements: [...m.statements] })),
      macroCourante: macroCouranteRef.current,
      reglesMfc: grid ? (() => { try { return grid.countConditionalRules() } catch { return 0 } })() : 0,
      plageMfc: stepRef.current?.setup?.cf?.range ?? null,
      reglesAPoser: steps
        .slice(0, index)
        .flatMap((s) =>
          s.action.type === "CLICK_CONTROL" && s.action.control === "acc-mfc-regle" && s.setup?.cf
            ? [{ range: s.setup.cf.range, rule: s.setup.cf.rule }]
            : [],
        ),
      noms: grid ? (() => { try { return grid.getDefinedNames().map((n) => n.name) } catch { return [] } })() : [],
      dimensions,
      filtrePose: grid ? (() => { try { return grid.aUnFiltre() } catch { return false } })() : false,
      volets: grid
        ? (() => { try { return grid.getFrozen() ?? { rows: 0, cols: 0 } } catch { return { rows: 0, cols: 0 } } })()
        : { rows: 0, cols: 0 },
      fusions: grid ? (() => { try { return grid.getFusions() } catch { return [] } })() : [],
      visuels,
      notes,
      filtreAPoser: (() => {
        const passees = steps.slice(0, index)
        if (!passees.some((s) => s.action.type === "CLICK_CONTROL" && s.action.control === "don-filtrer")) return null
        return {
          range: scenario.workbook.filterRange ?? "",
          colonnes: passees.flatMap((s) =>
            s.action.type === "FILTER_COLUMN" && s.action.column
              ? [{ column: s.action.column, values: s.action.values ?? [] }]
              : [],
          ),
        }
      })(),
      validations: steps
        .slice(0, index)
        .flatMap((s) => (s.setup?.dv ? [{ range: s.setup.dv.range, rule: s.setup.dv.rule }] : [])),
      plageValidee: stepRef.current?.setup?.dv?.range ?? null,
      posePivot: posePivotRef.current?.range ?? null,
      feuilleCliche: grid
        ? (() => { try { return grid.getSheets().find((f) => f.active)?.name ?? null } catch { return null } })()
        : null,
      enregistrement: enregistrementRef.current ? structuredClone(enregistrementRef.current) : null,
      feuilles: grid ? (() => { try { return grid.getSheets().map((f) => f.name) } catch { return [] } })() : [],
      feuilleActive: grid
        ? (() => { try { return grid.getSheets().find((f) => f.active)?.name ?? null } catch { return null } })()
        : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, lireCelluleCliche])

  /**
   * Repose le cliché : on ne réécrit QUE ce qui a changé.
   *
   * Réécrire tout serait plus simple et beaucoup plus dangereux — chaque
   * `applyCells` provoque un recalcul, un `stateChange`, et une salve de
   * francisation. Sur une zone de 700 cellules cela ferait un à-coup visible
   * là où, dans les faits, deux ou trois cellules ont bougé.
   */
  const reposerClicheDemo = useCallback(
    (c: ClicheDemo) => {
      /**
       * LE VERROU D'ABORD, TOUJOURS.
       *
       * La repose du tableau croisé réécrit ses cellules dans la feuille — sans
       * quoi les chiffres de la version transformée resteraient à l'écran — et
       * la grille émet son `stateChange` 350 ms plus tard. Poser le verrou
       * APRÈS ces écritures laisserait l'observation valider l'étape et sauter
       * à la suivante en pleine explication : exactement le défaut que ce
       * cliché est censé faire disparaître.
       */
      verrouillerDemo(1500)
      setOnglet(c.onglet)
      ongletRef.current = c.onglet
      setBoite(c.boite)
      boiteRef.current = c.boite
      setMenuFormat(c.menuFormat)
      setPresseP(c.presseP)
      poserPlageSomme(c.plageSomme)
      /* Les modèles. `poserTcdDansFeuille` réécrit aussi les cellules du
         tableau — c'est indispensable : reposer le seul état laisserait à
         l'écran les chiffres de la version transformée. */
      poserGraphique(c.graphique ? structuredClone(c.graphique) : null)
      poserReglages(structuredClone(c.reglages))
      /* L'ORDRE COMPTE : arrêter d'abord, reposer ensuite.
         `arreterMacro` AJOUTE la macro enregistrée à la liste et la désigne
         comme courante. Appelé après la repose, il défaisait exactement ce
         qu'on venait de remettre — la liste repartait avec « Macro2 » en trop. */
      /* On rend l'enregistreur tel qu'il était : arrêté s'il l'était, EN COURS
         s'il l'était — avec sa macro en construction, son ancre et ses gestes
         déjà transcrits. */
      if (!c.enregistrement && enregistrementRef.current) arreterMacroRef.current?.()
      else if (c.enregistrement) {
        const repris = structuredClone(c.enregistrement)
        enregistrementRef.current = repris
        setEnregistrement(repris)
      }
      macrosRef.current = c.macros.map((m) => ({ ...m, statements: [...m.statements] }))
      setMacros(macrosRef.current)
      macroCouranteRef.current = c.macroCourante
      setMacroCourante(c.macroCourante)
      /**
       * LE TABLEAU CROISÉ SE REPOSE, IL NE SE RECOPIE PAS.
       *
       * Ses cellules sont DÉRIVÉES de son état et de la source : « Somme de
       * Montant », les libellés de lignes, les totaux. Reposer le seul état
       * laissait à l'écran la disposition de la version transformée — sur
       * `m20-l01`, retirer le champ Trimestre fait passer le tableau de vingt
       * lignes à cinq, et le rejeu repartait des cinq. On le repose donc
       * vraiment, ce qui efface l'ancienne emprise et réécrit la bonne ; le
       * cliché des cellules, appliqué juste après, a le dernier mot.
       */
      const tcdVoulu = c.tcd ? structuredClone(c.tcd) : null
      if (tcdVoulu) poserTcdDansFeuille(tcdVoulu)
      else {
        /* AUCUN TABLEAU AU DÉPART : celui qui est là a été créé par le passage
           précédent. Reposer le seul état à `null` laissait ses cellules —
           « Étiquettes de lignes », les totaux — à l'écran, et le rejeu
           « insérez un tableau croisé » se jouait sur un tableau déjà posé. */
        const g0 = gridRef.current
        if (g0 && posePivotRef.current?.range) {
          const vides: Record<string, CelluleCliche> = {}
          for (const ref of cellsOf(posePivotRef.current.range)) vides[ref] = {}
          g0.applyCells(vides as Parameters<typeof g0.applyCells>[0])
          posePivotRef.current = null
        }
        tcdRef.current = null
        setTcd(null)
      }
      const grid = gridRef.current
      if (!grid) return
      /* Les règles de mise en forme conditionnelle s'EMPILENT : `acc-mfc-regle`
         en ajoute une par pression, et rien ne les retire. On efface la plage
         que l'étape déclare — celle-là même que la démonstration va garnir —
         uniquement quand il y en a plus qu'au départ, pour ne jamais toucher
         aux règles que l'apprenant a posées ailleurs. */
      try {
        /**
         * REMISE EXACTE, PAS AJUSTEMENT.
         *
         * Effacer la seule plage de l'étape retirait AUSSI la règle posée par
         * une étape antérieure — « surlignez les valeurs > 200 » et
         * « surlignez les < 100 » portent sur la même colonne. Le compte tombait
         * à 0 au lieu de 1 et le rejeu montrait la pose sur une colonne vierge
         * (m11-e02, m11-l01, m11-l03, m11-l04). On efface donc toutes les plages
         * concernées, puis on repose celles des étapes déjà franchies.
         */
        if (grid.countConditionalRules() !== c.reglesMfc) {
          grid.clearAllConditionalRules()
          for (const r of c.reglesAPoser) grid.addConditionalRule(r.range, r.rule)
        }
      } catch {
        /* le moteur peut refuser : ne jamais casser la leçon pour ça */
      }
      /* Les noms de plage créés par le passage précédent : `DEFINE_NAME` en
         ajoute un à chaque fois, et rien ne les retirait. */
      try {
        for (const n of grid.getDefinedNames()) if (!c.noms.includes(n.name)) grid.deleteName(n.name)
      } catch {
        /* un nom protégé ne doit pas interrompre la démonstration */
      }
      /* Les feuilles ajoutées par le passage précédent : on les retire, puis on
         revient sur celle d'où la démonstration était partie. Sans cela le geste
         « Nouvelle feuille » empilait une feuille par rejeu. */
      if (c.feuilles.length) {
        try {
          /**
           * ON REVIENT D'ABORD, ON SUPPRIME ENSUITE.
           *
           * Supprimer la feuille ACTIVE laisse Univer avec une référence morte :
           * « Cannot destructure property rowData of this._worksheetData as it
           * is null » au premier accès suivant. Mesuré sur `m15-l02`, où la
           * démonstration ajoute une feuille — donc l'active — que le rejeu doit
           * retirer. On se replace sur une feuille du départ avant de toucher
           * aux autres.
           */
          if (c.feuilleActive && grid.getSheets().some((f) => f.name === c.feuilleActive)) {
            grid.activateSheet(c.feuilleActive)
          }
          const active = grid.getSheets().find((f) => f.active)?.name
          for (const f of grid.getSheets()) {
            if (c.feuilles.includes(f.name) || f.name === active) continue
            grid.deleteSheet(f.name)
          }
          // Si l'active était justement une feuille à retirer, on repart de la
          // bonne puis on la supprime enfin.
          if (active && !c.feuilles.includes(active) && c.feuilleActive) {
            grid.activateSheet(c.feuilleActive)
            grid.deleteSheet(active)
          }
        } catch {
          /* une suppression refusée ne doit pas interrompre la démonstration */
        }
      }
      /* Un filtre posé par le passage précédent : « cliquez Filtrer » doit
         retrouver une feuille sans filtre, sinon le geste ne montre rien. */
      try {
        if (!c.filtrePose && grid.aUnFiltre()) grid.removeFilter()
        /* Et l'inverse : « effacer le filtre » est justement le geste montré.
           Le rejeu doit donc repartir d'un tableau FILTRÉ. */
        else if (c.filtrePose && !grid.aUnFiltre() && c.filtreAPoser?.range) {
          grid.createFilter(c.filtreAPoser.range)
          for (const col of c.filtreAPoser.colonnes) grid.setFilterCriteria(col.column, col.values)
        }
      } catch {
        /* le moteur peut refuser : ne jamais casser la leçon */
      }
      /* La validation de données : on retire celle que le passage précédent a
         posée, et on repose celles des étapes déjà franchies. */
      try {
        if (c.plageValidee) grid.clearValidation(c.plageValidee)
        for (const v of c.validations) grid.addValidation(v.range, v.rule)
      } catch {
        /* une règle refusée ne doit pas casser la leçon */
      }
      /* Les commentaires : rendus À L'IDENTIQUE, présence ET absence. Le relevé
         couvre TOUTE la feuille : celui que la démonstration vient de poser
         n'est pas dans le cliché, il doit donc être retiré (m25-e01, m25-l02). */
      try {
        const maintenant = grid.getNotes()
        for (const ref of Object.keys(maintenant)) {
          if (!c.notes[ref]) grid.deleteNote(ref)
        }
        for (const [ref, texte] of Object.entries(c.notes)) {
          if (texte && maintenant[ref] !== texte) grid.setNote(ref, texte)
        }
      } catch {
        /* une note refusée ne doit pas casser la leçon */
      }
      /* Les fusions : rendues à l'identique, présence ET absence. */
      try {
        const avant = new Set(c.fusions)
        const maintenant = grid.getFusions()
        for (const f of maintenant) if (!avant.has(f)) grid.defusionner(f)
        const restantes = new Set(grid.getFusions())
        for (const f of c.fusions) if (!restantes.has(f)) grid.fusionner(f)
      } catch {
        /* le moteur peut refuser : ne jamais casser la leçon */
      }
      /* Les volets : les rendre EXACTEMENT, y compris « aucun ». `cancelFreeze`
         est le seul chemin qui les lève ; `setFreeze(0, 0)` laisse Univer sur
         une ligne figée fantôme. */
      try {
        const v = grid.getFrozen() ?? { rows: 0, cols: 0 }
        if (v.rows !== c.volets.rows || v.cols !== c.volets.cols) {
          if (!c.volets.rows && !c.volets.cols) grid.cancelFreeze()
          else grid.setFreeze(c.volets.rows, c.volets.cols)
        }
      } catch {
        /* le moteur peut refuser : ne jamais casser la leçon */
      }
      /**
       * REVENIR SUR LA FEUILLE DU CLICHÉ AVANT D'ÉCRIRE.
       *
       * Le cliché ne connaît qu'une feuille — la sonde ne lit que l'active. Si
       * la démonstration a changé de feuille (module 15, 21, 22), reposer ses
       * cellules sans revenir d'abord écrirait les valeurs d'une feuille dans
       * une autre. `activateSheet` n'est pas instantané : on vérifie, et on
       * diffère plutôt que de risquer l'écriture croisée.
       */
      const surLaBonneFeuille = () => {
        try {
          return !c.feuilleCliche || grid.getSheets().find((f) => f.active)?.name === c.feuilleCliche
        } catch {
          return true
        }
      }
      if (!surLaBonneFeuille() && c.feuilleCliche) {
        try {
          grid.activateSheet(c.feuilleCliche)
        } catch {
          /* feuille disparue : on ne réécrira rien */
        }
      }
      if (!surLaBonneFeuille()) {
        window.setTimeout(() => reposerClicheDemo(c), 160)
        return
      }
      /* Les dimensions : « Largeur de colonne » et « Masquer » les changent, et
         rien ne les remettait. Une colonne masquée vaut zéro — la reposer, c'est
         la faire réapparaître. */
      for (const [nom, d] of Object.entries(c.dimensions)) {
        for (const [c2, l] of Object.entries(d.colonnes)) {
          grid.setDimensionFeuille(nom, "col", Number(c2) - 1, l)
        }
        for (const [r2, h] of Object.entries(d.lignes)) {
          grid.setDimensionFeuille(nom, "ligne", Number(r2) - 1, h)
        }
      }
      const cells: Record<string, CelluleCliche> = {}
      for (const [ref, attendu] of Object.entries(c.cellules)) {
        try {
          if (!memeCellule(lireCelluleCliche(grid, ref), attendu)) cells[ref] = attendu
        } catch {
          /* référence devenue invalide */
        }
      }
      if (Object.keys(cells).length) grid.applyCells(cells as Parameters<typeof grid.applyCells>[0])

      /**
       * LE STYLE, REPOSÉ À L'IDENTIQUE — ET APRÈS LES VALEURS.
       *
       * On ne compare pas attribut par attribut : on compare le style BRUT et on
       * repose celui du départ. `clearFormat()` remet la cellule à neuf avant, ce
       * qui est le seul moyen de revenir à « alignement général » ou à « aucun
       * format de nombre » — deux états qu'aucun setter n'écrit.
       *
       * Après les valeurs, et différé : écrire une cellule déclenche la
       * francisation, qui repose un format ; poser le style avant se ferait
       * écraser dans la foulée. 360 ms tombe juste après la repose de la remise
       * d'aplomb, qui s'exécute dans le même effet.
       */
      window.setTimeout(() => {
        const g = gridRef.current
        if (!g) return
        for (const [ref, attendu] of Object.entries(c.visuels)) {
          try {
            if (JSON.stringify(g.getStyleBrut(ref) ?? null) !== attendu) {
              g.setStyleBrut(ref, JSON.parse(attendu))
            }
          } catch {
            /* référence devenue invalide */
          }
        }
      }, 360)
    },
    [lireCelluleCliche, poserGraphique, poserPlageSomme, poserReglages, poserTcdDansFeuille, verrouillerDemo],
  )

  /**
   * Une cellule ÉCRITE PAR LE TABLEAU CROISÉ n'est pas un parasite.
   *
   * « Somme de Montant », « Étiquettes de lignes », les totaux : le scénario ne
   * les déclare nulle part — c'est le moteur qui les produit. Elles tombent
   * pourtant dans le rectangle englobant de ce que le scénario déclare, donc
   * `cellulesHorsEtatAplomb` les voyait comme des cases remplies sans raison et
   * les vidait. Mesuré le 03/08/2026 sur `m20-l04` : au rejeu, l'emplacement du
   * tableau était nettoyé pendant que son état restait intact — un tableau
   * croisé invisible, et une démonstration qui expliquait du vide.
   */
  const occupePivot = useCallback((ref: string): boolean => {
    const plage = posePivotRef.current?.range
    if (!plage) return false
    const p = parseRange(plage)
    const c = parseRange(ref)
    if (!p || !c) return false
    /* AVEC LA MÊME MARGE QUE LE CLICHÉ. La pose enregistrée décrit le tableau
       à un instant donné ; il grandit dès qu'on lui ajoute un champ. Protéger
       la seule pose laissait la remise d'aplomb vider les cellules apparues
       autour — et le cliché les relevait alors déjà vides, si bien que le rejeu
       repartait d'un tableau amputé. */
    const M = 8
    return (
      c.startRow >= p.startRow && c.endRow <= p.endRow + M &&
      c.startCol >= p.startCol && c.endCol <= p.endCol + M
    )
  }, [])

  const remettreDAplomb = useCallback(
    (portee: "dependances" | "tout", pourEtape: number): Divergence[] => {
      const grid = gridRef.current
      const s = steps[pourEtape]
      if (!grid || !s) return []
      // La feuille ACTIVE, pas la première du classeur : sur les 19 scénarios
      // multi-feuilles, comparer « Total » à « Lyon » faisait écrire les
      // chiffres de Lyon dans la cellule que l'apprenant devait remplir.
      let active: string | undefined
      try {
        active = grid.getSheets().find((f) => f.active)?.name
      } catch {
        /* la grille peut ne pas être prête : on retombe sur la première feuille */
      }
      const etat = etatAplomb(steps, scenario.workbook, pourEtape, active)
      // On lit TOUJOURS large : c'est la seule façon de voir un format
      // trompeur posé loin de l'étape courante. Le tri se fait ensuite.
      const refs = refsConnues(etat)
      const lues = portee === "tout" ? null : cellulesLues(s)
      if (!refs.length) return []

      /* La ZONE DU CLASSEUR : le rectangle englobant de tout ce que le scénario
       * déclare quelque part. On y lit aussi les cellules qu'il ne déclare PAS,
       * pour voir ce qui ne devrait pas y être. */
      const { zone, declarees } = zoneClasseur(steps, scenario.workbook, active)
      const aLire = refs.slice()
      for (const r of refsDeLaZone(zone)) if (!etat[r]) aLire.push(r)

      const lecture: Record<string, LectureCellule> = {}
      for (const ref of aLire) {
        try {
          lecture[ref.toUpperCase()] = {
            formule: grid.getFormula(ref) ?? "",
            valeur: grid.getValue(ref),
            numberFormat: grid.getNumberFormat(ref) ?? "",
          }
        } catch {
          /* une référence hors bornes après un tri : on la laisse de côté */
        }
      }

      const toutes = divergences(etat, lecture, refs, famillesLegitimes(steps))
      // Le contenu ne se répare que dans la portée demandée ; le format, lui,
      // se répare partout (voir la note ci-dessus).
      /* CELLULES PARASITES — ce qui ne devrait pas être là.
       *
       * La remise savait remettre, pas enlever : une case remplie là où le
       * scénario n'attend RIEN n'était jamais examinée. Sur `m01-l05`, les 420
       * tapés en C8:C12 restaient affichés en « Prix unitaire » face à Total
       * HT, TVA 20 % et Total TTC, et la démonstration se jouait dessus.
       *
       * Elles s'effacent quelle que soit la portée : un chiffre parasite au
       * milieu d'un tableau ment à l'écran, que l'étape suivante le lise ou
       * non — même raisonnement que pour un format trompeur. */
      // Au changement d'étape on respecte l'exploration et seules les cellules
      // étrangères au chapitre sont vidées. Avant une démonstration, en
      // revanche, on revient exactement à l'état d'entrée de l'étape : une
      // cellule prévue plus tard n'a aucune raison de conserver aujourd'hui le
      // zéro que l'apprenant vient d'y saisir.
      /* AUCUN EFFACEMENT SILENCIEUX PENDANT UNE ÉVALUATION NOTÉE.
       *
       * La remise d'aplomb vide les cellules « parasites » : celles que le
       * scénario ne déclare nulle part. En évaluation, le scénario servi ne
       * déclare plus les cellules attendues — les servir dirait à l'apprenant où
       * écrire —, si bien que SES PROPRES RÉPONSES deviendraient des parasites
       * et disparaîtraient au changement d'étape.
       *
       * Le nettoyage est donc désactivé là. C'est d'ailleurs la bonne règle en
       * soi : sur une copie notée, on n'efface pas ce que l'apprenant a écrit.
       * Les leçons et les exercices, eux, gardent le mécanisme intact — c'est
       * pour eux qu'il a été construit, et leur scénario déclare tout. */
      const aVider =
        mode === "EVALUATION"
          ? []
          : (portee === "tout"
              ? cellulesHorsEtatAplomb(zone, etat, lecture)
              : cellulesParasites(zone, declarees, lecture)
            ).filter((ref) => !occupePivot(ref))
      const versParasite: Divergence[] = aVider.map((ref) => ({
        ref,
        motif: "parasite",
        correction: { v: "" },
      }))

      const ds = (
        lues === null
          ? toutes
          : toutes
              .map((d) => {
                if (d.motif === "format" || lues.some((r) => r.toUpperCase() === d.ref)) return d
                // Hors portée mais mal formatée : on ne remet pas son contenu,
                // on retire quand même le format qui la fait mentir.
                return d.famille !== undefined ? { ref: d.ref, motif: "format" as const, famille: d.famille, motifFormat: d.motifFormat } : null
              })
              .filter((d): d is NonNullable<typeof d> => d !== null)
      ).concat(versParasite)
      // Trace d'audit, hors production : sans elle, un mécanisme qui ne trouve
      // rien est indiscernable d'un mécanisme qui n'est jamais appelé.
      if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
        ;(window as unknown as Record<string, unknown>).__SIM_APLOMB = { portee, pourEtape, refs, divergences: ds }
      }
      if (!ds.length) return []

      // Verrou court, calibré sur ce qu'il doit couvrir : l'écriture ci-dessous
      // et le `stateChange` que la grille émet 350 ms plus tard. Il valait
      // 2 200 ms, si bien qu'une réponse tapée juste après l'arrivée sur
      // l'étape était jetée EN SILENCE — et la retaper ne réémettait rien,
      // puisque la grille n'émet que sur changement. L'apprenant restait bloqué
      // devant une feuille juste, sans savoir qu'il fallait effacer et refaire.
      verrouillerDemo(900)
      const cells: Record<string, { v?: string | number; f?: string }> = {}
      for (const d of ds) if (d.correction) cells[d.ref] = d.correction
      if (Object.keys(cells).length) grid.applyCells(cells)

      // Le format se repose APRÈS le recalcul, jamais dans la même salve que
      // l'écriture : `setNumberFormat` posé sur une cellule dont la formule
      // vient d'être écrite annule cette formule, et la cellule qu'on venait de
      // réparer redevient vide. C'est le piège qui a fait croire pendant tout
      // un cycle que le mécanisme ne s'exécutait pas.
      /**
       * Une observation a pu être jetée pendant le verrou : on relit l'état une
       * fois qu'il est levé, pour que l'étape se valide si la feuille est déjà
       * juste. Sans ce rattrapage, seul « effacer puis retaper » débloquait.
       *
       * ⚠️ JAMAIS AVANT UNE DÉMONSTRATION (`portee === "tout"`). Le rattrapage
       * existe pour repêcher une saisie de l'APPRENANT avalée par le verrou ;
       * pendant une démonstration personne ne tape, et la seule chose qu'il
       * puisse valider est la réparation que la remise d'aplomb vient
       * elle-même d'écrire. Mesuré le 03/08/2026 sur `M25-E02-05` : la cellule
       * B4 contient « LYON », l'étape attend « Lyon », et la comparaison ignore
       * la casse — au rejeu, la réparation de B4 déclenchait le rattrapage,
       * l'étape se validait toute seule au milieu de l'explication et la
       * démonstration affichée ensuite était celle de l'étape SUIVANTE. Vu de
       * l'extérieur, « Revoir » montrait autre chose que ce qu'il annonçait.
       */
      if (portee === "dependances") window.setTimeout(() => reobserverEtat(), 1100)
      const aFormater = ds.filter((d) => d.famille !== undefined)
      if (aFormater.length) {
        window.setTimeout(() => {
          const g = gridRef.current
          if (!g) return
          for (const d of aFormater) {
            try {
              g.setNumberFormat([d.ref], d.motifFormat ?? "")
            } catch {
              /* le moteur peut refuser un motif : ne jamais casser la leçon pour ça */
            }
          }
        }, 300)
      }
      return ds
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [occupePivot, steps, verrouillerDemo],
  )

  const handleReady = useCallback(
    (api: GridApi) => {
      gridRef.current = api
      api.applyWorkbook(scenario.workbook)
      // Les modèles déclarés dans le classeur existent AVANT la première étape :
      // le module 17 ouvre sa première leçon sur un graphique déjà posé, et le
      // module 20 sur un tableau croisé déjà calculé.
      const g = scenario.workbook.charts?.[0]
      if (g) poserGraphique(creerGraphique(g))
      const p = scenario.workbook.pivots?.[0]
      if (p) poserTcdDansFeuille(creerTcd(p, (ref) => api.getValue(ref)))
      const m = scenario.workbook.macros?.[0]
      if (m) {
        codeMacroRef.current = genererCode(m)
        setCodeMacro(codeMacroRef.current)
      }
      setGridReady(true)
      // D'abord le travail des étapes déjà franchies, ensuite la mise en place
      // de l'étape courante — dont le `setup` doit primer sur la reconstitution.
      rejouerAvant(index)
      applyStep(steps[index])
    },
    // Volontairement figé sur le montage : la grille se monte une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    // L'état du poste imposé par l'étape s'applique AUSSI hors `applyStep` :
    // celui-ci attend que la grille soit prête, or une leçon qui démarre Excel
    // fermé n'a pas encore de grille montée au moment de la reprise.
    if (!posteActif) return
    const impose = step?.setup?.poste
    const depart = clonerPoste(impose ? { ...posteRef.current, ...impose } : posteRef.current)
    posteDepartEtapeRef.current = depart
    posteRef.current = depart
    setPoste(depart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, posteActif])

  useEffect(() => {
    // Le verrou de résolution se lève à CHAQUE étape, que la grille soit prête
    // ou non. Il ne vivait que dans `applyStep`, appelé seulement une fois
    // `gridReady` vrai : sur un chapitre qui démarre Excel fermé, la grille
    // n'est pas encore montée et le player se figeait après la première étape,
    // toutes les observations suivantes étant ignorées en silence.
    resoluRef.current = false
    // La trace d'audit des repères repart à zéro : hors production seulement.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined")
      (window as any).__SIM_DEMO_VUS = {}
    // Le cliché appartient à l'étape : changer d'étape, c'est changer de point
    // de départ. Le garder ferait reposer sur la nouvelle étape le classeur de
    // l'ancienne, ce qui serait bien pire que le défaut qu'il corrige.
    clicheDemoRef.current = null
    reinitialiserAAlArrivee()
    // Le message d'aplomb n'est PAS effacé d'office : il a sa propre échéance
    // (voir `poserAplomb`). Sans cela il disparaissait avec le changement
    // d'étape, souvent moins de deux secondes après avoir été posé.
    if (Date.now() >= aplombFinRef.current) setAplomb(null)
    if (!gridReady) return
    applyStep(step)
    // La remise d'aplomb est DIFFÉRÉE : `applyStep` vient d'écrire le décor de
    // l'étape, et le moteur de formules met 60 à 120 ms à recalculer. Relire
    // tout de suite renverrait des valeurs périmées et signalerait des
    // divergences imaginaires sur un classeur parfaitement sain.
    const tAplomb = window.setTimeout(() => {
      poserAplomb(direAplomb(remettreDAplomb("dependances", index)))
    }, 420)
    return () => window.clearTimeout(tAplomb)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, gridReady])

  /**
   * Avant toute démonstration, la feuille repart d'aplomb — portée large.
   *
   * Sans cela « Montrez-moi » jouait sur le classeur que l'apprenant venait
   * d'abîmer : la démonstration cliquait la bonne cellule, saisissait la bonne
   * formule, annonçait « voici la réponse »… et affichait un résultat faux.
   * L'apprenant qui demandait de l'aide était le seul à ne pas pouvoir s'en
   * rendre compte.
   *
   * La feuille RESTE d'aplomb ensuite (choix Samuel du 31/07/2026) : il doit
   * pouvoir refaire lui-même, tout de suite, le geste qu'on vient de lui
   * montrer — sur une feuille où il fonctionne.
   */
  useEffect(() => {
    if (!demonstration || !gridReady || finished) return
    poserAplomb(direAplomb(remettreDAplomb("tout", index)))
    /**
     * PREMIER LANCEMENT : on garde le cliché. REJEU : on le repose.
     *
     * La remise d'aplomb ci-dessus ne suffit pas, et ne le pouvait pas : elle
     * compare la feuille à l'état ATTENDU AVANT l'étape courante, donc la
     * réponse que la démonstration vient d'écrire ne lui apparaît ni comme une
     * divergence (elle est légitime), ni comme un parasite (la cellule est
     * déclarée). Elle sort même en tête quand rien n'est encore connu
     * (`if (!refs.length) return []`), ce qui est exactement le cas d'une
     * première étape sur un classeur vide — `m01-e02` en est l'exemple.
     *
     * Le cliché, lui, ne raisonne pas sur ce qui est attendu : il retient ce
     * qui ÉTAIT là. C'est la seule mesure qui garantit que les deux passages
     * partent du même écran, et donc qu'ils montrent la même chose.
     *
     * Il est pris avec 400 ms de retard : la remise d'aplomb repose ses formats
     * à 300 ms, et un cliché pris avant les figerait dans leur état d'avant
     * réparation. La première écriture d'une démonstration n'a lieu qu'après
     * la carte d'annonce — 3,2 s au plus tôt — donc rien ne peut passer entre
     * les deux.
     */
    /**
     * PREMIER LANCEMENT : on garde le cliché. REJEU : on le repose.
     *
     * L'ÉTAT D'ENTRÉE D'UNE DÉMONSTRATION, C'EST CELUI D'OÙ ELLE PART — donc
     * APRÈS le décor de l'étape (`applyStep`) et APRÈS la remise d'aplomb, pas
     * avant. Le prendre plus tôt paraissait plus « pur » : il remettait en
     * réalité le classeur dans l'état de l'étape PRÉCÉDENTE, et le rejeu de
     * `m21-e04` retrouvait un « 0 » là où le décor avait posé « Table de
     * réunion 8 places ».
     *
     * 400 ms de retard : la remise d'aplomb repose ses formats à 300 ms, et un
     * cliché pris avant les figerait dans leur état d'avant réparation. La
     * première écriture d'une démonstration n'a lieu qu'après la carte
     * d'annonce — 3,2 s au plus tôt — donc rien ne peut passer entre les deux.
     */
    if (clicheDemoRef.current) {
      reposerClicheDemo(clicheDemoRef.current)
      return
    }
    const t = window.setTimeout(() => {
      clicheDemoRef.current = prendreClicheDemo()
    }, 400)
    return () => window.clearTimeout(t)
    // `rejeu` fait partie des dépendances : sans lui, « Revoir la
    // démonstration » rejouait sur le classeur tel qu'il était devenu depuis la
    // première fois. L'apprenant qui abîme quelque chose PUIS redemande à voir
    // se retrouvait avec la même explication fausse qu'au départ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demonstration, rejeu, gridReady])


  /**
   * Un écran « À lire » joue sa démonstration TOUT SEUL.
   *
   * Elle attendait un clic sur « ▶ Voir le geste », que personne ne voyait :
   * l'apprenant lisait un paragraphe devant un écran figé, et sur la plupart des
   * écrans il n'y avait même rien à cliquer. Elle démarre maintenant à
   * l'ouverture de l'étape, et le bouton « ↻ Revoir » reste disponible ensuite.
   *
   * Le délai laisse le temps de lire la consigne avant que ça bouge, et laisse
   * la grille finir de se poser — un démarrage immédiat jouerait sur un écran
   * pas encore mesuré.
   */
  useEffect(() => {
    if (!step || finished) return
    // La page de garde est encore là : la démonstration se jouait PAR-DESSUS
    // « Commencer la leçon », bulles et curseur compris, avant que l'apprenant
    // ait seulement ouvert le chapitre (retour Samuel du 30/07/2026).
    if (!introVue) return
    if (step.action.type !== "READ" || !step.montrer?.length) return
    const t = window.setTimeout(() => {
      demarrerDemonstration()
    }, 1200)
    return () => window.clearTimeout(t)
  }, [step, index, finished, introVue, demarrerDemonstration])

  /**
   * Audit : forcer la démonstration sans passer par les seuils de l'apprenant.
   * Hors production seulement, et seulement si l'auditeur l'a demandé — voir la
   * note sur les crochets d'audit plus bas. `applyStep` remet `demonstration` à
   * faux à chaque étape, donc le forçage se rejoue ici, après lui.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (typeof window === "undefined" || !(window as any).__SIM_FORCE_DEMO) return
    if (!step || finished || !gridReady) return
    // Volontairement TARDIF. À 60 ms, certains services d'Univer — le collage en
    // particulier — ne sont pas encore prêts et la commande échoue en silence :
    // l'audit voyait un défaut là où il n'y en avait pas. Un apprenant, lui,
    // n'atteint jamais l'aide avant 3 erreurs, 6 tâtonnements ou 45 secondes.
    const t = window.setTimeout(demarrerDemonstration, 1500)
    return () => window.clearTimeout(t)
  }, [step, index, finished, gridReady, demarrerDemonstration])



  /**
   * LES CELLULES À RELEVER POUR UNE OBSERVATION D'ÉTAT.
   *
   * En leçon et en exercice, l'étape déclare les cellules qu'elle juge : on
   * relève celles-là, et rien d'autre. En ÉVALUATION NOTÉE elle ne les déclare
   * plus — les servir dirait à l'apprenant où le résultat est attendu, ce que la
   * consigne ne dit pas toujours (111 des 115 références du corpus). L'atelier
   * envoie alors un relevé BORNÉ de la zone utile du classeur, et le serveur y
   * prélève lui-même les seules cellules qu'il attend.
   *
   * Le navigateur ne sait donc plus lesquelles comptent — et le relevé reste
   * borné à l'étendue réellement occupée par la feuille, jamais au million de
   * lignes qu'Univer propose.
   */
  const cellulesARelever = useCallback(
    (declarees: string[] | null): string[] => {
      if (declarees && declarees.length) return declarees
      /* La zone à relever est SERVIE PAR LE SERVEUR (`zoneObservable`) : le
       * rectangle englobant des cellules attendues de l'évaluation. La deviner
       * depuis le classeur de départ ne marchait pas — sur `m12-ev01`, dont la
       * feuille démarre presque vide, les cellules attendues tombaient hors de
       * l'étendue et l'étape devenait impossible. L'étendue utile reste le repli
       * pour les leçons et les exercices, qui déclarent leurs cellules. */
      const rectangle = (scenario as { zoneObservable?: string }).zoneObservable || etendue
      const cellules = rectangle ? cellsOf(rectangle) : []
      // Garde-fou de volume : une feuille inhabituellement large ne doit pas
      // faire enfler chaque observation. Le contrôle `check-jouabilite` vérifie
      // qu'aucune évaluation du corpus n'atteint ce plafond.
      return cellules.slice(0, 2000)
    },
    [etendue, scenario],
  )

  /* ── Persistance ───────────────────────────────────────────────────────── */






  /* ── Avancement ────────────────────────────────────────────────────────── */

  /*
   * Ce que la progression déclenche : enregistrer l'avancée, et clore le
   * chapitre. Les deux touchent la persistance, qui vit encore ici.
   */
  onAvancerRef.current = (i: number) => {
    void persist({ step: i })
  }
  onTerminerRef.current = () => {
    /**
     * LE NAVIGATEUR NE DÉCLARE PLUS RIEN.
     *
     * Il envoyait ici un journal de deux booléens par étape — réussie du
     * premier coup, tentée — et une note. Le serveur les assainissait puis
     * les croyait : une requête fabriquée portant tous les identifiants avec
     * « premier essai » à vrai obtenait 100 % sans avoir joué.
     *
     * La note vient désormais des verdicts que le serveur a lui-même écrits,
     * étape par étape, en corrigeant les observations. Ce PUT ne fait plus
     * que clore le passage et demander le bilan.
     */
    // Le bilan arrive avec la réponse du PUT : la carte de fin s'affiche
    // immédiatement avec la note, et complète son bilan quand il revient.
    // L'inverse — attendre le serveur avant d'afficher quoi que ce soit —
    // laisserait l'apprenant devant un écran vide sur une connexion lente.
    if (mode === "EVALUATION" && !preview) setBilanEnAttente(true)
    void cloturerRef.current?.()
  }
  // Lisible depuis les rappels stables qui doivent avancer sans dépendre de
  // l'étape courante (fin d'une réussite distante, rattrapage d'observation).
  goNextRef.current = goNext

  /**
   * Rectangle de la cible de l'étape, dans le repère de la grille.
   *
   * C'est la seule part Excel du retour visuel : le flash vert et la secousse
   * rouge s'ancrent à des CELLULES. Une autre app y mettra ses propres objets ;
   * la pose de l'effet, elle, est commune (`useRetourVisuel`). Sans cible
   * mesurable, on rend `null` et seul le message centré s'affiche.
   */
  const rectDeLEtape = useCallback((s: SimulationStep): RectCible | null => {
    const grid = gridRef.current
    const a = s.action as Record<string, unknown> & { type: string }
    const refs: string[] =
      a.type === "EXPECT_STATE"
        ? Object.keys((a.cells as Record<string, unknown>) ?? {})
        : (() => {
            const cible =
              a.type === "TYPE" ? (a.target === "formula-bar" ? null : ((a.target as string) ?? null))
              : a.type === "CLICK_CELL" ? (a.cell as string)
              : a.type === "GOTO_REF" ? (a.ref as string)
              : a.type === "DRAG_RANGE" ? (a.range as string)
              : a.type === "DEFINE_NAME" ? ((a.ref as string) ?? null)
              : null
            return cible ? cible.split(":") : []
          })()
    if (!grid || !refs.length) return null
    const rects = refs
      .map((r) => grid.getCellRect(r))
      .filter(Boolean) as RectCible[]
    if (!rects.length) return null
    const left = Math.min(...rects.map((r) => r.left))
    const top = Math.min(...rects.map((r) => r.top))
    return {
      left,
      top,
      width: Math.max(...rects.map((r) => r.left + r.width)) - left,
      height: Math.max(...rects.map((r) => r.top + r.height)) - top,
    }
  }, [])
  /** Retour visuel ancré à la cible de l'étape : flash vert à la réussite,
   *  secousse rouge + message à l'erreur. */
  const lancerFx = useCallback(
    (s: SimulationStep, kind: "ok" | "ko", message?: string) => {
      poserFx(kind, rectDeLEtape(s), message)
    },
    [poserFx, rectDeLEtape],
  )

  /**
   * LE JUGE. Local en leçon et en exercice, SERVEUR en évaluation notée.
   *
   * En évaluation, le scénario servi ne porte plus les réponses (`expurge.ts`) :
   * l'atelier ne peut donc plus corriger, et c'est exactement le sens de
   * `clientValidation: false`. Il envoie ce que l'apprenant a fait, le serveur
   * relit l'étape réelle en base et ne renvoie qu'un verdict.
   *
   * Un échec réseau renvoie `null` : on ne compte alors NI réussite NI faute.
   * Faire perdre un point « premier essai » pour une requête tombée serait la
   * pire façon de noter.
   *
   * L'attente est BORNÉE. Sans cela, une requête qui ne revient jamais figerait
   * la file des verdicts — donc l'étape — pour le reste de l'évaluation.
   */
  const jugerObservation = useCallback(
    async (s: SimulationStep, rang: number, obs: ObservedAction): Promise<JugementEtape | null> => {
      if (validationLocale) return jugerEtape(s, obs)
      /* PAS DE PASSAGE, PAS DE JUGEMENT.
       *
       * La mise en place du classeur émet une observation avant même que
       * l'apprenant soit entré dans l'atelier — donc avant l'ouverture du
       * passage. L'envoyer produisait une requête refusée à chaque montage.
       * Tant que l'écran d'ouverture est affiché, ce n'est pas une panne : c'est
       * du décor. Une fois entré, en revanche, l'absence de passage doit se voir.
       */
      if (!runIdRef.current) {
        if (introVueRef.current) setPanneJuge("passage")
        return null
      }
      const abandon = new AbortController()
      const minuterie = window.setTimeout(() => abandon.abort(), DELAI_VERDICT_MS)
      try {
        const r = await fetch(`/api/simulations/${chapterId}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: runIdRef.current,
            stepIndex: rang,
            stepId: s.id,
            observed: obs,
          }),
          signal: abandon.signal,
        })
        if (!r.ok) {
          // 409 : le passage n'est plus recevable — clos, périmé, ou jamais
          // ouvert. L'apprenant doit le savoir : continuer à taper ne servirait
          // à rien, et rien ne serait noté.
          setPanneJuge(r.status === 409 ? "passage" : "reseau")
          return null
        }
        setPanneJuge(null)
        const j = (await r.json()) as Partial<JugementEtape> & { ok?: unknown }
        /* Le serveur ne renvoie ni `reason`, ni `frappe`, et son `message` est
         * CONSTANT : sur une évaluation notée, un échec ne doit rien apprendre
         * de plus que « ce n'est pas cela ». Les messages de `validateStep` sont
         * écrits pour une leçon et peuvent citer un élément de réponse.
         * `frappe` reste donc nul ici, et le classement vient de `compte`. */
        return {
          ok: j.ok === true,
          ...(typeof j.message === "string" ? { message: j.message } : {}),
          frappe: null,
          /* Sur un échec, le serveur ne dit PLUS si le geste comptait comme
           * faute ou comme tâtonnement : la distinction renseignerait sur le
           * genre d'action attendu. L'atelier retombe donc sur « tâtonnement »
           * pour l'affichage — pas de flash rouge sur un simple repérage — et
           * la note, elle, ne dépend plus de lui depuis longtemps. */
          compte: j.ok === true ? "reussite" : "tatonnement",
        }
      } catch {
        // Réseau tombé, ou attente dépassée. Ni réussite ni faute : le geste
        // reste à refaire, et l'atelier l'annonce.
        setPanneJuge("reseau")
        return null
      } finally {
        window.clearTimeout(minuterie)
      }
    },
    [validationLocale, chapterId],
  )

  /**
   * File des verdicts : ordre d'ÉMISSION, jamais ordre d'arrivée.
   *
   * Créée une fois pour toute la vie de l'atelier — elle porte le compteur de
   * billets, qui doit rester monotone d'une étape à l'autre. Ses trois portes
   * (étape changée, étape déjà résolue, verdict périmé) sont documentées dans
   * `lib/simulation/file-verdicts.ts` et vérifiées par
   * `scripts/simulation/check-verdicts.ts`.
   */
  const fileVerdictsRef = useRef<FileDeVerdicts<JugementEtape> | null>(null)
  if (!fileVerdictsRef.current) {
    fileVerdictsRef.current = creerFileDeVerdicts<JugementEtape>({
      etapeCourante: () => stepRef.current?.id ?? null,
      estResolue: () => resoluRef.current,
    })
  }

  const handleAction = useCallback(
    (observed: ObservedAction, options?: { siJuste?: boolean }) => {
      if (!step || finished || resoluRef.current) return
      // Le verrou de démonstration ne concerne QUE les observations du classeur :
      // il évite qu'un geste joué à la place de l'apprenant valide l'étape. Un
      // « suivant » est au contraire une intention explicite de l'apprenant.
      // Sans cette exception, le bouton « J'ai compris, continuer » d'un écran de
      // lecture était mort pendant toute la durée du verrou — et comme la remise
      // en place du classeur en repose un à la fin de la démonstration, le clic
      // qui suit immédiatement une démonstration ne faisait rien du tout.
      if (observed.kind !== "next" && Date.now() < verrouDemoRef.current) return

      // Le classeur a bougé : le graphique doit relire ses plages. Il ne le
      // faisait qu'au changement d'étape, donc jamais pendant le recalcul qui
      // suit le montage — une série alimentée par des formules s'affichait
      // amputée de ses barres.
      if (observed.kind === "stateChange") setVersionClasseur((n) => n + 1)

      // L'enregistreur de macros écoute les gestes RÉELS, ceux que la grille
      // signale déjà. Un second chemin d'observation finirait par transcrire
      // autre chose que ce que l'apprenant a fait.
      const enreg = enregistrementRef.current
      if (enreg?.actif) {
        let geste: GesteMacro | null = null
        if (observed.kind === "typed") geste = gesteDepuisSaisie(observed.target, observed.text)
        else if (observed.kind === "cellClick") geste = { kind: "select", ref: observed.cell }
        else if (observed.kind === "dragRange") geste = { kind: "select", ref: observed.range }
        if (geste) {
          const suite = transcrire(enreg, geste)
          enregistrementRef.current = suite
          setEnregistrement(suite)
        }
      }

      // Un tableau croisé ne se recalcule pas tout seul : dès que l'apprenant
      // corrige une cellule de la plage source, le tableau devient PÉRIMÉ et
      // garde ses anciens chiffres, comme dans Excel. C'est ce qui donne son sens
      // à la leçon « cliquez sur Actualiser » — sans cela le bandeau d'alerte
      // n'apparaît jamais et l'étape reste injouable.
      const tcdCourant = tcdRef.current
      if (tcdCourant && !tcdCourant.stale && (observed.kind === "typed" || observed.kind === "stateChange")) {
        if (sourceAChange(tcdCourant, lireCellule)) {
          const perime = { ...tcdCourant, stale: true }
          tcdRef.current = perime
          setTcd(perime)
        }
      }

      // Reflet immédiat de la sélection dans la zone Nom et la barre de formule.
      if (observed.kind === "cellClick") {
        setSelection(observed.cell)
        setFormulaText(gridRef.current?.getFormula(observed.cell) ?? "")
        setStats(gridRef.current?.getSelectionStats(observed.cell) ?? null)
      } else if (observed.kind === "dragRange") {
        setSelection(observed.range)
        setStats(gridRef.current?.getSelectionStats(observed.range) ?? null)
      } else if (observed.kind === "stateChange") {
        setStats(gridRef.current?.getSelectionStats() ?? null)
      } else if (observed.kind === "typed") {
        // Après validation, Excel descend d'une cellule : la zone Nom et la barre
        // de formule doivent suivre, sinon elles affichent la cellule précédente.
        const now = gridRef.current?.getSelection()
        if (now) {
          setSelection(now)
          setFormulaText(gridRef.current?.getFormula(now) ?? "")
          setStats(gridRef.current?.getSelectionStats(now) ?? null)
        }
      }

      // Pour une étape validée sur l'état du classeur, c'est ici qu'on lit les
      // cellules attendues : `validateStep` reste pur et réutilisable côté serveur.
      let enriched = observed
      if (observed.kind === "stateChange" && step.action.type === "EXPECT_STATE") {
        const grid = gridRef.current
        const readings: Record<string, { formula: string; value: unknown }> = {}
        if (grid) {
          const refs = cellulesARelever(
            step.action.cells ? Object.keys(step.action.cells) : null,
          )
          for (const ref of refs) {
            try {
              readings[ref] = { formula: grid.getFormula(ref), value: grid.getValue(ref) }
            } catch {
              /* une référence hors bornes ne doit pas faire tomber l'observation */
            }
          }
        }
        enriched = { kind: "stateChange", readings }
      }

      /**
       * À partir d'ici le jugement peut être DISTANT.
       *
       * Le billet est pris MAINTENANT, au moment de l'émission : c'est lui qui
       * fixe l'ordre d'application, pas l'ordre d'arrivée des réponses. La file
       * referme ensuite trois portes — étape changée, étape déjà franchie,
       * verdict plus ancien qu'un verdict déjà appliqué — parce qu'un seul geste
       * produit souvent deux observations et qu'un aller-retour laisse le temps
       * à l'étape d'être franchie autrement.
       */
      const etapeJugee = step
      const file = fileVerdictsRef.current
      const billet = file!.prendre(etapeJugee.id)
      void file!.enfiler(billet, jugerObservation(etapeJugee, index, enriched), (jugement) => {
        /* Le rattrapage silencieux (`reobserverEtat`) ne saute un verdict faux
         * QU'EN correction locale — leçon et exercice, où l'atelier a déjà les
         * réponses et où rien n'est noté. En ÉVALUATION il ne filtre plus rien :
         * un essai qui ne coûterait pas serait un essai gratuit, et le navigateur
         * n'a pas à décider du prix de ses propres tentatives. */
        if (validationLocale && options?.siJuste && !jugement.ok) return
        appliquerJugementRef.current?.(etapeJugee, observed, jugement)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, index, finished, lireCellule, jugerObservation],
  )

  /**
   * Applique le verdict rendu par le juge : réussite, faute, ou tâtonnement.
   *
   * Séparé de `handleAction` parce que le jugement est asynchrone en évaluation
   * notée. Tout ce qui précède (reflet de la sélection, enregistreur de macros,
   * péremption du tableau croisé) doit rester synchrone ; tout ce qui suit
   * dépend du verdict.
   */
  const appliquerJugement = useCallback(
    (step: SimulationStep, observed: ObservedAction, jugement: JugementEtape) => {
      const v: Verdict = jugement.ok
        ? { ok: true }
        : { ok: false, reason: jugement.reason ?? "", message: jugement.message ?? "" }
      if (v.ok) {
        if (!attemptedRef.current.has(step.id)) firstTryRef.current[step.id] = true
        resoluRef.current = true
        setVerdict({ ok: true })
        // « ✓ C'est exact » félicite une RÉUSSITE. Sur un écran « À comprendre »
        // l'apprenant n'a rien fait d'exact : il a cliqué « J'ai compris ». Le
        // bandeau vert et son flash s'affichaient quand même, et félicitaient un
        // geste qui n'existe pas (retour Samuel du 30/07/2026).
        if (step.action.type !== "READ") lancerFx(step, "ok")
        /**
         * Une boîte de dialogue RETIENT l'étape, comme dans Excel.
         *
         * Sans cette règle, `M01-L02-04` — « Cliquez sur fx. Une fenêtre
         * d'assistant s'ouvre, avec la liste des fonctions » — validait sur le
         * clic, avançait 550 ms plus tard et l'étape suivante refermait la
         * fenêtre : l'apprenant l'apercevait à peine. C'est lui qui décide
         * maintenant quand elle se referme, par OK ou Annuler ; l'étape
         * enchaîne à ce moment-là.
         */
        if (boiteRef.current) {
          apresBoiteRef.current = goNext
          return
        }
        // Petite pause pour que l'apprenant voie le résultat de son action avant
        // que l'écran ne change.
        window.setTimeout(goNext, 550)
        return
      }

      /* CE QUE L'OBSERVATION VAUT EST DÉCIDÉ PAR LE JUGE, PAS ICI.
       *
       * Ce bloc reconstituait la classification — vraie faute, tâtonnement,
       * passage obligé — à partir des cellules attendues, du type d'étape et du
       * motif de refus. En évaluation notée l'atelier n'a plus rien de tout
       * cela : ni les cellules, ni le motif, qui est devenu constant pour ne pas
       * faire du juge un oracle.
       *
       * La règle a donc migré dans `jugerEtape` (`lib/simulation/frappe.ts`),
       * appelée localement en leçon et en exercice, et par le serveur en
       * évaluation — où elle sert d'ailleurs à écrire le verdict. Ici on ne fait
       * plus que l'appliquer. Les commentaires qui expliquaient chaque cas de
       * figure vivent désormais à côté de la règle. */
      const isRealMistake = jugement.compte === "faute"
      // Une saisie juste dans une cellule attendue ne compte rien : l'observation
      // d'état validera l'étape juste après.
      if (jugement.compte === "rien") return

      if (isRealMistake) {
        attemptedRef.current.add(step.id)
        firstTryRef.current[step.id] = false
        pendingRef.current.errors += 1
        // Trace d'audit hors production : sans elle, un score en dessous de
        // 100 % sur un parcours parfait est indiagnosticable — on ne sait pas
        // QUELLE étape a compté quelle observation comme faute.
        if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
          const w = window as unknown as Record<string, unknown>
          const fautes = (w.__SIM_FAUTES as unknown[]) ?? []
          fautes.push({
            step: step.id,
            kind: observed.kind,
            reason: v.reason,
            ...(observed.kind === "typed"
              ? { target: observed.target, text: observed.text }
              : {}),
          })
          w.__SIM_FAUTES = fautes
        }
        // Une frappe fausse dans une cellule attendue mérite un vrai message :
        // le verdict de `validateStep` pour un `typed` sur une étape d'état
        // est muet (« no_state_change »), et un flash rouge sans un mot faisait
        // douter l'apprenant de sa saisie… même quand elle était bonne.
        // En évaluation, `message` est constant et ne révèle rien ; en leçon, il
        // vient de `validateStep` et peut nommer la cellule concernée, ce qui
        // est le comportement voulu là où rien n'est noté.
        const vAffiche: Verdict =
          jugement.frappe?.verdict === "fausse" && jugement.frappe.ref
            ? {
                ok: false,
                reason: "wrong_typed_state_value",
                message: `${jugement.frappe.ref} n'affiche pas le résultat attendu.`,
              }
            : v
        compterEssai()
        setVerdict(vAffiche)
        lancerFx(step, "ko", vAffiche.message)
      } else if (step.action.type === "READ") {
        // Rappel neutre, sans verdict rouge ni secousse : on indique juste où
        // cliquer pour continuer. Réservé aux gestes VOLONTAIRES : la mise en
        // place de l'étape émet un `stateChange` qui affichait le rappel avant
        // même que l'apprenant ait touché quoi que ce soit.
        if (observed.kind !== "stateChange") {
          setVerdict({ ok: false, reason: "read_step_action", message: v.message })
        }
      } else {
        // TOUT geste qui n'a pas fait avancer l'étape compte comme tâtonnement,
        // qu'il s'agisse d'un déplacement ou d'un réglage intermédiaire. Il ne
        // pénalise pas le score — il sert uniquement à savoir quand proposer
        // l'aide. Sans ce compteur, sur une étape jugée sur l'état ou sur un
        // simple clic de repérage, `essais` restait à zéro et « Montrez-moi »
        // n'apparaissait JAMAIS : c'est ce que Samuel voyait comme une
        // démonstration « absente ».
        // Le `stateChange` que produit la mise en place de l'étape n'est pas un
        // geste : il arrive avant que l'apprenant ait touché quoi que ce soit.
        // Une fois celui-là écarté, un `stateChange` redevient un vrai signal —
        // c'est le seul dont on dispose sur les 466 étapes jugées sur l'état, où
        // sans lui « Montrez-moi » n'apparaîtrait jamais.
        // Ce que la MISE EN PLACE produit elle-même, et qui n'est donc pas un
        // geste : l'écriture du décor (`stateChange`) et la sélection posée par
        // `setup.selection` — sur `m11-l02` c'est une plage, donc un
        // `dragRange`, compté comme un tâtonnement que personne n'avait fait.
        const AUTOMATIQUES = ["stateChange", "dragRange", "cellClick", "selectColumn", "selectRow"]
        const miseEnPlace = AUTOMATIQUES.includes(observed.kind) && dansFenetreMiseEnPlace()
        if (!miseEnPlace && process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
          // Trace d'audit : « pourquoi l'aide m'est-elle proposée alors que je
          // n'ai rien fait ? » ne se diagnostique pas sans savoir QUELLE
          // observation a été comptée.
          const w = window as unknown as Record<string, unknown>
          const t = (w.__SIM_TATONNEMENTS as unknown[]) ?? []
          t.push({ etape: step.id, kind: observed.kind, quand: Date.now() })
          w.__SIM_TATONNEMENTS = t
        }
        if (!miseEnPlace) compterTatonnement()
        // Un réglage intermédiaire mérite parfois une phrase, quand le juge sait
        // la dire. Sur une évaluation elle est générique, et c'est voulu.
        if (observed.kind !== "stateChange" && !v.ok && v.message) setVerdict(v)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goNext, lancerFx, demarrerDemonstration, compterEssai, compterTatonnement, dansFenetreMiseEnPlace],
  )
  appliquerJugementRef.current = appliquerJugement
  handleActionRef.current = handleAction


  /* ── Observations des modèles ──────────────────────────────────────────── */

  /**
   * Un geste sur un modèle produit DEUX observations possibles, et il faut
   * n'émettre que celle que l'étape attend : quand elle juge le bouton, un
   * `chartChange` la ferait échouer ; quand elle juge l'état, un `control`
   * parasite en ferait autant. C'est la règle que suit déjà le tri.
   */
  const emisPourControle = useCallback(
    (controlId: string | undefined): boolean => {
      if (!controlId) return false
      if (stepRef.current?.action.type !== "CLICK_CONTROL") return false
      handleAction({ kind: "control", control: controlId, channel: "ribbon" })
      return true
    },
    [handleAction],
  )

  const emettreGraphique = useCallback(
    (controlId?: string) => {
      if (emisPourControle(controlId)) return
      handleAction({ kind: "chartChange", chart: graphiqueRef.current })
    },
    [emisPourControle, handleAction],
  )

  const emettreReglages = useCallback(
    (controlId?: string) => {
      if (emisPourControle(controlId)) return
      handleAction({ kind: "pageSetupChange", pageSetup: reglagesRef.current })
    },
    [emisPourControle, handleAction],
  )

  const emettreTcd = useCallback(
    (controlId?: string) => {
      if (emisPourControle(controlId)) return
      // Les cellules du tableau passent par les commandes d'Univer, qui
      // s'appliquent de façon asynchrone : les relire tout de suite renvoie les
      // chiffres d'avant la pose.
      window.setTimeout(() => {
        const attendu = stepRef.current?.action
        const cells = attendu?.type === "EXPECT_PIVOT" ? attendu.pivot?.cells : undefined
        handleAction({
          kind: "pivotChange",
          pivot: tcdRef.current,
          // Même règle : cellules déclarées si l'étape les donne, zone utile
          // sinon. Le tableau croisé écrit dans la feuille, donc ses cellules
          // de contrôle sont dans l'étendue.
          readings: lecturesTcd(cellulesARelever(cells ? Object.keys(cells) : null), lireCellule),
        })
      }, 260)
    },
    [emisPourControle, handleAction, lireCellule],
  )

  const emettreMacro = useCallback(
    (controlId?: string) => {
      if (emisPourControle(controlId)) return
      window.setTimeout(() => {
        const attendu = stepRef.current?.action
        const veut = attendu?.type === "EXPECT_MACRO" ? attendu.macro : undefined
        const liste = macrosRef.current
        // Le juge compare un nom : sur un classeur à plusieurs macros, présenter
        // la dernière touchée ferait échouer une étape qui parle de l'autre.
        const nomme = veut?.name ? liste.find((m) => m.name.trim() === veut.name?.trim()) : undefined
        const cible = nomme ?? liste.find((m) => m.name === macroCouranteRef.current) ?? liste[0] ?? null
        const edite = cible && cible.name === macroCouranteRef.current && codeMacroRef.current
        const readings: Record<string, { value: unknown }> = {}
        for (const ref of cellulesARelever(veut?.effet ? Object.keys(veut.effet) : null)) {
          readings[ref] = { value: lireCellule(ref) }
        }
        handleAction({
          kind: "macroChange",
          macro: cible,
          code: edite ? codeMacroRef.current : cible ? genererCode(cible) : "",
          readings,
        })
      }, 340)
    },
    [emisPourControle, handleAction, lireCellule],
  )

  /* ── Macros : enregistrement, exécution, options ───────────────────────── */

  const demarrerMacro = useCallback(
    (nom: string, options: OptionsMacro) => {
      const r = demarrerEnregistrement(nom, {
        ...options,
        // La sélection au démarrage donne leur sens aux références relatives :
        // c'est elle qui fait qu'une macro relative clôt le tableau de juillet
        // ou celui d'août selon l'endroit où on la lance.
        ancre: gridRef.current?.getSelection() || "A1",
        existantes: macrosRef.current,
      })
      if (!r.ok) return
      enregistrementRef.current = r.etat
      setEnregistrement(r.etat)
      handleAction({ kind: "recorder", state: "started" })
    },
    [handleAction],
  )

  const arreterMacro = useCallback(() => {
    const e = enregistrementRef.current
    if (!e) return
    const macro = arreterEnregistrement(e)
    enregistrementRef.current = null
    setEnregistrement(null)
    const suite = [...macrosRef.current.filter((m) => m.name !== macro.name), macro]
    macrosRef.current = suite
    setMacros(suite)
    macroCouranteRef.current = macro.name
    setMacroCourante(macro.name)
    codeMacroRef.current = genererCode(macro)
    setCodeMacro(codeMacroRef.current)
    handleAction({ kind: "recorder", state: "stopped" })
  }, [handleAction])
  arreterMacroRef.current = arreterMacro

  const executerMacroNommee = useCallback(
    (nom: string) => {
      const grid = gridRef.current
      if (!grid) return
      let macro = macrosRef.current.find((m) => m.name === nom)
      // Le code de l'éditeur fait foi quand il porte sur cette macro : « visualiser
      // et modifier une macro » n'aurait aucun sens si l'exécution ignorait la
      // modification qu'on vient de faire lire à l'apprenant.
      if (nom === macroCouranteRef.current && codeMacroRef.current) {
        const relu = analyserCode(codeMacroRef.current)
        if (relu.ok) {
          macro = { ...relu.macro, name: macro?.name ?? relu.macro.name, shortcut: macro?.shortcut, relative: macro?.relative }
          const cible = macro
          const suite = macrosRef.current.map((m) => (m.name === nom ? cible : m))
          macrosRef.current = suite
          setMacros(suite)
        }
      }
      if (!macro) return
      const pilote: PiloteMacro = {
        select: (ref) => grid.setSelection(ref),
        setValue: (ref, value) => grid.applyCells({ [ref]: { v: value } }),
        setFormula: (ref, formuleFr) => grid.applyCells({ [ref]: { f: formuleFr } }),
        setFont: (ref, st) => {
          grid.setSelection(ref)
          if (st.bold !== undefined) grid.toggleBold(st.bold)
          if (st.italic !== undefined) grid.setItalic(st.italic)
          if (st.size !== undefined) grid.setFontSize(st.size)
          if (st.color !== undefined) grid.setFontColor(st.color)
        },
        setInterior: (ref, color) => {
          grid.setSelection(ref)
          grid.setBackground(color)
        },
        setNumberFormat: (ref, pattern) => grid.setNumberFormat(cellsOf(ref), pattern),
      }
      executerMacro(macro, pilote, { ancre: grid.getSelection() || "A1" })
      macroCouranteRef.current = nom
      setMacroCourante(nom)
      emettreMacro()
    },
    [emettreMacro],
  )

  const changerRaccourci = useCallback(
    (nom: string, raccourci: string) => {
      const suite = macrosRef.current.map((m) => (m.name === nom ? { ...m, shortcut: raccourci } : m))
      macrosRef.current = suite
      setMacros(suite)
      macroCouranteRef.current = nom
      setMacroCourante(nom)
      const cible = suite.find((m) => m.name === nom)
      if (cible) {
        codeMacroRef.current = genererCode(cible)
        setCodeMacro(codeMacroRef.current)
      }
      emettreMacro()
    },
    [emettreMacro],
  )

  const supprimerMacro = useCallback(
    (nom: string) => {
      const suite = macrosRef.current.filter((m) => m.name !== nom)
      macrosRef.current = suite
      setMacros(suite)
      macroCouranteRef.current = suite[0]?.name ?? null
      setMacroCourante(macroCouranteRef.current)
      codeMacroRef.current = suite[0] ? genererCode(suite[0]) : ""
      setCodeMacro(codeMacroRef.current)
      emettreMacro()
    },
    [emettreMacro],
  )

  /* ── Contrôles des modules 13, 17, 18, 20 et 27 ────────────────────────── */

  /**
   * Rend `true` quand le contrôle appartient à l'un de ces modules : l'effet est
   * appliqué et l'observation déjà émise, `handleControl` n'a plus rien à faire.
   *
   * Principe, le même que pour `setup.cf` : quand un bouton remplace une boîte de
   * dialogue dont les paramètres ne peuvent venir que de l'auteur — la couleur
   * d'une série, la série à masquer, le nouveau type — c'est le `setup` de
   * l'étape qui fait foi. Quand le bouton se suffit à lui-même, on applique son
   * effet propre, ce qui laisse l'apprenant explorer hors des étapes.
   */
  const effetModele = useCallback(
    (controlId: string): boolean => {
      const grid = gridRef.current
      const s = stepRef.current

      /* Graphiques (modules 17, 18 et graphiques croisés du module 20) */
      if (controlId.startsWith("ins-graph-")) {
        const type = TYPE_PAR_CONTROLE[controlId]
        if (type || controlId === "ins-graph-recommande") {
          const spec = s?.setup?.chart
          if (spec) poserGraphique(creerGraphique({ ...spec, type: type ?? spec.type }))
          else if (grid) {
            // Sans déclaration, on devine comme Excel : la plage sélectionnée
            // porte ses en-têtes, ses libellés d'axe et ses séries.
            const sel = grid.getSelection()
            const devine = sel ? creerDepuisPlage(sel, type ?? "histogramme", lirePlage, { frame: cadreHorsSource(grid, sel) }) : null
            if (devine) poserGraphique(devine)
          }
          emettreGraphique(controlId)
          return true
        }
        const courant = graphiqueRef.current
        const patch = s?.setup?.chartEdit
        if (courant && patch) poserGraphique(modifierGraphique(courant, patch))
        else if (courant) {
          const el = ELEMENT_PAR_CONTROLE[controlId]
          const style = /^ins-graph-style-(\d+)$/.exec(controlId)
          const i = serieSelectionnee(courant)
          const nom = i !== null ? courant.series[i]?.name : undefined
          let libre: PatchGraphique | null = null
          if (el) libre = { elements: { [el]: !(courant.elements?.[el] ?? false) } }
          else if (style) libre = { style: Number(style[1]) }
          else if (controlId === "ins-graph-legende-droite") libre = { legendPosition: "droite", elements: { legende: true } }
          else if (controlId === "ins-graph-legende-bas") libre = { legendPosition: "bas", elements: { legende: true } }
          else if (nom && i !== null) {
            if (controlId === "ins-graph-tendance-lineaire") libre = { editSeries: [{ name: nom, trendline: "lineaire" }] }
            else if (controlId === "ins-graph-tendance-moyenne-mobile") libre = { editSeries: [{ name: nom, trendline: "moyenne-mobile" }] }
            else if (controlId === "ins-graph-tendance-supprimer") libre = { editSeries: [{ name: nom, trendline: undefined }] }
            else if (controlId === "ins-graph-filtre-serie") libre = { editSeries: [{ name: nom, hidden: !courant.series[i].hidden }] }
            else if (controlId === "ins-graph-supprimer-serie") libre = { removeSeries: [nom] }
          }
          if (libre) poserGraphique(modifierGraphique(courant, libre))
        }
        emettreGraphique(controlId)
        return true
      }

      /* Tableaux croisés (module 20) */
      if (controlId === "ins-tcd") {
        const spec = s?.setup?.pivot
        if (spec) poserTcdDansFeuille(creerTcd(spec, lireCellule))
        else {
          // Excel pose le tableau vide à côté du tableau source, et c'est
          // l'apprenant qui y dépose ensuite ses champs.
          const aire = parseRange(etendue)
          const cible = aire ? `${columnIndexToLetter(aire.endCol + 2)}3` : "H3"
          poserTcdDansFeuille(
            creerTcd({ source: etendue, target: cible, rows: [], cols: [], values: [], filters: [] }, lireCellule),
          )
        }
        emettreTcd(controlId)
        return true
      }
      if (controlId.startsWith("tcd-")) {
        const courant = tcdRef.current
        const patch = s?.setup?.pivotEdit
        if (courant) {
          if (controlId === "tcd-actualiser") poserTcdDansFeuille(modifierTcd(courant, patch ?? { refresh: true }, lireCellule))
          else if (controlId === "tcd-source" && patch) poserTcdDansFeuille(modifierTcd(courant, patch, lireCellule))
        }
        emettreTcd(controlId)
        return true
      }

      /* Mise en page (module 13) : les quatre boutons du ruban qui dépendent de
         la sélection. Tout le reste des réglages passe par le panneau du calque. */
      if (
        controlId === "mep-zone-impression-definir" ||
        controlId === "mep-imprimer-titres" ||
        controlId === "mep-saut-inserer" ||
        controlId === "mep-saut-supprimer"
      ) {
        const sel = grid?.getSelection() ?? ""
        const aire = parseRange(sel)
        const etat = reglagesRef.current
        let patch: PageSetupState | null = null
        if (controlId === "mep-zone-impression-definir") {
          patch = { printArea: sel }
        } else if (controlId === "mep-imprimer-titres") {
          // Excel ouvre ici une boîte de dialogue ; à défaut, la sélection dit
          // quelles lignes ou colonnes répéter, et le scénario tranche s'il l'a
          // déclaré.
          patch = s?.setup?.pageSetup ?? (aire
            ? { repeatRows: `$${aire.startRow + 1}:$${aire.endRow + 1}` }
            : null)
        } else if (aire) {
          const lignes = new Set(etat.pageBreakRows ?? [])
          const colonnes = new Set(etat.pageBreakCols ?? [])
          if (controlId === "mep-saut-inserer") {
            if (aire.startRow > 0) lignes.add(aire.startRow)
            if (aire.startCol > 0) colonnes.add(aire.startCol)
          } else {
            lignes.delete(aire.startRow)
            colonnes.delete(aire.startCol)
          }
          patch = { pageBreakRows: Array.from(lignes), pageBreakCols: Array.from(colonnes) }
        }
        if (patch) poserReglages(appliquerReglages(etat, patch))
        emettreReglages(controlId)
        return true
      }

      /* Macros (module 27). Le ruban et le panneau portent les mêmes commandes :
         celles qui touchent l'état des boîtes de dialogue sont relayées au
         panneau, pour qu'il n'y ait jamais deux vérités. */
      if (controlId.startsWith("dev-")) {
        if (controlId === "dev-arreter-enregistrement") {
          if (enregistrementRef.current) arreterMacro()
          else handleAction({ kind: "control", control: controlId, channel: "ribbon" })
          return true
        }
        setCommandeMacro({ nonce: Date.now(), controle: controlId })
        handleAction({ kind: "control", control: controlId, channel: "ribbon" })
        return true
      }

      return false
    },
    [
      arreterMacro,
      emettreGraphique,
      emettreReglages,
      emettreTcd,
      etendue,
      handleAction,
      lireCellule,
      lirePlage,
      poserGraphique,
      poserReglages,
      poserTcdDansFeuille,
    ],
  )

  /**
   * Les boutons du ruban doivent AGIR, pas seulement signaler un clic. Sans cela
   * l'apprenant clique « Insérer » et rien ne bouge — il croirait à une panne.
   * L'effet est appliqué d'abord, la validation ensuite : l'étape peut donc être
   * validée sur l'état du classeur qui en résulte.
   */
  /**
   * Gestes du poste de travail. Comme le tri ou le graphique, ils ont leur
   * propre effet et leur propre observation : le clic ne remonte pas comme un
   * simple `control`, sinon une étape qui juge l'ÉTAT du poste échouerait sur
   * l'observation du bouton, arrivée la première.
   */
  const gestePoste = useCallback(
    (controlId: string, nom?: string): boolean => {
      if (!posteActif || !controlId.startsWith("poste-")) return false
      const C = CONTROLES_POSTE
      let geste: GestePoste | null = null
      if (controlId === C.demarrer) geste = { type: "menu" }
      else if (controlId === C.fermer) geste = { type: "fermer" }
      else if (controlId === C.reduire) geste = { type: "reduire" }
      else if (controlId === C.nouveau) geste = { type: "nouveau" }
      else if (controlId === C.enregistrer) geste = { type: "ouvrirBoite", boite: "enregistrer" }
      else if (controlId === C.enregistrerSous) geste = { type: "ouvrirBoite", boite: "enregistrer", forcer: true }
      else if (controlId === C.enregistrerAnnuler) geste = { type: "fermerBoite" }
      else if (controlId === C.enregistrerValider) geste = { type: "enregistrer", nom: nom ?? "" }
      else if (controlId === C.ouvrir) geste = { type: "ouvrirBoite", boite: "ouvrir" }
      else if (controlId === C.ouvrirAnnuler) geste = { type: "fermerBoite" }
      else if (controlId === C.ouvrirValider) geste = { type: "ouvrirFichier", nom: nom ?? "" }
      else if (controlId.startsWith("poste-app-")) geste = { type: "lancer", app: controlId.slice("poste-app-".length) }
      else if (controlId.startsWith("poste-modele-")) geste = { type: "ouvrirModele", modele: controlId.slice("poste-modele-".length) }
      else if (controlId.startsWith("poste-fichier-")) {
        const cle = controlId.slice("poste-fichier-".length)
        const f = posteRef.current.fichiers.find((x) => CONTROLES_POSTE.fichier(x.nom).endsWith(cle))
        if (f) geste = { type: "ouvrirFichier", nom: f.nom }
      }
      if (!geste) return false
      const suivant = appliquerGeste(posteRef.current, geste)
      setPoste(suivant)
      handleAction({ kind: "posteChange", poste: suivant })
      return true
    },
    // L'état du poste est lu dans une REF, jamais capturé : `handleControl` est
    // mémoïsé et gardait sinon une version figée de ce callback, qui jugeait le
    // geste contre l'étape précédente — le clic sur Démarrer passait, les
    // suivants non.
    [posteActif, handleAction],
  )

  const handleControl = useCallback(
    (controlId: string) => {
      const grid = gridRef.current
      // Le poste de travail a ses propres transitions et sa propre observation.
      if (gestePoste(controlId)) return
      // Graphiques, tableaux croisés, mise en page et macros ont leurs propres
      // effets et leur propre observation : ils sortent d'ici.
      if (effetModele(controlId)) return

      /**
       * Le bouton Format déplie un menu — et n'émet RIEN, exactement comme un
       * onglet du ruban.
       *
       * C'est la seule façon de rendre vraies les quatre consignes du module 4
       * (« Ouvrez **Format** dans le groupe Cellules et choisissez **Largeur de
       * colonne** ») sans pénaliser l'apprenant : une observation `control`
       * ici arriverait AVANT celle de l'entrée du menu et compterait une faute
       * à qui suit la consigne à la lettre.
       */
      if (controlId === "acc-format") {
        setMenuFormat((v) => !v)
        return
      }
      // Tout autre clic referme le menu, comme dans Excel : une entrée choisie
      // ou un geste ailleurs, et le menu disparaît.
      setMenuFormat(false)
      if (controlId === "acc-format-fleche") {
        setMenuFormat(false)
        // La ref est posée AVANT l'observation : React groupe les mises à jour
        // d'état, donc `boiteRef.current` valait encore null quand
        // `handleAction` testait « une boîte est-elle ouverte ? ».
        boiteRef.current = "format-cellule"
        setBoite("format-cellule")
        // La boîte s'ouvre ET l'observation part : une étape qui jugerait ce
        // clic doit pouvoir se valider, comme pour tout autre bouton.
        handleAction({ kind: "control", control: controlId, channel: "ribbon" })
        return
      }
      if (controlId === "bf-fx") {
        boiteRef.current = "fonction"
        setBoite("fonction")
        handleAction({ kind: "control", control: controlId, channel: "ribbon" })
        return
      }
      // Somme automatique laisse la formule en attente de validation, comme
      // Excel. Le bouton ✓ doit relire l'état du classeur, pas être jugé comme
      // un simple clic de ruban : l'étape suivante attend le résultat calculé.
      if (controlId === "bf-entrer" && plageSomme && grid) {
        poserPlageSomme(null)
        handleAction({ kind: "stateChange", readings: {} })
        grid.focus()
        return
      }
      // L'enregistreur transcrit les boutons de mise en forme, comme Excel. Le
      // geste est lu AVANT l'effet : la sélection ne doit pas avoir bougé.
      const enreg = enregistrementRef.current
      if (enreg?.actif && grid) {
        const geste = gesteDepuisControle(controlId, grid.getSelection() || "A1")
        if (geste) {
          const suite = transcrire(enreg, geste)
          enregistrementRef.current = suite
          setEnregistrement(suite)
        }
      }
      // Un tri réussi est signalé par l'événement Univer, pas par le clic : on
      // évite d'émettre une observation « control » qui ferait échouer l'étape.
      let trie = false
      let triFait = false
      if (grid) {
        const info = grid.getSelectionKind()
        switch (controlId) {
          case "acc-inserer":
            if (info?.kind === "column") grid.insertColumnBefore(info.index)
            else if (info?.kind === "row") grid.insertRowBefore(info.index)
            break
          case "acc-supprimer":
            if (info?.kind === "column") grid.deleteColumn(info.index)
            else if (info?.kind === "row") grid.deleteRow(info.index)
            break
          case "acc-format-largeur":
            if (info?.kind === "column") grid.setColumnWidth(info.index, 160)
            break
          case "acc-format-masquer":
            if (info?.kind === "column") grid.hideColumn(info.index)
            else if (info?.kind === "row") grid.hideRow(info.index)
            break
          case "acc-gras":
            grid.toggleBold(true)
            break
          /* ── Les huit boutons qui ne faisaient rien (audit du 31/07/2026) ──
             Chacun est ici parce qu'un apprenant pouvait le cliquer sans que
             l'écran ne bouge — et, pour six d'entre eux, avec une consigne ou
             une bulle qui lui annonçait le contraire. */
          case "acc-somme-auto": {
            // Somme automatique d'Excel : la plage se devine en remontant depuis
            // la cellule active tant qu'on trouve des nombres, puis, à défaut,
            // vers la gauche. C'est ce que la leçon M06-L02-02 décrit —
            // « Excel propose une formule et entoure la plage qu'il compte
            // additionner » — et qui ne se produisait pas.
            const sel = grid.getSelection()
            const aire = sel ? parseRange(sel) : null
            if (!aire) break
            const ligne = aire.startRow
            const col = aire.startCol
            const estNombre = (r: number, c: number) =>
              typeof grid.getValue(`${columnIndexToLetter(c)}${r + 1}`) === "number"
            let debut = ligne
            while (debut - 1 >= 0 && estNombre(debut - 1, col)) debut--
            let plage: string | null = debut < ligne ? formatRange({ startRow: debut, startCol: col, endRow: ligne - 1, endCol: col }) : null
            if (!plage) {
              let g = col
              while (g - 1 >= 0 && estNombre(ligne, g - 1)) g--
              if (g < col) plage = formatRange({ startRow: ligne, startCol: g, endRow: ligne, endCol: col - 1 })
            }
            const cible = `${columnIndexToLetter(col)}${ligne + 1}`
            grid.applyCells({ [cible]: { f: plage ? `=SOMME(${plage})` : "=SOMME()" } })
            // Le liseré autour de la plage devinée : c'est la moitié de la
            // promesse de la consigne, et le seul moyen de comprendre CE
            // qu'Excel a choisi d'additionner.
            poserPlageSomme(plage)
            break
          }
          case "acc-copier": {
            // Excel ne déplace rien au copier : il marque la plage d'un liseré
            // animé. Cinq consignes l'annoncent mot pour mot. On ne réimplémente
            // pas le collage — `acc-coller` travaille sur `setup.paste`, déclaré
            // par le scénario — mais la marque, elle, existe désormais.
            setPresseP(grid.getSelection() ?? null)
            break
          }
          case "acc-effacer": {
            const sel = grid.getSelection()
            if (!sel) break
            const vides: Record<string, { v: string }> = {}
            for (const ref of cellsOf(sel)) vides[ref] = { v: "" }
            grid.applyCells(vides)
            break
          }
          case "acc-format-hauteur":
            if (info?.kind === "row") grid.setRowHeight(info.index, 28)
            break
          case "acc-format-afficher": {
            // On réaffiche tout ce qui est masqué DANS la sélection : c'est le
            // geste d'Excel, et le seul qui puisse atteindre une colonne
            // devenue invisible.
            const aire = info ? parseRange(info.ref) : null
            if (info?.kind === "column" && aire) grid.showColumn(aire.startCol, aire.endCol - aire.startCol + 1)
            else if (info?.kind === "row" && aire) grid.showRow(aire.startRow, aire.endRow - aire.startRow + 1)
            break
          }
          case "acc-mfc-regle": {
            // Les paramètres viennent du scénario, faute de boîte de dialogue :
            // le geste évalué est le choix du type de règle et de la plage.
            const cf = stepRef.current?.setup?.cf
            if (cf) grid.addConditionalRule(cf.range, cf.rule)
            break
          }
          case "acc-mfc-effacer": {
            const cf = stepRef.current?.setup?.cf
            grid.clearConditionalRules(cf?.range ?? grid.getSelection() ?? "A1")
            break
          }
          case "acc-coller": {
            setPresseP(null)
            // Un collage passe par Univer et rend une promesse : on valide après.
            const coll = stepRef.current?.setup?.paste
            if (coll) {
              void grid.pasteText(coll.texte).then(() => {
                handleAction({ kind: "control", control: controlId, channel: "ribbon" })
              })
              return
            }
            break
          }
          case "don-convertir": {
            const sp = stepRef.current?.setup?.split
            if (sp) grid.splitToColumns(sp.range, sp.separateur, sp.fusionnerSeparateurs)
            break
          }
          case "acc-format-monetaire":
            // Deux décimales, séparateur de milliers et symbole € : le format
            // « Monétaire » d'Excel. La localisation numfmt le rend en français.
            grid.setNumberFormatOnSelection('#,##0.00" €"')
            break
          case "acc-pourcentage":
            grid.setNumberFormatOnSelection("0.00%")
            break
          case "acc-format-date":
            grid.setNumberFormatOnSelection("dd/mm/yyyy")
            break
          case "acc-format-nombre":
            grid.setNumberFormatOnSelection("#,##0.00")
            break
          case "acc-italique":
            grid.setItalic(true)
            break
          case "acc-souligne":
            grid.setUnderline(true)
            break
          case "acc-taille-plus":
            grid.setFontSize(14)
            break
          case "acc-taille-moins":
            grid.setFontSize(9)
            break
          case "acc-couleur-police":
            grid.setFontColor("#b91c1c")
            break
          case "acc-remplissage":
            grid.setBackground("#fde68a")
            break
          case "acc-bordures":
            grid.setBorderAll(true)
            break
          case "acc-aligner-gauche":
            grid.setAlign("left")
            break
          case "acc-aligner-centre":
            grid.setAlign("center")
            break
          case "acc-aligner-droite":
            grid.setAlign("right")
            break
          case "acc-fusionner":
            grid.mergeCells()
            break
          case "acc-renvoyer-ligne":
            grid.setWrap(true)
            break
          case "ui-nouvelle-feuille":
            grid.insertSheet()
            setSheets(grid.getSheets())
            break
          case "don-tri-croissant":
          case "don-tri-decroissant": {
            trie = true
            // Excel devine la plage et repère la ligne d'en-tête ; Univer non.
            // La plage à trier vient donc du scénario, et la colonne du clic de
            // l'apprenant — c'est bien son choix de colonne qu'on évalue.
            const attendu = stepRef.current?.action
            /* La plage à trier n'est servie que si la consigne la nomme : Excel
               la devine, Univer non. Sans elle on retombe sur la plage de filtre
               déclarée par le classeur, puis sur l'étendue utile — deux
               informations publiques, visibles à l'écran. */
            const plage =
              (attendu?.type === "SORT_RANGE" ? attendu.range : "") ||
              scenario.workbook.filterRange ||
              etendue ||
              ""
            const sel = grid.getSelection()
            if (plage && sel) {
              // Découper à la main les lettres d'une référence donnait « AC »
              // pour « A2:C6 » : on passe par les analyseurs de plage.
              const aire = parseRange(plage)
              const clic = parseRange(sel)
              // Univer attend un indice RELATIF au premier champ de la plage,
              // pas un indice absolu de feuille : vérifié au banc, une plage
              // qui ne commence pas en colonne A triait sinon la mauvaise.
              if (aire && clic) {
                const relatif = clic.startCol - aire.startCol
                if (relatif >= 0 && clic.startCol <= aire.endCol) {
                  triFait = grid.sortRange(plage, relatif, controlId === "don-tri-croissant")
                }
              }
            }
            break
          }
          case "don-filtrer": {
            // La plage à filtrer décrit le tableau de la feuille, pas l'étape :
            // au moment du clic, l'étape courante est encore le CLICK_CONTROL.
            const plage = scenario.workbook.filterRange ?? ""
            if (plage) grid.createFilter(plage)
            break
          }
          case "don-effacer-filtre":
            grid.removeFilter()
            break
          case "don-validation": {
            const dv = stepRef.current?.setup?.dv
            if (dv) grid.addValidation(dv.range, dv.rule)
            break
          }
          case "ins-image-cellule": {
            // L'insertion est asynchrone : l'étape se valide une fois l'image
            // réellement posée, sinon on validerait un geste sans effet.
            const img = stepRef.current?.setup?.image
            if (img) {
              void grid.insertCellImage(img.ref, img.source).then(() => {
                handleAction({ kind: "control", control: controlId, channel: "ribbon" })
              })
              return
            }
            break
          }
          case "rev-commentaire": {
            const n = stepRef.current?.setup?.note
            if (n) grid.setNote(n.ref, n.texte)
            break
          }
          case "rev-supprimer-commentaire": {
            const n = stepRef.current?.setup?.note
            grid.deleteNote(n?.ref ?? grid.getSelection() ?? "A1")
            break
          }
          case "aff-figer-volets": {
            const f = stepRef.current?.setup?.freeze
            grid.setFreeze(f?.rows ?? 1, f?.cols ?? 0)
            break
          }
          case "aff-liberer-volets":
            grid.cancelFreeze()
            break
          case "don-effacer-validation": {
            const dv = stepRef.current?.setup?.dv
            grid.clearValidation(dv?.range ?? grid.getSelection() ?? "A1")
            break
          }
        }
      }
      if (trie && triFait) return

      // La valeur cible itère sur le classeur : le résultat n'est connu qu'après
      // plusieurs recalculs, donc on valide l'étape à la fin de la recherche.
      const cible = stepRef.current?.setup?.goalSeek
      if (controlId === "don-valeur-cible" && cible && grid) {
        travauxDemoRef.current += 1
        void grid
          .goalSeek(cible.formulaRef, cible.target, cible.inputRef)
          .finally(() => {
            travauxDemoRef.current = Math.max(0, travauxDemoRef.current - 1)
          })
          .then(() => {
            setSelection(grid.getSelection() ?? cible.inputRef)
            setStats(grid.getSelectionStats() ?? null)
            handleAction({ kind: "control", control: controlId, channel: "ribbon" })
          })
        return
      }

      // Une étape validée sur la MISE EN FORME lit l'état après le clic : la
      // mise en forme ne déclenche aucun événement de valeur, et laisser passer
      // une observation « control » ferait échouer l'étape.
      const attenduFmt = stepRef.current?.action
      if (attenduFmt?.type === "EXPECT_FORMAT" && grid) {
        // En évaluation notée, l'étape ne déclare plus ses cellules : on relève
        // la zone utile et le serveur y prélève ce qu'il attend.
        const refs = cellulesARelever(attenduFmt.cells ? Object.keys(attenduFmt.cells) : null)
        // Les commandes Univer s'appliquent de façon asynchrone : lire tout de
        // suite renvoie l'ancien style.
        window.setTimeout(() => {
          const readings: Record<
            string,
            {
              background: string
              fontSize: number | null
              hAlign: string
              vAlign: string
              wrap: boolean | null
              numberFormat: string
            }
          > = {}
          for (const ref of refs) readings[ref] = grid.getFormat(ref)
          handleAction({ kind: "formatChange", readings })
        }, 220)
        return
      }

      handleAction({ kind: "control", control: controlId, channel: "ribbon" })
    },
    [effetModele, handleAction, gestePoste, plageSomme, poserPlageSomme],
  )

  // Après Somme automatique, Entrée et le bouton ✓ sont deux réalisations du
  // même geste. Le focus peut encore être sur le bouton du ruban : écouter au
  // niveau de la fenêtre évite qu'Entrée relance « Somme » au lieu de valider
  // la formule déjà proposée.
  useEffect(() => {
    if (!plageSomme) return
    const validerAvecEntree = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return
      if (stepRef.current?.action.type !== "EXPECT_STATE") return
      e.preventDefault()
      e.stopPropagation()
      handleControl("bf-entrer")
    }
    window.addEventListener("keydown", validerAvecEntree, true)
    return () => window.removeEventListener("keydown", validerAvecEntree, true)
  }, [handleControl, plageSomme])

  /**
   * Presse un contrôle PENDANT la démonstration : l'effet est appliqué, la
   * validation neutralisée.
   *
   * C'est le chemin exact de l'apprenant — `handleControl` pour le ruban et les
   * panneaux, `gestePoste` pour les boîtes du bureau, qui prennent le nom du
   * fichier en argument. Aucun effet n'est réécrit ici : la démonstration
   * emprunte le code qui marche déjà, et le verrou empêche seulement l'étape de
   * se valider toute seule au milieu de l'explication.
   */
  const presserDemo = useCallback(
    (id: string, arg?: string) => {
      // Un écran de LECTURE illustre, il ne modifie pas le classeur : ses
      // cellules sont remises en place à la fin (`rendreClasseur`), mais un tri,
      // un format ou un nom de plage ne le seraient pas. On montre alors le
      // geste sans l'exécuter.
      //
      // EXCEPTION — les boutons qui n'ouvrent qu'un menu ou une boîte. Ils ne
      // touchent NI les cellules NI la mise en forme, et `rendreClasseur` les
      // referme en fin de démonstration. Sans elle, la bulle de `M01-L02-08`
      // — « la petite flèche ▾ ouvre la boîte de dialogue complète » — restait
      // une affirmation que rien ne venait montrer : c'est précisément le
      // défaut que Samuel a filmé le 31/07/2026.
      const OUVRE_SANS_MODIFIER = ["acc-format", "acc-format-fleche", "bf-fx"]
      if (stepRef.current?.action.type === "READ" && !OUVRE_SANS_MODIFIER.includes(id)) return
      /**
       * Un SÉLECTEUR, pas un identifiant de contrôle.
       *
       * Le volet des champs du tableau croisé ne passe pas par `handleControl` :
       * chaque bouton — retirer un champ, ouvrir le menu d'agrégat, choisir la
       * zone de dépôt — porte son propre `onClick`. Tant que le plan ne savait
       * viser que des `data-control`, une étape de MODIFICATION de tableau
       * croisé n'avait pas d'autre geste disponible que « insérer un tableau
       * croisé » — celui qui efface le tableau. On clique donc l'élément réel,
       * exactement comme l'apprenant.
       */
      if (id.startsWith("[")) {
        verrouillerDemo(1400)
        const el = document.querySelector<HTMLElement>(id)
        /* La trace dit si l'élément EXISTAIT : « pressé » sur un sélecteur qui
           ne trouve rien est un faux témoignage, et c'est justement ce qui
           masquait `mep-echelle` absent du DOM quand le panneau de mise en page
           n'est pas déployé (m13-e01). */
        if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
          const w = window as any
          const trace = (arg === undefined ? id : `${id}=${arg}`) + (el ? "" : " (absent)")
          w.__SIM_DEMO_PRESSES = [...(w.__SIM_DEMO_PRESSES ?? []), trace]
        }
        if (!el) return
        /**
         * UNE LISTE DÉROULANTE NE SE CLIQUE PAS.
         *
         * Le filtre de rapport du tableau croisé est un `<select>` contrôlé par
         * React : `el.click()` l'ouvre visuellement et n'y choisit RIEN — la
         * démonstration montrait le bon endroit et le filtre restait sur
         * « (Tous) ». Même remède que pour le champ « Nom du fichier » de la
         * boîte Enregistrer sous : on pose la valeur par le mutateur natif, puis
         * on émet l'événement que React écoute.
         */
        if (arg !== undefined && (el instanceof HTMLSelectElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          const proto =
            el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
            : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
          el.focus()
          /**
           * PASSER PAR UNE AUTRE VALEUR QUAND C'EST DÉJÀ LA BONNE.
           *
           * React n'appelle `onChange` que si la valeur CHANGE. Le champ
           * « Échelle » affiche l'échelle CALCULÉE tant qu'aucune échelle
           * manuelle n'est posée : sur m13-l01, l'ajustement « 1 page en
           * largeur » l'affichait déjà à 100, écrire « 100 » ne déclenchait
           * rien, et le réglage restait en ajustement automatique alors que la
           * leçon annonce le retour à 100 %.
           */
          const ecrire = (cible: Element, v: string) => {
            if (setter) setter.call(cible, v)
            else (cible as HTMLInputElement).value = v
          }
          const poser = (cible: Element, v: string) => {
            ecrire(cible, v)
            // React écoute `input` sur les champs libres et `change` sur les
            // listes : on émet les deux, l'inutile est simplement ignoré.
            cible.dispatchEvent(new Event("input", { bubbles: true }))
            cible.dispatchEvent(new Event("change", { bubbles: true }))
          }
          if ((el as HTMLInputElement).value === arg) {
            /* Une valeur VOISINE et valide, pas une valeur vide : `Number("")`
               vaut 0, que `appliquerReglages` ramène au minimum — le champ
               retombait à 10 % et n'en repartait plus. */
            const n = Number(arg)
            poser(el, Number.isFinite(n) && n !== 0 ? String(n - 1) : "0")
          }
          /* ON REDEMANDE L'ÉLÉMENT. React a pu remonter le champ entre les deux
             écritures : écrire sur le nœud détaché ne produisait plus rien, et
             l'échelle restait à la valeur de passage (99 au lieu de 100). */
          const dernier = (document.querySelector(id) ?? el) as HTMLElement
          poser(dernier, arg)
          /**
           * Et on VALIDE, comme l'apprenant : certains champs n'appliquent leur
           * valeur qu'à la validation, quand `onChange` n'a rien vu changer.
           *
           * ⚠️ On RÉÉCRIT la valeur juste avant. Un champ contrôlé peut être
           * revenu à son affichage calculé entre l'écriture et la validation :
           * la validation lisait alors l'ANCIENNE valeur et écrasait la bonne —
           * l'échelle repartait à 34 % au lieu de 100 % (m13-e01).
           */
          const confirmer = (document.querySelector(id) ?? dernier) as HTMLElement
          ecrire(confirmer, arg)
          confirmer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
          confirmer.dispatchEvent(new FocusEvent("blur", { bubbles: false }))
          return
        }
        cliquerElement(el)
        return
      }
      // Les commandes d'Univer et les couches s'appliquent de façon asynchrone,
      // et l'observation de mise en forme est relue 220 ms après le clic : le
      // verrou doit couvrir tout cela.
      verrouillerDemo(1400)
      // Trace d'audit : quels boutons la démonstration a réellement pressés.
      if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
        const w = window as any
        w.__SIM_DEMO_PRESSES = [...(w.__SIM_DEMO_PRESSES ?? []), id]
      }
      // « Enregistrer sous » comporte DEUX gestes : remplacer le nom proposé,
      // puis valider. La première version passait directement le nom final à
      // la transition du poste : le fichier était bien créé, mais le champ ne
      // changeait jamais à l'écran — la démonstration sautait précisément ce
      // qu'elle devait enseigner. On rejoue ici une vraie saisie sur l'input
      // contrôlé par React, événement compris, avant le clic suivant.
      if (id === CONTROLES_POSTE.nomFichier && arg !== undefined) {
        const el = document.querySelector<HTMLInputElement>(
          `[data-control="${CONTROLES_POSTE.nomFichier}"]`,
        )
        if (!el) return
        el.focus()
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
        if (setter) setter.call(el, arg)
        else el.value = arg
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.setSelectionRange(arg.length, arg.length)
        return
      }
      // Les boutons du poste qui prennent un nom de fichier n'ont pas d'équivalent
      // cliquable sans saisie : on passe par la transition directement.
      if (arg !== undefined && id.startsWith("poste-")) {
        gestePoste(id, arg)
        return
      }
      // CLIQUER LE VRAI ÉLÉMENT quand il est là, exactement comme l'apprenant.
      //
      // Appeler `handleControl` semblait équivalent, et ça l'est pour le ruban —
      // mais pas pour les panneaux. Les options du panneau Mise en page
      // (`aff-mode-*`, orientation, marges) sont des boutons de choix dont
      // l'effet passe par leur propre `onChange`, jamais par `handleControl` :
      // la pression ne faisait donc rien, le mode d'affichage ne changeait pas,
      // et l'étape suivante visait la zone d'en-tête qui n'existe QUE dans ce
      // mode — geste invisible en cascade (modules 13). Le clic DOM couvre les
      // deux familles d'un seul geste.
      const el = document.querySelector<HTMLElement>(`[data-control="${id}"]`)
      if (el) cliquerElement(el)
      else handleControl(id)
    },
    [gestePoste, handleControl, verrouillerDemo],
  )

  /** Sélectionne pour de vrai pendant la démonstration, sans rien valider. */
  const selectionnerDemo = useCallback((ref: string) => {
    const grid = gridRef.current
    if (!grid) return
    /**
     * `col:A` et `ligne:3` : une COLONNE ou une LIGNE ENTIÈRE.
     *
     * Le plan ne peut pas écrire `A1:A40` — il ne sait pas combien de lignes la
     * feuille compte, et `getSelectionKind` ne reconnaît une colonne entière
     * qu'à `endRow >= maxRows - 1`. Une plage trop courte passerait pour une
     * simple plage, et « insérer une colonne » ne ferait rien. On demande donc
     * les bornes réelles au moment du geste.
     */
    const entier = /^(col|ligne):(.+)$/.exec(ref)
    if (entier) {
      const b = grid.getBornes()
      ref = entier[1] === "col"
        ? `${entier[2]}1:${entier[2]}${b.rows}`
        : `A${entier[2]}:${columnIndexToLetter(b.cols - 1)}${entier[2]}`
    }
    grid.setSelection(ref)
    setSelection(ref)
    setStats(grid.getSelectionStats(ref))
  }, [])

  /** Validation de la zone Nom : on va à la référence, et on le signale. */
  const commitNameBox = useCallback(() => {
    const grid = gridRef.current
    const raw = (nameBoxDraft ?? "").trim()
    setNameBoxDraft(null)
    if (!grid || !raw) return

    // La zone Nom d'Excel a deux usages selon ce qu'on y tape : une référence
    // déplace la sélection, un nom inédit nomme la sélection courante.
    const estReference = /^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(:\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?$/.test(raw)
    const defini = grid.getDefinedNames().find((n) => n.name.toUpperCase() === raw.toUpperCase())

    if (!estReference && !defini) {
      const portee = grid.getSelection()
      if (!portee) return
      const pose = grid.defineName(raw, portee)
      grid.focus()
      if (pose) handleAction({ kind: "defineName", name: raw, ref: portee })
      return
    }

    // Univer ne résout pas un nom défini : il lirait « Prix_HT » comme une
    // référence de colonne et lèverait une erreur. On traduit donc le nom en
    // plage nous-mêmes, en retirant l'éventuel préfixe de feuille.
    const cible = estReference ? raw.toUpperCase() : (defini?.ref ?? "").split("!").pop() || ""
    if (!cible) return
    grid.setSelection(cible)
    grid.focus()
    const now = grid.getSelection()
    if (now) {
      setSelection(now)
      setStats(grid.getSelectionStats(now))
    }
    handleAction({ kind: "gotoRef", ref: now || cible })
  }, [nameBoxDraft, handleAction])

  const handleSheet = useCallback(
    (name: string) => {
      const grid = gridRef.current
      if (grid) {
        grid.activateSheet(name)
        setSheets(grid.getSheets())
        grid.focus()
      }
      handleAction({ kind: "selectSheet", name })
    },
    [handleAction],
  )

  const revealHint = useCallback(() => {
    if (hintShown) return
    montrerIndice()
    pendingRef.current.hints += 1
  }, [hintShown, montrerIndice])

  /* ── Gestes dans les couches ───────────────────────────────────────────── */

  /** Clic sur un élément DU graphique : titre, légende, axe, série, point. */
  const choisirElementGraphique = useCallback(
    (element: string) => {
      const courant = graphiqueRef.current
      if (!courant) return
      poserGraphique(selectionnerElement(courant, element))
      handleAction({ kind: "chartElement", element })
    },
    [handleAction, poserGraphique],
  )

  const deplacerGraphique = useCallback(
    (frame: NonNullable<ChartState["frame"]>) => {
      const courant = graphiqueRef.current
      if (courant) poserGraphique({ ...courant, frame })
    },
    [poserGraphique],
  )

  /**
   * Dépôt d'un champ dans une zone du volet.
   *
   * Le geste de l'apprenant est ce qui compte : c'est lui qui construit le patch,
   * donc un champ déposé dans la mauvaise zone donne bien un tableau faux et
   * l'étape refuse. Quand le scénario a déclaré CE dépôt-là, on prend sa version
   * — elle porte ce que le volet ne sait pas dire, par exemple la valeur du
   * filtre de rapport qui accompagne le champ.
   */
  const deposerChamp = useCallback(
    (champ: string, zone: ZoneTcd) => {
      const courant = tcdRef.current
      if (!courant) return
      const declare = stepRef.current?.setup?.pivotEdit
      const cle = ({ rows: "addRows", cols: "addCols", values: "addValues", filters: "addFilters" } as const)[zone]
      const memeGeste =
        declare &&
        ((declare[cle] ?? []).some((f) => f.name === champ) ||
          ((declare[zone] as typeof declare.rows | undefined) ?? []).some((f) => f.name === champ))
      const patch: PatchTcd = memeGeste ? declare! : { [cle]: [{ name: champ }] }
      poserTcdDansFeuille(modifierTcd(courant, patch, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  const changerAgregat = useCallback(
    (champ: string, agg: PivotAgg) => {
      const courant = tcdRef.current
      if (!courant) return
      const declare = stepRef.current?.setup?.pivotEdit
      const memeGeste = declare?.values?.some((f) => f.name === champ && f.agg === agg)
      const patch: PatchTcd = memeGeste ? declare! : { addValues: [{ name: champ, agg }] }
      poserTcdDansFeuille(modifierTcd(courant, patch, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  const retirerChamp = useCallback(
    (champ: string) => {
      const courant = tcdRef.current
      if (!courant) return
      const declare = stepRef.current?.setup?.pivotEdit
      const memeGeste = declare?.removeFields?.includes(champ)
      poserTcdDansFeuille(modifierTcd(courant, memeGeste ? declare! : { removeFields: [champ] }, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  const changerStyleTcd = useCallback(
    (styleId: number) => {
      const courant = tcdRef.current
      if (!courant) return
      poserTcdDansFeuille(modifierTcd(courant, { styleId }, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  const actualiserTcd = useCallback(() => {
    const courant = tcdRef.current
    if (!courant) return
    const declare = stepRef.current?.setup?.pivotEdit
    poserTcdDansFeuille(modifierTcd(courant, declare?.refresh ? declare : { refresh: true }, lireCellule))
    emettreTcd()
  }, [emettreTcd, lireCellule, poserTcdDansFeuille])

  const changerValeursFiltre = useCallback(
    (champ: string, valeurs: string[]) => {
      const courant = tcdRef.current
      if (!courant) return
      const suivant = { ...(courant.filterValues ?? {}) }
      if (valeurs.length === 0) delete suivant[champ]
      else suivant[champ] = valeurs
      poserTcdDansFeuille(modifierTcd(courant, { filterValues: suivant }, lireCellule))
      emettreTcd()
    },
    [emettreTcd, lireCellule, poserTcdDansFeuille],
  )

  /**
   * Réglage proposé par le calque de mise en page. On l'applique TEL QUEL : c'est
   * le seul moyen qu'un apprenant qui choisit Portrait alors qu'on demandait
   * Paysage voie son geste refusé. Le `setup` de l'étape, qui décrit le même
   * réglage, sert de référence au juge — pas de valeur de substitution.
   */
  const changerReglages = useCallback(
    (patch: PageSetupState) => {
      poserReglages(appliquerReglages(reglagesRef.current, patch))
      emettreReglages()
    },
    [emettreReglages, poserReglages],
  )

  /**
   * Relais d'observation pour les contrôles qui vivent DANS les couches.
   *
   * Les couches n'ont pas de rappel « un bouton a été cliqué » — elles remontent
   * des intentions métier, et c'est très bien ainsi. Mais deux étapes du module 13
   * jugent l'ouverture de la boîte En-tête et pied de page, un geste sans autre
   * effet observable. On lit donc le `data-control` au vol, et UNIQUEMENT quand
   * l'étape juge un clic de bouton : sinon on émettrait une observation parasite
   * en plus de celle que la couche vient de produire.
   */
  const relaisControleCouche = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const cible = (e.target as HTMLElement | null)?.closest?.("[data-control]")
      const id = cible?.getAttribute("data-control")
      if (!id) return
      // Le panneau garde pour lui la macro choisie : ce clic est le seul moyen de
      // savoir laquelle, et donc d'afficher le bon code dans l'éditeur.
      if (id.startsWith("mac-choix-")) {
        const nom = id.slice("mac-choix-".length)
        const m = macrosRef.current.find((x) => x.name === nom)
        if (m) {
          macroCouranteRef.current = nom
          setMacroCourante(nom)
          codeMacroRef.current = genererCode(m)
          setCodeMacro(codeMacroRef.current)
        }
        return
      }
      if (stepRef.current?.action.type !== "CLICK_CONTROL") return
      handleAction({ kind: "control", control: id, channel: "ribbon" })
    },
    [handleAction],
  )

  /* ── Données à peindre par les couches ─────────────────────────────────── */

  /** Valeurs des plages du graphique, relues à chaque étape ET à chaque salve. */
  const valeursGraphique = useMemo(() => {
    const out: Record<string, unknown[]> = {}
    if (!graphique || !gridReady) return out
    const plages = [graphique.categories, ...graphique.series.map((s) => s.values)]
    for (const p of plages) if (p) out[p] = lirePlage(p)
    return out
    // `index` fait partie des dépendances : une étape qui modifie les cellules
    // sources doit redessiner le graphique. `versionClasseur` aussi, et c'est
    // indispensable quand une plage du graphique contient des FORMULES : au
    // montage, le moteur n'a pas fini de recalculer (60 à 120 ms), donc la
    // lecture rend une case vide et la barre correspondante manque. Un
    // graphique déclaré dans le classeur sur une ligne de total s'ouvrait ainsi
    // sans sa barre écrasante — le défaut que l'apprenant doit voir n'était pas
    // à l'écran tant qu'il n'avait pas franchi une étape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphique, gridReady, index, versionClasseur, lirePlage])

  const tableauTcd = useMemo(() => (tcd ? calculerTcd(tcd) : null), [tcd])
  const champsTcd = useMemo(() => (tcd ? champsDisponibles(tcd.instantane) : []), [tcd])
  const valeursFiltre = useCallback(
    (champ: string) => {
      const source = tcdRef.current?.instantane
      if (!source) return []
      const vues = new Set<string>()
      for (const l of source.lignes) {
        const v = l[champ]
        if (v !== null && v !== undefined && String(v).trim() !== "") vues.add(String(v).trim())
      }
      return Array.from(vues).sort((a, b) => a.localeCompare(b, "fr-FR", { numeric: true }))
    },
    [],
  )
  /** Excel envoie un champ numérique en Valeurs, les autres en Lignes. */
  const zoneParDefautTcd = useCallback(
    (champ: string): ZoneTcd => {
      const source = tcdRef.current?.instantane
      if (!source) return "rows"
      return aggParDefaut(champ, source) === "nombre" ? "rows" : "values"
    },
    [],
  )

  /**
   * Dimensions réelles de la grille, pour que les feuilles de papier tombent
   * exactement sur les bonnes bandes de lignes et de colonnes.
   */
  const metrique = useMemo(() => {
    const grid = gridRef.current
    const aire = parseRange(etendue)
    const nbCols = (aire?.endCol ?? 9) + 4
    const nbLignes = (aire?.endRow ?? 40) + 4
    const colonnes: number[] = []
    const lignes: number[] = []
    for (let c = 0; c < nbCols; c++) colonnes.push(grid?.getColumnWidth(c) ?? 88)
    for (let r = 0; r < nbLignes; r++) lignes.push(grid?.getRowHeight(r) ?? 24)
    // En-têtes d'Univer : 46 px de large pour les numéros de ligne, 20 px de haut
    // pour les lettres de colonne.
    return { colonnes, lignes, offsetX: 46, offsetY: 20 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etendue, gridReady, index])

  const pagination: Pagination = useMemo(
    () => calculerPages(reglages, metrique.colonnes, metrique.lignes, etendue),
    [reglages, metrique, etendue],
  )

  /* ── Halo d'aide ───────────────────────────────────────────────────────── */

  // En leçon on montre la cible tout de suite ; en exercice sur demande ; jamais
  // en évaluation.
  const highlightedControl = useMemo(() => {
    if (!step) return null
    // Le bouton attendu s'allume aussi dès le deuxième essai raté, hors
    // évaluation : c'est le pendant du halo sur la cellule.
    const forcer = (essais >= 2 || tatonnements >= 4 || tropLong || demonstration) && mode !== "EVALUATION"
    if (!forcer && (mode === "EVALUATION" || !hintShown)) return null
    return cibleDemonstration(step.action).controle ?? null
  }, [mode, hintShown, step, essais, tatonnements, tropLong, demonstration])

  // `showTarget` était déclaré dans 150 aides et n'affichait rien : l'apprenant
  // bloqué demandait une aide censée pointer la cellule et ne voyait aucun
  // repère. On calcule le rectangle de la cible avec les métriques d'Univer.
  const [halo, setHalo] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const grid = gridRef.current
    if (!grid || !step) {
      setHalo(null)
      return
    }
    // À partir du deuxième essai raté, la cible s'allume même si l'étape n'a pas
    // d'aide rédigée — c'était le cas de deux tiers des étapes. Jamais en
    // évaluation notée : montrer la cible reviendrait à souffler la réponse.
    const forcer = (essais >= 2 || tatonnements >= 4 || tropLong || demonstration) && mode !== "EVALUATION"
    if (!forcer && (mode === "EVALUATION" || !hintShown || !step.aide?.showTarget)) {
      setHalo(null)
      return
    }
    const a = step.action
    // `cibleDemonstration` couvre plus de gestes que l'ancien calcul : il ignorait
    // notamment `EXPECT_STATE` et `EXPECT_FORMAT`, les deux modes de validation
    // les plus fréquents après la saisie.
    const cible =
      cibleDemonstration(a).cellule ??
      (a.type === "DEFINE_NAME" ? (a.ref ?? null) : null)
    if (!cible) {
      setHalo(null)
      return
    }
    // Une plage se surligne d'un coin à l'autre ; une cellule seule suffit.
    const bornes = cible.split(":")
    const calculer = () => {
      const premier = grid.getCellRect(bornes[0])
      const dernier = grid.getCellRect(bornes[bornes.length - 1])
      if (!premier || !dernier) return false
      const left = Math.min(premier.left, dernier.left)
      const top = Math.min(premier.top, dernier.top)
      setHalo({
        left,
        top,
        width: Math.max(premier.left + premier.width, dernier.left + dernier.width) - left,
        height: Math.max(premier.top + premier.height, dernier.top + dernier.height) - top,
      })
      return true
    }
    // Au tout premier montage le squelette de rendu d'Univer n'existe pas encore
    // et la géométrie n'est pas calculable : la première étape de chaque leçon
    // restait alors sans repère. On retente une fois, peu après.
    if (!calculer()) {
      const t = window.setTimeout(calculer, 350)
      return () => window.clearTimeout(t)
    }
    // `gridReady` est indispensable : au premier montage la grille n'existe pas
    // encore, l'effet calculait un halo nul et ne se rejouait jamais — la
    // première étape de chaque leçon restait sans repère.
  }, [mode, hintShown, step, index, gridReady, essais, tatonnements, tropLong, demonstration])

  /**
   * Géométrie de la démonstration animée. Recalculée comme le halo, à partir des
   * métriques d'Univer — la grille est un canvas, il n'existe aucun élément DOM
   * par cellule. `null` tant que le geste ne se montre pas honnêtement : on garde
   * alors la réponse écrite.
   */
  /**
   * Plan de démonstration, MÉMOÏSÉ sur l'étape.
   *
   * Il vivait dans un state recalculé par un effet : chaque écriture de la
   * démonstration provoquait un rendu, donc un nouvel objet `plan`, donc une
   * nouvelle référence de `gestes` — et la minuterie du calque repartait de
   * zéro à l'infini. La démonstration restait bloquée sur son premier geste,
   * compteur figé à « 1 / 8 ». C'est le « des fois elle se finit pas ».
   */
  const demo = useMemo(() => {
    if (!demonstration || !step) return null
    // L'onglet est lu par une RÉFÉRENCE, pas par une dépendance : la
    // démonstration ouvre elle-même l'onglet dont elle a besoin, donc en faire
    // une dépendance recalculerait le plan en pleine séquence, changerait la
    // référence des gestes et relancerait la minuterie du calque à zéro — la
    // démonstration se figerait sur son premier geste. Ce qui compte est
    // l'onglet ouvert au DÉMARRAGE.
    // Le `setup` entre dans le contexte : lui seul distingue « créer un
    // graphique » de « modifier celui qui est là », deux étapes que
    // `EXPECT_CHART` décrit de la même façon. Sans lui, la démonstration
    // pressait la galerie et reconstruisait le modèle par-dessus le travail.
    const depart = {
      onglet: ongletRef.current,
      boitePoste: posteDepartEtapeRef.current?.boite,
      setup: step.setup,
      // Les champs déjà placés dans le tableau croisé : `rows`/`cols`/`filters`
      // d'un `pivotEdit` REMPLACENT la liste, donc le plan doit savoir ce qu'il
      // faut retirer avant de déposer.
      classeurNomme: !!posteDepartEtapeRef.current?.classeur,
      macrosCourantes: macrosRef.current.map((m) => m.name),
      /* Les sauts DÉJÀ posés : la démonstration ne repose que ceux qui
         manquent, et n'oublie aucun de ceux que l'étape déclare. */
      reglagesCourants: {
        pageBreakRows: reglagesRef.current.pageBreakRows ?? [],
        pageBreakCols: reglagesRef.current.pageBreakCols ?? [],
      },
      tcdCourant: tcdRef.current
        ? {
            rows: tcdRef.current.rows.map((f) => f.name),
            cols: tcdRef.current.cols.map((f) => f.name),
            values: tcdRef.current.values.map((f) => f.name),
            filters: tcdRef.current.filters.map((f) => f.name),
          }
        : undefined,
    }
    if (step.montrer?.length) {
      // Un écran de lecture montre le geste qu'il décrit, y compris pendant une
      // évaluation : ce n'est pas une aide sur une question notée, c'est le
      // contenu lui-même. Partout ailleurs, l'évaluation reste sans
      // démonstration.
      // Les plans s'enchaînent : les gestes bout à bout, les repères de suivi
      // à la file, pour un compteur « i / n » qui court sur toute la séquence.
      const plans = step.montrer.map((a) => planDemonstration(a, depart)).filter(Boolean) as PlanDemo[]
      if (plans.length === 0) return null
      return { gestes: plans.flatMap((p) => p.gestes), pas: plans.flatMap((p) => p.pas) }
    }
    if (mode === "EVALUATION") return null
    return planDemonstration(step.action, depart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demonstration, index, mode])

  /**
   * Résout une cible de démonstration en rectangle, dans le repère du calque.
   * Les cellules passent par les métriques d'Univer (la grille est un canvas,
   * aucun élément DOM par cellule) ; le châssis passe par le DOM.
   */
  const resoudreCible = useCallback((cible: CibleDemo): Rect | null => {
    /**
     * UNE CIBLE QUI NE SE RÉSOUT PAS NE DOIT JAMAIS FAIRE TOMBER LE CALQUE.
     *
     * `getCellRect` traverse la façade d'Univer, qui peut refuser une
     * construction sous charge — « [redi]: Detecting cyclic dependency … FRange2 »
     * mesuré sur `m01-e02`, à la sixième cellule d'une saisie de huit.
     * L'exception remontait dans le rendu de `DemonstrationGeste`, la frontière
     * d'erreur démontait le calque, et la démonstration s'arrêtait à 5/8 :
     * ni fin, ni bouton « Revoir », ni moyen d'en sortir. Au pire, une cible
     * non résolue vaut « pas de repère à dessiner » — jamais un écran mort.
     */
    let r: Rect | null = null
    try {
      r = resoudreCibleBrut(cible)
    } catch {
      r = null
    }
    // Trace d'audit : une cible qui s'est résolue AU MOINS UNE FOIS pendant qu'on
    // la montrait a bien eu son repère. La mesurer après coup se retourne contre
    // nous — un bouton de menu disparaît justement parce que le geste a réussi —
    // d'où cette trace posée au moment du rendu.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const w = window as any
      if (!w.__SIM_DEMO_VUS) w.__SIM_DEMO_VUS = {}
      const cle = cleCible(cible)
      if (r) w.__SIM_DEMO_VUS[cle] = true
      else if (w.__SIM_DEMO_VUS[cle] === undefined) w.__SIM_DEMO_VUS[cle] = false
      /**
       * « Résolue » ne veut pas dire « visible ».
       *
       * Une colonne masquée rend un rectangle de largeur ZÉRO — parfaitement
       * résolu, parfaitement invisible. C'est le cas de `acc-format-masquer` :
       * le premier passage masque la colonne, et au rejeu le repère qui la
       * désigne se réduit à un trait. La trace booléenne répondait « vue ».
       * On garde donc aussi la BOÎTE, la dernière dessinée, pour que l'audit
       * puisse exiger une surface non nulle et dans le champ.
       */
      if (!w.__SIM_DEMO_BOITES) w.__SIM_DEMO_BOITES = {}
      if (r) w.__SIM_DEMO_BOITES[cle] = r
    }
    return r
  }, [])

  const resoudreCibleBrut = useCallback((cible: CibleDemo): Rect | null => {
    const grid = gridRef.current
    // Le calque couvre TOUT l'atelier : c'est donc dans ce repère qu'il faut
    // rendre les rectangles. Les cellules, elles, viennent de la grille : on
    // ajoute le décalage de la grille dans l'atelier. Sans cela, un repère de
    // cellule s'affichait quelques dizaines de pixels trop haut.
    const hote = zoneAtelierRef.current
    if (!hote) return null
    const h = hote.getBoundingClientRect()
    const zg = zoneGrilleRef.current?.getBoundingClientRect()
    const dx = zg ? zg.left - h.left : 0
    const dy = zg ? zg.top - h.top : 0
    const depuisGrille = (r: { left: number; top: number; width: number; height: number }) => ({
      left: r.left + dx,
      top: r.top + dy,
      width: r.width,
      height: r.height,
    })
    if (cible.k === "cellule" || cible.k === "plage") {
      if (!grid) return null
      const bornes = cible.ref.split(":")
      let a = grid.getCellRect(bornes[0])
      let b = grid.getCellRect(bornes[bornes.length - 1])
      if (!a || !b) return null
      /**
       * La cible tombe-t-elle sous le bord de la feuille ? Alors on y va.
       *
       * La grille ne défile jamais d'elle-même. Une démonstration qui désigne
       * A41 — « la deuxième page commence ici » — dessinait donc son repère
       * hors du champ : l'apprenant regardait un écran où rien ne se passe
       * pendant que le compteur avançait (audit du 30/07/2026, module 13).
       *
       * Après le défilement les rectangles ont bougé : il faut les REDEMANDER.
       * Les réutiliser tels quels replacerait le repère à l'ancienne position,
       * c'est-à-dire de nouveau à côté.
       */
      // Hauteur RÉELLE de la zone de grille, pas déduite de celle de l'atelier :
      // le bandeau de consigne occupe le bas, la soustraction se tromperait.
      const basDeFeuille = zg?.height ?? h.height - dy
      /* ET LE BORD DROIT. Le défilement horizontal existe aussi : après un
         format monétaire qui élargit une colonne, `A10` sortait par la gauche
         et le repère se dessinait sur une surface nulle (m27-l01, étape 8). Le
         contrôle ne portait que sur le haut et le bas. */
      const droiteDeFeuille = zg?.width ?? h.width
      const horsCadre =
        a.top + a.height > basDeFeuille ||
        a.top < 0 ||
        a.left + a.width > droiteDeFeuille ||
        a.left < 0 ||
        a.width <= 0 ||
        a.height <= 0
      if (horsCadre) {
        if (grid.scrollToCell(bornes[0])) {
          const a2 = grid.getCellRect(bornes[0])
          const b2 = grid.getCellRect(bornes[bornes.length - 1])
          if (a2 && b2) {
            a = a2
            b = b2
          }
        }
      }
      const left = Math.min(a.left, b.left)
      const top = Math.min(a.top, b.top)
      return depuisGrille({
        left,
        top,
        width: Math.max(a.left + a.width, b.left + b.width) - left,
        height: Math.max(a.top + a.height, b.top + b.height) - top,
      })
    }
    /* Un EN-TÊTE se résout depuis une cellule de sa ligne ou de sa colonne : il
       faut donc l'amener dans le champ comme n'importe quelle cellule. Sans ce
       défilement, « la ligne 27 » du module 13 rendait un rectangle sous le bord
       de l'écran — résolu, jamais vu. */
    const amener = (ref: string) => {
      let r = grid?.getCellRect(ref) ?? null
      const bas = zg?.height ?? h.height - dy
      if (r && (r.top + r.height > bas || r.top < 0) && grid?.scrollToCell(ref)) {
        r = grid.getCellRect(ref) ?? r
      }
      return r
    }
    if (cible.k === "enteteColonne") {
      const r = amener(`${cible.col}1`)
      // L'en-tête n'est pas une cellule : il est juste au-dessus de la ligne 1.
      return r ? depuisGrille({ left: r.left, top: Math.max(0, r.top - 20), width: r.width, height: 20 }) : null
    }
    if (cible.k === "enteteLigne") {
      let r = amener(`A${cible.ligne}`)
      /**
       * UNE LIGNE MASQUÉE PAR UN FILTRE N'A PLUS DE HAUTEUR.
       *
       * `m19-l02` désigne justement les lignes ABSENTES pour faire lire la
       * numérotation discontinue — « 1, 2, 4, 6 : un filtre est actif ». Le
       * repère se réduisait alors à un trait d'épaisseur nulle, et la leçon
       * annonçait « c'est pointé à l'écran » sans rien pointer. On se rabat sur
       * l'en-tête de la première ligne VISIBLE en dessous : c'est exactement là
       * que le saut de numérotation se voit.
       */
      if (r && r.height <= 0) {
        for (let l = cible.ligne + 1; l <= cible.ligne + 40; l++) {
          const suivant = amener(`A${l}`)
          if (suivant && suivant.height > 0) {
            r = suivant
            break
          }
        }
      }
      return r && r.height > 0
        ? depuisGrille({ left: Math.max(0, r.left - 46), top: r.top, width: 46, height: r.height })
        : null
    }
    if (cible.k === "clavier") {
      // Un raccourci n'a pas de lieu : on réserve un cadre au centre de l'écran,
      // où le composant posera les touches sans curseur de souris.
      return { left: h.width / 2 - 90, top: h.height / 2 - 34, width: 180, height: 68 }
    }
    const el = document.querySelector(cible.sel)
    if (!el) return null
    let r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return null
    /**
     * Même règle que pour les cellules : un bouton hors du cadre est « trouvé »
     * sans être visible. Les panneaux de mise en page sont plus hauts qu'un
     * portable — `mep-entete-pied` tombait à y=1015 sur 900 px.
     *
     * ⚠️ LE RUBAN DÉFILE HORIZONTALEMENT, et cet axe manquait. Sur un écran de
     * 1440 px le ruban en mesure 1544 : « Somme automatique » se trouve à
     * x=1451, donc entièrement à droite du cadre, avec `scrollLeft` à zéro. La
     * cible se résolvait parfaitement — l'élément existe, son rectangle est
     * valide — mais le halo, la bulle et le curseur étaient dessinés HORS
     * CHAMP. Le compteur allait au bout, « Revoir » apparaissait, et
     * l'apprenant qui venait de réclamer « Montrez-moi » ne voyait rien. C'est
     * le même piège que la grille qui ne défile jamais d'elle-même, dans
     * l'autre axe.
     *
     * Sans conteneur défilable, `scrollIntoView` ne fait rien : on remesure
     * dans tous les cas plutôt que de supposer que ça a marché.
     */
    if (r.bottom > h.bottom || r.top < h.top || r.right > h.right || r.left < h.left) {
      el.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "instant" as ScrollBehavior,
      })
      r = el.getBoundingClientRect()
    }
    return { left: r.left - h.left, top: r.top - h.top, width: r.width, height: r.height }
  }, [])

  /**
   * Crochets d'audit, retirés des bundles de production par le remplacement de
   * `NODE_ENV` — même dispositif que `window.__SIM_GRID`.
   *
   * POURQUOI ILS SONT NÉCESSAIRES
   * Une démonstration dont la cible ne se résout pas se joue À BLANC : le calque
   * ne dessine rien, mais la minuterie tourne, le compteur avance et « Revoir »
   * apparaît à la fin. Vue de l'extérieur, elle est indistinguable d'une
   * démonstration réussie — c'est ce qui a permis à 60 gestes invisibles de
   * traverser tous les contrôles. Et `resoudre()` n'est appelé que sur le geste
   * AFFICHÉ : sans sonde, il faudrait attendre chaque geste pour savoir s'il
   * atteint sa cible.
   *
   *   · `__SIM_FORCE_DEMO` déclenche la démonstration dès l'entrée dans l'étape,
   *     sans attendre 3 erreurs, 6 tâtonnements ou 45 secondes — les trois seuls
   *     déclencheurs de l'apprenant, intenables sur 1 358 étapes.
   *   · `__SIM_DEMO_PROBE()` résout d'un coup TOUTES les cibles du plan courant
   *     et rend la liste de celles qui ne mènent à rien.
   */
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    // Identifiant de l'étape courante, lisible sans rien calculer. La sonde
    // complète résout toutes les cibles — donc interroge le squelette d'Univer —
    // et s'en servir pour se recaler sur l'étape coûtait plus cher que l'audit
    // lui-même.
    ;(window as any).__SIM_ETAPE = stepRef.current?.id ?? null
    // Compteurs de l'aide progressive. Sans eux, « pourquoi l'encart apparaît
    // alors que je n'ai rien fait ? » ne se diagnostique pas : la mise en place
    // d'une étape émet elle-même un `stateChange`, qui comptait un tâtonnement
    // que personne n'avait fait.
    ;(window as any).__SIM_COMPTEURS = { essais, tatonnements, tropLong }
    /**
     * LE PLAN RÉELLEMENT JOUÉ, tel que le calque le reçoit.
     *
     * `__SIM_DEMO_PROBE` recalcule le plan au moment où on l'interroge : après
     * la séquence, l'onglet de ruban est déjà ouvert, donc le geste qui l'ouvre
     * a disparu et la sonde annonce quatre gestes là où cinq ont été joués.
     * Pour auditer un REJEU il faut la liste exacte des cibles que la
     * démonstration DOIT dessiner, figée au démarrage : c'est celle-ci.
     */
    ;(window as any).__SIM_DEMO_PLAN = demo
      ? {
          cibles: demo.gestes.flatMap((g) => [
            cleCible(g.cible),
            ...(g.glisserVers ? [cleCible(g.glisserVers)] : []),
          ]),
          gestes: demo.gestes.length,
          presse: demo.gestes.flatMap((g) => (g.presser ? [g.presser.id] : [])),
          ecrit: demo.gestes.flatMap((g) => (g.ecrire ? [`${g.ecrire.ref}=${g.ecrire.valeur}`] : [])),
          onglets: demo.gestes.flatMap((g) => (g.onglet ? [g.onglet] : [])),
        }
      : null
    /**
     * INSTANTANÉ SÉMANTIQUE de tout ce qu'une démonstration peut muter.
     *
     * POURQUOI IL FAUT LE PRENDRE DEPUIS L'INTÉRIEUR
     * Un audit du rejeu doit répondre à deux questions qu'aucune capture d'écran
     * ne tranche : « l'état d'entrée est-il restauré avant le second passage ? »
     * et « le second passage retombe-t-il sur le même écran que le premier ? ».
     * Reconstruire cet état depuis le DOM est impossible — la grille est un
     * canvas, le graphique, le tableau croisé, les macros et le poste de travail
     * vivent dans des états React. On les lit donc ici, à la source.
     *
     * Le cliché est PUREMENT DESCRIPTIF : il ne modifie rien, ne déclenche
     * aucune observation, et ne sert qu'aux harnais d'audit. Comme
     * `__SIM_DEMO_PROBE`, il disparaît des bundles de production avec le
     * remplacement de `process.env.NODE_ENV`.
     */
    ;(window as any).__SIM_ETAT_AUDIT = () => {
      const grid = gridRef.current
      let refsSonde: string[] = []
    const cellules: Record<string, string> = {}
      const formats: Record<string, string> = {}
      /** Mise en forme VISUELLE observable, condensée en une signature lisible. */
      const mises: Record<string, string> = {}
      /** Valeur CALCULÉE de chaque cellule, formules résolues. */
      const valeurs: Record<string, string> = {}
      /** Texte AFFICHÉ, format appliqué : ce que l'apprenant lit réellement. */
      const affichages: Record<string, string> = {}
      const colonnes: Record<string, number> = {}
      if (grid) {
        let active: string | undefined
        try {
          active = grid.getSheets().find((f) => f.active)?.name
        } catch {
          /* grille pas prête */
        }
        // Le rectangle englobant de tout ce que le scénario déclare : la même
        // frontière que la remise d'aplomb, donc ni trop étroite (on raterait
        // une cellule écrite par la démonstration) ni sans fin.
        const { zone } = zoneClasseur(steps, scenario.workbook, active)
        /**
         * TROIS SOURCES, PAS UNE.
         *
         * `zoneClasseur` ne connaît que ce que le scénario DÉCLARE en clair. Il
         * manquait donc deux choses au cliché d'audit : les cellules qu'un
         * tableau croisé ÉCRIT (« Somme de Montant », les totaux — le moteur les
         * produit, personne ne les déclare) et les cellules que l'étape courante
         * attend (`action.pivot.cells`, `action.macro.effet`). Sans elles, le
         * contrôle d'efficacité lisait `undefined` et concluait « effet non
         * atteint » sur 25 étapes du module 20 parfaitement correctes : un défaut
         * de la sonde, présenté comme un défaut du produit.
         */
        const aLire = refsDeLaZone(zone)
        refsSonde = aLire
        const ajouter = (r: string) => {
          const R = r.toUpperCase()
          if (/^[A-Z]{1,3}\d{1,5}$/.test(R) && !aLire.includes(R)) aLire.push(R)
        }
        if (posePivotRef.current?.range) for (const r of cellsOf(posePivotRef.current.range)) ajouter(r)
        /* TOUTE référence nommée par l'étape — même moisson que le cliché :
           `goalSeek.inputRef` n'entrait dans aucune énumération par famille, et
           B3 n'était donc ni relevée, ni comparée, ni rendue. */
        const moissonSonde = (v: unknown, profondeur = 0): void => {
          if (profondeur > 6) return
          if (typeof v === "string") {
            if (/^[A-Z]{1,3}\d{1,5}(:[A-Z]{1,3}\d{1,5})?$/i.test(v)) {
              for (const r of cellsOf(v.toUpperCase())) ajouter(r)
            }
            return
          }
          if (Array.isArray(v)) {
            for (const e of v) moissonSonde(e, profondeur + 1)
            return
          }
          if (v && typeof v === "object") {
            for (const [cle, val] of Object.entries(v as Record<string, unknown>)) {
              moissonSonde(cle, profondeur + 1)
              moissonSonde(val, profondeur + 1)
            }
          }
        }
        moissonSonde(stepRef.current?.action)
        moissonSonde(stepRef.current?.setup)
        for (const ref of aLire) {
          try {
            const f = grid.getFormula(ref) ?? ""
            const v = grid.getValue(ref)
            const t = f ? `=${f.replace(/^=/, "")}` : v == null || v === "" ? "" : String(v)
            if (t !== "") cellules[ref] = t
            /* Le TEXTE AFFICHÉ, à part lui aussi. Une date tapée « 07/04/2026 »
               est stockée en numéro de série avec un format : ni le contenu
               brut ni la valeur ne ressemblent à ce que le scénario accepte,
               alors que l'apprenant lit bien « 07/04/2026 » à l'écran. */
            const aff = grid.getDisplayValue(ref)
            if (aff) affichages[ref] = aff
            /* La VALEUR CALCULÉE, à part. Une cellule qui porte une formule est
               relevée comme formule — c'est ce qu'il faut pour la restaurer — mais
               un scénario qui déclare « D21 doit valoir 510 » parle du RÉSULTAT.
               Comparer « =SOMME(D14:D20) » à 510 déclarait faux un total juste. */
            if (v !== null && v !== undefined && v !== "") valeurs[ref] = String(v)
            const nf = grid.getNumberFormat(ref) ?? ""
            if (nf) formats[ref] = nf
            // Univer n'expose NI le gras NI l'italique NI le souligné NI les
            // bordures : ces quatre attributs restent hors de portée de toute
            // mesure, c'est une limite du moteur, pas de l'audit.
            /**
             * LE STYLE BRUT, moins le format de nombre.
             *
             * `getFormat` ne rend que cinq attributs : ni la couleur de police,
             * ni le gras, ni les bordures. `acc-couleur-police` changeait donc
             * l'écran sans qu'aucun relevé ne le voie, et le contrôle concluait
             * « ce bouton ne produit rien ». Le style tel qu'Univer le stocke
             * les porte tous. Le format de nombre en est retiré : il a son
             * propre relevé, et l'y laisser ferait revenir le bruit de la
             * francisation dans cette famille.
             */
            const brut = grid.getStyleBrut(ref) as Record<string, unknown> | null
            if (brut && typeof brut === "object") {
              const { n: _n, ...reste } = brut as Record<string, unknown>
              void _n
              const sig = JSON.stringify(reste)
              if (sig !== "{}") mises[ref] = sig
            }
          } catch {
            /* référence hors bornes */
          }
        }
        // Largeurs de colonnes de la zone : une colonne masquée vaut zéro, et
        // c'est justement ce que `acc-format-masquer` produit.
        if (zone) {
          for (let c = zone.c1; c <= zone.c2; c++) {
            try {
              const l = grid.getColumnWidth(c - 1)
              if (l != null) colonnes[String(c)] = l
            } catch {
              /* squelette pas prêt */
            }
          }
        }
      }
      const lire = <T,>(f: () => T, secours: T): T => {
        try {
          return f()
        } catch {
          return secours
        }
      }
      return {
        etape: stepRef.current?.id ?? null,
        index,
        /* ── ce que la démonstration peut muter, famille par famille ── */
        cellules,
        valeurs,
        affichages,
        formats,
        mises,
        colonnes,
        noms: grid ? lire(() => grid.getDefinedNames().map((n) => `${n.name}=${n.ref}`).sort(), []) : [],
        feuilles: grid ? lire(() => grid.getSheets().map((f) => `${f.name}${f.active ? "*" : ""}`), []) : [],
        selection: grid ? lire(() => grid.getSelection(), "") : "",
        volets: grid ? lire(() => grid.getFrozen(), { rows: 0, cols: 0 }) : null,
        fusions: grid ? lire(() => grid.getFusions(), []) : null,
        notes: grid ? lire(() => grid.getNotes(), {}) : null,
        filtreesHors: grid ? lire(() => grid.getFilteredOutRows().length, -1) : -1,
        /* Un filtre POSÉ ne masque encore aucune ligne : sans ce témoin, «
           cliquez Filtrer » n'avait aucune trace mesurable. */
        filtrePose: grid ? lire(() => grid.aUnFiltre(), false) : false,
        reglesMfc: grid ? lire(() => grid.countConditionalRules(), -1) : -1,
        onglet: ongletRef.current,
        poste: posteActif ? posteRef.current : null,
        boite: boiteRef.current,
        menuFormat,
        pressePapiers: presseP,
        plageSomme: plageSommeRef.current,
        graphique: graphiqueRef.current
          ? {
              type: graphiqueRef.current.type,
              source: graphiqueRef.current.source ?? null,
              categories: graphiqueRef.current.categories ?? null,
              titre: graphiqueRef.current.title ?? null,
              elements: graphiqueRef.current.elements ?? null,
              style: graphiqueRef.current.style ?? null,
              legende: graphiqueRef.current.legendPosition ?? null,
              selection: graphiqueRef.current.selectedElement ?? null,
              series: graphiqueRef.current.series?.length ?? null,
              seriesNoms: graphiqueRef.current.series?.map((s) => s.name) ?? [],
              seriesCachees: graphiqueRef.current.series?.filter((s) => s.hidden).map((s) => s.name) ?? [],
              seriesTendance: graphiqueRef.current.series
                ?.filter((s) => s.trendline)
                .map((s) => `${s.name}:${s.trendline}`) ?? [],
              /* Couleur et forme de série : `ins-graph-couleur-serie` et
                 `ins-graph-forme-serie` ne changent rien d'autre, et sans ce
                 relevé le contrôle concluait « ce bouton ne produit rien ». */
              seriesStyle: graphiqueRef.current.series
                ?.map((s) => `${s.name}:${s.color ?? ""}:${s.shape ?? ""}`) ?? [],
            }
          : null,
        tcd: tcdRef.current
          ? {
              source: tcdRef.current.source,
              cible: tcdRef.current.target,
              lignes: tcdRef.current.rows.map((f) => f.name),
              colonnes: tcdRef.current.cols.map((f) => f.name),
              valeurs: tcdRef.current.values.map((f) => `${f.name}/${f.agg ?? "somme"}`),
              filtres: tcdRef.current.filters.map((f) => f.name),
              valeursFiltre: tcdRef.current.filterValues ?? null,
              style: tcdRef.current.styleId ?? null,
              perime: !!tcdRef.current.stale,
            }
          : null,
        reglages: reglagesRef.current,
        /* L'éditeur d'en-tête/pied : ouvert ou non, et sur quelle case. */
        panneauMep:
          typeof document !== "undefined"
            ? (() => {
                const el = document.querySelector("[data-mep-zone]")
                return el
                  ? `${el.getAttribute("data-mep-zone") ?? ""}/${el.getAttribute("data-mep-case") ?? ""}`
                  : null
              })()
            : null,
        macros: macrosRef.current.map((m) => `${m.name}:${m.statements.length}`),
        macroCourante: macroCouranteRef.current,
        enregistrement: enregistrementRef.current
          ? `${enregistrementRef.current.macro.name}:${enregistrementRef.current.actif}`
          : null,
        /* ── ce qui prouve qu'aucune auto-validation n'a eu lieu ── */
        verdict,
        essais,
        tatonnements,
      }
    }
    /* Le cliché lui-même, pour le diagnostic au banc. Hors production comme
       tous les crochets d'audit : `NODE_ENV` les retire du bundle. */
    ;(window as any).__SIM_CLICHE = () => clicheDemoRef.current
    /**
     * RELEVÉ VOLATIL — LÉGER, POUR L'ÉCHANTILLONNAGE PENDANT LA SÉQUENCE.
     *
     * `__SIM_ETAT_AUDIT()` interroge des centaines de cellules ; l'appeler
     * toutes les 40 ms pendant qu'une démonstration écrit sature la façade
     * d'Univer, jusqu'à « [redi]: Detecting cyclic dependency » — le classeur
     * devenait alors définitivement inutilisable (mesuré sur `m01-e02`). Ce
     * relevé-ci ne lit QUE des états React : il ne touche pas la grille.
     */
    ;(window as any).__SIM_ETAT_VOLATIL = () => ({
      boite: boiteRef.current,
      menuFormat: menuFormatRef.current,
      pressePapiers: pressePRef.current,
      plageSomme: plageSommeRef.current,
      enregistrement: enregistrementRef.current
        ? `${enregistrementRef.current.macro.name}:${enregistrementRef.current.actif}`
        : null,
      graphique: graphiqueRef.current
        ? `${graphiqueRef.current.type}|${(graphiqueRef.current.series ?? [])
            .map((s) => `${s.name}:${s.color ?? ""}:${s.shape ?? ""}`)
            .join(",")}`
        : null,
      tcd: tcdRef.current ? tcdRef.current.target : null,
      onglet: ongletRef.current,
      poste: JSON.stringify(posteRef.current ?? null),
    })
    ;(window as any).__SIM_DEMO_PROBE = () => {
      const s = stepRef.current
      if (!s) return { erreur: "aucune étape" }
      const plan =
        s.montrer?.length ?
          (() => {
            const ps = s.montrer.map((a) => planDemonstration(a, { onglet, setup: s.setup })).filter(Boolean) as PlanDemo[]
            return ps.length ? { gestes: ps.flatMap((p) => p.gestes), pas: ps.flatMap((p) => p.pas) } : null
          })()
        : mode === "EVALUATION" ? null
        : planDemonstration(s.action, { onglet, setup: s.setup })
      if (!plan) return { id: s.id, type: s.action.type, plan: null }
      return {
        id: s.id,
        type: s.action.type,
        onglet,
        gestes: plan.gestes.map((g) => {
          const cibles = [g.cible, ...(g.glisserVers ? [g.glisserVers] : [])]
          return {
            bulle: g.bulle,
            ecrire: g.ecrire ?? null,
            cibles: cibles.map((c) => ({
              genre: c.k,
              valeur:
                c.k === "cellule" || c.k === "plage" ? c.ref
                : c.k === "enteteColonne" ? c.col
                : c.k === "enteteLigne" ? String(c.ligne)
                : c.k === "dom" ? c.sel
                : "clavier",
              // `resolu` = maintenant ; `vu` = s'est résolu au moins une fois
              // pendant que le geste était à l'écran. C'est `vu` qui dit si
              // l'apprenant a eu un repère : un bouton de menu disparaît
              // justement parce que le geste a abouti.
              resolu: !!resoudreCibleBrut(c),
              vu: (window as any).__SIM_DEMO_VUS?.[cleCible(c)] ?? null,
            })),
          }
        }),
      }
    }
  }

  /**
   * Remet les cellules dans l'état d'avant la démonstration d'un écran de
   * lecture. Sans cela, « Voir le geste » laissait la valeur montrée dans la
   * feuille et l'étape suivante démarrait sur un classeur faussé.
   */
  const rendreClasseur = useCallback(() => {
    // Une démonstration qui presse le bouton Format ou la flèche ▾ ouvre
    // vraiment son menu ou sa boîte — c'est tout l'intérêt. Il faut donc les
    // refermer en sortant, sinon l'apprenant récupère la main devant une
    // fenêtre posée sur la feuille qu'il doit lire.
    setMenuFormat(false)
    setBoite(null)
    const grid = gridRef.current
    const avant = avantDemoRef.current
    const refs = Object.keys(avant)
    if (!grid || refs.length === 0) return
    verrouillerDemo(800)
    const cells: Record<string, unknown> = {}
    for (const ref of refs) {
      const v = avant[ref]
      cells[ref] = v === "" ? {} : v.trim().startsWith("=") ? { f: v } : { v }
    }
    grid.applyCells(cells as Parameters<typeof grid.applyCells>[0])
    avantDemoRef.current = {}
  }, [verrouillerDemo])

  /**
   * Crée un nom de plage pendant la démonstration, sans déclencher la
   * validation. Le verrou est le même que pour l'écriture : sans lui,
   * l'observation ferait valider l'étape et sauter à la suivante en pleine
   * explication.
   */
  const definirDemo = useCallback((nom: string, ref: string) => {
    const grid = gridRef.current
    // Même raison que pour la pression d'un contrôle : un nom de plage créé sur
    // un écran de lecture ne serait pas défait.
    if (!grid || stepRef.current?.action.type === "READ") return
    verrouillerDemo(900)
    grid.defineName(nom, ref)
  }, [verrouillerDemo])

  /** Écrit une valeur pendant la démonstration, sans déclencher la validation. */
  const ecrireDemo = useCallback((ref: string, valeur: string) => {
    const grid = gridRef.current
    if (!grid) return
    // Sur un écran de lecture, on note la valeur d'avant pour la remettre à la
    // fin : la démonstration illustre, elle ne modifie pas le classeur.
    if (stepRef.current?.action.type === "READ" && !(ref in avantDemoRef.current)) {
      const v = lireCellule(ref)
      avantDemoRef.current[ref] = v == null || v === "" ? "" : String(v)
    }
    // `stateChange` est temporisé de 350 ms côté grille : l'échéance couvre le
    // recalcul du moteur (60-120 ms) puis cette temporisation.
    verrouillerDemo(800)
    /* Une écriture refusée par le moteur ne doit pas non plus démonter le
       calque : la démonstration continue, et l'audit verra que l'état n'a pas
       été atteint — un verdict, pas un écran mort. */
    try {
      grid.applyCells({ [ref]: valeur === "" ? {} : valeur.trim().startsWith("=") ? { f: valeur } : { v: valeur } })
    } catch {
      /* le geste suivant reprend la main */
    }
  }, [lireCellule, verrouillerDemo])

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  if (!step && !finished) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-[13px] text-warm-600">
        Cette simulation ne contient aucune étape.
      </div>
    )
  }

  const gradable = steps.filter((s) => s.action.type !== "READ").length
  const evaluationNotee = mode === "EVALUATION"
  /* LA NOTE AFFICHÉE EST CELLE DU SERVEUR.
   *
   * L'atelier la calculait lui-même depuis ses propres compteurs. Ce n'est plus
   * la note : celle qui est enregistrée vient des verdicts serveur, et les deux
   * peuvent différer — le juge distant a pu compter une faute que l'affichage
   * local avait laissée passer. Montrer l'estimation locale reviendrait à
   * afficher un chiffre que « Mes résultats » contredirait. On attend donc le
   * bilan, et on le dit. */
  const notePassage = evaluationNotee ? bilan?.score ?? null : null
  /** Nature de l'étape et critère de réussite, tous deux déduits de l'action. */
  const nature = step ? natureEtape(step.action, mode) : "action"
  const attendu = step ? resumerAttendu(step.action) : null
  /** Chapitre suivant du parcours, proposé sur le jalon de fin. */
  const chapitreSuivant = (() => {
    if (!sommaire || sommaire.length === 0) return null
    const i = sommaire.findIndex((e) => e.id === chapterId)
    return i >= 0 && i < sommaire.length - 1 ? sommaire[i + 1] : null
  })()
  /**
   * Fil d'Ariane sans répétition. Les titres d'évaluation portent déjà le nom du
   * module (« S'évaluer · Prise en main ») : les concaténer donnait
   * « Prise en main · S'évaluer · Prise en main » en haut de chaque évaluation.
   */
  const filModule = scenario.moduleTitle ?? ""
  // Le module a-t-il une affiche ? On teste le NUMÉRO, pas l'élément JSX :
  // `<AfficheModule/>` est toujours truthy même quand il rend null, et le repli
  // n'aurait jamais eu lieu.
  const affiche = numeroModule(scenario.moduleTitle) !== null
  const filChapitre = (() => {
    const t = scenario.title
    if (!filModule) return t
    const suffixe = ` · ${filModule}`
    if (t.endsWith(suffixe)) return t.slice(0, -suffixe.length)
    if (t === filModule) return t
    return t
  })()

  /*
   * LE CHÂSSIS. Il porte la carte, le cockpit, les trois panneaux glissants et
   * le guide. La fenêtre Excel et la bande de consigne sont ses enfants
   * DIRECTS : c'est la colonne flex de la carte qui garantit qu'aucun
   * défilement n'apparaît, et un conteneur intermédiaire la romprait.
   */
  return (
      <AtelierShell
        chapterId={chapterId}
        mode={mode}
        evaluationNotee={evaluationNotee}
        filModule={filModule}
        filChapitre={filChapitre}
        index={index}
        total={total}
        relais={relais}
        sommaire={sommaire}
        onNaviguer={onNaviguer}
        note={note}
        onNote={onNote}
        notesHref={notesHref}
        afficherRessources={afficherRessources}
        documentsChapitre={documentsChapitre}
        documentsFormation={documentsFormation}
        documentsHref={documentsHref}
        introVue={introVue}
        cleGuide={cleGuide}
        preview={preview}
        onQuitter={onQuitter}
        pleinCadre={pleinCadre}
        finished={finished}
        /*
         * La bande de consigne appartient au CHÂSSIS depuis le chantier
         * multi-app : Word, PowerPoint et Outlook s'en étaient chacun écrit une
         * version provisoire, et trois copies auraient fini par diverger sur le
         * badge de nature, le balisage `==…==` et le placement de l'aide.
         *
         * Ce que le player fournit ici est déjà CALCULÉ : du texte, des booléens
         * et des gestes. Le châssis ne reçoit ni action, ni scénario — il ne
         * peut donc rien déduire d'Excel en particulier.
         *
         * `null` quand le chapitre est terminé : l'écran de bilan remplace alors
         * la zone de travail, et il n'y a plus de consigne à porter.
         */
        consigne={
          finished || !step
            ? null
            : {
                texte: step.consigne,
                nature,
                lecture: step.action.type === "READ",
                aDemonstration: !!step.montrer?.length,
                attendu,
                // Jamais servie en évaluation : le bloc qui l'affiche y est déjà
                // inatteignable, et la calculer serait la faire transiter pour rien.
                reponse: evaluationNotee ? null : reponseAttendue(step.action),

                aide: step.aide?.text ?? null,
                aideVisible: hintShown,
                // Un repère est ancré sur la feuille : la ligne ferait doublon.
                aideAncree: !!halo,
                indiceDisponible: mode === "EXERCISE" && !hintShown && !!step.aide,

                evaluationNotee,
                relais,
                relaisActif,
                verdict,
                aplomb,
                panneJuge: pannneJuge,
                passageEnCours,

                aideProposee: essais >= 3 || tatonnements >= 6 || tropLong,
                demonstration,
                demoFinie,
                demoRejouable: !!demo && demoFinie,

                index,
                total,
                reculPossible,

                onMontrer: evaluationNotee ? passerLaQuestion : demarrerDemonstration,
                onDebloquer: goNext,
                onRejouerDemo: rejouerDemonstration,
                onIndice: revealHint,
                onSuivant: () => handleAction({ kind: "next" }),
                onReculer: () => setReculDemande(true),
              }
        }
      >
      {!introVue && step && (
        <div
          className="absolute inset-0 z-40 flex flex-col justify-center overflow-hidden px-6 py-8 sm:px-10"
          style={{ background: "linear-gradient(180deg,#faf9f5 0%,#f2efe8 100%)" }}
        >
          {/* Affiche du module (direction B, 29/07/2026). Une par module, la même
              pour ses leçons, ses exercices et son évaluation. Le repli
              ci-dessous — le mini-classeur — ne sert plus qu'aux modules dont
              l'affiche n'est pas encore dessinée : il était affiché sur les 246
              chapitres et ne parlait que du module 6. */}
          {affiche ? (
            <div
              aria-hidden
              // Centrage par le FLUX, pas par `translateY(-50%)` : l'animation
              // d'entrée pose son propre `transform` et écrasait la translation
              // de centrage — l'affiche se retrouvait décalée d'une demi-hauteur
              // vers le bas, ce que l'ancien visuel subissait déjà.
              className="pointer-events-none absolute hidden select-none lg:flex lg:items-center"
              style={{ right: "6%", top: 0, bottom: 0, width: 372, animation: "sim-intro-monte .9s .35s ease both" }}
            >
              <AfficheModule moduleTitle={scenario.moduleTitle} />
            </div>
          ) : (
          <div
            aria-hidden
            className="pointer-events-none absolute hidden select-none lg:block"
            style={{
              right: "6%",
              top: "50%",
              width: 372,
              transform: "translateY(-50%) perspective(1200px) rotateY(-15deg) rotateX(5deg)",
              animation: "sim-intro-monte .9s .35s ease both",
            }}
          >
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 30px 60px -24px rgba(16,32,27,.35)", background: "#fff", border: "1px solid #DDD8CE" }}>
              <div style={{ background: "#107C41", color: "#fff", padding: "7px 11px", fontSize: 11, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ background: "rgba(255,255,255,.22)", borderRadius: 3, padding: "1px 5px", fontWeight: 700, fontSize: 9 }}>X</span>
                Classeur
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
                <tbody>
                  <tr>
                    {["", "A", "B", "C"].map((c) => (
                      <td key={c} style={{ background: "#F5F3EF", color: "#8D8880", border: "1px solid #E4E0D8", textAlign: "center", height: 19, width: c === "" ? 26 : undefined }}>
                        {c}
                      </td>
                    ))}
                  </tr>
                  {[
                    ["1", "Trimestre", "Ventes", ""],
                    ["2", "Janvier", "1 250", ""],
                    ["3", "Février", "1 480", ""],
                    ["4", "Mars", "1 620", ""],
                    ["5", "Total", "4 350", ""],
                  ].map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td
                          key={j}
                          style={{
                            border: "1px solid #EDEAE3",
                            height: 20,
                            padding: "0 5px",
                            color: j === 0 ? "#8D8880" : "#22302B",
                            background: j === 0 ? "#F5F3EF" : i === 4 ? "#EAF6EF" : "#fff",
                            textAlign: j === 2 ? "right" : "left",
                            fontWeight: i === 4 ? 700 : 400,
                            outline: i === 4 && j === 2 ? "2px solid #107C41" : undefined,
                            outlineOffset: -2,
                          }}
                        >
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ background: "#10201B", color: "#8FE3B3", fontSize: 11.5, padding: "7px 11px", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>
                =SOMME(B2:B4)
              </div>
            </div>
          </div>
          )}
          <div className="relative" style={{ maxWidth: 620 }}>
            <div
              className="uppercase"
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "2.2px",
                color: "#187a4e",
                marginBottom: 14,
                animation: "sim-intro-monte .6s .1s ease both",
              }}
            >
              {mode === "LESSON" ? "Leçon" : mode === "EXERCISE" ? "Exercice" : "Évaluation"}
              {filModule && filModule !== filChapitre ? ` — ${filModule}` : ""}
            </div>
            <h2
              style={{
                fontSize: "clamp(24px, 4.5vw, 40px)",
                lineHeight: 1.06,
                fontWeight: 850,
                letterSpacing: "-0.8px",
                color: "#171a18",
                marginBottom: 14,
                animation: "sim-intro-monte .7s .25s ease both",
              }}
            >
              {scenario.intro?.title || scenario.title}
            </h2>
            {scenario.intro?.body && (
              <p
                style={{
                  fontSize: "clamp(13px, 1.8vw, 15.5px)",
                  color: "#3c423e",
                  lineHeight: 1.6,
                  marginBottom: 16,
                  animation: "sim-intro-monte .6s .45s ease both",
                }}
              >
                {scenario.intro.body}
              </p>
            )}
            <div
              style={{
                fontSize: 12.5,
                color: "#9aa19c",
                marginBottom: 22,
                animation: "sim-intro-monte .6s .55s ease both",
              }}
            >
              {total} étape{total > 1 ? "s" : ""} · ≈ {estimatedSimulationMinutes(mode, total)} min
              {mode === "EVALUATION"
                ? " · sans aide · meilleure note conservée · à faire d'une traite"
                : ""}
            </div>
            {(evaluationRepart || dejaPassee) && (
              <p
                data-control={dejaPassee ? "intro-score-precedent" : "intro-reprise-evaluation"}
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "#8A5A12",
                  background: "#FBF1DF",
                  borderRadius: 10,
                  padding: "10px 14px",
                  maxWidth: 520,
                  marginBottom: 22,
                  animation: "sim-intro-monte .6s .6s ease both",
                }}
              >
                {dejaPassee ? (
                  <>
                    Vous avez déjà passé cette évaluation
                    {passagesPrecedents > 1 ? ` ${passagesPrecedents} fois` : ""} : votre meilleur
                    score enregistré est de{" "}
                    <strong>{Math.round((scorePrecedent as number) * 100)} %</strong>. Il reste
                    consultable dans « Mes résultats ». La repasser produit une nouvelle note et
                    recommence depuis la première question, sur un classeur remis à neuf. Seule la
                    meilleure note sera conservée.
                  </>
                ) : (
                  <>
                    Vous aviez commencé cette évaluation : elle reprend depuis le début, sur un
                    classeur remis à neuf, pour que chaque geste compte au premier essai.
                  </>
                )}
              </p>
            )}
            <button
              type="button"
              data-control="intro-commencer"
              disabled={ouvertureEnCours}
              aria-busy={ouvertureEnCours}
              onClick={() => {
                // On n'entre dans l'atelier QUE si le passage est ouvert : jouer
                // une évaluation sans passage ne noterait rien, et l'apprenant ne
                // s'en apercevrait qu'à la fin.
                void commencer().then((ok) => {
                  if (!ok) return
                  ouvrirLAtelier()
                  // L'atelier apparaît : la grille se remesure, la sélection du
                  // scénario est reposée. Rien de tout cela n'est un geste de
                  // l'apprenant — il vient de cliquer « Commencer ». Sans ce
                  // réarmement, la sélection de plage de `m11-l02` arrivait une
                  // seconde après l'entrée et comptait un tâtonnement.
                  ouvrirFenetreMiseEnPlace()
                  // Sans cela le focus clavier reste sur le bouton : la première
                  // frappe de la leçon n'atteint jamais la grille (même piège que
                  // le bouton « Suivant »).
                  window.setTimeout(() => gridRef.current?.focus(), 60)
                })
              }}
              className="inline-flex items-center gap-2.5 rounded-xl"
              style={{
                background: "#171a18",
                color: "#fff",
                fontSize: 14.5,
                fontWeight: 700,
                padding: "12px 22px",
                opacity: ouvertureEnCours ? 0.6 : 1,
                animation: "sim-intro-monte .7s .7s ease both",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "8px solid #fff",
                  borderTop: "5.5px solid transparent",
                  borderBottom: "5.5px solid transparent",
                }}
              />
              {ouvertureEnCours
                ? "Ouverture du passage…"
                : mode === "LESSON"
                  ? "Commencer la leçon"
                  : mode === "EXERCISE"
                    ? "Commencer l'exercice"
                    : "Commencer l'évaluation"}
            </button>
            {/* L'ouverture a échoué : on le DIT, et le bouton reste. Entrer dans
                l'atelier sans passage laisserait jouer une évaluation dont rien
                ne serait noté. */}
            {evaluationNotee && pannneJuge === "passage" && !ouvertureEnCours && (
              <p
                data-panne-ouverture=""
                className="mt-3 text-[12.5px]"
                style={{ color: "#C08A5A", maxWidth: 460 }}
              >
                Le passage n'a pas pu être ouvert. Rien ne serait enregistré :
                réessayez, ou rechargez la page.
              </p>
            )}
          </div>
        </div>
      )}
      {finished ? (
        evaluationNotee ? (
          /* ÉVALUATION : la carte de fin porte le bilan par compétence quand il
             existe, et retombe sur la note seule sinon. Elle vit dans un
             composant à part parce qu'elle DÉFILE — l'atelier est un portail
             `fixed` en `overflow: hidden`, et trois priorités dépassent la
             hauteur d'un téléphone. */
          <BilanFin
            filChapitre={filChapitre}
            notePassage={notePassage as number}
            gestesEvalues={gradable}
            scorePrecedent={scorePrecedent}
            bilan={bilan}
            noteEnregistree={noteEnregistree}
            onReessayer={() => void cloturer()}
            reessaiEnCours={clotureEnCours}
            enAttente={bilanEnAttente}
            chapitreSuivant={chapitreSuivant}
            onNaviguer={onNaviguer}
            onRepasser={onRejouer}
          />
        ) : (
        /* Jalon de fin de chapitre (traitement « C », choix Samuel du 29/07).
           Réservé à la FIN : une carte à chaque étape imposerait douze secondes
           d'attente par leçon, et la phrase d'acquis n'existe pas pour les
           1 872 étapes — ici le titre du chapitre suffit à la porter. */
        <div
          className={
            pleinCadre
              ? "flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-10 text-center"
              : "px-5 py-10 text-center"
          }
        >
          <div
            className="w-full rounded-2xl border border-border bg-white px-6 py-7 shadow-sm"
            style={{ maxWidth: 430, animation: "sim-jalon-carte .42s cubic-bezier(.2,.9,.2,1) both" }}
          >
            <div
              aria-hidden
              className="mx-auto mb-3 flex items-center justify-center rounded-full"
              style={{
                width: 46,
                height: 46,
                background: "#E7F3EB",
                color: "#107C41",
                fontSize: 22,
                animation: "sim-jalon-rond .5s .1s cubic-bezier(.2,.9,.2,1) both",
              }}
            >
              ✓
            </div>
            <p className="font-display text-[17px] font-bold text-ink">Chapitre terminé</p>
            <p className="mt-1 text-[13.5px] text-warm-600">{filChapitre}</p>
            <p className="mt-3 text-[13px] text-warm-500">
              {total} étape{total > 1 ? "s" : ""} franchie{total > 1 ? "s" : ""}
            </p>
            {chapitreSuivant && onNaviguer && (
              <button
                type="button"
                data-control="sim-chapitre-suivant"
                onClick={() => onNaviguer(chapitreSuivant.id)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold text-white"
                style={{ background: "#10201B" }}
              >
                Chapitre suivant
                <span aria-hidden>›</span>
              </button>
            )}
            {chapitreSuivant && (
              <p className="mt-2.5 truncate text-[12px] text-warm-400">{chapitreSuivant.titre}</p>
            )}
          </div>
        </div>
        )
      ) : (
        <>
          {/* Fenêtre Excel simulée. En plein cadre elle prend tout l'espace laissé
              par le cockpit et la bande de consigne — ni plus, ni moins. */}
          {/* Le poste de travail enveloppe la fenêtre Excel quand le scénario le
              déclare ; sinon on garde le conteneur d'origine et rien ne change
              pour les 243 chapitres existants. */}
          {/* Conteneur de l'atelier : il porte le calque de démonstration, qui
              doit rester visible même quand le classeur est masqué. */}
          <div
            ref={zoneAtelierRef}
            className={pleinCadre ? "relative flex min-h-0 flex-1 flex-col" : "relative"}
          >
          <Enveloppe
            poste={posteActif ? poste : null}
            pleinCadre={!!pleinCadre}
            onControl={handleControl}
            onEnregistrer={(nom) => gestePoste(CONTROLES_POSTE.enregistrerValider, nom)}
            onOuvrir={(nom) => gestePoste(CONTROLES_POSTE.ouvrirValider, nom)}
            decor={decorPoste}
            highlight={highlightedControl}
          >
            {/* Jalon d'étape franchie : il couvre la feuille, jamais la bande de
                consigne — la consigne suivante reste lisible pendant ce temps. */}
            {jalon && (
              <div
                aria-hidden
                className="absolute inset-0 z-40 flex items-center justify-center px-6"
                style={{
                  background: "rgba(8,17,14,.45)",
                  animation: "sim-jalon-fond 1.15s ease both",
                  // Purement décoratif : sans cela il avale le clic d'un apprenant
                  // qui enchaîne sans attendre la fin de l'animation — c'est le
                  // joueur automatique qui l'a attrapé, sur l'étape suivant la
                  // première réussite de quatre scénarios sur six.
                  pointerEvents: "none",
                }}
              >
                <div
                  className="rounded-2xl bg-white px-6 py-4 text-center shadow-2xl"
                  style={{ animation: "sim-jalon-carte .34s cubic-bezier(.2,.9,.2,1) both", maxWidth: 340 }}
                >
                  <div
                    aria-hidden
                    className="mx-auto mb-2 flex items-center justify-center rounded-full"
                    style={{
                      width: 34,
                      height: 34,
                      background: "#E7F3EB",
                      color: "#107C41",
                      fontSize: 17,
                      animation: "sim-jalon-rond .44s .06s cubic-bezier(.2,.9,.2,1) both",
                    }}
                  >
                    ✓
                  </div>
                  <p className="font-display text-[14.5px] font-bold text-ink">Étape {jalon.n} franchie</p>
                  {jalon.texte && <p className="mt-0.5 text-[12px] text-warm-500">{jalon.texte}</p>}
                </div>
              </div>
            )}
            <SimulationChrome
              tabs={scenario.ribbon}
              state={
                step?.setup?.ribbon
                  ? { ...step.setup.ribbon, activeTab: onglet }
                  : { activeTab: onglet }
              }
              fileName={scenario.workbook.fileName}
              avecPoste={posteActif}
              barreTitrePoste={decorPoste}
              selection={selection}
              formulaText={formulaText}
              highlight={highlightedControl}
              onControl={handleControl}
              onTabChange={setOnglet}
              menuFormat={menuFormat}
              nameBoxDraft={nameBoxDraft}
              onNameBoxChange={setNameBoxDraft}
              onNameBoxCommit={commitNameBox}
              onNameBoxCancel={() => setNameBoxDraft(null)}
            />
            {/* Les couches se posent DANS ce conteneur, dont le coin haut-gauche
                est celui de la grille : elles peuvent donc placer un cadre ou une
                feuille de papier avec les coordonnées que la grille leur donne.
                Le relais d'observation est en phase de capture pour arriver avant
                que la couche n'ait rendu à nouveau. */}
            <div
              ref={zoneGrilleRef}
              // Repère de mesure : `getCellRect` rend des coordonnées RELATIVES
              // à ce conteneur. Sans lui, un contrôle automatique qui veut
              // cliquer une cellule doit deviner l'origine — et tape à côté.
              data-zone-grille=""
              className={
                pleinCadre
                  ? "relative min-h-0 flex-1 overflow-hidden border border-t-0 border-neutral-300"
                  : "relative overflow-hidden border border-t-0 border-neutral-300"
              }
              style={pleinCadre ? undefined : { height: hauteurGrille }}
              onClickCapture={besoins.miseEnPage || besoins.tcd || besoins.graphique ? relaisControleCouche : undefined}
            >
              <ExcelGrid onReady={handleReady} onAction={handleAction} heightPx={hauteurGrille} />
              {besoins.miseEnPage && (
                <PageLayoutLayer
                  pageSetup={reglages}
                  pages={pagination}
                  metrique={metrique}
                  onChange={changerReglages}
                  fichier={scenario.workbook.fileName}
                  feuille={sheets.find((s) => s.active)?.name}
                />
              )}
              {besoins.tcd && tcd && (
                <PivotLayer
                  pivot={tcd}
                  tableau={tableauTcd}
                  champs={champsTcd}
                  onDropField={deposerChamp}
                  onSetAgg={changerAgregat}
                  onRefresh={actualiserTcd}
                  onRemoveField={retirerChamp}
                  onSetStyle={changerStyleTcd}
                  valeursFiltre={valeursFiltre}
                  onSetFilterValues={changerValeursFiltre}
                  zoneParDefaut={zoneParDefautTcd}
                  /* Fond OPAQUE. À 95 %, les 5 % restants laissaient passer la
                     feuille source ET les cellules du tableau croisé écrites
                     dedans : trois lectures du même contenu se superposaient,
                     en-têtes de colonnes compris. Un tableau croisé, dans Excel,
                     ne se lit jamais par-dessus ses données. */
                  className="absolute inset-0 z-10 bg-white"
                />
              )}
              {besoins.graphique && (
                <ChartLayer
                  chart={graphique}
                  valeurs={valeursGraphique}
                  onSelectElement={choisirElementGraphique}
                  onMove={deplacerGraphique}
                />
              )}
              {/* Liseré animé du presse-papiers et de la somme automatique.
                  « Un liseré animé entoure la sélection » : cinq consignes le
                  promettaient sans que rien n'apparaisse. */}
              {[
                presseP ? { ref: presseP, cle: "presse" } : null,
                plageSomme ? { ref: plageSomme, cle: "somme" } : null,
              ]
                .filter(Boolean)
                .map((m) => {
                  const r = gridRef.current?.getCellRect(m!.ref.split(":")[0])
                  const f = gridRef.current?.getCellRect(m!.ref.split(":").slice(-1)[0])
                  if (!r || !f) return null
                  return (
                    <div
                      key={m!.cle}
                      aria-hidden
                      data-lisere={m!.cle}
                      className="pointer-events-none absolute"
                      style={{
                        left: Math.min(r.left, f.left) - 1,
                        top: Math.min(r.top, f.top) - 1,
                        width: Math.abs(f.left + f.width - r.left) + 2,
                        height: Math.abs(f.top + f.height - r.top) + 2,
                        // Le liseré « qui marche » d'Excel : quatre bandes en
                        // pointillés dont on anime la position. Une bordure
                        // `dashed` ne s'anime pas — elle serait immobile, donc
                        // muette sur ce que le geste vient de faire.
                        background: [
                          "repeating-linear-gradient(90deg,#107C41 0 7px,transparent 7px 14px) top/14px 2px repeat-x",
                          "repeating-linear-gradient(90deg,#107C41 0 7px,transparent 7px 14px) bottom/14px 2px repeat-x",
                          "repeating-linear-gradient(0deg,#107C41 0 7px,transparent 7px 14px) left/2px 14px repeat-y",
                          "repeating-linear-gradient(0deg,#107C41 0 7px,transparent 7px 14px) right/2px 14px repeat-y",
                        ].join(","),
                        animation: "sim-lisere 1s linear infinite",
                      }}
                    />
                  )
                })}
              {/* Les deux boîtes de dialogue du ruban. Elles se posent DANS la
                  zone de grille, comme les couches : c'est là que l'apprenant
                  regarde après avoir cliqué le bouton qui les ouvre. */}
              {boite === "fonction" && (
                <BoiteFonction
                  onFermer={fermerBoite}
                  onInserer={(nom) => {
                    fermerBoite()
                    const g = gridRef.current
                    const cible = g?.getSelection()?.split(":")[0]
                    if (g && cible) g.applyCells({ [cible]: { f: `=${nom}()` } })
                  }}
                />
              )}
              {boite === "format-cellule" && (
                <BoiteFormatCellule
                  cellule={selection}
                  onFermer={fermerBoite}
                  onAppliquer={(r) => {
                    fermerBoite()
                    const g = gridRef.current
                    if (!g) return
                    // Ce que la boîte valide s'applique vraiment : sans cela on
                    // aurait remplacé un bouton muet par une fenêtre muette.
                    const motifs: Record<string, string> = {
                      standard: "General",
                      nombre: "#,##0.00",
                      monetaire: '#,##0.00" €"',
                      pourcentage: "0.00%",
                      date: "dd/mm/yyyy",
                    }
                    g.setNumberFormatOnSelection(motifs[r.nombre] ?? "General")
                    g.setAlign(r.alignement === "centre" ? "center" : r.alignement === "droite" ? "right" : "left")
                    if (r.gras) g.toggleBold(true)
                    if (r.italique) g.setItalic(true)
                    if (r.souligne) g.setUnderline(true)
                    if (r.bordure) g.setBorderAll(true)
                  }}
                />
              )}
              {halo && !demo && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute rounded-[3px] ring-2 ring-amber-400 ring-offset-0 animate-pulse"
                  style={{
                    left: halo.left,
                    top: halo.top,
                    width: halo.width,
                    height: halo.height,
                    zIndex: 20,
                    boxShadow: "0 0 0 5px rgba(251,191,36,0.28)",
                  }}
                />
              )}
              {/* Bulle d'aide ANCRÉE à la cellule cible : le guide vit sur la
                  feuille, pas seulement en petit texte sous l'écran. */}
              {halo && hintShown && step?.aide?.text && !demo && (
                <div
                  className="pointer-events-none absolute rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-amber-900 shadow-md ring-1 ring-amber-300"
                  style={{
                    maxWidth: 260,
                    zIndex: 30,
                    // Placement qui évite la zone de travail : à DROITE de la cible
                    // quand la feuille en laisse la place, au-dessus sinon, et en
                    // dernier recours dessous mais décalée — posée à plat sous la
                    // cellule, elle recouvrait A2:C3, soit l'essentiel de l'espace
                    // utile sur téléphone.
                    ...(largeurGrille - (halo.left + halo.width) > 240
                      ? { left: halo.left + halo.width + 12, top: Math.max(4, halo.top - 2) }
                      : halo.top > 120
                        ? { left: Math.max(4, halo.left), top: halo.top - 10, transform: "translateY(-100%)" }
                        : { left: Math.max(4, halo.left + halo.width + 10), top: halo.top + halo.height + 10 }),
                  }}
                >
                  <span aria-hidden>👉 </span>
                  {step.aide.text}
                </div>
              )}
              {fx?.rect && (
                <div
                  key={fx.k}
                  aria-hidden
                  className="pointer-events-none absolute rounded-[3px]"
                  style={{
                    left: fx.rect.left,
                    top: fx.rect.top,
                    width: fx.rect.width,
                    height: fx.rect.height,
                    zIndex: 20,
                    backgroundColor: fx.kind === "ok" ? "rgba(16,185,129,0.14)" : "rgba(244,63,94,0.14)",
                    boxShadow:
                      fx.kind === "ok"
                        ? "0 0 0 3px #10b981, 0 0 0 7px rgba(16,185,129,0.25)"
                        : "0 0 0 3px #f43f5e, 0 0 0 7px rgba(244,63,94,0.25)",
                    animation:
                      fx.kind === "ok"
                        ? "sim-flash 1.4s ease forwards"
                        : "sim-shake .5s ease, sim-flash 2.8s ease forwards",
                  }}
                />
              )}
              {fx && (
                <div
                  key={`t${fx.k}`}
                  className="pointer-events-none absolute flex justify-center"
                  style={{ left: 0, right: 0, top: 8, zIndex: 30 }}
                >
                  <div
                    className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold shadow-lg"
                    style={{
                      animation: `sim-pop ${fx.kind === "ok" ? "1.4s" : "2.8s"} ease forwards`,
                      maxWidth: "85%",
                      color: "#fff",
                      backgroundColor: fx.kind === "ok" ? "#059669" : "#e11d48",
                    }}
                  >
                    {fx.kind === "ok" ? "✓ C'est exact" : fx.message || "Ce n'est pas encore ça — réessayez."}
                  </div>
                </div>
              )}
              <style>{`
@keyframes sim-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
@keyframes sim-pop{0%{opacity:0;transform:translateY(-6px) scale(.96)}10%{opacity:1;transform:translateY(0) scale(1)}80%{opacity:1}100%{opacity:0}}
@keyframes sim-flash{0%{opacity:0}10%{opacity:1}65%{opacity:1}100%{opacity:0}}
@keyframes sim-intro-monte{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes sim-intro-cell{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes sim-consigne-in{from{opacity:0;transform:translateY(11px)}to{opacity:1;transform:translateY(0)}}
@keyframes sim-etape-pop{0%{transform:scale(.82);opacity:.3}55%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes sim-coche{0%{opacity:0;transform:translateY(-50%) scale(.5)}18%{opacity:1;transform:translateY(-50%) scale(1.12)}32%{transform:translateY(-50%) scale(1)}74%{opacity:1}100%{opacity:0;transform:translateY(-50%) scale(.92)}}
@keyframes sim-seg-pop{0%{transform:scaleX(.2)}55%{transform:scaleX(1.35)}100%{transform:scaleX(1)}}
@keyframes sim-jalon-carte{0%{opacity:0;transform:scale(.92) translateY(10px)}100%{opacity:1;transform:scale(1) translateY(0)}}
@keyframes sim-jalon-rond{0%{transform:scale(.5);opacity:0}45%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes sim-jalon-fond{0%{opacity:0}14%{opacity:1}76%{opacity:1}100%{opacity:0}}
/* Le liseré du presse-papiers : dans Excel il « marche » autour de la plage. */
@keyframes sim-lisere{to{background-position:14px 0,-14px 100%,0 -14px,100% 14px}}
/* Un apprenant qui a demandé moins d'animations garde le repère, sans mouvement. */
@media (prefers-reduced-motion: reduce){
  [style*="sim-consigne-in"],[style*="sim-etape-pop"],[style*="sim-coche"],[style*="sim-jalon-carte"],[style*="sim-jalon-rond"]{animation-duration:.01ms !important;animation-iteration-count:1 !important}
}
`}</style>
            </div>
            {/* Bas de la fenêtre Excel — SOUS la grille, comme dans le logiciel. */}
            <div className="flex-shrink-0">
              <SimulationFooter
                sheets={sheets}
                onSheet={handleSheet}
                onControl={handleControl}
                highlight={highlightedControl}
                stats={stats}
                aggregates={step?.setup?.statusBar?.aggregates ?? scenario.statusBar?.aggregates}
              />
            </div>
            {besoins.macros && (
              <div
                className={pleinCadre ? "flex-shrink-0 overflow-y-auto pt-2" : "pt-2"}
                style={pleinCadre ? { maxHeight: "38%" } : undefined}
                onClickCapture={relaisControleCouche}
              >
                <MacroPanel
                  macros={macros}
                  courante={macroCourante}
                  enregistrement={enregistrement?.actif ? "started" : "stopped"}
                  code={codeMacro}
                  onDemarrer={demarrerMacro}
                  onArreter={arreterMacro}
                  onChangerCode={(c) => {
                    codeMacroRef.current = c
                    setCodeMacro(c)
                  }}
                  onExecuter={executerMacroNommee}
                  onRaccourci={changerRaccourci}
                  onSupprimer={supprimerMacro}
                  commande={commandeMacro ?? undefined}
                />
              </div>
            )}
          </Enveloppe>
            {demo && (
              <DemonstrationGeste
                key={`demo${index}-${rejeu}`}
                onFini={() => {
                  /* On n'annonce la fin qu'une fois les recherches terminées :
                     sinon « Revoir » repart d'un classeur encore en train de
                     bouger, et les deux passages ne montrent pas la même chose
                     (m23-e01, m23-e03 — « Valeur cible »). */
                  const finir = () => {
                    setDemoFinie(true)
                    rendreClasseur()
                  }
                  const attendre = (reste: number) => {
                    if (!travauxDemoRef.current || reste <= 0) return finir()
                    window.setTimeout(() => attendre(reste - 1), 120)
                  }
                  attendre(50)
                }}
                plan={demo}
                resoudre={resoudreCible}
                onEcrire={ecrireDemo}
                // Changer d'onglet ne valide rien — c'est déjà le cas quand
                // l'apprenant explore le ruban lui-même.
                onOnglet={(t) => setOnglet(t as RibbonTab)}
                onDefinir={definirDemo}
                onSelectionner={selectionnerDemo}
                onPresser={presserDemo}
                lecture={step?.action.type === "READ"}
                largeur={zoneAtelierRef.current?.clientWidth ?? 640}
                /* Première ligne de la feuille dans le repère du calque : le
                   bord haut de la grille, plus les en-têtes de colonnes. La
                   bulle ne remonte jamais au-dessus de cette limite. */
                hautFeuille={
                  zoneGrilleRef.current && zoneAtelierRef.current
                    ? zoneGrilleRef.current.getBoundingClientRect().top -
                      zoneAtelierRef.current.getBoundingClientRect().top +
                      20
                    : 0
                }
              />
            )}
          </div>
        </>
      )}

      {/* Avertissement avant de reculer. Modale maison : le `confirm()` natif est
          proscrit dans le LMS, et il n'expliquerait pas ce qui va se passer. */}
      {reculDemande && (
        <div
          className="absolute inset-0 flex items-center justify-center px-6"
          style={{ background: "rgba(8,17,14,.62)", zIndex: 80 }}
          role="dialog"
          aria-modal="true"
          aria-label="Revenir à l'étape précédente"
        >
          <div className="w-full rounded-2xl bg-white p-5 shadow-2xl" style={{ maxWidth: 420 }}>
            <h4 className="font-display text-[16px] font-bold text-ink">Revenir à l'étape {index} ?</h4>
            <p className="mt-2 text-[13.5px] leading-relaxed text-warm-700">
              Vous allez revoir sa consigne. Ce que vous avez déjà saisi reste dans la feuille, mais le point
              de départ de cette étape est remis en place : il faudra refaire le geste pour avancer à nouveau.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setReculDemande(false)}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-warm-700 hover:bg-warm-50"
              >
                Annuler
              </button>
              <button
                type="button"
                data-control="sim-reculer-confirmer"
                onClick={reculer}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
                style={{ background: "#10201B" }}
              >
                Revenir à l'étape {index}
              </button>
            </div>
          </div>
        </div>
      )}

      </AtelierShell>
  )
}

/**
 * Enveloppe de la fenêtre Excel.
 *
 * Sans poste déclaré, c'est le conteneur d'origine — aucune différence pour les
 * chapitres existants. Avec un poste, le bureau prend la place et la fenêtre
 * Excel vient se poser dessus.
 */
function Enveloppe({
  poste,
  pleinCadre,
  onControl,
  onEnregistrer,
  onOuvrir,
  decor,
  highlight,
  children,
}: {
  poste: PosteState | null
  pleinCadre: boolean
  onControl: (id: string) => void
  onEnregistrer: (nom: string) => void
  onOuvrir: (nom: string) => void
  decor?: boolean
  highlight?: string | null
  children: React.ReactNode
}) {
  if (poste) {
    return (
      <DesktopLayer
        poste={poste}
        onControl={onControl}
        onEnregistrer={onEnregistrer}
        onOuvrir={onOuvrir}
        decor={decor}
        highlight={highlight}
        pleinCadre={pleinCadre}
      >
        {children}
      </DesktopLayer>
    )
  }
  return (
    <div
      className={
        pleinCadre
          ? "relative flex min-h-0 flex-1 flex-col px-2 pt-2 sm:px-3 sm:pt-3"
          : "relative px-3 pt-3"
      }
    >
      {children}
    </div>
  )
}
