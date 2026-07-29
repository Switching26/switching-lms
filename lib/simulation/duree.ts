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

/**
 * Durée lisible : « 31 h », « 1 h 40 », « 8 min ». Partagée par la page
 * apprenant et le sommaire de l'atelier — deux formateurs auraient fini par
 * afficher deux durées différentes pour le même chapitre.
 */
export function dureeLisible(seconds: number): string {
  if (!seconds || seconds <= 0) return ""
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `${h} h ${m.toString().padStart(2, "0")}` : `${h} h`
  if (m > 0) return `${m} min`
  return `${Math.floor(seconds)} s`
}
