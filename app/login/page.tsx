import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import LoginForm from "./login-form"

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const { partner: slug } = await searchParams
  const partner = slug
    ? await prisma.partner.findUnique({
        where: { slug },
        select: { name: true, logoUrl: true, faviconUrl: true },
      })
    : null
  const faviconIcon = partner?.faviconUrl || partner?.logoUrl || "/favicon.svg"
  return {
    title: `Connexion · ${partner?.name || "LMS"}`,
    icons: {
      icon: faviconIcon,
      apple: faviconIcon,
    },
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted px-4">
        <div className="w-full max-w-[380px] bg-white rounded-2xl p-6 sm:p-8 border border-border text-center">
          <p className="text-sm text-gray-400">Chargement...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
