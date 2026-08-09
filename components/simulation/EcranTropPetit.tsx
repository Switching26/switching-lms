"use client"

/**
 * Ce que l'apprenant voit à la place d'un atelier qu'il ne peut pas jouer.
 *
 * Il prend la place de la SURFACE, pas de la formation : le cockpit, le fil du
 * chapitre, le sommaire, les notes, la ressource à télécharger et les flèches
 * précédent / suivant restent exactement là où ils étaient. C'est pour cela que
 * ce composant se rend dans les enfants de `CadranFormation` et non dans le
 * portail plein cadre de `SimulationChapter` — ce dernier n'est tout
 * simplement pas monté quand l'écran est trop petit, donc aucun scénario n'est
 * chargé et aucun player ne démarre.
 *
 * ⚠️ Ne rien enregistrer d'ici. Pas de tentative ouverte, pas de progression,
 * pas de compteur d'erreurs : l'apprenant n'a rien joué. C'est exactement ce
 * que la dernière ligne de l'écran lui promet.
 */

import { useEffect, useLayoutEffect, useState } from "react"
import { verdictEcranAtelier, type ZoneAtelier, type VerdictEcran } from "@/lib/simulation/acces-ecran"
import {
  illustrationAtelier,
  normaliserAppAtelier,
  type FormeIllustration,
} from "@/lib/simulation/illustration-atelier"
import { useCadranActions } from "@/components/learner/CadranFormation"

/**
 * `useLayoutEffect` côté navigateur, `useEffect` au rendu serveur.
 *
 * La mesure DOIT tomber avant la peinture : c'est ce qui évite qu'un
 * simulateur s'affiche une image puis disparaisse. Au rendu serveur,
 * `useLayoutEffect` n'existe pas et React avertit — d'où l'échange.
 */
const useMesureAvantPeinture = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * Mesure la zone dont un atelier disposerait, en la MATÉRIALISANT.
 *
 * Une sonde vide est posée dans le document avec la géométrie exacte du portail
 * d'atelier (`SimulationChapter`) : sous la navigation du LMS, jusqu'en bas.
 * On lit sa boîte, on l'observe, on la retire.
 *
 * Pourquoi pas `window.innerWidth` / `innerHeight` :
 *  · la navigation et la bannière d'usurpation mordent sur la hauteur, et leurs
 *    tailles vivent dans des variables CSS que seule une vraie boîte résout ;
 *  · `innerHeight` bouge avec la barre d'adresse mobile alors que la zone, elle,
 *    ne bouge pas ;
 *  · au rendu serveur `window` n'existe pas.
 *
 * La sonde est posée sur `document.body` en direct, sans portail React : elle
 * n'affiche rien, elle n'a donc rien à faire dans l'arbre. Elle échappe ainsi
 * au `transform` résiduel de la page apprenant, qui capture tout `position:
 * fixed` descendant — le piège qui avait fait échouer le mode immersif.
 */
export function useZoneAtelier(actif: boolean): ZoneAtelier | null {
  const [zone, setZone] = useState<ZoneAtelier | null>(null)

  useMesureAvantPeinture(() => {
    /*
     * Hors chapitre d'atelier, on ne mesure RIEN.
     *
     * Une vidéo, un support PDF ou un questionnaire n'ont que faire de la
     * taille de l'écran : leur poser une sonde et un `ResizeObserver` ferait
     * payer à toutes les formations classiques le prix d'une règle qui ne les
     * concerne pas.
     *
     * La mesure est aussi OUBLIÉE en sortant : la garder ferait décider le
     * prochain atelier sur une taille périmée — celle d'avant une rotation ou
     * un redimensionnement survenu entre-temps. Le test évite la boucle de
     * rendu quand elle est déjà nulle.
     */
    if (!actif) {
      setZone((avant) => (avant === null ? avant : null))
      return
    }

    const sonde = document.createElement("div")
    sonde.setAttribute("data-sonde-zone-atelier", "")
    sonde.style.position = "fixed"
    sonde.style.top = "calc(var(--app-impersonation-offset, 0px) + var(--app-nav-height, 64px))"
    sonde.style.left = "0"
    sonde.style.right = "0"
    sonde.style.bottom = "0"
    // Invisible et inerte : ni vue, ni cliquable, ni au-dessus de quoi que ce soit.
    sonde.style.visibility = "hidden"
    sonde.style.pointerEvents = "none"
    sonde.style.zIndex = "-1"
    document.body.appendChild(sonde)

    const lire = () => {
      const r = sonde.getBoundingClientRect()
      setZone((avant) =>
        avant && Math.round(avant.largeur) === Math.round(r.width) && Math.round(avant.hauteur) === Math.round(r.height)
          ? avant // même mesure : pas de nouveau rendu
          : { largeur: r.width, hauteur: r.height },
      )
    }

    lire()

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(lire)
      ro.observe(sonde)
      return () => {
        ro.disconnect()
        sonde.remove()
      }
    }

    // Repli pour un navigateur sans ResizeObserver : la rotation et le
    // redimensionnement restent suivis.
    window.addEventListener("resize", lire)
    window.addEventListener("orientationchange", lire)
    return () => {
      window.removeEventListener("resize", lire)
      window.removeEventListener("orientationchange", lire)
      sonde.remove()
    }
  }, [actif])

  return zone
}

/**
 * Verdict prêt à l'emploi.
 *
 * `actif` doit valoir vrai pour les seuls chapitres d'atelier. Le hook est
 * appelé sans condition — l'ordre des hooks ne dépend de rien — mais il ne
 * mesure que lorsqu'on le lui demande.
 *
 * `null` hors atelier, et entre le premier rendu et la mesure : cet état-là
 * n'est jamais peint, la mesure tombant dans un effet de mise en page.
 */
export function useVerdictEcranAtelier(actif: boolean): VerdictEcran | null {
  const zone = useZoneAtelier(actif)
  return zone ? verdictEcranAtelier(zone) : null
}

/* ═══════════ L'ÉCRAN ═══════════ */

/**
 * Ce que l'apprenant pilote, dit dans ses mots.
 *
 * Le nom du logiciel compte : « ruban, onglets, volets » n'évoque rien tant
 * qu'on ne sait pas qu'il s'agit d'Excel. La valeur vient de `Simulation.app`,
 * déjà chargée par la page — aucun appel réseau n'est fait pour l'obtenir.
 */
function cequOnPilote(app: string | null | undefined): string {
  switch (normaliserAppAtelier(app)) {
    case "WORD":
      return "une vraie fenêtre Word — ruban, règle, volets et boîtes de dialogue"
    case "POWERPOINT":
      return "une vraie fenêtre PowerPoint — ruban, volet des diapositives et boîtes de dialogue"
    case "OUTLOOK":
      return "une vraie fenêtre Outlook — ruban, dossiers, liste des messages et volet de lecture"
    case "EXCEL":
      return "une vraie fenêtre Excel — ruban, onglets, volets et boîtes de dialogue"
    default:
      // Une application ajoutée plus tard ne doit pas produire une phrase vide.
      return "une vraie fenêtre de logiciel — ruban, volets et boîtes de dialogue"
  }
}

/**
 * Une forme du dessin de droite, rendue telle que le module la décrit.
 *
 * Aucune décision ici : le choix de l'application, ses couleurs et sa géométrie
 * vivent dans `lib/simulation/illustration-atelier.ts`. Ce composant ne fait que
 * peindre — c'est ce qui permet au contrôle de juger le dessin sans navigateur.
 */
function Forme({ f }: { f: FormeIllustration }) {
  if (f.k === "rect") {
    return (
      <rect
        x={f.x}
        y={f.y}
        width={f.w}
        height={f.h}
        rx={f.rx}
        fill={f.fill}
        fillOpacity={f.opacite}
        stroke={f.stroke}
        strokeWidth={f.sw}
      />
    )
  }
  if (f.k === "cercle") {
    return <circle cx={f.cx} cy={f.cy} r={f.r} fill={f.fill} stroke={f.stroke} strokeWidth={f.sw} />
  }
  return <path d={f.d} fill={f.fill} stroke={f.stroke} strokeWidth={f.sw} />
}

export default function EcranTropPetit({
  app,
  raison,
  onAccueil,
}: {
  app?: string | null
  /** Ce qui manque : sert uniquement à ajouter un mot pour le téléphone couché. */
  raison?: "largeur" | "hauteur" | null
  onAccueil?: () => void
}) {
  const { ouvrirLecons } = useCadranActions()

  /*
   * Téléphone COUCHÉ : c'est la hauteur qui manque, et il n'en reste qu'une
   * poignée de pixels une fois la navigation, le cockpit et la bande de
   * consigne servis. L'illustration — la plus haute chose de la carte, et la
   * seule purement décorative — s'efface alors, et les marges se resserrent.
   *
   * Le rendu PORTRAIT n'est pas concerné : là, c'est la largeur qui manque
   * (`raison === "largeur"`), et la carte garde exactement l'aspect validé.
   */
  const compact = raison === "hauteur"

  /*
   * Le dessin de droite : la fenêtre de l'application que cet atelier fait piloter.
   *
   * Il vient de la MÊME source que la phrase juste en dessous — sans quoi les deux
   * peuvent se contredire, et c'est exactement ce qui est arrivé : le texte disait
   * « une vraie fenêtre Word » sous un dessin de tableur.
   */
  const illustration = illustrationAtelier(app)

  return (
    <div
      data-control="atelier-trop-petit"
      /*
       * ⚠️ `max-h-full` + défilement, comme le questionnaire juste à côté dans
       * le player : la salle du cadran CLIPPE ce qu'elle contient — c'est ce qui
       * l'empêche de recouvrir le cockpit — donc une carte plus haute qu'elle
       * serait coupée en haut ET en bas, sans aucun moyen d'atteindre les
       * boutons. Mesuré à 844×390 : 539 px de carte pour une salle bien plus
       * courte, le titre au-dessus du bord et les actions en dessous.
       */
      className={`max-h-full w-full max-w-[520px] overflow-y-auto rounded-2xl bg-white text-center shadow-card-lg ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      {/* Illustration : à gauche ce qui ne marche pas, à droite ce qu'il faut.
          Au trait, dans les encres du LMS — rien de décoratif à charger.
          Retirée quand la hauteur manque : c'est elle qui coûte le plus de
          place, et elle n'ajoute rien que le texte ne dise déjà. */}
      {!compact && (
      <svg
        className="mx-auto mb-4 block"
        width="216"
        height="112"
        viewBox="0 0 216 112"
        fill="none"
        aria-hidden="true"
      >
        <rect x="14.5" y="12.5" width="52" height="87" rx="9" stroke="#d4cbc0" strokeWidth="1.6" />
        <rect x="30" y="17" width="21" height="2.4" rx="1.2" fill="#e8e2d8" />
        <rect x="21" y="27" width="39" height="8" rx="2" fill="#f3efe8" />
        <g fill="#e8e2d8">
          <rect x="21" y="39" width="39" height="2.2" rx="1.1" />
          <rect x="21" y="44" width="39" height="2.2" rx="1.1" />
          <rect x="21" y="49" width="39" height="2.2" rx="1.1" />
          <rect x="21" y="54" width="39" height="2.2" rx="1.1" />
          <rect x="21" y="59" width="39" height="2.2" rx="1.1" />
          <rect x="21" y="64" width="39" height="2.2" rx="1.1" />
          <rect x="21" y="69" width="39" height="2.2" rx="1.1" />
          <rect x="21" y="74" width="39" height="2.2" rx="1.1" />
          <rect x="21" y="79" width="39" height="2.2" rx="1.1" />
          <rect x="21" y="84" width="39" height="2.2" rx="1.1" />
        </g>
        <circle cx="66" cy="97" r="12" fill="#fff" />
        <circle cx="66" cy="97" r="9.4" stroke="#b5a898" strokeWidth="1.6" />
        <path d="M62.4 100.6l7.2-7.2" stroke="#b5a898" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M84 56h20" stroke="#d4cbc0" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1 5" />
        <path
          d="M107 56h6m0 0l-3-3m3 3l-3 3"
          stroke="#b5a898"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="124.5" y="24.5" width="77" height="63" rx="7" stroke="#655a4d" strokeWidth="1.6" />
        {/* Ce que l'apprenant retrouvera sur un grand écran : SON application, jamais
            celle d'une autre formation. Le cadre ci-dessus et la coche ci-dessous sont
            communs aux quatre — c'est l'intérieur de la fenêtre qui change. */}
        {illustration.formes.map((f, i) => (
          <Forme key={i} f={f} />
        ))}
        <circle cx="199" cy="85" r="12" fill="#fff" />
        <circle cx="199" cy="85" r="9.4" fill={illustration.accent} />
        <path
          d="M195 85.2l2.9 2.9 5.3-6"
          stroke="#fff"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      )}

      <h3 className="font-display text-[18.5px] font-semibold leading-tight text-ink">
        Cet atelier ne s&apos;ouvre pas sur téléphone
      </h3>

      <p className="mt-2 text-[13.5px] leading-relaxed text-warm-600">
        Vous y pilotez {cequOnPilote(app)}. Sur un écran de téléphone, ces commandes deviennent trop petites pour être
        utilisées.
        {raison === "hauteur" && " Le tourner ne suffit pas : l'écran n'est alors plus assez haut."}
      </p>

      <p className="mt-2 text-[13.5px] leading-relaxed text-warm-700">
        Reprenez ce chapitre sur <b className="font-semibold text-ink">une tablette ou un ordinateur</b> : vous le
        retrouverez exactement où vous l&apos;avez laissé.
      </p>

      <div className={`flex flex-wrap justify-center gap-2 ${compact ? "my-2.5" : "my-4"}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-warm-50 px-3 py-1.5 text-[11.5px] font-semibold text-warm-700">
          <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <rect x="3" y="4" width="18" height="16" rx="2.4" />
            <path d="M11 17h2" strokeLinecap="round" />
          </svg>
          Tablette
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-warm-50 px-3 py-1.5 text-[11.5px] font-semibold text-warm-700">
          <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
            <path d="M8 20h8M12 16.5V20" strokeLinecap="round" />
          </svg>
          Ordinateur
        </span>
      </div>

      <button
        type="button"
        data-control="atelier-voir-lecons"
        onClick={ouvrirLecons}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-semibold text-white transition-transform active:scale-[0.98]"
        style={{ background: "var(--partner-primary, #4F46E5)" }}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        Voir les autres chapitres
      </button>

      {onAccueil && (
        <button
          type="button"
          data-control="atelier-accueil"
          onClick={onAccueil}
          className="mt-1 inline-flex min-h-[40px] w-full items-center justify-center text-[13px] font-semibold"
          style={{ color: "var(--partner-primary, #4F46E5)" }}
        >
          Revenir à l&apos;accueil
        </button>
      )}

      <p className="mt-3 flex items-start gap-2 border-t border-ink-10 pt-3 text-left text-[11.5px] leading-snug text-warm-500">
        <svg
          className="mt-px h-3 w-3 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" strokeLinecap="round" />
          <circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none" />
        </svg>
        <span>Rien n&apos;est perdu : ce chapitre reste à faire et votre progression n&apos;est pas modifiée.</span>
      </p>
    </div>
  )
}
