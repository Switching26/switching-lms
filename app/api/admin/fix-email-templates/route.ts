import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const NEW_HEADER = `<div style="background:{{couleur_principale}};padding:30px;text-align:center"><h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:bold;font-family:Arial,sans-serif">{{plateforme_nom}}</h1></div>`

// Button config per template type
const BUTTON_MAP: Record<string, { href: string; text: string }> = {
  ACCOUNT_CREATED: { href: "{{lien_activation}}", text: "Activer mon compte" },
  ACTIVATION_LINK: { href: "{{lien_activation}}", text: "Activer mon compte" },
  FORMATION_ASSIGNED: { href: "{{lien_connexion}}", text: "Commencer ma formation" },
  CHAPTER_COMPLETED: { href: "{{lien_connexion}}", text: "Continuer ma formation" },
  FORMATION_COMPLETED: { href: "{{lien_connexion}}", text: "Accéder à mon espace" },
  PASSWORD_RESET: { href: "{{lien_reinitialisation}}", text: "Réinitialiser mon mot de passe" },
  CUSTOM: { href: "{{lien_connexion}}", text: "Accéder à mon espace" },
}

function makeButton(href: string, text: string): string {
  return `<table cellspacing="0" cellpadding="0" style="margin:20px auto"><tr><td align="center" style="border-radius:6px;background:{{couleur_principale}}"><a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px">${text}</a></td></tr></table>`
}

function fixHeader(html: string): string {
  // Replace header div containing logo/h1 with new header
  // Pattern 1: <div class="header" style="background:...">...logo...h1...</div>
  let result = html.replace(
    /<div\s+class="header"[^>]*>[\s\S]*?<\/div>\s*(?=\s*<div\s+(?:class="body"|style))/gi,
    NEW_HEADER + "\n  "
  )
  // Pattern 2: inline style header without class
  result = result.replace(
    /<div\s+style="background:\{\{couleur_principale\}\};padding:30px;text-align:center">\s*(?:<img[^>]*>)?\s*<h1[^>]*>\{\{plateforme_nom\}\}<\/h1>\s*<\/div>/gi,
    NEW_HEADER
  )
  return result
}

function fixButtons(html: string, type: string): string {
  const btn = BUTTON_MAP[type]
  if (!btn) return html

  // Replace <a class="btn" ...>text</a> wrapped in optional <p> with table-based button
  let result = html.replace(
    /<p[^>]*>\s*<a\s+href="[^"]*"\s+class="btn"[^>]*>[\s\S]*?<\/a>\s*<\/p>/gi,
    makeButton(btn.href, btn.text)
  )
  // Also match bare <a class="btn"> not wrapped in <p>
  result = result.replace(
    /<a\s+href="[^"]*"\s+class="btn"[^>]*>[\s\S]*?<\/a>/gi,
    makeButton(btn.href, btn.text)
  )
  return result
}

export async function GET() {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const templates = await prisma.emailTemplate.findMany()
  let updated = 0

  for (const tpl of templates) {
    let html = tpl.htmlContent

    // Fix header
    const afterHeader = fixHeader(html)

    // Fix buttons
    const afterButtons = fixButtons(afterHeader, tpl.type)

    if (afterButtons !== html) {
      await prisma.emailTemplate.update({
        where: { id: tpl.id },
        data: { htmlContent: afterButtons },
      })
      updated++
      console.log(`[FIX-TEMPLATES] Updated: ${tpl.name} (${tpl.type}, id=${tpl.id})`)
    }
  }

  return NextResponse.json({ success: true, updated })
}
