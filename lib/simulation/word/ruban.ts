/**
 * CE QUE LE RUBAN DE WORD CONTIENT — et sous quel onglet.
 *
 * POURQUOI CE FICHIER EXISTE
 * Le ruban ne rend QUE son onglet actif. Un geste de démonstration qui vise un
 * bouton rangé sous un autre onglet ne désigne donc rien : le sélecteur ne
 * trouve pas l'élément, `DemonstrationGeste` ne dessine pas son cadre, et la
 * séquence continue quand même — compteur jusqu'à `n/n`, phase `fini`,
 * apprenant devant un écran inchangé. C'est le défaut mesuré le 06/08/2026 sur
 * le balayage exhaustif de Word : 26 démonstrations sur 441 jouées à blanc,
 * concentrées sur `w-mise-en-page` (14 gestes) et `w-inserer-tableau` (12).
 *
 * La déduction de l'onglet doit donc exister quelque part. Deux contraintes :
 *
 *  · le PLAYER en a besoin à l'exécution, pour ouvrir l'onglet avant le geste ;
 *  · le CONTRÔLE (`check-demo-onglets.ts`) en a besoin sans navigateur ni React.
 *
 * D'où ce module, PUR — aucun JSX, aucun composant, aucun état. `WordChrome`
 * n'en est plus que le dessinateur : il importe cette structure au lieu de la
 * porter. Une seule liste, donc aucune dérive possible entre ce que le ruban
 * rend et ce que la démonstration croit atteignable.
 *
 * ⚠️ PowerPoint déduit son onglet du PRÉFIXE de l'identifiant (`acc-`, `ins-`,
 * `tra-`…). Word ne le peut pas : ses boutons sont TOUS préfixés `w-`, sans
 * exception. C'est la différence qui interdit de recopier `ongletDuControle`
 * d'une application à l'autre — ici, seule l'appartenance déclarée fait foi.
 */

import type { GesteDemo } from "../demonstration"

export type OngletWord =
  | "fichier"
  | "accueil"
  | "insertion"
  | "mise-en-page"
  | "revision"
  | "affichage"

export type BoutonRuban = {
  id: string
  /** Ce qui s'affiche : une lettre stylée pour G/I/S, un mot sinon. */
  glyphe?: string
  /** Le libellé sous l'icône. Absent : le glyphe suffit (G, I, S). */
  texte?: string
  style?: "gras" | "italique" | "souligne" | "barre"
  large?: boolean
  /**
   * Valeurs proposées, pour les contrôles qui en EXIGENT une.
   *
   * 🔴 Sans elles, le bouton était rendu et inerte : la commande sous-jacente
   * a besoin d'un argument, `executer` rendait donc `false`, et l'apprenant
   * cliquait sur « Taille » sans que rien ne change. Le contrôle des boutons ne
   * le voyait même pas, puisque l'identifiant FIGURAIT bien dans la table des
   * commandes. Un bouton qui réclame une valeur doit offrir le moyen de la
   * donner.
   */
  valeurs?: { valeur: string; libelle: string }[]
}

export type GroupeRuban = { titre: string; boutons: BoutonRuban[] }

const POLICES = ["Arial", "Georgia", "Times New Roman", "Verdana"].map((f) => ({
  valeur: f,
  libelle: f,
}))
const TAILLES = [9, 11, 12, 14, 18, 24, 28, 36].map((n) => ({ valeur: String(n), libelle: String(n) }))
const COULEURS = [
  { valeur: "#1a1a1a", libelle: "Noir" },
  { valeur: "#c0392b", libelle: "Rouge" },
  { valeur: "#1b5e3a", libelle: "Vert" },
  { valeur: "#1f4e79", libelle: "Bleu" },
]
/**
 * ⚠️ « Aucune » EST UNE COULEUR DE SURLIGNAGE — décision D15.
 *
 * Sans cette entrée, un surlignage posé ne pouvait plus être retiré : la liste
 * n'offrait que trois couleurs. Or retirer une annotation fait partie du geste
 * de relecture au même titre que la poser, et son absence rendait injouables
 * trois leçons du module « Modification de texte ».
 *
 * La valeur `aucune` — et non la chaîne vide, déjà employée par le sélecteur
 * comme sentinelle « rien choisi » — est traduite en `null` par la surface.
 */
const SURLIGNAGES = [
  { valeur: "aucune", libelle: "Aucune" },
  { valeur: "#f1c40f", libelle: "Jaune" },
  { valeur: "#a9dfbf", libelle: "Vert" },
  { valeur: "#aed6f1", libelle: "Bleu" },
]

/**
 * Les six onglets rendus.
 *
 * Word en a huit ; n'afficher que ceux qui portent quelque chose éviterait à un
 * apprenant de chercher dans un onglet vide. Les autres sont rendus INERTES et
 * sans attribut d'onglet, exactement comme côté Excel : un pilote automatique
 * qui les verrait perdrait trente secondes de délai d'attente par onglet.
 */
export const ONGLETS_WORD: { id: OngletWord; libelle: string }[] = [
  { id: "fichier", libelle: "Fichier" },
  { id: "accueil", libelle: "Accueil" },
  { id: "insertion", libelle: "Insertion" },
  { id: "mise-en-page", libelle: "Mise en page" },
  { id: "revision", libelle: "Révision" },
  { id: "affichage", libelle: "Affichage" },
]

export const ONGLETS_INERTES_WORD = ["Références", "Publipostage"]

export const GROUPES_WORD: Record<OngletWord, GroupeRuban[]> = {
  accueil: [
    {
      titre: "Presse-papiers",
      boutons: [
        { id: "w-coller", texte: "Coller", large: true },
        { id: "w-copier", texte: "Copier" },
        { id: "w-couper", texte: "Couper" },
      ],
    },
    {
      titre: "Police",
      boutons: [
        { id: "w-gras", glyphe: "G", style: "gras" },
        { id: "w-italique", glyphe: "I", style: "italique" },
        { id: "w-souligne", glyphe: "S", style: "souligne" },
        { id: "w-barre", glyphe: "S", style: "barre" },
        { id: "w-police", texte: "Police", valeurs: POLICES, large: true },
        { id: "w-taille", texte: "Taille", valeurs: TAILLES },
        { id: "w-couleur", texte: "Couleur", valeurs: COULEURS },
        { id: "w-surlignage", texte: "Surlignage", valeurs: SURLIGNAGES, large: true },
      ],
    },
    {
      titre: "Paragraphe",
      boutons: [
        { id: "w-liste-puces", texte: "Puces" },
        { id: "w-liste-numerotee", texte: "Numéros" },
        { id: "w-align-gauche", texte: "Gauche" },
        { id: "w-align-centre", texte: "Centrer" },
        { id: "w-align-droite", texte: "Droite" },
        { id: "w-align-justifie", texte: "Justifier" },
      ],
    },
    {
      titre: "Styles",
      boutons: [
        { id: "w-style-normal", texte: "Normal" },
        { id: "w-style-titre", texte: "Titre" },
        { id: "w-style-soustitre", texte: "Sous-titre", large: true },
        { id: "w-style-titre1", texte: "Titre 1" },
        { id: "w-style-titre2", texte: "Titre 2" },
        { id: "w-style-titre3", texte: "Titre 3" },
      ],
    },
    {
      titre: "Annulation",
      boutons: [
        { id: "w-annuler", texte: "Annuler" },
        { id: "w-retablir", texte: "Rétablir" },
      ],
    },
  ],
  insertion: [
    {
      titre: "Tableaux",
      /*
       * ⚠️ PAS DE BOUTON LIGNE/COLONNE POUR L'INSTANT — et c'est délibéré.
       *
       * Les commandes existent (`table-insert-row-above/bellow`,
       * `table-insert-column-left/right`, `doc.table.delete-rows`) et elles ont
       * été câblées puis RETIRÉES : elles exigent un point d'insertion situé
       * DANS UNE CELLULE, que je n'ai pas su poser de façon reproductible. Sans
       * cette garantie, elles rendraient `false` en silence — un bouton qui ne
       * fait rien valide l'étape et laisse l'apprenant devant un écran inchangé,
       * exactement le défaut que `check-controles` existe pour interdire.
       */
      boutons: [{ id: "w-inserer-tableau", texte: "Tableau", large: true }],
    },
    {
      titre: "Liens",
      boutons: [
        { id: "w-inserer-lien", texte: "Lien", large: true },
        { id: "w-retirer-lien", texte: "Retirer le lien" },
      ],
    },
    {
      titre: "Illustrations",
      boutons: [
        { id: "w-inserer-image", texte: "Image", large: true },
        { id: "w-habillage-aligne", texte: "Aligné" },
        { id: "w-habillage-carre", texte: "Rapproché" },
        { id: "w-habillage-hautbas", texte: "Haut et bas" },
        { id: "w-habillage-devant", texte: "Devant" },
        { id: "w-supprimer-image", texte: "Supprimer l'image" },
      ],
    },
    {
      titre: "Lignes et colonnes",
      boutons: [
        { id: "w-ligne-dessus", texte: "Ligne au-dessus" },
        { id: "w-ligne-dessous", texte: "Ligne en dessous" },
        { id: "w-colonne-gauche", texte: "Colonne à gauche" },
        { id: "w-colonne-droite", texte: "Colonne à droite" },
        { id: "w-supprimer-ligne", texte: "Supprimer la ligne" },
        { id: "w-supprimer-colonne", texte: "Supprimer la colonne" },
      ],
    },
    {
      titre: "En-tête et pied de page",
      boutons: [{ id: "w-entete-pied", texte: "En-tête", large: true }],
    },
  ],
  "mise-en-page": [
    {
      titre: "Mise en page",
      boutons: [{ id: "w-mise-en-page", texte: "Marges", large: true }],
    },
  ],
  /*
   * Les trois onglets ci-dessous ouvrent des surfaces MAISON — le moteur n'a
   * aucune commande d'en-tête, d'impression ni de taquet. Chacune enseigne le
   * geste et son effet visuel, comme le panneau de mise en page.
   */
  fichier: [
    {
      titre: "Fichier",
      boutons: [{ id: "w-imprimer", texte: "Imprimer", large: true }],
    },
  ],
  revision: [
    {
      titre: "Vérification",
      boutons: [{ id: "w-verification", texte: "Vérifier", large: true }],
    },
  ],
  affichage: [
    {
      titre: "Afficher",
      boutons: [{ id: "w-regle", texte: "Règle", large: true }],
    },
  ],
}

/** Le libellé lisible d'un onglet, pour les messages d'un contrôle. */
export const LIBELLE_ONGLET_WORD: Record<OngletWord, string> = Object.fromEntries(
  ONGLETS_WORD.map((o) => [o.id, o.libelle]),
) as Record<OngletWord, string>

/** Bouton → onglet qui le porte. Dérivée, jamais tenue à la main. */
const ONGLET_DU_BOUTON: Record<string, OngletWord> = Object.fromEntries(
  (Object.entries(GROUPES_WORD) as [OngletWord, GroupeRuban[]][]).flatMap(([onglet, groupes]) =>
    groupes.flatMap((g) => g.boutons.map((b) => [b.id, onglet] as const)),
  ),
)

/** Tous les identifiants portés par le ruban, tous onglets confondus. */
export const CONTROLES_RUBAN_WORD: string[] = Object.keys(ONGLET_DU_BOUTON)

/**
 * L'onglet sous lequel vit un bouton — `null` s'il n'appartient pas au ruban.
 *
 * ⚠️ RENDRE `null` N'EST PAS UN ÉCHEC, et c'est le cas le plus fréquent. Les
 * panneaux maison (mise en page, en-tête, impression, règle, vérification, image,
 * lien) rendent leurs propres `data-control` par-dessus le document, hors du
 * ruban : ils sont visibles quel que soit l'onglet ouvert, et tenter une bascule
 * avant de les presser serait au mieux inutile, au pire destructeur — refermer le
 * panneau qui les porte. Le même raisonnement vaut côté PowerPoint pour le bouton
 * « Quitter » du diaporama plein écran.
 */
export function ongletDuControle(id: string): OngletWord | null {
  return ONGLET_DU_BOUTON[id] ?? null
}

/* ═══════════ AMENER LE RUBAN SUR L'ONGLET DU GESTE ═══════════ */

/**
 * Le bouton qu'un geste DÉSIGNE — qu'il le presse ou qu'il le montre seulement.
 *
 * Les deux comptent. Un plan de Word ne presse un bouton que lorsque le geste
 * est rejouable sans dommage ; ailleurs il se contente de le désigner, et cette
 * désignation a exactement le même besoin : le bouton doit être à l'écran.
 */
export function controleDuGeste(g: GesteDemo): string | null {
  if (g.presser?.id) return g.presser.id
  if (g.cible?.k !== "dom" || !g.cible.sel) return null
  const m = /^\[data-control="([^"]+)"\]$/.exec(g.cible.sel)
  return m ? m[1] : null
}

/**
 * Insérer dans une séquence les ouvertures d'onglet dont elle a besoin.
 *
 * 🔴 CE QUE CETTE FONCTION RÉPARE — mesuré au balayage exhaustif du 06/08/2026.
 *
 * Dans tout l'adaptateur de Word, la clé `onglet` n'apparaissait qu'à UN seul
 * endroit : `planMontrer`, réservé aux illustrations d'un écran de lecture dont
 * l'AUTEUR avait pensé à l'écrire. Aucun plan déduit d'une ACTION ne pouvait
 * donc ouvrir l'onglet de son bouton. 26 démonstrations sur 441 se jouaient à
 * blanc — `w-mise-en-page` (14 gestes, modules 8 à 10) et `w-inserer-tableau`
 * (12, module 12) —, compteur au bout, phase `fini`, et rien de dessiné.
 *
 * L'asymétrie qui met sur la piste : `m08-l01` fonctionnait, `m08-l02` non. Le
 * premier porte un écran d'ouverture qui déclare `onglet: "mise-en-page"`, et
 * l'onglet reste ouvert pour la suite du chapitre ; le second n'en a pas, son
 * ruban restait sur Accueil du début à la fin.
 *
 * ⚠️ L'ONGLET S'APPLIQUE À LA FIN DU GESTE QUI LE PORTE, donc il ouvre celui du
 * geste SUIVANT — c'est la convention du calque (`onOnglet` est exécuté dans la
 * phase de validation) et elle est ce qui rend la bascule invisible : l'onglet
 * bascule pendant que la bulle du geste précédent se lit. On pose donc l'onglet
 * requis sur le geste PRÉCÉDENT, et le tout premier n'ayant pas de prédécesseur,
 * il revient à l'appelant de l'ouvrir avant de démarrer (`ongletInitial`).
 *
 * ⚠️ L'ONGLET ÉCRIT PAR L'AUTEUR N'EST JAMAIS ÉCRASÉ SANS RAISON : la déduction
 * ne comble que les trous. Quand un auteur a déjà amené le ruban au bon endroit,
 * `requis` vaut l'onglet ouvert et rien n'est ajouté — c'est ce qui garantit que
 * les 64 écrans de lecture déjà équipés rendent exactement comme avant.
 *
 * @param gestes  la séquence, DÉJÀ décalée s'il s'agit d'un écran de lecture
 * @param ongletCourant  l'onglet que le ruban affiche au moment de démarrer
 */
export function ouverturesDOnglet(
  gestes: GesteDemo[],
  ongletCourant?: OngletWord,
): { gestes: GesteDemo[]; ongletInitial?: OngletWord } {
  const sortie = [...gestes]
  let ouvert = ongletCourant
  let ongletInitial: OngletWord | undefined

  for (let k = 0; k < sortie.length; k += 1) {
    const id = controleDuGeste(sortie[k])
    const requis = id ? ongletDuControle(id) : null
    if (requis && requis !== ouvert) {
      if (k === 0) ongletInitial = requis
      /*
       * ⚠️ `as never` — le noyau type `GesteDemo.onglet` sur `RibbonTab`, c'est-à-dire
       * l'échelle d'EXCEL, qui ne connaît ni « fichier » ni « affichage ». Word a ses
       * six onglets à lui. `demonstration.ts` est un fichier gelé du socle : élargir
       * son type toucherait les quatre applications pour le confort d'une seule.
       * L'adaptateur de Word contourne déjà ainsi au même endroit (`planMontrer`) —
       * c'est la convention du dépôt, pas une échappatoire inventée ici.
       */
      else sortie[k - 1] = { ...sortie[k - 1], onglet: requis as never }
      ouvert = requis
    }
    // Ce que le geste ouvre lui-même vaut pour le suivant, pas pour lui.
    const pose = sortie[k].onglet as OngletWord | undefined
    if (pose) ouvert = pose
  }

  return { gestes: sortie, ongletInitial }
}
