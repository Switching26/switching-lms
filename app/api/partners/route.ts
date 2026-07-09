import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import { encryptVisiblePassword } from "@/lib/visible-password"

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { name, slug, primaryColor, secondaryColor, logoUrl, faviconUrl, adminEmail, adminPassword } = await req.json()

  if (!name?.trim() || !slug?.trim() || !adminEmail?.trim() || !adminPassword) {
    return NextResponse.json({ error: "Nom, slug, email admin et mot de passe requis" }, { status: 400 })
  }

  const existingSlug = await prisma.partner.findUnique({ where: { slug: slug.trim().toLowerCase() } })
  if (existingSlug) {
    return NextResponse.json({ error: "Ce slug existe déjà" }, { status: 400 })
  }

  const existingEmail = await prisma.user.findUnique({ where: { email: adminEmail.trim().toLowerCase() } })
  if (existingEmail) {
    return NextResponse.json({ error: "Cet email existe déjà" }, { status: 400 })
  }

  const hashed = await hash(adminPassword, 12)

  const partner = await prisma.partner.create({
    data: {
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      primaryColor: primaryColor || "#111111",
      secondaryColor: secondaryColor || "#FFFFFF",
      logoUrl: logoUrl || null,
      faviconUrl: faviconUrl || null,
      users: {
        create: {
          firstName: "Admin",
          lastName: name.trim(),
          email: adminEmail.trim().toLowerCase(),
          password: hashed,
          visiblePasswordEncrypted: encryptVisiblePassword(adminPassword),
          role: "PARTNER_ADMIN",
        },
      },
    },
    include: { users: { where: { role: "PARTNER_ADMIN" }, take: 1 } },
  })

  // Ne pas renvoyer le hash de mot de passe de l'admin créé.
  const safePartner = {
    ...partner,
    users: partner.users.map(({ password, visiblePasswordEncrypted, ...u }) => u),
  }
  return NextResponse.json(safePartner, { status: 201 })
}
