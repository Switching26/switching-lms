/**
 * Libellés FR lisibles pour les codes de type d'email affichés dans les flux
 * "Activité récente" des dashboards (super-admin & partner-admin).
 *
 * Partagé entre les deux dashboards pour éviter que les codes bruts
 * (PASSWORD_RESET, ACTIVATION_LINK, …) apparaissent dans l'UI.
 */

const EMAIL_TYPE_LABELS: Record<string, string> = {
  PASSWORD_RESET: "Réinitialisation mot de passe",
  ACTIVATION_LINK: "Lien d'activation",
  ACCOUNT_CREATED: "Création de compte",
  FORMATION_ASSIGNED: "Formation attribuée",
  FORMATION_COMPLETED: "Formation terminée",
  CHAPTER_COMPLETED: "Chapitre terminé",
  CUSTOM: "Message",
}

/**
 * Renvoie le libellé FR d'un type d'email.
 * Fallback : le type tel quel s'il n'est pas mappé.
 */
export function emailTypeLabel(type: string): string {
  return EMAIL_TYPE_LABELS[type] ?? type
}
