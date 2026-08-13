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

import { columnIndexToLetter } from "./grid"
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
  /**
   * RANG DE LA BULLE D'AUTEUR — l'index de l'action `montrer[k]` dont ce geste
   * est l'illustration. Absent sur tout le reste, et c'est le point.
   *
   * ⚠️ NE JAMAIS APPARIER UNE VOIX PAR L'INDEX DU GESTE. Deux mécanismes
   * décalent silencieusement les deux numérotations :
   *
   *  1. `avecOuverturesIntermediaires` INSÈRE des gestes d'ouverture d'onglet
   *     que l'auteur n'a pas écrits (mesuré : `M13-L02-08`, 3 bulles d'auteur
   *     pour 4 gestes joués) ;
   *  2. `planSequence` JETTE les actions dont le plan est nul (`if (!p)
   *     continue`) — une action `FILL_HANDLE` ou un `EXPECT_STATE` vide ne
   *     produit rien, et tout ce qui suit se décale d'un cran.
   *
   * Dans les deux cas le compteur `i / n` reste juste et aucune erreur n'est
   * levée : le décalage est MUET. C'est la raison d'être de ce champ.
   *
   * Il est posé sur le geste `illustration`, seul geste qu'un auteur écrit
   * lui-même dans un `montrer` — les ouvertures d'onglet du moteur n'en sont
   * jamais. Voir `annoterBulleDAuteur`.
   */
  rangBulle?: number
  /**
   * DURÉE D'AFFICHAGE IMPOSÉE de la bulle, en millisecondes, avant application
   * de l'accélérateur d'audit.
   *
   * Absent ⇒ la formule sur la longueur du texte s'applique, à l'octet près.
   * C'est ce qui rend le guide vocal réversible sans retirer une ligne de code,
   * et ce qui laisse les 271 chapitres sans voix strictement inchangés.
   *
   * ⚠️ C'est une VALEUR, pas une attente. Le calque ne sait pas qu'une voix
   * existe : il reçoit un nombre. Lui faire attendre la fin d'un son le rendrait
   * dépendant du réseau, et une piste absente figerait la démonstration — le
   * seul défaut que ce simulateur ne tolère pas.
   */
  dureeBulleMs?: number
  /**
   * Geste AJOUTÉ PAR LE MOTEUR, jamais écrit par un auteur : une ouverture
   * d'onglet intercalée. Il n'a ni rang, ni voix, ni durée imposée.
   */
  ouvertureAuto?: boolean
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
  /**
   * `setup` de l'étape — lui seul distingue une CRÉATION d'une MODIFICATION.
   *
   * `EXPECT_CHART` et `EXPECT_PIVOT` décrivent tous deux un ÉTAT attendu, pas
   * un geste : « le graphique doit maintenant porter un titre » a exactement la
   * même forme d'action que « il doit exister un graphique ». Le plan visait
   * donc le bouton de la GALERIE dans les deux cas — et `rendreAgissant` le
   * pressait pour de bon.
   *
   * Conséquence mesurée le 03/08/2026 : sur `m20-l05` (« ajoutez un titre »,
   * « passez en secteurs »…) la démonstration reconstruisait un histogramme sur
   * la sélection courante — source `A1` au lieu de `H4:I7` — et sur `m20-l02`
   * (« ajoutez le champ Famille en colonnes », « retirez-le »…) elle remplaçait
   * le tableau croisé par un tableau VIDE. L'apprenant qui demandait de l'aide
   * voyait son travail détruit, dès le PREMIER passage, avec une bulle qui
   * annonçait « insérer un tableau croisé » alors que la consigne demandait
   * tout autre chose.
   *
   * Le remède est ici, pas dans le composant : une modification se montre avec
   * le bouton de MODIFICATION, celui que `effetModele` associe déjà au patch.
   */
  setup?: {
    chart?: unknown
    chartEdit?: Record<string, unknown>
    pivot?: unknown
    pivotEdit?: Record<string, unknown>
  }
  /**
   * Champs actuellement placés dans le tableau croisé. `rows`, `cols` et
   * `filters` d'un `pivotEdit` REMPLACENT la liste : sans savoir ce qui s'y
   * trouve, on ne peut pas montrer le retrait que la consigne demande — sur
   * `M20-E02-02`, « remplacez le commercial par sa région » exige de retirer
   * Commercial avant de déposer Région, et l'aide de l'étape le dit mot pour mot.
   */
  tcdCourant?: EtatTcdDemo
  /** Le classeur ouvert porte-t-il déjà un nom ? Décide entre Enregistrer et Enregistrer sous. */
  classeurNomme?: boolean
  /** Macros déjà enregistrées : décide entre enregistrer et exécuter. */
  macrosCourantes?: string[]
  /** Les réglages de mise en page DÉJÀ posés : un saut déjà là ne se repose pas. */
  reglagesCourants?: { pageBreakRows?: number[]; pageBreakCols?: number[] }
}

/* ─────────── correspondances modification → contrôle réel ─────────── */

/**
 * Bouton qui applique une modification de graphique.
 *
 * Tout bouton `ins-graph-*` qui n'est PAS de la galerie passe, dans
 * `effetModele`, par `modifierGraphique(courant, setup.chartEdit)` : le patch du
 * scénario fait foi, quel que soit le bouton. Le choix ci-dessous n'est donc pas
 * une question de correction mais de VÉRITÉ PÉDAGOGIQUE — montrer le bouton que
 * l'apprenant doit réellement chercher.
 */
function boutonEditionGraphique(p: Record<string, unknown>): { id: string; nom: string } | null {
  const el = (p.elements ?? {}) as Record<string, unknown>
  if (el.titre !== undefined || p.title !== undefined)
    return { id: "ins-graph-element-titre", nom: "le titre du graphique" }
  if (el.titresAxes !== undefined) return { id: "ins-graph-element-titres-axes", nom: "les titres des axes" }
  if (el.etiquettes !== undefined) return { id: "ins-graph-element-etiquettes", nom: "les étiquettes de données" }
  if (el.quadrillage !== undefined) return { id: "ins-graph-element-quadrillage", nom: "le quadrillage" }
  if (el.legende !== undefined || p.legendPosition !== undefined)
    return p.legendPosition === "bas"
      ? { id: "ins-graph-legende-bas", nom: "la légende en bas" }
      : p.legendPosition === "droite"
        ? { id: "ins-graph-legende-droite", nom: "la légende à droite" }
        : { id: "ins-graph-element-legende", nom: "la légende" }
  if (typeof p.style === "number") return { id: `ins-graph-style-${p.style}`, nom: `le style ${p.style}` }
  if (p.type !== undefined) return { id: "ins-graph-modifier-type", nom: "modifier le type de graphique" }
  if (Array.isArray(p.removeSeries)) return { id: "ins-graph-supprimer-serie", nom: "supprimer la série" }
  if (Array.isArray(p.editSeries)) {
    const e = (p.editSeries as Array<Record<string, unknown>>)[0] ?? {}
    if (e.trendline === "lineaire") return { id: "ins-graph-tendance-lineaire", nom: "la courbe de tendance" }
    if (e.trendline === "moyenne-mobile") return { id: "ins-graph-tendance-moyenne-mobile", nom: "la moyenne mobile" }
    if ("trendline" in e) return { id: "ins-graph-tendance-supprimer", nom: "retirer la courbe de tendance" }
    if ("hidden" in e) return { id: "ins-graph-filtre-serie", nom: "filtrer la série" }
    if ("color" in e) return { id: "ins-graph-couleur-serie", nom: "la couleur de la série" }
    if ("shape" in e) return { id: "ins-graph-forme-serie", nom: "la forme de la série" }
  }
  if (p.source !== undefined || p.categories !== undefined || p.series !== undefined || p.addSeries !== undefined)
    return { id: "ins-graph-selectionner-donnees", nom: "sélectionner les données" }
  return null
}

/**
 * Gestes du volet « Champs » qui réalisent RÉELLEMENT une modification de
 * tableau croisé.
 *
 * ⚠️ Deux règles, apprises en mesurant plutôt qu'en lisant :
 *
 *  1. **Toutes les clés du patch doivent être jouées, pas la première.** Le
 *     volet applique chaque sous-effet séparément — contrairement au ruban, où
 *     `tcd-actualiser` applique `setup.pivotEdit` en bloc. Un patch
 *     `{removeFields, values}` joué à moitié laisse le tableau dans un état que
 *     la consigne n'annonce pas.
 *  2. **`rows` / `cols` / `filters` REMPLACENT la liste**, ils ne l'étendent
 *     pas. Sans connaître les champs actuellement placés, on ne peut pas savoir
 *     lesquels retirer : d'où `courant`, l'état du tableau au démarrage.
 */
function gestesEditionTcd(
  p: Record<string, unknown>,
  courant?: EtatTcdDemo,
): GesteDemo[] | null {
  const dom = (sel: string): CibleDemo => ({ k: "dom", sel })
  const noms = (v: unknown): Array<{ name: string; agg?: string }> =>
    Array.isArray(v)
      ? v
          .map((x) => (typeof x === "string" ? { name: x } : (x as { name?: string; agg?: string })))
          .filter((x): x is { name: string; agg?: string } => typeof x?.name === "string")
      : []

  const gestes: GesteDemo[] = []
  const pose = (champ: string, zone: keyof typeof LIBELLE_ZONE) => {
    gestes.push(
      // Le champ non encore placé : le sélecteur exclut la puce déjà posée dans
      // une zone, qui porte le même nom.
      { cible: dom(`[data-pivot-field="${champ}"][data-pivot-placed=""]`), bulle: `le champ ${champ}` },
      { cible: dom(`[data-pivot-zone="${zone}"]`), bulle: `le déposer dans « ${LIBELLE_ZONE[zone]} »` },
    )
  }
  const retirer = (champ: string) =>
    gestes.push({ cible: dom(`[data-pivot-remove="${champ}"]`), bulle: `retirer le champ ${champ}` })

  /* 1 — les retraits explicites */
  for (const n of noms(p.removeFields)) retirer(n.name)

  /* 2 — les listes de remplacement : on retire ce qui n'y est plus, on ajoute
         ce qui manque. Sans l'état courant on ne peut que compléter. */
  for (const [cle, zone] of [
    ["rows", "rows"],
    ["cols", "cols"],
    ["filters", "filters"],
  ] as const) {
    if (p[cle] === undefined) continue
    const cible = noms(p[cle]).map((x) => x.name)
    const actuels = courant?.[zone] ?? []
    for (const a of actuels) if (!cible.includes(a)) retirer(a)
    for (const c of cible) if (!actuels.includes(c)) pose(c, zone)
  }

  /* 3 — les ajouts explicites */
  for (const [cle, zone] of [
    ["addRows", "rows"],
    ["addCols", "cols"],
    ["addValues", "values"],
    ["addFilters", "filters"],
  ] as const) {
    for (const f of noms(p[cle])) pose(f.name, zone)
  }

  /* 4 — les agrégats : `values` sur un champ DÉJÀ posé change son calcul ;
         sur un champ absent, c'est un ajout. */
  for (const v of noms(p.values)) {
    const dejaLa = (courant?.values ?? []).includes(v.name)
    if (!dejaLa) {
      pose(v.name, "values")
      if (!v.agg) continue
    }
    if (v.agg) {
      gestes.push(
        { cible: dom(`[data-pivot-agg-menu="${v.name}"]`), bulle: `les paramètres de ${v.name}` },
        { cible: dom(`[data-pivot-agg="${v.agg}"]`), bulle: `choisir ${v.agg}`, presser: { id: `[data-pivot-agg="${v.agg}"]` } },
      )
    }
  }
  // Un champ retiré de `values` par remplacement de liste.
  if (Array.isArray(p.values) && courant) {
    const gardes = noms(p.values).map((x) => x.name)
    for (const a of courant.values) if (!gardes.includes(a)) retirer(a)
  }

  /* 5 — le style */
  if (typeof p.styleId === "number")
    gestes.push({ cible: dom(`[data-pivot-style="${p.styleId}"]`), bulle: `le style ${p.styleId}` })

  /* 6 — la valeur d'un filtre de rapport. C'est une LISTE DÉROULANTE : un clic
         n'y choisit rien. La pression porte donc la valeur, et le composant sait
         la poser sur un `<select>` contrôlé par React. */
  if (p.filterValues && typeof p.filterValues === "object") {
    for (const [champ, vals] of Object.entries(p.filterValues as Record<string, unknown>)) {
      const v = Array.isArray(vals) && vals.length ? String(vals[0]) : "(Tous)"
      gestes.push({
        cible: dom(`[data-pivot-filter="${champ}"]`),
        bulle: `filtrer ${champ} sur ${v}`,
        presser: { id: `[data-pivot-filter="${champ}"]`, arg: v },
      })
    }
  }

  /* 7 — la source et l'actualisation passent par le ruban, comme dans Excel. */
  if (p.source !== undefined)
    gestes.push({ cible: ctrl("tcd-source"), bulle: "modifier la source du tableau" })
  else if (p.refresh || p.sourceCells)
    gestes.push({ cible: ctrl("tcd-actualiser"), bulle: "actualiser le tableau" })

  return gestes.length ? gestes : null
}

/** Champs placés dans le tableau croisé au démarrage de la démonstration. */
export type EtatTcdDemo = { rows: string[]; cols: string[]; values: string[]; filters: string[] }

const LIBELLE_ZONE: Record<string, string> = {
  rows: "Lignes",
  cols: "Colonnes",
  values: "Valeurs",
  filters: "Filtres",
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
const SANS_EXECUTION = [
  "acc-inserer",
  "acc-supprimer",
]

function rendreAgissant(plan: PlanDemo): PlanDemo {
  return {
    ...plan,
    gestes: plan.gestes.map((g) => {
      const sortie = { ...g }
      if (!sortie.selectionner && !sortie.glisserVers && (g.cible.k === "cellule" || g.cible.k === "plage"))
        sortie.selectionner = g.cible.ref
      if (!sortie.presser && !sortie.onglet && !sortie.frappe && !g.illustration && g.cible.k === "dom") {
        const m = /\[data-control="([^"]+)"\]/.exec(g.cible.sel)
        if (m) {
          if (!SANS_EXECUTION.includes(m[1])) sortie.presser = { id: m[1] }
        } else if (g.cible.sel.startsWith("[data-pivot-")) {
          // Le volet des champs du tableau croisé n'a pas de `data-control` :
          // ses boutons portent leur propre `onClick`. On les presse par leur
          // SÉLECTEUR, c'est-à-dire exactement l'élément que l'apprenant clique.
          sortie.presser = { id: g.cible.sel }
        }
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

/** Onglet sous lequel vit le bouton visé par un geste, `null` si ce n'en est pas un. */
function ongletDuGeste(g: GesteDemo): RibbonTab | null {
  if (g.cible.k !== "dom") return null
  const m = /\[data-control="([^"]+)"\]/.exec(g.cible.sel)
  return m && ONGLET_DU_CONTROLE[m[1]] ? ONGLET_DU_CONTROLE[m[1]] : null
}

/** Le geste qui ouvre un onglet du ruban, et son libellé de pas. */
function ouvertureDOnglet(t: RibbonTab): GesteDemo {
  return {
    cible: { k: "dom", sel: `[data-ribbon-tab="${t}"]` },
    bulle: `l'onglet ${LIBELLE_ONGLET[t] ?? t}`,
    onglet: t,
    // Marqué à la SOURCE, et non deviné plus tard à la forme de la bulle : c'est
    // ce marquage qui empêche une voix de se caler sur un geste que l'auteur n'a
    // pas écrit. Voir `GesteDemo.rangBulle`.
    ouvertureAuto: true,
  }
}
const libelleOuverture = (t: RibbonTab) => `Ouvrir l'onglet ${LIBELLE_ONGLET[t] ?? t}`

/**
 * LES OUVERTURES D'ONGLET INTERMÉDIAIRES.
 *
 * `ongletRequis` s'arrête au PREMIER bouton de ruban du plan : une démonstration
 * qui traverse deux onglets n'en rouvrait donc qu'un. Le second geste visait un
 * bouton que le ruban ne rend pas — sa cible ne se résolvait pas, son repère
 * n'était jamais peint — et **le compteur allait au bout quand même**. Mesuré
 * sur `M13-L02-08` : « Figer les volets » (Affichage) puis « Titres à répéter »
 * (Mise en page), joués depuis Mise en page, donnaient 3 repères sur 4 et un
 * compteur affichant fièrement 4/4. Le chapitre porte sur la mise en page : ses
 * étapes laissent naturellement le ruban sur cet onglet, donc l'apprenant n'a
 * même pas besoin d'avoir exploré pour le subir.
 *
 * On suit ici l'onglet RÉELLEMENT ouvert au fil des gestes — un geste qui
 * déclare `onglet` le fait basculer — et on insère une ouverture devant tout
 * geste dont l'onglet diffère.
 *
 * NEUTRE PAR CONSTRUCTION quand un seul onglet est en jeu : l'ouverture de tête
 * a déjà mis `courant` sur le bon onglet, aucune insertion n'a lieu, et le plan
 * est renvoyé TEL QUEL — même objet, pas une copie.
 */
function avecOuverturesIntermediaires(plan: PlanDemo, depart: RibbonTab): PlanDemo {
  let courant: RibbonTab = depart
  let aInsere = false
  const gestes: GesteDemo[] = []
  const pas = [...plan.pas]

  plan.gestes.forEach((g, i) => {
    if (g.onglet) { courant = g.onglet; gestes.push(g); return }
    const requis = ongletDuGeste(g)
    if (requis && requis !== courant) {
      gestes.push(ouvertureDOnglet(requis))
      /* `pas` n'est PAS parallèle à `gestes` (1369 plans sur 2009) : le calque le
         projette proportionnellement. On insère donc le libellé à la position
         proportionnelle, et nulle part s'il n'y a aucun pas — c'est le cas des
         illustrations `MONTRER`, qui n'en déclarent volontairement aucun. */
      if (pas.length) {
        const j = Math.round((i / Math.max(1, plan.gestes.length - 1)) * pas.length)
        pas.splice(Math.min(j, pas.length), 0, libelleOuverture(requis))
      }
      courant = requis
      aInsere = true
    }
    gestes.push(g)
  })

  return aInsere ? { gestes, pas } : plan
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

  /* 1. L'ouverture de TÊTE — comportement historique, conservé au geste près :
        elle se place devant TOUT le plan, pas devant le geste concerné. */
  const requis = ongletRequis(plan)
  if (!requis || requis === ctx.onglet) return avecOuverturesIntermediaires(plan, ctx.onglet)
  const enTete: PlanDemo = {
    gestes: [ouvertureDOnglet(requis), ...plan.gestes],
    pas: [libelleOuverture(requis), ...plan.pas],
  }
  /* 2. Puis les ouvertures INTERMÉDIAIRES, pour les gestes suivants qui vivent
        sous un autre onglet. Sans effet quand il n'y en a pas. */
  return avecOuverturesIntermediaires(enTete, requis)
}

/**
 * UNE SUITE D'ACTIONS `montrer`, ENCHAÎNÉE EN PROPAGEANT L'ONGLET.
 *
 * Chaque action recevait le MÊME onglet de départ — celui d'avant la
 * démonstration — alors que l'action précédente vient peut-être d'en ouvrir un
 * autre. Une action dont le bouton vit sous l'onglet de DÉPART se croyait donc
 * chez elle et n'ouvrait rien, alors que l'écran était ailleurs : son repère
 * n'était jamais peint, et le compteur allait au bout quand même.
 *
 * Mesuré sur `M13-L02-08` — « Figer les volets » (Affichage) puis « Titres à
 * répéter » (Mise en page), joués depuis Mise en page : 3 repères sur 4, un
 * compteur affichant 4/4, et aucune exploration nécessaire pour le subir, le
 * chapitre laissant naturellement le ruban sur Mise en page.
 *
 * On suit donc l'onglet où chaque plan laisse l'écran, et on le passe au suivant.
 * Pour une action unique — l'immense majorité — le résultat est identique.
 */
/**
 * MARQUE LE GESTE D'AUTEUR D'UN PLAN AVEC LE RANG DE SON ACTION `montrer`.
 *
 * Le geste d'auteur est celui qui porte `illustration` : c'est le seul qu'un
 * auteur écrit lui-même dans un `montrer` (`MONTRER`, `P_MONTRER`, `W_MONTRER`
 * produisent chacun exactement un geste, vérifié dans les trois adaptateurs).
 * Tout le reste — ouvertures d'onglet du moteur, sous-gestes techniques d'un
 * plan déduit d'une action — reste sans rang, donc sans voix.
 *
 * ⚠️ NEUTRE PAR CONSTRUCTION quand il n'y a rien à annoter : le plan est rendu
 * TEL QUEL, même objet, pas une copie. C'est ce qui garantit qu'un chapitre sans
 * voix construit exactement le plan d'avant.
 */
export function annoterBulleDAuteur(plan: PlanDemo, rang: number): PlanDemo {
  const k = plan.gestes.findIndex((g) => g.illustration && !g.ouvertureAuto)
  if (k < 0) return plan
  const gestes = [...plan.gestes]
  gestes[k] = { ...gestes[k], rangBulle: rang }
  return { gestes, pas: plan.pas }
}

export function planSequence(actions: SimulationAction[], ctx: ContexteDemo): PlanDemo[] {
  const plans: PlanDemo[] = []
  let onglet = ctx.onglet
  /* Le rang vient de l'index de l'ACTION, jamais de celui du plan : la ligne
     `if (!p) continue` ci-dessous jette les actions sans plan, et tout ce qui
     suivrait se décalerait d'un cran — sans erreur, sans compteur faux. */
  for (let rang = 0; rang < actions.length; rang++) {
    const a = actions[rang]
    const p = planDemonstration(a, { ...ctx, onglet })
    if (!p) continue
    plans.push(annoterBulleDAuteur(p, rang))
    /* Où ce plan laisse-t-il le ruban ? Le dernier geste qui déclare un onglet
       fait foi ; à défaut, l'onglet du dernier bouton de ruban qu'il presse. */
    for (const g of p.gestes) {
      if (g.onglet) onglet = g.onglet
      else {
        const t = ongletDuGeste(g)
        if (t) onglet = t
      }
    }
  }
  return plans
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
            // `rendreAgissant` écarte les gestes qui glissent — il ne sait pas
            // quoi sélectionner d'un point de départ seul. Résultat : la
            // démonstration DESSINAIT le glissement et la sélection ne bougeait
            // pas d'un pixel. C'est pourtant tout ce que l'étape demande.
            selectionner: action.range,
          },
        ],
        pas: ["Cliquer le premier coin", "Glisser jusqu'au dernier"],
      }
    }

    /* `rendreAgissant` ne sélectionne que pour une cible « cellule » ou
       « plage » : un en-tête de ligne ou de colonne n'en est pas une, et ces
       démonstrations DÉSIGNAIENT l'en-tête sans jamais sélectionner. Or c'est
       exactement — et uniquement — ce que l'étape demande. */
    case "SELECT_COLUMN":
      return {
        gestes: [
          {
            cible: { k: "enteteColonne", col: action.column },
            bulle: `l'en-tête de la colonne ${action.column}`,
            selectionner: `col:${action.column}`,
          },
        ],
        pas: ["Cliquer l'en-tête de colonne"],
      }

    case "SELECT_ROW":
      return {
        gestes: [
          {
            cible: { k: "enteteLigne", ligne: action.row },
            bulle: `l'en-tête de la ligne ${action.row}`,
            selectionner: `ligne:${action.row}`,
          },
        ],
        pas: ["Cliquer l'en-tête de ligne"],
      }

    case "SELECT_SHEET":
      return {
        gestes: [
          {
            cible: { k: "dom", sel: `[aria-label="Feuille ${action.name}"]` },
            bulle: `l'onglet ${action.name}`,
            // Un onglet de feuille n'est pas un `data-control` : il n'était donc
            // jamais pressé, et la démonstration « changez de feuille » laissait
            // l'apprenant sur la même feuille.
            presser: { id: `[aria-label="Feuille ${action.name}"]` },
          },
        ],
        pas: ["Cliquer l'onglet de feuille"],
      }

    /* ── zone Nom ────────────────────────────────────────────────────── */
    case "GOTO_REF":
      return {
        gestes: [
          {
            cible: { k: "dom", sel: '[aria-label="Zone Nom"]' },
            bulle: `saisir ${action.ref}`,
            frappe: action.ref,
            // La zone Nom DÉPLACE la sélection : la mimer sans bouger la
            // sélection montre une frappe sans effet.
            selectionner: action.ref,
          },
        ],
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

    case "SORT_RANGE": {
      /**
       * LA COLONNE DU CLIC DÉCIDE DU TRI.
       *
       * `handleControl` déduit la colonne à trier de la SÉLECTION — c'est le
       * geste d'Excel, et c'est ce que l'étape évalue. Le plan cliquait la
       * première cellule de la PLAGE : sur `A2:D8` trié par la colonne D, il
       * triait donc par A. La démonstration montrait le bon bouton et rendait
       * le mauvais tableau.
       */
      const debut = action.range.split(":")[0]
      const ligne = /(\d+)$/.exec(debut)?.[1] ?? "2"
      const dans = action.column ? `${action.column}${Number(ligne) + 1}` : debut
      return {
        gestes: [
          { cible: { k: "cellule", ref: dans }, bulle: `cliquer dans la colonne ${action.column ?? ""}`.trim() },
          { cible: ctrl(action.ascending ? "don-tri-croissant" : "don-tri-decroissant"), bulle: `trier ${action.ascending ? "de A à Z" : "de Z à A"}` },
        ],
        pas: ["Cliquer dans la colonne", "Cliquer le tri"],
      }
    }

    case "FILTER_COLUMN":
      return {
        gestes: [{ cible: ctrl("don-filtrer"), bulle: "le bouton Filtrer" }],
        pas: ["Poser le filtre", "Choisir la valeur"],
      }

    case "EXPECT_CHART": {
      /* MODIFIER n'est pas CRÉER. Une étape qui porte `setup.chartEdit` demande
         de retoucher le graphique existant : presser la galerie le
         RECONSTRUIRAIT sur la sélection courante, source comprise. */
      const patch = ctx.setup?.chartEdit
      if (patch && !ctx.setup?.chart) {
        const bouton = boutonEditionGraphique(patch)
        if (bouton) return { gestes: [{ cible: ctrl(bouton.id), bulle: bouton.nom }], pas: ["Cliquer le bouton"] }
        // Aucun bouton ne correspond : on DÉSIGNE le graphique et on s'arrête là
        // plutôt que d'en fabriquer un autre.
        return {
          gestes: [{ cible: { k: "dom", sel: "[data-chart-element]" }, bulle: "le graphique à modifier", illustration: true }],
          pas: [],
        }
      }
      const spec = (A.chart ?? {}) as Record<string, unknown>
      const type = typeof A.chartType === "string" ? A.chartType
        : typeof spec.type === "string" ? spec.type
        : undefined
      const id = (type && CTRL_GRAPH[type]) || "ins-graph-histogramme"
      /**
       * LA SOURCE, DÉDUITE COMME EXCEL LA DEVINE.
       *
       * Sans `setup.chart`, la galerie construit le graphique depuis la
       * SÉLECTION courante — et le plan n'en posait aucune : le graphique créé
       * n'avait ni les catégories ni le nombre de séries que la consigne
       * annonce. Or l'action les déclare : `categories: "A2:A7"` et
       * `seriesCount: 2` décrivent exactement le rectangle A1:C7, en-tête
       * compris. C'est ce que l'apprenant sélectionne, et c'est donc ce que la
       * démonstration doit sélectionner.
       */
      const sourceDeduite = (): string | null => {
        const cat = typeof spec.categories === "string" ? spec.categories : null
        const nb = typeof spec.seriesCount === "number" ? spec.seriesCount : null
        if (!cat || !nb) return null
        const m = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(cat)
        if (!m || m[1].toUpperCase() !== m[3].toUpperCase()) return null
        const col = m[1].toUpperCase()
        const r1 = Number(m[2])
        const r2 = Number(m[4])
        if (r1 < 2) return null // pas de ligne d'en-tête au-dessus
        const num = col.split("").reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0)
        let fin = ""
        let reste = num + nb
        while (reste > 0) {
          const r = (reste - 1) % 26
          fin = String.fromCharCode(65 + r) + fin
          reste = Math.floor((reste - 1) / 26)
        }
        return `${col}${r1 - 1}:${fin}${r2}`
      }
      const plage =
        typeof A.range === "string" ? A.range
        : typeof spec.source === "string" ? spec.source
        : sourceDeduite()
      const gestes: GesteDemo[] = []
      if (plage) gestes.push({ cible: { k: "plage", ref: plage }, bulle: `sélectionner ${lieu(plage)}` })
      gestes.push({ cible: ctrl(id), bulle: type ? `le graphique ${type}` : "insérer un graphique" })
      return { gestes, pas: plage ? ["Sélectionner les données", "Insérer le graphique"] : ["Insérer le graphique"] }
    }

    case "SELECT_CHART_ELEMENT": {
      /**
       * L'élément NOMMÉ, pas le premier venu.
       *
       * Le plan visait `[data-chart-element]` sans qualifier : le sélecteur rend
       * le premier élément du graphique, quel qu'il soit — la démonstration
       * cliquait donc le quadrillage là où la consigne demande la troisième
       * série. Et une SÉRIE n'existe pas comme élément du DOM : `ChartLayer`
       * n'expose que `point:<serie>:<index>` (les courbes ajoutent `serie:N`,
       * jamais les barres ni les secteurs). On clique donc une marque de la
       * série, ce qui est exactement la règle d'Excel que les leçons enseignent.
       */
      const e = action.element
      const s = /^(?:serie|point):(\d+)/.exec(e)
      const sel = s
        ? `[data-chart-element="${e}"],[data-chart-element="serie:${s[1]}"],[data-chart-element^="point:${s[1]}:"]`
        : `[data-chart-element="${e}"]`
      return {
        gestes: [{ cible: { k: "dom", sel }, bulle: `l'élément ${e} du graphique`, presser: { id: sel } }],
        pas: ["Cliquer l'élément"],
      }
    }

    case "EXPECT_PIVOT": {
      /* Même règle que pour les graphiques : `ins-tcd` sans `setup.pivot` pose
         un tableau VIDE — il effaçait donc le tableau que l'étape demande
         justement de retoucher. */
      const patch = ctx.setup?.pivotEdit
      if (patch && !ctx.setup?.pivot) {
        const gestes = gestesEditionTcd(patch, ctx.tcdCourant)
        if (gestes) return { gestes, pas: gestes.length > 1 ? ["Prendre le champ", "Le déposer"] : ["Cliquer"] }
        return {
          gestes: [{ cible: { k: "dom", sel: '[data-pivot-zone="rows"]' }, bulle: "le volet des champs du tableau croisé", illustration: true }],
          pas: [],
        }
      }
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
        /* CE SONT DES `<select>`, pas des boutons : un clic ouvre la liste et
           n'y choisit rien. Il faut leur donner la valeur, comme `mep-echelle`
           le fait déjà — sans quoi « ajustez à une page en largeur » pressait
           bien le contrôle et laissait le réglage inchangé (m13-l01). */
        if (st.largeur != null)
          gestes.push({
            cible: ctrl("mep-ajuster-largeur"),
            bulle: `ajuster à ${st.largeur} page en largeur`,
            presser: { id: '[data-control="mep-ajuster-largeur"]', arg: String(st.largeur) },
          })
        if (st.hauteur != null)
          gestes.push({
            cible: ctrl("mep-ajuster-hauteur"),
            bulle: `ajuster à ${st.hauteur} page en hauteur`,
            presser: { id: '[data-control="mep-ajuster-hauteur"]', arg: String(st.hauteur) },
          })
        if (gestes.length) return { gestes, pas: ["Régler l'ajustement"] }
      }
      /**
       * Les trois réglages qui dépendent de la SÉLECTION.
       *
       * Ils tombaient tous sur le repli « ouvrir l'onglet Mise en page », qui ne
       * produit rien : la démonstration de « définissez la zone d'impression »
       * se contentait d'ouvrir un onglet. `effetModele` lit `grid.getSelection()`
       * pour chacun, d'où le geste de sélection en tête — celui que la consigne
       * décrit, et que le `setup` de l'étape déclare.
       */
      /**
       * Les réglages qui ont un vrai bouton, et ce dont ils dépendent.
       *
       * Ils tombaient tous sur le repli « ouvrir l'onglet Mise en page », qui ne
       * produit rien : la démonstration de « définissez la zone d'impression »
       * se contentait d'ouvrir un onglet. Deux régimes cohabitent dans
       * `effetModele`, et le plan doit les respecter :
       *   · `mep-zone-impression-definir` et les sauts lisent la SÉLECTION ;
       *   · `mep-imprimer-titres` prend le `setup.pageSetup` déclaré tel quel,
       *     ce qui couvre aussi bien poser les titres que les retirer.
       */
      if (typeof p.printArea === "string") {
        if (p.printArea === "")
          return { gestes: [{ cible: ctrl("mep-zone-impression-annuler"), bulle: "annuler la zone d'impression" }], pas: ["Annuler la zone"] }
        return {
          gestes: [
            { cible: { k: "plage", ref: p.printArea }, bulle: `sélectionner ${lieu(p.printArea)}` },
            { cible: ctrl("mep-zone-impression-definir"), bulle: "définir la zone d'impression" },
          ],
          pas: ["Sélectionner la zone", "Définir la zone d'impression"],
        }
      }
      if (typeof p.repeatRows === "string" || typeof p.repeatCols === "string") {
        const met = (p.repeatRows ?? p.repeatCols) !== ""
        return {
          gestes: [{ cible: ctrl("mep-imprimer-titres"), bulle: met ? "répéter les titres à chaque page" : "retirer les titres répétés" }],
          pas: ["Imprimer les titres"],
        }
      }
      if (Array.isArray(p.pageBreakRows) || Array.isArray(p.pageBreakCols)) {
        const dejaL = new Set(ctx.reglagesCourants?.pageBreakRows ?? [])
        const dejaC = new Set(ctx.reglagesCourants?.pageBreakCols ?? [])
        const voulusL = (Array.isArray(p.pageBreakRows) ? p.pageBreakRows : []).map(Number)
        const voulusC = (Array.isArray(p.pageBreakCols) ? p.pageBreakCols : []).map(Number)
        /* CHAQUE saut manquant, pas seulement le dernier — et les COLONNES
           aussi, qui n'avaient aucune branche : `pageBreakCols: [5]` ne
           produisait pas un seul geste (m13-e05). */
        const manquantsL = voulusL.filter((n: number) => !dejaL.has(n))
        const manquantsC = voulusC.filter((n: number) => !dejaC.has(n))
        if (manquantsL.length || manquantsC.length) {
          const gestes: GesteDemo[] = []
          const pas: string[] = []
          for (const n of manquantsL) {
            // Le saut se pose AU-DESSUS de la ligne sélectionnée : la première
            // ligne de la page suivante, donc l'indice déclaré + 1 en notation A1.
            const ligne = n + 1
            gestes.push({ cible: { k: "enteteLigne", ligne }, bulle: `la ligne ${ligne}`, selectionner: `A${ligne}` })
            gestes.push({ cible: ctrl("mep-saut-inserer"), bulle: "insérer un saut de page" })
            pas.push(`Saut avant la ligne ${ligne}`)
          }
          for (const n of manquantsC) {
            const colonne = n + 1
            const lettre = columnIndexToLetter(colonne - 1)
            gestes.push({ cible: { k: "enteteColonne", col: lettre }, bulle: `la colonne ${lettre}`, selectionner: `${lettre}1` })
            gestes.push({ cible: ctrl("mep-saut-inserer"), bulle: "insérer un saut de page" })
            pas.push(`Saut avant la colonne ${lettre}`)
          }
          return { gestes, pas }
        }
        if (!voulusL.length && !voulusC.length) {
          return {
            gestes: [{ cible: ctrl("mep-sauts-reinitialiser"), bulle: "réinitialiser les sauts de page" }],
            pas: ["Réinitialiser les sauts"],
          }
        }
      }
      /**
       * Les réglages du PANNEAU, qui n'ont pas de bouton dans le ruban.
       *
       * Ils tombaient tous sur le repli « ouvrir l'onglet Mise en page », qui ne
       * change rien : « imprimez les en-têtes de lignes et de colonnes » se
       * démontrait en ouvrant un onglet. Ce sont des bascules et des champs du
       * panneau, chacun avec son propre `onChange` — `presserDemo` clique donc
       * l'élément réel, comme l'apprenant.
       */
      if (p.headings !== undefined)
        return { gestes: [{ cible: ctrl("mep-entetes-imprimer"), bulle: "imprimer les en-têtes de lignes et de colonnes" }], pas: ["Cocher l'option"] }
      if (p.gridlines !== undefined)
        return { gestes: [{ cible: ctrl("mep-quadrillage-imprimer"), bulle: "imprimer le quadrillage" }], pas: ["Cocher l'option"] }
      if (p.center && typeof p.center === "object") {
        const c = p.center as { horizontal?: boolean; vertical?: boolean }
        const gestes: GesteDemo[] = []
        if (c.horizontal !== undefined) gestes.push({ cible: ctrl("mep-centrer-horizontal"), bulle: "centrer horizontalement" })
        if (c.vertical !== undefined) gestes.push({ cible: ctrl("mep-centrer-vertical"), bulle: "centrer verticalement" })
        if (gestes.length) return { gestes, pas: ["Centrer sur la page"] }
      }
      if (typeof p.scale === "number")
        return {
          gestes: [{ cible: ctrl("mep-echelle"), bulle: `régler l'échelle à ${p.scale} %`, presser: { id: '[data-control="mep-echelle"]', arg: String(p.scale) } }],
          pas: ["Régler l'échelle"],
        }
      /* L'en-tête et le pied sont des OBJETS — `{gauche:"&A", droite:"&F"}` —
         et non des chaînes : la première version ne les reconnaissait pas et
         retombait sur « ouvrir l'onglet Mise en page », qui ne pose rien. */
      for (const [cle, ouvrir, quoi] of [
        ["header", "mep-onglet-entete", "l'en-tête"],
        ["footer", "mep-onglet-pied", "le pied de page"],
      ] as const) {
        const v = p[cle]
        if (!v || typeof v !== "object") continue
        const zones = Object.entries(v as Record<string, string>).filter(([, x]) => typeof x === "string")
        if (!zones.length) continue
        return {
          gestes: [
            { cible: ctrl("mep-entete-pied"), bulle: "ouvrir En-tête et pied de page" },
            { cible: ctrl(ouvrir), bulle: `l'onglet ${quoi}` },
            ...zones.map(([ou, texte]) => ({
              cible: ctrl(`${cle === "header" ? "mep-entete" : "mep-pied"}-${ou}`),
              bulle: `saisir « ${texte} » à ${ou}`,
              presser: { id: `[data-control="${cle === "header" ? "mep-entete" : "mep-pied"}-${ou}"]`, arg: texte },
            })),
          ],
          pas: ["Ouvrir la boîte", "Choisir la zone", "Saisir le texte"],
        }
      }
      // Repli : ouvrir l'onglet Mise en page — et l'ouvrir POUR DE VRAI, sinon
      // le geste ne fait que le désigner.
      return { gestes: [{ cible: { k: "dom", sel: '[data-ribbon-tab="mise-en-page"]' }, bulle: "l'onglet Mise en page", onglet: "mise-en-page" }], pas: ["Ouvrir Mise en page"] }
    }

    // Les identifiants du ruban sont `dev-enregistrer-macro` et
    // `dev-arreter-enregistrement` ; les 21 étapes du module 27 visaient
    // `dev-macro-enregistrer` / `dev-macro-arreter`, qui n'existent nulle part —
    // toutes leurs démonstrations se jouaient donc à blanc.
    /**
     * OUVRIR LA BOÎTE NE DÉMARRE PAS L'ENREGISTREMENT.
     *
     * « Enregistrer une macro » ouvre la fenêtre de nommage — c'est le premier
     * geste, pas le dernier. Tant que « OK » n'est pas validé, aucun
     * enregistreur ne tourne : la démonstration s'arrêtait au milieu du geste et
     * l'étape restait, à juste titre, non satisfaite.
     */
    case "RECORD_MACRO":
      if (action.expect === "started") {
        return {
          gestes: [
            { cible: ctrl("dev-enregistrer-macro"), bulle: "démarrer l'enregistrement" },
            { cible: ctrl("mac-dialogue-ok"), bulle: "valider le nom de la macro" },
          ],
          pas: ["Ouvrir la boîte", "Valider"],
        }
      }
      return {
        gestes: [{ cible: ctrl("dev-arreter-enregistrement"), bulle: "arrêter l'enregistrement" }],
        pas: ["Arrêter l'enregistrement"],
      }

    /**
     * UNE MACRO S'ENREGISTRE, ELLE NE SE CLIQUE PAS.
     *
     * Le plan se contentait d'ouvrir la boîte de nommage : la macro n'existait
     * pas, et les cellules qu'elle doit écrire restaient vides. Le geste complet
     * est celui de l'apprenant — démarrer l'enregistreur, le nommer, valider,
     * FAIRE les écritures que l'étape déclare (`macro.effet`), puis arrêter.
     * C'est ce dernier arrêt qui transforme les gestes en instructions.
     */
    case "EXPECT_MACRO": {
      const m = (A.macro ?? {}) as Record<string, unknown>
      const nom = typeof m.name === "string" ? m.name : null
      /**
       * ENREGISTRER OU EXÉCUTER : la macro existe-t-elle déjà ?
       *
       * `EXPECT_MACRO` décrit un ÉTAT — « la macro Pied_relatif a écrit son
       * total ici » — et cet état s'obtient de deux façons selon le moment du
       * chapitre. Sur `M27-E01-07` la consigne dit « Exécutez la macro » : elle
       * a été enregistrée quatre étapes plus tôt, en références relatives, et
       * l'exercice consiste à la lancer AILLEURS. Le plan la ré-enregistrait :
       * il écrasait une macro de quatre instructions par une de deux, et
       * détruisait le travail de l'apprenant — exactement le défaut « créer au
       * lieu de modifier » du module 20, transposé aux macros.
       */
      if (nom && (ctx.macrosCourantes ?? []).includes(nom)) {
        return {
          gestes: [
            { cible: ctrl("dev-macros"), bulle: "ouvrir la liste des macros" },
            { cible: ctrl(`mac-choix-${nom}`), bulle: `choisir « ${nom} »` },
            { cible: ctrl("mac-executer"), bulle: "exécuter la macro" },
          ],
          pas: ["Ouvrir les macros", "Choisir", "Exécuter"],
        }
      }
      const effet = (m.effet ?? {}) as Record<string, { v?: unknown; f?: string }>
      const ecritures = Object.entries(effet).map(([ref, att]) => {
        const quoi = att.f ?? (att.v !== undefined ? commeTape(att.v) : "")
        return {
          cible: { k: "cellule" as const, ref },
          bulle: `${ref} : ${quoi}`,
          frappe: quoi,
          ecrire: { ref, valeur: quoi },
        }
      })
      return {
        gestes: [
          { cible: ctrl("dev-enregistrer-macro"), bulle: "enregistrer une macro" },
          ...(nom
            ? [{
                cible: ctrl("mac-dialogue-nom"),
                bulle: `nommer « ${nom} »`,
                frappe: nom,
                presser: { id: '[data-control="mac-dialogue-nom"]', arg: nom },
              } as GesteDemo]
            : []),
          { cible: ctrl("mac-dialogue-ok"), bulle: "valider et démarrer l'enregistrement" },
          ...ecritures,
          { cible: ctrl("dev-arreter-enregistrement"), bulle: "arrêter l'enregistrement" },
        ],
        pas: ["Démarrer l'enregistrement", "Faire les gestes", "Arrêter"],
      }
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
              cible: ctrl(CONTROLES_POSTE.nomFichier),
              bulle: `saisir ${nom}`,
              frappe: nom,
              // Le champ est contrôlé par React : la pression spéciale rejoue
              // une vraie saisie DOM une fois l'animation de frappe terminée.
              // Le geste suivant peut alors montrer le bouton Enregistrer sur
              // une boîte qui contient réellement le nouveau nom.
              presser: { id: CONTROLES_POSTE.nomFichier, arg: nom },
            },
            {
              cible: ctrl("poste-enregistrer-valider"),
              bulle: "valider l'enregistrement",
              presser: { id: "poste-enregistrer-valider", arg: nom },
            },
          ],
          pas: ["Saisir le nouveau nom", "Enregistrer"],
        }
      }
      /**
       * « ENREGISTRER » N'OUVRE AUCUNE FENÊTRE SUR UN CLASSEUR DÉJÀ NOMMÉ.
       *
       * `appliquerGeste` reproduit fidèlement Excel : enregistrer un fichier qui
       * porte un nom écrase la version précédente, sans rien demander. Seul
       * « Enregistrer sous » (`forcer`) ouvre la boîte. Le plan pressait
       * pourtant « Enregistrer » : sur `M01-L05-12`, la consigne demande la
       * fenêtre, la démonstration cliquait le bouton, et rien ne s'ouvrait.
       */
      if (p.boite === "enregistrer")
        return ctx.classeurNomme
          ? g("poste-enregistrer-sous", "le bouton Enregistrer sous")
          : g("poste-enregistrer", "le bouton Enregistrer")
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
