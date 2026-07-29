/**
 * Ce que l'atelier dit à l'apprenant SUR une étape, déduit de l'étape elle-même.
 *
 * Audit du 29/07/2026 : sur 1 872 étapes, 1 638 demandent d'agir et 234 sont de
 * simples lectures — mais rien ne les distingue à l'écran. Le seul indice était
 * négatif (un bouton « Suivant » présent ou absent), ce qu'un débutant ne peut
 * pas interpréter. Et la consigne dit quoi faire, jamais à quoi on reconnaîtra
 * que c'est fait.
 *
 * Tout ce qui suit est DÉDUIT de `action` : aucun texte à rédiger pour les
 * 1 872 étapes, et le jour où un scénario change, la formulation suit.
 */

import type { PosteAttendu, SimulationAction } from "./types"
import { CONTROLES_POSTE } from "./poste"

/**
 * Décrit en français l'état de poste visé par une étape.
 *
 * Sans cela, les gestes qui vivent autour du tableur — lancer Excel,
 * enregistrer, fermer — étaient les seuls du simulateur à n'afficher ni critère
 * de réussite, ni carte de franchissement, ni réponse au blocage.
 */
function phrasePoste(p: PosteAttendu): string | null {
  if (p.fichiers?.length) {
    return p.fichiers.length === 1
      ? `le fichier « ${p.fichiers[0]} » créé`
      : `${p.fichiers.length} fichiers créés`
  }
  if (p.classeur) return `le classeur enregistré sous « ${p.classeur} »`
  if (p.boite === "enregistrer") return "la fenêtre d'enregistrement ouverte"
  if (p.boite === "ouvrir") return "la fenêtre d'ouverture ouverte"
  if (p.menu) return "le menu Démarrer ouvert"
  if (p.excel === "accueil") return "Excel lancé"
  if (p.excel === "classeur") return "un classeur ouvert"
  if (p.excel === "ferme") return "Excel fermé"
  return null
}

export type NatureEtape = "lecture" | "action" | "evaluee"

/** Ce que l'apprenant doit comprendre en un coup d'œil : lire, agir, ou être évalué. */
export function natureEtape(action: SimulationAction, mode: string): NatureEtape {
  // L'ordre compte : un écran de lecture reste une lecture même au sein d'une
  // évaluation. Les 26 énoncés d'ouverture affichaient « ★ Évalué » et
  // « Compté dans votre note » alors qu'il n'y a rien à y faire — l'apprenant
  // croyait être noté sur la page de consignes (retour Samuel du 29/07/2026).
  if (action.type === "READ") return "lecture"
  if (mode === "EVALUATION") return "evaluee"
  return "action"
}

/** Référence lisible : « A1 », « B2 à D4 », « la colonne C », « la ligne 3 ». */
function lieu(ref: string): string {
  return ref.includes(":") ? ref.replace(":", " à ") : ref
}

/**
 * « Attendu : … » — le critère de réussite, en une ligne.
 *
 * Renvoie null quand l'action ne se résume pas honnêtement en une phrase courte :
 * mieux vaut ne rien afficher qu'annoncer un critère approximatif.
 */
export function resumerAttendu(action: SimulationAction): string | null {
  switch (action.type) {
    case "READ":
      return null
    case "TYPE":
      return action.target === "formula-bar"
        ? "une saisie dans la barre de formule"
        : `une saisie dans ${action.target}`
    case "EXPECT_STATE": {
      const refs = Object.keys(action.cells)
      if (refs.length === 0) return null
      if (refs.length === 1) return `le résultat en ${refs[0]}`
      if (refs.length <= 3) return `le résultat en ${refs.join(", ")}`
      return `le résultat dans ${refs.length} cellules`
    }
    case "EXPECT_FORMAT": {
      const refs = Object.keys(action.cells)
      return refs.length === 1
        ? `la mise en forme de ${refs[0]}`
        : `la mise en forme de ${refs.length} cellules`
    }
    case "CLICK_CELL":
      return `la cellule ${action.cell} sélectionnée`
    case "CLICK_CELL_MODIFIER":
      return `${action.cell} ajoutée à la sélection`
    case "DRAG_RANGE":
      return `la plage ${lieu(action.range)} sélectionnée`
    case "SELECT_COLUMN":
      return `la colonne ${action.column} sélectionnée`
    case "SELECT_ROW":
      return `la ligne ${action.row} sélectionnée`
    case "SELECT_SHEET":
      return `la feuille « ${action.name} » au premier plan`
    case "GOTO_REF":
      return `${lieu(action.ref)} atteinte par la zone Nom`
    case "DEFINE_NAME":
      return `la plage nommée « ${action.name} »`
    case "CLICK_CONTROL":
      return "un clic sur le bouton indiqué"
    case "CONTEXT_MENU":
      return "le menu contextuel ouvert"
    case "DOUBLE_CLICK":
      return "un double-clic sur la cible"
    case "KEY":
      return `la touche ${action.key}`
    case "FILL_HANDLE":
      return `la recopie jusqu'en ${action.to}`
    case "SORT_RANGE":
      return `le tri de ${lieu(action.range)} sur la colonne ${action.column}`
    case "FILTER_COLUMN":
      return `le filtre posé sur la colonne ${action.column}`
    case "EXPECT_CHART":
      return "le graphique demandé"
    case "SELECT_CHART_ELEMENT":
      return "l'élément du graphique sélectionné"
    case "EXPECT_PIVOT":
      return "le tableau croisé demandé"
    case "EXPECT_PAGE_SETUP":
      return "les réglages de mise en page demandés"
    case "EXPECT_MACRO":
      return "la macro demandée"
    case "RECORD_MACRO":
      return action.expect === "started" ? "l'enregistrement démarré" : "l'enregistrement arrêté"
    case "EXPECT_POSTE":
      return phrasePoste(action.poste)
    default:
      return null
  }
}

/**
 * Rappel du geste accompli, pour la carte affichée à chaque étape franchie.
 *
 * Même principe que `resumerAttendu` : déduit, jamais rédigé. Une phrase
 * pédagogique sur mesure aurait demandé d'écrire — et de relire — 1 872 textes.
 */
export function resumerFait(action: SimulationAction): string | null {
  switch (action.type) {
    case "READ":
      return null
    case "TYPE": {
      const quoi = action.accept?.[0]
      const ou = action.target === "formula-bar" ? "la barre de formule" : action.target
      return quoi ? `Vous avez saisi ${quoi} dans ${ou}.` : `Vous avez rempli ${ou}.`
    }
    case "EXPECT_STATE": {
      const refs = Object.keys(action.cells)
      if (refs.length === 1) return `Le résultat est en place dans ${refs[0]}.`
      return `Le résultat est en place dans ${refs.length} cellules.`
    }
    case "EXPECT_FORMAT":
      return "La mise en forme est appliquée."
    case "CLICK_CELL":
      return `Vous avez sélectionné ${action.cell}.`
    case "DRAG_RANGE":
      return `Vous avez sélectionné ${lieu(action.range)}.`
    case "SELECT_COLUMN":
      return `Vous avez sélectionné la colonne ${action.column}.`
    case "SELECT_ROW":
      return `Vous avez sélectionné la ligne ${action.row}.`
    case "SELECT_SHEET":
      return `Vous êtes sur la feuille « ${action.name} ».`
    case "GOTO_REF":
      return `Vous avez atteint ${lieu(action.ref)} par la zone Nom.`
    case "DEFINE_NAME":
      return `La plage porte maintenant le nom « ${action.name} ».`
    case "CLICK_CONTROL":
      return "Vous avez utilisé le bouton du ruban."
    case "SORT_RANGE":
      return `Le tableau est trié sur la colonne ${action.column}.`
    case "FILTER_COLUMN":
      return `Le filtre est posé sur la colonne ${action.column}.`
    case "FILL_HANDLE":
      return `La recopie est faite jusqu'en ${action.to}.`
    case "EXPECT_CHART":
      return "Le graphique est en place."
    case "EXPECT_PIVOT":
      return "Le tableau croisé est en place."
    case "EXPECT_PAGE_SETUP":
      return "Les réglages de mise en page sont appliqués."
    case "EXPECT_MACRO":
    case "RECORD_MACRO":
      return "La macro est enregistrée."
    case "EXPECT_POSTE": {
      const p = action.poste
      if (p.fichiers?.length) return `Le fichier « ${p.fichiers[0]} » est enregistré.`
      if (p.classeur) return `Le classeur s'appelle maintenant « ${p.classeur} ».`
      if (p.boite === "enregistrer") return "La fenêtre d'enregistrement est ouverte."
      if (p.boite === "ouvrir") return "La fenêtre d'ouverture est ouverte."
      if (p.menu) return "Le menu Démarrer est ouvert."
      if (p.excel === "accueil") return "Excel est lancé."
      if (p.excel === "classeur") return "Le classeur est ouvert."
      if (p.excel === "ferme") return "Excel est fermé."
      return null
    }
    default:
      return null
  }
}

/**
 * Réponse exacte, montrée au dernier palier d'aide quand l'apprenant bloque.
 *
 * Elle n'existe pas pour tous les gestes — un clic de ruban ou un réglage de
 * panneau se montre par la mise en évidence de sa cible, pas par du texte. On
 * renvoie alors null et l'atelier se contente du repère visuel.
 */
export function reponseAttendue(action: SimulationAction): string | null {
  switch (action.type) {
    case "TYPE": {
      const quoi = action.accept?.[0]
      if (!quoi) return null
      const ou = action.target === "formula-bar" ? "la barre de formule" : action.target
      return `Dans ${ou}, il fallait saisir ${quoi} puis valider.`
    }
    case "EXPECT_STATE": {
      const entrees = Object.entries(action.cells)
      const avecFormule = entrees.filter(([, v]) => v.f || v.anyOf?.length)
      if (avecFormule.length === 0) {
        const vals = entrees.filter(([, v]) => v.v !== undefined)
        if (vals.length === 0) return null
        return vals
          .slice(0, 3)
          .map(([r, v]) => `${r} doit valoir ${v.v}`)
          .join(", ")
          .concat(vals.length > 3 ? `, et ${vals.length - 3} autre(s)` : "")
      }
      return avecFormule
        .slice(0, 3)
        .map(([r, v]) => `${r} : ${v.f ?? v.anyOf?.[0]}`)
        .join(" · ")
        .concat(avecFormule.length > 3 ? ` · et ${avecFormule.length - 3} autre(s)` : "")
    }
    case "GOTO_REF":
      return `Il fallait saisir ${action.ref} dans la zone Nom, puis valider.`
    case "DEFINE_NAME":
      return `Il fallait nommer la sélection « ${action.name} » depuis la zone Nom.`
    case "SELECT_SHEET":
      return `Il fallait cliquer sur l'onglet de feuille « ${action.name} ».`
    case "CLICK_CELL":
      return `Il fallait cliquer sur la cellule ${action.cell}.`
    case "DRAG_RANGE":
      return `Il fallait sélectionner la plage ${lieu(action.range)}.`
    case "SELECT_COLUMN":
      return `Il fallait cliquer sur l'en-tête de la colonne ${action.column}.`
    case "SELECT_ROW":
      return `Il fallait cliquer sur l'en-tête de la ligne ${action.row}.`
    case "SORT_RANGE":
      return `Il fallait trier ${lieu(action.range)} sur la colonne ${action.column}, en ordre ${action.ascending ? "croissant" : "décroissant"}.`
    case "EXPECT_POSTE": {
      const p = action.poste
      if (p.fichiers?.length || p.classeur) {
        const nom = p.classeur ?? p.fichiers?.[0]
        return `Il fallait enregistrer le classeur sous le nom ${nom}, puis valider.`
      }
      if (p.boite === "enregistrer") return "Il fallait ouvrir l'enregistrement — bouton Enregistrer, ou Ctrl + S."
      if (p.boite === "ouvrir") return "Il fallait ouvrir la fenêtre d'ouverture — bouton Ouvrir, ou Ctrl + O."
      if (p.menu) return "Il fallait cliquer sur le bouton Démarrer, en bas à gauche."
      if (p.excel === "accueil") return "Il fallait lancer Excel depuis le menu Démarrer."
      if (p.excel === "ferme") return "Il fallait fermer la fenêtre par la croix, en haut à droite."
      if (p.excel === "classeur") return "Il fallait ouvrir un classeur depuis l'écran d'accueil d'Excel."
      return null
    }
    default:
      return null
  }
}

/**
 * Cible à mettre en évidence pendant la démonstration : la cellule, la plage ou
 * le bouton de ruban sur lequel le geste attendu porte.
 */
export function cibleDemonstration(
  action: SimulationAction,
): { cellule?: string; controle?: string } {
  switch (action.type) {
    case "TYPE":
      return action.target === "formula-bar" ? {} : { cellule: action.target }
    case "CLICK_CELL":
      return { cellule: action.cell }
    case "DRAG_RANGE":
      return { cellule: action.range }
    case "GOTO_REF":
      return { cellule: action.ref }
    case "EXPECT_STATE": {
      const refs = Object.keys(action.cells)
      return refs.length ? { cellule: refs[0] } : {}
    }
    case "EXPECT_FORMAT": {
      const refs = Object.keys(action.cells)
      return refs.length ? { cellule: refs[0] } : {}
    }
    case "CLICK_CONTROL":
      return { controle: action.control }
    case "EXPECT_POSTE": {
      // Le bouton qui MÈNE à l'état visé, pas l'état lui-même : c'est là que
      // l'apprenant bloqué doit poser les yeux.
      const p = action.poste
      const C = CONTROLES_POSTE
      if (p.classeur || p.fichiers?.length) return { controle: C.enregistrerValider }
      if (p.boite === "enregistrer") return { controle: C.enregistrer }
      if (p.boite === "ouvrir") return { controle: C.ouvrir }
      if (p.menu) return { controle: C.demarrer }
      if (p.excel === "accueil") return { controle: C.app("excel") }
      if (p.excel === "ferme") return { controle: C.fermer }
      if (p.excel === "classeur") return { controle: C.nouveau }
      return {}
    }
    default:
      return {}
  }
}
