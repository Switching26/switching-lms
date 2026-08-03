/**
 * Ordonnancement des verdicts quand la correction est DISTANTE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME QUE CE MODULE EXISTE POUR RÉSOUDRE
 *
 * En leçon et en exercice, l'atelier corrige lui-même : `validateStep` est pur
 * et rend son verdict dans la foulée du geste. Rien ne peut s'intercaler.
 *
 * En ÉVALUATION notée, le scénario servi ne porte plus les réponses et le
 * verdict vient du serveur. Un aller-retour dure quelques dizaines de
 * millisecondes, et un seul geste d'apprenant produit souvent DEUX
 * observations : la frappe (`typed`), puis le changement d'état du classeur
 * (`stateChange`) ~350 ms plus tard. Trois accidents deviennent alors possibles,
 * qui n'existaient pas en correction locale :
 *
 *  1. **verdict périmé** — la réponse d'une observation arrive après que
 *     l'étape a déjà été franchie, et vient compter une faute sur l'étape
 *     SUIVANTE ;
 *  2. **inversion** — deux observations partent coup sur coup, la seconde
 *     réponse revient avant la première, et l'atelier applique le jugement du
 *     geste le plus ancien en dernier ;
 *  3. **double comptage** — une observation juste franchit l'étape pendant
 *     qu'une observation fausse est encore en vol ; celle-ci revient et retire
 *     le point « premier essai » d'une étape pourtant réussie.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 *
 * Un BILLET est pris au moment où l'observation est émise, pas quand la réponse
 * revient. Les verdicts sont ensuite appliqués DANS L'ORDRE DES BILLETS, et
 * trois portes les filtrent : l'étape a-t-elle changé, est-elle déjà résolue,
 * un verdict plus récent a-t-il déjà été appliqué. Une porte fermée ne fait pas
 * échouer l'étape : elle jette le verdict en silence, ce qui est le seul
 * comportement honnête — l'apprenant n'a pas à payer une course entre deux
 * requêtes.
 *
 * Le module est PUR et sans dépendance : c'est ce qui le rend vérifiable hors
 * navigateur (`scripts/simulation/check-verdicts.ts`).
 */

export type Billet = { seq: number; stepId: string }

export type MotifRejet =
  /** L'atelier a changé d'étape pendant l'aller-retour. */
  | "etape-changee"
  /** L'étape a déjà été franchie par une autre observation. */
  | "deja-resolue"
  /** Un verdict plus récent a déjà été appliqué pour cette étape. */
  | "verdict-perime"
  /** Le juge n'a pas répondu (réseau, serveur) : on ne compte rien. */
  | "sans-verdict"

export type ResultatVerdict<J> =
  | { applique: true; jugement: J }
  | { applique: false; motif: MotifRejet }

export type FileDeVerdicts<J> = {
  /** À appeler AU MOMENT DE L'ÉMISSION de l'observation. */
  prendre(stepId: string): Billet
  /**
   * Enfile l'application d'un verdict déjà demandé. `promesse` est en vol :
   * l'attente ne coûte rien, elle ne fait qu'imposer l'ordre.
   */
  enfiler(
    billet: Billet,
    promesse: Promise<J | null>,
    appliquer: (jugement: J) => void,
  ): Promise<ResultatVerdict<J>>
  /** Pour les contrôles : combien de verdicts ont été réellement appliqués. */
  appliques(): number
}

export function creerFileDeVerdicts<J>(portes: {
  /** Identifiant de l'étape actuellement à l'écran, ou null. */
  etapeCourante: () => string | null
  /** L'étape courante est-elle déjà franchie ? */
  estResolue: () => boolean
}): FileDeVerdicts<J> {
  let compteur = 0
  let dernierApplique = 0
  let nbAppliques = 0
  // La chaîne sérialise les APPLICATIONS, pas les requêtes : celles-ci partent
  // toutes en parallèle, seule leur prise en compte est mise en file.
  let chaine: Promise<unknown> = Promise.resolve()

  return {
    prendre(stepId: string): Billet {
      return { seq: ++compteur, stepId }
    },

    enfiler(billet, promesse, appliquer) {
      const traiter = async (): Promise<ResultatVerdict<J>> => {
        // Portes AVANT l'attente : inutile de garder la file bloquée sur un
        // verdict dont on sait déjà qu'il ne servira pas.
        if (billet.seq <= dernierApplique) return { applique: false, motif: "verdict-perime" }
        if (portes.estResolue()) return { applique: false, motif: "deja-resolue" }
        if (portes.etapeCourante() !== billet.stepId) return { applique: false, motif: "etape-changee" }

        const jugement = await promesse.catch(() => null)
        if (jugement == null) return { applique: false, motif: "sans-verdict" }

        // Mêmes portes APRÈS l'attente : le temps a passé, et c'est précisément
        // pendant ce temps-là que l'étape a pu être franchie par un autre geste.
        if (billet.seq <= dernierApplique) return { applique: false, motif: "verdict-perime" }
        if (portes.estResolue()) return { applique: false, motif: "deja-resolue" }
        if (portes.etapeCourante() !== billet.stepId) return { applique: false, motif: "etape-changee" }

        dernierApplique = billet.seq
        nbAppliques++
        appliquer(jugement)
        return { applique: true, jugement }
      }

      // Le maillon suivant ne dépend jamais de l'échec du précédent : une
      // requête tombée ne doit pas figer la file pour le reste de l'évaluation.
      const suite = chaine.then(traiter, traiter)
      chaine = suite.catch(() => undefined)
      return suite
    },

    appliques() {
      return nbAppliques
    },
  }
}


/**
 * VERROU D'ENVOI UNIQUE, pour les gestes qui font AVANCER l'atelier.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL FERME
 *
 * « Passer la question » et « Commencer » déclenchent une requête, puis avancent
 * l'atelier au retour. Sans verrou, un double tap — fréquent au doigt — lançait
 * DEUX requêtes sur la même étape, et leurs deux retours faisaient avancer :
 * l'atelier sautait une étape que le serveur n'avait jamais vue passer, son
 * curseur restait en arrière, et tout ce qui suivait était refusé pour rupture
 * d'ordre. L'apprenant perdait le passage entier.
 *
 * Le verrou est posé AVANT la requête et levé à son terme, quel qu'il soit —
 * succès, échec, réseau tombé. Une référence, pas un état de rendu : il doit
 * valoir dès le même tour que le clic.
 *
 * Fonction pure, pour être vérifiable hors navigateur.
 */
export function creerVerrouEnvoi() {
  let enCours = false
  return {
    /** Vrai si l'appel a pris le verrou ; faux s'il était déjà pris. */
    prendre(): boolean {
      if (enCours) return false
      enCours = true
      return true
    },
    liberer(): void {
      enCours = false
    },
    occupe(): boolean {
      return enCours
    },
    /**
     * Enveloppe un envoi : au plus un en vol, le verrou levé quoi qu'il arrive.
     * Renvoie `null` quand l'envoi a été refusé faute de verrou.
     */
    async envoyer<T>(action: () => Promise<T>): Promise<T | null> {
      if (!this.prendre()) return null
      try {
        return await action()
      } finally {
        this.liberer()
      }
    },
  }
}


/**
 * FILE D'ENVELOPPES SCELLÉES, VIDÉE DANS UN ORDRE STRICT.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LES DÉFAUTS QU'ELLE FERME
 *
 * `persist` part sans être attendu à chaque étape franchie. Trois accidents s'y
 * sont succédé, chacun né de la correction du précédent :
 *
 *  1. les deltas remis à zéro avant l'envoi étaient perdus par une requête
 *     tombée ;
 *  2. les remettre dans la file les sauvait, mais les comptait deux fois quand
 *     le serveur avait commité et que seule la réponse s'était perdue — d'où la
 *     clé d'idempotence ;
 *  3. la clé ne scellait que les DELTAS : deux envois concurrents pouvaient la
 *     partager en portant un `currentStep`, voire un `finish`, différents.
 *
 * D'où la règle : **une clé ne désigne jamais deux corps**, le corps entier est
 * figé au dépôt, et un seul envoi est en vol à la fois.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * L'ORDRE EST STRICT, ET C'EST ESSENTIEL
 *
 * Une première version continuait la vidange après un échec : elle gardait E1
 * en souffrance mais postait quand même E2. L'ordre n'était donc pas tenu, et
 * les conséquences étaient réelles — E1 rejouée APRÈS E2 pouvait faire reculer
 * `currentStep` et `lastPosition`, compter une session hors de son tour, ou
 * rouvrir une tentative déjà close.
 *
 * Au premier envoi non réglé, on s'arrête NET : cette enveloppe et toutes les
 * suivantes restent en file, dans l'ordre, et repartent telles quelles au tour
 * d'après. Rien ne double le pas de celle qui la précède.
 */
export type Enveloppe<C> = { cle: string; corps: C }

export type ResultatEnvoi<R> = {
  /** L'enveloppe est-elle réglée ? Un doublon reconnu par le serveur l'est. */
  reglee: boolean
  corps: R | null
}

export function creerFileEnvois<C, R>(poster: (e: Enveloppe<C>) => Promise<ResultatEnvoi<R>>) {
  const file: Array<Enveloppe<C>> = []
  // Sérialise les vidanges : jamais deux envois en vol.
  let chaine: Promise<unknown> = Promise.resolve()

  return {
    /** Combien d'enveloppes attendent encore d'être acquittées. */
    enAttente: (): number => file.length,

    /**
     * Dépose une enveloppe scellée et vide la file. Rend la réponse de CETTE
     * enveloppe, ou `null` si elle n'a pas pu être remise.
     */
    deposer(enveloppe: Enveloppe<C>): Promise<R | null> {
      const suite = chaine.then(async (): Promise<R | null> => {
        file.push(enveloppe)
        let resultat: R | null = null
        while (file.length) {
          const tete = file[0]
          const r = await poster(tete).catch(() => ({ reglee: false, corps: null }))
          // ORDRE STRICT : tant que la tête n'est pas acquittée, rien ne part.
          if (!r.reglee) break
          file.shift()
          if (tete === enveloppe) resultat = r.corps
        }
        return resultat
      })
      // La chaîne ne se rompt jamais : un envoi tombé ne condamne pas les suivants.
      chaine = suite.catch(() => undefined)
      return suite
    },
  }
}
