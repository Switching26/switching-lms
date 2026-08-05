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
import { jugerEtape } from "../../../lib/simulation/frappe"
import type { SimulationStep } from "../../../lib/simulation/types"
import {
  CONTROLES as C,
  appliquerGeste,
  etatInitial,
  normaliser,
  type SetupOutlook,
} from "../../../lib/simulation/outlook/document"
import type { OutlookAction } from "../../../lib/simulation/outlook/actions"
import type { EtatOutlook } from "../../../lib/simulation/outlook/observations"
/*
 * Le pilote vit dans `rejeu.ts`, partagé avec `check-note-outlook` : deux copies
 * dériveraient, et le jour où elles dérivent l'un des deux contrôles mesure un
 * contenu que personne ne joue.
 */
import {
  SEMAINE_AFFICHEE,
  appliquerSetup,
  gestesPour,
  observationPour,
  type Etape,
  type Scenario,
} from "./rejeu"

const DOSSIER = join(__dirname, "..", "scenarios", "outlook")

const erreurs: string[] = []
const infos: string[] = []

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
     * ✅ `READ` EST DÉSORMAIS JOUABLE — la porte que ce contrôle tenait fermée.
     *
     * Elle l'était pour une bonne raison : `OutlookPlayer` faisait dire à son
     * bouton « J'ai compris, continuer » un `{ kind: "o:control", control:
     * "sim-suivant" }`, quand `validateStep` n'accepte qu'un `{ kind: "next" }`
     * sur une étape de lecture. Tout écran de lecture était donc un cul-de-sac,
     * et le défaut restait invisible parce qu'Outlook était le seul des quatre
     * à n'en avoir aucun.
     *
     * Corrigé le 05/08/2026 : `onSuivant` émet `next`, comme Excel et
     * PowerPoint. Le rejeu ci-dessous le VÉRIFIE au lieu de le supposer — il
     * soumet l'observation d'un clic sur « Continuer » et exige que l'étape se
     * franchisse. Ne pas remplacer cette vérification par une confiance.
     */
    // Les actions génériques du socle — `READ`, `MONTRER`, `KEY` — ne portent
    // volontairement pas de préfixe : elles n'appartiennent à aucune
    // application. `jugerEtape` les traite par son repli sur `validateStep`.
    if (e.action?.type === "READ") continue
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
    /*
     * ⚠️ `jugerEtape`, PAS `adaptateurOutlook.juger` SEUL.
     *
     * L'adaptateur ne connaît que ses actions préfixées `O_` et rend `null` sur
     * les actions génériques du socle — `READ`, `MONTRER`, `KEY`. Le juger seul
     * rendait donc « aucun verdict » sur tout écran de lecture, ce qui a fait
     * croire pendant un temps que ces écrans étaient injouables par nature. Le
     * repli sur `validateStep` vit dans `jugerEtape` : c'est lui que le player
     * appelle, c'est donc lui qu'il faut appeler ici.
     */
    const v = jugerEtape(
      { id: e.id, action: e.action } as unknown as SimulationStep,
      obs as never,
      adaptateurOutlook,
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
