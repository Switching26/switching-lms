import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

const roleRoutes: Record<string, string> = {
  SUPER_ADMIN: "/super-admin/dashboard",
  PARTNER_ADMIN: "/partner-admin/dashboard",
  LEARNER: "/learner/accueil",
}

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const role = (req.auth?.user as any)?.role as string | undefined

  const isLoginPage = nextUrl.pathname === "/login"
  const isSuperAdmin = nextUrl.pathname.startsWith("/super-admin")
  const isPartnerAdmin = nextUrl.pathname.startsWith("/partner-admin")
  const isLearner = nextUrl.pathname.startsWith("/learner")
  const isApi = nextUrl.pathname.startsWith("/api")

  // Let all API routes through
  if (isApi) {
    return NextResponse.next()
  }

  // Login page: redirect to dashboard if already logged in
  if (isLoginPage) {
    if (isLoggedIn && role) {
      return NextResponse.redirect(new URL(roleRoutes[role], nextUrl))
    }
    return NextResponse.next()
  }

  // Not logged in: redirect to login
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl))
  }

  // Role-based route protection
  if (isSuperAdmin && role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL(roleRoutes[role!], nextUrl))
  }

  if (isPartnerAdmin && role !== "PARTNER_ADMIN") {
    return NextResponse.redirect(new URL(roleRoutes[role!], nextUrl))
  }

  if (isLearner && role !== "LEARNER") {
    return NextResponse.redirect(new URL(roleRoutes[role!], nextUrl))
  }

  // Root page: redirect to role-based dashboard
  if (nextUrl.pathname === "/") {
    if (role) {
      return NextResponse.redirect(new URL(roleRoutes[role], nextUrl))
    }
    return NextResponse.redirect(new URL("/login", nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
}
