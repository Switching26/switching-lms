"use client"

/**
 * Le simulateur, vu par l'apprenant.
 *
 * Il assemble l'habillage Excel, la grille, la barre de consigne, et surtout il
 * arbitre : à chaque geste il demande à `validateStep` si c'était le bon, avance
 * ou signale l'erreur, et fait remonter la progression au serveur.
 *
 * Trois choix pédagogiques sont câblés ici, et ils viennent de l'analyse des
 * 2 748 étapes de la formation de référence :
 *
 *  - En LEÇON, la cible est montrée d'emblée (halo). En EXERCICE, l'aide existe
 *    mais se demande. En ÉVALUATION, il n'y a pas d'aide.
 *  - Une mauvaise action ne fait pas perdre l'étape : on explique et on laisse
 *    réessayer. Seule la réussite AU PREMIER ESSAI compte pour la note, ce qui
 *    distingue une évaluation d'un exercice.
 *  - Le nombre d'erreurs et d'aides ouvertes est journalisé. C'est ce qui donne au
 *    formateur une vision réelle des difficultés, là où une vidéo ne dit rien.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { GridApi } from "./ExcelGrid"
import SimulationChrome from "./SimulationChrome"
import type { SimulationScenario, SimulationStep, RibbonTab } from "@/lib/simulation/types"
import { parseRange } from "@/lib/simulation/grid"
import { validateStep, computeScore, type ObservedAction, type Verdict } from "@/lib/simulation/validate"

// Univer casse à l'import côté serveur : le chargement différé est obligatoire,
// pas une optimisation.
const ExcelGrid = dynamic(() => import("./ExcelGrid"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[13px] text-neutral-500">
      Chargement du classeur…
    </div>
  ),
})

type Mode = "LESSON" | "EXERCISE" | "EVALUATION"

type Props = {
  chapterId: string
  mode: Mode
  scenario: SimulationScenario
  /** Étape de reprise, fournie par l'API. */
  initialStep?: number
  /** Aperçu admin : aucune écriture de progression. */
  preview?: boolean
  onCompleted?: () => void
}

/**
 * Rend une consigne : `**gras**` pour le vocabulaire métier, `==action==` pour le
 * geste à effectuer, et `` `code` `` pour les formules et références.
 *
 * Les quantificateurs sont NON GREEDY et acceptent n'importe quel caractère à
 * l'intérieur. Une version antérieure utilisait `==[^=]+==`, ce qui échouait dès
 * qu'une consigne contenait un signe égal — donc sur toutes les consignes citant
 * une formule, c'est-à-dire les plus importantes. Le balisage s'affichait alors en
 * clair à l'écran.
 */
const CONSIGNE_RE = /(\*\*[\s\S]+?\*\*|==[\s\S]+?==|`[^`]+`)/g

/**
 * Rendu RÉCURSIF du balisage : une action mise en évidence contient presque
 * toujours une formule ou une référence entre accents graves
 * (« ==saisissez `=3+2`== »). Un découpage à un seul niveau affichait les accents
 * graves en clair à l'intérieur des blocs.
 */
function renderConsigne(text: string, depth = 0): React.ReactNode[] {
  if (depth > 3) return [text]
  return text
    .split(CONSIGNE_RE)
    .filter(Boolean)
    .map((p, i) => {
      if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-neutral-900">
            {renderConsigne(p.slice(2, -2), depth + 1)}
          </strong>
        )
      }
      if (p.length > 4 && p.startsWith("==") && p.endsWith("==")) {
        return (
          <span key={i} className="font-medium text-emerald-700">
            {renderConsigne(p.slice(2, -2), depth + 1)}
          </span>
        )
      }
      if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) {
        return (
          <code
            key={i}
            className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[12.5px] text-neutral-900"
          >
            {p.slice(1, -1)}
          </code>
        )
      }
      return <span key={i}>{p}</span>
    })
}

function Consigne({ text }: { text: string }) {
  const nodes = useMemo(() => renderConsigne(text), [text])
  return <p className="text-[13.5px] leading-relaxed text-neutral-800">{nodes}</p>
}

export default function SimulationPlayer({
  chapterId,
  mode,
  scenario,
  initialStep = 0,
  preview,
  onCompleted,
}: Props) {
  const steps = scenario.steps
  const total = steps.length

  const [index, setIndex] = useState(() => Math.min(Math.max(initialStep, 0), Math.max(total - 1, 0)))
  const [gridReady, setGridReady] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [hintShown, setHintShown] = useState(mode === "LESSON")
  const [selection, setSelection] = useState(scenario.workbook.selection ?? "A1")
  const [formulaText, setFormulaText] = useState("")
  // Agrégats de la sélection, rafraîchis à chaque geste : c'est ce que la barre
  // d'état d'Excel affiche, et la leçon « calculs à la volée » repose dessus.
  const [stats, setStats] = useState<ReturnType<GridApi["getSelectionStats"]>>(null)
  const [finished, setFinished] = useState(false)
  // Saisie en cours dans la zone Nom. null = on y affiche la sélection courante.
  const [nameBoxDraft, setNameBoxDraft] = useState<string | null>(null)
  const [sheets, setSheets] = useState<Array<{ name: string; active: boolean }>>([])

  const gridRef = useRef<GridApi | null>(null)
  // Compteurs à envoyer au serveur : cumulés puis remis à zéro à chaque envoi.
  const pendingRef = useRef({ errors: 0, hints: 0, seconds: 0 })
  // Réussite au premier essai, par étape : c'est la base du score d'évaluation.
  const firstTryRef = useRef<Record<string, boolean>>({})
  const attemptedRef = useRef<Set<string>>(new Set())

  const step: SimulationStep | undefined = steps[index]
  const stepRef = useRef<SimulationStep | undefined>(step)
  stepRef.current = step

  // Onglet du ruban : l'étape peut en imposer un, mais l'apprenant doit pouvoir
  // en changer librement. Explorer le ruban n'est pas une faute.
  const [onglet, setOnglet] = useState<RibbonTab>(
    step?.setup?.ribbon?.activeTab ?? scenario.ribbon[0] ?? "accueil"
  )

  /* ── Mise en place de l'étape ──────────────────────────────────────────── */

  const applyStep = useCallback(
    (s: SimulationStep | undefined) => {
      const grid = gridRef.current
      if (!grid || !s) return
      // Une étape qui exige un onglet précis le reprend ; sinon on laisse
      // l'apprenant sur celui qu'il consultait.
      if (s.setup?.ribbon?.activeTab) setOnglet(s.setup.ribbon.activeTab)
      if (s.setup?.cells) grid.applyCells(s.setup.cells)
      if (s.setup?.selection) {
        grid.setSelection(s.setup.selection)
        setSelection(s.setup.selection)
      }
      // Verrou d'édition, calibré selon ce que l'étape demande :
      //  - saisie ciblée : seule la cellule attendue est modifiable, ce qui évite
      //    qu'un apprenant remplisse une cellule hors sujet et casse la suite ;
      //  - validation par l'état : AUCUNE restriction, sinon l'apprenant ne peut
      //    ni tirer la poignée de recopie ni coller — donc l'étape est injouable.
      //    C'est tout l'intérêt de ce mode : le chemin est libre ;
      //  - lecture ou clic : rien à saisir, on verrouille par précaution.
      if (s.action.type === "TYPE" && s.action.target !== "formula-bar") {
        grid.setEditableCells([s.action.target])
      } else if (
        s.action.type === "EXPECT_STATE" ||
        s.action.type === "EXPECT_FORMAT" ||
        s.action.type === "SORT_RANGE" ||
        s.action.type === "FILTER_COLUMN"
      ) {
        // Trier ou filtrer réécrit des lignes entières : le verrou de cellules
        // faisait échouer la commande en silence, l'étape restait injouable.
        grid.setEditableCells(null)
      } else {
        grid.setEditableCells([])
      }
      setFormulaText("")
      setVerdict(null)
      setHintShown(mode === "LESSON")
      // Le focus revient à la grille : sans cela, après un clic sur « Suivant »
      // ou sur un bouton du ruban, l'apprenant tape dans le vide jusqu'à ce qu'il
      // pense à recliquer dans une cellule.
      grid.focus()
      if (s.setup?.selection) setStats(grid.getSelectionStats(s.setup.selection))
      setNameBoxDraft(null)
      setSheets(grid.getSheets())
    },
    [mode],
  )

  const handleReady = useCallback(
    (api: GridApi) => {
      gridRef.current = api
      api.applyWorkbook(scenario.workbook)
      setGridReady(true)
      applyStep(steps[index])
    },
    // Volontairement figé sur le montage : la grille se monte une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    if (gridReady) applyStep(step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, gridReady])

  /* ── Persistance ───────────────────────────────────────────────────────── */

  const persist = useCallback(
    async (opts: { step: number; finish?: boolean; score?: number }) => {
      if (preview) return
      const p = pendingRef.current
      pendingRef.current = { errors: 0, hints: 0, seconds: 0 }
      try {
        await fetch(`/api/simulations/${chapterId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentStep: opts.step,
            errorDelta: p.errors,
            hintDelta: p.hints,
            timeDeltaSeconds: p.seconds,
            finish: opts.finish ?? false,
            score: opts.score,
          }),
          keepalive: true,
        })
      } catch {
        // Une progression non enregistrée ne doit jamais bloquer l'apprenant :
        // il continue, et le prochain envoi rattrapera l'écart.
      }
    },
    [chapterId, preview],
  )

  // Temps réellement passé, pour les preuves de parcours. Compté seulement quand
  // l'onglet est visible, comme le tracker vidéo du LMS.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") pendingRef.current.seconds += 5
    }, 5000)
    return () => window.clearInterval(id)
  }, [])

  /* ── Avancement ────────────────────────────────────────────────────────── */

  const goNext = useCallback(() => {
    const next = index + 1
    if (next >= total) {
      const score = mode === "EVALUATION" ? computeScore(steps, firstTryRef.current) : undefined
      setFinished(true)
      void persist({ step: index, finish: true, score })
      onCompleted?.()
      return
    }
    setIndex(next)
    void persist({ step: next })
  }, [index, total, mode, steps, persist, onCompleted])

  const handleAction = useCallback(
    (observed: ObservedAction) => {
      if (!step || finished) return

      // Reflet immédiat de la sélection dans la zone Nom et la barre de formule.
      if (observed.kind === "cellClick") {
        setSelection(observed.cell)
        setFormulaText(gridRef.current?.getFormula(observed.cell) ?? "")
        setStats(gridRef.current?.getSelectionStats(observed.cell) ?? null)
      } else if (observed.kind === "dragRange") {
        setSelection(observed.range)
        setStats(gridRef.current?.getSelectionStats(observed.range) ?? null)
      } else if (observed.kind === "stateChange") {
        setStats(gridRef.current?.getSelectionStats() ?? null)
      } else if (observed.kind === "typed") {
        // Après validation, Excel descend d'une cellule : la zone Nom et la barre
        // de formule doivent suivre, sinon elles affichent la cellule précédente.
        const now = gridRef.current?.getSelection()
        if (now) {
          setSelection(now)
          setFormulaText(gridRef.current?.getFormula(now) ?? "")
          setStats(gridRef.current?.getSelectionStats(now) ?? null)
        }
      }

      // Pour une étape validée sur l'état du classeur, c'est ici qu'on lit les
      // cellules attendues : `validateStep` reste pur et réutilisable côté serveur.
      let enriched = observed
      if (observed.kind === "stateChange" && step.action.type === "EXPECT_STATE") {
        const grid = gridRef.current
        const readings: Record<string, { formula: string; value: unknown }> = {}
        if (grid) {
          for (const ref of Object.keys(step.action.cells)) {
            readings[ref] = { formula: grid.getFormula(ref), value: grid.getValue(ref) }
          }
        }
        enriched = { kind: "stateChange", readings }
      }

      const v = validateStep(step, enriched)
      if (v.ok) {
        if (!attemptedRef.current.has(step.id)) firstTryRef.current[step.id] = true
        setVerdict({ ok: true })
        // Petite pause pour que l'apprenant voie le résultat de son action avant
        // que l'écran ne change.
        window.setTimeout(goNext, 550)
        return
      }

      // Une action qui n'est simplement pas encore celle attendue (un clic de
      // repérage, par exemple) ne doit pas être comptée comme une faute.
      const isRealMistake =
        observed.kind !== "cellClick" &&
        observed.kind !== "stateChange" &&
        observed.kind !== "dragRange"
          ? true
          : (observed.kind === "cellClick" && step.action.type === "CLICK_CELL") ||
            (observed.kind === "dragRange" && step.action.type === "DRAG_RANGE")
      if (isRealMistake) {
        attemptedRef.current.add(step.id)
        firstTryRef.current[step.id] = false
        pendingRef.current.errors += 1
        setVerdict(v)
      }
    },
    [step, finished, goNext],
  )

  /**
   * Les boutons du ruban doivent AGIR, pas seulement signaler un clic. Sans cela
   * l'apprenant clique « Insérer » et rien ne bouge — il croirait à une panne.
   * L'effet est appliqué d'abord, la validation ensuite : l'étape peut donc être
   * validée sur l'état du classeur qui en résulte.
   */
  const handleControl = useCallback(
    (controlId: string) => {
      const grid = gridRef.current
      // Un tri réussi est signalé par l'événement Univer, pas par le clic : on
      // évite d'émettre une observation « control » qui ferait échouer l'étape.
      let trie = false
      let triFait = false
      if (grid) {
        const info = grid.getSelectionKind()
        switch (controlId) {
          case "acc-inserer":
            if (info?.kind === "column") grid.insertColumnBefore(info.index)
            else if (info?.kind === "row") grid.insertRowBefore(info.index)
            break
          case "acc-supprimer":
            if (info?.kind === "column") grid.deleteColumn(info.index)
            else if (info?.kind === "row") grid.deleteRow(info.index)
            break
          case "acc-format-largeur":
            if (info?.kind === "column") grid.setColumnWidth(info.index, 160)
            break
          case "acc-format-masquer":
            if (info?.kind === "column") grid.hideColumn(info.index)
            else if (info?.kind === "row") grid.hideRow(info.index)
            break
          case "acc-gras":
            grid.toggleBold(true)
            break
          case "acc-mfc-regle": {
            // Les paramètres viennent du scénario, faute de boîte de dialogue :
            // le geste évalué est le choix du type de règle et de la plage.
            const cf = stepRef.current?.setup?.cf
            if (cf) grid.addConditionalRule(cf.range, cf.rule)
            break
          }
          case "acc-mfc-effacer": {
            const cf = stepRef.current?.setup?.cf
            grid.clearConditionalRules(cf?.range ?? grid.getSelection() ?? "A1")
            break
          }
          case "acc-coller": {
            // Un collage passe par Univer et rend une promesse : on valide après.
            const coll = stepRef.current?.setup?.paste
            if (coll) {
              void grid.pasteText(coll.texte).then(() => {
                handleAction({ kind: "control", control: controlId, channel: "ribbon" })
              })
              return
            }
            break
          }
          case "don-convertir": {
            const sp = stepRef.current?.setup?.split
            if (sp) grid.splitToColumns(sp.range, sp.separateur, sp.fusionnerSeparateurs)
            break
          }
          case "acc-format-monetaire":
            // Deux décimales, séparateur de milliers et symbole € : le format
            // « Monétaire » d'Excel. La localisation numfmt le rend en français.
            grid.setNumberFormatOnSelection('#,##0.00" €"')
            break
          case "acc-pourcentage":
            grid.setNumberFormatOnSelection("0.00%")
            break
          case "acc-format-date":
            grid.setNumberFormatOnSelection("dd/mm/yyyy")
            break
          case "acc-format-nombre":
            grid.setNumberFormatOnSelection("#,##0.00")
            break
          case "acc-italique":
            grid.setItalic(true)
            break
          case "acc-souligne":
            grid.setUnderline(true)
            break
          case "acc-taille-plus":
            grid.setFontSize(14)
            break
          case "acc-taille-moins":
            grid.setFontSize(9)
            break
          case "acc-couleur-police":
            grid.setFontColor("#b91c1c")
            break
          case "acc-remplissage":
            grid.setBackground("#fde68a")
            break
          case "acc-bordures":
            grid.setBorderAll(true)
            break
          case "acc-aligner-gauche":
            grid.setAlign("left")
            break
          case "acc-aligner-centre":
            grid.setAlign("center")
            break
          case "acc-aligner-droite":
            grid.setAlign("right")
            break
          case "acc-fusionner":
            grid.mergeCells()
            break
          case "acc-renvoyer-ligne":
            grid.setWrap(true)
            break
          case "ui-nouvelle-feuille":
            grid.insertSheet()
            setSheets(grid.getSheets())
            break
          case "don-tri-croissant":
          case "don-tri-decroissant": {
            trie = true
            // Excel devine la plage et repère la ligne d'en-tête ; Univer non.
            // La plage à trier vient donc du scénario, et la colonne du clic de
            // l'apprenant — c'est bien son choix de colonne qu'on évalue.
            const attendu = stepRef.current?.action
            const plage = attendu?.type === "SORT_RANGE" ? attendu.range : ""
            const sel = grid.getSelection()
            if (plage && sel) {
              // Découper à la main les lettres d'une référence donnait « AC »
              // pour « A2:C6 » : on passe par les analyseurs de plage.
              const aire = parseRange(plage)
              const clic = parseRange(sel)
              // Univer attend un indice RELATIF au premier champ de la plage,
              // pas un indice absolu de feuille : vérifié au banc, une plage
              // qui ne commence pas en colonne A triait sinon la mauvaise.
              if (aire && clic) {
                const relatif = clic.startCol - aire.startCol
                if (relatif >= 0 && clic.startCol <= aire.endCol) {
                  triFait = grid.sortRange(plage, relatif, controlId === "don-tri-croissant")
                }
              }
            }
            break
          }
          case "don-filtrer": {
            // La plage à filtrer décrit le tableau de la feuille, pas l'étape :
            // au moment du clic, l'étape courante est encore le CLICK_CONTROL.
            const plage = scenario.workbook.filterRange ?? ""
            if (plage) grid.createFilter(plage)
            break
          }
          case "don-effacer-filtre":
            grid.removeFilter()
            break
          case "don-validation": {
            const dv = stepRef.current?.setup?.dv
            if (dv) grid.addValidation(dv.range, dv.rule)
            break
          }
          case "ins-image-cellule": {
            // L'insertion est asynchrone : l'étape se valide une fois l'image
            // réellement posée, sinon on validerait un geste sans effet.
            const img = stepRef.current?.setup?.image
            if (img) {
              void grid.insertCellImage(img.ref, img.source).then(() => {
                handleAction({ kind: "control", control: controlId, channel: "ribbon" })
              })
              return
            }
            break
          }
          case "rev-commentaire": {
            const n = stepRef.current?.setup?.note
            if (n) grid.setNote(n.ref, n.texte)
            break
          }
          case "rev-supprimer-commentaire": {
            const n = stepRef.current?.setup?.note
            grid.deleteNote(n?.ref ?? grid.getSelection() ?? "A1")
            break
          }
          case "aff-figer-volets": {
            const f = stepRef.current?.setup?.freeze
            grid.setFreeze(f?.rows ?? 1, f?.cols ?? 0)
            break
          }
          case "aff-liberer-volets":
            grid.cancelFreeze()
            break
          case "don-effacer-validation": {
            const dv = stepRef.current?.setup?.dv
            grid.clearValidation(dv?.range ?? grid.getSelection() ?? "A1")
            break
          }
        }
      }
      if (trie && triFait) return

      // La valeur cible itère sur le classeur : le résultat n'est connu qu'après
      // plusieurs recalculs, donc on valide l'étape à la fin de la recherche.
      const cible = stepRef.current?.setup?.goalSeek
      if (controlId === "don-valeur-cible" && cible && grid) {
        void grid
          .goalSeek(cible.formulaRef, cible.target, cible.inputRef)
          .then(() => {
            setSelection(grid.getSelection() ?? cible.inputRef)
            setStats(grid.getSelectionStats() ?? null)
            handleAction({ kind: "control", control: controlId, channel: "ribbon" })
          })
        return
      }

      // Une étape validée sur la MISE EN FORME lit l'état après le clic : la
      // mise en forme ne déclenche aucun événement de valeur, et laisser passer
      // une observation « control » ferait échouer l'étape.
      const attenduFmt = stepRef.current?.action
      if (attenduFmt?.type === "EXPECT_FORMAT" && grid) {
        const refs = Object.keys(attenduFmt.cells)
        // Les commandes Univer s'appliquent de façon asynchrone : lire tout de
        // suite renvoie l'ancien style.
        window.setTimeout(() => {
          const readings: Record<
            string,
            {
              background: string
              fontSize: number | null
              hAlign: string
              vAlign: string
              wrap: boolean | null
              numberFormat: string
            }
          > = {}
          for (const ref of refs) readings[ref] = grid.getFormat(ref)
          handleAction({ kind: "formatChange", readings })
        }, 220)
        return
      }

      handleAction({ kind: "control", control: controlId, channel: "ribbon" })
    },
    [handleAction],
  )

  /** Validation de la zone Nom : on va à la référence, et on le signale. */
  const commitNameBox = useCallback(() => {
    const grid = gridRef.current
    const raw = (nameBoxDraft ?? "").trim()
    setNameBoxDraft(null)
    if (!grid || !raw) return

    // La zone Nom d'Excel a deux usages selon ce qu'on y tape : une référence
    // déplace la sélection, un nom inédit nomme la sélection courante.
    const estReference = /^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(:\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?$/.test(raw)
    const defini = grid.getDefinedNames().find((n) => n.name.toUpperCase() === raw.toUpperCase())

    if (!estReference && !defini) {
      const portee = grid.getSelection()
      if (!portee) return
      const pose = grid.defineName(raw, portee)
      grid.focus()
      if (pose) handleAction({ kind: "defineName", name: raw, ref: portee })
      return
    }

    // Univer ne résout pas un nom défini : il lirait « Prix_HT » comme une
    // référence de colonne et lèverait une erreur. On traduit donc le nom en
    // plage nous-mêmes, en retirant l'éventuel préfixe de feuille.
    const cible = estReference ? raw.toUpperCase() : (defini?.ref ?? "").split("!").pop() || ""
    if (!cible) return
    grid.setSelection(cible)
    grid.focus()
    const now = grid.getSelection()
    if (now) {
      setSelection(now)
      setStats(grid.getSelectionStats(now))
    }
    handleAction({ kind: "gotoRef", ref: now || cible })
  }, [nameBoxDraft, handleAction])

  const handleSheet = useCallback(
    (name: string) => {
      const grid = gridRef.current
      if (grid) {
        grid.activateSheet(name)
        setSheets(grid.getSheets())
        grid.focus()
      }
      handleAction({ kind: "selectSheet", name })
    },
    [handleAction],
  )

  const revealHint = useCallback(() => {
    if (hintShown) return
    setHintShown(true)
    pendingRef.current.hints += 1
  }, [hintShown])

  /* ── Halo d'aide ───────────────────────────────────────────────────────── */

  // En leçon on montre la cible tout de suite ; en exercice sur demande ; jamais
  // en évaluation.
  const highlightedControl = useMemo(() => {
    if (mode === "EVALUATION" || !hintShown || !step) return null
    if (step.action.type === "CLICK_CONTROL") return step.action.control
    return null
  }, [mode, hintShown, step])

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  if (!step && !finished) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-[13px] text-warm-600">
        Cette simulation ne contient aucune étape.
      </div>
    )
  }

  const gradable = steps.filter((s) => s.action.type !== "READ").length

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      {/* En-tête : titre de l'étape et compteur */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-warm-50 px-4 py-2.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-warm-400">
          {mode === "LESSON" ? "Leçon" : mode === "EXERCISE" ? "Exercice" : "Évaluation"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {scenario.moduleTitle ? `${scenario.moduleTitle} · ` : ""}
          {scenario.title}
        </span>
        <span className="font-mono text-[12px] tabular-nums text-warm-600">
          {Math.min(index + 1, total)} / {total}
        </span>
      </div>

      {finished ? (
        <div className="px-5 py-10 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            {mode === "EVALUATION" ? "Évaluation terminée" : "Vous avez terminé cette étape du parcours"}
          </p>
          {mode === "EVALUATION" && (
            <p className="mt-1.5 text-[13px] text-warm-700">
              Score :{" "}
              <span className="font-semibold text-emerald-700">
                {Math.round(computeScore(steps, firstTryRef.current) * 100)} %
              </span>{" "}
              sur {gradable} action{gradable > 1 ? "s" : ""} évaluée{gradable > 1 ? "s" : ""}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Fenêtre Excel simulée */}
          <div className="px-3 pt-3">
            <SimulationChrome
              tabs={scenario.ribbon}
              state={
                step?.setup?.ribbon
                  ? { ...step.setup.ribbon, activeTab: onglet }
                  : { activeTab: onglet }
              }
              fileName={scenario.workbook.fileName}
              selection={selection}
              formulaText={formulaText}
              highlight={highlightedControl}
              onControl={handleControl}
              onTabChange={setOnglet}
              stats={stats}
              aggregates={step?.setup?.statusBar?.aggregates ?? scenario.statusBar?.aggregates}
              sheets={sheets}
              onSheet={handleSheet}
              nameBoxDraft={nameBoxDraft}
              onNameBoxChange={setNameBoxDraft}
              onNameBoxCommit={commitNameBox}
              onNameBoxCancel={() => setNameBoxDraft(null)}
            />
            <div className="h-[380px] overflow-hidden rounded-b-lg border border-t-0 border-neutral-300">
              <ExcelGrid onReady={handleReady} onAction={handleAction} />
            </div>
          </div>

          {/* Barre de consigne */}
          <div className="flex flex-wrap items-start gap-3 border-t border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              {step && <Consigne text={step.consigne} />}
              {verdict && !verdict.ok && (
                <p className="mt-1.5 text-[12.5px] text-rose-700">{verdict.message}</p>
              )}
              {verdict?.ok && <p className="mt-1.5 text-[12.5px] text-emerald-700">C'est exact.</p>}
              {mode !== "EVALUATION" && step?.aide?.text && hintShown && (
                <p className="mt-1.5 text-[12.5px] text-warm-600">{step.aide.text}</p>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {mode === "EXERCISE" && !hintShown && step?.aide && (
                <button
                  type="button"
                  onClick={revealHint}
                  className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-warm-700 hover:bg-warm-50"
                >
                  Un indice
                </button>
              )}
              {step?.action.type === "READ" && (
                <button
                  type="button"
                  onClick={() => handleAction({ kind: "next" })}
                  className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                >
                  Suivant
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
