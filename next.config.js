/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: { outputFileTracingIncludes: { '/anglais/**': ['./anglais-lecteur/**/*'] } },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'switching-lms-production.up.railway.app',
      },
      {
        protocol: 'https',
        hostname: 'images.riseup.ai',
      },
      {
        protocol: 'https',
        hostname: 'content.riseup.ai',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/favicon.ico',
        destination: '/favicon.svg',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      ...['/anglais/:path*', '/learner/formation', '/super-admin/:path*'].map(source => ({ source, headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' }] })),
    ]
  },
}

module.exports = nextConfig
