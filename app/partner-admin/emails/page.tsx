export default function PartnerEmailsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ color: "#111111" }}>
        Emails
      </h1>
      <p className="text-sm mt-1" style={{ color: "#888888" }}>
        Historique des emails envoyés
      </p>
      <div
        className="bg-white rounded-xl mt-6 p-8 text-center"
        style={{ border: "1px solid #E5E5E5" }}
      >
        <p className="text-sm" style={{ color: "#888888" }}>
          Aucun email envoyé pour le moment.
        </p>
      </div>
    </div>
  )
}
