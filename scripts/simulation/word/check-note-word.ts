/**
 * Contrôle de la NOTE des évaluations Word — sans navigateur ni base.
 *
 * POURQUOI IL EXISTE. Un balayage au navigateur prouve qu'un chapitre se JOUE
 * jusqu'au bout ; il ne dit rien de la NOTE. Or c'est la note qui compte pour un
 * apprenant, et une note fausse est silencieuse : la formation continue de se
 * jouer normalement. Côté Excel, un parcours parfait a plafonné à 46 % pendant
 * des semaines sans que rien ne le signale.
 *
 * Il vérifie trois propriétés, dans cet ordre d'importance :
 *
 *  1. UN PARCOURS SANS FAUTE VAUT 100 %. Pour chaque étape, on fabrique
 *     l'observation qu'un apprenant produit en faisant exactement ce que la
 *     consigne demande, on la fait juger par `jugerEtape` — le MÊME juge que
 *     l'atelier et que la route de correction serveur — et on recalcule la note
 *     avec la règle de `run.ts` (points des seules étapes réussies au premier
 *     essai, écrans de lecture et étapes à zéro point exclus).
 *
 *  2. UNE FAUTE COÛTE VRAIMENT DES POINTS. Contre-épreuve obligatoire : un
 *     contrôle qui ne vérifierait que le point 1 serait vert même si le juge
 *     acceptait tout. On injecte donc une réponse fausse sur chaque étape et on
 *     regarde ce que le moteur en fait.
 *
 *  3. LA PART RÉELLEMENT DISCRIMINANTE EST ANNONCÉE. Le point 2 révèle une
 *     propriété du socle qu'il vaut mieux connaître que découvrir : `frappe.ts`
 *     classe en « passage obligé » — donc en tâtonnement, jamais en faute —
 *     tout verdict `no_…` rendu sur une étape jugée sur l'état. Or l'adaptateur
 *     Word rend `no_…` sur TOUTES ses variantes `W_EXPECT_*`. Conséquence : ces
 *     étapes ne peuvent pas coûter de point, quel que soit le nombre d'essais.
 *     Ce contrôle ne le corrige pas — `frappe.ts` est gelé — il le MESURE et
 *     l'affiche, pour que le barème d'une évaluation soit écrit en connaissance
 *     de cause.
 *
 * CE QU'IL NE PROUVE PAS : que l'attendu d'une étape est atteignable à l'écran.
 * L'observation canonique est construite depuis l'attente elle-même, donc la
 * comparaison est circulaire sur ce point. C'est le rôle du joueur du banc, qui
 * rejoue les chapitres dans un vrai navigateur.
 *
 * USAGE
 *   npx tsx scripts/simulation/word/check-note-word.ts
 */

import * as fs from "fs"
import * as path from "path"

import { adaptateurWord } from "../../../lib/simulation/word/adaptateur"
import { jugerEtape } from "../../../lib/simulation/frappe"
import { resoudreZone, type ParagrapheLu } from "../../../lib/simulation/word/document"
import type { SimulationStep } from "../../../lib/simulation/types"
import type { WordObservation, WordParagrapheObserve } from "../../../lib/simulation/word/observations"

const SCENARIOS = path.join(__dirname, "..", "scenarios", "word")

type Paragraphe = { texte: string; style?: string; alignement?: string; liste?: string }
type Scenario = {
  title: string
  mode?: string
  document?: { paragraphes: Paragraphe[] }
  steps: SimulationStep[]
}

/* ═══════════════════════════════════════════════════════════════════════════
   RECONSTITUER LE DOCUMENT, ÉTAPE PAR ÉTAPE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Même reconstitution que `documentAvant` dans `WordPlayer` : le texte tapé à
 * l'étape 3 n'existe dans le `setup` d'aucune autre, il faut donc le rejouer.
 * Sans cela, une étape qui désigne « le passage “3 au 24 août” » — écrit deux
 * étapes plus tôt — ne résoudrait aucune zone et le contrôle crierait au loup.
 */
function documentAvant(sc: Scenario, jusqua: number): WordParagrapheObserve[] {
  const p: WordParagrapheObserve[] = (sc.document?.paragraphes ?? []).map((x) => ({
    texte: x.texte,
    style: (x.style as string) ?? "Normal",
    alignement: (x.alignement as WordParagrapheObserve["alignement"]) ?? "gauche",
    liste: (x.liste as WordParagrapheObserve["liste"]) ?? "aucune",
  }))
  const poser = (i: number, texte: string) => {
    while (p.length <= i) p.push({ texte: "", style: "Normal", alignement: "gauche", liste: "aucune" })
    p[i] = { ...p[i], texte }
  }
  for (let i = 0; i < jusqua && i < sc.steps.length; i++) {
    const a = sc.steps[i].action as unknown as Record<string, unknown>
    if (a.type === "W_TYPE_TEXT" && Array.isArray(a.accept) && a.accept[0]) {
      poser(p.length, String(a.accept[0]))
    }
    if (a.type === "W_EXPECT_DOC" && a.paragraphes) {
      for (const [cle, formes] of Object.entries(a.paragraphes as Record<string, string[]>)) {
        const n = Number(cle.replace(/^p/, ""))
        if (Number.isFinite(n) && formes[0] !== undefined) poser(n, formes[0])
      }
    }
  }
  return p
}

/** Les bornes de chaque paragraphe dans le flux — le `\r` de fin compte pour un. */
function bornes(paragraphes: WordParagrapheObserve[]): ParagrapheLu[] {
  const lus: ParagrapheLu[] = []
  let debut = 0
  for (const p of paragraphes) {
    const fin = debut + p.texte.length
    lus.push({ ...p, debut, fin })
    debut = fin + 1
  }
  return lus
}

/** L'index du paragraphe qui porte une zone, dans un document donné. */
function indexDeZone(zone: string, paragraphes: WordParagrapheObserve[]): number {
  const m = /^p(\d+)/.exec(zone.trim())
  if (m) return Number(m[1])
  if (zone.startsWith("texte:")) {
    const cherche = zone.slice(6).toLowerCase()
    const i = paragraphes.findIndex((p) => p.texte.toLowerCase().includes(cherche))
    return i
  }
  return 0
}

/* ═══════════════════════════════════════════════════════════════════════════
   L'OBSERVATION CANONIQUE — ce qu'un apprenant produit en faisant juste
   ═══════════════════════════════════════════════════════════════════════════ */

function canonique(step: SimulationStep, paragraphes: WordParagrapheObserve[]): WordObservation | null {
  const a = step.action as unknown as Record<string, unknown>
  switch (a.type) {
    case "READ":
      return { kind: "w:control", controle: "__suivant__" }

    case "W_TYPE_TEXT": {
      const texte = (a.accept as string[])?.[0]
      if (texte === undefined) return null
      const zone = a.zone as string | undefined
      // La touche Entrée crée un paragraphe : le texte atterrit dans le SUIVANT.
      const depart = zone ? indexDeZone(zone, paragraphes) : paragraphes.length - 1
      return { kind: "w:textChange", saisi: texte, paragraphe: texte, indexParagraphe: depart + 1 }
    }

    case "W_SELECT_TEXT": {
      const zone = a.zone as string
      const i = indexDeZone(zone, paragraphes)
      // Les bornes exactes sont recalculées par le juge depuis `paragraphes` :
      // on lui donne la structure et une plage cohérente avec elle.
      let debut = 0
      for (let k = 0; k < i && k < paragraphes.length; k++) debut += paragraphes[k].texte.length + 1
      const p = paragraphes[i]
      if (!p) return null
      let d = debut
      let f = debut + p.texte.length
      const mot = /^p\d+:mot(\d+)$/.exec(zone)
      if (mot) {
        const re = /[^\s]+/g
        let t: RegExpExecArray | null
        let n = 0
        while ((t = re.exec(p.texte)) !== null) {
          n++
          if (n === Number(mot[1])) {
            d = debut + t.index
            f = d + t[0].length
            break
          }
        }
      } else if (zone.startsWith("texte:")) {
        const cherche = zone.slice(6)
        const j = p.texte.toLowerCase().indexOf(cherche.toLowerCase())
        if (j >= 0) {
          d = debut + j
          f = d + cherche.length
        }
      }
      return { kind: "w:selection", plage: { debut: d, fin: f }, texte: p.texte.slice(d - debut, f - debut), paragraphes }
    }

    case "W_CLICK_CONTROL":
      return { kind: "w:control", controle: a.controle as string }

    case "W_KEY":
      return { kind: "w:key", touches: a.touches as string[] }

    case "W_EXPECT_DOC": {
      const copie = paragraphes.map((p) => ({ ...p }))
      for (const [cle, formes] of Object.entries(a.paragraphes as Record<string, string[]>)) {
        const n = Number(cle.replace(/^p/, ""))
        while (copie.length <= n) copie.push({ texte: "", style: "Normal", alignement: "gauche", liste: "aucune" })
        copie[n] = { ...copie[n], texte: formes[0] }
      }
      return { kind: "w:docState", paragraphes: copie }
    }

    case "W_EXPECT_FORMAT":
      return {
        kind: "w:docState",
        paragraphes,
        formats: { [a.zone as string]: a.format as Record<string, unknown> },
      }

    case "W_EXPECT_STYLE": {
      const i = indexDeZone(a.zone as string, paragraphes)
      const copie = paragraphes.map((p) => ({ ...p }))
      const s = a.style as Record<string, string>
      if (copie[i]) {
        copie[i] = {
          ...copie[i],
          ...(s.style ? { style: s.style } : {}),
          ...(s.alignement ? { alignement: s.alignement as WordParagrapheObserve["alignement"] } : {}),
          ...(s.liste ? { liste: s.liste as WordParagrapheObserve["liste"] } : {}),
        }
      }
      return { kind: "w:docState", paragraphes: copie }
    }

    case "W_EXPECT_TABLE":
      return {
        kind: "w:docState",
        paragraphes,
        tableaux: [{ lignes: a.lignes as number, colonnes: a.colonnes as number }],
      }

    case "W_EXPECT_PAGE":
      return { kind: "w:docState", paragraphes, page: a.page as Record<string, unknown> }

    case "W_EXPECT_LIEN":
      return {
        kind: "w:docState",
        paragraphes,
        liens: a.absent ? [] : [{ id: "l1", url: a.url as string, texte: "" }],
      }

    case "W_EXPECT_IMAGE":
      return {
        kind: "w:docState",
        paragraphes,
        images: a.absente
          ? []
          : [{ id: a.image as string, habillage: (a.habillage as string) ?? "aligne" }],
      }

    case "W_EXPECT_ENTETE":
      return {
        kind: "w:docState",
        paragraphes,
        horsFlux: { [a.emplacement as string]: (a.accept as string[])[0] },
      }

    case "W_EXPECT_PRINT":
      return {
        kind: "w:docState",
        paragraphes,
        impression: a.impression as Record<string, unknown>,
      }

    case "W_EXPECT_TABS": {
      const i = indexDeZone(a.zone as string, paragraphes)
      if (i === null) return null
      return { kind: "w:docState", paragraphes, taquets: { [String(i)]: a.taquets } }
    }

    default:
      return null
  }
}

/** Un texte qu'aucun scénario ne peut raisonnablement accepter. */
const SENTINELLE = "zzz reponse volontairement fausse zzz"

/** Une observation délibérément FAUSSE, du même canal que la bonne. */
function fausse(step: SimulationStep, paragraphes: WordParagrapheObserve[]): WordObservation | null {
  const a = step.action as unknown as Record<string, unknown>
  switch (a.type) {
    case "W_TYPE_TEXT": {
      /*
       * ⚠️ LA FRAPPE FAUSSE DOIT ARRIVER AU BON ENDROIT.
       *
       * Première version : `indexParagraphe: 0`. Le juge la refusait alors pour
       * cause de mauvais paragraphe (`wrong_place`) et non pour son contenu —
       * si bien qu'un `accept` élargi à une réponse absurde restait vert. Le
       * piège posé pour éprouver ce contrôle est passé au travers : c'est
       * exactement le faux témoin qu'on cherche à éviter.
       */
      const zone = a.zone as string | undefined
      const depart = zone ? indexDeZone(zone, paragraphes) : paragraphes.length - 1
      return {
        kind: "w:textChange",
        saisi: SENTINELLE,
        paragraphe: SENTINELLE,
        indexParagraphe: depart + 1,
      }
    }
    case "W_CLICK_CONTROL":
      return { kind: "w:control", controle: "w-barre" }
    case "W_KEY":
      return { kind: "w:key", touches: ["Ctrl", "Z"] }
    case "W_SELECT_TEXT":
      return { kind: "w:selection", plage: { debut: 0, fin: 1 }, texte: "x", paragraphes }
    case "W_EXPECT_DOC":
    case "W_EXPECT_STYLE":
      return { kind: "w:docState", paragraphes }
    case "W_EXPECT_FORMAT": {
      /*
       * ⚠️ UNE EXIGENCE NÉGATIVE SE RATE EN LAISSANT L'ATTRIBUT EN PLACE.
       *
       * Première version : un format VIDE. Sur une étape « ce passage ne doit
       * plus être barré », le format vide EST la bonne réponse — le contrôle
       * signalait donc « une réponse fausse est acceptée » sur une étape
       * parfaitement saine. Le détecteur était faux, pas le contenu. La vraie
       * réponse fausse, c'est l'attribut encore présent.
       */
      const attendu = a.format as Record<string, unknown>
      const inverse: Record<string, unknown> = {}
      for (const [cle, valeur] of Object.entries(attendu)) {
        // « ne doit plus être barré » → la faute, c'est le barré encore là.
        if (valeur === false) inverse[cle] = true
        // « ne doit plus être surligné » (D15) → la faute, c'est la couleur
        // encore posée. Sans ce cas, l'observation fausse valait la bonne
        // réponse et le contrôle criait au loup sur une étape saine.
        if (valeur === "") inverse[cle] = "#f1c40f"
      }
      return { kind: "w:docState", paragraphes, formats: { [a.zone as string]: inverse } }
    }
    case "W_EXPECT_TABLE":
      return { kind: "w:docState", paragraphes, tableaux: [] }
    case "W_EXPECT_PAGE":
      return { kind: "w:docState", paragraphes, page: {} }
    case "W_EXPECT_LIEN":
      // Exiger l'absence ⇒ l'observation fausse doit porter le lien.
      return {
        kind: "w:docState",
        paragraphes,
        liens: a.absent ? [{ id: "l1", url: a.url as string, texte: "" }] : [],
      }
    case "W_EXPECT_IMAGE":
      // ⚠️ Quand l'étape exige l'ABSENCE de l'image, l'observation fausse doit
      // la porter — sinon elle vaudrait la bonne réponse.
      return {
        kind: "w:docState",
        paragraphes,
        images: a.absente
          ? [{ id: a.image as string, habillage: "aligne" }]
          : a.habillage
          ? [{ id: a.image as string, habillage: a.habillage === "carre" ? "hautbas" : "carre" }]
          : [],
      }
    case "W_EXPECT_ENTETE": {
      // ⚠️ Quand l'étape exige une zone VIDE, l'observation fausse doit porter
      // du texte — sinon elle vaudrait la bonne réponse et le contrôle
      // déclarerait « refusée » une étape qu'il vient en fait de valider.
      const veutVide = (a.accept as string[])[0] === ""
      return {
        kind: "w:docState",
        paragraphes,
        horsFlux: { [a.emplacement as string]: veutVide ? SENTINELLE : "" },
      }
    }
    case "W_EXPECT_PRINT": {
      const im = a.impression as Record<string, unknown>
      const faux: Record<string, unknown> = {}
      if (im.copies !== undefined) faux.copies = (im.copies as number) === 7 ? 3 : 7
      if (im.plage !== undefined) faux.plage = im.plage === "tout" ? "selection" : "tout"
      if (im.rectoVerso !== undefined) faux.rectoVerso = !(im.rectoVerso as boolean)
      return { kind: "w:docState", paragraphes, impression: faux }
    }
    case "W_EXPECT_TABS": {
      const i = indexDeZone(a.zone as string, paragraphes)
      if (i === null) return null
      // Un taquet de moins : jamais égal à l'attendu, quel qu'il soit.
      const attendus = a.taquets as { position: number; type: string }[]
      return {
        kind: "w:docState",
        paragraphes,
        taquets: { [String(i)]: attendus.slice(0, Math.max(0, attendus.length - 1)) },
      }
    }
    default:
      return null
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LA NOTE — la règle de `run.ts`, reproduite à l'identique
   ═══════════════════════════════════════════════════════════════════════════ */

function note(steps: SimulationStep[], premierEssai: Record<string, boolean>) {
  let total = 0
  let obtenus = 0
  for (const s of steps) {
    const pts = s.points ?? 1
    if (s.action.type === "READ" || pts <= 0) continue
    total += pts
    if (premierEssai[s.id]) obtenus += pts
  }
  return { total, obtenus, score: total > 0 ? obtenus / total : 0 }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LE CONTRÔLE
   ═══════════════════════════════════════════════════════════════════════════ */

if (!fs.existsSync(SCENARIOS)) {
  console.log("Aucun scénario Word : rien à contrôler.")
  process.exit(0)
}

const fichiers = fs
  .readdirSync(SCENARIOS)
  .filter((n) => n.endsWith(".json"))
  .sort()

const anomalies: string[] = []

/* ═══════════════════════════════════════════════════════════════════════════
   0. LES ZONES DÉSIGNÉES EXISTENT — le contrôle non circulaire
   ═══════════════════════════════════════════════════════════════════════════

   🔴 CE CONTRÔLE A ÉTÉ AJOUTÉ APRÈS AVOIR PIÉGÉ LE PRÉCÉDENT, ET LE PIÈGE EST
   PASSÉ AU VERT. En remplaçant la cible d'une étape par `texte:un passage qui
   nexiste pas`, tout restait vert : l'observation canonique d'un
   `W_EXPECT_FORMAT` est indexée PAR LA CHAÎNE de la zone, et le juge la relit
   par cette même chaîne. La zone n'était jamais confrontée au document — la
   vérification tournait en rond.

   Or c'est la faute d'auteur la plus probable : une coquille dans un `texte:…`
   produit une étape que personne ne peut franchir, et `juger` la refuse alors
   avec « Cette étape désigne un passage qui n'existe pas » — un message qui
   accuse l'apprenant d'une erreur de l'auteur.

   On résout donc chaque zone contre le document RECONSTRUIT à cette étape, avec
   la fonction du produit (`resoudreZone`), et sur TOUS les chapitres — une zone
   fausse dans une leçon bloque l'apprenant exactement de la même façon. */

for (const f of fichiers) {
  const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8")) as Scenario
  sc.steps.forEach((step, i) => {
    const a = step.action as unknown as Record<string, unknown>
    const zones: string[] = []
    if (typeof a.zone === "string") zones.push(a.zone)
    if (a.type === "W_EXPECT_DOC" && a.paragraphes) zones.push(...Object.keys(a.paragraphes))

    const paragraphes = documentAvant(sc, i)
    const lus = bornes(paragraphes)
    for (const z of zones) {
      // `W_TYPE_TEXT` et `W_EXPECT_DOC` désignent une cible à OBTENIR : le
      // paragraphe visé peut légitimement ne pas exister encore.
      const aVenir =
        (a.type === "W_TYPE_TEXT" || a.type === "W_EXPECT_DOC") && /^p\d+$/.test(z)
      if (aVenir) {
        const n = Number(z.slice(1))
        if (n > paragraphes.length) {
          anomalies.push(
            `${f} · ${step.id} : « ${z} » saute par-dessus des paragraphes (le document en a ${paragraphes.length})`,
          )
        }
        continue
      }
      if (!resoudreZone(z, lus)) {
        anomalies.push(
          `${f} · ${step.id} (${a.type}) : la zone « ${z} » ne désigne rien dans le document à cette étape — étape injouable`,
        )
      }
    }
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   0 bis. AUCUNE FORME ACCEPTÉE NE DOIT ÊTRE LE PRÉFIXE D'UNE AUTRE
   ═══════════════════════════════════════════════════════════════════════════

   🔴 CE CONTRÔLE VIENT D'UN DÉFAUT MESURÉ, PAS D'UNE PRÉCAUTION THÉORIQUE.

   Une étape de saisie est jugée à CHAQUE frappe. Si `accept` contient à la fois
   « Le délai est de trente minutes » et « Le délai est de trente minutes. », la
   première forme est atteinte un caractère avant la fin de la frappe : l'étape
   se valide, `goNext` part en différé — puis le point final produit une seconde
   observation, encore jugée contre la MÊME étape, qui se valide une seconde
   fois et programme un SECOND `goNext`. L'atelier avance alors de DEUX crans, et
   l'étape suivante n'est jamais affichée.

   Constaté à l'écran : la consigne montrée n'était plus celle de l'étape en
   cours. En évaluation, l'étape sautée n'est jamais jugée — donc jamais
   « réussie au premier essai » : l'apprenant PERD des points sur une question
   qu'on ne lui a pas posée.

   Le défaut appartient au noyau (`goNext` n'est pas idempotent, et `frappe.ts`
   comme `useAtelier` sont gelés). Le contenu, lui, peut le rendre impossible :
   il suffit qu'aucune forme acceptée ne soit le préfixe d'une autre. */

for (const f of fichiers) {
  const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8")) as Scenario
  for (const step of sc.steps) {
    const a = step.action as unknown as Record<string, unknown>
    const lots: string[][] = []
    if (a.type === "W_TYPE_TEXT" && Array.isArray(a.accept)) lots.push(a.accept as string[])
    if (a.type === "W_EXPECT_DOC" && a.paragraphes) {
      lots.push(...Object.values(a.paragraphes as Record<string, string[]>))
    }
    for (const formes of lots) {
      for (const x of formes) {
        const plusLongue = formes.find((y) => y !== x && y.startsWith(x))
        if (plusLongue) {
          anomalies.push(
            `${f} · ${step.id} : « ${x} » est le préfixe de « ${plusLongue} » — ` +
              `l'étape se validerait DEUX fois pendant la frappe et ferait sauter la suivante`,
          )
        }
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   0 ter. UNE EXIGENCE NÉGATIVE DOIT PORTER SUR UN ATTRIBUT PRÉSENT AU DÉPART
   ═══════════════════════════════════════════════════════════════════════════

   🔴 AJOUTÉ APRÈS QUE LE PIÈGE EST PASSÉ AU VERT. En déplaçant une étape
   « retirez le surlignage » sur le titre — qui n'en a jamais porté — tout
   restait vert : la contre-épreuve fabrique une observation fautive et
   constate que le juge la refuse, ce qui ne dit RIEN de l'état réel du
   document. L'étape était vraie dès l'arrivée, franchie sans que l'apprenant
   ait le temps de lire sa consigne.

   Le même défaut avait déjà été trouvé à la main sur quatre étapes du module
   « Puces et numéros ». Une propriété qu'une machine sait tenir vaut mieux
   qu'une relecture attentive.

   On vérifie donc que l'attribut à retirer est bien posé — soit par le
   document initial, soit par une étape antérieure. */

const NEGATIF = (v: unknown) => v === false || v === ""

for (const f of fichiers) {
  const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8")) as Scenario
  const paras = (sc.document?.paragraphes ?? []) as Array<Record<string, unknown>>
  sc.steps.forEach((step, i) => {
    const a = step.action as unknown as Record<string, unknown>
    const exigences: Array<[string, unknown]> = []
    if (a.type === "W_EXPECT_FORMAT") {
      exigences.push(...Object.entries((a.format ?? {}) as Record<string, unknown>))
    }
    if (a.type === "W_EXPECT_STYLE") {
      const st = (a.style ?? {}) as Record<string, unknown>
      if (st.liste === "aucune") exigences.push(["liste", ""])
    }
    for (const [cle, valeur] of exigences) {
      if (!NEGATIF(valeur)) continue
      const zone = String(a.zone ?? "")
      const m = /^p(\d+)/.exec(zone)
      if (!m) continue // zone `texte:` : on ne sait pas la rattacher à un paragraphe
      const n = Number(m[1])

      const dansLeDepart = (() => {
        const p = paras[n]
        if (!p) return false
        if (cle === "liste") return p.liste !== undefined && p.liste !== "aucune"
        const fmt = (p.format ?? {}) as Record<string, unknown>
        return fmt[cle] !== undefined && fmt[cle] !== false && fmt[cle] !== ""
      })()

      const poseAvant = sc.steps.slice(0, i).some((s) => {
        const b = s.action as unknown as Record<string, unknown>
        if (String(b.zone ?? "") !== zone) return false
        if (cle === "liste") {
          const st = (b.style ?? {}) as Record<string, unknown>
          return st.liste !== undefined && st.liste !== "aucune"
        }
        const fmt = (b.format ?? {}) as Record<string, unknown>
        return fmt[cle] !== undefined && fmt[cle] !== false && fmt[cle] !== ""
      })

      if (!dansLeDepart && !poseAvant) {
        anomalies.push(
          `${f} · ${step.id} : demande de RETIRER « ${cle} » sur ${zone}, qui ne l'a jamais porté — ` +
            `l'étape est vraie dès l'arrivée et défile sans être lue`,
        )
      }
    }
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   0 quater. UN RÉGLAGE DE PANNEAU NE DOIT PAS ÊTRE DÉJÀ CELUI PAR DÉFAUT
   ═══════════════════════════════════════════════════════════════════════════

   🔴 AJOUTÉ APRÈS AVOIR CORRIGÉ LE DÉFAUT QUATRE FOIS À LA MAIN, sur un seul
   lot. « Vérifiez que la plage est bien Tout le document », « ramenez les
   copies à 1 », « désactivez le recto verso » : ces trois consignes demandent
   la valeur que le panneau porte DÉJÀ à l'ouverture. L'étape est vraie à
   l'arrivée, se valide dans la même image que la précédente, et le noyau —
   dont `goNext` n'est pas idempotent — enjambe alors l'étape suivante.

   En évaluation, c'est une question jamais posée et pourtant comptée. Le
   symptôme observé au banc est « SAUTÉE », jamais « fausse » : rien dans le
   contenu ne le laisse deviner à la lecture.

   La règle : une étape qui règle un panneau doit demander une valeur DIFFÉRENTE
   de celle par défaut, sauf si une étape antérieure du même chapitre l'a
   changée entre-temps. */

/** Les valeurs qu'un panneau porte à l'ouverture, avant tout geste. */
const DEFAUTS_PANNEAU: Record<string, Record<string, unknown>> = {
  W_EXPECT_PRINT: { copies: 1, plage: "tout", rectoVerso: false },
  W_EXPECT_PAGE: {
    orientation: "portrait",
    margeHaut: 2.5,
    margeBas: 2.5,
    margeGauche: 2.5,
    margeDroite: 2.5,
    numeroPage: false,
  },
}

/** Le champ du scénario qui porte les réglages, par type d'action. */
const CHAMP_PANNEAU: Record<string, string> = {
  W_EXPECT_PRINT: "impression",
  W_EXPECT_PAGE: "page",
}

for (const f of fichiers) {
  const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8")) as Scenario
  sc.steps.forEach((step, i) => {
    const a = step.action as unknown as Record<string, unknown>
    const type = String(a.type)
    const defauts = DEFAUTS_PANNEAU[type]
    if (!defauts) return
    const demande = (a[CHAMP_PANNEAU[type]] ?? {}) as Record<string, unknown>

    for (const [cle, valeur] of Object.entries(demande)) {
      if (defauts[cle] === undefined || defauts[cle] !== valeur) continue

      // Une étape antérieure a-t-elle éloigné ce réglage de son défaut ?
      const changeAvant = sc.steps.slice(0, i).some((s) => {
        const b = s.action as unknown as Record<string, unknown>
        if (String(b.type) !== type) return false
        const d = (b[CHAMP_PANNEAU[type]] ?? {}) as Record<string, unknown>
        return d[cle] !== undefined && d[cle] !== valeur
      })

      if (!changeAvant) {
        anomalies.push(
          `${f} · ${step.id} : demande « ${cle} = ${JSON.stringify(valeur)} », qui est DÉJÀ la ` +
            `valeur par défaut du panneau — l'étape est vraie à l'arrivée et fait sauter la suivante`,
        )
      }
    }
  })
}

let evaluations = 0
let etapesNotees = 0
let pointsTotal = 0
let pointsPenalisants = 0

for (const f of fichiers) {
  const sc = JSON.parse(fs.readFileSync(path.join(SCENARIOS, f), "utf8")) as Scenario
  if (sc.mode !== "EVALUATION") continue
  evaluations++

  /* ── 1. Le parcours sans faute ─────────────────────────────────────────── */
  const premierEssai: Record<string, boolean> = {}
  const penalisantes: string[] = []

  sc.steps.forEach((step, i) => {
    /*
     * ⚠️ LES ÉCRANS DE LECTURE SONT HORS BARÈME, ET LEUR VERDICT NE VEUT RIEN DIRE.
     *
     * `WordPlayer.onSuivant` émet `{kind:"w:control", controle:"__suivant__"}`
     * avant d'avancer. Aucun juge ne connaît ce contrôle : l'adaptateur rend
     * `null` (l'action `READ` n'est pas préfixée `W_`), et `validateStep` refuse
     * l'observation avec `read_step_action`. `frappe.ts` neutralise le tout —
     * une étape `READ` ne peut pas être ratée — donc l'écran avance et rien
     * n'est compté. Le seul effet observable est un tâtonnement parasite.
     *
     * On ne fait donc pas semblant de juger ces écrans : on vérifie seulement
     * qu'ils restent bien à zéro point, sans quoi un écran de lecture pèserait
     * dans une note.
     */
    if (step.action.type === "READ") {
      if ((step.points ?? 1) > 0) {
        anomalies.push(`${f} · ${step.id} : un écran de lecture ne doit pas porter de points`)
      }
      return
    }
    const paragraphes = documentAvant(sc, i)
    const obs = canonique(step, paragraphes)
    if (!obs) {
      anomalies.push(`${f} · ${step.id} : aucune observation canonique pour « ${step.action.type} »`)
      return
    }
    const j = jugerEtape(step, obs as never, adaptateurWord)
    if (!j.ok) {
      anomalies.push(
        `${f} · ${step.id} (${step.action.type}) : la réponse ATTENDUE est refusée — ${j.reason ?? ""} ${j.message ?? ""}`,
      )
      return
    }
    premierEssai[step.id] = true

    /* ── 2. La contre-épreuve, étape par étape ───────────────────────────── */
    const mauvaise = fausse(step, paragraphes)
    if (!mauvaise) return
    const k = jugerEtape(step, mauvaise as never, adaptateurWord)
    if (k.ok) {
      anomalies.push(
        `${f} · ${step.id} (${step.action.type}) : une réponse FAUSSE est acceptée — l'étape ne mesure rien`,
      )
      return
    }
    if (k.compte === "faute") penalisantes.push(step.id)
  })

  const n = note(sc.steps, premierEssai)
  if (Math.abs(n.score - 1) > 1e-9) {
    anomalies.push(
      `${f} : un parcours SANS FAUTE ne vaut que ${(n.score * 100).toFixed(1)} % (${n.obtenus}/${n.total})`,
    )
  }

  const ptsPenalisants = sc.steps
    .filter((s) => penalisantes.includes(s.id))
    .reduce((t, s) => t + (s.points ?? 1), 0)

  etapesNotees += sc.steps.filter((s) => s.action.type !== "READ" && (s.points ?? 1) > 0).length
  pointsTotal += n.total
  pointsPenalisants += ptsPenalisants

  console.log(
    `  ${f} — ${n.total} point(s) · sans faute ${(n.score * 100).toFixed(0)} % · ` +
      `${ptsPenalisants}/${n.total} point(s) réellement perdables (${penalisantes.length} étape(s))`,
  )

  /* ── 3. Une note qui ne peut RIEN perdre n'est pas une note ───────────── */
  if (ptsPenalisants === 0) {
    anomalies.push(
      `${f} : AUCUN point ne peut être perdu — cette évaluation rendra 100 % à tout le monde`,
    )
  }
}

console.log(
  `\n  ${evaluations} évaluation(s) Word · ${etapesNotees} étape(s) notée(s) · ${pointsTotal} point(s)`,
)
if (pointsTotal > 0) {
  const part = Math.round((pointsPenalisants / pointsTotal) * 100)
  console.log(
    `  ${pointsPenalisants}/${pointsTotal} point(s) (${part} %) sont réellement perdables sur une réponse fausse.`,
  )
  console.log(
    "  Les autres portent sur des étapes jugées sur l'ÉTAT du document : `frappe.ts` classe leur\n" +
      "  verdict `no_…` en passage obligé, donc en tâtonnement — l'apprenant peut réessayer sans coût.\n" +
      "  C'est une propriété du socle (fichier gelé), pas du contenu : à connaître avant d'écrire un barème.",
  )
}

if (anomalies.length === 0) {
  console.log("\n✓ Parcours sans faute à 100 %, réponses fausses toutes refusées.")
  process.exit(0)
}
console.log()
for (const a of anomalies) console.log(`  ✗ ${a}`)
console.log(`✗ ${anomalies.length} anomalie(s).`)
process.exit(1)
