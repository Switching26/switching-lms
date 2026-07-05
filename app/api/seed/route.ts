import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { seedDatabase } from "@/prisma/seed"

export const dynamic = "force-dynamic"

export async function GET() {
  // Le seed crée des comptes à mots de passe connus (dont un SUPER_ADMIN) :
  // interdit en production, et réservé au SUPER_ADMIN ailleurs.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 })
  }

  const session = await auth()
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  try {
    const result = await seedDatabase()
    return NextResponse.json({ success: true, message: "Seed exécuté avec succès", data: result })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
