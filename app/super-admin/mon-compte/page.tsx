import { redirect } from "next/navigation"

// Fusion Mon compte / Paramètres côté super-admin (07/07/2026) :
// la page unique vit désormais sous /super-admin/parametres (profil + config plateforme).
export default function MonComptePage() {
  redirect("/super-admin/parametres")
}
