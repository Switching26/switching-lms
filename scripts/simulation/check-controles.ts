/**
 * Contrôle des BOUTONS DU RUBAN : un bouton rendu doit AGIR.
 *
 *   npx tsx scripts/simulation/check-controles.ts
 *
 * POURQUOI CE FICHIER EXISTE
 * Le 31/07/2026, Samuel a filmé la petite flèche ▾ du groupe Cellules : la
 * démonstration affirmait qu'elle « ouvre la boîte de dialogue complète », il a
 * cliqué, rien ne s'est ouvert. En cherchant, ce n'était pas un cas isolé —
 * huit boutons du ruban n'avaient AUCUN traitement dans `SimulationPlayer` :
 * `acc-somme-auto` (le Σ, cœur du module 6), `acc-copier` (cité par cinq
 * consignes qui promettent un liseré animé), `acc-recopier`, `acc-effacer`,
 * `acc-format`, `bf-fx`, et les deux flèches ▾.
 *
 * AUCUN des neuf contrôles existants ne pouvait le voir, et c'est structurel :
 * au bout de `handleControl`, TOUT identifiant finit par émettre
 * `handleAction({kind:"control"})`. Une étape `CLICK_CONTROL` se valide donc
 * même quand le bouton n'a rien fait — l'apprenant avance, persuadé d'avoir
 * raté quelque chose puisque l'écran n'a pas bougé. Le geste est « observé »
 * sans être « accompli » : c'est exactement l'angle mort que ce fichier ferme.
 *
 * LA RÈGLE
 * Tout identifiant rendu par `SimulationChrome` doit être atteint par un effet :
 *   · un `case "<id>":` ou un `controlId === "<id>"` dans `SimulationPlayer`,
 *   · ou un préfixe routé vers une couche (`ins-graph-`, `tcd-`, `dev-`,
 *     `poste-`),
 *   · ou une entrée dans `DECORATIFS`, avec sa raison écrite.
 *
 * `DECORATIFS` n'est pas une échappatoire : y inscrire un bouton est une
 * DÉCISION, qui doit s'expliquer en une phrase. Un bouton sans effet et sans
 * raison est une erreur, pas un détail de finition.
 *
 * Le contrôle vérifie aussi le sens inverse — un scénario ne doit pas citer un
 * bouton que le ruban ne rend pas — et signale les boutons rendus que plus
 * aucun scénario n'utilise.
 *
 * CE QU'IL NE VOIT PAS — à savoir avant de s'y fier
 * Il lit du texte : il constate qu'un chemin de traitement EXISTE, jamais qu'il
 * produit un effet. Deux classes lui échappent, toutes deux rencontrées :
 *
 *  1. Un `case` qui ne fait rien faute de données d'étape — `acc-mfc-regle`
 *     sans `setup.cf`. Un contrôle voisin le couvre : aucune étape ne clique un
 *     bouton sans lui fournir ce qu'il attend (vérifié, 0 cas au 31/07/2026).
 *  2. Un `case` dont l'appel à Univer est FAUX. `hideColumn` a deux formes dans
 *     Univer : `hideColumn(range)` prend un objet plage, `hideColumns(i, n)`
 *     prend des indices. On appelait la première avec des nombres — appel
 *     valide en JavaScript, sans effet, avalé par le `catch {}` de l'enveloppe.
 *     Résultat : `M04-L05-03` validait « ✓ C'est exact » et la colonne « Coût
 *     interne » restait à l'écran, alors que l'étape suivante fait totaliser
 *     « la colonne masquée ». Cinq étapes en dépendaient.
 *     SEUL LE REJEU AU NAVIGATEUR voit cela : cliquer, puis regarder l'écran.
 */

import * as fs from "fs"
import * as path from "path"

const RACINE = path.join(__dirname, "..", "..")
const COMPOSANTS = path.join(RACINE, "components", "simulation")
const SCENARIOS = path.join(__dirname, "scenarios")

/* ── Boutons intentionnellement inertes ───────────────────────────────────────
   Vide, et c'est voulu : au 31/07/2026 tout bouton du ruban agit. Une entrée
   ici doit nommer le bouton ET dire pourquoi il ne fait rien. */
const DECORATIFS: Record<string, string> = {}

/* Ces identifiants ne sont pas des boutons du ruban : le cockpit du lecteur et
   l'écran d'intro les traitent eux-mêmes, hors de `handleControl`. */
const HORS_RUBAN = (id: string) => id.startsWith("sim-") || id.startsWith("intro-")

/* Préfixes que `effetModele` et `gestePoste` routent vers une couche entière :
   graphique, tableau croisé, macro, poste de travail. */
const PREFIXES_ROUTES = ["ins-graph-", "tcd-", "dev-", "poste-"]

/* ── Ce que le ruban rend ─────────────────────────────────────────────────── */

function identifiantsRendus(): { ids: Set<string>; ligneDe: Record<string, number> } {
  const src = fs.readFileSync(path.join(COMPOSANTS, "SimulationChrome.tsx"), "utf8").split("\n")
  const ids = new Set<string>()
  const ligneDe: Record<string, number> = {}
  src.forEach((ligne, i) => {
    // Deux écritures coexistent : le composant `Btn` porte `id="…"`, les boutons
    // écrits à la main portent `data-control="…"`.
    for (const m of ligne.matchAll(/(?:data-control|\bid)="([a-z][a-z0-9]*(?:-[a-z0-9]+)+)"/g)) {
      if (HORS_RUBAN(m[1])) continue
      if (!ids.has(m[1])) ligneDe[m[1]] = i + 1
      ids.add(m[1])
    }
  })
  return { ids, ligneDe }
}

/* ── Ce que le lecteur traite ─────────────────────────────────────────────── */

function identifiantsTraites(): Set<string> {
  const src = fs.readFileSync(path.join(COMPOSANTS, "SimulationPlayer.tsx"), "utf8")
  const ids = new Set<string>()
  // `switch (controlId)` pour le ruban et la grille…
  for (const m of src.matchAll(/case\s+"([a-z][a-z0-9-]*)":/g)) ids.add(m[1])
  // …et comparaisons directes pour les couches (`effetModele`).
  for (const m of src.matchAll(/controlId\s*===\s*"([a-z][a-z0-9-]*)"/g)) ids.add(m[1])
  return ids
}

/* ── Ce que les scénarios citent ──────────────────────────────────────────── */

function identifiantsCites(): Record<string, { action: number; montrer: number; ou: string[] }> {
  const usage: Record<string, { action: number; montrer: number; ou: string[] }> = {}
  const noter = (id: string, cle: "action" | "montrer", etape: string) => {
    const u = (usage[id] ??= { action: 0, montrer: 0, ou: [] })
    u[cle] += 1
    if (u.ou.length < 4) u.ou.push(etape)
  }
  for (const nom of fs.readdirSync(SCENARIOS).filter((n) => n.endsWith(".json")).sort()) {
    const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, nom), "utf8"))
    for (const st of sc.steps ?? []) {
      if (st.action?.type === "CLICK_CONTROL" && st.action.control) noter(st.action.control, "action", st.id)
      for (const m of st.montrer ?? []) {
        if (m.type === "CLICK_CONTROL" && m.control) noter(m.control, "montrer", st.id)
        if (m.type === "MONTRER" && typeof m.cible === "string" && m.cible.startsWith("ctrl:"))
          noter(m.cible.slice(5), "montrer", st.id)
      }
    }
  }
  return usage
}

/* ── Vérification ─────────────────────────────────────────────────────────── */

const { ids: rendus, ligneDe } = identifiantsRendus()
const traites = identifiantsTraites()
const cites = identifiantsCites()

const aUnEffet = (id: string) =>
  traites.has(id) || PREFIXES_ROUTES.some((p) => id.startsWith(p))

const erreurs: string[] = []
const remarques: string[] = []

/* 1. Un bouton rendu doit agir. */
for (const id of [...rendus].sort()) {
  if (aUnEffet(id)) continue
  if (id in DECORATIFS) {
    remarques.push(`décoratif assumé  ${id} — ${DECORATIFS[id]}`)
    continue
  }
  const u = cites[id]
  const ou = u ? ` — cité par ${u.action} action(s) et ${u.montrer} démonstration(s) : ${u.ou.join(", ")}` : " — cité par aucun scénario"
  erreurs.push(
    `bouton SANS EFFET  ${id}  (SimulationChrome.tsx:${ligneDe[id]})${ou}\n` +
      `    → soit lui donner un effet dans SimulationPlayer, soit le retirer du ruban,\n` +
      `      soit l'inscrire dans DECORATIFS avec sa raison.`,
  )
}

/* 2. Un scénario ne doit pas citer un bouton absent du ruban. Les couches
      (mise en page, macro, poste…) rendent les leurs ailleurs : on ne réclame
      ici que ceux du ruban, `check-demo-cibles` couvrant le reste. */
const panneaux = new Set<string>()
for (const f of ["PageLayoutLayer.tsx", "PivotLayer.tsx", "MacroPanel.tsx", "ChartLayer.tsx", "DesktopLayer.tsx"]) {
  const p = path.join(COMPOSANTS, f)
  if (!fs.existsSync(p)) continue
  const src = fs.readFileSync(p, "utf8")
  for (const m of src.matchAll(/"([a-z][a-z0-9]*(?:-[a-z0-9]+)+)"/g)) panneaux.add(m[1])
}
for (const [id, u] of Object.entries(cites)) {
  if (rendus.has(id) || panneaux.has(id) || PREFIXES_ROUTES.some((p) => id.startsWith(p))) continue
  erreurs.push(`bouton CITÉ MAIS NON RENDU  ${id} — ${u.ou.join(", ")}`)
}

/* 3. Boutons rendus qu'aucun scénario n'emploie : pas une faute, un signal. */
const orphelins = [...rendus].filter((id) => !cites[id]).sort()

/* ── Rapport ──────────────────────────────────────────────────────────────── */

console.log(`Boutons rendus par le ruban : ${rendus.size}`)
console.log(`Traités par le lecteur      : ${[...rendus].filter(aUnEffet).length}`)
console.log(`Cités par les scénarios     : ${Object.keys(cites).length}`)
if (orphelins.length) console.log(`Rendus mais jamais employés : ${orphelins.length} — ${orphelins.join(", ")}`)
for (const r of remarques) console.log("  · " + r)

if (erreurs.length) {
  console.error(`\n${erreurs.length} problème(s) :\n`)
  for (const e of erreurs) console.error("  ✗ " + e)
  process.exit(1)
}
console.log("\nAucun bouton sans effet.")
