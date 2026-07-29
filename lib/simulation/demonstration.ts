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

import type { SimulationAction } from "./types"

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

/** Étiquette lisible d'une plage : « B2 à D4 ». */
function lieu(ref: string): string {
  return ref.includes(":") ? ref.replace(":", " à ") : ref
}

/**
 * Séquence de gestes d'une étape. `null` seulement quand l'action ne se montre
 * décidément pas — auquel cas l'atelier garde la réponse écrite.
 */
export function planDemonstration(action: SimulationAction): PlanDemo | null {
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
        const quoi = att.f ?? att.anyOf?.[0] ?? (att.v !== undefined ? String(att.v) : null)
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

    case "DEFINE_NAME":
      return {
        gestes: [{ cible: { k: "dom", sel: '[aria-label="Zone Nom"]' }, bulle: `nommer « ${action.name} »`, frappe: action.name }],
        pas: ["Sélectionner la plage", "Cliquer la zone Nom", "Saisir le nom"],
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
      if (p.margins) return { gestes: [{ cible: ctrl("mep-marges"), bulle: "les marges" }], pas: ["Régler les marges"] }
      if (p.scaleToFit) return { gestes: [{ cible: ctrl("mep-ajuster"), bulle: "l'ajustement" }], pas: ["Régler l'ajustement"] }
      return { gestes: [{ cible: { k: "dom", sel: '[data-ribbon-tab="mise-en-page"]' }, bulle: "l'onglet Mise en page" }], pas: ["Ouvrir Mise en page"] }
    }

    case "RECORD_MACRO":
      return {
        gestes: [
          {
            cible: ctrl(action.expect === "started" ? "dev-macro-enregistrer" : "dev-macro-arreter"),
            bulle: action.expect === "started" ? "démarrer l'enregistrement" : "arrêter l'enregistrement",
          },
        ],
        pas: [action.expect === "started" ? "Démarrer l'enregistrement" : "Arrêter l'enregistrement"],
      }

    case "EXPECT_MACRO":
      return {
        gestes: [{ cible: ctrl("dev-macro-enregistrer"), bulle: "enregistrer une macro" }],
        pas: ["Enregistrer la macro"],
      }

    /* ── poste de travail ────────────────────────────────────────────── */
    case "EXPECT_POSTE": {
      const p = action.poste
      const g = (id: string, bulle: string): PlanDemo => ({ gestes: [{ cible: ctrl(id), bulle }], pas: ["Cliquer"] })
      if (p.classeur || p.fichiers?.length) return g("poste-enregistrer-valider", "valider l'enregistrement")
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

    case "FILL_HANDLE":
      return null

    default:
      return null
  }
}
