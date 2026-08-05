/**
 * LE PILOTE DE REJEU OUTLOOK — source unique des gestes et des observations.
 *
 * Il déduit de l'ATTENDU d'une étape les gestes qu'un apprenant ferait s'il
 * avait compris la consigne, puis l'observation que la surface émettrait.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE PLUTÔT QU'UNE COPIE DANS CHAQUE CONTRÔLE.
 * `check-jouabilite` demande « cette étape se franchit-elle ? » et
 * `check-note-outlook` demande « ce barème se perd-il ? ». Les deux ont besoin
 * du MÊME parcours canonique : deux copies dériveraient, et le jour où elles
 * dérivent, l'un des deux contrôles mesure un contenu que personne ne joue.
 * C'est la règle du dépôt — une règle partagée de dérivation a une source
 * unique, consommée par le générateur, le contrôle et le banc.
 *
 * Il ne juge RIEN : il produit des gestes et des observations. Le jugement
 * appartient à `adaptateurOutlook` et à `jugerEtape`.
 */

import {
  CONTROLES as C,
  appliquerGeste,
  normAdresse,
  normaliser,
  type GesteOutlook,
  type SetupOutlook,
} from "../../../lib/simulation/outlook/document"
import type { MessageAttendu, OutlookAction } from "../../../lib/simulation/outlook/actions"
import type { EtatOutlook, OutlookObservation } from "../../../lib/simulation/outlook/observations"


/**
 * La semaine que la grille du calendrier affiche — écrite en dur dans
 * `CourrierSurface`. Un rendez-vous posé en dehors est enregistré par le moteur
 * et n'apparaît nulle part : l'apprenant croit avoir raté son geste.
 */
export const SEMAINE_AFFICHEE = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"]

export type Etape = {
  id: string
  consigne: string
  action: OutlookAction
  aide?: { text: string }
  points?: number
  setup?: { courrier?: Partial<SetupOutlook> }
}

export type Scenario = {
  schemaVersion: number
  title: string
  mode?: "LESSON" | "EXERCISE" | "EVALUATION"
  moduleTitle?: string
  intro?: { title: string; body: string }
  outro?: { body: string }
  courrier: SetupOutlook
  steps: Etape[]
}

/* ═══════════ LE PILOTE ═══════════ */

/**
 * Les gestes qu'un apprenant ferait pour satisfaire cette action.
 *
 * Volontairement déduits de l'ATTENDU, pas écrits scénario par scénario : c'est
 * ce qui permet au contrôle de suivre le contenu sans être réécrit à chaque
 * ajout d'étape.
 */
export function gestesPour(action: OutlookAction, etat: EtatOutlook): GesteOutlook[] {
  switch (action.type) {
    case "O_SELECT_MESSAGE":
      return [{ type: "ouvrirMessage", id: action.id }]

    case "O_SELECT_FOLDER":
      return [{ type: "dossier", dossier: action.dossier }]

    case "O_CLICK_CONTROL":
      return gestesPourControle(action.control, etat)

    case "O_TYPE_TEXT": {
      const val = action.accept[0] ?? ""
      if (action.champ === "recherche") return [{ type: "recherche", texte: val }]
      if (action.champ === "a" || action.champ === "cc" || action.champ === "cci") {
        return [{ type: "destinataires", champ: action.champ, valeur: val }]
      }
      return [{ type: "champ", champ: action.champ, valeur: val }]
    }

    case "O_EXPECT_MAIL":
      return gestesEnveloppe(action.message, etat)

    case "O_EXPECT_BOITE": {
      const gestes: GesteOutlook[] = []
      for (const [id, att] of Object.entries(action.boite.messages ?? {})) {
        if (att.lu !== false) gestes.push({ type: "ouvrirMessage", id })
        if (att.dossier) gestes.push({ type: "deplacer", id, dossier: att.dossier })
        if (att.lu === false) gestes.push({ type: "marquerLu", id, lu: false })
        if (att.indicateur) gestes.push({ type: "indicateur", id, valeur: true })
        for (const c of att.categories ?? []) gestes.push({ type: "categoriser", id, categorie: c })
      }
      if (action.boite.dossierActif) {
        gestes.push({ type: "dossier", dossier: action.boite.dossierActif })
      }
      return gestes
    }

    case "O_EXPECT_CALENDRIER": {
      const c = action.calendrier
      /*
       * DEUX CHEMINS MÈNENT À UN ÉVÉNEMENT AU CALENDRIER, ET LE PILOTE DOIT
       * PRENDRE CELUI QUE L'APPRENANT PEUT PRENDRE.
       *
       * Accepter une invitation reçue inscrit l'événement déclaré par le
       * scénario — participants compris, ce que le formulaire de rendez-vous ne
       * sait pas faire. Créer d'office aurait produit un événement SANS
       * participants et fait échouer une étape parfaitement jouable.
       */
      const invite = etat.messages.find(
        (m) =>
          m.invitation?.evenement &&
          m.invitation.reponse === "aucune" &&
          normaliser(m.invitation.evenement.titre) === normaliser(c.titre ?? ""),
      )
      if (invite) {
        return [
          { type: "ouvrirMessage", id: invite.id },
          { type: "repondreInvitation", id: invite.id, reponse: "accepte" },
        ]
      }
      const gestes: GesteOutlook[] = [{ type: "vue", vue: "calendrier" }, { type: "nouveauRendezVous" }]
      if (c.titre) gestes.push({ type: "champRdv", champ: "titre", valeur: c.titre })
      if (c.date) gestes.push({ type: "champRdv", champ: "date", valeur: c.date })
      if (c.debut) gestes.push({ type: "champRdv", champ: "debut", valeur: c.debut })
      if (c.fin) gestes.push({ type: "champRdv", champ: "fin", valeur: c.fin })
      if (c.lieu) gestes.push({ type: "champRdv", champ: "lieu", valeur: c.lieu })
      if (c.participants?.contient?.length) {
        gestes.push({ type: "inviter", valeur: c.participants.contient.join("; ") })
      }
      gestes.push({ type: "enregistrerRdv" })
      return gestes
    }

    case "O_EXPECT_REGLE": {
      const r = action.regle
      if (!r.condition?.champ || !r.action?.type) return []
      return [
        {
          type: "creerRegle",
          regle: {
            condition: { champ: r.condition.champ, valeur: r.condition.valeur ?? "" },
            action: { type: r.action.type, dossier: r.action.dossier, categorie: r.action.categorie },
          },
        },
      ]
    }

    case "O_EXPECT_REPONSE_AUTO": {
      const ra = action.reponseAuto
      const notions = (ra.message?.notions ?? []).map((n) => n.oneOf[0] ?? "").join(", ")
      return [
        {
          type: "reponseAuto",
          reponseAuto: {
            active: ra.active !== false,
            du: ra.du,
            au: ra.au,
            message: notions || "Je suis absente.",
          },
        },
      ]
    }

    default:
      return []
  }
}

/** Le geste correspondant à un bouton du ruban. */
export function gestesPourControle(control: string, etat: EtatOutlook): GesteOutlook[] {
  if (control === C.nouveau) return [{ type: "nouveauMessage" }]
  if (control === C.repondre) return [{ type: "repondre" }]
  if (control === C.repondreTous) return [{ type: "repondreATous" }]
  if (control === C.transferer) return [{ type: "transferer" }]
  if (control === C.afficherCci) return [{ type: "afficherCci" }]
  if (control === C.envoyer) return [{ type: "envoyer" }]
  if (control === C.abandonner) return [{ type: "abandonner" }]
  if (control === C.enregistrerRdv) return [{ type: "enregistrerRdv" }]
  if (control === C.nouveauRdv) return [{ type: "nouveauRendezVous" }]
  if (control === C.supprimer && etat.messageActif) {
    return [{ type: "supprimer", id: etat.messageActif }]
  }
  if (control === C.indicateur && etat.messageActif) {
    return [{ type: "indicateur", id: etat.messageActif }]
  }
  if (control.startsWith("cr-vue-")) {
    const v = control.slice("cr-vue-".length) as EtatOutlook["vue"]
    return [{ type: "vue", vue: v }]
  }
  if (control.startsWith("cr-dossier-")) {
    return [{ type: "dossier", dossier: control.slice("cr-dossier-".length) }]
  }
  if (control.startsWith("cr-message-")) {
    return [{ type: "ouvrirMessage", id: control.slice("cr-message-".length) }]
  }
  return []
}

/**
 * Composer l'enveloppe demandée.
 *
 * Ouvre d'abord la bonne fenêtre — répondre, transférer ou nouveau message —
 * puis remplit champ par champ. L'ordre compte : le Cci doit être AFFICHÉ avant
 * d'être rempli, exactement comme pour un apprenant.
 */
export function gestesEnveloppe(m: MessageAttendu, etat: EtatOutlook): GesteOutlook[] {
  const gestes: GesteOutlook[] = []

  /*
   * Le pilote suit son propre état au fil des gestes qu'il pousse.
   *
   * Sans cela, il ne peut composer un objet qu'à l'aveugle. Or ce qu'il faut
   * taper dépend de ce qui est DÉJÀ là : « Répondre » a préfixé l'objet de
   * « RE : », l'étape précédente en a peut-être posé un, et la consigne ne
   * demande souvent qu'un mot de plus. Un apprenant lit le champ avant de le
   * compléter ; le pilote doit faire pareil.
   */
  let courant = etat
  const pousser = (g: GesteOutlook) => {
    gestes.push(g)
    courant = appliquerGeste(courant, g)
  }

  if (!etat.redaction) {
    /*
     * À QUEL MESSAGE RÉPOND-ON ? UN APPRENANT LE DÉDUIT DE SA CONSIGNE.
     *
     * Le pilote prenait « le message actif, sinon le premier de la boîte ». Au
     * deuxième exercice d'un chapitre, le message actif est celui du PREMIER
     * exercice : il répondait donc à la mauvaise personne et l'étape échouait,
     * sur un contenu parfaitement jouable.
     *
     * Une réponse s'adresse à l'expéditeur : on cherche donc le message dont
     * l'expéditeur figure parmi les destinataires attendus. Pour un transfert,
     * ce raisonnement ne vaut pas — le destinataire est un tiers — et c'est la
     * pièce jointe attendue qui désigne le message d'origine.
     */
    const veut = (m.a?.contient ?? []).map(normAdresse)
    const parExpediteur =
      m.genre !== "transfert" && veut.length
        ? etat.messages.find((x) => veut.includes(normAdresse(x.de)) && x.dossier !== "envoyes")?.id
        : undefined
    const attendue = m.pieces?.contient?.[0]
    const parPiece = attendue
      ? etat.messages.find((x) => x.pieces.some((p) => normaliser(p.nom) === normaliser(attendue)))?.id
      : undefined
    const source =
      parExpediteur ?? parPiece ?? etat.messageActif ?? etat.messages.find((x) => x.dossier === "reception")?.id
    // Un apprenant OUVRE le message avant d'y répondre : le pilote fait de même,
    // sans quoi il emprunterait un chemin que la surface ne propose pas.
    if (source && source !== etat.messageActif) pousser({ type: "ouvrirMessage", id: source })
    if (m.genre === "transfert") pousser({ type: "transferer", id: source })
    else if (m.genre === "reponseATous") pousser({ type: "repondreATous", id: source })
    else if (m.genre === "reponse") pousser({ type: "repondre", id: source })
    else if (source && m.cible !== "redaction") pousser({ type: "repondre", id: source })
    else pousser({ type: "nouveauMessage" })
  }

  if (m.a?.contient?.length) {
    pousser({ type: "destinataires", champ: "a", valeur: m.a.contient.join("; ") })
  }
  if (m.a?.vide) pousser({ type: "destinataires", champ: "a", valeur: "" })
  if (m.cc?.contient?.length) {
    pousser({ type: "destinataires", champ: "cc", valeur: m.cc.contient.join("; ") })
  }
  if (m.cc?.vide) pousser({ type: "destinataires", champ: "cc", valeur: "" })
  if (m.cci?.contient?.length) {
    // Le champ Cci est masqué par défaut : l'afficher AVANT de le remplir.
    pousser({ type: "afficherCci" })
    pousser({ type: "destinataires", champ: "cci", valeur: m.cci.contient.join("; ") })
  }
  if (m.cci?.vide) pousser({ type: "destinataires", champ: "cci", valeur: "" })
  if (m.objet) {
    const vise = objetPour(m.objet, courant.redaction?.objet ?? "")
    if (vise !== null) pousser({ type: "champ", champ: "objet", valeur: vise })
  }
  for (const p of m.pieces?.contient ?? []) pousser({ type: "joindre", nom: p })
  /*
   * RETIRER une pièce est un geste à part entière, et il est jouable.
   *
   * La croix ✕ de la pièce jointe n'émet pourtant AUCUNE observation propre —
   * c'est voulu, un retrait n'est pas un geste attendu en soi. Mais sur une
   * étape jugée sur l'ÉTAT, le player émet de toute façon l'état complet : le
   * retrait est donc vu et jugé. C'est ce qui rend enseignable « un transfert
   * emporte les pièces du message d'origine — retirez celle qui ne regarde pas
   * ce destinataire ».
   */
  for (const p of m.pieces?.absent ?? []) {
    if (courant.redaction?.pieces.some((x) => normaliser(x.nom) === normaliser(p))) {
      pousser({ type: "retirerPiece", nom: p })
    }
  }
  if (m.corps) pousser({ type: "champ", champ: "corps", valeur: redigerCorps(m) })
  if (m.importance) pousser({ type: "importance", valeur: m.importance })

  // `cible: "envoye"` juge le message PARTI : il faut donc l'envoyer.
  if (m.cible === "envoye") pousser({ type: "envoyer" })

  return gestes
}

/**
 * L'objet qu'un apprenant taperait, à partir de celui qui est déjà dans le champ.
 *
 * ⚠️ NE PAS SE CONTENTER D'`accept`. Un contenu bien écrit n'impose une
 * formulation exacte que lorsqu'elle est vraiment exigée : le plus souvent la
 * consigne demande qu'un mot FIGURE dans l'objet (`contient`), et laisse
 * l'apprenant écrire sa phrase — c'est la règle « plusieurs écritures
 * acceptées ». Une première version du pilote ne remplissait le champ que sur
 * `accept` : toute étape écrite proprement échouait, et le seul moyen de faire
 * verdir le contrôle aurait été de DURCIR le contenu jusqu'à refuser des objets
 * corrects. Un contrôle qui pousse à dégrader ce qu'il vérifie est un contrôle
 * qui ment.
 *
 * Renvoie `null` quand il n'y a rien à taper — l'objet en place convient déjà.
 */
export function objetPour(attendu: NonNullable<MessageAttendu["objet"]>, actuel: string): string | null {
  if (attendu.accept?.length) return attendu.accept[0]

  let objet = actuel
  let touche = false

  // Le préfixe vient normalement de « Répondre » ou « Transférer ». On ne le
  // remet à la main que s'il manque vraiment, pour ne pas produire « RE : RE : ».
  if (attendu.prefixe) {
    const pose = attendu.prefixe === "RE" ? /^(re|rep|rép)\s*:/ : /^(tr|fwd|tf)\s*:/
    if (!pose.test(normaliser(objet))) {
      objet = `${attendu.prefixe} : ${objet}`.trim()
      touche = true
    }
  }
  for (const frag of attendu.contient ?? []) {
    if (normaliser(objet).includes(normaliser(frag))) continue
    objet = objet.trim() ? `${objet} — ${frag}` : frag
    touche = true
  }
  if (attendu.nonVide && !objet.trim()) {
    objet = "Objet du message"
    touche = true
  }
  return touche ? objet : null
}

/**
 * Fabrique une prose qui satisfait les notions attendues.
 *
 * On prend la PREMIÈRE formulation de chaque notion : si le contenu déclare des
 * variantes, la première doit suffire. C'est aussi ce qui rend le contrôle
 * sensible — une notion dont aucune formulation ne passe se voit tout de suite.
 */
export function redigerCorps(m: MessageAttendu): string {
  const c = m.corps
  if (!c) return ""
  const bouts: string[] = []
  bouts.push(c.salutation?.[0] ?? "Bonjour")
  for (const n of c.notions ?? []) bouts.push(n.oneOf[0] ?? "")

  // 🔴 Le remplissage doit SUIVRE le plancher demandé, pas l'inverse.
  //
  // Une version antérieure ajoutait UNE phrase neutre fixe : la prose plafonnait
  // alors à ~18 mots avec des notions courtes, et toute étape exigeant davantage
  // échouait ici alors que le contenu était juste. Un apprenant qui énonce trois
  // informations écrit sans effort 25 à 40 mots ; c'était donc l'outil qui
  // bridait la consigne, et « corriger » revenait à abaisser l'exigence
  // pédagogique pour faire verdir un script.
  //
  // Le remplissage reste délibérément neutre et sans engagement : il ne doit
  // jamais satisfaire une notion par accident, ni déclencher un `interdit`.
  const NEUTRE = "le dossier est suivi par nos soins et nous restons à votre disposition"
  const compter = (t: string) => t.split(/\s+/).filter(Boolean).length
  const plancher = c.minMots ?? 0
  const cloture = c.cloture?.[0] ?? "Cordialement"
  let garde = 0
  do {
    bouts.push(NEUTRE)
    garde += 1
  } while (compter([...bouts, cloture].join(" ")) < plancher && garde < 20)
  bouts.push(cloture)
  return bouts.filter(Boolean).join(", ") + "."
}

/** L'observation que la surface émettrait après ces gestes. */
export function observationPour(action: OutlookAction, etat: EtatOutlook): OutlookObservation {
  /*
   * Un écran de LECTURE ne s'observe pas comme un geste : le socle n'accepte
   * que `{ kind: "next" }`, et c'est ce que le bouton « J'ai compris, continuer »
   * émet depuis le 05/08/2026. Le rejeu doit envoyer la MÊME chose que le
   * player, sinon il validerait un écran que l'apprenant ne peut pas franchir —
   * ou refuserait celui qu'il franchit.
   */
  if ((action as { type: string }).type === "READ") {
    return { kind: "next" } as unknown as OutlookObservation
  }
  switch (action.type) {
    case "O_SELECT_MESSAGE":
      return { kind: "o:selectMessage", id: action.id }
    case "O_SELECT_FOLDER":
      return { kind: "o:selectFolder", dossier: action.dossier }
    case "O_CLICK_CONTROL":
      return { kind: "o:control", control: action.control }
    case "O_TYPE_TEXT":
      return { kind: "o:typed", champ: action.champ, text: action.accept[0] ?? "" }
    default:
      return { kind: "o:etatChange", etat }
  }
}

/** Applique un `setup.courrier` partiel sur l'état courant. */
export function appliquerSetup(etat: EtatOutlook, setup: Partial<SetupOutlook>): Partial<EtatOutlook> {
  const patch: Partial<EtatOutlook> = {}
  if (setup.vue) patch.vue = setup.vue
  if (setup.dossierActif) patch.dossierActif = setup.dossierActif
  if (setup.messageActif !== undefined) {
    patch.messageActif = setup.messageActif
    // Poser le message actif implique qu'il a été ouvert, donc lu : sinon la
    // consigne « le message est maintenant marqué comme lu » serait fausse à la
    // reprise, et l'étape suivante injouable.
    if (setup.messageActif) {
      patch.messages = etat.messages.map((m) =>
        m.id === setup.messageActif ? { ...m, lu: true } : m,
      )
    }
  }
  return patch
}
