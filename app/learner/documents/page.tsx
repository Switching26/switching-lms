export default function DocumentsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ color: "#111111" }}>
        Documents
      </h1>
      <p className="text-sm mt-1" style={{ color: "#888888" }}>
        Ressources et pièces jointes de vos formations
      </p>
      <div
        className="bg-white rounded-xl mt-6 p-8 text-center"
        style={{ border: "1px solid #E5E5E5" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          Aucun document disponible pour le moment.
        </p>
      </div>
    </div>
  )
}
