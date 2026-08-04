/**
 * OUTLOOK — la forme d'un scénario.
 *
 * ═══ POURQUOI CE FICHIER EXISTE, ET CE QU'IL DEVIENDRA ═══
 *
 * `SimulationScenario` (`types.ts`, GELÉ) déclare `workbook` et `ribbon` comme
 * OBLIGATOIRES, et son `setup` d'étape ne porte aucun champ Outlook. Excel a
 * `scenario.poste` + `setup.poste` pour son poste de travail ; la messagerie n'a
 * pas d'équivalent — l'audit du socle l'avait signalé (§1.3), la phase 0 ne l'a
 * pas traité.
 *
 * Sans champ dédié, un chapitre Outlook ne peut NI poser sa boîte de départ, NI
 * la restituer à la reprise. Ce dernier point n'est pas cosmétique : `setup.poste`
 * existe côté Excel exactement pour cela — « un apprenant qui revient à l'étape
 * 12 doit retrouver Excel ouvert sur son classeur, pas le bureau nu ».
 *
 * En attendant le raccordement de `types.ts` par le chef d'orchestre, le type
 * vit ICI, dans la frontière d'écriture d'Outlook. Il est écrit pour que le
 * raccordement soit MÉCANIQUE : les champs portent déjà les noms proposés
 * (`courrier`), et les scénarios déjà écrits n'auront pas à bouger.
 *
 * ⚠️ `workbook` et `ribbon` sont déclarés vides dans les scénarios Outlook. C'est
 * volontaire et sans effet : la surface de messagerie ne les lit jamais. Les
 * rendre optionnels dans `types.ts` casserait `SimulationPlayer`, qui lit
 * `scenario.workbook` sans garde — un risque inutile pour un gain cosmétique.
 */

import type { SimulationStep } from "../types"
import type { SetupOutlook } from "./document"

/**
 * Un scénario de chapitre Outlook.
 *
 * Reprend la forme de `SimulationScenario` en ajoutant `courrier`. Les champs
 * `workbook` et `ribbon` restent présents pour rester compatible avec le type
 * gelé, et ne sont jamais lus par la surface de messagerie.
 */
export type ScenarioOutlook = {
  schemaVersion: 1
  title: string
  mode?: "LESSON" | "EXERCISE" | "EVALUATION"
  moduleTitle?: string
  intro?: { title: string; body: string }
  outro?: { body: string }

  /** Toujours vide côté Outlook — voir l'en-tête de ce fichier. */
  ribbon: []
  /** Toujours vide côté Outlook — voir l'en-tête de ce fichier. */
  workbook: { sheets: [] }

  /** LA boîte de départ : c'est elle qui met la leçon en scène. */
  courrier: SetupOutlook

  steps: EtapeOutlook[]
}

/**
 * Une étape, augmentée du `setup.courrier` qui manque au type gelé.
 *
 * Le reste est repris tel quel de `SimulationStep` : identifiant, consigne,
 * action, aide, feedback, points et `montrer`. Ne pas redéclarer ces champs
 * évite qu'ils dérivent du socle.
 */
export type EtapeOutlook = Omit<SimulationStep, "setup"> & {
  setup?: {
    /**
     * État de la messagerie imposé au démarrage de l'étape.
     *
     * Même rôle que `setup.poste` côté Excel : il rend la reprise honnête. Une
     * étape qui affirme « le message est maintenant marqué comme lu » doit poser
     * cet état, sinon un apprenant qui revient dessus lit une consigne qui décrit
     * un écran qu'il n'a pas.
     */
    courrier?: Partial<SetupOutlook>
  }
}
