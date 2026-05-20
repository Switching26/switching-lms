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
      <div className="min-h-screen flex items-center justify-center bg-surface-subtle px-4">
        <p className="text-sm text-ink-50">Chargement…</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
