/**
 * Gardes d'accès à un chapitre de simulation — UNE seule implémentation.
 *
 * Ces règles vivaient dans `app/api/simulations/[chapterId]/route.ts`, et la
 * route de correction `verify` en avait sa propre copie, plus courte : elle
 * vérifiait la publication et l'inscription, mais ni l'expiration de l'accès ni
 * sa date d'ouverture. Tant que le navigateur corrigeait lui-même, cet écart ne
 * se voyait pas — `verify` n'était appelée par personne. Depuis que la
 * correction d'une évaluation notée passe par elle, deux jeux de gardes pour la
 * même ressource sont un défaut : un accès expiré pouvait encore faire corriger
 * ses réponses.
 *
 * Un chapitre de simulation n'est pas plus public qu'une vidéo : mêmes gardes
 * que `/api/progress/[chapterId]`.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

type Chapitre = NonNullable<Awaited<ReturnType<typeof chargerChapitre>>>

function chargerChapitre(chapterId: string) {
  return prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { simulation: true },
  })
}

export type ContexteSimulation =
  | { error: NextResponse }
  | { chapter: Chapitre; simulation: NonNullable<Chapitre["simulation"]> }

/**
 * @param superAdmin Contournement de RELECTURE, réservé à la lecture et à la
 *   correction : un super-admin doit pouvoir jouer son propre atelier avant
 *   publication. Sans lui, l'aperçu de l'espace admin échouait deux fois — le
 *   chapitre n'étant pas publié et l'admin n'étant pas inscrit. Il ne donne
 *   jamais le droit d'écrire une progression : le PUT ne le passe pas.
 */
export async function chargerContexteSimulation(
  chapterId: string,
  userId: string,
  superAdmin = false,
): Promise<ContexteSimulation> {
  const chapter = await chargerChapitre(chapterId)
  if (!chapter) {
    return { error: NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 }) }
  }
  if (!chapter.isPublished && !superAdmin) {
    return { error: NextResponse.json({ error: "Chapitre non publié" }, { status: 403 }) }
  }
  if (!chapter.simulation) {
    return { error: NextResponse.json({ error: "Ce chapitre ne porte pas de simulation" }, { status: 404 }) }
  }

  // L'aperçu admin s'arrête ici : pas d'inscription à vérifier.
  if (superAdmin) return { chapter, simulation: chapter.simulation }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_formationId: { userId, formationId: chapter.formationId } },
  })
  if (!enrollment) {
    return { error: NextResponse.json({ error: "Non inscrit à cette formation" }, { status: 403 }) }
  }
  const now = new Date()
  if (enrollment.expiresAt && enrollment.expiresAt < now) {
    return { error: NextResponse.json({ error: "Accès expiré" }, { status: 403 }) }
  }
  if (enrollment.startedAt && enrollment.startedAt > now) {
    return { error: NextResponse.json({ error: "Accès pas encore ouvert" }, { status: 403 }) }
  }

  return { chapter, simulation: chapter.simulation }
}
