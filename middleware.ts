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

export default auth((req) => {
  const { pathname } = req.nextUrl
  const user = req.auth?.user
  const base = getBaseUrl(req)

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
