import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encode, decode } from "next-auth/jwt"

const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || ""
const cookieName = process.env.NODE_ENV === "production"
  ? "__Secure-authjs.session-token"
  : "authjs.session-token"

export async function POST(req: NextRequest) {
  const session = await auth()
  const currentUser = session?.user as any

  if (!currentUser || currentUser.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 })
  }

  // If already impersonating, deny
  if (currentUser.realAdmin) {
    return NextResponse.json({ error: "Déjà en impersonation" }, { status: 400 })
  }

  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 })
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { partner: true },
  })

  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }

  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Impossible d'impersoner un super admin" }, { status: 400 })
  }

  // Save original admin token in a backup cookie
  const currentToken = req.cookies.get(cookieName)?.value
  if (!currentToken) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 400 })
  }

  // Decode current token to get base data
  const decoded = await decode({ token: currentToken, secret, salt: cookieName })
  if (!decoded) {
    return NextResponse.json({ error: "Token invalide" }, { status: 400 })
  }

  // Build impersonated token
  const impersonatedToken = await encode({
    token: {
      ...decoded,
      sub: target.id,
      name: `${target.firstName} ${target.lastName}`,
      email: target.email,
      role: target.role,
      firstName: target.firstName,
      partnerId: target.partnerId,
      partnerName: target.partner?.name || null,
      partnerSlug: target.partner?.slug || null,
      partnerColor: target.partner?.primaryColor || null,
      realAdmin: {
        userId: currentUser.id,
        email: currentUser.email,
      },
      impersonating: {
        userId: target.id,
        email: target.email,
        name: `${target.firstName} ${target.lastName}`,
        role: target.role,
      },
    },
    secret,
    salt: cookieName,
  })

  // Determine redirect
  const redirectUrl = target.role === "LEARNER"
    ? "/learner/accueil"
    : "/partner-admin/dashboard"

  const res = NextResponse.json({ ok: true, redirectUrl })

  // Store backup of real admin token
  res.cookies.set("impersonate-backup", currentToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  })

  // Replace session with impersonated token
  res.cookies.set(cookieName, impersonatedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  })

  return res
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  const currentUser = session?.user as any

  if (!currentUser?.realAdmin) {
    return NextResponse.json({ error: "Pas en impersonation" }, { status: 400 })
  }

  // Restore the backup token
  const backupToken = req.cookies.get("impersonate-backup")?.value
  if (!backupToken) {
    return NextResponse.json({ error: "Token de sauvegarde introuvable" }, { status: 400 })
  }

  const res = NextResponse.json({ ok: true, redirectUrl: "/super-admin/utilisateurs" })

  // Restore original session
  res.cookies.set(cookieName, backupToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  })

  // Clear backup cookie
  res.cookies.set("impersonate-backup", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })

  return res
}
