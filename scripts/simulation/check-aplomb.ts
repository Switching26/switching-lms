/**
 * CONTRÔLE DE LA REMISE D'APLOMB.
 *
 * La remise d'aplomb réécrit des cellules dans le classeur de l'apprenant.
 * C'est donc le genre de mécanisme dont un défaut ne se voit pas : il n'échoue
 * pas, il efface du travail juste. Ce contrôle éprouve les trois propriétés
 * dont tout dépend, sur les 246 scénarios :
 *
 *   A. SUR UN PARCOURS PROPRE, ZÉRO RÉPARATION.
 *      Un apprenant qui fait exactement ce qu'on lui demande ne doit JAMAIS
 *      voir une cellule réécrite. C'est la propriété la plus importante :
 *      une seule réparation injustifiée et le mécanisme devient nuisible.
 *      Le piège que ce contrôle attrape : les durées et les dates sont
 *      stockées en numéro de série (`"7:30"` devient 0,3125), donc comparer
 *      le littéral déclaré à la valeur lue signalerait une fausse divergence.
 *
 *   B. UNE ÉCRITURE ÉQUIVALENTE N'EST JAMAIS REMPLACÉE.
 *      Quand une étape accepte plusieurs formes, l'apprenant qui a écrit la
 *      seconde doit la garder. On rejoue donc tout le corpus en supposant
 *      qu'il a systématiquement choisi la DERNIÈRE forme acceptée.
 *
 *   C. UN VRAI DÉGÂT EST BIEN VU.
 *      Cellule vidée, écrasée par une valeur brute, en erreur, ou affublée
 *      d'un format de nombre : chacun doit produire exactement une divergence.
 *      Un détecteur qu'on n'a pas piégé ne prouve rien.
 *
 *   npx tsx scripts/simulation/check-aplomb.ts
 */
import * as fs from "fs"
import * as path from "path"
import {
  MOTIF_DECIMAL_AUTO,
  cellulesLues,
  divergences,
  etatAplomb,
  famillesLegitimes,
  refsConnues,
  type EtatAplomb,
  type LectureCellule,
} from "../../lib/simulation/aplomb"
import { lireDateOuHeureFr } from "../../lib/simulation/date-fr"
import { lireNombreFr } from "../../lib/simulation/nombre-fr"
import type { SimulationScenario } from "../../lib/simulation/types"

const DIR = path.join(__dirname, "scenarios")

/** Motif de format représentatif d'une famille, pour fabriquer une lecture. */
const MOTIF: Record<string, string> = {
  aucun: "",
  nombre: "0.00",
  pourcentage: "0.00%",
  monetaire: '#,##0.00" €"',
  date: "dd/mm/yyyy",
}

/**
 * Ce que le moteur tiendrait pour un littéral. Doit suivre la même logique que
 * `valeurStockee` dans `aplomb.ts` — c'est justement l'accord entre les deux
 * que la propriété A éprouve.
 */
function stockee(litteral: string | number): unknown {
  if (typeof litteral === "number") return litteral
  const t = String(litteral).trim()
  if (t === "") return ""
  const fr = lireDateOuHeureFr(t)
  if (fr) return fr.valeur
  const n = lireNombreFr(t)
  if (n !== null) return n
  return t
}

/**
 * Lecture d'une feuille où l'apprenant a tout fait juste.
 * `dernierChoix` simule celui qui prend systématiquement la dernière écriture
 * acceptée au lieu de la première.
 */
function lectureParfaite(etat: EtatAplomb, dernierChoix: boolean): Record<string, LectureCellule> {
  const out: Record<string, LectureCellule> = {}
  for (const ref of refsConnues(etat)) {
    const a = etat[ref]
    const nf = MOTIF[a.famille] ?? ""
    if (a.formules?.length) {
      const f = dernierChoix ? a.formules[a.formules.length - 1] : a.formules[0]
      // Une formule calcule : la valeur importe peu ici, elle ne doit
      // simplement pas être une valeur d'erreur.
      out[ref] = { formule: f, valeur: 1, numberFormat: nf }
    } else if (a.valeur !== undefined) {
      const v = stockee(a.valeur)
      // Ce que le MOTEUR tient réellement, et non ce que le scénario déclare :
      // sur une décimale sans format d'auteur, la grille pose d'elle-même son
      // motif de francisation. Le prendre pour un format de l'apprenant faisait
      // « réparer » toutes les décimales du corpus.
      const auto = a.famille === "aucun" && typeof v === "number" && Number.isFinite(v) && !Number.isInteger(v)
      // Même logique pour une date ou une heure déclarée en chaîne française :
      // la grille la stocke en numéro de série AVEC son format (dd/mm/yyyy,
      // hh:mm). Si l'état d'aplomb ne porte pas cette famille, la remise
      // retire le format et les dates réapparaissent en 46025 — c'est le
      // défaut attrapé le 31/07/2026 sur tout le module 13. La lecture simulée
      // doit refléter le moteur pour que ce retrait reste détectable ici.
      const fr = typeof a.valeur === "string" ? lireDateOuHeureFr(String(a.valeur).trim()) : null
      const nfReel = fr && a.famille === "aucun" ? fr.format : auto ? MOTIF_DECIMAL_AUTO : nf
      out[ref] = { formule: "", valeur: v, numberFormat: nfReel }
    } else {
      out[ref] = { formule: "", valeur: "", numberFormat: nf }
    }
  }
  return out
}

const fichiers = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()
let etapes = 0
const fauxPositifs: string[] = []
const fauxPositifsVariante: string[] = []

for (const nom of fichiers) {
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"))
  const steps = sc.steps ?? []
  steps.forEach((s, i) => {
    etapes++
    const etat = etatAplomb(steps, sc.workbook, i)

    const legit = famillesLegitimes(steps)

    /* A — parcours propre, portée large (celle de la démonstration) */
    const propre = lectureParfaite(etat, false)
    for (const d of divergences(etat, propre, refsConnues(etat), legit)) {
      if (fauxPositifs.length < 12) fauxPositifs.push(`${nom}#${i} ${d.ref} (${d.motif})`)
    }

    /* B — l'apprenant a choisi l'autre écriture acceptée */
    const variante = lectureParfaite(etat, true)
    for (const d of divergences(etat, variante, refsConnues(etat), legit)) {
      if (fauxPositifsVariante.length < 12) fauxPositifsVariante.push(`${nom}#${i} ${d.ref} (${d.motif})`)
    }

    // La portée « dépendances » est un sous-ensemble : si la large est propre,
    // elle l'est aussi. On vérifie seulement que le calcul ne lève pas.
    cellulesLues(s)
  })
}

/* C — on pose des pièges, pour prouver que le détecteur détecte */
const pieges: Array<{ nom: string; ok: boolean; detail: string }> = []
{
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, "m09-l01.json"), "utf8"))
  const etat = etatAplomb(sc.steps, sc.workbook, 2) // D5 produit à l'étape 0
  const base = lectureParfaite(etat, false)
  const refs = refsConnues(etat)

  const essai = (titre: string, muter: (l: Record<string, LectureCellule>) => void, attendu: string) => {
    const l: Record<string, LectureCellule> = JSON.parse(JSON.stringify(base))
    muter(l)
    const ds = divergences(etat, l, refs)
    const trouve = ds.find((d) => d.ref === "D5")
    pieges.push({
      nom: titre,
      ok: !!trouve && trouve.motif === attendu && ds.length === 1,
      detail: `${ds.length} divergence(s) — ${ds.map((d) => d.ref + ":" + d.motif).join(", ") || "aucune"}`,
    })
  }

  essai("cellule vidée", (l) => { l.D5 = { formule: "", valeur: "", numberFormat: "" } }, "vide")
  essai("écrasée par une valeur brute", (l) => { l.D5 = { formule: "", valeur: 999, numberFormat: "" } }, "contenu")
  essai("formule remplacée par une autre", (l) => { l.D5 = { formule: "=B5*99", valeur: 1, numberFormat: "" } }, "contenu")
  essai("en erreur", (l) => { l.D5 = { formule: "=B5*C5", valeur: "#VALEUR!", numberFormat: "" } }, "erreur")
  essai("format pourcentage posé au hasard", (l) => { l.D5 = { ...l.D5, numberFormat: "0.00%" } }, "format")
  // Contre-piège : la francisation automatique des décimales n'est PAS un
  // format de l'apprenant. La traiter comme tel faisait retirer le motif, et
  // « 14,2 » se réaffichait « 14.2 » — le simulateur cassait sa propre
  // francisation en croyant réparer.
  {
    const l: Record<string, LectureCellule> = JSON.parse(JSON.stringify(base))
    l.D5 = { ...l.D5, numberFormat: MOTIF_DECIMAL_AUTO }
    const ds = divergences(etat, l, refs)
    pieges.push({ nom: "francisation décimale ≠ dégât", ok: ds.length === 0, detail: `${ds.length} divergence(s)` })
  }
  // Et le contre-piège : le gras et la couleur ne sont PAS des divergences.
  {
    const l: Record<string, LectureCellule> = JSON.parse(JSON.stringify(base))
    const ds = divergences(etat, l, refs)
    pieges.push({ nom: "aucun dégât → aucune divergence", ok: ds.length === 0, detail: `${ds.length}` })
  }
}

/* ═══════════ D — les pièges qui manquaient ═══════════
 *
 * Les pièges ci-dessus portaient tous sur une cellule DÉCLARÉE, formatée ou
 * vidée. Trois défauts sont passés au travers en juillet 2026, chacun parce
 * qu'aucun piège ne leur ressemblait :
 *   · un format légitime posé hors des cellules déclarées (25 étapes cassées) ;
 *   · un classeur à plusieurs feuilles (19 scénarios, écriture sur la mauvaise) ;
 *   · une famille de format que le MOTEUR pose lui-même.
 */
const pieges2: Array<{ nom: string; ok: boolean; detail: string }> = []
{
  // D1 — « aucun format attendu » ne vaut pas « format interdit ».
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, "m01-l05.json"), "utf8"))
  const etat = etatAplomb(sc.steps, sc.workbook, 10)
  const legit = famillesLegitimes(sc.steps)
  const base = lectureParfaite(etat, false)
  const refs = refsConnues(etat)
  const monetaire = '#,##0.00" €"'
  // L'étape déclare D5 et D11 ; l'apprenant formate toute la colonne.
  const l: Record<string, LectureCellule> = JSON.parse(JSON.stringify(base))
  for (const r of ["D5", "D6", "D7", "D8", "D9", "D10", "D11"]) {
    if (l[r]) l[r] = { ...l[r], numberFormat: monetaire }
  }
  const ds = divergences(etat, l, refs, legit)
  const perdues = ds.filter((d) => d.motif === "format").map((d) => d.ref)
  pieges2.push({
    nom: "format légitime posé hors des cellules déclarées",
    ok: perdues.length === 0,
    detail: perdues.length ? "retirerait " + perdues.join(",") : "aucun retrait",
  })

  // D2 — un format qui MENT reste retiré, MÊME dans le rectangle d'un
  //      `EXPECT_FORMAT` : la boîte rend légitime la famille demandée, pas
  //      n'importe laquelle. D11 est déclarée, donc réellement examinée.
  const l2: Record<string, LectureCellule> = JSON.parse(JSON.stringify(base))
  l2.D11 = { ...l2.D11, numberFormat: "0.00%" }
  const ds2 = divergences(etat, l2, refs, legit)
  pieges2.push({
    nom: "pourcentage posé dans le rectangle : retiré quand même",
    ok: ds2.some((d) => d.ref === "D11" && d.motif === "format"),
    detail: ds2.map((d) => d.ref + ":" + d.motif).join(",") || "aucune",
  })
}
{
  // D3 — classeur multi-feuilles : l'état doit suivre la feuille ACTIVE.
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, "m22-l01.json"), "utf8"))
  const noms = (sc.workbook.sheets ?? []).map((f) => f.name)
  const surLyon = etatAplomb(sc.steps, sc.workbook, 3, noms[0])
  const surTotal = etatAplomb(sc.steps, sc.workbook, 3, noms[noms.length - 1])
  // Lyon déclare C2 = 14400 ; la feuille de synthèse ne déclare rien en C2.
  pieges2.push({
    nom: "multi-feuilles : l'état suit la feuille active",
    ok: surLyon.C2 !== undefined && surTotal.C2 === undefined,
    detail: `${noms[0]}.C2=${surLyon.C2 ? "déclarée" : "—"} · ${noms[noms.length - 1]}.C2=${surTotal.C2 ? "déclarée" : "—"}`,
  })
}
{
  // D4 — cellule remplie là où le scénario n'attend rien : aujourd'hui
  //      volontairement ignorée (la frontière « zone du classeur » attend
  //      l'arbitrage de Samuel). Le piège existe pour que le jour où elle
  //      sera posée, ce contrôle le dise.
  const sc: SimulationScenario = JSON.parse(fs.readFileSync(path.join(DIR, "m01-l05.json"), "utf8"))
  const etat = etatAplomb(sc.steps, sc.workbook, 10)
  const l: Record<string, LectureCellule> = JSON.parse(JSON.stringify(lectureParfaite(etat, false)))
  l.C9 = { formule: "", valeur: 420, numberFormat: "" }
  const ds = divergences(etat, l, [...refsConnues(etat), "C9"], famillesLegitimes(sc.steps))
  pieges2.push({
    nom: "cellule parasite (frontière en attente d'arbitrage)",
    ok: true,
    detail: ds.some((d) => d.ref === "C9") ? "détectée" : "IGNORÉE — connu, arbitrage Samuel",
  })
}

/* ═══════════ Verdict ═══════════ */
console.log("CONTRÔLE DE LA REMISE D'APLOMB")
console.log("  scénarios :", fichiers.length, "· étapes éprouvées :", etapes)
console.log()
console.log("A. parcours propre, zéro réparation :", fauxPositifs.length === 0 ? "OK" : "ÉCHEC")
fauxPositifs.forEach((x) => console.log("     ✗", x))
console.log("B. écriture équivalente préservée   :", fauxPositifsVariante.length === 0 ? "OK" : "ÉCHEC")
fauxPositifsVariante.forEach((x) => console.log("     ✗", x))
console.log("C. les pièges sont bien vus :")
pieges.forEach((p) => console.log(`     ${p.ok ? "OK  " : "✗   "} ${p.nom} — ${p.detail}`))
console.log("D. les pièges des défauts de juillet :")
pieges2.forEach((p) => console.log(`     ${p.ok ? "OK  " : "✗   "} ${p.nom} — ${p.detail}`))

const echec =
  fauxPositifs.length > 0 || fauxPositifsVariante.length > 0 || pieges.some((p) => !p.ok) || pieges2.some((p) => !p.ok)
console.log()
console.log(echec ? "→ ÉCHEC" : "→ tout est vert")
process.exit(echec ? 1 : 0)
