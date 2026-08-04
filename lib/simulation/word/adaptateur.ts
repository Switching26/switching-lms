/**
 * Word, vu comme une application du simulateur.
 *
 * C'est le seul point de couture entre Word et le noyau : le registre l'appelle,
 * et aucun fichier partagé n'a besoin de connaître Word. Sans lui, il aurait
 * fallu poser des `case` dans `validate.ts`, les quatre `switch` d'`attendu.ts`,
 * `demonstration.ts`, `expurge.ts` et `frappe.ts` — six fichiers qu'éditent
 * aussi les agents PowerPoint et Outlook.
 *
 * ⚠️ CE FICHIER EST PUR. Aucun import de React, de DOM ni d'Univer : `juger`
 * tourne AUSSI côté serveur, sur `POST /api/simulations/[chapterId]/verify`,
 * pour les évaluations notées. Un seul import de `@univerjs/*` ici et toutes les
 * évaluations Word deviendraient incorrigibles en production.
 *
 * ⚠️ Les imports vers la couture sont des `import type` UNIQUEMENT (contrat §3) :
 * un import de valeur fermerait le cycle `registre → adaptateur → validate`, et
 * le symptôme serait un adaptateur `undefined` au chargement — une évaluation
 * jugée par personne, sans erreur visible.
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
import type { WordAction, WordMontrer } from "./actions"
import type { WordObservation, WordParagrapheObserve, WordRunObserve } from "./observations"
import {
  correspond,
  ecartsDeFormat,
  contradictionsDeFormat,
  contreditValeur,
  NEUTRE_WORD,
  resoudreZone,
  zoneEnFrancais,
  type ParagrapheLu,
} from "./document"
import { defautsTypographiques } from "./typo-fr"

/* ═══════════════════════════════════════════════════════════════════════════
   LE RUBAN — ce que la surface rend réellement
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `data-control` → libellé lisible.
 *
 * Sert à la ligne « Attendu : … ». Sans elle, 239 étapes affichaient côté Excel
 * « Attendu : un clic sur le bouton indiqué » — une tautologie qui n'apprend
 * rien. `check-controles.ts` vérifie les deux sens : un bouton cité par un
 * scénario doit être rendu par `WordChrome`, et un bouton rendu doit avoir son
 * libellé ici.
 *
 * Les symboles sont écrits EN TOUTES LETTRES : « G » n'apprend rien à un
 * débutant, « Gras » si.
 */
export const LIBELLES_CONTROLES_WORD: Readonly<Record<string, string>> = {
  "w-gras": "Gras",
  "w-italique": "Italique",
  "w-souligne": "Souligné",
  "w-barre": "Barré",
  "w-taille": "Taille de police",
  "w-police": "Police",
  "w-couleur": "Couleur du texte",
  "w-surlignage": "Couleur de surlignage",
  "w-align-gauche": "Aligner à gauche",
  "w-align-centre": "Centrer",
  "w-align-droite": "Aligner à droite",
  "w-align-justifie": "Justifier",
  "w-liste-puces": "Liste à puces",
  "w-liste-numerotee": "Liste numérotée",
  "w-style-normal": "Style Normal",
  "w-style-titre": "Style Titre",
  "w-style-soustitre": "Style Sous-titre",
  "w-style-titre1": "Style Titre 1",
  "w-style-titre2": "Style Titre 2",
  "w-style-titre3": "Style Titre 3",
  "w-inserer-tableau": "Insérer un tableau",
  "w-inserer-image": "Insérer une image",
  "w-inserer-lien": "Insérer un lien",
  "w-retirer-lien": "Retirer le lien",
  "w-lien-adresse": "Adresse du lien",
  "w-lien-valider": "Valider le lien",
  "w-lien-fermer": "Fermer la boîte de lien",
  "w-image-fermer": "Fermer la galerie",
  "w-habillage-aligne": "Habillage aligné sur le texte",
  "w-habillage-carre": "Habillage rapproché",
  "w-habillage-hautbas": "Habillage haut et bas",
  "w-habillage-devant": "Habillage devant le texte",
  "w-supprimer-image": "Supprimer l'image",
  "w-ligne-dessus": "Insérer une ligne au-dessus",
  "w-ligne-dessous": "Insérer une ligne en dessous",
  "w-colonne-gauche": "Insérer une colonne à gauche",
  "w-colonne-droite": "Insérer une colonne à droite",
  "w-supprimer-ligne": "Supprimer la ligne",
  "w-supprimer-colonne": "Supprimer la colonne",
  "w-copier": "Copier",
  "w-coller": "Coller",
  "w-couper": "Couper",
  "w-annuler": "Annuler",
  "w-retablir": "Rétablir",
  "w-mise-en-page": "Mise en page",
  "w-entete-pied": "En-tête et pied de page",
  "w-entete-zone": "Zone d'en-tête",
  "w-pied-zone": "Zone de pied de page",
  "w-filigrane-zone": "Filigrane",
  "w-numero-page": "Numéroter les pages",
  "w-entete-fermer": "Fermer l'en-tête",
  "w-imprimer": "Imprimer",
  "w-print-copies": "Nombre de copies",
  "w-print-plage-tout": "Imprimer tout le document",
  "w-print-plage-courante": "Imprimer la page courante",
  "w-print-plage-selection": "Imprimer la sélection",
  "w-print-rectoverso": "Recto verso",
  "w-print-zoom-plus": "Agrandir l'aperçu",
  "w-print-zoom-moins": "Réduire l'aperçu",
  "w-print-fermer": "Fermer l'aperçu",
  "w-regle": "Règle",
  "w-taquet-type": "Type de taquet",
  "w-verification": "Vérifier le document",
  "w-verif-orthographe": "Onglet Orthographe",
  "w-verif-synonymes": "Onglet Synonymes",
  "w-verif-fermer": "Fermer la vérification",
}

/**
 * Gestes que `WordSurface` ÉMET réellement.
 *
 * Chacun a été vu dans un vrai Chrome. Et surtout, `Maj+Flèche` n'y est PAS :
 * mesuré, il n'émet aucune commande et ne pose aucune plage. Une leçon
 * « étendre la sélection au clavier » doit donc être un écran de lecture, pas
 * une étape d'action. C'est exactement la garde qui a évité, côté Excel,
 * d'écrire des leçons injouables avec `CLICK_CELL_MODIFIER`.
 */
const OBSERVABLES_WORD: ReadonlySet<string> = new Set([
  "READ",
  "W_TYPE_TEXT",
  "W_SELECT_TEXT",
  "W_CLICK_CONTROL",
  "W_KEY",
  "W_EXPECT_DOC",
  "W_EXPECT_FORMAT",
  "W_EXPECT_STYLE",
  "W_EXPECT_TABLE",
  // Les quatre variantes ci-dessous sont servies par NOS panneaux : le moteur
  // n'a aucune commande de mise en page, d'en-tête, d'impression ni de taquet,
  // et muter son modèle ne repeint pas. Chacune n'a été ajoutée ici QU'UNE FOIS
  // sa surface livrée — sinon `check-jouabilite` doit refuser l'étape.
  "W_EXPECT_PAGE",
  "W_EXPECT_IMAGE",
  "W_EXPECT_LIEN",
  "W_EXPECT_ENTETE",
  "W_EXPECT_PRINT",
  "W_EXPECT_TABS",
])

/** Raccourcis que `WordSurface` intercepte et réémet. Aucun n'est natif. */
export const RACCOURCIS_CABLES: Readonly<Record<string, string>> = {
  "ctrl+a": "doc.command.select-all",
  "ctrl+b": "doc.command.set-inline-format-bold",
  "ctrl+i": "doc.command.set-inline-format-italic",
  "ctrl+u": "doc.command.set-inline-format-underline",
}

/* ═══════════════════════════════════════════════════════════════════════════
   OUTILS DE JUGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */

const OK: Verdict = { ok: true }
const nul = (reason: string, message: string): Verdict => ({ ok: false, reason, message })

/**
 * Un verdict « ce n'est pas encore ça, mais ce n'est pas une faute ».
 *
 * Le préfixe `no_` n'est pas décoratif : `frappe.ts` le lit pour classer
 * l'observation en TÂTONNEMENT sur une étape jugée sur l'état. Sans lui, chaque
 * geste intermédiaire d'une construction en plusieurs temps compterait une
 * faute — c'est ce qui plafonnait l'évaluation du module 27 d'Excel à 78 % pour
 * un parcours parfait.
 */
const pasEncore = (quoi: string, message: string): Verdict => nul(`no_${quoi}`, message)

/**
 * Un verdict « vous avez agi, et c'est faux » — celui qui COÛTE un point.
 *
 * Symétrique exact de `pasEncore`, et c'est toute la différence entre une note
 * et un affichage : `frappe.ts` classe `no_…` en passage obligé (tâtonnement
 * gratuit) et `wrong_…` en faute. Rendre `pasEncore` sur un geste réellement
 * faux — ce que faisaient les treize variantes `W_EXPECT_*` — revient à noter
 * sur un barème que l'apprenant ne peut pas perdre.
 *
 * Le partage entre les deux est décidé par `contreditValeur` et
 * `contradictionsDeFormat` (`document.ts`), source unique du « neutre ».
 */
const contredit = (quoi: string, message: string): Verdict => nul(`wrong_${quoi}`, message)

/** Recompose les bornes des paragraphes à partir de leurs seuls textes. */
function bornes(paragraphes: WordParagrapheObserve[]): ParagrapheLu[] {
  const lus: ParagrapheLu[] = []
  let debut = 0
  for (const p of paragraphes) {
    const fin = debut + p.texte.length
    lus.push({ ...p, debut, fin })
    // Le `\r` de fin de paragraphe occupe un caractère dans le flux.
    debut = fin + 1
  }
  return lus
}

/** L'index du paragraphe que désigne une zone, ou `null`. */
function indexParagraphe(zone: string, paragraphes: ParagrapheLu[]): number | null {
  const m = /^p(\d+)/.exec((zone ?? "").trim())
  if (m) {
    const i = Number(m[1])
    return i < paragraphes.length ? i : null
  }
  const plage = resoudreZone(zone, paragraphes)
  if (!plage) return null
  const i = paragraphes.findIndex((p) => plage.debut >= p.debut && plage.debut <= p.fin)
  return i >= 0 ? i : null
}

/** Comment un habillage se dit en français. */
const LIBELLE_HABILLAGE: Readonly<Record<string, string>> = {
  aligne: "aligné sur le texte",
  carre: "rapproché",
  hautbas: "haut et bas",
  devant: "devant le texte",
}

/** Comment un taquet se dit dans un message d'aide. */
const LIBELLE_TAQUET: Readonly<Record<string, string>> = {
  gauche: "gauche",
  centre: "centré",
  droite: "droite",
  decimal: "décimal",
}

/** Écrit une liste en français : « le gras, la taille 14 et le centrage ». */
function enumerer(items: string[]): string {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`
}

/* ═══════════════════════════════════════════════════════════════════════════
   LE JUGE
   ═══════════════════════════════════════════════════════════════════════════ */

function juger(step: EtapeApp, observed: ObservationApp): Verdict | null {
  const action = step.action as unknown as WordAction
  const obs = observed as unknown as WordObservation
  if (!action || typeof action.type !== "string" || !action.type.startsWith("W_")) return null

  switch (action.type) {
    /* ── GESTES ─────────────────────────────────────────────────────────── */

    case "W_TYPE_TEXT": {
      if (obs.kind !== "w:textChange") {
        return pasEncore("text", "Il faut saisir le texte demandé.")
      }
      const saisi = obs.saisi ?? obs.paragraphe ?? ""
      // On accepte la frappe elle-même OU le paragraphe résultant : un apprenant
      // qui complète une phrase déjà commencée ne tape que la fin, alors qu'un
      // scénario déclare souvent la phrase entière.
      const candidats = [obs.saisi ?? "", obs.paragraphe ?? ""].filter(Boolean)
      const bon = candidats.some((c) => correspond(c, action.accept, action.strict))
      if (!bon) {
        return nul(
          "wrong_text",
          `Ce n'est pas le texte attendu. Vous avez saisi « ${saisi.trim().slice(0, 60)} ».`,
        )
      }
      if (action.zone !== undefined && obs.indexParagraphe !== undefined) {
        const m = /^p(\d+)/.exec(action.zone.trim())
        /*
         * ⚠️ LE PARAGRAPHE VISÉ, OU LE SUIVANT.
         *
         * Une consigne du type « placez le curseur à la fin du 3e paragraphe,
         * appuyez sur Entrée et saisissez… » désigne le point de DÉPART du
         * geste ; la touche Entrée crée un paragraphe, et le texte atterrit
         * donc dans le SUIVANT. Exiger l'index exact refuserait un apprenant
         * qui vient de faire exactement ce qu'on lui demande.
         */
        if (m) {
          const vise = Number(m[1])
          const arrive = obs.indexParagraphe
          if (arrive !== vise && arrive !== vise + 1) {
            return nul("wrong_place", `Le texte doit être saisi dans ${zoneEnFrancais(action.zone)}.`)
          }
        }
      }
      return OK
    }

    case "W_SELECT_TEXT": {
      if (obs.kind !== "w:selection") {
        return pasEncore("selection", "Il faut sélectionner le passage demandé.")
      }
      const paragraphes = bornes(obs.paragraphes ?? [])
      const cible = resoudreZone(action.zone, paragraphes)
      if (!cible) {
        // Une zone qui ne résout pas est une erreur d'AUTEUR, pas une faute
        // d'apprenant : elle doit être bruyante, jamais silencieuse.
        return nul("zone_introuvable", "Cette étape désigne un passage qui n'existe pas.")
      }
      const t = action.tolerance ?? 2
      const proche =
        Math.abs(obs.plage.debut - cible.debut) <= t && Math.abs(obs.plage.fin - cible.fin) <= t
      if (!proche) {
        return nul(
          "wrong_selection",
          `La sélection ne couvre pas ${zoneEnFrancais(action.zone)}.`,
        )
      }
      return OK
    }

    case "W_CLICK_CONTROL": {
      if (obs.kind !== "w:control") {
        return pasEncore("control", "Il faut utiliser le bouton demandé du ruban.")
      }
      if (obs.controle !== action.controle) {
        const nom = LIBELLES_CONTROLES_WORD[action.controle] ?? action.controle
        return nul("wrong_control", `Ce n'est pas le bon bouton : il faut « ${nom} ».`)
      }
      return OK
    }

    case "W_KEY": {
      if (obs.kind !== "w:key") return pasEncore("key", "Il faut employer le raccourci clavier.")
      const a = action.touches.map((t) => t.toLowerCase()).join("+")
      const b = obs.touches.map((t) => t.toLowerCase()).join("+")
      return a === b
        ? OK
        : nul("wrong_key", `Ce n'est pas le bon raccourci : il faut ${action.touches.join(" + ")}.`)
    }

    /* ── ÉTAT ───────────────────────────────────────────────────────────── */

    case "W_EXPECT_DOC": {
      if (obs.kind !== "w:docState") return pasEncore("doc", "Le document n'est pas encore complet.")
      for (const [cle, formes] of Object.entries(action.paragraphes)) {
        const i = Number(cle.replace(/^p/, ""))
        const p = obs.paragraphes[i]
        if (!p) {
          return pasEncore("doc", `Il manque le ${i + 1}e paragraphe.`)
        }
        if (!correspond(p.texte, formes, action.strict)) {
          // Un paragraphe VIDE est une absence de geste ; un paragraphe écrit
          // autrement est une réponse fausse, et elle doit coûter.
          if (p.texte.trim() !== "") {
            return contredit(
              "doc",
              action.strict
                ? `Le ${i + 1}e paragraphe n'est pas écrit exactement comme attendu — la casse compte ici.`
                : `Le ${i + 1}e paragraphe ne porte pas le texte attendu.`,
            )
          }
          return pasEncore("doc", `Le ${i + 1}e paragraphe est encore vide.`)
        }
      }
      if (action.exact) {
        const attendus = Object.keys(action.paragraphes).length
        const reels = obs.paragraphes.filter((p) => p.texte.trim() !== "").length
        if (reels > attendus) {
          return pasEncore("doc", "Le document contient un paragraphe de trop.")
        }
      }
      return OK
    }

    case "W_EXPECT_FORMAT": {
      if (obs.kind !== "w:docState") {
        return pasEncore("format", "La mise en forme demandée n'est pas encore posée.")
      }
      const observeFormat: WordRunObserve | undefined = obs.formats?.[action.zone]
      if (!observeFormat) {
        return pasEncore("format", "La mise en forme demandée n'est pas encore posée.")
      }
      // Un attribut posé à une AUTRE valeur passe avant ce qui manque : c'est un
      // geste faux, pas une construction en cours.
      const faux = contradictionsDeFormat(action.format, observeFormat)
      if (faux.length > 0) {
        return contredit(
          "format",
          `${zoneEnFrancais(action.zone)} porte ${enumerer(faux)}.`,
        )
      }
      const manques = ecartsDeFormat(action.format, observeFormat)
      if (manques.length > 0) {
        return pasEncore(
          "format",
          `Il manque ${enumerer(manques)} sur ${zoneEnFrancais(action.zone)}.`,
        )
      }
      return OK
    }

    case "W_EXPECT_STYLE": {
      if (obs.kind !== "w:docState") {
        return pasEncore("style", "Le style demandé n'est pas encore appliqué.")
      }
      const paragraphes = bornes(obs.paragraphes)
      const i = indexParagraphe(action.zone, paragraphes)
      if (i === null) return nul("zone_introuvable", "Cette étape désigne un paragraphe qui n'existe pas.")
      const p = paragraphes[i]
      const manques: string[] = []
      /*
       * Un style, un alignement ou une liste POSÉS à une autre valeur que celle
       * attendue sont un geste faux — pas une construction en cours. C'est le
       * poste le plus lourd du barème Word (41 points sur 356) et il était
       * intégralement inperdable : appliquer « Titre 2 » quand on demande
       * « Titre 1 » rendait le même verdict que ne rien faire du tout.
       */
      const faux: string[] = []
      if (contreditValeur(NEUTRE_WORD.style, action.style.style, p.style)) {
        faux.push(`le style « ${p.style} »`)
      }
      if (contreditValeur(NEUTRE_WORD.alignement, action.style.alignement, p.alignement)) {
        faux.push(`l'alignement ${p.alignement}`)
      }
      if (contreditValeur(NEUTRE_WORD.liste, action.style.liste, p.liste)) {
        faux.push(`la liste ${p.liste}`)
      }
      if (faux.length > 0) {
        return contredit(
          "style",
          `${zoneEnFrancais(action.zone)} porte ${enumerer(faux)}.`,
        )
      }
      if (action.style.style !== undefined && p.style.toLowerCase() !== action.style.style.toLowerCase()) {
        manques.push(`le style « ${action.style.style} »`)
      }
      if (action.style.alignement !== undefined && p.alignement !== action.style.alignement) {
        manques.push(`l'alignement ${action.style.alignement}`)
      }
      if (action.style.liste !== undefined && p.liste !== action.style.liste) {
        manques.push(
          action.style.liste === "aucune" ? "le retrait de la puce" : `la liste ${action.style.liste}`,
        )
      }
      if (manques.length > 0) {
        return pasEncore("style", `Il manque ${enumerer(manques)} sur ${zoneEnFrancais(action.zone)}.`)
      }
      return OK
    }

    case "W_EXPECT_TABLE": {
      if (obs.kind !== "w:docState") {
        return pasEncore("table", "Le tableau n'est pas encore inséré.")
      }
      const poses = obs.tableaux ?? []
      const trouve = poses.some(
        (t) => t.lignes === action.lignes && t.colonnes === action.colonnes,
      )
      if (!trouve) {
        // Un tableau inséré aux MAUVAISES dimensions est un geste faux ;
        // l'absence de tableau reste une absence de geste.
        if (poses.length > 0) {
          const t = poses[0]
          return contredit(
            "table",
            `Le tableau inséré fait ${t.lignes} lignes sur ${t.colonnes} colonnes : ` +
              `il en faut ${action.lignes} sur ${action.colonnes}.`,
          )
        }
        return pasEncore(
          "table",
          `Il faut un tableau de ${action.lignes} lignes sur ${action.colonnes} colonnes.`,
        )
      }
      return OK
    }

    case "W_EXPECT_PAGE": {
      if (obs.kind !== "w:docState") {
        return pasEncore("page", "La mise en page n'est pas encore celle qui est demandée.")
      }
      const p = obs.page ?? {}
      const manques: string[] = []
      const fauxPage: string[] = []
      for (const [cle, libelle] of [
        ["orientation", "l'orientation"],
        ["margeHaut", "la marge du haut"],
        ["margeBas", "la marge du bas"],
        ["margeGauche", "la marge de gauche"],
        ["margeDroite", "la marge de droite"],
      ] as const) {
        const attendu = action.page[cle]
        if (attendu !== undefined && p[cle] !== attendu) manques.push(libelle)
        // Une marge réglée à 4 cm quand on en demande 3 est un geste faux ; la
        // marge encore à sa valeur d'origine est une absence de geste.
        if (contreditValeur(NEUTRE_WORD.page[cle], attendu, p[cle])) {
          fauxPage.push(`${libelle} à ${String(p[cle])}`)
        }
      }
      if (fauxPage.length > 0) {
        return contredit("page", `La mise en page porte ${enumerer(fauxPage)}.`)
      }
      if (action.page.numeroPage !== undefined && (p.numeroPage ?? false) !== action.page.numeroPage) {
        manques.push(action.page.numeroPage ? "le numéro de page" : "le retrait du numéro de page")
      }
      return manques.length === 0
        ? OK
        : pasEncore("page", `Il reste à régler ${enumerer(manques)}.`)
    }

    case "W_EXPECT_LIEN": {
      if (obs.kind !== "w:docState") {
        return pasEncore("lien", "Le lien demandé n'est pas encore posé.")
      }
      const poses = obs.liens ?? []
      const memeUrl = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
      const trouve = poses.some((l) => memeUrl(l.url, action.url))
      if (action.absent) {
        return trouve ? pasEncore("lien", "Le lien est encore là.") : OK
      }
      if (trouve) return OK
      // Un lien posé vers une AUTRE adresse est un geste faux ; l'absence de
      // tout lien reste une absence de geste.
      if (poses.length > 0) {
        return contredit("lien", `Le lien posé pointe vers « ${poses[0].url} ».`)
      }
      return pasEncore("lien", "Le texte ne pointe pas encore vers cette adresse.")
    }

    case "W_EXPECT_IMAGE": {
      if (obs.kind !== "w:docState") {
        return pasEncore("image", "L'image demandée n'est pas encore là.")
      }
      const posees = obs.images ?? []
      const trouvee = posees.find((i) => i.id === action.image)
      if (action.absente) {
        return trouvee ? pasEncore("image", "L'image est encore dans le document.") : OK
      }
      if (!trouvee) {
        /*
         * Le sélecteur propose SIX images (`WordImagePicker`) : en insérer une
         * autre que celle demandée est un geste courant, et il était gratuit.
         * C'est le poste le plus lourd des évaluations 14 et 16, qui plafonnaient
         * à 17 % et 36 % de points perdables.
         */
        if (posees.length > 0) {
          return contredit(
            "image",
            `L'image insérée n'est pas celle qui est demandée.`,
          )
        }
        return pasEncore("image", "L'image n'est pas encore insérée.")
      }
      if (action.habillage && trouvee.habillage !== action.habillage) {
        // Un habillage CHOISI, mais le mauvais, est un geste faux ; l'habillage
        // resté à sa valeur d'origine est une absence de geste.
        if (contreditValeur(NEUTRE_WORD.habillage, action.habillage, trouvee.habillage)) {
          return contredit(
            "image",
            `L'habillage choisi est ${LIBELLE_HABILLAGE[trouvee.habillage] ?? trouvee.habillage}, ` +
              `il faut ${LIBELLE_HABILLAGE[action.habillage]}.`,
          )
        }
        return pasEncore("image", `L'habillage n'est pas encore ${LIBELLE_HABILLAGE[action.habillage]}.`)
      }
      return OK
    }

    case "W_EXPECT_ENTETE": {
      if (obs.kind !== "w:docState") {
        return pasEncore("entete", "La zone demandée ne porte pas encore ce texte.")
      }
      const nom = { entete: "L'en-tête", pied: "Le pied de page", filigrane: "Le filigrane" }[
        action.emplacement
      ]
      const lu = obs.horsFlux?.[action.emplacement] ?? ""
      // `accept: [""]` = exiger que la zone soit VIDE. C'est le geste « retirez
      // le filigrane », symétrique de `surlignage: ""` côté format.
      const veutVide = action.accept.length === 1 && action.accept[0] === ""
      if (veutVide) {
        return lu.trim() === "" ? OK : pasEncore("entete", `${nom} n'est pas encore vide.`)
      }
      if (correspond(lu, action.accept)) return OK
      // Une zone remplie avec un AUTRE texte est un geste faux ; une zone encore
      // vide est une absence de geste.
      if (lu.trim() !== "") {
        return contredit("entete", `${nom} porte « ${lu.trim().slice(0, 60)} ».`)
      }
      return pasEncore("entete", `${nom} ne porte pas encore le texte demandé.`)
    }

    case "W_EXPECT_PRINT": {
      if (obs.kind !== "w:docState") {
        return pasEncore("impression", "Les réglages d'impression ne sont pas encore ceux-là.")
      }
      const i = obs.impression ?? {}
      const manques: string[] = []
      // Un réglage POSÉ à une autre valeur — 7 copies quand on en demande 15 —
      // est un geste faux ; le panneau resté sur sa valeur d'ouverture non.
      const fauxImpr: string[] = []
      if (contreditValeur(NEUTRE_WORD.impression.copies, action.impression.copies, i.copies)) {
        fauxImpr.push(`${String(i.copies)} copies`)
      }
      if (contreditValeur(NEUTRE_WORD.impression.plage, action.impression.plage, i.plage)) {
        fauxImpr.push(`la plage « ${String(i.plage)} »`)
      }
      if (fauxImpr.length > 0) {
        return contredit("impression", `Les réglages portent ${enumerer(fauxImpr)}.`)
      }
      if (action.impression.copies !== undefined && i.copies !== action.impression.copies) {
        manques.push("le nombre de copies")
      }
      if (action.impression.plage !== undefined && i.plage !== action.impression.plage) {
        manques.push("la plage à imprimer")
      }
      if (
        action.impression.rectoVerso !== undefined &&
        (i.rectoVerso ?? false) !== action.impression.rectoVerso
      ) {
        manques.push("le recto verso")
      }
      return manques.length === 0
        ? OK
        : pasEncore("impression", `Il reste à régler ${enumerer(manques)}.`)
    }

    case "W_EXPECT_TABS": {
      if (obs.kind !== "w:docState") {
        return pasEncore("taquets", "Les taquets ne sont pas encore ceux qui sont demandés.")
      }
      const idx = indexParagraphe(action.zone, bornes(obs.paragraphes))
      if (idx === null) {
        return nul("zone_introuvable", "Cette étape désigne un paragraphe qui n'existe pas.")
      }
      const poses = obs.taquets?.[String(idx)] ?? []
      const attendus = action.taquets
      if (poses.length !== attendus.length) {
        // Des taquets EN TROP sont un geste faux — la règle n'en pose pas toute
        // seule. Il en manque : l'apprenant n'a pas fini, ce n'est pas une faute.
        if (poses.length > attendus.length) {
          return contredit(
            "taquets",
            `Il y a ${poses.length - attendus.length} taquet(s) de trop sur la règle.`,
          )
        }
        return pasEncore(
          "taquets",
          `Il manque ${attendus.length - poses.length} taquet(s) sur la règle.`,
        )
      }
      // Une pose à la souris ne tombe jamais au pixel : 0,05 cm de tolérance.
      const restants = [...poses]
      for (const a of attendus) {
        const j = restants.findIndex(
          (p) => p.type === a.type && Math.abs(p.position - a.position) <= 0.05,
        )
        if (j < 0) {
          // Le bon NOMBRE de taquets, mais pas aux bonnes positions : ils ont
          // tous été posés, et posés faux.
          return contredit(
            "taquets",
            `Il manque un taquet ${LIBELLE_TAQUET[a.type]} à ${a.position.toFixed(2).replace(".", ",")} cm.`,
          )
        }
        restants.splice(j, 1)
      }
      return OK
    }

    default: {
      /**
       * EXHAUSTIVITÉ DE WORD, garantie à la compilation.
       *
       * Le seul `never` du simulateur vit dans `validate.ts` et protège Excel.
       * Chaque application pose le sien dans SON adaptateur — c'est tout l'objet
       * de la garde typée `estActionApp` : le `switch` d'Excel reste restreint à
       * l'union d'Excel, et ajouter une variante Word casse la compilation ICI,
       * pas là-bas.
       */
      const _exhaustif: never = action
      void _exhaustif
      return null
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE QUE L'ATELIER DIT — les quatre fonctions d'`attendu.ts`
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ces quatre fonctions DÉDUISENT leur phrase de l'action, elles ne la lisent pas
 * dans le scénario. Écrire à la main une formulation par étape serait ingérable
 * — côté Excel, 1 872 étapes — et une reformulation suivrait automatiquement
 * toute correction de contenu.
 */

function attendu(a: ActionApp): string | null {
  const action = a as unknown as WordAction
  switch (action.type) {
    case "W_TYPE_TEXT":
      return action.zone
        ? `le texte demandé, saisi dans ${zoneEnFrancais(action.zone)}`
        : "le texte demandé, saisi dans le document"
    case "W_SELECT_TEXT":
      return `${zoneEnFrancais(action.zone)} sélectionné`
    case "W_CLICK_CONTROL":
      return `un clic sur « ${LIBELLES_CONTROLES_WORD[action.controle] ?? action.controle} »`
    case "W_KEY":
      return `le raccourci ${action.touches.join(" + ")}`
    case "W_EXPECT_DOC": {
      const n = Object.keys(action.paragraphes).length
      return n === 1 ? "le paragraphe attendu, écrit" : `les ${n} paragraphes attendus, écrits`
    }
    case "W_EXPECT_FORMAT": {
      const quoi = ecartsDeFormat(action.format, {})
      return quoi.length > 0
        ? `${enumerer(quoi)} sur ${zoneEnFrancais(action.zone)}`
        : `la mise en forme demandée sur ${zoneEnFrancais(action.zone)}`
    }
    case "W_EXPECT_STYLE": {
      const bouts: string[] = []
      if (action.style.style) bouts.push(`le style « ${action.style.style} »`)
      if (action.style.alignement) bouts.push(`l'alignement ${action.style.alignement}`)
      if (action.style.liste && action.style.liste !== "aucune") {
        bouts.push(`la liste ${action.style.liste}`)
      }
      if (action.style.liste === "aucune") bouts.push("aucune puce")
      return `${enumerer(bouts)} sur ${zoneEnFrancais(action.zone)}`
    }
    case "W_EXPECT_TABLE":
      return `un tableau de ${action.lignes} lignes sur ${action.colonnes} colonnes`
    case "W_EXPECT_PAGE":
      return "la mise en page demandée"
    case "W_EXPECT_LIEN":
      return action.absent ? "le texte sans lien" : action.url
    case "W_EXPECT_IMAGE":
      return action.absente ? "le document sans cette image" : "l'image demandée"
    case "W_EXPECT_ENTETE":
      return action.accept[0] === "" ? `${{ entete: "l'en-tête", pied: "le pied de page", filigrane: "le filigrane" }[action.emplacement]} vidé` : action.accept[0]
    case "W_EXPECT_PRINT":
      return "les réglages d'impression demandés"
    case "W_EXPECT_TABS":
      return action.taquets.map((t) => `${t.position.toFixed(2).replace(".", ",")} cm`).join(", ")
    default:
      return null
  }
}

function fait(a: ActionApp): string | null {
  const action = a as unknown as WordAction
  switch (action.type) {
    case "W_TYPE_TEXT":
      return `Vous avez saisi « ${(action.accept[0] ?? "").slice(0, 48)} ».`
    case "W_SELECT_TEXT":
      return `Vous avez sélectionné ${zoneEnFrancais(action.zone)}.`
    case "W_CLICK_CONTROL":
      return `Vous avez utilisé « ${LIBELLES_CONTROLES_WORD[action.controle] ?? action.controle} ».`
    case "W_KEY":
      return `Vous avez employé ${action.touches.join(" + ")}.`
    case "W_EXPECT_DOC":
      return "Le document porte maintenant le texte attendu."
    case "W_EXPECT_FORMAT":
      return `${zoneEnFrancais(action.zone)} porte maintenant la mise en forme demandée.`
    case "W_EXPECT_STYLE":
      return `${zoneEnFrancais(action.zone)} porte maintenant le style demandé.`
    case "W_EXPECT_TABLE":
      return `Le tableau ${action.lignes} × ${action.colonnes} est inséré.`
    case "W_EXPECT_PAGE":
      return "La mise en page est réglée."
    case "W_EXPECT_LIEN":
      return action.absent ? "Le lien est retiré." : "Le lien est posé."
    case "W_EXPECT_IMAGE":
      return action.absente
        ? "L'image est retirée du document."
        : "L'image est en place."
    case "W_EXPECT_ENTETE":
      return action.accept[0] === ""
        ? `${{ entete: "L'en-tête", pied: "Le pied de page", filigrane: "Le filigrane" }[action.emplacement]} est retiré.`
        : `${{ entete: "L'en-tête", pied: "Le pied de page", filigrane: "Le filigrane" }[action.emplacement]} porte maintenant le texte demandé.`
    case "W_EXPECT_PRINT":
      return "Les réglages d'impression sont posés."
    case "W_EXPECT_TABS":
      return action.taquets.length === 0
        ? "Les taquets sont retirés de la règle."
        : `La règle porte maintenant ${action.taquets.length} taquet(s).`
    default:
      return null
  }
}

/**
 * La réponse exacte, révélée au cinquième essai — et JAMAIS en évaluation, où
 * le noyau ne l'appelle pas.
 */
function reponse(a: ActionApp): string | null {
  const action = a as unknown as WordAction
  switch (action.type) {
    case "W_TYPE_TEXT":
      return action.accept[0] ? `Saisissez : ${action.accept[0]}` : null
    case "W_SELECT_TEXT":
      return `Sélectionnez ${zoneEnFrancais(action.zone)}.`
    case "W_CLICK_CONTROL":
      return `Cliquez sur « ${LIBELLES_CONTROLES_WORD[action.controle] ?? action.controle} ».`
    case "W_KEY":
      return `Appuyez sur ${action.touches.join(" + ")}.`
    case "W_EXPECT_DOC": {
      const premier = Object.values(action.paragraphes)[0]?.[0]
      return premier ? `Le texte attendu est : ${premier}` : null
    }
    case "W_EXPECT_FORMAT":
      return `Sélectionnez ${zoneEnFrancais(action.zone)}, puis appliquez ${enumerer(
        ecartsDeFormat(action.format, {}),
      )}.`
    case "W_EXPECT_STYLE":
      return `Placez le curseur dans ${zoneEnFrancais(action.zone)}, puis appliquez le style demandé.`
    case "W_EXPECT_TABLE":
      return `Insérez un tableau de ${action.lignes} lignes sur ${action.colonnes} colonnes.`
    case "W_EXPECT_PAGE":
      return "Réglez la mise en page dans le panneau dédié."
    case "W_EXPECT_LIEN":
      return action.absent
        ? "Retirez le lien du texte sélectionné."
        : `Sélectionnez le texte, puis posez un lien vers ${action.url}.`
    case "W_EXPECT_IMAGE":
      return action.absente
        ? "Retirez l'image du document."
        : action.habillage
        ? `Réglez l'habillage de l'image sur « ${LIBELLE_HABILLAGE[action.habillage]} ».`
        : "Insérez l'image demandée depuis la galerie."
    case "W_EXPECT_ENTETE":
      return action.accept[0] === ""
        ? `Videz ${{ entete: "l'en-tête", pied: "le pied de page", filigrane: "le filigrane" }[action.emplacement]} dans le panneau dédié.`
        : `Saisissez le texte demandé dans ${{ entete: "l'en-tête", pied: "le pied de page", filigrane: "le filigrane" }[action.emplacement]}.`
    case "W_EXPECT_PRINT":
      return "Réglez l'impression dans l'écran d'aperçu."
    case "W_EXPECT_TABS":
      return action.taquets.length === 0
        ? "Retirez les taquets de la règle en les faisant glisser vers le bas."
        : `Posez ${action.taquets.length} taquet(s) sur la règle, aux positions demandées.`
    default:
      return null
  }
}

/**
 * Où poser le halo d'aide et la démonstration.
 *
 * ⚠️ Univer Docs rend sur CANVAS : il n'existe aucun élément de DOM par mot, par
 * paragraphe ni par caractère. `WordSurface` pose donc, au-dessus du canvas, une
 * ancre invisible `[data-word-zone="…"]` pour chaque zone que l'étape courante
 * désigne, positionnée par sa propre géométrie (`getPlageRect`). C'est ce qui
 * permet de réutiliser la cible générique `dom` sans toucher à `demonstration.ts`,
 * qui est gelé — et sans inventer une variante de cible que les deux autres
 * applications ne partageraient pas.
 *
 * Ces ancres portent `pointer-events: none` : une surface décorative superposée
 * qui avale les clics, c'est le défaut qui faisait échouer 4 scénarios Excel sur
 * 6 à l'étape suivant une réussite.
 */
function cible(a: ActionApp): CibleGenerique {
  const action = a as unknown as WordAction
  switch (action.type) {
    case "W_TYPE_TEXT":
      return action.zone ? { zone: action.zone, dom: ancre(action.zone) } : {}
    case "W_SELECT_TEXT":
    case "W_EXPECT_FORMAT":
    case "W_EXPECT_STYLE":
      return { zone: action.zone, dom: ancre(action.zone) }
    case "W_CLICK_CONTROL":
      return { controle: action.controle, dom: `[data-control="${action.controle}"]` }
    case "W_EXPECT_DOC": {
      const premier = Object.keys(action.paragraphes)[0]
      return premier ? { zone: premier, dom: ancre(premier) } : {}
    }
    case "W_EXPECT_TABLE":
      return { controle: "w-inserer-tableau", dom: '[data-control="w-inserer-tableau"]' }
    case "W_EXPECT_PAGE":
      return { controle: "w-mise-en-page", dom: '[data-control="w-mise-en-page"]' }
    case "W_EXPECT_LIEN":
      return action.absent
        ? { controle: "w-retirer-lien", dom: '[data-control="w-retirer-lien"]' }
        : { controle: "w-inserer-lien", dom: '[data-control="w-inserer-lien"]' }
    case "W_EXPECT_IMAGE":
      return action.habillage
        ? { controle: `w-habillage-${action.habillage}`, dom: `[data-control="w-habillage-${action.habillage}"]` }
        : { controle: "w-inserer-image", dom: '[data-control="w-inserer-image"]' }
    case "W_EXPECT_ENTETE":
      return { controle: "w-entete-pied", dom: '[data-control="w-entete-pied"]' }
    case "W_EXPECT_PRINT":
      return { controle: "w-imprimer", dom: '[data-control="w-imprimer"]' }
    case "W_EXPECT_TABS":
      return { zone: action.zone, dom: "[data-regle-word]" }
    case "W_KEY":
    default:
      return {}
  }
}

/** Le sélecteur de l'ancre invisible qu'une zone reçoit dans la surface. */
export function ancre(zone: string): string {
  return `[data-word-zone="${zone}"]`
}

/**
 * Contracte l'article : « à la fin de le 3e paragraphe » → « du 3e paragraphe ».
 *
 * `zoneEnFrancais` rend un groupe nominal avec son article (« le 3e
 * paragraphe », « une partie du 2e paragraphe », « « Rapport » »). Le coller
 * derrière « de » produit une faute que l'apprenant lit à chaque
 * démonstration — dans un support de formation, ce n'est pas un détail.
 */
function deLa(groupe: string): string {
  if (groupe.startsWith("le ")) return `du ${groupe.slice(3)}`
  if (groupe.startsWith("les ")) return `des ${groupe.slice(4)}`
  if (groupe.startsWith("la ")) return `de la ${groupe.slice(3)}`
  if (groupe.startsWith("l'") || groupe.startsWith("l’")) return `de ${groupe}`
  if (groupe.startsWith("une ")) return `d'${groupe}`
  return `de ${groupe}`
}

/* ═══════════════════════════════════════════════════════════════════════════
   DÉMONSTRATION — « Montrez-moi »
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Le plan est une SÉQUENCE de gestes, pas un geste.
 *
 * Une réponse écrite ne suffit pas : après trois erreurs, l'apprenant doit voir
 * OÙ cliquer et QUOI faire. Chaque plan ci-dessous décrit donc le chemin complet
 * — sélectionner, puis presser le bouton — et les gestes qui pressent un contrôle
 * le pressent POUR DE VRAI (`presser`), sans quoi la démonstration promènerait un
 * curseur sur le bon bouton pendant que rien ne change à l'écran.
 */
function demonstration(a: ActionApp, _ctx: ContexteDemo): PlanDemo | null {
  /*
   * `W_MONTRER` d'abord, et AVANT la conversion vers `WordAction` : il n'est
   * volontairement pas dans cette union (voir `actions.ts`), donc le `switch`
   * ci-dessous ne saurait pas le nommer sans que TypeScript proteste.
   */
  if (a.type === "W_MONTRER") return planMontrer(a as unknown as WordMontrer)

  const action = a as unknown as WordAction
  switch (action.type) {
    case "W_TYPE_TEXT": {
      const texte = action.accept[0] ?? ""
      const zone = action.zone
      return {
        gestes: [
          {
            cible: zone ? { k: "dom", sel: ancre(zone) } : { k: "clavier" },
            bulle: zone
              ? `On place le curseur à la fin ${deLa(zoneEnFrancais(zone))}.`
              : "On place le curseur dans le document.",
            ...(zone ? { selectionner: zone } : {}),
          },
          {
            cible: zone ? { k: "dom", sel: ancre(zone) } : { k: "clavier" },
            bulle: "On appuie sur Entrée, puis on saisit le texte : il vient dans son propre paragraphe.",
            frappe: texte,
            /*
             * ⚠️ ÉCRIRE POUR DE VRAI, pas seulement faire défiler les lettres.
             *
             * Sans ce champ, la démonstration montrait la frappe et le document
             * restait vide : l'apprenant qui vient de réclamer de l'aide voyait
             * un geste SANS résultat — la définition même d'une démonstration
             * incomplète, et le défaut qui a valu à Excel un audit entier
             * (550 formules arrêtées avant leur résultat).
             *
             * 🔴 `"fin"` ET SURTOUT PAS LA ZONE, défaut mesuré au banc puis
             * corrigé. `zone` désigne le point de DÉPART du geste — « placez le
             * curseur à la fin de « Ordre du jour », appuyez sur Entrée, puis
             * saisissez » — et écrire À cet endroit ÉCRASE le paragraphe de
             * départ. La démonstration de la leçon qui enseigne « Entrée ouvre
             * un NOUVEAU paragraphe » faisait donc disparaître l'ancien : elle
             * montrait l'exact contraire de son propos.
             *
             * `"fin"` = à la suite, ce qui est aussi la règle que suit la
             * reconstitution du document à la reprise. Les deux DOIVENT coïncider,
             * sinon la démonstration montre un document que l'étape suivante
             * contredit.
             */
            ...(zone ? { ecrire: { ref: "fin", valeur: texte } } : {}),
          },
        ],
        pas: ["placer le curseur", "saisir"],
      }
    }

    case "W_SELECT_TEXT":
      return {
        gestes: [
          {
            cible: { k: "dom", sel: ancre(action.zone) },
            bulle: `On sélectionne ${zoneEnFrancais(action.zone)} en faisant glisser la souris.`,
          },
        ],
        pas: ["sélectionner"],
      }

    case "W_CLICK_CONTROL": {
      const nom = LIBELLES_CONTROLES_WORD[action.controle] ?? action.controle
      return {
        gestes: [
          {
            cible: { k: "dom", sel: `[data-control="${action.controle}"]` },
            bulle: `On clique sur « ${nom} » dans le ruban.`,
            presser: { id: action.controle },
          },
        ],
        pas: ["cliquer le bouton"],
      }
    }

    case "W_KEY":
      return {
        gestes: [
          {
            cible: { k: "clavier" },
            bulle: `On emploie le raccourci ${action.touches.join(" + ")}.`,
            touches: action.touches,
          },
        ],
        pas: ["raccourci clavier"],
      }

    case "W_EXPECT_FORMAT": {
      const quoi = ecartsDeFormat(action.format, {})
      const bouton = boutonDeFormat(action.format)
      const gestes: PlanDemo["gestes"] = [
        {
          cible: { k: "dom", sel: ancre(action.zone) },
          bulle: `On sélectionne d'abord ${zoneEnFrancais(action.zone)}.`,
          selectionner: action.zone,
        },
      ]
      if (bouton) {
        gestes.push({
          cible: { k: "dom", sel: `[data-control="${bouton}"]` },
          bulle: `On applique ${enumerer(quoi)} avec « ${LIBELLES_CONTROLES_WORD[bouton]} ».`,
          presser: { id: bouton },
        })
      }
      return { gestes, pas: ["sélectionner", "appliquer"] }
    }

    case "W_EXPECT_STYLE": {
      const bouton = boutonDeStyle(action.style)
      const gestes: PlanDemo["gestes"] = [
        {
          cible: { k: "dom", sel: ancre(action.zone) },
          bulle: `On place le curseur dans ${zoneEnFrancais(action.zone)}.`,
          selectionner: action.zone,
        },
      ]
      if (bouton) {
        gestes.push({
          cible: { k: "dom", sel: `[data-control="${bouton}"]` },
          bulle: `On applique « ${LIBELLES_CONTROLES_WORD[bouton]} ».`,
          presser: { id: bouton },
        })
      }
      return { gestes, pas: ["placer le curseur", "appliquer"] }
    }

    case "W_EXPECT_TABLE":
      return {
        gestes: [
          {
            cible: { k: "dom", sel: '[data-control="w-inserer-tableau"]' },
            bulle: `On ouvre « Insérer un tableau » et on demande ${action.lignes} lignes sur ${action.colonnes} colonnes.`,
            presser: { id: "w-inserer-tableau", arg: `${action.lignes}x${action.colonnes}` },
          },
        ],
        pas: ["insérer le tableau"],
      }

    case "W_EXPECT_DOC": {
      const entrees = Object.entries(action.paragraphes)
      return {
        gestes: entrees.map(([zone, formes]) => ({
          cible: { k: "dom", sel: ancre(zone) },
          bulle: `On écrit ${zoneEnFrancais(zone)}.`,
          frappe: formes[0] ?? "",
          selectionner: zone,
          // Même raison que `W_TYPE_TEXT` : une frappe qui ne laisse rien dans
          // le document n'est pas une démonstration, c'est une animation.
          ecrire: { ref: zone, valeur: formes[0] ?? "" },
        })),
        pas: entrees.map(() => "écrire"),
      }
    }

    case "W_EXPECT_PAGE":
      return {
        gestes: [
          {
            cible: { k: "dom", sel: '[data-control="w-mise-en-page"]' },
            bulle: "On ouvre le panneau de mise en page.",
            presser: { id: "w-mise-en-page" },
          },
        ],
        pas: ["ouvrir la mise en page"],
      }

    default:
      return null
  }
}

/**
 * Le plan d'un écran « À comprendre » : on désigne, on explique, on ne feint
 * aucun geste.
 *
 * `illustration: true` change le comportement du calque : la phrase reste
 * affichée pendant toute la durée du geste — le temps de la lire — et aucun
 * badge de validation ne vient suggérer une action qui n'aura pas lieu.
 * `pas: []` est délibéré : une illustration ne se décompose pas en gestes à
 * refaire, et des pastilles « Regarder » alignées n'apprenaient rien.
 */
function planMontrer(m: WordMontrer): PlanDemo {
  const brut = (m.cible ?? "").trim()
  let cible: PlanDemo["gestes"][number]["cible"]
  if (brut === "" || brut === "ecran") cible = { k: "clavier" }
  else if (brut.startsWith("ctrl:")) cible = { k: "dom", sel: `[data-control="${brut.slice(5)}"]` }
  else if (brut.startsWith("dom:")) cible = { k: "dom", sel: brut.slice(4) }
  else cible = { k: "dom", sel: ancre(brut) }

  return {
    gestes: [
      {
        cible,
        bulle: m.texte,
        illustration: true,
        ...(m.touches?.length ? { touches: m.touches } : {}),
        ...(m.ecrire ? { ecrire: { ref: m.ecrire.zone, valeur: m.ecrire.valeur } } : {}),
        /*
         * `onglet` est typé `RibbonTab` par le noyau — l'échelle d'Excel, qui
         * ignore « fichier » et « affichage ». Word a ses six onglets à lui ;
         * la valeur traverse le calque sans être interprétée et c'est le player
         * qui l'ouvre, donc la conversion est sûre. Ne pas l'élargir dans le
         * noyau : ce serait toucher un fichier gelé pour un besoin d'une seule
         * application.
         */
        ...(m.onglet ? { onglet: m.onglet as never } : {}),
      },
    ],
    pas: [],
  }
}

/** Le bouton du ruban qui pose ce format, quand il y en a un seul. */
function boutonDeFormat(f: WordRunObserve): string | null {
  if (f.gras) return "w-gras"
  if (f.italique) return "w-italique"
  if (f.souligne) return "w-souligne"
  if (f.barre) return "w-barre"
  if (f.taille !== undefined) return "w-taille"
  if (f.police !== undefined) return "w-police"
  if (f.couleur !== undefined) return "w-couleur"
  if (f.surlignage !== undefined) return "w-surlignage"
  return null
}

/** Le bouton du ruban qui pose ce style de paragraphe. */
function boutonDeStyle(s: {
  style?: string
  alignement?: string
  liste?: string
}): string | null {
  if (s.style) {
    const n = s.style.toLowerCase()
    if (n === "normal") return "w-style-normal"
    if (n === "titre") return "w-style-titre"
    if (n === "sous-titre") return "w-style-soustitre"
    if (n === "titre 1") return "w-style-titre1"
    if (n === "titre 2") return "w-style-titre2"
    if (n === "titre 3") return "w-style-titre3"
  }
  if (s.alignement === "gauche") return "w-align-gauche"
  if (s.alignement === "centre") return "w-align-centre"
  if (s.alignement === "droite") return "w-align-droite"
  if (s.alignement === "justifie") return "w-align-justifie"
  if (s.liste === "puces") return "w-liste-puces"
  if (s.liste === "numerotee") return "w-liste-numerotee"
  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPURGATION — ce qui a le droit de partir au navigateur en évaluation notée
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ LE DÉFAUT LE PLUS GRAVE QU'EXCEL AIT CONNU, à ne pas reproduire.
 *
 * Son expurgation prétendait masquer les réponses et ne masquait RIEN : la liste
 * des clés secrètes nommait `attendu`, `expected`, `solution`… alors que les
 * vraies réponses vivaient dans `action.accept` et `action.cells`. Elles
 * partaient donc intactes au navigateur, dans un organisme certifié Qualiopi.
 *
 * On procède ici à l'INVERSE, et c'est la seule façon sûre : au lieu d'énumérer
 * ce qu'il faut retirer — liste qu'on oublie de tenir à jour — on énumère ce
 * qu'on garde. Ce qui n'est pas nommé ne part pas.
 *
 * Ce qui reste doit suffire à JOUER l'étape : une étape privée de ses champs
 * devient injouable, ce qui est bruyant, alors qu'une réponse laissée passer
 * serait silencieuse et compromettrait la note. `null` ⇒ seul le `type` part.
 */
function publier(a: ActionApp): Record<string, unknown> | null {
  const action = a as unknown as WordAction
  switch (action.type) {
    // La zone dit OÙ agir, pas QUOI répondre : on la garde, sans `accept`.
    case "W_TYPE_TEXT":
      return action.zone !== undefined ? { zone: action.zone } : {}
    // Le passage à sélectionner EST la réponse : rien ne part.
    case "W_SELECT_TEXT":
      return null
    // Le bouton attendu EST la réponse.
    case "W_CLICK_CONTROL":
    case "W_KEY":
      return null
    // Les textes, formats, styles et dimensions attendus SONT les réponses.
    case "W_EXPECT_DOC":
    case "W_EXPECT_FORMAT":
    case "W_EXPECT_STYLE":
    case "W_EXPECT_TABLE":
    case "W_EXPECT_PAGE":
    case "W_EXPECT_LIEN":
    case "W_EXPECT_IMAGE":
    case "W_EXPECT_ENTETE":
    case "W_EXPECT_PRINT":
    case "W_EXPECT_TABS":
      return null
    default:
      return null
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLASSIFICATION
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Se déplacer n'est pas se tromper.
 *
 * ⚠️ CONSÉQUENCE ASSUMÉE, à connaître avant d'écrire du contenu : `frappe.ts`
 * classe en tâtonnement TOUTE observation reconnue comme navigation, sans
 * regarder l'étape. Une sélection FAUSSE sur une étape `W_SELECT_TEXT` compte
 * donc comme un tâtonnement, jamais comme une faute. C'est délibéré :
 * sélectionner un passage précis à la souris est imprécis par nature — c'est la
 * même raison qui a fait retenir des tolérances élargies pour PowerPoint (D2) —
 * et punir l'imprécision d'un geste analogique serait injuste. Une étape qui
 * doit vraiment coûter des points s'écrit sur l'ÉTAT (`W_EXPECT_*`), pas sur le
 * geste.
 */
function estNavigation(observed: ObservationApp): boolean {
  const obs = observed as unknown as WordObservation
  return obs.kind === "w:cursor" || obs.kind === "w:selection"
}

/**
 * Un verdict « pas encore » sur ce type d'action est-il un passage obligé ?
 *
 * ⚠️ CE PRÉDICAT RÉPOND À DEUX QUESTIONS, et le noyau ne s'en sert que pour la
 * seconde. `frappe.ts` le lit dans `passageOblige` : un motif `no_…` sur un type
 * dont ce prédicat rend `true` est classé tâtonnement, jamais faute.
 *
 * IL DIT DONC VRAI POUR TOUS LES TYPES WORD, et pas seulement pour les
 * `W_EXPECT_*`. Raison mesurée : la surface Word émet `w:docState` à CHAQUE
 * changement du document, y compris pendant une étape de saisie ou de clic. Ces
 * observations sont jugées contre l'étape en cours et rendent `no_text`,
 * `no_control`… Depuis que `estObservationEtat` rend `false` (voir plus bas),
 * elles compteraient FAUTE sans ce prédicat : un apprenant qui tape le bon texte
 * perdrait son point à cause de l'observation d'état déclenchée par sa propre
 * frappe.
 *
 * ⚠️ SECOND CONSOMMATEUR, à ne pas oublier en le modifiant : `WordPlayer`
 * (ligne ~568) s'en sert pour REDEMANDER l'état 420 ms après l'arrivée sur une
 * étape. L'élargir fait donc relire l'état sur toutes les étapes. Effet mesuré :
 * nul — cette relecture tombe dans la fenêtre de mise en place de 2 500 ms
 * (`useAtelier.ts`), pendant laquelle `WordPlayer` ne compte aucun tâtonnement,
 * et un `no_…` ne peut de toute façon rien coûter. Elle ne peut pas non plus
 * valider une étape par erreur : le juge rend `pasEncore` sur un état qui ne
 * satisfait pas l'attendu.
 */
function seJugeSurEtat(actionType: string): boolean {
  return actionType.startsWith("W_")
}

/**
 * Cette OBSERVATION doit-elle être mise à l'abri du classement en faute ?
 *
 * 🔴 WORD RÉPOND NON, ET C'EST CE QUI REND SES ÉVALUATIONS NOTABLES.
 *
 * Ce prédicat rendait `true` pour `w:docState`. Dans `frappe.ts`, un `true` ici
 * envoie l'observation dans une branche dont AUCUNE sortie ne classe en faute —
 * les paires qui y figurent sont celles d'Excel (`cellClick`/`CLICK_CELL`…),
 * qu'une observation `w:…` ne peut par construction jamais satisfaire. Or
 * `w:docState` est le SEUL canal par lequel les treize actions `W_EXPECT_*`
 * sont jugées : 271 des 356 points du barème (76 %) étaient donc inperdables,
 * quoi que fasse l'apprenant. Mesuré : 24 % de points réellement perdables
 * contre 70 % chez Excel, à socle identique.
 *
 * Ce que le `true` protégeait — les états INTERMÉDIAIRES d'une construction en
 * plusieurs temps, mettre en gras PUIS appliquer le style — reste protégé, mais
 * par le bon mécanisme : le juge rend `pasEncore` (`no_…`) tant que l'attribut
 * est absent ou à sa valeur neutre, et `passageOblige` neutralise alors
 * l'observation. Seul un attribut POSÉ À UNE AUTRE VALEUR rend `contredit`
 * (`wrong_…`), et coûte un point. La protection est ainsi accordée à ce qui la
 * mérite — l'apprenant qui construit — au lieu d'être accordée au canal tout
 * entier, faute comprise.
 *
 * C'est la sémantique d'Excel, portée dans le vocabulaire de Word :
 * `jugerFrappeSurEtat` distingue là-bas une cellule attendue restée vide d'une
 * cellule remplie faux. Excel peut la porter par le canal `typed` — sa surface
 * émet la frappe avant l'état — que Word n'a pas.
 *
 * ⚠️ Ne pas remettre `true` sans rétablir un autre chemin de faute : la note
 * redeviendrait un affichage, en silence et sans qu'aucun parcours ne le
 * signale. `check-note-word.ts` échoue si le taux repasse sous son seuil.
 */
function estObservationEtat(_observed: ObservationApp): boolean {
  return false
}

/* ═══════════════════════════════════════════════════════════════════════════
   L'ADAPTATEUR
   ═══════════════════════════════════════════════════════════════════════════ */

export const adaptateurWord: AdaptateurApp = {
  app: "WORD",
  prefixe: "W_",
  juger,
  attendu,
  fait,
  reponse,
  cible,
  demonstration,
  publier,
  estNavigation,
  seJugeSurEtat,
  estObservationEtat,
  observables: OBSERVABLES_WORD,
  libellesControles: LIBELLES_CONTROLES_WORD,
}

/**
 * Relecture typographique d'un texte, exposée pour les scénarios qui enseignent
 * la composition française. Ce n'est pas une action : c'est l'outil qu'une
 * consigne emploie pour dire à l'apprenant CE QUI cloche, plutôt que d'exiger
 * une chaîne exacte.
 */
export { defautsTypographiques }
