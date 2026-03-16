import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt" as const,
  },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role
        token.partnerId = user.partnerId
        token.partnerName = user.partnerName
        token.partnerSlug = user.partnerSlug
        token.partnerColor = user.partnerColor
      }
      return token
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.role = token.role
        session.user.partnerId = token.partnerId
        session.user.partnerName = token.partnerName
        session.user.partnerSlug = token.partnerSlug
        session.user.partnerColor = token.partnerColor
      }
      return session
    },
  },
} satisfies NextAuthConfig
