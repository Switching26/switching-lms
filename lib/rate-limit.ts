const rateMap = new Map<string, { count: number; resetAt: number }>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  rateMap.forEach((entry, key) => {
    if (now > entry.resetAt) {
      rateMap.delete(key)
    }
  })
}, 5 * 60 * 1000)

interface RateLimitOptions {
  maxAttempts: number
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const entry = rateMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + options.windowMs })
    return { allowed: true, remaining: options.maxAttempts - 1, retryAfterMs: 0 }
  }

  if (entry.count >= options.maxAttempts) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now }
  }

  entry.count++
  return { allowed: true, remaining: options.maxAttempts - entry.count, retryAfterMs: 0 }
}

export function rateLimitResponse(retryAfterMs: number) {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000)
  return new Response(
    JSON.stringify({ error: "Trop de tentatives. Réessayez dans quelques minutes." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    }
  )
}
