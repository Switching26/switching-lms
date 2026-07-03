type SectionLike = {
  id: string
  order: number
}

type ChapterLike = {
  id?: string
  title?: string
  order: number
  sectionId?: string | null
  section?: SectionLike | null
}

export function sortChaptersByLearningOrder<T extends ChapterLike>(
  chapters: T[],
  sections: SectionLike[] = []
): T[] {
  const sectionOrder = new Map<string, number>()
  sections.forEach((section) => sectionOrder.set(section.id, section.order))
  chapters.forEach((chapter) => {
    if (chapter.section) sectionOrder.set(chapter.section.id, chapter.section.order)
  })

  return chapters.slice().sort((a, b) => {
    const sectionA = a.sectionId ? sectionOrder.get(a.sectionId) ?? Number.MAX_SAFE_INTEGER : -1
    const sectionB = b.sectionId ? sectionOrder.get(b.sectionId) ?? Number.MAX_SAFE_INTEGER : -1
    if (sectionA !== sectionB) return sectionA - sectionB
    if (a.order !== b.order) return a.order - b.order
    return `${a.title || ""}${a.id || ""}`.localeCompare(`${b.title || ""}${b.id || ""}`, "fr")
  })
}

export function withSortedFormationChapters<T extends { formation: { chapters: any[]; sections?: SectionLike[] } }>(
  item: T
): T {
  item.formation.chapters = sortChaptersByLearningOrder(item.formation.chapters, item.formation.sections || [])
  return item
}
