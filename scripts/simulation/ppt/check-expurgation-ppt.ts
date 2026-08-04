/**
 * PowerPoint — aucune réponse ne part au navigateur en évaluation notée.
 *
 * Décliné de `check-expurgation` (contrat §7).
 *
 * ═══ POURQUOI CE CONTRÔLE EXISTE ═══
 *
 * L'expurgation d'Excel PRÉTENDAIT retirer les réponses et ne retirait rien :
 * sa liste de clés secrètes en nommait cinq dont une seule existait dans le
 * format, si bien qu'`action.accept` et `action.cells` partaient intacts au
 * navigateur — un apprenant pouvait lire la réponse dans l'onglet réseau, dans
 * une évaluation NOTÉE, chez un organisme certifié Qualiopi. Le commentaire du
 * module affirmait le contraire de ce que faisait le code.
 *
 * D'où deux règles ici :
 *
 *  · `publierPpt` procède par LISTE BLANCHE. Un champ ajouté demain à une action
 *    est secret par défaut, jamais l'inverse ;
 *  · ce contrôle ne relit PAS la liste blanche — ce serait circulaire, et c'est
 *    exactement l'erreur qui a laissé passer le défaut d'Excel. Il fabrique un
 *    scénario porteur de réponses RECONNAISSABLES, le fait passer par le vrai
 *    chemin d'expurgation, et cherche ces marqueurs dans ce qui sort.
 *
 * ⚠️ Rappel d'ORDRE (décision D4) : masquer n'a de sens qu'une fois la route
 * `/verify` en place et `clientValidation:false` honoré. Masquer avant rendrait
 * toutes les évaluations INFRANCHISSABLES.
 */

import { expurgerScenarioNote } from "../../../lib/simulation/expurge"
import { publierPpt } from "../../../lib/simulation/ppt/adaptateur"
import type { PptAction } from "../../../lib/simulation/ppt/actions"

/** Marqueurs improbables : leur présence dans la sortie est une fuite prouvée. */
const M = {
  texte: "REPONSE-SECRETE-ZQX",
  titre: "TITRE-ATTENDU-ZQX",
  fond: "#ABCDEF",
  notes: "NOTES-ATTENDUES-ZQX",
}

const SCENARIO = {
  schemaVersion: 1,
  title: "Évaluation de contrôle",
  mode: "EVALUATION",
  ribbon: [],
  workbook: { fileName: "x", sheets: [] },
  ppt: { slides: [{ layout: "titre-et-contenu" }] },
  steps: [
    {
      id: "E-01",
      consigne: "Renseignez le titre de la diapositive.",
      action: { type: "P_TYPE_TEXT", cible: "ph:titre", accept: [M.texte] },
      points: 1,
    },
    {
      id: "E-02",
      consigne: "Mettez la présentation dans l'état demandé.",
      action: {
        type: "P_EXPECT_DECK",
        deck: {
          nbSlides: 3,
          slides: [{ index: 0, notes: M.notes, textes: { titre: [M.titre] } }],
        },
      },
      points: 2,
    },
    {
      id: "E-03",
      consigne: "Mettez en forme l'élément sélectionné.",
      action: { type: "P_EXPECT_FORMAT", objectId: "obj1", style: { bold: true }, fill: M.fond },
      points: 1,
    },
    {
      id: "E-04",
      consigne: "Ajoutez les animations demandées.",
      action: { type: "P_EXPECT_ANIMATIONS", animations: [{ objectId: "obj1", kind: "zoom", ordre: 1 }] },
      points: 1,
    },
    {
      id: "E-05",
      consigne: "Lancez le diaporama.",
      action: { type: "P_EXPECT_SHOW", show: { actif: true, index: 0 } },
      points: 1,
    },
  ],
}

/** Ce que l'atelier doit CONSERVER : sans ces champs, l'étape est injouable. */
const INDISPENSABLES: Array<{ id: string; champ: string }> = [
  { id: "E-05", champ: "type" },
]

function principal() {
  const servi = expurgerScenarioNote(SCENARIO, (a) => publierPpt(a as PptAction))
  const texte = JSON.stringify(servi)

  const fuites: string[] = []
  for (const [nom, marqueur] of Object.entries(M)) {
    if (texte.includes(marqueur)) fuites.push(`« ${nom} » (${marqueur}) est parti au navigateur`)
  }
  // Les valeurs attendues numériques comptent aussi : `nbSlides: 3` dit à
  // l'apprenant combien de diapositives produire.
  if (texte.includes('"nbSlides"')) fuites.push("`nbSlides` est parti au navigateur")
  if (texte.includes('"bold"')) fuites.push("l'attribut de mise en forme attendu est parti au navigateur")
  if (texte.includes('"accept"')) fuites.push("`accept` est parti au navigateur")

  const manquants: string[] = []
  const parId: Record<string, any> = {}
  for (const s of (servi as any).steps ?? []) parId[s.id] = s
  for (const x of INDISPENSABLES) {
    if (parId[x.id]?.action?.[x.champ] === undefined)
      manquants.push(`${x.id} a perdu « ${x.champ} » : l'étape deviendrait injouable`)
  }

  /* PIÉGEAGE — une expurgation qui ne masque rien doit être DÉTECTÉE.
     C'est le contre-test qui rend ce contrôle crédible : sans lui, il passerait
     au vert sur une expurgation aussi défaillante que celle d'Excel. */
  const sansExpurgation = JSON.stringify(expurgerScenarioNote(SCENARIO, (a: any) => ({ ...a })))
  const piegeDetecte = Object.values(M).some((m) => sansExpurgation.includes(m))

  console.log("── Piégeage ──")
  console.log(
    `  ${piegeDetecte ? "✓" : "✗"} une expurgation qui laisse tout passer est bien détectée` +
      (piegeDetecte ? "" : " — LE CONTRÔLE NE PROUVE RIEN"),
  )
  console.log()

  if (fuites.length || manquants.length || !piegeDetecte) {
    console.error("✗ expurgation PowerPoint :\n")
    for (const f of fuites) console.error(`  ✗ FUITE — ${f}`)
    for (const m of manquants) console.error(`  ✗ ${m}`)
    if (!piegeDetecte) console.error("  ✗ le piège n'a rien déclenché : le contrôle est aveugle")
    process.exit(1)
  }

  console.log(
    `✓ ${SCENARIO.steps.length} étapes notées expurgées — aucune réponse ne quitte le serveur, ` +
      `et les champs indispensables au jeu sont conservés.`,
  )
}

if (require.main === module) principal()
