import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encode, decode } from "next-auth/jwt"

function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("AUTH_SECRET or NEXTAUTH_SECRET environment variable is required.")
  return s
}

const cookieName = process.env.NODE_ENV === "production"
  ? "__Secure-authjs.session-token"
  : "authjs.session-token"

export async function POST(req: NextRequest) {
  const session = await auth()
  const currentUser = session?.user

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN"
  const isPartnerAdmin = currentUser?.role === "PARTNER_ADMIN"

  if (!currentUser || (!isSuperAdmin && !isPartnerAdmin)) {
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

  if (isPartnerAdmin) {
    if (target.role !== "LEARNER") {
      return NextResponse.json({ error: "Accès limité aux apprenants" }, { status: 403 })
    }
    if (!currentUser.partnerId || target.partnerId !== currentUser.partnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
    if (target.archivedAt) {
      return NextResponse.json({ error: "Utilisateur archivé" }, { status: 400 })
    }
  } else if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Impossible d'impersoner un super admin" }, { status: 400 })
  }

  // Save original admin token in a backup cookie
  const currentToken = req.cookies.get(cookieName)?.value
  if (!currentToken) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 400 })
  }

  // Decode current token to get base data
  const decoded = await decode({ token: currentToken, secret: getAuthSecret(), salt: cookieName })
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
      partnerSecondaryColor: target.partner?.secondaryColor || null,
      partnerLogo: target.partner?.logoUrl || null,
      realAdmin: {
        userId: currentUser.id,
        email: currentUser.email || "",
        role: currentUser.role,
        partnerId: currentUser.partnerId || null,
      },
      impersonating: {
        userId: target.id,
        email: target.email,
        name: `${target.firstName} ${target.lastName}`,
        role: target.role,
      },
    },
    secret: getAuthSecret(),
    salt: cookieName,
  })

  // Log impersonation start
  await prisma.impersonationLog.create({
    data: {
      adminId: currentUser.id,
      adminEmail: currentUser.email || "",
      targetId: target.id,
      targetEmail: target.email,
      targetRole: target.role,
      action: "start",
    },
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
    // Aussi longtemps que la session elle-même (30 j, défaut NextAuth). À 1 h,
    // l'admin qui revenait plus tard ne pouvait plus « Quitter » : le bouton restait
    // bloqué et il devait se déconnecter (constaté chez CNFDI, septembre 2026).
    maxAge: 30 * 24 * 60 * 60,
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

// Base publique de la requête (Railway / Tailscale passent par un proxy) : même
// règle que le middleware, sinon la redirection partirait vers l'hôte interne.
function baseDeLaRequete(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https"
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
  return host ? `${proto}://${host}` : req.nextUrl.origin
}

const effacer = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 0 }

async function sortirDeLEspace(req: NextRequest, mode: "json" | "redirect") {
  const session = await auth()
  const currentUser = session?.user
  const base = baseDeLaRequete(req)

  if (!currentUser?.realAdmin) {
    return mode === "json"
      ? NextResponse.json({ error: "Pas en impersonation" }, { status: 400 })
      : NextResponse.redirect(new URL("/", base))
  }

  await prisma.impersonationLog.create({
    data: {
      adminId: currentUser.realAdmin.userId,
      adminEmail: currentUser.realAdmin.email,
      targetId: currentUser.id,
      targetEmail: currentUser.email || "",
      targetRole: currentUser.role,
      action: "stop",
    },
  })

  const backupToken = req.cookies.get("impersonate-backup")?.value

  // Sauvegarde perdue (cookie effacé, navigateur nettoyé…) : on ne laisse jamais
  // l'admin coincé dans l'espace de l'apprenant. La session est fermée proprement
  // et il revient sur SA page de connexion, où il se reconnecte.
  if (!backupToken) {
    const slug = currentUser.partnerSlug
    const loginUrl = `/login${slug ? `?partner=${slug}` : ""}`
    const res = mode === "json"
      ? NextResponse.json({ ok: true, redirectUrl: loginUrl, reconnexion: true })
      : NextResponse.redirect(new URL(loginUrl, base))
    res.cookies.set(cookieName, "", effacer)
    res.cookies.set("impersonate-backup", "", effacer)
    return res
  }

  const redirectUrl = currentUser.realAdmin.role === "PARTNER_ADMIN"
    ? "/partner-admin/utilisateurs"
    : "/super-admin/utilisateurs"

  const res = mode === "json"
    ? NextResponse.json({ ok: true, redirectUrl })
    : NextResponse.redirect(new URL(redirectUrl, base))

  // Restore original session
  res.cookies.set(cookieName, backupToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  })
  res.cookies.set("impersonate-backup", "", effacer)
  return res
}

/** Bouton « Quitter » du bandeau orange. */
export async function DELETE(req: NextRequest) {
  return sortirDeLEspace(req, "json")
}

/**
 * Sortie par navigation : le middleware y renvoie l'admin qui retourne vers SON
 * espace (favori, adresse tapée, onglet rouvert) pendant qu'il visualise celui d'un
 * apprenant — avant, il était renvoyé chez l'apprenant et devait se déconnecter.
 */
export async function GET(req: NextRequest) {
  return sortirDeLEspace(req, "redirect")
}
