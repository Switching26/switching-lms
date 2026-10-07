import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

const { auth } = NextAuth(authConfig)

const roleRoutes: Record<string, string> = {
  "/super-admin": "SUPER_ADMIN",
  "/partner-admin": "PARTNER_ADMIN",
  "/learner": "LEARNER",
  "/trainer": "TRAINER",
}

// Resolve URL base from X-Forwarded-* (Tailscale serve, Railway proxy, etc.)
function getBaseUrl(req: any): string {
  const proto = req.headers.get("x-forwarded-proto") || "http"
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
  if (host) return `${proto}://${host}`
  return req.url
}

// Documents pédagogiques : jamais servis en statique public. Réécrits vers
// /api/files/<nom> qui applique authentification + contrôle d'inscription.
const PROTECTED_UPLOAD_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip)$/i

export default auth((req) => {
  const { pathname } = req.nextUrl
  const user = req.auth?.user
  const base = getBaseUrl(req)

  // Avant le passe-droit des extensions : les JS, MP3 et JSON anglais sont privés.
  if (pathname === "/anglais" || pathname.startsWith("/anglais/")) {
    if (!user) return Response.json({ ok: false, erreur: "Session requise" }, { status: 401 })
    return // La route Node revérifie le compte et l'inscription pour CHAQUE fichier.
  }

  if (pathname.startsWith("/uploads/") && PROTECTED_UPLOAD_EXT.test(pathname)) {
    const filename = pathname.split("/").pop()!
    return Response.redirect(new URL(`/api/files/${filename}`, base))
  }

  // Assets publics (covers, logos, favicon) : le service statique public/ ne
  // fonctionne pas dans l'environnement standalone Railway → servis via la
  // route /api/files (lecture du repo source, prouvée fonctionnelle en prod).
  if (
    pathname.startsWith("/covers/") ||
    /^\/[^/]+\.(png|svg|jpe?g|webp|gif|ico)$/i.test(pathname)
  ) {
    const filename = pathname.split("/").pop()!
    return Response.redirect(new URL(`/api/files/${filename}`, base))
  }

  if (
    pathname.startsWith("/login") ||
    // Passage d'une évaluation par un candidat sans compte : la page est
    // publique, c'est le token du lien qui autorise l'accès (vérifié côté API).
    pathname.startsWith("/evaluation/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    (pathname.includes(".") && !(pathname === "/trainer" || pathname.startsWith("/trainer/")))
  ) {
    return
  }

  if (!user) {
    return Response.redirect(new URL("/login", base))
  }

  const effectiveRole = user.role
  // Existing login sends every role to /. Route trainers before app/page.tsx,
  // whose role switch is maintained outside the trainer foundation lot.
  if (pathname === "/" && String(effectiveRole) === "TRAINER") {
    return Response.redirect(new URL("/trainer", base))
  }

  // L'admin qui visualise l'espace d'un apprenant et retourne vers SON propre espace
  // (favori, adresse tapée, onglet rouvert) : on termine la visualisation au lieu de
  // le renvoyer chez l'apprenant — c'était une impasse, seule la déconnexion en sortait.
  if (user.realAdmin) {
    const espaceAdmin = user.realAdmin.role === "SUPER_ADMIN" ? "/super-admin"
      : user.realAdmin.role === "PARTNER_ADMIN" ? "/partner-admin" : null
    if (espaceAdmin && pathname.startsWith(espaceAdmin)) {
      return Response.redirect(new URL("/api/impersonate", base))
    }
  }

  for (const [prefix, role] of Object.entries(roleRoutes)) {
    if (pathname.startsWith(prefix) && effectiveRole !== role) {
      const dashboards: Record<string, string> = {
        SUPER_ADMIN: "/super-admin/dashboard",
        PARTNER_ADMIN: "/partner-admin/dashboard",
        LEARNER: "/learner/accueil",
        TRAINER: "/trainer",
      }
      return Response.redirect(new URL(dashboards[effectiveRole] || "/login", base))
    }
  }
})

export const config = {
  // Matcher volontairement large : les assets (covers, logos, favicon) DOIVENT
  // passer par le middleware pour être redirigés vers /api/files (le service
  // statique public/ ne fonctionne pas en standalone sur Railway).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
