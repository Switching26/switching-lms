import { Suspense } from "react"
import ActivateForm from "./form"

export default function ActivatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="w-full max-w-[380px] bg-white rounded-2xl p-8 border border-border text-center">
          <p className="text-sm text-gray-400">Chargement...</p>
        </div>
      </div>
    }>
      <ActivateForm />
    </Suspense>
  )
}
