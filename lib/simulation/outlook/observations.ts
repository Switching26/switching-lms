/**
 * Ce que la surface de Outlook ÉMET réellement quand l'apprenant agit.
 *
 * ⚠️ Mêmes règles que `actions.ts` : ce fichier n'importe RIEN, pas même un
 * `import type`. C'est une FEUILLE de l'arbre de dépendances.
 *
 * ═══ POURQUOI L'ÉTAT COMPLET VIT ICI ═══
 *
 * C'est la simplification majeure d'Outlook par rapport à Excel, et elle mérite
 * d'être comprise avant d'y toucher.
 *
 * Côté Excel, valider un état oblige à demander au moteur Univer de LIRE ses
 * cellules — d'où l'indirection `readings` : le fichier de validation doit
 * rester pur pour tourner côté serveur, alors que la donnée vit dans un moteur
 * de rendu qui n'existe que dans le navigateur.
 *
 * Ici, l'état applicatif EST le modèle. Il tient dans un objet JSON de quelques
 * kilo-octets, et il part tel quel dans `o:etatChange`. La correction serveur
 * d'une évaluation notée rejuge l'état soumis, en entier, sans rien avoir à
 * relire ailleurs. C'est pour cela que `EtatOutlook` est déclaré dans le fichier
 * des OBSERVATIONS : c'est littéralement ce que la surface observe.
 *
 * ⚠️ Une action attendue dont la surface n'émet JAMAIS l'observation
 * correspondante rend l'étape injouable : l'apprenant fait exactement ce qu'on
 * lui demande et rien ne se passe. Les cinq `kind` ci-dessous ont tous été émis
 * et jugés dans un vrai navigateur pendant le spike du 04/08/2026.
 */

export type OutlookObservation =
  | { kind: "o:control"; control: string }
  | { kind: "o:selectMessage"; id: string }
  | { kind: "o:selectFolder"; dossier: string }
  | { kind: "o:typed"; champ: ChampRedactionObs; text: string }
  /** L'état complet après le geste. Alimente les cinq `O_EXPECT_*`. */
  | { kind: "o:etatChange"; etat: EtatOutlook }

/**
 * Vocabulaire REDÉCLARÉ à l'identique depuis `actions.ts`, qu'une feuille ne
 * peut pas importer.
 *
 * La divergence n'est pas laissée à la vigilance : `document.ts`, qui a le droit
 * d'importer les deux fichiers, pose une vérification de compatibilité à la
 * compilation. Si l'un bouge sans l'autre, le typecheck casse.
 */
export type ChampRedactionObs = "a" | "cc" | "cci" | "objet" | "corps" | "recherche"

/* ═══════════ LE DOCUMENT : LA BOÎTE AUX LETTRES ═══════════ */

export type Adresse = string

export type PieceJointe = {
  nom: string
  /** Affichée telle quelle : « 184 Ko ». Aucun octet réel n'est manipulé. */
  taille?: string
}

export type Dossier = {
  id: string
  nom: string
  /** Un dossier système ne peut être ni renommé ni supprimé. */
  systeme?: boolean
}

export type Categorie = { id: string; nom: string; couleur: string }

export type Message = {
  id: string
  dossier: string
  de: Adresse
  a: Adresse[]
  cc: Adresse[]
  /**
   * Les copies cachées ne sont renseignées QUE sur un message que l'apprenant a
   * lui-même envoyé.
   *
   * Sur un message REÇU, ce champ reste vide — on ne voit pas les Cci d'un
   * message qu'on reçoit, et un simulateur qui laisserait croire l'inverse
   * enseignerait faux sur le point le plus sensible de la messagerie
   * professionnelle.
   */
  cci: Adresse[]
  objet: string
  corps: string
  /** ISO court « 2026-03-02T09:00 ». Toutes les dates sont FICTIVES. */
  date: string
  lu: boolean
  indicateur: boolean
  categories: string[]
  pieces: PieceJointe[]
  /** Regroupement en conversation : plusieurs messages, un même fil. */
  conversation: string
  importance: "haute" | "normale" | "basse"
  /** Alimente les icônes ↩ et ➜ de la liste — l'apprenant vérifie son travail. */
  repondu: boolean
  transfere: boolean
  invitation: Invitation | null
}

export type Invitation = {
  reponse: "aucune" | "accepte" | "refuse" | "provisoire"
  /**
   * Accepter inscrit VRAIMENT le rendez-vous au calendrier. Sans effet visible,
   * le clic n'apprendrait rien.
   */
  evenement?: Evenement
}

export type Evenement = {
  id: string
  titre: string
  date: string
  debut: string
  fin: string
  lieu: string
  participants: Adresse[]
  /** Un rendez-vous avec participants devient une réunion. */
  reunion: boolean
  rappel?: number
  recurrence?: "aucune" | "quotidienne" | "hebdomadaire" | "mensuelle" | null
}

export type Contact = { nom: string; adresse: Adresse; societe?: string; telephone?: string }
export type Tache = { id: string; titre: string; echeance?: string; terminee: boolean }
export type Signature = { id: string; nom: string; contenu: string }

export type Regle = {
  nom?: string
  condition: { champ: string; valeur: string }
  action: { type: string; dossier?: string; categorie?: string }
}

export type ReponseAuto = { active: boolean; du?: string; au?: string; message: string }

/** Le message en cours d'écriture. C'est l'objet que juge `O_EXPECT_MAIL`. */
export type Redaction = {
  genre: "nouveau" | "reponse" | "reponseATous" | "transfert"
  /** Identifiant du message auquel on répond / que l'on transfère. */
  source: string | null
  a: Adresse[]
  cc: Adresse[]
  cci: Adresse[]
  objet: string
  corps: string
  pieces: PieceJointe[]
  importance: "haute" | "normale" | "basse"
  signature: string | null
  /**
   * Le champ Cci est MASQUÉ par défaut dans Outlook : il faut aller le chercher.
   *
   * L'afficher est donc un geste enseignable à part entière, et l'ignorer est
   * l'erreur professionnelle classique que la formation doit corriger. Ce
   * booléen porte cette leçon — ne pas le supprimer par souci de simplification.
   */
  champCciVisible: boolean
}

export type EtatOutlook = {
  compte: { nom: string; adresse: Adresse }
  dossiers: Dossier[]
  categories: Categorie[]
  messages: Message[]
  contacts: Contact[]
  evenements: Evenement[]
  taches: Tache[]
  regles: Regle[]
  signatures: Signature[]
  signatureParDefaut: string | null
  reponseAuto: ReponseAuto | null
  /** Fichiers disponibles à joindre. Fictifs, jamais lus sur disque. */
  fichiers: PieceJointe[]

  /* ── Interface ── */
  vue: "courrier" | "calendrier" | "contacts" | "taches"
  dossierActif: string
  messageActif: string | null
  redaction: Redaction | null
  rendezVous: Evenement | null
  recherche: string
  boite: "aucune" | "joindre" | "deplacer" | "regle" | "reponseAuto"
  /**
   * Message d'Outlook LUI-MÊME (« ajoutez un destinataire »), pas un verdict de
   * l'atelier. Les deux ne doivent jamais être confondus : l'un est de la
   * fidélité applicative, l'autre de la correction pédagogique.
   */
  alerte: string | null
  /** Dernier message envoyé, cible de `O_EXPECT_MAIL { cible: "envoye" }`. */
  dernierEnvoi?: Message
}
