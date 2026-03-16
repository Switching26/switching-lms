import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: "SUPER_ADMIN" | "PARTNER_ADMIN" | "LEARNER"
      partnerId: string | null
      partnerName: string | null
      partnerSlug: string | null
      partnerColor: string | null
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "SUPER_ADMIN" | "PARTNER_ADMIN" | "LEARNER"
    partnerId: string | null
    partnerName: string | null
    partnerSlug: string | null
    partnerColor: string | null
  }
}
