'use client'

import { useEffect } from 'react'

export default function DynamicFavicon({ logoUrl }: { logoUrl: string | null }) {
  useEffect(() => {
    if (!logoUrl) return

    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
      || document.createElement('link')
    link.type = 'image/x-icon'
    link.rel = 'icon'
    link.href = logoUrl
    document.getElementsByTagName('head')[0].appendChild(link)
  }, [logoUrl])

  return null
}
