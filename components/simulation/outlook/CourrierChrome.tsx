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

/* ═══════════ LE RUBAN ═══════════ */

/**
 * Pictogrammes du ruban.
 *
 * SVG inline, `currentColor`, aucun fichier à servir : le piège 0c (les assets
 * de `public/` en 404 sur Railway en mode standalone) ne peut donc pas les
 * atteindre. Un bouton sans pictogramme reste rendu en texte plutôt que de
 * laisser un trou — c'est la même règle que le dictionnaire `ICONS` d'Excel.
 */
const PICTOS: Record<string, React.ReactNode> = {
  "cr-repondre": (
    <path d="M8 5 3 9l5 4V10.5c3 0 5 .8 6.2 3 .2-3.6-1.4-6-6.2-6.2V5Z" />
  ),
  "cr-repondre-tous": (
    <>
      <path d="M5 5 1 8.5 5 12V9.8c2.2 0 3.7.6 4.6 2.2.2-2.7-1-4.5-4.6-4.6V5Z" />
      <path d="M10.5 5 6.5 8.5l4 3.5V9.8c2.2 0 3.7.6 4.6 2.2.2-2.7-1-4.5-4.6-4.6V5Z" opacity=".55" />
    </>
  ),
  "cr-transferer": (
    <path d="M8 5v2.3C3.2 7.5 1.6 9.9 1.8 13.5 3 11.3 5 10.5 8 10.5V13l5-4-5-4Z" />
  ),
  "cr-supprimer": (
    <path d="M6 2h4l.6 1H13v1.6H3V3h2.4L6 2ZM4 5.6h8l-.6 8.2a1 1 0 0 1-1 .9H5.6a1 1 0 0 1-1-.9L4 5.6Z" />
  ),
  "cr-deplacer": (
    <path d="M2 4.2A1.2 1.2 0 0 1 3.2 3h3l1.3 1.6h5.3A1.2 1.2 0 0 1 14 5.8v6A1.2 1.2 0 0 1 12.8 13H3.2A1.2 1.2 0 0 1 2 11.8V4.2Z" />
  ),
  "cr-indicateur": (
    <path d="M4 2h1.4v12H4V2Zm2.2 1h6.3l-1.5 2.6 1.5 2.6H6.2V3Z" />
  ),
  "cr-non-lu": (
    <path d="M2 4.6 8 9l6-4.4V4a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v.6Zm12 1.5-5.4 4a1 1 0 0 1-1.2 0L2 6.1V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6.1Z" />
  ),
  "cr-joindre": (
    <path d="M11.5 4.5v5.8a3.5 3.5 0 1 1-7 0V4.2a2.3 2.3 0 1 1 4.6 0v5.9a1.2 1.2 0 1 1-2.3 0V5h1.2v5.1a.1.1 0 0 0 .2 0V4.2a1.2 1.2 0 1 0-2.3 0v6.1a2.4 2.4 0 1 0 4.7 0V4.5h.9Z" />
  ),
  "cr-envoyer": <path d="M2 14 15 8 2 2l.02 4.7L11 8l-8.98 1.3L2 14Z" />,
  "cr-cci": (
    <path d="M8 3.5C4.5 3.5 1.9 5.8 1 8c.9 2.2 3.5 4.5 7 4.5s6.1-2.3 7-4.5c-.9-2.2-3.5-4.5-7-4.5Zm0 7.3A2.8 2.8 0 1 1 8 5.2a2.8 2.8 0 0 1 0 5.6Z" />
  ),
  "cr-abandonner": (
    <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3l1-1Z" />
  ),
  "cr-accepter": <path d="m6.4 11.6-3.2-3.2 1.1-1.1 2.1 2.1 5.2-5.2 1.1 1.1-6.3 6.3Z" />,
  "cr-refuser": (
    <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3l1-1Z" />
  ),
  "cr-provisoire": (
    <path d="M8 1.6A6.4 6.4 0 1 0 14.4 8 6.4 6.4 0 0 0 8 1.6Zm.7 6.7-2.4 1.5-.6-1 1.8-1.1V4.2h1.2v4.1Z" />
  ),
  "cr-nouveau-rdv": (
    <path d="M4 1.6h1.3V3H4V1.6Zm6.7 0H12V3h-1.3V1.6ZM2.6 3.6h10.8a1 1 0 0 1 1 1v8.8a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V4.6a1 1 0 0 1 1-1Zm0 3v6.8h10.8V6.6H2.6Z" />
  ),
  "cr-enregistrer-rdv": (
    <path d="M3 2h8.2L14 4.8V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm2 0v4h5V2H5Zm-.5 7h7v5h-7V9Z" />
  ),
}

/** Un bouton de ruban : pictogramme au-dessus, libellé dessous. */
export function BoutonRuban({
  id,
  libelle,
  onClick,
  desactive,
  actif,
}: {
  id: string
  libelle: string
  onClick: () => void
  desactive?: boolean
  actif?: boolean
}) {
  const picto = PICTOS[id]
  return (
    <button
      type="button"
      data-control={id}
      onClick={desactive ? undefined : onClick}
      disabled={desactive}
      title={libelle}
      aria-label={libelle}
      style={{
        ...BTN,
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        // 44 px : la cible tactile réglementaire, tenue même sur téléphone.
        minWidth: 52,
        minHeight: 46,
        padding: "4px 7px",
        borderRadius: 6,
        fontSize: 10.5,
        lineHeight: 1.15,
        whiteSpace: "nowrap",
        color: desactive ? "#AEB6B1" : actif ? "#fff" : "#2C3A33",
        background: actif ? ACCENT : "transparent",
        cursor: desactive ? "default" : "pointer",
      }}
    >
      {picto ? (
        <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden focusable="false">
          {picto}
        </svg>
      ) : null}
      <span>{libelle}</span>
    </button>
  )
}

/** Séparateur de groupe, comme entre deux blocs du ruban d'Excel. */
function Separateur() {
  return <span aria-hidden style={{ width: 1, alignSelf: "stretch", margin: "4px 3px", background: "#E4E0D8" }} />
}

/**
 * LE RUBAN — permanent, au-dessus des trois volets.
 *
 * ⚠️ CE QUI A MOTIVÉ SA CRÉATION. Répondre, Transférer et Supprimer vivaient
 * dans une barre du VOLET DE LECTURE : ils n'existaient donc que lorsqu'un
 * message était déjà ouvert, et l'apprenant découvrait une fenêtre vide et
 * silencieuse. Excel montre 7 onglets et 61 icônes en permanence ; la messagerie
 * n'affichait aucun outil. C'était le plus gros écart visuel des trois
 * applications.
 *
 * ⚠️ UN `data-control` NE DOIT EXISTER QU'UNE FOIS DANS LE DOM. Les boutons
 * d'action ont donc été DÉPLACÉS ici, jamais recopiés : les laisser aux deux
 * endroits ferait viser au halo d'aide et à la démonstration un exemplaire au
 * hasard — et sur Excel, un `data-control` en double avait fait cliquer le
 * pilote sur l'icône cachée derrière une modale.
 *
 * Les boutons restent RENDUS mais désactivés quand aucun message n'est
 * sélectionné : c'est le comportement du vrai Outlook, et cela vaut mieux que de
 * les faire disparaître — un outil qu'on voit grisé s'apprend, un outil absent
 * ne s'apprend pas.
 */
export function RubanCourrier({
  etat,
  compact,
  onControle,
}: {
  etat: EtatOutlook
  compact?: boolean
  onControle: (id: string) => void
}) {
  const m = etat.messages.find((x) => x.id === etat.messageActif)
  const sansMessage = !m

  /*
   * Le ruban ne rend QUE les actions sur message.
   *
   * La fenêtre de rédaction porte déjà les siennes (Envoyer, Joindre, Cci,
   * Abandonner), l'encadré d'invitation les siennes (Accepter, Provisoire,
   * Refuser), et la vue Calendrier également. Les recopier ici mettrait deux
   * fois le même `data-control` dans le DOM — le défaut qui fait viser au halo
   * et au pilote un exemplaire au hasard, parfois celui qui est masqué.
   */
  if (etat.redaction || etat.vue !== "courrier") return null

  return (
    <div
      data-ruban="courrier"
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "stretch",
        gap: 1,
        padding: "3px 8px",
        background: "#FAF9F7",
        borderBottom: "1px solid #E4E0D8",
        // Le ruban d'Excel fait 56 px sur une ligne et défile horizontalement à
        // 390 px. Même choix ici : jamais d'empilement sur deux rangées, qui
        // mangerait la hauteur de la zone de travail.
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      <BoutonRuban id={C.supprimer} libelle="Supprimer" onClick={() => onControle(C.supprimer)} desactive={sansMessage} />
      <BoutonRuban id={C.deplacer} libelle="Déplacer" onClick={() => onControle(C.deplacer)} desactive={sansMessage} />
      <Separateur />
      <BoutonRuban id={C.repondre} libelle="Répondre" onClick={() => onControle(C.repondre)} desactive={sansMessage} />
      <BoutonRuban
        id={C.repondreTous}
        libelle={compact ? "Rép. tous" : "Répondre à tous"}
        onClick={() => onControle(C.repondreTous)}
        desactive={sansMessage}
      />
      <BoutonRuban id={C.transferer} libelle="Transférer" onClick={() => onControle(C.transferer)} desactive={sansMessage} />
      <Separateur />
      <BoutonRuban id={C.indicateur} libelle="Indicateur" onClick={() => onControle(C.indicateur)} desactive={sansMessage} />
      <BoutonRuban id={C.nonLu} libelle="Non lu" onClick={() => onControle(C.nonLu)} desactive={sansMessage} />
    </div>
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
