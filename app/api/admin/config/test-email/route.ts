import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
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

  const result = await sendSystemTestEmail(email)

  if (result.success) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: result.error }, { status: 400 })
}
