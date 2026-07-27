import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

const { auth } = NextAuth(authConfig)

const roleRoutes: Record<string, string> = {
  "/super-admin": "SUPER_ADMIN",
  "/partner-admin": "PARTNER_ADMIN",
  "/learner": "LEARNER",
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
    pathname.includes(".")
  ) {
    return
  }

  if (!user) {
    return Response.redirect(new URL("/login", base))
  }

  const effectiveRole = user.role

  if (pathname.startsWith("/super-admin") && user.realAdmin) {
    return Response.redirect(new URL("/learner/accueil", base))
  }

  for (const [prefix, role] of Object.entries(roleRoutes)) {
    if (pathname.startsWith(prefix) && effectiveRole !== role) {
      const dashboards: Record<string, string> = {
        SUPER_ADMIN: "/super-admin/dashboard",
        PARTNER_ADMIN: "/partner-admin/dashboard",
        LEARNER: "/learner/accueil",
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
