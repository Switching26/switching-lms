#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy || echo "Migration skipped or failed, continuing..."

echo "Starting Next.js on port ${PORT:-3000}..."
exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}
