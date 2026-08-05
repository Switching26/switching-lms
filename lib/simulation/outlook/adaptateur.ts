/**
 * OUTLOOK, vu comme une application du simulateur.
 *
 * Ce fichier remplit le contrat `AdaptateurApp` (§3 du contrat multi-app). Chaque
 * méthode correspond à un `switch` qu'il aurait fallu, sans ce contrat, étendre
 * dans un fichier partagé — et l'oubli d'un seul `case` produit un atelier MUET :
 * pas de ligne « Attendu : … », pas de carte de franchissement, pas de réponse au
 * cinquième essai, pas de cible de démonstration.
 *
 * ═══ RÈGLE D'IMPORT (règle 4 de `check-frontieres.ts`) ═══
 *
 * Un adaptateur d'application ne prend de la couture que des TYPES. Aucun import
 * de valeur vers `validate` / `attendu` / `demonstration` / `expurge` / `frappe` :
 * cela refermerait le cycle `registre → adaptateur → couture`, dont le symptôme
 * serait un adaptateur `undefined` au chargement — donc, sur la route de
 * correction serveur, une évaluation jugée par personne.
 *
 * ═══ CE QUI DISTINGUE OUTLOOK D'EXCEL, ET SIMPLIFIE TOUT ═══
 *
 * La surface est du DOM, pas un canvas. Là où Excel doit calculer la géométrie
 * d'une cellule depuis le squelette d'Univer (`getCellRect`), il suffit ici de
 * désigner un `data-control` : le calque de démonstration sait déjà résoudre une
 * cible `dom`. C'est pourquoi aucune cible de ce fichier n'est géométrique.
 */

import type {
  ActionApp,
  AdaptateurApp,
  CibleGenerique,
  ContexteDemo,
  EtapeApp,
  ObservationApp,
  PlanDemo,
  Verdict,
} from "../contrats"
import type { GesteDemo } from "../demonstration"
import type {
  BoiteAttendue,
  CalendrierAttendu,
  MessageAttendu,
  OutlookAction,
  RegleAttendue,
  ReponseAutoAttendue,
} from "./actions"
import type { EtatOutlook, OutlookObservation } from "./observations"
import type { Souci } from "./document"

import {
  CONTROLES,
  normaliser,
  verifierBoite,
  verifierCalendrier,
  verifierMessage,
  verifierRegle,
  verifierReponseAuto,
} from "./document"

/* ═══════════════════ CE QUE LA SURFACE ÉMET ═══════════════════ */

/**
 * Gestes que `CourrierSurface` ÉMET réellement.
 *
 * ⚠️ Une action absente de cet ensemble rend l'étape injouable : l'apprenant
 * fait exactement ce qu'on lui demande et rien ne se passe. C'est ce qui a fait
 * retirer `CLICK_CELL_MODIFIER` d'Excel — il y figurait sur une supposition non
 * testée, et Ctrl+clic n'émet rien du tout.
 *
 * Les neuf ci-dessous ont été émis et jugés dans un vrai navigateur pendant le
 * spike du 04/08/2026, sur trois formats. Ce qu'une surface émet se PROUVE, il
 * ne se déduit pas d'un nom de type.
 */
const OBSERVABLES_OUTLOOK: ReadonlySet<string> = new Set<string>([
  "O_SELECT_MESSAGE",
  "O_SELECT_FOLDER",
  "O_CLICK_CONTROL",
  "O_TYPE_TEXT",
  "O_EXPECT_MAIL",
  "O_EXPECT_BOITE",
  "O_EXPECT_CALENDRIER",
  /*
   * ⚠️ `O_EXPECT_REGLE` et `O_EXPECT_REPONSE_AUTO` sont VOLONTAIREMENT ABSENTS.
   *
   * Le moteur sait les juger — `verifierRegle` et `verifierReponseAuto` sont
   * écrits, éprouvés et piégés. Mais `CourrierSurface` ne rend PAS encore les
   * boîtes de dialogue « Règles » et « Réponses automatiques » : aucun geste ne
   * peut donc produire l'état qu'elles attendent.
   *
   * Les déclarer ici les rendrait citables par un scénario, et l'étape serait
   * INJOUABLE : l'apprenant ferait exactement ce qu'on lui demande sans que rien
   * ne se passe. C'est le défaut exact qui a fait retirer `CLICK_CELL_MODIFIER`
   * des observables d'Excel — il y figurait sur une supposition non testée.
   *
   * Le rapport du spike était d'ailleurs explicite : ces deux primitives portent
   * « ✅ moteur », jamais « ✅ navigateur ».
   *
   * À rétablir en même temps que leur interface, pas avant. `check-controles.ts`
   * refuse un libellé sans bouton rendu, ce qui rend l'oubli impossible.
   */
])

/**
 * `data-control` → libellé lisible.
 *
 * Sans eux, « Attendu : un clic sur le bouton indiqué » est tautologique et
 * n'apprend rien — c'est le défaut qui occupait 239 étapes d'Excel avant que
 * `LIBELLE_CONTROLE` ne soit écrit.
 */
const LIBELLES_OUTLOOK: Readonly<Record<string, string>> = {
  [CONTROLES.nouveau]: "Nouveau message",
  [CONTROLES.repondre]: "Répondre",
  [CONTROLES.repondreTous]: "Répondre à tous",
  [CONTROLES.transferer]: "Transférer",
  [CONTROLES.envoyer]: "Envoyer",
  [CONTROLES.abandonner]: "Abandonner le message",
  [CONTROLES.joindre]: "Joindre un fichier",
  [CONTROLES.afficherCci]: "Afficher le champ Cci",
  [CONTROLES.supprimer]: "Supprimer",
  [CONTROLES.indicateur]: "Indicateur de suivi",
  // Rendu par le ruban depuis qu'il existe : le libellé doit suivre, sinon la
  // ligne « Attendu : … » retombe sur « le bouton indiqué », qui n'apprend rien.
  [CONTROLES.nonLu]: "Marquer comme non lu",
  [CONTROLES.deplacer]: "Déplacer vers un dossier",
  /*
   * `cr-regles` et `cr-reponse-auto` n'ont PAS de libellé ici : la
   * surface ne les rend pas encore. Un libellé sans bouton laisserait croire
   * qu'un scénario peut les exiger, et l'étape serait injouable.
   * `check-controles.ts` fait respecter les deux sens de cette règle.
   */
  [CONTROLES.nouveauRdv]: "Nouveau rendez-vous",
  [CONTROLES.enregistrerRdv]: "Enregistrer le rendez-vous",
  [CONTROLES.accepter]: "Accepter l'invitation",
  [CONTROLES.refuser]: "Refuser l'invitation",
  [CONTROLES.provisoire]: "Répondre provisoirement",
  [CONTROLES.recherche]: "Rechercher",
  "cr-vue-courrier": "Courrier",
  "cr-vue-calendrier": "Calendrier",
  "cr-champ-a": "le champ « À »",
  "cr-champ-cc": "le champ « Cc »",
  "cr-champ-cci": "le champ « Cci »",
  "cr-champ-objet": "le champ « Objet »",
  "cr-champ-corps": "le corps du message",
}

/** Nom lisible d'un champ de rédaction, pour les phrases déduites. */
const NOM_CHAMP: Record<string, string> = {
  a: "le champ « À »",
  cc: "le champ « Cc »",
  cci: "le champ « Cci »",
  objet: "l'objet",
  corps: "le corps du message",
  recherche: "la zone de recherche",
}

/**
 * Libellé d'un contrôle, avec repli sur les identifiants paramétrés.
 *
 * `cr-message-<id>`, `cr-dossier-<id>` et `cr-fichier-<nom>` sont construits à la
 * volée : les énumérer serait impossible, mais les laisser sans nom rendrait la
 * ligne « Attendu : … » muette là où elle sert le plus.
 */
function libelleControle(id: string | undefined): string {
  // `undefined` est un cas réel : en évaluation notée l'action arrive expurgée,
  // et une phrase déduite doit rester juste quand tous les champs ont disparu.
  if (!id) return "le bouton indiqué"
  const direct = LIBELLES_OUTLOOK[id]
  if (direct) return direct
  if (id.startsWith("cr-dossier-")) return "le dossier indiqué"
  if (id.startsWith("cr-message-")) return "le message indiqué"
  if (id.startsWith("cr-fichier-")) return "le fichier indiqué"
  if (id.startsWith("cr-categorie-")) return "la catégorie indiquée"
  return "le bouton indiqué"
}

/* ═══════════════════ LE JUGE ═══════════════════ */

const OK: Verdict = { ok: true }
const KO = (reason: string, message: string): Verdict => ({ ok: false, reason, message })

/**
 * Rendre le verdict d'une validation d'ÉTAT — la porte du barème d'Outlook.
 *
 * 🔴 LE PRÉFIXE DU MOTIF DÉCIDE SI LE POINT EST PERDU. Ce n'est pas une
 * convention cosmétique : `frappe.ts` traite un `no_…` sur une étape jugée sur
 * l'état comme un PASSAGE OBLIGÉ — rien n'est compté — et un `wrong_…` comme une
 * faute. Composer une enveloppe demande plusieurs gestes ; chacun émet l'état
 * complet, et pénaliser ces états intermédiaires punirait un apprenant qui fait
 * exactement ce qu'on lui demande, mais pas encore entièrement.
 *
 * La distinction vient donc de `Souci.gravite`, calculée par les vérificateurs
 * de `document.ts`, seuls à connaître ce qui est neutre et ce qui est posé.
 * Avant qu'elle existe, TOUT écart d'état rendait `wrong_…`, ce qui obligeait à
 * neutraliser la classe entière côté socle — et laissait 4 % du barème perdable.
 */
function surEtat(
  obs: OutlookObservation,
  verifier: (etat: EtatOutlook) => Souci | null,
  motif: string,
): Verdict {
  if (obs.kind !== "o:etatChange") return KO(`no_${motif}`, "")
  const souci = verifier(obs.etat)
  if (!souci) return OK
  return souci.gravite === "contredit"
    ? KO(`wrong_${motif}`, souci.texte)
    : KO(`no_${motif}`, souci.texte)
}

/**
 * Confronte l'observation à l'action attendue.
 *
 * Même rôle que `validateStep` côté Excel : c'est le juge UNIQUE, employé par la
 * correction immédiate du navigateur COMME par la correction serveur d'une
 * évaluation notée. Deux implémentations divergentes finiraient par rendre deux
 * verdicts sur le même geste — et la divergence serait silencieuse.
 *
 * Rend `null` sur un type qui n'est pas `O_*` : sans ce `null`, l'adaptateur
 * volerait le verdict d'Excel.
 */
function juger(step: EtapeApp, observed: ObservationApp): Verdict | null {
  const attendu = step.action as unknown as OutlookAction
  const obs = observed as unknown as OutlookObservation

  switch (attendu.type) {
    /*
     * ⚠️ CES MESSAGES NE PARTENT QU'EN LEÇON ET EN EXERCICE.
     *
     * En évaluation notée, la correction passe par `/api/simulations/…/verify`,
     * qui REMPLACE le texte par une phrase constante avant de répondre. Ils
     * peuvent donc nommer le bouton ou le champ concerné sans rien divulguer
     * d'un examen — c'est le même partage que `validateStep` côté Excel.
     *
     * Le message VIDE, lui, a un sens précis : « ce geste ne concerne pas cette
     * étape ». Le noyau le lit comme un tâtonnement silencieux, et se taire est
     * alors voulu — sans quoi l'atelier réprimanderait un apprenant qui explore
     * sa boîte. Ne jamais remplir un `no_…` pour « faire parler » l'atelier.
     */
    case "O_CLICK_CONTROL":
      if (obs.kind !== "o:control") return KO("no_control", "")
      return obs.control === attendu.control
        ? OK
        : KO(
            "wrong_control",
            `Ce bouton n'est pas celui attendu ici : l'étape demande ${libelleControle(attendu.control)}.`,
          )

    case "O_SELECT_MESSAGE":
      if (obs.kind !== "o:selectMessage") return KO("no_message_selection", "")
      return obs.id === attendu.id
        ? OK
        : KO(
            "wrong_message",
            "Ce n'est pas le message demandé : vérifiez l'expéditeur et l'objet dans la liste avant d'ouvrir.",
          )

    case "O_SELECT_FOLDER":
      if (obs.kind !== "o:selectFolder") return KO("no_folder_selection", "")
      return obs.dossier === attendu.dossier
        ? OK
        : KO("wrong_folder", "Ce n'est pas le dossier demandé : reprenez la liste des dossiers, à gauche.")

    case "O_TYPE_TEXT": {
      if (obs.kind !== "o:typed") return KO("no_typing", "")
      if (attendu.champ && obs.champ !== attendu.champ) {
        // Le texte est peut-être juste : c'est l'endroit qui ne l'est pas. Le
        // dire évite de faire réécrire une saisie correcte.
        return KO(
          "wrong_field",
          `Cette saisie n'est pas au bon endroit : elle est attendue dans ${NOM_CHAMP[attendu.champ] ?? "le champ indiqué"}.`,
        )
      }
      const n = normaliser(obs.text)
      const ok = attendu.accept.some((a) =>
        attendu.contient ? n.includes(normaliser(a)) : normaliser(a) === n,
      )
      return ok
        ? OK
        : KO(
            "wrong_text",
            attendu.contient
              ? "Il manque ce que la consigne demande de mentionner dans cette saisie."
              : "Ce n'est pas le texte attendu ici : relisez la consigne, l'orthographe compte.",
          )
    }

    /* Les cinq validations d'ÉTAT. Toutes lisent le même objet : l'état complet
       du client de messagerie, transmis tel quel par `o:etatChange`. C'est ce
       qui rend la correction serveur triviale — il n'y a rien à relire
       ailleurs, contrairement à Excel où il faut interroger le moteur Univer. */
    case "O_EXPECT_MAIL":
      return surEtat(obs, (etat) => verifierMessage(etat, attendu.message), "message_state")

    case "O_EXPECT_BOITE":
      return surEtat(obs, (etat) => verifierBoite(etat, attendu.boite), "mailbox_state")

    case "O_EXPECT_CALENDRIER":
      return surEtat(obs, (etat) => verifierCalendrier(etat, attendu.calendrier), "calendar_state")

    case "O_EXPECT_REGLE":
      return surEtat(obs, (etat) => verifierRegle(etat, attendu.regle), "rule")

    case "O_EXPECT_REPONSE_AUTO":
      return surEtat(obs, (etat) => verifierReponseAuto(etat, attendu.reponseAuto), "autoreply")

    default: {
      /*
       * « Ce n'est pas mon type. »
       *
       * L'exhaustivité de l'union Outlook est garantie ICI, et nulle part
       * ailleurs : `validate.ts:874` protège Excel, chaque application pose le
       * sien dans son adaptateur (contrat §2.d). Ajouter une variante à
       * `OutlookAction` sans la juger casse donc la compilation à cette ligne.
       */
      const _exhaustif: never = attendu
      void _exhaustif
      return null
    }
  }
}

/* ═══════════════════ CE QUE L'ATELIER DIT ═══════════════════
 *
 * Les quatre fonctions ci-dessous sont DÉDUITES de l'action, jamais rédigées
 * étape par étape. Avec ~1 100 étapes attendues, une phrase écrite à la main par
 * étape est ingérable et se périme au premier changement de scénario — c'est le
 * raisonnement qui a produit `attendu.ts` côté Excel après l'audit du 29/07.
 *
 * ⚠️ EN ÉVALUATION NOTÉE, CES FONCTIONS REÇOIVENT UNE ACTION EXPURGÉE.
 * `publier()` ne laisse alors passer que le `type` : les phrases doivent donc
 * rester justes — et muettes sur la réponse — quand tous les champs sont
 * absents. C'est le mécanisme qui se protège lui-même, à condition de ne jamais
 * supposer qu'un champ est présent.
 */

/** Ligne « Attendu : … » sous la consigne. */
function attenduDe(action: ActionApp): string | null {
  const a = action as unknown as OutlookAction
  switch (a.type) {
    case "O_SELECT_MESSAGE":
      return "le message demandé, ouvert dans le volet de lecture"
    case "O_SELECT_FOLDER":
      return "le dossier demandé, ouvert dans la liste"
    case "O_CLICK_CONTROL":
      return a.control ? `un clic sur ${libelleControle(a.control)}` : "un clic sur le bouton indiqué"
    case "O_TYPE_TEXT":
      return a.champ ? `une saisie dans ${NOM_CHAMP[a.champ] ?? "le champ indiqué"}` : "une saisie"
    case "O_EXPECT_MAIL":
      return a.message ? descriptionEnveloppe(a.message) : "le message correctement composé"
    case "O_EXPECT_BOITE":
      return a.boite ? descriptionBoite(a.boite) : "la boîte dans l'état demandé"
    case "O_EXPECT_CALENDRIER":
      return a.calendrier ? descriptionCalendrier(a.calendrier) : "le rendez-vous enregistré"
    case "O_EXPECT_REGLE":
      return "la règle créée, avec son critère et son action"
    case "O_EXPECT_REPONSE_AUTO":
      return a.reponseAuto?.active === false
        ? "la réponse automatique désactivée"
        : "la réponse automatique activée"
    default: {
      const _exhaustif: never = a
      void _exhaustif
      return null
    }
  }
}

/**
 * Décrit l'enveloppe attendue SANS donner les adresses.
 *
 * Nommer les champs à remplir aide ; livrer leur contenu serait donner la
 * réponse. La distinction vaut aussi en leçon : la ligne « Attendu » est un
 * repère de réussite, pas un corrigé.
 */
function descriptionEnveloppe(m: MessageAttendu): string {
  const bouts: string[] = []
  if (m.genre === "reponse") bouts.push("une réponse")
  else if (m.genre === "reponseATous") bouts.push("une réponse à tous")
  else if (m.genre === "transfert") bouts.push("un transfert")
  if (m.a) bouts.push("le destinataire")
  if (m.cc) bouts.push(m.cc.vide ? "aucune copie" : "la copie")
  if (m.cci) bouts.push("la copie cachée")
  if (m.objet) bouts.push("l'objet")
  if (m.pieces) bouts.push(m.pieces.aucune ? "aucune pièce jointe" : "la pièce jointe")
  if (m.corps) bouts.push("le corps du message")
  if (!bouts.length) return "le message correctement composé"
  const cible = m.cible === "envoye" ? "message envoyé" : "message en cours de rédaction"
  return `${cible} : ${bouts.join(", ")}`
}

function descriptionBoite(b: BoiteAttendue): string {
  const bouts: string[] = []
  const messages = Object.values(b.messages ?? {})
  if (messages.some((m) => m.dossier)) bouts.push("le message rangé dans le bon dossier")
  if (messages.some((m) => m.lu !== undefined)) bouts.push("l'état lu / non lu")
  if (messages.some((m) => m.indicateur !== undefined)) bouts.push("l'indicateur de suivi")
  if (messages.some((m) => m.categories?.length)) bouts.push("la catégorie")
  if (b.dossierExiste?.length) bouts.push("le dossier créé")
  if (b.dossierActif) bouts.push("le bon dossier ouvert")
  if (b.visibles) bouts.push("la liste filtrée")
  return bouts.length ? bouts.join(", ") : "la boîte dans l'état demandé"
}

function descriptionCalendrier(c: CalendrierAttendu): string {
  const bouts: string[] = []
  if (c.titre) bouts.push("l'objet")
  if (c.date) bouts.push("le jour")
  if (c.debut || c.fin) bouts.push("les horaires")
  if (c.lieu) bouts.push("le lieu")
  if (c.reunion) bouts.push("les participants invités")
  return bouts.length
    ? `un rendez-vous au calendrier avec ${bouts.join(", ")}`
    : "le rendez-vous enregistré"
}

/**
 * Rappel du geste sur la carte de franchissement.
 *
 * Formulation validée par Samuel le 29/07 pour Excel (« Vous avez saisi =3+2
 * dans A1 ») : on constate ce qui vient d'être fait, au passé, sans féliciter.
 */
function faitDe(action: ActionApp): string | null {
  const a = action as unknown as OutlookAction
  switch (a.type) {
    case "O_SELECT_MESSAGE":
      return "Vous avez ouvert le message"
    case "O_SELECT_FOLDER":
      return "Vous avez ouvert le dossier"
    case "O_CLICK_CONTROL":
      return a.control ? `Vous avez utilisé ${libelleControle(a.control)}` : "Vous avez cliqué le bouton"
    case "O_TYPE_TEXT":
      return a.champ ? `Vous avez renseigné ${NOM_CHAMP[a.champ] ?? "le champ"}` : "Vous avez saisi le texte"
    case "O_EXPECT_MAIL":
      return a.message?.cible === "envoye"
        ? "Vous avez envoyé le message"
        : "Vous avez composé le message"
    case "O_EXPECT_BOITE":
      return "Vous avez mis la boîte en ordre"
    case "O_EXPECT_CALENDRIER":
      return "Vous avez enregistré le rendez-vous"
    case "O_EXPECT_REGLE":
      return "Vous avez créé la règle"
    case "O_EXPECT_REPONSE_AUTO":
      return "Vous avez réglé la réponse automatique"
    default: {
      const _exhaustif: never = a
      void _exhaustif
      return null
    }
  }
}

/**
 * Réponse exacte, révélée au cinquième essai — JAMAIS en évaluation.
 *
 * Le noyau ne l'appelle pas en mode noté (choix Samuel : on y propose « Passer
 * la question », ni réponse ni cible). Les valeurs rendues ici peuvent donc être
 * explicites : c'est le dernier recours d'un apprenant bloqué en leçon.
 */
function reponseDe(action: ActionApp): string | null {
  const a = action as unknown as OutlookAction
  switch (a.type) {
    case "O_CLICK_CONTROL":
      return a.control ? `Cliquez sur ${libelleControle(a.control)}.` : null
    case "O_TYPE_TEXT":
      return a.accept?.length
        ? `Saisissez : ${a.accept[0]}`
        : null
    case "O_SELECT_MESSAGE":
      return "Cliquez sur le message indiqué dans la liste."
    case "O_SELECT_FOLDER":
      return "Cliquez sur le dossier indiqué dans le volet de gauche."
    case "O_EXPECT_MAIL":
      return a.message ? reponseEnveloppe(a.message) : null
    case "O_EXPECT_BOITE":
    case "O_EXPECT_CALENDRIER":
    case "O_EXPECT_REGLE":
    case "O_EXPECT_REPONSE_AUTO":
      // Ces états se construisent par plusieurs gestes : la démonstration animée
      // les montre bien mieux qu'une phrase, qui serait une liste de courses.
      return null
    default: {
      const _exhaustif: never = a
      void _exhaustif
      return null
    }
  }
}

/** Le détail de l'enveloppe, en dernier recours : adresses comprises. */
function reponseEnveloppe(m: MessageAttendu): string | null {
  const bouts: string[] = []
  if (m.a?.contient?.length) bouts.push(`À : ${m.a.contient.join(" ; ")}`)
  if (m.cc?.vide) bouts.push("Cc : à laisser vide")
  else if (m.cc?.contient?.length) bouts.push(`Cc : ${m.cc.contient.join(" ; ")}`)
  if (m.cci?.contient?.length) bouts.push(`Cci : ${m.cci.contient.join(" ; ")}`)
  if (m.objet?.accept?.length) bouts.push(`Objet : ${m.objet.accept[0]}`)
  if (m.pieces?.aucune) bouts.push("Aucune pièce jointe")
  else if (m.pieces?.contient?.length) bouts.push(`Pièce jointe : ${m.pieces.contient.join(" ; ")}`)
  // Le corps ne se dicte pas : ce serait donner une prose à recopier, ce que le
  // modèle refuse par principe. Ses notions restent portées par l'aide de l'étape.
  return bouts.length ? bouts.join(" · ") : null
}

/**
 * L'identifiant RÉEL du champ visé par une saisie.
 *
 * 🔴 `CONTROLES.champ("recherche")` rend `cr-champ-recherche`, qui n'existe
 * dans AUCUN écran : la zone de recherche est rendue avec la constante dédiée
 * `CONTROLES.recherche` (`cr-recherche`), parce qu'elle vit dans l'en-tête de la
 * liste et non dans la fenêtre de rédaction. La convention `cr-champ-<nom>` ne
 * vaut donc que pour les champs de l'enveloppe (à, cc, cci, objet, corps).
 *
 * Conséquence de l'écart, mesurée sur le corpus : les 17 étapes de saisie qui
 * visent la recherche n'avaient de repère NULLE PART — ni halo d'aide, ni
 * démonstration, à aucune taille d'écran. Une étape qui dit « saisissez » sans
 * jamais montrer où n'enseigne rien.
 *
 * On ne devine pas l'identifiant : il est pris dans la table du modèle.
 */
function idDuChamp(champ: string): string {
  return champ === "recherche" ? CONTROLES.recherche : CONTROLES.champ(champ)
}

/**
 * Où poser le halo d'aide et la démonstration.
 *
 * Tout est désigné par `data-control` : la surface étant du DOM, il n'y a
 * aucune géométrie à calculer — contrairement au canvas d'Univer.
 */
function cibleDe(action: ActionApp): CibleGenerique {
  const a = action as unknown as OutlookAction
  switch (a.type) {
    case "O_CLICK_CONTROL":
      return a.control ? { controle: a.control } : {}
    case "O_SELECT_MESSAGE":
      return a.id ? { controle: CONTROLES.message(a.id) } : {}
    case "O_SELECT_FOLDER":
      return a.dossier ? { controle: CONTROLES.dossier(a.dossier) } : {}
    case "O_TYPE_TEXT":
      return a.champ ? { controle: idDuChamp(a.champ) } : {}
    case "O_EXPECT_MAIL":
      return a.message ? cibleEnveloppe(a.message) : {}
    case "O_EXPECT_BOITE":
      return a.boite ? cibleBoite(a.boite) : {}
    case "O_EXPECT_CALENDRIER":
      return { controle: CONTROLES.enregistrerRdv }
    case "O_EXPECT_REGLE":
      return { controle: CONTROLES.regles }
    case "O_EXPECT_REPONSE_AUTO":
      return { controle: CONTROLES.reponseAuto }
    default: {
      const _exhaustif: never = a
      void _exhaustif
      return {}
    }
  }
}

/**
 * Le champ le plus utile à désigner dans une enveloppe attendue.
 *
 * L'ordre suit celui d'un formulaire de rédaction : on montre le premier endroit
 * où l'apprenant doit agir, pas le dernier.
 */
function cibleEnveloppe(m: MessageAttendu): CibleGenerique {
  if (m.cci) return { controle: CONTROLES.champ("cci") }
  if (m.pieces && !m.pieces.aucune) return { controle: CONTROLES.joindre }
  if (m.a) return { controle: CONTROLES.champ("a") }
  if (m.cc) return { controle: CONTROLES.champ("cc") }
  if (m.objet) return { controle: CONTROLES.champ("objet") }
  if (m.corps) return { controle: CONTROLES.champ("corps") }
  return {}
}

function cibleBoite(b: BoiteAttendue): CibleGenerique {
  const messages = Object.values(b.messages ?? {})
  if (messages.some((m) => m.dossier)) return { controle: CONTROLES.deplacer }
  if (messages.some((m) => m.indicateur)) return { controle: CONTROLES.indicateur }
  if (messages.some((m) => m.lu === false)) return { controle: CONTROLES.nonLu }
  if (b.dossierActif) return { controle: CONTROLES.dossier(b.dossierActif) }
  return {}
}

/* ═══════════════════ « MONTREZ-MOI » ═══════════════════ */

/**
 * Plan de la démonstration animée.
 *
 * Toutes les cibles sont `dom` : la surface Outlook est du DOM, donc un
 * `data-control` suffit, et le calque `DemonstrationGeste` sait déjà les
 * résoudre par son `resoudre(cible)`.
 *
 * ⚠️ `presser` fait AGIR le geste pour de bon. C'est ce qui manquait à toutes
 * les étapes d'Excel dont le résultat n'est pas une valeur de cellule : la
 * démonstration promenait le curseur sur le bon bouton et rien ne changeait —
 * un geste sans résultat, c'est-à-dire la définition d'une démonstration
 * incomplète.
 */
function demonstrationDe(action: ActionApp, _ctx: ContexteDemo): PlanDemo | null {
  void _ctx
  const a = action as unknown as OutlookAction
  const dom = (id: string) => ({ k: "dom" as const, sel: `[data-control="${id}"]` })

  switch (a.type) {
    case "O_CLICK_CONTROL": {
      if (!a.control) return null
      return {
        gestes: [
          { cible: dom(a.control), bulle: `Cliquez sur ${libelleControle(a.control)}.`, presser: { id: a.control } },
        ],
        pas: ["cliquer"],
      }
    }

    case "O_SELECT_MESSAGE": {
      if (!a.id) return null
      const id = CONTROLES.message(a.id)
      return {
        gestes: [{ cible: dom(id), bulle: "Ouvrez ce message dans la liste.", presser: { id } }],
        pas: ["ouvrir"],
      }
    }

    case "O_SELECT_FOLDER": {
      if (!a.dossier) return null
      const id = CONTROLES.dossier(a.dossier)
      return {
        gestes: [{ cible: dom(id), bulle: "Ouvrez ce dossier.", presser: { id } }],
        pas: ["ouvrir"],
      }
    }

    case "O_TYPE_TEXT": {
      if (!a.champ || !a.accept?.length) return null
      const id = idDuChamp(a.champ)
      return {
        gestes: [
          {
            cible: dom(id),
            bulle: `Cliquez dans ${NOM_CHAMP[a.champ] ?? "le champ"}, puis saisissez.`,
            frappe: a.accept[0],
          },
        ],
        pas: ["cliquer", "saisir"],
      }
    }

    case "O_EXPECT_MAIL": {
      if (!a.message) return null
      const gestes = gestesEnveloppe(a.message)
      return gestes.length ? { gestes, pas: gestes.map((_, i) => `étape ${i + 1}`) } : null
    }

    /*
     * Les quatre autres états se construisent par des chemins trop variés pour
     * qu'une séquence unique soit honnête : ranger un message peut passer par le
     * ruban ou par le menu du message. Plutôt qu'une démonstration qui montrerait
     * UN chemin en laissant croire qu'il est le seul, on rend `null` — l'aide de
     * l'étape et le halo sur la cible prennent le relais.
     */
    case "O_EXPECT_BOITE":
    case "O_EXPECT_CALENDRIER":
    case "O_EXPECT_REGLE":
    case "O_EXPECT_REPONSE_AUTO":
      return null

    default: {
      const _exhaustif: never = a
      void _exhaustif
      return null
    }
  }
}

/**
 * La séquence de gestes qui compose une enveloppe.
 *
 * L'ordre reproduit celui d'un rédacteur réel : afficher le Cci AVANT de le
 * remplir — sans quoi le champ n'existe pas à l'écran et le geste suivant vise
 * un élément absent, ce qui fait jouer la démonstration à blanc.
 */
function gestesEnveloppe(m: MessageAttendu): GesteDemo[] {
  const gestes: GesteDemo[] = []
  const dom = (id: string) => ({ k: "dom" as const, sel: `[data-control="${id}"]` })

  if (m.cci?.contient?.length) {
    gestes.push({
      cible: dom(CONTROLES.afficherCci),
      bulle: "Le champ Cci est masqué par défaut : affichez-le d'abord.",
      presser: { id: CONTROLES.afficherCci },
    })
  }
  if (m.a?.contient?.length) {
    gestes.push({
      cible: dom(CONTROLES.champ("a")),
      bulle: "Saisissez le destinataire.",
      frappe: m.a.contient.join(" ; "),
    })
  }
  if (m.cc?.contient?.length) {
    gestes.push({
      cible: dom(CONTROLES.champ("cc")),
      bulle: "Mettez cette adresse en copie.",
      frappe: m.cc.contient.join(" ; "),
    })
  }
  if (m.cci?.contient?.length) {
    gestes.push({
      cible: dom(CONTROLES.champ("cci")),
      bulle: "En copie CACHÉE : les autres destinataires ne la verront pas.",
      frappe: m.cci.contient.join(" ; "),
    })
  }
  if (m.objet?.accept?.length) {
    gestes.push({
      cible: dom(CONTROLES.champ("objet")),
      bulle: "Renseignez l'objet.",
      frappe: m.objet.accept[0],
    })
  }
  if (m.pieces?.contient?.length) {
    gestes.push({
      cible: dom(CONTROLES.joindre),
      bulle: "Joignez le fichier demandé.",
      presser: { id: CONTROLES.joindre },
    })
  }
  return gestes
}

/* ═══════════════════ EXPURGATION ═══════════════════ */

/**
 * Ce qui a le droit de partir au navigateur en évaluation NOTÉE.
 *
 * ⚠️ LISTE BLANCHE : on énumère le peu qu'on garde, jamais ce qu'on retire.
 *
 * Côté Excel, l'expurgation prétendait masquer cinq clés dont UNE SEULE
 * existait : les vraies réponses vivaient dans `action.accept` et `action.cells`
 * et partaient intactes dans l'onglet réseau d'une évaluation notée, dans un
 * organisme certifié Qualiopi. Une liste noire ne peut pas être juste, parce
 * qu'elle doit être tenue à jour à chaque champ ajouté ; une liste blanche est
 * fausse dans le bon sens — elle prive l'étape d'un champ, ce qui se voit.
 */
function publierDe(action: ActionApp): Record<string, unknown> | null {
  const a = action as unknown as OutlookAction
  switch (a.type) {
    case "O_SELECT_MESSAGE":
      // La cible d'un clic n'est pas une réponse : sans elle l'étape est
      // injouable, et elle ne divulgue rien que la liste ne montre déjà.
      return { type: a.type, id: a.id }
    case "O_SELECT_FOLDER":
      return { type: a.type, dossier: a.dossier }
    case "O_CLICK_CONTROL":
      return { type: a.type, control: a.control }
    case "O_TYPE_TEXT":
      // On garde le CHAMP visé, jamais les écritures acceptées.
      return { type: a.type, champ: a.champ }
    case "O_EXPECT_MAIL":
    case "O_EXPECT_BOITE":
    case "O_EXPECT_CALENDRIER":
    case "O_EXPECT_REGLE":
    case "O_EXPECT_REPONSE_AUTO":
      // Rien d'autre que le type : l'étape se juge côté serveur.
      return { type: a.type }
    default: {
      const _exhaustif: never = a
      void _exhaustif
      return null
    }
  }
}

/* ═══════════════════ CLASSIFICATION ═══════════════════ */

/**
 * Cette observation est-elle un simple déplacement ?
 *
 * Une navigation ne compte JAMAIS comme une faute. Côté Excel, avoir oublié
 * `selectColumn` et `selectRow` plafonnait une évaluation entière à 95 % : un
 * apprenant qui sélectionnait une ligne avant d'agir — le geste normal — était
 * pénalisé pour l'avoir fait.
 *
 * Chez Outlook, explorer sa boîte est le comportement attendu : ouvrir un
 * message, changer de dossier ou taper dans la recherche ne peut pas coûter de
 * point.
 */
function estNavigationDe(observed: ObservationApp): boolean {
  const o = observed as unknown as OutlookObservation
  if (o.kind === "o:selectFolder") return true
  if (o.kind === "o:selectMessage") return true
  if (o.kind === "o:typed" && o.champ === "recherche") return true
  return false
}

/**
 * Cette étape se juge-t-elle sur l'ÉTAT plutôt que sur le geste ?
 *
 * Sur ces étapes, une frappe juste ne doit pas compter de faute : c'était le
 * premier des trois étages qui plafonnaient 18 évaluations Excel sur 27 — taper
 * la bonne valeur dans la bonne cellule comptait une erreur, avec un flash rouge
 * muet, parce que l'observation n'était pas celle qu'attendait le juge.
 */
function seJugeSurEtatDe(actionType: string): boolean {
  return actionType.startsWith("O_EXPECT_")
}

/**
 * Cette OBSERVATION rapporte-t-elle un état plutôt qu'un geste ?
 *
 * Le symétrique de `seJugeSurEtat`, qui interroge l'action ATTENDUE. Les deux
 * questions sont distinctes : la première dit comment l'étape se juge, la
 * seconde ce que l'observation reçue apporte.
 *
 * Chez Outlook, un seul `kind` transporte un état — `o:etatChange` — et il en
 * transporte l'INTÉGRALITÉ : la boîte, les dossiers, la rédaction en cours. Une
 * enveloppe se compose en plusieurs gestes — afficher le Cci, puis le remplir,
 * puis joindre le devis — et chacun émet cet état. Compter une faute à chaque
 * état intermédiaire punirait un apprenant qui fait exactement ce qu'on lui
 * demande, mais pas encore entièrement.
 *
 * ⚠️ Le noyau testait auparavant les cinq `kind` d'Excel en dur : les
 * observations `o:` n'y figuraient jamais, donc un état non encore satisfait
 * comptait FAUTE. Un parcours PowerPoint parfait sortait à 57 % — mesuré par
 * l'agent PowerPoint, et c'est ce qui a rendu ce prédicat obligatoire.
 *
 * ═══ POURQUOI IL RÉPOND `false` DEPUIS LE 05/08/2026 ═══
 *
 * Répondre `true` envoie l'observation dans une branche de `frappe.ts` dont
 * AUCUNE sortie ne classe en faute : les couples qui y figurent sont ceux
 * d'Excel (`cellClick`/`CLICK_CELL`…), qu'un `kind` préfixé `o:` ne peut jamais
 * satisfaire. C'était donc une AMNISTIE GÉNÉRALE sur tout ce qui se juge sur
 * l'état — soit 281 des 318 points des seize évaluations. Mesuré : **12 points
 * perdables sur 318, 4 %**, contre 70 % pour Excel et 83 % pour Word. Un
 * apprenant qui se trompait partout gardait 96 %.
 *
 * La protection des états intermédiaires — composer une enveloppe demande
 * plusieurs gestes, chacun émettant l'état complet — ne disparaît pas pour
 * autant : elle est simplement portée par le VERDICT au lieu de l'être par une
 * classe entière d'observations. `surEtat` rend `no_…` quand rien n'est encore
 * posé et `wrong_…` quand quelque chose de faux l'est ; `frappe.ts` traite le
 * premier en passage obligé et le second en faute. C'est exactement le remède
 * appliqué à Word, et il tient à la même condition : que les vérificateurs de
 * `document.ts` sachent distinguer le neutre du contredit.
 *
 * Ne pas remettre `true` sans remettre 88 % du barème à zéro.
 */
function estObservationEtatDe(observed: ObservationApp): boolean {
  void observed
  return false
}

/* ═══════════════════ L'ADAPTATEUR ═══════════════════ */

export const adaptateurOutlook: AdaptateurApp = {
  app: "OUTLOOK",
  prefixe: "O_",

  juger,

  attendu: attenduDe,
  fait: faitDe,
  reponse: reponseDe,
  cible: cibleDe,

  demonstration: demonstrationDe,

  publier: publierDe,

  estNavigation: estNavigationDe,
  seJugeSurEtat: seJugeSurEtatDe,
  estObservationEtat: estObservationEtatDe,

  observables: OBSERVABLES_OUTLOOK,
  libellesControles: LIBELLES_OUTLOOK,
}

/**
 * Contrôle de forme à la compilation, sans coût à l'exécution : l'état transporté
 * par `o:etatChange` est bien celui que les vérificateurs savent lire.
 */
const _etatCompatible: (e: EtatOutlook) => void = (e) => {
  void verifierMessage(e, {})
}
void _etatCompatible
