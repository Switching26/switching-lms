import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getLearnerEnrollments } from "@/lib/data/formations"
import { getFormationEvaluationResults } from "@/lib/data/quiz"
import { BilanReplie, PlanDeRevision } from "@/components/learner/BilanResultats"

export const dynamic = "force-dynamic"

function pctOf(s: number | null): number | null {
  return s == null ? null : Math.round(s * 100)
}
function scoreText(pct: number) {
  return pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600"
}
function scoreBar(pct: number) {
  return pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500"
}

function Donut({ pct }: { pct: number | null }) {
  const C = 326.726
  const off = pct == null ? C : C * (1 - pct / 100)
  const stroke = pct == null ? "#E5E7EB" : pct >= 80 ? "#059669" : pct >= 50 ? "#D97706" : "#E11D48"
  return (
    <div className="relative w-[104px] h-[104px] flex-shrink-0">
      <svg width="104" height="104" viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#EEF2FF" strokeWidth="12" />
        <circle cx="60" cy="60" r="52" fill="none" stroke={stroke} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl text-ink leading-none">{pct == null ? "—" : `${pct}%`}</span>
        <span className="text-[10px] text-ink-50 uppercase tracking-wide mt-0.5">Global</span>
      </div>
    </div>
  )
}

export default async function ResultatsPage() {
  const session = await auth()
  if (!session) redirect("/login")
  const userId = session.user.id

  const enrollments = await getLearnerEnrollments(userId)
  const blocks = await Promise.all(
    enrollments.map(async (e: any) => ({
      formation: e.formation,
      results: await getFormationEvaluationResults(userId, e.formation.id),
    }))
  )
  const withQuiz = blocks.filter((b) => b.results.totalCount > 0)

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink mb-1">Mes résultats</h1>
      <p className="text-sm text-ink-50 mb-2">Vos scores aux évaluations de chaque formation.</p>
      <p className="mb-6 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-[12.5px] leading-relaxed text-brand-800">
        Vous pouvez repasser une évaluation. Chaque passage produit une nouvelle note, mais seule
        votre meilleure note est conservée comme résultat.
      </p>

      {withQuiz.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-10 text-center">
          <p className="font-display text-lg text-ink mb-1">Aucune évaluation pour le moment</p>
          <p className="text-sm text-ink-50">
            Vos scores apparaîtront ici dès que vous aurez terminé une évaluation de formation.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {withQuiz.map(({ formation, results }) => {
            const global = pctOf(results.globalBest)
            return (
              <div key={formation.id} className="bg-white border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
                <div className="flex items-center gap-4 sm:gap-5 pb-4 border-b border-border mb-3 flex-wrap">
                  <Donut pct={global} />
                  <div className="min-w-0">
                    <h2 className="font-display text-lg text-ink">{formation.title}</h2>
                    <span className="inline-block text-[11px] font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full mt-1.5">
                      {results.doneCount} évaluation{results.doneCount > 1 ? "s" : ""} sur {results.totalCount} complétée{results.doneCount > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                <PlanDeRevision plan={results.planDeRevision} formationId={formation.id} />

                <div>
                  {results.evaluations.map((ev) => {
                    const pct = pctOf(ev.bestScore)
                    return (
                      <div key={ev.key} className="border-b border-warm-100 py-3 last:border-0">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-semibold text-ink mb-1.5 truncate">{ev.title}</div>
                          {/* Pas de `truncate` ici, contrairement au titre : un
                              détail chiffré coupé au milieu ne veut plus rien
                              dire, mieux vaut le laisser passer à la ligne. */}
                          {ev.detail && (
                            <div className="text-[11px] text-ink-50 mb-1.5">{ev.detail}</div>
                          )}
                          <div className="h-[7px] rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full rounded-full ${pct != null ? scoreBar(pct) : ""}`} style={{ width: `${pct ?? 0}%` }} />
                          </div>
                        </div>
                        <div className="text-right min-w-[74px]">
                          {pct != null ? (
                            <>
                              <div className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-30">
                                Meilleure note
                              </div>
                              <div className={`font-display text-base ${scoreText(pct)}`}>{pct}%</div>
                              <div className="text-[10.5px] text-ink-30">
                                {ev.attempts} essai{ev.attempts > 1 ? "s" : ""}
                                {ev.lastAt ? ` · ${new Date(ev.lastAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}` : ""}
                              </div>
                            </>
                          ) : (
                            <div className="text-[12px] text-ink-50">
                              {ev.attempts > 0 ? "Commencée" : "Non tentée"}
                            </div>
                          )}
                        </div>
                        <Link
                          href={`/learner/formation?id=${formation.id}&chapitre=${ev.chapterId}`}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${ev.attempts > 0 ? "border border-border text-primary bg-white hover:bg-brand-50" : "bg-primary text-white hover:opacity-90"}`}
                        >
                          {ev.attempts > 0 ? "Refaire" : "Commencer"}
                        </Link>
                      </div>
                      <BilanReplie bilan={ev.bilan} formationId={formation.id} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
