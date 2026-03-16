#!/bin/sh
set -e

# NextAuth v5 reads AUTH_SECRET and AUTH_URL, not NEXTAUTH_SECRET/NEXTAUTH_URL
export AUTH_SECRET="${AUTH_SECRET:-$NEXTAUTH_SECRET}"
export AUTH_URL="${AUTH_URL:-$NEXTAUTH_URL}"

echo "Running database migrations..."
npx prisma migrate deploy || echo "Migration skipped or failed, continuing..."

echo "AUTH_SECRET set: $([ -n "$AUTH_SECRET" ] && echo 'yes' || echo 'NO - THIS WILL CAUSE 500 ERRORS')"
echo "AUTH_URL: $AUTH_URL"
echo "Starting Next.js on port ${PORT:-3000}..."
exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}
