/** Private immutable introductions. Excel's existing keys remain unchanged. */
export const INTRO_APPS = ["EXCEL", "WORD", "POWERPOINT", "OUTLOOK"] as const
export type IntroApp = typeof INTRO_APPS[number]
export const INTRO_PREFIX = "introductions/excel/2026-10-v1/"
export function isIntroApp(app: string | undefined): app is IntroApp {
  return INTRO_APPS.some(candidate => candidate === app)
}
export function introAppForKey(key: string): IntroApp | null {
  const match = /^introductions\/(excel|word|powerpoint|outlook)\/2026-10-v1\/m(\d{2})-(intro|l\d{2,3})\.(mp4|jpg)$/.exec(key)
  if (!match) return null
  const app = match[1].toUpperCase() as IntroApp
  const maximum = { EXCEL: 27, WORD: 19, POWERPOINT: 16, OUTLOOK: 16 }[app]
  const number = Number(match[2])
  if (number < 1 || number > maximum) return null
  if (match[3] !== "intro" && !(app === "EXCEL" ? /^l\d{3}$/.test(match[3]) : /^l\d{2}$/.test(match[3]))) return null
  if (match[3] !== "intro" && Number(match[3].slice(1)) < 1) return null
  return app
}
export function validIntroKey(key: string, asset: "video" | "poster", app?: IntroApp) {
  const resolved = introAppForKey(key)
  return resolved !== null && (!app || resolved === app) && key.endsWith(asset === "video" ? ".mp4" : ".jpg")
}
