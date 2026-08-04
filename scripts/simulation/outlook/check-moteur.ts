/**
 * Contrôle du moteur Outlook — fidélité, jugement, pièges, expurgation.
 *
 *   npx tsx scripts/simulation/outlook/check-moteur.ts
 *
 * ═══ CE QUE CE CONTRÔLE FAIT DE PLUS QU'UN TEST ORDINAIRE ═══
 *
 * Il ne se contente PAS de vérifier que les bons gestes passent : un contrôle
 * écrit depuis l'implémentation qu'il contrôle confirmera toujours cette
 * implémentation (contrat §7). Il PIÈGE le moteur avec les fautes que la
 * formation doit attraper — au premier rang desquelles la copie cachée placée en
 * copie visible, qui expose une adresse interne au client.
 *
 * Il porte aussi trois CONTRE-PIÈGES : une bonne réponse écrite autrement doit
 * rester acceptée. Refuser une réponse correcte est la pire faute d'un
 * simulateur pédagogique, bien pire que d'en accepter une approximative.
 *
 * ⚠️ Ce contrôle juge par L'ADAPTATEUR, pas par les fonctions internes. C'est le
 * chemin réellement emprunté en production — par la correction immédiate du
 * navigateur comme par la route de correction serveur d'une évaluation notée.
 *
 * DONNÉES : intégralement fictives. Le domaine `atelier-nord.fr` et ses
 * correspondants sont inventés pour la formation.
 */

import { adaptateurOutlook } from "../../../lib/simulation/outlook/adaptateur"
import { jugerEtape } from "../../../lib/simulation/frappe"
import {
  appliquerGeste,
  etatInitial,
  prefiller,
  prefixerObjet,
  type GesteOutlook,
  type SetupOutlook,
} from "../../../lib/simulation/outlook/document"
import type { OutlookAction } from "../../../lib/simulation/outlook/actions"
import type { EtatOutlook } from "../../../lib/simulation/outlook/observations"

let ok = 0
const echecs: string[] = []

function verifie(titre: string, condition: boolean) {
  if (condition) ok += 1
  else echecs.push(titre)
}

/* ═══════════ LA BOÎTE DE DÉPART ═══════════ */

const DEPART: SetupOutlook = {
  compte: { nom: "Camille Aubertin", adresse: "camille.aubertin@atelier-nord.fr" },
  dossiers: [
    { id: "clients", nom: "Clients 2026" },
    { id: "fournisseurs", nom: "Fournisseurs" },
  ],
  fichiers: [
    { nom: "Devis-2026-118.pdf", taille: "184 Ko" },
    { nom: "Plaquette-atelier.pdf", taille: "2,1 Mo" },
  ],
  signatures: [
    { id: "pro", nom: "Professionnelle", contenu: "Camille Aubertin\nAtelier Nord — Menuiserie" },
  ],
  signatureParDefaut: "pro",
  messages: [
    {
      id: "m-devis",
      dossier: "reception",
      de: "l.marchand@bureau-verrier.fr",
      a: ["camille.aubertin@atelier-nord.fr"],
      objet: "Demande de devis — aménagement de l'accueil",
      corps: "Bonjour,\n\nPourriez-vous nous adresser un devis, en précisant le délai de livraison ?",
      date: "2026-03-02T08:41",
      lu: false,
    },
    {
      id: "m-reunion",
      dossier: "reception",
      de: "n.perrot@atelier-nord.fr",
      a: ["camille.aubertin@atelier-nord.fr", "s.brunel@atelier-nord.fr"],
      objet: "Point de production — jeudi",
      corps: "Merci de me confirmer votre présence.",
      date: "2026-03-02T07:55",
      lu: false,
      invitation: {
        reponse: "aucune",
        evenement: {
          id: "ev-prod",
          titre: "Point de production",
          date: "2026-03-05",
          debut: "09:30",
          fin: "10:30",
          lieu: "Salle Ambre",
          participants: ["n.perrot@atelier-nord.fr"],
          reunion: true,
        },
      },
    },
    {
      id: "m-facture",
      dossier: "reception",
      de: "compta@quincaillerie-delmas.fr",
      a: ["camille.aubertin@atelier-nord.fr"],
      objet: "Facture QD-4471",
      corps: "Veuillez trouver ci-joint la facture.",
      date: "2026-03-01T16:12",
      lu: true,
      pieces: [{ nom: "QD-4471.pdf", taille: "96 Ko" }],
    },
    {
      id: "m-pub",
      dossier: "reception",
      de: "offres@promo-outillage.net",
      a: ["camille.aubertin@atelier-nord.fr"],
      objet: "-40 % cette semaine seulement !!!",
      corps: "Profitez de nos offres exceptionnelles.",
      date: "2026-03-01T05:03",
      lu: false,
    },
  ],
}

/** Rejoue une suite de gestes depuis l'état de départ. */
function rejouer(gestes: GesteOutlook[], depart: SetupOutlook = DEPART): EtatOutlook {
  let e = etatInitial(depart)
  for (const g of gestes) e = appliquerGeste(e, g)
  return e
}

/** Juge une action contre un état, par l'adaptateur — le vrai chemin. */
function juge(action: OutlookAction, etat: EtatOutlook) {
  return adaptateurOutlook.juger(
    { id: "T", action: action as unknown as Record<string, unknown> & { type: string } },
    { kind: "o:etatChange", etat } as unknown as { kind: string } & Record<string, unknown>,
  )
}

/* ═══════════ 1. FIDÉLITÉ D'OUTLOOK ═══════════
   Ces règles SONT la matière enseignée. Un simulateur qui les prend à l'envers
   enseigne faux, et l'apprenant reproduira l'erreur au bureau. */

{
  const e = rejouer([{ type: "ouvrirMessage", id: "m-facture" }])
  const m = e.messages.find((x) => x.id === "m-facture")!
  verifie("ouvrir un message le marque comme lu", m.lu === true)

  const rep = prefiller(e, m, "reponse")
  verifie("répondre : le destinataire est l'expéditeur", rep.a.length === 1 && rep.a[0] === m.de)
  verifie("répondre : AUCUNE pièce jointe reprise", rep.pieces.length === 0)
  verifie("répondre : objet préfixé RE", /^RE :/.test(rep.objet))

  const tr = prefiller(e, m, "transfert")
  verifie("transférer : les pièces jointes SUIVENT", tr.pieces.length === 1)
  verifie("transférer : aucun destinataire pré-rempli", tr.a.length === 0)
  verifie("transférer : objet préfixé TR", /^TR :/.test(tr.objet))
}

{
  // Répondre à tous : on reprend les destinataires visibles, MOINS soi-même, et
  // JAMAIS les copies cachées du message reçu — on ne les voit pas.
  const e = etatInitial({
    ...DEPART,
    messages: [
      {
        id: "x",
        de: "chef@atelier-nord.fr",
        a: ["camille.aubertin@atelier-nord.fr", "tiers@ext.fr"],
        cc: ["copie@ext.fr"],
        cci: ["cache@secret.fr"],
        objet: "Réunion",
      },
    ],
  })
  const m = e.messages[0]
  const ra = prefiller(e, m, "reponseATous")
  verifie(
    "répondre à tous : reprend expéditeur + destinataires visibles",
    ra.a.includes("chef@atelier-nord.fr") && ra.a.includes("tiers@ext.fr"),
  )
  verifie(
    "répondre à tous : ne se remet PAS soi-même en destinataire",
    !ra.a.includes("camille.aubertin@atelier-nord.fr"),
  )
  verifie("répondre à tous : reprend le Cc", ra.cc.includes("copie@ext.fr"))
  verifie(
    "répondre à tous : ne révèle JAMAIS une copie cachée reçue",
    !ra.a.includes("cache@secret.fr") &&
      !ra.cc.includes("cache@secret.fr") &&
      !ra.cci.includes("cache@secret.fr"),
  )
  verifie("le préfixe ne se double pas", prefixerObjet("RE : Réunion", "RE") === "RE : Réunion")
}

{
  const e = rejouer([{ type: "supprimer", id: "m-pub" }])
  verifie(
    "supprimer déplace vers les éléments supprimés",
    e.messages.find((m) => m.id === "m-pub")!.dossier === "supprimes",
  )
}

{
  const e = rejouer([{ type: "nouveauMessage" }, { type: "envoyer" }])
  verifie("envoyer sans destinataire est refusé ET expliqué", e.redaction !== null && !!e.alerte)
}

/* ═══════════ 2. LE PIÈGE CENTRAL : Cc AU LIEU DE Cci ═══════════
   Si le moteur laisse passer le collègue en copie VISIBLE, la formation valide
   une faute professionnelle réelle : le client voit l'adresse interne. */

const ATTENDU_CCI: OutlookAction = {
  type: "O_EXPECT_MAIL",
  message: {
    cible: "redaction",
    a: { contient: ["l.marchand@bureau-verrier.fr"] },
    cc: { vide: true },
    cci: { contient: ["s.brunel@atelier-nord.fr"] },
  },
}

{
  const bon = rejouer([
    { type: "ouvrirMessage", id: "m-devis" },
    { type: "repondre", id: "m-devis" },
    { type: "afficherCci" },
    { type: "destinataires", champ: "cci", valeur: "s.brunel@atelier-nord.fr" },
  ])
  verifie("PARCOURS JUSTE : collègue en Cci → accepté", juge(ATTENDU_CCI, bon)?.ok === true)

  // ── Le piège. Même intention, mauvais champ. ──
  const piege = rejouer([
    { type: "ouvrirMessage", id: "m-devis" },
    { type: "repondre", id: "m-devis" },
    { type: "destinataires", champ: "cc", valeur: "s.brunel@atelier-nord.fr" },
  ])
  const v = juge(ATTENDU_CCI, piege)
  verifie("PIÈGE : collègue en Cc → REFUSÉ", v?.ok === false)
  verifie(
    "PIÈGE : le refus NOMME le champ fautif",
    v?.ok === false && /copie/i.test(v.message),
  )

  // Variante : mis dans « À », donc parfaitement visible.
  const piege2 = rejouer([
    { type: "ouvrirMessage", id: "m-devis" },
    { type: "repondre", id: "m-devis" },
    {
      type: "destinataires",
      champ: "a",
      valeur: "l.marchand@bureau-verrier.fr; s.brunel@atelier-nord.fr",
    },
  ])
  verifie("PIÈGE : collègue en destinataire direct → REFUSÉ", juge(ATTENDU_CCI, piege2)?.ok === false)

  /*
   * ⚠️ CE CAS A ÉTÉ AJOUTÉ APRÈS AVOIR PIÉGÉ CE CONTRÔLE, ET IL EST ESSENTIEL.
   *
   * Le piège « collègue en destinataire direct » ci-dessus était bien REFUSÉ,
   * mais pour la MAUVAISE RAISON : le Cci restait vide, et c'est cela que le
   * juge signalait. Le mode « exact » — qui interdit le surplus — n'était donc
   * couvert par AUCUNE assertion : en le remplaçant par un mode permissif, les
   * 62 vérifications passaient toujours.
   *
   * Ici l'attendu ne porte QUE sur « À ». Un destinataire en trop doit suffire à
   * refuser, sans qu'aucun autre champ ne vienne masquer le vrai motif. C'est le
   * cas pédagogique réel : « écrivez à cette cliente » n'autorise pas à joindre
   * la moitié du carnet d'adresses.
   */
  const surplusSeul = rejouer([
    { type: "nouveauMessage" },
    {
      type: "destinataires",
      champ: "a",
      valeur: "l.marchand@bureau-verrier.fr; s.brunel@atelier-nord.fr",
    },
  ])
  const vSurplus = juge(
    { type: "O_EXPECT_MAIL", message: { a: { contient: ["l.marchand@bureau-verrier.fr"] } } },
    surplusSeul,
  )
  verifie("PIÈGE : un destinataire EN TROP → REFUSÉ (mode exact par défaut)", vSurplus?.ok === false)
  verifie(
    "PIÈGE : le refus nomme l'adresse en trop",
    vSurplus?.ok === false && /s\.brunel/i.test(vSurplus.message),
  )

  // Et le mode permissif, lui, doit bien tolérer ce même surplus : sans cette
  // assertion, « exact » pourrait être câblé en dur et personne ne le verrait.
  verifie(
    "« aumoins » tolère un destinataire supplémentaire",
    juge(
      {
        type: "O_EXPECT_MAIL",
        message: { a: { contient: ["l.marchand@bureau-verrier.fr"], mode: "aumoins" } },
      },
      surplusSeul,
    )?.ok === true,
  )

  // Même raisonnement sur les pièces jointes : le mode exact y refuse aussi le
  // surplus, et rien ne le vérifiait isolément.
  const deuxPieces = rejouer([
    { type: "ouvrirMessage", id: "m-devis" },
    { type: "repondre", id: "m-devis" },
    { type: "joindre", nom: "Devis-2026-118.pdf" },
    { type: "joindre", nom: "Plaquette-atelier.pdf" },
  ])
  verifie(
    "PIÈGE : une pièce jointe EN TROP → REFUSÉ (mode exact par défaut)",
    juge(
      { type: "O_EXPECT_MAIL", message: { pieces: { contient: ["Devis-2026-118.pdf"] } } },
      deuxPieces,
    )?.ok === false,
  )

  // CONTRE-PIÈGE : ne pas refuser une réponse juste écrite autrement. Ici
  // l'apprenant a saisi les adresses à la main au lieu de cliquer Répondre.
  const autreChemin = rejouer([
    { type: "nouveauMessage" },
    { type: "destinataires", champ: "a", valeur: "L.Marchand@Bureau-Verrier.fr" },
    { type: "afficherCci" },
    { type: "destinataires", champ: "cci", valeur: "  S.Brunel@atelier-nord.fr  " },
  ])
  verifie(
    "CONTRE-PIÈGE : même résultat par un autre chemin, casse et espaces → accepté",
    juge(ATTENDU_CCI, autreChemin)?.ok === true,
  )
}

/* ═══════════ 3. PIÈCES JOINTES ═══════════ */

{
  const base: GesteOutlook[] = [
    { type: "ouvrirMessage", id: "m-devis" },
    { type: "repondre", id: "m-devis" },
  ]
  const attendu: OutlookAction = {
    type: "O_EXPECT_MAIL",
    message: { pieces: { contient: ["Devis-2026-118.pdf"] } },
  }

  verifie(
    "bonne pièce jointe → accepté",
    juge(attendu, rejouer([...base, { type: "joindre", nom: "Devis-2026-118.pdf" }]))?.ok === true,
  )
  verifie(
    "PIÈGE : mauvaise pièce jointe → REFUSÉ",
    juge(attendu, rejouer([...base, { type: "joindre", nom: "Plaquette-atelier.pdf" }]))?.ok === false,
  )
  verifie("PIÈGE : aucune pièce jointe → REFUSÉ", juge(attendu, rejouer(base))?.ok === false)

  const aucune: OutlookAction = {
    type: "O_EXPECT_MAIL",
    message: { pieces: { aucune: true } },
  }
  verifie(
    "« aucune pièce » : une pièce en trop → REFUSÉ",
    juge(aucune, rejouer([...base, { type: "joindre", nom: "Devis-2026-118.pdf" }]))?.ok === false,
  )
}

/* ═══════════ 4. LE CORPS ═══════════
   La partie la plus délicate : on ne compare JAMAIS à une prose modèle. */

const CORPS_ATTENDU: OutlookAction = {
  type: "O_EXPECT_MAIL",
  message: {
    cible: "redaction",
    corps: {
      // Plancher DÉLIBÉRÉMENT bas. À 20, le banc du spike refusait une réponse
      // professionnelle courte et parfaitement juste. Un cours de rédaction
      // professionnelle récompense la concision, il ne la punit pas.
      minMots: 12,
      salutation: ["bonjour", "madame", "bonsoir"],
      cloture: ["cordialement", "sinceres salutations", "bien a vous", "salutations"],
      notions: [
        {
          libelle: "que le devis est joint au message",
          oneOf: ["ci-joint", "ci joint", "joint", "en piece jointe", "vous trouverez"],
        },
        { libelle: "le délai de livraison", oneOf: ["delai", "semaines", "jours", "livraison"] },
      ],
      interdit: [{ libelle: "une formulation trop familière", oneOf: ["salut ", "coucou", "a plus"] }],
    },
  },
}

{
  const base: GesteOutlook[] = [
    { type: "ouvrirMessage", id: "m-devis" },
    { type: "repondre", id: "m-devis" },
  ]
  const corps = (t: string) => rejouer([...base, { type: "champ", champ: "corps", valeur: t }])

  const complet =
    "Bonjour Madame Marchand, vous trouverez ci-joint le devis demandé pour l'aménagement de votre accueil. " +
    "Le délai de livraison est de six semaines après validation. Cordialement,"
  verifie("corps complet → accepté", juge(CORPS_ATTENDU, corps(complet))?.ok === true)

  // CONTRE-PIÈGE : deux formulations différentes, toutes deux justes. Le
  // contrôle ne doit pas imposer UNE prose.
  const variante =
    "Bonjour, en pièce jointe notre devis pour votre comptoir. Comptez environ 40 jours de livraison. Bien à vous,"
  verifie(
    "CONTRE-PIÈGE : autre formulation, aussi juste → accepté",
    juge(CORPS_ATTENDU, corps(variante))?.ok === true,
  )

  const sansDelai =
    "Bonjour Madame, vous trouverez ci-joint le devis demandé pour votre accueil. Cordialement,"
  const v1 = juge(CORPS_ATTENDU, corps(sansDelai))
  verifie("PIÈGE : délai manquant → REFUSÉ", v1?.ok === false)
  verifie("PIÈGE : le refus NOMME ce qui manque", v1?.ok === false && /délai/i.test(v1.message))

  verifie(
    "PIÈGE : devis non annoncé → REFUSÉ",
    juge(
      CORPS_ATTENDU,
      corps("Bonjour Madame, le délai de livraison est de six semaines après commande ferme. Cordialement,"),
    )?.ok === false,
  )
  verifie(
    "PIÈGE : message trop court → REFUSÉ",
    juge(CORPS_ATTENDU, corps("Bonjour, c'est joint. Cordialement,"))?.ok === false,
  )
  verifie(
    "PIÈGE : pas de formule de politesse → REFUSÉ",
    juge(
      CORPS_ATTENDU,
      corps(
        "Bonjour, ci-joint le devis pour votre accueil, le délai de livraison est de six semaines après validation.",
      ),
    )?.ok === false,
  )
  verifie(
    "PIÈGE : ton familier proscrit → REFUSÉ",
    juge(
      CORPS_ATTENDU,
      corps(
        "Salut ! ci-joint le devis pour l'accueil, le délai de livraison est de six semaines environ. Cordialement,",
      ),
    )?.ok === false,
  )
  verifie(
    "les accents et la casse n'influent pas",
    juge(
      CORPS_ATTENDU,
      corps(
        "BONJOUR MADAME, CI-JOINT LE DEVIS DEMANDE POUR VOTRE ACCUEIL. LE DELAI DE LIVRAISON EST DE SIX SEMAINES. CORDIALEMENT,",
      ),
    )?.ok === true,
  )
}

/* ═══════════ 5. BOÎTE, CALENDRIER, RÈGLE, RÉPONSE AUTOMATIQUE ═══════════ */

{
  const attendu: OutlookAction = {
    type: "O_EXPECT_BOITE",
    boite: { messages: { "m-devis": { dossier: "clients", lu: true } } },
  }
  const range = rejouer([
    { type: "ouvrirMessage", id: "m-devis" },
    { type: "deplacer", id: "m-devis", dossier: "clients" },
  ])
  verifie("déplacement vers le bon dossier → accepté", juge(attendu, range)?.ok === true)

  const mauvais = rejouer([
    { type: "ouvrirMessage", id: "m-devis" },
    { type: "deplacer", id: "m-devis", dossier: "fournisseurs" },
  ])
  const v = juge(attendu, mauvais)
  verifie("PIÈGE : mauvais dossier → REFUSÉ", v?.ok === false)
  verifie(
    "PIÈGE : le refus dit OÙ le message se trouve",
    v?.ok === false && /Fournisseurs/.test(v.message),
  )
  verifie(
    "PIÈGE : message non déplacé → REFUSÉ",
    juge(attendu, rejouer([{ type: "ouvrirMessage", id: "m-devis" }]))?.ok === false,
  )
}

{
  const attendu: OutlookAction = {
    type: "O_EXPECT_CALENDRIER",
    calendrier: { titre: "Métré Bureau Verrier", date: "2026-03-05", debut: "14:00", fin: "15:30" },
  }
  const gestes = (t: string, d: string, deb: string, fin: string): GesteOutlook[] => [
    { type: "vue", vue: "calendrier" },
    { type: "nouveauRendezVous" },
    { type: "champRdv", champ: "titre", valeur: t },
    { type: "champRdv", champ: "date", valeur: d },
    { type: "champRdv", champ: "debut", valeur: deb },
    { type: "champRdv", champ: "fin", valeur: fin },
    { type: "enregistrerRdv" },
  ]
  verifie(
    "rendez-vous conforme → accepté",
    juge(attendu, rejouer(gestes("Métré Bureau Verrier", "2026-03-05", "14:00", "15:30")))?.ok === true,
  )
  verifie(
    "PIÈGE : mauvaise heure → REFUSÉ",
    juge(attendu, rejouer(gestes("Métré Bureau Verrier", "2026-03-05", "10:00", "11:30")))?.ok === false,
  )
  verifie(
    "PIÈGE : mauvais jour → REFUSÉ",
    juge(attendu, rejouer(gestes("Métré Bureau Verrier", "2026-03-04", "14:00", "15:30")))?.ok === false,
  )
  verifie(
    "PIÈGE : rendez-vous sans objet non enregistré",
    rejouer(gestes("", "2026-03-05", "14:00", "15:30")).evenements.length === 0,
  )

  // Accepter une invitation doit VRAIMENT inscrire le rendez-vous : sans effet
  // visible, le clic n'apprend rien.
  const inv = rejouer([{ type: "repondreInvitation", id: "m-reunion", reponse: "accepte" }])
  verifie(
    "accepter une invitation inscrit le rendez-vous au calendrier",
    inv.evenements.some((e) => e.titre === "Point de production"),
  )
  const ref = rejouer([{ type: "repondreInvitation", id: "m-reunion", reponse: "refuse" }])
  verifie("refuser une invitation n'inscrit rien", ref.evenements.length === 0)
}

{
  const attendu: OutlookAction = {
    type: "O_EXPECT_REGLE",
    regle: {
      condition: { champ: "expediteur", valeur: "offres@promo-outillage.net" },
      action: { type: "deplacer", dossier: "indesirables" },
    },
  }
  const bonne = rejouer([
    {
      type: "creerRegle",
      regle: {
        condition: { champ: "expediteur", valeur: "offres@promo-outillage.net" },
        action: { type: "deplacer", dossier: "indesirables" },
      },
    },
  ])
  verifie("règle conforme → accepté", juge(attendu, bonne)?.ok === true)
  const mauvaise = rejouer([
    {
      type: "creerRegle",
      regle: {
        condition: { champ: "objet", valeur: "offres@promo-outillage.net" },
        action: { type: "deplacer", dossier: "indesirables" },
      },
    },
  ])
  verifie("PIÈGE : règle sur le mauvais critère → REFUSÉ", juge(attendu, mauvaise)?.ok === false)
  verifie("PIÈGE : aucune règle créée → REFUSÉ", juge(attendu, rejouer([]))?.ok === false)
}

{
  const attendu: OutlookAction = {
    type: "O_EXPECT_REPONSE_AUTO",
    reponseAuto: {
      active: true,
      du: "2026-08-03",
      au: "2026-08-24",
      message: { notions: [{ libelle: "la date de retour", oneOf: ["24 aout", "24/08", "retour le"] }] },
    },
  }
  const bonne = rejouer([
    {
      type: "reponseAuto",
      reponseAuto: {
        active: true,
        du: "2026-08-03",
        au: "2026-08-24",
        message: "Absente jusqu'au 24 août, je réponds à mon retour.",
      },
    },
  ])
  verifie("réponse automatique conforme → accepté", juge(attendu, bonne)?.ok === true)
  const sansDate = rejouer([
    {
      type: "reponseAuto",
      reponseAuto: { active: true, du: "2026-08-03", au: "2026-08-24", message: "Je suis absente." },
    },
  ])
  verifie("PIÈGE : réponse auto sans date de retour → REFUSÉ", juge(attendu, sansDate)?.ok === false)
  verifie("PIÈGE : réponse auto non activée → REFUSÉ", juge(attendu, rejouer([]))?.ok === false)
}

/* ═══════════ 6. LE JUGE NE JUGE QUE SES TYPES ═══════════
   L'adaptateur doit rendre `null` sur une action qui n'est pas la sienne, sinon
   il volerait le verdict d'Excel (contrat §3). */

{
  const etat = rejouer([])
  const jugeBrut = (action: { type: string }) =>
    adaptateurOutlook.juger(
      { id: "T", action: action as Record<string, unknown> & { type: string } },
      { kind: "o:etatChange", etat } as unknown as { kind: string } & Record<string, unknown>,
    )

  verifie(
    "action Excel → l'adaptateur passe la main (null)",
    jugeBrut({ type: "EXPECT_STATE" }) === null,
  )
  verifie(
    "action Word → l'adaptateur passe la main (null)",
    jugeBrut({ type: "W_EXPECT_DOC" }) === null,
  )
  verifie(
    "mauvaise observation sur une étape d'état → pas un verdict positif",
    adaptateurOutlook.juger(
      { id: "T", action: ATTENDU_CCI as unknown as Record<string, unknown> & { type: string } },
      { kind: "o:control", control: "cr-envoyer" } as unknown as { kind: string } & Record<string, unknown>,
    )?.ok === false,
  )
}

/* ═══════════ 7. EXPURGATION D'UNE ÉVALUATION NOTÉE ═══════════
   Côté Excel, l'expurgation prétendait masquer cinq clés dont UNE SEULE
   existait : les réponses partaient intactes au navigateur, dans une évaluation
   notée, chez un organisme certifié Qualiopi. On vérifie ici que RIEN de ce qui
   porte la réponse ne survit à `publier()`. */

{
  const SECRETS = [
    "s.brunel@atelier-nord.fr",
    "l.marchand@bureau-verrier.fr",
    "Devis-2026-118.pdf",
    "ci-joint",
    "delai",
    "Métré Bureau Verrier",
    "clients",
    "cordialement",
  ]

  const ACTIONS_SENSIBLES: OutlookAction[] = [
    ATTENDU_CCI,
    CORPS_ATTENDU,
    { type: "O_EXPECT_MAIL", message: { pieces: { contient: ["Devis-2026-118.pdf"] } } },
    { type: "O_EXPECT_BOITE", boite: { messages: { "m-devis": { dossier: "clients", lu: true } } } },
    {
      type: "O_EXPECT_CALENDRIER",
      calendrier: { titre: "Métré Bureau Verrier", date: "2026-03-05", debut: "14:00", fin: "15:30" },
    },
  ]

  const fuites: string[] = []
  for (const action of ACTIONS_SENSIBLES) {
    const publie = JSON.stringify(
      adaptateurOutlook.publier(action as unknown as Record<string, unknown> & { type: string }) ?? {},
    ).toLowerCase()
    for (const s of SECRETS) {
      if (publie.includes(s.toLowerCase())) fuites.push(`${action.type} laisse fuiter « ${s} »`)
    }
  }
  verifie("EXPURGATION : aucune réponse ne part au navigateur", fuites.length === 0)
  for (const f of fuites) echecs.push(f)

  // Piéger l'expurgateur : une action inconnue ne doit PAS être publiée telle
  // quelle « par défaut ». Le repli doit être fail-safe.
  verifie(
    "EXPURGATION : type inconnu → rien n'est publié",
    adaptateurOutlook.publier({ type: "O_INEXISTANT", secret: "x" }) === null,
  )

  // ⚠️ ET LA PREUVE QUE LE TEST N'EST PAS VIDE : l'action NON expurgée, elle,
  // contient bien les réponses qu'on prétend retirer. Sans cette assertion, un
  // `publier()` qui renverrait toujours `{}` passerait le contrôle haut la main.
  verifie(
    "EXPURGATION : le test n'est pas vide (l'action brute contient bien la réponse)",
    JSON.stringify(ATTENDU_CCI).includes("s.brunel@atelier-nord.fr"),
  )

  // Une étape de navigation garde sa cible : sans elle l'étape est injouable, et
  // elle ne divulgue rien que la liste des messages ne montre déjà.
  const nav = adaptateurOutlook.publier({ type: "O_SELECT_MESSAGE", id: "m-devis" })
  verifie("EXPURGATION : une cible de navigation reste publiée", nav?.id === "m-devis")

  // En revanche, les écritures acceptées d'une saisie ne sortent JAMAIS.
  const saisie = adaptateurOutlook.publier({
    type: "O_TYPE_TEXT",
    champ: "objet",
    accept: ["Métré Bureau Verrier"],
  })
  verifie(
    "EXPURGATION : les écritures acceptées d'une saisie ne sortent pas",
    saisie?.champ === "objet" && !JSON.stringify(saisie).includes("Métré"),
  )
}

/* ═══════════ 8. CE QUE L'ATELIER DIT ═══════════
   Les quatre fonctions de texte doivent rester JUSTES sur une action expurgée —
   c'est exactement ce qu'elles reçoivent en évaluation notée. Une exception ici
   rendrait l'atelier muet au pire moment. */

{
  const TYPES: string[] = [
    "O_SELECT_MESSAGE",
    "O_SELECT_FOLDER",
    "O_CLICK_CONTROL",
    "O_TYPE_TEXT",
    "O_EXPECT_MAIL",
    "O_EXPECT_BOITE",
    "O_EXPECT_CALENDRIER",
    "O_EXPECT_REGLE",
    "O_EXPECT_REPONSE_AUTO",
  ]
  let muettes = 0
  let plantees = 0
  for (const type of TYPES) {
    const nue = { type } as Record<string, unknown> & { type: string }
    try {
      if (!adaptateurOutlook.attendu(nue)) muettes += 1
      adaptateurOutlook.fait(nue)
      adaptateurOutlook.reponse(nue)
      adaptateurOutlook.cible(nue)
      adaptateurOutlook.demonstration(nue, {})
    } catch {
      plantees += 1
    }
  }
  verifie("TEXTES : aucune exception sur une action expurgée", plantees === 0)
  verifie("TEXTES : chaque type expurgé produit tout de même une ligne « Attendu »", muettes === 0)

  // Et sur une action complète, la ligne « Attendu » ne doit pas être
  // tautologique : « un clic sur le bouton indiqué » n'apprend rien.
  const att = adaptateurOutlook.attendu({
    type: "O_CLICK_CONTROL",
    control: "cr-repondre-tous",
  })
  verifie(
    "TEXTES : un bouton connu est NOMMÉ dans la ligne « Attendu »",
    typeof att === "string" && att.includes("Répondre à tous"),
  )

  /*
   * `observables` ne déclare QUE ce que la surface émet réellement.
   *
   * Deux primitives en sont volontairement absentes — `O_EXPECT_REGLE` et
   * `O_EXPECT_REPONSE_AUTO` : le moteur sait les juger, mais `CourrierSurface`
   * ne rend pas encore leurs boîtes de dialogue. Les déclarer les rendrait
   * citables par un scénario, et l'étape serait injouable.
   *
   * Ce contrôle vérifie donc les DEUX sens : ce qui est déclaré doit être
   * jouable, et ce qui n'est pas jouable ne doit pas être déclaré. Sans le
   * second, retirer un bouton de la surface passerait inaperçu.
   */
  const NON_RENDUS = ["O_EXPECT_REGLE", "O_EXPECT_REPONSE_AUTO"]
  const attendusEmis = TYPES.filter((t) => !NON_RENDUS.includes(t))
  const manquants = attendusEmis.filter((t) => !adaptateurOutlook.observables.has(t))
  verifie(`OBSERVABLES : les ${attendusEmis.length} types jouables sont déclarés émis`, manquants.length === 0)
  for (const m of manquants) echecs.push(`  ↳ « ${m} » n'est pas dans observables`)

  const declaresATort = NON_RENDUS.filter((t) => adaptateurOutlook.observables.has(t))
  verifie(
    "OBSERVABLES : rien n'est déclaré émis sans que la surface le rende",
    declaresATort.length === 0,
  )
  for (const t of declaresATort) {
    echecs.push(`  ↳ « ${t} » est déclaré émis alors que la surface ne le rend pas`)
  }

  // Classification : une étape jugée sur l'état ne doit pas compter de faute sur
  // un geste d'exploration.
  verifie(
    "CLASSIFICATION : les O_EXPECT_* se jugent sur l'état",
    adaptateurOutlook.seJugeSurEtat("O_EXPECT_MAIL") &&
      !adaptateurOutlook.seJugeSurEtat("O_CLICK_CONTROL"),
  )
  verifie(
    "CLASSIFICATION : ouvrir un dossier ou un message est une navigation",
    adaptateurOutlook.estNavigation({ kind: "o:selectFolder", dossier: "clients" }) &&
      adaptateurOutlook.estNavigation({ kind: "o:selectMessage", id: "m-devis" }) &&
      !adaptateurOutlook.estNavigation({ kind: "o:control", control: "cr-envoyer" }),
  )
}

/* ═══════════ 9. LES ACTIONS GÉNÉRIQUES DU SOCLE RESTENT JOUABLES ═══════════
 *
 * Un adaptateur d'application ne connaît QUE ses actions préfixées `O_` et rend
 * `null` sur les actions génériques — `READ`, `MONTRER`, `KEY`. Sans repli sur
 * le juge du socle, elles tombent en « Action non reconnue » et TOUT ÉCRAN DE
 * LECTURE devient infranchissable, alors que `check-montrer` en exige un sur
 * chaque écran `READ`.
 *
 * Le repli a été livré par le chef d'orchestre dans `frappe.ts` (fichier gelé).
 * Ce contrôle le VÉRIFIE au lieu de le supposer : c'est exactement le genre de
 * couture qu'une refonte future peut défaire sans que rien ne le signale, et le
 * symptôme — des leçons entières bloquées — n'apparaîtrait qu'en phase contenu.
 */

{
  const etapeRead = { id: "T", consigne: "à lire", action: { type: "READ" } }
  const suivant = { kind: "next" }

  const jugerRead = (adaptateur?: typeof adaptateurOutlook) =>
    jugerEtape(etapeRead as never, suivant as never, adaptateur)

  const sansApp = jugerRead()
  const avecOutlook = jugerRead(adaptateurOutlook)

  // `JugementEtape` porte `ok` À LA RACINE, pas dans un `verdict` imbriqué —
  // et il porte aussi `compte`, la moitié du jugement qui décide de la note.
  verifie("SOCLE : un écran READ est franchissable sous l'adaptateur Outlook", avecOutlook.ok === true)
  verifie(
    "SOCLE : le verdict d'un READ est le MÊME avec ou sans adaptateur",
    sansApp.ok === avecOutlook.ok && sansApp.compte === avecOutlook.compte,
  )
  // Et le contre-test : une action Outlook, elle, doit bien être jugée par
  // l'adaptateur — sinon le repli avalerait tout et Outlook ne jugerait rien.
  const etapeOutlook = { id: "T", consigne: "", action: ATTENDU_CCI }
  const mauvais = jugerEtape(
    etapeOutlook as never,
    { kind: "o:control", control: "cr-envoyer" } as never,
    adaptateurOutlook,
  )
  verifie("SOCLE : le repli n'avale PAS les actions de l'application", mauvais.ok === false)
}

/* ═══════════ VERDICT ═══════════ */

console.log(`\n${ok} vérification(s) passée(s), ${echecs.length} échec(s).`)
if (echecs.length) {
  console.error("\n✗ ÉCHECS :")
  for (const e of echecs) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log("✓ moteur Outlook : fidélité, jugement, pièges, expurgation et textes.\n")
