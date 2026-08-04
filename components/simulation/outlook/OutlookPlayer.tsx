"use client"

/**
 * OUTLOOK — le player du chapitre.
 *
 * ═══ CE QU'IL EST, ET CE QU'IL N'EST PAS ═══
 *
 * C'est un ADAPTATEUR, pas un second player (contrat §4, décision D6). Tout ce
 * qui vaut pour les quatre applications vient du noyau et n'est pas réécrit
 * ici : la progression, l'aide progressive, le retour visuel, la persistance et
 * LE CALCUL DE NOTE (`useAtelier`), le cockpit, les panneaux, le guide et la
 * bande de consigne (`AtelierShell`).
 *
 * La raison n'est pas l'économie de lignes : dupliquer le player recopierait le
 * calcul du score. Deux implémentations de la note pour un même parcours sont
 * indéfendables en contrôle Qualiopi, et la divergence serait SILENCIEUSE — la
 * formation continuerait de se jouer normalement avec des notes fausses.
 *
 * Ce fichier ne porte donc que ce qui est propre à la messagerie : l'état de la
 * boîte, l'application du `setup` d'une étape, et le branchement des gestes de
 * la surface sur le juge.
 *
 * ═══ INVARIANTS TENUS ICI ═══
 *
 *  · La surface n'est JAMAIS démontée — elle vit sous l'écran d'ouverture, qui
 *    se superpose. Démonter ferait perdre le travail de l'apprenant.
 *  · Zéro scroll par la STRUCTURE : `AtelierShell` tient la colonne, la surface
 *    est en `flex:1; min-height:0`. Aucun calcul de hauteur.
 *  · Styles inline et `@keyframes` embarqués : une classe Tailwind inédite est
 *    inerte, le JIT ne génère que ce qui existe au build.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import AtelierShell, { type EntreeSommaire } from "../AtelierShell"
import BilanFin from "../BilanFin"
import {
  useAideProgressive,
  useMesureZoneTravail,
  usePersistance,
  useProgression,
  useRetourVisuel,
} from "../hooks/useAtelier"
import CourrierSurface from "./CourrierSurface"
import { adaptateurOutlook } from "@/lib/simulation/outlook/adaptateur"
import { appliquerGeste, etatInitial, type GesteOutlook, type SetupOutlook } from "@/lib/simulation/outlook/document"
import type { EtatOutlook, OutlookObservation } from "@/lib/simulation/outlook/observations"
import { jugerEtape, type JugementEtape } from "@/lib/simulation/frappe"
import { gradableStepCount, type SimulationScenario, type SimulationStep } from "@/lib/simulation/types"
import type { LearnerDocument } from "@/lib/learner-files"

/** Au-delà, le juge distant est considéré injoignable : le geste reste à refaire. */
const DELAI_VERDICT_MS = 8000

type Mode = "LESSON" | "EXERCISE" | "EVALUATION"

/**
 * Mêmes props que le player d'Excel : c'est `SimulationChapter` qui choisit
 * l'un ou l'autre, et il passe le même jeu à tous.
 */
type Props = {
  chapterId: string
  mode: Mode
  scenario: SimulationScenario
  initialStep?: number
  repriseEvaluation?: boolean
  scorePrecedent?: number | null
  passagesPrecedents?: number
  onRejouer?: () => void
  nouveauPassage?: boolean
  validationLocale?: boolean
  preview?: boolean
  onCompleted?: () => void
  pleinCadre?: boolean
  sommaire?: EntreeSommaire[]
  onNaviguer?: (chapterId: string) => void
  onQuitter?: () => void
  note?: string
  onNote?: (valeur: string) => void
  notesHref?: string
  documentsChapitre?: LearnerDocument[]
  documentsFormation?: LearnerDocument[]
  afficherRessources?: boolean
  documentsHref?: string
  cleGuide?: string | null
}

/**
 * Le scénario, vu par Outlook.
 *
 * `SimulationScenario` (gelé) ne déclare pas encore `courrier` : le champ est lu
 * ici par élargissement de type, en attendant son raccordement dans `types.ts`.
 * Les scénarios l'écrivent déjà sous ce nom, donc le raccordement sera mécanique.
 */
type ScenarioAvecCourrier = SimulationScenario & { courrier?: SetupOutlook }
type EtapeAvecCourrier = SimulationStep & { setup?: { courrier?: Partial<SetupOutlook> } }

export default function OutlookPlayer({
  chapterId,
  mode,
  scenario,
  initialStep = 0,
  repriseEvaluation,
  scorePrecedent,
  passagesPrecedents,
  onRejouer,
  nouveauPassage,
  validationLocale = true,
  preview,
  onCompleted,
  pleinCadre,
  sommaire,
  onNaviguer,
  onQuitter,
  note,
  onNote,
  notesHref,
  documentsChapitre,
  documentsFormation,
  afficherRessources,
  documentsHref,
  cleGuide,
}: Props) {
  const steps = scenario.steps
  const evaluationNotee = mode === "EVALUATION" && !preview
  const depart = mode === "EVALUATION" ? 0 : Math.min(Math.max(initialStep, 0), Math.max(steps.length - 1, 0))

  /* ═══════════ L'ÉTAT DE LA BOÎTE ═══════════ */

  const setupInitial = (scenario as ScenarioAvecCourrier).courrier ?? {}
  const [etat, setEtat] = useState<EtatOutlook>(() => etatInitial(setupInitial))

  /** Zone de travail : la hauteur se MESURE, elle ne se calcule jamais. */
  const zoneRef = useRef<HTMLDivElement>(null)
  const { largeur } = useMesureZoneTravail(zoneRef)

  /* ═══════════ LE NOYAU ═══════════ */

  const retour = useRetourVisuel()
  const {
    verdict,
    setVerdict,
    lancerFx,
    relais,
    relaisActif,
    marquerRelais,
    jalon,
    poserJalon,
  } = retour

  /** Rappel du geste franchi, DÉDUIT de l'action — jamais rédigé par étape. */
  const resumerEtape = useCallback(
    (i: number) => (steps[i] ? adaptateurOutlook.fait(steps[i].action as never) : null),
    [steps],
  )

  const progression = useProgression({
    total: steps.length,
    departForce: depart,
    mode,
    resumerEtape,
    retour: { marquerRelais, poserJalon },
  })
  const {
    index,
    indexRef,
    introVue,
    ouvrirLAtelier,
    introVueRef,
    finished,
    goNext,
    reculPossible,
    reculDemande,
    setReculDemande,
    reculer,
    onAvancer,
    onTerminer,
  } = progression

  const step = index < steps.length ? (steps[index] as EtapeAvecCourrier) : undefined
  const stepRef = useRef<{ id: string } | undefined>(step)
  stepRef.current = step
  const goNextRef = useRef<(() => void) | null>(null)
  goNextRef.current = goNext

  const persistance = usePersistance({
    chapterId,
    mode,
    preview,
    nouveauPassage,
    onCompleted,
    indexRef,
    stepRef,
    goNextRef,
  })
  const {
    pendingRef,
    runIdRef,
    persist,
    commencer,
    ouvertureEnCours,
    passerLaQuestion,
    passageEnCours,
    cloturer,
    cloturerRef,
    clotureEnCours,
    bilan,
    bilanEnAttente,
    noteEnregistree,
    pannneJuge,
    setPanneJuge,
  } = persistance

  const aide = useAideProgressive({
    mode,
    index,
    finished,
    aUneEtape: !!step,
  })
  const {
    essais,
    tatonnements,
    tropLong,
    hintShown,
    montrerIndice,
    compterEssai,
    compterTatonnement,
    demonstration,
    demoFinie,
    rejeu,
    demarrerDemonstration,
    rejouerDemonstration,
    reinitialiserPourEtape,
    reinitialiserAAlArrivee,
    ouvrirFenetreMiseEnPlace,
    dansFenetreMiseEnPlace,
  } = aide
  void rejeu

  /* ═══════════ MISE EN PLACE D'UNE ÉTAPE ═══════════ */

  /**
   * Pose l'état imposé au démarrage de l'étape.
   *
   * Même rôle que `setup.poste` côté Excel : sans lui, la reprise MENT. Une
   * consigne qui affirme « le message est maintenant marqué comme lu » doit
   * poser cet état, sinon un apprenant qui revient dessus lit la description
   * d'un écran qu'il n'a pas.
   */
  const appliquerSetup = useCallback((i: number) => {
    const e = steps[i] as EtapeAvecCourrier | undefined
    const c = e?.setup?.courrier
    reinitialiserPourEtape()
    reinitialiserAAlArrivee()
    setVerdict(null)
    if (!c) return
    // La mise en place produit des observations qui ne sont PAS des gestes de
    // l'apprenant : sans cette fenêtre, elles comptent comme des tâtonnements et
    // l'aide se propose un cran trop tôt, sur toutes les étapes.
    ouvrirFenetreMiseEnPlace()
    setEtat((prec) => {
      let suivant = { ...prec }
      if (c.vue) suivant.vue = c.vue
      if (c.dossierActif) suivant.dossierActif = c.dossierActif
      if (c.messageActif !== undefined) {
        suivant.messageActif = c.messageActif
        // Désigner un message actif implique qu'il a été ouvert, donc lu.
        if (c.messageActif) {
          suivant.messages = suivant.messages.map((m) =>
            m.id === c.messageActif ? { ...m, lu: true } : m,
          )
        }
      }
      return suivant
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps])

  onAvancer.current = appliquerSetup
  onTerminer.current = () => {
    if (mode === "EVALUATION" && !preview) void cloturerRef.current?.()
    else void persist({ step: steps.length, finish: true })
  }

  // Première mise en place, une fois l'atelier ouvert.
  useEffect(() => {
    if (introVue) appliquerSetup(indexRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introVue])

  /* ═══════════ LE JUGEMENT ═══════════ */

  const jugerObservation = useCallback(
    async (s: SimulationStep, rang: number, obs: OutlookObservation): Promise<JugementEtape | null> => {
      // Le juge du socle, avec NOTRE adaptateur : il route les actions `O_*`
      // vers Outlook et retombe sur le socle pour `READ`, `MONTRER`, `KEY` —
      // sans quoi tout écran de lecture serait infranchissable.
      if (validationLocale) return jugerEtape(s, obs as never, adaptateurOutlook)

      /* PAS DE PASSAGE, PAS DE JUGEMENT. La mise en place émet une observation
         avant même que l'apprenant soit entré : tant que l'écran d'ouverture est
         affiché, ce n'est pas une panne, c'est du décor. */
      if (!runIdRef.current) {
        if (introVueRef.current) setPanneJuge("passage")
        return null
      }
      const abandon = new AbortController()
      const minuterie = window.setTimeout(() => abandon.abort(), DELAI_VERDICT_MS)
      try {
        const r = await fetch(`/api/simulations/${chapterId}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: runIdRef.current, stepIndex: rang, stepId: s.id, observed: obs }),
          signal: abandon.signal,
        })
        if (!r.ok) {
          setPanneJuge(r.status === 409 ? "passage" : "reseau")
          return null
        }
        setPanneJuge(null)
        const j = (await r.json()) as { ok?: unknown; message?: unknown }
        return {
          ok: j.ok === true,
          ...(typeof j.message === "string" ? { message: j.message } : {}),
          frappe: null,
          // En évaluation, un échec ne doit rien apprendre du genre d'action
          // attendu : on retombe sur « tâtonnement » pour l'affichage.
          compte: j.ok === true ? "reussite" : "tatonnement",
        }
      } catch {
        setPanneJuge("reseau")
        return null
      } finally {
        window.clearTimeout(minuterie)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapterId, validationLocale],
  )

  /** Rectangle de la cible, pour ancrer le retour visuel sur la surface. */
  const rectDeLaCible = useCallback((): { left: number; top: number; width: number; height: number } | null => {
    const c = step ? adaptateurOutlook.cible(step.action as never) : {}
    const sel = c.controle ? `[data-control="${c.controle}"]` : c.dom
    if (!sel) return null
    const zone = zoneRef.current
    const cible = zone?.querySelector(sel) as HTMLElement | null
    if (!zone || !cible) return null
    const rz = zone.getBoundingClientRect()
    const rc = cible.getBoundingClientRect()
    return { left: rc.left - rz.left, top: rc.top - rz.top, width: rc.width, height: rc.height }
  }, [step])

  const appliquerJugement = useCallback(
    (j: JugementEtape | null) => {
      if (!j) return
      if (j.ok) {
        setVerdict({ ok: true })
        lancerFx("ok", rectDeLaCible())
        goNext()
        return
      }
      if (j.compte === "faute") {
        compterEssai()
        pendingRef.current.errors += 1
        if (j.message) {
          setVerdict({ ok: false, reason: j.reason ?? "ko", message: j.message })
          lancerFx("ko", rectDeLaCible(), j.message)
        }
      } else if (j.compte === "tatonnement") {
        // Un geste d'exploration ne coûte rien : il sert seulement à savoir
        // quand proposer de l'aide.
        compterTatonnement()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goNext, rectDeLaCible],
  )

  /* ═══════════ LES GESTES DE LA SURFACE ═══════════ */

  const onGeste = useCallback(
    (geste: GesteOutlook | null, obs: OutlookObservation | null, opts?: { tentative?: boolean }) => {
      const s = steps[indexRef.current]
      const rang = indexRef.current
      if (!s || finished) {
        if (geste) setEtat((p) => appliquerGeste(p, geste))
        return
      }

      const surEtat = adaptateurOutlook.seJugeSurEtat(s.action.type)

      setEtat((prec) => {
        const suivant = geste ? appliquerGeste(prec, geste) : prec

        // Sur une étape jugée sur l'ÉTAT, l'observation est l'état complet.
        const observation: OutlookObservation | null = surEtat
          ? { kind: "o:etatChange", etat: suivant }
          : obs
        if (!observation) return suivant

        /*
         * ⚠️ LA FENÊTRE DE MISE EN PLACE NE BLOQUE PAS LE JUGEMENT.
         *
         * Elle sert UNIQUEMENT à ne pas compter comme geste de l'apprenant ce
         * que la mise en place produit elle-même — poser `setup.courrier` émet
         * un `o:etatChange` que personne n'a provoqué, et le compter proposerait
         * de l'aide un cran trop tôt sur toutes les étapes.
         *
         * Une première version renvoyait ici sans juger : pendant 2,5 secondes,
         * le geste d'un apprenant rapide était PUREMENT PERDU. Mesuré au banc —
         * « Cliquez sur Répondre » ne franchissait jamais son étape. Le geste
         * doit toujours être jugé ; seule sa comptabilisation est suspendue.
         */
        const automatique = observation.kind === "o:etatChange" && dansFenetreMiseEnPlace()

        void jugerObservation(s, rang, observation).then((j) => {
          if (!j) return
          /* Sur une étape d'état, un geste qui n'aboutit pas n'est un ÉCHEC que
             si l'apprenant a vraiment tenté l'action attendue. Sans ce filtre,
             la moindre navigation afficherait un reproche injuste — c'est ce qui
             plafonnait 18 évaluations Excel sur 27. */
          if (!j.ok && surEtat && !opts?.tentative) {
            if (!automatique) compterTatonnement()
            return
          }
          if (!j.ok && automatique) return
          appliquerJugement(j)
        })
        return suivant
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, finished, jugerObservation, appliquerJugement],
  )

  /* ═══════════ ENTRER DANS L'ATELIER ═══════════ */

  const [entree, setEntree] = useState(false)
  const commencerAtelier = useCallback(async () => {
    if (entree) return
    setEntree(true)
    try {
      // En évaluation, l'entrée est BLOQUÉE tant que le passage n'est pas ouvert :
      // jouer sans passage laisserait l'apprenant composer une épreuve dont rien
      // ne serait noté.
      const ok = await commencer()
      if (!ok) return
      ouvrirLAtelier()
    } finally {
      setEntree(false)
    }
  }, [commencer, ouvrirLAtelier, entree])

  /* ═══════════ CE QUE L'ATELIER DIT ═══════════ */

  const attendu = useMemo(
    () => (step ? adaptateurOutlook.attendu(step.action as never) : null),
    [step],
  )
  const nature: "lecture" | "action" | "evaluee" = !step
    ? "action"
    : step.action.type === "READ"
      ? "lecture"
      : evaluationNotee
        ? "evaluee"
        : "action"

  const filModule = scenario.moduleTitle ?? ""
  const filChapitre = scenario.title
  const gradable = gradableStepCount(scenario)
  const notePassage = bilan?.score ?? null

  return (
    <AtelierShell
      chapterId={chapterId}
      mode={mode}
      evaluationNotee={evaluationNotee}
      filModule={filModule}
      filChapitre={filChapitre === filModule ? "" : filChapitre}
      index={index}
      total={steps.length}
      relais={relais}
      sommaire={sommaire}
      onNaviguer={onNaviguer}
      note={note}
      onNote={onNote}
      notesHref={notesHref}
      afficherRessources={afficherRessources}
      documentsChapitre={documentsChapitre}
      documentsFormation={documentsFormation}
      documentsHref={documentsHref}
      introVue={introVue}
      cleGuide={cleGuide}
      preview={preview}
      pleinCadre={pleinCadre}
      finished={finished}
      onQuitter={onQuitter}
      consigne={
        finished || !step || !introVue
          ? null
          : {
              texte: step.consigne,
              nature,
              lecture: step.action.type === "READ",
              aDemonstration: !!step.montrer?.length,
              attendu,
              // Jamais servie en évaluation : le bloc qui l'affiche y est déjà
              // inatteignable, et la calculer serait la faire transiter pour rien.
              reponse: evaluationNotee ? null : adaptateurOutlook.reponse(step.action as never),

              aide: step.aide?.text ?? null,
              aideVisible: hintShown,
              // Outlook n'ancre pas encore de bulle sur la surface : l'aide
              // s'affiche donc sous la consigne. Ne pas passer `true` sans avoir
              // posé le repère, sinon l'aide disparaîtrait des deux endroits.
              aideAncree: false,
              indiceDisponible: mode === "EXERCISE" && !hintShown && !!step.aide,

              evaluationNotee,
              relais,
              relaisActif,
              verdict,
              aplomb: null,
              panneJuge: pannneJuge,
              passageEnCours,

              aideProposee: essais >= 3 || tatonnements >= 6 || tropLong,
              demonstration,
              demoFinie,
              demoRejouable: false,

              index,
              total: steps.length,
              reculPossible,

              onMontrer: evaluationNotee ? passerLaQuestion : demarrerDemonstration,
              onDebloquer: goNext,
              onRejouerDemo: rejouerDemonstration,
              onIndice: () => {
                montrerIndice()
                pendingRef.current.hints += 1
              },
              onSuivant: () => onGeste(null, { kind: "o:control", control: "sim-suivant" }),
              onReculer: () => setReculDemande(true),
            }
      }
    >
      {/* LA SURFACE RESTE MONTÉE EN PERMANENCE.
          L'écran d'ouverture et l'écran de fin se SUPERPOSENT : démonter la
          surface rechargerait la boîte et perdrait le travail de l'apprenant. */}
      <div ref={zoneRef} style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <CourrierSurface etat={etat} onGeste={onGeste} largeur={largeur} />

        {/* Jalon de franchissement — décoratif, donc `pointer-events: none`.
            Sans cela il avalait le clic de l'apprenant qui enchaîne : quatre
            scénarios Excel sur six échouaient à l'étape suivante. */}
        {jalon && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 45,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 15px",
                borderRadius: 12,
                background: "rgba(16,32,27,.93)",
                color: "#fff",
                fontSize: 12.5,
                animation: "o-jalon .5s cubic-bezier(.2,.9,.2,1) both",
              }}
            >
              <span style={{ color: "#4ED08A", fontWeight: 800 }}>✓</span>
              <span>Étape {jalon.n} franchie{jalon.texte ? ` — ${jalon.texte}` : ""}</span>
            </div>
          </div>
        )}

        {/* Écran d'ouverture — superposé, jamais à la place de la surface. */}
        {!introVue && (
          <EcranOuverture
            scenario={scenario}
            mode={mode}
            etapes={steps.length}
            gradable={gradable}
            repriseEvaluation={repriseEvaluation}
            scorePrecedent={scorePrecedent ?? null}
            passagesPrecedents={passagesPrecedents}
            enCours={entree || ouvertureEnCours}
            panne={pannneJuge}
            onCommencer={() => void commencerAtelier()}
          />
        )}

        {/* Écran de fin — le bilan est du générique, il n'est pas réécrit ici. */}
        {finished && (
          <div style={{ position: "absolute", inset: 0, zIndex: 50, overflowY: "auto", background: "#FAF9F7" }}>
            {evaluationNotee ? (
              <BilanFin
                filChapitre={filChapitre}
                notePassage={notePassage as number}
                gestesEvalues={gradable}
                scorePrecedent={scorePrecedent ?? null}
                bilan={bilan}
                noteEnregistree={noteEnregistree}
                onReessayer={() => void cloturer()}
                reessaiEnCours={clotureEnCours}
                enAttente={bilanEnAttente}
                onNaviguer={onNaviguer}
                onRepasser={onRejouer}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  minHeight: "100%",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: 30, color: "#2E9E63" }}>✓</span>
                <h2 style={{ margin: "10px 0 6px", fontSize: 17, color: "#0F1F17" }}>{filChapitre}</h2>
                <p style={{ margin: 0, maxWidth: 460, fontSize: 13, lineHeight: 1.6, color: "#5A6660" }}>
                  {scenario.outro?.body ?? `Chapitre terminé — ${steps.length} étapes franchies.`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Confirmation avant de reculer : les saisies restent, le geste est à
            refaire. `confirm()` natif est proscrit dans ce dépôt. */}
        {reculDemande && (
          <div
            role="dialog"
            aria-label="Revenir à l'étape précédente"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 55,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: "rgba(15,31,23,.34)",
            }}
          >
            <div style={{ width: "min(360px,100%)", padding: 16, borderRadius: 12, background: "#fff" }}>
              <b style={{ fontSize: 13.5, color: "#0F1F17" }}>Revenir à l'étape précédente ?</b>
              <p style={{ margin: "6px 0 12px", fontSize: 12.5, lineHeight: 1.55, color: "#5A6660" }}>
                Ce que vous avez saisi reste en place, mais le geste de l'étape {index} sera à refaire.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 7 }}>
                <button
                  type="button"
                  onClick={() => setReculDemande(false)}
                  style={{ border: "1px solid #E2DCD1", background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, minHeight: 36, cursor: "pointer" }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  data-control="sim-reculer-confirmer"
                  onClick={reculer}
                  style={{ border: 0, background: "#10201B", color: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, minHeight: 36, cursor: "pointer" }}
                >
                  Revenir
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes o-jalon { from { opacity: 0; transform: translateY(8px) scale(.97) } to { opacity: 1; transform: none } }
          @media (prefers-reduced-motion: reduce) { [style*="o-jalon"] { animation: none !important } }
        `}</style>
      </div>
    </AtelierShell>
  )
}

/* ═══════════════════ ÉCRAN D'OUVERTURE ═══════════════════ */

function EcranOuverture({
  scenario,
  mode,
  etapes,
  gradable,
  repriseEvaluation,
  scorePrecedent,
  passagesPrecedents,
  enCours,
  panne,
  onCommencer,
}: {
  scenario: SimulationScenario
  mode: Mode
  etapes: number
  gradable: number
  repriseEvaluation?: boolean
  scorePrecedent?: number | null
  passagesPrecedents?: number
  enCours: boolean
  panne: "reseau" | "passage" | null
  onCommencer: () => void
}) {
  const evaluation = mode === "EVALUATION"
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflowY: "auto",
        padding: "32px 24px",
        background: "linear-gradient(180deg,#faf9f5 0%,#f2efe8 100%)",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <span
          style={{
            display: "inline-block",
            marginBottom: 9,
            padding: "3px 9px",
            borderRadius: 5,
            background: evaluation ? "#FBF1DF" : "#E9F1FB",
            color: evaluation ? "#8A5A12" : "#2C6BB0",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: ".08em",
          }}
        >
          {evaluation ? "ÉVALUATION NOTÉE" : mode === "EXERCISE" ? "EXERCICE" : "LEÇON"}
        </span>
        <h1 style={{ margin: "0 0 10px", fontSize: 21, lineHeight: 1.25, color: "#0F1F17" }}>
          {scenario.intro?.title ?? scenario.title}
        </h1>
        <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.65, color: "#3C4A43" }}>
          {scenario.intro?.body ?? ""}
        </p>

        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#6E7A74" }}>
          {etapes} étape{etapes > 1 ? "s" : ""}
          {evaluation && ` · ${gradable} notée${gradable > 1 ? "s" : ""} · à faire d'une traite`}
        </p>

        {/* Une évaluation repart de zéro : le dire AVANT, pas après. */}
        {evaluation && repriseEvaluation && (
          <p style={{ margin: "0 0 14px", padding: "9px 12px", borderRadius: 9, background: "#FBF1DF", fontSize: 12.5, lineHeight: 1.55, color: "#6B4A12" }}>
            Vous aviez commencé cette évaluation. Elle reprend <b>depuis le début</b>, sur une boîte remise à neuf : chaque question compte au premier essai.
          </p>
        )}
        {evaluation && typeof scorePrecedent === "number" && (
          <p style={{ margin: "0 0 14px", padding: "9px 12px", borderRadius: 9, background: "#E7F3EB", fontSize: 12.5, lineHeight: 1.55, color: "#0b5c30" }}>
            Meilleure note : <b>{Math.round(scorePrecedent * 100)} %</b>
            {passagesPrecedents ? ` · ${passagesPrecedents} passage${passagesPrecedents > 1 ? "s" : ""}` : ""}. Un nouveau passage produit une note, mais <b>seule la meilleure est conservée</b>.
          </p>
        )}
        {panne && (
          <p style={{ margin: "0 0 14px", padding: "9px 12px", borderRadius: 9, background: "#FBE9E7", fontSize: 12.5, lineHeight: 1.55, color: "#8A2A1E" }}>
            L'évaluation n'a pas pu être ouverte{panne === "reseau" ? " (réseau)" : ""}. Rien n'a été noté : réessayez.
          </p>
        )}

        <button
          type="button"
          data-control="intro-commencer"
          onClick={onCommencer}
          disabled={enCours}
          style={{
            border: 0,
            borderRadius: 10,
            background: enCours ? "#8FA49C" : "#10201B",
            color: "#fff",
            padding: "11px 20px",
            fontSize: 13.5,
            fontWeight: 700,
            minHeight: 44,
            cursor: enCours ? "default" : "pointer",
          }}
        >
          {enCours ? "Ouverture…" : evaluation ? "Commencer l'évaluation" : "Commencer"}
        </button>
      </div>
    </div>
  )
}
