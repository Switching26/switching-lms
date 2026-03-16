export default function LicencesPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ color: "#111111" }}>
        Licences
      </h1>
      <p className="text-sm mt-1" style={{ color: "#888888" }}>
        Gestion des licences de formation
      </p>
      <div
        className="bg-white rounded-xl mt-6 p-8 text-center"
        style={{ border: "1px solid #E5E5E5" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          Aucune licence pour le moment.
        </p>
      </div>
    </div>
  )
}
