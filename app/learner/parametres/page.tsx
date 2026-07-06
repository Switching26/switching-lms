import { redirect } from "next/navigation"

// Fusionnée avec « Mon compte » le 06/07/2026 : profil + mot de passe apprenant
// vivent désormais uniquement sur /learner/mon-compte. On conserve cette route
// en redirection pour ne pas casser d'anciens liens/bookmarks.
export default function ParametresPage() {
  redirect("/learner/mon-compte")
}
