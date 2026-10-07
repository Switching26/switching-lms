/** Repli WebKit réel quand le Browser Hub ignore --browser=webkit. Local uniquement. */
import { webkit } from "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs"
import { readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
const root = process.argv[2]
if (!root || !path.isAbsolute(root)) throw new Error("Dossier mission local absolu requis")
try {
  execFileSync("pgrep", ["-f", "outils/production.mjs"], { stdio: "ignore" })
  throw new Error("Chaînes vidéo actives")
} catch (error) {
  if (error.status !== 1) throw error
}
const context = await webkit.launchPersistentContext(path.join(root, "prive/webkit-profile"), {
  headless: true, viewport: { width: 1440, height: 900 },
})
const deadline = setTimeout(() => context.close(), 265000)
try {
  const cookies = JSON.parse(await readFile(path.join(root, "prive/cookies.json"), "utf8"))
  await context.addCookies([{ name: "authjs.session-token", value: cookies.learner,
    domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }])
  const page = context.pages()[0] ?? await context.newPage()
  const source = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "qa-browser.js"), "utf8")
  const result = await eval("(" + source + "\n)")(page)
  if (result.browser !== "webkit" || result.javascriptErrors !== 0) throw new Error("Recette WebKit refusée")
  await writeFile(path.join(root, "preuves/webkit.json"), JSON.stringify(result, null, 2) + "\n")
  console.log("WebKit PASS : 18 captures, 6 lectures réelles, aucune erreur JavaScript")
} catch (error) {
  console.error("WebKit refusé : " + String(error).split("\n")[0])
  process.exitCode = 1
} finally {
  clearTimeout(deadline)
  await context.close()
}
