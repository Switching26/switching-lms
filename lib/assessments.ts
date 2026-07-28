import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import type { AssessmentQuestionType } from "@prisma/client"

/**
 * Token du lien public /evaluation/<token>.
 *
 * C'est la SEULE authentification du candidat : il doit donc être imprévisible.
 * 32 octets aléatoires cryptographiques en base64url — pas de `Math.random`,
 * pas de cuid (séquentiel et devinable par voisinage).
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url")
}

export interface SubmittedAnswer {
  questionId: string
  selectedChoiceIds?: string[]
  responseText?: string
  scaleValue?: number
}

type QuestionForGrading = {
  id: string
  type: AssessmentQuestionType
  points: number
  choices: { id: string; isCorrect: boolean }[]
}

export interface GradedAnswer {
  questionId: string
  selectedChoiceIds: string[]
  responseText: string | null
  scaleValue: number | null
  isCorrect: boolean | null
  pointsEarned: number | null
}

export interface GradingResult {
  answers: GradedAnswer[]
  score: number
  maxScore: number
  needsManualReview: boolean
}

/**
 * Correction côté serveur. Ne jamais faire confiance à un score calculé par le
 * client : le candidat n'est identifié que par un token de lien.
 *
 * Règles de notation :
 * - QCM_SINGLE : juste si l'unique choix coché est le bon ;
 * - QCM_MULTI  : tout-ou-rien — TOUTES les bonnes réponses et AUCUNE mauvaise
 *   (même convention que le moteur de quiz des formations, validée en prod) ;
 * - TEXTE      : jamais noté automatiquement, laissé à la correction manuelle
 *   (`isCorrect` null) et signalé par `needsManualReview` ;
 * - ECHELLE    : déclaratif, hors barème (un auto-positionnement n'a pas de
 *   bonne réponse).
 *
 * `maxScore` ne compte que les questions réellement notables, sinon un test de
 * positionnement fait d'échelles afficherait un score sur un total inatteignable.
 */
export function gradeAnswers(
  questions: QuestionForGrading[],
  submitted: SubmittedAnswer[]
): GradingResult {
  const byQuestion = new Map(submitted.map((a) => [a.questionId, a]))
  const answers: GradedAnswer[] = []
  let score = 0
  let maxScore = 0
  let needsManualReview = false

  for (const q of questions) {
    const given = byQuestion.get(q.id)
    const selected = Array.from(new Set(given?.selectedChoiceIds ?? []))
    const base: GradedAnswer = {
      questionId: q.id,
      selectedChoiceIds: selected,
      responseText: given?.responseText?.trim() || null,
      scaleValue: typeof given?.scaleValue === "number" ? given.scaleValue : null,
      isCorrect: null,
      pointsEarned: null,
    }

    if (q.type === "ECHELLE") {
      answers.push(base)
      continue
    }

    if (q.type === "TEXTE") {
      needsManualReview = true
      maxScore += q.points
      answers.push(base)
      continue
    }

    // QCM à 0 point : question déclarative (profilage, « pourquoi apprenez-vous
    // l'anglais ? »). Elle n'a pas de bonne réponse — la noter afficherait un
    // ✗ au candidat sur un choix personnel.
    if (q.points === 0) {
      answers.push(base)
      continue
    }

    // QCM : comparaison ensembliste stricte contre les bonnes réponses.
    maxScore += q.points
    const correctIds = q.choices.filter((c) => c.isCorrect).map((c) => c.id)
    const validIds = new Set(q.choices.map((c) => c.id))
    // Un choix inconnu (question modifiée entre-temps, payload forgé) ne doit
    // pas pouvoir valider la réponse.
    const cleaned = selected.filter((id) => validIds.has(id))

    const isCorrect =
      cleaned.length === correctIds.length &&
      correctIds.every((id) => cleaned.includes(id))

    base.selectedChoiceIds = cleaned
    base.isCorrect = isCorrect
    base.pointsEarned = isCorrect ? q.points : 0
    if (isCorrect) score += q.points
    answers.push(base)
  }

  return { answers, score, maxScore, needsManualReview }
}

/** Pourcentage arrondi, 0 si le test n'a aucune question notable. */
export function scorePercent(score: number | null, maxScore: number | null): number {
  if (!maxScore || maxScore <= 0 || score === null) return 0
  return Math.round((score / maxScore) * 100)
}

/**
 * Une invitation est-elle encore utilisable ?
 * Refuse une invitation déjà soumise (une seule passation) ou expirée.
 */
export function invitationState(inv: {
  submittedAt: Date | null
  expiresAt: Date | null
}): "ready" | "submitted" | "expired" {
  if (inv.submittedAt) return "submitted"
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) return "expired"
  return "ready"
}

/**
 * Évaluations visibles par un administrateur.
 * Super-admin : tout. Admin partenaire : seulement celles de son organisme —
 * même cloisonnement que le catalogue de formations.
 */
export async function assessmentScopeWhere(role: string, partnerId?: string | null) {
  if (role === "SUPER_ADMIN") return { deletedAt: null }
  if (partnerId) {
    // Même règle que le catalogue de formations : l'organisme interne
    // (Switching) accède à tout ce qui est produit sur la plateforme, sans
    // qu'on ait à lui ouvrir chaque contenu un par un.
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { isInternal: true },
    })
    if (partner?.isInternal) return { deletedAt: null }
  }
  return { deletedAt: null, partnerId: partnerId ?? "__none__" }
}

/**
 * Organisme interne (Switching), propriétaire par défaut de tout ce que le
 * super-admin crée sans préciser d'organisme : sans cela le contenu n'a aucun
 * propriétaire, n'apparaît pas côté Switching et s'affiche au candidat avec le
 * nom et la couleur par défaut au lieu de la marque.
 */
export async function getInternalPartnerId(): Promise<string | null> {
  const p = await prisma.partner.findFirst({
    where: { isInternal: true },
    select: { id: true },
  })
  return p?.id ?? null
}

/**
 * Charge une évaluation pour le passage candidat, SANS les bonnes réponses.
 * Le front reçoit exactement ce qu'il doit afficher : exposer `isCorrect`
 * permettrait de lire les réponses dans le HTML avant de répondre.
 */
export async function getAssessmentForCandidate(assessmentId: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      timeLimitMinutes: true,
      partner: { select: { name: true, slug: true, primaryColor: true, logoUrl: true } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          text: true,
          helpText: true,
          type: true,
          order: true,
          scaleMin: true,
          scaleMax: true,
          scaleMinLabel: true,
          scaleMaxLabel: true,
          choices: {
            orderBy: { order: "asc" },
            select: { id: true, text: true }, // isCorrect volontairement absent
          },
        },
      },
    },
  })
  return assessment
}

export interface LevelBand {
  min: number
  max: number
  level: string
  label?: string
  parcours?: string
}

/**
 * Traduit un score brut en niveau CECRL, à partir de la grille du test.
 *
 * Un pourcentage seul n'aide personne : ni le candidat, qui ne sait pas ce que
 * vaut « 68 % », ni Samuel, qui devrait retrouver la grille à chaque fois.
 */
export function levelForScore(
  bands: unknown,
  score: number | null | undefined
): LevelBand | null {
  if (!Array.isArray(bands) || score === null || score === undefined) return null
  const found = (bands as LevelBand[]).find(
    (b) => typeof b?.min === "number" && typeof b?.max === "number" && score >= b.min && score <= b.max
  )
  return found ?? null
}
