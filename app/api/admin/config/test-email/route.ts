import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendSystemTestEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const { email } = await req.json()
  if (!email) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 })
  }

  // Debug: log all SystemConfig rows
  const configs = await prisma.systemConfig.findMany()
  console.log("[TEST-EMAIL] Toutes les configs:", JSON.stringify(configs.map(c => ({ key: c.key, valueLen: c.value?.length }))))
  const brevoKey = configs.find(c => c.key === "brevo_api_key")?.value
  console.log("[TEST-EMAIL] Brevo API key trouvée:", brevoKey ? "OUI - longueur: " + brevoKey.length : "NON - undefined")

  const result = await sendSystemTestEmail(email)

  if (result.success) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: result.error }, { status: 400 })
}
