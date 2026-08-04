/**
 * Les actions de Outlook — union propre à cette application.
 *
 * ⚠️ RÈGLE DURE, VÉRIFIÉE PAR `check-frontieres.ts` : ce fichier n'importe RIEN.
 * Pas même un `import type`. C'est une FEUILLE de l'arbre de dépendances.
 *
 * C'est ce qui explique la forme de ce fichier : tout ce qu'une action ATTEND
 * est déclaré ici, y compris les types de description (`MessageAttendu`,
 * `CorpsAttendu`…). Ils décrivent une exigence, pas un état — l'état, lui, vit
 * dans `observations.ts`, puisque c'est ce que la surface émet.
 *
 * ═══ NEUF PRIMITIVES, ET C'EST VOULU ═══
 *
 * Outlook n'a ni moteur de calcul ni rendu documentaire : toute la richesse
 * pédagogique vient de la FINESSE de ce qu'on vérifie, pas du nombre de gestes.
 * `O_CLICK_CONTROL` couvre à lui seul l'essentiel du ruban — c'est ce qui
 * maintient le compte à neuf plutôt qu'à trente.
 *
 * Quatre se jugent sur le GESTE : on enseigne le chemin (mode leçon).
 * Cinq se jugent sur l'ÉTAT : on juge le résultat, chemin libre (exercice et
 * évaluation). C'est la bascule qu'`EXPECT_STATE` a débloquée côté Excel, et
 * sans laquelle « réponds à ce client en mettant ton collègue en copie » ne
 * serait pas enseignable.
 *
 * ÉTAT DE VÉRIFICATION : chacune de ces primitives a été ÉMISE par la surface et
 * jugée dans un vrai navigateur pendant le spike du 04/08/2026. Une primitive
 * qu'on déclare sans l'émettre rend l'étape injouable, et cela ne se voit pas en
 * relisant le code — c'est ce qui a fait retirer `CLICK_CELL_MODIFIER` d'Excel.
 */

export type OutlookAction =
  /* ── Jugées sur le GESTE ── */

  /**
   * Ouvrir un message de la liste.
   *
   * L'ouvrir le marque lu : c'est un vrai changement d'état, pas un effet
   * d'affichage — et « lire un message » est la première primitive que la
   * formation enseigne.
   */
  | { type: "O_SELECT_MESSAGE"; id: string }

  /** Basculer sur un dossier du volet de gauche. */
  | { type: "O_SELECT_FOLDER"; dossier: string }

  /**
   * Clic sur un bouton du ruban, d'une boîte de dialogue ou de la barre basse
   * mobile. Les identifiants suivent la convention `cr-*` (voir `document.ts`).
   */
  | { type: "O_CLICK_CONTROL"; control: string }

  /**
   * Saisie dans un champ nommé.
   *
   * `contient: true` accepte une correspondance partielle — indispensable pour
   * un objet que l'apprenant rédige librement.
   */
  | {
      type: "O_TYPE_TEXT"
      champ: ChampRedaction | "recherche"
      accept: string[]
      contient?: boolean
    }

  /* ── Jugées sur l'ÉTAT ── */

  /**
   * LA primitive d'Outlook : l'état d'un message COMPOSÉ.
   *
   * Équivalent d'`EXPECT_STATE`. C'est elle qui rend enseignable « réponds à ce
   * client en mettant ton collègue en copie cachée et en joignant le devis » —
   * un énoncé dont AUCUNE des cinq exigences ne se vérifie par « le bon bouton a
   * été cliqué ». Le bon bouton, c'est « Répondre », et il ne dit rien du Cci,
   * ni de la pièce jointe, ni du contenu.
   */
  | { type: "O_EXPECT_MAIL"; message: MessageAttendu }

  /** Rangement, lu/non lu, indicateurs, catégories, résultat d'une recherche. */
  | { type: "O_EXPECT_BOITE"; boite: BoiteAttendue }

  /** Rendez-vous, réunion, invitation acceptée ou refusée. */
  | { type: "O_EXPECT_CALENDRIER"; calendrier: CalendrierAttendu }

  /** Règle de gestion du courrier. */
  | { type: "O_EXPECT_REGLE"; regle: RegleAttendue }

  /** Réponse automatique d'absence. */
  | { type: "O_EXPECT_REPONSE_AUTO"; reponseAuto: ReponseAutoAttendue }

/* ═══════════ VOCABULAIRE PARTAGÉ ═══════════
 *
 * Ces alias sont REDÉCLARÉS à l'identique dans `observations.ts`, qui ne peut
 * pas les importer (règle des feuilles). La divergence n'est pas laissée à la
 * vigilance : `document.ts`, qui a le droit d'importer les deux, pose une
 * vérification de compatibilité à la compilation. Si l'un des deux fichiers
 * bouge sans l'autre, le typecheck casse.
 */

export type ChampRedaction = "a" | "cc" | "cci" | "objet" | "corps"
export type GenreRedaction = "nouveau" | "reponse" | "reponseATous" | "transfert"
export type ChampRegle = "expediteur" | "destinataire" | "objet" | "corps" | "piecejointe"
export type ActionRegle = "deplacer" | "supprimer" | "categoriser" | "indicateur" | "transferer"

/* ═══════════ CE QU'ON ATTEND D'UN MESSAGE COMPOSÉ ═══════════ */

export type MessageAttendu = {
  /**
   * `redaction` : la fenêtre en cours d'écriture — on corrige AVANT l'envoi, ce
   * qui est le bon moment pédagogique : l'apprenant peut encore rattraper son
   * geste.
   * `envoye` : le dernier message parti, pour juger l'envoi lui-même.
   */
  cible?: "redaction" | "envoye"
  /** Impose la nature : une réponse n'est pas un nouveau message. */
  genre?: GenreRedaction
  a?: ChampAdressesAttendu
  cc?: ChampAdressesAttendu
  cci?: ChampAdressesAttendu
  objet?: TexteAttendu
  corps?: CorpsAttendu
  pieces?: PiecesAttendues
  importance?: "haute" | "normale" | "basse"
}

/**
 * Un champ de destinataires.
 *
 * `mode: "exact"` est le DÉFAUT, et ce n'est pas de la rigueur gratuite : tout
 * l'intérêt de « mets ton collègue en copie cachée » est qu'il ne soit PAS
 * ailleurs. Avec un mode permissif, un apprenant qui met le collègue en `Cc` ET
 * en `Cci` serait accepté — alors qu'il vient d'exposer l'adresse interne au
 * client, c'est-à-dire de commettre exactement la faute que la leçon corrige.
 *
 * `absent` permet en plus de NOMMER la faute au lieu de la constater, ce qui
 * change complètement le message rendu à l'apprenant.
 */
export type ChampAdressesAttendu = {
  contient?: string[]
  /** `"exact"` (défaut) : rien d'autre. `"aumoins"` : au moins celles-ci. */
  mode?: "exact" | "aumoins"
  /** Adresses qui ne doivent surtout PAS y figurer. */
  absent?: string[]
  /** Le champ doit rester vide. */
  vide?: boolean
}

export type TexteAttendu = {
  /** Écritures acceptées, comparaison tolérante (casse, accents, espaces). */
  accept?: string[]
  /** Fragments exigés — pour un objet que l'apprenant rédige librement. */
  contient?: string[]
  /** Préfixe imposé : une réponse porte « RE : », un transfert « TR : ». */
  prefixe?: "RE" | "TR"
  nonVide?: boolean
}

/**
 * Le corps — le point le plus délicat du modèle, et celui qu'il faut cadrer
 * honnêtement.
 *
 * ON NE COMPARE JAMAIS À UNE PROSE MODÈLE. Exiger un texte exact n'apprend rien
 * et refuserait toutes les bonnes réponses. On vérifie des NOTIONS : chacune
 * liste ses formulations acceptées et porte un libellé humain, de sorte que le
 * retour dise « le message ne dit pas encore : le délai de livraison » et non
 * « mot-clé absent ». C'est le principe de générosité d'`accept` appliqué à la
 * prose.
 *
 * ⚠️ LIMITE ASSUMÉE, à ne pas maquiller : ce contrôle constate la PRÉSENCE d'une
 * information. Il ne juge ni le ton, ni la syntaxe, ni la pertinence. C'est
 * précisément pourquoi la décision D7 du chantier sort le corps du barème en
 * évaluation NOTÉE : le mettre au barème exposerait à une note contestable sur
 * une rédaction correcte formulée autrement — indéfendable en contrôle Qualiopi.
 * En leçon et en exercice, où le retour immédiat a toute sa valeur, il reste
 * vérifié.
 */
export type CorpsAttendu = {
  notions?: NotionAttendue[]
  interdit?: NotionAttendue[]
  /** Formule d'appel acceptée. */
  salutation?: string[]
  /** Formule de politesse acceptée. */
  cloture?: string[]
  /**
   * Plancher de mots. DERNIER contrôle exécuté, et volontairement bas.
   *
   * Vérifié en premier — état initial du spike — il masquait tous les retours
   * utiles : un apprenant ayant oublié le délai lisait « message trop court » et
   * rallongeait sa prose au lieu d'ajouter l'information. Pire, à 20 mots il
   * refusait une réponse professionnelle courte et parfaitement juste. Un cours
   * de rédaction professionnelle récompense la concision, il ne la punit pas.
   */
  minMots?: number
  /**
   * Sort le corps du barème automatique : un correcteur humain tranchera.
   * Reprend la convention déjà en place côté évaluations du LMS
   * (`AssessmentQuestionType.TEXTE` → `needsManualReview`). Ne pas réinventer un
   * second chemin.
   */
  revueManuelle?: boolean
}

export type NotionAttendue = {
  /** Ce que l'apprenant lira s'il manque : « la date de livraison ». */
  libelle: string
  /** Toutes les formulations qui valent cette notion. Être GÉNÉREUX ici. */
  oneOf: string[]
}

export type PiecesAttendues = {
  contient?: string[]
  absent?: string[]
  mode?: "exact" | "aumoins"
  /** Le message ne doit porter AUCUNE pièce jointe. */
  aucune?: boolean
}

/* ═══════════ LES AUTRES ÉTATS ATTENDUS ═══════════ */

export type BoiteAttendue = {
  messages?: Record<
    string,
    {
      dossier?: string
      lu?: boolean
      indicateur?: boolean
      categories?: string[]
    }
  >
  dossierActif?: string
  /** Dossiers que l'apprenant devait créer, par leur nom affiché. */
  dossierExiste?: string[]
  /** Identifiants exactement visibles après filtre ou recherche. */
  visibles?: string[]
}

export type CalendrierAttendu = {
  titre?: string
  /** ISO court, « 2026-03-05 ». */
  date?: string
  debut?: string
  fin?: string
  lieu?: string
  /** `true` : des participants ont été invités, c'est devenu une réunion. */
  reunion?: boolean
  participants?: ChampAdressesAttendu
}

export type RegleAttendue = {
  condition?: { champ?: ChampRegle; valeur?: string }
  action?: { type?: ActionRegle; dossier?: string; categorie?: string }
}

export type ReponseAutoAttendue = {
  active?: boolean
  du?: string
  au?: string
  /** Le texte se juge exactement comme un corps de message. */
  message?: CorpsAttendu
}
