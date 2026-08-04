/**
 * Les écrans « À comprendre » de Word montrent-ils réellement quelque chose ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CONTRÔLE EST **INVERSÉ**
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Il ne vérifie pas que les `montrer` existants sont valides : il REFUSE tout
 * écran de lecture qui n'en a pas. C'est la seule forme qui protège de la
 * rechute mesurée sur cette formation — 43 des 64 écrans de lecture étaient
 * muets, et `actions.ts` prescrivait pourtant depuis l'origine « une leçon
 * "étendre la sélection au clavier" doit être un écran de lecture (READ +
 * montrer) ». Le mécanisme était NOMMÉ sans exister. Excel a connu exactement
 * le même trou, sur 187 écrans, et l'a refermé de la même façon.
 *
 * Un contrôle qui se contenterait de valider l'existant laisserait l'écran
 * ajouté demain retomber dans le trou.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL VOIT — et ce qu'il ne peut pas voir
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Il voit : un écran muet ; une cible qui ne peut PAS se résoudre (bouton
 * inexistant, paragraphe hors du document tel qu'il est à cette étape) ; un
 * bouton désigné sans son onglet, donc introuvable puisque le ruban ne rend que
 * l'onglet actif ; une phrase vide ; et surtout la DIVULGATION — une lecture
 * qui jouerait le geste que l'étape suivante demande.
 *
 * Il ne voit PAS si la démonstration dessine réellement quelque chose à
 * l'écran : un rectangle dégénéré est indistinguable d'un rectangle sur le
 * papier. Seul le rejeu au navigateur le dit. Ne pas prendre ce contrôle pour
 * une preuve de rendu — c'est exactement le faux témoin qui a coûté un cycle
 * d'audit entier côté Excel.
 */

import fs from "fs"
import path from "path"

const DIR = path.join(__dirname, "..", "scenarios", "word")
const CHROME = path.join(__dirname, "..", "..", "..", "components", "simulation", "word", "WordChrome.tsx")

/* ═══════════ CE QUE LE CHÂSSIS REND RÉELLEMENT ═══════════ */

/**
 * Les `data-control` rendus, lus dans la source du ruban.
 *
 * ⚠️ On DÉCOMMENTE avant de chercher. Le piège le plus coûteux du chantier
 * multi-app est tombé deux fois le même jour : un identifiant cité dans un
 * commentaire de documentation faisait passer un contrôle au vert alors que
 * rien n'était branché.
 */
function controlesRendus(): { ids: string[]; ongletDe: Record<string, string> } {
  const brut = fs.readFileSync(CHROME, "utf8")
  const src = brut.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const ids: string[] = []
  const ongletDe: Record<string, string> = {}
  // Les groupes sont déclarés onglet par onglet : on suit l'onglet courant.
  const bloc = /^\s{2}"?([a-z-]+)"?:\s*\[/gm
  const positions: { onglet: string; index: number }[] = []
  let m: RegExpExecArray | null
  while ((m = bloc.exec(src))) positions.push({ onglet: m[1], index: m.index })
  const idRe = /id:\s*"([a-z0-9-]+)"/g
  while ((m = idRe.exec(src))) {
    ids.push(m[1])
    let onglet = "accueil"
    for (const p of positions) if (p.index < m.index) onglet = p.onglet
    ongletDe[m[1]] = onglet
  }
  // Les boutons des boîtes de dialogue, rendus hors des groupes.
  for (const extra of src.matchAll(/data-control="([a-z0-9-]+)"/g)) {
    if (!ids.includes(extra[1])) {
      ids.push(extra[1])
      ongletDe[extra[1]] = "*"
    }
  }
  return { ids, ongletDe }
}

/** Les autres attributs `data-*` désignables, cherchés dans tout le dossier. */
function attributsDesignables(): string[] {
  const dossier = path.join(__dirname, "..", "..", "..", "components", "simulation", "word")
  const trouves: string[] = []
  for (const f of fs.readdirSync(dossier).filter((n) => n.endsWith(".tsx"))) {
    const src = fs
      .readFileSync(path.join(dossier, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
    for (const m of src.matchAll(/\bdata-([a-z0-9-]+)(?:=|\s|>|\})/g)) trouves.push(m[1])
  }
  return trouves
}

/* ═══════════ L'ÉTAT DU DOCUMENT, ÉTAPE PAR ÉTAPE ═══════════ */

type Etape = {
  id: string
  action: { type: string; [k: string]: unknown }
  montrer?: { type: string; cible?: string; texte?: string; onglet?: string; touches?: string[]; ecrire?: { zone?: string } }[]
  setup?: { document?: { paragraphes: { texte: string }[] } }
}
type Scenario = { steps: Etape[]; document?: { paragraphes: { texte: string }[] } }

/**
 * Combien de paragraphes le document porte-t-il À cette étape ?
 *
 * Réplique la règle du player (`documentAvant`) : les setups remplacent, une
 * saisie ajoute à la suite, un attendu de paragraphe écrit à son index. Sans
 * cumul, une désignation parfaitement valide au 7e écran serait signalée
 * introuvable parce que le paragraphe n'existe pas encore dans le document de
 * départ.
 */
function nbParagraphes(sc: Scenario, jusqua: number): number {
  let n = (sc.document?.paragraphes ?? []).length
  for (let i = 0; i <= jusqua && i < sc.steps.length; i++) {
    const s = sc.steps[i]
    if (s.setup?.document) n = s.setup.document.paragraphes.length
    if (i >= jusqua) continue
    const a = s.action as { type: string; accept?: string[]; paragraphes?: Record<string, string[]> }
    if (a.type === "W_TYPE_TEXT" && a.accept?.[0]) n += 1
    if (a.type === "W_EXPECT_DOC" && a.paragraphes) {
      for (const cle of Object.keys(a.paragraphes)) {
        const k = Number(String(cle).replace(/^p/, ""))
        if (Number.isFinite(k)) n = Math.max(n, k + 1)
      }
    }
  }
  return n
}

/* ═══════════ ANTI-DIVULGATION ═══════════ */

/**
 * Ce que l'étape suivante DEMANDE : une lecture ne doit pas le jouer d'avance.
 *
 * Le cas se produit naturellement quand on équipe un écran d'introduction : la
 * tentation est de montrer précisément le bouton sur lequel la question va
 * porter. L'écran cesse alors d'enseigner pour souffler.
 */
function cequeLaSuivanteDemande(suivante: Etape | undefined): { controle?: string; zone?: string } {
  if (!suivante) return {}
  const a = suivante.action as { type: string; controle?: string; zone?: string }
  if (a.type === "W_CLICK_CONTROL") return { controle: a.controle }
  if (a.type === "W_SELECT_TEXT") return { zone: a.zone }
  return {}
}

/* ═══════════ CONTRÔLE ═══════════ */

const { ids: CONTROLES, ongletDe: ONGLET_DU_CONTROLE } = controlesRendus()
const ATTRIBUTS = attributsDesignables()

const erreurs: string[] = []
const avertissements: string[] = []
let lectures = 0
let equipes = 0
let gestes = 0

for (const nom of fs.readdirSync(DIR).filter((n) => n.endsWith(".json")).sort()) {
  const sc: Scenario = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"))
  sc.steps.forEach((st, i) => {
    if (st.action?.type !== "READ") {
      if (st.montrer?.length) {
        erreurs.push(`${nom}#${st.id} — \`montrer\` sur une étape d'ACTION : il ne s'y joue jamais.`)
      }
      return
    }
    lectures++
    if (!st.montrer?.length) {
      erreurs.push(`${nom}#${st.id} — écran de lecture MUET : aucun \`montrer\`.`)
      return
    }
    equipes++
    const nbPara = nbParagraphes(sc, i)
    const attendu = cequeLaSuivanteDemande(sc.steps[i + 1])

    st.montrer.forEach((m, k) => {
      gestes++
      const ou = `${nom}#${st.id}[${k}]`
      /*
       * Une vraie action Word est acceptée dans `montrer` — l'adaptateur en
       * produit un plan valide, et `W_SELECT_TEXT` illustre très bien une
       * portée de sélection. Deux réserves, et elles ont chacune coûté un
       * défaut réel dans ce corpus :
       *
       *  · un `W_CLICK_CONTROL` PRESSE le bouton pour de vrai. Sur un écran de
       *    lecture, il laisse derrière lui un panneau ouvert que rien ne
       *    referme — une lecture ne doit rien changer à l'atelier ;
       *  · et cinq fois sur huit, le bouton pressé était EXACTEMENT celui que
       *    l'étape suivante demandait : l'apprenant regardait le geste, puis on
       *    lui demandait de le refaire.
       */
      if (m.type === "W_CLICK_CONTROL") {
        erreurs.push(
          `${ou} — \`W_CLICK_CONTROL\` presse le bouton pour de vrai : sur un écran de lecture, ` +
            `il laisse un panneau ouvert et souffle souvent le geste suivant. Employer \`W_MONTRER\`.`,
        )
        return
      }
      if (m.type !== "W_MONTRER") {
        // Les autres actions Word se contentent de désigner ou de sélectionner.
        const zone = (m as { zone?: string }).zone
        if (attendu.zone && zone && attendu.zone === zone) {
          erreurs.push(`${ou} — DIVULGATION : cette zone est exactement celle que l'étape suivante demande.`)
        }
        return
      }
      if (!m.texte || !m.texte.trim()) {
        erreurs.push(`${ou} — phrase vide : c'est elle qui enseigne, pas le mouvement.`)
      }
      const c = (m.cible ?? "").trim()
      if (!c || c === "ecran") {
        if (!m.touches?.length && !m.texte) erreurs.push(`${ou} — ni cible, ni touches, ni phrase.`)
        return
      }
      if (c.startsWith("ctrl:")) {
        const id = c.slice(5)
        if (!CONTROLES.includes(id)) {
          erreurs.push(`${ou} — bouton \`${id}\` non rendu par WordChrome : le geste se jouerait à blanc.`)
          return
        }
        const tab = ONGLET_DU_CONTROLE[id]
        if (tab && tab !== "*" && m.onglet !== tab) {
          erreurs.push(
            `${ou} — \`${id}\` vit sous l'onglet « ${tab} » et \`onglet\` vaut ${
              m.onglet ? `« ${m.onglet} »` : "rien"
            } : le ruban ne rend que son onglet actif, le bouton serait introuvable.`,
          )
        }
        if (attendu.controle && attendu.controle === id) {
          erreurs.push(`${ou} — DIVULGATION : ce bouton est exactement ce que l'étape suivante demande.`)
        }
        return
      }
      if (c.startsWith("dom:")) {
        const sel = c.slice(4)
        const attr = /^\[data-([a-z0-9-]+)/.exec(sel)?.[1]
        if (attr && !ATTRIBUTS.includes(attr) && !/^control$/.test(attr)) {
          erreurs.push(`${ou} — \`data-${attr}\` n'existe dans aucun composant Word.`)
        }
        return
      }
      // Zone de document : `p3`, `p1:mot2`, `texte:…`
      const p = /^p(\d+)/.exec(c)
      if (p) {
        const k2 = Number(p[1])
        if (k2 >= nbPara) {
          erreurs.push(
            `${ou} — désigne \`${c}\` alors que le document n'a que ${nbPara} paragraphe(s) à cette étape.`,
          )
        }
        return
      }
      if (!c.startsWith("texte:")) {
        avertissements.push(`${ou} — cible \`${c}\` d'une forme inhabituelle.`)
      }
    })

    // Une lecture ne modifie jamais le document de l'étape suivante : le player
    // le restaure, mais un `ecrire` sur une zone inexistante ne montrerait rien.
    for (const m of st.montrer) {
      const z = m.ecrire?.zone
      if (z) {
        const p = /^p(\d+)/.exec(z)
        if (p && Number(p[1]) > nbPara) {
          erreurs.push(`${nom}#${st.id} — \`ecrire\` vise \`${z}\`, hors du document à cette étape.`)
        }
      }
    }
  })
}

/*
 * 🔴 LIMITE DU NOYAU, signalée et NON corrigée (le socle est gelé).
 *
 * `lib/simulation/expurge.ts` ne laisse passer `montrer` en évaluation notée que
 * si TOUS les gestes portent le type Excel `MONTRER` — un `W_MONTRER` est jeté.
 * Les énoncés d'ouverture des évaluations Word sont donc écrits, contrôlés,
 * jouables en leçon… et muets pour un apprenant en évaluation notée.
 *
 * On le COMPTE plutôt que de le taire : un écart silencieux entre ce que le
 * contrôle valide et ce que l'apprenant voit est exactement ce qui a coûté deux
 * cycles d'audit à Excel.
 */
const enonces: string[] = []
for (const nom of fs.readdirSync(DIR).filter((n) => /-ev\d+\.json$/.test(n)).sort()) {
  const sc: Scenario = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"))
  for (const st of sc.steps) {
    if (st.action?.type === "READ" && st.montrer?.some((m) => m.type !== "MONTRER")) {
      enonces.push(`${nom}#${st.id}`)
    }
  }
}
if (enonces.length) {
  console.log(
    `\n⚠ ${enonces.length} énoncé(s) d'évaluation portent un \`W_MONTRER\` que \`expurge.ts\` ` +
      `(noyau gelé) jette : muets en évaluation notée, jouables partout ailleurs.`,
  )
}

console.log(`Écrans de lecture : ${lectures} · équipés : ${equipes} · gestes : ${gestes}`)
console.log(`Boutons rendus par WordChrome : ${CONTROLES.length}`)
if (avertissements.length) {
  console.log(`\n${avertissements.length} avertissement(s) :`)
  for (const a of avertissements) console.log(`  · ${a}`)
}
if (erreurs.length) {
  console.log(`\n✗ ${erreurs.length} défaut(s) :`)
  for (const e of erreurs) console.log(`  · ${e}`)
  process.exit(1)
}
console.log(`\n✓ ${equipes}/${lectures} écrans de lecture équipés, toutes cibles résolubles, aucune divulgation.`)
