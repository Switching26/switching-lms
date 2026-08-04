/**
 * Les actions de Ppt — union propre à cette application.
 *
 * PROPRIÉTÉ : agent PowerPoint, phase 2. Le socle ne l'écrit pas.
 *
 * ⚠️ RÈGLE DURE, VÉRIFIÉE PAR `check-frontieres.ts` : ce fichier n'importe RIEN.
 * Pas même un `import type`. C'est une FEUILLE de l'arbre de dépendances.
 *
 * Ce n'est pas de la coquetterie : trois agents écrivent ces fichiers en
 * parallèle, et une feuille sans import ne dépend pas de l'ordre de livraison
 * des autres. C'est aussi ce qui interdit tout cycle d'import, et ce qui rend le
 * fichier lisible seul. (Le socle `contrats.ts` a une règle plus souple —
 * `import type` autorisé — parce qu'il est écrit une fois, par un seul agent.
 * Ne pas lire cet assouplissement comme une autorisation générale.)
 *
 * PRÉFIXE OBLIGATOIRE `P_` sur chaque `type`. C'est lui qui permet au
 * registre de router l'action vers le bon adaptateur, sans que la couture ait à
 * connaître les applications.
 *
 * ÉTAT : vide. `never` est l'union vide : `SimulationAction | never` vaut
 * exactement `SimulationAction`, donc la formation Excel publiée — 246
 * chapitres, 1 883 étapes — n'est pas touchée d'un iota par ce branchement.
 *
 * Pour ajouter la première variante, remplacer `never` par l'union :
 *
 *   export type PptAction =
 *     | { type: "P_…"; … }
 */
export type PptAction = never
