import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { EmailType } from "@prisma/client"

export const dynamic = "force-dynamic"

const TEMPLATES: { name: string; type: EmailType; subject: string; htmlContent: string }[] = [
  // ─── TEMPLATE 1 — Lien d'activation ───
  {
    name: "Lien d'activation",
    type: "ACCOUNT_CREATED",
    subject: "Activez votre compte {{plateforme_nom}}",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
.container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
.header{padding:30px;text-align:center}
.header h1{color:#fff;margin:0;font-size:22px}
.header img{max-height:50px;max-width:200px}
.body{padding:40px 30px}
.body h2{color:#111;font-size:20px;margin-bottom:10px}
.body p{color:#555;line-height:1.6}
.btn{display:inline-block;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin:20px 0}
.warning{background:#fff8e1;border-left:4px solid #ffc107;padding:12px 16px;border-radius:4px;margin-top:20px;font-size:13px;color:#555}
.footer{background:#f5f5f5;padding:20px 30px;text-align:center;color:#999;font-size:12px}
</style></head><body>
<div class="container">
  <div class="header" style="background:{{couleur_principale}}">
    {{logo_url}}
    <h1 style="color:#fff;{{logo_url_style}}">{{plateforme_nom}}</h1>
  </div>
  <div class="body">
    <h2>Bienvenue {{prenom}} !</h2>
    <p>Votre compte a été créé sur <strong>{{plateforme_nom}}</strong>.</p>
    <p>Pour accéder à votre espace de formation, activez votre compte en créant votre mot de passe.</p>
    <p style="text-align:center">
      <a href="{{lien_activation}}" class="btn" style="background:{{couleur_principale}}">
        Activer mon compte
      </a>
    </p>
    <div class="warning">
      ⏱ Ce lien est valable <strong>72 heures</strong>.
      Passé ce délai, contactez votre administrateur.
    </div>
    <p>Votre identifiant : <strong>{{email}}</strong></p>
  </div>
  <div class="footer">{{plateforme_nom}} · {{plateforme_url}}</div>
</div>
</body></html>`,
  },
  // ─── TEMPLATE 2 — Formation attribuée ───
  {
    name: "Formation attribuée",
    type: "FORMATION_ASSIGNED",
    subject: "Votre formation {{formation_titre}} est disponible",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
.container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
.header{padding:30px;text-align:center}
.header h1{color:#fff;margin:0;font-size:22px}
.header img{max-height:50px;max-width:200px}
.body{padding:40px 30px}
.body h2{color:#111;font-size:20px;margin-bottom:10px}
.body p{color:#555;line-height:1.6}
.formation-card{background:#f9f9f9;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid}
.formation-card h3{margin:0 0 8px;color:#111}
.formation-card p{margin:0;color:#666;font-size:14px}
.btn{display:inline-block;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin:20px 0}
.footer{background:#f5f5f5;padding:20px 30px;text-align:center;color:#999;font-size:12px}
</style></head><body>
<div class="container">
  <div class="header" style="background:{{couleur_principale}}">
    {{logo_url}}
    <h1 style="color:#fff;{{logo_url_style}}">{{plateforme_nom}}</h1>
  </div>
  <div class="body">
    <h2>Bonjour {{prenom}} !</h2>
    <p>Une nouvelle formation vous a été attribuée et est disponible dès maintenant.</p>
    <div class="formation-card" style="border-left-color:{{couleur_principale}}">
      <h3>{{formation_titre}}</h3>
      <p>{{formation_description}}</p>
    </div>
    <p>📅 Votre accès est valable jusqu'au : <strong>{{date_expiration}}</strong></p>
    <p style="text-align:center">
      <a href="{{lien_connexion}}" class="btn" style="background:{{couleur_principale}}">
        Commencer ma formation
      </a>
    </p>
  </div>
  <div class="footer">{{plateforme_nom}} · {{plateforme_url}}</div>
</div>
</body></html>`,
  },
  // ─── TEMPLATE 3 — Chapitre terminé ───
  {
    name: "Chapitre terminé",
    type: "CHAPTER_COMPLETED",
    subject: "Bravo {{prenom}} ! Chapitre {{chapitre_titre}} terminé",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
.container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
.header{padding:30px;text-align:center}
.header h1{color:#fff;margin:0;font-size:22px}
.body{padding:40px 30px}
.body h2{color:#111;font-size:20px;margin-bottom:10px}
.body p{color:#555;line-height:1.6}
.progress-bar{background:#eee;border-radius:10px;height:10px;margin:16px 0}
.next-chapter{background:#f9f9f9;border-radius:8px;padding:16px;margin:20px 0;border-left:4px solid}
.next-chapter p{margin:0;color:#555;font-size:14px}
.btn{display:inline-block;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin:20px 0}
.footer{background:#f5f5f5;padding:20px 30px;text-align:center;color:#999;font-size:12px}
</style></head><body>
<div class="container">
  <div class="header" style="background:{{couleur_principale}}">
    {{logo_url}}
    <h1 style="color:#fff;{{logo_url_style}}">{{plateforme_nom}}</h1>
  </div>
  <div class="body">
    <h2>Excellent travail {{prenom}} ! 🎉</h2>
    <p>Vous venez de terminer le chapitre <strong>{{chapitre_titre}}</strong> de la formation <strong>{{formation_titre}}</strong>.</p>
    <div class="progress-bar">
      <div style="width:{{progression}}%;background:{{couleur_principale}};height:100%;border-radius:10px"></div>
    </div>
    <p style="font-size:13px;color:#888">Progression : <strong>{{progression}}%</strong></p>
    <div class="next-chapter" style="border-left-color:{{couleur_principale}}">
      <p>➡️ Prochain chapitre : <strong>{{prochain_chapitre}}</strong></p>
    </div>
    <p style="text-align:center">
      <a href="{{lien_connexion}}" class="btn" style="background:{{couleur_principale}}">
        Continuer ma formation
      </a>
    </p>
  </div>
  <div class="footer">{{plateforme_nom}} · {{plateforme_url}}</div>
</div>
</body></html>`,
  },
  // ─── TEMPLATE 4 — Formation terminée ───
  {
    name: "Formation terminée",
    type: "FORMATION_COMPLETED",
    subject: "Félicitations {{prenom}} ! Vous avez terminé {{formation_titre}}",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
.container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
.header{padding:40px 30px;text-align:center}
.header h1{color:#fff;margin:0 0 8px;font-size:22px}
.header p{color:rgba(255,255,255,0.7);margin:0;font-size:14px}
.body{padding:40px 30px;text-align:center}
.trophy{font-size:48px;margin:0 0 16px}
.body h2{color:#111;font-size:22px;margin-bottom:10px}
.body p{color:#555;line-height:1.6}
.btn{display:inline-block;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin:20px 0}
.footer{background:#f5f5f5;padding:20px 30px;text-align:center;color:#999;font-size:12px}
</style></head><body>
<div class="container">
  <div class="header" style="background:{{couleur_principale}}">
    {{logo_url}}
    <h1 style="color:#fff;{{logo_url_style}}">{{plateforme_nom}}</h1>
    <p>Certificat de complétion</p>
  </div>
  <div class="body">
    <div class="trophy">🏆</div>
    <h2>Félicitations {{prenom}} !</h2>
    <p>Vous avez terminé avec succès la formation<br><strong>{{formation_titre}}</strong></p>
    <a href="{{lien_connexion}}" class="btn" style="background:{{couleur_principale}}">
      Accéder à mon espace
    </a>
  </div>
  <div class="footer">{{plateforme_nom}} · {{plateforme_url}}</div>
</div>
</body></html>`,
  },
  // ─── TEMPLATE 5 — Réinitialisation mot de passe ───
  {
    name: "Réinitialisation mot de passe",
    type: "PASSWORD_RESET",
    subject: "Réinitialisez votre mot de passe {{plateforme_nom}}",
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
.container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
.header{padding:30px;text-align:center}
.header h1{color:#fff;margin:0;font-size:22px}
.body{padding:40px 30px}
.body h2{color:#111;font-size:20px;margin-bottom:10px}
.body p{color:#555;line-height:1.6}
.btn{display:inline-block;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin:20px 0}
.warning{background:#fff3f3;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:4px;margin-top:20px;font-size:13px;color:#555}
.footer{background:#f5f5f5;padding:20px 30px;text-align:center;color:#999;font-size:12px}
</style></head><body>
<div class="container">
  <div class="header" style="background:{{couleur_principale}}">
    {{logo_url}}
    <h1 style="color:#fff;{{logo_url_style}}">{{plateforme_nom}}</h1>
  </div>
  <div class="body">
    <h2>Réinitialisation de mot de passe</h2>
    <p>Bonjour {{prenom}},</p>
    <p>Vous avez demandé à réinitialiser votre mot de passe sur <strong>{{plateforme_nom}}</strong>.</p>
    <p style="text-align:center">
      <a href="{{lien_reinitialisation}}" class="btn" style="background:{{couleur_principale}}">
        Réinitialiser mon mot de passe
      </a>
    </p>
    <div class="warning">
      ⏱ Ce lien est valable <strong>1 heure</strong>.
      Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
    </div>
  </div>
  <div class="footer">{{plateforme_nom}} · {{plateforme_url}}</div>
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
