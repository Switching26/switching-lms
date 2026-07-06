import Link from "next/link"

interface SwitcherFormation {
  id: string
  title: string
}

/**
 * Pills horizontales en haut des pages learner (Ma formation / Notes / Documents)
 * pour basculer entre les formations quand l'apprenant en a plusieurs.
 *
 * Server component — `href` reconstruit avec `?id=…`
 */
export default function FormationSwitcher({
  formations,
  currentId,
  basePath,
}: {
  formations: SwitcherFormation[]
  currentId: string
  basePath: string // ex: "/learner/formation"
}) {
  if (formations.length <= 1) return null

  return (
    <div className="mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      <div className="inline-flex gap-1.5 p-1 bg-white rounded-xl border border-ink-10 shadow-card">
        {formations.map((f) => {
          const active = f.id === currentId
          return (
            <Link
              key={f.id}
              href={`${basePath}?id=${f.id}`}
              aria-current={active ? "page" : undefined}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                active ? "text-white shadow-sm" : "text-ink-70 hover:bg-ink-10/30 hover:text-ink"
              }`}
              style={active ? { background: "var(--partner-primary, #4F46E5)", minHeight: 40 } : { minHeight: 40 }}
            >
              {f.title.length > 32 ? f.title.slice(0, 30) + "…" : f.title}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
