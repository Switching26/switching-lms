import type { CSSProperties } from "react"

/** Accent fin du sommaire : couleur de marque, lisible sur une surface blanche. */
export function lessonAccent(primary: string): string {
  if (primary.toLowerCase() === '#10abaf') return '#087d83'
  const channels = [1, 3, 5].map(start => parseInt(primary.slice(start, start + 2), 16))
  const contrast = (rgb: number[]) => {
    const linear = rgb.map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 })
    return 1.05 / (.2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2] + .05)
  }
  let rgb = channels
  // Réduction commune des canaux : conserve la teinte, sans changer les variables de marque.
  for (let factor = .99; contrast(rgb) < 3 && factor >= 0; factor -= .01) rgb = channels.map(c => Math.floor(c * factor))
  return '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('')
}

/** A single palette per organisation, also used by readers rendered under body. */
export function brandTheme(primary?: string | null, secondary?: string | null): CSSProperties {
  const accent = /^#[\da-f]{6}$/i.test(primary || "") ? primary! : "#4F46E5"
  const rgb = [1, 3, 5].map((start) => {
    const channel = parseInt(accent.slice(start, start + 2), 16) / 255
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  })
  const [r, g, b] = rgb
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b)
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b)
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s
  const bb = .0259040371 * l + .7827717662 * m - .808675766 * s
  const hue = (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360
  return {
    "--partner-primary": accent,
    "--lesson-brand-accent": lessonAccent(accent),
    "--partner-secondary": secondary || "#0F172A",
    "--lms-accent": accent,
    "--lms-hue": String(hue),
  } as CSSProperties
}
