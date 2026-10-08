/**
 * CONTRAT ENTRE LE LECTEUR D'ANGLAIS ET LA BARRE COMMUNE DU PLAYER
 *
 * Fixé par le chef d'orchestre le 9 octobre 2026 (intégration de la maquette
 * « Player LMS » validée par Samuel : une seule barre pour toutes les familles).
 * Deux agents l'implémentent en parallèle, chacun de son côté :
 *   - l'agent « Anglais » : le lecteur (iframe `/anglais/index.html?lms=1`)
 *     masque son propre en-tête en mode LMS et ÉMET `anglais:etat` ;
 *     il EXÉCUTE les `anglais:commande` reçues ;
 *   - l'agent « Barre » : la barre commune AFFICHE cet état (titre, étape,
 *     menu son, outils) et ENVOIE les commandes au lecteur.
 * `AnglaisChapter.tsx` (agent Anglais) fait le relais : il écoute l'iframe et
 * expose `onEtatLecteur` / accepte `commandeLecteur` (voir plus bas).
 *
 * ⛔ Aucun des deux agents ne modifie ce fichier : une évolution du contrat
 * passe par le chef, qui prévient l'autre agent.
 *
 * Messages existants conservés tels quels : `anglais:hauteur`,
 * `anglais:immersion`, `anglais:outil` (notes, ressources), `anglais:naviguer`,
 * `anglais:termine`. Même règle de sécurité qu'aujourd'hui : origine identique
 * et source = l'iframe du chapitre.
 */

/** Émis par le lecteur à chaque changement d'écran ou d'état de la voix. */
export type EtatLecteurAnglais = {
  type: "anglais:etat"
  /** Séquence / bloc (ex. « Bloc 1 — Nouveaux chez Wren & Holt »). */
  sequence: string
  /** Titre de l'écran courant (étape, ou titre de la leçon sur l'accueil). */
  titre: string
  /** Étape courante, base 1 ; `null` sur l'écran d'accueil de la leçon. */
  etape: { rang: number; total: number } | null
  /** Guide vocal du lecteur. `disponible:false` = pas de voix sur cet écran. */
  voix: { disponible: boolean; active: boolean; enLecture: boolean }
  /** `true` quand un retour à l'accueil de la leçon existe (ancien bouton
   * « Fermer l'étape et revenir à la leçon » de l'en-tête du lecteur). */
  retourLecon: boolean
  /** Outils propres au lecteur qui vivaient dans son en-tête et qui doivent
   * rester accessibles depuis la barre (ex. « Comparer avec Reflex'English »).
   * La barre les place où la maquette l'indique (menu « ⋯ » au téléphone). */
  outils: Array<{ id: string; libelle: string }>
}

/** Envoyé par la barre au lecteur (via `AnglaisChapter`). */
export type CommandeLecteurAnglais =
  | { type: "anglais:commande"; action: "voix:rejouer" }
  | { type: "anglais:commande"; action: "voix:arreter" }
  | { type: "anglais:commande"; action: "voix:activer" }
  | { type: "anglais:commande"; action: "voix:couper" }
  | { type: "anglais:commande"; action: "retour-lecon" }
  | { type: "anglais:commande"; action: "outil"; id: string }

/** Props ajoutées à `AnglaisChapter` (côté agent Anglais) et consommées par la
 * barre (côté agent Barre). `commandeLecteur` porte un `n` incrémenté à chaque
 * envoi pour qu'une même commande puisse être rejouée deux fois de suite. */
export type PropsBarreAnglais = {
  onEtatLecteur?: (etat: EtatLecteurAnglais) => void
  commandeLecteur?: { n: number; commande: CommandeLecteurAnglais } | null
}

export function estEtatLecteurAnglais(d: unknown): d is EtatLecteurAnglais {
  if (!d || typeof d !== "object") return false
  const o = d as Record<string, unknown>
  return o.type === "anglais:etat" && typeof o.titre === "string" && typeof o.voix === "object" && o.voix !== null
}
