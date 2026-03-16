import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import LoginForm from "./login-form"

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const { partner: slug } = await searchParams
  const partner = slug
    ? await prisma.partner.findUnique({
        where: { slug },
        select: { name: true, logoUrl: true },
      })
    : null
  return {
    title: `Connexion · ${partner?.name || "LMS"}`,
    icons: {
      icon: partner?.logoUrl || "/favicon.svg",
      apple: partner?.logoUrl || "/favicon.svg",
    },
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="w-full max-w-[380px] bg-white rounded-2xl p-8 border border-border text-center">
          <p className="text-sm text-gray-400">Chargement...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
