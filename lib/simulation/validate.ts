/**
 * Validation d'une étape de simulation.
 *
 * Ce fichier est le juge unique : la correction immédiate côté navigateur (leçon,
 * exercice) et la correction côté serveur (évaluation notée) l'utilisent tous les
 * deux. Deux implémentations divergentes finiraient par donner deux verdicts
 * différents sur la même action, ce qui est indéfendable dans une formation.
 *
 * Principe de tolérance : on valide l'INTENTION, pas la frappe exacte.
 * Un élève qui écrit `=somme(b2:b6)` au lieu de `=SOMME(B2:B6)` a compris ; un
 * élève qui sélectionne `C3:B2` au lieu de `B2:C3` a désigné la même zone. Refuser
 * ces réponses apprendrait à l'élève à se méfier de l'outil au lieu d'apprendre
 * Excel. En revanche, le CANAL imposé est vérifié quand la consigne l'exige
 * (« sans utiliser le clavier ») : là, c'est le geste lui-même qui est enseigné.
 */

import type {
  ChartState,
  MacroState,
  PageSetupState,
  PivotField,
  PivotState,
  PosteState,
  SimulationAction,
  SimulationStep,
  TypeAction,
} from "./types"
import { matchesTypedAnswer, normalizeFormula } from "./types"
import { sameArea } from "./grid"
import { frToEngine } from "./formula-fr"
import { verifierPoste } from "./poste"

/** Origine réelle de l'action, pour les exercices qui imposent le moyen. */
export type ActionChannel = "mouse" | "keyboard" | "ribbon" | "contextMenu" | "formulaBar" | "unknown"

/** Ce que le simulateur a observé quand l'apprenant a agi. */
/** Valeurs d'erreur Excel : une cellule qui les affiche n'a pas calculé. */
const ERROR_VALUES = new Set([
  "#NAME?", "#NOM?", "#VALUE!", "#VALEUR!", "#REF!", "#DIV/0!",
  "#NUM!", "#NOMBRE!", "#N/A", "#NULL!", "#NUL!", "#SPILL!", "#CALC!",
])

/**
 * Une cellule affiche-t-elle une valeur d'erreur ? Exporté pour la remise
 * d'aplomb (`aplomb.ts`), qui a le même besoin : une cellule en erreur n'est
 * jamais un état légitime, quelle que soit la façon dont on y est arrivé.
 */
export function EST_VALEUR_ERREUR(v: unknown): boolean {
  return v !== null && v !== undefined && ERROR_VALUES.has(String(v))
}

export type ObservedAction =
  | { kind: "next" }
  /** `computed` = valeur réellement affichée par la cellule après calcul. */
  /**
   * `text` est ce que le moteur retient, `displayed` ce que l'apprenant VOIT.
   * Les deux diffèrent dès que le tableur transforme la saisie : une date tapée
   * « 07/04/2026 » est retenue comme un numéro de série, et comparer l'attendu au
   * seul `text` refusait l'apprenant qui avait tapé exactement ce qu'on demandait.
   */
  | {
      kind: "typed"
      target: string
      text: string
      displayed?: string
      channel: ActionChannel
      computed?: unknown
    }
  | { kind: "cellClick"; cell: string; modifier?: "Control" | "Shift"; channel: ActionChannel }
  | { kind: "control"; control: string; channel: ActionChannel }
  | { kind: "contextMenu"; target: string }
  | { kind: "doubleClick"; target: string }
  | { kind: "key"; key: string }
  | { kind: "fillHandle"; from: string; to: string }
  | { kind: "dragRange"; range: string }
  /** Clic sur un en-tête de colonne ou de ligne : sélectionne tout. */
  | { kind: "selectColumn"; column: string }
  | { kind: "selectRow"; row: number }
  /** Changement de feuille par clic sur un onglet. */
  | { kind: "selectSheet"; name: string }
  /** Référence saisie dans la zone Nom pour atteindre une cellule. */
  | { kind: "gotoRef"; ref: string }
  | { kind: "defineName"; name: string; ref: string }
  | { kind: "sort"; range: string; column: string; ascending: boolean }
  | {
      kind: "formatChange"
      readings: Record<
        string,
        {
          background: string
          fontSize: number | null
          hAlign: string
          vAlign: string
          wrap: boolean | null
          numberFormat: string
        }
      >
    }
  | { kind: "filter"; column: string; values: string[] }
  /**
   * Le classeur a changé. `readings` porte la lecture des cellules attendues par
   * l'étape — c'est le simulateur qui les lit, pour que ce fichier reste pur et
   * utilisable aussi côté serveur.
   */
  | { kind: "stateChange"; readings: Record<string, { formula: string; value: unknown }> }
  /** Le graphique courant après le geste de l'apprenant. */
  | { kind: "chartChange"; chart: ChartState | null }
  /** Élément sélectionné dans le graphique. */
  | { kind: "chartElement"; element: string }
  /**
   * Le tableau croisé après le geste, avec la lecture des cellules produites —
   * même principe que `stateChange` : la lecture vient du simulateur, ce fichier
   * reste calculable côté serveur.
   */
  | { kind: "pivotChange"; pivot: PivotState | null; readings?: Record<string, { value: unknown }> }
  /** Les réglages d'impression après le geste. */
  | { kind: "pageSetupChange"; pageSetup: PageSetupState }
  /** La macro après enregistrement ou modification, avec son code généré. */
  | {
      kind: "macroChange"
      macro: MacroState | null
      code: string
      /** Lecture des cellules après exécution, quand l'étape teste l'effet. */
      readings?: Record<string, { value: unknown }>
    }
  /** L'enregistreur a démarré ou s'est arrêté. */
  | { kind: "recorder"; state: "started" | "stopped" }
  /** L'état du poste de travail après le geste : Excel lancé, fermé, enregistré. */
  | { kind: "posteChange"; poste: PosteState }

export type Verdict =
  | { ok: true }
  /** `reason` est destiné au journal pédagogique, `message` à l'apprenant. */
  | { ok: false; reason: string; message: string }

const OK: Verdict = { ok: true }

/**
 * Classe un motif de format de nombre en famille. On ne compare jamais le motif
 * exact : « #,##0.00" €" » et « #,##0" €" » sont deux façons légitimes de
 * demander un affichage monétaire, et refuser la seconde serait absurde.
 */
export function familleDeFormat(motif: string): "monetaire" | "pourcentage" | "date" | "nombre" | "aucun" {
  const m = (motif ?? "").trim()
  if (!m) return "aucun"
  if (/[%]/.test(m)) return "pourcentage"
  if (/[€$£¥]|\bEUR\b/i.test(m)) return "monetaire"
  // Les motifs de date mêlent jours, mois et années ; « m » seul peut être des
  // minutes, on exige donc au moins deux natures de champ.
  const champs = [/d/i.test(m), /m/i.test(m), /y/i.test(m)].filter(Boolean).length
  if (champs >= 2) return "date"
  if (/[0#]/.test(m)) return "nombre"
  return "aucun"
}

const MESSAGE_FORMAT: Record<string, string> = {
  monetaire: "Il faut un format monétaire, avec le symbole €.",
  pourcentage: "Il faut un format pourcentage.",
  date: "Il faut un format de date.",
  nombre: "Il faut un format numérique.",
  aucun: "Cette cellule ne doit porter aucun format de nombre.",
}

/** Normalise une touche : "control+c", "Ctrl+C" et "CONTROL+C" sont identiques. */
function normalizeKey(key: string): string {
  return key
    .split("+")
    .map((part) => {
      const p = part.trim().toLowerCase()
      if (p === "ctrl" || p === "control") return "control"
      if (p === "maj" || p === "shift") return "shift"
      if (p === "entrée" || p === "entree" || p === "enter") return "enter"
      if (p === "suppr" || p === "delete" || p === "del") return "delete"
      if (p === "échap" || p === "echap" || p === "escape" || p === "esc") return "escape"
      if (p === "tab" || p === "tabulation") return "tab"
      return p
    })
    .sort((a, b) => {
      // Les modificateurs d'abord, pour que "control+c" et "c+control" coïncident.
      const rank = (x: string) => (x === "control" || x === "shift" || x === "alt" ? 0 : 1)
      return rank(a) - rank(b) || a.localeCompare(b)
    })
    .join("+")
}

/**
 * Valide une saisie. Le texte est comparé aux réponses acceptées telles quelles,
 * et — s'il s'agit d'une formule — également après traduction vers la convention
 * du moteur. Ainsi un élève qui tape `=SUM(B2:B6)` par habitude anglaise n'est pas
 * recalé si la réponse attendue est `=SOMME(B2:B6)`.
 */
function validateTyped(action: TypeAction, observed: string): boolean {
  if (matchesTypedAnswer(observed, action)) return true
  if (!action.formulaMode) return false
  const translated = frToEngine(observed)
  if (matchesTypedAnswer(translated, action)) return true
  // Et l'inverse : réponse attendue écrite en français, saisie déjà traduite.
  return action.accept.some((expected) => matchesTypedAnswer(observed, { ...action, accept: [frToEngine(expected)] }))
}

/**
 * Le canal utilisé est-il conforme ? `requiredChannel` n'est renseigné que quand
 * la consigne l'impose explicitement — sinon tout chemin est bon.
 */
function channelOk(required: ActionChannel | undefined, actual: ActionChannel): boolean {
  if (!required) return true
  if (actual === "unknown") return true // on ne pénalise pas une détection imparfaite
  return required === actual
}

/**
 * Confronte l'action observée à l'action attendue par l'étape.
 *
 * `requiredChannel` est passé à part plutôt que lu dans l'action : il concerne la
 * pédagogie de l'étape, pas la mécanique du geste.
 */
export function validateStep(
  step: SimulationStep,
  observed: ObservedAction,
  requiredChannel?: ActionChannel,
): Verdict {
  const expected: SimulationAction = step.action

  // Écran de lecture : seul « Suivant » est attendu. Le message ne dit pas que
  // c'est faux — il n'y a rien à faire, donc rien ne peut être faux. Dire
  // « ce n'est pas bon » quand l'apprenant tape par réflexe le laisse croire
  // qu'il a raté quelque chose (retour Samuel du 29/07/2026).
  if (expected.type === "READ") {
    return observed.kind === "next"
      ? OK
      : {
          ok: false,
          reason: "read_step_action",
          // « cette étape se lit » n'était plus exact depuis que ces écrans
          // portent une démonstration jouée : l'apprenant regarde, il ne lit pas.
          message: "Rien à faire ici : regardez la démonstration, puis continuez.",
        }
  }

  switch (expected.type) {
    case "TYPE": {
      if (observed.kind !== "typed") {
        return { ok: false, reason: "expected_typing", message: "Cette étape attend une saisie." }
      }
      if (expected.target !== "formula-bar" && !sameArea(expected.target, observed.target)) {
        return {
          ok: false,
          reason: "wrong_cell",
          message: `La saisie doit se faire dans la cellule ${expected.target}.`,
        }
      }
      // Filet de sécurité : le texte peut correspondre alors que la formule est en
      // erreur (fonction inconnue du moteur, référence invalide). Laisser passer
      // reviendrait à valider une étape en laissant un classeur cassé derrière.
      if (observed.computed !== undefined && ERROR_VALUES.has(String(observed.computed))) {
        return {
          ok: false,
          reason: "formula_error",
          message: `La cellule affiche ${String(observed.computed)} : la formule n'a pas pu être calculée.`,
        }
      }
      // On accepte la forme retenue par le moteur OU la forme affichée : une date
      // et une heure ne sont retenues que comme nombres, et l'apprenant ne peut pas
      // deviner un numéro de série. Refuser une réponse juste est la faute la plus
      // grave d'un simulateur pédagogique.
      const texteOk =
        validateTyped(expected, observed.text) ||
        (observed.displayed !== undefined && validateTyped(expected, observed.displayed))
      if (!texteOk) {
        return {
          ok: false,
          reason: "wrong_content",
          message: expected.formulaMode
            ? "Cette formule ne donne pas le résultat attendu."
            : "Ce n'est pas la valeur attendue.",
        }
      }
      if (!channelOk(requiredChannel, observed.channel)) {
        return {
          ok: false,
          reason: "wrong_channel",
          message: "Le résultat est bon, mais la consigne demandait un autre moyen.",
        }
      }
      return OK
    }

    case "CLICK_CELL": {
      if (observed.kind !== "cellClick") {
        return { ok: false, reason: "expected_cell_click", message: "Cliquez dans une cellule." }
      }
      if (observed.modifier) {
        return {
          ok: false,
          reason: "unexpected_modifier",
          message: "Cliquez sans maintenir de touche.",
        }
      }
      return sameArea(expected.cell, observed.cell)
        ? OK
        : { ok: false, reason: "wrong_cell", message: "Ce n'est pas la bonne cellule." }
    }

    case "CLICK_CELL_MODIFIER": {
      if (observed.kind !== "cellClick") {
        return { ok: false, reason: "expected_cell_click", message: "Cliquez dans une cellule." }
      }
      if (observed.modifier !== expected.modifier) {
        return {
          ok: false,
          reason: "missing_modifier",
          message: `Maintenez la touche ${expected.modifier === "Control" ? "Ctrl" : "Maj"} pendant le clic.`,
        }
      }
      return sameArea(expected.cell, observed.cell)
        ? OK
        : { ok: false, reason: "wrong_cell", message: "Ce n'est pas la bonne cellule." }
    }

    case "CLICK_CONTROL": {
      if (observed.kind !== "control") {
        return { ok: false, reason: "expected_control", message: "Utilisez le bon bouton." }
      }
      if (observed.control !== expected.control) {
        return { ok: false, reason: "wrong_control", message: "Ce n'est pas le bon bouton." }
      }
      return channelOk(requiredChannel, observed.channel)
        ? OK
        : {
            ok: false,
            reason: "wrong_channel",
            message: "Bon bouton, mais la consigne demandait un autre moyen.",
          }
    }

    case "CONTEXT_MENU": {
      return observed.kind === "contextMenu" && observed.target === expected.target
        ? OK
        : { ok: false, reason: "expected_context_menu", message: "Faites un clic droit sur le bon élément." }
    }

    case "DOUBLE_CLICK": {
      return observed.kind === "doubleClick" && observed.target === expected.target
        ? OK
        : { ok: false, reason: "expected_double_click", message: "Double-cliquez sur le bon élément." }
    }

    case "KEY": {
      if (observed.kind !== "key") {
        return { ok: false, reason: "expected_key", message: "Utilisez votre clavier." }
      }
      return normalizeKey(observed.key) === normalizeKey(expected.key)
        ? OK
        : { ok: false, reason: "wrong_key", message: "Ce n'est pas la bonne touche." }
    }

    case "FILL_HANDLE": {
      if (observed.kind !== "fillHandle") {
        return {
          ok: false,
          reason: "expected_fill_handle",
          message: "Utilisez la poignée de recopie, en bas à droite de la sélection.",
        }
      }
      if (!sameArea(expected.from, observed.from)) {
        return { ok: false, reason: "wrong_fill_origin", message: "La recopie doit partir d'ailleurs." }
      }
      return sameArea(expected.to, observed.to)
        ? OK
        : { ok: false, reason: "wrong_fill_target", message: "La recopie ne s'arrête pas au bon endroit." }
    }

    case "DRAG_RANGE": {
      if (observed.kind !== "dragRange") {
        return { ok: false, reason: "expected_drag_range", message: "Sélectionnez la plage en faisant glisser." }
      }
      return sameArea(expected.range, observed.range)
        ? OK
        : { ok: false, reason: "wrong_range", message: "Ce n'est pas la bonne plage." }
    }

    case "SELECT_COLUMN": {
      return observed.kind === "selectColumn" &&
        observed.column.toUpperCase() === expected.column.toUpperCase()
        ? OK
        : {
            ok: false,
            reason: "wrong_column",
            message: "Cliquez sur la lettre de la bonne colonne, dans son en-tête.",
          }
    }

    case "SELECT_ROW": {
      return observed.kind === "selectRow" && observed.row === expected.row
        ? OK
        : {
            ok: false,
            reason: "wrong_row",
            message: "Cliquez sur le numéro de la bonne ligne, dans son en-tête.",
          }
    }

    case "SELECT_SHEET": {
      return observed.kind === "selectSheet" &&
        observed.name.trim().toLocaleUpperCase("fr-FR") === expected.name.trim().toLocaleUpperCase("fr-FR")
        ? OK
        : { ok: false, reason: "wrong_sheet", message: "Ce n'est pas la bonne feuille." }
    }

    case "EXPECT_FORMAT": {
      if (observed.kind !== "formatChange") return { ok: false, reason: "no_format_reading", message: "" }
      // Univer renvoie l'alignement en nombre (1 gauche, 2 centre, 3 droite) ;
      // le scénario, lui, est écrit en mots lisibles.
      // « normal » est le nom que la façade Univer donne à l'alignement à DROITE :
      // sans lui, une cellule correctement alignée à droite était jugée fausse.
      const H: Record<string, string[]> = {
        left: ["1", "left"],
        center: ["2", "center"],
        right: ["3", "right", "normal"],
      }
      const V: Record<string, string[]> = { top: ["1", "top"], middle: ["2", "middle"], bottom: ["3", "bottom"] }
      for (const [ref, attendu] of Object.entries(expected.cells)) {
        const lu = observed.readings[ref]
        if (!lu) return { ok: false, reason: "cell_not_read", message: "" }
        if (attendu.background !== undefined) {
          const a = attendu.background.trim().toLowerCase()
          const b = lu.background.trim().toLowerCase()
          if (a !== b) {
            return { ok: false, reason: "wrong_background", message: `La couleur de remplissage de ${ref} n'est pas celle attendue.` }
          }
        }
        if (attendu.fontSize !== undefined && Number(lu.fontSize) !== attendu.fontSize) {
          return { ok: false, reason: "wrong_font_size", message: `La taille de police de ${ref} n'est pas celle attendue.` }
        }
        if (attendu.hAlign !== undefined && !H[attendu.hAlign].includes(String(lu.hAlign).toLowerCase())) {
          return { ok: false, reason: "wrong_h_align", message: `L'alignement horizontal de ${ref} n'est pas celui attendu.` }
        }
        if (attendu.vAlign !== undefined && !V[attendu.vAlign].includes(String(lu.vAlign).toLowerCase())) {
          return { ok: false, reason: "wrong_v_align", message: `L'alignement vertical de ${ref} n'est pas celui attendu.` }
        }
        if (attendu.wrap !== undefined && Boolean(lu.wrap) !== attendu.wrap) {
          return { ok: false, reason: "wrong_wrap", message: `Le renvoi à la ligne de ${ref} n'est pas celui attendu.` }
        }
        if (attendu.numberFormat !== undefined) {
          const famille = familleDeFormat(lu.numberFormat)
          if (famille !== attendu.numberFormat) {
            return {
              ok: false,
              reason: "wrong_number_format",
              message: MESSAGE_FORMAT[attendu.numberFormat] ?? `Le format de ${ref} n'est pas celui attendu.`,
            }
          }
        }
      }
      return OK
    }

    case "SORT_RANGE": {
      if (observed.kind !== "sort") {
        return { ok: false, reason: "not_a_sort", message: "Utilisez un bouton de tri du ruban Données." }
      }
      if (observed.column.toUpperCase() !== expected.column.toUpperCase()) {
        return { ok: false, reason: "wrong_sort_column", message: "Le tri ne porte pas sur la bonne colonne." }
      }
      if (observed.ascending !== expected.ascending) {
        return {
          ok: false,
          reason: "wrong_sort_order",
          message: expected.ascending ? "Il faut trier du plus petit au plus grand." : "Il faut trier du plus grand au plus petit.",
        }
      }
      return OK
    }

    case "FILTER_COLUMN": {
      if (observed.kind !== "filter") {
        return {
          ok: false,
          reason: "not_a_filter",
          message: "Cliquez sur le bouton de filtre de la colonne, puis choisissez les valeurs à garder.",
        }
      }
      if (observed.column.toUpperCase() !== expected.column.toUpperCase()) {
        return { ok: false, reason: "wrong_filter_column", message: "Ce n'est pas la bonne colonne." }
      }
      // L'ordre de cochage ne compte pas, seul l'ensemble retenu compte.
      const norm = (v: string[]) =>
        Array.from(new Set(v.map((x) => x.trim().toLocaleUpperCase("fr-FR")))).sort()
      const attendu = norm(expected.values)
      const obtenu = norm(observed.values)
      if (attendu.length !== obtenu.length || attendu.some((v, i) => v !== obtenu[i])) {
        return {
          ok: false,
          reason: "wrong_filter_values",
          message: "Les valeurs gardées ne sont pas les bonnes. Vérifiez vos cases cochées.",
        }
      }
      return OK
    }

    case "DEFINE_NAME": {
      if (observed.kind !== "defineName") {
        return {
          ok: false,
          reason: "not_a_definition",
          message: "Sélectionnez la plage, puis tapez son nom dans la zone Nom et validez.",
        }
      }
      // Excel ne distingue pas la casse des noms définis.
      if (observed.name.toUpperCase() !== expected.name.toUpperCase()) {
        return { ok: false, reason: "wrong_name", message: "Ce n'est pas le nom demandé." }
      }
      if (expected.ref && !sameArea(expected.ref, observed.ref)) {
        return {
          ok: false,
          reason: "wrong_named_range",
          message: "Le nom a été posé sur la mauvaise plage. Vérifiez votre sélection avant de le taper.",
        }
      }
      return OK
    }
    case "GOTO_REF": {
      return observed.kind === "gotoRef" && sameArea(expected.ref, observed.ref)
        ? OK
        : {
            ok: false,
            reason: "wrong_goto",
            message: "Saisissez la bonne référence dans la zone Nom, puis validez.",
          }
    }

    case "EXPECT_STATE": {
      if (observed.kind !== "stateChange") {
        // Un simple clic ne fait pas échouer l'étape : l'apprenant explore.
        return { ok: false, reason: "no_state_change", message: "" }
      }
      for (const [ref, want] of Object.entries(expected.cells)) {
        const got = observed.readings[ref]
        if (!got) {
          return { ok: false, reason: "cell_unreadable", message: `La cellule ${ref} n'a pas pu être lue.` }
        }
        // Formule attendue, éventuellement parmi plusieurs écritures valables.
        const formulaCandidates = want.anyOf ?? (want.f !== undefined ? [want.f] : null)
        if (formulaCandidates) {
          const typed = normalizeFormula(got.formula)
          const okFormula = formulaCandidates.some(
            (c) => normalizeFormula(c) === typed || normalizeFormula(frToEngine(c)) === typed,
          )
          if (!okFormula) {
            return {
              ok: false,
              reason: "wrong_state_formula",
              message: `La formule de ${ref} n'est pas celle attendue.`,
            }
          }
        }
        if (want.v !== undefined) {
          const a = String(want.v).replace(",", ".").trim()
          const b = String(got.value ?? "").replace(",", ".").trim()
          const na = Number(a)
          const nb = Number(b)
          const equal =
            Number.isFinite(na) && Number.isFinite(nb)
              ? Math.abs(na - nb) < 1e-9
              : a.toLocaleUpperCase("fr-FR") === b.toLocaleUpperCase("fr-FR")
          if (!equal) {
            return {
              ok: false,
              reason: "wrong_state_value",
              message: `${ref} n'affiche pas le résultat attendu.`,
            }
          }
        }
      }
      return OK
    }

    case "EXPECT_CHART": {
      if (observed.kind !== "chartChange") return { ok: false, reason: "no_chart_reading", message: "" }
      const g = observed.chart
      if (!g) return { ok: false, reason: "no_chart", message: "Aucun graphique n'a été créé." }
      const a = expected.chart
      if (a.type !== undefined && g.type !== a.type) {
        return { ok: false, reason: "wrong_chart_type", message: `Le graphique n'est pas du type attendu.` }
      }
      if (a.source !== undefined && normRange(g.source) !== normRange(a.source)) {
        return { ok: false, reason: "wrong_chart_source", message: "Le graphique ne porte pas sur la plage attendue." }
      }
      if (a.categories !== undefined && normRange(g.categories) !== normRange(a.categories)) {
        return { ok: false, reason: "wrong_chart_categories", message: "Les libellés de l'axe ne sont pas ceux attendus." }
      }
      if (a.title !== undefined && (g.title ?? "").trim() !== a.title.trim()) {
        return { ok: false, reason: "wrong_chart_title", message: "Le titre du graphique n'est pas celui attendu." }
      }
      // Une série masquée reste dans le modèle : c'est le propre de « masquer ».
      // Le décompte porte donc sur les séries VISIBLES, ce que l'apprenant voit.
      const visibles = g.series.filter((x) => !x.hidden)
      if (a.seriesCount !== undefined && visibles.length !== a.seriesCount) {
        return {
          ok: false,
          reason: "wrong_series_count",
          message: `Le graphique ne compte pas ${a.seriesCount} série(s) visible(s).`,
        }
      }
      if (a.series !== undefined) {
        for (let i = 0; i < a.series.length; i++) {
          const att = a.series[i]
          const lue = g.series[i]
          if (!lue) return { ok: false, reason: "missing_series", message: `La série ${i + 1} est absente.` }
          if (att.name !== undefined && lue.name.trim() !== att.name.trim()) {
            return { ok: false, reason: "wrong_series_name", message: `La série ${i + 1} n'est pas celle attendue.` }
          }
          if (att.values !== undefined && normRange(lue.values) !== normRange(att.values)) {
            return { ok: false, reason: "wrong_series_values", message: `La série ${i + 1} ne porte pas sur la plage attendue.` }
          }
          if (att.color !== undefined && !memeCouleur(lue.color, att.color)) {
            return { ok: false, reason: "wrong_series_color", message: `La couleur de la série ${i + 1} n'est pas celle attendue.` }
          }
          if (att.trendline !== undefined && lue.trendline !== att.trendline) {
            return { ok: false, reason: "wrong_trendline", message: `La courbe de tendance attendue n'est pas en place.` }
          }
          if (att.shape !== undefined && lue.shape !== att.shape) {
            return { ok: false, reason: "wrong_series_shape", message: `La forme de la série ${i + 1} n'est pas celle attendue.` }
          }
          if (att.hidden !== undefined && Boolean(lue.hidden) !== att.hidden) {
            return {
              ok: false,
              reason: "wrong_series_visibility",
              message: att.hidden ? `La série ${i + 1} devrait être masquée.` : `La série ${i + 1} devrait être visible.`,
            }
          }
        }
      }
      if (a.elements !== undefined) {
        const lus = g.elements ?? {}
        for (const [cle, veut] of Object.entries(a.elements)) {
          if (veut === undefined) continue
          if (Boolean((lus as Record<string, unknown>)[cle]) !== veut) {
            return {
              ok: false,
              reason: "wrong_chart_element",
              message: veut ? `L'élément « ${cle} » devrait être affiché.` : `L'élément « ${cle} » devrait être masqué.`,
            }
          }
        }
      }
      if (a.legendPosition !== undefined && g.legendPosition !== a.legendPosition) {
        return { ok: false, reason: "wrong_legend_position", message: "La légende n'est pas placée où il faut." }
      }
      if (a.style !== undefined && g.style !== a.style) {
        return { ok: false, reason: "wrong_chart_style", message: "Le style appliqué n'est pas celui attendu." }
      }
      return OK
    }

    case "SELECT_CHART_ELEMENT": {
      if (observed.kind !== "chartElement") return { ok: false, reason: "no_chart_element", message: "" }
      if (observed.element !== expected.element) {
        return { ok: false, reason: "wrong_chart_element_selected", message: "Ce n'est pas l'élément demandé." }
      }
      return OK
    }

    case "EXPECT_PIVOT": {
      if (observed.kind !== "pivotChange") return { ok: false, reason: "no_pivot_reading", message: "" }
      const t = observed.pivot
      if (!t) return { ok: false, reason: "no_pivot", message: "Aucun tableau croisé n'a été créé." }
      const a = expected.pivot
      if (a.source !== undefined && normRange(t.source) !== normRange(a.source)) {
        return { ok: false, reason: "wrong_pivot_source", message: "Le tableau croisé ne porte pas sur la plage attendue." }
      }
      if (a.target !== undefined && normRange(t.target) !== normRange(a.target)) {
        return { ok: false, reason: "wrong_pivot_target", message: "Le tableau croisé n'est pas posé au bon endroit." }
      }
      const zones: Array<[keyof typeof a, PivotField[], string]> = [
        ["rows", t.rows, "Lignes"],
        ["cols", t.cols, "Colonnes"],
        ["filters", t.filters, "Filtres"],
      ]
      for (const [cle, lus, libelle] of zones) {
        const att = a[cle] as string[] | undefined
        if (att === undefined) continue
        const noms = lus.map((f) => f.name)
        if (noms.length !== att.length || att.some((n, i) => noms[i] !== n)) {
          return { ok: false, reason: `wrong_pivot_${String(cle)}`, message: `La zone ${libelle} ne contient pas les champs attendus.` }
        }
      }
      if (a.values !== undefined) {
        if (t.values.length !== a.values.length) {
          return { ok: false, reason: "wrong_pivot_values", message: "La zone Valeurs ne contient pas les champs attendus." }
        }
        for (let i = 0; i < a.values.length; i++) {
          if (t.values[i].name !== a.values[i].name) {
            return { ok: false, reason: "wrong_pivot_value_field", message: "La zone Valeurs ne contient pas les champs attendus." }
          }
          const attAgg = a.values[i].agg
          if (attAgg !== undefined && (t.values[i].agg ?? "somme") !== attAgg) {
            return { ok: false, reason: "wrong_pivot_agg", message: `Le calcul appliqué à « ${a.values[i].name} » n'est pas celui attendu.` }
          }
        }
      }
      if (a.styleId !== undefined && t.styleId !== a.styleId) {
        return { ok: false, reason: "wrong_pivot_style", message: "Le style appliqué n'est pas celui attendu." }
      }
      if (a.stale !== undefined && Boolean(t.stale) !== a.stale) {
        return {
          ok: false,
          reason: "wrong_pivot_freshness",
          message: a.stale
            ? "Le tableau croisé est déjà à jour : cette étape veut montrer un tableau PÉRIMÉ, ne l'actualisez pas encore."
            : "Le tableau croisé n'est pas à jour : il faut l'actualiser.",
        }
      }
      if (a.cells !== undefined) {
        const lectures = observed.readings ?? {}
        for (const [ref, att] of Object.entries(a.cells)) {
          const lu = lectures[ref]
          if (!lu) return { ok: false, reason: "pivot_cell_not_read", message: "" }
          if (att.v !== undefined && !memeValeur(lu.value, att.v)) {
            return { ok: false, reason: "wrong_pivot_cell", message: `Le tableau croisé n'affiche pas le résultat attendu en ${ref}.` }
          }
        }
      }
      return OK
    }

    case "EXPECT_PAGE_SETUP": {
      if (observed.kind !== "pageSetupChange") return { ok: false, reason: "no_page_setup_reading", message: "" }
      const lu = observed.pageSetup
      const a = expected.pageSetup
      const simples: Array<[keyof PageSetupState, string]> = [
        ["orientation", "L'orientation de la page n'est pas celle attendue."],
        ["format", "Le format de papier n'est pas celui attendu."],
        ["scale", "L'échelle n'est pas celle attendue."],
        ["view", "Le mode d'affichage n'est pas celui attendu."],
        ["gridlines", "L'impression du quadrillage n'est pas réglée comme demandé."],
        ["headings", "L'impression des en-têtes n'est pas réglée comme demandé."],
      ]
      for (const [cle, msg] of simples) {
        if (a[cle] === undefined) continue
        if (lu[cle] !== a[cle]) return { ok: false, reason: `wrong_${String(cle)}`, message: msg }
      }
      // Les références de titres à répéter s'écrivent de plusieurs façons
      // ("$1:$1", "1:1") : on compare les chiffres et les lettres, pas les $.
      for (const cle of ["repeatRows", "repeatCols"] as const) {
        if (a[cle] === undefined) continue
        if (normRange(lu[cle]) !== normRange(a[cle])) {
          return { ok: false, reason: `wrong_${cle}`, message: "Les titres à répéter ne sont pas ceux attendus." }
        }
      }
      if (a.printArea !== undefined && normRange(lu.printArea) !== normRange(a.printArea)) {
        return { ok: false, reason: "wrong_print_area", message: "La zone d'impression n'est pas celle attendue." }
      }
      if (a.margins !== undefined) {
        for (const [cote, valeur] of Object.entries(a.margins)) {
          const v = (lu.margins as Record<string, number> | undefined)?.[cote]
          if (v === undefined || Math.abs(v - valeur) > 0.02) {
            return { ok: false, reason: "wrong_margin", message: `La marge ${cote} n'est pas celle attendue.` }
          }
        }
      }
      if (a.scaleToFit !== undefined) {
        for (const [sens, valeur] of Object.entries(a.scaleToFit)) {
          if ((lu.scaleToFit as Record<string, number> | undefined)?.[sens] !== valeur) {
            return { ok: false, reason: "wrong_scale_to_fit", message: "L'ajustement au nombre de pages n'est pas celui attendu." }
          }
        }
      }
      for (const zone of ["header", "footer"] as const) {
        const att = a[zone]
        if (att === undefined) continue
        for (const [place, texte] of Object.entries(att)) {
          const v = (lu[zone] as Record<string, string> | undefined)?.[place] ?? ""
          if (v.trim() !== String(texte).trim()) {
            return {
              ok: false,
              reason: `wrong_${zone}`,
              message: zone === "header" ? "L'en-tête ne porte pas le texte attendu." : "Le pied de page ne porte pas le texte attendu.",
            }
          }
        }
      }
      for (const cle of ["pageBreakRows", "pageBreakCols"] as const) {
        const att = a[cle]
        if (att === undefined) continue
        const lus = [...(lu[cle] ?? [])].sort((x, y) => x - y)
        const veut = [...att].sort((x, y) => x - y)
        if (lus.length !== veut.length || veut.some((n, i) => lus[i] !== n)) {
          return { ok: false, reason: `wrong_${cle}`, message: "Les sauts de page ne sont pas placés comme demandé." }
        }
      }
      if (a.center !== undefined) {
        for (const [sens, veut] of Object.entries(a.center)) {
          if (Boolean((lu.center as Record<string, boolean> | undefined)?.[sens]) !== veut) {
            return { ok: false, reason: "wrong_center", message: "Le centrage de la zone imprimée n'est pas celui attendu." }
          }
        }
      }
      return OK
    }

    case "EXPECT_MACRO": {
      if (observed.kind !== "macroChange") return { ok: false, reason: "no_macro_reading", message: "" }
      const m = observed.macro
      if (!m) return { ok: false, reason: "no_macro", message: "Aucune macro n'a été enregistrée." }
      const a = expected.macro
      if (a.name !== undefined && m.name.trim() !== a.name.trim()) {
        return { ok: false, reason: "wrong_macro_name", message: "La macro ne porte pas le nom attendu." }
      }
      if (a.shortcut !== undefined && normRaccourci(m.shortcut) !== normRaccourci(a.shortcut)) {
        return { ok: false, reason: "wrong_macro_shortcut", message: "Le raccourci de la macro n'est pas celui attendu." }
      }
      if (a.relative !== undefined && Boolean(m.relative) !== a.relative) {
        return {
          ok: false,
          reason: "wrong_macro_relative",
          message: a.relative
            ? "La macro doit être enregistrée en références relatives."
            : "La macro doit être enregistrée en références absolues.",
        }
      }
      if (a.minStatements !== undefined && m.statements.length < a.minStatements) {
        return { ok: false, reason: "macro_too_short", message: "La macro n'a pas enregistré toutes les actions demandées." }
      }
      if (a.contains !== undefined) {
        for (const frag of a.contains) {
          if (!observed.code.includes(frag)) {
            return { ok: false, reason: "macro_code_missing", message: "Le code de la macro ne contient pas ce qui est attendu." }
          }
        }
      }
      if (a.effet !== undefined) {
        const lectures = observed.readings ?? {}
        for (const [ref, att] of Object.entries(a.effet)) {
          const lu = lectures[ref]
          if (!lu) return { ok: false, reason: "macro_cell_not_read", message: "" }
          if (att.v !== undefined && !memeValeur(lu.value, att.v)) {
            return { ok: false, reason: "wrong_macro_effect", message: `L'exécution de la macro ne donne pas le résultat attendu en ${ref}.` }
          }
        }
      }
      return OK
    }

    case "RECORD_MACRO": {
      if (observed.kind !== "recorder") return { ok: false, reason: "no_recorder_reading", message: "" }
      if (observed.state !== expected.expect) {
        return {
          ok: false,
          reason: "wrong_recorder_state",
          message: expected.expect === "started" ? "L'enregistrement n'a pas démarré." : "L'enregistrement n'a pas été arrêté.",
        }
      }
      return OK
    }

    case "EXPECT_POSTE": {
      if (observed.kind !== "posteChange") return { ok: false, reason: "no_poste_reading", message: "" }
      const souci = verifierPoste(observed.poste, expected.poste)
      if (souci) return { ok: false, reason: "wrong_poste_state", message: souci }
      return OK
    }

    case "MONTRER": {
      // `MONTRER` n'est PAS une action attendue de l'apprenant : elle ne vit que
      // dans le champ `montrer` d'un écran de lecture, pour illustrer un propos.
      // La rencontrer ici signalerait un scénario qui l'utilise comme consigne.
      return { ok: false, reason: "montrer_non_validable", message: "" }
    }

    default: {
      // Garde-fou : si une primitive est ajoutée au format sans être traitée ici,
      // TypeScript le signale à la compilation plutôt qu'en production.
      const _exhaustive: never = expected
      void _exhaustive
      return { ok: false, reason: "unknown_action", message: "Action non reconnue." }
    }
  }
}

/**
 * Score d'une évaluation : proportion d'étapes notables réussies au premier essai.
 * Compter les réussites au premier essai plutôt que les réussites finales est ce
 * qui distingue une évaluation d'un exercice — sinon tout le monde finit à 100 %
 * en insistant.
 */
export function computeScore(
  steps: SimulationStep[],
  firstTrySuccess: Record<string, boolean>,
): number {
  const gradable = steps.filter((s) => s.action.type !== "READ" && (s.points ?? 1) > 0)
  if (gradable.length === 0) return 1
  const total = gradable.reduce((sum, s) => sum + (s.points ?? 1), 0)
  const earned = gradable.reduce(
    (sum, s) => sum + (firstTrySuccess[s.id] ? s.points ?? 1 : 0),
    0,
  )
  return total > 0 ? earned / total : 1
}

/**
 * Compare deux références sans se soucier des $ ni de la casse : "$1:$1",
 * "1:1" et "A2:C6" / "a2:c6" désignent la même chose pour l'apprenant.
 */
function normRange(r: string | undefined): string {
  return (r ?? "").replace(/\$/g, "").trim().toUpperCase()
}

/** Deux écritures d'une même couleur : "#FF0000", "ff0000", "red" côté galerie. */
function memeCouleur(a: string | undefined, b: string | undefined): boolean {
  const n = (c: string | undefined) => (c ?? "").trim().toLowerCase().replace(/^#/, "")
  const x = n(a)
  const y = n(b)
  if (x === y) return true
  // Une couleur sur 3 chiffres équivaut à la même doublée : f00 = ff0000.
  const etendre = (c: string) => (c.length === 3 ? c.split("").map((d) => d + d).join("") : c)
  return etendre(x) === etendre(y)
}

/** "Ctrl+Maj+E", "ctrl+maj+e", "Ctrl + Maj + E" désignent le même raccourci. */
function normRaccourci(r: string | undefined): string {
  return (r ?? "").toLowerCase().replace(/\s+/g, "").replace(/shift/g, "maj").replace(/control/g, "ctrl")
}

/**
 * Égalité tolérante entre une valeur lue et une valeur attendue : un nombre à
 * 1e-9 près, sinon comparaison textuelle indifférente à la casse et aux espaces.
 */
function memeValeur(lue: unknown, attendue: unknown): boolean {
  if (typeof attendue === "number") {
    const n = typeof lue === "number" ? lue : Number(String(lue).replace(/\s/g, "").replace(",", "."))
    return Number.isFinite(n) && Math.abs(n - attendue) < 1e-9
  }
  return String(lue ?? "").trim().toLowerCase() === String(attendue ?? "").trim().toLowerCase()
}
