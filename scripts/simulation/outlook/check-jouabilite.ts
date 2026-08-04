/**
 * Les scénarios Outlook sont-ils JOUABLES ?
 *
 *   npx tsx scripts/simulation/outlook/check-jouabilite.ts
 *
 * ═══ CE QUE CE CONTRÔLE ATTRAPE, ET QUE RIEN D'AUTRE NE VOIT ═══
 *
 * Une étape peut être parfaitement valide — bon type, bons champs, contrôle de
 * forme au vert — et rester INJOUABLE : elle attend un geste que la surface
 * n'émet pas, ou un état que le moteur ne sait pas produire. L'apprenant fait
 * exactement ce qu'on lui demande, et rien ne se passe.
 *
 * Le seul moyen de le savoir est de REJOUER. Ce pilote déduit les gestes de
 * l'action attendue, comme le ferait un apprenant qui a compris la consigne, et
 * exige que chaque étape soit franchie.
 *
 * ⚠️ CE QU'IL NE PROUVE PAS : que les boutons existent À L'ÉCRAN, ni que la
 * surface les rend au bon endroit. Il travaille sur le moteur pur. Le rendu se
 * prouve au banc, dans un vrai navigateur — les deux sont nécessaires, et le
 * second ne remplace pas le premier : ici on tient 3 scénarios en une seconde.
 */

import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { adaptateurOutlook } from "../../../lib/simulation/outlook/adaptateur"
import {
  CONTROLES as C,
  appliquerGeste,
  etatInitial,
  normAdresse,
  normaliser,
  type GesteOutlook,
  type SetupOutlook,
} from "../../../lib/simulation/outlook/document"
import type { MessageAttendu, OutlookAction } from "../../../lib/simulation/outlook/actions"
import type { EtatOutlook, OutlookObservation } from "../../../lib/simulation/outlook/observations"

const DOSSIER = join(__dirname, "..", "scenarios", "outlook")

/**
 * La semaine que la grille du calendrier affiche — écrite en dur dans
 * `CourrierSurface`. Un rendez-vous posé en dehors est enregistré par le moteur
 * et n'apparaît nulle part : l'apprenant croit avoir raté son geste.
 */
const SEMAINE_AFFICHEE = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"]

type Etape = {
  id: string
  consigne: string
  action: OutlookAction
  aide?: { text: string }
  points?: number
  setup?: { courrier?: Partial<SetupOutlook> }
}

type Scenario = {
  schemaVersion: number
  title: string
  mode?: "LESSON" | "EXERCISE" | "EVALUATION"
  moduleTitle?: string
  intro?: { title: string; body: string }
  outro?: { body: string }
  courrier: SetupOutlook
  steps: Etape[]
}

const erreurs: string[] = []
const infos: string[] = []

/* ═══════════ LE PILOTE ═══════════ */

/**
 * Les gestes qu'un apprenant ferait pour satisfaire cette action.
 *
 * Volontairement déduits de l'ATTENDU, pas écrits scénario par scénario : c'est
 * ce qui permet au contrôle de suivre le contenu sans être réécrit à chaque
 * ajout d'étape.
 */
function gestesPour(action: OutlookAction, etat: EtatOutlook): GesteOutlook[] {
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
function gestesPourControle(control: string, etat: EtatOutlook): GesteOutlook[] {
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
function gestesEnveloppe(m: MessageAttendu, etat: EtatOutlook): GesteOutlook[] {
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
function objetPour(attendu: NonNullable<MessageAttendu["objet"]>, actuel: string): string | null {
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
function redigerCorps(m: MessageAttendu): string {
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
function observationPour(action: OutlookAction, etat: EtatOutlook): OutlookObservation {
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

/* ═══════════ CONTRÔLE DE FORME ═══════════ */

function controlerForme(s: Scenario, fichier: string) {
  const prefixe = `${fichier}`
  if (s.schemaVersion !== 1) erreurs.push(`${prefixe} : schemaVersion doit valoir 1.`)
  if (!s.courrier) erreurs.push(`${prefixe} : aucune boîte de départ (\`courrier\`).`)
  if (!s.steps?.length) erreurs.push(`${prefixe} : aucune étape.`)

  /*
   * LE BALISAGE NE VAUT QUE DANS UNE CONSIGNE.
   *
   * `**gras**`, `==action==` et `` `code` `` sont rendus par `Consigne`, qui
   * n'habille QUE la bande de consigne. L'écran d'ouverture et l'écran de fin
   * affichent `intro.body` / `outro.body` en texte brut : le balisage y reste
   * visible en clair. Trouvé en REGARDANT une capture de fin de chapitre —
   * aucun compteur ne le voyait, celui du pilote ne mesurant que le bandeau.
   *
   * Ce n'est pas propre à Outlook : sept chapitres Excel PUBLIÉS affichent la
   * même chose (« le **duo de tête** », `=SOMME(Ventes)`…). Le correctif de
   * fond appartient au châssis ; ici, on empêche au moins d'en ajouter.
   */
  for (const bloc of [s.intro, s.outro] as Array<{ title?: string; body?: string } | undefined>) {
    if (!bloc) continue
    const texte = `${bloc.title ?? ""} ${bloc.body ?? ""}`
    const marques = texte.match(/\*\*[^*]+\*\*|==[^=]+==|`[^`]+`/g)
    if (marques?.length) {
      erreurs.push(
        `${prefixe} : balisage dans intro/outro — affiché EN CLAIR à l'écran : ${marques.join(", ")}. ` +
          `Le balisage n'est rendu que dans une consigne ; utiliser des guillemets.`,
      )
    }
  }

  const vus: Record<string, boolean> = {}
  /** Titre de rendez-vous → étape qui l'attend déjà (le calendrier se juge par titre). */
  const titresCalendrier = new Map<string, string>()
  for (const e of s.steps ?? []) {
    if (vus[e.id]) erreurs.push(`${prefixe} : identifiant d'étape en double « ${e.id} ».`)
    vus[e.id] = true

    /*
     * ⚠️ `READ` EST REFUSÉ, ET CE N'EST PAS UN OUBLI DE CE CONTRÔLE.
     *
     * Le socle sait juger un écran de lecture — `validateStep` l'accepte contre
     * une observation `{ kind: "next" }`. Mais `OutlookPlayer` fait dire à son
     * bouton « J'ai compris, continuer » un `{ kind: "o:control", control:
     * "sim-suivant" }` (là où PowerPoint et Excel émettent bien `next`). Vérifié
     * en appelant `jugerEtape` : l'écran rend `read_step_action`, l'étape n'est
     * pas franchie, et c'est le SEUL bouton d'avancement d'un écran de lecture.
     * Un `READ` posé aujourd'hui dans un chapitre Outlook est donc un cul-de-sac.
     *
     * Refuser ici vaut mieux que laisser passer : le contenu ne doit pas
     * contenir d'écran infranchissable, et le message dit où est le correctif.
     * À rouvrir dès qu'`OutlookPlayer` émettra `{ kind: "next" }`.
     */
    if (e.action?.type === "READ") {
      erreurs.push(
        `${prefixe}/${e.id} : écran de lecture (READ) — INJOUABLE en Outlook aujourd'hui. ` +
          `Le bouton « J'ai compris, continuer » émet « o:control/sim-suivant » alors que le ` +
          `socle attend « next » : l'apprenant reste bloqué. Correctif attendu dans ` +
          `OutlookPlayer.tsx (onSuivant).`,
      )
      continue
    }
    if (!e.action?.type?.startsWith("O_")) {
      erreurs.push(`${prefixe}/${e.id} : le type « ${e.action?.type} » ne porte pas le préfixe O_.`)
      continue
    }
    // Une action que la surface n'émet pas rend l'étape injouable.
    if (!adaptateurOutlook.observables.has(e.action.type)) {
      erreurs.push(`${prefixe}/${e.id} : « ${e.action.type} » n'est pas dans les observables.`)
    }
    // Un bouton cité doit exister : sinon l'apprenant cherche un contrôle absent.
    if (e.action.type === "O_CLICK_CONTROL") {
      const id = e.action.control
      const connu =
        Object.prototype.hasOwnProperty.call(adaptateurOutlook.libellesControles, id) ||
        id.startsWith("cr-dossier-") ||
        id.startsWith("cr-message-") ||
        id.startsWith("cr-fichier-") ||
        id.startsWith("cr-categorie-") ||
        id.startsWith("cr-vers-")
      if (!connu) erreurs.push(`${prefixe}/${e.id} : le bouton « ${id} » n'est déclaré nulle part.`)
      /*
       * DÉCLARÉ N'EST PAS CLIQUABLE.
       *
       * `cr-champ-*` porte un libellé et un `data-control`, mais ce sont des
       * CHAMPS DE SAISIE : ils n'émettent qu'à la frappe (`o:typed`), jamais au
       * clic. `cr-retirer-*` émet, lui, une observation `null` — volontairement,
       * pour ne pas juger un retrait de pièce comme un geste attendu. Dans les
       * deux cas, `O_CLICK_CONTROL` attend un `o:control` qui ne viendra jamais.
       *
       * Ce contrôle-ci ne pouvait pas le voir tout seul : son pilote déduit le
       * geste de l'attendu et rejoue par le moteur, où le clic « réussit ».
       * C'est exactement la classe de faux vert qui a coûté neuf boutons morts
       * à Excel. Pour saisir dans un champ, utiliser `O_TYPE_TEXT` ou
       * `O_EXPECT_MAIL`.
       */
      if (id.startsWith("cr-champ-")) {
        erreurs.push(
          `${prefixe}/${e.id} : « ${id} » est un champ de saisie, pas un bouton — un clic n'émet rien. ` +
            `Utiliser O_TYPE_TEXT ou O_EXPECT_MAIL.`,
        )
      }
      if (id.startsWith("cr-retirer-")) {
        erreurs.push(
          `${prefixe}/${e.id} : « ${id} » n'émet aucune observation (retrait de pièce jointe). ` +
            `Juger le résultat avec O_EXPECT_MAIL { pieces: { absent: [...] } }.`,
        )
      }
    }
    /*
     * L'IMPORTANCE EST JUGEABLE MAIS PAS RÉGLABLE.
     *
     * `verifierMessage` sait la contrôler et le moteur sait l'appliquer, mais
     * AUCUN bouton de `CourrierSurface` n'émet le geste : l'apprenant n'a aucun
     * moyen de passer un message en importance haute. Le pilote, lui, appelle le
     * geste directement — donc l'étape passait au vert ici tout en étant
     * infranchissable à l'écran. Même famille que `O_EXPECT_REGLE` et
     * `O_EXPECT_REPONSE_AUTO`, écartés des observables pour cette raison.
     */
    if (e.action.type === "O_EXPECT_MAIL" && e.action.message?.importance) {
      erreurs.push(
        `${prefixe}/${e.id} : l'importance du message n'est réglable par AUCUN bouton de la surface. ` +
          `Étape infranchissable — retirer \`importance\` tant que le contrôle n'existe pas.`,
      )
    }
    /*
     * MÊME FAMILLE : LES CATÉGORIES.
     *
     * `verifierBoite` sait les contrôler, `appliquerGeste` sait les poser, et
     * `CONTROLES.categorie` leur réserve même un identifiant — mais aucune
     * surface ne rend `cr-categorie-*`. Rien ne permet à l'apprenant de classer
     * un message par couleur.
     */
    if (e.action.type === "O_EXPECT_BOITE") {
      const avecCategorie = Object.values(e.action.boite.messages ?? {}).some(
        (m) => (m.categories?.length ?? 0) > 0,
      )
      if (avecCategorie) {
        erreurs.push(
          `${prefixe}/${e.id} : aucune surface ne rend « cr-categorie-* » — les catégories ne sont ` +
            `posables par aucun geste. Étape infranchissable.`,
        )
      }
    }
    /*
     * LE FORMULAIRE DE RENDEZ-VOUS N'A PAS DE CHAMP « PARTICIPANTS ».
     *
     * Il en porte cinq — objet, date, début, fin, lieu — et c'est tout. Le geste
     * `inviter` existe dans le moteur, le pilote l'appelle directement, donc une
     * étape qui exige une RÉUNION passait au vert sans qu'aucun apprenant puisse
     * la franchir.
     *
     * Un seul chemin reste ouvert, et il est légitime : ACCEPTER une invitation
     * reçue. L'événement inscrit au calendrier est alors celui que le scénario a
     * déclaré dans `invitation.evenement`, participants compris. On l'autorise
     * donc à cette condition exacte, vérifiée ici.
     */
    if (e.action.type === "O_EXPECT_CALENDRIER") {
      const c = e.action.calendrier
      if (c.participants || c.reunion === true) {
        const parInvitation = (s.courrier?.messages ?? []).some(
          (m) =>
            m.invitation?.evenement &&
            normaliser(m.invitation.evenement.titre) === normaliser(c.titre ?? ""),
        )
        if (!parInvitation) {
          erreurs.push(
            `${prefixe}/${e.id} : le formulaire de rendez-vous n'a pas de champ « participants » — ` +
              `une réunion ne peut pas être CRÉÉE. Seul chemin jouable : accepter une invitation dont ` +
              `le scénario déclare \`invitation.evenement\` portant ce titre.`,
          )
        }
      }
      /*
       * La grille du calendrier n'affiche qu'UNE semaine, en dur.
       * Un rendez-vous posé ailleurs est bien enregistré… et invisible.
       */
      if (c.date && !SEMAINE_AFFICHEE.includes(c.date)) {
        erreurs.push(
          `${prefixe}/${e.id} : la date « ${c.date} » sort de la semaine affichée par le calendrier ` +
            `(${SEMAINE_AFFICHEE[0]} → ${SEMAINE_AFFICHEE[SEMAINE_AFFICHEE.length - 1]}). ` +
            `Le rendez-vous serait enregistré mais invisible.`,
        )
      }
      /*
       * 🔴 Un rendez-vous se retrouve par son TITRE (`verifierCalendrier`, qui
       * fait un `find` sur le premier titre égal). Deux étapes qui attendent le
       * même titre sont donc indiscernables : la seconde est TOUJOURS jugée sur
       * l'événement de la première.
       *
       * Deux issues, toutes deux mauvaises et de gravité inégale :
       *  · dates différentes → « pas au bon jour » sur une étape pourtant juste ;
       *  · dates identiques  → l'étape PASSE sans que l'apprenant ait rien fait,
       *    exactement une étape fantôme, mais invisible au contrôle fantôme
       *    puisque l'état change bien (par l'autre rendez-vous).
       *
       * Le second cas est celui qui compte : il rendrait vert un chapitre où une
       * journée sur deux n'est jamais bloquée. D'où un titre unique par scénario.
       */
      if (c.titre) {
        const cle = normaliser(c.titre)
        if (titresCalendrier.has(cle)) {
          erreurs.push(
            `${prefixe}/${e.id} : le titre de rendez-vous « ${c.titre} » est déjà attendu par ` +
              `${titresCalendrier.get(cle)}. Le calendrier se juge PAR TITRE : la seconde étape ` +
              `serait jugée sur le rendez-vous de la première, et passerait sans rien prouver si ` +
              `les dates coïncidaient. Donnez un titre distinct à chaque rendez-vous attendu.`,
          )
        } else {
          titresCalendrier.set(cle, e.id)
        }
      }
    }
    if (!e.consigne?.trim()) erreurs.push(`${prefixe}/${e.id} : consigne vide.`)

    /*
     * 🔴 UNE AIDE QUI DÉSIGNE CE QUI N'EXISTE PAS.
     *
     * Défaut réellement produit sur `m09-e01` : pour tuer une étape fantôme,
     * j'avais rendu vague l'objet du message reçu, ce qui laissait une aide
     * affirmant « la référence figure dans le texte du message » — devenue
     * fausse par ricochet. Aucun contrôle ne le voyait : le scénario reste
     * valide, l'étape reste franchissable, et le rejeu passe au vert. Seul
     * l'apprenant butait, en cherchant dans le message une information
     * absente. C'est le pire genre de défaut : invisible à l'outillage,
     * visible uniquement par celui qui apprend.
     *
     * La part mécaniquement vérifiable est la CITATION : un nom de fichier ou
     * une adresse nommée dans une consigne ou une aide doit exister quelque
     * part — dans la boîte de départ, ou dans ce que l'étape attend (une
     * consigne a le droit d'introduire une adresse que l'apprenant va saisir).
     * Le reste — une aide juste mais devenue mensongère — se rattrape en
     * relisant ce qu'on vient de modifier, jamais en relançant un script.
     */
    const cites = `${e.consigne ?? ""} ${e.aide?.text ?? ""}`
    const boiteBrute = JSON.stringify(s.courrier ?? {}).toLowerCase()
    const attenduBrut = JSON.stringify(e.action ?? {}).toLowerCase()
    const existe = (t: string) =>
      boiteBrute.includes(t.toLowerCase()) || attenduBrut.includes(t.toLowerCase())
    for (const adresse of cites.match(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g) ?? []) {
      if (!existe(adresse)) {
        erreurs.push(
          `${prefixe}/${e.id} : l'adresse « ${adresse} » est citée mais ne figure ni dans la ` +
            `boîte de départ ni dans ce que l'étape attend. L'apprenant la chercherait en vain.`,
        )
      }
    }
    for (const fichier of cites.match(/\b[\w-]+\.(?:pdf|jpe?g|png|xlsx|docx|zip)\b/gi) ?? []) {
      if (!existe(fichier)) {
        erreurs.push(
          `${prefixe}/${e.id} : le fichier « ${fichier} » est cité mais n'existe ni dans ` +
            `\`courrier.fichiers\` ni dans les pièces jointes du scénario.`,
        )
      }
    }
  }

  /*
   * Règles pédagogiques, calquées sur `check-couverture` d'Excel.
   *
   * En ÉVALUATION, une aide rédigée n'a pas lieu d'être : le noyau y propose
   * « Passer la question », jamais la réponse ni la cible.
   */
  if (s.mode === "EVALUATION") {
    for (const e of s.steps ?? []) {
      if (e.aide) erreurs.push(`${prefixe}/${e.id} : une évaluation notée ne porte pas d'aide.`)
    }
    /*
     * DÉCISION D7 — la note porte sur l'ENVELOPPE, jamais sur la rédaction libre.
     *
     * Le contrôle par notions constate la présence d'une information ; il ne juge
     * ni le ton, ni la syntaxe, ni la pertinence. Le mettre au barème exposerait
     * à une note contestable sur une rédaction correcte formulée autrement —
     * indéfendable en contrôle Qualiopi.
     */
    for (const e of s.steps ?? []) {
      if (e.action.type !== "O_EXPECT_MAIL") continue
      const corps = e.action.message?.corps
      if (corps && (e.points ?? 1) > 0 && !corps.revueManuelle) {
        erreurs.push(
          `${prefixe}/${e.id} : le corps du message est NOTÉ (${e.points ?? 1} pt). ` +
            `Décision D7 : en évaluation la note porte sur l'enveloppe. Retirer le corps, ` +
            `passer l'étape à 0 point, ou marquer \`revueManuelle\`.`,
        )
      }
    }
  } else {
    // En leçon, le geste doit être MONTRÉ : une consigne sans `==action==` laisse
    // l'apprenant deviner ce qu'on attend de lui.
    if (s.mode === "LESSON") {
      for (const e of s.steps ?? []) {
        if (e.action.type !== "READ" && !/==.+?==/.test(e.consigne)) {
          erreurs.push(`${prefixe}/${e.id} : leçon sans geste mis en évidence (\`==…==\`).`)
        }
      }
    }
    /*
     * D12 — LE GESTE DOIT ÊTRE VISIBLE SANS DÉFILER.
     *
     * Mesuré sur un 390 × 844 : la bande de consigne plafonne à 143 px, soit
     * environ 140 signes lisibles d'un coup. Une consigne peut donc respecter la
     * limite dure de 450 signes et cacher quand même son geste sous le pli —
     * l'apprenant lit un paragraphe de contexte sans savoir ce qu'on attend de
     * lui, et doit faire défiler un bloc de quatre lignes pour le découvrir.
     *
     * La règle : le geste d'abord, le pourquoi ensuite. On mesure la longueur
     * VISIBLE du préfixe — `**` et les accents graves ne s'affichent pas.
     */
    const PLI_MOBILE = 130
    for (const e of s.steps ?? []) {
      const i = e.consigne?.indexOf("==") ?? -1
      if (i < 0) continue
      const avant = e.consigne.slice(0, i).replace(/\*\*|`/g, "").length
      if (avant > PLI_MOBILE) {
        erreurs.push(
          `${prefixe}/${e.id} : le geste commence au ${avant}ᵉ signe — au-delà du pli mobile ` +
            `(${PLI_MOBILE}). Remonter le \`==geste==\` en tête et placer le contexte après.`,
        )
      }
    }
  }
}

/* ═══════════ REJEU ═══════════ */

function rejouer(s: Scenario, fichier: string) {
  let etat = etatInitial(s.courrier)
  let franchies = 0
  const bloquees: string[] = []

  for (const e of s.steps) {
    // Le `setup` d'étape pose l'état imposé au démarrage — même rôle que
    // `setup.poste` côté Excel : sans lui, la reprise ment.
    if (e.setup?.courrier) {
      etat = { ...etat, ...appliquerSetup(etat, e.setup.courrier) }
    }

    /*
     * 🔴 L'ÉTAPE FANTÔME — le défaut que ce contrôle ne pouvait PAS voir.
     *
     * Une étape jugée sur l'état dont l'attendu est DÉJÀ vrai à l'arrivée est
     * infranchissable dans le produit : la surface n'émet un état que lorsque
     * quelque chose CHANGE. L'apprenant lit « À vous de jouer », n'a rien à
     * faire, fait quand même quelque chose — et l'étape ne bouge pas.
     *
     * Ce contrôle-ci ne pouvait pas s'en apercevoir : il fabrique l'observation
     * lui-même et la soumet au juge, donc un attendu déjà satisfait passe au
     * vert. Trois étapes ont franchi cette passoire et n'ont été trouvées qu'au
     * navigateur — toutes des « complétez l'objet » dont l'objet repris par
     * Répondre contenait déjà le mot demandé.
     *
     * On juge donc AVANT de jouer : si c'est déjà bon, c'est une étape morte.
     */
    if (adaptateurOutlook.seJugeSurEtat(e.action.type)) {
      const dejaBon = adaptateurOutlook.juger(
        { id: e.id, action: e.action as unknown as Record<string, unknown> & { type: string } },
        { kind: "o:etatChange", etat } as unknown as { kind: string } & Record<string, unknown>,
      )
      if (dejaBon?.ok) {
        erreurs.push(
          `${fichier}/${e.id} : ÉTAPE FANTÔME — l'attendu est déjà satisfait en arrivant sur l'étape. ` +
            `Rien ne change, donc la surface n'émet aucun état et l'étape est infranchissable. ` +
            `Exiger un geste qui modifie réellement quelque chose.`,
        )
      }
    }

    for (const g of gestesPour(e.action, etat)) etat = appliquerGeste(etat, g)

    const obs = observationPour(e.action, etat)
    const v = adaptateurOutlook.juger(
      { id: e.id, action: e.action as unknown as Record<string, unknown> & { type: string } },
      obs as unknown as { kind: string } & Record<string, unknown>,
    )
    if (v?.ok) franchies += 1
    else bloquees.push(`${e.id} — ${v?.message || v?.reason || "aucun verdict"}`)
  }

  if (franchies === s.steps.length) {
    infos.push(`  ✓ ${fichier} — ${franchies}/${s.steps.length} étapes franchies`)
  } else {
    erreurs.push(`${fichier} : ${franchies}/${s.steps.length} étapes seulement.`)
    for (const b of bloquees) erreurs.push(`  ↳ ${b}`)
  }
}

/** Applique un `setup.courrier` partiel sur l'état courant. */
function appliquerSetup(etat: EtatOutlook, setup: Partial<SetupOutlook>): Partial<EtatOutlook> {
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

/* ═══════════ EXÉCUTION ═══════════ */

const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".json")).sort()
if (!fichiers.length) {
  console.error("✗ aucun scénario Outlook dans scripts/simulation/scenarios/outlook/")
  process.exit(1)
}

let etapes = 0
for (const f of fichiers) {
  const s = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8")) as Scenario
  etapes += s.steps?.length ?? 0
  controlerForme(s, f)
  rejouer(s, f)
}

/* ═══════════ COMPLÉTUDE DE LA SÉRIE ═══════════
 *
 * 🔴 UN MODULE INCOMPLET NE SE VOIT NULLE PART AILLEURS.
 *
 * Chaque scénario peut être parfait isolément, et la formation être trouée : un
 * module sans évaluation, un numéro sauté, un chapitre nommé « e » mais déclaré
 * en LESSON. Rien de tout cela n'apparaît dans le rejeu — mais tout se voit dans
 * le sommaire de l'apprenant, qui liste les chapitres module par module.
 *
 * Le cas s'est produit sur PowerPoint : un module entier livré sans son
 * « S'évaluer ». Ce contrôle raisonne donc sur le PARCOURS, pas sur les fichiers
 * — même esprit que `check-couverture` côté Excel.
 */
{
  type Bilan = { L: number; E: number; V: number; titres: Set<string> }
  const modules: Record<number, Bilan> = {}

  for (const f of fichiers) {
    const mo = /^m(\d+)-(l|e|ev)(\d+)\.json$/.exec(f)
    if (!mo) {
      erreurs.push(
        `${f} : nom hors convention. Attendu \`mNN-lNN.json\`, \`mNN-eNN.json\` ou \`mNN-evNN.json\` — ` +
          `c'est le nom qui donne le module et l'ordre du chapitre dans le sommaire.`,
      )
      continue
    }
    const n = Number(mo[1])
    const genre = mo[2] === "l" ? "L" : mo[2] === "e" ? "E" : "V"
    const s = JSON.parse(readFileSync(join(DOSSIER, f), "utf-8")) as Scenario
    const attendu = genre === "L" ? "LESSON" : genre === "E" ? "EXERCISE" : "EVALUATION"
    if (s.mode !== attendu) {
      erreurs.push(`${f} : nommé « ${mo[2]} » mais déclaré en mode ${s.mode} — le sommaire dira l'inverse du contenu.`)
    }
    const b = (modules[n] ??= { L: 0, E: 0, V: 0, titres: new Set<string>() })
    b[genre as "L" | "E" | "V"] += 1
    b.titres.add(s.moduleTitle ?? "")
  }

  const nums = Object.keys(modules).map(Number).sort((a, b) => a - b)
  if (nums.length) {
    for (let n = 1; n <= nums[nums.length - 1]; n += 1) {
      if (!modules[n]) {
        erreurs.push(`module ${n} MANQUANT : la série va de 1 à ${nums[nums.length - 1]}, un trou se voit dans le sommaire.`)
      }
    }
    for (const n of nums) {
      const b = modules[n]
      const mm = `module ${n} (${[...b.titres][0] || "sans titre"})`
      if (b.V !== 1) erreurs.push(`${mm} : ${b.V} évaluation(s) — il en faut exactement UNE.`)
      if (b.L === 0) erreurs.push(`${mm} : aucune leçon.`)
      if (b.E === 0) erreurs.push(`${mm} : aucun exercice.`)
      if (b.titres.size > 1) {
        erreurs.push(`${mm} : titres de module incohérents — ${[...b.titres].join(" / ")}. Le sommaire les grouperait à part.`)
      }
    }
    infos.push(`  ✓ série : ${nums.length} module(s) de 1 à ${nums[nums.length - 1]}, sans trou, une évaluation chacun`)
  }
}

console.log(`\n${fichiers.length} scénario(s) · ${etapes} étapes`)
for (const i of infos) console.log(i)

if (erreurs.length) {
  console.error(`\n✗ ${erreurs.length} problème(s) :\n`)
  for (const e of erreurs) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log("\n✓ scénarios Outlook : forme, boutons déclarés, règles pédagogiques, et tous rejoués.\n")
