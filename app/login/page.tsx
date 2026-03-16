import { Suspense } from "react"
import LoginForm from "./login-form"

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="w-full max-w-[380px] bg-white rounded-2xl p-8 border border-border text-center">
          <p className="text-sm text-gray-400">Chargement...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
