import { auth } from "@/lib/auth"

export default async function AccueilPage() {
  const session = await auth()

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ color: "#111111" }}>
        Bienvenue, {session?.user?.name?.split(" ")[0]}
      </h1>
      <p className="text-sm mt-1" style={{ color: "#888888" }}>
        Continuez votre apprentissage
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div
          className="bg-white rounded-xl p-5"
          style={{ border: "1px solid #E5E5E5" }}
        >
          <p className="text-sm font-medium" style={{ color: "#111111" }}>
            Formations en cours
          </p>
          <p className="text-3xl font-semibold mt-2" style={{ color: "#111111" }}>
            0
          </p>
        </div>
        <div
          className="bg-white rounded-xl p-5"
          style={{ border: "1px solid #E5E5E5" }}
        >
          <p className="text-sm font-medium" style={{ color: "#111111" }}>
            Formations terminées
          </p>
          <p className="text-3xl font-semibold mt-2" style={{ color: "#111111" }}>
            0
          </p>
        </div>
      </div>

      <div
        className="bg-white rounded-xl mt-6 p-8 text-center"
        style={{ border: "1px solid #E5E5E5" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          Aucune formation assignée pour le moment.
        </p>
      </div>
    </div>
  )
}
