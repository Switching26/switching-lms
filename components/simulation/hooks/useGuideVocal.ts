"use client"

/**
 * LE GUIDE VOCAL — la voix qui lit l'étape à l'apprenant.
 *
 * Vit dans le CHÂSSIS, pas dans les players : lire une consigne à voix haute ne
 * parle ni de cellule, ni de paragraphe, ni de diapositive. Les quatre
 * applications lui passent une seule chose qu'elles seules connaissent —
 * l'identifiant de l'étape courante — exactement comme elles passent déjà
 * `demoJouable` ou `verdictAncre`.
 *
 * LES CINQ RÈGLES, dans l'ordre où elles ont été demandées :
 *
 *  1. la lecture DÉMARRE à l'arrivée sur l'étape ;
 *  2. elle S'ARRÊTE dès que l'apprenant agit — au premier geste, pas au premier
 *     verdict : celui qui pose la main sur le clavier a fini d'écouter ;
 *  3. elle se COUPE définitivement d'un bouton, et le choix est mémorisé ;
 *  4. elle se RELANCE du même bouton, et rejoue l'étape courante ;
 *  5. elle ne se superpose JAMAIS à une démonstration, et ne survit ni au
 *     changement d'étape, ni à la fermeture du chapitre.
 *
 * ⚠️ LE SON NE PART PAS TOUT SEUL SUR iOS — ET C'EST DÉFINITIF.
 *
 * Safari refuse toute lecture programmée tant que l'apprenant n'a pas produit un
 * geste dans la page ; la promesse de `play()` est rejetée en `NotAllowedError`,
 * sans le moindre son ni la moindre erreur visible. On ne contourne pas cette
 * règle, on s'en sert : l'atelier possède déjà un geste garanti, le clic sur
 * « Commencer la leçon » de l'écran d'ouverture. Le premier geste QUEL QU'IL
 * SOIT débloque l'élément audio, une fois pour toutes, en y jouant un silence.
 *
 * Reste un cas où ce geste n'existe pas : la REPRISE d'un chapitre à l'étape 7,
 * qui saute l'écran d'ouverture. La première lecture est alors refusée — c'est
 * attendu, ce n'est pas une panne — et le bouton du cockpit passe en
 * « Activer la voix ». Le clic dessus est le geste manquant.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { ROLES_AIDE, ROLES_ARRIVEE, ROLES_JOUES, type SegmentVoix } from "@/lib/simulation/voix"

/** Un segment tel que la route le sert : le manifeste plus l'adresse. */
type SegmentServi = SegmentVoix & { url: string }
type ManifesteServi = { etapes: Record<string, SegmentServi[]> }

/**
 * Un silence de zéro échantillon, embarqué en clair.
 *
 * Il ne sert qu'à débloquer l'élément audio pendant un geste de l'apprenant. En
 * ligne dans le code, et non en fichier : un asset servi par `public/` ne l'est
 * pas de façon fiable en standalone (piège 0c), et le déblocage échouerait alors
 * précisément sur l'environnement de production.
 */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA="

/** Choix de l'apprenant, gardé d'un chapitre à l'autre et d'un jour à l'autre. */
const CLE_MEMOIRE = "lms-guide-vocal"

/**
 * Le temps qu'on laisse à l'écran avant de parler.
 *
 * Assez pour que le décor de l'étape soit posé et que l'apprenant ait vu ce qui
 * a changé, assez court pour que la voix accompagne l'arrivée plutôt que de la
 * commenter après coup.
 */
const DELAI_DEMARRAGE_MS = 600

export type GuideVocal = {
  /** Le chapitre porte au moins une piste : sans cela, aucun bouton n'apparaît. */
  disponible: boolean
  /** L'étape courante a quelque chose à dire. */
  etapeSonore: boolean
  enLecture: boolean
  /** L'apprenant a coupé la voix : elle ne repartira plus d'elle-même. */
  coupee: boolean
  /** Le navigateur a refusé de jouer sans geste : un clic est nécessaire. */
  bloquee: boolean
  /** Rejoue la consigne de l'étape courante depuis le début. */
  rejouer: () => void
  arreter: () => void
  /** Coupe définitivement, ou remet en marche. Le choix est mémorisé. */
  basculerCoupure: () => void
}

export function useGuideVocal(opts: {
  chapterId: string
  /** Étape courante. Absente ⇒ le guide reste inerte. */
  etapeId?: string | null
  /** Aperçu admin, écran de fin, page de garde : rien ne se joue. */
  actif: boolean
  /** L'écran d'ouverture est passé. */
  introVue: boolean
  /** Une démonstration est en cours ou terminée sur cette étape. */
  demonstration: boolean
  demoFinie: boolean
  /**
   * L'indice est à l'écran.
   *
   * C'est son DÉVOILEMENT qui déclenche la lecture de l'aide, jamais sa
   * présence : en leçon il est affiché dès l'arrivée, et l'enchaîner à la
   * consigne reviendrait à souffler la réponse avant le premier essai.
   */
  aideVisible: boolean
  /**
   * Cette étape va lancer une démonstration TOUTE SEULE (écran « À comprendre »
   * porteur d'un `montrer`). La voix attend alors qu'elle soit finie : la règle
   * est qu'elles ne se superposent jamais, et c'est la démonstration qui a la
   * priorité — elle porte déjà son texte à l'écran.
   */
  demonstrationAutomatique: boolean
  /**
   * La carte de l'atelier : c'est là qu'on écoute les gestes de l'apprenant.
   * Tout ce qui s'y passe interrompt la lecture, sauf les commandes de la voix
   * elle-même (`[data-voix]`).
   */
  zoneRef: RefObject<HTMLElement | null>
}): GuideVocal {
  const {
    chapterId,
    etapeId,
    actif,
    introVue,
    demonstration,
    demoFinie,
    demonstrationAutomatique,
    aideVisible,
    zoneRef,
  } = opts

  const [manifeste, setManifeste] = useState<ManifesteServi | null>(null)
  const [enLecture, setEnLecture] = useState(false)
  const [coupee, setCoupee] = useState(false)
  const [bloquee, setBloquee] = useState(false)

  /** L'élément audio : UN seul pour tout l'atelier, réutilisé d'une piste à
   *  l'autre. Deux éléments voudraient dire deux déblocages iOS à obtenir. */
  const audioRef = useRef<HTMLAudioElement | null>(null)
  /** La suite des pistes qui reste à jouer. */
  const fileRef = useRef<string[]>([])
  /** Démarrage différé en cours, qu'un geste de l'apprenant doit pouvoir annuler. */
  const minuterieRef = useRef<number | null>(null)

  /* ── Le choix mémorisé ──────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      setCoupee(window.localStorage.getItem(CLE_MEMOIRE) === "coupe")
    } catch {
      /* navigation privée, stockage refusé : la voix reste simplement active */
    }
  }, [])

  /* ── Le manifeste du chapitre ───────────────────────────────────────────── */
  useEffect(() => {
    if (!actif || !chapterId) return
    let annule = false
    fetch(`/api/simulations/${chapterId}/voix`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (annule || !json || typeof json !== "object") return
        setManifeste({ etapes: (json.etapes ?? {}) as Record<string, SegmentServi[]> })
      })
      .catch(() => {
        /* Pas de voix, pas d'atelier cassé : le guide reste absent. */
      })
    return () => {
      annule = true
    }
  }, [chapterId, actif])

  /** Tous les segments déclarés pour l'étape, dans l'ordre du manifeste. */
  const tous = useMemo(() => {
    if (!manifeste || !etapeId) return []
    return manifeste.etapes[etapeId] ?? []
  }, [manifeste, etapeId])

  /** Ce qui se dit à l'arrivée : l'énoncé, et lui seul. */
  const segments = useMemo(() => tous.filter((s) => ROLES_ARRIVEE.has(s.role)), [tous])
  /** Ce qui se dit au dévoilement de l'indice. */
  const segmentsAide = useMemo(() => tous.filter((s) => ROLES_AIDE.has(s.role)), [tous])

  const disponible = useMemo(
    () =>
      !!manifeste &&
      Object.values(manifeste.etapes).some((liste) => liste.some((s) => ROLES_JOUES.has(s.role))),
    [manifeste],
  )

  /* ── Lecture ────────────────────────────────────────────────────────────── */

  const obtenirAudio = useCallback((): HTMLAudioElement | null => {
    if (typeof window === "undefined") return null
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = "none"
      audioRef.current = a
    }
    return audioRef.current
  }, [])

  const arreter = useCallback(() => {
    if (minuterieRef.current !== null) {
      window.clearTimeout(minuterieRef.current)
      minuterieRef.current = null
    }
    fileRef.current = []
    const a = audioRef.current
    if (a) {
      a.pause()
      // On ne vide PAS `src` : le remettre à vide relance un chargement de
      // l'URL courante sur certains navigateurs, et parasite le prochain
      // `play()`. Mettre la tête à zéro suffit à ce que la reprise reparte du
      // début.
      try {
        a.currentTime = 0
      } catch {
        /* la piste n'était pas encore chargée : rien à rembobiner */
      }
    }
    setEnLecture(false)
  }, [])

  /** Lu par l'écoute des gestes, qui ne doit pas se recâbler à chaque rendu. */
  const arreterRef = useRef(arreter)
  arreterRef.current = arreter

  const jouerLaSuite = useCallback(() => {
    const a = obtenirAudio()
    const url = fileRef.current.shift()
    if (!a || !url) {
      setEnLecture(false)
      return
    }
    a.src = url
    const p = a.play()
    if (p && typeof p.then === "function") {
      p.then(() => {
        setEnLecture(true)
        setBloquee(false)
      }).catch((e: unknown) => {
        /* LE REFUS D'AUTOPLAY N'EST PAS UNE PANNE.
         *
         * Il faut le distinguer d'une piste manquante : le premier se répare
         * d'un clic, le second est un défaut de contenu. On ne réessaie pas —
         * insister ferait vibrer le bouton sans jamais produire de son. */
        const nom = (e as { name?: string } | null)?.name
        if (nom === "NotAllowedError") setBloquee(true)
        fileRef.current = []
        setEnLecture(false)
      })
    } else {
      setEnLecture(true)
    }
  }, [obtenirAudio])

  // L'enchaînement des segments : « le problème » puis « la conclusion » d'une
  // même consigne coupée en deux ne doivent pas demander deux clics.
  useEffect(() => {
    const a = obtenirAudio()
    if (!a) return
    const suite = () => jouerLaSuite()
    const echec = () => {
      // Une piste absente ou illisible n'interrompt pas les suivantes.
      fileRef.current = []
      setEnLecture(false)
    }
    a.addEventListener("ended", suite)
    a.addEventListener("error", echec)
    return () => {
      a.removeEventListener("ended", suite)
      a.removeEventListener("error", echec)
    }
  }, [obtenirAudio, jouerLaSuite])

  const jouer = useCallback(
    (liste: SegmentServi[]) => {
      if (!liste.length) return
      fileRef.current = liste.map((s) => s.url)
      jouerLaSuite()
    },
    [jouerLaSuite],
  )

  /* ── Déblocage iOS au premier geste ─────────────────────────────────────── */
  useEffect(() => {
    if (!actif) return
    const debloquer = () => {
      const a = obtenirAudio()
      // Ne jamais déranger une lecture en cours : le déblocage est un
      // préliminaire, pas une interruption.
      if (!a || fileRef.current.length || !a.paused) return
      try {
        a.src = SILENCE
        const p = a.play()
        if (p && typeof p.then === "function") {
          p.then(() => {
            a.pause()
            setBloquee(false)
          }).catch(() => {
            /* Le geste n'a pas suffi : le bouton du cockpit reste la porte. */
          })
        }
      } catch {
        /* rien à faire : le bouton reste la porte */
      }
    }
    // `once` : un seul déblocage, et il ne coûte rien au reste de la session.
    document.addEventListener("pointerdown", debloquer, { once: true, capture: true })
    document.addEventListener("keydown", debloquer, { once: true, capture: true })
    return () => {
      document.removeEventListener("pointerdown", debloquer, true)
      document.removeEventListener("keydown", debloquer, true)
    }
  }, [actif, obtenirAudio])

  /* ── Règle 2 : l'apprenant agit, la voix se tait ────────────────────────── */
  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return
    const taire = (e: Event) => {
      const cible = e.target as HTMLElement | null
      // Les commandes de la voix ne coupent pas la voix — sans quoi « rejouer »
      // s'arrêterait lui-même.
      if (cible && typeof cible.closest === "function" && cible.closest("[data-voix]")) return
      arreterRef.current()
    }
    zone.addEventListener("pointerdown", taire, true)
    zone.addEventListener("keydown", taire, true)
    return () => {
      zone.removeEventListener("pointerdown", taire, true)
      zone.removeEventListener("keydown", taire, true)
    }
    // `zoneRef.current` n'est peuplé qu'après le premier rendu : `disponible`
    // sert de déclencheur de ré-attachement, comme `remesurer` pour la zone de
    // travail.
  }, [zoneRef, disponible])

  /* ── Règle 1 et 5 : le démarrage, et ce qui l'interdit ──────────────────── */
  const demoEnCours = demonstration && !demoFinie
  const demoVaDemarrer = demonstrationAutomatique && !demonstration

  useEffect(() => {
    /* CHANGER D'ÉTAPE COUPE LA VOIX, TOUJOURS ET D'ABORD.
     *
     * C'est la première ligne de l'effet, avant toute condition : une consigne
     * qui continuerait de se lire sur l'étape suivante dirait le contraire de ce
     * que l'écran montre. Le nettoyage de démontage joue le même rôle à la
     * fermeture du chapitre. */
    arreterRef.current()
    if (!actif || coupee || !introVue || !etapeId) return
    if (!segments.length) return
    if (demoEnCours || demoVaDemarrer) return
    minuterieRef.current = window.setTimeout(() => {
      minuterieRef.current = null
      jouer(segments)
    }, DELAI_DEMARRAGE_MS)
    return () => {
      if (minuterieRef.current !== null) {
        window.clearTimeout(minuterieRef.current)
        minuterieRef.current = null
      }
    }
  }, [etapeId, actif, coupee, introVue, segments, demoEnCours, demoVaDemarrer, jouer])

  /**
   * L'indice se dévoile : on le lit.
   *
   * On surveille la BASCULE, jamais la valeur — même discipline que la fermeture
   * des panneaux au démarrage d'une démonstration. La référence est remise à
   * l'état de l'étape à chaque changement d'étape, sinon un indice déjà ouvert
   * sur l'étape précédente empêcherait toute lecture sur la suivante.
   */
  const aideVueRef = useRef(aideVisible)
  useEffect(() => {
    aideVueRef.current = aideVisible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapeId])
  useEffect(() => {
    const devoile = aideVisible && !aideVueRef.current
    aideVueRef.current = aideVisible
    if (!devoile) return
    if (!actif || coupee || !segmentsAide.length) return
    if (demonstration && !demoFinie) return
    jouer(segmentsAide)
  }, [aideVisible, actif, coupee, segmentsAide, demonstration, demoFinie, jouer])

  /** Au démontage — sortie de l'atelier, navigation, fin du chapitre. */
  useEffect(() => {
    return () => {
      const a = audioRef.current
      if (a) {
        a.pause()
        a.src = ""
      }
      fileRef.current = []
      if (minuterieRef.current !== null) window.clearTimeout(minuterieRef.current)
    }
  }, [])

  /* ── Règles 3 et 4 : les commandes ──────────────────────────────────────── */

  const rejouer = useCallback(() => {
    arreterRef.current()
    setBloquee(false)
    jouer(segments)
  }, [jouer, segments])

  const basculerCoupure = useCallback(() => {
    setCoupee((avant) => {
      const apres = !avant
      try {
        window.localStorage.setItem(CLE_MEMOIRE, apres ? "coupe" : "actif")
      } catch {
        /* le choix vaudra pour la session, faute de mieux */
      }
      if (apres) arreterRef.current()
      return apres
    })
  }, [])

  return {
    disponible,
    etapeSonore: segments.length > 0,
    enLecture,
    coupee,
    bloquee,
    rejouer,
    arreter,
    basculerCoupure,
  }
}
