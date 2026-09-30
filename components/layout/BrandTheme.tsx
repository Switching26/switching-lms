"use client"

import { useEffect, type CSSProperties } from "react"

export default function BrandTheme({ theme }: { theme: CSSProperties }) {
  useEffect(() => {
    const root = document.documentElement
    const previous = Object.keys(theme).map((key) => [key, root.style.getPropertyValue(key)])
    Object.entries(theme).forEach(([key, value]) => root.style.setProperty(key, String(value)))
    return () => previous.forEach(([key, value]) => value ? root.style.setProperty(key, value) : root.style.removeProperty(key))
  }, [theme])
  return null
}
