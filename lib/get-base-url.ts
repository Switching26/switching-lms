export function getBaseUrl(): string {
  const url = process.env.AUTH_URL || process.env.NEXTAUTH_URL
  if (!url) {
    throw new Error("AUTH_URL or NEXTAUTH_URL environment variable is required.")
  }
  return url.replace(/\/$/, "")
}
