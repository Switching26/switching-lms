import "./globals.css"
import Providers from "@/components/Providers"
import PwaInstallBanner from "@/components/PwaInstallBanner"

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
    <html lang="fr">
      <head>
        <meta name="theme-color" content="#18181B" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <PwaInstallBanner />
      </body>
    </html>
  )
}
