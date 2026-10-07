import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { readFile } from "fs/promises"
import path from "path"
import { checkedConversation } from "../../../../_access"
import { messageFilesDir } from "../../../../_files"
import { readCorrection } from "@/components/messages/content"
import { TrainerAccessError } from "@/lib/trainer/access"
export const dynamic = "force-dynamic"
export async function GET(_req: Request, { params }: { params: { id: string; messageId: string } }) {
  const session = await auth()
  if (!session?.user) return new NextResponse("Non autorisé", { status: 401 })
  try {
    await checkedConversation(session.user, params.id)
    const message = await prisma.message.findFirst({ where: { id: params.messageId, conversationId: params.id } })
    const file = message ? readCorrection(message.content)?.file : null
    if (!file) return new NextResponse("Fichier introuvable", { status: 404 })
    const bytes = await readFile(path.join(messageFilesDir(), file.key))
    return new NextResponse(bytes, { headers: {
      "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    } })
  } catch (e) {
    if (e instanceof TrainerAccessError) return new NextResponse(e.message, { status: e.status })
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new NextResponse("Fichier introuvable", { status: 404 })
    throw e
  }
}
