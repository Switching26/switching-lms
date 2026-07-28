/**
 * Estimation du temps apprenant d'un chapitre de simulation, en secondes.
 *
 * Coefficients calibrés le 28/07/2026 sur le contenu réel (1 872 étapes) pour
 * que la somme des 246 chapitres reproduise le profil « apprenant moyen »
 * (~31 h), chiffre retenu par Samuel pour l'affichage de la formation Excel.
 * Par étape, intro d'ouverture comprise : une étape d'exercice coûte plus cher
 * qu'une étape de leçon guidée, puisqu'il faut trouver le chemin soi-même.
 *
 * Utilisée par le sommaire apprenant (mode + stepCount dénormalisés, sans
 * charger le scénario) ET par l'écran d'intro du player — les deux doivent
 * afficher le même chiffre.
 */
export function estimatedSimulationSeconds(mode: string, stepCount: number): number {
  const parEtape = mode === "EXERCISE" ? 80 : mode === "EVALUATION" ? 67 : 40
  return stepCount * parEtape + 22
}

/** La même estimation en minutes entières, jamais moins de 1. */
export function estimatedSimulationMinutes(mode: string, stepCount: number): number {
  return Math.max(1, Math.round(estimatedSimulationSeconds(mode, stepCount) / 60))
}
