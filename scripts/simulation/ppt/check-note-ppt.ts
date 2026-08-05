/**
 * PowerPoint — la NOTE des seize évaluations réelles. Sans navigateur ni base.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ CE FICHIER REMPLACE UN FAUX TÉMOIN.
 *
 * Sa version précédente notait une évaluation SYNTHÉTIQUE de six étapes, écrite
 * dans le fichier lui-même — aucun contenu du dépôt. Elle affichait « ✓
 * évaluation à 100 % » sans avoir jamais regardé une seule des seize évaluations
 * que les apprenants passent. Pendant ce temps PowerPoint ne rendait perdables
 * que 165 de ses 309 points, et l'évaluation du module 3 tombait à 12 % : s'y
 * tromper partout laissait 88 %.
 *
 * C'est le troisième des quatre faux témoins du dépôt, et le plus coûteux : un
 * contrôle qui invente son propre contenu ne peut rien mesurer.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * TROIS PROPRIÉTÉS, dans cet ordre d'importance.
 *
 *  1. UN PARCOURS SANS FAUTE VAUT 100 %. Pour chaque étape, `gestesDe` fabrique
 *     le geste qu'un apprenant produit en faisant exactement ce que la consigne
 *     demande ; `jugerEtape` — le MÊME juge que l'atelier et que la route de
 *     correction serveur — rend le verdict ; la note se recalcule avec la règle
 *     de `run.ts` (points des seules étapes réussies au premier essai, écrans de
 *     lecture et étapes à zéro point exclus).
 *
 *  2. UNE FAUTE COÛTE VRAIMENT DES POINTS. Sans cette contre-épreuve, un juge
 *     qui dirait « oui » à tout rendrait aussi 100 % et le vert ne prouverait
 *     rien.
 *
 *     🔴 ET LA CONTRE-ÉPREUVE INJECTE UNE **CONTRADICTION**, JAMAIS UNE ABSENCE.
 *     C'est la leçon que Word a payée : injecter un document où rien n'a été
 *     fait ne mesure rien, parce que « ne rien faire » n'est pas « se tromper »
 *     — le juge rend `no_…`, à juste titre, et la mesure conclut à tort que le
 *     point est imperdable. On POSE donc systématiquement un autre choix que
 *     celui demandé : une autre diapositive, une autre disposition, un autre
 *     texte, une autre taille de police.
 *
 *  3. LA NOTE PEUT RÉELLEMENT DESCENDRE — ET LE CONTRÔLE ÉCHOUE SINON.
 *     Deux planchers, les mêmes que Word, et pour les mêmes raisons :
 *
 *     • PAR ÉVALUATION, 50 %. Une évaluation dont moins de la moitié des points
 *       sont perdables rend la moyenne à un apprenant qui se trompe partout.
 *       Ces évaluations sont opposables — Switching Formation est un organisme
 *       Qualiopi — donc ce plancher ne se négocie pas à la baisse.
 *
 *     • GLOBAL, 70 %. C'est le profil MESURÉ d'Excel (358/513), la seule des
 *       quatre formations en production. PowerPoint n'a aucune raison de noter
 *       plus mollement.
 *
 *     Ce qui reste imperdable après correction l'est PAR NATURE, et le contrôle
 *     le NOMME au lieu de le taire : un attribut booléen (« mettez ce texte en
 *     gras ») n'a pas de mauvaise valeur — le remettre en maigre, c'est ne pas
 *     l'avoir fait ; et un diaporama ne se contredit pas, on le lance, on
 *     avance, on le quitte.
 *
 * CE QU'IL NE PROUVE PAS : qu'un attendu est atteignable à l'écran. Le geste
 * est construit depuis l'attente elle-même, donc la comparaison est circulaire
 * sur ce point — c'est le rôle de `check-parcours-ppt` et du joueur du banc.
 *
 * USAGE
 *   npx tsx scripts/simulation/ppt/check-note-ppt.ts
 *   npx tsx scripts/simulation/ppt/check-note-ppt.ts --piege   (auto-épreuve)
 */

import { readFileSync, readdirSync, existsSync } from "fs"
import { join } from "path"
import { observationDuGeste } from "../../../components/simulation/ppt/PptPlayer"
import {
  appliquerGeste,
  deckDepuisDeclaration,
  diapoActive,
  trouverObjet,
  type DeckState,
  type GestePpt,
} from "../../../lib/simulation/ppt/document"
import { adaptateurPpt } from "../../../lib/simulation/ppt/adaptateur"
import { jugerEtape } from "../../../lib/simulation/frappe"
import type { SimulationStep } from "../../../lib/simulation/types"
/* SOURCE UNIQUE du geste juste. Le dupliquer ici ferait diverger le contrôle de
   note du contrôle de parcours : deux dérivations, deux vérités, et le jour où
   l'une se corrige, l'autre continue de mesurer l'ancien monde. */
import { gestesDe } from "./check-parcours-ppt"

const DOSSIER = join(__dirname, "..", "scenarios", "ppt")
const PLANCHER_PAR_EVALUATION = 50
const PLANCHER_GLOBAL = 70

type Etape = SimulationStep & { id: string; points?: number; setupPpt?: any }
type Scenario = { title?: string; mode?: string; ppt?: any; steps: Etape[] }

/* ═══════════ LA CONTRADICTION ═══════════ */

/** Une valeur DIFFÉRENTE et non neutre, du même genre que celle attendue. */
function autreValeur(cle: string, attendue: unknown): unknown | null {
  // Un booléen n'a pas de mauvaise valeur : son contraire est sa valeur de
  // repos, donc « pas encore fait ». Aucune contradiction possible.
  if (typeof attendue === "boolean") return null
  if (typeof attendue === "number") return attendue === 99 ? 42 : 99
  if (typeof attendue === "string") {
    if (cle === "align") return attendue === "center" ? "left" : "center"
    if (/color|fill/i.test(cle)) return attendue === "#B00020" ? "#0057B8" : "#B00020"
    return attendue === "autre-valeur" ? "valeur-autre" : "autre-valeur"
  }
  return null
}

type Coup = { geste: GestePpt; canal: string }
/** `null` = aucune contradiction possible ; `raison` dit alors pourquoi. */
type Contre = { coups: Coup[] } | { raison: string }

function contredire(action: any, deck: DeckState): Contre {
  const slide = diapoActive(deck)
  const n = deck.slides.length
  const autreIndex = (i: number) => (i === 0 ? Math.min(1, n - 1) : 0)

  switch (action.type) {
    case "P_SELECT_SLIDE": {
      const j = autreIndex(action.index)
      return j === action.index
        ? { raison: "présentation d'une seule diapositive : aucune autre à choisir" }
        : { coups: [{ geste: { type: "selectSlide", index: j }, canal: "mouse" }] }
    }

    case "P_DELETE_SLIDE":
    case "P_DUPLICATE_SLIDE": {
      const j = autreIndex(action.index)
      return !deck.slides[j] || j === action.index
        ? { raison: "aucune autre diapositive sur laquelle se tromper" }
        : {
            coups: [
              {
                geste: {
                  type: action.type === "P_DELETE_SLIDE" ? "deleteSlide" : "duplicateSlide",
                  index: j,
                } as GestePpt,
                canal: "ribbon",
              },
            ],
          }
    }

    case "P_MOVE_SLIDE": {
      const sens = action.to > action.from ? -1 : 1
      const cible = Math.max(0, Math.min(n - 1, action.from + sens))
      return cible === action.from
        ? { raison: "la diapositive est déjà à une extrémité" }
        : { coups: [{ geste: { type: "moveSlide", from: action.from, to: cible }, canal: "ribbon" }] }
    }

    case "P_SET_LAYOUT":
      return {
        coups: [
          {
            geste: {
              type: "setLayout",
              index: deck.activeSlide ?? 0,
              layout: action.layout === "titre-seul" ? "vide" : "titre-seul",
            } as GestePpt,
            canal: "ribbon",
          },
        ],
      }

    case "P_ADD_SLIDE":
      // Sans disposition imposée, ajouter une diapositive ne peut pas se rater.
      return action.layout
        ? {
            coups: [
              {
                geste: {
                  type: "addSlide",
                  layout: action.layout === "vide" ? "titre-seul" : "vide",
                } as GestePpt,
                canal: "ribbon",
              },
            ],
          }
        : { raison: "aucune disposition imposée : l'ajout ne peut pas être fautif" }

    case "P_SET_VIEW":
      return {
        coups: [
          {
            geste: { type: "setView", view: action.view === "trieuse" ? "normal" : "trieuse" } as GestePpt,
            canal: "ribbon",
          },
        ],
      }

    case "P_SELECT_OBJECT": {
      const autre = slide?.objects.find((o) => o.id !== action.objectId)
      return autre
        ? { coups: [{ geste: { type: "selectObject", objectId: autre.id }, canal: "mouse" }] }
        : { raison: "un seul élément sur la diapositive" }
    }

    case "P_DELETE_OBJECT": {
      const autre = slide?.objects.find((o) => o.id !== action.objectId && !o.locked)
      return autre
        ? { coups: [{ geste: { type: "deleteObject", objectId: autre.id }, canal: "keyboard" }] }
        : { raison: "aucun autre élément supprimable" }
    }

    case "P_MOVE_OBJECT": {
      const obj = slide ? trouverObjet(slide, action.objectId) : null
      if (!obj?.rect) return { raison: "élément introuvable" }
      return {
        coups: [
          {
            geste: {
              type: "moveObject",
              objectId: obj.id,
              rect: { ...obj.rect, x: 8, y: 8 },
              resize: false,
            } as GestePpt,
            canal: "mouse",
          },
        ],
      }
    }

    case "P_ADD_OBJECT":
      return {
        coups: [
          {
            geste: {
              type: "addObject",
              objectType: action.objectType === "texte" ? "image" : "texte",
              rect: { x: 300, y: 220, w: 300, h: 120 },
            } as GestePpt,
            canal: "ribbon",
          },
        ],
      }

    case "P_TYPE_TEXT": {
      const obj = slide ? trouverObjet(slide, action.cible) : null
      return obj
        ? {
            coups: [
              {
                geste: {
                  type: "editText",
                  objectId: obj.id,
                  paragraphe: 0,
                  text: "Reponse fausse volontaire",
                } as GestePpt,
                canal: "keyboard",
              },
            ],
          }
        : { raison: "cible de saisie introuvable" }
    }

    case "P_EXPECT_FORMAT": {
      const obj = slide ? trouverObjet(slide, action.objectId) : null
      if (!obj) return { raison: "élément introuvable" }
      const style: Record<string, unknown> = {}
      for (const [cle, val] of Object.entries(action.style ?? {})) {
        const autre = autreValeur(cle, val)
        if (autre !== null) style[cle] = autre
      }
      const fill = action.fill !== undefined ? autreValeur("fill", action.fill) : null
      /* Consigne purement booléenne (« mettez en gras ») : l'attribut n'a pas de
         mauvaise valeur, mais le GESTE en a une. On clique donc un AUTRE bouton
         de mise en forme — c'est exactement l'erreur d'un apprenant qui se
         trompe de bouton, et elle doit coûter. */
      if (!Object.keys(style).length && fill === null) {
        const demandes = Object.keys(action.style ?? {})
        const autreBouton = ["underline", "italic", "bold"].find((b) => !demandes.includes(b))
        if (!autreBouton) return { raison: "tous les boutons de mise en forme sont déjà demandés" }
        return {
          coups: [
            {
              geste: { type: "format", objectId: obj.id, style: { [autreBouton]: true } } as GestePpt,
              canal: "ribbon",
            },
          ],
        }
      }
      return {
        coups: [
          {
            geste: { type: "format", objectId: obj.id, style, ...(fill !== null ? { fill } : {}) } as GestePpt,
            canal: "ribbon",
          },
        ],
      }
    }

    case "P_EXPECT_ANIMATIONS": {
      const attendues = action.animations ?? []
      const premiere = attendues[0]
      if (!premiere?.objectId || !premiere.kind) return { raison: "animation sans cible déclarée" }
      const obj = slide ? trouverObjet(slide, premiere.objectId) : null
      if (!obj) return { raison: "élément à animer introuvable" }
      return {
        coups: [
          {
            geste: {
              type: "addAnimation",
              objectId: obj.id,
              kind: premiere.kind === "fondu" ? "apparaitre" : "fondu",
            } as GestePpt,
            canal: "ribbon",
          },
        ],
      }
    }

    case "P_EXPECT_DECK": {
      const att = action.deck ?? {}
      // On contredit LE critère que l'étape juge, pas un critère voisin.
      const cible = (att.slides ?? [])[0]
      const iCible = cible?.index ?? deck.activeSlide ?? 0
      if (cible) {
        if (cible.layout)
          return {
            coups: [
              {
                geste: {
                  type: "setLayout",
                  index: iCible,
                  layout: cible.layout === "titre-seul" ? "vide" : "titre-seul",
                } as GestePpt,
                canal: "ribbon",
              },
            ],
          }
        if (typeof cible.notes === "string")
          return {
            coups: [
              {
                geste: { type: "setNotes", index: iCible, notes: "notes fausses volontaires" } as GestePpt,
                canal: "panel",
              },
            ],
          }
        if (cible.transition?.kind)
          return {
            coups: [
              {
                geste: {
                  type: "setTransition",
                  index: iCible,
                  transition: { kind: cible.transition.kind === "fondu" ? "balayage" : "fondu", duree: 0.7 },
                } as GestePpt,
                canal: "ribbon",
              },
            ],
          }
        const [ph] = Object.keys(cible.textes ?? {})
        if (ph) {
          const s = deck.slides[iCible]
          const obj = s ? trouverObjet(s, `ph:${ph}`) : null
          if (obj)
            return {
              coups: [
                {
                  geste: {
                    type: "editText",
                    objectId: obj.id,
                    paragraphe: 0,
                    text: "Texte faux volontaire",
                  } as GestePpt,
                  canal: "keyboard",
                },
              ],
            }
        }
        if (cible.masquee === false)
          return { coups: [{ geste: { type: "toggleMasquee", index: iCible } as GestePpt, canal: "ribbon" }] }
      }
      // Une diapositive DE TROP : c'est un ajout que personne n'a demandé.
      if (att.nbSlides !== undefined)
        return { coups: [{ geste: { type: "addSlide" } as GestePpt, canal: "ribbon" }] }
      return { raison: "aucun critère contredisable dans l'état attendu" }
    }

    case "P_EXPECT_SHOW":
      return { raison: "un diaporama ne se contredit pas : on le lance, on avance, on le quitte" }

    default:
      return { raison: `type non couvert par la contre-épreuve : ${action.type}` }
  }
}

/* ═══════════ REJEU D'UNE ÉVALUATION ═══════════ */

function poserDecor(deck: DeckState, sp: any): DeckState {
  if (!sp) return deck
  let d = deck
  if (sp.deck) d = deckDepuisDeclaration(sp.deck)
  if (sp.slide !== undefined) d = { ...d, activeSlide: sp.slide }
  if (sp.selection) d = { ...d, selection: sp.selection }
  if (sp.view) d = { ...d, view: sp.view }
  if (sp.show) d = { ...d, show: { ...sp.show } }
  return d
}

type Bilan = {
  fichier: string
  titre?: string
  total: number
  acquis: number
  perdables: number
  nonJoues: string[]
  imperdables: { etape: string; type: string; raison: string }[]
}

function evaluer(fichier: string, sc: Scenario, saboterEtape?: string): Bilan {
  let deck = deckDepuisDeclaration(sc.ppt)
  const b: Bilan = { fichier, titre: sc.title, total: 0, acquis: 0, perdables: 0, nonJoues: [], imperdables: [] }

  for (const step of sc.steps) {
    deck = poserDecor(deck, step.setupPpt)
    const action: any = step.action
    if (action.type === "READ") continue
    const pts = step.points ?? 1
    if (pts <= 0) continue
    b.total += pts

    /* ── (2) La contradiction coûte-t-elle le point ? ──
       Jouée sur une COPIE du deck : la mesure ne doit pas polluer le parcours. */
    const contre = contredire(action, deck)
    let coute = false
    if ("coups" in contre) {
      let d = deck
      for (const c of contre.coups) {
        const apres = appliquerGeste(d, c.geste)
        const spec = observationDuGeste(c.geste, apres, c.canal as any)
        d = apres
        for (const obs of [...(spec ? [spec] : []), { kind: "p:deckChange", deck: apres, channel: c.canal } as any]) {
          const j = jugerEtape(step as SimulationStep, obs as any, adaptateurPpt)
          if (!j.ok && j.compte === "faute") coute = true
        }
      }
      if (!coute)
        b.imperdables.push({ etape: step.id, type: action.type, raison: "la contradiction ne compte aucune faute" })
    } else {
      b.imperdables.push({ etape: step.id, type: action.type, raison: contre.raison })
    }
    if (coute) b.perdables += pts

    /* ── (1) Le parcours JUSTE — et l'auto-épreuve, qui sabote une étape ── */
    let fauteAvant = false
    if (saboterEtape === step.id && "coups" in contre) {
      for (const c of contre.coups) {
        const apres = appliquerGeste(deck, c.geste)
        const spec = observationDuGeste(c.geste, apres, c.canal as any)
        deck = apres
        for (const obs of [...(spec ? [spec] : []), { kind: "p:deckChange", deck: apres, channel: c.canal } as any]) {
          const j = jugerEtape(step as SimulationStep, obs as any, adaptateurPpt)
          if (!j.ok && j.compte === "faute") fauteAvant = true
        }
      }
    }

    const suite = gestesDe(action, deck)
    if (!suite) {
      b.nonJoues.push(`${step.id} (${action.type}) — le contrôle ne sait pas jouer ce type`)
      continue
    }
    let franchie = false
    for (const { geste, canal } of suite) {
      const apres = appliquerGeste(deck, geste)
      const spec = observationDuGeste(geste, apres, canal as any)
      deck = apres
      for (const obs of [...(spec ? [spec] : []), { kind: "p:deckChange", deck: apres, channel: canal } as any]) {
        if (franchie) break
        const j = jugerEtape(step as SimulationStep, obs as any, adaptateurPpt)
        if (!j.ok && j.compte === "faute") fauteAvant = true
        if (j.ok) franchie = true
      }
      if (franchie) break
    }
    /* Le diaporama demande parfois plusieurs clics : même repli que le contrôle
       de parcours, sinon l'étape passerait pour injouable. */
    if (!franchie && action.type === "P_EXPECT_SHOW") {
      for (let k = 0; k < 12 && !franchie; k += 1) {
        const apres = appliquerGeste(deck, { type: "showNext" })
        const obs = observationDuGeste({ type: "showNext" }, apres, "mouse" as any)
        deck = apres
        for (const o of [obs, { kind: "p:deckChange", deck: apres, channel: "mouse" } as any]) {
          if (!o || franchie) continue
          if (jugerEtape(step as SimulationStep, o as any, adaptateurPpt).ok) franchie = true
        }
      }
    }
    if (!franchie) b.nonJoues.push(`${step.id} (${action.type}) — aucun geste juste ne la franchit`)
    else if (!fauteAvant) b.acquis += pts
  }
  return b
}

/* ═══════════ EXÉCUTION ═══════════ */

function principal() {
  if (!existsSync(DOSSIER)) {
    console.log("  — aucun scénario PowerPoint pour l'instant.")
    return
  }
  const piege = process.argv.includes("--piege")
  const detail = process.argv.includes("--detail")
  const fichiers = readdirSync(DOSSIER)
    .filter((f) => /-ev\d+\.json$/.test(f))
    .sort()

  const anomalies: string[] = []
  let pointsTotal = 0
  let pointsPerdables = 0
  let evaluations = 0

  console.log("── Note des seize évaluations PowerPoint ──\n")
  for (const f of fichiers) {
    const sc = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8")) as Scenario
    if ((sc.mode ?? "") !== "EVALUATION") continue
    evaluations += 1
    const b = evaluer(f, sc)
    pointsTotal += b.total
    pointsPerdables += b.perdables
    const note = b.total === 0 ? 0 : Math.round((b.acquis / b.total) * 1000) / 10
    const part = b.total === 0 ? 0 : (b.perdables / b.total) * 100

    const ok = note === 100 && b.nonJoues.length === 0 && part >= PLANCHER_PAR_EVALUATION
    console.log(
      `  ${ok ? "✓" : "✗"} ${f.padEnd(14)} parcours sans faute ${String(note).padStart(5)} %` +
        `   ${String(b.perdables).padStart(2)}/${String(b.total).padStart(2)} pts perdables (${part.toFixed(0).padStart(3)} %)`,
    )
    for (const x of b.nonJoues) console.log(`      ✗ ${x}`)
    if (note !== 100)
      anomalies.push(`${f} : un parcours SANS FAUTE ne rend que ${note} % — la note est fausse pour tout le monde`)
    if (b.nonJoues.length) anomalies.push(`${f} : ${b.nonJoues.length} étape(s) qu'aucun geste juste ne franchit`)
    if (part < PLANCHER_PAR_EVALUATION)
      anomalies.push(
        `${f} : seuls ${b.perdables}/${b.total} points (${part.toFixed(0)} %) sont perdables — sous le ` +
          `plancher de ${PLANCHER_PAR_EVALUATION} %, un apprenant qui se trompe partout garde la moyenne`,
      )
    if (detail) for (const i of b.imperdables) console.log(`      · ${i.etape} (${i.type}) imperdable : ${i.raison}`)
  }

  /* ── AUTO-ÉPREUVE : le contrôle sait-il dire NON ? ──
     Un détecteur qu'on n'a pas piégé ne prouve rien. On sabote une étape de la
     première évaluation et on exige que la note DESCENDE. */
  if (piege) {
    const f = fichiers[0]
    const sc = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8")) as Scenario
    const depart = deckDepuisDeclaration(sc.ppt)
    const cible = sc.steps.find(
      (s: any) => s.action?.type !== "READ" && (s.points ?? 1) > 0 && "coups" in contredire(s.action, depart),
    ) as Etape | undefined
    const sabote = evaluer(f, sc, cible?.id)
    const note = sabote.total === 0 ? 0 : Math.round((sabote.acquis / sabote.total) * 1000) / 10
    console.log(`\n── Auto-épreuve — une faute volontaire sur ${cible?.id} de ${f} ──`)
    console.log(`  note obtenue : ${note} % (doit être strictement < 100)`)
    if (note >= 100)
      anomalies.push("AUTO-ÉPREUVE : une faute volontaire n'a rien coûté — ce contrôle n'est qu'un afficheur")
  }

  const part = pointsTotal === 0 ? 0 : (pointsPerdables / pointsTotal) * 100
  console.log(
    `\n  ${pointsPerdables}/${pointsTotal} points (${part.toFixed(0)} %) sont réellement perdables sur une ` +
      `réponse fausse — plancher ${PLANCHER_GLOBAL} % (le profil mesuré d'Excel).`,
  )
  console.log(
    "  Le reste est imperdable PAR NATURE : un diaporama ne se contredit pas — on le lance,\n" +
      "  on avance, on le quitte —, et certaines étapes n'ont pas d'autre cible sur laquelle\n" +
      "  se tromper (présentation d'une seule diapositive, ajout sans disposition imposée).",
  )
  if (part < PLANCHER_GLOBAL)
    anomalies.push(
      `GLOBAL : seuls ${pointsPerdables}/${pointsTotal} points (${part.toFixed(0)} %) sont perdables, ` +
        `sous le plancher de ${PLANCHER_GLOBAL} % — Excel, à socle identique, est à 70 %`,
    )

  if (!anomalies.length) {
    console.log(`\n✓ ${evaluations} évaluation(s) : parcours sans faute à 100 %, barème discriminant.`)
    return
  }
  console.log("\n✗ ANOMALIES :")
  for (const a of anomalies) console.log(`  · ${a}`)
  process.exit(1)
}

if (require.main === module) principal()
