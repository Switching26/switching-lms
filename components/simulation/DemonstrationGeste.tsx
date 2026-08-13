"use client"

/**
 * « Montrez-moi » : la démonstration animée du geste attendu.
 *
 * POURQUOI CETTE VERSION
 * La première ne savait jouer qu'UN geste, et seulement pour quatre types
 * d'action sur vingt-deux. Retour de Samuel le 29/07/2026 : « des fois c'est
 * absent, des fois c'est une mauvaise démonstration, des fois elle se finit
 * pas, c'est pas clair ». L'audit lui a donné raison — sur 1 654 étapes
 * interactives : 518 muettes, 550 formules arrêtées avant le résultat, 155
 * étapes multi-cellules dont une seule était montrée.
 *
 * Ce composant joue désormais une SÉQUENCE de gestes (`lib/simulation/
 * demonstration.ts`, 100 % des étapes couvertes) et va jusqu'au bout : la
 * valeur est réellement écrite dans la grille, donc une formule affiche son
 * RÉSULTAT calculé par le moteur — pas la formule, pas un nombre inventé.
 *
 * ÉCRIRE SANS VALIDER. Écrire déclenche l'observation du classeur, donc la
 * validation de l'étape, donc le passage automatique à la suivante : la
 * démonstration se saborderait. Le player pose un verrou (`onEcrire`) qui fait
 * ignorer les observations le temps de l'écriture. L'apprenant garde la main et
 * reprend avec « J'ai compris — continuer ».
 *
 * Les coordonnées viennent de `getCellRect` (métriques d'Univer, pas le DOM :
 * la grille est un canvas) et du DOM pour le châssis. Le parent résout, ce
 * composant ne fait que jouer.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { CibleDemo, PlanDemo } from "@/lib/simulation/demonstration"
import { C, voileAccent } from "@/lib/simulation/couleurs"

/* Le calque de démonstration est COMMUN aux quatre applications : l'anneau qui
   appelle le regard, l'onde du clic et les jetons du plan portaient le vert
   d'Excel. Le bouton qui les lance (« Voir le geste ») prend la couleur de
   l'application — la démonstration qu'il déclenche devait la prendre aussi.
   ⚠️ Le halo d'ERREUR n'est pas ici : il vit dans chaque player, en rouge. */
const VERT = C.accent
const VERT_F = C.accentF
const ENCRE = "#171a18"

export type Rect = { left: number; top: number; width: number; height: number }

type Props = {
  plan: PlanDemo
  /** Résout une cible en rectangle, dans le repère du calque. */
  resoudre: (cible: CibleDemo) => Rect | null
  /** Largeur du calque, pour garder bulles et étiquettes dans le champ. */
  largeur: number
  /**
   * Bord haut de la ZONE DE TRAVAIL dans le repère du calque : la première
   * ligne de la feuille, sous les en-têtes de colonnes.
   *
   * Le calque couvre tout l'atelier, bureau compris — il commence donc au-dessus
   * du ruban et de la barre de formule. Une bulle accrochée « au-dessus de sa
   * cible » sans cette borne se posait sur le chrome d'Excel : mesuré sur 186
   * chapitres, 42 % des bulles tombaient hors de la feuille, dont 30 % sur la
   * barre de formule et le ruban. On explique un geste en masquant les repères
   * qui servent à le faire.
   */
  hautFeuille?: number
  /** Écrit réellement dans la grille, validation neutralisée. */
  onEcrire?: (ref: string, valeur: string) => void
  /**
   * Ouvre réellement un onglet du ruban. Indispensable : le ruban ne rend que
   * son onglet actif, donc désigner l'onglet sans l'ouvrir laisse le bouton du
   * geste SUIVANT introuvable — et ce geste-là se joue alors à blanc.
   */
  onOnglet?: (onglet: string) => void
  /**
   * UNE BULLE D'AUTEUR ENTRE EN SCÈNE — appelé avec son rang, une fois par bulle.
   *
   * C'est le seul lien entre le calque et la voix, et il ne va que dans ce
   * sens-là : le calque SIGNALE, il n'attend rien en retour et n'apprend jamais
   * si un son a été joué. Lui faire attendre la fin d'une phrase le rendrait
   * dépendant du réseau, et une piste absente figerait la démonstration — le
   * seul défaut que ce simulateur ne tolère pas.
   *
   * N'est appelé que pour les gestes que l'AUTEUR a écrits (`rangBulle`), jamais
   * pour les ouvertures d'onglet insérées par le moteur, et jamais en mouvement
   * réduit — dans ce mode le calque exécute tout d'un coup, aucune bulle ne
   * s'affiche séparément, donc rien n'a à être commenté.
   */
  onBulle?: (rangBulle: number) => void
  /**
   * LA SÉQUENCE PREND FIN — appelé au démontage du calque, et lui seul.
   *
   * Le calque est remonté à chaque changement d'étape et à chaque rejeu (sa
   * `key` porte les deux) : son démontage est donc l'instant exact où une phrase
   * en cours n'a plus d'écran pour la justifier. Sans cela, quitter l'étape
   * pendant qu'une bulle parle laisserait la voix commenter l'écran suivant.
   */
  onArreterVoix?: () => void
  /** Crée réellement un nom de plage, sans déclencher la validation de l'étape. */
  onDefinir?: (nom: string, ref: string) => void
  /** Sélectionne réellement une cellule ou une plage. */
  onSelectionner?: (ref: string) => void
  /**
   * Presse réellement un contrôle du châssis. Sans cela, les démonstrations des
   * étapes jugées sur autre chose qu'une valeur de cellule — format, tri,
   * filtre, mise en page, graphique, tableau croisé, macro, poste — montraient
   * le bon bouton sans que rien ne change à l'écran.
   */
  onPresser?: (id: string, arg?: string) => void
  /**
   * Écran de lecture, où la démonstration se joue d'elle-même.
   *
   * Le carton d'annonce disait « Vous vous êtes trompé plusieurs fois » : juste
   * quand l'aide vient après des erreurs, mais faux et désagréable sur un écran
   * qui n'attend AUCUNE action — l'apprenant se voyait reprocher des fautes
   * qu'il n'avait pas commises.
   */
  lecture?: boolean
  onFini?: () => void
}

/** Étapes d'un geste. `avertir` n'existe qu'une fois, au tout début. */
type Phase = "avertir" | "vise" | "bulle" | "clic" | "glisse" | "frappe" | "valide" | "fini"

/** Secondes de décompte avant une démonstration qui se lance toute seule. */
const DECOMPTE = 4
/** Périmètre du cadran, pour animer sa décharge sans le recalculer. */
const TOUR = 2 * Math.PI * 23

/**
 * Accélérateur d'AUDIT, hors production.
 *
 * Auditer les 1 587 démonstrations en premier passage PUIS en rejeu demande de
 * jouer ~3 200 séquences. À vitesse réelle — et il n'y a pas d'autre façon de
 * mesurer la résolution des cibles, `reducedMotion` ne rendant que le dernier
 * geste — le balayage dépasse la dizaine d'heures.
 *
 * Ce facteur ne SAUTE aucune phase : `avertir → vise → bulle → clic → frappe →
 * valide` s'enchaînent toutes, chaque caractère est toujours frappé un par un,
 * chaque écriture et chaque pression ont toujours lieu, dans le même ordre. Seule
 * la DURÉE de chacune est divisée. Un plancher de 16 ms garde une frame par
 * phase, sans quoi React grouperait deux phases dans le même rendu et le calque
 * ne dessinerait jamais le repère intermédiaire — ce qui produirait exactement le
 * faux négatif que l'audit cherche à éviter.
 *
 * Le bloc est retiré des bundles de production par le remplacement de
 * `process.env.NODE_ENV`, comme `window.__SIM_GRID` et `__SIM_FORCE_DEMO` : en
 * production `vitesse()` est la constante 1, donc `duree / 1`.
 */
function vitesse(): number {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return 1
  const v = (window as unknown as { __SIM_DEMO_VITESSE?: number }).__SIM_DEMO_VITESSE
  return typeof v === "number" && v >= 1 && v <= 40 ? v : 1
}

/** Durée d'une phase, ramenée à l'échelle d'audit. Jamais sous une frame. */
function tempo(ms: number): number {
  const v = vitesse()
  return v === 1 ? ms : Math.max(16, Math.round(ms / v))
}

export default function DemonstrationGeste({ plan, resoudre, largeur, hautFeuille = 0, onEcrire, onOnglet, onBulle, onArreterVoix, onDefinir, onSelectionner, onPresser, lecture, onFini }: Props) {
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<Phase>("avertir")
  const [tapes, setTapes] = useState(0)
  /** Secondes restantes affichées pendant l'avertissement. */
  const [reste, setReste] = useState(DECOMPTE)
  const doux = useRef(false)
  const finiRef = useRef(onFini)
  const ecrireRef = useRef(onEcrire)
  const ongletRef = useRef(onOnglet)
  const definirRef = useRef(onDefinir)
  const selRef = useRef(onSelectionner)
  const presserRef = useRef(onPresser)
  const bulleRef = useRef(onBulle)
  const arretVoixRef = useRef(onArreterVoix)
  finiRef.current = onFini
  /**
   * LE CALQUE NE MEURT PAS PARCE QUE LE MOTEUR A TOUSSÉ.
   *
   * Chaque rappel traverse la façade d'Univer, qui peut refuser une
   * construction sous charge — « [redi]: Detecting cyclic dependency » mesuré
   * sur `m01-e02`, à la sixième cellule d'une saisie de huit. L'exception
   * remontait ici, la frontière d'erreur de React démontait le calque, et la
   * démonstration s'arrêtait à 5/8 : pas de fin, pas de bouton « Revoir », pas
   * de sortie. Au pire un geste n'aboutit pas — la séquence, elle, continue.
   */
  const sansCasse =
    <A extends unknown[]>(f?: (...a: A) => void) =>
    (...a: A) => {
      try {
        f?.(...a)
      } catch {
        /* le geste suivant reprend la main */
      }
    }
  ecrireRef.current = sansCasse(onEcrire)
  ongletRef.current = sansCasse(onOnglet)
  definirRef.current = sansCasse(onDefinir)
  selRef.current = sansCasse(onSelectionner)
  presserRef.current = sansCasse(onPresser)
  bulleRef.current = sansCasse(onBulle)
  arretVoixRef.current = sansCasse(onArreterVoix)

  useEffect(() => {
    doux.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  const geste = plan.gestes[Math.min(i, plan.gestes.length - 1)]
  const dernier = i >= plan.gestes.length - 1

  /** Enchaîne les phases d'un geste. */
  const suite = useCallback(() => {
    setPhase((p) => {
      if (p === "avertir") return "vise"
      if (p === "vise") return "bulle"
      if (p === "bulle") return geste?.glisserVers ? "glisse" : "clic"
      // TOUT geste sort par « valide » : c'est le seul endroit qui décide
      // entre passer au suivant et terminer. Un clic sec ou un glissement
      // filaient droit sur « fini » et arrêtaient la séquence entière à leur
      // hauteur — une démonstration en huit gestes s'interrompait au premier
      // clic de repérage, compteur figé (défaut trouvé le 29/07/2026).
      if (p === "glisse") return "valide"
      if (p === "clic") return geste?.frappe ? "frappe" : "valide"
      if (p === "frappe") return "valide"
      return "fini"
    })
  }, [geste])

  /**
   * LA BULLE ENTRE EN SCÈNE : on le SIGNALE, et c'est tout.
   *
   * Une seule fois par bulle — l'effet ne se rejoue qu'au changement de phase ou
   * de geste. Et seulement pour une bulle que l'AUTEUR a écrite : les ouvertures
   * d'onglet insérées par le moteur n'ont pas de rang, donc pas de voix (sans
   * quoi chaque phrase se décalerait d'un cran, sans erreur ni compteur faux).
   *
   * ⚠️ ON N'ATTEND RIEN EN RETOUR. La minuterie ci-dessous part exactement comme
   * avant ; sa durée a été décidée à la construction du plan, pas ici. C'est ce
   * qui garantit qu'un son absent, refusé ou lent ne peut pas figer l'écran.
   *
   * En mouvement réduit, le calque saute directement à « fini » sans passer par
   * cette phase : rien ne parle, ce qui est le comportement voulu — l'apprenant
   * a demandé qu'on ne l'anime pas.
   */
  useEffect(() => {
    if (phase !== "bulle" || doux.current) return
    const rang = geste?.rangBulle
    if (typeof rang !== "number") return
    bulleRef.current?.(rang)
  }, [phase, i, geste])

  /**
   * Une phrase en cours n'a plus d'écran pour la justifier : on la coupe.
   *
   * Au DÉMONTAGE seulement — la `key` du calque porte l'étape et le rejeu, donc
   * il est remonté à chaque fois que la séquence recommence ou change de sujet.
   */
  useEffect(() => {
    return () => arretVoixRef.current?.()
  }, [])

  // Minuterie : chaque phase a sa durée. L'avertissement doit se lire, la
  // frappe dépend de la longueur du texte.
  useEffect(() => {
    // La phase « valide » est pilotée par l'effet d'écriture ci-dessous, pas
    // ici : les deux minuteries se couraient après (850 ms contre 900 ms) et la
    // plus rapide passait à « fini » en annulant le passage au geste suivant.
    // La séquence restait donc bloquée sur son premier geste, compteur figé.
    if (phase === "fini" || phase === "valide") return
    if (doux.current) {
      setTapes(geste?.frappe?.length ?? 0)
      // Mouvement réduit : on écrit tout d'un coup et on s'arrête à la pose.
      // L'onglet s'ouvre aussi, sinon le dernier geste — le seul rendu dans ce
      // mode — reste sur un bouton absent de la page.
      for (const g of plan.gestes) {
        if (g.selectionner) selRef.current?.(g.selectionner)
        if (g.ecrire) ecrireRef.current?.(g.ecrire.ref, g.ecrire.valeur)
        if (g.onglet) ongletRef.current?.(g.onglet)
        if (g.definir) definirRef.current?.(g.definir.nom, g.definir.ref)
        if (g.presser) presserRef.current?.(g.presser.id, g.presser.arg)
      }
      setI(plan.gestes.length - 1)
      setPhase("fini")
      return
    }
    // Le PREMIER geste est joué lentement : c'est lui qui enseigne. Les
    // suivants s'accélèrent — une séquence de huit cellules à trois secondes
    // pièce dure une demi-minute et l'apprenant décroche avant la fin.
    const vite = i > 0 ? 0.55 : 1
    const duree =
      // 4 s quand la démonstration démarre d'elle-même : l'apprenant n'a rien
      // demandé, il faut lui laisser le temps de lever les yeux. Le décompte
      // occupe exactement cette durée. Une démonstration réclamée par
      // « Montrez-moi » n'a pas besoin de ce délai — il regarde déjà.
      phase === "avertir" ? (lecture ? DECOMPTE * 1000 : 3200)
      : phase === "vise" ? 900 * vite
      : phase === "bulle" ?
          /* DURÉE IMPOSÉE, quand une voix dit cette bulle : la phrase parlée ne
             dure pas ce que le texte écrit laisse croire — mesuré de 1,00 à
             2,37 fois, parce que l'oral épelle les formules. Aucun coefficient
             sur la longueur ne marche, la durée vient donc du manifeste audio.

             ⚠️ C'est un NOMBRE, pas une attente : le calque n'attend jamais la
             fin d'un son. Champ absent ⇒ la formule d'origine, à l'octet.
             Et il passe par `tempo()` comme les autres — sans quoi un balayage
             accéléré mesurerait un rythme qui n'existe pas. */
          geste?.dureeBulleMs ??
          (geste?.illustration
            // 55 ms par signe plafonnés à 4,2 s : au-delà de 76 signes le texte
            // était tronqué dans le temps, pas dans l'espace — 124 signes en
            // 4,2 s font 29 signes/seconde, une vitesse à laquelle on ne lit
            // pas. 62 ms par signe jusqu'à 6,2 s ramène le pire cas à 20.
            ? Math.min(6200, Math.max(1800, (geste.bulle?.length ?? 0) * 62))
            : (i === 0 ? 1100 : 620))
      : phase === "clic" ? 700 * vite
      : phase === "glisse" ? 1200
      : phase === "frappe" ? (260 + (geste?.frappe?.length ?? 0) * 105 + 500) * vite
      : 850 * vite
    const t = window.setTimeout(suite, tempo(duree))
    return () => window.clearTimeout(t)
  }, [phase, i, geste, suite, plan.gestes])

  /**
   * Le décompte, seconde par seconde.
   *
   * Il ne descend jamais sous 1 : afficher « 0 » laisserait un cadran vide
   * pendant que la carte s'efface, ce qui se lit comme un blocage.
   */
  useEffect(() => {
    if (phase !== "avertir" || !lecture || doux.current) return
    const t = window.setInterval(() => setReste((n) => (n > 1 ? n - 1 : n)), tempo(1000))
    return () => window.clearInterval(t)
  }, [phase, lecture])

  // La frappe, caractère par caractère.
  useEffect(() => {
    if (phase !== "frappe" || !geste?.frappe) return
    if (tapes >= geste.frappe.length) return
    const t = window.setTimeout(() => setTapes((n) => n + 1), tempo(i > 0 ? 58 : 105))
    return () => window.clearTimeout(t)
  }, [phase, tapes, geste, i])

  // Écriture réelle à la validation, puis geste suivant.
  useEffect(() => {
    if (phase !== "valide" || !geste) return
    if (geste.ecrire) ecrireRef.current?.(geste.ecrire.ref, geste.ecrire.valeur)
    // L'onglet s'ouvre AVANT le passage au geste suivant : c'est ce qui met son
    // bouton dans la page, donc ce qui rend sa cible résoluble.
    if (geste.onglet) ongletRef.current?.(geste.onglet)
    if (geste.definir) definirRef.current?.(geste.definir.nom, geste.definir.ref)
    // La sélection vient AVANT la pression : un bouton de mise en forme agit sur
    // la sélection courante, et le geste précédent du plan est justement celui
    // qui l'établit.
    if (geste.selectionner) selRef.current?.(geste.selectionner)
    if (geste.presser) presserRef.current?.(geste.presser.id, geste.presser.arg)
    // Un seul chemin de sortie : soit le geste suivant, soit la fin.
    const t = window.setTimeout(
      () => {
        if (dernier) {
          setPhase("fini")
          return
        }
        setI((n) => n + 1)
        setTapes(0)
        setPhase("vise")
      },
      tempo(i === 0 ? 900 : 450),
    )
    return () => window.clearTimeout(t)
    // `i` volontairement absent : il ne change qu'AVEC la phase, et l'inclure
    // relancerait l'effet en pleine transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, geste, dernier])

  useEffect(() => {
    if (phase === "fini" && dernier) finiRef.current?.()
  }, [phase, dernier])

  if (!geste) return null

  const avertit = phase === "avertir"
  const resoudreSur = (c: CibleDemo | undefined | null) => {
    if (!c) return null
    try {
      return resoudre(c)
    } catch {
      return null
    }
  }
  const rect = avertit ? null : resoudreSur(geste.cible)
  const rectFin = resoudreSur(geste.glisserVers)
  const agit = phase === "clic" || phase === "glisse" || phase === "frappe" || phase === "valide" || phase === "fini"

  /**
   * Un propos SANS LIEU : la cible `ecran` d'un `MONTRER` se résout en un cadre
   * de 180 × 68 posé au centre, prévu pour accueillir des touches de clavier.
   * Sur une illustration il n'y a pas de touches — restait un cadre vert vide
   * qui pulsait au milieu de la feuille, désignant du néant. C'est ce que
   * Samuel a filmé le 31/07/2026 sur `M01-L02-08`, où la bulle parle d'onglets
   * contextuels que rien n'affiche.
   *
   * Onze bulles de la formation sont dans ce cas : les formats de fichier, les
   * codes d'en-tête, les briefs d'évaluation… autant de propos qui ne se
   * rattachent à aucun endroit précis. On garde la phrase, on retire le cadre :
   * une bulle sans cadre vaut mieux qu'un cadre sur du vide.
   */
  const sansLieu = geste.cible.k === "clavier" && !geste.touches

  /**
   * La bulle se pose-t-elle AU-DESSUS de sa cible, ou en dessous ?
   *
   * On ne mesure pas sa hauteur avant de la poser : on la majore. Une bulle
   * d'illustration porte une phrase sur deux ou trois lignes, une bulle de
   * geste tient sur une seule. Si la place manque au-dessus — c'est-à-dire si
   * elle mordrait sur le ruban, la barre de formule ou les en-têtes de
   * colonnes — elle bascule en dessous, où la feuille lui appartient.
   */
  /* Majoration de la hauteur de la bulle, mesurée puis arrondie au-dessus :
     une illustration atteint 4 lignes à 312 px de large (≈ 88 px), un geste
     tient sur une ligne. Sous-estimer la remet sur la barre de formule. */
  const hauteurMajoree = geste.illustration ? 96 : 40
  /**
   * Trois places, dans cet ordre de préférence :
   *
   *  · À DROITE de la cible quand la feuille laisse la largeur. C'est la
   *    meilleure : la bulle ne masque ni les repères d'Excel, ni la zone dont
   *    elle parle. C'est déjà la règle de la bulle d'aide.
   *  · EN DESSOUS sinon.
   *  · AU-DESSUS en dernier, et seulement s'il reste la place SOUS le ruban :
   *    au-dessus sans cette borne, la bulle se posait sur la barre de formule.
   */
  const largeurBulle = geste.illustration ? 312 : 205
  const aDroite = !!rect && largeur - (rect.left + rect.width) >= largeurBulle + 20
  /* `hautFeuille` à 0 = borne inconnue (repère pas encore mesuré) : on descend
     la bulle, seule position sûre — au-dessus, elle irait sur le ruban. */
  const dessus = !aDroite && !!rect && hautFeuille > 0 && rect.top - 10 - hauteurMajoree >= hautFeuille

  const pointe =
    phase === "glisse" && rectFin
      ? { x: rectFin.left + rectFin.width * 0.5, y: rectFin.top + rectFin.height * 0.42 }
      : rect
        ? { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.42 }
        : null

  /**
   * Repère atteint dans la liste des pas.
   *
   * Sur une séquence de plusieurs gestes, les pas se répartissent entre eux :
   * caler l'avancement sur la seule phase cochait toute la liste dès le premier
   * geste validé, alors qu'il en restait sept à jouer.
   */
  const pasCourant =
    plan.pas.length === 1 ? 0
    : plan.gestes.length > 1
      ? Math.min(
          Math.round((i / Math.max(1, plan.gestes.length - 1)) * (plan.pas.length - 1)) +
            (phase === "fini" ? 1 : 0),
          plan.pas.length - 1,
        )
      : phase === "frappe" ? Math.min(1, plan.pas.length - 1)
      : phase === "valide" || phase === "fini" ? plan.pas.length - 1
      : 0

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      /* Repères de mesure, même famille que `data-demo-compteur` : ils disent
         OÙ EN EST la séquence sans qu'un contrôle ait à deviner. Le rejeu
         s'audite en comparant l'état juste après l'annonce — donc avant la
         première écriture — à celui de l'entrée dans l'étape : sans ces deux
         attributs, ce moment ne se repère qu'au chronomètre, et une mesure au
         chronomètre finit toujours par tomber du mauvais côté. */
      data-demo-phase={phase}
      data-demo-geste={Math.min(i + 1, plan.gestes.length)}
      style={{ zIndex: 40 }}
    >
      {avertit && (
        <>
          <div className="absolute inset-0" style={{ background: "rgba(23,26,24,.42)", animation: "sim-demo-voile .3s ease both" }} />
          <div
            className="absolute rounded-2xl bg-white px-5 py-4"
            style={{
              left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(430px, 88%)",
              boxShadow: "0 24px 60px -18px rgba(0,0,0,.5)", borderTop: "4px solid #E8A33D",
              animation: "sim-demo-carte .34s cubic-bezier(.2,.9,.2,1) both",
            }}
          >
            {/* Le cadran ne sert qu'au démarrage automatique : il dit COMBIEN
                de temps il reste avant que ça bouge. Sans lui, l'apprenant
                découvre le mouvement au lieu de l'attendre. */}
            {lecture && (
              <div
                className="absolute"
                style={{ left: 20, top: "50%", transform: "translateY(-50%)", width: 52, height: 52 }}
              >
                <svg width="52" height="52" style={{ transform: "rotate(-90deg)", display: "block" }}>
                  <circle cx="26" cy="26" r="23" fill="none" strokeWidth="4" stroke="#F2E4CC" />
                  <circle
                    cx="26" cy="26" r="23" fill="none" strokeWidth="4" stroke="#E8A33D" strokeLinecap="round"
                    style={{
                      strokeDasharray: TOUR,
                      // Le cadran se vide en temps réel. En mouvement réduit il
                      // reste plein : une jauge qui glisse est justement ce que
                      // ce réglage demande d'éviter.
                      animation: doux.current ? undefined : `sim-demo-cadran ${DECOMPTE}s linear forwards`,
                    }}
                  />
                </svg>
                <div
                  className="absolute inset-0 grid place-items-center text-[22px] font-extrabold"
                  style={{ color: "#8a5a12", fontVariantNumeric: "tabular-nums" }}
                >
                  {reste}
                </div>
              </div>
            )}
            <p
              className="mb-1.5 flex items-center gap-2 text-[14.5px] font-extrabold"
              style={{ color: "#8a5a12", marginLeft: lecture ? 66 : 0 }}
            >
              {!lecture && <span aria-hidden style={{ fontSize: 17 }}>👀</span>}
              {lecture ? "Regardez bien l’écran" : "Je vais vous montrer"}
            </p>
            <p className="text-[13px] leading-snug" style={{ color: "#3C433F", marginLeft: lecture ? 66 : 0 }}>
              {lecture ? (
                <>
                  Voici la démonstration de cette étape. Rien à faire de votre côté :
                  {plan.gestes.length > 1 ? ` je vous montre les ${plan.gestes.length} points ` : " je vous montre le point "}
                  l’un après l’autre, puis vous continuerez.
                </>
              ) : (
                <>
                  Vous vous êtes trompé plusieurs fois — ce n’est pas grave. Regardez bien : je fais
                  {plan.gestes.length > 1 ? ` les ${plan.gestes.length} gestes ` : " le geste "}
                  à votre place, étape par étape. Vous pourrez le refaire ensuite.
                </>
              )}
            </p>
          </div>
        </>
      )}

      {/* Les pas suivis, en bas de la feuille. */}
      <div
        className="absolute flex flex-wrap gap-1.5"
        style={{ left: 8, bottom: 8, opacity: avertit ? 0 : 1, transition: "opacity .3s" }}
      >
        {plan.pas.map((p, n) => {
          const actif = n === pasCourant && phase !== "fini"
          const fait = n < pasCourant || phase === "fini"
          return (
            <span
              key={`${n}-${p}`}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-none"
              style={{
                background: actif ? voileAccent(0.1) : "rgba(255,255,255,.94)",
                border: `1px solid ${actif || fait ? VERT : "#E4E0D8"}`,
                color: actif || fait ? VERT_F : "#9aa19c",
                fontWeight: actif ? 700 : 500,
                boxShadow: "0 1px 3px rgba(0,0,0,.08)",
              }}
            >
              <span
                className="flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ width: 14, height: 14, background: actif || fait ? VERT : "#C9C3B8" }}
              >
                {fait && !actif ? "✓" : n + 1}
              </span>
              {p}
            </span>
          )
        })}
        {/* Compteur de gestes : sans lui, une séquence de huit cellules donne
            l'impression que la démonstration tourne en rond. */}
        {plan.gestes.length > 1 && !avertit && (
          <span
            // Repère de mesure : le contrôle automatique doit pouvoir lire
            // « où en est la séquence » SANS relire le plan. Recalculer le plan
            // après coup donne un autre nombre de gestes — l'onglet de ruban est
            // alors déjà ouvert, donc le geste qui l'ouvre a disparu.
            data-demo-compteur={`${Math.min(i + 1, plan.gestes.length)}/${plan.gestes.length}`}
            className="flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold leading-none"
            style={{ background: ENCRE, color: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.14)" }}
          >
            {Math.min(i + 1, plan.gestes.length)} / {plan.gestes.length}
          </span>
        )}
      </div>

      {rect && !avertit && (
        <>
          {/* Halo d'appel AVANT le clic : le déplacement du curseur seul ne
              suffisait pas à faire regarder au bon endroit. */}
          {!sansLieu && (phase === "vise" || phase === "bulle") && (
            <span
              className="absolute rounded-md"
              style={{
                left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12,
                border: `2px solid ${VERT}`, animation: "sim-demo-appel 1.15s ease-in-out infinite",
              }}
            />
          )}

          <div
            className="absolute"
            // Repère de mesure : un contrôle automatique doit pouvoir dire si la
            // cible désignée tombe DANS l'écran. Une cible résolue mais hors du
            // champ visible est dessinée sans que personne ne la voie — la sonde
            // de résolution répondait « oui » sur une démonstration invisible.
            data-demo-cible={geste?.bulle ?? ""}
            style={{
              display: sansLieu ? "none" : undefined,
              left: rect.left, top: rect.top,
              width: rectFin && (phase === "glisse" || phase === "fini") ? rectFin.left + rectFin.width - rect.left : rect.width,
              height: rectFin && (phase === "glisse" || phase === "fini") ? rectFin.top + rectFin.height - rect.top : rect.height,
              outline: agit ? `2.5px solid ${VERT}` : "none",
              outlineOffset: -2,
              background: agit && phase !== "fini" ? voileAccent(0.08) : "transparent",
              transition: "width .5s ease, height .5s ease, left .25s ease, top .25s ease",
            }}
          />

          {phase === "clic" && (
            <span
              className="absolute rounded-full"
              style={{
                left: rect.left + rect.width / 2 - 7, top: rect.top + rect.height / 2 - 7,
                width: 14, height: 14, border: `2px solid ${VERT}`, animation: "sim-demo-onde .62s ease-out",
              }}
            />
          )}

          {geste.frappe && (phase === "frappe" || phase === "valide") && (
            <div
              className="absolute flex items-center"
              style={{
                left: rect.left + 1, top: rect.top + 1, width: rect.width - 2, height: rect.height - 2,
                padding: "0 5px", background: "#fff", fontSize: 12.5, color: ENCRE,
                fontFamily: "system-ui,-apple-system,sans-serif", overflow: "hidden", whiteSpace: "nowrap",
              }}
            >
              {geste.frappe.slice(0, tapes)}
              {phase === "frappe" && (
                <span style={{ display: "inline-block", width: 1, height: 15, background: ENCRE, marginLeft: 1, animation: "sim-demo-caret .9s steps(1) infinite" }} />
              )}
            </div>
          )}

          {/* Sur une ILLUSTRATION, la phrase est le contenu : elle reste
              affichée tant que le geste dure. Ailleurs elle accompagne le
              mouvement et s'efface avec lui. */}
          {!geste.touches &&
            (geste.illustration ||
              phase === "bulle" ||
              phase === "frappe" ||
              phase === "glisse") && (
            <div
              className={
                geste.illustration
                  ? "absolute rounded-lg px-3 py-2 text-[12.5px] font-semibold leading-snug text-white"
                  : "absolute rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white"
              }
              // Repère de mesure, comme sur le compteur et la cible : le contrôle
              // automatique doit trouver la bulle en UNE requête. La chercher par
              // sa couleur de fond obligeait à parcourir tous les nœuds de la
              // page — la sonde coûtait alors plus cher que ce qu'elle mesurait.
              data-demo-bulle=""
              style={{
                // Une illustration porte une PHRASE : elle se lit en entier, sur
                // plusieurs lignes s'il le faut. Une bulle de geste reste courte
                // et tient sur une ligne pour ne pas masquer la feuille.
                left: aDroite
                  ? rect.left + rect.width + 12
                  : geste.illustration
                    ? Math.min(Math.max(4, rect.left + rect.width / 2 - 150), Math.max(4, largeur - 316))
                    : Math.min(Math.max(4, rect.left + rect.width / 2 - 70), Math.max(4, largeur - 210)),
                /**
                 * Posée au-dessus, la bulle était décalée de 50 px FIXES. Une
                 * bulle d'illustration s'écrit sur deux ou trois lignes : elle
                 * redescendait sur la cellule qu'elle désigne et la masquait —
                 * l'explication recouvrait la chose expliquée (audit du 30/07,
                 * 13 cas sur les 18 premiers écrans mesurés).
                 *
                 * On l'accroche donc par le BAS : quelle que soit sa hauteur,
                 * elle s'arrête 10 px au-dessus de la cible. Le décalage est
                 * porté par l'animation d'entrée, sinon son `transform` final
                 * annulerait celui posé ici.
                 */
                /* À droite, la bulle s'aligne sur le haut de la cible : elle
                   reste dans la feuille et laisse la ligne visible. */
                top: aDroite ? rect.top : dessus ? rect.top - 10 : rect.top + rect.height + 10,
                background: ENCRE,
                maxWidth: geste.illustration ? 312 : 205,
                ...(geste.illustration
                  ? {}
                  : { whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }),
                boxShadow: "0 6px 16px -6px rgba(0,0,0,.5)",
                animation: `${dessus && !aDroite ? "sim-demo-entree-haut" : "sim-demo-entree"} .28s ease both`,
              }}
            >
              {geste.bulle}
            </div>
          )}

          {/* Raccourci clavier : les touches, en relief, là où le curseur
              n'aurait rien à désigner. Elles restent affichées jusqu'à la fin
              du geste — le temps de les lire. */}
          {geste.touches && (
            <div
              className="absolute flex items-center gap-1.5"
              style={{
                left: rect.left, top: rect.top + rect.height / 2 - 16,
                width: rect.width, justifyContent: "center",
                animation: "sim-demo-touche .85s ease both",
              }}
            >
              {geste.touches.map((t, n) => (
                <span key={`${n}-${t}`} className="flex items-center gap-1.5">
                  {n > 0 && <span className="text-[13px] font-bold" style={{ color: ENCRE }}>+</span>}
                  <span
                    className="rounded-md bg-white px-2.5 py-1.5 text-[12.5px] font-bold"
                    style={{ border: `1.5px solid ${ENCRE}`, borderBottomWidth: 3, color: ENCRE }}
                  >
                    {t}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Double-clic : le curseur seul ne distingue pas un clic de deux. */}
          {geste.double && agit && (
            <div
              className="absolute rounded-md px-2 py-1 text-[10.5px] font-bold text-white"
              style={{
                left: Math.min(rect.left + rect.width + 10, Math.max(4, largeur - 60)),
                top: rect.top + rect.height + 6,
                background: ENCRE, animation: "sim-demo-touche .85s ease both",
              }}
            >
              ×2
            </div>
          )}

          {phase === "valide" &&
            !geste.touches &&
            !geste.illustration &&
            (geste.frappe || geste.ecrire?.valeur === "") && (
            <div
              className="absolute rounded-md bg-white px-2 py-1 text-[10.5px] font-bold"
              style={{
                left: Math.min(rect.left + rect.width + 10, Math.max(4, largeur - 76)),
                top: rect.top + rect.height + 6,
                border: `1.5px solid ${ENCRE}`, borderBottomWidth: 3, color: ENCRE,
                animation: "sim-demo-touche .85s ease both",
              }}
            >
              {geste.frappe ? "⏎ Entrée" : "⌦ Suppr"}
            </div>
          )}

          {/* Le curseur. `top/left: 0` obligatoire : sans origine explicite, le
              translate part de la position en flux et la flèche sort du cadre. */}
          {pointe && !geste.touches && !sansLieu && (
            <svg
              className="absolute"
              viewBox="0 0 20 26"
              style={{
                left: 0, top: 0, width: 20, height: 26,
                opacity: phase === "fini" ? 0 : 1,
                transform: `translate(${pointe.x}px, ${pointe.y}px)`,
                transition: "transform .8s cubic-bezier(.33,.02,.2,1), opacity .3s",
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))",
              }}
            >
              <path d="M2 1l15 12-6.5.6 4 7.6-3.2 1.7-3.9-7.5L2 20z" fill="#fff" stroke={ENCRE} strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          )}
        </>
      )}

      <style>{`
@keyframes sim-demo-voile{from{opacity:0}to{opacity:1}}
@keyframes sim-demo-carte{from{opacity:0;transform:translate(-50%,-46%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes sim-demo-entree{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
/* Bulle posée AU-DESSUS de la cible : elle est remontée de sa propre hauteur,
   donc son bas s'aligne juste au-dessus, quel que soit le nombre de lignes. */
@keyframes sim-demo-entree-haut{from{opacity:0;transform:translateY(calc(-100% + 4px))}to{opacity:1;transform:translateY(-100%)}}
@keyframes sim-demo-onde{0%{opacity:.95;transform:scale(.3)}100%{opacity:0;transform:scale(3.4)}}
@keyframes sim-demo-appel{0%,100%{opacity:.95;transform:scale(1)}50%{opacity:.35;transform:scale(1.06)}}
@keyframes sim-demo-caret{50%{opacity:0}}
@keyframes sim-demo-cadran{to{stroke-dashoffset:${TOUR}}}
@keyframes sim-demo-touche{0%{opacity:0}25%{opacity:1;transform:translateY(0)}45%{transform:translateY(2px)}60%{transform:translateY(0)}100%{opacity:1}}
@media (prefers-reduced-motion: reduce){
  [style*="sim-demo-"]{animation-duration:.01ms !important;animation-iteration-count:1 !important}
}
`}</style>
    </div>
  )
}
