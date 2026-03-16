import { auth } from "@/lib/auth"

export default async function ParametresPage() {
  const session = await auth()

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ color: "#111111" }}>
        Paramètres
      </h1>
      <p className="text-sm mt-1" style={{ color: "#888888" }}>
        Gérez votre compte
      </p>

      <div
        className="bg-white rounded-xl mt-6 p-6"
        style={{ border: "1px solid #E5E5E5" }}
      >
        <h2 className="text-base font-medium mb-4" style={{ color: "#111111" }}>
          Informations personnelles
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm" style={{ color: "#888888" }}>
              Nom
            </label>
            <p className="text-sm font-medium" style={{ color: "#111111" }}>
              {session?.user?.name}
            </p>
          </div>
          <div>
            <label className="block text-sm" style={{ color: "#888888" }}>
              Email
            </label>
            <p className="text-sm font-medium" style={{ color: "#111111" }}>
              {session?.user?.email}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
