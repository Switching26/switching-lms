import { NextResponse } from "next/server"
import { seedDatabase } from "@/prisma/seed"

export async function GET() {
  try {
    const result = await seedDatabase()
    return NextResponse.json({ success: true, message: "Seed exécuté avec succès", data: result })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
