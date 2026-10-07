import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authConfig } from "@/lib/auth.config"

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Le jeton de session vit 30 jours et ne portait que le rôle : un apprenant
    // archivé ou désactivé gardait vidéos et documents jusqu'à son expiration
    // (constaté en production le 29/09/2026). On revérifie le compte à chaque
    // lecture de session côté serveur ; un compte archivé, désactivé ou supprimé
    // perd sa session immédiatement (null = session effacée).
    // Pendant une visualisation (« Voir l'espace »), c'est le compte de l'ADMIN qui
    // compte, pas celui de l'apprenant : un admin doit pouvoir regarder l'espace d'un
    // invité qui n'a pas encore activé son compte.
    // Ne vit qu'ici (runtime Node) : le middleware Edge garde authConfig sans base.
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params)
      const compteId = (token.realAdmin as { userId?: string } | undefined)?.userId || token.sub
      if (!compteId) return token
      const compte = await prisma.user.findUnique({
        where: { id: compteId },
        select: { isActive: true, archivedAt: true },
      })
      if (!compte || !compte.isActive || compte.archivedAt) return null
      return token
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { partner: true },
        })

        if (!user) {
          return null
        }

        if (!user.isActive || user.archivedAt) {
          throw new Error("ACCOUNT_DISABLED")
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          user.password
        )

        if (!isPasswordValid) {
          return null
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        void prisma.loginLog.create({
          data: {
            userId: user.id,
          },
        }).catch((err) => {
          console.error("[AUTH] Failed to write login log:", err?.message || err)
        })

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          firstName: user.firstName,
          role: user.role,
          partnerId: user.partnerId,
          partnerName: user.partner?.name || null,
          partnerSlug: user.partner?.slug || null,
          partnerColor: user.partner?.primaryColor || null,
          partnerSecondaryColor: user.partner?.secondaryColor || null,
          partnerLogo: user.partner?.logoUrl || null,
        }
      },
    }),
  ],
})
