import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decryptVisiblePassword } from "@/lib/visible-password"

function jsonNoStore(body: Record<string, any>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await auth()
  const role = session?.user?.role
  if (!session || (role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN")) {
    return jsonNoStore({ error: "Accès refusé" }, 403)
  }

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      partnerId: true,
      visiblePasswordEncrypted: true,
    },
  })

  if (!target) {
    return jsonNoStore({ error: "Utilisateur introuvable" }, 404)
  }

  if (role === "PARTNER_ADMIN" && target.partnerId !== session.user.partnerId) {
    return jsonNoStore({ error: "Accès refusé" }, 403)
  }

  const password = decryptVisiblePassword(target.visiblePasswordEncrypted)
  if (!password) {
    return jsonNoStore({
      available: false,
      reason: "Aucun mot de passe lisible n'a encore été enregistré pour ce compte.",
    })
  }

  return jsonNoStore({ available: true, password })
}
