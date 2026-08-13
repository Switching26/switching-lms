"use client"

/**
 * LA VOIX DES BULLES DE DÉMONSTRATION.
 *
 * Choix de Samuel du 13/08/2026 : les bulles parlent. Ce module est le canal
 * entre le manifeste audio et la démonstration — et il est délibérément séparé
 * de `useGuideVocal`, qui lit les consignes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI COMMANDE TOUT LE RESTE : LA DÉMONSTRATION N'ATTEND JAMAIS LA VOIX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * On ne fait pas attendre la fin d'une phrase pour enchaîner. Cinq façons, toutes
 * réelles, pour un son de ne jamais rendre la main : iOS refuse la lecture sans
 * geste, l'apprenant a coupé la voix, la piste manque, une règle a déclenché un
 * arrêt, le réseau met quatre secondes. Chacune figerait la démonstration — le
 * seul défaut que Samuel refuse (« aucune animation qui ne va pas au bout »).
 *
 * Le rythme est donc calculé D'AVANCE, à partir de la durée annoncée au
 * manifeste, et passé au calque comme un simple nombre (`GesteDemo.dureeBulleMs`).
 * Le calque ne sait même pas qu'une voix existe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INVARIANT : UNE BULLE PARLE SI ET SEULEMENT SI SA DURÉE A ÉTÉ IMPOSÉE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Les deux décisions — allonger l'affichage, et parler — sont prises au MÊME
 * moment, à la construction du plan, à partir de la MÊME donnée. Elles ne
 * peuvent donc pas diverger, et les deux défauts symétriques sont écartés par
 * construction :
 *
 *   · une bulle qui parle sans rythme adapté ⇒ phrase coupée en plein milieu ;
 *   · un rythme allongé sans voix ⇒ dix secondes d'écran figé, en silence.
 *
 * Il reste un cas résiduel, assumé et documenté : la lecture échoue AU MOMENT de
 * parler (piste 404, refus tardif). La bulle reste alors affichée plus longtemps
 * sans son. C'est une dégradation esthétique, jamais un gel — et les bulles
 * suivantes de la même séquence retombent au rythme normal (voir `echecRef`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN ÉLÉMENT AUDIO À PART, ET NON CELUI DU GUIDE VOCAL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `useGuideVocal` vit dans le CHÂSSIS, qui est un ENFANT du player ; or c'est le
 * player qui construit le plan et a besoin des durées. L'information descend,
 * elle ne remonte pas. Ce contexte est donc monté au-dessus des deux, dans
 * `SimulationChapter` — le parent unique des quatre applications, celui qui pose
 * déjà les couleurs.
 *
 * Deux éléments audio veulent dire deux déblocages iOS à obtenir : chacun pose
 * donc son propre écouteur de premier geste. Ils se débloquent au même geste,
 * indépendamment. C'est le prix — assumé — de ne pas toucher au guide vocal, la
 * pièce déjà prouvée au banc.
 *
 * Elles ne se superposent pas : le guide vocal refuse de démarrer tant qu'une
 * démonstration est en cours ou sur le point de démarrer.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { bullePour, type ManifesteVoix, type SegmentVoix } from "@/lib/simulation/voix"

/** Un segment tel que la route le sert : le manifeste plus l'adresse. */
type SegmentServi = SegmentVoix & { url: string }
type ManifesteServi = ManifesteVoix & { etapes: Record<string, SegmentServi[]> }

/**
 * Même clé que le guide vocal : couper la voix la coupe PARTOUT. Deux réglages
 * pour une même chose seraient incompréhensibles — l'apprenant coupe « la voix »,
 * pas « la voix des consignes ».
 */
const CLE_MEMOIRE = "lms-guide-vocal"

/** Le silence qui débloque l'élément audio sur iOS, embarqué en clair. */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA="

/**
 * MARGE APRÈS LA PHRASE.
 *
 * La bulle ne disparaît pas sur la dernière syllabe : il faut le temps de finir
 * de lire ce qui est écrit, et l'enchaînement immédiat donne une impression de
 * précipitation. Assez court pour ne pas peser sur une séquence de huit bulles.
 */
const MARGE_MS = 350

/**
 * PLAFOND D'AFFICHAGE D'UNE BULLE.
 *
 * Dix secondes d'écran immobile se lisent comme un blocage — c'est le risque
 * non technique du chantier (R9). Le vrai remède est dans le CONTENU : une bulle
 * qui dépasse doit être découpée à l'écriture. En attendant, ce plafond garantit
 * qu'aucune bulle ne fige l'écran, au prix d'une fin de phrase couverte par le
 * geste suivant sur les bulles trop longues — que `check-voix` signale.
 */
export const PLAFOND_BULLE_MS = 8000

type VoixDemo = {
  /**
   * Durée d'affichage imposée pour la bulle d'auteur de rang `rang`, en ms.
   * `null` ⇒ garder la formule d'origine, et ne pas parler.
   */
  dureeBulle: (etapeId: string | null | undefined, rang: number) => number | null
  /** Joue la bulle de rang `rang`. Sans effet si elle n'a pas de durée imposée. */
  jouerBulle: (etapeId: string | null | undefined, rang: number) => void
  /** Coupe net — changement d'étape, sortie de l'atelier, rejeu. */
  arreter: () => void
}

const Contexte = createContext<VoixDemo | null>(null)

/**
 * POSE LES DURÉES DE VOIX SUR UN PLAN DÉJÀ CONSTRUIT.
 *
 * Appelée par les quatre players, au moment exact où le plan est bâti — jamais
 * après. Le plan est mémoïsé et volontairement figé : le recalculer en pleine
 * séquence changerait la référence des gestes et relancerait la minuterie du
 * calque à zéro, ce qui fige la démonstration sur son premier geste. C'est un
 * défaut connu, documenté dans les quatre players.
 *
 * ⚠️ NEUTRE PAR CONSTRUCTION : sans contexte, sans manifeste, ou quand aucune
 * bulle de l'étape n'a de voix, le plan est rendu TEL QUEL — même objet, pas une
 * copie. C'est ce qui garantit que les chapitres sans voix, et les trois autres
 * applications, gardent exactement le rythme d'avant.
 */
export function avecDureesDeVoix<P extends { gestes: GestePourVoix[]; pas: string[] }>(
  plan: P,
  etapeId: string | null | undefined,
  voix: VoixDemo | null,
): P {
  if (!voix || !etapeId) return plan
  let touche = false
  const gestes = plan.gestes.map((g) => {
    if (typeof g.rangBulle !== "number") return g
    const ms = voix.dureeBulle(etapeId, g.rangBulle)
    if (ms === null) return g
    touche = true
    return { ...g, dureeBulleMs: ms }
  })
  return touche ? { ...plan, gestes } : plan
}

/**
 * Ce que cette fonction a besoin de savoir d'un geste, et rien de plus.
 *
 * Volontairement structurel plutôt qu'un import de `GesteDemo` : les quatre
 * players passent des plans de types voisins mais non identiques (Word retype
 * ses actions, PowerPoint passe par son adaptateur), et un type nominal
 * obligerait à des conversions dans trois d'entre eux.
 */
type GestePourVoix = { rangBulle?: number; dureeBulleMs?: number }

/**
 * `null` hors du fournisseur — aperçu admin monté seul, banc de test, rendu en
 * carte. Tous les appelants doivent le supporter : c'est ce qui garantit qu'un
 * atelier sans ce contexte se comporte exactement comme avant.
 */
export function useVoixDemo(): VoixDemo | null {
  return useContext(Contexte)
}

export function FournisseurVoixDemo({
  chapterId,
  actif,
  children,
}: {
  chapterId: string
  /** Aperçu admin, page de garde : rien ne se charge, rien ne se joue. */
  actif: boolean
  children: ReactNode
}) {
  const [manifeste, setManifeste] = useState<ManifesteServi | null>(null)
  const [coupee, setCoupee] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  /**
   * UNE LECTURE A ÉCHOUÉ DANS CETTE SÉQUENCE.
   *
   * On cesse alors d'allonger les bulles suivantes : mieux vaut un rythme normal
   * sans voix qu'une suite d'écrans figés en silence. Remis à zéro au démarrage
   * d'une nouvelle séquence (`arreter`), donc un rejeu retente.
   */
  const echecRef = useRef(false)

  /* ── Le choix de l'apprenant, partagé avec le guide vocal ────────────────── */
  useEffect(() => {
    const lire = () => {
      try {
        setCoupee(window.localStorage.getItem(CLE_MEMOIRE) === "coupe")
      } catch {
        /* stockage refusé : la voix reste active, faute de mieux */
      }
    }
    lire()
    // Le bouton du cockpit écrit dans `localStorage` depuis le châssis, qui est
    // un enfant : sans cette écoute, couper la voix laisserait les bulles
    // continuer de parler jusqu'au rechargement.
    window.addEventListener("storage", lire)
    return () => window.removeEventListener("storage", lire)
  }, [])

  /* ── Le manifeste du chapitre ───────────────────────────────────────────── */
  useEffect(() => {
    if (!actif || !chapterId) return
    let annule = false
    fetch(`/api/simulations/${chapterId}/voix`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (annule || !json || typeof json !== "object") return
        setManifeste({ version: 1, etapes: (json.etapes ?? {}) as Record<string, SegmentServi[]> })
      })
      .catch(() => {
        /* Pas de voix, pas d'atelier cassé : les bulles gardent leur rythme. */
      })
    return () => {
      annule = true
    }
  }, [chapterId, actif])

  const obtenirAudio = useCallback((): HTMLAudioElement | null => {
    if (typeof window === "undefined") return null
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = "none"
      audioRef.current = a
    }
    return audioRef.current
  }, [])

  /* ── Déblocage iOS au premier geste ─────────────────────────────────────── */
  useEffect(() => {
    if (!actif) return
    const debloquer = () => {
      const a = obtenirAudio()
      if (!a || !a.paused) return
      try {
        a.src = SILENCE
        const p = a.play()
        if (p && typeof p.then === "function") p.then(() => a.pause()).catch(() => {})
      } catch {
        /* le geste n'a pas suffi : les bulles resteront muettes, pas figées */
      }
    }
    document.addEventListener("pointerdown", debloquer, { once: true, capture: true })
    document.addEventListener("keydown", debloquer, { once: true, capture: true })
    return () => {
      document.removeEventListener("pointerdown", debloquer, true)
      document.removeEventListener("keydown", debloquer, true)
    }
  }, [actif, obtenirAudio])

  const arreter = useCallback(() => {
    echecRef.current = false
    const a = audioRef.current
    if (!a) return
    a.pause()
    try {
      a.currentTime = 0
    } catch {
      /* piste pas encore chargée : rien à rembobiner */
    }
  }, [])

  /**
   * La durée imposée, et la décision de parler : UNE SEULE ET MÊME LECTURE.
   *
   * ⚠️ STABLE. Le plan de démonstration est mémoïsé et volontairement figé : une
   * nouvelle référence relancerait la minuterie du calque à zéro et figerait la
   * démonstration sur son premier geste (défaut documenté dans les quatre
   * players). Cette fonction ne dépend que du manifeste et du choix de coupure.
   */
  const dureeBulle = useCallback(
    (etapeId: string | null | undefined, rang: number): number | null => {
      // COUPÉE ⇒ RIEN NE CHANGE, PAS MÊME LE RYTHME. Le choix est connu avant le
      // démarrage : allonger une bulle qui restera muette n'aurait aucun sens.
      if (!actif || coupee || echecRef.current) return null
      const seg = bullePour(manifeste, etapeId, rang)
      if (!seg?.secondes || seg.secondes <= 0) return null
      const ms = Math.round(seg.secondes * 1000) + MARGE_MS
      return Math.min(PLAFOND_BULLE_MS, ms)
    },
    [manifeste, coupee, actif],
  )

  const jouerBulle = useCallback(
    (etapeId: string | null | undefined, rang: number) => {
      if (!actif || coupee) return
      const seg = bullePour(manifeste, etapeId, rang)
      // Pas de durée annoncée ⇒ le plan n'a pas été allongé ⇒ on ne parle pas.
      // C'est l'invariant du module, et il se vérifie ici, une seconde fois.
      if (!seg?.secondes || seg.secondes <= 0) return
      const url = (seg as SegmentServi).url
      if (!url) return
      const a = obtenirAudio()
      if (!a) return
      try {
        a.pause()
        a.src = url
        a.currentTime = 0
        const p = a.play()
        if (p && typeof p.then === "function") {
          p.catch(() => {
            /* Refus d'autoplay ou piste absente : on cesse d'allonger les bulles
               suivantes. Dégrader vers le rythme d'avant, jamais figer. */
            echecRef.current = true
          })
        }
      } catch {
        echecRef.current = true
      }
    },
    [manifeste, coupee, actif, obtenirAudio],
  )

  /** Au démontage — sortie de l'atelier, navigation, fin du chapitre. */
  useEffect(() => {
    return () => {
      const a = audioRef.current
      if (a) {
        a.pause()
        a.src = ""
      }
    }
  }, [])

  const valeur = useMemo<VoixDemo>(
    () => ({ dureeBulle, jouerBulle, arreter }),
    [dureeBulle, jouerBulle, arreter],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}
