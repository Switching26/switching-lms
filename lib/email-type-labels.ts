/**
 * Libellés FR lisibles pour les codes de type d'email affichés dans les flux
 * "Activité récente" des dashboards (super-admin & partner-admin).
 *
 * Partagé entre les deux dashboards pour éviter que les codes bruts
 * (PASSWORD_RESET, ACTIVATION_LINK, …) apparaissent dans l'UI.
 */

const EMAIL_TYPE_LABELS: Record<string, string> = {
  PASSWORD_RESET: "Réinitialisation mot de passe",
  LOGIN_LINK: "Lien de connexion",
  ACTIVATION_LINK: "Lien d'activation",
  ACCOUNT_CREATED: "Création de compte",
  FORMATION_ASSIGNED: "Formation attribuée",
  FORMATION_COMPLETED: "Formation terminée",
  CHAPTER_COMPLETED: "Chapitre terminé",
  CUSTOM: "Message",
  ASSESSMENT_INVITATION: "Invitation à une évaluation",
  ASSESSMENT_COMPLETED: "Évaluation terminée",
}

/**
 * Renvoie le libellé FR d'un type d'email.
 * Fallback : un libellé lisible pour les événements non encore mappés.
 */
export function emailTypeLabel(type: string): string {
  return EMAIL_TYPE_LABELS[type] ?? "Événement de la plateforme"
}
