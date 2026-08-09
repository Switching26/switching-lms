/**
 * CE QUE L'ÉCRAN « trop petit » DESSINE À DROITE : l'application de l'atelier.
 *
 * POURQUOI CE FICHIER EXISTE
 * `EcranTropPetit` disait « Vous y pilotez une vraie fenêtre Word » sous un dessin
 * de TABLEUR — grille, bandeau vert, onglets de feuille. Le texte était déjà propre
 * à chaque application depuis le 09/08 ; le dessin, lui, était unique et copié
 * d'Excel. Un apprenant Word, PowerPoint ou Outlook voyait donc l'écran d'une
 * formation qui n'est pas la sienne, au moment précis où on lui explique ce qu'il
 * ne peut pas ouvrir.
 *
 * ═══ POURQUOI DES DONNÉES ET NON DU JSX ═══
 *
 * Le dessin est décrit ici en FORMES, et `EcranTropPetit` ne fait que les rendre.
 * C'est ce qui rend la règle vérifiable par `scripts/simulation/check-illustration-atelier.ts`
 * sans navigateur et sans React — exactement comme `verdictEcranAtelier` l'est pour
 * les seuils de taille. Un contrôle qui lirait le composant EN TEXTE tomberait à la
 * première réécriture du JSX : c'est le piège qui a produit 104 fausses anomalies
 * le jour où le ruban de Word a changé de fichier.
 *
 * ═══ LA COULEUR NE SE REDÉCLARE PAS ICI ═══
 *
 * Les teintes viennent de `PALETTES` (`lib/simulation/couleurs.ts`), source unique
 * des quatre applications. Deux tables auraient divergé au premier ajustement.
 *
 * ⚠️ Et elles sont lues EN JAVASCRIPT, jamais par `var(--sim-accent)` : cet écran
 * est rendu dans les enfants de `CadranFormation`, alors que les variables CSS des
 * applications sont posées par `SimulationChapter` — qui n'est justement PAS monté
 * quand l'écran est trop petit. Une expression `var()` retomberait donc toujours sur
 * son repli, c'est-à-dire sur le vert d'Excel : le défaut qu'on corrige.
 */

import { PALETTES, type AppSim } from "./couleurs"

/* ═══════════ QUELLE APPLICATION ═══════════ */

/**
 * La valeur brute de `Simulation.app` ramenée aux quatre applications connues.
 *
 * `null` pour tout le reste — une application ajoutée plus tard ne doit pas être
 * dessinée comme Excel « par défaut », elle prend le repli générique.
 *
 * La colonne est une énumération Prisma (`SimulationApp`), donc toujours en
 * majuscules ; le nettoyage est une ceinture, pas une hypothèse.
 */
export function normaliserAppAtelier(app: string | null | undefined): AppSim | null {
  switch ((app || "").trim().toUpperCase()) {
    case "EXCEL":
      return "EXCEL"
    case "WORD":
      return "WORD"
    case "POWERPOINT":
      return "POWERPOINT"
    case "OUTLOOK":
      return "OUTLOOK"
    default:
      return null
  }
}

/* ═══════════ LE VOCABULAIRE DE DESSIN ═══════════ */

/**
 * Le rôle d'une forme, quand il porte une RÈGLE et pas seulement du décor.
 *
 * `bandeau` : la barre de titre de la fenêtre, qui porte la couleur de l'application.
 * `quadrillage` : les lignes d'un tableur. Propre à Excel — c'est ce que le contrôle
 * interdit ailleurs, et c'était tout le défaut.
 */
export type RoleForme = "bandeau" | "quadrillage"

export type FormeIllustration =
  | { k: "rect"; x: number; y: number; w: number; h: number; rx?: number; fill?: string; stroke?: string; sw?: number; opacite?: number; role?: RoleForme }
  | { k: "chemin"; d: string; fill?: string; stroke?: string; sw?: number; role?: RoleForme }
  | { k: "cercle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }

/** Les cinq dessins possibles — les quatre applications, plus le repli. */
export type VarianteIllustration = AppSim | "GENERIQUE"

export type IllustrationAtelier = {
  /** Laquelle des cinq est dessinée. */
  variante: VarianteIllustration
  /** L'accent de l'application : bandeau, pastille de non-lu, coche de fin. */
  accent: string
  /** Ce qui se dessine DANS le cadre de la fenêtre, bandeau compris. */
  formes: FormeIllustration[]
}

/* ═══════════ LES ENCRES NEUTRES DU LMS ═══════════ */

/*
 * Reprises telles quelles du dessin d'origine : c'est ce qui garde l'illustration
 * dans la même famille graphique que le reste de la carte (téléphone, flèche).
 */
const TRAIT = "#e8e2d8" // filets et lignes de texte
const TRAIT_FIN = "#f3efe8" // séparations très discrètes
const ENCRE_TITRE = "#b5a898" // un titre, un expéditeur non lu
const ENCRE_SOURDE = "#d4cbc0" // un message déjà lu

/**
 * Le repli, pour une application que ce fichier ne connaît pas encore.
 *
 * Volontairement NEUTRE et non tirée de `PALETTES` : reprendre l'accent d'Excel
 * ramènerait exactement le défaut corrigé ici. `#655a4d` est l'encre chaude qui
 * dessine déjà le cadre de la fenêtre.
 */
const NEUTRE = { accent: "#655a4d", voile: "#f3efe8", voileBord: "#e8e2d8" }

/* ═══════════ LA FENÊTRE ═══════════ */

/*
 * Géométrie commune, inchangée depuis le dessin d'origine : la fenêtre occupe
 * x 124,5 → 201,5 et y 24,5 → 87,5 dans un `viewBox` de 216 × 112. Le cadre et la
 * coche sont dessinés par le composant ; ici commence le bandeau.
 */
const BANDEAU = "M124.5 31.5a7 7 0 017-7h63a7 7 0 017 7v3.5h-77v-3.5z"

/** Le bandeau coloré et ses trois pastilles — l'en-tête de toute fenêtre. */
function barreDeTitre(accent: string): FormeIllustration[] {
  return [
    { k: "chemin", d: BANDEAU, fill: accent, role: "bandeau" },
    { k: "rect", x: 130, y: 28.5, w: 9, h: 2.6, rx: 1.3, fill: "#fff", opacite: 0.6 },
    { k: "rect", x: 142, y: 28.5, w: 9, h: 2.6, rx: 1.3, fill: "#fff", opacite: 0.6 },
    { k: "rect", x: 154, y: 28.5, w: 9, h: 2.6, rx: 1.3, fill: "#fff", opacite: 0.6 },
  ]
}

/* ═══════════ LES CINQ DESSINS ═══════════ */

/**
 * EXCEL — la feuille de calcul.
 *
 * ⚠️ REPRODUIT À L'IDENTIQUE le dessin qui existait avant ce fichier : mêmes
 * coordonnées, mêmes teintes, même ordre. Excel ne doit pas bouger d'un pixel,
 * c'est la seule application dont des apprenants suivent la formation aujourd'hui.
 */
function excel(): FormeIllustration[] {
  const p = PALETTES.EXCEL
  return [
    ...barreDeTitre(p.accent),
    // Les lignes du tableur : quatre horizontales, trois verticales.
    { k: "chemin", d: "M124.5 45.5h77M124.5 56.5h77M124.5 67.5h77M124.5 78.5h77", stroke: TRAIT, sw: 1.1, role: "quadrillage" },
    { k: "chemin", d: "M143.5 35v52.5M162.5 35v52.5M181.5 35v52.5", stroke: TRAIT, sw: 1.1, role: "quadrillage" },
    // Deux cellules remplies : ce qui fait lire « tableur » et non « grille ».
    { k: "rect", x: 145, y: 47, w: 16, h: 8, rx: 1.6, fill: p.voile },
    { k: "rect", x: 164, y: 58, w: 16, h: 8, rx: 1.6, fill: p.voile },
  ]
}

/**
 * WORD — la page d'un document : une règle, un titre, des paragraphes.
 *
 * Aucun quadrillage : c'est précisément ce qui distinguait mal Word d'Excel.
 * Le point d'insertion en accent rappelle qu'on écrit ici.
 */
function word(): FormeIllustration[] {
  const p = PALETTES.WORD
  return [
    ...barreDeTitre(p.accent),
    // La règle et ses graduations, juste sous le ruban.
    { k: "chemin", d: "M131 40.5h64", stroke: TRAIT, sw: 1.1 },
    { k: "chemin", d: "M139 38.8v3.4M147 38.8v3.4M155 38.8v3.4M163 38.8v3.4M171 38.8v3.4M179 38.8v3.4M187 38.8v3.4", stroke: TRAIT_FIN, sw: 1 },
    // Un titre, puis un paragraphe qui se termine court, puis un second.
    { k: "rect", x: 131, y: 46, w: 28, h: 3.6, rx: 1.8, fill: ENCRE_TITRE },
    { k: "rect", x: 131, y: 54.5, w: 64, h: 2.4, rx: 1.2, fill: TRAIT },
    { k: "rect", x: 131, y: 60, w: 64, h: 2.4, rx: 1.2, fill: TRAIT },
    { k: "rect", x: 131, y: 65.5, w: 44, h: 2.4, rx: 1.2, fill: TRAIT },
    { k: "rect", x: 131, y: 73, w: 64, h: 2.4, rx: 1.2, fill: TRAIT },
    { k: "rect", x: 131, y: 78.5, w: 52, h: 2.4, rx: 1.2, fill: TRAIT },
    // Le point d'insertion, au bout de la ligne courte.
    { k: "rect", x: 177, y: 64.4, w: 1.3, h: 4.6, fill: p.accent },
  ]
}

/**
 * POWERPOINT — le volet des miniatures à gauche, la diapositive à droite.
 *
 * La miniature du haut est celle qu'on travaille : elle porte le liseré d'accent.
 */
function powerpoint(): FormeIllustration[] {
  const p = PALETTES.POWERPOINT
  return [
    ...barreDeTitre(p.accent),
    // La séparation entre le volet et la diapositive.
    { k: "chemin", d: "M146.5 35v52.5", stroke: TRAIT, sw: 1.1 },
    // Trois miniatures ; la première est la diapositive en cours.
    { k: "rect", x: 129, y: 41, w: 13, h: 9, rx: 1.5, fill: "#fff", stroke: p.accent, sw: 1.3 },
    { k: "rect", x: 129, y: 54, w: 13, h: 9, rx: 1.5, fill: TRAIT_FIN, stroke: TRAIT, sw: 0.9 },
    { k: "rect", x: 129, y: 67, w: 13, h: 9, rx: 1.5, fill: TRAIT_FIN, stroke: TRAIT, sw: 0.9 },
    // La diapositive : un titre, deux lignes, un bloc illustré.
    { k: "rect", x: 151, y: 42, w: 44, h: 33, rx: 2, fill: "#fff", stroke: TRAIT, sw: 1.1 },
    { k: "rect", x: 156, y: 47.5, w: 28, h: 3.4, rx: 1.7, fill: ENCRE_TITRE },
    { k: "rect", x: 156, y: 55, w: 28, h: 2.2, rx: 1.1, fill: TRAIT },
    { k: "rect", x: 156, y: 59.5, w: 22, h: 2.2, rx: 1.1, fill: TRAIT },
    { k: "rect", x: 156, y: 64, w: 34, h: 7, rx: 1.6, fill: p.voile, stroke: p.voileBord, sw: 0.9 },
  ]
}

/**
 * OUTLOOK — la boîte de réception : la liste des messages, le volet de lecture.
 *
 * La pastille d'accent marque le message non lu, en tête de liste.
 */
function outlook(): FormeIllustration[] {
  const p = PALETTES.OUTLOOK
  return [
    ...barreDeTitre(p.accent),
    // La séparation entre la liste et le volet de lecture.
    { k: "chemin", d: "M162.5 35v52.5", stroke: TRAIT, sw: 1.1 },
    // Trois messages, séparés par un filet ; le premier n'est pas lu.
    { k: "cercle", cx: 131.5, cy: 42.6, r: 1.9, fill: p.accent },
    { k: "rect", x: 136, y: 41, w: 20, h: 2.6, rx: 1.3, fill: ENCRE_TITRE },
    { k: "rect", x: 136, y: 45.6, w: 20, h: 2.2, rx: 1.1, fill: TRAIT },
    { k: "chemin", d: "M128 51.5h30M128 63.5h30", stroke: TRAIT_FIN, sw: 1 },
    { k: "rect", x: 136, y: 54, w: 20, h: 2.6, rx: 1.3, fill: ENCRE_SOURDE },
    { k: "rect", x: 136, y: 58.6, w: 20, h: 2.2, rx: 1.1, fill: TRAIT },
    { k: "rect", x: 136, y: 66, w: 20, h: 2.6, rx: 1.3, fill: ENCRE_SOURDE },
    { k: "rect", x: 136, y: 70.6, w: 20, h: 2.2, rx: 1.1, fill: TRAIT },
    // Le volet de lecture : un objet, puis le corps du message.
    { k: "rect", x: 167, y: 41, w: 26, h: 3, rx: 1.5, fill: ENCRE_TITRE },
    { k: "rect", x: 167, y: 48.5, w: 28, h: 2.2, rx: 1.1, fill: TRAIT },
    { k: "rect", x: 167, y: 53, w: 28, h: 2.2, rx: 1.1, fill: TRAIT },
    { k: "rect", x: 167, y: 57.5, w: 20, h: 2.2, rx: 1.1, fill: TRAIT },
  ]
}

/**
 * LE REPLI — une fenêtre de logiciel, sans rien qui désigne une application.
 *
 * Il accompagne la phrase de repli du texte (« une vraie fenêtre de logiciel »).
 * Ni grille, ni miniatures, ni liste de messages : rien qui puisse mentir.
 */
function generique(): FormeIllustration[] {
  return [
    ...barreDeTitre(NEUTRE.accent),
    { k: "rect", x: 131, y: 45, w: 64, h: 2.4, rx: 1.2, fill: TRAIT },
    { k: "rect", x: 131, y: 51.5, w: 64, h: 2.4, rx: 1.2, fill: TRAIT },
    { k: "rect", x: 131, y: 58, w: 44, h: 2.4, rx: 1.2, fill: TRAIT },
    { k: "rect", x: 131, y: 66, w: 40, h: 10, rx: 2, fill: NEUTRE.voile, stroke: NEUTRE.voileBord, sw: 0.9 },
  ]
}

/* ═══════════ LE POINT D'ENTRÉE ═══════════ */

/**
 * Le dessin de l'application, prêt à rendre.
 *
 * Fonction PURE, sans React ni `window` : c'est ce qui la rend vérifiable par
 * `scripts/simulation/check-illustration-atelier.ts` sans navigateur.
 */
export function illustrationAtelier(app: string | null | undefined): IllustrationAtelier {
  const connue = normaliserAppAtelier(app)

  switch (connue) {
    case "EXCEL":
      return { variante: "EXCEL", accent: PALETTES.EXCEL.accent, formes: excel() }
    case "WORD":
      return { variante: "WORD", accent: PALETTES.WORD.accent, formes: word() }
    case "POWERPOINT":
      return { variante: "POWERPOINT", accent: PALETTES.POWERPOINT.accent, formes: powerpoint() }
    case "OUTLOOK":
      return { variante: "OUTLOOK", accent: PALETTES.OUTLOOK.accent, formes: outlook() }
    default:
      return { variante: "GENERIQUE", accent: NEUTRE.accent, formes: generique() }
  }
}

/** Les cinq variantes, pour les contrôles et la planche de relecture. */
export const VARIANTES_ILLUSTRATION: VarianteIllustration[] = [
  "EXCEL",
  "WORD",
  "POWERPOINT",
  "OUTLOOK",
  "GENERIQUE",
]
