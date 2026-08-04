/**
 * « Montrez-moi » ne doit JAMAIS être proposé quand rien ne peut s'animer.
 *
 * Ce que ce contrôle attrape, et qu'aucun autre ne voyait : le châssis offrait
 * la démonstration sur 316 étapes d'action dont l'adaptateur ne produit AUCUN
 * plan, puis renvoyait l'apprenant vers « le repère affiché à l'écran » — un
 * repère que le calque, faute de plan, n'a jamais dessiné.
 *
 * Il tient en trois parties, et la troisième est celle qui compte :
 *
 *   1. VOLUMÉTRIE — interroge le MOTEUR (la façade du registre), jamais le texte
 *      des fichiers. C'est la leçon du registre non branché, où lire la source
 *      avait rendu vert un branchement inexistant.
 *   2. CHÂSSIS — rend réellement `AtelierShell` et vérifie son arbitrage. Une
 *      exécution, pas une recherche de chaîne.
 *   3. ADOPTION — le châssis ne peut RIEN déduire seul : il ne reçoit ni action,
 *      ni adaptateur. Seul le player calcule le plan, donc seul le player peut
 *      renseigner `demoJouable`. Tant qu'un player ne le passe pas, ses étapes
 *      sans plan continuent de promettre une démonstration : ce contrôle ÉCHOUE,
 *      il ne se contente pas de l'afficher.
 *
 * Usage : npx tsx scripts/simulation/check-demo-promise.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import AtelierShell, { type ConsigneAtelier } from "@/components/simulation/AtelierShell"
import { demonstrationPour, reponsePour } from "@/lib/simulation/registre"

const RACINE = join(process.cwd(), "scripts/simulation/scenarios")
const APPS = [
  { nom: "EXCEL", dossier: "", player: "components/simulation/SimulationPlayer.tsx" },
  { nom: "WORD", dossier: "word", player: "components/simulation/word/WordPlayer.tsx" },
  { nom: "POWERPOINT", dossier: "ppt", player: "components/simulation/ppt/PptPlayer.tsx" },
  { nom: "OUTLOOK", dossier: "outlook", player: "components/simulation/outlook/OutlookPlayer.tsx" },
]

let anomalies = 0
const dire = (s: string) => console.log(s)

/* ═════════ 1 · VOLUMÉTRIE, DEMANDÉE AU MOTEUR ═════════ */

dire("── Étapes d'action (hors READ, hors évaluation) sans plan jouable ──")
const sansPlanParApp: Record<string, number> = {}
let totalSansPlan = 0
let repereFantome = 0

for (const { nom, dossier } of APPS) {
  const dir = dossier ? join(RACINE, dossier) : RACINE
  if (!existsSync(dir)) continue
  let total = 0
  let sansPlan = 0
  let menteuses = 0
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const sc = JSON.parse(readFileSync(join(dir, f), "utf8"))
    if (String(sc.mode ?? "LESSON").toUpperCase() === "EVALUATION") continue
    for (const step of sc.steps ?? []) {
      const action = step?.action
      if (!action?.type || action.type === "READ") continue
      total++
      const ctx =
        nom === "EXCEL" ? { onglet: step?.setup?.ribbon?.activeTab, setup: step?.setup } : {}
      const plan = demonstrationPour(action as never, ctx as never)
      const gestes = (plan as { gestes?: unknown[] } | null)?.gestes
      const jouable = !!plan && (!Array.isArray(gestes) || gestes.length > 0)
      if (!jouable) {
        sansPlan++
        // Sans plan ET sans réponse : c'est là que la phrase de repli renvoyait
        // vers un repère qui n'existe nulle part.
        if (reponsePour(action as never) == null) menteuses++
      }
    }
  }
  sansPlanParApp[nom] = sansPlan
  totalSansPlan += sansPlan
  repereFantome += menteuses
  const pct = total ? ((sansPlan / total) * 100).toFixed(1) : "0.0"
  dire(`   ${nom.padEnd(12)} ${String(sansPlan).padStart(4)} / ${String(total).padStart(4)}  (${pct} %)   dont sans réponse écrite : ${menteuses}`)
}
dire(`   TOTAL        ${totalSansPlan} étapes, dont ${repereFantome} qui désignaient un repère inexistant`)

/* ═════════ 2 · LE CHÂSSIS ARBITRE-T-IL ? — par exécution ═════════ */

const BASE: ConsigneAtelier = {
  texte: "Rangez ce message.",
  nature: "action",
  lecture: false,
  aDemonstration: false,
  attendu: "le message rangé",
  reponse: null,
  aide: null,
  aideVisible: false,
  aideAncree: false,
  indiceDisponible: false,
  evaluationNotee: false,
  relais: 0,
  relaisActif: false,
  verdict: null,
  aplomb: null,
  panneJuge: null,
  passageEnCours: false,
  aideProposee: true,
  demonstration: false,
  demoFinie: false,
  demoRejouable: false,
  index: 2,
  total: 8,
  reculPossible: true,
  onMontrer: () => {},
  onDebloquer: () => {},
  onRejouerDemo: () => {},
  onIndice: () => {},
  onSuivant: () => {},
  onReculer: () => {},
}

const rendre = (c: Partial<ConsigneAtelier>) =>
  renderToStaticMarkup(
    createElement(
      AtelierShell,
      {
        chapterId: "c",
        mode: "EXERCISE",
        evaluationNotee: !!c.evaluationNotee,
        filModule: "M",
        filChapitre: "C",
        index: 2,
        total: 8,
        relais: 0,
        introVue: true,
        consigne: { ...BASE, ...c },
      },
      createElement("div", null, "surface"),
    ),
  )

const REPERE = "Suivez le rep"
const cas: { nom: string; c: Partial<ConsigneAtelier>; montrer: boolean; repere: boolean; issue: boolean }[] = [
  { nom: "plan présent (Excel)", c: {}, montrer: true, repere: false, issue: true },
  { nom: "plan présent, démo en cours, sans réponse", c: { demonstration: true }, montrer: false, repere: true, issue: true },
  { nom: "SANS plan", c: { demoJouable: false }, montrer: false, repere: false, issue: true },
  { nom: "SANS plan, démarrage automatique", c: { demoJouable: false, demonstration: true }, montrer: false, repere: false, issue: true },
  { nom: "SANS plan, réponse écrite", c: { demoJouable: false, reponse: "l'en-tête" }, montrer: false, repere: false, issue: true },
  { nom: "évaluation SANS plan", c: { demoJouable: false, evaluationNotee: true }, montrer: true, repere: false, issue: true },
]

dire("\n── Arbitrage du châssis (rendu réel) ──")
for (const k of cas) {
  const html = rendre(k.c)
  const aMontrer = html.includes('data-control="sim-montrer"')
  const aRepere = html.includes(REPERE)
  const aIssue =
    aMontrer ||
    html.includes('data-control="sim-continuer-sans-demo"') ||
    html.includes('data-control="sim-voir-reponse"') ||
    html.includes('data-control="sim-debloquer"')
  const ok = aMontrer === k.montrer && aRepere === k.repere && aIssue === k.issue
  if (!ok) anomalies++
  dire(
    `   ${ok ? "✓" : "✗"} ${k.nom.padEnd(42)} « Montrez-moi »=${aMontrer ? "oui" : "non"}  repère=${aRepere ? "oui" : "non"}  issue=${aIssue ? "oui" : "NON"}`,
  )
}

/* ═════════ 3 · LES PLAYERS RENSEIGNENT-ILS LE CHAMP ? ═════════ */

/**
 * Commentaires retirés AVANT de chercher : c'est exactement le piège qui avait
 * rendu vert un registre où Word n'était branché nulle part, la règle lisant sa
 * propre documentation. Un player qui se contente de PARLER de `demoJouable`
 * dans un commentaire ne le passe pas pour autant.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

dire("\n── Adoption par les players ──")
for (const { nom, player } of APPS) {
  const chemin = join(process.cwd(), player)
  if (!existsSync(chemin)) {
    dire(`   ? ${nom.padEnd(12)} player introuvable : ${player}`)
    continue
  }
  const passe = /(^|[^.\w])demoJouable\s*:/.test(sansCommentaires(readFileSync(chemin, "utf8")))
  const concerne = (sansPlanParApp[nom] ?? 0) > 0
  if (!passe && concerne) {
    anomalies++
    dire(`   ✗ ${nom.padEnd(12)} ne passe pas \`demoJouable\` — ses ${sansPlanParApp[nom]} étapes sans plan promettent encore une démonstration`)
  } else if (!passe) {
    dire(`   · ${nom.padEnd(12)} ne le passe pas, mais aucune de ses étapes n'est concernée (défaut = démontrable)`)
  } else {
    dire(`   ✓ ${nom.padEnd(12)} passe \`demoJouable\``)
  }
}

if (anomalies) {
  dire(
    `\n✗ ${anomalies} anomalie(s).\n` +
      `  Le châssis ne reçoit ni action ni adaptateur : il ne peut pas deviner qu'un\n` +
      `  plan existe. Chaque player concerné doit ajouter UNE ligne à l'objet\n` +
      `  \`consigne\` qu'il construit, à côté de \`aDemonstration\` :\n\n` +
      `      demoJouable: !!plan,\n`,
  )
  process.exit(1)
}
dire("\n✓ aucune étape ne promet une démonstration qui ne viendra pas.")
