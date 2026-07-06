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

  if (
    pathname.startsWith("/login") ||
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
  // Exclut les assets statiques (images/covers/branding servis depuis public/) :
  // en build standalone, un chemin matché par le middleware NextAuth ne retombe
  // pas sur le service de fichiers public/ → sinon /covers/*, /cnfdi-logo.png et
  // /favicon.svg renvoient 404. Les documents /uploads/*.pdf (non-images) restent
  // matchés pour conserver la redirection authentifiée vers /api/files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico|css|woff2?)).*)",
  ],
}
