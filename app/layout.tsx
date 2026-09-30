import "./globals.css"
import "./fluid.css"
import localFont from "next/font/local"
import Providers from "@/components/Providers"
import PwaInstallBanner from "@/components/PwaInstallBanner"

const geist = localFont({ src: [
  { path: "./fonts/Geist-400.woff", weight: "400" },
  { path: "./fonts/Geist-500.woff", weight: "500" },
  { path: "./fonts/Geist-600.woff", weight: "600" },
  { path: "./fonts/Geist-700.woff", weight: "700" },
], variable: "--font-geist", display: "swap" })

export const metadata = {
  title: "Switching LMS",
  description: "Plateforme de formation",
  // PWA : manifest par défaut (les pages login/learner le surchargent avec la
  // version brandée partenaire via ?partner=<slug>)
  manifest: "/api/pwa/manifest",
  appleWebApp: {
    capable: true,
    title: "Formation",
    statusBarStyle: "default" as const,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    // iOS exige un PNG opaque pour l'écran d'accueil (le SVG est ignoré)
    apple: "/api/files/apple-touch-icon.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={geist.variable}>
      <head>
        <meta name="theme-color" content="#18181B" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <PwaInstallBanner />
      </body>
    </html>
  )
}
