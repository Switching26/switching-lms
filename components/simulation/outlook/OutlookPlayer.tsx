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
import AfficheModule, { numeroModule } from "../AfficheModule"
import { natureEtape } from "@/lib/simulation/attendu"
import BilanFin from "../BilanFin"
import DemonstrationGeste from "../DemonstrationGeste"
import type { CibleDemo, PlanDemo } from "@/lib/simulation/demonstration"
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

/**
 * Le constat pédagogique d'une étape réussie.
 *
 * `types.ts` le définit sans ambiguïté : « message affiché APRÈS RÉUSSITE, quand
 * une explication est utile ». Ce n'est donc pas un message d'erreur — c'est ce
 * qui fait remarquer l'effet du geste qu'on vient de faire, et transforme une
 * manipulation en apprentissage. Le ton d'Excel le montre bien : « Le 9 s'est
 * aligné à droite : Excel l'a bien reconnu comme un nombre. »
 *
 * ⚠️ Le champ était déclaré depuis l'origine et n'était lu par PERSONNE : les
 * 906 phrases d'Excel, les 546 de Word et les 98 de PowerPoint sont écrites puis
 * jetées. Les afficher est le seul moyen que ce travail serve à quelqu'un.
 *
 * En évaluation notée il n'y en a pas : `feedback` figure dans `CLES_SECRETES`,
 * donc l'expurgation l'a retiré avant que le scénario n'atteigne le navigateur —
 * et c'est voulu, un examen ne commente pas les réponses au fil de l'eau.
 */
function constatDe(step?: SimulationStep): string | undefined {
  const f = step?.feedback?.trim()
  return f || undefined
}

/**
 * Un refus sur cette étape ne peut-il être QU'UNE FAUTE ?
 *
 * Se décide avec le seul type de l'étape et la nature de l'observation — deux
 * choses que le navigateur possède déjà en évaluation notée. Aucune réponse
 * attendue n'entre dans ce calcul : ce n'est pas un oracle, c'est une lecture
 * du vocabulaire du juge.
 */
function fauteCertaine(step: SimulationStep, obs: OutlookObservation): boolean {
  if (adaptateurOutlook.estNavigation(obs as never)) return false
  return step.action.type === "O_CLICK_CONTROL" || step.action.type === "O_TYPE_TEXT"
}

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
  /** Miroir de la boîte, lisible hors rendu — même idiome que `deckRef` côté PowerPoint. */
  const etatRef = useRef(etat)
  etatRef.current = etat

  /**
   * La boîte telle qu'elle était À L'ARRIVÉE sur l'étape.
   *
   * Point de départ que toute démonstration doit retrouver. Sans lui,
   * l'apprenant qui ouvre le mauvais message, classe de travers ou commence une
   * rédaction avant de réclamer « Montrez-moi » voit un geste joué sur une
   * boîte qui n'est plus celle dont la consigne parle — et la démonstration
   * peut désigner un message que le volet n'affiche même plus.
   *
   * L'identifiant de l'étape est retenu AVEC la photo, et vérifié avant de
   * reposer quoi que ce soit : une photo qui ne serait pas celle de l'étape
   * courante rembobinerait le travail de l'apprenant de plusieurs étapes. Mieux
   * vaut alors ne rien restaurer que restaurer à côté.
   */
  const etatDepartEtapeRef = useRef<{ id: string; etat: EtatOutlook } | null>(null)

  /** Zone de travail : la hauteur se MESURE, elle ne se calcule jamais. */
  const zoneRef = useRef<HTMLDivElement>(null)
  const { largeur } = useMesureZoneTravail(zoneRef)

  /*
   * Le constat de réussite vit ICI, et pas dans le flash du noyau.
   *
   * `useAtelier.lancerFx` efface un « ok » au bout de 1 400 ms — durée juste
   * pour un halo, beaucoup trop courte pour une phrase de deux lignes. Le
   * commentaire du noyau l'assume (« la réussite ne fait que confirmer un geste
   * déjà accompli »), ce qui n'est plus vrai dès qu'on y met une explication.
   * Plutôt que de toucher au socle — partagé avec trois autres applications —,
   * le constat garde son propre cycle de vie, aligné sur le temps de LECTURE.
   */
  const [constat, setConstat] = useState<{ texte: string; k: number } | null>(null)
  const constatTimerRef = useRef<number | null>(null)
  const montrerConstat = useCallback((texte?: string) => {
    if (constatTimerRef.current) window.clearTimeout(constatTimerRef.current)
    if (!texte) {
      setConstat(null)
      return
    }
    setConstat({ texte, k: Date.now() })
    // ~45 signes par seconde, plancher 3 s : au-delà de 22 signes/s personne ne
    // lit, c'est la mesure faite sur les bulles de démonstration d'Excel.
    const duree = Math.min(9000, Math.max(3000, texte.length * 45))
    constatTimerRef.current = window.setTimeout(() => setConstat(null), duree)
  }, [])
  useEffect(() => () => { if (constatTimerRef.current) window.clearTimeout(constatTimerRef.current) }, [])

  /* ═══════════ LE NOYAU ═══════════ */

  const retour = useRetourVisuel()
  const {
    verdict,
    setVerdict,
    fx,
    lancerFx,
    relais,
    relaisActif,
    marquerRelais,
    jalon,
    poserJalon,
  } = retour

  /*
   * LE VERDICT COURANT A-T-IL DÉJÀ ÉTÉ DIT SUR LA SURFACE ?
   *
   * 🔴 CE DRAPEAU NE PEUT PAS ÊTRE UNE CONSTANTE ICI, contrairement à Excel et
   * à Word. Outlook a DEUX chemins qui posent un verdict `ok: false` porteur
   * d'un message, et un seul l'annonce sur la surface :
   *   — « faute »       → `lancerFx("ko", null, dit)` : le bandeau le dit déjà,
   *                       le répéter sous la consigne le ferait lire deux fois ;
   *   — « tâtonnement » → AUCUN effet, délibérément (« rien n'est pénalisé, on
   *                       informe sans dramatiser »). C'est précisément le cas
   *                       que le drapeau du châssis a été créé pour rendre
   *                       visible : `o:selectMessage` et `o:selectFolder` sont
   *                       toujours classés navigation, soit 127 étapes sur 728
   *                       qui refusaient le geste sans dire pourquoi.
   * Déclarer `true` en constante les rendrait toutes muettes à nouveau — on
   * réparerait le doublon en rouvrant le trou qu'on venait de boucher.
   *
   * On ne se fie pas non plus à la présence de `fx` : son minuteur l'efface au
   * bout de 2,8 s, et la ligne sous la consigne, elle, est persistante. Le
   * message réapparaîtrait sous la consigne à l'extinction du bandeau.
   */
  const [verdictAncre, setVerdictAncre] = useState(false)

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

  /**
   * Le chapitre qui suit, pour l'écran de fin.
   *
   * Même calcul que chez Excel : la position dans le sommaire. Sans lui,
   * l'apprenant qui termine un chapitre n'a aucune porte de sortie et doit
   * rouvrir le panneau des leçons pour continuer.
   */
  const chapitreSuivant = (() => {
    if (!sommaire?.length) return null
    const i = sommaire.findIndex((e) => e.id === chapterId)
    return i >= 0 && i < sommaire.length - 1 ? sommaire[i + 1] : null
  })()

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

  /**
   * REPOSER LA BOÎTE TELLE QU'ELLE ÉTAIT À L'ARRIVÉE SUR L'ÉTAPE.
   *
   * Deux usages, une seule mécanique : la démonstration s'en sert pour
   * reconstituer le point de départ, et l'apprenant coincé s'en sert pour
   * SORTIR D'UNE IMPASSE (voir `impasse` plus bas).
   *
   * Déclarée en `ref` parce que `useAideProgressive` la reçoit en rappel et
   * qu'elle doit rester stable, tout en lisant l'étape courante.
   */
  const reposerEtapeRef = useRef<() => void>(() => {})
  reposerEtapeRef.current = () => {
    const depart = etatDepartEtapeRef.current
    if (!depart || depart.id !== stepRef.current?.id) return
    // La ref est reposée sans attendre le rendu : le plan de démonstration lit
    // la boîte pour choisir ses cibles, et il est calculé aussitôt après.
    etatRef.current = depart.etat
    setEtat(depart.etat)
  }

  const aide = useAideProgressive({
    mode,
    index,
    finished,
    aUneEtape: !!step,
    /*
     * Une démonstration est une RECONSTITUTION, pas la poursuite du travail en
     * cours : on repose la boîte du début de l'étape avant chaque passage, le
     * premier comme les « Revoir ». Excel fait de même avec le poste de
     * travail, et pour la même raison — sans quoi l'apprenant qui abîme quelque
     * chose puis redemande à voir reçoit la même explication fausse qu'au
     * départ.
     */
    avantDemonstration: () => reposerEtapeRef.current(),
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
    setDemoFinie,
    rejeu,
    demarrerDemonstration,
    rejouerDemonstration,
    reinitialiserPourEtape,
    reinitialiserAAlArrivee,
    ouvrirFenetreMiseEnPlace,
    dansFenetreMiseEnPlace,
  } = aide

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
    setVerdictAncre(false)
    // L'identifiant vient de l'étape VISÉE, pas de `stepRef` : la mise en place
    // est appelée avec le nouvel index avant que le rendu ne l'ait propagé.
    const idEtape = e?.id ?? null
    if (!c) {
      // Aucun décor à poser : le point de départ est la boîte telle que l'étape
      // précédente l'a laissée. Il faut quand même la photographier, sinon les
      // étapes sans `setup.courrier` n'auraient rien à restaurer.
      etatDepartEtapeRef.current = idEtape ? { id: idEtape, etat: etatRef.current } : null
      return
    }
    // La mise en place produit des observations qui ne sont PAS des gestes de
    // l'apprenant : sans cette fenêtre, elles comptent comme des tâtonnements et
    // l'aide se propose un cran trop tôt, sur toutes les étapes.
    ouvrirFenetreMiseEnPlace()
    // On calcule depuis la ref plutôt que dans un rappel de `setEtat` : c'est
    // ce qui permet de retenir le résultat pour la photo, et deux mises en
    // place qui s'enchaînent avant un rendu restent correctes.
    const prec = etatRef.current
    const suivant: EtatOutlook = { ...prec }
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
    etatDepartEtapeRef.current = idEtape ? { id: idEtape, etat: suivant } : null
    etatRef.current = suivant
    setEtat(suivant)
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
          /*
           * 🔴 CE QUE LE CLIENT PEUT TRANCHER SANS DEVENIR UN ORACLE.
           *
           * La route de correction ne renvoie JAMAIS `compte` sur un échec, et
           * c'est délibéré : distinguer « vraie faute » de « tâtonnement »
           * reviendrait à dire si le geste était du bon GENRE, donc à renseigner
           * sur l'action attendue. Le client retombait donc sur « tâtonnement »
           * pour TOUT — et `errorCount` restait à zéro sur les évaluations, la
           * trace Qualiopi la plus utile au formateur.
           *
           * Or il existe deux familles où le refus ne peut RIEN être d'autre
           * qu'une faute, et où le déduire n'apprend rien de neuf : le TYPE de
           * l'étape est déjà connu du navigateur (`publier` le conserve, sans
           * quoi le player ne saurait pas quoi router).
           *
           *  · `O_CLICK_CONTROL` — un clic refusé est `wrong_control`, toujours.
           *  · `O_TYPE_TEXT` hors recherche — un texte refusé est `wrong_text`
           *    ou `wrong_field`, toujours.
           *
           * Les `O_EXPECT_*` restent ambigus (`no_…` en cours de composition
           * contre `wrong_…` contredit) : on ne devine pas, on les laisse en
           * tâtonnement. Leur compte exact vit côté serveur, dans le `fautes` du
           * verdict d'étape, qui est la source de la note.
           */
          compte: j.ok === true ? "reussite" : fauteCertaine(s, obs) ? "faute" : "tatonnement",
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

  /**
   * Rectangle d'un élément de la surface, dans le repère de la zone de travail.
   *
   * La surface d'Outlook est du DOM : il n'y a aucune géométrie à calculer,
   * contrairement au canvas d'Univer où Excel doit interroger le squelette de
   * rendu. Un sélecteur suffit.
   */
  const rectDe = useCallback((sel: string): { left: number; top: number; width: number; height: number } | null => {
    const zone = zoneRef.current
    const cible = zone?.querySelector(sel) as HTMLElement | null
    if (!zone || !cible) return null
    const rz = zone.getBoundingClientRect()
    const rc = cible.getBoundingClientRect()
    return { left: rc.left - rz.left, top: rc.top - rz.top, width: rc.width, height: rc.height }
  }, [])

  /** Rectangle de la cible de l'étape, pour ancrer le retour visuel. */
  const rectDeLaCible = useCallback((): { left: number; top: number; width: number; height: number } | null => {
    const c = step ? adaptateurOutlook.cible(step.action as never) : {}
    const sel = c.controle ? `[data-control="${c.controle}"]` : c.dom
    return sel ? rectDe(sel) : null
  }, [step, rectDe])

  /* ═══════════ « MONTREZ-MOI » ═══════════ */

  /**
   * Fenêtre pendant laquelle les gestes viennent de la DÉMONSTRATION.
   *
   * La démonstration agit pour de vrai — sans quoi elle promènerait un curseur
   * sur le bon bouton sans que rien ne change, ce qui est la définition d'une
   * démonstration incomplète. Mais ses gestes ne doivent ni valider l'étape ni
   * compter au score : sinon la séquence se saborde en pleine explication, et
   * l'apprenant voit « C'est exact » sans avoir rien fait.
   *
   * C'est une ÉCHÉANCE, pas un booléen : deux effets qui se chevauchent, et le
   * plus rapide relâcherait un verrou que l'autre vient de poser. Le défaut a
   * coûté cher côté Excel, où une observation passait au travers et validait
   * l'étape toute seule.
   */
  const verrouDemoRef = useRef(0)
  const sousDemonstration = useCallback(() => Date.now() < verrouDemoRef.current, [])

  /**
   * ⚠️ CE QU'UN PETIT ÉCRAN REPLIE, ET LE BOUTON QUI LE ROUVRE.
   *
   * Mesuré sur les 103 chapitres, aux deux tailles : **59 gestes dessinent leur
   * repère en 1440 et RIEN en 390.** Ce ne sont pas des cibles hors champ — ce
   * sont des cibles ABSENTES DU DOM, parce que la surface se replie en mobile :
   *
   *   • le volet des dossiers devient un tiroir rendu seulement quand il est
   *     ouvert (`CourrierSurface`, D13 : « c'est ce qui garantit qu'un
   *     `cr-dossier-*` n'existe jamais deux fois dans le DOM ») — 21 gestes,
   *     tous « Ouvrez ce dossier. » ;
   *   • la liste des messages cède la place au volet de lecture dès qu'un
   *     message est ouvert (`voletMobile`) — 18 gestes « Ouvrez ce message
   *     dans la liste. ».
   *
   * Le remède est celui déjà éprouvé sur PowerPoint : quand la cible n'existe
   * pas, on désigne LE BOUTON QUI LA FAIT APPARAÎTRE. L'apprenant voit alors
   * un geste qu'il peut réellement accomplir, au lieu d'une bulle orpheline.
   *
   * On ne devine pas : les identifiants sont ceux du composant lui-même
   * (`cr-dossiers` dans `BoutonDossiers`, `cr-retour` dans `VoletLecture`).
   *
   * ═══ POURQUOI UNE CHAÎNE, ET NON UN SEUL REPLI ═══
   *
   * Mesuré au navigateur à 390 px, sur `m04-l03` : ouvrir un message fait
   * disparaître d'un coup TOUT l'en-tête de la liste — `cr-nouveau`,
   * `cr-recherche` ET `cr-dossiers`, qui y vivent tous les trois. Donc :
   *
   *   • « Nouveau message » et la recherche n'existent plus tant qu'on lit un
   *     message. Ce n'est pas seulement un repère manquant : l'étape devient
   *     INFRANCHISSABLE au doigt, et rien ne dit à l'apprenant qu'il doit
   *     d'abord revenir en arrière. Vérifié : après `cr-retour`, les trois
   *     réapparaissent ;
   *   • un repli unique `cr-dossier-* → cr-dossiers` échouerait dans ce même
   *     état, puisque le ☰ est lui aussi parti. Il faut alors remonter d'un cran
   *     de plus, jusqu'au bouton de retour.
   *
   * D'où une CHAÎNE, parcourue jusqu'au premier bouton réellement présent. On
   * s'arrête là : pour un champ de la fenêtre de rédaction (`cr-champ-*`,
   * `cr-cci`), aucun bouton unique ne la rouvre depuis n'importe quel état —
   * inventer un repli y serait désigner un geste qui n'aboutit pas.
   */
  const chaineDeRepli = useCallback((selecteur: string): string[] => {
    const m = /^\[data-control="([^"]+)"\]$/.exec(selecteur)
    if (!m) return []
    const id = m[1]

    /*
     * ⚠️ LA VUE CALENDRIER N'EST PAS UN REPLI D'ÉCRAN — et c'est le seul cas de
     * cette liste qui vaut AUSSI en 1440.
     *
     * `VueCalendrier` remplace `VueCourrier` : ni liste, ni dossiers, ni volet de
     * lecture. Mesuré aux deux tailles sur `m10-e02`, dont l'étape 0 bascule en
     * calendrier et l'étape 1 demande d'ouvrir un message — sa consigne dit
     * d'ailleurs « Revenez au courrier et ouvrez l'invitation ». Après un clic sur
     * l'onglet Courrier, la liste et son message réapparaissent.
     *
     * Il n'est proposé QUE si l'on n'est pas déjà dans le courrier : l'onglet
     * « Courrier » est rendu en permanence, et le désigner alors qu'il est déjà
     * actif ferait montrer un geste qui n'aboutit à rien — précisément le défaut
     * que ce mécanisme corrige.
     */
    const horsCourrier = etatRef.current.vue !== "courrier" ? ["cr-vue-courrier"] : []

    if (id.startsWith("cr-dossier-")) return ["cr-dossiers", "cr-retour", ...horsCourrier]
    if (id.startsWith("cr-message-")) return ["cr-retour", ...horsCourrier]
    // Les trois habitants de l'en-tête de la liste, que le volet de lecture masque.
    if (id === "cr-nouveau" || id === "cr-recherche" || id === "cr-dossiers")
      return ["cr-retour", ...horsCourrier]
    return []
  }, [])

  /**
   * Le rectangle d'une cible, AMENÉE DANS LE CHAMP si elle en sort.
   *
   * `rectDe` seul lit la position telle quelle : un élément sous le pli rendait
   * un rectangle hors zone, et le calque peignait son halo là où personne ne
   * regarde. On amène d'abord, on remesure ensuite — l'ordre inverse lirait la
   * position d'avant.
   */
  const rectDeVisible = useCallback(
    (selecteur: string) => {
      const zone = zoneRef.current
      const el = zone?.querySelector(selecteur)
      if (!zone || !(el instanceof HTMLElement)) return null
      let rc = el.getBoundingClientRect()
      if (rc.width === 0 && rc.height === 0) return null
      let rz = zone.getBoundingClientRect()
      if (rc.right > rz.right || rc.left < rz.left || rc.bottom > rz.bottom || rc.top < rz.top) {
        el.scrollIntoView({ block: "nearest", inline: "center" })
        rc = el.getBoundingClientRect()
        rz = zone.getBoundingClientRect()
      }
      return { left: rc.left - rz.left, top: rc.top - rz.top, width: rc.width, height: rc.height }
    },
    [],
  )

  const resoudreDemo = useCallback(
    (cible: CibleDemo) => {
      if (cible.k !== "dom") return null
      const direct = rectDeVisible(cible.sel)
      if (direct) return direct
      for (const repli of chaineDeRepli(cible.sel)) {
        const r = rectDeVisible(`[data-control="${repli}"]`)
        if (!r) continue
        /* Crochet d'audit — hors production, même idiome que `__PPT_REPLI_UTILISE`.
           Il sert à PROUVER la symétrie au lieu de l'argumenter : si le repli ne se
           déclenche jamais sur grand écran, le comportement y est identique à
           celui d'avant le correctif. */
        if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
          const w = window as unknown as Record<string, unknown>
          const j = (w.__OUTLOOK_REPLI_UTILISE as string[] | undefined) ?? []
          j.push(`${cible.sel} → ${repli}`)
          w.__OUTLOOK_REPLI_UTILISE = j
        }
        return r
      }
      return null
    },
    [rectDeVisible, chaineDeRepli],
  )

  /**
   * Le plan de la démonstration.
   *
   * ⚠️ Il vient de l'ACTION, pas seulement de `step.montrer`. L'atelier lisait
   * jusqu'ici `!!step.montrer?.length` pour décider si une démonstration existe :
   * aucun scénario Outlook ne porte ce champ, donc « Montrez-moi » ne pouvait
   * apparaître nulle part — alors que l'adaptateur sait produire un plan pour
   * presque toutes les actions de la formation.
   *
   * Mémoïsé sur l'étape, jamais recalculé dans un état : chaque écriture de la
   * démonstration provoque un rendu, donc une nouvelle référence de `gestes`,
   * donc une minuterie relancée à l'infini — la séquence resterait figée sur son
   * premier geste, compteur bloqué à « 1 / n ».
   */
  const plan: PlanDemo | null = useMemo(() => {
    if (!step) return null
    if (step.montrer?.length) {
      const plans = step.montrer
        .map((a) => adaptateurOutlook.demonstration(a as never, {}))
        .filter(Boolean) as PlanDemo[]
      if (!plans.length) return null
      return { gestes: plans.flatMap((p) => p.gestes), pas: plans.flatMap((p) => p.pas) }
    }
    // En évaluation notée, ni réponse ni cible : on propose « Passer la question ».
    if (evaluationNotee) return null
    return adaptateurOutlook.demonstration(step.action as never, {})
  }, [step, evaluationNotee])

  /**
   * Presser un vrai bouton de la surface.
   *
   * On clique l'élément du DOM, jamais un gestionnaire interne : c'est le seul
   * moyen d'ouvrir un panneau dont le contenu n'existe pas tant qu'il est fermé,
   * et donc de rendre atteignable la cible du geste suivant. Une démonstration
   * qui « désignait » sans ouvrir jouait tout le reste à blanc.
   */
  const demoPresser = useCallback((id: string) => {
    verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + 900)
    const el = zoneRef.current?.querySelector(`[data-control="${id}"]`)
    if (el instanceof HTMLElement) el.click()
  }, [])

  /**
   * Saisir dans un champ de rédaction, pour de vrai.
   *
   * `ref` arrive sous la forme d'un `data-control` (`cr-champ-a`) : c'est ainsi
   * que l'adaptateur désigne ses cibles, la surface étant du DOM. Les trois
   * champs d'adresses passent par `destinataires`, qui sait découper une saisie
   * séparée par des points-virgules ; l'objet et le corps par `champ`.
   */
  const demoEcrire = useCallback((ref: string, valeur: string) => {
    verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + 900)
    const champ = ref.replace(/^cr-champ-/, "")
    const geste: GesteOutlook | null =
      champ === "a" || champ === "cc" || champ === "cci"
        ? { type: "destinataires", champ, valeur }
        : champ === "objet" || champ === "corps"
        ? { type: "champ", champ, valeur }
        : champ === "recherche"
        ? { type: "recherche", texte: valeur }
        : null
    if (!geste) return
    setEtat((p) => appliquerGeste(p, geste))
  }, [])

  const demoSelectionner = useCallback((ref: string) => {
    verrouDemoRef.current = Math.max(verrouDemoRef.current, Date.now() + 900)
    const el = zoneRef.current?.querySelector(`[data-control="${ref}"]`)
    if (el instanceof HTMLElement) el.click()
  }, [])

  /**
   * LE MÊME REFUS, TROIS FOIS DE SUITE, N'APPREND PLUS RIEN.
   *
   * Samuel a cliqué quatre mauvais dossiers en lisant quatre fois la phrase
   * « Ce n'est pas le dossier demandé : reprenez la liste des dossiers, à
   * gauche. » Une explication répétée à l'identique est un mur : elle dit à
   * l'apprenant qu'il se trompe sans jamais lui donner un angle neuf.
   *
   * Le compteur est PAR MOTIF, pas global : refuser deux fois pour deux raisons
   * différentes est une progression, pas un blocage — l'apprenant avance, il
   * n'insiste pas.
   */
  const [fauteSurEtape, setFauteSurEtape] = useState(false)
  const refusRef = useRef<{ motif: string; fois: number }>({ motif: "", fois: 0 })
  const escalader = useCallback(
    (motif: string | undefined, message: string): string => {
      const m = motif ?? ""
      refusRef.current = refusRef.current.motif === m
        ? { motif: m, fois: refusRef.current.fois + 1 }
        : { motif: m, fois: 1 }
      if (refusRef.current.fois < 2) return message
      /*
       * En ÉVALUATION on ne renvoie JAMAIS vers la consigne « qui nomme
       * l'élément » : elle ne le nomme pas, l'action est expurgée, et promettre
       * une aide inexistante est pire que se taire. On dit seulement que le
       * geste a déjà été refusé, ce que l'apprenant a le droit de savoir.
       */
      if (evaluationNotee) {
        return `${message} (${refusRef.current.fois}ᵉ tentative sur ce point.)`
      }
      return refusRef.current.fois === 2
        ? `${message} Relisez la consigne : elle nomme précisément l'élément attendu.`
        : `${message} Vous pouvez demander un indice, ou « Montrez-moi » pour voir le geste.`
    },
    [evaluationNotee],
  )
  // Une nouvelle étape efface l'historique des refus : le motif d'avant ne dit
  // rien de celle-ci.
  useEffect(() => {
    refusRef.current = { motif: "", fois: 0 }
    setFauteSurEtape(false)
  }, [index])

  /**
   * 🔴 « MONTREZ-MOI » EST UNE AIDE, ET IL NE SE COMPTAIT NULLE PART.
   *
   * `hintCount` n'était incrémenté que par le bouton « Un indice », lui-même
   * offert sous `mode === "EXERCISE" && !hintShown`. En LEÇON, `hintShown` vaut
   * vrai dès l'arrivée : le bouton n'existe pas, donc `hintCount` ne pouvait
   * structurellement JAMAIS dépasser zéro. Un apprenant pouvait réclamer la
   * démonstration à chaque étape d'une leçon entière et laisser une trace
   * Qualiopi vierge — c'est ce que Samuel a mesuré le 05/08/2026.
   *
   * Une démonstration est pourtant la forme la PLUS forte de l'aide : elle joue
   * le geste. La compter n'a rien d'un durcissement — la note n'en dépend pas,
   * seul le suivi du formateur en dépend.
   *
   * Le rejeu (« Revoir ») ne recompte pas : c'est la même aide regardée deux
   * fois, pas une aide de plus.
   */
  /**
   * Trace d'audit HORS PRODUCTION — même idiome que `__SIM_FAUTES` d'Excel.
   *
   * `persist` n'envoie ses compteurs qu'à la CLÔTURE du chapitre : sans ce
   * crochet, vérifier que la trace Qualiopi se remplit obligerait à jouer les
   * huit étapes d'une leçon dans un navigateur pour lire un seul nombre — et un
   * échec de pilotage à l'étape 6 ferait conclure à tort que le compteur est
   * mort. Le remplacement de `process.env.NODE_ENV` le retire du bundle livré.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return
    const w = window as unknown as Record<string, unknown>
    const id = window.setInterval(() => {
      w.__OUTLOOK_TRACE = { ...pendingRef.current }
    }, 200)
    return () => window.clearInterval(id)
  }, [pendingRef])

  /**
   * Déclencheur de démonstration — HORS PRODUCTION, comme `__WORD_FORCE_DEMO`
   * et `__PPT_FORCE_DEMO`. Outlook était la seule des quatre applications à ne
   * pas l'exposer, et c'est ce qui rendait ses démonstrations coûteuses à
   * éprouver : le bouton « Montrez-moi » n'apparaît qu'après trois erreurs, six
   * tâtonnements ou quarante-cinq secondes, donc chaque cas demandait de
   * fabriquer un échec avant de pouvoir seulement regarder.
   *
   * `__OUTLOOK_ETAPE` sert à se recaler AVANT toute mesure : juste après un
   * changement d'étape, les repères de la précédente sont encore dans la page,
   * et l'on compare alors l'attendu de l'étape N à l'écran de l'étape N-1.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return
    const w = window as unknown as Record<string, unknown>
    w.__OUTLOOK_ETAPE = step?.id
    w.__OUTLOOK_FORCE_DEMO = () => demarrerDemonstration()
  }, [step, demarrerDemonstration])

  const aideDemandee = useCallback(() => {
    pendingRef.current.hints += 1
    demarrerDemonstration()
  }, [demarrerDemonstration, pendingRef])

  const appliquerJugement = useCallback(
    (j: JugementEtape | null) => {
      if (!j) return
      const courante = steps[indexRef.current]
      if (j.ok) {
        setVerdict({ ok: true })
        lancerFx("ok", rectDeLaCible())
        // Le constat dit ce que le geste vient de produire — ce qu'aucune phrase
        // déduite ne peut faire. Absent en évaluation, où il a été expurgé.
        montrerConstat(constatDe(courante))
        goNext()
        return
      }
      // Une erreur chasse le constat de l'étape précédente : le laisser
      // afficherait un encouragement vert au-dessus d'un message rouge.
      montrerConstat(undefined)
      if (j.compte === "faute") {
        compterEssai()
        setFauteSurEtape(true)
        pendingRef.current.errors += 1
        /*
         * Une faute est TOUJOURS dite. Le juge rend un message vide quand
         * l'observation n'est simplement pas du type attendu (`no_control`,
         * `no_typing`…) : le point du premier essai est pourtant bien perdu, et
         * se taire laissait l'apprenant devant un écran inerte sans savoir que
         * son geste venait de lui coûter un point. Excel a le même repli.
         */
        const dit = escalader(j.reason, j.message || "Ce n'est pas encore ça — réessayez.")
        setVerdict({ ok: false, reason: j.reason ?? "ko", message: dit })
        // Dit sur la surface juste en dessous : le châssis ne le répète pas.
        setVerdictAncre(true)
        /*
         * ⚠️ LE HALO D'ERREUR NE S'ANCRE JAMAIS SUR LA CIBLE ATTENDUE.
         *
         * Il le faisait, et cela DONNAIT la réponse : se tromper entourait d'un
         * cadre rouge le bon bouton. Vu à l'écran, pas dans le code. En
         * évaluation notée c'était une divulgation pure et simple — l'action est
         * expurgée, mais `publier` conserve `control` pour que l'étape reste
         * jouable, donc la cible restait calculable côté navigateur.
         *
         * Sans rectangle, le halo couvre la surface : il dit « ce geste ne
         * convient pas » sans désigner celui qui conviendrait. Le halo de
         * RÉUSSITE, lui, reste ancré : l'apprenant a déjà trouvé.
         */
        lancerFx("ko", null, dit)
      } else if (j.compte === "tatonnement") {
        // Un geste d'exploration ne coûte rien : il sert seulement à savoir
        // quand proposer de l'aide. Mais quand le juge sait dire POURQUOI le
        // geste ne convient pas — mauvais message ouvert, mauvais dossier —, se
        // taire serait gâcher la seule explication disponible. Pas de flash
        // rouge ici : rien n'est pénalisé, on informe sans dramatiser.
        compterTatonnement()
        if (j.message) {
          setVerdict({ ok: false, reason: j.reason ?? "", message: escalader(j.reason, j.message) })
          // Aucun effet n'est lancé ici : sans ce `false`, la seule explication
          // disponible n'existerait nulle part.
          setVerdictAncre(false)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goNext, rectDeLaCible],
  )

  /* ═══════════ LES GESTES DE LA SURFACE ═══════════ */

  /**
   * 🔴 UNE FRAPPE EN COURS NE SE JUGE PAS. Le défaut le plus humiliant du lot.
   *
   * La surface d'Outlook est du DOM : chaque champ émet `onChange` À CHAQUE
   * TOUCHE, contrairement au tableur d'Excel qui n'émet qu'à la validation par
   * Entrée. Sans ce délai, un apprenant qui tapait correctement « vitrine » se
   * voyait reprendre six fois — « v », « vi », « vit »… — et le simulateur lui
   * proposait de MONTRER LA RÉPONSE avant la septième lettre, qui validait.
   * Filmé par Samuel le 05/08/2026 sur un passage réel.
   *
   * Le geste s'applique toujours immédiatement : l'apprenant voit ses lettres.
   * Seul le JUGEMENT attend que la frappe se pose. Ce n'est pas de la clémence,
   * c'est la seule façon de distinguer « en train d'écrire » de « a écrit ».
   *
   * ⚠️ CE DÉLAI DOIT AUSSI RETENIR L'ENVOI AU JUGE DISTANT. En évaluation notée,
   * chaque appel à `/verify` ÉCRIT un verdict : sans lui, les six lettres
   * intermédiaires auraient déjà coûté le point avant que la septième n'arrive.
   * Reporter seulement l'affichage n'aurait rien réglé là où ça compte.
   */
  const DELAI_FRAPPE_MS = 700
  const frappeRef = useRef<{ minuterie: number | null }>({ minuterie: null })
  const annulerFrappeEnCours = useCallback(() => {
    if (frappeRef.current.minuterie !== null) {
      window.clearTimeout(frappeRef.current.minuterie)
      frappeRef.current.minuterie = null
    }
  }, [])
  // Changer d'étape jette une frappe non posée : la juger contre la NOUVELLE
  // étape reprocherait à l'apprenant un texte qu'on ne lui demande plus.
  useEffect(() => annulerFrappeEnCours, [index, annulerFrappeEnCours])

  const onGeste = useCallback(
    (geste: GesteOutlook | null, obs: OutlookObservation | null, opts?: { tentative?: boolean }) => {
      const s = steps[indexRef.current]
      const rang = indexRef.current
      if (!s || finished) {
        if (geste) setEtat((p) => appliquerGeste(p, geste))
        return
      }

      /*
       * Ce que la DÉMONSTRATION vient de faire n'est pas un geste de
       * l'apprenant : l'état change bel et bien — c'est le but —, mais rien
       * n'est jugé ni compté. Sans ce filtre, la démonstration validerait
       * l'étape en pleine explication et sauterait à la suivante.
       */
      if (sousDemonstration()) {
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

        const soumettre = () => {
          void jugerObservation(s, rang, observation).then((j) => {
            if (!j) return
            /* Sur une étape d'état, un geste qui n'aboutit pas n'est un ÉCHEC que
               si l'apprenant a vraiment tenté l'action attendue. Sans ce filtre,
               la moindre navigation afficherait un reproche injuste — c'est ce qui
               plafonnait 18 évaluations Excel sur 27. */
            /*
             * 🔴 LE SILENCE NE VAUT QUE POUR UN « PAS ENCORE ».
             *
             * Ce filtre taisait TOUT geste non délibéré sur une étape d'état, y
             * compris celui qui CONTREDIT l'attendu. C'est ce qui rendait
             * l'impasse silencieuse : cliquer « Transférer » quand la consigne
             * dit « Répondre » ouvre la fenêtre de rédaction, fait disparaître
             * le ruban avec le bouton Répondre — et ne disait rien. L'apprenant
             * était coincé sans le savoir.
             *
             * Depuis que le juge distingue `no_…` de `wrong_…`, la question ne
             * se pose plus en ces termes : un `pasEncore` reste muet (composer
             * une enveloppe passe par des états incomplets, c'est normal), un
             * `contredit` parle et coûte. `compte` porte exactement cette
             * distinction.
             */
            if (!j.ok && surEtat && !opts?.tentative && j.compte !== "faute") {
              if (!automatique) compterTatonnement()
              return
            }
            if (!j.ok && automatique) return
            appliquerJugement(j)
          })
        }

        /*
         * TOUTE frappe passe par le délai — celles jugées sur l'état comme les
         * autres. Les deux chemins émettent une observation par touche : sur une
         * étape `O_TYPE_TEXT` chaque lettre était comptée FAUTE, et sur une
         * étape `O_EXPECT_*` chaque lettre comptait un tâtonnement, ce qui
         * déclenchait l'aide au sixième caractère. Le symptôme diffère, la cause
         * est la même.
         *
         * Un geste qui n'est PAS une frappe — un clic, un envoi — annule la
         * frappe en attente : la nouvelle observation la remplace, et juger
         * l'ancienne après coup reprocherait un texte que l'apprenant vient
         * lui-même de dépasser.
         */
        annulerFrappeEnCours()
        if (obs?.kind === "o:typed" && !automatique) {
          frappeRef.current.minuterie = window.setTimeout(() => {
            frappeRef.current.minuterie = null
            soumettre()
          }, DELAI_FRAPPE_MS)
          return suivant
        }
        soumettre()
        return suivant
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, finished, jugerObservation, appliquerJugement, annulerFrappeEnCours],
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
  // Source unique : la règle vivait ici en double, réécrite à la main. C'est
  // cette duplication qui a laissé le barème hors du calcul. Les 16 évaluations
  // d'Outlook — toutes — portent une rédaction libre à `points: 0` dont la
  // consigne dit « Cette étape n'entre pas dans la note », sous un bandeau qui
  // affirmait « ★ Compté dans votre note ».
  // `evaluationNotee` vaut `mode === "EVALUATION" && !preview` : le repli sur
  // « LESSON » conserve donc l'aperçu admin exactement tel qu'il était.
  const nature: "lecture" | "action" | "evaluee" = !step
    ? "action"
    : natureEtape(step.action, evaluationNotee ? "EVALUATION" : "LESSON", step.points)

  /**
   * L'apprenant est-il coincé dans une fenêtre qu'il a ouverte par erreur ?
   *
   * Deux conditions, toutes deux nécessaires : une faute signalée sur CETTE
   * étape, et une fenêtre ouverte PENDANT l'étape — rédaction, rendez-vous ou
   * boîte de dialogue. La photo d'arrivée sert de référence : c'est elle qui
   * distingue « il a ouvert ça » de « c'était déjà ouvert ».
   */
  const impasse = useMemo(() => {
    if (!fauteSurEtape || finished || !step) return false
    const depart = etatDepartEtapeRef.current
    if (!depart || depart.id !== step.id) return false
    return (
      (!!etat.redaction && !depart.etat.redaction) ||
      (!!etat.rendezVous && !depart.etat.rendezVous) ||
      (etat.boite !== "aucune" && depart.etat.boite === "aucune")
    )
  }, [fauteSurEtape, finished, step, etat])

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
              aDemonstration: !!plan,
              // Ce que le châssis lit pour décider s'il peut promettre
              // « Montrez-moi ». Sans lui, 176 étapes Outlook affichaient le
              // bouton puis renvoyaient vers un repère que rien n'avait dessiné.
              demoJouable: !!plan,
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
              // Vrai pour une faute (le bandeau de la surface la dit déjà),
              // faux pour un tâtonnement (rien ne la dit ailleurs).
              verdictAncre,
              aplomb: null,
              panneJuge: pannneJuge,
              passageEnCours,

              /*
               * 🔴 TROIS TÂTONNEMENTS, PAS SIX. Outlook est le cas extrême de ce
               * pour quoi ce palier a été écrit.
               *
               * 88 % de son barème se juge sur l'ÉTAT et l'essentiel de ses
               * gestes sont de la navigation : `essais` y reste durablement à
               * zéro, donc la porte « 3 erreurs » ne s'ouvre jamais et il ne
               * restait que « 6 tâtonnements ». Samuel a cliqué quatre mauvais
               * dossiers en lisant quatre fois la même phrase, sans qu'aucune
               * aide n'apparaisse.
               *
               * La comparaison avec Excel tranche le seuil : là-bas, cliquer la
               * mauvaise cellule sur une étape qui juge ce clic est une FAUTE
               * (`frappe.ts` l'énumère), donc l'indice sort au 2ᵉ essai et
               * l'encart au 3ᵉ. Trois gestes infructueux, c'est le rythme
               * d'Excel — et c'est aussi le palier que le socle documente pour
               * les tâtonnements (`useAtelier`, « tatonnements ≥ 3 »), auquel
               * cette ligne était la seule à ne pas obéir.
               */
              aideProposee: essais >= 3 || tatonnements >= 3 || tropLong,
              demonstration,
              demoFinie,
              demoRejouable: !!plan && demoFinie,

              index,
              total: steps.length,
              reculPossible,

              onMontrer: evaluationNotee ? passerLaQuestion : aideDemandee,
              onDebloquer: goNext,
              onRejouerDemo: rejouerDemonstration,
              onIndice: () => {
                montrerIndice()
                pendingRef.current.hints += 1
              },
              /*
               * 🔴 UN ÉCRAN DE LECTURE S'AVANCE AVEC « next », PAS AVEC UN CONTRÔLE.
               *
               * `validateStep` est formel : sur une étape `READ`, seule
               * l'observation `{ kind: "next" }` passe ; tout le reste rend
               * `read_step_action`. Outlook envoyait `o:control/sim-suivant`,
               * que l'adaptateur ne connaît pas (l'action `READ` n'est pas
               * préfixée `O_`) et que le socle refuse : le bouton « J'ai
               * compris, continuer » ne franchissait donc RIEN.
               *
               * Le défaut était invisible tant qu'Outlook n'avait aucun écran de
               * lecture — il était le seul des quatre dans ce cas. Dès que le
               * contenu s'en est doté, l'apprenant s'est retrouvé bloqué devant
               * un écran qui ne demande rien. Excel et PowerPoint émettent
               * `next` ; Outlook fait désormais comme eux.
               */
              onSuivant: () => onGeste(null, { kind: "next" } as unknown as OutlookObservation),
              onReculer: () => setReculDemande(true),
            }
      }
    >
      {/* LA SURFACE RESTE MONTÉE EN PERMANENCE.
          L'écran d'ouverture et l'écran de fin se SUPERPOSENT : démonter la
          surface rechargerait la boîte et perdrait le travail de l'apprenant. */}
      <div ref={zoneRef} style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <CourrierSurface etat={etat} onGeste={onGeste} largeur={largeur} />

        {/* 🔴 SORTIR DE L'IMPASSE — le défaut n° 2 du passage élève du 05/08/2026.

            Un geste faux peut rendre l'étape INJOUABLE, et rien ne le disait.
            « Cliquez sur Répondre » ; l'apprenant clique « Transférer » : la
            fenêtre de rédaction s'ouvre, le ruban disparaît avec le bouton
            Répondre, et il n'existe plus aucun chemin vers ce que la consigne
            demande. Le message d'erreur, lui, continue de réclamer un bouton
            qui n'est plus à l'écran.

            La condition est volontairement ÉTROITE : il faut à la fois une
            faute signalée sur CETTE étape et une fenêtre que l'apprenant a
            ouverte PENDANT l'étape. Ouvrir la rédaction quand la consigne le
            demande ne déclenche donc rien, même si l'enveloppe n'est pas encore
            complète — sinon on proposerait d'annuler le travail en cours à
            quelqu'un qui travaille bien.

            Le retour se fait par la MÊME mécanique que la démonstration
            (`reposerEtapeRef`) : la boîte telle qu'elle était à l'arrivée sur
            l'étape. Une seule reconstitution, donc un seul comportement à
            vérifier. */}
        {impasse && (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              top: 12,
              zIndex: 46,
              /*
               * 🔴 `pointer-events: none` EST NON NÉGOCIABLE, et le pilote l'a
               * attrapé en une passe : sans lui, ce bandeau couvre le haut de la
               * surface et AVALE LES CLICS DU RUBAN — donc il enfermait
               * l'apprenant exactement comme le défaut qu'il est censé réparer.
               * Même famille que le jalon d'Excel, qui avalait le clic de
               * l'étape suivante. Le bouton, lui, les reprend.
               */
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              padding: "10px 14px",
              borderRadius: 10,
              background: "#FFF6E8",
              border: "1px solid #E4B363",
              boxShadow: "0 6px 18px rgba(0,0,0,.10)",
              fontSize: 13,
              lineHeight: 1.35,
              color: "#5A4212",
            }}
          >
            <span style={{ flex: 1, minWidth: 200 }}>
              Ce geste a ouvert une fenêtre que la consigne ne demandait pas. Le bouton attendu
              n&apos;est plus à l&apos;écran : revenez au point de départ de l&apos;étape pour le
              retrouver.
            </span>
            <button
              type="button"
              data-control="o-sortir-impasse"
              onClick={() => {
                reposerEtapeRef.current()
                setFauteSurEtape(false)
                setVerdict(null)
              }}
              style={{
                pointerEvents: "auto",
                flexShrink: 0,
                padding: "7px 14px",
                borderRadius: 8,
                border: "1px solid #B8860B",
                background: "#B8860B",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Revenir au départ de l&apos;étape
            </button>
          </div>
        )}

        {/* RETOUR VISUEL DANS LA SURFACE.
            `lancerFx` était appelé depuis l'origine mais son résultat n'était
            rendu NULLE PART : ni la réussite, ni l'erreur, ni le message
            n'atteignaient l'écran. L'apprenant travaillait donc sans le moindre
            signal sur sa zone de travail — exactement ce que Samuel a refusé
            pour Excel le 28/07 (« l'élève doit voir la cible, l'erreur, la
            réussite et l'aide sur la surface de travail elle-même »).
            Le halo se cale sur la cible quand elle est mesurable, et couvre la
            surface sinon. `pointer-events: none` est NON NÉGOCIABLE : une
            surface décorative qui avale les clics est le défaut le plus coûteux
            du lecteur d'Excel. */}
        {fx && (
          <div
            key={fx.k}
            aria-hidden
            style={{
              position: "absolute",
              pointerEvents: "none",
              zIndex: 45,
              ...(fx.rect
                ? { left: fx.rect.left, top: fx.rect.top, width: fx.rect.width, height: fx.rect.height }
                : { inset: 0 }),
              outline: fx.kind === "ok" ? "3px solid #2E9E63" : "3px solid #C0392B",
              background: fx.kind === "ok" ? "rgba(46,158,99,.14)" : "rgba(192,57,43,.10)",
              borderRadius: 6,
              animation: fx.kind === "ok" ? "o-fx-ok 1.4s ease both" : "o-fx-ko .45s ease both",
            }}
          />
        )}

        {/* LE MOT QUI ACCOMPAGNE LE GESTE — un seul bandeau, jamais deux.
            Un flash rouge muet fait douter l'apprenant de son geste, même quand
            il était bon ; et un constat vert qui resterait affiché sous un
            message d'erreur se contredirait à l'écran. L'erreur prime donc sur
            le constat, et le constat sur le « C'est exact » générique. */}
        {(fx || constat) &&
          (() => {
            const erreur = fx?.kind === "ko"
            const texte = erreur
              ? fx?.message || "Ce n'est pas encore ça — réessayez."
              : constat?.texte ?? "✓ C'est exact"
            // La clé relance l'animation d'entrée : sans elle, React réutilise le
            // nœud et le bandeau apparaît sans transition.
            const cle = erreur ? `e${fx?.k}` : constat ? `c${constat.k}` : `o${fx?.k}`
            return (
              <div
                aria-live="polite"
                key={cle}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 12,
                  display: "grid",
                  placeItems: "center",
                  pointerEvents: "none",
                  zIndex: 46,
                  padding: "0 12px",
                }}
              >
                <span
                  style={{
                    maxWidth: 470,
                    padding: "9px 15px",
                    borderRadius: 10,
                    background: erreur ? "rgba(122,32,24,.95)" : "rgba(16,74,45,.95)",
                    color: "#fff",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    textAlign: "center",
                    animation: "o-fx-mot .34s ease both",
                  }}
                >
                  {!erreur && constat ? <b style={{ color: "#7BE0A8" }}>✓ </b> : null}
                  {texte}
                </span>
              </div>
            )
          })()}

        {/* « MONTREZ-MOI » — le geste joué à l'endroit exact.
            L'adaptateur calculait déjà le plan ; il ne manquait que le calque
            pour le rendre. `key` sur l'index ET le rejeu : sans elle, React
            réutilise le nœud et la séquence ne repart jamais du premier geste. */}
        {demonstration && plan && (
          <DemonstrationGeste
            key={`demo${index}-${rejeu}`}
            plan={plan}
            resoudre={resoudreDemo}
            largeur={largeur}
            hautFeuille={0}
            onEcrire={demoEcrire}
            onSelectionner={demoSelectionner}
            onPresser={demoPresser}
            lecture={step?.action.type === "READ"}
            onFini={() => setDemoFinie(true)}
          />
        )}

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
                  padding: "36px 20px",
                }}
              >
                {/* La carte de fin d'Excel, à l'identique dans sa STRUCTURE :
                    une pastille, le titre, ce qu'on retient, le compte des
                    étapes, et surtout la SUITE. L'écran ne portait auparavant
                    qu'une coche et un paragraphe — l'apprenant arrivait au bout
                    d'un chapitre et se retrouvait sans rien à faire, obligé de
                    rouvrir le sommaire pour continuer. */}
                <div
                  style={{
                    width: "100%",
                    maxWidth: 460,
                    padding: "26px 24px",
                    borderRadius: 16,
                    border: "1px solid #E4E0D8",
                    background: "#fff",
                    textAlign: "center",
                    boxShadow: "0 8px 24px rgba(16,32,27,.06)",
                    animation: "o-fin-carte .42s cubic-bezier(.2,.9,.2,1) both",
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      width: 46,
                      height: 46,
                      margin: "0 auto 12px",
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "50%",
                      background: "#E7F3EB",
                      color: "#107C41",
                      fontSize: 22,
                      animation: "o-fin-rond .5s .1s cubic-bezier(.2,.9,.2,1) both",
                    }}
                  >
                    ✓
                  </div>
                  <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0F1F17" }}>Chapitre terminé</p>
                  <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#5A6660" }}>{filChapitre}</p>

                  {/* L'outro porte ce qu'il faut RETENIR. C'est du contenu
                      pédagogique écrit chapitre par chapitre : il mérite mieux
                      qu'une ligne grise perdue au milieu de l'écran. */}
                  {scenario.outro?.body && (
                    <p
                      style={{
                        margin: "14px 0 0",
                        padding: "11px 13px",
                        borderRadius: 10,
                        background: "#F5F3EF",
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: "#3C4A43",
                        textAlign: "left",
                      }}
                    >
                      {scenario.outro.body}
                    </p>
                  )}

                  <p style={{ margin: "13px 0 0", fontSize: 12.5, color: "#8C948F" }}>
                    {steps.length} étape{steps.length > 1 ? "s" : ""} franchie{steps.length > 1 ? "s" : ""}
                  </p>

                  {chapitreSuivant && onNaviguer && (
                    <>
                      <button
                        type="button"
                        data-control="sim-chapitre-suivant"
                        onClick={() => onNaviguer(chapitreSuivant.id)}
                        style={{
                          marginTop: 18,
                          border: 0,
                          borderRadius: 12,
                          background: "#10201B",
                          color: "#fff",
                          padding: "11px 20px",
                          fontSize: 13.5,
                          fontWeight: 700,
                          minHeight: 44,
                          cursor: "pointer",
                        }}
                      >
                        Chapitre suivant ›
                      </button>
                      <p
                        style={{
                          margin: "9px 0 0",
                          fontSize: 12,
                          color: "#AEB6B1",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {chapitreSuivant.titre}
                      </p>
                    </>
                  )}
                </div>
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
          @keyframes o-intro-monte { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
          @keyframes o-jalon { from { opacity: 0; transform: translateY(8px) scale(.97) } to { opacity: 1; transform: none } }
          @keyframes o-fin-carte { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
          @keyframes o-fin-rond { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: none } }
          @keyframes o-fx-ok { 0% { opacity: 0 } 18% { opacity: 1 } 100% { opacity: 0 } }
          @keyframes o-fx-ko { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-5px) } 75% { transform: translateX(5px) } }
          @keyframes o-fx-mot { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
          @media (prefers-reduced-motion: reduce) {
            [style*="o-jalon"], [style*="o-fx-"], [style*="o-fin-"] { animation-duration: .01ms !important }
          }
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
  /*
   * Le module a-t-il une affiche ? On teste le NUMÉRO, jamais l'élément JSX :
   * `<AfficheModule/>` est toujours truthy même quand il rend `null`.
   * `app` est obligatoire — voir la note de PowerPoint sur « Prise en main ».
   */
  const affiche = numeroModule(scenario.moduleTitle, "OUTLOOK") !== null
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
      {/* L'affiche du module occupe la colonne de droite, comme sur Excel, et
          disparaît sous `lg`. Elle partage une RANGÉE avec le texte au lieu
          d'être posée en absolu : le bloc de texte d'Outlook est centré, et un
          absolu à droite le recouvrait sur toutes les largeurs mesurées. */}
      <div className="flex w-full items-center justify-center" style={{ gap: 40 }}>
      <div style={{ maxWidth: 560, flex: "1 1 auto", minWidth: 0 }}>
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
      {/* Pas de repli quand le module n'a pas encore d'affiche : le
          mini-classeur vert d'Excel dessine une grille de tableur, et inventer
          ici une boîte mail de substitution poserait une seconde langue
          visuelle que l'affiche remplacera. Rien vaut mieux qu'à peu près. */}
      {affiche ? (
        <div
          aria-hidden
          className="hidden shrink-0 select-none lg:block"
          style={{ width: 372, animation: "o-intro-monte .9s .35s ease both" }}
        >
          <AfficheModule moduleTitle={scenario.moduleTitle} app="OUTLOOK" />
        </div>
      ) : null}
      </div>
    </div>
  )
}
