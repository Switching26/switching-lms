/**
 * Les contrôles Outlook : rendus, nommés, et atteignables par la démonstration.
 *
 *   npx tsx scripts/simulation/outlook/check-controles.ts
 *
 * ═══ LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER ═══
 *
 * Un scénario peut citer un bouton qui n'est rendu nulle part, et RIEN ne le
 * signale : l'étape se valide au clic… qui n'arrive jamais, parce que le bouton
 * n'existe pas à l'écran. Côté Excel, NEUF boutons trompaient l'apprenant —
 * dont un qui validait l'étape sans rien masquer du tout — et aucun des neuf
 * contrôles existants ne pouvait les voir, parce qu'au bout du routeur, TOUT
 * identifiant finit par émettre une observation.
 *
 * Il couvre aussi les cibles de DÉMONSTRATION, que le pilote du banc ne joue
 * jamais : « Montrez-moi » n'apparaît qu'après trois erreurs. Une démonstration
 * qui pointe un bouton absent se joue à blanc — repère, curseur et bulle
 * invisibles — pendant que le compteur avance jusqu'à « Revoir ». Indiscernable
 * d'une démonstration réussie, vue de l'extérieur.
 *
 * ⚠️ CE QU'IL NE VOIT PAS : qu'un bouton rendu soit VISIBLE au moment voulu. Le
 * rail disparaît sous 720 px, la fenêtre de rédaction masque la liste. Cela se
 * prouve au banc, dans un vrai navigateur.
 */

import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { adaptateurOutlook } from "../../../lib/simulation/outlook/adaptateur"
import { CONTROLES } from "../../../lib/simulation/outlook/document"
import type { OutlookAction } from "../../../lib/simulation/outlook/actions"

const RACINE = join(__dirname, "..", "..", "..")
const SURFACES = [
  join(RACINE, "components", "simulation", "outlook", "CourrierSurface.tsx"),
  join(RACINE, "components", "simulation", "outlook", "CourrierChrome.tsx"),
]
const SCENARIOS = join(__dirname, "..", "scenarios", "outlook")

const erreurs: string[] = []

/**
 * Les identifiants RÉELLEMENT rendus par la surface.
 *
 * On lit le source plutôt que le DOM : ce contrôle doit tourner sans navigateur,
 * en une fraction de seconde, et servir de garde avant toute fusion.
 *
 * Deux formes cohabitent : les littéraux (`data-control="cr-retour"`) et les
 * appels au dictionnaire (`data-control={C.repondre}`, `C.message(m.id)`). Les
 * seconds sont résolus par le dictionnaire lui-même, ce qui évite d'avoir à
 * tenir une liste en double — la source de vérité reste `CONTROLES`.
 */
function controlesRendus(): { fixes: string[]; familles: string[] } {
  const fixes: string[] = []
  const familles: string[] = []

  for (const f of SURFACES) {
    const src = readFileSync(f, "utf-8")

    /*
     * ⚠️ DEUX CHEMINS MÈNENT À UN `data-control`, ET N'EN VOIR QU'UN DONNE UN
     * VERDICT FAUX.
     *
     * Un bouton peut poser l'attribut lui-même (`data-control="cr-retour"`) ou
     * le recevoir par le composant partagé `BoutonCourrier`, qui écrit
     * `data-control={id}` à partir d'une prop (`<BoutonCourrier id={C.repondre}>`).
     *
     * La première version de ce contrôle ne lisait que le premier chemin : elle
     * a déclaré « libellé mort » sur VINGT boutons que le pilote du banc venait
     * de cliquer avec succès. Le produit était juste, le contrôle avait tort —
     * exactement le genre de faux positif qui décrédibilise un garde-fou et fait
     * « corriger » du code sain.
     */
    const formes = [
      /data-control="(cr-[a-z0-9-]+)"/g, // attribut littéral
      /\bid="(cr-[a-z0-9-]+)"/g, // prop littérale de BoutonCourrier
    ]
    for (const re of formes) {
      for (const m of src.matchAll(re)) {
        if (!fixes.includes(m[1])) fixes.push(m[1])
      }
    }

    // Entrées simples du dictionnaire : `data-control={C.x}` ou `id={C.x}`.
    for (const m of src.matchAll(/(?:data-control|\bid)=\{C\.([a-zA-Z]+)\}/g)) {
      const v = (CONTROLES as unknown as Record<string, unknown>)[m[1]]
      if (typeof v === "string" && !fixes.includes(v)) fixes.push(v)
    }

    // Familles paramétrées : `C.message(...)`, `C.dossier(...)`, `C.champ(...)`.
    for (const m of src.matchAll(/(?:data-control|\bid)=\{C\.([a-zA-Z]+)\(/g)) {
      const v = (CONTROLES as unknown as Record<string, unknown>)[m[1]]
      if (typeof v === "function") {
        const prefixe = (v as (x: string) => string)("§").replace("§", "")
        if (!familles.includes(prefixe)) familles.push(prefixe)
      }
    }

    // Gabarits littéraux : `data-control={`cr-vers-${d.id}`}`.
    for (const m of src.matchAll(/(?:data-control|\bid)=\{`(cr-[a-z0-9-]*)\$\{/g)) {
      if (!familles.includes(m[1])) familles.push(m[1])
    }
  }
  return { fixes, familles }
}

const { fixes, familles } = controlesRendus()
const estRendu = (id: string) => fixes.includes(id) || familles.some((p) => id.startsWith(p))

/* ═══════════ 1. TOUT CONTRÔLE CITÉ EST RENDU ═══════════ */

const fichiers = readdirSync(SCENARIOS).filter((f) => f.endsWith(".json")).sort()
let cites = 0
/** Boutons réellement cliqués par au moins un chapitre (bloc 4). */
const clics = new Set<string>()
let ciblesDemo = 0

for (const f of fichiers) {
  const s = JSON.parse(readFileSync(join(SCENARIOS, f), "utf-8")) as {
    steps: Array<{ id: string; action: OutlookAction }>
  }

  for (const e of s.steps) {
    // a) le bouton d'une étape `O_CLICK_CONTROL`
    if (e.action.type === "O_CLICK_CONTROL") {
      cites += 1
      clics.add(e.action.control)
      if (!estRendu(e.action.control)) {
        erreurs.push(
          `${f}/${e.id} : le bouton « ${e.action.control} » n'est rendu par AUCUNE surface. ` +
            `L'apprenant cliquerait dans le vide.`,
        )
      }
    }

    // b) la cible du halo d'aide
    const cible = adaptateurOutlook.cible(e.action as unknown as Record<string, unknown> & { type: string })
    if (cible.controle && !estRendu(cible.controle)) {
      erreurs.push(
        `${f}/${e.id} : le halo d'aide vise « ${cible.controle} », qui n'est rendu nulle part.`,
      )
    }

    // c) les cibles de la démonstration — jamais jouées par le pilote du banc
    const plan = adaptateurOutlook.demonstration(
      e.action as unknown as Record<string, unknown> & { type: string },
      {},
    )
    for (const g of plan?.gestes ?? []) {
      ciblesDemo += 1
      const c = g.cible as { k: string; sel?: string }
      if (c.k !== "dom" || !c.sel) {
        erreurs.push(
          `${f}/${e.id} : une cible de démonstration n'est pas un sélecteur DOM (« ${c.k} »). ` +
            `La surface Outlook est du DOM : toute cible doit être résoluble ainsi.`,
        )
        continue
      }
      const id = /data-control="([^"]+)"/.exec(c.sel)?.[1]
      if (!id || !estRendu(id)) {
        erreurs.push(
          `${f}/${e.id} : la démonstration pointe « ${id ?? c.sel} », qui n'est rendu nulle part. ` +
            `Elle se jouerait à blanc, le compteur avançant jusqu'à « Revoir ».`,
        )
      }
      // Un geste qui PRESSE doit presser ce qu'il désigne : sinon la
      // démonstration promène le curseur et rien ne se passe.
      if (g.presser && g.presser.id !== id) {
        erreurs.push(`${f}/${e.id} : la démonstration désigne « ${id} » mais presse « ${g.presser.id} ».`)
      }
    }
  }
}

/* ═══════════ 2. TOUT CONTRÔLE RENDU A UN LIBELLÉ ═══════════ */

const LIBELLES = adaptateurOutlook.libellesControles
/**
 * Boutons volontairement sans libellé : ils ne sont jamais la CIBLE d'une étape,
 * seulement des commodités de navigation. Leur donner un libellé laisserait
 * croire qu'un scénario peut les exiger.
 */
const SANS_LIBELLE = [
  "cr-retour",
  "cr-fermer-boite",
  "cr-annuler-rdv",
  /*
   * D13 — les deux boutons du tiroir des dossiers.
   *
   * Ils n'existent QUE sous 720 px. Leur donner un libellé les rendrait citables
   * par un scénario, et l'étape serait alors injouable sur ordinateur — le
   * défaut exactement symétrique de celui que D13 corrige. Un chapitre demande
   * « ouvrez Éléments envoyés » (`O_SELECT_FOLDER`), jamais « ouvrez le
   * tiroir » : le chemin appartient à l'apprenant, pas à la consigne.
   */
  "cr-dossiers",
  "cr-fermer-dossiers",
]

for (const id of fixes) {
  if (SANS_LIBELLE.includes(id)) continue
  if (!Object.prototype.hasOwnProperty.call(LIBELLES, id)) {
    erreurs.push(
      `« ${id} » est rendu mais n'a pas de libellé : la ligne « Attendu : … » dirait ` +
        `« un clic sur le bouton indiqué », ce qui n'apprend rien.`,
    )
  }
}

/* ═══════════ 3. TOUT LIBELLÉ DÉSIGNE QUELQUE CHOSE ═══════════ */

for (const id of Object.keys(LIBELLES)) {
  if (!estRendu(id)) {
    erreurs.push(`« ${id} » a un libellé mais n'est rendu par aucune surface : libellé mort.`)
  }
}

/* ═══════════ 4. LA SURFACE EST-ELLE ENSEIGNÉE EN ENTIER ? ═══════════
 *
 * Les trois blocs ci-dessus vérifient qu'un scénario ne cite rien d'absent.
 * Celui-ci regarde dans l'AUTRE sens : un bouton que la surface rend et qu'aucun
 * chapitre n'exerce est une capacité livrée à l'apprenant sans être enseignée.
 *
 * C'est aussi la seule façon non subjective de répondre à « le plan est-il
 * complet ? ». Tant qu'un bouton reste non exercé, il reste quelque chose à
 * écrire ; quand la liste est vide, un module de plus ne peut être qu'une
 * variante de situation sur des gestes déjà couverts.
 *
 * ⚠️ Exercer ≠ cliquer. Supprimer, marquer d'un indicateur, chercher, accepter
 * une invitation se JUGENT sur l'état : le geste est bien le bouton, mais
 * l'étape porte `O_EXPECT_BOITE` ou `O_EXPECT_CALENDRIER`. Ne compter que les
 * `O_CLICK_CONTROL` déclarerait « jamais enseignés » quatre boutons qu'une
 * centaine d'étapes exercent — le faux positif qui a déjà décrédibilisé la
 * première version du bloc 1.
 */
const EXERCE_PAR_ETAT: Readonly<Record<string, string>> = {
  [CONTROLES.supprimer]: "O_EXPECT_BOITE { dossier: 'supprimes' }",
  [CONTROLES.indicateur]: "O_EXPECT_BOITE { indicateur: true }",
  [CONTROLES.recherche]: "O_TYPE_TEXT { champ: 'recherche' }",
  [CONTROLES.accepter]: "O_EXPECT_CALENDRIER (l'événement accepté apparaît)",
}
const parEtat = new Set<string>()
for (const f of readdirSync(SCENARIOS).filter((x) => x.endsWith(".json"))) {
  const s = JSON.parse(readFileSync(join(SCENARIOS, f), "utf-8"))
  for (const e of s.steps ?? []) {
    const a = e.action ?? {}
    if (a.type === "O_EXPECT_BOITE")
      for (const m of Object.values<Record<string, unknown>>(a.boite?.messages ?? {})) {
        if (m.dossier === "supprimes") parEtat.add(CONTROLES.supprimer)
        if (m.indicateur) parEtat.add(CONTROLES.indicateur)
      }
    if (a.type === "O_TYPE_TEXT" && a.champ === "recherche") parEtat.add(CONTROLES.recherche)
    if (a.type === "O_EXPECT_CALENDRIER") parEtat.add(CONTROLES.accepter)
  }
}
const jamaisEnseignes = fixes.filter(
  (id) => !SANS_LIBELLE.includes(id) && !clics.has(id) && !parEtat.has(id),
)
for (const id of jamaisEnseignes) {
  erreurs.push(
    `« ${id} » est rendu à l'écran mais AUCUN chapitre ne l'exerce : capacité livrée sans être ` +
      `enseignée. Soit un chapitre l'emploie, soit il rejoint SANS_LIBELLE avec sa raison.`,
  )
}

/* ═══════════ VERDICT ═══════════ */

console.log(
  `\n${fixes.length} contrôle(s) fixe(s) · ${familles.length} famille(s) paramétrée(s)` +
    ` · ${cites} cité(s) par les scénarios · ${ciblesDemo} cible(s) de démonstration`,
)
console.log(
  `couverture : ${clics.size} bouton(s) exercé(s) par un clic, ${parEtat.size} par l'état ` +
    `(${Object.values(EXERCE_PAR_ETAT).length} chemins déclarés), ` +
    `${SANS_LIBELLE.length} hors consigne, ${jamaisEnseignes.length} jamais enseigné(s)`,
)

if (erreurs.length) {
  console.error(`\n✗ ${erreurs.length} problème(s) :\n`)
  for (const e of erreurs) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log("✓ contrôles Outlook : tous rendus, tous nommés, démonstrations résolubles.\n")
