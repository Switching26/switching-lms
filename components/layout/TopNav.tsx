import { auth, signOut } from "@/lib/auth"
import { LogOut, User } from "lucide-react"

export default async function TopNav() {
  const session = await auth()
  const user = session?.user

  const brandName =
    (user as any)?.partnerName || "Switching Formation"
  const brandColor =
    (user as any)?.partnerColor || "#111111"

  return (
    <header
      className="h-14 flex items-center justify-between px-6 bg-white"
      style={{ borderBottom: "1px solid #E5E5E5" }}
    >
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold" style={{ color: brandColor }}>
          {brandName}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
            style={{ backgroundColor: brandColor }}
          >
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <span className="text-sm font-medium" style={{ color: "#111111" }}>
            {user?.name}
          </span>
        </div>
        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
        >
          <button
            type="submit"
            className="p-2 rounded-lg transition-colors hover:bg-gray-100"
            title="Déconnexion"
          >
            <LogOut size={18} color="#888888" />
          </button>
        </form>
      </div>
    </header>
  )
}
