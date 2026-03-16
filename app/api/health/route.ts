import { NextResponse } from "next/server"

export async function GET() {
  const checks: Record<string, string> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    AUTH_SECRET: process.env.AUTH_SECRET ? "set" : "NOT SET",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "set" : "NOT SET",
    AUTH_URL: process.env.AUTH_URL || "NOT SET",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT SET",
    DATABASE_URL: process.env.DATABASE_URL ? "set" : "NOT SET",
    NODE_ENV: process.env.NODE_ENV || "NOT SET",
  }

  // Test Prisma connection
  try {
    const { prisma } = await import("@/lib/prisma")
    await prisma.$queryRaw`SELECT 1`
    checks.database = "connected"
  } catch (e: any) {
    checks.database = `error: ${e.message}`
  }

  return NextResponse.json(checks)
}
