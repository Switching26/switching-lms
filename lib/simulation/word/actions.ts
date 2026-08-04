/**
 * Les actions de Word — union propre à cette application.
 *
 * ⚠️ RÈGLE DURE, VÉRIFIÉE PAR `check-frontieres.ts` : ce fichier n'importe RIEN.
 * Pas même un `import type`. C'est une FEUILLE de l'arbre de dépendances (D9).
 *
 * Ce n'est pas de la coquetterie : trois agents écrivent ces fichiers en
 * parallèle, et une feuille sans import ne dépend pas de l'ordre de livraison
 * des autres. C'est aussi ce qui interdit tout cycle d'import, et ce qui rend le
 * fichier lisible seul.
 *
 * PRÉFIXE OBLIGATOIRE `W_` sur chaque `type` : c'est lui qui permet au registre
 * de router l'action vers le bon adaptateur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A DÉCIDÉ DE CETTE LISTE : ce que la surface ÉMET RÉELLEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Chaque variante ci-dessous correspond à un geste mesuré dans un vrai Chrome,
 * sur le banc 8862, contre le moteur `@univerjs/preset-docs-core` 0.25.1. Aucune
 * n'est là « parce que Word sait le faire ».
 *
 * Et surtout, DEUX gestes en sont volontairement ABSENTS :
 *
 *  · **`Maj+Flèche`** — mesuré : n'émet aucune commande et ne pose aucune plage
 *    de sélection. Une leçon « étendre la sélection au clavier » doit être un
 *    écran de lecture (`READ` + `montrer`), jamais une étape d'action.
 *  · **le glisser de recopie / le presse-papiers système** (`Ctrl+C`/`Ctrl+V`) —
 *    même raison que côté Excel : la permission presse-papiers du navigateur et
 *    le focus canvas les rendent inatteignables. Le copier-coller passe par le
 *    ruban, qui est aussi le chemin d'un apprenant sur téléphone.
 *
 * C'est exactement la garde qui a évité, côté Excel, d'écrire des leçons
 * injouables : `CLICK_CELL_MODIFIER` y figurait sur une supposition non testée,
 * et Ctrl+clic n'émet rien du tout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉSIGNER UN ENDROIT DANS UN DOCUMENT — le vocabulaire des « zones »
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Un tableur a des cellules ; un document n'a que des intervalles de caractères,
 * illisibles dans un scénario (`{ debut: 417, fin: 431 }` ne se relit pas et se
 * décale à la première correction de contenu). Les scénarios Word désignent donc
 * une zone par une CHAÎNE au vocabulaire de l'auteur :
 *
 *      "p3"            le paragraphe 4 (base 0)
 *      "p3:mot2"       le 3e mot du paragraphe 4
 *      "p3:12-28"      les caractères 12 à 28 DANS le paragraphe 4
 *      "texte:Rapport" la première occurrence de « Rapport » dans le document
 *      "doc"           le document entier
 *
 * ⚠️ UNE ZONE `texte:…` DOIT VISER UN MOT UNIQUE quand l'étape demande de la
 * SÉLECTIONNER. `getPlageRect` rend un rectangle PAR LIGNE : un passage qui se
 * coupe en fin de ligne donne un halo faux et une cible invisable au doigt.
 * Et le piège ne se voit QU'EN MOBILE — sur 1440 px le passage tient, sur
 * 390 px il se coupe. Trois chapitres du module 19 étaient ainsi bloqués sans
 * qu'aucun test desktop ne le signale.
 *
 * ⚠️ Ce n'est PAS une affaire de longueur, et donc pas contrôlable par une
 * machine : « site officiel » (14 signes) se coupait, « technicien de
 * maintenance » (25 signes) passe. Tout dépend de l'endroit où le passage tombe
 * dans sa ligne. La seule cible SÛRE est un mot sans espace ; toute zone
 * multi-mots doit être rejouée en 390 × 844 avant d'être considérée livrée.
 *
 * La résolution en intervalle réel est faite par `word/document.ts`, au moment
 * du jugement : une zone reste donc valide même si l'auteur ajoute une phrase
 * plus haut. C'est la leçon des index d'étapes côté Excel — un identifiant
 * stable vaut mieux qu'une position.
 */

/** Attributs de caractère qu'une étape peut exiger. */
/**
 * Les quatre alignements de taquet de Word.
 *
 * Redéclaré à l'identique dans `observations.ts` : les deux fichiers sont des
 * feuilles qui n'importent rien, pas même l'une l'autre (D9).
 */
export type TypeTaquet = "gauche" | "centre" | "droite" | "decimal"

export type WordFormatTexte = {
  /** Gras. */
  gras?: boolean
  italique?: boolean
  souligne?: boolean
  barre?: boolean
  /** Taille en points, telle qu'elle s'affiche dans le ruban. */
  taille?: number
  /** Nom de police, comparé sans tenir compte de la casse. */
  police?: string
  /** Couleur du texte, en `#rrggbb`. */
  couleur?: string
  /** Couleur de surlignage, en `#rrggbb`. */
  surlignage?: string
}

/** Attributs de paragraphe qu'une étape peut exiger. */
export type WordFormatParagraphe = {
  /**
   * Style nommé, au vocabulaire français d'Univer — les huit sont figés :
   * `Normal`, `Titre`, `Sous-titre`, `Titre 1` … `Titre 5`.
   */
  style?: string
  alignement?: "gauche" | "centre" | "droite" | "justifie"
  /** Type de liste, ou `aucune` pour exiger l'absence de puce. */
  liste?: "puces" | "numerotee" | "controle" | "aucune"
}

export type WordAction =
  /* ═══════════ GESTES — jugés sur ce que l'apprenant FAIT ═══════════ */

  /**
   * Saisir du texte.
   *
   * `accept` est une LISTE de formulations acceptées : une réponse juste ne doit
   * jamais être refusée parce qu'elle est écrite autrement. La comparaison est
   * insensible à la casse, aux espaces de bord et aux accents, sauf `strict`.
   *
   * ⚠️ Quand le traitement de texte TRANSFORME légitimement la saisie — c'est
   * tout l'objet du module de typographie française, où `"bonjour"` devient
   * `« bonjour »` et `oui !` gagne une espace insécable — la forme RÉELLEMENT
   * STOCKÉE doit figurer dans `accept`. Sans cela, l'apprenant fait exactement
   * ce qu'on lui demande, voit le bon résultat, et l'étape le refuse. Excel a
   * payé ce défaut sur les zéros de tête d'un numéro de téléphone.
   */
  | {
      type: "W_TYPE_TEXT"
      /** Où la saisie est attendue. Absent : n'importe où dans le document. */
      zone?: string
      accept: string[]
      /** Exiger l'orthographe exacte, accents et casse compris. */
      strict?: boolean
    }

  /**
   * Sélectionner une plage de texte à la souris, au double-clic ou au
   * triple-clic. Mesuré observable : `doc.operation.set-selections` remonte les
   * offsets exacts.
   */
  | {
      type: "W_SELECT_TEXT"
      zone: string
      /**
       * Tolérance en caractères aux deux bords. Sélectionner « exactement » un
       * mot à la souris est difficile ; le défaut (2) laisse passer un débord
       * d'une espace sans laisser passer un mot voisin.
       */
      tolerance?: number
    }

  /**
   * Cliquer un bouton du ruban. `controle` est un `data-control` de
   * `WordChrome`, et `check-controles.ts` refuse un identifiant qui n'y est pas
   * rendu — un bouton absent bloque l'apprenant sans message.
   */
  | { type: "W_CLICK_CONTROL"; controle: string }

  /**
   * Un raccourci clavier.
   *
   * Aucun n'est câblé nativement (mesuré : `Ctrl+A`, `Ctrl+B`, `Ctrl+I`,
   * `Ctrl+U` n'émettent rien). `WordSurface` les intercepte et réémet la
   * commande correspondante — quinze lignes, prouvées au spike puis ici.
   * N'employer que des raccourcis déclarés dans `RACCOURCIS_CABLES`.
   */
  | { type: "W_KEY"; touches: string[] }

  /* ═══════════ ÉTAT — jugé sur le DOCUMENT, chemin libre ═══════════ */

  /**
   * Le contenu attendu du document : l'`EXPECT_STATE` de Word.
   *
   * `getSnapshot()` est vivant et fidèle (mesuré) : chaque paragraphe, chaque
   * intervalle de caractères et tous ses attributs y sont. Cette variante ne
   * juge que le TEXTE ; la mise en forme a ses propres variantes, pour que le
   * message d'erreur puisse dire ce qui manque.
   *
   * Le chemin est libre — c'est le sens même d'un jugement sur l'état, et c'est
   * ce que réclament les exercices où seul le résultat compte.
   */
  | {
      type: "W_EXPECT_DOC"
      /** Paragraphe attendu, par index. Chaque valeur est une liste de formes acceptées. */
      paragraphes: Record<string, string[]>
      /** Exiger que le document n'ait pas d'autre paragraphe non vide. */
      exact?: boolean
    }

  /** La zone visée porte-t-elle ce format de caractère ? */
  | { type: "W_EXPECT_FORMAT"; zone: string; format: WordFormatTexte }

  /** Le paragraphe visé porte-t-il ce style, cet alignement, cette liste ? */
  | { type: "W_EXPECT_STYLE"; zone: string; style: WordFormatParagraphe }

  /**
   * Un tableau de N lignes sur M colonnes existe dans le document.
   *
   * Mesuré de bout en bout : la modale « Insérer un tableau » est native et déjà
   * en français, le tableau se peint sur la page, et la saisie dans une cellule
   * est observable au caractère près. Là où le simulateur Excel a dû
   * reconstruire 56 boîtes de dialogue à la main.
   */
  | { type: "W_EXPECT_TABLE"; lignes: number; colonnes: number }

  /**
   * La mise en page attendue — marges, orientation, format.
   *
   * ⚠️ Ces réglages existent dans le modèle d'Univer mais AUCUNE commande ne les
   * pilote, et muter le modèle directement ne repeint pas (mesuré au spike).
   * Ils passent donc par NOTRE panneau, comme `pagesetup.ts` côté Excel : le
   * geste et l'effet visuel sont enseignés, le moteur ne bouge pas. C'est un
   * chantier à part entière — hors périmètre de ce lot, la variante est
   * déclarée pour que le format de scénario n'ait pas à changer ensuite.
   */
  | {
      type: "W_EXPECT_PAGE"
      page: {
        orientation?: "portrait" | "paysage"
        margeHaut?: number
        margeBas?: number
        margeGauche?: number
        margeDroite?: number
        /** Le numéro de page est-il posé ? */
        numeroPage?: boolean
      }
    }

  /**
   * Le document porte-t-il un lien vers cette adresse ?
   *
   * ⚠️ Un lien n'est PAS un attribut de caractère : c'est une plage
   * personnalisée de type `HYPERLINK` posée sur le corps. Il s'applique à la
   * SÉLECTION courante — une étape doit donc faire sélectionner le texte avant.
   */
  | {
      type: "W_EXPECT_LIEN"
      /** Adresse attendue. Comparée sans tenir compte de la casse. */
      url: string
      /** Exiger que le lien ait été RETIRÉ. */
      absent?: boolean
    }

  /**
   * Le document porte-t-il cette image, avec cet habillage ?
   *
   * ⚠️ Le chemin normal d'Univer était inatteignable : les deux commandes
   * d'insertion ouvrent un SÉLECTEUR DE FICHIER NATIF puis passent par un
   * service d'UPLOAD. La commande sous-jacente, elle, accepte un descripteur
   * complet — la surface le construit depuis un data URI, sans réseau.
   *
   * `habillage` : `aligne` (dans le fil du texte), `carre` (le texte contourne),
   * `hautbas` (le texte passe au-dessus et en dessous), `devant`.
   */
  | {
      type: "W_EXPECT_IMAGE"
      /** Identifiant de l'image attendue, tel que la galerie le pose. */
      image: string
      habillage?: "aligne" | "carre" | "hautbas" | "devant"
      /** Exiger que l'image ait été RETIRÉE du document. */
      absente?: boolean
    }

  /**
   * Une zone HORS FLUX porte-t-elle ce texte ? En-tête, pied de page, filigrane.
   *
   * ⚠️ Pourquoi ce n'est pas un `W_EXPECT_DOC` sur un paragraphe : un en-tête
   * n'est pas dans le corps du document. Il se répète sur chaque page et a son
   * propre point d'insertion — c'est une SECONDE surface d'édition, qu'un
   * document Univer unique ne porte pas. Mesuré : aucune commande
   * `doc.command.*` ne les concerne, le modèle n'a pas de `headerFooter`
   * atteignable depuis la façade.
   *
   * Elles passent donc par notre panneau, comme les marges. Le geste enseigné
   * est le bon — ouvrir la zone, saisir, refermer — et le rendu se voit sur la
   * page. Ce que l'apprenant ne voit pas, c'est la répétition sur une seconde
   * page, puisque l'aperçu n'en montre qu'une.
   */
  | {
      type: "W_EXPECT_ENTETE"
      emplacement: "entete" | "pied" | "filigrane"
      /** Formes acceptées. Aucune ne doit être le préfixe d'une autre. */
      accept: string[]
    }

  /**
   * Les réglages d'impression choisis dans l'écran d'aperçu.
   *
   * Rien ne s'imprime, évidemment — et c'est le même partage qu'Excel : on
   * enseigne OÙ se règle une plage d'impression et ce que le réglage change à
   * l'aperçu, pas à piloter une imprimante.
   */
  | {
      type: "W_EXPECT_PRINT"
      impression: {
        copies?: number
        plage?: "tout" | "courante" | "selection"
        rectoVerso?: boolean
      }
    }

  /**
   * Le paragraphe visé porte-t-il ces taquets de tabulation ?
   *
   * ⚠️ Le moteur ne connaît AUCUN taquet : ni le modèle de paragraphe, ni les
   * 78 commandes relevées. Ils vivent sur NOTRE règle horizontale, qui les rend
   * au juge. Les positions sont en centimètres depuis la marge de gauche, et
   * comparées à 0,05 cm près — une pose à la souris ne tombe jamais au pixel.
   */
  | {
      type: "W_EXPECT_TABS"
      zone: string
      taquets: { position: number; type: TypeTaquet }[]
    }
