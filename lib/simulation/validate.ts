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

import type { SimulationAction, SimulationStep, TypeAction } from "./types"
import { matchesTypedAnswer, normalizeFormula } from "./types"
import { sameArea } from "./grid"
import { frToEngine } from "./formula-fr"

/** Origine réelle de l'action, pour les exercices qui imposent le moyen. */
export type ActionChannel = "mouse" | "keyboard" | "ribbon" | "contextMenu" | "formulaBar" | "unknown"

/** Ce que le simulateur a observé quand l'apprenant a agi. */
export type ObservedAction =
  | { kind: "next" }
  | { kind: "typed"; target: string; text: string; channel: ActionChannel }
  | { kind: "cellClick"; cell: string; modifier?: "Control" | "Shift"; channel: ActionChannel }
  | { kind: "control"; control: string; channel: ActionChannel }
  | { kind: "contextMenu"; target: string }
  | { kind: "doubleClick"; target: string }
  | { kind: "key"; key: string }
  | { kind: "fillHandle"; from: string; to: string }
  | { kind: "dragRange"; range: string }
  /**
   * Le classeur a changé. `readings` porte la lecture des cellules attendues par
   * l'étape — c'est le simulateur qui les lit, pour que ce fichier reste pur et
   * utilisable aussi côté serveur.
   */
  | { kind: "stateChange"; readings: Record<string, { formula: string; value: unknown }> }

export type Verdict =
  | { ok: true }
  /** `reason` est destiné au journal pédagogique, `message` à l'apprenant. */
  | { ok: false; reason: string; message: string }

const OK: Verdict = { ok: true }

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

  // Écran de lecture : seul « Suivant » est attendu.
  if (expected.type === "READ") {
    return observed.kind === "next"
      ? OK
      : { ok: false, reason: "read_step_action", message: "Continuez avec le bouton Suivant." }
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
      if (!validateTyped(expected, observed.text)) {
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
