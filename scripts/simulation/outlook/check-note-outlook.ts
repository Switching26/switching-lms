/**
 * Contrôle de la NOTE des évaluations Outlook — sans navigateur ni base.
 *
 *   npx tsx scripts/simulation/outlook/check-note-outlook.ts
 *
 * POURQUOI IL EXISTE. `check-jouabilite` prouve qu'un chapitre se JOUE jusqu'au
 * bout ; il ne dit rien de la NOTE. Or c'est la note qui compte pour un
 * apprenant, et une note fausse est silencieuse : la formation continue de se
 * jouer normalement. Côté Excel, un parcours parfait a plafonné à 46 % pendant
 * des semaines sans que rien ne le signale ; côté Outlook, la mesure du
 * 05/08/2026 a trouvé **12 points perdables sur 318, soit 4 %** — un apprenant
 * qui se trompait partout gardait 96 % et donc très largement la moyenne. Ces
 * évaluations sont opposables : Switching Formation est un organisme Qualiopi.
 *
 * Il vérifie trois propriétés, dans cet ordre d'importance :
 *
 *  1. UN PARCOURS SANS FAUTE VAUT 100 %. On rejoue chaque évaluation avec le
 *     pilote de `rejeu.ts` — celui de `check-jouabilite`, source unique — et on
 *     recalcule la note avec la règle de `run.ts`.
 *
 *  2. UNE FAUTE COÛTE VRAIMENT DES POINTS. Contre-épreuve obligatoire : un
 *     contrôle qui ne vérifierait que le point 1 serait vert même si le juge
 *     acceptait tout.
 *
 *  3. LA NOTE PEUT RÉELLEMENT DESCENDRE — ET LE CONTRÔLE ÉCHOUE SINON.
 *     C'est le point qui a manqué le plus longtemps côté Word : le contrôle
 *     MESURAIT la part discriminante puis sortait au vert quelle qu'elle soit.
 *     Un contrôle qui mesure un défaut doit échouer dessus, sinon il n'est
 *     qu'un afficheur — l'un des quatre faux témoins du dépôt.
 *
 * 🔴 CE QUE LA CONTRE-ÉPREUVE DOIT INJECTER, ET QUI A COÛTÉ CHER À WORD.
 * Injecter une ABSENCE ne mesure rien : « ne rien faire » n'est pas « se
 * tromper », le juge rend `no_…` à juste titre, et la mesure sort artificiellement
 * basse. Il faut injecter une CONTRADICTION — le collègue en copie visible au
 * lieu de la copie cachée, le message rangé dans le mauvais dossier, le
 * rendez-vous au mauvais jour. C'est ce que fait `contredire()` ci-dessous, et
 * c'est ce qui rend la mesure honnête dans les deux sens.
 *
 * CE QU'IL NE PROUVE PAS : que l'attendu d'une étape est atteignable à l'écran.
 * L'observation est construite depuis l'attente elle-même, donc la comparaison
 * est circulaire sur ce point. C'est le rôle du banc, dans un vrai navigateur.
 */

import { readFileSync, readdirSync } from "fs"
import { join } from "path"

import { adaptateurOutlook } from "../../../lib/simulation/outlook/adaptateur"
import { jugerEtape } from "../../../lib/simulation/frappe"
import { CONTROLES as C, appliquerGeste, etatInitial } from "../../../lib/simulation/outlook/document"
import type { OutlookAction } from "../../../lib/simulation/outlook/actions"
import type { EtatOutlook, Message, OutlookObservation } from "../../../lib/simulation/outlook/observations"
import type { SimulationStep } from "../../../lib/simulation/types"
import { appliquerSetup, gestesPour, observationPour, type Scenario } from "./rejeu"

const DOSSIER = join(__dirname, "..", "scenarios", "outlook")

/**
 * Les deux planchers de discrimination.
 *
 * • PAR ÉVALUATION, 50 % : en dessous, un apprenant qui rate tout garde la
 *   moyenne. Non négociable à la baisse sur une épreuve opposable.
 * • GLOBAL, 70 % : le profil MESURÉ d'Excel (358/513), la seule des quatre
 *   formations en production. Word y est à 83 %. Outlook n'a aucune raison de
 *   noter plus mollement.
 */
const PLANCHER_PAR_EVALUATION = 50
const PLANCHER_GLOBAL = 70

/** Adresse qui n'appartient à aucun scénario : elle CONTREDIT, elle ne manque pas. */
const ADRESSE_INTRUSE = "intrus.volontaire@nulle-part.invalid"
const TEXTE_INTRUS = "zzz reponse volontairement fausse zzz"

const anomalies: string[] = []

/* ═══════════════════════════════════════════════════════════════════════════
   LA NOTE — la règle de `run.ts`, reproduite à l'identique
   ═══════════════════════════════════════════════════════════════════════════ */

function note(steps: SimulationStep[], premierEssai: Record<string, boolean>) {
  let total = 0
  let obtenus = 0
  for (const s of steps) {
    const pts = s.points ?? 1
    if (s.action.type === "READ" || pts <= 0) continue
    total += pts
    if (premierEssai[s.id]) obtenus += pts
  }
  return { total, obtenus, score: total > 0 ? obtenus / total : 0 }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LA CONTRE-ÉPREUVE — contredire, jamais omettre
   ═══════════════════════════════════════════════════════════════════════════ */

const clone = (e: EtatOutlook): EtatOutlook => JSON.parse(JSON.stringify(e)) as EtatOutlook

/** Un dossier qui existe, qui n'est ni la boîte de réception ni celui attendu. */
function autreDossier(etat: EtatOutlook, sauf: string | undefined): string | null {
  const d = etat.dossiers.find((x) => x.id !== sauf && x.id !== "reception" && x.id !== "supprimes")
  return d?.id ?? null
}

/**
 * Un état qui CONTREDIT l'attendu, construit depuis l'état canonique.
 *
 * `null` quand l'attente n'a pas de contraire : un booléen « avez-vous fait
 * ceci » n'a pas de mauvaise valeur, seulement une absence. Ces étapes sont
 * inperdables PAR NATURE, et le rapport les nomme au lieu de les cacher.
 */
function contredire(action: OutlookAction, bon: EtatOutlook): { obs: OutlookObservation; quoi: string } | null {
  const e = clone(bon)

  switch (action.type) {
    case "O_SELECT_MESSAGE": {
      const autre = e.messages.find((m) => m.id !== action.id)
      return autre ? { obs: { kind: "o:selectMessage", id: autre.id }, quoi: "un autre message" } : null
    }

    case "O_SELECT_FOLDER": {
      const autre = autreDossier(e, action.dossier)
      return autre ? { obs: { kind: "o:selectFolder", dossier: autre }, quoi: "un autre dossier" } : null
    }

    case "O_CLICK_CONTROL": {
      const autre = action.control === C.envoyer ? C.abandonner : C.envoyer
      return { obs: { kind: "o:control", control: autre }, quoi: "un autre bouton" }
    }

    case "O_TYPE_TEXT":
      return { obs: { kind: "o:typed", champ: action.champ, text: TEXTE_INTRUS }, quoi: "un autre texte" }

    case "O_EXPECT_MAIL": {
      const m = action.message
      const r = (m.cible ?? "redaction") === "envoye" ? e.dernierEnvoi : e.redaction
      if (!r) return null
      // Ordre CHOISI : on contredit d'abord ce qui porte une vraie faute
      // professionnelle, ensuite seulement le reste.
      if (m.cci?.contient?.length) {
        // La faute que la leçon corrige : le collègue en copie VISIBLE.
        const a = m.cci.contient[0]
        r.cci = r.cci.filter((x) => x !== a)
        r.cc = [...r.cc, a]
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "la copie cachée passée en copie visible" }
      }
      if (m.a?.contient?.length) {
        r.a = r.a.map((x) => (x === m.a!.contient![0] ? ADRESSE_INTRUSE : x))
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "un autre destinataire" }
      }
      if (m.cc?.contient?.length) {
        r.cc = r.cc.map((x) => (x === m.cc!.contient![0] ? ADRESSE_INTRUSE : x))
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "une autre adresse en copie" }
      }
      if (m.pieces?.contient?.length) {
        r.pieces = [{ nom: "piece-volontairement-fausse.pdf" }]
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "une autre pièce jointe" }
      }
      if (m.pieces?.aucune) {
        r.pieces = [{ nom: "piece-en-trop.pdf" }]
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "une pièce jointe en trop" }
      }
      if (m.objet?.accept?.length || m.objet?.prefixe) {
        r.objet = TEXTE_INTRUS
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "un autre objet" }
      }
      if (m.importance && m.importance !== "normale") {
        r.importance = m.importance === "haute" ? "basse" : "haute"
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "une autre importance" }
      }
      if (m.corps?.interdit?.length) {
        r.corps = `${r.corps} ${m.corps.interdit[0].oneOf[0]}`
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "ce que la consigne interdit d'écrire" }
      }
      if (m.genre && "genre" in r) {
        r.genre = m.genre === "transfert" ? "reponse" : "transfert"
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "un autre genre de message" }
      }
      return null
    }

    case "O_EXPECT_BOITE": {
      const b = action.boite
      for (const [id, att] of Object.entries(b.messages ?? {})) {
        const m = e.messages.find((x: Message) => x.id === id)
        if (!m) continue
        if (att.dossier) {
          const autre = autreDossier(e, att.dossier)
          if (autre) {
            m.dossier = autre
            return { obs: { kind: "o:etatChange", etat: e }, quoi: "un rangement dans le mauvais dossier" }
          }
        }
        if (att.lu === false) {
          m.lu = true
          return { obs: { kind: "o:etatChange", etat: e }, quoi: "un message ouvert qui devait rester non lu" }
        }
        if (att.indicateur === false) {
          m.indicateur = true
          return { obs: { kind: "o:etatChange", etat: e }, quoi: "un indicateur qui devait être retiré" }
        }
      }
      return null
    }

    case "O_EXPECT_CALENDRIER": {
      const c = action.calendrier
      const ev = e.evenements.find((x) => x.titre === c.titre) ?? e.evenements[e.evenements.length - 1]
      if (!ev) return null
      if (c.date) {
        ev.date = c.date === "2026-03-05" ? "2026-03-06" : "2026-03-05"
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "un autre jour" }
      }
      if (c.debut) {
        ev.debut = c.debut === "08:00" ? "17:00" : "08:00"
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "une autre heure de début" }
      }
      if (c.fin) {
        ev.fin = c.fin === "18:00" ? "09:00" : "18:00"
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "une autre heure de fin" }
      }
      if (c.lieu) {
        ev.lieu = TEXTE_INTRUS
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "un autre lieu" }
      }
      if (c.participants?.contient?.length) {
        ev.participants = [ADRESSE_INTRUSE]
        return { obs: { kind: "o:etatChange", etat: e }, quoi: "d'autres participants" }
      }
      return null
    }

    default:
      return null
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LE CONTRÔLE
   ═══════════════════════════════════════════════════════════════════════════ */

const fichiers = readdirSync(DOSSIER)
  .filter((f) => f.endsWith(".json"))
  .sort()
if (!fichiers.length) {
  console.error("✗ aucun scénario Outlook.")
  process.exit(1)
}

let evaluations = 0
let etapesNotees = 0
let pointsTotal = 0
let pointsPenalisants = 0
const parEvaluation: { fichier: string; total: number; perdables: number; part: number }[] = []
/** Ce qui reste inperdable, pour le NOMMER au lieu de le taire. */
const inperdables: Record<string, number> = {}

for (const f of fichiers) {
  const sc = JSON.parse(readFileSync(join(DOSSIER, f), "utf8")) as Scenario
  if (sc.mode !== "EVALUATION") continue
  evaluations++

  let etat = etatInitial(sc.courrier)
  const premierEssai: Record<string, boolean> = {}
  const penalisantes: string[] = []

  for (const e of sc.steps) {
    if (e.setup?.courrier) etat = { ...etat, ...appliquerSetup(etat, e.setup.courrier) }

    const step = { id: e.id, action: e.action, points: e.points } as unknown as SimulationStep

    if (e.action.type === "READ") {
      if ((e.points ?? 1) > 0) {
        anomalies.push(`${f} · ${e.id} : un écran de lecture ne doit pas porter de points`)
      }
      continue
    }

    /* ── 1. Le parcours sans faute ─────────────────────────────────────────── */
    const avant = etat
    for (const g of gestesPour(e.action, etat)) etat = appliquerGeste(etat, g)
    const bonne = observationPour(e.action, etat)
    const j = jugerEtape(step, bonne as never, adaptateurOutlook)
    if (!j.ok) {
      anomalies.push(
        `${f} · ${e.id} (${e.action.type}) : la réponse ATTENDUE est refusée — ${j.reason ?? ""} ${j.message ?? ""}`,
      )
      continue
    }
    premierEssai[e.id] = true

    /* ── 2. La contre-épreuve : une CONTRADICTION, pas une omission ───────── */
    const mauvaise = contredire(e.action, etat)
    if (!mauvaise) {
      const cle = `${e.action.type} — aucune valeur contraire possible`
      inperdables[cle] = (inperdables[cle] ?? 0) + (e.points ?? 1)
      continue
    }
    void avant
    const k = jugerEtape(step, mauvaise.obs as never, adaptateurOutlook)
    if (k.ok) {
      anomalies.push(
        `${f} · ${e.id} (${e.action.type}) : ${mauvaise.quoi} est ACCEPTÉ — l'étape ne mesure rien`,
      )
      continue
    }
    if (k.compte === "faute") penalisantes.push(e.id)
    else {
      const cle = `${e.action.type} — ${mauvaise.quoi} classé « ${k.compte} » (${k.reason ?? "?"})`
      inperdables[cle] = (inperdables[cle] ?? 0) + (e.points ?? 1)
    }
  }

  const n = note(sc.steps as unknown as SimulationStep[], premierEssai)
  if (Math.abs(n.score - 1) > 1e-9) {
    anomalies.push(
      `${f} : un parcours SANS FAUTE ne vaut que ${(n.score * 100).toFixed(1)} % (${n.obtenus}/${n.total})`,
    )
  }

  const ptsPenalisants = sc.steps
    .filter((s) => penalisantes.includes(s.id))
    .reduce((t, s) => t + (s.points ?? 1), 0)

  etapesNotees += sc.steps.filter((s) => s.action.type !== "READ" && (s.points ?? 1) > 0).length
  pointsTotal += n.total
  pointsPenalisants += ptsPenalisants

  const part = n.total > 0 ? (ptsPenalisants / n.total) * 100 : 0
  parEvaluation.push({ fichier: f, total: n.total, perdables: ptsPenalisants, part })

  console.log(
    `  ${f} — ${n.total} point(s) · sans faute ${(n.score * 100).toFixed(0)} % · ` +
      `${ptsPenalisants}/${n.total} point(s) perdables (${part.toFixed(0)} %, ${penalisantes.length} étape(s))`,
  )

  if (ptsPenalisants === 0) {
    anomalies.push(
      `${f} : AUCUN point ne peut être perdu — cette évaluation rendra 100 % à tout le monde`,
    )
  } else if (part < PLANCHER_PAR_EVALUATION) {
    anomalies.push(
      `${f} : seuls ${ptsPenalisants}/${n.total} point(s) (${part.toFixed(0)} %) sont perdables — ` +
        `sous le plancher de ${PLANCHER_PAR_EVALUATION} %, un apprenant qui se trompe partout ` +
        `garderait ${(100 - part).toFixed(0)} % et donc la moyenne`,
    )
  }
}

console.log(
  `\n  ${evaluations} évaluation(s) Outlook · ${etapesNotees} étape(s) notée(s) · ${pointsTotal} point(s)`,
)
if (pointsTotal > 0) {
  const part = (pointsPenalisants / pointsTotal) * 100
  console.log(
    `  ${pointsPenalisants}/${pointsTotal} point(s) (${part.toFixed(0)} %) sont réellement perdables ` +
      `sur une réponse fausse — plancher ${PLANCHER_GLOBAL} % (le profil mesuré d'Excel).`,
  )
  const restes = Object.entries(inperdables).sort((a, b) => b[1] - a[1])
  if (restes.length) {
    console.log("  Ce qui reste inperdable, nommé :")
    for (const [quoi, pts] of restes) console.log(`    · ${pts} pt(s) — ${quoi}`)
  }
  const basses = [...parEvaluation].sort((a, b) => a.part - b.part).slice(0, 3)
  console.log(
    `  Les plus proches du plancher : ` +
      basses.map((e) => `${e.fichier.replace(/\.json$/, "")} ${e.part.toFixed(0)} %`).join(" · "),
  )

  if (part < PLANCHER_GLOBAL) {
    anomalies.push(
      `Seuls ${pointsPenalisants}/${pointsTotal} point(s) (${part.toFixed(0)} %) du barème Outlook sont ` +
        `perdables, sous le plancher de ${PLANCHER_GLOBAL} % — Excel, à socle identique, est à 70 %`,
    )
  }
}

if (anomalies.length === 0) {
  console.log("\n✓ Parcours sans faute à 100 %, contradictions toutes refusées ET payantes.")
  process.exit(0)
}
console.log()
for (const a of anomalies) console.log(`  ✗ ${a}`)
console.log(`✗ ${anomalies.length} anomalie(s).`)
process.exit(1)
