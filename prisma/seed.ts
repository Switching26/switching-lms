import { PrismaClient, Role } from "@prisma/client"
import { hash } from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database...")

  // Create partner
  const partner = await prisma.partner.upsert({
    where: { slug: "cyberformation" },
    update: {},
    create: {
      name: "CyberFormation Pro",
      slug: "cyberformation",
      primaryColor: "#6C3BFF",
      secondaryColor: "#FFFFFF",
      isActive: true,
    },
  })

  console.log("Partner created:", partner.name)

  // Create super admin
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@switching-formation.fr" },
    update: {},
    create: {
      email: "admin@switching-formation.fr",
      password: await hash("Admin1234!", 12),
      firstName: "Super",
      lastName: "Admin",
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  })

  console.log("Super admin created:", superAdmin.email)

  // Create partner admin
  const partnerAdmin = await prisma.user.upsert({
    where: { email: "admin@cyberformation.fr" },
    update: {},
    create: {
      email: "admin@cyberformation.fr",
      password: await hash("Partner1234!", 12),
      firstName: "Marie",
      lastName: "Dupont",
      role: Role.PARTNER_ADMIN,
      partnerId: partner.id,
      isActive: true,
    },
  })

  console.log("Partner admin created:", partnerAdmin.email)

  // Create learners
  const learner1 = await prisma.user.upsert({
    where: { email: "apprenant@switching-formation.fr" },
    update: {},
    create: {
      email: "apprenant@switching-formation.fr",
      password: await hash("Learner1234!", 12),
      firstName: "Jean",
      lastName: "Martin",
      role: Role.LEARNER,
      isActive: true,
    },
  })

  console.log("Learner 1 created:", learner1.email)

  const learner2 = await prisma.user.upsert({
    where: { email: "apprenant@cyberformation.fr" },
    update: {},
    create: {
      email: "apprenant@cyberformation.fr",
      password: await hash("Learner1234!", 12),
      firstName: "Sophie",
      lastName: "Bernard",
      role: Role.LEARNER,
      partnerId: partner.id,
      isActive: true,
    },
  })

  console.log("Learner 2 created:", learner2.email)

  // Create formation with chapters
  const formation = await prisma.formation.upsert({
    where: { id: "formation-intro-cybersecurite" },
    update: {},
    create: {
      id: "formation-intro-cybersecurite",
      title: "Introduction à la Cybersécurité",
      description:
        "Apprenez les fondamentaux de la cybersécurité : menaces, bonnes pratiques et outils essentiels pour protéger vos systèmes.",
      isPublished: true,
    },
  })

  console.log("Formation created:", formation.title)

  const chaptersData = [
    {
      id: "chapitre-1-menaces",
      title: "Les menaces informatiques",
      description: "Découvrez les principales menaces qui pèsent sur les systèmes d'information.",
      order: 1,
      content:
        "Dans ce chapitre, nous aborderons les différents types de menaces : malwares, phishing, ransomware, attaques DDoS, et ingénierie sociale.",
      videoDuration: 1200,
      isPublished: true,
    },
    {
      id: "chapitre-2-bonnes-pratiques",
      title: "Les bonnes pratiques de sécurité",
      description: "Les gestes essentiels pour sécuriser votre environnement de travail.",
      order: 2,
      content:
        "Ce chapitre couvre les mots de passe robustes, l'authentification à deux facteurs, les mises à jour, et la sauvegarde des données.",
      videoDuration: 900,
      isPublished: true,
    },
    {
      id: "chapitre-3-outils",
      title: "Les outils de protection",
      description: "Présentation des outils indispensables pour la cybersécurité.",
      order: 3,
      content:
        "Nous verrons les antivirus, les pare-feu, les VPN, les gestionnaires de mots de passe et les outils de monitoring.",
      videoDuration: 1500,
      isPublished: true,
    },
  ]

  for (const chapterData of chaptersData) {
    await prisma.chapter.upsert({
      where: { id: chapterData.id },
      update: {},
      create: {
        ...chapterData,
        formationId: formation.id,
      },
    })
  }

  console.log("3 chapters created")

  // Create enrollments for learners
  await prisma.enrollment.upsert({
    where: {
      userId_formationId: {
        userId: learner1.id,
        formationId: formation.id,
      },
    },
    update: {},
    create: {
      userId: learner1.id,
      formationId: formation.id,
    },
  })

  await prisma.enrollment.upsert({
    where: {
      userId_formationId: {
        userId: learner2.id,
        formationId: formation.id,
      },
    },
    update: {},
    create: {
      userId: learner2.id,
      formationId: formation.id,
      assignedByPartnerId: partner.id,
    },
  })

  console.log("Enrollments created")

  // Create license for partner
  await prisma.license.upsert({
    where: {
      partnerId_formationId: {
        partnerId: partner.id,
        formationId: formation.id,
      },
    },
    update: {},
    create: {
      partnerId: partner.id,
      formationId: formation.id,
      totalSeats: 50,
      usedSeats: 1,
    },
  })

  console.log("License created")
  console.log("Seeding complete!")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
