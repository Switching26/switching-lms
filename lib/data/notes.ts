import { prisma } from "@/lib/prisma"

export async function getUserNotes(userId: string) {
  return prisma.note.findMany({
    where: { userId },
    include: { chapter: { include: { formation: true } } },
    orderBy: { chapter: { order: "asc" } },
  })
}

export async function upsertNote(userId: string, chapterId: string, content: string) {
  return prisma.note.upsert({
    where: { userId_chapterId: { userId, chapterId } },
    update: { content },
    create: { userId, chapterId, content },
  })
}
