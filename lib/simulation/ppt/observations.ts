/**
 * Ce que la surface de Ppt ÉMET réellement quand l'apprenant agit.
 *
 * PROPRIÉTÉ : agent PowerPoint, phase 2. Mêmes règles que `actions.ts` :
 * ce fichier n'importe RIEN, pas même un `import type`.
 *
 * PRÉFIXE OBLIGATOIRE `p:` sur chaque `kind`, ex. `{ kind: "p:…" }`.
 *
 * ⚠️ Une action attendue dont la surface n'émet JAMAIS l'observation
 * correspondante rend l'étape injouable : l'apprenant fait exactement ce qu'on
 * lui demande et rien ne se passe. Excel l'a payé — `CLICK_CELL_MODIFIER`
 * figurait dans la liste des gestes observables sur une supposition non testée,
 * alors que Ctrl+clic n'émet rien du tout. D'où `adaptateur.observables` :
 * ce que la surface émet se PROUVE au navigateur, il ne se suppose pas.
 */
export type PptObservation = never
