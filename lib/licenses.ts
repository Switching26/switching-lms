import { prisma } from "@/lib/prisma"

/**
 * Recalcule `usedSeats` d'une licence à partir du nombre RÉEL d'inscriptions
 * du partenaire sur la formation. Idempotent : appelé après toute création /
 * suppression d'inscription, le compteur ne peut plus dériver (il était
 * seulement incrémenté, jamais décrémenté → licences bloquées « pleines »).
 */
export async function recomputeLicenseSeats(
  partnerId: string | null | undefined,
  formationId: string
): Promise<void> {
  if (!partnerId) return
  const license = await prisma.license.findUnique({
    where: { partnerId_formationId: { partnerId, formationId } },
  })
  if (!license) return
  const count = await prisma.enrollment.count({
    where: { formationId, user: { partnerId } },
  })
  if (count !== license.usedSeats) {
    await prisma.license.update({
      where: { id: license.id },
      data: { usedSeats: count },
    })
  }
}

/**
 * Recalcule toutes les licences d'un partenaire pour une liste de formations
 * (utile quand un utilisateur multi-inscriptions est supprimé/désinscrit).
 */
export async function recomputeLicensesForFormations(
  partnerId: string | null | undefined,
  formationIds: string[]
): Promise<void> {
  if (!partnerId) return
  const unique = Array.from(new Set(formationIds))
  for (const fid of unique) {
    await recomputeLicenseSeats(partnerId, fid)
  }
}

/**
 * Ce partenaire a-t-il le DROIT de distribuer cette formation ?
 *
 * Complémentaire de `hasAvailableSeat` (qui, lui, ne gère que le quota) :
 * l'existence d'une licence vaut autorisation de distribution. Sans licence,
 * un admin partenaire ne voit pas la formation dans son catalogue et ne peut
 * pas l'attribuer, même si des sièges seraient théoriquement libres.
 *
 * `partnerId` null = super-admin / apprenants internes Switching → jamais
 * restreint. Ne s'applique qu'aux inscriptions créées : les inscriptions
 * existantes ne sont pas revalidées rétroactivement.
 */
export async function canPartnerDistributeFormation(
  partnerId: string | null | undefined,
  formationId: string
): Promise<boolean> {
  if (!partnerId) return true
  // L'organisme interne (Switching) n'est pas soumis aux licences.
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { isInternal: true },
  })
  if (partner?.isInternal) return true

  const license = await prisma.license.findUnique({
    where: { partnerId_formationId: { partnerId, formationId } },
    select: { id: true },
  })
  return Boolean(license)
}

/**
 * Un nouveau siège est-il disponible pour ce partenaire sur cette formation ?
 * - pas de partenaire → pas de limite ;
 * - pas de licence configurée → non restreint (décision super-admin) ;
 * - licence illimitée → toujours OK ;
 * - sinon compare le nombre réel d'inscriptions à totalSeats.
 */
export async function hasAvailableSeat(
  partnerId: string | null | undefined,
  formationId: string
): Promise<boolean> {
  if (!partnerId) return true
  const license = await prisma.license.findUnique({
    where: { partnerId_formationId: { partnerId, formationId } },
  })
  if (!license) return true
  if (license.isUnlimited) return true
  const count = await prisma.enrollment.count({
    where: { formationId, user: { partnerId } },
  })
  return count < license.totalSeats
}
