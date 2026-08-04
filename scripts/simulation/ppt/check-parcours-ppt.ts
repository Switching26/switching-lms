/**
 * PowerPoint — le PARCOURS : chaque chapitre rejoué de bout en bout.
 *
 * Les contrôles voisins lisent les scénarios ; celui-ci les JOUE. Il déroule
 * chaque chapitre dans le vrai moteur — `deckDepuisDeclaration`,
 * `appliquerGeste`, `observationDuGeste`, `jugerEtape` avec l'adaptateur — en
 * dérivant de chaque étape le geste qu'un apprenant ferait, et il refuse toute
 * étape qu'aucun geste réel ne franchit.
 *
 * ═══ CE QU'IL ATTRAPE, ET QUE RIEN D'AUTRE NE VOIT ═══
 *
 *  1. une étape INJOUABLE dans l'enchaînement réel. `check-scenario-ppt` juge un
 *     fichier ; il ne sait pas qu'à l'étape 12 la diapositive affichée n'est pas
 *     celle que « Supprimer » effacera. Le ruban passe TOUJOURS `iActive` :
 *     ce contrôle fait de même, donc un `P_DELETE_SLIDE` mal placé échoue ici ;
 *  2. une réponse déclarée que le juge REFUSE — l'apprenant fait exactement ce
 *     qu'on lui demande et reste bloqué ;
 *  3. une évaluation notée dont un parcours SANS FAUTE ne rend pas 100 %. Excel
 *     a payé ce défaut trois fois : ses modules 1, 4 et 27 plafonnaient à 46 %,
 *     95 % et 78 % pour un parcours parfait, silencieusement.
 *
 * ⚠️ Ce contrôle ne remplace pas le rejeu au navigateur : il ne dit rien du
 * rendu, de la géométrie ni de l'atteignabilité au doigt. Il dit que la chaîne
 * geste → observation → verdict est tenue.
 *
 * `--contre-test` rejoue l'évaluation avec une faute volontaire : un contrôle
 * dont on n'a pas vérifié qu'il sait dire NON ne prouve rien.
 *
 * `--reprise` mesure un SECOND risque, celui de l'apprenant qui revient : le
 * player recharge la présentation INITIALE et n'applique que le `setupPpt` de
 * l'étape courante. Tout ce que l'apprenant avait produit avant est perdu.
 * Excel avait le même trou — 136 chapitres sur 246 — et l'a bouché par
 * `rejouerAvant`, que PowerPoint n'a pas encore. Ce mode compte les étapes
 * qu'une reprise rendrait injouables, au lieu de laisser croire qu'il n'y en a
 * pas.
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

const DOSSIER = join(__dirname, "..", "scenarios", "ppt")

type Etape = { id: string; consigne: string; action: any; points?: number }
type Scenario = { title: string; mode?: string; ppt?: any; steps: Etape[] }

type Bilan = {
  fichier: string
  titre: string
  mode: string
  etapes: number
  franchies: number
  fautes: Array<{ etape: string; message: string }>
  bloquees: Array<{ etape: string; raison: string }>
  /**
   * Étapes franchies, mais seulement au bout de PLUSIEURS appuis.
   *
   * Le repli ci-dessous avance jusqu'à douze fois pour atteindre l'état visé.
   * C'est fidèle à ce que peut faire un apprenant — les appuis intermédiaires
   * sont des tâtonnements, jamais des fautes — mais ça masquait une étape mal
   * écrite : « avancez jusqu'à la dernière diapositive » demandait TROIS appuis,
   * donc trois gestes en une étape, et le contrôle la déclarait franchie quand
   * le banc, qui n'appuie qu'une fois, la refusait. Un saut par-dessus une
   * diapositive MASQUÉE reste un seul appui : `showNext` la saute lui-même.
   */
  multiAppuis: Array<{ etape: string; appuis: number }>
  /**
   * Étapes DÉJÀ VRAIES au moment où elles s'affichent.
   *
   * Elles se franchissent au premier geste venu — souvent avant même d'avoir
   * été lues — et l'apprenant traverse une consigne sans rien apprendre. Le cas
   * trouvé : après avoir supprimé une diapositive, la suivante est déjà active,
   * donc « affichez la dernière » n'avait plus rien à demander. Sur téléphone
   * ça se voyait en plus à l'écran, le tiroir restant ouvert faute de
   * changement d'index.
   */
  dejaVraies: string[]
  note: number | null
}

/* ═══════════ LE GESTE QU'UN APPRENANT FERAIT ═══════════ */

/**
 * Rend la SUITE de gestes qui franchit l'étape, ou `null` si le contrôle ne sait
 * pas la jouer — auquel cas l'étape est rapportée comme non couverte, jamais
 * comme réussie. Un contrôle qui passe sous silence ce qu'il ne sait pas faire
 * rend un vert vide.
 *
 * Les gestes reproduisent le CANAL et les paramètres réels de l'interface : le
 * ruban passe toujours `iActive`, jamais l'index déclaré par l'auteur. C'est
 * cette fidélité qui rend le contrôle capable de voir une étape mal placée.
 */
export function gestesDe(action: any, deck: DeckState): Array<{ geste: GestePpt; canal: string }> | null {
  const iActive = deck.activeSlide ?? 0
  const slide = diapoActive(deck)

  switch (action.type) {
    case "P_SELECT_SLIDE":
      return [{ geste: { type: "selectSlide", index: action.index }, canal: "mouse" }]

    case "P_ADD_SLIDE":
      // Le bouton « Nouvelle » n'impose aucune disposition : elle est HÉRITÉE.
      // Jouer `layout` ici masquerait une attente que le ruban ne peut pas
      // satisfaire.
      return [{ geste: { type: "addSlide" }, canal: "ribbon" }]

    /* Afficher PUIS presser — le chemin réel de l'apprenant.
     *
     * La version précédente ne jouait que le bouton, sur `iActive`. C'était plus
     * strict, et faussement : au contre-test, une duplication faite sur la
     * mauvaise diapositive laissait le rang courant déplacé, la reprise du geste
     * juste échouait, et l'épreuve était déclarée INFINISSABLE alors qu'un
     * apprenant s'en sort en recliquant la bonne miniature. C'est le rejeu au
     * NAVIGATEUR qui prouve l'atteignabilité depuis l'état laissé par l'étape
     * précédente : là, le joueur presse le bouton sans rien sélectionner. */
    case "P_DELETE_SLIDE":
      return [
        { geste: { type: "selectSlide", index: action.index }, canal: "mouse" },
        { geste: { type: "deleteSlide", index: action.index }, canal: "ribbon" },
      ]

    case "P_DUPLICATE_SLIDE":
      return [
        { geste: { type: "selectSlide", index: action.index }, canal: "mouse" },
        { geste: { type: "duplicateSlide", index: action.index }, canal: "ribbon" },
      ]

    case "P_SET_LAYOUT":
      return [{ geste: { type: "setLayout", index: iActive, layout: action.layout }, canal: "ribbon" }]

    case "P_SET_VIEW":
      return [{ geste: { type: "setView", view: action.view }, canal: "ribbon" }]

    /* D11 — le ruban déplace d'un cran et n'émet donc que `{i, i±1}`. On joue
       exactement ce que fait le bouton : afficher, puis monter ou descendre. */
    case "P_MOVE_SLIDE":
      return [
        { geste: { type: "selectSlide", index: action.from }, canal: "mouse" },
        {
          geste: { type: "moveSlide", from: action.from, to: action.to },
          canal: "ribbon",
        },
      ]

    case "P_DELETE_OBJECT":
      return [
        { geste: { type: "selectObject", objectId: action.objectId }, canal: "mouse" },
        { geste: { type: "deleteObject", objectId: action.objectId }, canal: "keyboard" },
      ]

    case "P_SELECT_OBJECT":
      return [{ geste: { type: "selectObject", objectId: action.objectId }, canal: "mouse" }]

    case "P_TYPE_TEXT": {
      const obj = slide ? trouverObjet(slide, action.cible) : null
      if (!obj) return null
      return [
        { geste: { type: "editText", objectId: obj.id, paragraphe: 0, text: action.accept[0] }, canal: "keyboard" },
      ]
    }

    case "P_ADD_OBJECT": {
      // Les cadres sont ceux que le ruban dépose réellement.
      const rect =
        action.objectType === "image"
          ? { x: 560, y: 180, w: 320, h: 200 }
          : { x: 320, y: 400, w: 320, h: 70 }
      return [
        {
          geste: { type: "addObject", objectType: action.objectType, shape: action.shape, rect },
          canal: "ribbon",
        },
      ]
    }

    case "P_MOVE_OBJECT": {
      const obj = slide ? trouverObjet(slide, action.objectId) : null
      if (!obj?.rect) return null
      const cible = { ...obj.rect, ...action.rect }
      return [{ geste: { type: "moveObject", objectId: obj.id, rect: cible, resize: false }, canal: "mouse" }]
    }

    case "P_EXPECT_FORMAT": {
      const obj = slide ? trouverObjet(slide, action.objectId) : null
      if (!obj) return null
      return [
        { geste: { type: "selectObject", objectId: obj.id }, canal: "mouse" },
        { geste: { type: "format", objectId: obj.id, style: action.style, fill: action.fill }, canal: "ribbon" },
      ]
    }

    case "P_EXPECT_ANIMATIONS": {
      /* Deux boutons d'animation sont RENDUS — « Apparaître » et « Fondu » — et
         ils agissent sur la SÉLECTION. Le chemin de l'apprenant est donc :
         sélectionner l'objet, puis presser le bouton. Tant que le contrôle ne
         savait pas le jouer, ces deux boutons restaient hors de portée de tout
         scénario : rendus, nommés, et jamais enseignés. */
      const attendues = action.animations ?? []
      if (!attendues.length || !slide) return null
      /* Le juge compare la séquence ENTIÈRE, rang par rang depuis le premier :
         une étape doit donc déclarer toute la suite attendue, pas seulement sa
         nouveauté. On ne rejoue pas ce qui est déjà posé — sinon la deuxième
         étape d'une séquence ajouterait un doublon et ferait échouer la
         comparaison au rang suivant. Il n'existe aucun geste de RETRAIT
         d'animation : ce qui est ajouté ne se défait pas. */
      const dejaPosees = (slide.animations ?? []).length
      const suite: Array<{ geste: any; canal: string }> = []
      for (const a of attendues.slice(dejaPosees)) {
        const obj = a.objectId ? trouverObjet(slide, a.objectId) : null
        if (!obj || !a.kind) return null
        suite.push({ geste: { type: "selectObject", objectId: obj.id }, canal: "mouse" })
        suite.push({ geste: { type: "addAnimation", objectId: obj.id, kind: a.kind }, canal: "ribbon" })
      }
      return suite
    }

    case "P_EXPECT_DECK": {
      /* Les attentes d'état que le lot 1 fait atteindre par un geste de ruban.
         Tout le reste rend `null` — le contrôle DIT qu'il ne sait pas jouer
         l'étape, au lieu de la compter franchie sans l'avoir jouée. */
      const cibles = action.deck?.slides ?? []
      if (!cibles.length) return null
      const gestes: Array<{ geste: GestePpt; canal: string }> = []
      for (const s of cibles) {
        if (s.masquee !== undefined) {
          gestes.push({ geste: { type: "toggleMasquee", index: iActive }, canal: "ribbon" })
        } else if (typeof s.notes === "string") {
          gestes.push({ geste: { type: "setNotes", index: s.index ?? iActive, notes: s.notes }, canal: "panel" })
        } else if (s.transition?.kind) {
          // Le ruban pose une durée avec l'effet ; « Aucune » n'en pose pas.
          const t: any = { kind: s.transition.kind }
          if (s.transition.kind !== "aucune") t.duree = 0.7
          gestes.push({ geste: { type: "setTransition", index: iActive, transition: t }, canal: "ribbon" })
        } else {
          return null
        }
      }
      return gestes
    }

    case "P_EXPECT_SHOW": {
      const show = deck.show ?? { actif: false, index: 0 }
      if (action.show.actif === false) return [{ geste: { type: "endShow" }, canal: "keyboard" }]
      if (!show.actif) {
        /* « ▶ Ici » seulement quand l'index visé EST la diapositive affichée.
           Se fier à `index === 0` était faux depuis que le départ saute les
           diapositives masquées : un diaporama lancé depuis le début peut très
           bien commencer à l'index 1. */
        const ici = (action.show.index ?? 0) === (deck.activeSlide ?? 0) && (deck.activeSlide ?? 0) !== 0
        return [{ geste: { type: "startShow", depuis: ici ? "courante" : "debut" }, canal: "ribbon" }]
      }
      // Diaporama déjà lancé : on avance, un clic à la fois.
      return [{ geste: { type: "showNext" }, canal: "mouse" }]
    }

    default:
      return null
  }
}

/**
 * Un geste FAUX pour l'étape, choisi de façon à produire une vraie faute.
 *
 * `null` quand aucun geste de l'étape ne peut en produire — auquel cas
 * l'évaluation ne sait PAS pénaliser cette étape, et le contre-test le dira au
 * lieu de le taire.
 */
function gesteFautif(action: any, deck: DeckState): { geste: GestePpt; canal: string } | null {
  const slide = diapoActive(deck)
  switch (action.type) {
    case "P_TYPE_TEXT": {
      const o = slide ? trouverObjet(slide, action.cible) : null
      return o
        ? { geste: { type: "editText", objectId: o.id, paragraphe: 0, text: "réponse volontairement fausse" }, canal: "keyboard" }
        : null
    }
    case "P_SET_LAYOUT": {
      const autre = action.layout === "titre-seul" ? "vide" : "titre-seul"
      return { geste: { type: "setLayout", index: deck.activeSlide ?? 0, layout: autre }, canal: "ribbon" }
    }
    case "P_MOVE_SLIDE": {
      // Le mauvais sens : un geste NOMMÉ, donc une vraie faute.
      const i = action.from
      const sens = action.to > action.from ? -1 : 1
      const cible = Math.max(0, Math.min(deck.slides.length - 1, i + sens))
      return cible === i ? null : { geste: { type: "moveSlide", from: i, to: cible }, canal: "ribbon" }
    }
    case "P_ADD_OBJECT":
      return {
        geste: { type: "addObject", objectType: action.objectType === "texte" ? "image" : "texte", rect: { x: 300, y: 220, w: 300, h: 120 } },
        canal: "ribbon",
      }
    case "P_DELETE_SLIDE":
    case "P_DUPLICATE_SLIDE": {
      const autre = (action.index ?? 0) === 0 ? 1 : 0
      return deck.slides[autre]
        ? { geste: { type: action.type === "P_DELETE_SLIDE" ? "deleteSlide" : "duplicateSlide", index: autre }, canal: "ribbon" }
        : null
    }
    case "P_DELETE_OBJECT": {
      const autre = slide?.objects.find((o) => o.id !== action.objectId && !o.locked)
      return autre ? { geste: { type: "deleteObject", objectId: autre.id }, canal: "keyboard" } : null
    }
    /* Jugées sur l'ÉTAT ou classées navigation : par construction, aucun geste
       n'y compte de faute. Ce n'est pas un oubli, c'est la règle qui empêche de
       pénaliser un apprenant qui construit son résultat en plusieurs gestes. */
    default:
      return null
  }
}

/* ═══════════ REJEU D'UN CHAPITRE ═══════════ */

function rejouer(fichier: string, scenario: Scenario, sabotage?: { etape: number }): Bilan {
  const mode = scenario.mode ?? "LESSON"
  let deck = deckDepuisDeclaration(scenario.ppt)
  const bilan: Bilan = {
    fichier,
    titre: scenario.title,
    mode,
    etapes: scenario.steps.length,
    franchies: 0,
    fautes: [],
    bloquees: [],
    multiAppuis: [],
    dejaVraies: [],
    note: null,
  }

  let points = 0
  let pointsMax = 0
  const notable = (s: Etape) => s.action.type !== "READ" && (s.points ?? 1) > 0

  for (let i = 0; i < scenario.steps.length; i += 1) {
    const step = scenario.steps[i]
    if (mode === "EVALUATION" && notable(step)) pointsMax += step.points ?? 1

    /* Mise en place déclarée par l'étape, comme le player. */
    const sp = (step as any).setupPpt
    if (sp) {
      if (sp.deck) deck = deckDepuisDeclaration(sp.deck)
      if (sp.slide !== undefined) deck = { ...deck, activeSlide: sp.slide }
      if (sp.selection) deck = { ...deck, selection: sp.selection }
      if (sp.view) deck = { ...deck, view: sp.view }
      if (sp.show) deck = { ...deck, show: { ...sp.show } }
    }

    if (step.action.type === "READ") {
      const j = jugerEtape(step as unknown as SimulationStep, { kind: "next" } as any, adaptateurPpt)
      if (!j.ok) {
        bilan.bloquees.push({ etape: step.id, raison: "un écran de lecture ne se franchit pas" })
        break
      }
      bilan.franchies += 1
      continue
    }

    let fauteSurCetteEtape = false

    /* ── Faute volontaire du contre-test ──
     *
     * Toutes les erreurs ne coûtent PAS un point, et c'est voulu : choisir la
     * mauvaise diapositive est une navigation, un état intermédiaire non encore
     * satisfait est un tâtonnement. Seuls les gestes NOMMÉS — saisir, changer de
     * disposition, déplacer, ajouter, supprimer — comptent une faute. Le
     * sabotage doit donc viser l'un d'eux, sinon le contre-test ne prouve rien.
     * La première version visait une sélection de diapositive et ne déclenchait
     * jamais. */
    if (sabotage && sabotage.etape === i) {
      const faux = gesteFautif(step.action, deck)
      if (faux) {
        const apres = appliquerGeste(deck, faux.geste)
        const obs = observationDuGeste(faux.geste, apres, faux.canal as any)
        deck = apres
        if (obs) {
          const j = jugerEtape(step as unknown as SimulationStep, obs as any, adaptateurPpt)
          if (!j.ok && j.compte === "faute") fauteSurCetteEtape = true
        }
      }
    }

    /* L'étape demande-t-elle encore quelque chose ?
     *
     * On soumet au juge l'état COURANT, avant tout geste. S'il dit déjà oui,
     * la consigne ne demande rien : elle défilera sans être lue. Les étapes de
     * saisie ne sont jamais concernées — elles se jugent sur une frappe, pas
     * sur l'état — donc ce contrôle ne signale que la navigation et les états,
     * là où le défaut existe vraiment. */
    if (
      step.action.type !== "READ" &&
      jugerEtape(step as unknown as SimulationStep, { kind: "p:deckChange", deck, channel: "mouse" } as any, adaptateurPpt).ok
    )
      bilan.dejaVraies.push(step.id)

    const suite = gestesDe(step.action, deck)
    if (!suite) {
      bilan.bloquees.push({
        etape: step.id,
        raison: `le contrôle ne sait pas jouer « ${step.action.type} » — étape NON couverte`,
      })
      break
    }

    let franchie = false
    for (const { geste, canal } of suite) {
      const apres = appliquerGeste(deck, geste)
      const specifique = observationDuGeste(geste, apres, canal as any)
      deck = apres

      // Le player émet DEUX observations par geste : la spécifique, puis l'état.
      const observations = [
        ...(specifique ? [specifique] : []),
        { kind: "p:deckChange", deck: apres, channel: canal } as any,
      ]
      for (const obs of observations) {
        if (franchie) break
        const j = jugerEtape(step as unknown as SimulationStep, obs as any, adaptateurPpt)
        if (j.ok) {
          franchie = true
          break
        }
        if (j.compte === "faute") {
          fauteSurCetteEtape = true
          bilan.fautes.push({ etape: step.id, message: j.message ?? j.reason ?? "faute" })
        }
      }
      if (franchie) break
    }

    /* Le diaporama demande parfois plusieurs clics : on avance tant que l'état
       n'est pas atteint, sans jamais boucler indéfiniment. */
    if (!franchie && step.action.type === "P_EXPECT_SHOW") {
      let appuis = 0
      for (let k = 0; k < 12 && !franchie; k += 1) {
        const apres = appliquerGeste(deck, { type: "showNext" })
        const obs = observationDuGeste({ type: "showNext" }, apres, "mouse" as any)
        deck = apres
        appuis += 1
        for (const o of [obs, { kind: "p:deckChange", deck: apres, channel: "mouse" } as any]) {
          if (!o || franchie) continue
          const j = jugerEtape(step as unknown as SimulationStep, o as any, adaptateurPpt)
          if (j.ok) franchie = true
        }
      }
      /* Le premier appui est celui qu'annonce la consigne. Au-delà, l'étape
       * demande plusieurs gestes — c'est un défaut d'écriture, pas de moteur. */
      if (franchie && appuis > 1) bilan.multiAppuis.push({ etape: step.id, appuis })
    }

    if (!franchie) {
      bilan.bloquees.push({
        etape: step.id,
        raison: `aucun geste réel ne franchit cette étape (${step.action.type})`,
      })
      break
    }

    bilan.franchies += 1
    if (mode === "EVALUATION" && notable(step) && !fauteSurCetteEtape) points += step.points ?? 1
  }

  if (mode === "EVALUATION") bilan.note = pointsMax === 0 ? 0 : Math.round((points / pointsMax) * 100)
  return bilan
}

/* ═══════════ REPRISE ═══════════ */

/**
 * L'étape N est-elle jouable quand on arrive DIRECTEMENT dessus ?
 *
 * On reproduit exactement ce que fait le player à la reprise : présentation
 * initiale, puis le seul `setupPpt` de l'étape. Aucun rejeu des précédentes.
 */
function jouableEnReprise(scenario: Scenario, i: number): boolean {
  const step = scenario.steps[i]
  if (step.action.type === "READ") return true

  let deck = deckDepuisDeclaration(scenario.ppt)
  const sp = (step as any).setupPpt
  if (sp) {
    if (sp.deck) deck = deckDepuisDeclaration(sp.deck)
    if (sp.slide !== undefined) deck = { ...deck, activeSlide: sp.slide }
    if (sp.selection) deck = { ...deck, selection: sp.selection }
    if (sp.view) deck = { ...deck, view: sp.view }
    if (sp.show) deck = { ...deck, show: { ...sp.show } }
  }

  const suite = gestesDe(step.action, deck)
  if (!suite) return false
  for (const { geste, canal } of suite) {
    const apres = appliquerGeste(deck, geste)
    const specifique = observationDuGeste(geste, apres, canal as any)
    deck = apres
    for (const obs of [
      ...(specifique ? [specifique] : []),
      { kind: "p:deckChange", deck: apres, channel: canal } as any,
    ]) {
      if (jugerEtape(step as unknown as SimulationStep, obs as any, adaptateurPpt).ok) return true
    }
  }
  if (step.action.type === "P_EXPECT_SHOW") {
    for (let k = 0; k < 12; k += 1) {
      const apres = appliquerGeste(deck, { type: "showNext" })
      const obs = observationDuGeste({ type: "showNext" }, apres, "mouse" as any)
      deck = apres
      for (const o of [obs, { kind: "p:deckChange", deck: apres, channel: "mouse" } as any]) {
        if (o && jugerEtape(step as unknown as SimulationStep, o as any, adaptateurPpt).ok) return true
      }
    }
  }
  return false
}

/* ═══════════ EXÉCUTION ═══════════ */

function principal() {
  if (!existsSync(DOSSIER)) {
    console.log("  — aucun scénario PowerPoint pour l'instant.")
    return
  }
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".json")).sort()
  let echecs = 0
  let total = 0

  console.log("── Rejeu des chapitres, geste par geste ──\n")
  for (const f of fichiers) {
    const scenario = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8")) as Scenario
    const b = rejouer(f, scenario)
    total += b.franchies
    const ok = b.franchies === b.etapes && b.fautes.length === 0 && b.bloquees.length === 0
    const note = b.note === null ? "" : `  note ${b.note} %`
    console.log(`  ${ok ? "✓" : "✗"} ${f.padEnd(14)} ${String(b.franchies).padStart(2)}/${b.etapes} étapes${note}   ${b.titre}`)
    for (const x of b.fautes) console.log(`      ✗ faute — ${x.etape} : ${x.message}`)
    for (const x of b.bloquees) console.log(`      ✗ blocage — ${x.etape} : ${x.raison}`)
    /* Une étape = un geste jugé. Le repli à douze appuis rend le contrôle
     * indulgent là où le banc, qui n'appuie qu'une fois, refuse : c'est
     * exactement l'écart qui avait laissé passer M10-L04-10. */
    for (const x of b.multiAppuis) {
      console.log(`      ✗ ${x.etape} : ${x.appuis} appuis pour une seule étape — un geste jugé par étape`)
      echecs += 1
    }
    for (const id of b.dejaVraies) {
      console.log(`      ✗ ${id} : déjà vraie à l'arrivée — la consigne ne demande rien`)
      echecs += 1
    }
    if (!ok) echecs += 1
    if (b.mode === "EVALUATION" && b.note !== 100) {
      console.log(`      ✗ un parcours SANS FAUTE doit rendre 100 %, pas ${b.note} %`)
      echecs += 1
    }
  }

  /* ── Contre-test : le contrôle sait-il dire non ? ── */
  console.log("\n── Contre-test : une faute volontaire dans l'évaluation ──")
  const evals = fichiers.filter((f) => f.includes("-ev"))
  for (const f of evals) {
    const scenario = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8")) as Scenario
    let trouve = false
    for (let i = 0; i < scenario.steps.length && !trouve; i += 1) {
      if (scenario.steps[i].action.type === "READ") continue
      const b = rejouer(f, scenario, { etape: i })
      if (b.note !== null && b.note < 100) {
        console.log(`  ✓ ${f} — faute à l'étape ${scenario.steps[i].id} : note ${b.note} %`)
        trouve = true
      }
    }
    if (!trouve) {
      console.log(
        `  ✗ ${f} — AUCUNE étape ne peut coûter un point : cette évaluation rend 100 % quoi que fasse l'apprenant.`,
      )
      echecs += 1
    }
  }

  /* ── Reprise à mi-parcours ── */
  if (process.argv.includes("--reprise")) {
    console.log("\n── Reprise : l'apprenant revient à l'étape N ──")
    let perdues = 0
    let regardees = 0
    for (const f of fichiers) {
      const scenario = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8")) as Scenario
      const ko: string[] = []
      for (let i = 0; i < scenario.steps.length; i += 1) {
        if (scenario.steps[i].action.type === "READ") continue
        regardees += 1
        if (!jouableEnReprise(scenario, i)) {
          ko.push(scenario.steps[i].id)
          perdues += 1
        }
      }
      console.log(`  ${ko.length === 0 ? "✓" : "•"} ${f.padEnd(14)} ${ko.length} étape(s) injouable(s) en reprise${ko.length ? " : " + ko.join(" ") : ""}`)
    }
    console.log(`\n  ${perdues} / ${regardees} étapes d'action ne se rejouent pas telles quelles après une reprise.`)
    console.log("  → tant que le player PowerPoint n'a pas son `rejouerAvant`, ces étapes")
    console.log("    demandent un `setupPpt` explicite, ou l'apprenant repart d'un état faux.")

    /* ── Le PRIX de ce remède, mesuré et non supposé ──
     *
     * `setupPpt.deck` REMPLACE la présentation à chaque changement d'étape (là
     * où le `setup.cells` d'Excel n'écrit qu'un delta). Si une étape antérieure
     * acceptait plusieurs écritures, l'état déclaré fige la PREMIÈRE : un
     * apprenant qui avait employé une variante légitime voit son texte réécrit
     * sous ses yeux. Ce n'est ni bloquant ni pénalisé — mais c'est visible, et
     * cela disparaîtra dès que le player saura rejouer les étapes précédentes. */
    const figes: string[] = []
    for (const f of fichiers) {
      const scenario = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8")) as Scenario
      const variantes: { id: string; accept: string[] }[] = []
      for (const s of scenario.steps) {
        const d = (s as any).setupPpt?.deck
        if (d) {
          const decl = JSON.stringify(d)
          for (const v of variantes)
            if (v.accept.length > 1 && decl.includes(v.accept[0]))
              figes.push(`${f.replace(".json", "")} · ${s.id} fige ${v.id}`)
        }
        if (s.action?.type === "P_TYPE_TEXT") variantes.push({ id: s.id, accept: s.action.accept })
      }
    }
    console.log(`  ⚠ ${figes.length} endroit(s) où un état déclaré fige la première écriture acceptée d'une`)
    console.log("    étape antérieure : la variante de l'apprenant y serait réécrite à l'écran.")
    /* La liste nominative est le livrable : un contournement chiffré mais anonyme
     * se redécouvre apprenant par apprenant. */
    for (const l of figes) console.log(`      ${l}`)
  }

  console.log()
  if (echecs) {
    console.error(`✗ ${echecs} anomalie(s) au rejeu.`)
    process.exit(1)
  }
  console.log(`✓ ${fichiers.length} chapitre(s) · ${total} étapes franchies par un geste réel, 0 faute, 0 blocage.`)
}

if (require.main === module) principal()
