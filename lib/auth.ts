import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { prisma } from "@/lib/prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
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

        if (!user || !user.isActive) {
          return null
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

        await prisma.loginLog.create({
          data: {
            userId: user.id,
          },
        })

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          partnerId: user.partnerId,
          partnerName: user.partner?.name || null,
          partnerSlug: user.partner?.slug || null,
          partnerColor: user.partner?.primaryColor || null,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.partnerId = (user as any).partnerId
        token.partnerName = (user as any).partnerName
        token.partnerSlug = (user as any).partnerSlug
        token.partnerColor = (user as any).partnerColor
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        ;(session.user as any).role = token.role
        ;(session.user as any).partnerId = token.partnerId
        ;(session.user as any).partnerName = token.partnerName
        ;(session.user as any).partnerSlug = token.partnerSlug
        ;(session.user as any).partnerColor = token.partnerColor
      }
      return session
    },
  },
})
