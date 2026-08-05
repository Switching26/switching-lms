/**
 * Le document Word, vu par le simulateur — modèle déclaratif, lecture du modèle
 * du moteur, et résolution des zones.
 *
 * ⚠️ CE MODULE EST PUR. Ni React, ni DOM, ni Univer. C'est une exigence, pas un
 * style : le juge des évaluations notées tourne aussi CÔTÉ SERVEUR, sur la
 * route `/api/simulations/[chapterId]/verify`, et Univer n'est pas importable
 * côté serveur — son moteur de rendu casse à l'import Node. Un seul `import`
 * d'un paquet `@univerjs/*` ici et toutes les évaluations Word deviendraient
 * incorrigibles en production.
 *
 * Conséquence directe : les valeurs que le moteur stocke sont RECOPIÉES ici, et
 * chacune a été mesurée dans un vrai navigateur (banc 8862, Univer 0.25.1). Une
 * valeur devinée produirait un juge faux SANS ERREUR VISIBLE — la formation
 * continuerait de se jouer normalement avec des verdicts absurdes.
 */

import type { WordParagrapheObserve, WordPlage, WordRunObserve } from "./observations"
import { normaliserTypographie } from "./typo-fr"

/* ═══════════════════════════════════════════════════════════════════════════
   CE QUE LE MOTEUR STOCKE — relevé au banc, geste par geste
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `paragraphStyle.namedStyleType`, mesuré en appliquant chaque commande de
 * style puis en relisant `getSnapshot()`.
 *
 * « Normal » est le SEUL qui ne pose aucune valeur : la commande RETIRE la clé
 * au lieu d'écrire 1. Un juge qui chercherait `namedStyleType === 1` pour
 * « Normal » refuserait donc un paragraphe parfaitement normal.
 */
const STYLE_PAR_CODE: Record<number, string> = {
  2: "Titre",
  3: "Sous-titre",
  4: "Titre 1",
  5: "Titre 2",
  6: "Titre 3",
  7: "Titre 4",
  8: "Titre 5",
}
/** Le libellé français d'un paragraphe sans `namedStyleType`. */
export const STYLE_NORMAL = "Normal"

/** `paragraphStyle.horizontalAlign`, mesuré : 1 gauche · 2 centre · 3 droite · 4 justifié. */
const ALIGNEMENT_PAR_CODE: Record<number, WordParagrapheObserve["alignement"]> = {
  1: "gauche",
  2: "centre",
  3: "droite",
  4: "justifie",
}

/** `bullet.listType`, mesuré. */
const LISTE_PAR_CODE: Record<string, WordParagrapheObserve["liste"]> = {
  BULLET_LIST: "puces",
  ORDER_LIST: "numerotee",
  CHECK_LIST: "controle",
}

/* ═══════════════════════════════════════════════════════════════════════════
   LE DOCUMENT DÉCLARÉ PAR UN SCÉNARIO
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un paragraphe, tel qu'un auteur de scénario l'écrit. */
export type WordParagrapheDeclare = {
  texte: string
  style?: string
  alignement?: WordParagrapheObserve["alignement"]
  liste?: WordParagrapheObserve["liste"]
  /** Mise en forme appliquée à TOUT le paragraphe, pour un état de départ. */
  format?: WordRunObserve
}

/** L'état de départ d'un document, déclaré par le scénario. */
export type WordDocumentState = {
  paragraphes: WordParagrapheDeclare[]
  page?: {
    orientation?: "portrait" | "paysage"
    margeHaut?: number
    margeBas?: number
    margeGauche?: number
    margeDroite?: number
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTRUIRE LE CORPS QUE LE MOTEUR ATTEND
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un corps Univer, décrit sans importer Univer. */
export type CorpsUniver = {
  dataStream: string
  textRuns: { st: number; ed: number; ts: Record<string, unknown> }[]
  paragraphs: { startIndex: number; paragraphStyle?: Record<string, unknown>; bullet?: Record<string, unknown> }[]
  sectionBreaks: { startIndex: number }[]
  /**
   * 🔴 OBLIGATOIRE, MÊME VIDE — sinon l'insertion de tableau échoue.
   *
   * `doc.command.create-table` construit une opération JSON qui écrit dans
   * `body.tables` et dans `tableSource`. Une opération d'insertion sur un
   * chemin ABSENT lève « Cannot insert into missing item » : le tableau ne se
   * pose pas, et l'erreur ne dit rien du chemin fautif. Un tableau vide suffit
   * à ouvrir le chemin.
   */
  tables: unknown[]
}

const CODE_PAR_STYLE: Record<string, number> = Object.fromEntries(
  Object.entries(STYLE_PAR_CODE).map(([k, v]) => [v.toLowerCase(), Number(k)]),
)
const CODE_PAR_ALIGNEMENT: Record<string, number> = { gauche: 1, centre: 2, droite: 3, justifie: 4 }
const CODE_PAR_LISTE: Record<string, string> = {
  puces: "BULLET_LIST",
  numerotee: "ORDER_LIST",
  controle: "CHECK_LIST",
}

/** Traduit un format lisible en attributs de caractère du moteur. */
export function attributsDeFormat(f: WordRunObserve): Record<string, unknown> {
  const ts: Record<string, unknown> = {}
  if (f.gras) ts.bl = 1
  if (f.italique) ts.it = 1
  if (f.souligne) ts.ul = { s: 1 }
  if (f.barre) ts.st = { s: 1 }
  if (f.taille !== undefined) ts.fs = f.taille
  if (f.police !== undefined) ts.ff = f.police
  if (f.couleur !== undefined) ts.cl = { rgb: f.couleur }
  if (f.surlignage !== undefined) ts.bg = { rgb: f.surlignage }
  return ts
}

/**
 * Construit le corps Univer d'un document déclaré.
 *
 * 🔴 LA CONVENTION QUI DÉCIDE DE TOUT, et qui a coûté une heure de fausse piste :
 * un `dataStream` n'est pas du texte libre. Chaque paragraphe se TERMINE par
 * `\r`, le document se termine par un `\n` de saut de section, et les DEUX
 * tableaux `paragraphs` et `sectionBreaks` doivent porter l'index de ces
 * marqueurs. S'ils manquent, rien ne casse et aucune erreur n'est levée — le
 * squelette compose simplement ZÉRO page, et l'écran reste blanc alors que le
 * modèle contient bien le texte. Le compteur de pixels, lui, disait « peint ».
 */
export function corpsUniver(etat: WordDocumentState): CorpsUniver {
  let flux = ""
  const paragraphs: CorpsUniver["paragraphs"] = []
  const textRuns: CorpsUniver["textRuns"] = []

  for (const p of etat.paragraphes) {
    const debut = flux.length
    flux += p.texte
    if (p.format) {
      const ts = attributsDeFormat(p.format)
      if (Object.keys(ts).length > 0 && flux.length > debut) {
        textRuns.push({ st: debut, ed: flux.length, ts })
      }
    }

    const paragraphStyle: Record<string, unknown> = {}
    const code = p.style ? CODE_PAR_STYLE[p.style.toLowerCase()] : undefined
    if (code !== undefined) paragraphStyle.namedStyleType = code
    if (p.alignement) paragraphStyle.horizontalAlign = CODE_PAR_ALIGNEMENT[p.alignement]

    const entree: CorpsUniver["paragraphs"][number] = { startIndex: flux.length }
    if (Object.keys(paragraphStyle).length > 0) entree.paragraphStyle = paragraphStyle
    if (p.liste && p.liste !== "aucune") {
      entree.bullet = { nestingLevel: 0, listType: CODE_PAR_LISTE[p.liste], listId: `l-${paragraphs.length}` }
    }
    paragraphs.push(entree)
    flux += "\r"
  }

  const sectionBreaks = [{ startIndex: flux.length }]
  flux += "\n"
  return { dataStream: flux, textRuns, tables: [], paragraphs, sectionBreaks }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIRE LE MODÈLE DU MOTEUR
   ═══════════════════════════════════════════════════════════════════════════ */

/** Le corps d'un instantané, décrit sans importer Univer. */
export type CorpsInstantane = {
  dataStream?: string
  textRuns?: { st: number; ed: number; ts?: Record<string, unknown> }[]
  paragraphs?: {
    startIndex: number
    paragraphStyle?: { namedStyleType?: number; horizontalAlign?: number }
    bullet?: { listType?: string }
  }[]
  tables?: unknown[]
  tableSource?: Record<string, { tableRows?: unknown[]; tableColumns?: unknown[] }>
}

/** Un paragraphe lu, avec les bornes qui permettent de résoudre les zones. */
export type ParagrapheLu = WordParagrapheObserve & { debut: number; fin: number }

/**
 * Découpe l'instantané en paragraphes lisibles.
 *
 * Les bornes sont celles du TEXTE, marqueur `\r` exclu : c'est ce qui permet à
 * une zone `"p2"` de désigner le texte du paragraphe et rien d'autre.
 */
export function lireParagraphes(corps: CorpsInstantane): ParagrapheLu[] {
  const flux = corps.dataStream ?? ""
  const marques = corps.paragraphs ?? []
  const lus: ParagrapheLu[] = []
  let debut = 0

  for (const m of marques) {
    const fin = m.startIndex
    if (fin < debut) continue
    const code = m.paragraphStyle?.namedStyleType
    lus.push({
      debut,
      fin,
      texte: flux.slice(debut, fin),
      style: (code !== undefined && STYLE_PAR_CODE[code]) || STYLE_NORMAL,
      alignement: ALIGNEMENT_PAR_CODE[m.paragraphStyle?.horizontalAlign ?? 0] ?? "gauche",
      liste: (m.bullet?.listType && LISTE_PAR_CODE[m.bullet.listType]) || "aucune",
    })
    debut = fin + 1
  }
  return lus
}

/** Attributs de caractère effectifs sur une plage, tels que le modèle les porte. */
export function lireFormat(corps: CorpsInstantane, plage: WordPlage): WordRunObserve {
  const runs = (corps.textRuns ?? []).filter((r) => r.st < plage.fin && r.ed > plage.debut)
  if (runs.length === 0) return {}

  /**
   * Un attribut n'est retenu que s'il couvre TOUTE la plage.
   *
   * Sinon « le titre est en gras » serait vrai dès qu'une seule lettre l'est —
   * et l'apprenant qui n'a mis en gras que la moitié du titre verrait son étape
   * validée. C'est le genre d'indulgence qui vide une évaluation de son sens.
   */
  const couvreTout = (predicat: (ts: Record<string, unknown>) => boolean): boolean => {
    let couvert = plage.debut
    for (const r of runs.slice().sort((a, b) => a.st - b.st)) {
      if (!predicat(r.ts ?? {})) continue
      if (r.st > couvert) return false
      couvert = Math.max(couvert, r.ed)
    }
    return couvert >= plage.fin
  }

  const premier = runs[0].ts ?? {}
  const f: WordRunObserve = {}
  if (couvreTout((ts) => ts.bl === 1)) f.gras = true
  if (couvreTout((ts) => ts.it === 1)) f.italique = true
  if (couvreTout((ts) => (ts.ul as { s?: number } | undefined)?.s === 1)) f.souligne = true
  if (couvreTout((ts) => (ts.st as { s?: number } | undefined)?.s === 1)) f.barre = true
  if (typeof premier.fs === "number" && couvreTout((ts) => ts.fs === premier.fs)) {
    f.taille = premier.fs as number
  }
  if (typeof premier.ff === "string" && couvreTout((ts) => ts.ff === premier.ff)) {
    f.police = premier.ff as string
  }
  const rgb = (premier.cl as { rgb?: string } | undefined)?.rgb
  if (rgb && couvreTout((ts) => (ts.cl as { rgb?: string } | undefined)?.rgb === rgb)) {
    f.couleur = rgb
  }
  const bg = (premier.bg as { rgb?: string } | undefined)?.rgb
  if (bg && couvreTout((ts) => (ts.bg as { rgb?: string } | undefined)?.rgb === bg)) {
    f.surlignage = bg
  }
  return f
}

/** Dimensions des tableaux présents, dans l'ordre du document. */
export function lireTableaux(corps: CorpsInstantane): { lignes: number; colonnes: number }[] {
  const source = corps.tableSource ?? {}
  return Object.values(source).map((t) => ({
    lignes: t.tableRows?.length ?? 0,
    colonnes: t.tableColumns?.length ?? 0,
  }))
}

/* ═══════════════════════════════════════════════════════════════════════════
   LES ZONES — désigner un endroit sans écrire un numéro de caractère
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Résout une zone de scénario en intervalle de caractères.
 *
 * POURQUOI DES ZONES NOMMÉES plutôt que des offsets. Un scénario qui écrirait
 * `{ debut: 417, fin: 431 }` serait illisible à la relecture, et surtout FAUX
 * dès qu'un auteur ajoute une phrase plus haut : chaque correction de contenu
 * décalerait des dizaines d'étapes en silence. C'est la même leçon que les
 * identifiants d'étapes côté Excel — un repère stable vaut mieux qu'une
 * position.
 *
 * Grammaire acceptée :
 *   `doc`            le document entier
 *   `p2`             le troisième paragraphe (base 0)
 *   `p2:mot3`        le troisième mot de ce paragraphe (base 1, comme on compte)
 *   `p2:4-11`        les caractères 4 à 11 DANS ce paragraphe
 *   `texte:Rapport`  la première occurrence, insensible à la casse et aux accents
 *
 * Rend `null` quand la zone ne désigne rien — le juge doit alors REFUSER
 * bruyamment plutôt que de deviner : une zone qui ne résout pas est une erreur
 * d'auteur, pas une faute d'apprenant.
 */
export function resoudreZone(zone: string, paragraphes: ParagrapheLu[]): WordPlage | null {
  const z = (zone ?? "").trim()
  if (!z || z === "doc") {
    if (paragraphes.length === 0) return null
    return { debut: paragraphes[0].debut, fin: paragraphes[paragraphes.length - 1].fin }
  }

  if (z.startsWith("texte:")) {
    const cherche = sansAccent(z.slice(6))
    if (!cherche) return null
    for (const p of paragraphes) {
      const i = sansAccent(p.texte).indexOf(cherche)
      if (i >= 0) return { debut: p.debut + i, fin: p.debut + i + cherche.length }
    }
    return null
  }

  const m = /^p(\d+)(?::(.+))?$/.exec(z)
  if (!m) return null
  const p = paragraphes[Number(m[1])]
  if (!p) return null
  const detail = m[2]
  if (!detail) return { debut: p.debut, fin: p.fin }

  const mot = /^mot(\d+)$/.exec(detail)
  if (mot) {
    const rang = Number(mot[1])
    if (rang < 1) return null
    // On repère les mots par leur position réelle dans le paragraphe : découper
    // puis recomposer perdrait les espaces multiples et décalerait la plage.
    const re = /[^\s]+/g
    let trouve: RegExpExecArray | null
    let n = 0
    while ((trouve = re.exec(p.texte)) !== null) {
      n++
      if (n === rang) {
        return { debut: p.debut + trouve.index, fin: p.debut + trouve.index + trouve[0].length }
      }
    }
    return null
  }

  const bornes = /^(\d+)-(\d+)$/.exec(detail)
  if (bornes) {
    const a = Number(bornes[1])
    const b = Number(bornes[2])
    if (a > b || b > p.texte.length) return null
    return { debut: p.debut + a, fin: p.debut + b }
  }

  return null
}

/** Le texte réellement couvert par une plage. */
export function texteDePlage(corps: CorpsInstantane, plage: WordPlage): string {
  return (corps.dataStream ?? "").slice(plage.debut, plage.fin)
}

/**
 * Formule une zone en français, pour la ligne « Attendu : … » et pour les
 * messages d'erreur. Un apprenant ne doit jamais lire `p2:mot3`.
 */
export function zoneEnFrancais(zone: string): string {
  const z = (zone ?? "").trim()
  if (!z || z === "doc") return "le document"
  if (z.startsWith("texte:")) return `« ${z.slice(6)} »`
  const m = /^p(\d+)(?::(.+))?$/.exec(z)
  if (!m) return z
  const rang = Number(m[1]) + 1
  const ordinal = rang === 1 ? "1er" : `${rang}e`
  if (!m[2]) return `le ${ordinal} paragraphe`
  const mot = /^mot(\d+)$/.exec(m[2])
  if (mot) {
    const r = Number(mot[1])
    return `le ${r === 1 ? "1er" : `${r}e`} mot du ${ordinal} paragraphe`
  }
  return `une partie du ${ordinal} paragraphe`
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPARER
   ═══════════════════════════════════════════════════════════════════════════ */

/** Retire les accents et la casse — pour les comparaisons tolérantes. */
function sansAccent(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

/**
 * Une réponse tapée correspond-elle à l'une des formes acceptées ?
 *
 * Même principe que `matchesTypedAnswer` côté Excel, avec la couche
 * typographique en plus : hors mode strict, une saisie naïve et une saisie
 * francisée sont la MÊME réponse. Sans cela, l'apprenant qui tape `"oui"` et
 * voit apparaître `« oui »` — ce que le simulateur a fait lui-même — se verrait
 * refuser sa propre réponse.
 */
export function correspond(saisi: string, acceptes: string[], strict?: boolean): boolean {
  if (strict) {
    const s = (saisi ?? "").trim()
    return acceptes.some((a) => a.trim() === s)
  }
  const s = sansAccent(normaliserTypographie(saisi ?? ""))
  return acceptes.some((a) => sansAccent(normaliserTypographie(a)) === s)
}

/**
 * Le texte présent est-il le DÉBUT d'une réponse acceptée ?
 *
 * 🔴 CE QUI ARRIVE SANS CE PRÉDICAT, MESURÉ DANS UN VRAI NAVIGATEUR : sur
 * l'évaluation notée du module 1, il suffit d'ARRIVER sur l'étape pour perdre
 * ses 2 points. Le paragraphe à compléter porte déjà « Les ateliers seront
 * fermés du », la relecture d'état automatique de `WordPlayer` le juge 420 ms
 * après l'arrivée, et le juge répond `contredit` parce que le texte est non
 * vide et différent de l'attendu. La faute est comptée, définitivement, avant
 * que l'apprenant ait touché une seule touche.
 *
 * La même chose se produit PENDANT la frappe : chaque caractère émet un état,
 * et tout état intermédiaire non vide était une réponse fausse.
 *
 * Le partage d'origine — vide = pas encore, non vide = faux — confondait « je
 * n'ai pas fini » avec « je me suis trompé ». La bonne frontière est le DÉBUT
 * de la réponse : tant que ce qui est écrit peut encore devenir la réponse
 * attendue, l'apprenant construit ; dès qu'il en diverge, il se trompe et cela
 * coûte. La chaîne vide est un préfixe de tout : le cas « paragraphe encore
 * vide » reste couvert, sans exception à écrire.
 *
 * ⚠️ Ne concerne QUE le classement faute/tâtonnement. Une étape ne se valide
 * jamais sur un préfixe : c'est `correspond` qui décide de la réussite, et lui
 * exige l'égalité.
 */
export function debutDUneReponse(saisi: string, acceptes: string[], strict?: boolean): boolean {
  if (strict) {
    const s = (saisi ?? "").trim()
    return acceptes.some((a) => a.trim().startsWith(s))
  }
  const s = sansAccent(normaliserTypographie(saisi ?? ""))
  return acceptes.some((a) => sansAccent(normaliserTypographie(a)).startsWith(s))
}

/** Ce qui manque à un format observé pour satisfaire un format attendu. */
export function ecartsDeFormat(
  attendu: WordRunObserve,
  observe: WordRunObserve,
): string[] {
  const manques: string[] = []
  const bool = (cle: keyof WordRunObserve, nom: string) => {
    if (attendu[cle] === undefined) return
    if (attendu[cle] === true && observe[cle] !== true) manques.push(nom)
    // Une exigence explicitement fausse — « ce passage ne doit PAS être en
    // gras » — est un besoin réel des exercices de correction de mise en forme.
    if (attendu[cle] === false && observe[cle] === true) manques.push(`pas ${nom}`)
  }
  bool("gras", "le gras")
  bool("italique", "l'italique")
  bool("souligne", "le soulignement")
  bool("barre", "le barré")
  if (attendu.taille !== undefined && observe.taille !== attendu.taille) {
    manques.push(`la taille ${attendu.taille}`)
  }
  if (
    attendu.police !== undefined &&
    (observe.police ?? "").toLowerCase() !== attendu.police.toLowerCase()
  ) {
    manques.push(`la police ${attendu.police}`)
  }
  if (attendu.couleur !== undefined && !memeCouleur(observe.couleur, attendu.couleur)) {
    manques.push("la couleur du texte")
  }
  if (attendu.surlignage !== undefined) {
    /*
     * D15 — une chaîne VIDE exige l'ABSENCE de surlignage.
     *
     * Même besoin que `gras: false` : un exercice de relecture demande de poser
     * une annotation, puis de la retirer une fois le passage traité. Sans cette
     * convention, l'absence n'était pas exprimable et l'étape « retirez le
     * surlignage » ne pouvait pas être écrite.
     */
    if (attendu.surlignage === "") {
      if (observe.surlignage) manques.push("le retrait du surlignage")
    } else if (!memeCouleur(observe.surlignage, attendu.surlignage)) {
      manques.push("le surlignage")
    }
  }
  return manques
}

/* ═══════════════════════════════════════════════════════════════════════════
   « PAS ENCORE FAIT » CONTRE « FAIT, MAIS FAUX » — la source unique
   ═══════════════════════════════════════════════════════════════════════════

   🔴 POURQUOI CETTE DISTINCTION DÉCIDE DE LA NOTE.

   `frappe.ts` (gelé) ne compte une faute que si le verdict ne commence PAS par
   `no_` — un motif `no_…` sur une étape d'état est traité comme un passage
   obligé, donc comme un tâtonnement gratuit. L'adaptateur Word rendait
   `pasEncore()` sur ses TREIZE variantes `W_EXPECT_*` : un apprenant qui pose
   activement le MAUVAIS style était traité comme s'il n'avait rien fait, et
   271 des 356 points du barème (76 %) étaient inperdables.

   La règle, portée par les fonctions ci-dessous et par elles seules :

     • l'attribut jugé est ABSENT ou à sa valeur NEUTRE (celle que le document
       porte avant tout geste) → « pas encore » : l'apprenant construit, il ne
       se trompe pas. C'est ce qui protège les états intermédiaires d'une
       construction en plusieurs temps — mettre en gras PUIS appliquer le style ;
     • l'attribut porte une AUTRE valeur → l'apprenant a agi, et il a agi faux.
       C'est une faute, et elle doit coûter.

   C'est exactement la sémantique qu'Excel obtient par `jugerFrappeSurEtat`
   (`frappe.ts`) : sur une cellule attendue, une valeur fausse compte, une
   cellule encore vide non. Excel peut la porter par le canal `typed` parce que
   sa surface émet la frappe avant l'état ; Word n'a pas ce canal — sa surface
   n'émet que `w:docState` — donc la même sémantique doit passer par l'état.

   ⚠️ LIMITE ASSUMÉE. On ne juge la contradiction que sur l'attribut ATTENDU.
   Un apprenant à qui l'on demande le gras et qui pose l'italique n'est pas
   pénalisé : sur l'attribut « gras », l'état reste neutre. C'est délibéré —
   punir un attribut qu'on n'a pas demandé exposerait à des fautes fantômes sur
   toute construction en plusieurs gestes. Corollaire : un attribut BOOLÉEN
   (gras, italique, souligné) n'est jamais contradictible, ce qui est juste —
   on ne se « trompe » pas de gras, on l'a mis ou non. */

/**
 * L'état d'un attribut avant tout geste de l'apprenant.
 *
 * Source unique, consommée par le juge (`adaptateur.ts`) ET par le contrôle
 * (`scripts/simulation/word/check-note-word.ts`). Deux copies finiraient par
 * diverger, et le contrôle validerait alors un barème que le juge n'applique
 * pas.
 */
export const NEUTRE_WORD = {
  style: "Normal",
  alignement: "gauche",
  liste: "aucune",
  habillage: "aligne",
  page: {
    orientation: "portrait",
    margeHaut: 2.5,
    margeBas: 2.5,
    margeGauche: 2.5,
    margeDroite: 2.5,
    numeroPage: false,
  } as Record<string, unknown>,
  impression: { copies: 1, plage: "tout", rectoVerso: false } as Record<string, unknown>,
} as const

/**
 * L'apprenant a-t-il POSÉ une valeur, et une valeur fausse ?
 *
 * `observe` absent ou égal au neutre ⇒ faux : rien n'a été fait sur cet
 * attribut. Toute autre valeur différente de l'attendu ⇒ vrai : c'est un geste,
 * et il est faux.
 *
 * 🔴 UN ATTRIBUT QUE L'ÉTAPE NE CONTRAINT PAS NE PEUT PAS ÊTRE CONTREDIT.
 *
 * Sans cette garde, l'apprenant était puni pour avoir obéi à l'étape
 * PRÉCÉDENTE. Mesuré dans un vrai navigateur sur l'évaluation notée du
 * module 1 : l'étape 3 fait appliquer le style « Titre » au premier
 * paragraphe ; l'étape 8 demande de le CENTRER et ne contraint que
 * l'alignement. Le style « Titre » encore en place — c'est-à-dire le travail
 * juste, exigé cinq étapes plus tôt — était alors comparé au neutre
 * « Normal », déclaré contradiction, et le point perdu quoi qu'il arrive.
 * L'atelier annonçait « le titre porte le style « Titre » » comme s'il
 * s'agissait d'une faute.
 *
 * « Contredire » suppose une attente : sans valeur attendue, il n'y a rien à
 * contredire. Ce que la contradiction doit attraper — appliquer « Titre 2 »
 * quand on demande « Titre 1 » — reste intact, `attendu` y étant défini.
 */
export function contreditValeur(neutre: unknown, attendu: unknown, observe: unknown): boolean {
  if (attendu === undefined) return false
  if (observe === undefined || observe === null || observe === "") return false
  if (memeValeur(observe, attendu)) return false
  return !memeValeur(observe, neutre)
}

function memeValeur(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase()
  }
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9
  return a === b
}

/**
 * Les attributs de format que l'apprenant a posés À UNE AUTRE VALEUR que celle
 * attendue. Jumelle de `ecartsDeFormat`, qui liste ce qui MANQUE ; celle-ci
 * liste ce qui est FAUX. Les booléens en sont absents par construction (voir la
 * limite assumée ci-dessus) : un `gras` non posé est une absence, pas une
 * contradiction.
 */
export function contradictionsDeFormat(
  attendu: WordRunObserve,
  observe: WordRunObserve,
): string[] {
  const faux: string[] = []
  if (
    attendu.taille !== undefined &&
    observe.taille !== undefined &&
    observe.taille !== attendu.taille
  ) {
    faux.push(`la taille ${observe.taille} au lieu de ${attendu.taille}`)
  }
  if (
    attendu.police !== undefined &&
    observe.police !== undefined &&
    observe.police.toLowerCase() !== attendu.police.toLowerCase()
  ) {
    faux.push(`la police ${observe.police}`)
  }
  if (
    attendu.couleur !== undefined &&
    observe.couleur !== undefined &&
    observe.couleur !== "" &&
    !memeCouleur(observe.couleur, attendu.couleur)
  ) {
    faux.push("une autre couleur de texte")
  }
  // Un surlignage attendu VIDE est une demande de retrait : la couleur encore
  // présente est une absence de geste, pas une contradiction.
  if (
    attendu.surlignage !== undefined &&
    attendu.surlignage !== "" &&
    observe.surlignage !== undefined &&
    observe.surlignage !== "" &&
    !memeCouleur(observe.surlignage, attendu.surlignage)
  ) {
    faux.push("une autre couleur de surlignage")
  }
  return faux
}

/** `#FFF`, `#ffffff` et `rgb(255,255,255)` désignent la même couleur. */
function memeCouleur(a: string | undefined, b: string | undefined): boolean {
  return canoniserCouleur(a) === canoniserCouleur(b)
}

function canoniserCouleur(c: string | undefined): string {
  if (!c) return ""
  const s = c.trim().toLowerCase()
  const court = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s)
  if (court) return `#${court[1]}${court[1]}${court[2]}${court[2]}${court[3]}${court[3]}`
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s)
  if (rgb) {
    const h = (n: string) => Number(n).toString(16).padStart(2, "0")
    return `#${h(rgb[1])}${h(rgb[2])}${h(rgb[3])}`
  }
  return s
}
