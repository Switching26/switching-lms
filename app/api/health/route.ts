import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  // Basic health check for Docker/load balancer — no sensitive data
  try {
    const { prisma } = await import("@/lib/prisma")
    await prisma.$queryRaw`SELECT 1`
  } catch {
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 })
  }

  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() })
}
