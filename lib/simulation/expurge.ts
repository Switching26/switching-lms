/**
 * Expurgation du scénario servi au navigateur en mode ÉVALUATION.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE MODULE CORRIGE
 *
 * L'ancienne expurgation ne retirait que cinq clés, et seulement au PREMIER
 * niveau de l'étape : `attendu`, `expected`, `solution`, `aide`, `hint`. Or les
 * réponses des 27 évaluations ne vivent à aucun de ces endroits — elles vivent
 * dans `action` :
 *
 *   "action": { "type": "TYPE", "target": "D3",
 *               "accept": ["=SIERREUR(RECHERCHEV(B3;$H$3:$J$6;2;FAUX);\"Code inconnu\")"] }
 *
 * Autrement dit, la formule attendue partait telle quelle au navigateur, et
 * l'onglet réseau donnait le corrigé complet d'une évaluation notée. Le champ
 * `clientValidation: false` était bien émis par l'API… et lu par personne.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE L'EXPURGATION GARDE, ET POURQUOI
 *
 * Ne part au navigateur que ce dont l'atelier a besoin pour FONCTIONNER et que
 * la consigne de l'étape donne DÉJÀ. Tout le reste — la formule acceptée, la
 * valeur attendue, le format visé, la configuration d'un graphique ou d'un
 * tableau croisé, et jusqu'aux coordonnées que l'apprenant doit trouver —
 * reste au serveur.
 *
 * Corollaire : privé de réponses, le navigateur ne peut plus corriger. C'est
 * exactement ce que `clientValidation: false` annonce, et la correction passe
 * alors par `POST /api/simulations/[chapterId]/verify`, qui relit l'étape
 * réelle en base. Les leçons et les exercices, eux, ne sont pas expurgés : leur
 * consigne dit déjà quoi faire, rien n'y est noté, et la correction locale y
 * donne un retour instantané.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DEUX FILETS, PAS UN
 *
 * 1. une projection EXPLICITE par type d'action (`actionPublique`), qui décrit
 *    champ par champ ce qui a le droit de partir ;
 * 2. un balayage RÉCURSIF (`retirerClesSecretes`) qui supprime les clés
 *    connues pour porter une réponse, à n'importe quelle profondeur, y compris
 *    dans `setup` ou dans un champ qu'un futur scénario ajouterait.
 *
 * Le second existe parce que le premier suppose la liste des types à jour. Un
 * type d'action ajouté demain sans passer par ici sera reconduit tel quel par
 * la projection ; le balayage, lui, attrapera quand même un `accept` ou un
 * `attendu` qu'il porterait.
 */

/**
 * ────────────────────────────────────────────────────────────────────────────
 * UNE COORDONNÉE PEUT ÊTRE LA RÉPONSE
 *
 * La première version de ce module partageait le scénario en deux : le CRITÈRE,
 * public, et la RÉPONSE, secrète. Elle rangeait toutes les coordonnées de geste
 * du côté public, au motif qu'elles s'affichent déjà sous la consigne
 * (« Attendu : … »). C'était faux, et mesurable :
 *
 *   M04-EV01-03  « Trouvez la ligne en trop »          → servi `row: 7`
 *   M07-EV01-05  « Placez-vous sur la cellule fautive » → servi `cell: "E6"`
 *   M26-EV01-06  « sélectionnez le tableau »            → servi `range: "A1:C6"`
 *
 * Dans ces trois cas, TROUVER la coordonnée EST la question. Mesure sur les 27
 * évaluations : 187 cibles servies sur 353 n'étaient nommées nulle part dans
 * leur consigne.
 *
 * La règle est donc devenue : une coordonnée ne part au navigateur que si la
 * consigne de SON étape la nomme déjà. Sinon elle ne part pas, et l'atelier fait
 * sans — il observe le geste réellement accompli et laisse le serveur juger.
 *
 * Le test se fait sur la consigne SEULE, pas sur le classeur : ce qui est écrit
 * dans la consigne est donné à l'apprenant, ce qui est visible dans la feuille
 * demande encore de chercher.
 */

import { LIBELLE_CONTROLE } from "./attendu"
import { prefixeDeType } from "./contrats"

/**
 * Le type d'action débarrassé de son préfixe d'application.
 *
 * `MONTRER` · `W_MONTRER` · `P_MONTRER` · `O_MONTRER` sont le MÊME geste :
 * désigner un endroit (`cible`) et l'expliquer (`texte`). Seul le préfixe
 * change. On le déduit comme le fait `registre.ts` — `prefixeDeType` est la
 * source unique — plutôt que de tenir ici une liste en dur, qui se périmerait
 * silencieusement à la prochaine application branchée.
 *
 * L'import vient de `contrats.ts`, jamais du registre : le socle n'importe
 * aucune valeur, donc il ne referme pas le cycle
 * `registre → adaptateur → expurge` que `check-frontieres` interdit.
 */
function sansPrefixe(type: string): string {
  return type.slice(prefixeDeType(type).length)
}

/**
 * Le mot par lequel une consigne désigne un bouton.
 *
 * Un identifiant technique (`acc-gras`) n'apparaît jamais dans une consigne ;
 * son libellé (« Gras »), lui, y est presque toujours. Sans cette traduction, le
 * filtre retirerait tous les boutons, y compris ceux que la consigne nomme.
 */
function libelleDeControle(control: string): string {
  return LIBELLE_CONTROLE[control] ?? control
}

/** Clés qui portent une réponse, quelle que soit leur profondeur. */
export const CLES_SECRETES = [
  "attendu",
  "expected",
  "solution",
  "aide",
  "hint",
  "accept",
  "feedback",
  "corrige",
  "answer",
] as const

type Objet = Record<string, unknown>

/**
 * Champs d'action qui désignent un ENDROIT du classeur ou un bouton, et qui ne
 * partent qu'à la condition d'être nommés dans la consigne.
 *
 * `cells` n'y figure pas : ses références ne partent plus du tout.
 */
const COORDONNEES_GARDEES = [
  "cell",
  "range",
  "row",
  "column",
  "ref",
  "target",
  "name",
  "to",
  "from",
  "element",
  "control",
  /*
   * DÉSIGNATIONS DES TROIS AUTRES APPLICATIONS.
   *
   * Elles ne partaient pas tant que `route.ts` servait tout le monde avec la
   * projection d'Excel : l'action était vidée avant d'arriver. Le jour où la
   * projection de chaque application est branchée, elles arrivent — et
   * plusieurs SONT la réponse. Mesuré sur les 32 évaluations PowerPoint et
   * Outlook : `objectId: "zt-repete"` servi sous « une zone répète ce que le
   * bloc dit déjà : faites-la disparaître », `objectId: "fo-reste"` sous « un
   * élément n'apporte rien : débarrassez-vous-en », `dossier: "envoyes"` sous
   * « le dossier où se trouve la copie de ce que vous avez envoyé »,
   * `shape: "fleche"` sous « ajoutez de quoi désigner un point précis ».
   *
   * La règle qui les gouverne est celle d'Excel, sans exception nouvelle : une
   * désignation ne part QUE si la consigne la nomme. Aucune n'est nécessaire
   * pour jouer — les players PowerPoint et Outlook ne lisent que `action.type`,
   * et `cible()` n'y sert qu'au halo d'aide, éteint en évaluation notée. Sans
   * elles, la ligne « Attendu » se dégrade en formulation générique, ce que les
   * adaptateurs prévoient déjà.
   *
   * Deux désignations restent volontairement HORS de cette liste, parce
   * qu'elles disent OÙ agir et non QUOI répondre — et que les retirer rendrait
   * l'étape injouable : la `zone` de Word, dont la surface a besoin pour
   * observer quoi que ce soit, et le `champ` d'Outlook, qui nomme la case à
   * remplir quand la réponse est le texte qu'on y saisit.
   */
  "index",
  "objectId",
  "objectType",
  "shape",
  "view",
  "id",
  "dossier",
] as const

/** Comparaison indifférente aux accents, à la casse et aux espaces multiples. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
}

/**
 * La consigne nomme-t-elle cette cible ?
 *
 * Tolérante sur deux points, et sur deux seulement :
 *  • une plage « A1:C6 » est reconnue quand la consigne cite ses deux angles ;
 *  • un bouton est cherché par son LIBELLÉ (« Gras »), pas par son identifiant
 *    technique (`acc-gras`), puisque c'est ainsi que la consigne le désigne.
 */
export function consigneNommeLaCible(consigne: string, valeur: string): boolean {
  const c = normaliser(consigne)
  const v = normaliser(valeur)
  if (!v) return false
  if (c.includes(v)) return true
  if (v.includes(":")) {
    const [a, b] = v.split(":")
    if (a && b && c.includes(a) && c.includes(b)) return true
  }
  return false
}

function estObjet(v: unknown): v is Objet {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

/**
 * Retire récursivement toute clé de `CLES_SECRETES`, sans muter l'entrée.
 *
 * La profondeur est bornée : un scénario est de la donnée, pas un graphe, et
 * une structure circulaire ne doit pas faire tomber une route d'API.
 */
export function retirerClesSecretes(valeur: unknown, profondeur = 0): unknown {
  if (profondeur > 12) return undefined
  if (Array.isArray(valeur)) return valeur.map((v) => retirerClesSecretes(v, profondeur + 1))
  if (!estObjet(valeur)) return valeur
  const sortie: Objet = {}
  for (const [cle, v] of Object.entries(valeur)) {
    if ((CLES_SECRETES as readonly string[]).includes(cle)) continue
    sortie[cle] = retirerClesSecretes(v, profondeur + 1)
  }
  return sortie
}

/**
 * Les tables de cellules attendues ne partent PLUS DU TOUT — ni leurs valeurs,
 * ni leurs références.
 *
 * Les références disaient où le résultat était attendu, ce que la consigne ne
 * dit pas toujours (111 des 115 références d'`EXPECT_STATE` du corpus n'y
 * figurent pas). L'atelier n'en a plus besoin : sur une évaluation notée, il
 * envoie un relevé BORNÉ de la zone utile du classeur, et le serveur y prélève
 * lui-même les seules cellules qu'il attend. Le navigateur ne sait donc plus
 * lesquelles comptent.
 */


/**
 * Projection publique d'une action notée.
 *
 * Tout champ non nommé ici est ABANDONNÉ : la liste blanche est la règle, pour
 * qu'un champ ajouté à un type existant ne parte pas au navigateur par défaut.
 */
export function actionPublique(action: unknown): Objet {
  if (!estObjet(action) || typeof action.type !== "string") return { type: "READ" }
  const t = action.type
  const garde = (...cles: string[]): Objet => {
    const o: Objet = { type: t }
    for (const c of cles) if (action[c] !== undefined) o[c] = retirerClesSecretes(action[c])
    return o
  }

  /* LE GESTE DE DÉSIGNATION, DANS LES QUATRE APPLICATIONS.
   *
   * Traité AVANT le `switch`, parce que le type porte un préfixe d'application
   * (`W_MONTRER`, `P_MONTRER`) qu'un `case` littéral ne peut pas reconnaître —
   * ils tombaient dans le `default`, qui ne laisse passer que le type. La
   * démonstration survivait alors PRIVÉE de sa cible et de sa phrase : un
   * énoncé muet, ce qui est pire qu'une démonstration absente.
   *
   * La liste blanche reste exactement la même — `cible` et `texte`, rien
   * d'autre. `ecrire` n'est pas gardé ici, et un geste qui en porte fait de
   * toute façon abandonner la démonstration entière (voir plus bas). */
  if (sansPrefixe(t) === "MONTRER") return garde("cible", "texte")

  switch (t) {
    case "TYPE":
      // `accept` part. `target` reste : il verrouille la cellule éditable et
      // porte le critère affiché. `prefill` reste : il est DÉJÀ dans la cellule
      // au début de l'étape, le cacher ne cacherait rien.
      return garde("target", "formulaMode", "caseSensitive", "maxLength", "prefill")

    case "EXPECT_STATE":
    case "EXPECT_FORMAT":
      return { type: t }

    case "EXPECT_PIVOT":
      // Même raison : les cellules de contrôle du tableau produit ne partent
      // plus. Le relevé borné de la zone utile les contient de toute façon.
      return { type: t }

    case "EXPECT_MACRO": {
      const macro = estObjet(action.macro) ? action.macro : {}
      // `name` reste SI la consigne le nomme — c'est presque toujours le cas,
      // une macro se désigne par son nom. Le filtre de consigne appliqué plus
      // bas s'en charge ; ici on se contente de ne pas servir son `effet`.
      const publique: Objet = {}
      if (typeof macro.name === "string") publique.name = macro.name
      return { type: t, macro: publique }
    }

    case "SORT_RANGE":
      // `range` reste : c'est l'atelier qui exécute le tri, Univer ne devine pas
      // la plage comme Excel. La COLONNE et le SENS sont la réponse.
      return garde("range")

    case "FILTER_COLUMN":
      // La colonne reste (critère affiché), les valeurs à conserver partent.
      return garde("column")

    case "DEFINE_NAME":
      // `name` est dicté par la consigne. `ref` — la plage à nommer — est
      // précisément ce que l'apprenant doit trouver.
      return garde("name")

    case "EXPECT_CHART":
    case "EXPECT_PAGE_SETUP":
    case "EXPECT_POSTE":
    case "RECORD_MACRO":
      // Rien à conserver : l'observation est produite depuis l'état réel de
      // l'atelier, sans jamais consulter l'attendu.
      return { type: t }

    // Gestes dont la cible EST le critère affiché sous la consigne.
    case "CLICK_CELL":
      return garde("cell")
    case "CLICK_CELL_MODIFIER":
      return garde("cell", "modifier")
    case "CLICK_CONTROL":
      return garde("control")
    case "CONTEXT_MENU":
    case "DOUBLE_CLICK":
      return garde("target")
    case "SELECT_COLUMN":
      return garde("column")
    case "SELECT_ROW":
      return garde("row")
    case "SELECT_SHEET":
      return garde("name")
    case "GOTO_REF":
      return garde("ref")
    case "KEY":
      return garde("key")
    case "FILL_HANDLE":
      return garde("from", "to", "tooltips")
    case "DRAG_RANGE":
      return garde("range", "duringEdit", "template")
    case "SELECT_CHART_ELEMENT":
      return garde("element")
    case "READ":
      return { type: "READ" }

    default:
      // Type inconnu de cette liste : on ne laisse passer que le type. Le
      // silence est le bon défaut — un champ inconnu peut être une réponse.
      return { type: t }
  }
}

/**
 * Retire d'une action publique toute coordonnée absente de la consigne.
 *
 * `libelleDeControle` traduit un identifiant de bouton en mot français, parce
 * qu'une consigne écrit « mettez en gras », jamais « acc-gras ».
 */
export function filtrerParLaConsigne(action: Objet, consigne: string): Objet {
  const sortie: Objet = {}
  for (const [cle, valeur] of Object.entries(action)) {
    if (!(COORDONNEES_GARDEES as readonly string[]).includes(cle)) {
      sortie[cle] = valeur
      continue
    }
    if (valeur === undefined || valeur === null || typeof valeur === "object") continue
    const cherche = cle === "control" ? libelleDeControle(String(valeur)) : String(valeur)
    if (consigneNommeLaCible(consigne, cherche)) sortie[cle] = valeur
  }
  // `macro.name` suit la même règle : il ne part que si la consigne le nomme.
  if (estObjet(sortie.macro)) {
    const m = sortie.macro as Objet
    if (typeof m.name === "string" && !consigneNommeLaCible(consigne, m.name)) {
      sortie.macro = {}
    }
  }
  return sortie
}

/**
 * LE RECTANGLE À RELEVER, calculé depuis le CONTENU PUBLIC SEUL.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS DEPUIS LES CELLULES ATTENDUES
 *
 * L'atelier ne connaît plus les cellules jugées : il relève un rectangle et le
 * serveur y prélève ce qu'il attend. La première version bornait ce rectangle
 * sur les cellules attendues elles-mêmes — et le rectangle devenait alors un
 * indice : « A1:E11 » disait que la cible cachée était en colonne E.
 *
 * La borne ne vient donc QUE de ce que l'apprenant voit déjà : le classeur de
 * départ et les `setup` des étapes, tous deux servis en clair. On y ajoute une
 * MARGE FIXE — l'apprenant écrit au-delà du contenu initial —, puis on arrondit
 * au PALIER supérieur. Les deux constantes sont indépendantes du corpus.
 *
 * Conséquence recherchée : déplacer une cible secrète à l'intérieur du même
 * palier ne change pas le rectangle. Il ne renseigne sur rien.
 */

/** Marge fixe au-delà du contenu visible : l'apprenant écrit plus loin. */
const MARGE_COLONNES = 8
const MARGE_LIGNES = 8
/** Paliers d'arrondi : le rectangle ne s'ajuste jamais au plus près. */
const PALIER_COLONNES = 8
const PALIER_LIGNES = 20

function refVersPlace(ref: string): { colonne: number; ligne: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/i.exec(String(ref).trim())
  if (!m) return null
  let colonne = 0
  for (const c of m[1].toUpperCase()) colonne = colonne * 26 + (c.charCodeAt(0) - 64)
  return { colonne, ligne: parseInt(m[2], 10) }
}

function lettreDeColonne(index: number): string {
  let s = ""
  let n = index
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * @param steps  les étapes, dont on ne lit QUE les `setup` — jamais les `action`.
 * @param workbook le classeur de départ, entièrement public.
 */
export function zoneObservable(steps: unknown[], workbook: unknown): string | null {
  let maxColonne = 0
  let maxLigne = 0
  const prendre = (ref: unknown) => {
    // Une plage compte par son angle le plus éloigné.
    for (const bout of String(ref ?? "").split(":")) {
      const p = refVersPlace(bout)
      if (!p) continue
      maxColonne = Math.max(maxColonne, p.colonne)
      maxLigne = Math.max(maxLigne, p.ligne)
    }
  }

  // 1. le classeur de départ, que l'apprenant a sous les yeux.
  const feuilles = estObjet(workbook) && Array.isArray(workbook.sheets) ? workbook.sheets : []
  for (const feuille of feuilles) {
    if (!estObjet(feuille) || !estObjet(feuille.cells)) continue
    for (const ref of Object.keys(feuille.cells)) prendre(ref)
  }
  if (estObjet(workbook)) {
    prendre(workbook.filterRange)
    prendre(workbook.selection)
  }

  // 2. les `setup` des étapes : ils écrivent le décor, il est visible.
  for (const brut of steps) {
    if (!estObjet(brut) || !estObjet(brut.setup)) continue
    const setup = brut.setup
    if (estObjet(setup.cells)) for (const ref of Object.keys(setup.cells)) prendre(ref)
    prendre(setup.selection)
  }

  if (maxColonne === 0 || maxLigne === 0) return null

  const arrondi = (v: number, palier: number) => Math.ceil(v / palier) * palier
  const colonne = arrondi(maxColonne + MARGE_COLONNES, PALIER_COLONNES)
  const ligne = arrondi(maxLigne + MARGE_LIGNES, PALIER_LIGNES)
  return `A1:${lettreDeColonne(colonne)}${ligne}`
}

/**
 * L'évaluation juge-t-elle au moins une cellule ?
 *
 * Si non, aucun rectangle n'est servi : ce serait un renseignement gratuit sur
 * la forme de la feuille, offert sans qu'aucune observation n'en ait besoin.
 */
function attendDesCellules(steps: unknown[]): boolean {
  for (const brut of steps) {
    if (!estObjet(brut) || !estObjet(brut.action)) continue
    const a = brut.action
    if (estObjet(a.cells)) return true
    if (estObjet(a.pivot) && estObjet(a.pivot.cells)) return true
    if (estObjet(a.macro) && estObjet(a.macro.effet)) return true
  }
  return false
}

type EtapeBrute = Objet
type ScenarioBrut = { steps?: unknown } & Objet

/**
 * Scénario prêt à être servi pour une évaluation notée.
 *
 * Trois opérations, dans cet ordre :
 *  1. le bloc `remediation` disparaît — lire « m10-l02 » dans l'onglet réseau
 *     indiquerait qu'une question porte sur la gestion d'erreur, avant même que
 *     l'apprenant l'ait lue ;
 *  2. chaque étape est reconstruite à partir de ses seuls champs publics ;
 *  3. un balayage récursif final retire les clés secrètes partout ailleurs.
 */
/**
 * Projection d'une action, injectable.
 *
 * Chaque application décide ce qui a le droit de partir au navigateur, via
 * `adaptateur.publier()`. La fonction est passée en PARAMÈTRE et non importée du
 * registre : `registre.ts → excel-adaptateur.ts → expurge.ts`, donc importer le
 * registre ici fermerait un cycle d'initialisation — et un cycle sur CE
 * fichier-là compromettrait l'expurgation des évaluations notées.
 *
 * Absente, la projection d'Excel s'applique : c'est exactement le comportement
 * des 246 chapitres publiés.
 */
export type ProjectionAction = (action: unknown) => Objet | null

export function expurgerScenarioNote(
  scenario: unknown,
  projeter: ProjectionAction = actionPublique,
): Objet {
  const publier = (a: unknown): Objet => {
    const p = projeter(a)
    // `null` ⇒ « seul le type ». Le silence est le bon défaut : une étape privée
    // de ses champs est INJOUABLE, donc bruyante ; une réponse laissée passer
    // serait silencieuse et compromettrait la note.
    if (p) return p
    const t = estObjet(a) ? (a as Objet).type : undefined
    return typeof t === "string" ? { type: t } : {}
  }
  const base = estObjet(scenario) ? (scenario as ScenarioBrut) : {}
  const steps = Array.isArray(base.steps) ? base.steps : []

  const etapes = steps.map((brut) => {
    if (!estObjet(brut)) return {}
    const e = brut as EtapeBrute
    const sortie: Objet = {}
    // Liste blanche des champs d'étape. `aide` et `feedback` ne sont pas cités,
    // donc ils tombent ; `montrer` n'est conservé que sur un écran de lecture.
    if (typeof e.id === "string") sortie.id = e.id
    if (typeof e.consigne === "string") sortie.consigne = e.consigne
    if (typeof e.points === "number") sortie.points = e.points
    if (e.setup !== undefined) sortie.setup = retirerClesSecretes(e.setup)

    /* FILTRE PAR LA CONSIGNE.
     *
     * `actionPublique` dit quels champs ont le droit d'exister ; ce filtre-ci
     * dit lesquels ont le droit de PARTIR. Une coordonnée que la consigne ne
     * nomme pas est la réponse à sa propre question — « trouvez la ligne en
     * trop » servie avec `row: 7` —, donc elle tombe.
     *
     * L'atelier fonctionne sans : il observe le geste réellement accompli et le
     * serveur le compare à ce qu'il attend. */
    sortie.action = filtrerParLaConsigne(
      publier(e.action),
      typeof e.consigne === "string" ? e.consigne : "",
    )

    const type = (sortie.action as Objet).type
    // La démonstration d'un écran d'énoncé fait partie du contenu : elle situe
    // les blocs du classeur, elle ne souffle aucune réponse. Sur une étape
    // NOTÉE, elle rejouerait le geste attendu — elle ne part jamais.
    /* LA DÉMONSTRATION D'UN ÉNONCÉ, ET RIEN D'AUTRE.
     *
     * Audit des 27 évaluations : 77 gestes de démonstration, TOUS de type
     * `MONTRER` (désigner un endroit et l'expliquer), TOUS portés par les 26
     * écrans d'énoncé — « le seuil de parcours long est ici, en C1 », « la
     * table des tarifs, à droite ». C'est le contenu de l'énoncé, joué à
     * l'écran ; le retirer amputerait l'ouverture des 26 évaluations d'une
     * information que la consigne donne déjà en toutes lettres.
     *
     * Mais `MONTRER` prévoit aussi `ecrire: { cell, valeur }`, et un autre type
     * de geste rejouerait carrément l'action attendue. Aucun des deux n'existe
     * dans le corpus — et c'est précisément le genre de porte qu'on ne laisse
     * pas entrouverte pour un scénario écrit plus tard. Donc :
     *
     *   • chaque geste repasse par la MÊME projection que l'action d'une étape,
     *     qui ne conserve d'un `MONTRER` que sa cible et son texte ;
     *   • et si UN SEUL geste n'est pas un `MONTRER` pur, la démonstration
     *     entière est abandonnée. Une démonstration amputée d'un geste sur
     *     trois vaut moins que pas de démonstration du tout : elle laisserait
     *     croire à l'apprenant qu'il a tout vu.
     */
    if (type === "READ" && Array.isArray(e.montrer)) {
      const gestes = e.montrer.map((geste) => publier(geste))
      const tousMontrer = e.montrer.every(
        (geste) =>
          estObjet(geste) &&
          typeof geste.type === "string" &&
          // Le test portait sur le type LITTÉRAL `MONTRER` : `W_MONTRER` et
          // `P_MONTRER` échouaient, et les 11 énoncés d'évaluation Word comme
          // les 9 écrans PowerPoint étaient abandonnés en bloc. La garantie
          // ci-dessus est INCHANGÉE — c'est toujours tout ou rien —, seule la
          // reconnaissance du type s'aligne sur la déduction par préfixe.
          sansPrefixe(geste.type) === "MONTRER" &&
          geste.ecrire === undefined,
      )
      if (tousMontrer && gestes.length > 0) sortie.montrer = gestes
    }
    return sortie
  })

  const { steps: _steps, remediation: _remediation, ...reste } = base as Objet & { remediation?: unknown }
  const zone = attendDesCellules(steps) ? zoneObservable(steps, base.workbook) : null
  return {
    ...(retirerClesSecretes(reste) as Objet),
    // Le RECTANGLE dans lequel l'atelier doit relever le classeur pour qu'une
    // observation d'état soit jugeable. Voir `zoneObservable`.
    ...(zone ? { zoneObservable: zone } : {}),
    steps: etapes,
  }
}

/**
 * Détecteur de fuite, utilisé par les contrôles.
 *
 * ⚠️ UNE CHAÎNE D'ATTENDU N'EST PAS FORCÉMENT UN SECRET.
 *
 * Beaucoup de chaînes vivent des deux côtés. « Montant » est le nom d'un champ
 * attendu dans un tableau croisé, ET l'en-tête d'une colonne du classeur de
 * départ que l'apprenant a sous les yeux. « Histogramme » est le type de
 * graphique attendu, ET le mot de la consigne. Exiger leur absence du scénario
 * servi reviendrait à exiger que l'apprenant ne voie plus son propre classeur.
 *
 * La question juste est donc : *cette chaîne est-elle connaissable autrement
 * que par la réponse ?* Si elle figure déjà dans le corpus PUBLIC — titre,
 * intro, ruban, classeur de départ, consignes, `setup`, démonstration d'un
 * énoncé — sa présence dans le scénario servi n'apprend rien à personne. Si
 * elle n'y figure pas, c'est une fuite.
 *
 * `corpusPublic` doit être construit depuis le scénario D'ORIGINE (voir
 * `corpusPublicDuScenario`), et surtout pas depuis le scénario servi : celui-ci
 * contiendrait alors sa propre justification.
 */
export function chercherFuites(
  servi: unknown,
  secrets: string[],
  corpusPublic = "",
): string[] {
  const texte = JSON.stringify(servi ?? null) ?? ""
  const trouvees: string[] = []
  for (const cle of CLES_SECRETES) {
    if (texte.includes(`"${cle}":`)) trouvees.push(`clé « ${cle} »`)
  }
  for (const s of secrets) {
    const aiguille = String(s ?? "").trim()
    // Une chaîne trop courte produirait des coïncidences (« B3 » est partout
    // dans une consigne). Seules les réponses réellement distinctives comptent.
    if (aiguille.length < 6) continue
    const brut = JSON.stringify(aiguille).slice(1, -1)
    if (!texte.includes(brut)) continue
    if (corpusPublic.includes(brut)) continue // déjà visible : rien de nouveau
    trouvees.push(`valeur « ${aiguille} »`)
  }
  return trouvees
}

/**
 * Le corpus PUBLIC d'un scénario : tout ce que l'apprenant voit de toute façon.
 *
 * Volontairement construit à la main, champ par champ, plutôt qu'en retirant
 * les `action` du scénario : on veut la liste explicite de ce qui est
 * légitimement visible, pas son complément.
 */
export function corpusPublicDuScenario(scenario: unknown): string {
  const s = estObjet(scenario) ? scenario : {}
  const steps = Array.isArray(s.steps) ? s.steps : []
  return JSON.stringify({
    title: s.title,
    intro: s.intro,
    ribbon: s.ribbon,
    moduleTitle: s.moduleTitle,
    statusBar: s.statusBar,
    // Le classeur de DÉPART est sous les yeux de l'apprenant dès la première
    // seconde : en-têtes, libellés, valeurs déjà saisies, plages nommées.
    workbook: s.workbook,
    etapes: steps.map((brut) => {
      const e = estObjet(brut) ? brut : {}
      return {
        id: e.id,
        consigne: e.consigne,
        // `setup` écrit dans le classeur AVANT l'étape : c'est du décor visible.
        setup: e.setup,
        // La démonstration d'un écran d'énoncé est jouée à l'écran.
        montrer: estObjet(e.action) && e.action.type === "READ" ? e.montrer : undefined,
      }
    }),
  })
}
