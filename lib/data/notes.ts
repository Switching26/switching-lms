import { prisma } from "@/lib/prisma"
export async function getUserNotes(userId: string) {
  const notes = await prisma.note.findMany({
    where: { userId },
    include: {
      chapter: {
        include: {
          section: true,
          formation: { include: { sections: { orderBy: { order: "asc" } } } },
        },
      },
    },
  })
  return notes.slice().sort((a, b) => {
    if (a.chapter.formation.title !== b.chapter.formation.title) {
      return a.chapter.formation.title.localeCompare(b.chapter.formation.title, "fr")
    }
    const sectionA = a.chapter.sectionId ? a.chapter.section?.order ?? Number.MAX_SAFE_INTEGER : -1
    const sectionB = b.chapter.sectionId ? b.chapter.section?.order ?? Number.MAX_SAFE_INTEGER : -1
    if (sectionA !== sectionB) return sectionA - sectionB
    if (a.chapter.order !== b.chapter.order) return a.chapter.order - b.chapter.order
    return a.chapter.title.localeCompare(b.chapter.title, "fr")
  })
}

// Notes d'un apprenant pour une formation donnée (player : préchargement par chapitre)
export async function getUserNotesForFormation(userId: string, formationId: string) {
  return prisma.note.findMany({
    where: { userId, chapter: { formationId } },
    select: { chapterId: true, content: true },
  })
}

export async function upsertNote(userId: string, chapterId: string, content: string) {
  return prisma.note.upsert({
    where: { userId_chapterId: { userId, chapterId } },
    update: { content },
    create: { userId, chapterId, content },
  })
}
