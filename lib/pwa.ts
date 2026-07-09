import { existsSync } from "fs"
import { join } from "path"

// Le service statique public/ ne fonctionne pas en standalone Railway :
// toutes les icônes PWA passent par /api/files (même résolution de bases
// que la route — cwd standalone OU racine de l'app deux niveaux au-dessus).
function hasPublicFile(file: string): boolean {
  const bases = [process.cwd(), join(process.cwd(), "..", "..")]
  return bases.some((b) => existsSync(join(b, "public", file)))
}

/** URL du manifest PWA, brandé partenaire quand un slug est fourni. */
export function pwaManifestHref(slug?: string | null): string {
  return slug ? `/api/pwa/manifest?partner=${encodeURIComponent(slug)}` : "/api/pwa/manifest"
}

/** Icône Apple (écran d'accueil iOS) : version partenaire si elle existe. */
export function pwaAppleIconHref(slug?: string | null): string {
  if (slug && hasPublicFile(`apple-touch-icon-${slug}.png`)) {
    return `/api/files/apple-touch-icon-${slug}.png`
  }
  return "/api/files/apple-touch-icon.png"
}

/** Des icônes PWA dédiées ont-elles été générées pour ce partenaire ? */
export function pwaPartnerIconsExist(slug?: string | null): boolean {
  return !!slug && hasPublicFile(`pwa-icon-${slug}-512.png`)
}
