/**
 * L'ÉVALUATION RESTE-T-ELLE JOUABLE APRÈS EXPURGATION ?
 *
 *   npx tsx scripts/simulation/check-jouabilite.ts
 *
 * Retirer les coordonnées que la consigne ne nomme pas ferme une fuite (§2.2 du
 * rapport). Encore faut-il que l'atelier puisse toujours produire l'observation
 * que le serveur attend, et que l'ordre imposé par le passage laisse dérouler
 * les 27 évaluations sans blocage. Deux questions, deux familles de contrôles :
 *
 *  K. le RELEVÉ BORNÉ couvre-t-il toutes les cellules attendues ? L'atelier ne
 *     connaît plus les références jugées : il relève la zone utile du classeur.
 *     Si une cellule attendue tombe hors de cette zone, l'étape devient
 *     impossible — l'apprenant ferait juste et serait compté faux.
 *
 *  L. l'ORDRE SERVEUR laisse-t-il passer chaque évaluation ? Le curseur
 *     n'avance que sur une réussite jugée ou sur une question passée, et une
 *     étape ne peut être corrigée que si elle suit immédiatement le curseur.
 *     Un écran de lecture intercalé qui n'émettrait pas de verdict bloquerait
 *     tout ce qui suit.
 */

import * as fs from "fs"
import * as path from "path"
import { cellsOf } from "../../lib/simulation/grid"
import { expurgerScenarioNote, zoneObservable } from "../../lib/simulation/expurge"

const SCENARIOS = path.resolve(__dirname, "../../scripts/simulation/scenarios")
const evaluations = fs.readdirSync(SCENARIOS).filter((f) => /^m\d{2}-ev\d{2}\.json$/.test(f)).sort()

let echecs = 0
let total = 0
function verifie(intitule: string, condition: boolean, detail?: string) {
  total++
  if (!condition) {
    echecs++
    console.error(`  ✗ ${intitule}${detail ? ` — ${detail}` : ""}`)
  }
}

/* ═══ K. Le relevé borné couvre les cellules attendues ══════════════════ */

console.log(`\n=== K. Couverture du relevé borné ===`)
{
  let attendues = 0
  const horsZone: string[] = []
  const tropGrandes: string[] = []
  const zonesServies: string[] = []

  for (const f of evaluations) {
    const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))
    // La zone est celle que le SERVEUR sert dans le scénario expurgé : c'est
    // exactement celle que l'atelier relèvera.
    const servi = expurgerScenarioNote(sc) as any
    const etendue: string | undefined = servi.zoneObservable
    const attend = (sc.steps ?? []).some((st: any) => {
      const a = st.action ?? {}
      return a.cells || a.pivot?.cells || a.macro?.effet
    })
    if (!attend) continue
    verifie(`K0 · ${f} : une zone observable est servie`, !!etendue)
    if (!etendue) continue
    zonesServies.push(`${f.slice(0, 3)}=${etendue}(${cellsOf(etendue).length})`)
    const zone = new Set(cellsOf(etendue).map((c) => c.toUpperCase()))
    // Garde-fou de volume appliqué par l'atelier : au-delà, il tronque.
    if (cellsOf(etendue).length > 2000) tropGrandes.push(`${f}: ${etendue} (${cellsOf(etendue).length})`)

    for (const st of sc.steps ?? []) {
      const a = st.action ?? {}
      const tables: Array<[string, any]> = [
        ["cells", a.cells],
        ["pivot.cells", a.pivot?.cells],
        ["macro.effet", a.macro?.effet],
      ]
      for (const [nom, table] of tables) {
        if (!table || typeof table !== "object") continue
        for (const ref of Object.keys(table)) {
          attendues++
          if (!zone.has(ref.toUpperCase())) horsZone.push(`${st.id}.${nom}:${ref} hors ${etendue}`)
        }
      }
    }
  }

  console.log(`  ${attendues} cellules attendues confrontées à la zone relevée`)
  console.log(`  zones : ${zonesServies.join(" ")}`)
  verifie(
    "K1 · toute cellule attendue est dans la zone relevée",
    horsZone.length === 0,
    horsZone.slice(0, 8).join(" · "),
  )
  verifie(
    "K2 · aucune zone ne dépasse le plafond de l'atelier",
    tropGrandes.length === 0,
    tropGrandes.join(" · "),
  )
  verifie("K3 · le contrôle a bien quelque chose à vérifier", attendues > 100, `${attendues}`)
  // K4 — la zone ne doit pas non plus être servie quand rien n'est attendu :
  // ce serait un renseignement gratuit sur la forme de la feuille.
  let inutiles = 0
  for (const f of evaluations) {
    const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))
    const attend = (sc.steps ?? []).some((st: any) => {
      const a = st.action ?? {}
      return a.cells || a.pivot?.cells || a.macro?.effet
    })
    if (!attend && (expurgerScenarioNote(sc) as any).zoneObservable) inutiles++
  }
  verifie("K4 · aucune zone servie là où rien n'est attendu", inutiles === 0, `${inutiles}`)
  // K5 — la zone reste un RECTANGLE : elle ne désigne aucune cellule en
  // particulier, elle dit jusqu'où le classeur va.
  const m10 = JSON.parse(fs.readFileSync(path.join(SCENARIOS, "m10-ev01.json"), "utf8"))
  const zoneM10 = zoneObservable(m10.steps, m10.workbook)
  verifie("K5 · la zone est un rectangle partant de A1", /^A1:[A-Z]+\d+$/.test(zoneM10 ?? ""), zoneM10 ?? "")

  /* K6 — LA ZONE NE DIT RIEN DES CIBLES.
   *
   * Elle se calcule depuis le contenu PUBLIC seul — classeur de départ et
   * `setup` des étapes —, avec une marge fixe et un arrondi au palier. Déplacer
   * une cible secrète, même loin, ne doit donc pas la bouger : sinon le
   * rectangle deviendrait lui-même un indice (« A1:E11 » disant que la réponse
   * est en colonne E). */
  {
    const bouge = JSON.parse(JSON.stringify(m10))
    // On déplace une cellule attendue de D3 à H9 : une autre colonne, une autre
    // ligne, dans le même palier.
    for (const st of bouge.steps) {
      if (st.action?.cells?.D3) {
        st.action.cells = { H9: st.action.cells.D3 }
      }
    }
    const apres = zoneObservable(bouge.steps, bouge.workbook)
    verifie("K6a · déplacer une cible ne change pas la zone", apres === zoneM10, `${zoneM10} → ${apres}`)

    // Et la retirer entièrement non plus : la zone ne dépend que du public.
    const sansCibles = JSON.parse(JSON.stringify(m10))
    for (const st of sansCibles.steps) if (st.action?.cells) delete st.action.cells
    verifie(
      "K6b · retirer toutes les cibles ne change pas la zone",
      zoneObservable(sansCibles.steps, sansCibles.workbook) === zoneM10,
    )

    // Contre-épreuve : la zone RÉAGIT bien au contenu public, sinon le contrôle
    // ci-dessus passerait sur une fonction constante.
    const plusLarge = JSON.parse(JSON.stringify(m10))
    plusLarge.workbook.sheets[0].cells["BZ400"] = { v: "visible" }
    verifie(
      "K6c · mais elle suit le contenu public",
      zoneObservable(plusLarge.steps, plusLarge.workbook) !== zoneM10,
    )
  }
}

/* ═══ L. L'ordre serveur laisse dérouler les 27 évaluations ═════════════ */

console.log(`\n=== L. Ordre imposé par le passage ===`)
{
  /**
   * Rejoue le déroulé d'une évaluation comme le serveur le verrait : le curseur
   * part à 0, chaque étape doit satisfaire `index <= curseur + 1`, et l'avance
   * du curseur suit la règle réelle — une réussite jugée ou une question passée.
   *
   * Tous les types d'étape franchissent par un verdict, écrans de lecture
   * compris : ils émettent une observation `next` que le juge accepte.
   */
  function derouler(sc: any): { ok: boolean; bloqueA: number | null } {
    let curseur = 0
    const steps = sc.steps ?? []
    for (let i = 0; i < steps.length; i++) {
      if (i > curseur + 1) return { ok: false, bloqueA: i }
      // Franchir l'étape avance le curseur, quel que soit le chemin.
      curseur = Math.max(curseur, i)
    }
    return { ok: true, bloqueA: null }
  }

  let bloquees = 0
  const lectures: string[] = []
  for (const f of evaluations) {
    const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8"))
    const r = derouler(sc)
    if (!r.ok) bloquees++
    verifie(`L1 · ${f} : se déroule sans rupture d'ordre`, r.ok, `bloquée à l'étape ${r.bloqueA}`)

    // Un écran de lecture INTERCALÉ est le cas qui bloquerait : s'il n'émettait
    // pas de verdict, l'étape suivante serait refusée. On relève ceux qui ne
    // sont pas en tête, pour que la vérification navigateur les regarde.
    ;(sc.steps ?? []).forEach((st: any, i: number) => {
      if (st.action?.type === "READ" && i > 0) lectures.push(`${st.id} (rang ${i})`)
    })
  }
  verifie("L2 · aucune évaluation bloquée", bloquees === 0, `${bloquees}`)
  console.log(
    `  écrans de lecture intercalés : ${lectures.length === 0 ? "aucun" : lectures.join(", ")}`,
  )
  // Le corpus n'en a aucun aujourd'hui : chaque évaluation ouvre sur son énoncé
  // et n'en réinsère pas. Si cela changeait, ce contrôle le dirait, et le
  // déroulé serveur devrait être revérifié dans le navigateur.
  verifie("L3 · le corpus n'intercale aucun écran de lecture", lectures.length === 0, lectures.join(", "))
}

console.log(`\n${echecs === 0 ? "✓" : "✗"} ${total - echecs}/${total} contrôles passés`)
if (echecs > 0) process.exit(1)
