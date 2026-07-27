import AssessmentRunner from "./runner"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Évaluation",
  // Un lien d'évaluation ne doit jamais se retrouver indexé.
  robots: { index: false, follow: false },
}

export default async function EvaluationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <AssessmentRunner token={token} />
}
