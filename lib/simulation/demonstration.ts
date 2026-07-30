/**
 * Ce que « Montrez-moi » doit faire voir, déduit de l'action attendue.
 *
 * POURQUOI CE FICHIER EXISTE
 * La première version ne savait montrer qu'UN geste, et seulement pour quatre
 * types d'action sur vingt-deux. Audit du 29/07/2026 sur les 1 883 étapes :
 *
 *   · 518 étapes interactives (31 %) n'avaient AUCUNE démonstration — mise en
 *     forme, glissement de plage, feuilles, tri, filtre, graphiques, tableaux
 *     croisés, mise en page, macros, zone Nom : rien ne se passait quand
 *     l'apprenant cliquait « Montrez-moi ».
 *   · 550 saisies de FORMULE s'arrêtaient avant le résultat.
 *   · 155 étapes attendaient plusieurs cellules et une seule était montrée.
 *
 * Soit trois étapes sur quatre mal servies. D'où cette refonte : un plan n'est
 * plus un geste mais une SÉQUENCE de gestes, et chaque type d'action sait
 * produire la sienne.
 *
 * Rien ici ne touche au DOM ni à React : les cibles sont décrites, le composant
 * les résout et les joue. C'est ce qui rend la couverture vérifiable sans
 * navigateur — `scripts/simulation/check-demonstration.ts` relit les 246
 * scénarios et signale toute étape qui resterait sans démonstration.
 */

import { PRESETS_MARGES, type Marges } from "./pagesetup"
import { CONTROLES_POSTE } from "./poste"
import type { RibbonTab, SimulationAction } from "./types"

/** Ce que le curseur doit viser. Le composant sait résoudre chaque forme. */
export type CibleDemo =
  | { k: "cellule"; ref: string }
  | { k: "plage"; ref: string }
  | { k: "enteteColonne"; col: string }
  | { k: "enteteLigne"; ligne: number }
  /** N'importe quel élément du châssis, par son sélecteur CSS. */
  | { k: "dom"; sel: string }
  /**
   * Aucun endroit précis : un raccourci clavier ne se produit nulle part à
   * l'écran. Le composant place alors les touches au centre de la feuille,
   * sans curseur — montrer une flèche de souris pour « Ctrl + W » serait faux.
   */
  | { k: "clavier" }

/** Un geste élémentaire de la démonstration. */
export type GesteDemo = {
  cible: CibleDemo
  /** Phrase courte affichée dans la bulle, au moment du geste. */
  bulle: string
  /** Texte tapé après le clic, s'il y en a un. */
  frappe?: string
  /** Cellule où écrire réellement la valeur, une fois la frappe finie. */
  ecrire?: { ref: string; valeur: string }
  /**
   * Nom de plage à créer POUR DE VRAI en jouant ce geste. Montrer la frappe dans
   * la zone Nom ne suffit pas : sans le nom en base, l'étape suivante qui écrit
   * `=SOMME(Depenses)` obtient `#NOM?`, et la validation refuse une cellule en
   * erreur — l'apprenant qui a demandé de l'aide se retrouvait coincé.
   */
  definir?: { nom: string; ref: string }
  /**
   * Sélectionne réellement cette référence en jouant le geste.
   *
   * Les plans de mise en forme, de tri et de filtre commencent par un geste
   * « sélectionner la plage » qui n'était que dessiné : le bouton pressé
   * ensuite s'appliquait donc à la sélection précédente, ou à rien.
   */
  selectionner?: string
  /**
   * Contrôle à presser POUR DE VRAI, avec l'argument attendu s'il en prend un.
   *
   * C'est ce qui manquait à toutes les étapes dont le résultat attendu n'est pas
   * une valeur de cellule — format, tri, filtre, mise en page, graphique,
   * tableau croisé, macro, poste de travail. La démonstration promenait le
   * curseur sur le bon bouton et la feuille ne changeait pas : l'apprenant
   * voyait un geste sans résultat, ce qui est précisément la définition d'une
   * démonstration incomplète. La validation de l'étape reste neutralisée
   * pendant l'opération, sinon la démonstration se saborderait en sautant à
   * l'étape suivante.
   */
  presser?: { id: string; arg?: string }
  /** Glissement : la cible est le point de départ, celle-ci l'arrivée. */
  glisserVers?: CibleDemo
  /**
   * Touches à faire voir, une par badge : `["Ctrl", "W"]`. Les 86 écrans de
   * lecture qui décrivent un raccourci n'avaient aucun moyen de le montrer —
   * `KEY` ne produisait pas de plan du tout.
   */
  touches?: string[]
  /** Double-clic : le geste s'affiche avec son « ×2 ». */
  double?: boolean
  /**
   * ILLUSTRATION : on désigne et on explique, personne ne fait un geste.
   *
   * Le calque traite ces gestes autrement — la phrase reste affichée pendant
   * toute la durée, le temps de la lire, et aucun badge « ⏎ Entrée » ne vient
   * suggérer une validation qui n'a pas lieu d'être.
   */
  illustration?: boolean
  /**
   * Onglet du ruban à ouvrir POUR DE VRAI en jouant ce geste.
   *
   * Le ruban ne rend que son onglet actif. Une démonstration qui pointait un
   * bouton rangé sous un autre onglet ne pouvait donc rien montrer : le
   * sélecteur ne trouvait rien, le geste se jouait à blanc — repère, curseur et
   * bulle absents — pendant que le compteur avançait jusqu'à « Revoir ». Et
   * c'était systématiquement le cas au moment où l'aide sert : l'apprenant qui
   * réclame « Montrez-moi » est précisément celui qui n'a pas trouvé l'onglet.
   * Montrer l'onglet ne suffit pas, il faut l'ouvrir, sinon le geste suivant
   * reste introuvable.
   */
  onglet?: RibbonTab
}

/**
 * Nom lisible d'une touche : `"Control+Home"` → `["Ctrl", "Origine"]`.
 * On écrit ce que l'apprenant voit sur son clavier, pas le code de l'événement.
 */
const NOM_TOUCHE: Record<string, string> = {
  control: "Ctrl", ctrl: "Ctrl", meta: "Cmd", alt: "Alt", shift: "Maj",
  enter: "Entrée", return: "Entrée", tab: "Tab", escape: "Échap", esc: "Échap",
  delete: "Suppr", backspace: "Retour arr.", home: "Origine", end: "Fin",
  pageup: "Page préc.", pagedown: "Page suiv.", space: "Espace",
  arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→",
  up: "↑", down: "↓", left: "←", right: "→",
}

export function libellerTouches(key: string): string[] {
  return key
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => NOM_TOUCHE[t.toLowerCase()] ?? (t.length === 1 ? t.toUpperCase() : t))
}

export type PlanDemo = {
  gestes: GesteDemo[]
  /** Libellés des pas suivis en bas de la feuille. */
  pas: string[]
}

/**
 * Ce que le plan doit savoir de l'écran au moment où la démonstration démarre.
 *
 * Un plan ne peut pas être déduit de la seule action : le même « ouvrir ce
 * classeur » se joue avec le bouton de validation de la boîte « Ouvrir » si elle
 * est affichée, et avec « Nouveau » si l'on part de l'accueil d'Excel. Sans ce
 * contexte, le plan visait le bouton d'une boîte fermée — donc rien.
 */
export type ContexteDemo = {
  /** Onglet du ruban ouvert. */
  onglet?: RibbonTab
  /** Boîte de dialogue du poste de travail ouverte, si le chapitre en a une. */
  boitePoste?: "aucune" | "enregistrer" | "ouvrir"
}

/* ─────────── correspondances format → bouton du ruban ─────────── */

const CTRL_NOMBRE: Record<string, string> = {
  monetaire: "acc-format-monetaire",
  pourcentage: "acc-pourcentage",
  date: "acc-format-date",
  nombre: "acc-format-nombre",
}
const CTRL_ALIGN: Record<string, string> = {
  left: "acc-aligner-gauche",
  center: "acc-aligner-centre",
  right: "acc-aligner-droite",
}
const CTRL_GRAPH: Record<string, string> = {
  histogramme: "ins-graph-histogramme",
  barres: "ins-graph-barres",
  courbes: "ins-graph-courbes",
  secteurs: "ins-graph-secteurs",
  aires: "ins-graph-aires",
  nuage: "ins-graph-nuage",
}
const CTRL_ORIENT: Record<string, string> = {
  portrait: "mep-orientation-portrait",
  paysage: "mep-orientation-paysage",
}
const CTRL_VUE: Record<string, string> = {
  normal: "aff-mode-normal",
  "mise-en-page": "aff-mode-mise-en-page",
  "sauts-de-page": "aff-mode-sauts-de-page",
}
const CTRL_FORMAT_PAGE: Record<string, string> = {
  A4: "mep-format-a4",
  A3: "mep-format-a3",
  Letter: "mep-format-letter",
}

/** Bouton correspondant à une mise en forme attendue. Null si indécidable. */
function boutonMiseEnForme(att: Record<string, unknown>): { id: string; nom: string } | null {
  if (typeof att.numberFormat === "string" && CTRL_NOMBRE[att.numberFormat])
    return { id: CTRL_NOMBRE[att.numberFormat], nom: `le format ${att.numberFormat}` }
  if (att.bold) return { id: "acc-gras", nom: "le bouton Gras" }
  if (att.italic) return { id: "acc-italique", nom: "le bouton Italique" }
  if (att.underline) return { id: "acc-souligne", nom: "le bouton Souligné" }
  if (typeof att.hAlign === "string" && CTRL_ALIGN[att.hAlign])
    return { id: CTRL_ALIGN[att.hAlign], nom: "l'alignement" }
  if (att.wrap) return { id: "acc-renvoyer-ligne", nom: "Renvoyer à la ligne" }
  if (att.background) return { id: "acc-remplissage", nom: "la couleur de fond" }
  if (att.color) return { id: "acc-couleur-police", nom: "la couleur du texte" }
  if (typeof att.fontSize === "number")
    return att.fontSize >= 12
      ? { id: "acc-taille-plus", nom: "agrandir la police" }
      : { id: "acc-taille-moins", nom: "réduire la police" }
  return null
}

const ctrl = (id: string): CibleDemo => ({ k: "dom", sel: `[data-control="${id}"]` })

/**
 * Sous quel onglet du ruban vit chaque bouton.
 *
 * Cette table double la structure de `SimulationChrome`, qui rend ses groupes
 * dans un `switch` sur l'onglet actif. La redondance est assumée : ce module est
 * pur — il ne peut pas interroger un composant — et
 * `scripts/simulation/check-demo-cibles.ts` relit le ruban pour vérifier que la
 * table ne dérive pas. Ajouter un bouton au ruban sans l'inscrire ici fait donc
 * échouer le contrôle, pas la démonstration en silence.
 *
 * Les contrôles ABSENTS de cette table sont ceux qui sont là en permanence :
 * barre de formule, zone Nom, onglets de feuille, et les panneaux qui se posent
 * par-dessus la feuille (mise en page, tableau croisé, macro, bureau).
 */
const ONGLET_DU_CONTROLE: Record<string, RibbonTab> = {
  "poste-ouvrir": "accueil", "poste-enregistrer": "accueil", "poste-enregistrer-sous": "accueil",
  "acc-coller": "accueil", "acc-copier": "accueil", "acc-gras": "accueil", "acc-italique": "accueil",
  "acc-souligne": "accueil", "acc-taille-plus": "accueil", "acc-taille-moins": "accueil",
  "acc-couleur-police": "accueil", "acc-remplissage": "accueil", "acc-bordures": "accueil",
  "acc-aligner-gauche": "accueil", "acc-aligner-centre": "accueil", "acc-aligner-droite": "accueil",
  "acc-fusionner": "accueil", "acc-renvoyer-ligne": "accueil", "acc-mfc-regle": "accueil",
  "acc-mfc-effacer": "accueil", "acc-format-monetaire": "accueil", "acc-pourcentage": "accueil",
  "acc-format-date": "accueil", "acc-format-nombre": "accueil", "acc-inserer": "accueil",
  "acc-supprimer": "accueil", "acc-format-largeur": "accueil", "acc-format-masquer": "accueil",
  "acc-format": "accueil", "acc-format-fleche": "accueil", "acc-somme-auto": "accueil",
  "acc-somme-auto-fleche": "accueil", "acc-recopier": "accueil", "acc-effacer": "accueil",
  "aff-figer-volets": "affichage", "aff-liberer-volets": "affichage",
  "dev-enregistrer-macro": "developpeur", "dev-arreter-enregistrement": "developpeur",
  "dev-references-relatives": "developpeur", "dev-macros": "developpeur",
  "don-tri-croissant": "donnees", "don-tri-decroissant": "donnees", "don-filtrer": "donnees",
  "don-effacer-filtre": "donnees", "don-convertir": "donnees", "don-valeur-cible": "donnees",
  "don-validation": "donnees", "don-effacer-validation": "donnees",
  "ins-tcd": "insertion", "ins-image-cellule": "insertion", "ins-graph-recommande": "insertion",
  "ins-graph-histogramme": "insertion", "ins-graph-barres": "insertion", "ins-graph-courbes": "insertion",
  "ins-graph-secteurs": "insertion", "ins-graph-aires": "insertion", "ins-graph-nuage": "insertion",
  "ins-graph-element-titre": "graph-creation", "ins-graph-element-titres-axes": "graph-creation",
  "ins-graph-element-legende": "graph-creation", "ins-graph-element-etiquettes": "graph-creation",
  "ins-graph-element-quadrillage": "graph-creation", "ins-graph-legende-droite": "graph-creation",
  "ins-graph-legende-bas": "graph-creation", "ins-graph-style-2": "graph-creation",
  "ins-graph-style-3": "graph-creation", "ins-graph-style-4": "graph-creation",
  "ins-graph-style-5": "graph-creation", "ins-graph-intervertir": "graph-creation",
  "ins-graph-selectionner-donnees": "graph-creation", "ins-graph-filtre-serie": "graph-creation",
  "ins-graph-supprimer-serie": "graph-creation", "ins-graph-modifier-type": "graph-creation",
  "ins-graph-couleur-serie": "graph-mise-en-forme", "ins-graph-forme-serie": "graph-mise-en-forme",
  "ins-graph-tendance-lineaire": "graph-mise-en-forme",
  "ins-graph-tendance-moyenne-mobile": "graph-mise-en-forme",
  "ins-graph-tendance-supprimer": "graph-mise-en-forme",
  "mep-zone-impression-definir": "mise-en-page", "mep-imprimer-titres": "mise-en-page",
  "mep-saut-inserer": "mise-en-page", "mep-saut-supprimer": "mise-en-page",
  "rev-commentaire": "revision", "rev-supprimer-commentaire": "revision",
  "tcd-actualiser": "tableau-creation", "tcd-source": "tableau-creation", "tcd-champs": "tableau-creation",
}

const LIBELLE_ONGLET: Record<string, string> = {
  accueil: "Accueil", insertion: "Insertion", "mise-en-page": "Mise en page",
  formules: "Formules", donnees: "Données", revision: "Révision", affichage: "Affichage",
  "graph-creation": "Création de graphique", "graph-mise-en-forme": "Mise en forme du graphique",
  "tableau-creation": "Création de tableau", developpeur: "Développeur",
}

/**
 * Rend un plan AGISSANT : ses gestes de sélection sélectionnent vraiment, ses
 * gestes de clic pressent vraiment.
 *
 * Les plans décrivent depuis toujours la bonne séquence — « sélectionner
 * C7:C11 », puis « cliquer le format monétaire ». Mais rien n'était exécuté :
 * seule l'écriture de cellules l'était. Résultat, sur toutes les étapes dont le
 * résultat attendu n'est pas une valeur — mise en forme, tri, filtre, mise en
 * page, graphique, tableau croisé, macro, poste de travail — le curseur se
 * promenait sur le bon bouton et la feuille ne changeait pas. L'apprenant voyait
 * un geste sans résultat.
 *
 * La règle est volontairement mécanique, pour ne pas dépendre de vingt-deux cas
 * particuliers : un geste qui vise une cellule ou une plage la sélectionne ; un
 * geste qui vise un `data-control` sans rien taper le presse. Les exceptions
 * sont posées à la source, dans les plans qui savent ce qu'ils font — un geste
 * qui ouvre un onglet, ou qui a déjà son `presser` avec un argument.
 */
/**
 * Contrôles que la démonstration MONTRE sans les exécuter.
 *
 * Insérer ou supprimer une ligne n'est pas idempotent : si la démonstration le
 * fait et que l'apprenant refait ensuite le geste lui-même — ce qu'on l'invite à
 * faire — la ligne est insérée deux fois et l'étape devient infranchissable.
 * Pour ces quelques boutons, montrer sans agir reste le moindre mal ; le geste
 * garde son repère, sa bulle et son curseur.
 *
 * Tous les autres sont rejouables sans dommage : reposer un format, un
 * alignement, un tri, un filtre, un réglage de page ou une transition du poste
 * de travail donne deux fois le même résultat. Coller en fait partie — le même
 * contenu au même endroit — et l'y avoir mis un moment cassait le module 26,
 * dont les étapes suivantes divisent par la donnée collée : sans le collage,
 * `#DIV/0!`.
 */
const SANS_EXECUTION = ["acc-inserer", "acc-supprimer"]

function rendreAgissant(plan: PlanDemo): PlanDemo {
  return {
    ...plan,
    gestes: plan.gestes.map((g) => {
      const sortie = { ...g }
      if (!sortie.selectionner && !sortie.glisserVers && (g.cible.k === "cellule" || g.cible.k === "plage"))
        sortie.selectionner = g.cible.ref
      if (!sortie.presser && !sortie.onglet && !sortie.frappe && g.cible.k === "dom") {
        const m = /\[data-control="([^"]+)"\]/.exec(g.cible.sel)
        if (m && !SANS_EXECUTION.includes(m[1])) sortie.presser = { id: m[1] }
      }
      return sortie
    }),
  }
}

/** Onglet requis par le premier bouton de ruban d'un plan, s'il y en a un. */
function ongletRequis(plan: PlanDemo): RibbonTab | null {
  for (const g of plan.gestes) {
    if (g.cible.k !== "dom") continue
    const m = /\[data-control="([^"]+)"\]/.exec(g.cible.sel)
    if (m && ONGLET_DU_CONTROLE[m[1]]) return ONGLET_DU_CONTROLE[m[1]]
  }
  return null
}

/**
 * Écrit une valeur attendue comme un apprenant la taperait dans un Excel
 * français, virgule décimale comprise.
 *
 * POURQUOI CE DÉTOUR
 * `String(21.5)` donne « 21.5 », et la grille — conformément à Excel français,
 * qui accepte le point comme séparateur de date — y lit le 21 mai : la cellule
 * recevait le numéro de série 46163 au lieu du nombre 21,5, et la somme d'à côté
 * affichait 46 329,8. La démonstration enseignait donc un résultat faux, en
 * silence, sur toute valeur décimale dont les deux parties ressemblent à un jour
 * et à un mois. Voir `lib/simulation/date-fr.ts`.
 */
function commeTape(v: unknown): string {
  return typeof v === "number" ? String(v).replace(".", ",") : String(v)
}

/** Nom du préréglage de marges correspondant, `null` si valeurs personnalisées. */
function presetMarges(m: Marges): keyof typeof PRESETS_MARGES | null {
  for (const nom of Object.keys(PRESETS_MARGES) as (keyof typeof PRESETS_MARGES)[]) {
    const p = PRESETS_MARGES[nom]
    if (p.haut === m.haut && p.bas === m.bas && p.gauche === m.gauche && p.droite === m.droite) return nom
  }
  return null
}

/** Étiquette lisible d'une plage : « B2 à D4 ». */
function lieu(ref: string): string {
  return ref.includes(":") ? ref.replace(":", " à ") : ref
}

/**
 * Séquence de gestes d'une étape. `null` seulement quand l'action ne se montre
 * décidément pas — auquel cas l'atelier garde la réponse écrite.
 *
 * `ongletCourant` est l'onglet du ruban ouvert au moment où la démonstration
 * démarre. Quand le geste attendu vit sous un AUTRE onglet, un premier geste est
 * ajouté pour l'ouvrir : sans lui, le bouton n'est pas dans la page et le geste
 * se joue à blanc. L'argument est facultatif pour que les contrôles hors
 * navigateur continuent d'appeler la fonction avec la seule action.
 */
export function planDemonstration(
  action: SimulationAction,
  contexte?: RibbonTab | ContexteDemo,
): PlanDemo | null {
  const ctx: ContexteDemo = typeof contexte === "string" ? { onglet: contexte } : (contexte ?? {})
  const brut = planBrut(action, ctx)
  const plan = brut ? rendreAgissant(brut) : null
  if (!plan || !ctx.onglet) return plan
  const requis = ongletRequis(plan)
  if (!requis || requis === ctx.onglet) return plan
  return {
    gestes: [
      {
        cible: { k: "dom", sel: `[data-ribbon-tab="${requis}"]` },
        bulle: `l'onglet ${LIBELLE_ONGLET[requis] ?? requis}`,
        onglet: requis,
      },
      ...plan.gestes,
    ],
    pas: [`Ouvrir l'onglet ${LIBELLE_ONGLET[requis] ?? requis}`, ...plan.pas],
  }
}

function planBrut(action: SimulationAction, ctx: ContexteDemo): PlanDemo | null {
  const A = action as SimulationAction & Record<string, unknown>

  switch (action.type) {
    /* ── saisies ─────────────────────────────────────────────────────── */
    case "TYPE": {
      const quoi = action.accept?.[0]
      if (!quoi) return null
      if (action.target === "formula-bar") {
        return {
          gestes: [{ cible: { k: "dom", sel: '[aria-label="Barre de formule"]' }, bulle: "la barre de formule", frappe: quoi }],
          pas: ["Cliquer la barre de formule", "Saisir", "Valider"],
        }
      }
      return {
        gestes: [
          {
            cible: { k: "cellule", ref: action.target },
            bulle: `la cellule ${action.target}`,
            frappe: quoi,
            // On ÉCRIT vraiment : le moteur calcule, et l'apprenant voit le
            // résultat d'une formule au lieu de la formule elle-même.
            ecrire: { ref: action.target, valeur: quoi },
          },
        ],
        pas: ["Cliquer la cellule", "Saisir", "Valider"],
      }
    }

    case "EXPECT_STATE": {
      const entrees = Object.entries(action.cells)
      if (entrees.length === 0) return null
      // Toutes les cellules attendues, pas seulement la première : c'était le
      // deuxième défaut le plus fréquent de l'ancienne version.
      const gestes: GesteDemo[] = []
      for (const [ref, att] of entrees) {
        const quoi = att.f ?? att.anyOf?.[0] ?? (att.v !== undefined ? commeTape(att.v) : null)
        if (quoi === null) continue
        if (quoi === "") {
          // Cellule attendue VIDE : c'est un effacement, pas une saisie. Le
          // geste se montre quand même — il se tapait dans le vide autrement.
          gestes.push({ cible: { k: "cellule", ref }, bulle: `${ref} : effacer avec Suppr`, ecrire: { ref, valeur: "" } })
          continue
        }
        gestes.push({
          cible: { k: "cellule", ref },
          bulle: `${ref} : ${quoi}`,
          frappe: quoi,
          ecrire: { ref, valeur: quoi },
        })
      }
      if (gestes.length === 0) return null
      return {
        gestes,
        pas: gestes.every((g) => !g.frappe)
          ? ["Cliquer la cellule", "Effacer"]
          : gestes.length > 1
            ? ["Cliquer chaque cellule", "Saisir", "Valider"]
            : ["Cliquer la cellule", "Saisir", "Valider"],
      }
    }

    /* ── sélections ──────────────────────────────────────────────────── */
    case "CLICK_CELL":
      return { gestes: [{ cible: { k: "cellule", ref: action.cell }, bulle: `la cellule ${action.cell}` }], pas: ["Cliquer la cellule"] }

    case "CLICK_CELL_MODIFIER":
      return {
        gestes: [{ cible: { k: "cellule", ref: action.cell }, bulle: `Ctrl + clic sur ${action.cell}` }],
        pas: ["Garder Ctrl enfoncé", "Cliquer la cellule"],
      }

    case "DRAG_RANGE": {
      const [de, a] = action.range.split(":")
      return {
        gestes: [
          {
            cible: { k: "cellule", ref: de },
            glisserVers: { k: "cellule", ref: a ?? de },
            bulle: `glisser de ${de} à ${a ?? de}`,
          },
        ],
        pas: ["Cliquer le premier coin", "Glisser jusqu'au dernier"],
      }
    }

    case "SELECT_COLUMN":
      return {
        gestes: [{ cible: { k: "enteteColonne", col: action.column }, bulle: `l'en-tête de la colonne ${action.column}` }],
        pas: ["Cliquer l'en-tête de colonne"],
      }

    case "SELECT_ROW":
      return {
        gestes: [{ cible: { k: "enteteLigne", ligne: action.row }, bulle: `l'en-tête de la ligne ${action.row}` }],
        pas: ["Cliquer l'en-tête de ligne"],
      }

    case "SELECT_SHEET":
      return {
        gestes: [{ cible: { k: "dom", sel: `[aria-label="Feuille ${action.name}"]` }, bulle: `l'onglet ${action.name}` }],
        pas: ["Cliquer l'onglet de feuille"],
      }

    /* ── zone Nom ────────────────────────────────────────────────────── */
    case "GOTO_REF":
      return {
        gestes: [{ cible: { k: "dom", sel: '[aria-label="Zone Nom"]' }, bulle: `saisir ${action.ref}`, frappe: action.ref }],
        pas: ["Cliquer la zone Nom", "Saisir la référence", "Valider"],
      }

    // La démonstration montrait la frappe dans la zone Nom mais ne créait PAS le
    // nom, et aucun `setup` ne le rattrapait : l'apprenant qui demandait de l'aide
    // ici arrivait à l'étape suivante avec `=SOMME(Depenses)` → `#NOM?`, que la
    // validation refuse. Il était bloqué pour de bon. Le nom est donc défini pour
    // de vrai, et la plage est d'abord sélectionnée comme le disent les pas.
    case "DEFINE_NAME": {
      // La plage peut ne pas être déclarée : l'étape nomme alors ce que
      // l'apprenant a sélectionné, et il n'y a rien à sélectionner ni à créer
      // à sa place.
      const ref = action.ref
      return {
        gestes: [
          ...(ref ? [{ cible: { k: "plage" as const, ref }, bulle: `la plage ${ref}` }] : []),
          {
            cible: { k: "dom", sel: '[aria-label="Zone Nom"]' },
            bulle: `nommer « ${action.name} »`,
            frappe: action.name,
            ...(ref ? { definir: { nom: action.name, ref } } : {}),
          },
        ],
        pas: ref
          ? ["Sélectionner la plage", "Cliquer la zone Nom", "Saisir le nom"]
          : ["Cliquer la zone Nom", "Saisir le nom"],
      }
    }

    /* ── boutons du ruban ────────────────────────────────────────────── */
    case "CLICK_CONTROL":
      return { gestes: [{ cible: ctrl(action.control), bulle: "ce bouton du ruban" }], pas: ["Cliquer le bouton"] }

    case "EXPECT_FORMAT": {
      const entrees = Object.entries(action.cells)
      if (entrees.length === 0) return null
      const refs = entrees.map(([r]) => r)
      const bouton = boutonMiseEnForme(entrees[0][1] as Record<string, unknown>)
      if (!bouton) return null
      const plage = refs.length > 1 ? `${refs[0]}:${refs[refs.length - 1]}` : refs[0]
      return {
        gestes: [
          { cible: refs.length > 1 ? { k: "plage", ref: plage } : { k: "cellule", ref: refs[0] }, bulle: `sélectionner ${lieu(plage)}` },
          { cible: ctrl(bouton.id), bulle: bouton.nom },
        ],
        pas: ["Sélectionner", "Cliquer le bouton"],
      }
    }

    case "SORT_RANGE":
      return {
        gestes: [
          { cible: { k: "cellule", ref: action.range.split(":")[0] }, bulle: "cliquer dans le tableau" },
          { cible: ctrl(action.ascending ? "don-tri-croissant" : "don-tri-decroissant"), bulle: `trier ${action.ascending ? "de A à Z" : "de Z à A"}` },
        ],
        pas: ["Cliquer dans la colonne", "Cliquer le tri"],
      }

    case "FILTER_COLUMN":
      return {
        gestes: [{ cible: ctrl("don-filtrer"), bulle: "le bouton Filtrer" }],
        pas: ["Poser le filtre", "Choisir la valeur"],
      }

    case "EXPECT_CHART": {
      const type = typeof A.chartType === "string" ? A.chartType : undefined
      const id = (type && CTRL_GRAPH[type]) || "ins-graph-histogramme"
      const plage = typeof A.range === "string" ? A.range : null
      const gestes: GesteDemo[] = []
      if (plage) gestes.push({ cible: { k: "plage", ref: plage }, bulle: `sélectionner ${lieu(plage)}` })
      gestes.push({ cible: ctrl(id), bulle: type ? `le graphique ${type}` : "insérer un graphique" })
      return { gestes, pas: plage ? ["Sélectionner les données", "Insérer le graphique"] : ["Insérer le graphique"] }
    }

    case "SELECT_CHART_ELEMENT":
      return {
        gestes: [{ cible: { k: "dom", sel: "[data-chart-element]" }, bulle: "l'élément du graphique" }],
        pas: ["Cliquer l'élément"],
      }

    case "EXPECT_PIVOT": {
      const plage = typeof A.source === "string" ? A.source : null
      const gestes: GesteDemo[] = []
      if (plage) gestes.push({ cible: { k: "plage", ref: plage }, bulle: `sélectionner ${lieu(plage)}` })
      gestes.push({ cible: ctrl("ins-tcd"), bulle: "insérer un tableau croisé" })
      return { gestes, pas: plage ? ["Sélectionner les données", "Insérer le tableau croisé"] : ["Insérer le tableau croisé"] }
    }

    case "EXPECT_PAGE_SETUP": {
      const p = (A.pageSetup ?? {}) as Record<string, unknown>
      if (typeof p.orientation === "string" && CTRL_ORIENT[p.orientation])
        return { gestes: [{ cible: ctrl(CTRL_ORIENT[p.orientation]), bulle: `l'orientation ${p.orientation}` }], pas: ["Cliquer l'orientation"] }
      if (typeof p.format === "string" && CTRL_FORMAT_PAGE[p.format])
        return { gestes: [{ cible: ctrl(CTRL_FORMAT_PAGE[p.format]), bulle: `le format ${p.format}` }], pas: ["Cliquer le format"] }
      // Le panneau de mise en page n'a pas de bouton « Marges » ni « Ajuster » :
      // il offre les trois préréglages de marges et deux listes d'ajustement.
      // Viser `mep-marges` / `mep-ajuster` désignait donc du vide, et cinq
      // étapes des modules 13 montraient un geste invisible.
      if (p.margins) {
        const nom = presetMarges(p.margins as Marges)
        if (nom) {
          const dit = nom === "normales" ? "normales" : nom === "larges" ? "larges" : "étroites"
          return { gestes: [{ cible: ctrl(`mep-marges-${nom}`), bulle: `les marges ${dit}` }], pas: ["Régler les marges"] }
        }
        // Marges personnalisées : aucun préréglage ne correspond, on ouvre le
        // panneau plutôt que de désigner un bouton au hasard.
        return { gestes: [{ cible: { k: "dom", sel: '[data-ribbon-tab="mise-en-page"]' }, bulle: "l'onglet Mise en page", onglet: "mise-en-page" }], pas: ["Ouvrir Mise en page"] }
      }
      // Le mode d'affichage a son propre sélecteur dans le panneau. Sans ce cas,
      // « passez en mode Mise en page » retombait sur le clic d'onglet — donc la
      // vue ne changeait pas, et l'étape SUIVANTE visait la zone d'en-tête, qui
      // n'existe QUE dans cette vue : geste invisible en cascade (modules 13).
      if (typeof p.view === "string" && CTRL_VUE[p.view])
        return { gestes: [{ cible: ctrl(CTRL_VUE[p.view]), bulle: `le mode ${p.view === "mise-en-page" ? "Mise en page" : p.view}` }], pas: ["Changer de mode d'affichage"] }
      if (p.scaleToFit) {
        const st = p.scaleToFit as { largeur?: number; hauteur?: number }
        const gestes: GesteDemo[] = []
        if (st.largeur != null)
          gestes.push({ cible: ctrl("mep-ajuster-largeur"), bulle: `ajuster à ${st.largeur} page en largeur` })
        if (st.hauteur != null)
          gestes.push({ cible: ctrl("mep-ajuster-hauteur"), bulle: `ajuster à ${st.hauteur} page en hauteur` })
        if (gestes.length) return { gestes, pas: ["Régler l'ajustement"] }
      }
      // Repli : ouvrir l'onglet Mise en page — et l'ouvrir POUR DE VRAI, sinon
      // le geste ne fait que le désigner.
      return { gestes: [{ cible: { k: "dom", sel: '[data-ribbon-tab="mise-en-page"]' }, bulle: "l'onglet Mise en page", onglet: "mise-en-page" }], pas: ["Ouvrir Mise en page"] }
    }

    // Les identifiants du ruban sont `dev-enregistrer-macro` et
    // `dev-arreter-enregistrement` ; les 21 étapes du module 27 visaient
    // `dev-macro-enregistrer` / `dev-macro-arreter`, qui n'existent nulle part —
    // toutes leurs démonstrations se jouaient donc à blanc.
    case "RECORD_MACRO":
      return {
        gestes: [
          {
            cible: ctrl(action.expect === "started" ? "dev-enregistrer-macro" : "dev-arreter-enregistrement"),
            bulle: action.expect === "started" ? "démarrer l'enregistrement" : "arrêter l'enregistrement",
          },
        ],
        pas: [action.expect === "started" ? "Démarrer l'enregistrement" : "Arrêter l'enregistrement"],
      }

    case "EXPECT_MACRO":
      return {
        gestes: [{ cible: ctrl("dev-enregistrer-macro"), bulle: "enregistrer une macro" }],
        pas: ["Enregistrer la macro"],
      }

    /* ── poste de travail ────────────────────────────────────────────── */
    case "EXPECT_POSTE": {
      const p = action.poste
      const g = (id: string, bulle: string): PlanDemo => ({ gestes: [{ cible: ctrl(id), bulle }], pas: ["Cliquer"] })
      // La boîte OUVERTE décide du bouton. Sans elle, « ouvrir Devis-2026-014 »
      // depuis la boîte « Ouvrir » visait le bouton de validation de la boîte
      // « Enregistrer sous » — absent de la page, donc geste invisible.
      if (p.classeur || p.fichiers?.length) {
        // Les boutons de validation du poste prennent le nom du fichier en
        // argument : sans lui, presser « Enregistrer » enregistrerait sous un
        // nom vide.
        const nom = p.classeur ?? p.fichiers?.[0]
        if (ctx.boitePoste === "ouvrir") {
          return {
            gestes: [
              ...(nom ? [{ cible: ctrl(CONTROLES_POSTE.listeFichier(nom)), bulle: `le fichier ${nom}` }] : []),
              {
                cible: ctrl("poste-ouvrir-valider"),
                bulle: "valider l'ouverture",
                presser: { id: "poste-ouvrir-valider", arg: nom },
              },
            ],
            pas: nom ? ["Choisir le fichier", "Ouvrir"] : ["Ouvrir"],
          }
        }
        return {
          gestes: [
            {
              cible: ctrl("poste-enregistrer-valider"),
              bulle: "valider l'enregistrement",
              presser: { id: "poste-enregistrer-valider", arg: nom },
            },
          ],
          pas: ["Cliquer"],
        }
      }
      if (p.boite === "enregistrer") return g("poste-enregistrer", "le bouton Enregistrer")
      if (p.boite === "ouvrir") return g("poste-ouvrir", "le bouton Ouvrir")
      if (p.menu) return g("poste-demarrer", "le bouton Démarrer")
      if (p.excel === "accueil") return g("poste-app-excel", "l'application Excel")
      if (p.excel === "ferme") return g("poste-fermer", "fermer la fenêtre")
      if (p.excel === "classeur") return g("poste-nouveau", "un nouveau classeur")
      return null
    }

    /* ── gestes clavier et souris purs ───────────────────────────────── */
    case "KEY": {
      const touches = libellerTouches(action.key)
      return {
        gestes: [{ cible: { k: "clavier" }, bulle: touches.join(" + "), touches }],
        pas: [`Appuyer sur ${touches.join(" + ")}`],
      }
    }

    case "DOUBLE_CLICK": {
      // La cible est une cellule (« B4 ») ou un contrôle du châssis.
      const t = action.target
      const cible: CibleDemo = /^[A-Z]+\d+$/i.test(t)
        ? { k: "cellule", ref: t.toUpperCase() }
        : { k: "dom", sel: `[data-control="${t}"]` }
      return {
        gestes: [{ cible, bulle: `double-clic sur ${t}`, double: true }],
        pas: ["Double-cliquer"],
      }
    }

    case "CONTEXT_MENU": {
      const t = action.target
      const cible: CibleDemo = /^[A-Z]+\d+$/i.test(t)
        ? { k: "cellule", ref: t.toUpperCase() }
        : { k: "dom", sel: `[data-control="${t}"]` }
      return {
        gestes: [{ cible, bulle: `clic droit sur ${t}`, touches: ["Clic droit"] }],
        pas: ["Ouvrir le menu contextuel"],
      }
    }

    /**
     * Illustration pure : on désigne, on explique, on ne feint aucun geste.
     * C'est ce qui permet d'équiper les écrans « À lire » qui parlent d'une
     * notion plutôt que d'une manipulation.
     */
    case "MONTRER": {
      const c = action.cible.trim()
      let cible: CibleDemo
      if (c === "ecran" || c === "") cible = { k: "clavier" }
      else if (c.startsWith("ctrl:")) cible = ctrl(c.slice(5))
      else if (c.startsWith("dom:")) cible = { k: "dom", sel: c.slice(4) }
      else if (c.startsWith("col:")) cible = { k: "enteteColonne", col: c.slice(4).toUpperCase() }
      else if (c.startsWith("ligne:")) cible = { k: "enteteLigne", ligne: Number(c.slice(6)) }
      else if (/^\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+$/i.test(c)) cible = { k: "plage", ref: c.toUpperCase() }
      else if (/^\$?[A-Z]+\$?\d+$/i.test(c)) cible = { k: "cellule", ref: c.toUpperCase() }
      else cible = { k: "dom", sel: c }
      return {
        gestes: [
          {
            cible,
            bulle: action.texte,
            illustration: true,
            ...(action.ecrire ? { ecrire: { ref: action.ecrire.cell, valeur: action.ecrire.valeur } } : {}),
          },
        ],
        // Aucun pas : une illustration ne se décompose pas en gestes à refaire,
        // et quatre pastilles « Regarder » identiques ne disaient rien. Le
        // compteur « i / n » suffit à situer l'avancement.
        pas: [],
      }
    }

    case "FILL_HANDLE":
      return null

    default:
      return null
  }
}
