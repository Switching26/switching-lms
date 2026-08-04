/**
 * Ce que la surface de Word ÉMET réellement quand l'apprenant agit.
 *
 * ⚠️ Mêmes règles que `actions.ts` : ce fichier n'importe RIEN, pas même un
 * `import type`. C'est une feuille (D9).
 *
 * PRÉFIXE OBLIGATOIRE `w:` sur chaque `kind`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAQUE `kind` CI-DESSOUS A ÉTÉ VU DANS UN NAVIGATEUR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Le registre d'événements d'Univer Docs est pauvre — neuf événements, tous
 * génériques, aucun `TextChanged` ni `SelectionChanged`. Mais `onCommandExecuted`
 * observe TOUT, et finement : 78 commandes `doc.command.*` distinctes. C'est le
 * canal d'observation de la surface, et chaque `kind` ci-dessous en dérive.
 *
 * Correspondance mesurée, geste par geste :
 *
 *   saisie de texte             `doc.command.insert-text`          → `w:textChange`
 *   Entrée / nouveau paragraphe `doc.command.break-line`           → `w:textChange`
 *   sélection à la souris       `doc.operation.set-selections`     → `w:selection`
 *   double-clic (un mot)        idem, plage non vide               → `w:selection`
 *   triple-clic (paragraphe)    idem                               → `w:selection`
 *   déplacement du curseur      `doc.operation.move-cursor`        → `w:cursor`
 *   bouton du ruban             sa commande nommée, distincte      → `w:control`
 *
 * `w:docState` n'a pas d'équivalent direct : la surface le calcule depuis
 * `getSnapshot()` — vivant et fidèle, mesuré — après une temporisation, comme
 * `stateChange` côté Excel. Un état lu trop tôt renvoie des valeurs périmées et
 * fait échouer PAR INTERMITTENCE des étapes justes, le pire type de défaut.
 */

/** Un intervalle de caractères dans le flux du document. */
export type WordPlage = { debut: number; fin: number }

/**
 * Les quatre alignements de taquet de Word.
 *
 * Le type est REDÉCLARÉ à l'identique dans `actions.ts` : ces deux fichiers sont
 * des feuilles qui n'importent rien, pas même l'une l'autre (D9). La duplication
 * est le prix de la règle, et `check-frontieres` la préfère à un import croisé.
 */
export type TypeTaquet = "gauche" | "centre" | "droite" | "decimal"

/** Attributs de caractère relevés sur une plage, tels que le modèle les porte. */
export type WordRunObserve = {
  gras?: boolean
  italique?: boolean
  souligne?: boolean
  barre?: boolean
  taille?: number
  police?: string
  couleur?: string
  surlignage?: string
}

/** Ce qu'un paragraphe porte, tel que le modèle le rend. */
export type WordParagrapheObserve = {
  texte: string
  /** Style nommé français (`Normal`, `Titre 1`, …). */
  style: string
  alignement: "gauche" | "centre" | "droite" | "justifie"
  liste: "puces" | "numerotee" | "controle" | "aucune"
}

export type WordObservation =
  /** Le texte du document a changé — saisie, Entrée, suppression, collage. */
  | {
      kind: "w:textChange"
      /** Ce qui vient d'être saisi, quand la commande le porte. */
      saisi?: string
      /** Le paragraphe touché, après changement. */
      paragraphe?: string
      /** Index du paragraphe touché. */
      indexParagraphe?: number
    }

  /** L'apprenant a sélectionné du texte. Plage vide = simple curseur. */
  | {
      kind: "w:selection"
      plage: WordPlage
      /** Le texte réellement couvert, pour que le jugement lise du sens. */
      texte: string
      /**
       * La structure du document au moment de la sélection.
       *
       * ⚠️ SANS ELLE, LE JUGE NE PEUT PAS FAIRE SON TRAVAIL. Une étape désigne
       * un passage par une zone lisible (`p1:mot3`), jamais par un numéro de
       * caractère ; résoudre cette zone demande de connaître les paragraphes.
       * Or le juge est PUR et tourne aussi côté serveur : il n'a pas accès au
       * document. C'est donc la surface — la seule qui l'ait — qui joint la
       * structure à son observation, et le juge qui résout la zone. La
       * sémantique des zones reste ainsi à UN seul endroit (`document.ts`),
       * client et serveur compris.
       */
      paragraphes?: WordParagrapheObserve[]
    }

  /** Le curseur s'est déplacé sans rien sélectionner. */
  | { kind: "w:cursor"; position: number }

  /**
   * Un bouton du ruban a été pressé.
   *
   * ⚠️ Un bouton qui EXÉCUTE une commande observée par ailleurs ne doit PAS
   * émettre `w:control` : l'observation du geste arriverait avant celle de
   * l'état et ferait échouer l'étape. Côté Excel, c'est ce qui cassait les
   * étapes de tri. `w:control` n'est émis que si le bouton n'a rien pu faire —
   * l'apprenant garde ainsi un message utile.
   */
  | { kind: "w:control"; controle: string }

  /** Un raccourci clavier câblé a été interprété. */
  | { kind: "w:key"; touches: string[] }

  /**
   * L'état du document, relevé après stabilisation.
   *
   * C'est ce que lisent toutes les étapes jugées sur l'état — texte, format,
   * style, tableau. Le relevé est fait par la surface, jamais par le juge : le
   * juge doit rester pur pour tourner aussi côté serveur, sur la route de
   * correction des évaluations notées.
   */
  | {
      kind: "w:docState"
      paragraphes: WordParagrapheObserve[]
      /** Format relevé sur chaque plage que l'étape courante veut juger. */
      formats?: Record<string, WordRunObserve>
      /** Liens hypertexte posés : leur adresse et le texte qu'ils couvrent. */
      liens?: { id: string; url: string; texte: string }[]
      /** Images posées : identifiant et habillage, dans l'ordre du document. */
      images?: { id: string; habillage: string }[]
      /** Tableaux présents : leurs dimensions, dans l'ordre du document. */
      tableaux?: { lignes: number; colonnes: number }[]
      /** Mise en page courante, servie par notre propre panneau. */
      page?: {
        orientation?: "portrait" | "paysage"
        margeHaut?: number
        margeBas?: number
        margeGauche?: number
        margeDroite?: number
        /** Le numéro de page est-il posé ? (module « En-tête et pied de page ») */
        numeroPage?: boolean
      }
      /**
       * Les zones hors flux du document : en-tête, pied de page, filigrane.
       *
       * Elles ne vivent PAS dans le corps Univer — un en-tête se répète sur
       * chaque page et a son propre point d'insertion, ce que la surface d'un
       * document unique ne porte pas. Elles sont donc servies par notre panneau,
       * comme la mise en page, et le juge les lit ici.
       */
      horsFlux?: {
        entete?: string
        pied?: string
        filigrane?: string
      }
      /** Les réglages d'impression courants, servis par notre écran d'aperçu. */
      impression?: {
        copies?: number
        plage?: "tout" | "courante" | "selection"
        rectoVerso?: boolean
      }
      /**
       * Les taquets de tabulation, par index de paragraphe.
       *
       * Le moteur n'expose aucun taquet : ni le modèle ni les commandes ne les
       * connaissent. Ils sont posés sur NOTRE règle, et c'est elle qui les rend
       * au juge — même partage que la mise en page.
       */
      taquets?: Record<string, { position: number; type: TypeTaquet }[]>
    }
