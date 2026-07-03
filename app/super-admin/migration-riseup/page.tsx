import Badge from "@/components/ui/Badge"
import KPICard from "@/components/ui/KPICard"
import { getRiseUpMigrationOverview } from "@/lib/data/riseup-migration"
import RiseUpMigrationTable from "./table"

export const dynamic = "force-dynamic"

function compactNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value)
}

function warningVariant(count: number) {
  return count === 0 ? "success" : "warning"
}

export default async function RiseUpMigrationPage() {
  const overview = await getRiseUpMigrationOverview()
  const { stats } = overview

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between animate-fade-in-up">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge variant="blue">Migration RiseUp</Badge>
            <Badge variant={warningVariant(stats.emailsSent + stats.tokensCreated)}>
              {stats.emailsSent + stats.tokensCreated === 0 ? "Aucun envoi détecté" : "Notifications détectées"}
            </Badge>
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink tracking-tight">Contrôle migration RiseUp</h1>
          <p className="text-ink-50 mt-2 text-[15px] max-w-3xl">
            Vue de contrôle lecture seule pour vérifier les apprenants migrés, leurs inscriptions, la progression reprise
            et l'absence d'emails ou de tokens envoyés avant la communication finale.
          </p>
        </div>
        <div className="rounded-2xl border border-ink-10 bg-white px-4 py-3 text-xs text-ink-50 shadow-sm max-w-md">
          <div className="font-semibold text-ink mb-1">Garde-fou</div>
          Cette page ne contient aucune action d'activation, de génération de mot de passe, de token ou d'envoi email.
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up-delay-1">
        <KPICard
          label="Apprenants RiseUp"
          value={compactNumber(stats.learners)}
          sub={`${compactNumber(stats.inactiveLearners)} inactifs · ${compactNumber(stats.activeLearners)} actifs`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
        />
        <KPICard
          label="Inscriptions"
          value={compactNumber(stats.enrollments)}
          sub={`${compactNumber(stats.formations)} formations concernées`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
        <KPICard
          label="Progression reprise"
          value={`${stats.averageProgress}%`}
          sub={`${compactNumber(stats.completedChapters)}/${compactNumber(stats.totalChapters)} chapitres terminés`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h3.75c.621 0 1.125.504 1.125 1.125v6.75C9 20.496 8.496 21 7.875 21h-3.75A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-3.75a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125C16.5 3.504 17.004 3 17.625 3h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          }
        />
        <KPICard
          label="Emails / tokens"
          value={`${compactNumber(stats.emailsSent)} / ${compactNumber(stats.tokensCreated)}`}
          sub={`${compactNumber(stats.silentReady)} comptes prêts pour communication finale`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488a4.5 4.5 0 01-4.178 0l-6.478-3.488A2.25 2.25 0 012.25 9.906V9m19.5 0A2.25 2.25 0 0019.5 6.75h-15A2.25 2.25 0 002.25 9m19.5 0v6.75A2.25 2.25 0 0119.5 18.75h-15a2.25 2.25 0 01-2.25-2.25V9" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {overview.formationStats.map((formation) => (
          <div key={formation.id} className="bg-white rounded-2xl border border-ink-10 p-5 shadow-sm">
            <div className="text-sm font-semibold text-ink leading-snug">{formation.title}</div>
            <div className="mt-3 flex items-center justify-between text-xs text-ink-50">
              <span>{compactNumber(formation.learnerCount)} inscription{formation.learnerCount > 1 ? "s" : ""}</span>
              <span>{formation.averageProgress}% moyen</span>
            </div>
            <div className="h-2 rounded-full bg-ink-10 overflow-hidden mt-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${formation.averageProgress}%` }} />
            </div>
          </div>
        ))}
      </div>

      <RiseUpMigrationTable learners={overview.learners} formationStats={overview.formationStats} />
    </div>
  )
}
