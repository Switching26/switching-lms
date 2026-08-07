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
const CHASSIS = path.join(C, "AtelierShell.tsx")

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

/**
 * 4. LE RECOURS — le bouton « Revoir la démonstration » ne doit pas s'évaporer.
 *
 * Défaut trouvé le 07/08/2026 par l'agent Outlook, cause établie ici en pilotant
 * le noyau seul dans un vrai React :
 *
 *   démo finie   {demonstration:true, demoFinie:true,  rejeu:0}   ← bouton visible
 *   essai 5      {demonstration:true, demoFinie:false, rejeu:0}   ← bouton perdu, RIEN ne rejoue
 *   essai 6      {demonstration:true, demoFinie:false, rejeu:0}   ← et ça recommence
 *
 * Deux causes distinctes, toutes deux dans `useAtelier.ts` :
 *
 *   (a) `demarrerDemonstration` faisait `setDemonstration(true)` sur un état
 *       DÉJÀ vrai. React ne remonte alors pas le calque — seule la clé `rejeu`
 *       le remonte — mais `demoFinie` était quand même remis à faux. Résultat :
 *       l'encart vert reste, son bouton disparaît, et aucune démonstration ne
 *       joue. L'apprenant perd son seul recours au pire moment.
 *   (b) `compterEssai` déclenchait le palier avec `>= 5` au lieu de `=== 5` :
 *       la démonstration se relançait à CHAQUE erreur au-delà de la cinquième,
 *       et `avantDemonstration` remettait l'écran à zéro à chaque fois — trois
 *       remises à zéro pour six erreurs, sans un mot à l'apprenant.
 *
 * Ce défaut est dans le NOYAU COMMUN : les quatre players appellent
 * `compterEssai` et passent `demoRejouable` au châssis. Il ne dépend donc ni de
 * l'application, ni de l'étape — seulement du compteur d'erreurs.
 */
function verifierRecours(noyau: string): Constat[] {
  const code = codeSeul(noyau)
  const constats: Constat[] = []

  const bloc = code.match(/const\s+demarrerDemonstration\s*=\s*useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\)/)
  if (!bloc) {
    constats.push({ player: "noyau", propriete: "recours", message: "`demarrerDemonstration` introuvable dans le noyau" })
  } else if (!/setRejeu\s*\(/.test(bloc[0])) {
    constats.push({
      player: "noyau", propriete: "recours",
      message:
        "`demarrerDemonstration` ne rejoue pas quand une démonstration est déjà à l'écran : " +
        "`setDemonstration(true)` sur un état déjà vrai ne remonte pas le calque, mais retire le bouton « Revoir ».",
    })
  }

  if (/\bsuivant\s*>=\s*5\b/.test(code)) {
    constats.push({
      player: "noyau", propriete: "recours",
      message:
        "le palier 5 se déclenche avec `>= 5` : la démonstration se relance à CHAQUE erreur au-delà, " +
        "et l'écran de l'apprenant est remis à zéro à chaque fois. Un palier se franchit une fois (`=== 5`).",
    })
  }
  return constats
}

/**
 * 5. LES PANNEAUX — une démonstration ne se joue jamais derrière eux.
 *
 * Défaut trouvé le 07/08/2026 par l'agent Excel. L'apprenant arrive sur un écran
 * « À comprendre », ouvre le sommaire pour voir où il en est, et un peu plus
 * d'une seconde plus tard la démonstration démarre TOUTE SEULE, entièrement
 * derrière le panneau. Il ne voit rien, le compteur affiche 3/3, et le bouton
 * pour la rejouer est lui aussi sous le voile.
 *
 * Ce n'est ni le cliché ni un player : c'est une frontière que personne ne
 * surveillait entre le calque (plan 40) et les panneaux du châssis (voile 60,
 * panneau 70). Mesuré : sommaire ouvert, **0 repère visible sur 46** ; après
 * correctif, **48 sur 48**.
 *
 * Concerne 489 écrans : Excel 233, PowerPoint 191, Word 65. Outlook n'en a
 * aucun — 55 écrans de lecture, mais aucun ne porte de démonstration.
 */
function verifierPanneaux(chassis: string): Constat[] {
  const code = codeSeul(chassis)
  // L'effet doit exister, être déclenché par la démonstration, et fermer LES DEUX.
  const effets = code.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]{0,700}?\},\s*\[[^\]]*\]\)/g) ?? []
  const ferme = effets.some(
    (e) =>
      /demoEnCours|demonstration/.test(e) &&
      /setPanneau\(\s*null\s*\)/.test(e) &&
      /setGuideOuvert\(\s*false\s*\)/.test(e),
  )
  if (ferme) return []
  return [{
    player: "châssis",
    propriete: "panneaux",
    message:
      "aucun effet ne referme le panneau et le guide quand une démonstration démarre : elle se jouerait " +
      "derrière eux (calque plan 40, voile 60, panneau 70), sans qu'aucune erreur ne le signale.",
  }]
}

/* ═══════════ LA DÉROGATION EXCEL ═══════════ */

/**
 * DÉROGATION `excel-rouvre-l-onglet` — décidée le 07/08/2026, chef d'orchestre.
 *
 * CE QU'ELLE COUVRE, et rien d'autre : les constats `socle` et `instant` sur le
 * seul player Excel.
 *
 * LA RAISON. Excel ne RESTAURE pas l'onglet du ruban — il le ROUVRE pendant la
 * démonstration. Il est la seule application à passer un contexte à
 * `planDemonstration`, laquelle préfixe alors un geste qui ouvre l'onglet requis
 * quand il diffère de l'onglet courant. Autre chemin que le cliché, même
 * résultat pour l'apprenant, et pédagogiquement meilleur puisqu'il voit où
 * aller. Mesuré par l'agent Excel sur les 1 587 démonstrations : un seul cas en
 * défaut, et pour une autre cause. Samuel n'a autorisé que la correction du cas
 * des deux onglets ; brancher Excel sur `useClicheEtape` sortirait de ce cadre.
 *
 * ⚠️ CE QU'ELLE NE COUVRE PAS — LE RESTE OUVERT, ÉCRIT NOIR SUR BLANC.
 * Le geste préfixé ne rouvre QUE l'onglet. Les autres états d'interface d'Excel
 * — un volet, une boîte de dialogue ou un menu qu'un apprenant laisserait
 * ouvert AVANT son premier « Voir le geste » — ne sont ni photographiés à
 * l'arrivée sur l'étape, ni compensés par un geste préfixé. **NON MESURÉ**, ni
 * par l'agent Excel ni par l'agent socle. Une dérogation qui cache un trou est
 * pire que le rouge : celle-ci le nomme.
 *
 * ELLE EST CONDITIONNELLE. Elle ne tient que tant qu'Excel passe réellement un
 * contexte à `planDemonstration` — c'est ce qui déclenche le geste d'ouverture.
 * Le jour où cet appel perd son second argument, la raison s'effondre et le
 * contrôle REDEVIENT ROUGE, sans que personne ait à s'en souvenir.
 */
const DEROGATION = {
  nom: "excel-rouvre-l-onglet",
  date: "07/08/2026",
  player: "Excel",
  proprietes: ["socle", "instant"],
  raison:
    "Excel ne restaure pas l'onglet, il le ROUVRE pendant la démonstration : c'est la seule app qui " +
    "passe un contexte à `planDemonstration`, laquelle préfixe un geste d'ouverture quand l'onglet " +
    "requis diffère. Mesuré par l'agent Excel sur 1 587 démonstrations, 1 seul cas en défaut et pour " +
    "une autre cause.",
  resteOuvert:
    "NON MESURÉ : les AUTRES états d'interface d'Excel — volet, boîte ou menu laissé ouvert AVANT le " +
    "premier « Voir le geste » — ne sont ni photographiés à l'arrivée, ni compensés par un geste préfixé.",
}

/**
 * La dérogation tient-elle encore ?
 *
 * Un seul critère, celui qui porte toute la raison : Excel passe-t-il un
 * CONTEXTE à `planDemonstration` ? Sans second argument, aucun geste
 * d'ouverture n'est préfixé et l'onglet laissé par l'apprenant reste en place —
 * la dérogation n'a plus de fondement.
 */
function derogationTient(playerExcel: string): boolean {
  const code = codeSeul(playerExcel)
  return /planDemonstration\s*\(\s*[^,()]+(\([^()]*\))?[^,()]*,\s*[^)\s]/.test(code)
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

  /* ══════════════════════════════════════════════════════════════════════════
   * (5 bis) LES QUATRE APPLICATIONS, UNE PAR UNE — rougir, puis reverdir.
   *
   * Les pièges ci-dessus valident chaque propriété isolément, sur un player
   * choisi. Celui-ci fait le tour complet : pour CHACUNE des quatre apps, on
   * part de sa source réelle, on introduit le défaut du 07/08 — la photo prise
   * au clic ET le renoncement muet — et on exige que le contrôle rougisse ;
   * puis on part de sa source RÉPARÉE et on exige 0 constat.
   *
   * « Reverdir » n'est pas « retrouver le verdict d'aujourd'hui » : les quatre
   * apps portent encore de vrais défauts, et un piège qui se contenterait de
   * retrouver leur nombre de constats prouverait seulement que le contrôle est
   * stable. On construit donc une version SAINE de chaque source et on exige
   * qu'elle passe à zéro — c'est la seule preuve que le contrôle sait dire oui.
   * ═══════════════════════════════════════════════════════════════════════════ */
  const tousConstats = (s: Source) =>
    [...verifierSocle(s), ...verifierCablage(s), ...verifierInstant(s), ...verifierSilence(s)]

  /** Le défaut du 07/08, greffé sur n'importe quelle app. */
  const avecLeDefaut = (s: Source): Source => ({
    ...s,
    src:
      s.src +
      `
export function __defautDu7Aout() {
  useEffect(() => {
    clicheDemoRef.current = prendreClicheDemo()
  }, [demonstration, rejeu])
  const depart = clicheDepartRef.current
  if (!depart || depart.id !== stepRef.current?.id) return
  reposer(depart.etat)
}
`,
  })

  /**
   * La version RÉPARÉE : on retire ce que le contrôle reproche réellement.
   *
   *  · le socle    → on branche `useClicheEtape` ;
   *  · l'instant   → on retire `demonstration` et `rejeu` des dépendances de
   *                  l'effet qui photographie (Excel) ;
   *  · le silence  → on remplace le `return` muet par un rattrapage explicite.
   */
  const reparee = (s: Source): Source => {
    let src = s.src
    // silence : le `return` nu gardé par une comparaison d'identifiant d'étape.
    src = src.replace(
      /if\s*\((\s*!\w+\s*\|\|\s*)?[\w.]*depart[\w.]*\.id\s*!==([^)]*)\)\s*return\b(?![^;\n]*\w)/gi,
      "if ($1depart.id !==$2) { rattraper(); return }",
    )
    // instant : la photo ne dépend plus du déclenchement de la démonstration.
    src = src.replace(/\}, \[demonstration, rejeu, gridReady\]\)/g, "}, [index, gridReady])")
    // socle : le player passe par le cliché commun.
    src += "\nconst __cliche = useClicheEtape({ etapeId, prete, relever, reposer })\n"
    return { ...s, src }
  }

  for (const p of PLAYERS) {
    const s: Source = { nom: p.nom, chemin: p.chemin, src: fs.readFileSync(p.chemin, "utf8") }
    const n0 = tousConstats(s).length
    const avec = tousConstats(avecLeDefaut(s)).length
    dire(
      `${p.nom} — défaut introduit`,
      avec > n0,
      `${n0} constat(s) sur la source réelle → ${avec} avec le défaut greffé : le contrôle rougit`,
    )
    const apres = tousConstats(reparee(s))
    dire(
      `${p.nom} — défaut retiré`,
      apres.length === 0,
      apres.length === 0
        ? "0 constat sur la source réparée : le contrôle reverdit"
        : `IL RESTE ${apres.length} constat(s) : ${apres.map((c) => c.propriete).join(", ")}`,
    )
  }

  /* (5 ter) LE RECOURS — le bouton qui s'évapore. */
  const noyauReel = fs.readFileSync(NOYAU, "utf8")
  dire('recours, noyau réel', verifierRecours(noyauReel).length === 0, 'aucun constat')
  const sansRejeu = noyauReel.replace(
    /if \(demonstrationRef\.current\) setRejeu\(\(n\) => n \+ 1\)\s*\n\s*else setDemonstration\(true\)/,
    'setDemonstration(true)')
  dire('recours, rejeu retiré du démarrage', verifierRecours(sansRejeu).length === 1,
       'le contrôle rougit : démarrer une démo déjà à l\'écran ne relancerait rien')
  const seuilLache = noyauReel.replace('if (suivant === 5)', 'if (suivant >= 5)')
  dire('recours, palier repassé en >= 5', verifierRecours(seuilLache).length === 1,
       'le contrôle rougit : le palier se redéclencherait à chaque erreur')

  /* (5 quater) LA DÉROGATION EXCEL — elle doit TOMBER si sa raison s'effondre.
   *
   * Condition posée par le chef : la dérogation ne vaut que tant qu'Excel passe
   * un contexte à `planDemonstration`, puisque c'est ce second argument qui
   * déclenche le geste d'ouverture d'onglet. Le jour où il disparaît, le
   * contrôle doit redevenir rouge sans que personne ait à s'en souvenir. */
  const excelSrc = fs.readFileSync(path.join(C, "SimulationPlayer.tsx"), "utf8")
  dire("dérogation Excel, source réelle", derogationTient(excelSrc),
       "elle tient : Excel passe bien un contexte à `planDemonstration`")

  // Le second argument disparaît → la raison s'effondre → la dérogation tombe.
  const sansContexte = excelSrc.replace(
    /planDemonstration\(([^,()]*(?:\([^()]*\))?[^,()]*),\s*[^)]*\)/g,
    "planDemonstration($1)",
  )
  dire("dérogation Excel, contexte retiré", !derogationTient(sansContexte),
       "elle tombe : sans second argument, aucun geste n'ouvre l'onglet")

  // Et la dérogation ne doit JAMAIS couvrir une autre application.
  dire("dérogation Excel, portée",
       DEROGATION.player === "Excel" && DEROGATION.proprietes.every((p) => ["socle", "instant"].includes(p)),
       "elle ne couvre qu'Excel, et seulement `socle` et `instant`")

  /* (5 quinquies) LES PANNEAUX — l'effet de fermeture doit être là, et agir. */
  const chassisReel = fs.readFileSync(CHASSIS, "utf8")
  dire("panneaux, châssis réel", verifierPanneaux(chassisReel).length === 0,
       "l'effet referme bien le panneau et le guide au démarrage")
  dire("panneaux, effet retiré",
       verifierPanneaux(chassisReel.replace(/setPanneau\(null\)\s*\n\s*setGuideOuvert\(false\)/, "")).length === 1,
       "le contrôle rougit")
  dire("panneaux, guide oublié",
       verifierPanneaux(chassisReel.replace(/setGuideOuvert\(false\)/, "")).length === 1,
       "le contrôle rougit si le guide n'est pas refermé aussi")
  dire("panneaux, un commentaire ne suffit pas",
       verifierPanneaux(chassisReel.replace(/setPanneau\(null\)/, "// setPanneau(null)")).length === 1,
       "mettre la fermeture en commentaire ne trompe pas le contrôle")

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

  let constats: Constat[] = []
  // Le recours vit dans le NOYAU, pas dans un player : il se vérifie une fois.
  constats.push(...verifierRecours(fs.readFileSync(NOYAU, "utf8")))
  // Les panneaux vivent dans le CHÂSSIS, commun aux quatre apps.
  constats.push(...verifierPanneaux(fs.readFileSync(CHASSIS, "utf8")))
  for (const p of PLAYERS) {
    if (!fs.existsSync(p.chemin)) {
      constats.push({ player: p.nom, propriete: "câblage", message: `fichier introuvable : ${p.chemin}` })
      continue
    }
    const s: Source = { nom: p.nom, chemin: p.chemin, src: fs.readFileSync(p.chemin, "utf8") }
    constats.push(...verifierSocle(s), ...verifierCablage(s), ...verifierInstant(s), ...verifierSilence(s))
  }

  /* LA DÉROGATION EXCEL — retirée des constats, JAMAIS de l'affichage.
   * Elle ne s'applique que si sa raison tient encore (§ `derogationTient`). */
  const excel = PLAYERS.find((p) => p.nom === DEROGATION.player)
  const excelSrc = excel && fs.existsSync(excel.chemin) ? fs.readFileSync(excel.chemin, "utf8") : ""
  const derogationActive = !!excelSrc && derogationTient(excelSrc)
  const derogues = constats.filter(
    (c) => derogationActive && c.player === DEROGATION.player && DEROGATION.proprietes.includes(c.propriete),
  )
  if (derogues.length) constats = constats.filter((c) => !derogues.includes(c))

  console.log("LE « VRAI RESET » AVANT UNE DÉMONSTRATION — 4 applications\n")
  for (const p of PLAYERS) {
    const miens = constats.filter((c) => c.player === p.nom)
    if (!miens.length) { console.log(`  ✓ ${p.nom}`); continue }
    console.log(`  ✗ ${p.nom}`)
    for (const c of miens) console.log(`      [${c.propriete}] ${c.message}`)
  }

  /* LA DÉROGATION S'AFFICHE TOUJOURS, avec son reste ouvert.
   * Une dérogation qu'on ne voit pas est un défaut qu'on a oublié. */
  if (derogues.length) {
    console.log(`\n  ⚖ DÉROGATION « ${DEROGATION.nom} » — ${DEROGATION.date}, ${DEROGATION.player} seulement`)
    console.log(`      couvre : ${derogues.map((c) => c.propriete).join(", ")}`)
    console.log(`      raison : ${DEROGATION.raison}`)
    console.log(`      ⚠ RESTE OUVERT — ${DEROGATION.resteOuvert}`)
    console.log(`      Elle tombe d'elle-même si Excel cesse de passer un contexte à \`planDemonstration\`.`)
  }

  if (constats.length) {
    console.log(`\n${constats.length} constat(s). Règle : la photo se prend à l'arrivée sur l'étape, jamais au clic ; elle couvre le document ET l'interface.`)
    console.log("Contrat : ~/checkos/scratchpads/lms-reset-socle/CONTRAT.md")
    process.exit(1)
  }
  console.log("\n✓ Les quatre players reposent l'état de départ de l'étape avant chaque démonstration.")
}

main()
