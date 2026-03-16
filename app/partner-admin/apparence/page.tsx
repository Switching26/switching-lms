export default function ApparencePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ color: "#111111" }}>
        Apparence
      </h1>
      <p className="text-sm mt-1" style={{ color: "#888888" }}>
        Personnalisez l&apos;apparence de votre espace
      </p>
      <div
        className="bg-white rounded-xl mt-6 p-6"
        style={{ border: "1px solid #E5E5E5" }}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#111111" }}>
              Couleur principale
            </label>
            <input
              type="color"
              defaultValue="#111111"
              className="w-10 h-10 rounded cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#111111" }}>
              Logo
            </label>
            <div
              className="w-full h-32 rounded-lg flex items-center justify-center cursor-pointer"
              style={{ border: "2px dashed #E5E5E5" }}
            >
              <p className="text-sm" style={{ color: "#888888" }}>
                Glissez votre logo ici ou cliquez pour parcourir
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
