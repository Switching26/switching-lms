/**
 * Concurrence des verdicts en évaluation notée.
 *
 *   npx tsx scripts/simulation/check-verdicts.ts
 *
 * En correction locale, un verdict tombe dans la foulée du geste et rien ne
 * peut s'intercaler. En évaluation notée le verdict vient du serveur, un seul
 * geste produit souvent deux observations (`typed` puis `stateChange` ~350 ms
 * plus tard), et trois accidents deviennent possibles : appliquer un verdict
 * sur l'étape SUIVANTE, appliquer deux verdicts dans le désordre, ou retirer le
 * point « premier essai » d'une étape déjà réussie parce qu'une observation
 * fausse était encore en vol.
 *
 * Chacun de ces trois cas a son contrôle ci-dessous, avec sa contre-épreuve :
 * on vérifie aussi que le scénario reproduirait bien le défaut SANS la file.
 */

import {
  creerFileDeVerdicts,
  creerFileEnvois,
  creerVerrouEnvoi,
  type MotifRejet,
} from "../../lib/simulation/file-verdicts"

let echecs = 0
let total = 0

function verifie(intitule: string, condition: boolean, detail?: string) {
  total++
  if (!condition) {
    echecs++
    console.error(`  ✗ ${intitule}${detail ? ` — ${detail}` : ""}`)
  }
}

type Jugement = { ok: boolean; nom: string }

/** Une réponse de serveur qui met `ms` à revenir. */
function apres<T>(ms: number, valeur: T): Promise<T> {
  return new Promise((r) => setTimeout(() => r(valeur), ms))
}

/** Un atelier réduit à ce dont la file a besoin : l'étape courante et son verrou. */
function atelier(etape: string) {
  const etat = { etape: etape as string | null, resolue: false, appliques: [] as string[], rejets: [] as MotifRejet[] }
  const file = creerFileDeVerdicts<Jugement>({
    etapeCourante: () => etat.etape,
    estResolue: () => etat.resolue,
  })
  const appliquer = (j: Jugement) => {
    etat.appliques.push(j.nom)
    // C'est le vrai atelier qui pose le verrou dès qu'une observation réussit.
    if (j.ok) etat.resolue = true
  }
  return { etat, file, appliquer }
}

async function main() {
  console.log(`\n=== V. File des verdicts ===`)

  /* V1 — ORDRE D'ÉMISSION. Deux observations partent coup sur coup, la seconde
     réponse revient la première. La file doit appliquer dans l'ordre des
     billets, pas dans l'ordre d'arrivée. */
  {
    const { etat, file, appliquer } = atelier("E1")
    const b1 = file.prendre("E1")
    const b2 = file.prendre("E1")
    const p1 = file.enfiler(b1, apres(60, { ok: false, nom: "premier" }), appliquer)
    const p2 = file.enfiler(b2, apres(5, { ok: false, nom: "second" }), appliquer)
    await Promise.all([p1, p2])
    verifie("V1a · les verdicts sont appliqués dans l'ordre d'émission", etat.appliques.join(",") === "premier,second", etat.appliques.join(","))
    verifie("V1b · les deux sont bien appliqués", etat.appliques.length === 2)
  }

  /* V1' — CONTRE-ÉPREUVE. Sans la file, les mêmes promesses s'appliquent dans
     l'ordre d'ARRIVÉE : le contrôle V1 ne passe donc pas tout seul. */
  {
    const vus: string[] = []
    await Promise.all([
      apres(60, "premier").then((n) => vus.push(n)),
      apres(5, "second").then((n) => vus.push(n)),
    ])
    verifie("V1' · sans file, l'ordre s'inverse bel et bien", vus.join(",") === "second,premier", vus.join(","))
  }

  /* V2 — ÉTAPE DÉJÀ FRANCHIE. Une observation juste franchit l'étape pendant
     qu'une observation fausse est encore en vol. Celle-ci ne doit RIEN
     compter : sans cela elle retirerait le point « premier essai » d'une étape
     réussie. */
  {
    const { etat, file, appliquer } = atelier("E1")
    const bonne = file.prendre("E1")
    const fausse = file.prendre("E1")
    const p1 = file.enfiler(bonne, apres(5, { ok: true, nom: "juste" }), appliquer)
    const p2 = file.enfiler(fausse, apres(80, { ok: false, nom: "faute-en-retard" }), appliquer)
    const [, r2] = await Promise.all([p1, p2])
    verifie("V2a · seule l'observation juste est appliquée", etat.appliques.join(",") === "juste", etat.appliques.join(","))
    verifie("V2b · la faute en retard est rejetée pour la bonne raison", !r2.applique && r2.motif === "deja-resolue", JSON.stringify(r2))
  }

  /* V3 — ÉTAPE CHANGÉE. L'atelier est passé à l'étape suivante pendant
     l'aller-retour : le verdict décrit une question qui n'est plus à l'écran et
     ne doit pas compter une faute sur la suivante. */
  {
    const { etat, file, appliquer } = atelier("E1")
    const b = file.prendre("E1")
    const p = file.enfiler(b, apres(40, { ok: false, nom: "perdu" }), appliquer)
    etat.etape = "E2"
    const r = await p
    verifie("V3a · un verdict d'une autre étape n'est pas appliqué", etat.appliques.length === 0)
    verifie("V3b · le motif est explicite", !r.applique && r.motif === "etape-changee", JSON.stringify(r))
  }

  /* V4 — SANS RÉPONSE. Réseau tombé, serveur en erreur, requête abandonnée au
     bout du délai : on ne compte NI réussite NI faute. Faire perdre un point
     pour une requête tombée serait la pire façon de noter. */
  {
    const { etat, file, appliquer } = atelier("E1")
    const r1 = await file.enfiler(file.prendre("E1"), Promise.resolve(null), appliquer)
    const r2 = await file.enfiler(file.prendre("E1"), Promise.reject(new Error("réseau")), appliquer)
    verifie("V4a · une réponse absente ne compte rien", etat.appliques.length === 0)
    verifie("V4b · motif : sans verdict", !r1.applique && r1.motif === "sans-verdict")
    verifie("V4c · une promesse rejetée ne casse rien non plus", !r2.applique && r2.motif === "sans-verdict")
  }

  /* V4' — et surtout : une requête tombée ne FIGE pas la file. Le maillon
     suivant doit passer, sinon une coupure réseau bloquerait l'évaluation
     jusqu'à la fin. */
  {
    const { etat, file, appliquer } = atelier("E1")
    void file.enfiler(file.prendre("E1"), Promise.reject(new Error("réseau")), appliquer)
    await file.enfiler(file.prendre("E1"), apres(5, { ok: true, nom: "suite" }), appliquer)
    verifie("V4' · la file survit à une requête tombée", etat.appliques.join(",") === "suite", etat.appliques.join(","))
  }

  /* V5 — RAFALE. Huit observations sur la même étape, réponses en désordre
     complet : l'ordre d'application reste celui des billets, et tout s'arrête
     à la première réussite. */
  {
    const { etat, file, appliquer } = atelier("E1")
    const delais = [90, 10, 70, 5, 60, 20, 45, 1]
    const promesses = delais.map((ms, i) =>
      file.enfiler(
        file.prendre("E1"),
        apres(ms, { ok: i === 4, nom: `obs${i}` }),
        appliquer,
      ),
    )
    await Promise.all(promesses)
    verifie("V5a · aucune inversion sur huit observations", etat.appliques.join(",") === "obs0,obs1,obs2,obs3,obs4", etat.appliques.join(","))
    verifie("V5b · rien n'est appliqué après la réussite", etat.appliques.length === 5)
    verifie("V5c · l'étape est marquée résolue", etat.resolue)
  }

  /* V6 — le compteur de billets reste monotone d'une étape à l'autre : c'est
     lui qui rend « verdict périmé » détectable, et il ne doit pas repartir de
     zéro au changement d'étape. */
  {
    const { etat, file, appliquer } = atelier("E1")
    await file.enfiler(file.prendre("E1"), apres(1, { ok: true, nom: "a" }), appliquer)
    etat.etape = "E2"
    etat.resolue = false
    await file.enfiler(file.prendre("E2"), apres(1, { ok: true, nom: "b" }), appliquer)
    verifie("V6 · une nouvelle étape est bien jugée à son tour", etat.appliques.join(",") === "a,b", etat.appliques.join(","))
    verifie("V6' · le compte d'applications suit", file.appliques() === 2)
  }

  /* ═══ V7 · VERROU D'ENVOI — le double tap ═══════════════════════════════
   *
   * « Passer la question » envoie une requête puis avance au retour. Sans
   * verrou, un double tap lançait deux requêtes sur la même étape et leurs deux
   * retours faisaient avancer : l'atelier sautait une étape que le serveur
   * n'avait jamais vue passer, et tout ce qui suivait était refusé. */
  console.log(`\n=== V7. Verrou d'envoi ===`)
  {
    const verrou = creerVerrouEnvoi()
    let envois = 0
    let avances = 0
    const passer = () =>
      verrou.envoyer(async () => {
        envois++
        await apres(30, null)
        avances++
        return true
      })

    // Double tap : deux clics dans le même tour.
    const [a, b] = await Promise.all([passer(), passer()])
    verifie("V7a · une seule requête part", envois === 1, `${envois}`)
    verifie("V7b · une seule avance", avances === 1, `${avances}`)
    verifie("V7c · le second clic est refusé, pas mis en file", a === true && b === null)
    verifie("V7d · le verrou est levé après coup", !verrou.occupe())

    // Le clic SUIVANT, lui, doit passer : le verrou n'est pas un blocage définitif.
    const c = await passer()
    verifie("V7e · le clic suivant repasse", c === true && envois === 2 && avances === 2)

    // Et il se lève même quand l'envoi échoue — sinon une panne réseau
    // condamnerait le bouton pour le reste de l'évaluation.
    const verrou2 = creerVerrouEnvoi()
    await verrou2.envoyer(async () => {
      throw new Error("réseau")
    }).catch(() => undefined)
    verifie("V7f · le verrou se lève même sur échec", !verrou2.occupe())
    // Contre-épreuve : sans verrou, les deux clics partaient bel et bien.
    let sansVerrou = 0
    await Promise.all([
      (async () => { sansVerrou++; await apres(5, null) })(),
      (async () => { sansVerrou++; await apres(5, null) })(),
    ])
    verifie("V7g · contre-épreuve : sans verrou, deux envois partent", sansVerrou === 2)
  }


  /* === V8 . FILE D'ENVELOPPES - L'ORDRE EST STRICT =======================
   *
   * Une premiere version continuait la vidange apres un echec : elle gardait E1
   * en souffrance mais postait quand meme E2. Les consequences etaient reelles :
   * E1 rejouee APRES E2 faisait reculer `currentStep` et `lastPosition`, comptait
   * une session hors de son tour, et pouvait rouvrir une tentative deja close. */
  console.log(`\n=== V8. File d'enveloppes ===`)
  {
    const postes: string[] = []
    let e1Reglee = false
    const file = creerFileEnvois<string, string>(async (e) => {
      postes.push(e.cle)
      if (e.cle === "E1" && !e1Reglee) return { reglee: false, corps: null }
      return { reglee: true, corps: `ok:${e.cle}` }
    })

    const r1 = await file.deposer({ cle: "E1", corps: "a" })
    verifie("V8a . E1 non reglee ne rend rien", r1 === null, `${r1}`)
    verifie("V8b . elle reste en file", file.enAttente() === 1, `${file.enAttente()}`)

    // E2 est deposee alors que E1 n'est PAS acquittee : elle ne doit pas partir.
    const r2 = await file.deposer({ cle: "E2", corps: "b" })
    verifie("V8c . E2 n'est JAMAIS postee avant l'acquittement de E1", !postes.includes("E2"), postes.join(","))
    verifie("V8d . E2 ne rend rien non plus", r2 === null)
    verifie("V8e . les deux attendent, dans l'ordre", file.enAttente() === 2, `${file.enAttente()}`)

    // E1 passe enfin : la vidange reprend, et E2 part APRES elle.
    e1Reglee = true
    const r3 = await file.deposer({ cle: "E3", corps: "c" })
    verifie("V8f . l'ordre de sortie est E1 puis E2 puis E3",
      postes.join(",") === "E1,E1,E1,E2,E3", postes.join(","))
    verifie("V8g . la file est vide", file.enAttente() === 0, `${file.enAttente()}`)
    verifie("V8h . et E3 rend bien SA reponse, pas celle d'une autre", r3 === "ok:E3", `${r3}`)
  }

  /* V8' - un doublon reconnu par le serveur REGLE l'enveloppe : la garder en
   * file ferait boucler le reessai indefiniment. */
  {
    const postes: string[] = []
    const file = creerFileEnvois<string, string>(async (e) => {
      postes.push(e.cle)
      return e.cle === "D1" ? { reglee: true, corps: null } : { reglee: true, corps: `ok:${e.cle}` }
    })
    await file.deposer({ cle: "D1", corps: "x" })
    const r = await file.deposer({ cle: "D2", corps: "y" })
    verifie("V8'a . un doublon ne bloque pas la file", file.enAttente() === 0 && r === "ok:D2")
    verifie("V8'b . et chaque enveloppe n'est postee qu'une fois", postes.join(",") === "D1,D2", postes.join(","))
  }

  /* V8'' - un poste qui LEVE une exception ne casse ni la file ni l'ordre. */
  {
    const postes: string[] = []
    let casse = true
    const file = creerFileEnvois<string, string>(async (e) => {
      postes.push(e.cle)
      if (e.cle === "X1" && casse) throw new Error("reseau")
      return { reglee: true, corps: `ok:${e.cle}` }
    })
    await file.deposer({ cle: "X1", corps: "x" })
    await file.deposer({ cle: "X2", corps: "y" })
    verifie("V8''a . X2 n'est pas partie devant X1", !postes.includes("X2"), postes.join(","))
    casse = false
    const r = await file.deposer({ cle: "X3", corps: "z" })
    verifie("V8''b . tout repart dans l'ordre apres la panne",
      postes.join(",") === "X1,X1,X1,X2,X3" && r === "ok:X3", postes.join(","))
  }

  /* V8''' - CONTRE-EPREUVE : sans l'arret net, E2 partait bel et bien devant. */
  {
    const postes: string[] = []
    for (const e of ["E1", "E2"]) {
      postes.push(e)
      if (e === "E1") continue // « non reglee » : on la garde... et on continue
    }
    verifie("V8''' . contre-epreuve : sans arret net, E2 part malgre E1 en souffrance",
      postes.join(",") === "E1,E2", postes.join(","))
  }

  console.log(`\n${echecs === 0 ? "✓" : "✗"} ${total - echecs}/${total} contrôles passés`)
  if (echecs > 0) process.exit(1)
}

void main()
