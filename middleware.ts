import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

const { auth } = NextAuth(authConfig)

const roleRoutes: Record<string, string> = {
  "/super-admin": "SUPER_ADMIN",
  "/partner-admin": "PARTNER_ADMIN",
  "/learner": "LEARNER",
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const user = req.auth?.user as any

  // Public routes
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  ) {
    return
  }

  // Not logged in → redirect to login
  if (!user) {
    const loginUrl = new URL("/login", req.url)
    return Response.redirect(loginUrl)
  }

  // Determine effective role (impersonated role takes priority)
  const effectiveRole = user.role

  // Block impersonated users from accessing super-admin routes
  if (pathname.startsWith("/super-admin") && user.realAdmin) {
    return Response.redirect(new URL("/learner/accueil", req.url))
  }

  // Check role-based access
  for (const [prefix, role] of Object.entries(roleRoutes)) {
    if (pathname.startsWith(prefix) && effectiveRole !== role) {
      const dashboards: Record<string, string> = {
        SUPER_ADMIN: "/super-admin/dashboard",
        PARTNER_ADMIN: "/partner-admin/dashboard",
        LEARNER: "/learner/accueil",
      }
      return Response.redirect(new URL(dashboards[effectiveRole] || "/login", req.url))
    }
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
