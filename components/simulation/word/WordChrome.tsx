"use client"

/**
 * Le ruban de Word — le nôtre, pas celui d'Univer.
 *
 * POURQUOI RECONSTRUIRE UN RUBAN alors que le moteur en a un : parce qu'un
 * simulateur doit maîtriser ce que l'apprenant voit. Le ruban natif d'Univer
 * porte des boutons qu'aucun scénario n'attend, change avec les versions du
 * paquet, et traduit l'onglet *Home* par « **Démarrer** » — un apprenant à qui
 * l'on demande d'aller dans l'onglet Accueil ne le trouverait pas.
 *
 * ⚠️ STYLES INLINE, avec les `@keyframes` embarqués. Le JIT de Tailwind ne
 * génère que les classes présentes à la compilation : une classe inédite est
 * INERTE, en production comme au banc. C'est la règle du player, et elle a déjà
 * coûté un lot de retouches visuelles invisibles côté Excel.
 *
 * ⚠️ CHAQUE BOUTON DOIT AGIR. Un identifiant finit toujours par émettre une
 * observation `control`, donc un bouton qui ne ferait rien validerait quand même
 * l'étape et laisserait l'apprenant devant un écran inchangé. `check-controles`
 * refuse un bouton rendu ici sans commande dans `WordSurface`, et un bouton cité
 * par un scénario sans rendu ici.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { LIBELLES_CONTROLES_WORD } from "@/lib/simulation/word/adaptateur"
import { C } from "@/lib/simulation/couleurs"

/* ═══════════════════════════════════════════════════════════════════════════
   LES PICTOGRAMMES
   ═══════════════════════════════════════════════════════════════════════════

   Un ruban fait de mots alignés ne ressemble pas à Word. C'est ce qui cassait
   le plus l'immersion côté Excel (retour Samuel du 29/07), et le ruban de Word
   était exactement dans cet état : « Coller », « Copier », « Puces », « Titre 1 »
   en rang d'oignons, sans un seul repère visuel. Un apprenant qui cherche le
   gras dans un vrai Word cherche un **G épais**, pas un mot.

   Dessinés en SVG `currentColor` plutôt qu'importés : aucun fichier à servir
   (piège 0c — les assets de `public/` sont retournés en 404 par le runtime
   Railway en standalone), aucune police d'icônes, et la couleur suit l'état du
   bouton. Même gabarit que le ruban d'Excel : 15 px dans un `viewBox` de 16,
   traits de 1,25.

   ⚠️ Un bouton SANS pictogramme reste rendu en texte — il n'y a pas de case
   vide. C'est délibéré : ajouter un bouton au ruban ne doit jamais produire un
   trou visuel, seulement un bouton moins joli. */

const I = (d: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0 }}>
    {d}
  </svg>
)
const t = {
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}
/** Une pile de lignes de texte, base commune aux styles et aux alignements. */
const lignes = (d: string) => I(<path d={d} {...t} />)

const ICONES: Record<string, React.ReactNode> = {
  /* ── Presse-papiers ── */
  "w-coller": I(
    <>
      <rect x="3.5" y="3" width="9" height="11" rx="1.4" {...t} />
      <rect x="5.8" y="1.6" width="4.4" height="2.6" rx=".9" fill="currentColor" opacity=".75" />
    </>,
  ),
  "w-copier": I(
    <>
      <rect x="2.5" y="2.5" width="7.5" height="9" rx="1.2" {...t} />
      <rect x="6" y="5" width="7.5" height="9" rx="1.2" {...t} fill="#fff" />
    </>,
  ),
  "w-couper": I(
    <>
      <path d="M5 2.5 11 11M11 2.5 5 11" {...t} />
      <circle cx="4.2" cy="12.6" r="1.6" {...t} />
      <circle cx="11.8" cy="12.6" r="1.6" {...t} />
    </>,
  ),

  /* ── Police ── les quatre attributs sont leur propre pictogramme ── */
  "w-gras": I(
    <text x="8" y="12" textAnchor="middle" fontSize="12" fontWeight="800" fill="currentColor">
      G
    </text>,
  ),
  "w-italique": I(
    <text x="8" y="12" textAnchor="middle" fontSize="12" fontStyle="italic" fill="currentColor">
      I
    </text>,
  ),
  "w-souligne": I(
    <>
      <text x="8" y="11" textAnchor="middle" fontSize="11" fill="currentColor">
        S
      </text>
      <path d="M4 13.6h8" {...t} />
    </>,
  ),
  "w-barre": I(
    <>
      <text x="8" y="12" textAnchor="middle" fontSize="11" fill="currentColor">
        S
      </text>
      <path d="M3.6 8h8.8" {...t} />
    </>,
  ),

  /* ── Paragraphe ── */
  "w-liste-puces": I(
    <>
      <circle cx="3.2" cy="4.4" r="1.15" fill="currentColor" />
      <circle cx="3.2" cy="8" r="1.15" fill="currentColor" />
      <circle cx="3.2" cy="11.6" r="1.15" fill="currentColor" />
      <path d="M6.4 4.4h7M6.4 8h7M6.4 11.6h7" {...t} />
    </>,
  ),
  "w-liste-numerotee": I(
    <>
      <text x="3.1" y="5.9" textAnchor="middle" fontSize="5.2" fill="currentColor">
        1
      </text>
      <text x="3.1" y="9.6" textAnchor="middle" fontSize="5.2" fill="currentColor">
        2
      </text>
      <text x="3.1" y="13.3" textAnchor="middle" fontSize="5.2" fill="currentColor">
        3
      </text>
      <path d="M6.4 4.4h7M6.4 8h7M6.4 11.6h7" {...t} />
    </>,
  ),
  "w-align-gauche": lignes("M2.5 4h11M2.5 7h7M2.5 10h11M2.5 13h7"),
  "w-align-centre": lignes("M2.5 4h11M4.5 7h7M2.5 10h11M4.5 13h7"),
  "w-align-droite": lignes("M2.5 4h11M6.5 7h7M2.5 10h11M6.5 13h7"),
  "w-align-justifie": lignes("M2.5 4h11M2.5 7h11M2.5 10h11M2.5 13h11"),

  /* ── Styles ── la hauteur du « A » dit le rang, les lignes le corps ── */
  "w-style-normal": I(
    <>
      <path d="M2.5 4.5h11M2.5 7.5h11M2.5 10.5h11M2.5 13.5h7" {...t} />
    </>,
  ),
  "w-style-titre": I(
    <>
      <text x="4.4" y="9.4" textAnchor="middle" fontSize="10" fontWeight="800" fill="currentColor">
        A
      </text>
      <path d="M8.6 5.5h5M8.6 9h5" {...t} />
      <path d="M2.5 12.8h11" {...t} />
    </>,
  ),
  "w-style-soustitre": I(
    <>
      <text x="4.4" y="9" textAnchor="middle" fontSize="8" fill="currentColor">
        A
      </text>
      <path d="M8.2 6h5.3M8.2 9h5.3" {...t} />
      <path d="M2.5 12.8h11" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2 1.6" />
    </>,
  ),
  "w-style-titre1": I(
    <>
      <text x="5" y="10.6" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="currentColor">
        H
      </text>
      <text x="11.6" y="12.4" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor">
        1
      </text>
    </>,
  ),
  "w-style-titre2": I(
    <>
      <text x="5" y="10.6" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="currentColor">
        H
      </text>
      <text x="11.6" y="12.4" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor">
        2
      </text>
    </>,
  ),
  "w-style-titre3": I(
    <>
      <text x="5" y="10.6" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="currentColor">
        H
      </text>
      <text x="11.6" y="12.4" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor">
        3
      </text>
    </>,
  ),

  /* ── Annulation ── */
  "w-annuler": I(
    <>
      <path d="M3 8.2a5 5 0 1 1 1.9 3.9" {...t} />
      <path d="M2.4 4.6v3.6h3.6" {...t} />
    </>,
  ),
  "w-retablir": I(
    <>
      <path d="M13 8.2a5 5 0 1 0-1.9 3.9" {...t} />
      <path d="M13.6 4.6v3.6H10" {...t} />
    </>,
  ),

  /* ── Tableaux ── */
  "w-inserer-tableau": I(
    <>
      <rect x="2" y="3" width="12" height="10" rx=".8" {...t} />
      <path d="M2 6.4h12M2 9.8h12M6 3v10M10 3v10" {...t} />
    </>,
  ),
  "w-ligne-dessus": I(
    <>
      <rect x="2" y="7" width="12" height="6" rx=".8" {...t} />
      <path d="M2 10h12M8 7v6" {...t} />
      <path d="M8 1.6v3.6M6.2 3.4h3.6" {...t} />
    </>,
  ),
  "w-ligne-dessous": I(
    <>
      <rect x="2" y="3" width="12" height="6" rx=".8" {...t} />
      <path d="M2 6h12M8 3v6" {...t} />
      <path d="M8 10.8v3.6M6.2 12.6h3.6" {...t} />
    </>,
  ),
  "w-colonne-gauche": I(
    <>
      <rect x="7" y="2" width="7" height="12" rx=".8" {...t} />
      <path d="M10.5 2v12" {...t} />
      <path d="M3.4 8h-2M3.4 6.2v3.6" {...t} />
    </>,
  ),
  "w-colonne-droite": I(
    <>
      <rect x="2" y="2" width="7" height="12" rx=".8" {...t} />
      <path d="M5.5 2v12" {...t} />
      <path d="M12.6 8h2M12.6 6.2v3.6" {...t} />
    </>,
  ),
  "w-supprimer-ligne": I(
    <>
      <rect x="2" y="3" width="12" height="10" rx=".8" {...t} />
      <path d="M2 8h12" {...t} />
      <path d="M5.6 5.4 8 8l2.4-2.6M5.6 13 8 10.4 10.4 13" stroke="#c0392b" strokeWidth="1.3" strokeLinecap="round" />
    </>,
  ),
  "w-supprimer-colonne": I(
    <>
      <rect x="2" y="3" width="12" height="10" rx=".8" {...t} />
      <path d="M8 3v10" {...t} />
      <path d="M4.4 5.6 7 8l-2.6 2.4M11.6 5.6 9 8l2.6 2.4" stroke="#c0392b" strokeWidth="1.3" strokeLinecap="round" />
    </>,
  ),

  /* ── Liens ── */
  "w-inserer-lien": I(
    <>
      <path d="M6.6 9.4a2.6 2.6 0 0 1 0-3.7l2-2a2.6 2.6 0 0 1 3.7 3.7l-.9.9" {...t} />
      <path d="M9.4 6.6a2.6 2.6 0 0 1 0 3.7l-2 2a2.6 2.6 0 0 1-3.7-3.7l.9-.9" {...t} />
    </>,
  ),
  "w-retirer-lien": I(
    <>
      <path d="M6.4 9.2a2.5 2.5 0 0 1 .2-3.5l1.8-1.8a2.5 2.5 0 0 1 3.6 3.5" {...t} />
      <path d="M2.2 2.2l11.6 11.6" stroke="#c0392b" strokeWidth="1.35" strokeLinecap="round" />
    </>,
  ),

  /* ── Illustrations ── */
  "w-inserer-image": I(
    <>
      <rect x="2" y="3" width="12" height="10" rx="1" {...t} />
      <circle cx="5.6" cy="6.4" r="1.1" fill="currentColor" />
      <path d="M2.6 11.6 6.4 8l2.4 2.2L10.8 8.6l2.6 3" {...t} />
    </>,
  ),
  "w-supprimer-image": I(
    <>
      <rect x="2" y="3" width="12" height="10" rx="1" {...t} />
      <path d="M4.6 5.6 11.4 12M11.4 5.6 4.6 12" stroke="#c0392b" strokeWidth="1.35" strokeLinecap="round" />
    </>,
  ),
  /* Les quatre habillages : le bloc gris est l'image, les traits sont le texte. */
  "w-habillage-aligne": I(
    <>
      <path d="M2.5 3.4h11M2.5 12.6h11" {...t} />
      <rect x="5" y="5.6" width="6" height="4.8" rx=".5" fill="currentColor" opacity=".55" />
    </>,
  ),
  "w-habillage-carre": I(
    <>
      <rect x="5.6" y="5.6" width="4.8" height="4.8" rx=".5" fill="currentColor" opacity=".55" />
      <path d="M2.5 3.4h11M2.5 6.2h2.4M11.1 6.2h2.4M2.5 8.8h2.4M11.1 8.8h2.4M2.5 12.6h11" {...t} />
    </>,
  ),
  "w-habillage-hautbas": I(
    <>
      <rect x="4.4" y="6.2" width="7.2" height="3.6" rx=".5" fill="currentColor" opacity=".55" />
      <path d="M2.5 3.2h11M2.5 4.9h11M2.5 11.1h11M2.5 12.8h11" {...t} />
    </>,
  ),
  "w-habillage-devant": I(
    <>
      <path d="M2.5 3.4h11M2.5 6.2h11M2.5 8.8h11M2.5 11.6h11" {...t} />
      <rect x="4.6" y="4.8" width="6.8" height="6" rx=".6" fill="#fff" stroke="currentColor" strokeWidth="1.25" />
    </>,
  ),

  /* ── En-tête, mise en page, impression, révision, affichage ── */
  "w-entete-pied": I(
    <>
      <rect x="2.5" y="1.8" width="11" height="12.4" rx="1" {...t} />
      <rect x="2.5" y="1.8" width="11" height="2.8" rx="1" fill="currentColor" opacity=".5" />
      <path d="M5 7.4h6M5 9.4h6" {...t} />
      <rect x="2.5" y="11.4" width="11" height="2.8" rx="1" fill="currentColor" opacity=".28" />
    </>,
  ),
  "w-mise-en-page": I(
    <>
      <rect x="3" y="1.8" width="10" height="12.4" rx="1" {...t} />
      <path
        d="M5.2 4.2h5.6M5.2 11.8h5.6M5.2 4.2v7.6M10.8 4.2v7.6"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="1.8 1.4"
      />
    </>,
  ),
  "w-imprimer": I(
    <>
      <path d="M4.6 5.6V2.4h6.8v3.2" {...t} />
      <rect x="2.2" y="5.6" width="11.6" height="5" rx="1" {...t} />
      <rect x="4.6" y="9.4" width="6.8" height="4.2" rx=".6" fill="#fff" stroke="currentColor" strokeWidth="1.25" />
    </>,
  ),
  "w-verification": I(
    <>
      <path d="M2.4 12.6 5.8 3.4l3.4 9.2M3.6 9.8h4.4" {...t} />
      {/* La coche du bouton « Vérification » : c'est une icône d'INTERFACE, pas
          une image insérable — d'où la couleur de l'application. `var()` ne se
          résout pas dans un attribut de présentation SVG : il faut un style. */}
      <path d="M10 10.4l1.8 1.9 3-3.6" style={{ stroke: C.accentF }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>,
  ),
  "w-regle": I(
    <>
      <rect x="1.6" y="5.2" width="12.8" height="5.6" rx=".7" {...t} />
      <path d="M4.2 5.2v2.2M6.8 5.2v3.2M9.4 5.2v2.2M12 5.2v3.2" {...t} />
    </>,
  ),
}

/** Boutons dont l'icône EST le libellé : afficher « G » sous « G » n'apprend rien. */
const ICONE_SEULE = new Set(["w-gras", "w-italique", "w-souligne", "w-barre"])

/*
 * ═══════════ CE QUE LE RUBAN CONTIENT — DÉCLARÉ AILLEURS ═══════════
 *
 * Onglets, groupes et boutons vivent désormais dans `lib/simulation/word/ruban.ts`,
 * module PUR. Ce fichier n'en est plus que le dessinateur.
 *
 * 🔴 La raison n'est pas cosmétique. La démonstration doit savoir sous quel
 * onglet vit un bouton pour l'ouvrir avant de le désigner — sans quoi le geste
 * se joue à blanc, défaut mesuré sur 26 démonstrations de Word. Cette déduction
 * est aussi ce que le contrôle `check-demo-onglets.ts` doit vérifier hors
 * navigateur. Deux consommateurs, donc, dont un sans React : la structure ne
 * pouvait pas rester enfermée dans un composant. Elle n'est pas recopiée pour
 * autant — une seconde liste dériverait en silence de celle qui rend vraiment.
 */
export type { OngletWord } from "@/lib/simulation/word/ruban"
import {
  GROUPES_WORD as GROUPES,
  ONGLETS_WORD as ONGLETS,
  ONGLETS_INERTES_WORD as ONGLETS_INERTES,
  CONTROLES_RUBAN_WORD,
  type BoutonRuban as Bouton,
  type OngletWord,
} from "@/lib/simulation/word/ruban"
type Props = {
  /** Onglet imposé par l'étape courante, s'il y en a un. */
  ongletImpose?: OngletWord
  onControle: (id: string, argument?: string) => void
  /** Nom du document, affiché dans la barre de titre. */
  titreDocument?: string
  /**
   * L'onglet ouvert, remonté au player à chaque changement.
   *
   * 🔴 SANS CE CANAL, LE CLICHÉ DE DÉPART NE PEUT PAS PHOTOGRAPHIER L'ONGLET.
   * L'état vit ici, le player ne le connaissait pas, donc `relever()` n'avait
   * rien à relever — et c'est l'état le plus destructeur de tous : le ruban ne
   * rend QUE son onglet actif, un bouton rangé ailleurs n'est pas dans le DOM.
   */
  onEtatChassis?: (etat: EtatChassisWord) => void
  /**
   * REPOSER un onglet relevé — jeton compris.
   *
   * ⚠️ Le jeton n'est pas une coquetterie : reposer « accueil » alors que
   * `ongletImpose` vaut déjà « accueil » ne change AUCUNE dépendance d'effet,
   * donc rien ne se redéclenche. C'est exactement le défaut mesuré le
   * 07/08/2026 — l'apprenant passe sur Affichage, « Revoir » ne fait rien
   * bouger, et la démonstration désigne un bouton absent de la page. Un jeton
   * qui s'incrémente rend la repose observable même quand la valeur ne change
   * pas.
   */
  chassisRepose?: EtatChassisWord & { jeton: number }
}

/**
 * L'état du châssis que le cliché de départ doit savoir relever et reposer.
 *
 * Il vit ICI et non dans le player : le ruban et la boîte « Insérer un tableau »
 * sont des affaires de châssis. Ce qui manquait n'était pas le bon propriétaire,
 * c'était le CANAL — le player ne pouvait ni le lire ni le remettre.
 */
export type EtatChassisWord = {
  onglet: OngletWord
  boiteTableau: boolean
  lignes: number
  colonnes: number
}

/** Sous cette largeur, le ruban ne tient plus : on ouvre le tiroir des groupes. */
const SEUIL_MOBILE = 640

export default function WordChrome({ ongletImpose, onControle, titreDocument, onEtatChassis, chassisRepose }: Props) {
  const [onglet, setOnglet] = useState<OngletWord>(ongletImpose ?? "accueil")
  /**
   * 🔴 L'ÉTAPE REPREND LA MAIN, ELLE NE VERROUILLE PAS.
   *
   * `actif = ongletImpose ?? onglet` rendait les onglets MORTS : 97 scénarios
   * sur 102 déclarent un `activeTab`, donc l'apprenant cliquait sur « Insertion »
   * et rien ne bougeait. Explorer le ruban n'est pas une faute — c'est même le
   * premier réflexe de quelqu'un qui cherche un bouton — et Excel avait dû
   * corriger exactement ce défaut, ses onglets étant des `<span>` inertes.
   *
   * Cela débloque aussi la démonstration : elle OUVRE l'onglet qui porte le
   * bouton à désigner, sinon le geste se joue à blanc, le ruban ne rendant que
   * son onglet actif.
   */
  useEffect(() => {
    if (ongletImpose) setOnglet(ongletImpose)
  }, [ongletImpose])
  const actif = onglet
  /** Boîte « Insérer un tableau », comme la modale native mais chez nous. */
  const [boiteTableau, setBoiteTableau] = useState(false)
  const [lignes, setLignes] = useState(3)
  const [colonnes, setColonnes] = useState(4)

  /* ═══════════ LE CLICHÉ DE DÉPART : RELEVER, PUIS REPOSER ═══════════
   *
   * 🔴 LE DÉFAUT FILMÉ PAR SAMUEL LE 07/08/2026 EST ICI, ET NULLE PART AILLEURS.
   *
   * L'apprenant ouvre l'onglet Affichage pour regarder la Règle, puis clique
   * « Revoir la démonstration ». Le document était bien remis d'aplomb — mais
   * pas le ruban. La démonstration désignait alors le bouton **G** du groupe
   * Police, qui vit sous Accueil : le ruban ne rendant QUE son onglet actif, le
   * bouton n'était pas dans le DOM. Mesuré : halo absent, bulle absente, cible
   * `null`, `w-gras` introuvable sur 144 frames, compteur 2/2, phase `fini`,
   * ZÉRO erreur de console. Le faux témoin parfait.
   *
   * ⚠️ POURQUOI `ongletImpose` NE POUVAIT PAS SUFFIRE. Il porte « l'étape
   * commence ici » et se déclenche sur un CHANGEMENT DE VALEUR — c'est ce qui
   * laisse l'apprenant explorer le ruban librement, et il faut le garder. Or
   * l'étape déclarait déjà `activeTab: "accueil"` : reposer « accueil » ne
   * changeait donc aucune dépendance, et l'effet ne repartait jamais. D'où le
   * JETON : il rend la repose audible même quand la valeur demandée est celle
   * qui était déjà déclarée.
   */
  const signalerRef = useRef(onEtatChassis)
  signalerRef.current = onEtatChassis
  useEffect(() => {
    signalerRef.current?.({ onglet, boiteTableau, lignes, colonnes })
  }, [onglet, boiteTableau, lignes, colonnes])

  useEffect(() => {
    if (!chassisRepose) return
    /*
     * 🔴 LE CLICHÉ NE DOIT PAS CONTREDIRE LA DÉMONSTRATION EN COURS.
     *
     * React exécute les effets dans leur ORDRE DE DÉCLARATION. Celui-ci est
     * déclaré APRÈS l'effet de `ongletImpose`, donc il écrivait en dernier — et
     * une démonstration dont le PREMIER geste vise un bouton rangé ailleurs
     * (`w-inserer-tableau` sous Insertion, `w-mise-en-page` sous Mise en page)
     * voyait son onglet ouvert puis aussitôt refermé par la repose. Le geste se
     * jouait alors à blanc SUR UN ÉCRAN PROPRE, c'est-à-dire une régression pire
     * que le défaut corrigé. Mesuré au balayage : 7 démonstrations perdues
     * (`M08-L02-01`, `M09-L01-05`, `M12-E01-04`, `M12-E02-06`, `M13-E01-04`,
     * `M13-E02-02`, `M13-L01-04`), témoin à 0/1 alors qu'il était à 1/1.
     *
     * `ongletImpose` porte l'intention COURANTE : hors démonstration c'est
     * l'onglet que l'étape déclare — donc celui du cliché, aucun conflit — et
     * pendant une démonstration c'est l'onglet du geste, qui doit primer.
     */
    setOnglet(ongletImpose ?? chassisRepose.onglet)
    setBoiteTableau(chassisRepose.boiteTableau)
    setLignes(chassisRepose.lignes)
    setColonnes(chassisRepose.colonnes)
    // Le jeton seul déclenche : la repose doit avoir lieu même à valeurs égales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chassisRepose?.jeton])

  /* ═══════════ LE TIROIR DES GROUPES — mobile seulement ═══════════
   *
   * 🔴 MESURÉ AVANT D'ÊTRE ÉCRIT : à 390 px, l'onglet Accueil rend 25 boutons
   * dont **17 hors champ**, et il faut faire défiler **1 189 px à l'aveugle**
   * pour atteindre le groupe Styles. Un scénario qui demande « Titre 1 » était
   * donc injouable au doigt, sans qu'aucun contrôle ne le voie : rien ne
   * déborde, toutes les cibles font 44 px, la page est parfaitement saine.
   *
   * ⚠️ LE TIROIR FAIT DÉFILER, IL NE FILTRE PAS. Masquer les autres groupes les
   * retirerait du DOM — et alors la démonstration ne résoudrait plus leurs
   * boutons, `check-controles` verrait des identifiants absents, et un geste
   * pourtant légitime deviendrait injouable. On déplace le regard, on ne
   * retire rien. Même raison que le tiroir des miniatures de PowerPoint : il se
   * superpose au lieu de pousser.
   */
  const [largeur, setLargeur] = useState(0)
  const [tiroir, setTiroir] = useState(false)
  const barreRef = useRef<HTMLDivElement | null>(null)
  const racineRef = useRef<HTMLDivElement | null>(null)
  const mobile = largeur > 0 && largeur < SEUIL_MOBILE

  useEffect(() => {
    const el = racineRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const mesurer = () => setLargeur(el.getBoundingClientRect().width)
    mesurer()
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Un tiroir resté ouvert après un changement d'onglet n'aurait plus de sens :
  // ses groupes ne sont plus ceux du ruban affiché.
  useEffect(() => setTiroir(false), [actif])

  /* ═══════════ CE QUE LE RUBAN CACHE À DROITE, ET COMMENT L'ATTEINDRE ═══════════
   *
   * 🔴 MESURÉ AVANT D'ÊTRE ÉCRIT, ET SUR UN GRAND ÉCRAN : à 1 440 px — pas sur
   * un téléphone — le groupe « Annulation » commence à x = 1 454. « Annuler »
   * et « Rétablir » sont donc ENTIÈREMENT hors de la fenêtre, `elementFromPoint`
   * confirme qu'ils ne sont pas cliquables, et 124 px de ruban défilent sans que
   * rien ne l'indique. À 1 280 px il en manque 284.
   *
   * Ce que cela coûtait : 31 étapes de 16 chapitres exigent l'un de ces deux
   * boutons, dont **21 POINTS DE 11 ÉVALUATIONS NOTÉES**. L'apprenant ne pouvait
   * pas les prendre — non pas parce qu'il ignorait la réponse, mais parce que le
   * bouton n'était pas à l'écran.
   *
   * ⚠️ POURQUOI PAS « AMENER LA CIBLE DANS LE CHAMP », le remède de PowerPoint
   * et de la démonstration Word (`rectDuDom`) : il désignerait LA RÉPONSE. Faire
   * défiler le ruban jusqu'au bouton attendu au moment où l'étape le demande,
   * c'est le montrer du doigt — inacceptable sur les 21 points notés, qui sont
   * précisément le cœur du défaut. Ce remède reste bon pour la démonstration,
   * qui ne se joue jamais en évaluation.
   *
   * Le remède retenu ne révèle rien : il rend le ruban ENTIÈREMENT ATTEIGNABLE,
   * à l'apprenant de trouver son bouton. C'est aussi ce que fait le vrai Word.
   *
   * ⚠️ Les chevrons sont des FRÈRES de la piste, jamais posés par-dessus. Une
   * surface décorative superposée avale les clics — c'est le défaut qui faisait
   * échouer 4 scénarios Excel sur 6, et celui du jalon sans `pointer-events`.
   * En sortant de la piste, ils ne peuvent voler aucun clic par construction.
   *
   * Ils ne portent pas `data-control` : ce ne sont pas des boutons de scénario,
   * et `check-controles` refuserait un identifiant qu'aucune étape ne cite.
   * Même convention que `data-control-tiroir` juste en dessous.
   */
  const [debord, setDebord] = useState({ gauche: false, droite: false })

  const mesurerDebord = useCallback(() => {
    const b = barreRef.current
    if (!b) return
    const restant = b.scrollWidth - b.clientWidth - b.scrollLeft
    setDebord({ gauche: b.scrollLeft > 1, droite: restant > 1 })
  }, [])

  useEffect(() => {
    const b = barreRef.current
    if (!b) return
    mesurerDebord()
    b.addEventListener("scroll", mesurerDebord, { passive: true })
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(mesurerDebord) : null
    ro?.observe(b)
    return () => {
      b.removeEventListener("scroll", mesurerDebord)
      ro?.disconnect()
    }
    // `actif` : changer d'onglet change les groupes, donc le débordement.
  }, [mesurerDebord, actif])

  const defiler = (sens: -1 | 1) => {
    const b = barreRef.current
    if (!b) return
    // Un peu moins qu'un écran, pour garder un repère visuel commun aux deux vues.
    b.scrollBy({ left: sens * Math.max(160, b.clientWidth * 0.6), behavior: "smooth" })
  }

  const allerAuGroupe = (titre: string) => {
    setTiroir(false)
    const barre = barreRef.current
    const cible = barre?.querySelector<HTMLElement>(`[data-groupe-ruban="${titre}"]`)
    if (!barre || !cible) return
    // `scrollIntoView` ferait aussi défiler la page ; on ne bouge QUE la barre.
    barre.scrollTo({ left: cible.offsetLeft - 8, behavior: "smooth" })
  }

  const groupes = GROUPES[actif] ?? []

  return (
    <div
      ref={racineRef}
      style={{ flexShrink: 0, background: "#fff", borderBottom: "1px solid #e6e3dd", position: "relative" }}
    >
      {/* Barre de titre — décorative, comme celle du poste de travail d'Excel.
          `data-titre-word` la rend DÉSIGNABLE : une leçon qui parle du nom du
          document et de l'enregistrement doit pouvoir pointer l'endroit où ce
          nom s'affiche, sinon la démonstration se joue sans repère. */}
      <div
        data-titre-word
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 30,
          padding: "0 10px",
          background: "#f6f4f0",
          fontSize: 12,
          color: "#5b554d",
        }}
      >
        <span>{titreDocument ?? "Document1"} — Word</span>
        <span aria-hidden style={{ letterSpacing: 6, opacity: 0.5 }}>─ ▢ ✕</span>
      </div>

      {/* Onglets */}
      {/* Défilante et sans repli : à 390 px, « Mise en page » se cassait sur
          trois lignes et poussait la surface de travail vers le bas. Même
          motif que le ruban Excel mobile. */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "0 8px",
          background: "#f6f4f0",
          overflowX: "auto",
          whiteSpace: "nowrap",
        }}
      >
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            type="button"
            data-ribbon-tab={o.id}
            onClick={() => setOnglet(o.id)}
            style={{
              border: "none",
              background: actif === o.id ? "#fff" : "transparent",
              color: actif === o.id ? C.accentF : "#5b554d",
              fontWeight: actif === o.id ? 600 : 400,
              fontSize: 13,
              padding: "7px 12px",
              borderRadius: "6px 6px 0 0",
              cursor: "pointer",
              minHeight: 32,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {o.libelle}
          </button>
        ))}
        {/* Rendus mais INERTES, et volontairement sans `data-ribbon-tab`. */}
        {ONGLETS_INERTES.map((t) => (
          <span
            key={t}
            aria-disabled
            style={{
              fontSize: 13,
              padding: "7px 12px",
              color: "#b3ada3",
              cursor: "default",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {t}
          </span>
        ))}
      </div>

      {/*
        Une SEULE ligne, défilante horizontalement. Motif éprouvé sur le ruban
        Excel mobile : à 390 px, un ruban qui s'empile mange la moitié de
        l'écran et la surface de travail devient inutilisable.
      */}
      <div style={{ display: "flex", alignItems: "stretch", background: "#fff" }}>
        {/* Le bouton du tiroir, sur mobile seulement. Il reste COLLÉ à gauche :
            un sélecteur de groupe qui défile avec le ruban serait le premier à
            disparaître, précisément quand on en a besoin. */}
        {mobile && groupes.length > 1 && (
          <button
            type="button"
            data-control-tiroir="groupes"
            aria-expanded={tiroir}
            aria-label="Choisir un groupe du ruban"
            onClick={() => setTiroir((v) => !v)}
            style={{
              flexShrink: 0,
              minWidth: 46,
              minHeight: 44,
              alignSelf: "center",
              margin: "0 2px 0 6px",
              border: "1px solid #e2ded7",
              borderRadius: 8,
              background: tiroir ? C.voile : "#fff",
              color: C.accentF,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            ☰
          </button>
        )}
        {debord.gauche && <ChevronRuban sens={-1} onClick={() => defiler(-1)} />}
        <div
          ref={barreRef}
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 14,
            height: 62,
            padding: "4px 10px",
            overflowX: "auto",
            overflowY: "hidden",
            background: "#fff",
            flex: 1,
            minWidth: 0,
          }}
        >
        {groupes.map((g) => (
          <div
            key={g.titre}
            data-groupe-ruban={g.titre}
            style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}
          >
            <div style={{ display: "flex", gap: 3, alignItems: "center", flex: 1 }}>
              {g.boutons.map((b) => (
                b.valeurs ? (
                  <SelecteurRuban key={b.id} bouton={b} onValeur={(v) => onControle(b.id, v)} />
                ) : (
                  <BoutonRuban
                    key={b.id}
                    bouton={b}
                    onClick={() => {
                      if (b.id === "w-inserer-tableau") {
                        setBoiteTableau(true)
                        /*
                         * ⚠️ ÉMETTRE QUAND MÊME. Ce bouton ouvre notre boîte de
                         * dialogue au lieu d'exécuter une commande — mais une
                         * étape peut légitimement demander de l'OUVRIR. Sans
                         * cette émission, le clic ne produit aucune
                         * observation : la boîte s'ouvre à l'écran et l'atelier
                         * reste bloqué sur la consigne, sans rien dire.
                         *
                         * L'insertion réelle, elle, part plus tard avec les
                         * dimensions — les deux signaux ne se marchent pas
                         * dessus.
                         */
                        onControle(b.id)
                        return
                      }
                      onControle(b.id)
                    }}
                  />
                )
              ))}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#9a938a",
                textAlign: "center",
                paddingTop: 2,
                borderTop: "1px solid #f0ede8",
              }}
            >
              {g.titre}
            </div>
          </div>
        ))}
        </div>
        {debord.droite && <ChevronRuban sens={1} onClick={() => defiler(1)} />}
      </div>

      {/* Le tiroir se SUPERPOSE au ruban au lieu de le pousser : le pousser
          changerait la hauteur de la zone de travail, et la surface se
          remesurerait sous les doigts de l'apprenant. */}
      {tiroir && mobile && (
        <>
          <div
            aria-hidden
            onClick={() => setTiroir(false)}
            style={{ position: "absolute", inset: 0, zIndex: 44, background: "rgba(10,20,16,.18)" }}
          />
          <div
            role="dialog"
            aria-label="Groupes du ruban"
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              top: 62,
              zIndex: 45,
              background: "#fff",
              border: "1px solid #e2ded7",
              borderRadius: 12,
              boxShadow: "0 14px 34px rgba(16,24,32,.20)",
              padding: 6,
              maxHeight: 280,
              overflowY: "auto",
            }}
          >
            {groupes.map((g) => (
              <button
                key={g.titre}
                type="button"
                data-groupe-aller={g.titre}
                onClick={() => allerAuGroupe(g.titre)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  minHeight: 44,
                  padding: "0 10px",
                  border: "none",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#2c2a26",
                  fontSize: 14,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span aria-hidden style={{ color: C.accentF }}>
                  {ICONES[g.boutons[0]?.id] ?? "•"}
                </span>
                {g.titre}
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9a938a" }}>
                  {g.boutons.length}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {boiteTableau && (
        <BoiteTableau
          lignes={lignes}
          colonnes={colonnes}
          setLignes={setLignes}
          setColonnes={setColonnes}
          onAnnuler={() => setBoiteTableau(false)}
          onValider={() => {
            setBoiteTableau(false)
            onControle("w-inserer-tableau", `${lignes}x${colonnes}`)
          }}
        />
      )}
    </div>
  )
}

/**
 * Un contrôle qui porte une valeur — taille, police, couleur.
 *
 * Rendu en liste déroulante plutôt qu'en bouton : c'est le seul rendu qui
 * permette à l'apprenant de FOURNIR la valeur que la commande exige. Le premier
 * élément est un intitulé non sélectionnable, pour que la liste dise ce qu'elle
 * règle sans un libellé séparé qui mangerait la largeur.
 */
/**
 * La flèche qui dit qu'il reste du ruban de ce côté.
 *
 * Rendue seulement quand il y a vraiment quelque chose à atteindre : une flèche
 * inerte apprendrait à l'apprenant à ne pas la regarder. Elle vit HORS de la
 * piste défilante (voir `debord` plus haut) — donc elle ne recouvre aucun bouton
 * et ne peut voler aucun clic.
 *
 * `aria-hidden` sur le glyphe seulement : le bouton garde son `aria-label`, la
 * flèche n'a rien à dicter à un lecteur d'écran.
 */
function ChevronRuban({ sens, onClick }: { sens: -1 | 1; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ruban-defiler={sens === 1 ? "droite" : "gauche"}
      aria-label={sens === 1 ? "Voir la suite du ruban" : "Revenir au début du ruban"}
      onClick={onClick}
      style={{
        flexShrink: 0,
        alignSelf: "center",
        minWidth: 26,
        minHeight: 44,
        margin: sens === 1 ? "0 4px 0 2px" : "0 2px 0 4px",
        border: "1px solid #e2ded7",
        borderRadius: 7,
        background: "#fff",
        color: C.accentF,
        fontSize: 15,
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      <span aria-hidden>{sens === 1 ? "›" : "‹"}</span>
    </button>
  )
}

function SelecteurRuban({
  bouton,
  onValeur,
}: {
  bouton: Bouton
  onValeur: (v: string) => void
}) {
  return (
    <select
      data-control={bouton.id}
      aria-label={LIBELLES_CONTROLES_WORD[bouton.id] ?? bouton.id}
      defaultValue=""
      onChange={(e) => {
        const v = e.target.value
        if (!v) return
        onValeur(v)
        e.target.value = ""
      }}
      style={{
        minHeight: 44,
        minWidth: bouton.large ? 92 : 66,
        // 16 px minimum : en dessous, iOS zoome sur le champ à la mise au point.
        fontSize: 16,
        border: "1px solid #e2ded7",
        borderRadius: 6,
        background: "#fff",
        color: "#2c2a26",
        padding: "2px 4px",
      }}
    >
      <option value="">{bouton.texte}</option>
      {(bouton.valeurs ?? []).map((v) => (
        <option key={v.valeur} value={v.valeur}>
          {v.libelle}
        </option>
      ))}
    </select>
  )
}

function BoutonRuban({ bouton, onClick }: { bouton: Bouton; onClick: () => void }) {
  const libelle = LIBELLES_CONTROLES_WORD[bouton.id] ?? bouton.id
  const pictogramme = ICONES[bouton.id]
  // Le pictogramme SUFFIT quand il est déjà la lettre du bouton (G, I, S) ;
  // partout ailleurs on garde le libellé sous l'icône, comme le vrai Word.
  const sansTexte = pictogramme != null && ICONE_SEULE.has(bouton.id)
  return (
    <button
      type="button"
      data-control={bouton.id}
      onClick={onClick}
      // `aria-label` porte le libellé complet ; le `title` natif est écarté,
      // comme dans le reste du LMS.
      aria-label={libelle}
      style={{
        // ≥ 44 px de côté : la cible tactile minimale tenue partout dans le LMS.
        minWidth: bouton.large ? 62 : 44,
        minHeight: 44,
        border: "1px solid transparent",
        borderRadius: 6,
        background: "transparent",
        color: "#2c2a26",
        fontSize: bouton.glyphe && !pictogramme ? 17 : 10.5,
        lineHeight: 1.15,
        padding: "2px 4px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        fontWeight: bouton.style === "gras" ? 700 : 400,
        fontStyle: bouton.style === "italique" ? "italic" : "normal",
        textDecoration:
          !pictogramme && bouton.style === "souligne"
            ? "underline"
            : !pictogramme && bouton.style === "barre"
            ? "line-through"
            : "none",
        // Le repli sur plusieurs lignes évite qu'un libellé long soit TRONQUÉ :
        // « Effacer règl… » sur 197 chapitres d'Excel n'enseignait rien.
        whiteSpace: "normal",
        wordBreak: "keep-all",
        textAlign: "center",
      }}
    >
      {pictogramme}
      {sansTexte ? null : pictogramme ? bouton.texte : bouton.glyphe ?? bouton.texte}
    </button>
  )
}

/**
 * « Insérer un tableau ».
 *
 * Univer en a une, native et déjà en français — mais elle n'apparaît que si l'on
 * garde sa chrome. La nôtre reste sous notre contrôle et émet l'argument
 * `LxC` que la surface transforme en commande.
 */
function BoiteTableau({
  lignes,
  colonnes,
  setLignes,
  setColonnes,
  onAnnuler,
  onValider,
}: {
  lignes: number
  colonnes: number
  setLignes: (n: number) => void
  setColonnes: (n: number) => void
  onAnnuler: () => void
  onValider: () => void
}) {
  const champ = (
    etiquette: string,
    valeur: number,
    poser: (n: number) => void,
    id: string,
  ) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ minWidth: 130 }}>{etiquette}</span>
      <input
        type="number"
        min={1}
        max={20}
        value={valeur}
        data-control={id}
        onChange={(e) => poser(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
        // 16 px minimum : en dessous, iOS zoome sur le champ à la mise au point.
        style={{ width: 76, fontSize: 16, padding: "6px 8px", border: "1px solid #d8d4cd", borderRadius: 6 }}
      />
    </label>
  )
  return (
    <div
      role="dialog"
      aria-label="Insérer un tableau"
      style={{
        position: "absolute",
        left: "50%",
        top: 96,
        transform: "translateX(-50%)",
        zIndex: 40,
        background: "#fff",
        border: "1px solid #d8d4cd",
        borderRadius: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,.16)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 300,
      }}
    >
      <strong style={{ fontSize: 14 }}>Insérer un tableau</strong>
      {champ("Nombre de lignes", lignes, setLignes, "w-tableau-lignes")}
      {champ("Nombre de colonnes", colonnes, setColonnes, "w-tableau-colonnes")}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          data-control="w-tableau-annuler"
          onClick={onAnnuler}
          style={{ minHeight: 44, padding: "0 14px", borderRadius: 8, border: "1px solid #d8d4cd", background: "#fff", cursor: "pointer" }}
        >
          Annuler
        </button>
        <button
          type="button"
          data-control="w-tableau-ok"
          onClick={onValider}
          style={{ minHeight: 44, padding: "0 18px", borderRadius: 8, border: "none", background: C.accentF, color: "#fff", cursor: "pointer", fontWeight: 600 }}
        >
          OK
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LA BARRE D'ÉTAT — bas de la fenêtre, sous le document
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Second composant exporté par ce fichier, et rendu APRÈS la surface.
 *
 * C'est la seule façon d'avoir la barre d'état SOUS le document : tant que tout
 * vit dans le même composant, elle s'affiche au-dessus — l'inverse de Word, et
 * exactement l'erreur qu'Excel avait dû corriger en extrayant son
 * `SimulationFooter`.
 *
 * Elle est PERMANENTE. Côté Excel, une barre qui n'apparaissait qu'en présence
 * de nombres sélectionnés faisait sauter la grille d'un pas à l'autre : la
 * hauteur changeait, et tout ce qui se pilotait au pixel dérivait d'une ligne.
 * Ici la fenêtre se terminait purement et simplement sur le bord de la page.
 *
 * Ce qu'elle affiche est VRAI et vérifiable à l'écran : le nombre de mots, celui
 * de la sélection quand il y en a une, la langue et le zoom. Aucun compteur de
 * pages : la surface n'en expose pas, et annoncer « Page 1 sur 1 » devant un
 * document de trois pages apprendrait une chose fausse.
 */
export function WordFooter({
  mots,
  caracteres,
  motsSelection,
}: {
  mots: number
  caracteres: number
  /** Mots réellement sélectionnés, ou `0`. Word l'affiche « 12 sur 340 ». */
  motsSelection: number
}) {
  const cell: React.CSSProperties = { flexShrink: 0, whiteSpace: "nowrap" }
  return (
    <div
      data-barre-etat-word
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 16,
        height: 26,
        padding: "0 10px",
        background: "#f6f4f0",
        borderTop: "1px solid #e6e3dd",
        fontSize: 11.5,
        color: "#5b554d",
        overflowX: "auto",
      }}
    >
      <span style={cell}>
        {motsSelection > 0
          ? `${motsSelection} sur ${mots} mot${mots > 1 ? "s" : ""}`
          : `${mots} mot${mots > 1 ? "s" : ""}`}
      </span>
      <span style={cell}>
        {caracteres} caractère{caracteres > 1 ? "s" : ""}
      </span>
      <span style={cell}>Français (France)</span>
      <span style={{ ...cell, marginLeft: "auto" }}>100 %</span>
    </div>
  )
}

/** Les identifiants réellement rendus — consommés par `check-controles`. */
export const CONTROLES_RENDUS: string[] = [
  ...CONTROLES_RUBAN_WORD,
  "w-tableau-lignes",
  "w-tableau-colonnes",
  "w-tableau-annuler",
  "w-tableau-ok",
]
