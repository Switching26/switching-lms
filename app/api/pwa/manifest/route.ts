import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pwaPartnerIconsExist } from "@/lib/pwa"

export const dynamic = "force-dynamic"

// Manifest PWA dynamique : sans paramètre → identité neutre de la plateforme ;
// avec ?partner=<slug> → nom, couleur et icônes du partenaire (l'app installée
// depuis /login?partner=cnfdi s'appelle CNFDI avec son logo). L'`id` distinct
// par partenaire permet d'installer plusieurs tenants côte à côte.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const slug = (url.searchParams.get("partner") || "").trim()

  const partner = slug
    ? await prisma.partner
        .findUnique({ where: { slug, isActive: true }, select: { name: true, primaryColor: true } })
        .catch(() => null)
    : null

  const suffix = partner && pwaPartnerIconsExist(slug) ? `-${slug}` : ""
  const startUrl = partner ? `/?partner=${encodeURIComponent(slug)}` : "/"

  const manifest = {
    id: startUrl,
    name: partner?.name ? `${partner.name} — Formation` : "Espace Formation",
    short_name: partner?.name || "Formation",
    description: "Accédez à vos formations directement depuis votre écran d'accueil.",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#FAF9F7",
    theme_color: partner?.primaryColor || "#18181B",
    lang: "fr",
    icons: [
      { src: `/api/files/pwa-icon${suffix}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/api/files/pwa-icon${suffix}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/api/files/pwa-icon${suffix}-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
