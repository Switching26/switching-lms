import { DefaultSession } from "next-auth"

type UserRole = "SUPER_ADMIN" | "PARTNER_ADMIN" | "LEARNER"

declare module "next-auth" {
  interface User {
    role: UserRole
    firstName: string
    partnerId: string | null
    partnerName: string | null
    partnerSlug: string | null
    partnerColor: string | null
    partnerSecondaryColor: string | null
    partnerLogo: string | null
  }

  interface Session {
    user: {
      id: string
      role: UserRole
      firstName: string
      partnerId: string | null
      partnerName: string | null
      partnerSlug: string | null
      partnerColor: string | null
      partnerSecondaryColor: string | null
      partnerLogo: string | null
      realAdmin?: { userId: string; email: string; role?: UserRole; partnerId?: string | null }
      impersonating?: { userId: string; email: string; name: string; role: UserRole }
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole
    firstName: string
    partnerId: string | null
    partnerName: string | null
    partnerSlug: string | null
    partnerColor: string | null
    partnerSecondaryColor: string | null
    partnerLogo: string | null
    realAdmin?: { userId: string; email: string; role?: UserRole; partnerId?: string | null }
    impersonating?: { userId: string; email: string; name: string; role: UserRole }
  }
}
