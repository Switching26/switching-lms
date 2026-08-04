/**
 * Le joueur qui alimente le journal des boutons PowerPoint réellement pressés.
 *
 * ═══ POURQUOI IL EXISTE ═══
 *
 * `check-couverture-ppt` refuse de mesurer les boutons depuis le code : la carte
 * action → bouton de `demonstrationPpt` est PARTIELLE (elle ignore transitions et
 * notes, pourtant enseignées), et en écrire une quatrième copie aurait divergé
 * comme les trois précédentes. Sa seule source acceptable est un journal produit
 * par un navigateur qui a réellement cliqué. Sans ce fichier, le contrôle
 * annonçait honnêtement « la mesure des boutons N'A PAS été faite » — un
 * avertissement permanent que rien ne venait lever.
 *
 * ═══ COMMENT LA MESURE EST PRISE ═══
 *
 * Le joueur ouvre chaque chapitre dans le banc, laisse les démonstrations se
 * jouer et RELÈVE, depuis la page, les boutons que le calque a réellement
 * pressés. C'est le crochet `__PPT_BOUTONS_PRESSES` du player — hors production —
 * qui les note : on n'infère rien, on lit ce qui s'est produit.
 *
 * Usage :
 *   PORT_BANC=8874 node scripts/simulation/ppt/joueur-boutons.cjs \
 *     --banc=<dossier> --sortie=/tmp/ppt-boutons.txt [--max=40]
 *   npx tsx scripts/simulation/ppt/check-couverture-ppt.ts --journal=/tmp/ppt-boutons.txt
 *
 * ⚠️ Le journal n'est valable que pour les chapitres RÉELLEMENT parcourus. Le
 * fichier porte donc en tête la liste de ce qui a été joué : un lecteur doit
 * pouvoir distinguer « ce bouton n'est employé nulle part » de « ce bouton vit
 * dans un chapitre que la passe n'a pas ouvert ».
 */
const fs = require("fs")
const path = require("path")
const { chromium } = require(
  "/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core",
)

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : d
}
const PORT = process.env.PORT_BANC || "8874"
const SORTIE = arg("sortie", "/tmp/ppt-boutons.txt")
const MAX = Number(arg("max", "130"))
const SCENARIOS = path.join(__dirname, "..", "scenarios", "ppt")

const dodo = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const fichiers = fs.readdirSync(SCENARIOS).filter((f) => f.endsWith(".json")).sort().slice(0, MAX)
  const nav = await chromium.launch({ channel: "chrome" })
  const page = await (await nav.newContext()).newPage()
  await page.setViewportSize({ width: 1440, height: 900 })

  const presses = new Set()
  const joues = []

  for (const f of fichiers) {
    const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf-8"))
    /* On ouvre les écrans de lecture : leur démonstration part toute seule et
       presse pour de vrai les onglets et les boutons qu'elle désigne. */
    /* Les étapes d'ACTION, et non les écrans de lecture : une illustration
       désigne sans presser, elle n'alimenterait jamais le journal. C'est la
       démonstration d'une action qui ouvre l'onglet puis clique le bouton. */
    const lectures = sc.steps
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s.action?.type !== "READ")
      .slice(0, 4)
    if (!lectures.length) continue

    for (const { i } of lectures) {
      try {
        await page.addInitScript(() => { window.__PPT_FORCE_DEMO = 1 })
        await page.goto(`http://127.0.0.1:${PORT}/index.html?s=${f}&step=${i}`, { waitUntil: "load" })
        await dodo(700)
        const c = page.locator('[data-control="sim-commencer"]')
        if (await c.count()) await c.first().click().catch(() => {})
        await page.waitForSelector("[data-demo-compteur]", { timeout: 12000 }).catch(() => {})
        /* Laisser la séquence aller au bout : c'est en avançant qu'elle ouvre
           les onglets et presse les boutons suivants. */
        await dodo(2600)
        const vus = await page.evaluate(() => (window.__PPT_BOUTONS_PRESSES || []).slice())
        for (const b of vus) presses.add(b)
      } catch {
        /* Un chapitre qui n'ouvre pas ne fausse pas la mesure : il n'ajoute
           simplement rien, et la liste des chapitres joués le dira. */
      }
    }
    joues.push(f)
    process.stdout.write(`\r${joues.length}/${fichiers.length} chapitres · ${presses.size} boutons`)
  }

  await nav.close()
  const entete = [
    `# journal des boutons PowerPoint réellement pressés au navigateur`,
    `# chapitres parcourus : ${joues.length}`,
    `# ${joues.join(" ")}`,
    "",
  ].join("\n")
  fs.writeFileSync(SORTIE, entete + [...presses].sort().join("\n") + "\n")
  console.log(`\n→ ${presses.size} boutons distincts, ${joues.length} chapitres · ${SORTIE}`)
})()
