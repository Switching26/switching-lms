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

/* ═══════════════════ LA GRAVITÉ D'UN ÉCART ═══════════════════
 *
 * 🔴 C'EST CE QUI REND LE BARÈME D'OUTLOOK RÉEL. À lire avant d'y toucher.
 *
 * Les cinq vérificateurs ci-dessous rendaient une simple phrase : « il manque
 * ceci ». Le juge la traduisait toujours en `wrong_…_state`, et le socle envoie
 * alors l'observation dans une branche où AUCUNE sortie ne classe en faute —
 * `estObservationEtat` renvoyait `true` pour tout `o:etatChange`. Résultat
 * mesuré le 05/08/2026 : **12 points perdables sur 318, soit 4 %** du barème
 * des seize évaluations, quand Excel — même socle, en production — est à 70 %.
 * Un apprenant qui se trompait partout gardait 96 % et donc, très largement, la
 * moyenne. Ces évaluations sont opposables : Switching Formation est un
 * organisme Qualiopi.
 *
 * Le remède est celui déjà éprouvé sur Word : distinguer deux natures d'écart.
 *
 *   • `pasEncore` — la valeur observée est NEUTRE (champ vide, message pas
 *     encore ouvert, réglage à son défaut) ou visiblement EN ROUTE vers la
 *     réponse (préfixe de ce qui est attendu). L'apprenant n'a pas fini ; il ne
 *     s'est pas trompé. Le juge en fait un `no_…`, que `frappe.ts` traite en
 *     passage obligé : rien n'est compté, rien n'est perdu.
 *
 *   • `contredit` — la valeur observée est POSITIVEMENT autre chose : un
 *     transfert au lieu d'une réponse, une adresse en clair là où la copie
 *     cachée était exigée, un message rangé dans le mauvais dossier. Là, un
 *     geste a été fait, et il est faux. Le juge en fait un `wrong_…`, qui coûte
 *     le point du premier essai.
 *
 * ⚠️ POURQUOI LE PRÉFIXE COMPTE POUR `pasEncore`, ET PAS POUR DE LA CLÉMENCE.
 * La surface d'Outlook émet un état à CHAQUE FRAPPE : `onChange` d'un champ de
 * saisie, pas une validation par Entrée comme le tableur d'Excel. Sans cette
 * règle, un apprenant qui tape correctement « vitrine » se voyait reprocher
 * « v », puis « vi », puis « vit »… — six reproches et une proposition d'aide
 * avant la septième lettre, qui validait. C'est le défaut que Samuel a filmé le
 * 05/08/2026, et c'est le plus humiliant du lot : le simulateur propose de
 * montrer la réponse à quelqu'un qui est en train de l'écrire juste.
 *
 * Une frappe en cours n'est donc JAMAIS un écart contredit. Une frappe qui
 * DIVERGE de tout ce qui est accepté l'est.
 */

export type GraviteEcart = "pasEncore" | "contredit"

/** Un écart constaté, et ce qu'il vaut. `null` = tout est conforme. */
export type Souci = { texte: string; gravite: GraviteEcart }

const pasEncore = (texte: string): Souci => ({ texte, gravite: "pasEncore" })
const contredit = (texte: string): Souci => ({ texte, gravite: "contredit" })

/**
 * `obtenu` est-il une frappe EN COURS vers `attendu` ?
 *
 * Comparaison sur les formes normalisées : la casse et les accents ne font pas
 * d'un apprenant qui tape juste un apprenant qui se trompe.
 */
function versLaReponse(obtenu: string, attendu: string): boolean {
  const o = normaliser(obtenu)
  const a = normaliser(attendu)
  return o.length > 0 && o.length < a.length && a.startsWith(o)
}

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
): Souci | null {
  const eu = dedupe(obtenu ?? []).map(normAdresse)
  const veut = dedupe(attendu.contient ?? []).map(normAdresse)

  /*
   * Une adresse « en route » est soit une adresse attendue déjà saisie, soit le
   * début de l'une d'elles. Le champ se remplit une adresse à la fois et lettre
   * à lettre : `["client@atelier.fr", "coll"]` est un apprenant qui compose
   * correctement, pas un apprenant qui se trompe.
   */
  const enRoute = (a: string) => veut.includes(a) || veut.some((w) => versLaReponse(a, w))
  const composeEncore = eu.every(enRoute)

  // Une adresse interdite ne s'y trouve pas par inadvertance : elle y a été
  // mise. C'est la faute que la leçon corrige — elle doit coûter, et elle prime
  // sur une adresse simplement manquante, même déclarée après.
  for (const inter of (attendu.absent ?? []).map(normAdresse)) {
    if (eu.includes(inter)) return contredit(`${libelle} : « ${inter} » ne devrait pas y figurer.`)
  }
  for (const v of veut) {
    if (!eu.includes(v)) {
      return composeEncore
        ? pasEncore(`${libelle} : « ${v} » n'y figure pas encore.`)
        : contredit(`${libelle} : « ${v} » n'y figure pas.`)
    }
  }
  if ((attendu.mode ?? "exact") === "exact") {
    const surplus = eu.find((a) => !veut.includes(a))
    if (surplus) {
      return veut.some((w) => versLaReponse(surplus, w))
        ? pasEncore(`${libelle} : « ${surplus} » n'est pas encore une adresse complète.`)
        : contredit(`${libelle} : « ${surplus} » est en trop.`)
    }
    if (attendu.contient && eu.length !== veut.length) {
      return composeEncore
        ? pasEncore(`${libelle} : le compte n'y est pas encore.`)
        : contredit(`${libelle} : le compte n'y est pas.`)
    }
  }
  if (attendu.vide && eu.length > 0) return contredit(`${libelle} devrait rester vide.`)
  return null
}

function verifierTexte(
  obtenu: string | undefined,
  attendu: TexteAttendu,
  libelle: string,
): Souci | null {
  const n = normaliser(obtenu)
  if (attendu.nonVide && !n) return pasEncore(`${libelle} est encore vide.`)
  if (attendu.prefixe) {
    const p = attendu.prefixe === "RE" ? /^(re|rep|rép)\s*:/ : /^(tr|fwd|tf)\s*:/
    if (!p.test(n)) {
      /*
       * Le préfixe ne se tape pas : il est posé par le GESTE — Répondre écrit
       * « RE : », Transférer écrit « TR : ». Un objet vide n'a donc rien de
       * fautif : la rédaction n'est pas encore ouverte, ou le champ est en cours
       * de saisie. Mais un objet REMPLI sans le préfixe attendu veut dire que le
       * préfixe posé par le geste a été effacé, ou qu'un autre bouton a été
       * cliqué. Dans les deux cas un geste a eu lieu, et il est faux.
       */
      return n
        ? contredit(`${libelle} ne porte pas le préfixe attendu.`)
        : pasEncore(`${libelle} ne porte pas encore le préfixe attendu.`)
    }
  }
  if (attendu.accept?.length) {
    if (!attendu.accept.some((a) => normaliser(a) === n)) {
      // Une saisie en cours vers l'une des écritures acceptées n'est pas une
      // erreur : c'est une réponse juste qu'on n'a pas fini d'écrire.
      return attendu.accept.some((a) => versLaReponse(n, a)) || !n
        ? pasEncore(`${libelle} n'est pas encore complet.`)
        : contredit(`${libelle} ne correspond pas à ce qui est demandé.`)
    }
  }
  if (attendu.contient?.length) {
    const manque = attendu.contient.find((c) => !n.includes(normaliser(c)))
    // Un fragment exigé dans un texte que l'apprenant rédige librement ne peut
    // pas être « contredit » : il est présent ou pas encore écrit.
    if (manque) return pasEncore(`${libelle} devrait mentionner « ${manque} ».`)
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
 *
 * ⚠️ TOUT ÉCART DE PROSE EST `pasEncore`, SAUF UN INTERDIT. Une notion absente
 * d'un texte que l'apprenant écrit au fil des touches n'est pas une faute : elle
 * n'est pas encore écrite. Ce qui se paie, c'est d'avoir écrit ce que la
 * consigne demandait justement de ne pas écrire.
 */
function verifierCorps(obtenu: string | undefined, attendu: CorpsAttendu): Souci | null {
  const n = normaliser(obtenu)

  for (const notion of attendu.notions ?? []) {
    if (!notion.oneOf.some((f) => n.includes(normaliser(f)))) {
      return pasEncore(`Le message ne dit pas encore : ${notion.libelle}.`)
    }
  }
  for (const inter of attendu.interdit ?? []) {
    if (inter.oneOf.some((f) => n.includes(normaliser(f)))) {
      return contredit(`À retirer du message : ${inter.libelle}.`)
    }
  }
  if (attendu.salutation?.length && !attendu.salutation.some((s) => n.includes(normaliser(s)))) {
    return pasEncore("Le message ne commence pas par une formule d'appel.")
  }
  if (attendu.cloture?.length && !attendu.cloture.some((s) => n.includes(normaliser(s)))) {
    return pasEncore("Le message ne se termine pas par une formule de politesse.")
  }
  if (attendu.minMots) {
    const mots = n ? n.split(" ").filter(Boolean).length : 0
    if (mots < attendu.minMots) {
      return pasEncore(`Le message est trop court (${mots} mots sur ${attendu.minMots} attendus).`)
    }
  }
  return null
}

function verifierPieces(
  obtenu: PieceJointe[] | undefined,
  attendu: PiecesAttendues,
): Souci | null {
  const liste = obtenu ?? []
  const eu = liste.map((p) => normaliser(p.nom))

  /*
   * ⚠️ CE QUI EST EN TROP PRIME SUR CE QUI MANQUE.
   *
   * L'ordre naturel — chercher d'abord la pièce attendue — faisait passer « il a
   * joint le mauvais devis » pour « le bon devis manque », donc pour un simple
   * « pas encore ». Or joindre un fichier est un geste posé : en joindre un autre
   * est une faute, pas un travail inachevé. Six points du barème s'évanouissaient
   * dans cette seule inversion.
   */
  for (const i of attendu.absent ?? []) {
    if (eu.includes(normaliser(i))) {
      return contredit(`La pièce jointe « ${i} » ne devrait pas être là.`)
    }
  }
  if (attendu.aucune && eu.length) {
    return contredit("Ce message ne devrait porter aucune pièce jointe.")
  }
  if ((attendu.mode ?? "exact") === "exact" && attendu.contient) {
    const attendues = attendu.contient
    const surplus = liste.find((p) => !attendues.some((v) => normaliser(v) === normaliser(p.nom)))
    if (surplus) return contredit(`La pièce jointe « ${surplus.nom} » est en trop.`)
  }
  for (const v of attendu.contient ?? []) {
    // Joindre est un geste unique : la pièce est là ou elle ne l'est pas encore.
    if (!eu.includes(normaliser(v))) return pasEncore(`La pièce jointe « ${v} » manque.`)
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
export function verifierMessage(etat: EtatOutlook, attendu: MessageAttendu): Souci | null {
  const cible = attendu.cible ?? "redaction"
  const r = cible === "envoye" ? dernierEnvoye(etat) : etat.redaction

  if (!r) {
    return pasEncore(
      cible === "envoye"
        ? "Aucun message n'a encore été envoyé."
        : "Aucun message n'est en cours de rédaction.",
    )
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
    /*
     * Un genre faux n'arrive pas tout seul : un bouton a été cliqué, et c'est le
     * mauvais. C'est même l'erreur la plus fréquente de la messagerie
     * professionnelle — transférer au lieu de répondre — donc celle qui doit
     * coûter, sinon la leçon ne mesure rien.
     */
    return contredit(`Ce n'est pas ${noms[attendu.genre]}.`)
  }

  const controles = [
    attendu.a ? verifierAdresses(r.a, attendu.a, "Destinataires") : null,
    attendu.cc ? verifierAdresses(r.cc, attendu.cc, "Copie") : null,
    attendu.cci ? verifierAdresses(r.cci, attendu.cci, "Copie cachée") : null,
    attendu.objet ? verifierTexte(r.objet, attendu.objet, "L'objet") : null,
    attendu.corps ? verifierCorps(r.corps, attendu.corps) : null,
    attendu.pieces ? verifierPieces(r.pieces, attendu.pieces) : null,
  ]
  /*
   * ⚠️ UN CONTREDIT PRIME SUR UN PAS-ENCORE, quel que soit l'ordre des champs.
   *
   * Sans cette priorité, une enveloppe où le collègue est en clair dans « Cc »
   * — la faute même que la leçon corrige — passait pour un simple « le corps ne
   * dit pas encore le délai », donc gratuite, dès lors qu'un champ suivant
   * n'était pas rempli. C'est un ordre d'affichage qui décidait de la note.
   */
  const souci = controles.find((c) => c?.gravite === "contredit") ?? controles.find(Boolean)
  if (souci) return souci

  if (attendu.importance && r.importance !== attendu.importance) {
    // « normale » est le réglage par défaut : ne pas l'avoir changé n'est pas
    // avoir choisi autre chose.
    return r.importance === "normale"
      ? pasEncore("L'importance du message n'a pas encore été réglée.")
      : contredit("L'importance du message n'est pas celle demandée.")
  }
  return null
}

function dernierEnvoye(etat: EtatOutlook): Message | null {
  if (etat.dernierEnvoi) return etat.dernierEnvoi
  const envoyes = etat.messages.filter((m) => m.dossier === "envoyes")
  return envoyes.length ? envoyes[envoyes.length - 1] : null
}

/** État de la boîte : rangement, lu/non lu, indicateurs, catégories. */
export function verifierBoite(etat: EtatOutlook, attendu: BoiteAttendue): Souci | null {
  for (const [id, att] of Object.entries(attendu.messages ?? {})) {
    const m = trouver(etat, id)
    // Le message a disparu de la boîte : personne ne supprime par inadvertance.
    if (!m) return contredit("Le message attendu n'est plus dans la boîte.")
    if (att.dossier && m.dossier !== att.dossier) {
      const nom = etat.dossiers.find((d) => d.id === att.dossier)?.nom ?? att.dossier
      const ou = etat.dossiers.find((d) => d.id === m.dossier)?.nom ?? m.dossier
      /*
       * La boîte de réception est le lieu de repos par défaut d'un message :
       * l'y trouver encore, c'est ne pas avoir rangé. Le trouver dans un TROISIÈME
       * dossier, c'est l'avoir rangé au mauvais endroit — un geste fait, et faux.
       */
      return m.dossier === "reception"
        ? pasEncore(`« ${m.objet} » n'a pas encore été rangé dans ${nom}.`)
        : contredit(`« ${m.objet} » est dans ${ou} au lieu de ${nom}.`)
    }
    if (att.lu !== undefined && m.lu !== att.lu) {
      // Non lu est l'état d'arrivée ; marquer lu est un geste.
      return att.lu
        ? pasEncore(`« ${m.objet} » n'est pas encore marqué comme lu.`)
        : contredit(`« ${m.objet} » ne devrait pas être marqué comme lu.`)
    }
    if (att.indicateur !== undefined && m.indicateur !== att.indicateur) {
      return att.indicateur
        ? pasEncore(`« ${m.objet} » ne porte pas encore d'indicateur de suivi.`)
        : contredit(`« ${m.objet} » porte encore un indicateur.`)
    }
    if (att.categories) {
      const manque = att.categories.find((c) => !m.categories.includes(c))
      if (manque) {
        const nom = etat.categories.find((c) => c.id === manque)?.nom ?? manque
        return pasEncore(`« ${m.objet} » n'est pas encore classé dans la catégorie ${nom}.`)
      }
    }
  }
  if (attendu.dossierActif && etat.dossierActif !== attendu.dossierActif) {
    // Se déplacer dans l'arborescence ne se paie jamais : le socle classe déjà
    // `o:selectFolder` en navigation, et l'état doit dire la même chose.
    return pasEncore("Ce n'est pas encore le bon dossier qui est ouvert.")
  }
  if (attendu.dossierExiste) {
    const manque = attendu.dossierExiste.find(
      (n) => !etat.dossiers.some((d) => normaliser(d.nom) === normaliser(n)),
    )
    if (manque) return pasEncore(`Le dossier « ${manque} » n'a pas encore été créé.`)
  }
  if (attendu.visibles) {
    const vus = messagesVisibles(etat)
      .map((m) => m.id)
      .sort()
    const veut = [...attendu.visibles].sort()
    if (vus.join("|") !== veut.join("|")) {
      // Une liste filtrée se construit lettre à lettre dans la recherche.
      return pasEncore("La liste affichée ne correspond pas encore à ce qui est demandé.")
    }
  }
  return null
}

export function verifierCalendrier(etat: EtatOutlook, attendu: CalendrierAttendu): Souci | null {
  const ev =
    etat.evenements.find((x) => normaliser(x.titre) === normaliser(attendu.titre ?? "")) ??
    (attendu.titre ? null : etat.evenements[etat.evenements.length - 1])
  if (!ev) {
    /*
     * Aucun rendez-vous portant ce titre. Deux cas très différents : le
     * formulaire n'est pas encore rempli — l'apprenant tape son titre lettre à
     * lettre —, ou un rendez-vous a bel et bien été enregistré sous un AUTRE
     * titre, ce qui est un geste posé et faux.
     */
    const enCours =
      etat.rendezVous !== null ||
      etat.evenements.length === 0 ||
      (attendu.titre ? etat.evenements.some((x) => versLaReponse(x.titre, attendu.titre!)) : false)
    const texte = attendu.titre
      ? `Aucun rendez-vous « ${attendu.titre} » au calendrier.`
      : "Aucun rendez-vous n'a été créé."
    return enCours ? pasEncore(texte) : contredit(texte)
  }
  /*
   * À partir d'ici le rendez-vous EXISTE : ses champs ont été saisis et
   * enregistrés. Une date, une heure ou un lieu qui diffèrent ne sont pas des
   * champs « pas encore remplis » — ce sont des valeurs posées, et fausses.
   */
  if (attendu.date && ev.date !== attendu.date) return contredit("Le rendez-vous n'est pas au bon jour.")
  if (attendu.debut && ev.debut !== attendu.debut) return contredit("L'heure de début n'est pas la bonne.")
  if (attendu.fin && ev.fin !== attendu.fin) return contredit("L'heure de fin n'est pas la bonne.")
  if (attendu.lieu && normaliser(ev.lieu) !== normaliser(attendu.lieu)) {
    return normaliser(ev.lieu)
      ? contredit("Le lieu n'est pas celui demandé.")
      : pasEncore("Le lieu n'a pas encore été renseigné.")
  }
  if (attendu.reunion !== undefined && ev.reunion !== attendu.reunion) {
    return attendu.reunion
      ? pasEncore("Aucun participant n'a été invité : ce n'est pas encore une réunion.")
      : contredit("Ce rendez-vous ne devait pas être une réunion.")
  }
  if (attendu.participants) {
    const souci = verifierAdresses(ev.participants, attendu.participants, "Participants")
    if (souci) return souci
  }
  return null
}

export function verifierRegle(etat: EtatOutlook, attendu: RegleAttendue): Souci | null {
  const r = etat.regles[etat.regles.length - 1]
  if (!r) return pasEncore("Aucune règle n'a été créée.")
  if (attendu.condition?.champ && r.condition.champ !== attendu.condition.champ) {
    return contredit("La règle ne se déclenche pas sur le bon critère.")
  }
  if (attendu.condition?.valeur && normaliser(r.condition.valeur) !== normaliser(attendu.condition.valeur)) {
    return versLaReponse(r.condition.valeur, attendu.condition.valeur)
      ? pasEncore("Le critère de la règle n'est pas encore complet.")
      : contredit("Le critère de la règle n'est pas celui demandé.")
  }
  if (attendu.action?.type && r.action.type !== attendu.action.type) {
    return contredit("La règle ne fait pas ce qui est demandé.")
  }
  if (attendu.action?.dossier && r.action.dossier !== attendu.action.dossier) {
    return contredit("La règle ne range pas dans le bon dossier.")
  }
  return null
}

export function verifierReponseAuto(etat: EtatOutlook, attendu: ReponseAutoAttendue): Souci | null {
  const ra = etat.reponseAuto
  if (attendu.active === false) {
    return ra?.active ? contredit("La réponse automatique est encore active.") : null
  }
  if (!ra?.active) return pasEncore("La réponse automatique n'est pas activée.")
  if (attendu.message) {
    const souci = verifierCorps(ra.message, attendu.message)
    if (souci) return souci
  }
  if (attendu.du && ra.du !== attendu.du) return contredit("La date de début n'est pas la bonne.")
  if (attendu.au && ra.au !== attendu.au) return contredit("La date de fin n'est pas la bonne.")
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
