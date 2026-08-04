/**
 * Typographie française — la couche maison que le moteur n'apporte pas.
 *
 * MESURÉ, dans un vrai navigateur : saisi
 * `Il a dit "bonjour" puis : oui ! et non ? enfin ; fin`, le modèle d'Univer
 * contient la chaîne **à l'identique**. Ni guillemets « », ni espaces
 * insécables, ni correction automatique. C'est la même famille de problème que
 * les nombres et les dates côté Excel, en plus simple : il n'y a ni
 * bibliothèque tierce à reconfigurer ni interne à contourner, seulement du
 * texte à transformer à la saisie.
 *
 * Et c'est PÉDAGOGIQUEMENT STRUCTURANT : un cours Word français enseigne
 * l'espace insécable et les guillemets typographiques. Sans cette couche, on ne
 * peut pas les enseigner du tout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE PUR, SANS AUCUNE DÉPENDANCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Exactement le choix de `formula-fr.ts` et `date-fr.ts` : la logique délicate
 * vit hors du navigateur, où elle se vérifie en quelques millisecondes par
 * `scripts/simulation/word/check-typo-fr.ts`. Une erreur de transformation
 * produirait un texte faux SILENCIEUSEMENT — l'apprenant verrait un résultat
 * plausible et l'étape le refuserait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE FAIT WORD, ET QU'ON REPRODUIT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  · `"` devient `«` ou `»` selon le contexte, avec son espace insécable collée ;
 *  · une espace insécable est posée avant `: ; ! ?` — et une espace ordinaire
 *    déjà tapée est REMPLACÉE, pas doublée ;
 *  · rien d'autre. Pas de majuscule automatique, pas de correction
 *    orthographique : ce sont des comportements que l'apprenant n'a pas demandés
 *    et qui rendraient les attendus imprévisibles.
 */

/** Espace insécable — U+00A0. Nommée, parce qu'invisible dans le code. */
export const INSECABLE = " "

/** Guillemets français ouvrant et fermant. */
export const GUILLEMET_OUVRANT = "«"
export const GUILLEMET_FERMANT = "»"

/** Signes qui, en français, réclament une espace insécable AVANT eux. */
const SIGNES_INSECABLES = [":", ";", "!", "?"] as const

/** Ce que la surface doit réellement insérer, en réponse à une frappe. */
export type CorrectionFrappe = {
  /** Le texte à insérer à la place du caractère tapé. */
  inserer: string
  /**
   * Combien de caractères supprimer AVANT le point d'insertion.
   *
   * Vaut 1 quand l'apprenant a tapé une espace ordinaire avant un `!` : Word la
   * remplace par une insécable au lieu d'en ajouter une seconde.
   */
  supprimerAvant: number
}

/** Aucune transformation : on insère le caractère tel quel. */
function tel(c: string): CorrectionFrappe {
  return { inserer: c, supprimerAvant: 0 }
}

/**
 * Un guillemet droit ouvre-t-il ou ferme-t-il, vu ce qui précède ?
 *
 * Règle retenue, la même que Word : il OUVRE en début de texte, après une
 * espace, après une ponctuation ouvrante ou après un retour de paragraphe ; il
 * FERME sinon. Ce n'est pas un comptage des guillemets déjà posés — l'apprenant
 * peut très bien corriger son texte au milieu, et un compteur donnerait alors
 * le mauvais sens.
 */
function ouvre(avant: string): boolean {
  const c = avant.slice(-1)
  if (c === "") return true
  return /[\s (\[{«\r\n’']/.test(c)
}

/**
 * La transformation à appliquer quand l'apprenant tape `caractere`, sachant le
 * texte qui le précède immédiatement dans le paragraphe.
 *
 * `avant` n'a pas besoin d'être le paragraphe entier : seuls les deux derniers
 * caractères comptent. La surface peut donc l'appeler à chaque frappe sans
 * relire le document.
 */
export function corrigerFrappe(avant: string, caractere: string): CorrectionFrappe {
  if (caractere === '"') {
    // Un guillemet précédé d'une espace OUVRE — c'est le comportement de Word,
    // et il est intentionnel : `bonjour "` commence une nouvelle citation. Il n'y
    // a donc pas de cas « fermant précédé d'une espace ordinaire » à absorber ;
    // l'avoir cru a produit une branche morte, que le contrôle a débusquée.
    return ouvre(avant)
      ? { inserer: GUILLEMET_OUVRANT + INSECABLE, supprimerAvant: 0 }
      : { inserer: INSECABLE + GUILLEMET_FERMANT, supprimerAvant: 0 }
  }

  if ((SIGNES_INSECABLES as readonly string[]).includes(caractere)) {
    const dernier = avant.slice(-1)
    // Déjà une insécable : ne rien doubler.
    if (dernier === INSECABLE) return tel(caractere)
    // Une espace ordinaire : elle est REMPLACÉE par l'insécable.
    if (dernier === " ") return { inserer: INSECABLE + caractere, supprimerAvant: 1 }
    // Rien devant, ou un début de paragraphe : le signe reste seul. Poser une
    // insécable en tête de ligne créerait un décalage visible sans rien
    // enseigner.
    if (dernier === "" || dernier === "\r" || dernier === "\n") return tel(caractere)
    // Une suite de `?!` ou `!!` ne prend pas d'insécable intermédiaire.
    if ((SIGNES_INSECABLES as readonly string[]).includes(dernier)) return tel(caractere)
    return { inserer: INSECABLE + caractere, supprimerAvant: 0 }
  }

  return tel(caractere)
}

/**
 * Applique la correction à un texte entier, comme si l'apprenant l'avait tapé
 * caractère par caractère.
 *
 * Sert à DEUX choses, et c'est ce qui garantit leur cohérence : préparer le
 * texte d'un scénario (une consigne qui affirme un résultat doit afficher celui
 * que l'apprenant obtiendra) et alimenter la démonstration « Montrez-moi », qui
 * doit taper exactement ce que la frappe réelle produirait.
 */
export function franciser(texte: string): string {
  let sortie = ""
  for (const c of texte) {
    const { inserer, supprimerAvant } = corrigerFrappe(sortie, c)
    if (supprimerAvant > 0) sortie = sortie.slice(0, sortie.length - supprimerAvant)
    sortie += inserer
  }
  return sortie
}

/**
 * Ramène un texte à une forme comparable, pour un jugement TOLÉRANT.
 *
 * Une étape qui n'enseigne pas la typographie ne doit pas refuser une réponse
 * juste parce que l'apprenant a tapé une espace ordinaire là où le moteur en a
 * posé une insécable. Une étape qui l'enseigne, elle, passe par
 * `estTypographieFrancaise` — la tolérance ne doit jamais effacer la leçon.
 */
export function normaliserTypographie(texte: string): string {
  return (
    texte
      // `\s` couvre l'espace insécable en JavaScript : une seule passe suffit.
      .replace(/\s+/g, " ")
      // ── LE CŒUR DE LA TOLÉRANCE ──
      // Ce qui distingue une saisie naïve d'une saisie francisée, c'est
      // EXACTEMENT l'espacement INTÉRIEUR aux guillemets et devant la
      // ponctuation double. On l'efface, et rien d'autre.
      //
      // ⚠️ L'ordre compte, et une première version s'y est trompée : effacer
      // toute espace adjacente à un guillemet APRÈS avoir ramené « » à `"`
      // mangeait aussi l'espace qui SÉPARE le guillemet du mot précédent —
      // `Il a dit « oui »` devenait `Il a dit"oui"`. On traite donc l'intérieur
      // des guillemets français TANT QU'ILS SONT ENCORE DISTINGUABLES.
      .replace(/«\s+/g, "«")
      .replace(/\s+»/g, "»")
      .replace(/[«»]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+([:;!?])/g, "$1")
      .trim()
  )
}

/** Ce qu'une relecture typographique reproche à un texte. */
export type DefautTypographique = {
  /** Position dans le texte, pour pouvoir désigner l'endroit à l'écran. */
  index: number
  /** Formulé pour l'apprenant, pas pour le journal. */
  message: string
}

/**
 * Relit un texte à l'aune des règles françaises et rend ce qui cloche.
 *
 * C'est ce qui permet à une étape d'enseigner la typographie SANS exiger une
 * chaîne exacte : on ne demande pas « tapez ce texte », on demande « faites en
 * sorte qu'il soit correctement composé ».
 */
export function defautsTypographiques(texte: string): DefautTypographique[] {
  const defauts: DefautTypographique[] = []

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]

    if (c === '"') {
      defauts.push({
        index: i,
        message: "Un guillemet droit subsiste : en français, on écrit « … ».",
      })
      continue
    }

    if ((SIGNES_INSECABLES as readonly string[]).includes(c)) {
      const avant = texte[i - 1]
      if (avant === " ") {
        defauts.push({
          index: i - 1,
          message: `Devant « ${c} », l'espace doit être insécable, pas une espace ordinaire.`,
        })
      } else if (
        avant !== undefined &&
        avant !== INSECABLE &&
        avant !== "\r" &&
        avant !== "\n" &&
        !(SIGNES_INSECABLES as readonly string[]).includes(avant)
      ) {
        defauts.push({
          index: i,
          message: `Il manque une espace insécable devant « ${c} ».`,
        })
      }
    }

    if (c === GUILLEMET_OUVRANT && texte[i + 1] !== INSECABLE) {
      defauts.push({ index: i, message: "Après « , il faut une espace insécable." })
    }
    if (c === GUILLEMET_FERMANT && texte[i - 1] !== INSECABLE) {
      defauts.push({ index: i, message: "Avant », il faut une espace insécable." })
    }
  }

  return defauts
}

/** Le texte respecte-t-il les règles typographiques françaises ? */
export function estTypographieFrancaise(texte: string): boolean {
  return defautsTypographiques(texte).length === 0
}
