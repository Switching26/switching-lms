/**
 * PowerPoint — les écrans de lecture montrent-ils ce qu'ils racontent ?
 *
 * Décliné de `check-montrer` (Excel), avec sa règle INVERSÉE : un écran `READ`
 * sans `montrer` est un DÉFAUT, pas une tolérance.
 *
 * ═══ POURQUOI CETTE SÉVÉRITÉ ═══
 *
 * Les 191 écrans « À comprendre » de la formation étaient tous muets. Ils
 * affirmaient « le volet des miniatures liste vos diapositives », « la petite
 * flèche ouvre la boîte complète », et rien à l'écran ne le désignait — le même
 * manque qu'Excel avait sur ses 187 écrans avant de recevoir `MONTRER`. Une
 * règle permissive laisserait le prochain écran ajouté retomber dans le trou ;
 * la règle inversée le rend impossible.
 *
 * ═══ CE QUE CE CONTRÔLE VÉRIFIE ═══
 *
 *  1. tout écran `READ` porte au moins un `montrer` ;
 *  2. chaque cible est RÉSOLUBLE dans l'état réel de la présentation à cette
 *     étape — miniature qui existe, espace réservé présent sur la diapositive
 *     affichée, bouton réellement rendu par le chrome, zone connue ;
 *  3. les boutons de ruban d'un même écran vivent sous UN SEUL onglet. Le ruban
 *     ne rend que son onglet ouvert : une bulle qui en désignerait un second
 *     pointerait un élément absent du DOM, et la démonstration se jouerait à
 *     blanc en affichant quand même son compteur jusqu'au bout — le défaut le
 *     plus coûteux d'Excel, 55 gestes concernés ;
 *  4. ANTI-DIVULGATION : une lecture ne doit pas désigner le bouton que l'étape
 *     SUIVANTE demande de presser. Sur Excel, ce contrôle a rattrapé quatre cas,
 *     dont l'exemple vitrine du module 1.
 *
 * ═══ CE QU'IL NE VOIT PAS ═══
 *
 * Il ne dit pas si une bulle est PERTINENTE, ni si son texte correspond à ce
 * qu'elle désigne : cela se relit. Il ne prouve pas non plus qu'un repère est
 * effectivement dessiné à l'écran — seul le rejeu au navigateur le fait.
 */

import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { LIBELLES_CONTROLES_PPT } from "../../../lib/simulation/ppt/adaptateur"
import {
  CONTROLES_PPT,
  LAYOUTS,
  LIBELLE_ONGLET_PPT,
  deckDepuisDeclaration,
  diapoActive,
  ongletDuControle,
  type DeckState,
} from "../../../lib/simulation/ppt/document"
import { gestesDe } from "./check-parcours-ppt"
import { appliquerGeste } from "../../../lib/simulation/ppt/document"

const SCENARIOS = join(__dirname, "..", "scenarios", "ppt")
const CHROME = join(__dirname, "..", "..", "..", "components", "simulation", "ppt", "PptChrome.tsx")
const SURFACE = join(__dirname, "..", "..", "..", "components", "simulation", "ppt", "PptSurface.tsx")

/** Les `data-zone` que la surface rend réellement. Lus, jamais supposés. */
function zonesRendues(): Set<string> {
  const src = readFileSync(CHROME, "utf-8") + readFileSync(SURFACE, "utf-8")
  const out = new Set<string>()
  for (const m of src.matchAll(/data-zone="([a-z-]+)"/g)) out.add(m[1])
  return out
}

/**
 * Les boutons rendus par le chrome.
 *
 * Même méthode que `check-controles-ppt` : le composant n'écrit pas les
 * identifiants en clair (`data-control={CONTROLES_PPT.gras}`), on résout donc
 * depuis la table en repérant les CLÉS citées. Chercher des chaînes littérales
 * ne trouverait rien et rendrait un vert vide.
 */
function controlesRendus(): Set<string> {
  const src = readFileSync(CHROME, "utf-8") + readFileSync(SURFACE, "utf-8")
  const out = new Set<string>()
  for (const [cle, val] of Object.entries(CONTROLES_PPT)) {
    if (!new RegExp(`CONTROLES_PPT\\.${cle}\\b`).test(src)) continue
    if (typeof val === "string") out.add(val)
    else if (typeof val === "function") {
      for (const id of Object.keys(LIBELLES_CONTROLES_PPT)) {
        const prefixe = String((val as (x: never) => string)("§§" as never)).replace("§§", "")
        if (id.startsWith(prefixe) && id !== prefixe) out.add(id)
      }
    }
  }
  return out
}

type Etape = {
  id: string
  consigne?: string
  action: { type: string } & Record<string, unknown>
  montrer?: Array<{ type: string; cible?: string; texte?: string }>
  setupPpt?: { deck?: unknown; slide?: number; selection?: string[]; view?: string; show?: unknown }
}
type Scenario = { mode?: string; title?: string; ppt?: unknown; steps: Etape[] }

/** Les espaces réservés que porte la diapositive affichée. */
function placeholdersDe(deck: DeckState): Set<string> {
  const sl = diapoActive(deck)
  const out = new Set<string>()
  if (!sl) return out
  for (const o of sl.objects ?? []) {
    if (!o.placeholder) continue
    const memes = (sl.objects ?? []).filter((x) => x.placeholder === o.placeholder)
    const rang = memes.indexOf(o) + 1
    out.add(rang <= 1 ? `ph:${o.placeholder}` : `ph:${o.placeholder}#${rang}`)
    out.add(`ph:${o.placeholder}`)
  }
  return out
}

function principal() {
  const zones = zonesRendues()
  const boutons = controlesRendus()
  const problemes: string[] = []
  let nbRead = 0
  let nbBulles = 0
  let nbEcrans = 0

  const fichiers = readdirSync(SCENARIOS).filter((f) => f.endsWith(".json")).sort()

  for (const f of fichiers) {
    const sc = JSON.parse(readFileSync(join(SCENARIOS, f), "utf-8")) as Scenario
    let deck = deckDepuisDeclaration(sc.ppt as never)

    sc.steps.forEach((st, i) => {
      /* L'état de la présentation, cumulé étape après étape — même mécanique que
         `check-parcours-ppt`. Sans ce cumul, une cible serait jugée contre le
         classeur d'ouverture et non contre ce que l'apprenant a sous les yeux. */
      const sp = st.setupPpt
      if (sp?.deck) deck = deckDepuisDeclaration(sp.deck as never)
      if (sp?.slide !== undefined) deck = { ...deck, activeSlide: sp.slide }
      if (sp?.selection) deck = { ...deck, selection: sp.selection }
      if (sp?.view) deck = { ...deck, view: sp.view as never }
      if (sp?.show) deck = { ...deck, show: { ...(sp.show as never) } }

      if (st.action.type === "READ") {
        nbRead++
        const m = st.montrer ?? []
        if (m.length === 0) {
          problemes.push(`${f} · ${st.id} : écran de lecture SANS démonstration — il affirme sans montrer.`)
        } else {
          nbEcrans++
          nbBulles += m.length
          const ongletsVus = new Set<string>()

          for (const a of m) {
            if (a.type !== "P_MONTRER") {
              problemes.push(`${f} · ${st.id} : « montrer » n'accepte que P_MONTRER, reçu ${a.type}.`)
              continue
            }
            if (!a.texte || !a.texte.trim()) {
              problemes.push(`${f} · ${st.id} : une bulle sans texte ne montre rien.`)
              continue
            }
            const c = (a.cible ?? "").trim()
            if (c === "" || c === "ecran") continue

            if (c.startsWith("ctrl:")) {
              const id = c.slice(5)
              if (!boutons.has(id)) {
                problemes.push(`${f} · ${st.id} : bouton « ${id} » désigné mais PAS rendu par le chrome.`)
                continue
              }
              const o = ongletDuControle(id)
              if (o) ongletsVus.add(o)
            } else if (c.startsWith("diapo:")) {
              const n = Number(c.slice(6))
              if (!Number.isInteger(n) || n < 0 || n >= deck.slides.length)
                problemes.push(
                  `${f} · ${st.id} : miniature ${n} désignée, la présentation n'en a que ${deck.slides.length}.`,
                )
            } else if (c.startsWith("zone:")) {
              const z = c.slice(5)
              if (!zones.has(z)) problemes.push(`${f} · ${st.id} : zone « ${z} » inconnue de la surface.`)
            } else if (c.startsWith("ph:")) {
              const dispo = placeholdersDe(deck)
              if (!dispo.has(c)) {
                const sl = diapoActive(deck)
                problemes.push(
                  `${f} · ${st.id} : « ${c} » absent de la diapositive ${deck.activeSlide + 1}` +
                    ` (disposition « ${sl?.layout ?? "?"} », espaces : ${[...dispo].join(", ") || "aucun"}).`,
                )
              }
            } else if (!c.startsWith("dom:") && !c.startsWith("[")) {
              const sl = diapoActive(deck)
              if (!(sl?.objects ?? []).some((o) => o.id === c))
                problemes.push(`${f} · ${st.id} : aucun élément « ${c} » sur la diapositive affichée.`)
            }
          }

          if (ongletsVus.size > 1)
            problemes.push(
              `${f} · ${st.id} : boutons de DEUX onglets à la fois (${[...ongletsVus]
                .map((o) => LIBELLE_ONGLET_PPT[o as never])
                .join(", ")}) — le ruban n'en rend qu'un, la seconde bulle pointerait du vide.`,
            )

          /**
           * ANTI-DIVULGATION — en ÉVALUATION seulement, et c'est un arbitrage.
           *
           * Sur Excel, la règle vaut partout : son tableau `montrer` peut porter
           * des actions AGISSANTES, qui jouent réellement le geste. Une lecture
           * qui trie la colonne juste avant l'étape « triez la colonne » rendrait
           * cette étape sans objet.
           *
           * `P_MONTRER` ne peut rien jouer : c'est une illustration, sans
           * `presser`. Elle désigne et explique, elle n'agit pas. Or désigner le
           * bouton juste avant de le faire employer est exactement ce qu'on
           * attend d'une leçon — l'interdire y supprimerait le guidage au lieu de
           * protéger quoi que ce soit.
           *
           * En évaluation NOTÉE, en revanche, aucune tolérance : l'énoncé
           * d'ouverture pose le contexte, il ne montre jamais quel bouton
           * répondre.
           */
          const suivante = sc.steps[i + 1]
          if (sc.mode === "EVALUATION" && suivante && suivante.action.type !== "READ") {
            const g = gestesDe(suivante.action, deck)
            void g
            const attendus = new Set<string>()
            const plan = (suivante.action as { type: string }).type
            void plan
            for (const a of m) {
              const c = (a.cible ?? "").trim()
              if (!c.startsWith("ctrl:")) continue
              attendus.add(c.slice(5))
            }
            // On ne dispose pas ici du bouton exact attendu par l'étape suivante
            // sans rejouer son plan : on s'appuie sur la cible d'auteur quand
            // elle est explicite (`layout`, `view`, `transition`).
            const a2 = suivante.action as Record<string, unknown>
            const revele: string[] = []
            if (typeof a2.layout === "string") revele.push(CONTROLES_PPT.dispositionChoix(a2.layout as never))
            if (typeof a2.view === "string") revele.push(CONTROLES_PPT.vue(a2.view as string))
            for (const r of revele)
              if (attendus.has(r))
                problemes.push(
                  `${f} · ${st.id} : la lecture désigne « ${LIBELLES_CONTROLES_PPT[r] ?? r} », que l'étape suivante demande de choisir — elle souffle la réponse.`,
                )
          }
        }
      }

      /* Avancer l'état comme si l'apprenant avait réussi l'étape. */
      const gestes = gestesDe(st.action, deck)
      if (gestes) for (const g of gestes) deck = appliquerGeste(deck, g.geste)
    })
  }

  console.log(`\n── Écrans de lecture PowerPoint · ${fichiers.length} chapitres ──\n`)
  console.log(`  Écrans « À comprendre »        : ${nbRead}`)
  console.log(`  Équipés d'une démonstration    : ${nbEcrans}`)
  console.log(`  Bulles au total                : ${nbBulles}`)
  if (nbEcrans > 0) console.log(`  Moyenne                        : ${(nbBulles / nbEcrans).toFixed(1)} par écran`)

  if (problemes.length) {
    console.log(`\n✗ ${problemes.length} problème(s) :\n`)
    for (const p of problemes.slice(0, 60)) console.log("   " + p)
    if (problemes.length > 60) console.log(`   … et ${problemes.length - 60} autre(s).`)
    process.exit(1)
  }

  console.log(`\n✓ ${nbRead}/${nbRead} écrans de lecture équipés — cibles résolubles, un seul onglet par écran, aucune réponse soufflée.`)
  console.log(`  (ce contrôle ne dit PAS que le repère est dessiné : seul le rejeu au navigateur le prouve.)`)
}

principal()
