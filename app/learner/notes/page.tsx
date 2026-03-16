export default function NotesPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ color: "#111111" }}>
        Mes notes
      </h1>
      <p className="text-sm mt-1" style={{ color: "#888888" }}>
        Vos notes prises pendant les formations
      </p>
      <div
        className="bg-white rounded-xl mt-6 p-8 text-center"
        style={{ border: "1px solid #E5E5E5" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          Aucune note pour le moment.
        </p>
      </div>
    </div>
  )
}
