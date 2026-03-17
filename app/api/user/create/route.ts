import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import crypto from "crypto"
import { sendEmail } from "@/lib/email"
import { accountCreatedEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"
import { generateToken } from "@/lib/tokens"

export async function POST(req: Request) {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { firstName, lastName, email, password, userRole, partnerId, reference } = await req.json()

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Tous les champs sont requis" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (existing) {
    return NextResponse.json({ error: "Cet email existe déjà" }, { status: 400 })
  }

  // Check reference uniqueness if provided
  const trimmedRef = reference?.trim() || null
  if (trimmedRef) {
    const existingRef = await prisma.user.findUnique({ where: { reference: trimmedRef } })
    if (existingRef) {
      return NextResponse.json({ error: "Cette référence est déjà utilisée" }, { status: 400 })
    }
  }

  // Partner admin can only create learners in their own org
  if (role === "PARTNER_ADMIN") {
    const adminPartnerId = (session.user as any).partnerId
    if (userRole !== "LEARNER" || partnerId !== adminPartnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
  }

  // Use provided password or generate a random placeholder (user will set their own via activation)
  const rawPassword = password || crypto.randomBytes(32).toString("hex")
  const hashed = await hash(rawPassword, 12)

  const user = await prisma.user.create({
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      role: userRole || "LEARNER",
      partnerId: partnerId || null,
      reference: trimmedRef,
      isActive: false,
    },
    include: { partner: true },
  })

  // Generate activation token and send welcome email with activation link
  try {
    const activationToken = await generateToken(user.id, "ACTIVATION")
    const partnerParam = user.partner?.slug ? `&partner=${user.partner.slug}` : ""
    const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://switching-lms-production.up.railway.app"
    const activationUrl = `${baseUrl}/login/activer?token=${activationToken}${partnerParam}`
    const loginUrl = user.partner?.slug ? `${baseUrl}/login?partner=${user.partner.slug}` : `${baseUrl}/login`

    const dynamic = await resolveTemplate("ACCOUNT_CREATED", user.partnerId)
    if (dynamic) {
      const vars = {
        prenom: user.firstName,
        nom: user.lastName,
        email: user.email,
        lien_activation: activationUrl,
        lien_connexion: loginUrl,
        plateforme_nom: user.partner?.name || "Switching Formation",
        plateforme_url: loginUrl,
        partenaire_nom: user.partner?.name || "",
        couleur_principale: user.partner?.primaryColor || "#111111",
        couleur_secondaire: user.partner?.secondaryColor || "#F5F5F7",
        logo_url: user.partner?.logoUrl || "",
      }
      const subject = replaceVariables(dynamic.subject, vars)
      const html = replaceVariables(dynamic.htmlContent, vars)
      sendEmail(user.email, subject, html, user.id, "ACCOUNT_CREATED", user.partner)
    } else {
      const emailData = accountCreatedEmail(user.firstName, user.email, activationToken, user.partner, user.partner?.slug)
      sendEmail(user.email, emailData.subject, emailData.html, user.id, "ACCOUNT_CREATED", user.partner)
    }
  } catch {
    // Never block user creation if email fails
  }

  return NextResponse.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    partnerId: user.partnerId,
    partner: user.partner,
  }, { status: 201 })
}
