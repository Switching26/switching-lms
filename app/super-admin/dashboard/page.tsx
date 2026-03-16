import { auth } from "@/lib/auth"

export default async function SuperAdminDashboard() {
  const session = await auth()

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ color: "#111111" }}>
        Dashboard
      </h1>
      <p className="text-sm mt-1" style={{ color: "#888888" }}>
        Bienvenue, {session?.user?.name}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {[
          { label: "Formations", value: "—" },
          { label: "Utilisateurs", value: "—" },
          { label: "Partenaires", value: "—" },
          { label: "Inscriptions", value: "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl p-5"
            style={{ border: "1px solid #E5E5E5" }}
          >
            <p className="text-sm" style={{ color: "#888888" }}>
              {stat.label}
            </p>
            <p className="text-2xl font-semibold mt-1" style={{ color: "#111111" }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
