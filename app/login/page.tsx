import { Suspense } from "react"
import LoginForm from "./login-form"

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F7" }}>
          <div className="w-full max-w-[380px] bg-white rounded-2xl p-8" style={{ border: "0.5px solid #E5E5E5" }}>
            <div className="text-center">
              <h1 className="text-xl font-semibold" style={{ color: "#111111" }}>
                Switching Formation
              </h1>
              <p className="text-sm mt-2" style={{ color: "#888888" }}>
                Chargement...
              </p>
            </div>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
