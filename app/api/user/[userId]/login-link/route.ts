import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getAdminLoginLinkUser } from "@/lib/admin-login-link"
import { buildLoginLinks, loginLinkMessage } from "@/lib/login-link"
import { getBaseUrl } from "@/lib/get-base-url"

export const dynamic = "force-dynamic"

// Read-only: no email, token, password access in the response, or database write.
export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  const session = await auth()
  if (session?.user.role === "PARTNER_ADMIN") {
    const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { role: true } })
    if (target?.role === "TRAINER") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }
  const result = await getAdminLoginLinkUser(session?.user, params.userId)
  const headers = { "Cache-Control": "private, no-store" }
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status, headers })
  const { user } = result
  const organisation = user.partner?.name || "Switching Formation"
  const { loginUrl } = buildLoginLinks(getBaseUrl(), user.partner?.slug)
  return NextResponse.json({
    loginUrl, organisation,
    firstName: user.firstName, lastName: user.lastName, email: user.email,
    message: loginLinkMessage(user, organisation, loginUrl),
  }, { headers })
}
