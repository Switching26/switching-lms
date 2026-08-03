/**
 * Les deux ajouts de « Mes résultats » : le plan de révision de la formation, et
 * le bilan par compétence replié sous chaque évaluation.
 *
 * Composants PRÉSENTATIONNELS, sans accès aux données : la page apprenant reste
 * le seul endroit qui interroge la base. Les sortir du fichier de page permet
 * aussi de les rendre hors session — c'est ce dont la vérification navigateur a
 * besoin pour mesurer une mise en page sur du vrai code plutôt que sur une
 * maquette qui lui ressemble.
 *
 * ⚠️ AUCUNE CORRECTION N'EST AFFICHÉE ICI. Ces blocs ne portent que des
 * intitulés de capacité, des points et des titres de chapitre. La règle est
 * tenue en amont : `check-remediation.ts` (A14) refuse un intitulé qui citerait
 * une formule ou une cellule, et `check-bilan-api.ts` confronte le bilan publié
 * à toutes les réponses des 27 scénarios.
 */

import Link from "next/link"
import type { BilanPublie } from "@/lib/simulation/bilan"

const ETIQUETTE_STATUT = {
  "a-revoir": { texte: "à revoir", classe: "bg-rose-50 text-rose-700" },
  fragile: { texte: "fragile", classe: "bg-amber-50 text-amber-700" },
  acquis: { texte: "acquis", classe: "bg-emerald-50 text-emerald-700" },
} as const

export type LignePlan = {
  cle: string
  titre: string
  enonce?: string
  pointsPerdus: number
  chapterId: string
  titreEvaluation: string
  revoir: Array<{ chapterId: string; titre: string }>
}

/**
 * « À revoir en priorité sur cette formation » — trois lignes au maximum.
 *
 * Chaque ligne reste rattachée à SON évaluation d'origine : deux modules qui
 * déclarent une compétence de même identifiant décrivent deux notions
 * différentes, et les fusionner inventerait une compétence transversale que
 * personne n'a écrite.
 */
export function PlanDeRevision({ plan, formationId }: { plan: LignePlan[]; formationId: string }) {
  if (!plan.length) return null
  return (
    <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
        À revoir en priorité sur cette formation
      </p>
      <div className="space-y-2.5">
        {plan.map((p) => (
          <div key={p.cle} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">{p.titre}</div>
              <div className="text-[11.5px] text-ink-50">
                {p.titreEvaluation} · {p.pointsPerdus} point{p.pointsPerdus > 1 ? "s" : ""} perdu
                {p.pointsPerdus > 1 ? "s" : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.revoir.map((r) => (
                <Link
                  key={r.chapterId}
                  href={`/learner/formation?id=${formationId}&chapitre=${r.chapterId}`}
                  // 44 px : cible tactile, pas un lien de bas de page.
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-amber-200 bg-white px-3 text-[12px] font-semibold text-amber-900 hover:bg-amber-50"
                >
                  {r.titre}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Bilan par compétence, replié.
 *
 * Il décrit le MEILLEUR passage, celui dont la note s'affiche juste au-dessus —
 * `doitRemplacerJournal` n'écrit le journal que si le score atteint ou dépasse
 * le meilleur. L'écran de fin d'atelier, lui, décrit le passage qu'on vient de
 * jouer. Les deux le disent, sinon un apprenant qui a fait moins bien en
 * repassant croirait à une incohérence.
 *
 * En revanche aucune DATE n'est annoncée : la base ne stocke pas celle du
 * meilleur passage (voir la note dans `lib/data/quiz.ts`), et une date fausse
 * serait pire que pas de date.
 */
export function BilanReplie({ bilan, formationId }: { bilan: BilanPublie | null; formationId: string }) {
  if (!bilan) return null
  return (
    <details className="mt-2 rounded-xl border border-warm-100 bg-white">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center px-3 text-[12px] font-semibold text-ink-50">
        Bilan par compétence
        <span className="ml-1.5 font-normal text-ink-30">— votre meilleur passage</span>
      </summary>
      <div className="border-t border-warm-100 px-3 py-2.5">
        {bilan.competences.map((c) => {
          const et = ETIQUETTE_STATUT[c.statut]
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-2 border-b border-warm-100 py-2 last:border-0">
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${et.classe}`}>
                {et.texte}
              </span>
              <span className="min-w-0 flex-1 text-[12.5px] text-ink">{c.titre}</span>
              <span className="flex-shrink-0 text-[11.5px] tabular-nums text-ink-30">
                {c.pointsObtenus} / {c.pointsTotal}
              </span>
              {/* Les renvois n'apparaissent que là où ils servent : sur une
                  compétence acquise, un bouton « revoir » serait du bruit. */}
              {c.statut !== "acquis" && c.revoir.length > 0 && (
                <div className="flex w-full flex-wrap gap-1.5 pl-1">
                  {c.revoir.map((r) => (
                    <Link
                      key={r.chapterId}
                      href={`/learner/formation?id=${formationId}&chapitre=${r.chapterId}`}
                      // 44 px comme partout ailleurs : un renvoi replié reste
                      // une cible tactile, pas une note de bas de page.
                      className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 text-[11.5px] font-semibold text-primary hover:bg-brand-50"
                    >
                      {r.titre}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}
