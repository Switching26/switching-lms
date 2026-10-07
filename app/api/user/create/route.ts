import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import crypto from "crypto"
import { sendEmail } from "@/lib/email"
import { accountCreatedEmail } from "@/lib/email-templates"
import { resolveTemplate, replaceVariables } from "@/lib/email-template-engine"
import { generateToken } from "@/lib/tokens"
import { getBaseUrl } from "@/lib/get-base-url"
import { encryptVisiblePassword } from "@/lib/visible-password"
import { Role } from "@prisma/client"

export async function POST(req: Request) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { firstName, lastName, email, password, userRole, partnerId, trainerPartnerIds = [], reference, sendAutomaticEmails = true } = await req.json()

  if (typeof sendAutomaticEmails !== "boolean") {
    return NextResponse.json({ error: "Option de mails invalide" }, { status: 400 })
  }
  if (!sendAutomaticEmails && (typeof password !== "string" || password.length < 8)) {
    return NextResponse.json({ error: "Définissez un mot de passe d'au moins 8 caractères" }, { status: 400 })
  }

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

  let effectiveRole = userRole === "TRAINER" ? Role.TRAINER : userRole === "PARTNER_ADMIN" ? Role.PARTNER_ADMIN : Role.LEARNER
  let effectivePartnerId = partnerId || null

  // Un admin partenaire ne peut créer que DANS SON PROPRE partenaire, et seulement
  // des apprenants ou des admins partenaires (jamais un super-admin, jamais un
  // compte interne ou rattaché à un autre partenaire). Le partenaire est dérivé
  // de la session, jamais du payload client.
  if (role === "PARTNER_ADMIN") {
    const adminPartnerId = session.user.partnerId
    if (!adminPartnerId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
    if (userRole && userRole !== "LEARNER" && userRole !== "PARTNER_ADMIN") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
    effectiveRole = userRole === "PARTNER_ADMIN" ? Role.PARTNER_ADMIN : Role.LEARNER
    effectivePartnerId = adminPartnerId
  } else if (effectiveRole === "PARTNER_ADMIN" && !effectivePartnerId) {
    return NextResponse.json({ error: "Un admin partenaire doit être rattaché à un partenaire" }, { status: 400 })
  }

  let selectedPartnerIds: string[] = []
  if (effectiveRole === Role.TRAINER) {
    if (role !== "SUPER_ADMIN") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    if (!Array.isArray(trainerPartnerIds) || trainerPartnerIds.length > 100 || trainerPartnerIds.some((id) => typeof id !== "string" || !id.trim())) {
      return NextResponse.json({ error: "Liste d'organismes invalide" }, { status: 400 })
    }
    selectedPartnerIds = Array.from(new Set(trainerPartnerIds as string[]))
    const count = await prisma.partner.count({ where: { id: { in: selectedPartnerIds }, isActive: true } })
    if (count !== selectedPartnerIds.length) return NextResponse.json({ error: "Organisme introuvable ou inactif" }, { status: 400 })
    // Memberships are represented by TrainerPartner, including an empty list.
    effectivePartnerId = null
  }

  if (effectivePartnerId) {
    const partner = await prisma.partner.findUnique({ where: { id: effectivePartnerId } })
    if (!partner) {
      return NextResponse.json({ error: "Partenaire introuvable" }, { status: 400 })
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
      visiblePasswordEncrypted: encryptVisiblePassword(rawPassword),
      role: effectiveRole,
      partnerId: effectivePartnerId,
      reference: trimmedRef,
      isActive: !sendAutomaticEmails,
      ...(effectiveRole === Role.TRAINER ? { trainerPartners: { create: selectedPartnerIds.map((partnerId) => ({ partnerId })) } } : {}),
    },
    include: { partner: true, trainerPartners: { include: { partner: { select: { id: true, name: true } } } } },
  })

  let activationEmailSent = false

  // Generate activation token and send welcome email with activation link
  if (sendAutomaticEmails) try {
    const activationToken = await generateToken(user.id, "ACTIVATION")
    const partnerParam = user.partner?.slug ? `&partner=${user.partner.slug}` : ""
    const baseUrl = getBaseUrl()
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
        logo_url: user.partner?.logoUrl ? (user.partner.logoUrl.startsWith("http") ? user.partner.logoUrl : `${baseUrl}${user.partner.logoUrl.startsWith("/") ? "" : "/"}${user.partner.logoUrl}`) : "",
      }
      const subject = replaceVariables(dynamic.subject, vars)
      const html = replaceVariables(dynamic.htmlContent, vars)
      activationEmailSent = await sendEmail(user.email, subject, html, user.id, "ACCOUNT_CREATED", user.partner,
        effectiveRole === Role.TRAINER ? { bcc: "contact@switchingformation.com" } : undefined)
    } else {
      const emailData = accountCreatedEmail(user.firstName, user.email, activationToken, user.partner, user.partner?.slug)
      activationEmailSent = await sendEmail(user.email, emailData.subject, emailData.html, user.id, "ACCOUNT_CREATED", user.partner,
        effectiveRole === Role.TRAINER ? { bcc: "contact@switchingformation.com" } : undefined)
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
    partner: user.partner ? (({ smtpPassword, ...safe }) => safe)(user.partner) : null,
    trainerPartners: user.trainerPartners,
    activationEmailSent,
    ...(!sendAutomaticEmails ? { emailSkipped: "mails automatiques désactivés", isActive: true } : {}),
  }, { status: 201 })
}
