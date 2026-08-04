"use client"

/**
 * OUTLOOK — la navigation persistante : rail des dossiers, vues, barre mobile.
 *
 * C'est l'équivalent du ruban d'Excel : ce qui entoure la zone de travail et ne
 * change pas quand on passe d'un message à l'autre.
 *
 * ═══ INVARIANTS DU CONTRAT §6 TENUS ICI ═══
 *
 *  · styles en INLINE, aucune classe utilitaire inédite — le JIT Tailwind ne
 *    génère que les classes présentes au build, donc une classe nouvelle est
 *    inerte en production comme au banc ;
 *  · `flex-shrink: 0` sur le rail et la barre basse : ils ne mangent jamais la
 *    zone de travail, et le « rien ne défile » reste garanti par la structure ;
 *  · `pointer-events: none` sur tout ce qui est décoratif.
 *
 * ⚠️ UN `data-control` NE DOIT EXISTER QU'UNE FOIS DANS LE DOM.
 * Le rail et la barre mobile portent tous deux les vues Courrier / Calendrier.
 * Ils ne sont donc JAMAIS rendus ensemble : le rail disparaît sous 720 px, la
 * barre basse n'apparaît qu'en dessous. Le spike a rencontré ce défaut en vrai —
 * deux `cr-vue-courrier` simultanés — et un clic automatisé comme le halo d'aide
 * visaient l'élément caché. Le contrôle `check-controles` vérifie ce point.
 */

import type { EtatOutlook } from "@/lib/simulation/outlook/observations"
import { CONTROLES as C } from "@/lib/simulation/outlook/document"

export const ACCENT = "#0F6CBD"

/** Base commune à tous les boutons : jamais de style de navigateur par défaut. */
export const BTN: React.CSSProperties = {
  border: 0,
  background: "transparent",
  cursor: "pointer",
  font: "inherit",
  color: "inherit",
}

export function BoutonCourrier({
  id,
  children,
  style,
  actif,
  onClick,
  titre,
}: {
  id: string
  children: React.ReactNode
  style?: React.CSSProperties
  actif?: boolean
  onClick: () => void
  titre?: string
}) {
  return (
    <button
      type="button"
      data-control={id}
      onClick={onClick}
      title={titre}
      aria-label={titre}
      style={{
        ...BTN,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 7,
        fontSize: 12.5,
        // 32 px de haut au minimum : sous cette valeur, la cible tactile
        // descend sous le seuil réglementaire sur téléphone.
        minHeight: 32,
        ...(actif ? { background: ACCENT, color: "#fff" } : { color: "#2C3A33" }),
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Une ligne de dossier — la MÊME au rail et au tiroir.
 *
 * Factorisée volontairement : le tiroir mobile doit émettre exactement
 * l'observation du rail (`o:selectFolder`), sinon `O_SELECT_FOLDER` se jugerait
 * différemment selon la largeur de l'écran. Deux rendus, un seul comportement.
 */
function LigneDossier({
  etat,
  dossier,
  onDossier,
}: {
  etat: EtatOutlook
  dossier: EtatOutlook["dossiers"][number]
  onDossier: (id: string) => void
}) {
  const nonLus = etat.messages.filter((m) => m.dossier === dossier.id && !m.lu).length
  const actif = etat.dossierActif === dossier.id
  return (
    <button
      type="button"
      data-control={C.dossier(dossier.id)}
      onClick={() => onDossier(dossier.id)}
      style={{
        ...BTN,
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 7,
        padding: "6px 9px",
        borderRadius: 7,
        fontSize: 12.5,
        // 44 px au tiroir : c'est au doigt qu'on y accède.
        minHeight: 44,
        textAlign: "left",
        /*
         * ⚠️ `fontWeight` est TOUJOURS posé, jamais seulement quand le dossier
         * est actif. `BTN` porte le raccourci `font: inherit` : retirer une
         * propriété longue à côté d'un raccourci fait avertir React
         * (« Removing a style property during rerender ») à chaque changement
         * de dossier. L'avertissement existait depuis l'origine sur le rail ;
         * il se serait multiplié au tiroir, où l'on change de dossier bien plus
         * souvent.
         */
        fontWeight: actif ? 700 : 400,
        ...(actif ? { background: "#E3EEF8", color: "#0B3C66" } : { color: "#3C4A43" }),
      }}
    >
      <span aria-hidden style={{ opacity: 0.6, pointerEvents: "none" }}>
        {dossier.systeme ? "▤" : "▸"}
      </span>
      <span
        style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {dossier.nom}
      </span>
      {nonLus > 0 && (
        <span style={{ fontSize: 10.5, fontWeight: 800, color: ACCENT, pointerEvents: "none" }}>
          {nonLus}
        </span>
      )}
    </button>
  )
}

/* ═══════════ LE TIROIR DES DOSSIERS — mobile seulement (D13) ═══════════ */

/**
 * Le bouton qui ouvre le tiroir.
 *
 * ⚠️ IDENTIFIANT LITTÉRAL SANS LIBELLÉ, comme `cr-retour` : ce bouton n'existe
 * QUE sous 720 px. Lui donner un libellé le rendrait citable par un scénario,
 * et l'étape serait alors injouable sur ordinateur — le défaut symétrique de
 * celui que D13 corrige.
 */
export function BoutonDossiers({
  etat,
  ouvert,
  onBascule,
}: {
  etat: EtatOutlook
  ouvert: boolean
  onBascule: () => void
}) {
  const nonLus = etat.messages.filter((m) => m.dossier !== etat.dossierActif && !m.lu).length
  return (
    <BoutonCourrier
      id="cr-dossiers"
      titre="Dossiers"
      onClick={onBascule}
      style={{ flexShrink: 0, minWidth: 44, justifyContent: "center", position: "relative" }}
    >
      <span aria-hidden>☰</span>
      {nonLus > 0 && !ouvert && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 3,
            right: 3,
            width: 7,
            height: 7,
            borderRadius: 4,
            background: ACCENT,
            pointerEvents: "none",
          }}
        />
      )}
    </BoutonCourrier>
  )
}

/**
 * Le volet des dossiers, en tiroir.
 *
 * ═══ POURQUOI CE COMPOSANT EXISTE (décision D13) ═══
 *
 * Sous 720 px, le rail n'est pas rendu : trois volets ne tiennent pas. Il
 * portait pourtant la SEULE navigation de dossier. Mesuré au banc sur les
 * quatre premiers modules : 9 étapes sur 214 sont des `O_SELECT_FOLDER`, et
 * elles bloquaient 5 chapitres sur 31 — un apprenant sur téléphone ne pouvait
 * ni ouvrir Éléments envoyés, ni classer, ni revenir à sa boîte.
 *
 * Le motif est celui de la liste des chapitres d'Excel et du volet des
 * miniatures de PowerPoint, à l'identique : bouton de bascule, voile cliquable,
 * panneau qui SE SUPERPOSE — il ne pousse jamais la liste, ce qui changerait sa
 * largeur sous les doigts au moment même où on ouvre le volet.
 */
export function TiroirDossiers({
  etat,
  onDossier,
  onFermer,
}: {
  etat: EtatOutlook
  onDossier: (id: string) => void
  onFermer: () => void
}) {
  return (
    <>
      <div
        role="presentation"
        onClick={onFermer}
        style={{ position: "absolute", inset: 0, background: "rgba(8,17,14,.4)", zIndex: 30 }}
      />
      <div
        data-zone="tiroir-dossiers"
        role="dialog"
        aria-label="Dossiers"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 214,
          maxWidth: "82%",
          zIndex: 31,
          background: "#F5F3EF",
          borderRight: "1px solid #E4E0D8",
          overflowY: "auto",
          padding: "9px 7px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          animation: "o-tiroir .22s cubic-bezier(.32,.72,0,1) both",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "2px 4px 8px",
          }}
        >
          <b style={{ fontSize: 12, color: "#3C4A43" }}>Dossiers</b>
          <BoutonCourrier
            id="cr-fermer-dossiers"
            titre="Fermer les dossiers"
            onClick={onFermer}
            /* `minHeight` AUSSI : `BoutonCourrier` plafonne à 32, et mesurer la
               seule largeur laissait passer une cible de 44 × 32 — le défaut
               exact relevé sur les pastilles du guide interactif. */
            style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
          >
            ✕
          </BoutonCourrier>
        </div>
        {etat.dossiers.map((d) => (
          <LigneDossier
            key={d.id}
            etat={etat}
            dossier={d}
            /*
             * ⚠️ LE TIROIR SE FERME DANS LE MÊME GESTE, PAS PAR UN EFFET.
             *
             * Première version : un `useEffect` sur `dossierActif` refermait le
             * tiroir. Mesuré au banc — le tiroir restait ouvert le temps que
             * React vide sa file d'effets, et un clic enchaîné visait un bouton
             * qui disparaissait sous lui (« cible absente »). Fermer ici est
             * immédiat, déterministe, et supprime aussi le clignotement du
             * volet sur le dossier qu'on vient de quitter.
             */
            onDossier={(id) => {
              onDossier(id)
              onFermer()
            }}
          />
        ))}
      </div>
    </>
  )
}

/* ═══════════ LE RAIL — desktop seulement ═══════════ */

export function RailDossiers({
  etat,
  onNouveau,
  onDossier,
  onVue,
}: {
  etat: EtatOutlook
  onNouveau: () => void
  onDossier: (id: string) => void
  onVue: (v: "courrier" | "calendrier") => void
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        width: 186,
        display: "flex",
        flexDirection: "column",
        padding: "9px 7px",
        gap: 2,
        background: "#F5F3EF",
        borderRight: "1px solid #E4E0D8",
        overflowY: "auto",
      }}
    >
      <BoutonCourrier
        id={C.nouveau}
        onClick={onNouveau}
        actif
        style={{ width: "100%", justifyContent: "flex-start", fontWeight: 700, marginBottom: 7 }}
      >
        <span aria-hidden>✚</span> Nouveau message
      </BoutonCourrier>

      {/* ⚠️ UNE SEULE OCCURRENCE de `cr-dossier-*` dans le DOM : le rail n'existe
          qu'au-dessus de 720 px, le tiroir qu'en dessous. Ils ne sont jamais
          rendus ensemble — même règle que les vues Courrier / Calendrier. */}
      {etat.dossiers.map((d) => (
        <LigneDossier key={d.id} etat={etat} dossier={d} onDossier={onDossier} />
      ))}

      <div
        style={{
          marginTop: "auto",
          paddingTop: 9,
          borderTop: "1px solid #E4E0D8",
          display: "flex",
          gap: 4,
        }}
      >
        <BoutonCourrier
          id={C.vue("courrier")}
          onClick={() => onVue("courrier")}
          actif={etat.vue === "courrier"}
          titre="Courrier"
          style={{ flex: 1, justifyContent: "center" }}
        >
          <span aria-hidden>✉</span>
        </BoutonCourrier>
        <BoutonCourrier
          id={C.vue("calendrier")}
          onClick={() => onVue("calendrier")}
          actif={etat.vue === "calendrier"}
          titre="Calendrier"
          style={{ flex: 1, justifyContent: "center" }}
        >
          <span aria-hidden>▦</span>
        </BoutonCourrier>
      </div>
    </div>
  )
}

/* ═══════════ LA BARRE BASSE — mobile seulement ═══════════ */

/**
 * Navigation basse, l'adaptation à 390 px.
 *
 * TROUVÉE PAR LE JOUEUR, PAS PAR LA LECTURE DU CODE. Sous 720 px le rail n'est
 * pas rendu — trois volets ne tiennent pas — et il portait le basculement
 * Courrier / Calendrier. Une fois l'apprenant entré dans le volet de lecture, le
 * calendrier devenait INATTEIGNABLE : une impasse de navigation, invisible en
 * relisant le composant et invisible sur desktop.
 *
 * La réponse est celle du vrai Outlook mobile : les VUES descendent là où le
 * pouce les atteint, les DOSSIERS passent dans la liste. Aucune fidélité
 * pédagogique n'est perdue — la navigation est seulement déplacée.
 */
export function BarreMobile({
  etat,
  onVue,
}: {
  etat: EtatOutlook
  onVue: (v: "courrier" | "calendrier") => void
}) {
  const onglet = (ctrl: string, icone: string, libelle: string, actif: boolean, v: "courrier" | "calendrier") => (
    <button
      type="button"
      data-control={ctrl}
      onClick={() => onVue(v)}
      aria-label={libelle}
      style={{
        ...BTN,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        // 46 px : cible tactile confortable au pouce, au-dessus du seuil de 44.
        minHeight: 46,
        fontSize: 10,
        fontWeight: 700,
        color: actif ? ACCENT : "#8C948F",
      }}
    >
      <span aria-hidden style={{ fontSize: 15, pointerEvents: "none" }}>
        {icone}
      </span>
      {libelle}
    </button>
  )

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        borderTop: "1px solid #E4E0D8",
        background: "#FAF9F7",
      }}
    >
      {onglet(C.vue("courrier"), "✉", "Courrier", etat.vue === "courrier", "courrier")}
      {onglet(C.vue("calendrier"), "▦", "Calendrier", etat.vue === "calendrier", "calendrier")}
    </div>
  )
}
