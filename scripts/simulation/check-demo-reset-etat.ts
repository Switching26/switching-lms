/**
 * LE « VRAI RESET » AVANT UNE DÉMONSTRATION — garde-fou statique, 4 applications.
 *
 *   npx tsx scripts/simulation/check-demo-reset-etat.ts
 *
 * POURQUOI CE FICHIER EXISTE
 * Le 07/08/2026, Samuel filme Word : l'apprenant ouvre l'onglet Affichage, puis
 * demande la démonstration. Celle-ci doit désigner le bouton **G** du groupe
 * Police, qui vit dans l'onglet Accueil — donc absent du DOM. Rien n'est
 * dessiné, et le compteur affiche quand même 2/2. Mesuré au banc :
 * `~/checkos/scratchpads/lms-reset-socle/mesures-cas-filme.jsonl`.
 *
 * `check-demo-rejeu.ts` ne pouvait pas le voir : il vérifie que les deux
 * passages partent du MÊME état, et ici ils en partent bien — le même état
 * abîmé. Deux passages vides sont parfaitement identiques.
 *
 * LA RÈGLE QUE CE CONTRÔLE TIENT
 *
 *   La photo de reprise se prend À L'ARRIVÉE SUR L'ÉTAPE, jamais au clic de
 *   l'apprenant, et elle couvre le document ET l'interface.
 *
 * Quatre propriétés, chacune capable de rougir seule :
 *
 *   0. LE SOCLE    les quatre players passent par `useClicheEtape`, le cliché
 *                  commun, et non par un rappel maison. Cette propriété rougit
 *                  tant que le chantier n'est pas fini : c'est son compteur.
 *   1. CÂBLAGE     les quatre players branchent `avantDemonstration`.
 *   2. L'INSTANT   aucune photo n'est prise dans un effet qui dépend du
 *                  déclenchement de la démonstration (`demonstration`, `rejeu`).
 *                  C'est le défaut d'Excel : `SimulationPlayer.tsx` prend son
 *                  cliché 400 ms APRÈS le premier clic, donc la pollution de
 *                  l'apprenant est DANS la photo, et chaque rejeu la reproduit.
 *   3. LE SILENCE  aucun chemin de restauration ne renonce sans le dire.
 *                  PowerPoint et Outlook portent `if (!depart || depart.id !==
 *                  stepRef.current?.id) return` : quand la photo ne correspond
 *                  pas, rien n'est restauré et personne n'en sait rien.
 *
 * CE QU'IL NE FAIT PAS
 * Il ne prouve pas qu'une démonstration est VISIBLE — seul le banc navigateur
 * le peut (`/tmp/banc-reset/mesure.cjs`, protocole dans le rapport de l'agent
 * socle). Il empêche que le mécanisme soit débranché sans qu'on s'en aperçoive.
 *
 * ⚠️ CE CONTRÔLE EST PIÉGÉ, et le piège est rejouable :
 *   npx tsx scripts/simulation/check-demo-reset-etat.ts --piege
 * introduit chaque défaut dans une COPIE EN MÉMOIRE des sources et vérifie que
 * la propriété correspondante rougit. Un contrôle qu'on n'a pas vu rougir ne
 * prouve rien : sur ce projet, six « faux témoins » ont déjà été pris à valider
 * du vide.
 */

import * as fs from "fs"
import * as path from "path"

const RACINE = path.join(__dirname, "..", "..")
const C = path.join(RACINE, "components", "simulation")

type Source = { nom: string; chemin: string; src: string }

const PLAYERS: Array<{ nom: string; chemin: string }> = [
  { nom: "Excel", chemin: path.join(C, "SimulationPlayer.tsx") },
  { nom: "Word", chemin: path.join(C, "word", "WordPlayer.tsx") },
  { nom: "PowerPoint", chemin: path.join(C, "ppt", "PptPlayer.tsx") },
  { nom: "Outlook", chemin: path.join(C, "outlook", "OutlookPlayer.tsx") },
]

const NOYAU = path.join(C, "hooks", "useAtelier.ts")

/**
 * Retire les COMMENTAIRES avant toute recherche. Rien d'autre.
 *
 * Sans cela, un contrôle « vérifie » une règle en tombant sur le commentaire qui
 * la décrit — c'est arrivé sur ce projet, et le contrôle est resté vert pendant
 * que le code était faux.
 *
 * 🔴 ON NE RETIRE PAS LES CHAÎNES, ET C'EST DÉLIBÉRÉ. Une première version le
 * faisait, et elle s'est piégée elle-même : dans un `.tsx`, le texte JSX en
 * français porte des apostrophes (« l'apprenant ») que rien ne distingue d'une
 * ouverture de chaîne. Un caractère isolé faisait basculer tout le reste du
 * fichier en « chaîne », et le contrôle annonçait alors que **PowerPoint ne
 * branchait AUCUN `avantDemonstration`** — alors qu'il le branche
 * (`PptPlayer.tsx:285`). Faux positif, sur un fichier sain.
 *
 * Le risque inverse — un `avantDemonstration:` qui ne vivrait que dans une
 * chaîne de caractères — n'existe pas dans ce dépôt, et le piège n°4 vérifie ce
 * qui compte vraiment : qu'un branchement mis en commentaire ne passe pas pour
 * un branchement.
 */
function codeSeul(src: string): string {
  let out = ""
  let i = 0
  let etat: "code" | "ligne" | "bloc" = "code"
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (etat === "code") {
      if (c === "/" && d === "/") { etat = "ligne"; i += 2; continue }
      if (c === "/" && d === "*") { etat = "bloc"; i += 2; continue }
      out += c; i++; continue
    }
    if (etat === "ligne") { if (c === "\n") { etat = "code"; out += "\n" } i++; continue }
    // bloc : on garde les sauts de ligne pour que les numéros restent justes
    if (c === "*" && d === "/") { etat = "code"; i += 2; continue }
    if (c === "\n") out += "\n"
    i++
  }
  return out
}

const ligneDe = (src: string, index: number) => src.slice(0, index).split("\n").length

type Constat = { player: string; propriete: string; message: string }

/* ═══════════ LES TROIS PROPRIÉTÉS ═══════════ */

/**
 * 0. LE SOCLE — le player passe par le cliché commun, pas par un rappel maison.
 *
 * `useClicheEtape` (`hooks/useAtelier.ts`) tient les deux règles à la place des
 * quatre apps : photo à l'arrivée sur l'étape, et refus de renoncer en silence.
 * Un player qui garde son propre rappel garde aussi ses propres défauts — c'est
 * exactement l'état d'avant le 07/08, où chacun restaurait un morceau différent.
 *
 * ⚠️ Cette propriété rougit tant que les quatre apps ne sont pas branchées.
 * C'est voulu : c'est le compteur de fin de chantier.
 */
function verifierSocle(s: Source): Constat[] {
  const code = codeSeul(s.src)
  if (/\buseClicheEtape\s*[(<]/.test(code)) return []
  return [{
    player: s.nom, propriete: "socle",
    message: "n'utilise pas encore `useClicheEtape` : ce player restaure à sa façon, donc avec ses propres trous. Contrat §3.",
  }]
}

/** 1. CÂBLAGE — le player branche bien `avantDemonstration`. */
function verifierCablage(s: Source): Constat[] {
  const code = codeSeul(s.src)
  if (!/avantDemonstration\s*:/.test(code)) {
    return [{
      player: s.nom, propriete: "câblage",
      message: "aucun `avantDemonstration:` — ce player ne restaure RIEN avant une démonstration",
    }]
  }
  return []
}

/**
 * 2. L'INSTANT — aucune photo prise dans un effet déclenché par la démonstration.
 *
 * On cherche les `useEffect` dont le tableau de dépendances contient
 * `demonstration` ou `rejeu`, et dont le corps prend une photo (`prendreCliche`,
 * `= prendreCliche…`, `…DepartEtapeRef.current =`). Une photo prise là est
 * prise APRÈS que l'apprenant a agi : elle enregistre sa pollution.
 */
function verifierInstant(s: Source): Constat[] {
  const code = codeSeul(s.src)
  const constats: Constat[] = []
  const re = /useEffect\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    const debut = m.index
    // Fin de l'appel : on suit les parenthèses.
    let prof = 0, fin = debut
    for (let i = debut; i < code.length; i++) {
      if (code[i] === "(") prof++
      else if (code[i] === ")") { prof--; if (prof === 0) { fin = i; break } }
    }
    const bloc = code.slice(debut, fin + 1)
    // Le tableau de dépendances est le dernier `[...]` de l'appel.
    const deps = bloc.match(/\[[^[\]]*\]\s*\)\s*$/)?.[0] ?? ""
    const depsDeclenchement = /\b(demonstration|rejeu)\b/.test(deps)
    if (!depsDeclenchement) continue
    const prendPhoto =
      /\bprendreCliche\w*\s*\(/.test(bloc) ||
      /\w*DepartEtapeRef\.current\s*=/.test(bloc) ||
      /\bclicheDemoRef\.current\s*=\s*(?!null)/.test(bloc)
    if (prendPhoto) {
      constats.push({
        player: s.nom, propriete: "instant",
        message:
          `ligne ~${ligneDe(code, debut)} : une photo de reprise est prise dans un effet qui dépend de ` +
          `${/demonstration/.test(deps) ? "`demonstration`" : "`rejeu`"} — donc APRÈS le clic de l'apprenant. ` +
          "Sa pollution entre dans la photo, et chaque « Revoir » la reproduit.",
      })
    }
  }
  return constats
}

/**
 * 3. LE SILENCE — le chemin de restauration ne renonce jamais sans le dire.
 *
 * Un `return` nu, gardé par une comparaison d'identifiant d'étape, dans une
 * fonction de restauration : c'est un reset qui échoue en silence.
 */
function verifierSilence(s: Source): Constat[] {
  const code = codeSeul(s.src)
  const constats: Constat[] = []
  const re = /if\s*\([^)]*\.id\s*!==[^)]*\)\s*return\s*(?![^;\n]*\w)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    // Le voisinage dit-il qu'on est bien dans une restauration ?
    const autour = code.slice(Math.max(0, m.index - 900), m.index + 200)
    if (!/(depart|Depart|repose|Repose|restaur|Restaur|cliche|Cliche)/.test(autour)) continue
    constats.push({
      player: s.nom, propriete: "silence",
      message:
        `ligne ~${ligneDe(code, m.index)} : la restauration renonce en silence quand la photo ne ` +
        "correspond pas à l'étape courante. Un reset qui échoue sans le dire est exactement le défaut filmé.",
    })
  }
  return constats
}

/* ═══════════ LE PIÈGE ═══════════ */

/**
 * On introduit chaque défaut dans une COPIE EN MÉMOIRE, et on exige que la
 * propriété correspondante rougisse. Puis on vérifie que la source d'origine
 * redonne bien le verdict d'origine — sans quoi le piège prouverait seulement
 * que le contrôle rougit toujours.
 */
function piege(): boolean {
  let ok = true
  const dire = (nom: string, reussi: boolean, detail: string) => {
    if (!reussi) ok = false
    console.log(`  ${reussi ? "✓" : "✗"} ${nom} — ${detail}`)
  }

  // (1) câblage : on retire le branchement d'un player sain.
  const word: Source = { nom: "Word", chemin: "", src: fs.readFileSync(path.join(C, "word", "WordPlayer.tsx"), "utf8") }
  dire("câblage, source intacte", verifierCablage(word).length === 0, "aucun constat, comme attendu")
  const sansCablage: Source = { ...word, src: word.src.replace(/avantDemonstration\s*:/g, "avantAutreChose:") }
  dire("câblage, branchement retiré", verifierCablage(sansCablage).length === 1, "le contrôle rougit")

  // (2) instant : on ajoute à un player sain une photo dans un effet de démonstration.
  const ppt: Source = { nom: "PowerPoint", chemin: "", src: fs.readFileSync(path.join(C, "ppt", "PptPlayer.tsx"), "utf8") }
  const avantInstant = verifierInstant(ppt).length
  const avecDefaut: Source = {
    ...ppt,
    src: ppt.src + `
export function __piege() {
  useEffect(() => {
    deckDepartEtapeRef.current = { id: 1, deck: 2 }
  }, [demonstration, rejeu])
}
`,
  }
  dire("instant, défaut introduit", verifierInstant(avecDefaut).length === avantInstant + 1, "le contrôle rougit sur l'effet ajouté")
  dire("instant, source intacte", verifierInstant(ppt).length === avantInstant, `verdict d'origine retrouvé (${avantInstant} constat[s])`)

  // (3) silence : on ajoute un renoncement muet à un player.
  const avantSilence = verifierSilence(word).length
  const avecSilence: Source = {
    ...word,
    src: word.src + `
export function __piege2() {
  const depart = clicheDepartRef.current
  if (!depart || depart.id !== stepRef.current?.id) return
  reposer(depart)
}
`,
  }
  dire("silence, défaut introduit", verifierSilence(avecSilence).length === avantSilence + 1, "le contrôle rougit")

  // (4) le contrôle ne doit PAS se laisser piéger par un commentaire.
  const commentaireSeul: Source = {
    nom: "Faux", chemin: "",
    src: `// avantDemonstration: restaurerTout()\n/* if (!depart || depart.id !== s.id) return */\nconst x = 1\n`,
  }
  dire(
    "immunité aux commentaires",
    verifierCablage(commentaireSeul).length === 1 && verifierSilence(commentaireSeul).length === 0,
    "un branchement en commentaire ne vaut pas un branchement, et un renoncement en commentaire n'est pas un défaut",
  )

  /* (5) LE FAUX POSITIF QUI A PIÉGÉ CE CONTRÔLE, le 07/08/2026.
   *
   * La première version retirait aussi les chaînes de caractères. Dans un
   * `.tsx`, le texte JSX français porte des apostrophes que rien ne distingue
   * d'une ouverture de chaîne : une seule faisait basculer le reste du fichier,
   * et le contrôle annonçait que PowerPoint ne branchait aucun
   * `avantDemonstration` — sur un fichier parfaitement sain.
   *
   * Ce cas reste dans le piège pour qu'il ne revienne pas. */
  for (const p of PLAYERS) {
    const s: Source = { nom: p.nom, chemin: p.chemin, src: fs.readFileSync(p.chemin, "utf8") }
    dire(
      `pas de faux positif de câblage — ${p.nom}`,
      verifierCablage(s).length === 0,
      "le branchement est vu, apostrophes du texte JSX comprises",
    )
  }

  // (6) socle : un player branché doit verdir, un player non branché rougir.
  const branche = { nom: 'Fictif', chemin: '', src: 'const c = useClicheEtape({ etapeId, prete, relever, reposer })\n' }
  const pasBranche = { nom: 'Fictif', chemin: '', src: 'const c = monClicheMaison({ etapeId })\n' }
  dire('socle, player branché', verifierSocle(branche).length === 0, 'aucun constat')
  dire('socle, player non branché', verifierSocle(pasBranche).length === 1, 'le contrôle rougit')

  return ok
}

/* ═══════════ EXÉCUTION ═══════════ */

function main() {
  if (process.argv.includes("--piege")) {
    console.log("PIÈGE — on introduit chaque défaut et on exige que le contrôle rougisse.\n")
    const ok = piege()
    console.log(ok ? "\n✓ Le contrôle détecte bien ce qu'il prétend détecter." : "\n✗ PIÈGE EN ÉCHEC — ce contrôle ne prouve rien.")
    process.exit(ok ? 0 : 1)
  }

  if (!fs.existsSync(NOYAU)) {
    console.error(`✗ noyau introuvable : ${NOYAU}`)
    process.exit(1)
  }

  const constats: Constat[] = []
  for (const p of PLAYERS) {
    if (!fs.existsSync(p.chemin)) {
      constats.push({ player: p.nom, propriete: "câblage", message: `fichier introuvable : ${p.chemin}` })
      continue
    }
    const s: Source = { nom: p.nom, chemin: p.chemin, src: fs.readFileSync(p.chemin, "utf8") }
    constats.push(...verifierSocle(s), ...verifierCablage(s), ...verifierInstant(s), ...verifierSilence(s))
  }

  console.log("LE « VRAI RESET » AVANT UNE DÉMONSTRATION — 4 applications\n")
  for (const p of PLAYERS) {
    const miens = constats.filter((c) => c.player === p.nom)
    if (!miens.length) { console.log(`  ✓ ${p.nom}`); continue }
    console.log(`  ✗ ${p.nom}`)
    for (const c of miens) console.log(`      [${c.propriete}] ${c.message}`)
  }

  if (constats.length) {
    console.log(`\n${constats.length} constat(s). Règle : la photo se prend à l'arrivée sur l'étape, jamais au clic ; elle couvre le document ET l'interface.`)
    console.log("Contrat : ~/checkos/scratchpads/lms-reset-socle/CONTRAT.md")
    process.exit(1)
  }
  console.log("\n✓ Les quatre players reposent l'état de départ de l'étape avant chaque démonstration.")
}

main()
