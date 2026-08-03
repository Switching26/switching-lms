/**
 * Le guide interactif de la formation — ses étapes, en données pures.
 *
 * POURQUOI CE FICHIER N'IMPORTE PAS REACT
 * Les étapes sont des données : un titre, un texte, un sélecteur, un prédicat.
 * Les garder hors du composant permet à `scripts/check-guide-formation.ts` de
 * les relire sans navigateur — vérifier qu'aucun secret ne traîne, que chaque
 * cible existe vraiment dans le cockpit, que rien n'est vide.
 *
 * LE GUIDE LIT, IL NE PILOTE PAS
 * Chaque étape sait reconnaître que son geste a été fait (`valide`), jamais le
 * faire à la place de l'apprenant. Les prédicats ne font que lire le DOM : pas
 * de clic programmatique, pas de `fetch`, pas d'écriture. C'est ce qui garantit
 * qu'ouvrir le guide ne touche ni la progression, ni les tentatives, ni la note.
 *
 * ANCRAGE
 * Les cibles visent les `data-control` du cockpit, posés pour les tests et
 * documentés comme stables dans `SimulationPlayer.tsx`. Viser une classe ou un
 * libellé casserait à la première reformulation.
 */

/** Version du parcours. L'incrémenter repropose le guide à tout le monde. */
export const VERSION_GUIDE = 1

/** Préfixe de la clé `localStorage`. La version en fait partie. */
export const PREFIXE_CLE_GUIDE = `sf-guide-formation:v${VERSION_GUIDE}`

export function cleGuidePour(identifiant?: string | null): string {
  // Sans identifiant (aperçu admin), la mémoire de première visite devient
  // locale au navigateur : le guide reste utilisable, il se souvient moins bien.
  return `${PREFIXE_CLE_GUIDE}:${identifiant && identifiant.trim() !== "" ? identifiant : "anon"}`
}

export type PlacementGuide = "auto" | "haut" | "bas"

export type EtapeGuide = {
  id: string
  titre: string
  /** Ce que c'est. Deux ou trois phrases, jamais plus. */
  texte: string
  /** L'objectif d'apprentissage, explicite : ce qu'il faut avoir compris en sortant. */
  retenir: string
  /** Le geste réel à faire sur le cockpit. */
  tache: string
  /** Retour affiché quand le geste est reconnu. */
  reussite: string
  /**
   * Élément du cockpit à éclairer. `null` = voile plein, sans projecteur.
   * Les balises `<b>` et `<code>` sont autorisées dans les textes ; elles sont
   * rendues telles quelles, le contenu venant d'ici et de nulle part ailleurs.
   */
  cible: string | null
  /**
   * Contrôle que l'apprenant doit pouvoir toucher. Sert au placement : la carte
   * ne se pose jamais dessus. Vaut `cible` quand ce n'est pas précisé.
   */
  toucher?: string
  /** Autres zones que la carte doit éviter de recouvrir. */
  eviter?: string[]
  placement?: PlacementGuide
  pad?: number
  /**
   * L'étape disparaît du parcours quand sa cible est absente.
   *
   * Le cockpit ne rend pas tous ses contrôles en permanence : « Leçons » n'existe
   * que si un sommaire est fourni, « Notes » que si la prise de notes est
   * ouverte, « Ressource pédagogique téléchargeable » que si un document est
   * attaché — et l'intersection « chapitres de simulation × documents » est vide
   * en production. Une étape qui pointe le vide est pire qu'une étape absente.
   */
  exigeCible?: boolean
  /**
   * Le geste est-il fait ? Lecture seule du DOM, jamais d'effet de bord.
   * Absent = étape de lecture, validée à la simple visite.
   */
  valide?: (racine: HTMLElement) => boolean
}

/**
 * Un panneau du cockpit est-il ouvert ?
 *
 * On lit d'abord l'état porté par le bouton lui-même — `aria-pressed` pour les
 * bascules, `aria-expanded` pour « Ressource pédagogique téléchargeable ». En
 * secours, le panneau correspondant : un `aside` cesse d'être `aria-hidden`
 * quand il s'ouvre. Le double chemin évite qu'un simple renommage d'attribut
 * dans le cockpit rende le guide sourd aux gestes de l'apprenant.
 */
function estOuvert(racine: HTMLElement, controle: string, libellePanneau: string): boolean {
  const el = racine.querySelector(`[data-control="${controle}"]`)
  if (el?.getAttribute("aria-pressed") === "true") return true
  if (el?.getAttribute("aria-expanded") === "true") return true
  const panneau = racine.querySelector(`aside[aria-label="${libellePanneau}"]`)
  return panneau?.getAttribute("aria-hidden") === "false"
}

function existe(racine: HTMLElement, selecteur: string): boolean {
  return racine.querySelector(selecteur) !== null
}

export const ETAPES_GUIDE: EtapeGuide[] = [
  {
    id: "accueil",
    titre: "Bienvenue dans l’atelier",
    texte:
      "Cette formation ne se regarde pas, elle se <b>pratique</b>. Chaque chapitre vous met devant un vrai tableur, avec une consigne et un geste à faire.",
    retenir:
      "Objectif de ce guide : savoir <b>où cliquer</b> pour naviguer, prendre des notes, ouvrir un support, demander de l’aide et lire vos résultats, sans jamais rester bloqué.",
    tache:
      "Vous pouvez avancer, revenir, sauter une étape par le sommaire, ou fermer le guide et le rouvrir plus tard. Rien de ce que vous faites ici n’est enregistré.",
    reussite: "Bonne visite.",
    cible: null,
  },

  {
    id: "navigation",
    titre: "Naviguer : modules, chapitres, progression",
    texte:
      "Le bouton <b>Leçons</b> ouvre le sommaire complet de la formation : chaque module, ses chapitres, et leur état. Le fil en haut de l’écran rappelle en permanence où vous êtes.",
    retenir:
      "À retenir : votre position est <b>toujours lisible en haut de l’écran</b>. Le sommaire sert à sauter d’un chapitre à l’autre sans repasser par la liste des formations.",
    tache: "Ouvrez le panneau <b>Leçons</b> et repérez le chapitre en cours dans la liste.",
    reussite: "Le sommaire est ouvert : vous pouvez rejoindre n’importe quel chapitre de là.",
    cible: '[data-control="sim-sommaire"]',
    exigeCible: true,
    pad: 8,
    valide: (r) => estOuvert(r, "sim-sommaire", "Toutes les leçons"),
  },

  {
    id: "ressources",
    titre: "Les supports, sans quitter l’atelier",
    texte:
      "Le bouton <b>Ressource pédagogique téléchargeable</b> réunit les documents rattachés à ce chapitre, puis ceux de toute la formation. Ils s’ouvrent par-dessus l’atelier.",
    retenir:
      "À retenir : consulter un support ne vous fait <b>jamais perdre votre place</b>. Vous pouvez le lire à l’écran ou le télécharger pour le garder hors ligne.",
    tache: "Ouvrez le panneau, puis ouvrez un document et refermez-le.",
    reussite: "Ouvrir, lire, refermer : l’atelier n’a pas bougé.",
    cible: '[data-control="sim-ressources"]',
    exigeCible: true,
    pad: 8,
    valide: (r) => estOuvert(r, "sim-ressources", "Ressource pédagogique téléchargeable"),
  },

  {
    id: "notes",
    titre: "Prendre une note qui vous attend au retour",
    texte:
      "Le bouton <b>Notes</b> ouvre un bloc-notes propre à ce chapitre. Il s’enregistre tout seul : aucun bouton à chercher.",
    retenir:
      "À retenir : la note reste attachée au chapitre et vous la <b>retrouvez à la session suivante</b>. Le point vert sur le bouton signale un chapitre qui porte déjà une note.",
    tache: "Ouvrez <b>Notes</b> et écrivez une phrase que vous voudrez relire plus tard.",
    reussite: "Le bloc-notes est ouvert : ce que vous y écrivez vous suivra.",
    cible: '[data-control="sim-notes"]',
    exigeCible: true,
    pad: 8,
    valide: (r) => estOuvert(r, "sim-notes", "Mes notes"),
  },

  {
    id: "regimes",
    titre: "Leçon, exercice, évaluation : trois régimes",
    texte:
      "Chaque étape annonce ce qu’on attend de vous : <b>À comprendre</b>, on regarde et rien n’est demandé ; <b>À vous de jouer</b>, un geste est attendu ; <b>Évalué</b>, le geste compte dans la note.",
    retenir:
      "À retenir : la ligne <b>Attendu</b> sous la consigne dit à quoi on reconnaît que c’est réussi. La consigne dit quoi faire, <b>Attendu</b> dit quand c’est fait.",
    tache:
      "Repérez le badge en début de consigne, puis faites le geste demandé dans la feuille de calcul.",
    reussite: "Vous savez lire ce qu’une étape attend de vous.",
    cible: '[data-control="sim-badge-etape"]',
    toucher: "[data-bandeau-consigne]",
    placement: "haut",
    pad: 6,
  },

  {
    id: "demonstration",
    titre: "La démonstration : le geste joué devant vous",
    texte:
      "Bloqué ? L’atelier fait le geste <b>à votre place</b>, à l’écran : le repère se pose sur la bonne cellule, la formule s’écrit caractère par caractère, le résultat apparaît. Le bouton se propose de lui-même après quelques essais infructueux.",
    retenir:
      "À retenir : la démonstration <b>ne vous prend pas la main</b>. Vous pouvez la revoir autant de fois que nécessaire, puis reprendre là où vous en étiez.",
    tache:
      "Sur un écran de lecture, le bouton <b>Voir le geste</b> lance la démonstration. Sur un exercice, <b>Montrez-moi</b> apparaît quand vous butez.",
    reussite: "Vous savez la déclencher et la rejouer : c’est le filet de sécurité de la formation.",
    cible: '[data-control="sim-montrer"]',
    eviter: ["[data-zone-grille]"],
    placement: "haut",
    pad: 6,
    valide: (r) => existe(r, '[data-control="sim-revoir-demo"]') || existe(r, '[data-control="sim-revoir-geste"]'),
  },

  {
    id: "indices",
    titre: "Un indice n’est pas une correction",
    texte:
      "En exercice, <b>Un indice</b> donne un coup de pouce : la piste, la règle, la syntaxe. Jamais la solution. C’est une aide à la méthode, pas un raccourci.",
    retenir:
      "À retenir : indices et démonstrations existent en <b>leçon et en exercice</b>. Ils disparaissent en évaluation, et c’est la seule vraie différence entre les deux régimes.",
    tache: "Quand un exercice vous résiste, ouvrez d’abord l’indice avant de demander la démonstration.",
    reussite: "Vous savez demander de l’aide sans qu’on vous donne la solution.",
    cible: '[data-control="sim-indice"]',
    placement: "haut",
    pad: 6,
    valide: (r) => !existe(r, '[data-control="sim-indice"]'),
  },

  {
    id: "evaluation",
    titre: "L’évaluation : sans aide, et ça se voit",
    texte:
      "À la fin de chaque module, une évaluation. La barre du haut <b>change de couleur</b>, le badge <b>Évaluation notée</b> apparaît, et chaque geste noté est signalé sous la consigne.",
    retenir:
      "À retenir : plus d’indice ni de démonstration. Si vous bloquez, vous pouvez <b>passer la question</b> ; elle compte comme non réussie, mais vous n’êtes jamais coincé. La <b>meilleure note est conservée</b> : vous pouvez repasser l’évaluation.",
    tache: "Repérez la barre du haut : sa couleur vous dit à tout moment dans quel régime vous êtes.",
    reussite: "Vous reconnaîtrez une évaluation au premier coup d’œil.",
    cible: '[data-control="sim-cockpit"]',
    placement: "bas",
    pad: 3,
  },

  {
    id: "parcours",
    titre: "Après l’évaluation : quoi rouvrir, et dans quel ordre",
    texte:
      "Le bilan ne se contente pas d’une note. Il sépare <b>ce qui est acquis</b> de <b>ce qui est à revoir</b>, classe les priorités, et renvoie vers la leçon exacte qui porte chaque notion.",
    retenir:
      "À retenir : une évaluation ratée ne demande pas un nouvel exercice, elle dit <b>quelle leçon rouvrir</b>. Le bilan ne donne aucune correction : la réponse reste dans la leçon.",
    tache: "À la fin d’une évaluation, suivez les renvois du bilan plutôt que de repasser l’épreuve tout de suite.",
    reussite: "Vous savez quoi faire d’une note : rouvrir la bonne leçon.",
    cible: '[data-control="sim-bilan-reviser"]',
    toucher: '[data-control="sim-bilan-renvoi"]',
    pad: 8,
  },

  {
    id: "reprise",
    titre: "Reprendre là où vous vous êtes arrêté",
    texte:
      "Fermez l’onglet en plein milieu d’un chapitre : au retour, vous repartez à l’étape où vous en étiez, avec votre feuille de calcul telle que vous l’aviez laissée. Une évaluation, elle, se repasse en entier.",
    retenir:
      "À retenir : la progression avance toute seule. Le compteur d’étapes, les segments à côté et le sommaire <b>Leçons</b> sont vos trois repères d’avancement.",
    tache: "Regardez le compteur d’étapes en haut à droite : c’est votre position dans le chapitre.",
    reussite: "Vous avez fait le tour. Le bouton <b>Guide</b> reste là pour rouvrir ce parcours.",
    cible: '[data-control="sim-progression"]',
    placement: "bas",
    pad: 6,
  },
]

/**
 * Les étapes réellement jouables ici et maintenant.
 *
 * Une étape marquée `exigeCible` dont le contrôle est absent du cockpit sort du
 * parcours : elle ne compte plus dans la numérotation ni dans le sommaire. Les
 * autres restent, même sans projecteur — le bouton « Montrez-moi » n'apparaît
 * qu'après un blocage, mais expliquer qu'il existe a du sens avant.
 */
export function etapesDisponibles(racine: HTMLElement | null): EtapeGuide[] {
  if (!racine) return ETAPES_GUIDE
  return ETAPES_GUIDE.filter((e) => !e.exigeCible || !e.cible || racine.querySelector(e.cible) !== null)
}
