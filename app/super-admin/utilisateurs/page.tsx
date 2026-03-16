export default function UtilisateursPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "#111111" }}>
          Utilisateurs
        </h1>
        <button
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "#111111" }}
        >
          Ajouter un utilisateur
        </button>
      </div>
      <div
        className="bg-white rounded-xl mt-6 p-8 text-center"
        style={{ border: "1px solid #E5E5E5" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          Aucun utilisateur pour le moment.
        </p>
      </div>
    </div>
  )
}
