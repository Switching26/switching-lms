/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'switching-lms-production.up.railway.app',
      },
    ],
    unoptimized: true,
  },
}

module.exports = nextConfig
