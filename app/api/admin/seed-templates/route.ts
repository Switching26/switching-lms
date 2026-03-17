import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { EmailType } from "@prisma/client"

export const dynamic = "force-dynamic"

function emailButton(href: string, text: string): string {
  return `<table cellspacing="0" cellpadding="0" style="margin:20px auto"><tr><td align="center" style="border-radius:6px;background:{{couleur_principale}}"><a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px">${text}</a></td></tr></table>`
}

const HEADER = `<div style="background:{{couleur_principale}};padding:30px;text-align:center"><h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:bold;font-family:Arial,sans-serif">{{plateforme_nom}}</h1></div>`
const FOOTER = `<div style="background:#f5f5f5;padding:20px 30px;text-align:center;color:#999;font-size:12px;font-family:Arial,sans-serif">{{plateforme_nom}} · {{plateforme_url}}</div>`

const TEMPLATES: { name: string; type: EmailType; subject: string; htmlContent: string }[] = [
  // ─── TEMPLATE 1 — Lien d'activation ───
  {
    name: "Lien d'activation",
    type: "ACCOUNT_CREATED",
    subject: "Activez votre compte {{plateforme_nom}}",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden">
  ${HEADER}
  <div style="padding:40px 30px">
    <h2 style="color:#111;font-size:20px;margin-bottom:10px">Bienvenue {{prenom}} !</h2>
    <p style="color:#555;line-height:1.6">Votre compte a été créé sur <strong>{{plateforme_nom}}</strong>.</p>
    <p style="color:#555;line-height:1.6">Pour accéder à votre espace de formation, activez votre compte en créant votre mot de passe.</p>
    ${emailButton("{{lien_activation}}", "Activer mon compte")}
    <div style="background:#fff8e1;border-left:4px solid #ffc107;padding:12px 16px;border-radius:4px;margin-top:20px;font-size:13px;color:#555">
      ⏱ Ce lien est valable <strong>72 heures</strong>.
      Passé ce délai, contactez votre administrateur.
    </div>
    <p style="color:#555;line-height:1.6">Votre identifiant : <strong>{{email}}</strong></p>
  </div>
  ${FOOTER}
</div>
</body></html>`,
  },
  // ─── TEMPLATE 2 — Formation attribuée ───
  {
    name: "Formation attribuée",
    type: "FORMATION_ASSIGNED",
    subject: "Votre formation {{formation_titre}} est disponible",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden">
  ${HEADER}
  <div style="padding:40px 30px">
    <h2 style="color:#111;font-size:20px;margin-bottom:10px">Bonjour {{prenom}} !</h2>
    <p style="color:#555;line-height:1.6">Une nouvelle formation vous a été attribuée et est disponible dès maintenant.</p>
    <div style="background:#f9f9f9;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid {{couleur_principale}}">
      <h3 style="margin:0 0 8px;color:#111">{{formation_titre}}</h3>
      <p style="margin:0;color:#666;font-size:14px">{{formation_description}}</p>
    </div>
    <p style="color:#555;line-height:1.6">📅 Votre accès est valable jusqu'au : <strong>{{date_expiration}}</strong></p>
    ${emailButton("{{lien_connexion}}", "Commencer ma formation")}
  </div>
  ${FOOTER}
</div>
</body></html>`,
  },
  // ─── TEMPLATE 3 — Chapitre terminé ───
  {
    name: "Chapitre terminé",
    type: "CHAPTER_COMPLETED",
    subject: "Bravo {{prenom}} ! Chapitre {{chapitre_titre}} terminé",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden">
  ${HEADER}
  <div style="padding:40px 30px">
    <h2 style="color:#111;font-size:20px;margin-bottom:10px">Excellent travail {{prenom}} ! 🎉</h2>
    <p style="color:#555;line-height:1.6">Vous venez de terminer le chapitre <strong>{{chapitre_titre}}</strong> de la formation <strong>{{formation_titre}}</strong>.</p>
    <div style="background:#eee;border-radius:10px;height:10px;margin:16px 0">
      <div style="width:{{progression}}%;background:{{couleur_principale}};height:100%;border-radius:10px"></div>
    </div>
    <p style="font-size:13px;color:#888">Progression : <strong>{{progression}}%</strong></p>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:20px 0;border-left:4px solid {{couleur_principale}}">
      <p style="margin:0;color:#555;font-size:14px">➡️ Prochain chapitre : <strong>{{prochain_chapitre}}</strong></p>
    </div>
    ${emailButton("{{lien_connexion}}", "Continuer ma formation")}
  </div>
  ${FOOTER}
</div>
</body></html>`,
  },
  // ─── TEMPLATE 4 — Formation terminée ───
  {
    name: "Formation terminée",
    type: "FORMATION_COMPLETED",
    subject: "Félicitations {{prenom}} ! Vous avez terminé {{formation_titre}}",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden">
  ${HEADER}
  <div style="padding:40px 30px;text-align:center">
    <div style="font-size:48px;margin:0 0 16px">🏆</div>
    <h2 style="color:#111;font-size:22px;margin-bottom:10px">Félicitations {{prenom}} !</h2>
    <p style="color:#555;line-height:1.6">Vous avez terminé avec succès la formation<br><strong>{{formation_titre}}</strong></p>
    ${emailButton("{{lien_connexion}}", "Accéder à mon espace")}
  </div>
  ${FOOTER}
</div>
</body></html>`,
  },
  // ─── TEMPLATE 5 — Réinitialisation mot de passe ───
  {
    name: "Réinitialisation mot de passe",
    type: "PASSWORD_RESET",
    subject: "Réinitialisez votre mot de passe {{plateforme_nom}}",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden">
  ${HEADER}
  <div style="padding:40px 30px">
    <h2 style="color:#111;font-size:20px;margin-bottom:10px">Réinitialisation de mot de passe</h2>
    <p style="color:#555;line-height:1.6">Bonjour {{prenom}},</p>
    <p style="color:#555;line-height:1.6">Vous avez demandé à réinitialiser votre mot de passe sur <strong>{{plateforme_nom}}</strong>.</p>
    ${emailButton("{{lien_reinitialisation}}", "Réinitialiser mon mot de passe")}
    <div style="background:#fff3f3;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:4px;margin-top:20px;font-size:13px;color:#555">
      ⏱ Ce lien est valable <strong>1 heure</strong>.
      Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
    </div>
  </div>
  ${FOOTER}
</div>
</body></html>`,
  },
]

export async function GET() {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  let count = 0
  for (const tpl of TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: {
        id: (await prisma.emailTemplate.findFirst({
          where: { name: tpl.name, isDefault: true },
          select: { id: true },
        }))?.id || "nonexistent",
      },
      update: {
        subject: tpl.subject,
        htmlContent: tpl.htmlContent,
        type: tpl.type,
        isActive: true,
      },
      create: {
        name: tpl.name,
        type: tpl.type,
        subject: tpl.subject,
        htmlContent: tpl.htmlContent,
        isDefault: true,
        isActive: true,
      },
    })
    count++
  }

  return NextResponse.json({ success: true, count })
}
