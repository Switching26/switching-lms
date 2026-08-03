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

/**
 * Référence lisible : « A1 », « B2 à D4 ».
 *
 * ⚠️ En ÉVALUATION NOTÉE, une coordonnée que la consigne ne nomme pas n'est plus
 * servie au navigateur : elle EST la réponse (« trouvez la ligne en trop »).
 * Toutes les formulations ci-dessous doivent donc supporter son absence, et
 * dire « la ligne demandée » plutôt que « la ligne undefined ». C'est la raison
 * des `?` et des replis qui suivent — aucun n'est décoratif.
 */
function lieu(ref: string | undefined | null): string {
  const r = String(ref ?? "").trim()
  if (!r) return ""
  return r.includes(":") ? r.replace(":", " à ") : r
}

/**
 * NOM DES BOUTONS, pour que le critère de réussite dise quelque chose.
 *
 * `CLICK_CONTROL` affichait « Attendu : un clic sur le bouton indiqué » sur ses
 * 239 étapes : une phrase qui n'apporte rien que la consigne ne donne déjà, et
 * qui occupe la ligne censée dire à quoi on reconnaît que c'est fait. Elle
 * nomme désormais le bouton — et disparaît quand le nom est inconnu, plutôt que
 * de meubler.
 *
 * Les libellés viennent des composants qui rendent ces boutons
 * (`SimulationChrome`, `PageLayoutLayer`) ; les trois symboles du ruban — G, €,
 * % — sont écrits en toutes lettres, « un clic sur « G » » n'apprenant rien à
 * un débutant. `check-controles.ts` vérifie que la table ne dérive pas :
 * chaque contrôle cité par un scénario doit y figurer, et chaque entrée doit
 * correspondre à un bouton réellement rendu.
 */
export const LIBELLE_CONTROLE: Record<string, string> = {
  /* Onglet Accueil */
  "acc-coller": "Coller",
  "acc-copier": "Copier",
  "acc-gras": "Gras",
  "acc-italique": "Italique",
  "acc-souligne": "Souligné",
  "acc-couleur-police": "Couleur",
  "acc-remplissage": "Remplir",
  "acc-bordures": "Bordures",
  "acc-fusionner": "Fusionner",
  "acc-somme-auto": "Somme",
  "acc-inserer": "Insérer",
  "acc-supprimer": "Supprimer",
  "acc-format-largeur": "Largeur",
  "acc-format-masquer": "Masquer",
  "acc-format-monetaire": "Format monétaire",
  "acc-pourcentage": "Pourcentage",
  "acc-mfc-regle": "Mise en forme cond.",
  "acc-mfc-effacer": "Effacer règles",
  /* Barre de formule et onglets de feuille */
  "bf-fx": "Insérer une fonction",
  "ui-nouvelle-feuille": "Nouvelle feuille",
  /* Onglet Données */
  "don-filtrer": "Filtrer",
  "don-effacer-filtre": "Effacer",
  "don-validation": "Validation",
  "don-effacer-validation": "Effacer validation",
  "don-valeur-cible": "Valeur cible",
  "don-convertir": "Convertir",
  /* Onglet Affichage */
  "aff-figer-volets": "Figer les volets",
  "aff-liberer-volets": "Libérer les volets",
  /* Onglet Révision */
  "rev-commentaire": "Nouveau commentaire",
  "rev-supprimer-commentaire": "Supprimer",
  /* Onglet Insertion */
  "ins-image-cellule": "Image dans la cellule",
  /* Graphiques */
  "ins-graph-recommande": "Graphique recommandé",
  "ins-graph-histogramme": "Histogramme",
  "ins-graph-courbes": "Courbes",
  "ins-graph-secteurs": "Secteurs",
  "ins-graph-modifier-type": "Modifier le type",
  "ins-graph-intervertir": "Lignes / colonnes",
  "ins-graph-selectionner-donnees": "Sélectionner les données",
  "ins-graph-supprimer-serie": "Supprimer une série",
  "ins-graph-filtre-serie": "Filtrer une série",
  "ins-graph-couleur-serie": "Couleur de la série",
  "ins-graph-forme-serie": "Forme de la série",
  "ins-graph-element-titre": "Titre",
  "ins-graph-element-titres-axes": "Titres des axes",
  "ins-graph-element-legende": "Légende",
  "ins-graph-element-etiquettes": "Étiquettes",
  "ins-graph-element-quadrillage": "Quadrillage",
  "ins-graph-legende-bas": "En bas",
  "ins-graph-legende-droite": "À droite",
  "ins-graph-tendance-lineaire": "Tendance linéaire",
  "ins-graph-tendance-moyenne-mobile": "Moyenne mobile",
  "ins-graph-tendance-supprimer": "Retirer la tendance",
  "ins-graph-style-2": "Style 2",
  "ins-graph-style-3": "Style 3",
  "ins-graph-style-4": "Style 4",
  "ins-graph-style-5": "Style 5",
  /* Mise en page */
  "mep-entete-pied": "En-tête et pied de page",
  "mep-zone-entete": "Zone d'en-tête",
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
        : action.target
        ? `une saisie dans ${action.target}`
        : "une saisie dans la cellule demandée"
    case "EXPECT_STATE": {
      const refs = Object.keys(action.cells ?? {})
      if (refs.length === 0) return "le résultat demandé"
      if (refs.length === 1) return `le résultat en ${refs[0]}`
      if (refs.length <= 3) return `le résultat en ${refs.join(", ")}`
      return `le résultat dans ${refs.length} cellules`
    }
    case "EXPECT_FORMAT": {
      const refs = Object.keys(action.cells ?? {})
      if (refs.length === 0) return "la mise en forme demandée"
      return refs.length === 1
        ? `la mise en forme de ${refs[0]}`
        : `la mise en forme de ${refs.length} cellules`
    }
    case "CLICK_CELL":
      return action.cell ? `la cellule ${action.cell} sélectionnée` : "la cellule demandée sélectionnée"
    case "CLICK_CELL_MODIFIER":
      return action.cell ? `${action.cell} ajoutée à la sélection` : "la cellule demandée ajoutée à la sélection"
    case "DRAG_RANGE":
      return action.range ? `la plage ${lieu(action.range)} sélectionnée` : "la plage demandée sélectionnée"
    case "SELECT_COLUMN":
      return action.column ? `la colonne ${action.column} sélectionnée` : "la colonne demandée sélectionnée"
    case "SELECT_ROW":
      return action.row ? `la ligne ${action.row} sélectionnée` : "la ligne demandée sélectionnée"
    case "SELECT_SHEET":
      return action.name ? `la feuille « ${action.name} » au premier plan` : "la feuille demandée au premier plan"
    case "GOTO_REF":
      return action.ref ? `${lieu(action.ref)} atteinte par la zone Nom` : "la cellule demandée atteinte par la zone Nom"
    case "DEFINE_NAME":
      return action.name ? `la plage nommée « ${action.name} »` : "la plage nommée"
    case "CLICK_CONTROL": {
      // Nommer le bouton, ou se taire : « un clic sur le bouton indiqué » ne
      // disait rien que la consigne ne dise déjà.
      const nom = action.control ? LIBELLE_CONTROLE[action.control] : undefined
      return nom ? `un clic sur « ${nom} »` : null
    }
    case "CONTEXT_MENU":
      return "le menu contextuel ouvert"
    case "DOUBLE_CLICK":
      return "un double-clic sur la cible"
    case "KEY":
      return action.key ? `la touche ${action.key}` : null
    case "FILL_HANDLE":
      return action.to ? `la recopie jusqu'en ${action.to}` : "la recopie demandée"
    case "SORT_RANGE":
      // La colonne et le sens du tri sont la RÉPONSE : en évaluation notée ils
      // ne sont pas servis au navigateur (`expurge.ts`), et le critère se réduit
      // alors à la plage — ce qui reste vrai et n'apprend rien à personne.
      return action.column && action.range
        ? `le tri de ${lieu(action.range)} sur la colonne ${action.column}`
        : action.range
        ? `le tri de ${lieu(action.range)}`
        : "le tri demandé"
    case "FILTER_COLUMN":
      return action.column ? `le filtre posé sur la colonne ${action.column}` : "le filtre demandé"
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
      return action.expect === "started"
        ? "l'enregistrement démarré"
        : action.expect === "stopped"
        ? "l'enregistrement arrêté"
        : "l'enregistreur de macros utilisé"
    case "EXPECT_POSTE":
      return action.poste ? phrasePoste(action.poste) : null
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
      if (!ou) return "Votre saisie est enregistrée."
      return quoi ? `Vous avez saisi ${quoi} dans ${ou}.` : `Vous avez rempli ${ou}.`
    }
    case "EXPECT_STATE": {
      const refs = Object.keys(action.cells ?? {})
      if (refs.length === 0) return "Le résultat est en place."
      if (refs.length === 1) return `Le résultat est en place dans ${refs[0]}.`
      return `Le résultat est en place dans ${refs.length} cellules.`
    }
    case "EXPECT_FORMAT":
      return "La mise en forme est appliquée."
    case "CLICK_CELL":
      return action.cell ? `Vous avez sélectionné ${action.cell}.` : "Vous avez fait votre sélection."
    case "DRAG_RANGE":
      return action.range ? `Vous avez sélectionné ${lieu(action.range)}.` : "Vous avez fait votre sélection."
    case "SELECT_COLUMN":
      return action.column ? `Vous avez sélectionné la colonne ${action.column}.` : "Vous avez sélectionné la colonne."
    case "SELECT_ROW":
      return action.row ? `Vous avez sélectionné la ligne ${action.row}.` : "Vous avez sélectionné la ligne."
    case "SELECT_SHEET":
      return action.name ? `Vous êtes sur la feuille « ${action.name} ».` : "Vous avez changé de feuille."
    case "GOTO_REF":
      return action.ref ? `Vous avez atteint ${lieu(action.ref)} par la zone Nom.` : "Vous y êtes allé par la zone Nom."
    case "DEFINE_NAME":
      return action.name ? `La plage porte maintenant le nom « ${action.name} ».` : "La plage est nommée."
    case "CLICK_CONTROL": {
      const nom = action.control ? LIBELLE_CONTROLE[action.control] : undefined
      return nom ? `Vous avez cliqué sur « ${nom} ».` : "Vous avez utilisé le bouton du ruban."
    }
    case "SORT_RANGE":
      return action.column
        ? `Le tableau est trié sur la colonne ${action.column}.`
        : "Le tableau est trié."
    case "FILTER_COLUMN":
      return action.column ? `Le filtre est posé sur la colonne ${action.column}.` : "Le filtre est posé."
    case "FILL_HANDLE":
      return action.to ? `La recopie est faite jusqu'en ${action.to}.` : "La recopie est faite."
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
      if (!p) return null
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
    case "CLICK_CONTROL": {
      // Au cinquième essai, l'apprenant a droit au nom exact du bouton — pas à
      // « suivez le repère », qui suppose qu'il l'ait vu.
      const nom = LIBELLE_CONTROLE[action.control]
      return nom ? `Il fallait cliquer sur « ${nom} ».` : null
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
