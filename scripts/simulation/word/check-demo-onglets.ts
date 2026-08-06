/**
 * TOUT BOUTON DE RUBAN QU'UNE DÉMONSTRATION DÉSIGNE DOIT ÊTRE À L'ÉCRAN.
 *
 * Le ruban de Word ne rend QUE son onglet actif. Un geste qui vise un bouton
 * rangé sous un autre onglet ne désigne donc rien : `querySelector` ne trouve
 * pas l'élément, `DemonstrationGeste` ne dessine pas son cadre — et la séquence
 * continue. Le compteur va jusqu'à `n/n`, la phase atteint `fini`, l'apprenant
 * qui venait de demander « Montrez-moi » n'a rien vu. Aucune erreur n'est levée :
 * c'est le faux témoin parfait, celui qu'aucune lecture de compteur n'attrape.
 *
 * Mesuré sur le balayage exhaustif de Word (06/08/2026, 101 chapitres × 3
 * formats) : 26 démonstrations sur 441 dans cet état, concentrées sur deux
 * boutons — `w-mise-en-page` (14 gestes, modules 8 à 10) et `w-inserer-tableau`
 * (12, module 12).
 *
 * 🔴 CE QUE CE CONTRÔLE ATTRAPE ET QUE RIEN D'AUTRE NE VOYAIT.
 *
 * La cause était STRUCTURELLE, pas une étourderie d'auteur : dans tout
 * `lib/simulation/word/adaptateur.ts`, la clé `onglet` n'apparaissait qu'à un
 * seul endroit, réservé aux illustrations d'écran de lecture. Aucun plan déduit
 * d'une ACTION ne pouvait ouvrir l'onglet de son bouton. Un nouveau scénario
 * pouvait donc réintroduire le défaut en silence, et c'est précisément ce que
 * ce contrôle interdit désormais.
 *
 * L'invariant vérifié est plus large que le correctif : pour CHAQUE geste de
 * CHAQUE plan des 101 chapitres, si sa cible est un bouton du ruban, l'onglet
 * qui le porte doit avoir été ouvert AVANT — par le geste précédent, par
 * l'ouverture initiale, ou par l'étape elle-même.
 *
 * ⚠️ On interroge le MOTEUR (`adaptateurWord.demonstration`), jamais le texte
 * des fichiers : c'est la leçon du registre, dont le branchement se lisait vert
 * dans un commentaire de documentation pendant que rien n'était branché. Même
 * discipline pour l'adoption côté player, cherchée COMMENTAIRES RETIRÉS.
 *
 * ⚠️ La construction du plan est le MIROIR EXACT de `WordPlayer` (bloc `plan`) :
 * écran de lecture → les `montrer` décalés d'un cran ; évaluation notée → aucun
 * plan ; sinon le plan déduit de l'action. Toute divergence produirait un faux
 * verdict — et un contrôle qui modélise autre chose que le produit ne prouve
 * rien, quatrième mode de défaillance des faux témoins du 04/08.
 *
 * ⚠️ Word n'a PAS le mécanisme de PowerPoint. Là-bas, une bascule est un geste à
 * part entière qui presse `ong-<onglet>` ; ici, l'onglet est un CHAMP du geste,
 * appliqué à sa FIN, donc pour le geste suivant. Recopier le contrôle de PPT
 * sans cette différence produirait des anomalies imaginaires.
 *
 *   npx tsx scripts/simulation/word/check-demo-onglets.ts [--piege]
 */

import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { adaptateurWord } from "../../../lib/simulation/word/adaptateur"
import {
  LIBELLE_ONGLET_WORD,
  controleDuGeste,
  ongletDuControle,
  ouverturesDOnglet,
  type OngletWord,
} from "../../../lib/simulation/word/ruban"
import type { GesteDemo } from "../../../lib/simulation/demonstration"

const DOSSIER = join(__dirname, "..", "scenarios", "word")
const PLAYER = join(
  __dirname,
  "..",
  "..",
  "..",
  "components",
  "simulation",
  "word",
  "WordPlayer.tsx",
)
const PIEGE = process.argv.includes("--piege")

type Etape = {
  id: string
  action?: { type?: string }
  montrer?: unknown[]
  setup?: { ribbon?: { activeTab?: OngletWord } }
}

function demo(a: unknown): { gestes: GesteDemo[] } | null {
  try {
    return adaptateurWord.demonstration(a as never, {} as never) as { gestes: GesteDemo[] } | null
  } catch {
    return null
  }
}

/**
 * Le plan de l'étape, tel que `WordPlayer` le construit — décalage compris.
 *
 * Le décalage d'un cran est reproduit à l'identique : sans lui, l'onglet écrit
 * par un auteur serait compté comme ouvert un geste trop tôt, et le contrôle
 * validerait des séquences que le produit joue à blanc.
 */
function planDe(step: Etape, evaluationNotee: boolean): GesteDemo[] | null {
  if (step.action?.type === "READ") {
    const plans = (step.montrer ?? []).map(demo).filter(Boolean) as { gestes: GesteDemo[] }[]
    if (!plans.length) return null
    const gestes = plans.flatMap((p) => p.gestes)
    return gestes.map((g, k) => {
      const suivant = gestes[k + 1]
      const { onglet: _sien, ...reste } = g
      return (suivant?.onglet ? { ...reste, onglet: suivant.onglet } : reste) as GesteDemo
    })
  }
  if (evaluationNotee) return null
  return demo(step.action)?.gestes ?? null
}

type Anomalie = {
  fichier: string
  etape: string
  type: string
  bouton: string
  onglet: OngletWord
  rang: number
}

function analyser(ancienneRegle: boolean) {
  const anomalies: Anomalie[] = []
  let chapitres = 0
  let etapesAvecPlan = 0
  let gestesRuban = 0
  let ouverturesInitiales = 0
  let basculesEnSequence = 0

  for (const f of readdirSync(DOSSIER).filter((x) => x.endsWith(".json")).sort()) {
    const sc = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8"))
    chapitres += 1
    const evaluationNotee = sc.mode === "EVALUATION"

    /*
     * L'ÉTAT DU RUBAN SUIT LE CHAPITRE, il ne se réinitialise pas à chaque étape.
     *
     * `WordChrome` tient son onglet en état interne et ne le rebascule que
     * lorsqu'une étape en IMPOSE un. Modéliser une remise à « Accueil » ferait
     * crier au loup sur `m08-l01`, qui fonctionne précisément parce que l'onglet
     * ouvert par son écran d'ouverture reste ouvert pour la suite du chapitre.
     */
    let ruban: OngletWord = "accueil"

    for (const step of (sc.steps ?? []) as Etape[]) {
      if (step.setup?.ribbon?.activeTab) ruban = step.setup.ribbon.activeTab

      const brut = planDe(step, evaluationNotee)
      if (!brut) continue
      etapesAvecPlan += 1

      /*
       * LE PIÈGE — on rétablit l'ancienne règle : aucune ouverture déduite, seul
       * un `onglet` écrit à la main par l'auteur du scénario amène le ruban.
       * Le contrôle DOIT rougir, sinon il ne prouve rien : un détecteur qu'on
       * n'a pas piégé n'est qu'un afficheur.
       */
      const { gestes, ongletInitial } = ancienneRegle
        ? {
            gestes: brut,
            /*
             * ⚠️ L'ancienne ouverture initiale lisait `etape.montrer[0].onglet`
             * — l'ACTION écrite dans le scénario —, PAS le premier geste du plan.
             * La nuance n'est pas anodine : les gestes d'un écran de lecture sont
             * décalés d'un cran, donc `gestes[0].onglet` porte déjà l'onglet du
             * SECOND. Modéliser le geste au lieu de l'action gonflait l'épreuve
             * de sept cas imaginaires — un piège qui exagère le mal qu'il
             * prétend attraper vaut à peine mieux qu'un contrôle qui l'ignore.
             */
            ongletInitial: ((step.montrer ?? [])[0] as { onglet?: OngletWord } | undefined)?.onglet,
          }
        : /*
           * ⚠️ `undefined`, PAS l'onglet présumé du ruban — et c'est le MIROIR
           * EXACT de `WordPlayer`. Le player n'a aucun moyen de connaître
           * l'onglet réellement affiché : les onglets sont vivants, explorer le
           * ruban n'est pas une faute, et l'apprenant qui réclame « Montrez-moi »
           * est justement celui qui a cherché ailleurs. Il ouvre donc TOUJOURS
           * l'onglet du premier geste de ruban. Passer `ruban` ici mesurerait un
           * produit qui n'existe pas — quatrième mode de défaillance des faux
           * témoins : l'outil ne peut structurellement pas vérifier ce qu'il
           * prétend.
           */
          ouverturesDOnglet(brut, undefined)

      if (!ancienneRegle && ongletInitial) ouverturesInitiales += 1

      let ouvert: OngletWord | undefined = ongletInitial ?? ruban
      gestes.forEach((g, rang) => {
        const id = controleDuGeste(g)
        const onglet = id ? ongletDuControle(id) : null
        if (onglet) {
          gestesRuban += 1
          if (onglet !== ouvert)
            anomalies.push({
              fichier: f,
              etape: step.id,
              type: String(step.action?.type ?? "?"),
              bouton: id!,
              onglet,
              rang,
            })
        }
        const pose = g.onglet as OngletWord | undefined
        if (pose) {
          if (!ancienneRegle) basculesEnSequence += 1
          ouvert = pose
        }
      })

      /*
       * Fin de démonstration : `finDemo` remet `ongletDemo` à `null`. Le ruban
       * retombe sur l'onglet imposé par l'étape s'il y en a un ; sinon il garde
       * celui que la démonstration a ouvert, faute de quoi que ce soit qui le
       * contredise.
       */
      ruban = step.setup?.ribbon?.activeTab ?? ouvert ?? ruban
    }
  }
  return { anomalies, chapitres, etapesAvecPlan, gestesRuban, ouverturesInitiales, basculesEnSequence }
}

/* ═══════════ 1 — L'INVARIANT ═══════════ */

const vrai = analyser(false)
console.log(`── Onglets des démonstrations Word · ${vrai.chapitres} chapitres ──\n`)
console.log(`  étapes portant un plan de démonstration : ${vrai.etapesAvecPlan}`)
console.log(`  gestes visant un bouton du ruban        : ${vrai.gestesRuban}`)
console.log(`  ouvertures avant le premier geste       : ${vrai.ouverturesInitiales}`)
console.log(`  bascules d'onglet dans la séquence      : ${vrai.basculesEnSequence}`)

if (vrai.anomalies.length) {
  console.log(`\n  ✗ ${vrai.anomalies.length} geste(s) désignent un bouton sous un onglet JAMAIS ouvert :`)
  for (const a of vrai.anomalies.slice(0, 40))
    console.log(
      `      ${a.fichier.padEnd(14)} ${a.etape.padEnd(12)} ${a.type.padEnd(18)} geste ${String(a.rang).padStart(2)} → ${a.bouton.padEnd(20)} (onglet ${LIBELLE_ONGLET_WORD[a.onglet]})`,
    )
  if (vrai.anomalies.length > 40) console.log(`      … et ${vrai.anomalies.length - 40} autre(s)`)
}

/* ═══════════ 2 — L'ADOPTION PAR LE PLAYER ═══════════

   Un correctif qui vit dans un module que personne n'appelle est inerte. On
   cherche l'appel COMMENTAIRES RETIRÉS : c'est exactement ainsi que le
   branchement du registre s'est lu vert pendant qu'il n'existait pas. */

const sansCommentaires = readFileSync(PLAYER, "utf-8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1")
const adopte = /\bouverturesDOnglet\s*\(/.test(sansCommentaires)
console.log(`\n  adoption par WordPlayer                 : ${adopte ? "✓ appelée" : "✗ ABSENTE"}`)

/* ═══════════ 3 — L'AUTO-ÉPREUVE ═══════════ */

if (PIEGE) {
  const piege = analyser(true)
  console.log(`\n── AUTO-ÉPREUVE — ancienne règle rétablie ──`)
  console.log(`  gestes laissés sans onglet : ${piege.anomalies.length}`)
  const parBouton = new Map<string, number>()
  for (const a of piege.anomalies) parBouton.set(a.bouton, (parBouton.get(a.bouton) ?? 0) + 1)
  for (const [b, n] of [...parBouton].sort((x, y) => y[1] - x[1]))
    console.log(`      ${String(n).padStart(4)}  ${b}`)
  const chapitres = new Set(piege.anomalies.map((a) => a.fichier))
  console.log(`      → ${chapitres.size} chapitre(s) touché(s)`)
  if (!piege.anomalies.length) {
    console.log("\n✗ LE PIÈGE N'A RIEN ATTRAPÉ — ce contrôle ne prouve rien, le réparer avant de s'y fier.")
    process.exit(1)
  }
  console.log("\n  ✓ le piège rougit : le contrôle détecte bien ce qu'il prétend détecter.")
}

if (vrai.anomalies.length || !adopte) {
  console.log(
    !adopte
      ? "\n✗ `ouverturesDOnglet` n'est appelée par aucun player : le correctif est inerte."
      : "\n✗ Des démonstrations désignent un bouton absent de l'écran.",
  )
  process.exit(1)
}
console.log(
  `\n✓ ${vrai.gestesRuban}/${vrai.gestesRuban} gestes de ruban sont précédés de l'ouverture de leur onglet.`,
)
