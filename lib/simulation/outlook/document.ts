/**
 * OUTLOOK — le moteur de la messagerie simulée.
 *
 * Modèle PUR : aucune dépendance à React, au DOM ni à un moteur tiers. Le même
 * code sert à faire tourner le simulateur dans le navigateur ET à corriger côté
 * serveur une évaluation notée. C'est la contrainte qui a rendu `poste.ts` et
 * `validate.ts` réutilisables, et elle vaut ici encore plus : Outlook n'a AUCUN
 * moteur externe, donc l'état applicatif EST le modèle.
 *
 * Ce fichier est le portage TypeScript de `proto/moteur.mjs`, éprouvé pendant le
 * spike du 04/08/2026 par 55 assertions dont 14 pièges, et joué dans Chrome sur
 * trois formats.
 *
 * ═══ DONNÉES ═══
 * Tout ce qui est joué ici est FICTIF. Aucune adresse, aucun nom et aucun
 * contenu ne provient d'une boîte réelle Switching. Le domaine `atelier-nord.fr`
 * et ses correspondants sont inventés pour la formation.
 */

import type {
  BoiteAttendue,
  CalendrierAttendu,
  ChampAdressesAttendu,
  ChampRedaction,
  CorpsAttendu,
  GenreRedaction,
  MessageAttendu,
  PiecesAttendues,
  RegleAttendue,
  ReponseAutoAttendue,
  TexteAttendu,
} from "./actions"
import type {
  Adresse,
  Categorie,
  Contact,
  Dossier,
  Evenement,
  EtatOutlook,
  Message,
  PieceJointe,
  Redaction,
  Regle,
  ReponseAuto,
  Signature,
  Tache,
} from "./observations"

/* ═══════════════════ GARDE-FOU DE COHÉRENCE ═══════════════════
 *
 * `actions.ts` et `observations.ts` sont des FEUILLES : elles ne peuvent rien
 * s'importer l'une à l'autre, donc leur vocabulaire commun y est redéclaré. Ce
 * fichier est le seul à voir les deux — il est donc le seul endroit où la
 * divergence peut être rendue impossible.
 *
 * Les deux affectations ci-dessous ne coûtent rien à l'exécution et cassent la
 * compilation si l'un des deux fichiers évolue sans l'autre. Sans elles, un
 * champ ajouté d'un seul côté produirait un décalage silencieux entre ce que la
 * surface émet et ce que l'action attend — donc une étape injouable, sans
 * message.
 */
type ChampsDeRedaction = ChampRedaction | "recherche"
const _champsAlignes: ChampsDeRedaction = "a" as import("./observations").ChampRedactionObs
const _champsAlignesInverse: import("./observations").ChampRedactionObs = "a" as ChampsDeRedaction
void _champsAlignes
void _champsAlignesInverse

/* ═══════════════════ NORMALISATION ═══════════════════ */

/**
 * Comparaison tolérante : casse, accents et espaces multiples ignorés.
 *
 * Même philosophie que `matchesTypedAnswer` côté Excel — refuser une réponse
 * correcte est la pire faute d'un simulateur pédagogique, bien pire que d'en
 * accepter une approximative.
 */
export function normaliser(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Une adresse se compare toujours en minuscules, sans espaces parasites. */
export function normAdresse(a: unknown): string {
  return String(a ?? "").trim().toLowerCase()
}

const memeAdresse = (a: Adresse, b: Adresse) => normAdresse(a) === normAdresse(b)

const dedupe = (liste: Adresse[]): Adresse[] => {
  const vu = new Set<string>()
  return liste.filter((a) => {
    const k = normAdresse(a)
    if (!k || vu.has(k)) return false
    vu.add(k)
    return true
  })
}

/**
 * Préfixe d'objet à la française.
 *
 * Outlook ne double JAMAIS le préfixe : une réponse à une réponse reste
 * « RE : ». Le reproduire évite d'enseigner faux, et c'est un détail que les
 * apprenants remarquent tout de suite.
 */
export function prefixerObjet(objet: string, prefixe: "RE" | "TR"): string {
  const n = normaliser(objet)
  if (prefixe === "RE" && /^(re|rep|rép)\s*:/.test(n)) return objet
  if (prefixe === "TR" && /^(tr|fwd|tf)\s*:/.test(n)) return objet
  return `${prefixe} : ${objet}`
}

/* ═══════════════════ ÉTAT INITIAL ═══════════════════ */

export const DOSSIERS_PAR_DEFAUT: readonly Dossier[] = [
  { id: "reception", nom: "Boîte de réception", systeme: true },
  { id: "envoyes", nom: "Éléments envoyés", systeme: true },
  { id: "brouillons", nom: "Brouillons", systeme: true },
  { id: "supprimes", nom: "Éléments supprimés", systeme: true },
  { id: "indesirables", nom: "Courrier indésirable", systeme: true },
]

export const CATEGORIES_PAR_DEFAUT: readonly Categorie[] = [
  { id: "urgent", nom: "Urgent", couleur: "#D1382E" },
  { id: "clients", nom: "Clients", couleur: "#1F6FB2" },
  { id: "interne", nom: "Interne", couleur: "#107C41" },
  { id: "afaire", nom: "À traiter", couleur: "#B8860B" },
]

/**
 * Ce qu'un scénario déclare en tête, pour poser la boîte de départ.
 *
 * Tout est optionnel : une leçon ne déclare que ce qu'elle met en scène,
 * exactement comme `posteInitial` côté Excel.
 */
export type SetupOutlook = {
  compte?: { nom: string; adresse: Adresse }
  dossiers?: Dossier[]
  categories?: Categorie[]
  messages?: Array<Partial<Message> & { id: string; de: Adresse }>
  contacts?: Contact[]
  evenements?: Evenement[]
  taches?: Tache[]
  regles?: Regle[]
  signatures?: Signature[]
  signatureParDefaut?: string | null
  reponseAuto?: ReponseAuto | null
  fichiers?: PieceJointe[]
  vue?: EtatOutlook["vue"]
  dossierActif?: string
  messageActif?: string | null
}

export function etatInitial(options: SetupOutlook = {}): EtatOutlook {
  return {
    compte: options.compte ?? {
      nom: "Camille Aubertin",
      adresse: "camille.aubertin@atelier-nord.fr",
    },
    dossiers: [...DOSSIERS_PAR_DEFAUT, ...(options.dossiers ?? [])],
    categories: options.categories ?? [...CATEGORIES_PAR_DEFAUT],
    messages: (options.messages ?? []).map(normaliserMessage),
    contacts: options.contacts ?? [],
    evenements: options.evenements ?? [],
    taches: options.taches ?? [],
    regles: options.regles ?? [],
    signatures: options.signatures ?? [],
    signatureParDefaut: options.signatureParDefaut ?? null,
    reponseAuto: options.reponseAuto ?? null,
    fichiers: options.fichiers ?? [],

    vue: options.vue ?? "courrier",
    dossierActif: options.dossierActif ?? "reception",
    messageActif: options.messageActif ?? null,
    redaction: null,
    rendezVous: null,
    recherche: "",
    boite: "aucune",
    alerte: null,
  }
}

function normaliserMessage(m: Partial<Message> & { id: string; de: Adresse }): Message {
  return {
    id: m.id,
    dossier: m.dossier ?? "reception",
    de: m.de,
    a: m.a ?? [],
    cc: m.cc ?? [],
    cci: m.cci ?? [],
    objet: m.objet ?? "",
    corps: m.corps ?? "",
    date: m.date ?? "2026-03-02T09:00",
    lu: m.lu ?? false,
    indicateur: m.indicateur ?? false,
    categories: m.categories ?? [],
    pieces: m.pieces ?? [],
    conversation: m.conversation ?? m.id,
    importance: m.importance ?? "normale",
    repondu: m.repondu ?? false,
    transfere: m.transfere ?? false,
    invitation: m.invitation ?? null,
  }
}

const trouver = (etat: EtatOutlook, id: string | null): Message | null =>
  etat.messages.find((m) => m.id === id) ?? null

const majMessage = (etat: EtatOutlook, id: string, patch: Partial<Message>): EtatOutlook => ({
  ...etat,
  messages: etat.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
})

/* ═══════════════════ GESTES ═══════════════════ */

/**
 * Tout ce que l'apprenant peut faire à la messagerie.
 *
 * Ce type est INTERNE au dossier Outlook : ce n'est pas une `SimulationAction`
 * (ce que le scénario ATTEND) mais un geste (ce que la surface FAIT). Les deux
 * ne se confondent jamais — c'est ce qui permet de juger le résultat plutôt que
 * le chemin.
 */
export type GesteOutlook =
  | { type: "vue"; vue: EtatOutlook["vue"] }
  | { type: "dossier"; dossier: string }
  | { type: "recherche"; texte?: string }
  | { type: "ouvrirMessage"; id: string }
  | { type: "marquerLu"; id: string; lu?: boolean }
  | { type: "indicateur"; id: string; valeur?: boolean }
  | { type: "categoriser"; id: string; categorie: string }
  | { type: "deplacer"; id: string; dossier: string }
  | { type: "supprimer"; id: string }
  | { type: "nouveauMessage" }
  | { type: "repondre"; id?: string }
  | { type: "repondreATous"; id?: string }
  | { type: "transferer"; id?: string }
  | { type: "champ"; champ: ChampRedaction; valeur: string }
  | { type: "destinataires"; champ: "a" | "cc" | "cci"; valeur: string }
  | { type: "afficherCci" }
  | { type: "joindre"; nom: string }
  | { type: "retirerPiece"; nom: string }
  | { type: "signature"; signature: string | null }
  | { type: "importance"; valeur: "haute" | "normale" | "basse" }
  | { type: "envoyer"; id?: string; date?: string }
  | { type: "abandonner" }
  | { type: "boite"; boite: EtatOutlook["boite"] }
  | { type: "creerRegle"; regle: Regle }
  | { type: "reponseAuto"; reponseAuto: ReponseAuto }
  | { type: "nouveauRendezVous"; id?: string; date?: string }
  | { type: "champRdv"; champ: keyof Evenement; valeur: unknown }
  | { type: "inviter"; valeur: string }
  | { type: "enregistrerRdv" }
  /**
   * Refermer le formulaire de rendez-vous sans rien enregistrer.
   *
   * Sans ce geste, le bouton « Annuler » n'avait aucun moyen de vider
   * `rendezVous` : la modale restait ouverte et l'apprenant s'y retrouvait
   * enfermé, sans autre issue que de remplir le formulaire. Un simulateur doit
   * toujours laisser ressortir d'une boîte de dialogue.
   */
  | { type: "annulerRdv" }
  | { type: "repondreInvitation"; id: string; reponse: "accepte" | "refuse" | "provisoire" }

/**
 * Applique un geste.
 *
 * Fonction PURE : elle renvoie un nouvel état, ce qui rend chaque transition
 * rejouable et vérifiable hors navigateur — condition pour qu'une évaluation
 * notée soit corrigée par le serveur.
 */
export function appliquerGeste(etat: EtatOutlook, geste: GesteOutlook): EtatOutlook {
  const e: EtatOutlook = { ...etat, alerte: null }

  switch (geste.type) {
    /* ── Navigation ── */
    case "vue":
      return { ...e, vue: geste.vue }

    case "dossier":
      return { ...e, dossierActif: geste.dossier, messageActif: null }

    case "recherche":
      return { ...e, recherche: geste.texte ?? "" }

    /* ── Lecture ──
       Ouvrir un message le marque comme lu : ce n'est pas un détail
       d'affichage, c'est un changement d'état observable, et « lire un
       message » est la première primitive que la formation enseigne. */
    case "ouvrirMessage": {
      if (!trouver(e, geste.id)) return e
      return { ...majMessage(e, geste.id, { lu: true }), messageActif: geste.id }
    }

    case "marquerLu":
      return majMessage(e, geste.id, { lu: geste.lu !== false })

    case "indicateur": {
      const m = trouver(e, geste.id)
      if (!m) return e
      return majMessage(e, geste.id, { indicateur: geste.valeur ?? !m.indicateur })
    }

    case "categoriser": {
      const m = trouver(e, geste.id)
      if (!m) return e
      const dedans = m.categories.includes(geste.categorie)
      return majMessage(e, geste.id, {
        categories: dedans
          ? m.categories.filter((c) => c !== geste.categorie)
          : [...m.categories, geste.categorie],
      })
    }

    case "deplacer": {
      if (!trouver(e, geste.id)) return e
      if (!e.dossiers.some((d) => d.id === geste.dossier)) return e
      return { ...majMessage(e, geste.id, { dossier: geste.dossier }), messageActif: null }
    }

    case "supprimer": {
      if (!trouver(e, geste.id)) return e
      // Supprimer ne détruit pas : ça déplace vers les éléments supprimés.
      // C'est LA leçon du classement, et le vrai comportement d'Outlook.
      return { ...majMessage(e, geste.id, { dossier: "supprimes" }), messageActif: null }
    }

    /* ── Rédaction ── */
    case "nouveauMessage":
      return { ...e, vue: "courrier", redaction: redactionVide(e, "nouveau", null) }

    case "repondre":
    case "repondreATous":
    case "transferer": {
      const m = trouver(e, geste.id ?? e.messageActif)
      if (!m) return e
      const genre: GenreRedaction =
        geste.type === "repondre" ? "reponse" : geste.type === "repondreATous" ? "reponseATous" : "transfert"
      return { ...e, vue: "courrier", redaction: prefiller(e, m, genre) }
    }

    case "champ": {
      if (!e.redaction) return e
      return { ...e, redaction: { ...e.redaction, [geste.champ]: geste.valeur } }
    }

    case "destinataires": {
      // Saisie libre « a; b; c » comme dans Outlook : on découpe et on nettoie.
      if (!e.redaction) return e
      const liste = dedupe(
        String(geste.valeur ?? "")
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      )
      return { ...e, redaction: { ...e.redaction, [geste.champ]: liste } }
    }

    case "afficherCci":
      // Dans Outlook le champ Cci est MASQUÉ par défaut : il faut aller le
      // chercher. C'est un geste enseignable à part entière, et l'oublier est
      // l'erreur professionnelle classique que la formation doit corriger.
      if (!e.redaction) return e
      return { ...e, redaction: { ...e.redaction, champCciVisible: true } }

    case "joindre": {
      if (!e.redaction) return e
      const f = e.fichiers.find((x) => normaliser(x.nom) === normaliser(geste.nom))
      if (!f) return { ...e, alerte: `Aucun fichier « ${geste.nom} ».` }
      if (e.redaction.pieces.some((p) => normaliser(p.nom) === normaliser(f.nom))) {
        return { ...e, boite: "aucune" }
      }
      return {
        ...e,
        boite: "aucune",
        redaction: { ...e.redaction, pieces: [...e.redaction.pieces, { ...f }] },
      }
    }

    case "retirerPiece": {
      if (!e.redaction) return e
      return {
        ...e,
        redaction: {
          ...e.redaction,
          pieces: e.redaction.pieces.filter((p) => normaliser(p.nom) !== normaliser(geste.nom)),
        },
      }
    }

    case "signature": {
      if (!e.redaction) return e
      return { ...e, redaction: { ...e.redaction, signature: geste.signature ?? null } }
    }

    case "importance": {
      if (!e.redaction) return e
      return { ...e, redaction: { ...e.redaction, importance: geste.valeur } }
    }

    case "envoyer": {
      const r = e.redaction
      if (!r) return e
      if (r.a.length + r.cc.length + r.cci.length === 0) {
        // Outlook refuse et EXPLIQUE. Un simulateur muet laisserait l'apprenant
        // cliquer dans le vide sans comprendre pourquoi rien ne part.
        return { ...e, alerte: "Ajoutez au moins un destinataire avant d'envoyer." }
      }
      const envoye = normaliserMessage({
        id: geste.id ?? `env-${e.messages.length + 1}`,
        dossier: "envoyes",
        de: e.compte.adresse,
        a: r.a,
        cc: r.cc,
        cci: r.cci,
        objet: r.objet,
        corps: corpsComplet(e, r),
        date: geste.date ?? "2026-03-02T11:24",
        lu: true,
        pieces: r.pieces,
        importance: r.importance,
        conversation: r.source
          ? trouver(e, r.source)?.conversation ?? r.source
          : `env-${e.messages.length + 1}`,
      })
      let suite: EtatOutlook = {
        ...e,
        messages: [...e.messages, envoye],
        redaction: null,
        dernierEnvoi: envoye,
      }
      // L'icône « répondu / transféré » sur le message source : petite fidélité,
      // mais c'est ce qui permet à l'apprenant de vérifier son propre travail.
      if (r.source) {
        suite = majMessage(
          suite,
          r.source,
          r.genre === "transfert" ? { transfere: true } : { repondu: true },
        )
      }
      return suite
    }

    case "abandonner":
      return { ...e, redaction: null }

    /* ── Règles, réponse automatique ── */
    case "boite":
      return { ...e, boite: geste.boite }

    case "creerRegle": {
      const r = geste.regle
      if (!r?.condition || !r?.action) return e
      return { ...e, boite: "aucune", regles: [...e.regles, r] }
    }

    case "reponseAuto":
      return { ...e, boite: "aucune", reponseAuto: geste.reponseAuto }

    /* ── Calendrier ── */
    case "nouveauRendezVous":
      return {
        ...e,
        vue: "calendrier",
        rendezVous: {
          id: geste.id ?? `rdv-${e.evenements.length + 1}`,
          titre: "",
          date: geste.date ?? "2026-03-05",
          debut: "09:00",
          fin: "10:00",
          lieu: "",
          participants: [],
          reunion: false,
          rappel: 15,
          recurrence: null,
        },
      }

    case "champRdv": {
      if (!e.rendezVous) return e
      return { ...e, rendezVous: { ...e.rendezVous, [geste.champ]: geste.valeur } }
    }

    case "inviter": {
      if (!e.rendezVous) return e
      const liste = dedupe(
        String(geste.valeur ?? "")
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      )
      return {
        ...e,
        rendezVous: { ...e.rendezVous, participants: liste, reunion: liste.length > 0 },
      }
    }

    case "enregistrerRdv": {
      const rdv = e.rendezVous
      if (!rdv || !rdv.titre.trim()) return { ...e, alerte: "Donnez un objet au rendez-vous." }
      return { ...e, evenements: [...e.evenements, rdv], rendezVous: null }
    }

    case "annulerRdv":
      return { ...e, rendezVous: null }

    case "repondreInvitation": {
      const m = trouver(e, geste.id)
      if (!m?.invitation) return e
      const inv = { ...m.invitation, reponse: geste.reponse }
      let suite = majMessage(e, geste.id, { invitation: inv, lu: true })
      // Accepter inscrit vraiment le rendez-vous au calendrier : sans cela,
      // l'apprenant ne voit aucune conséquence à son clic.
      if (geste.reponse === "accepte" && inv.evenement) {
        suite = { ...suite, evenements: [...suite.evenements, inv.evenement] }
      }
      return suite
    }

    default: {
      // Exhaustivité : ajouter un geste sans le traiter casse la compilation.
      const _exhaustif: never = geste
      void _exhaustif
      return etat
    }
  }
}

function redactionVide(etat: EtatOutlook, genre: GenreRedaction, source: string | null): Redaction {
  return {
    genre,
    source,
    a: [],
    cc: [],
    cci: [],
    objet: "",
    corps: "",
    pieces: [],
    importance: "normale",
    signature: etat.signatureParDefaut,
    champCciVisible: false,
  }
}

/**
 * Pré-remplissage d'une réponse ou d'un transfert.
 *
 * C'est ici que vivent les trois règles qu'une formation Outlook DOIT enseigner,
 * et qu'un simulateur approximatif enseignerait à l'envers :
 *
 *  1. « Répondre » n'écrit qu'à l'expéditeur ; « Répondre à tous » reprend aussi
 *     les destinataires visibles, MOINS soi-même.
 *  2. Les personnes en copie cachée du message reçu ne sont JAMAIS reprises : on
 *     ne les voit pas, donc on ne peut pas leur répondre.
 *  3. Une réponse NE reprend PAS les pièces jointes ; un transfert SI. C'est la
 *     différence la plus utile et la moins connue entre les deux gestes.
 */
export function prefiller(etat: EtatOutlook, m: Message, genre: GenreRedaction): Redaction {
  const moi = etat.compte.adresse
  const base = redactionVide(etat, genre, m.id)

  if (genre === "transfert") {
    return {
      ...base,
      objet: prefixerObjet(m.objet, "TR"),
      pieces: m.pieces.map((p) => ({ ...p })),
    }
  }

  const a =
    genre === "reponseATous"
      ? dedupe([m.de, ...m.a.filter((x) => !memeAdresse(x, moi))])
      : [m.de]
  const cc = genre === "reponseATous" ? dedupe(m.cc.filter((x) => !memeAdresse(x, moi))) : []

  return { ...base, a, cc, objet: prefixerObjet(m.objet, "RE") }
}

function corpsComplet(etat: EtatOutlook, r: Redaction): string {
  const sig = etat.signatures.find((s) => s.id === r.signature)
  return sig ? `${r.corps}\n\n${sig.contenu}` : r.corps
}

/** Messages visibles : dossier courant + recherche. Sert aussi à la validation. */
export function messagesVisibles(etat: EtatOutlook): Message[] {
  const q = normaliser(etat.recherche)
  return etat.messages
    .filter((m) => m.dossier === etat.dossierActif)
    .filter((m) => !q || normaliser(`${m.objet} ${m.de} ${m.corps}`).includes(q))
    .sort((x, y) => String(y.date).localeCompare(String(x.date)))
}

/* ═══════════════════ VÉRIFICATION ═══════════════════
 *
 * Chaque fonction renvoie `null` quand tout va bien, sinon un message DESTINÉ À
 * L'APPRENANT. Elles ne lèvent jamais : un simulateur qui plante sur un état
 * inattendu laisse l'apprenant sans recours.
 */

/**
 * Vérifie un champ d'adresses.
 *
 * `mode: "exact"` (défaut) est le bon réglage pour Cc et Cci : tout l'intérêt
 * pédagogique de « mets ton collègue en copie cachée » est qu'il ne soit PAS
 * ailleurs. `absent` permet en plus de nommer l'erreur au lieu de la constater.
 */
function verifierAdresses(
  obtenu: Adresse[] | undefined,
  attendu: ChampAdressesAttendu,
  libelle: string,
): string | null {
  const eu = dedupe(obtenu ?? []).map(normAdresse)
  const veut = dedupe(attendu.contient ?? []).map(normAdresse)

  for (const v of veut) {
    if (!eu.includes(v)) return `${libelle} : « ${v} » n'y figure pas.`
  }
  for (const inter of (attendu.absent ?? []).map(normAdresse)) {
    if (eu.includes(inter)) return `${libelle} : « ${inter} » ne devrait pas y figurer.`
  }
  if ((attendu.mode ?? "exact") === "exact") {
    const surplus = eu.find((a) => !veut.includes(a))
    if (surplus) return `${libelle} : « ${surplus} » est en trop.`
    if (attendu.contient && eu.length !== veut.length) return `${libelle} : le compte n'y est pas.`
  }
  if (attendu.vide && eu.length > 0) return `${libelle} devrait rester vide.`
  return null
}

function verifierTexte(obtenu: string | undefined, attendu: TexteAttendu, libelle: string): string | null {
  const n = normaliser(obtenu)
  if (attendu.nonVide && !n) return `${libelle} est vide.`
  if (attendu.prefixe) {
    const p = attendu.prefixe === "RE" ? /^(re|rep|rép)\s*:/ : /^(tr|fwd|tf)\s*:/
    if (!p.test(n)) return `${libelle} ne porte pas le préfixe attendu.`
  }
  if (attendu.accept?.length) {
    if (!attendu.accept.some((a) => normaliser(a) === n)) {
      return `${libelle} ne correspond pas à ce qui est demandé.`
    }
  }
  if (attendu.contient?.length) {
    const manque = attendu.contient.find((c) => !n.includes(normaliser(c)))
    if (manque) return `${libelle} devrait mentionner « ${manque} ».`
  }
  return null
}

/**
 * Vérification du CORPS — le point le plus délicat, et le plus honnête à cadrer.
 *
 * On ne compare JAMAIS le corps à un texte modèle : demander à un apprenant de
 * retrouver une prose exacte n'apprend rien et refuserait toutes les bonnes
 * réponses. On vérifie des NOTIONS, chacune portant un libellé humain.
 *
 * ⚠️ L'ORDRE DES CONTRÔLES EST PÉDAGOGIQUE, PAS COSMÉTIQUE.
 *
 * Le plancher de mots était vérifié EN PREMIER dans la première version du
 * spike : il masquait alors tous les retours utiles. Un apprenant qui avait
 * oublié le délai lisait « message trop court » et cherchait à rallonger sa
 * prose au lieu d'ajouter l'information manquante. Ce seul défaut expliquait les
 * trois échecs du premier passage au banc. Le comptage de mots est le contrôle
 * le plus grossier du lot : il passe donc EN DERNIER, quand rien de substantiel
 * ne manque, et ne sert plus qu'à écarter une réponse manifestement bâclée.
 */
function verifierCorps(obtenu: string | undefined, attendu: CorpsAttendu): string | null {
  const n = normaliser(obtenu)

  for (const notion of attendu.notions ?? []) {
    if (!notion.oneOf.some((f) => n.includes(normaliser(f)))) {
      return `Le message ne dit pas encore : ${notion.libelle}.`
    }
  }
  for (const inter of attendu.interdit ?? []) {
    if (inter.oneOf.some((f) => n.includes(normaliser(f)))) {
      return `À retirer du message : ${inter.libelle}.`
    }
  }
  if (attendu.salutation?.length && !attendu.salutation.some((s) => n.includes(normaliser(s)))) {
    return "Le message ne commence pas par une formule d'appel."
  }
  if (attendu.cloture?.length && !attendu.cloture.some((s) => n.includes(normaliser(s)))) {
    return "Le message ne se termine pas par une formule de politesse."
  }
  if (attendu.minMots) {
    const mots = n ? n.split(" ").filter(Boolean).length : 0
    if (mots < attendu.minMots) {
      return `Le message est trop court (${mots} mots sur ${attendu.minMots} attendus).`
    }
  }
  return null
}

function verifierPieces(obtenu: PieceJointe[] | undefined, attendu: PiecesAttendues): string | null {
  const liste = obtenu ?? []
  const eu = liste.map((p) => normaliser(p.nom))
  for (const v of attendu.contient ?? []) {
    if (!eu.includes(normaliser(v))) return `La pièce jointe « ${v} » manque.`
  }
  for (const i of attendu.absent ?? []) {
    if (eu.includes(normaliser(i))) return `La pièce jointe « ${i} » ne devrait pas être là.`
  }
  if (attendu.aucune && eu.length) return "Ce message ne devrait porter aucune pièce jointe."
  if ((attendu.mode ?? "exact") === "exact" && attendu.contient) {
    const attendues = attendu.contient
    const surplus = liste.find((p) => !attendues.some((v) => normaliser(v) === normaliser(p.nom)))
    if (surplus) return `La pièce jointe « ${surplus.nom} » est en trop.`
  }
  return null
}

/**
 * LE mode de validation d'Outlook : l'état d'un message composé.
 *
 * Équivalent d'`EXPECT_STATE` côté Excel — on juge le RÉSULTAT, jamais le
 * chemin. Peu importe que l'apprenant ait cliqué « Répondre à tous » ou saisi
 * les adresses à la main : ce qui compte est l'enveloppe obtenue.
 */
export function verifierMessage(etat: EtatOutlook, attendu: MessageAttendu): string | null {
  const cible = attendu.cible ?? "redaction"
  const r = cible === "envoye" ? dernierEnvoye(etat) : etat.redaction

  if (!r) {
    return cible === "envoye"
      ? "Aucun message n'a encore été envoyé."
      : "Aucun message n'est en cours de rédaction."
  }

  // Le genre n'existe que sur une rédaction en cours : un message ENVOYÉ est un
  // `Message`, qui ne porte plus la trace du geste qui l'a produit.
  const genre = "genre" in r ? (r as Redaction).genre : undefined
  if (attendu.genre && genre && genre !== attendu.genre) {
    const noms: Record<GenreRedaction, string> = {
      nouveau: "un nouveau message",
      reponse: "une réponse",
      reponseATous: "une réponse à tous",
      transfert: "un transfert",
    }
    return `Ce n'est pas ${noms[attendu.genre]}.`
  }

  const controles = [
    attendu.a ? verifierAdresses(r.a, attendu.a, "Destinataires") : null,
    attendu.cc ? verifierAdresses(r.cc, attendu.cc, "Copie") : null,
    attendu.cci ? verifierAdresses(r.cci, attendu.cci, "Copie cachée") : null,
    attendu.objet ? verifierTexte(r.objet, attendu.objet, "L'objet") : null,
    attendu.corps ? verifierCorps(r.corps, attendu.corps) : null,
    attendu.pieces ? verifierPieces(r.pieces, attendu.pieces) : null,
  ]
  const souci = controles.find(Boolean)
  if (souci) return souci

  if (attendu.importance && r.importance !== attendu.importance) {
    return "L'importance du message n'est pas celle demandée."
  }
  return null
}

function dernierEnvoye(etat: EtatOutlook): Message | null {
  if (etat.dernierEnvoi) return etat.dernierEnvoi
  const envoyes = etat.messages.filter((m) => m.dossier === "envoyes")
  return envoyes.length ? envoyes[envoyes.length - 1] : null
}

/** État de la boîte : rangement, lu/non lu, indicateurs, catégories. */
export function verifierBoite(etat: EtatOutlook, attendu: BoiteAttendue): string | null {
  for (const [id, att] of Object.entries(attendu.messages ?? {})) {
    const m = trouver(etat, id)
    if (!m) return "Le message attendu n'est plus dans la boîte."
    if (att.dossier && m.dossier !== att.dossier) {
      const nom = etat.dossiers.find((d) => d.id === att.dossier)?.nom ?? att.dossier
      const ou = etat.dossiers.find((d) => d.id === m.dossier)?.nom ?? m.dossier
      return `« ${m.objet} » est encore dans ${ou} au lieu de ${nom}.`
    }
    if (att.lu !== undefined && m.lu !== att.lu) {
      return att.lu
        ? `« ${m.objet} » n'est pas encore marqué comme lu.`
        : `« ${m.objet} » ne devrait pas être marqué comme lu.`
    }
    if (att.indicateur !== undefined && m.indicateur !== att.indicateur) {
      return att.indicateur
        ? `« ${m.objet} » ne porte pas d'indicateur de suivi.`
        : `« ${m.objet} » porte encore un indicateur.`
    }
    if (att.categories) {
      const manque = att.categories.find((c) => !m.categories.includes(c))
      if (manque) {
        const nom = etat.categories.find((c) => c.id === manque)?.nom ?? manque
        return `« ${m.objet} » n'est pas classé dans la catégorie ${nom}.`
      }
    }
  }
  if (attendu.dossierActif && etat.dossierActif !== attendu.dossierActif) {
    return "Ce n'est pas le bon dossier qui est ouvert."
  }
  if (attendu.dossierExiste) {
    const manque = attendu.dossierExiste.find(
      (n) => !etat.dossiers.some((d) => normaliser(d.nom) === normaliser(n)),
    )
    if (manque) return `Le dossier « ${manque} » n'a pas été créé.`
  }
  if (attendu.visibles) {
    const vus = messagesVisibles(etat)
      .map((m) => m.id)
      .sort()
    const veut = [...attendu.visibles].sort()
    if (vus.join("|") !== veut.join("|")) {
      return "La liste affichée ne correspond pas à ce qui est demandé."
    }
  }
  return null
}

export function verifierCalendrier(etat: EtatOutlook, attendu: CalendrierAttendu): string | null {
  const ev =
    etat.evenements.find((x) => normaliser(x.titre) === normaliser(attendu.titre ?? "")) ??
    (attendu.titre ? null : etat.evenements[etat.evenements.length - 1])
  if (!ev) {
    return attendu.titre
      ? `Aucun rendez-vous « ${attendu.titre} » au calendrier.`
      : "Aucun rendez-vous n'a été créé."
  }
  if (attendu.date && ev.date !== attendu.date) return "Le rendez-vous n'est pas au bon jour."
  if (attendu.debut && ev.debut !== attendu.debut) return "L'heure de début n'est pas la bonne."
  if (attendu.fin && ev.fin !== attendu.fin) return "L'heure de fin n'est pas la bonne."
  if (attendu.lieu && normaliser(ev.lieu) !== normaliser(attendu.lieu)) {
    return "Le lieu n'est pas celui demandé."
  }
  if (attendu.reunion !== undefined && ev.reunion !== attendu.reunion) {
    return attendu.reunion
      ? "Aucun participant n'a été invité : ce n'est pas encore une réunion."
      : "Ce rendez-vous ne devait pas être une réunion."
  }
  if (attendu.participants) {
    const souci = verifierAdresses(ev.participants, attendu.participants, "Participants")
    if (souci) return souci
  }
  return null
}

export function verifierRegle(etat: EtatOutlook, attendu: RegleAttendue): string | null {
  const r = etat.regles[etat.regles.length - 1]
  if (!r) return "Aucune règle n'a été créée."
  if (attendu.condition?.champ && r.condition.champ !== attendu.condition.champ) {
    return "La règle ne se déclenche pas sur le bon critère."
  }
  if (attendu.condition?.valeur && normaliser(r.condition.valeur) !== normaliser(attendu.condition.valeur)) {
    return "Le critère de la règle n'est pas celui demandé."
  }
  if (attendu.action?.type && r.action.type !== attendu.action.type) {
    return "La règle ne fait pas ce qui est demandé."
  }
  if (attendu.action?.dossier && r.action.dossier !== attendu.action.dossier) {
    return "La règle ne range pas dans le bon dossier."
  }
  return null
}

export function verifierReponseAuto(etat: EtatOutlook, attendu: ReponseAutoAttendue): string | null {
  const ra = etat.reponseAuto
  if (attendu.active === false) {
    return ra?.active ? "La réponse automatique est encore active." : null
  }
  if (!ra?.active) return "La réponse automatique n'est pas activée."
  if (attendu.message) {
    const souci = verifierCorps(ra.message, attendu.message)
    if (souci) return souci
  }
  if (attendu.du && ra.du !== attendu.du) return "La date de début n'est pas la bonne."
  if (attendu.au && ra.au !== attendu.au) return "La date de fin n'est pas la bonne."
  return null
}

/* ═══════════════════ IDENTIFIANTS DES CONTRÔLES ═══════════════════
 *
 * Préfixe `cr-` (COuRRier). Même convention que `CONTROLES_POSTE` : c'est ce qui
 * permet aux scénarios, au halo d'aide, à la démonstration animée et au pilote
 * de test de désigner un bouton sans dépendre de son libellé.
 *
 * ⚠️ RÈGLE DURE : un `data-control` ne doit exister qu'UNE FOIS dans le DOM à un
 * instant donné. Deux occurrences font viser à un clic automatisé — et au halo
 * d'aide — l'élément CACHÉ. Piège déjà payé côté Excel sur `poste-fichier-*`, et
 * RENCONTRÉ pendant ce spike : la barre de navigation mobile et l'en-tête du
 * calendrier portaient tous deux `cr-vue-courrier`.
 */
export const CONTROLES = {
  nouveau: "cr-nouveau",
  repondre: "cr-repondre",
  repondreTous: "cr-repondre-tous",
  transferer: "cr-transferer",
  envoyer: "cr-envoyer",
  abandonner: "cr-abandonner",
  joindre: "cr-joindre",
  afficherCci: "cr-cci",
  supprimer: "cr-supprimer",
  indicateur: "cr-indicateur",
  nonLu: "cr-non-lu",
  deplacer: "cr-deplacer",
  regles: "cr-regles",
  reponseAuto: "cr-reponse-auto",
  nouveauRdv: "cr-nouveau-rdv",
  enregistrerRdv: "cr-enregistrer-rdv",
  accepter: "cr-accepter",
  refuser: "cr-refuser",
  provisoire: "cr-provisoire",
  recherche: "cr-recherche",
  vue: (v: string) => `cr-vue-${v}`,
  dossier: (id: string) => `cr-dossier-${id}`,
  message: (id: string) => `cr-message-${id}`,
  categorie: (id: string) => `cr-categorie-${id}`,
  fichier: (nom: string) => `cr-fichier-${normaliser(nom).replace(/[^a-z0-9]+/g, "-")}`,
  champ: (c: string) => `cr-champ-${c}`,
} as const
