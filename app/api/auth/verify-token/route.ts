import { NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/tokens"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  const type = req.nextUrl.searchParams.get("type") as "ACTIVATION" | "RESET" | null

  if (!token || !type) {
    return NextResponse.json({ valid: false, error: "Paramètres manquants" })
  }

  const result = await verifyToken(token, type)

  if (result.valid) {
    return NextResponse.json({
      valid: true,
      firstName: result.record.user.firstName,
    })
  }

  return NextResponse.json({ valid: false, error: result.error })
}
