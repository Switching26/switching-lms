"use client"

/**
 * Le guide interactif de la formation.
 *
 * Une couche transversale posée sur le cockpit réel : le projecteur désigne le
 * vrai bouton, la carte explique, et l'apprenant fait le geste sur la vraie
 * interface. Ni page d'aide, ni module supplémentaire — un module d'accueil
 * ferait de chaque apprenant quelqu'un à 1/28 dès la connexion et fausserait
 * les 246 chapitres, le pourcentage de progression et le compteur de passages.
 *
 * IL LIT, IL NE PILOTE PAS
 * Ce composant ne reçoit aucun setter du player : ni `setPanneau`, ni `goNext`,
 * ni la moindre fonction métier. Il ne peut donc pas incrémenter une
 * progression, envoyer une réponse d'évaluation ou écrire une note : il n'en a
 * pas le moyen. Il observe le DOM du cockpit par un `MutationObserver` et
 * reconnaît que le geste a été fait. `scripts/check-guide-formation.ts` vérifie
 * qu'aucun `fetch`, `click()` ou `dispatchEvent` ne s'y glisse.
 *
 * CLAVIER
 * Les raccourcis (Échap, flèches) ne s'appliquent QUE si le focus est dans la
 * carte. La feuille de calcul se pilote elle-même aux flèches et à Échap : les
 * capturer globalement volerait les gestes de l'apprenant au moment exact où le
 * guide lui demande d'en faire un.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ETAPES_GUIDE,
  cleGuidePour,
  etapesDisponibles,
  type EtapeGuide,
} from "@/lib/simulation/guide-formation"

/* Couleurs du cockpit, reprises telles quelles de `SimulationPlayer.tsx` et
   `DemonstrationGeste.tsx`. Le guide ne crée aucune couleur à lui. */
const ENCRE = "#171a18"
const COCKPIT = "#10201B"
const VERT = "#107C41"
const VERT_F = "#0b5c30"
const VERT_PALE = "#E7F3EB"
const VERT_BORD = "#BFE3CD"
const LECT = "#3E5A67"
const LECT_PALE = "#E8F0F3"
const SEG_OK = "#4ED08A"

const GLISSE = "cubic-bezier(.32,.72,0,1)"
const RESSORT = "cubic-bezier(.2,.9,.2,1)"

/** Largeur en dessous de laquelle la carte devient une feuille. */
const SEUIL_ETROIT = 640

type Rect = { left: number; top: number; width: number; height: number }

const memeRect = (a: Rect, b: Rect) =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height

type Props = {
  ouvert: boolean
  onOuvrir: () => void
  onFermer: () => void
  /** Conteneur du cockpit : repère de positionnement et racine d'observation. */
  conteneur: React.RefObject<HTMLDivElement | null>
  /** Bouton qui ouvre le guide : le focus lui revient à la fermeture. */
  declencheur?: React.RefObject<HTMLButtonElement | null>
  /** Identifiant apprenant, pour se souvenir de la première visite. */
  cleGuide?: string | null
  /** L'aperçu admin ne propose pas le guide de lui-même. */
  sansPremiereVisite?: boolean
}

export default function GuideFormation({
  ouvert,
  onOuvrir,
  onFermer,
  conteneur,
  declencheur,
  cleGuide,
  sansPremiereVisite = false,
}: Props) {
  const [index, setIndex] = useState(0)
  const [vues, setVues] = useState<Set<string>>(() => new Set())
  const [faites, setFaites] = useState<Set<string>>(() => new Set())
  const [sommaireOuvert, setSommaireOuvert] = useState(false)
  const [accroche, setAccroche] = useState(false)
  /** null = le placement décide, true = replié à la demande, false = déplié. */
  const [plierManuel, setPlierManuel] = useState<boolean | null>(null)
  const [compact, setCompact] = useState(false)
  const [etroit, setEtroit] = useState(false)
  const [trou, setTrou] = useState<Rect | null>(null)
  /** Le corps déborde-t-il ? Sert à annoncer qu'il reste du texte plus bas. */
  const [deborde, setDeborde] = useState(false)
  const [carte, setCarte] = useState<{ left: number; top: number } | null>(null)

  const carteRef = useRef<HTMLDivElement | null>(null)
  const corpsRef = useRef<HTMLDivElement | null>(null)
  /** Élément qui avait le focus avant l'ouverture, pour le lui rendre après. */
  const focusAvantRef = useRef<HTMLElement | null>(null)

  /**
   * Étapes réellement jouables. Résolues à l'ouverture, pas au montage : le
   * cockpit ne rend « Leçons », « Notes » ou « Ressource pédagogique
   * téléchargeable » que si la page les a fournis, et l'intersection
   * « chapitres de simulation × documents » est vide en production.
   */
  const [etapes, setEtapes] = useState<EtapeGuide[]>(ETAPES_GUIDE)
  useEffect(() => {
    if (!ouvert) return
    setEtapes(etapesDisponibles(conteneur.current))
  }, [ouvert, conteneur])

  const etape = etapes[Math.min(index, Math.max(etapes.length - 1, 0))] ?? etapes[0]
  const dernier = index >= etapes.length - 1

  /* ── Première visite ──────────────────────────────────────────────────── */
  const cle = useMemo(() => cleGuidePour(cleGuide), [cleGuide])

  useEffect(() => {
    if (sansPremiereVisite) return
    // Lu dans un effet, jamais au rendu : pas de désaccord serveur/client.
    let dejaVu = true
    try {
      dejaVu = window.localStorage.getItem(cle) !== null
    } catch {
      // Mode privé ou quota plein : le guide marche, il ne se souvient pas.
      dejaVu = true
    }
    if (!dejaVu) setAccroche(true)
  }, [cle, sansPremiereVisite])

  const marquerVu = useCallback(() => {
    try {
      window.localStorage.setItem(cle, String(Date.now()))
    } catch {
      /* sans mémoire, le guide reste utilisable */
    }
  }, [cle])

  useEffect(() => {
    if (ouvert) {
      setAccroche(false)
      marquerVu()
    }
  }, [ouvert, marquerVu])

  /**
   * Focus à l'ouverture et à la fermeture.
   *
   * PAS DE PIÈGE À FOCUS, et c'est délibéré : le guide demande d'agir SUR le
   * cockpit — ouvrir un panneau, saisir dans la feuille. Enfermer le focus dans
   * la carte rendrait le « à vous d'essayer » injouable au clavier.
   *
   * On se contente donc des deux gestes qui comptent : donner le focus à la
   * carte à l'ouverture, pour que son nom et son contenu soient annoncés ; le
   * rendre à l'élément déclencheur à la fermeture, pour ne pas laisser le
   * clavier au début du document.
   */
  useEffect(() => {
    if (!ouvert) return
    const actif = document.activeElement
    focusAvantRef.current = actif instanceof HTMLElement ? actif : null
    // Après le premier placement, sinon le navigateur fait défiler vers un
    // élément encore posé à ses coordonnées de départ.
    const t = window.setTimeout(() => carteRef.current?.focus({ preventScroll: true }), 0)
    return () => {
      window.clearTimeout(t)
      const retour = declencheur?.current ?? focusAvantRef.current
      // Ne rendre le focus que si la cible est toujours là ET que le focus n'a
      // pas été repris entre-temps par l'apprenant (feuille, panneau, champ).
      const courant = document.activeElement
      const dansLaCarte = courant instanceof Node && carteRef.current?.contains(courant)
      if (retour && retour.isConnected && (dansLaCarte || courant === document.body)) {
        retour.focus({ preventScroll: true })
      }
    }
  }, [ouvert, declencheur])

  /**
   * Signale qu'une surcouche plein écran est ouverte.
   *
   * L'invitation à installer l'application est montée au niveau racine en
   * `z-40`, alors que l'atelier vit dans un portail `z-index: 30` : elle passe
   * donc devant la carte du guide et ses commandes. `globals.css` la retire
   * tant que cet attribut est posé. Ce n'est pas une mutation métier — juste un
   * état d'interface, retiré au démontage comme à la fermeture.
   */
  useEffect(() => {
    if (!ouvert) return
    const racineDoc = document.documentElement
    racineDoc.setAttribute("data-surcouche", "guide")
    return () => racineDoc.removeAttribute("data-surcouche")
  }, [ouvert])

  /* ── Suivi de la largeur du cockpit ───────────────────────────────────── */
  useEffect(() => {
    const el = conteneur.current
    if (!el) return
    const mesurer = () => setEtroit(el.getBoundingClientRect().width < SEUIL_ETROIT)
    mesurer()
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [conteneur, ouvert])

  /* ── Reconnaissance du geste ──────────────────────────────────────────── */
  const verifier = useCallback(() => {
    const racine = conteneur.current
    if (!racine || !etape) return
    if (!etape.valide) return
    if (faites.has(etape.id)) return
    if (etape.valide(racine)) {
      setFaites((s) => new Set(s).add(etape.id))
      // Le geste est fait : la carte se redéploie pour montrer le retour. C'est
      // le pendant du repli — on rend le contexte dès qu'il ne gêne plus.
      setPlierManuel(false)
    }
  }, [conteneur, etape, faites])

  useEffect(() => {
    if (!ouvert) return
    const racine = conteneur.current
    if (!racine) return
    verifier()
    // Lecture seule : l'observateur ne fait que déclencher un prédicat DOM.
    const mo = new MutationObserver(() => verifier())
    mo.observe(racine, { attributes: true, childList: true, subtree: true })
    return () => mo.disconnect()
  }, [ouvert, conteneur, verifier])

  /* ── Placement ────────────────────────────────────────────────────────── */
  const rectRelatif = useCallback(
    (selecteur: string | null | undefined): Rect | null => {
      const racine = conteneur.current
      if (!racine || !selecteur) return null
      const el = racine.querySelector(selecteur) as HTMLElement | null
      if (!el || el.offsetParent === null) return null
      const b = el.getBoundingClientRect()
      if (b.width <= 0 || b.height <= 0) return null
      const r = racine.getBoundingClientRect()
      // Le défilement éventuel du conteneur fait partie du repère : sans lui, un
      // conteneur scrollé donnerait une position relative fausse, et le
      // projecteur se décalerait un peu plus à chaque replacement.
      return {
        left: b.left - r.left + racine.scrollLeft,
        top: b.top - r.top + racine.scrollTop,
        width: b.width,
        height: b.height,
      }
    },
    [conteneur],
  )

  /**
   * Poseurs IDEMPOTENTS.
   *
   * `placer()` tourne à chaque replacement, y compris sur minuterie. S'il
   * réécrit systématiquement l'état, chaque passage provoque un rendu, donc un
   * nouveau placement : sur écran étroit, où `compact` est un RÉSULTAT du
   * calcul, la boucle devenait infinie (React #185, mesuré en 390 × 844).
   * Ne rien écrire quand rien ne change coupe la boucle à la racine.
   */
  const poserCarte = useCallback((left: number, top: number) => {
    setCarte((c) => (c && c.left === left && c.top === top ? c : { left, top }))
  }, [])
  const poserCompact = useCallback((v: boolean) => {
    setCompact((c) => (c === v ? c : v))
  }, [])

  const placer = useCallback(() => {
    const racine = conteneur.current
    const el = carteRef.current
    if (!racine || !el || !etape) return

    const cadre = racine.getBoundingClientRect()
    const marge = etroit ? 8 : 14

    const cible = rectRelatif(etape.cible)
    if (cible) {
      const p = etape.pad ?? 6
      const t = {
        left: cible.left - p,
        top: cible.top - p,
        width: cible.width + p * 2,
        height: cible.height + p * 2,
      }
      setTrou((v) => (v && memeRect(v, t) ? v : t))
    } else {
      setTrou((v) => (v === null ? v : null))
    }

    /* Zones que la carte n'a pas le droit de recouvrir. Sur un écran étroit, la
       carte et les commandes de l'atelier se disputent le même bas d'écran :
       « Montrez-moi », « Un indice » et « Passer la question » vivent dans la
       bande consigne. Une feuille posée en bas par principe recouvrait
       exactement ce que le guide demandait de toucher. */
    const zones: Rect[] = []
    // Une zone hors du cadre ne gêne personne : l'ajouter fausserait le calcul.
    const ajouter = (r: Rect | null) => {
      if (!r) return
      if (r.top + r.height < 0 || r.top > cadre.height) return
      zones.push(r)
    }
    ajouter(rectRelatif(etape.toucher ?? etape.cible))
    if (etape.toucher) ajouter(cible)
    ;(etape.eviter ?? []).forEach((s) => ajouter(rectRelatif(s)))
    // Un panneau ouvert prend toute la hauteur : la carte doit s'en écarter.
    racine.querySelectorAll("aside[aria-hidden='false']").forEach((n) => {
      const b = (n as HTMLElement).getBoundingClientRect()
      if (b.height > 0) {
        zones.push({ left: b.left - cadre.left, top: b.top - cadre.top, width: b.width, height: b.height })
      }
    })

    const cout = (top: number, h: number) =>
      zones.reduce((s, z) => s + Math.max(0, Math.min(top + h, z.top + z.height) - Math.max(top, z.top)), 0)

    if (etroit) {
      /* Écran étroit : la carte est une feuille, en haut ou en bas, pleine ou
         repliée. On essaie quatre dispositions dans l'ordre de préférence et on
         garde la PREMIÈRE qui ne recouvre rien ; sinon la moins gênante, en
         version repliée pour que ce qui reste couvert soit le plus petit. */
      const hautMin = 44 + marge
      const bas = cadre.height - marge

      const options = (replie: boolean) => {
        el.classList.toggle("guide-compact", replie)
        const h = el.offsetHeight
        return [bas - h, hautMin].map((t) => {
          const top = Math.max(hautMin, Math.min(t, bas - h))
          return { replie, top, cout: cout(top, h) }
        })
      }

      let liste: { replie: boolean; top: number; cout: number }[]
      if (plierManuel === true) liste = options(true)
      else if (plierManuel === false) liste = options(false)
      else liste = [...options(false), ...options(true)]

      const gagnant = liste.find((o) => o.cout === 0) ?? [...liste].sort((a, b) => a.cout - b.cout)[0]
      el.classList.toggle("guide-compact", gagnant.replie)
      poserCompact(gagnant.replie)
      poserCarte(marge, Math.round(gagnant.top))
      return
    }

    el.classList.remove("guide-compact")
    poserCompact(false)

    const cw = el.offsetWidth || 384
    const ch = el.offsetHeight || 320
    let x: number
    let y: number

    if (!cible) {
      x = (cadre.width - cw) / 2
      y = (cadre.height - ch) / 2
    } else {
      const dessous = cible.top + cible.height + marge
      const dessus = cible.top - ch - marge
      const enHaut =
        etape.placement === "haut" ||
        (etape.placement !== "bas" && dessous + ch > cadre.height && dessus > 0)
      if (enHaut) {
        /* Cible large en bas — la bande consigne : centrer la carte dessus
           masquait l'énoncé, dont le texte est aligné à gauche. On la range à
           droite, la consigne reste lisible à côté du contrôle éclairé. */
        x =
          cible.width > cadre.width * 0.55
            ? cible.left + cible.width - cw
            : cible.left + cible.width / 2 - cw / 2
        y = dessus
      } else {
        x = cible.left + cible.width / 2 - cw / 2
        y = dessous
      }
    }
    x = Math.max(marge, Math.min(x, cadre.width - cw - marge))
    y = Math.max(marge, Math.min(y, cadre.height - ch - marge))
    poserCarte(Math.round(x), Math.round(y))
  }, [conteneur, etape, etroit, plierManuel, rectRelatif, poserCarte, poserCompact])

  /* Le texte plafonné se coupait au milieu d'un mot, sans que rien n'annonce la
     suite — même défaut que la bande consigne du player, corrigé de la même
     façon : un dégradé qui dit « ça continue ». */
  const mesurerDebordement = useCallback(() => {
    const el = corpsRef.current
    if (!el) return
    const trop = el.scrollHeight - el.clientHeight > 4 && el.scrollTop + el.clientHeight < el.scrollHeight - 4
    setDeborde((v) => (v === trop ? v : trop))
  }, [])

  // `compact` est délibérément ABSENT des dépendances : il est produit par
  // `placer()`, l'y remettre ferait boucler l'effet sur son propre résultat.
  useLayoutEffect(() => {
    if (!ouvert) return
    placer()
  }, [ouvert, index, etapes, plierManuel, etroit, placer])

  useEffect(() => {
    if (!ouvert) return
    const relancer = () => {
      placer()
      mesurerDebordement()
    }
    window.addEventListener("resize", relancer)
    const racine = conteneur.current
    racine?.addEventListener("scroll", relancer, true)
    const t = window.setInterval(relancer, 500)
    const corps = corpsRef.current
    corps?.addEventListener("scroll", mesurerDebordement, { passive: true })
    return () => {
      window.removeEventListener("resize", relancer)
      racine?.removeEventListener("scroll", relancer, true)
      corps?.removeEventListener("scroll", mesurerDebordement)
      window.clearInterval(t)
    }
  }, [ouvert, conteneur, placer, mesurerDebordement])

  /* ── Navigation ───────────────────────────────────────────────────────── */
  const aller = useCallback(
    (n: number) => {
      if (n < 0 || n >= etapes.length) return
      setIndex(n)
      setPlierManuel(null)
      setVues((s) => {
        const c = new Set(s)
        const e = etapes[n]
        if (e) c.add(e.id)
        return c
      })
      if (corpsRef.current) corpsRef.current.scrollTop = 0
    },
    [etapes],
  )

  useEffect(() => {
    if (ouvert && etape) setVues((s) => (s.has(etape.id) ? s : new Set(s).add(etape.id)))
  }, [ouvert, etape])

  useEffect(() => {
    if (index > etapes.length - 1) setIndex(Math.max(etapes.length - 1, 0))
  }, [etapes, index])

  const fermer = useCallback(() => {
    setSommaireOuvert(false)
    onFermer()
  }, [onFermer])

  /* Raccourcis limités à la carte : la feuille de calcul se pilote elle-même
     aux flèches et à Échap. */
  const surTouche = (e: React.KeyboardEvent) => {
    const cible = e.target as HTMLElement
    if (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA") return
    if (e.key === "Escape") {
      e.stopPropagation()
      if (sommaireOuvert) setSommaireOuvert(false)
      else fermer()
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      aller(index + 1)
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      aller(index - 1)
    }
  }

  if (!etape) return null

  const faite = faites.has(etape.id)

  /* ── Accroche de première visite ──────────────────────────────────────── */
  if (!ouvert) {
    if (!accroche) return null
    return (
      <div
        data-guide="accroche"
        className="absolute rounded-2xl px-3.5 py-3 text-white"
        style={{
          top: 52,
          right: 10,
          zIndex: 92,
          maxWidth: 260,
          background: ENCRE,
          fontSize: 12.5,
          lineHeight: 1.5,
          boxShadow: "0 14px 40px rgba(0,0,0,.4)",
          animation: `guide-entre .4s ${RESSORT} both`,
        }}
      >
        <StyleGuide />
        <b className="mb-1 block" style={{ fontSize: 13 }}>
          Première fois ici&nbsp;?
        </b>
        Le guide fait le tour de l’atelier en quelques étapes courtes, et reste accessible ensuite
        depuis le bouton <b>Guide</b>.
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            data-control="guide-accroche-oui"
            onClick={onOuvrir}
            className="guide-focus flex-1 rounded-lg font-bold"
            style={{ background: SEG_OK, color: "#062418", fontSize: 12, minHeight: 44, padding: "0 12px" }}
          >
            Découvrir l’atelier
          </button>
          <button
            type="button"
            data-control="guide-accroche-non"
            onClick={() => {
              setAccroche(false)
              marquerVu()
            }}
            className="guide-focus rounded-lg font-bold"
            style={{ background: "rgba(255,255,255,.13)", fontSize: 12, minHeight: 44, padding: "0 12px" }}
          >
            Plus tard
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <StyleGuide />

      {/* Voile. `pointer-events: none` : l'atelier reste entièrement manipulable
          pendant le guide, condition pour que « à vous d'essayer » veuille dire
          quelque chose. L'assombrissement est un signal, pas une barrière. */}
      <div
        aria-hidden
        data-guide="voile"
        className="absolute inset-0"
        style={{ zIndex: 90, pointerEvents: "none" }}
      >
        <div
          data-guide="projecteur"
          style={{
            position: "absolute",
            left: trou ? trou.left : "50%",
            top: trou ? trou.top : "50%",
            width: trou ? trou.width : 2,
            height: trou ? trou.height : 2,
            borderRadius: 12,
            boxShadow: trou
              ? "0 0 0 9999px rgba(8,16,13,.62), inset 0 0 0 2px rgba(255,255,255,.85)"
              : "0 0 0 9999px rgba(8,16,13,.7)",
            transition: `left .42s ${GLISSE}, top .42s ${GLISSE}, width .42s ${GLISSE}, height .42s ${GLISSE}`,
          }}
        >
          {trou && <span className="guide-respire" aria-hidden />}
        </div>
      </div>

      {/* Carte */}
      <div
        ref={carteRef}
        role="dialog"
        tabIndex={-1}
        aria-labelledby="guide-titre"
        // En mode replié, `#guide-texte` n'est pas rendu : pointer un nœud absent
        // laisserait le dialogue sans description pour un lecteur d'écran. La
        // tâche, elle, est toujours là.
        aria-describedby={compact ? "guide-tache" : "guide-texte"}
        data-guide="carte"
        onKeyDown={surTouche}
        className="absolute flex flex-col overflow-hidden bg-white"
        style={{
          zIndex: 91,
          left: carte?.left ?? 14,
          top: carte?.top ?? 14,
          width: etroit ? undefined : "min(384px, calc(100% - 28px))",
          right: etroit ? 8 : undefined,
          borderRadius: etroit ? 20 : 18,
          maxHeight: compact ? undefined : etroit ? "min(52%, 420px)" : "min(560px, calc(100% - 96px))",
          boxShadow: "0 22px 60px rgba(0,0,0,.42)",
          animation: `guide-entre .34s ${RESSORT} both`,
        }}
      >
        {/* En-tête */}
        <div
          className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3.5 py-2.5"
        >
          <span
            aria-hidden
            className="flex flex-shrink-0 items-center justify-center rounded-full font-extrabold tabular-nums"
            style={{ width: 26, height: 26, background: VERT_PALE, color: VERT_F, fontSize: 11.5 }}
          >
            {index + 1}
          </span>
          <h2
            id="guide-titre"
            className="min-w-0 flex-1 font-bold leading-tight"
            style={{ fontSize: etroit ? 13.5 : 14, margin: 0 }}
          >
            {etape.titre}
          </h2>
          {etroit && (
            <BoutonTete
              id="guide-plier"
              actif={false}
              onClick={() => setPlierManuel(!compact)}
              label={compact ? "Déplier le guide" : "Replier le guide"}
              expanded={!compact}
              controls="guide-corps"
            >
              <span style={{ display: "block", transform: compact ? "rotate(180deg)" : undefined, transition: "transform .25s" }}>
                ⌄
              </span>
            </BoutonTete>
          )}
          <BoutonTete
            id="guide-sommaire"
            actif={sommaireOuvert}
            onClick={() => setSommaireOuvert((v) => !v)}
            label="Sommaire du guide"
            expanded={sommaireOuvert}
            controls="guide-liste"
          >
            ☰
          </BoutonTete>
          <BoutonTete id="guide-fermer" actif={false} onClick={fermer} label="Fermer le guide">
            ✕
          </BoutonTete>
        </div>

        {/* Sommaire */}
        {sommaireOuvert && (
          <div
            id="guide-liste"
            role="list"
            className="flex-shrink-0 overflow-y-auto border-b border-border bg-warm-50 p-2"
            style={{ maxHeight: 230, animation: `guide-entre .24s ${RESSORT} both` }}
          >
            {etapes.map((e, i) => (
              <button
                key={e.id}
                type="button"
                role="listitem"
                data-control="guide-sommaire-ligne"
                aria-current={i === index}
                onClick={() => {
                  aller(i)
                  setSommaireOuvert(false)
                }}
                className="guide-focus flex w-full items-center gap-2.5 rounded-lg px-2.5 text-left"
                style={{
                  minHeight: 44,
                  fontSize: 12.5,
                  color: i === index ? "#111827" : "#374151",
                  fontWeight: i === index ? 700 : 400,
                  background: i === index ? "#fff" : undefined,
                  boxShadow: i === index ? "0 1px 4px rgba(0,0,0,.06)" : undefined,
                }}
              >
                <span
                  aria-hidden
                  className="flex flex-shrink-0 items-center justify-center rounded-full font-extrabold tabular-nums"
                  style={{
                    width: 20,
                    height: 20,
                    fontSize: 10.5,
                    background: faites.has(e.id) ? VERT : "#e8e2d8",
                    color: faites.has(e.id) ? "#fff" : "#7d6e5e",
                  }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.titre}</span>
              </button>
            ))}
          </div>
        )}

        {/* Corps */}
        <div
          id="guide-corps"
          ref={corpsRef}
          className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-1 pt-3"
          style={compact ? { maxHeight: 128 } : undefined}
        >
          <div aria-live="polite" aria-atomic="true">
            {!compact && (
              <>
                <p
                  id="guide-texte"
                  className="mb-2.5 text-ink-70"
                  style={{ fontSize: 13.5, lineHeight: 1.55, margin: "0 0 10px" }}
                  dangerouslySetInnerHTML={{ __html: etape.texte }}
                />
                <div
                  className="mb-2.5 flex gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: LECT_PALE, color: LECT, fontSize: 12.5, lineHeight: 1.5 }}
                >
                  <span aria-hidden style={{ flexShrink: 0 }}>
                    ◆
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: etape.retenir }} />
                </div>
              </>
            )}

            <div
              className="mb-2.5 rounded-xl px-3 py-2.5"
              style={{
                background: faite ? "#EAF7EF" : VERT_PALE,
                border: `1px ${faite ? "solid" : "dashed"} ${faite ? VERT : VERT_BORD}`,
                transition: "background-color .3s ease, border-color .3s ease",
              }}
            >
              <span
                className="mb-1.5 flex items-center gap-2 font-extrabold uppercase"
                style={{ fontSize: 10.5, letterSpacing: ".07em", color: VERT_F }}
              >
                <span
                  aria-hidden
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 17,
                    height: 17,
                    flexShrink: 0,
                    fontSize: 10,
                    color: "#fff",
                    background: faite ? VERT : "#fff",
                    boxShadow: `inset 0 0 0 2px ${faite ? VERT : VERT_BORD}`,
                    transition: `background-color .3s ${RESSORT}`,
                  }}
                >
                  ✓
                </span>
                {etape.valide ? "À vous d’essayer" : "À retenir"}
              </span>
              <p
                id="guide-tache"
                style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#0C5B31" }}
                dangerouslySetInnerHTML={{ __html: etape.tache }}
              />
              {faite && (
                <p
                  data-guide="reussite"
                  style={{ margin: "7px 0 0", fontSize: 12.5, fontWeight: 700, color: VERT_F, animation: `guide-entre .3s ${RESSORT} both` }}
                >
                  <span aria-hidden>✓ </span>
                  {etape.reussite}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Pied */}
        <div className="relative flex flex-shrink-0 items-center gap-2 border-t border-border bg-warm-50 px-3.5 py-2">
          {deborde && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0"
              style={{
                bottom: "100%",
                height: 34,
                background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,.8) 55%, #fff 100%)",
              }}
            />
          )}
          {!compact && (
            <div className="flex min-w-0 flex-1 flex-wrap" role="tablist" aria-label="Étapes du guide">
              {etapes.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  role="tab"
                  data-control="guide-pastille"
                  aria-selected={i === index}
                  aria-label={`Étape ${i + 1} sur ${etapes.length} — ${e.titre}`}
                  onClick={() => aller(i)}
                  className="guide-focus flex flex-shrink-0 items-center justify-center"
                  style={{ width: 18, height: 44, padding: 0, background: "none" }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      /* UNE SEULE propriété de fond.
                         `background` (raccourci) suivi de `backgroundColor`
                         (longhand) dans le même objet de style : React
                         sérialise les deux dans l'ordre, et un `backgroundColor`
                         à `undefined` ANNULE la couleur posée par le raccourci.
                         Huit pastilles sur neuf étaient transparentes, et le
                         guide paraissait n'avoir qu'une étape. */
                      backgroundColor:
                        i === index
                          ? "#111827"
                          : faites.has(e.id)
                            ? VERT
                            : vues.has(e.id)
                              ? "#9a8b78"
                              : "#cfc5b8",
                      transform: i === index ? "scale(1.5)" : undefined,
                      transition: `background-color .25s ease, transform .25s ${RESSORT}`,
                    }}
                  />
                </button>
              ))}
            </div>
          )}
          {compact && <span className="flex-1 text-[11.5px] text-warm-400 tabular-nums">{index + 1} / {etapes.length}</span>}
          <div className="flex flex-shrink-0 gap-1.5">
            <button
              type="button"
              data-control="guide-precedent"
              onClick={() => aller(index - 1)}
              disabled={index === 0}
              aria-label="Étape précédente du guide"
              className="guide-focus inline-flex items-center justify-center rounded-lg border font-bold"
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: "0 13px",
                fontSize: 12.5,
                borderColor: "#d4cbc0",
                color: "#374151",
                background: "#fff",
                opacity: index === 0 ? 0.4 : 1,
                cursor: index === 0 ? "not-allowed" : "pointer",
              }}
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              data-control="guide-suivant"
              onClick={() => (dernier ? fermer() : aller(index + 1))}
              className="guide-focus inline-flex items-center justify-center gap-1.5 rounded-lg font-bold text-white"
              style={{ minHeight: 44, padding: "0 15px", fontSize: 12.5, background: COCKPIT }}
            >
              {dernier ? "Terminer" : "Suivant"}
              <span aria-hidden>{dernier ? "✓" : "›"}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function BoutonTete({
  id,
  actif,
  onClick,
  label,
  expanded,
  controls,
  children,
}: {
  id: string
  actif: boolean
  onClick: () => void
  label: string
  expanded?: boolean
  controls?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-control={id}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls={controls}
      className="guide-focus flex flex-shrink-0 items-center justify-center rounded-xl"
      style={{
        width: 44,
        height: 44,
        fontSize: 14,
        background: actif ? VERT_PALE : "#faf8f5",
        color: actif ? VERT_F : "#7d6e5e",
      }}
    >
      {children}
    </button>
  )
}

/**
 * Styles embarqués.
 *
 * Même raison que dans `PanneauRessources` : les utilitaires `focus-visible:`
 * ne sont pas garantis dans la feuille compilée servie au banc, et le player
 * impose que toute nouveauté visuelle passe en style embarqué. Le mouvement
 * réduit est traité ici, une bonne fois pour toutes les animations du guide.
 */
function StyleGuide() {
  return (
    <style>{`
      .guide-focus:focus-visible { outline: 2px solid ${VERT}; outline-offset: 2px; border-radius: 10px; }
      @keyframes guide-entre { from { opacity: 0; transform: translateY(10px) scale(.97) } to { opacity: 1; transform: none } }
      @keyframes guide-respire { 0%,100% { opacity: .85; transform: scale(1) } 50% { opacity: .35; transform: scale(1.02) } }
      .guide-respire {
        position: absolute; inset: -4px; border-radius: 15px;
        box-shadow: 0 0 0 2px ${SEG_OK};
        animation: guide-respire 2.6s ease-in-out infinite;
      }
      [data-guide="carte"].guide-compact [data-guide="retenir"],
      [data-guide="carte"].guide-compact #guide-texte { display: none; }
      @media (prefers-reduced-motion: reduce) {
        [data-guide] , [data-guide] * {
          animation-duration: .001ms !important; animation-iteration-count: 1 !important;
          transition-duration: .001ms !important;
        }
        .guide-respire { animation: none; opacity: .85; }
      }
    `}</style>
  )
}
