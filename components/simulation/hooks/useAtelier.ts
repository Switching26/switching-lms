"use client"

/**
 * LA LOGIQUE DE L'ATELIER — ce qui vaut pour les quatre apps.
 *
 * Extrait de `SimulationPlayer.tsx` en phase 0 du chantier multi-app, étage par
 * étage, chacun prouvé par `check-note-nonregression.ts` avant de passer au
 * suivant.
 *
 * RAISON D'ÊTRE, et elle n'est pas cosmétique : dupliquer le player par app
 * recopierait la persistance, le registre de passage et LE CALCUL DE NOTE. Deux
 * implémentations du score pour un même parcours sont indéfendables en contrôle
 * Qualiopi, et une divergence y serait silencieuse — la formation continuerait
 * de se jouer normalement avec des notes fausses. La note doit avoir UNE
 * implémentation, quoi qu'il arrive (contrat §4.f, décision D6).
 *
 * Ce que le hook porte aujourd'hui :
 *  - la mesure de la zone de travail, qui garantit le « rien ne défile » ;
 *  - le retour visuel : verdict, effet ancré à la cible, jalon, relais ;
 *  - l'aide progressive : essais, tâtonnements, chrono, paliers 2 / 3 / 5 ;
 *  - la progression : index, écran d'ouverture, avancer, reculer ;
 *  - la persistance et le passage d'évaluation — LE CALCUL DE NOTE.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import type { Verdict } from "@/lib/simulation/contrats"
import type { BilanPublie } from "@/lib/simulation/bilan"
import { deciderApresCompletion } from "@/lib/simulation/journal"
import { creerFileEnvois, creerVerrouEnvoi } from "@/lib/simulation/file-verdicts"

export type MesureZoneTravail = {
  /** Hauteur de la zone de travail, en pixels entiers. */
  hauteur: number
  /** Largeur de la zone de travail, en pixels entiers. 0 avant la 1ʳᵉ mesure. */
  largeur: number
}

/**
 * Mesure la zone de travail — MESURÉE, jamais calculée par soustraction.
 *
 * Le plein écran navigateur a été retiré (choix Samuel du 29/07 : on reste dans
 * l'onglet, comme OnlineFormaPro, la barre du navigateur et la navigation du LMS
 * restent visibles). L'atelier occupe simplement toute la hauteur que son
 * conteneur lui donne, et la zone de travail prend ce qui reste une fois le
 * cockpit et la bande de consigne posés.
 *
 * L'ancienne formule « hauteur de l'écran moins 305 px » devenait fausse dès
 * qu'un élément changeait de taille : la consigne se retrouvait coupée et une
 * barre de défilement apparaissait — exactement ce que la vidéo montrait. Un
 * observateur de taille supprime la classe entière de ce défaut.
 *
 * ⚠️ Toute app qui remplacerait ceci par un calcul sur `window.innerHeight`
 * réintroduirait le défaut : c'est l'invariant n°2 du contrat multi-app.
 *
 * @param ref      la zone de travail de l'app (grille, page, diapositive…)
 * @param remesurer valeur dont le changement force un ré-attachement de
 *                  l'observateur — l'élément peut n'exister qu'après coup.
 */
export function useMesureZoneTravail(
  ref: RefObject<HTMLElement | null>,
  remesurer?: unknown,
): MesureZoneTravail {
  const [hauteur, setHauteur] = useState(380)
  const [largeur, setLargeur] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mesurer = () => {
      const r = el.getBoundingClientRect()
      // Sous 40 px, l'élément est en cours de montage : garder la dernière
      // hauteur connue vaut mieux qu'écraser le moteur avec une valeur nulle,
      // qui rendrait la surface invisible sans lever la moindre erreur.
      if (r.height > 40) setHauteur(Math.round(r.height))
      setLargeur(Math.round(r.width))
    }
    mesurer()
    const obs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(mesurer) : null
    obs?.observe(el)
    window.addEventListener("resize", mesurer)
    return () => {
      obs?.disconnect()
      window.removeEventListener("resize", mesurer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, remesurer])
  return { hauteur, largeur }
}

/* ────────────────────────────────────────────────────────────────────────────
 * RETOUR VISUEL
 *
 * Retour Samuel du 28/07 : « le guidage doit être visible DANS la grille ». Un
 * message sous l'écran ne suffit pas — l'apprenant regarde sa zone de travail,
 * pas la bande de consigne. D'où quatre signaux, tous génériques :
 *
 *   verdict   ce que le juge a répondu, qui teinte la bande de consigne ;
 *   fx        flash vert / secousse rouge ANCRÉS à la cible de l'étape ;
 *   jalon     la carte « Étape franchie », par-dessus la zone de travail ;
 *   relais    compteur d'avancées, qui rejoue l'animation du segment courant.
 *
 * Seule la GÉOMÉTRIE de la cible est propre à l'app : une cellule pour Excel,
 * un paragraphe pour Word, un objet de diapositive pour PowerPoint. L'app la
 * calcule et la passe à `lancerFx`, exactement comme `DemonstrationGeste`
 * reçoit déjà son `resoudre(cible)`.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Rectangle dans le repère de la zone de travail. Type structurel : toute app
 *  peut passer le sien sans importer celui-ci. */
export type RectCible = { left: number; top: number; width: number; height: number }

export type EffetCible = {
  kind: "ok" | "ko"
  /** null quand la cible n'est pas mesurable : seul le message centré s'affiche. */
  rect: RectCible | null
  message?: string
  /** Clé de remontage : sans elle, deux effets successifs ne rejouent pas. */
  k: number
}

export type RetourVisuel = {
  verdict: Verdict | null
  setVerdict: (v: Verdict | null) => void
  fx: EffetCible | null
  /** Pose l'effet sur la cible de l'étape. Le rectangle vient de l'app. */
  lancerFx: (kind: "ok" | "ko", rect: RectCible | null, message?: string) => void
  relais: number
  relaisActif: boolean
  /** Une étape vient d'être franchie : rejoue l'animation du segment. */
  marquerRelais: () => void
  jalon: { n: number; texte: string | null } | null
  poserJalon: (n: number, texte: string | null) => void
}

export function useRetourVisuel(): RetourVisuel {
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  // Retour visuel DANS la zone de travail (flash de réussite, secousse
  // d'erreur, message) : le texte sous l'écran ne suffit pas, l'apprenant
  // regarde la feuille.
  const [fx, setFx] = useState<EffetCible | null>(null)
  const fxTimerRef = useRef<number | null>(null)
  const lancerFx = useCallback((kind: "ok" | "ko", rect: RectCible | null, message?: string) => {
    if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current)
    setFx({ kind, rect, message, k: Date.now() })
    // Une erreur reste deux fois plus longtemps : elle porte un message à lire,
    // là où la réussite ne fait que confirmer un geste déjà accompli.
    fxTimerRef.current = window.setTimeout(() => setFx(null), kind === "ok" ? 1400 : 2800)
  }, [])
  useEffect(() => () => { if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current) }, [])

  const [relais, setRelais] = useState(0)
  const [relaisActif, setRelaisActif] = useState(false)
  const marquerRelais = useCallback(() => setRelais((r) => r + 1), [])
  useEffect(() => {
    if (!relais) return
    setRelaisActif(true)
    const t = window.setTimeout(() => setRelaisActif(false), 760)
    return () => window.clearTimeout(t)
  }, [relais])

  /** Carte « Étape franchie », affichée par-dessus la zone de travail à chaque avancée. */
  const [jalon, setJalon] = useState<{ n: number; texte: string | null } | null>(null)
  const poserJalon = useCallback((n: number, texte: string | null) => setJalon({ n, texte }), [])
  useEffect(() => {
    if (!jalon) return
    const t = window.setTimeout(() => setJalon(null), 1150)
    return () => window.clearTimeout(t)
  }, [jalon])

  return { verdict, setVerdict, fx, lancerFx, relais, relaisActif, marquerRelais, jalon, poserJalon }
}

/* ────────────────────────────────────────────────────────────────────────────
 * AIDE PROGRESSIVE — paliers 2 / 3 / 5
 *
 * Audit des 1 883 étapes du 29/07 : 1 638 demandent d'agir, 234 sont des
 * lectures, et 704 n'ont AUCUNE aide — dont 174 étapes d'action hors évaluation
 * sans le moindre recours. Après une erreur ou après dix, l'apprenant voyait le
 * même message rouge : celui qui bloque ne pouvait ni comprendre, ni passer.
 *
 * Trois portes, parce qu'un blocage ne produit pas toujours une erreur :
 *
 *   essais ≥ 2        l'indice s'affiche seul, même en exercice où il se demande
 *   essais ≥ 5        la démonstration part d'elle-même
 *   tatonnements ≥ 3  idem indice — 466 étapes se jugent sur l'ÉTAT, où un geste
 *                     faux n'est PAS une erreur : `essais` y restait à zéro et
 *                     « Montrez-moi » n'apparaissait JAMAIS
 *   45 s sans avancer dernier filet : certains blocages ne produisent aucun geste
 *
 * ⚠️ En ÉVALUATION les paliers existent aussi, mais NI réponse NI cible : le
 * bouton devient « Passer la question », précédé de l'avertissement qu'elle
 * comptera comme ratée (choix Samuel). Le chrono, lui, y est désactivé.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Durée pendant laquelle les observations produites par la mise en place d'une
 *  étape ne comptent pas comme des gestes de l'apprenant. */
const FENETRE_MISE_EN_PLACE_MS = 2500

export type AideProgressive = {
  essais: number
  tatonnements: number
  tropLong: boolean
  /** L'indice est-il visible ? Vrai d'emblée en leçon, à la demande en exercice. */
  hintShown: boolean
  montrerIndice: () => void
  /** Une erreur RÉELLE : elle compte pour la note, et ouvre les paliers 2 et 5. */
  compterEssai: () => void
  /** Un geste qui n'a pas fait avancer. Ne pénalise jamais le score. */
  compterTatonnement: () => void
  demonstration: boolean
  demoFinie: boolean
  setDemoFinie: (v: boolean) => void
  /** Compteur de rejeux : sert de clé au calque, pour le faire repartir du début. */
  rejeu: number
  demarrerDemonstration: () => void
  rejouerDemonstration: () => void
  /** À poser dans l'application de l'étape : essais, indice, démonstration. */
  reinitialiserPourEtape: () => void
  /** À poser à l'arrivée sur l'étape : rejeu, tâtonnements, chrono. */
  reinitialiserAAlArrivee: () => void
  /** Ouvre la fenêtre pendant laquelle la mise en place ne compte pas. */
  ouvrirFenetreMiseEnPlace: () => void
  /** Sommes-nous encore dans cette fenêtre ? */
  dansFenetreMiseEnPlace: () => boolean
}

export function useAideProgressive(opts: {
  mode: string
  index: number
  finished: boolean
  /** Y a-t-il une étape à jouer ? */
  aUneEtape: boolean
  /**
   * Ce que l'app fait AVANT toute démonstration. Excel y restaure l'état de
   * départ du poste : sans quoi l'apprenant qui abîme quelque chose puis
   * redemande à voir se retrouve avec la même explication fausse qu'au départ.
   */
  avantDemonstration?: () => void
}): AideProgressive {
  const { mode, index, finished, aUneEtape } = opts
  const [essais, setEssais] = useState(0)
  const [tatonnements, setTatonnements] = useState(0)
  const [tropLong, setTropLong] = useState(false)
  const [hintShown, setHintShown] = useState(mode === "LESSON")
  const [demonstration, setDemonstration] = useState(false)
  const [demoFinie, setDemoFinie] = useState(false)
  const [rejeu, setRejeu] = useState(0)

  // Lu depuis les rappels stables, sans les recréer à chaque rendu.
  const avantRef = useRef(opts.avantDemonstration)
  avantRef.current = opts.avantDemonstration

  const demarrerDemonstration = useCallback(() => {
    avantRef.current?.()
    setDemoFinie(false)
    setDemonstration(true)
  }, [])
  const rejouerDemonstration = useCallback(() => {
    avantRef.current?.()
    setDemoFinie(false)
    setRejeu((n) => n + 1)
  }, [])

  const montrerIndice = useCallback(() => setHintShown(true), [])

  const compterEssai = useCallback(() => {
    setEssais((n) => {
      const suivant = n + 1
      // Palier 2 : l'indice s'affiche de lui-même, y compris en exercice où
      // il se demande d'ordinaire. Palier 5 : la démonstration se déclenche.
      if (suivant >= 2) setHintShown(true)
      if (suivant >= 5) demarrerDemonstration()
      return suivant
    })
  }, [demarrerDemonstration])

  const compterTatonnement = useCallback(() => {
    setTatonnements((n) => {
      const suivant = n + 1
      if (suivant >= 3) setHintShown(true)
      return suivant
    })
  }, [])

  const reinitialiserPourEtape = useCallback(() => {
    setEssais(0)
    setHintShown(mode === "LESSON")
    setDemonstration(false)
  }, [mode])

  const reinitialiserAAlArrivee = useCallback(() => {
    setRejeu(0)
    setDemoFinie(false)
    setTatonnements(0)
    setTropLong(false)
  }, [])

  const fenetreRef = useRef(0)
  const ouvrirFenetreMiseEnPlace = useCallback(() => {
    fenetreRef.current = Date.now() + FENETRE_MISE_EN_PLACE_MS
  }, [])
  const dansFenetreMiseEnPlace = useCallback(() => Date.now() < fenetreRef.current, [])

  /**
   * LE CHRONO D'AIDE PART DE LA PREMIÈRE TENTATIVE, PAS DE L'ARRIVÉE.
   *
   * Il courait depuis la mise en place de l'étape : quelqu'un qui lit
   * tranquillement sa toute première consigne — la 1/14 du premier chapitre de
   * la formation — se voyait proposer « Vous bloquez ? » au bout de 45 secondes
   * sans avoir rien tenté. On propose de l'aide à qui n'a pas commencé, et le
   * message donne le sentiment d'être en retard dès le premier écran.
   *
   * Une tentative, c'est une erreur réelle ou un geste qui n'a pas fait avancer.
   * Les deux compteurs sont remis à zéro à chaque étape, donc le chrono repart.
   *
   * Conséquence assumée : un apprenant parfaitement immobile n'aura jamais
   * l'encart. C'est voulu — l'aide répond à un blocage, pas à une lecture. Les
   * deux autres portes (3 erreurs, 6 tâtonnements) restent ouvertes.
   */
  const aTente = essais > 0 || tatonnements > 0
  useEffect(() => {
    if (!aUneEtape || finished || mode === "EVALUATION" || !aTente) return
    const t = window.setTimeout(() => setTropLong(true), 45_000)
    return () => window.clearTimeout(t)
  }, [aUneEtape, index, finished, mode, aTente])

  return {
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
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * PROGRESSION ET NAVIGATION
 *
 * Où en est l'apprenant, et comment il avance ou revient. Rien ici ne parle de
 * l'app : `index`, `total`, l'écran d'ouverture, la fin du chapitre.
 *
 * DEUX EFFETS DE BORD SONT INJECTÉS PAR REF (`onAvancer`, `onTerminer`).
 * Ils touchent la persistance, qui est encore dans le player et le rejoindra au
 * dernier étage de l'extraction. Les remplir après coup casse le cycle de
 * définition — `goNext` a besoin de `persist`, défini plus bas —, motif déjà
 * employé dans le player pour `goNextRef` et `cloturerRef`. Quand la
 * persistance sera ici, ces deux refs disparaîtront.
 * ──────────────────────────────────────────────────────────────────────────── */

export type Progression = {
  index: number
  total: number
  /** Lisible depuis un rappel stable, sans le recréer à chaque étape. */
  indexRef: RefObject<number>
  aller: (i: number) => void
  /** Écran d'ouverture passé. Faux au premier montage, sauf reprise. */
  introVue: boolean
  ouvrirLAtelier: () => void
  introVueRef: RefObject<boolean>
  finished: boolean
  setFinished: (v: boolean) => void
  goNext: () => void
  /** Reculer est-il possible ? Jamais en évaluation notée. */
  reculPossible: boolean
  reculDemande: boolean
  setReculDemande: (v: boolean) => void
  reculer: () => void
  /** À remplir par l'app : ce qu'il faut faire quand on passe à l'étape `i`. */
  onAvancer: RefObject<((i: number) => void) | null>
  /** À remplir par l'app : ce qu'il faut faire quand le chapitre se termine. */
  onTerminer: RefObject<(() => void) | null>
}

export function useProgression(opts: {
  total: number
  /** Étape de reprise, déjà ramenée à 0 pour une évaluation par l'appelant. */
  departForce: number
  mode: string
  /** Rappel du geste de l'étape franchie, pour le jalon. */
  resumerEtape: (i: number) => string | null
  retour: Pick<RetourVisuel, "marquerRelais" | "poserJalon">
}): Progression {
  const { total, departForce, mode, resumerEtape, retour } = opts
  const [index, setIndex] = useState(() => Math.min(Math.max(departForce, 0), Math.max(total - 1, 0)))
  const indexRef = useRef(index)
  indexRef.current = index
  /**
   * L'écran d'ouverture n'est pas revu à la reprise : quelqu'un qui reprend son
   * chapitre à l'étape 7 n'a pas besoin qu'on le lui présente à nouveau.
   */
  const [introVue, setIntroVue] = useState(departForce > 0)
  const introVueRef = useRef(introVue)
  introVueRef.current = introVue
  const ouvrirLAtelier = useCallback(() => setIntroVue(true), [])
  const [finished, setFinished] = useState(false)

  const onAvancer = useRef<((i: number) => void) | null>(null)
  const onTerminer = useRef<(() => void) | null>(null)

  const aller = useCallback((i: number) => setIndex(i), [])

  const goNext = useCallback(() => {
    const next = indexRef.current + 1
    if (next >= total) {
      setFinished(true)
      onTerminer.current?.()
      return
    }
    // Le relais ne se joue qu'en AVANÇANT : reculer n'est pas une réussite.
    retour.marquerRelais()
    // Jalon d'étape franchie (choix Samuel : à CHAQUE étape, pas seulement en
    // fin de chapitre). Le rappel du geste est déduit de l'action — écrire une
    // phrase sur mesure aurait voulu dire en rédiger 1 872.
    retour.poserJalon(indexRef.current + 1, resumerEtape(indexRef.current))
    setIndex(next)
    onAvancer.current?.(next)
  }, [total, retour, resumerEtape])

  /**
   * Retour à l'étape précédente (choix Samuel du 29/07 : « oui, avec un
   * avertissement »).
   *
   * L'application de l'étape étant rejouée à chaque changement d'index, reculer
   * suffit à remettre en place le point de départ de l'étape visée. Le reste du
   * document est laissé intact : on ne rejoue PAS la leçon depuis le début, car
   * ce que l'apprenant a produit aux étapes précédentes ne vient d'aucun
   * `setup` et serait perdu — l'étape suivante deviendrait injouable.
   *
   * Interdit en évaluation notée : le barème compte les réussites au premier
   * essai, et OnlineFormaPro ne propose pas non plus de pager en évaluation.
   */
  const reculPossible = index > 0 && mode !== "EVALUATION" && !finished
  const [reculDemande, setReculDemande] = useState(false)
  const reculer = useCallback(() => {
    const cible = indexRef.current - 1
    if (cible < 0) return
    setReculDemande(false)
    setIndex(cible)
    onAvancer.current?.(cible)
  }, [])

  return {
    index,
    total,
    indexRef,
    aller,
    introVue,
    ouvrirLAtelier,
    introVueRef,
    finished,
    setFinished,
    goNext,
    reculPossible,
    reculDemande,
    setReculDemande,
    reculer,
    onAvancer,
    onTerminer,
  }
}


/* ────────────────────────────────────────────────────────────────────────────
 * PERSISTANCE ET PASSAGE D'ÉVALUATION — la partie la plus sensible du noyau.
 *
 * POURQUOI ELLE NE SERA JAMAIS DUPLIQUÉE PAR APP (décision D6 du chantier).
 *
 * Dupliquer le player recopierait la file d'envois, les verrous, le registre de
 * passage et la clôture — c'est-à-dire tout ce dont dépend LA NOTE. Deux
 * implémentations du score pour un même parcours sont indéfendables en contrôle
 * Qualiopi, et une divergence y serait SILENCIEUSE : la formation continuerait
 * de se jouer normalement avec des notes fausses.
 *
 * Ce qui a déjà coûté cher et qu'il ne faut pas défaire :
 *  · le navigateur ne DÉCLARE plus rien — la note vient des verdicts que le
 *    serveur écrit lui-même ; une requête fabriquée obtenait 100 % sans jouer ;
 *  · une clé, un corps, un envoi à la fois, dans l'ordre — une clé ne doit
 *    jamais désigner deux corps ;
 *  · deux verrous d'envoi, parce qu'un double tap au doigt lançait deux
 *    requêtes sur le même geste ;
 *  · la clôture est IDEMPOTENTE, ce qui rend « réessayer » sûr.
 *
 * Rien ici ne parle de cellules. Le seul élément propre à l'app est le relevé
 * d'état envoyé au juge distant, que l'app fabrique de son côté.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Ce que le serveur renvoie à une remontée de progression. */
export type ReponsePersistance = {
  bilan?: BilanPublie
  noteEnregistree?: boolean
  completed?: boolean
} | null

export function usePersistance(opts: {
  chapterId: string
  mode: string
  preview?: boolean
  /** Ce montage fait suite à « Repasser » : le passage serveur doit être NEUF. */
  nouveauPassage?: boolean
  onCompleted?: () => void
  /** Étape courante, lisible sans recréer les rappels à chaque avancée. */
  indexRef: RefObject<number>
  /** Étape courante, pour désigner celle que l'apprenant renonce à jouer. */
  stepRef: RefObject<{ id: string } | undefined>
  /** Avancer, une fois le serveur au courant. */
  goNextRef: RefObject<(() => void) | null>
}) {
  const { chapterId, mode, preview, nouveauPassage, onCompleted, indexRef, stepRef, goNextRef } = opts

  /**
   * Identifiant du PASSAGE tenu par le serveur.
   *
   * Il est ouvert au démarrage réel de l'évaluation, repris tel quel au
   * rechargement de la page, et remplacé au « Repasser ». C'est lui qui porte
   * les verdicts, donc la note : sans passage ouvert, l'atelier ne peut rien
   * faire noter, et il le dit plutôt que de laisser croire le contraire.
   */
  const runIdRef = useRef<string | null>(null)

  /**
   * Deux verrous d'envoi, un par geste qui fait AVANCER l'atelier.
   *
   * Sans eux, un double tap lançait deux requêtes sur le même geste et leurs
   * deux retours agissaient : deux passages ouverts, ou une étape sautée que le
   * serveur n'avait jamais vue passer. Ils vivent dans `file-verdicts.ts`, purs
   * et vérifiés hors navigateur.
   */
  const verrouOuvertureRef = useRef(creerVerrouEnvoi())
  const verrouPassageRef = useRef(creerVerrouEnvoi())

  // Compteurs à envoyer au serveur : cumulés puis remis à zéro à chaque envoi.
  const sessionSignaleeRef = useRef(false)
  const pendingRef = useRef({ errors: 0, hints: 0, seconds: 0 })
  /** File d'enveloppes scellées, vidée dans un ordre STRICT (module pur). */
  const fileEnvoisRef = useRef<ReturnType<typeof creerFileEnvois<Record<string, unknown>, Reponse>> | null>(null)

  /**
   * Bilan par compétence du passage qui vient de s'achever.
   *
   * Il est calculé PAR LE SERVEUR, à la complétion, et renvoyé dans la réponse
   * du PUT : le navigateur n'a pas le bloc `remediation` (il est retiré du
   * scénario servi en évaluation notée), et il ne l'aura jamais — le lire
   * pendant l'épreuve désignerait la notion de chaque question.
   *
   * `null` couvre trois cas volontairement indistincts à l'écran : évaluation
   * non annotée, annotation incomplète, journal invérifiable. Le repli est le
   * même dans les trois, et il est honnête : la note, et pas un mot de conseil.
   */
  const [bilan, setBilan] = useState<BilanPublie | null>(null)
  const [bilanEnAttente, setBilanEnAttente] = useState(false)

  /**
   * Le serveur a-t-il retenu la note de ce passage ?
   *
   * Il la refuse quand le journal ne couvre pas toutes les étapes notées. La
   * carte de fin le dit alors franchement, plutôt que d'annoncer un
   * enregistrement qui n'a pas eu lieu. Vrai par défaut : hors évaluation et en
   * aperçu, la question ne se pose pas.
   */
  const [noteEnregistree, setNoteEnregistree] = useState(true)

  const [passageEnCours, setPassageEnCours] = useState(false)

  /**
   * Le juge distant est injoignable, ou a refusé le passage.
   *
   * Ce n'est PAS une faute de l'apprenant : rien n'est compté, le geste peut
   * être refait, et l'atelier doit le dire au lieu de rester muet — sinon
   * l'apprenant retape indéfiniment une réponse juste.
   */
  const [pannneJuge, setPanneJuge] = useState<null | "reseau" | "passage">(null)

  /**
   * Ouvre — ou reprend — le passage serveur d'une évaluation notée.
   *
   * Appelée au moment où l'apprenant commence réellement, pas au chargement de
   * la page : ouvrir un passage en survolant un chapitre gonflerait le compteur
   * d'essais sans qu'une seule question ait été jouée.
   */
  const ouvrirPassage = useCallback(
    async (nouveau = false): Promise<boolean> => {
      if (preview || mode !== "EVALUATION") return true
      try {
        const r = await fetch(`/api/simulations/${chapterId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nouveau }),
        })
        if (!r.ok) return false
        const j = (await r.json()) as { runId?: string }
        if (typeof j.runId !== "string" || !j.runId) return false
        runIdRef.current = j.runId
        setPanneJuge(null)
        return true
      } catch {
        return false
      }
    },
    [chapterId, mode, preview],
  )

  /**
   * OUVERTURE AU CLIC « COMMENCER », pas au montage.
   *
   * Ouvrir au montage revenait à ouvrir un passage dès qu'un chapitre
   * s'affichait — y compris quand l'apprenant regarde l'écran d'ouverture puis
   * ressort. Le compteur d'essais gonflait sans qu'une seule question ait été
   * jouée.
   *
   * L'ouverture est donc déclenchée par le clic, et elle BLOQUE l'entrée dans
   * l'atelier tant qu'elle n'a pas abouti : entrer sans passage laisserait
   * l'apprenant jouer une évaluation dont rien ne serait noté. En échec, il
   * reste sur l'écran d'ouverture, avec l'explication et le bouton pour
   * réessayer.
   *
   * La reprise après un rechargement retombe sur le MÊME passage côté serveur —
   * les verdicts déjà acquis ne sont pas perdus, et le rang ne bouge pas.
   */
  const [ouvertureEnCours, setOuvertureEnCours] = useState(false)
  const commencer = useCallback(async (): Promise<boolean> => {
    if (mode !== "EVALUATION" || preview) return true
    if (!verrouOuvertureRef.current.prendre()) return false
    setOuvertureEnCours(true)
    setPanneJuge(null)
    try {
      const ok = await ouvrirPassage(nouveauPassage)
      if (!ok) setPanneJuge("passage")
      return ok
    } finally {
      verrouOuvertureRef.current.liberer()
      setOuvertureEnCours(false)
    }
  }, [mode, preview, nouveauPassage, ouvrirPassage])

  type Reponse = { bilan?: BilanPublie; noteEnregistree?: boolean; completed?: boolean } | null

  const persist = useCallback(
    async (opts: { step: number; finish?: boolean }): Promise<Reponse> => {
      if (preview) return null

      /* ═══ UNE CLÉ, UN CORPS, UN ENVOI À LA FOIS, DANS L'ORDRE ═══════════
       *
       * L'ordonnancement lui-même vit dans `creerFileEnvois` — module pur, donc
       * vérifiable hors navigateur (`check-verdicts.ts`). Il ne reste ici que le
       * SCELLAGE : tout ce qui décrit cet envoi est figé maintenant, y compris
       * l'étape et le drapeau de fin, et ne sera jamais relu plus tard. C'est ce
       * qui garantit qu'une clé ne désigne jamais deux corps — le défaut qui
       * faisait rejeter une clôture comme doublon d'une remontée intermédiaire. */
      if (!fileEnvoisRef.current) {
        fileEnvoisRef.current = creerFileEnvois<Record<string, unknown>, Reponse>(async (e) => {
          try {
            const r = await fetch(`/api/simulations/${chapterId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...e.corps, enveloppe: e.cle }),
              keepalive: true,
            })
            // 409 : le serveur avait déjà tout écrit — l'enveloppe est réglée.
            // La garder en file la ferait boucler indéfiniment.
            if (r.status === 409) return { reglee: true, corps: null }
            if (!r.ok) return { reglee: false, corps: null }
            return { reglee: true, corps: (await r.json().catch(() => null)) as Reponse }
          } catch {
            // Une progression non enregistrée ne bloque jamais l'apprenant : il
            // continue, et l'enveloppe repart telle quelle au tour suivant.
            return { reglee: false, corps: null }
          }
        })
      }

      // Une seule remontée par session porte `newSession` : sans ce marqueur le
      // serveur ne peut pas distinguer l'ouverture d'un atelier d'un simple
      // enregistrement d'étape, et comptait donc toujours une seule session.
      const premiere = !sessionSignaleeRef.current
      sessionSignaleeRef.current = true
      const p = pendingRef.current
      pendingRef.current = { errors: 0, hints: 0, seconds: 0 }

      return fileEnvoisRef.current.deposer({
        cle:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        corps: {
          currentStep: opts.step,
          errorDelta: p.errors,
          hintDelta: p.hints,
          timeDeltaSeconds: p.seconds,
          finish: opts.finish ?? false,
          // Le passage à clore est DÉSIGNÉ, jamais deviné : la clôture vérifie
          // qu'il appartient bien à cet apprenant, à cette simulation, à cette
          // version de scénario, et que son curseur serveur est arrivé au bout.
          ...(runIdRef.current ? { runId: runIdRef.current } : {}),
          newSession: premiere,
        },
      })
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

  /**
   * « Question passée » — l'apprenant renonce à celle-ci.
   *
   * Il faut le DIRE au serveur : sans cela le curseur d'ordre du passage reste
   * en arrière, et l'étape suivante serait refusée pour rupture d'ordre. Aucun
   * verdict n'est écrit — l'étape reste donc sans point, exactement ce que
   * l'atelier annonce à l'apprenant.
   */
  const passerLaQuestion = useCallback(() => {
    const s = stepRef.current
    if (preview || mode !== "EVALUATION") {
      goNextRef.current?.()
      return
    }
    if (!s || !runIdRef.current) {
      setPanneJuge("passage")
      return
    }
    /* VERROU ANTI-DOUBLE-ENVOI.
     *
     * Un double tap — fréquent au doigt — lançait deux requêtes sur la MÊME
     * étape, et leurs deux retours appelaient `goNext` : l'atelier sautait une
     * étape que le serveur n'avait jamais vue passer. Le curseur restait en
     * arrière, et tout ce qui suivait était refusé pour rupture d'ordre.
     *
     * Le verrou est une référence, pas un état : il doit être posé dans le même
     * tour que le clic, avant tout rendu. */
    if (!verrouPassageRef.current.prendre()) return
    setPassageEnCours(true)
    /* ON ATTEND LA RÉPONSE AVANT D'AVANCER.
     *
     * Le curseur d'ordre du passage vit côté serveur. Avancer sans attendre le
     * laissait en arrière : à la dernière question, la clôture pouvait devancer
     * le curseur et le passage était refusé comme inachevé. Et sur une étape
     * intermédiaire, la suivante était refusée pour rupture d'ordre.
     *
     * En panne, on N'AVANCE PAS : le bandeau explique, le bouton reste, rien
     * n'est compté comme faute. Progresser sans que le serveur l'ait su ferait
     * perdre le passage entier à la fin. */
    setPanneJuge(null)
    void fetch(`/api/simulations/${chapterId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: runIdRef.current, stepIndex: indexRef.current, stepId: s.id, passer: true }),
    })
      .then((r) => {
        if (!r.ok) {
          setPanneJuge(r.status === 409 ? "passage" : "reseau")
          return
        }
        goNextRef.current?.()
      })
      .catch(() => setPanneJuge("reseau"))
      .finally(() => {
        verrouPassageRef.current.liberer()
        setPassageEnCours(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, mode, preview])

  const cloturerRef = useRef<(() => Promise<void>) | null>(null)
  /** Dernier rang atteint, lisible sans recréer la clôture à chaque étape. */

  /**
   * CLÔTURE DU PASSAGE, REJOUABLE.
   *
   * Le PUT clôt le passage côté serveur puis écrit la tentative. Si l'envoi
   * échoue — réseau tombé, onglet en veille —, l'apprenant se retrouvait devant
   * une note perdue, sans autre issue que « Repasser l'évaluation ». Or la
   * clôture est IDEMPOTENTE : reclore le même passage rend la même note, sans
   * rien modifier. Le bouton de reprise s'appuie là-dessus.
   */
  const [clotureEnCours, setClotureEnCours] = useState(false)
  const verrouClotureRef = useRef(creerVerrouEnvoi())
  const cloturer = useCallback(async () => {
    if (!verrouClotureRef.current.prendre()) return
    setClotureEnCours(true)
    try {
      const r = await persist({ step: indexRef.current, finish: true })
      setBilan(r?.bilan ?? null)
      const suite = deciderApresCompletion({ preview: !!preview, reponse: r })
      setNoteEnregistree(suite.noteEnregistree)
      setBilanEnAttente(false)
      if (suite.cocherLeChapitre) onCompleted?.()
    } finally {
      verrouClotureRef.current.liberer()
      setClotureEnCours(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, preview, onCompleted])
  cloturerRef.current = cloturer

  return {
    /** Compteurs à alimenter par l'app : erreurs, aides ouvertes, secondes. */
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
    setBilanEnAttente,
    noteEnregistree,
    pannneJuge,
    setPanneJuge,
  }
}
