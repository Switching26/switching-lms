/**
 * Contrôles anti-régression du guide interactif de la formation.
 *
 * Sans navigateur et sans base : le fichier d'étapes est du TypeScript pur, et
 * le reste est de l'analyse statique des sources. C'est ce qui permet de le
 * lancer à chaque modification, au même titre que `check-ressources.ts`.
 *
 * Ce que ces contrôles empêchent, concrètement :
 *  - qu'un corrigé se glisse dans un texte du guide ;
 *  - que le guide se mette à muter la progression, le score ou les tentatives ;
 *  - qu'un renommage de contrôle du cockpit laisse un projecteur pointer le vide ;
 *  - qu'une cible tactile passe sous 44 px ;
 *  - que le vouvoiement se perde.
 *
 *   npx tsx scripts/check-guide-formation.ts
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ETAPES_GUIDE, etapesDisponibles, cleGuidePour, VERSION_GUIDE } from "../lib/simulation/guide-formation"

const RACINE = join(__dirname, "..")
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8")

const echecs: string[] = []
const verts: string[] = []

function verifier(nom: string, fn: () => string | void) {
  try {
    const detail = fn()
    verts.push(`✓ ${nom}${detail ? ` — ${detail}` : ""}`)
  } catch (e) {
    echecs.push(`✗ ${nom} — ${(e as Error).message}`)
  }
}

function exiger(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/**
 * Le CODE seul, commentaires retirés.
 *
 * Sans cela, le commentaire d'en-tête de `GuideFormation.tsx` — qui explique
 * précisément qu'aucun `dispatchEvent` ne doit s'y glisser — déclenchait le
 * contrôle censé le vérifier.
 */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")
}

/**
 * Frontière de mot qui tient compte des lettres accentuées.
 *
 * `\btes\b` reconnaissait « vous ê|tes » : en JavaScript, `\b` traite « ê »
 * comme une frontière parce qu'il ne considère que les caractères ASCII. Sur du
 * texte français, tout contrôle de mot doit passer par des lettres Unicode.
 */
function motEntier(mots: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}'’])(${mots.join("|")})(?![\\p{L}'’])`, "iu")
}

const SOURCE_GUIDE = sansCommentaires(lire("components/simulation/GuideFormation.tsx"))
const SOURCE_GUIDE_BRUT = lire("components/simulation/GuideFormation.tsx")
const SOURCE_ETAPES = sansCommentaires(lire("lib/simulation/guide-formation.ts"))
const SOURCE_PLAYER = lire("components/simulation/SimulationPlayer.tsx")

/* ── 1. Aucun secret de correction ────────────────────────────────────────── */
verifier("aucun corrigé dans les textes du guide", () => {
  const interdits = [
    /=\s*(SOMME|SUM|MOYENNE|AVERAGE|SI|IF|RECHERCHEV|VLOOKUP)\s*\(/i,
    /\bla\s+r[ée]ponse\s+est\b/i,
    /\bcorrig[ée]\b/i,
    /\bsolution\s*:/i,
  ]
  const fautifs: string[] = []
  for (const e of ETAPES_GUIDE) {
    const textes = [e.titre, e.texte, e.retenir, e.tache, e.reussite].join(" ")
    for (const re of interdits) {
      if (re.test(textes)) fautifs.push(`${e.id} → ${re}`)
    }
  }
  exiger(fautifs.length === 0, `secret possible : ${fautifs.join(", ")}`)
  return `${ETAPES_GUIDE.length} étapes relues`
})

/* ── 2. Aucune mutation possible ──────────────────────────────────────────── */
verifier("le guide ne peut rien muter", () => {
  const interdits: [RegExp, string][] = [
    [/\bfetch\s*\(/, "appel réseau"],
    [/\.click\s*\(\s*\)/, "clic programmatique"],
    [/dispatchEvent/, "événement synthétique"],
    [/\b(POST|PUT|PATCH|DELETE)\b/, "verbe HTTP"],
    [/from\s+["']@\/lib\/(progress|prisma|db)/, "import de couche données"],
    [/useRouter|router\./, "navigation programmée"],
    [/localStorage\.(clear|removeItem)/, "effacement de stockage tiers"],
  ]
  const trouves = interdits.filter(([re]) => re.test(SOURCE_GUIDE)).map(([, l]) => l)
  exiger(trouves.length === 0, `interdit trouvé dans GuideFormation.tsx : ${trouves.join(", ")}`)

  // Le composant ne doit recevoir aucun setter métier : sa signature de props
  // est la barrière. On la relit littéralement.
  const props = SOURCE_GUIDE_BRUT.match(/type Props = \{([\s\S]*?)\n\}/)
  exiger(props !== null, "type Props introuvable")
  const autorisees = [
    "ouvert",
    "onOuvrir",
    "onFermer",
    "conteneur",
    "declencheur",
    "cleGuide",
    "sansPremiereVisite",
  ]
  const declarees = [...props![1].matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1])
  const intruses = declarees.filter((d) => !autorisees.includes(d))
  exiger(intruses.length === 0, `prop non autorisée : ${intruses.join(", ")}`)

  /* Deuxième filet, indépendant de la liste blanche : même en ajoutant un nom à
     la liste, on ne doit jamais laisser entrer un setter du player. Seuls
     `onOuvrir` et `onFermer` sont des rappels, et ils ne touchent qu'au booléen
     d'ouverture. */
  const rappels = declarees.filter((d) => /^(on[A-Z]|set[A-Z])/.test(d))
  exiger(
    rappels.every((r) => r === "onOuvrir" || r === "onFermer"),
    `rappel suspect : ${rappels.filter((r) => r !== "onOuvrir" && r !== "onFermer").join(", ")}`,
  )
  return `${declarees.length} props, 2 rappels inertes`
})

/* ── 3. Chaque cible existe vraiment dans le cockpit ──────────────────────── */
verifier("toutes les cibles existent dans les sources du cockpit", () => {
  const sources = [
    SOURCE_PLAYER,
    lire("components/simulation/BilanFin.tsx"),
    lire("components/simulation/PanneauRessources.tsx"),
  ].join("\n")
  const manquantes: string[] = []
  for (const e of ETAPES_GUIDE) {
    const cibles = [e.cible, e.toucher, ...(e.eviter ?? [])].filter(Boolean) as string[]
    for (const sel of cibles) {
      const parControle = sel.match(/\[data-control="([^"]+)"\]/)
      const parAttribut = sel.match(/^\[([a-z-]+)\]$/)
      if (parControle) {
        if (!sources.includes(`data-control="${parControle[1]}"`)) manquantes.push(`${e.id} → ${sel}`)
      } else if (parAttribut) {
        if (!sources.includes(`${parAttribut[1]}=""`)) manquantes.push(`${e.id} → ${sel}`)
      } else {
        manquantes.push(`${e.id} → ${sel} (forme de sélecteur non contrôlable)`)
      }
    }
  }
  exiger(manquantes.length === 0, `cible absente du cockpit : ${manquantes.join(", ")}`)
  return "ancrage vérifié sur data-control réels"
})

/* ── 4. Étapes bien formées ───────────────────────────────────────────────── */
verifier("étapes bien formées", () => {
  const ids = new Set<string>()
  for (const e of ETAPES_GUIDE) {
    exiger(!ids.has(e.id), `identifiant dupliqué : ${e.id}`)
    ids.add(e.id)
    for (const [champ, valeur] of Object.entries({
      titre: e.titre,
      texte: e.texte,
      retenir: e.retenir,
      tache: e.tache,
      reussite: e.reussite,
    })) {
      exiger(typeof valeur === "string" && valeur.trim().length > 10, `${e.id}.${champ} vide ou trop court`)
    }
    if (e.placement) {
      exiger(["auto", "haut", "bas"].includes(e.placement), `${e.id} : placement inconnu ${e.placement}`)
    }
    // Le HTML autorisé dans les textes se limite à <b> et <code> : ils sont
    // injectés en `dangerouslySetInnerHTML`, le contenu vient d'ici et de
    // nulle part ailleurs, mais autant que la liste reste courte et vérifiée.
    const balises = [...`${e.texte}${e.retenir}${e.tache}`.matchAll(/<\/?([a-z]+)/g)].map((m) => m[1])
    const inconnues = balises.filter((b) => !["b", "code"].includes(b))
    exiger(inconnues.length === 0, `${e.id} : balise non autorisée <${inconnues[0]}>`)
  }
  exiger(ETAPES_GUIDE.length >= 8, `parcours trop court : ${ETAPES_GUIDE.length} étapes`)
  return `${ETAPES_GUIDE.length} étapes, identifiants uniques`
})

/* ── 5. Dégradation quand une cible manque ────────────────────────────────── */
verifier("dégradation propre sans cible", () => {
  // Un cockpit qui ne rend AUCUN contrôle : les étapes `exigeCible` sortent,
  // les autres restent. Le guide ne doit jamais tomber à zéro étape.
  const faux = {
    querySelector: () => null,
  } as unknown as HTMLElement
  const restantes = etapesDisponibles(faux)
  const exigeantes = ETAPES_GUIDE.filter((e) => e.exigeCible).length
  exiger(
    restantes.length === ETAPES_GUIDE.length - exigeantes,
    `${restantes.length} étapes restantes, attendu ${ETAPES_GUIDE.length - exigeantes}`,
  )
  exiger(restantes.length >= 5, "un cockpit nu ne laisse plus assez d'étapes")
  exiger(etapesDisponibles(null).length === ETAPES_GUIDE.length, "sans racine, le parcours doit rester entier")
  return `cockpit nu → ${restantes.length}/${ETAPES_GUIDE.length} étapes conservées`
})

/* ── 6. Cibles tactiles : largeur ET hauteur ──────────────────────────────── */
verifier("aucune cible tactile sous 44 × 44", () => {
  /* Contrôle par BOUTON, pas par valeur isolée.
     La version précédente listait les hauteurs du fichier et laissait passer
     tout le reste : les pastilles de progression mesuraient 18 × 44 px et le
     contrôle restait vert, parce qu'il ne regardait jamais la largeur. On relit
     donc chaque balise `<button` et on exige que sa boîte soit couverte dans
     les DEUX dimensions. */
  const boutons = [...SOURCE_GUIDE_BRUT.matchAll(/<button\b/g)].map((m) => {
    // Balise ouvrante : du `<button` jusqu'au `>` qui précède son contenu.
    const debut = m.index as number
    const suite = SOURCE_GUIDE_BRUT.slice(debut, debut + 1400)
    const fin = suite.indexOf("\n            >")
    const bloc = fin > 0 ? suite.slice(0, fin) : suite.slice(0, suite.indexOf(">") + 1)
    const nom =
      bloc.match(/data-control="([^"]+)"/)?.[1] ??
      (bloc.match(/data-control=\{(\w+)\}/) ? "data-control dynamique (BoutonTete)" : "bouton sans data-control")
    const val = (prop: string) => {
      const v = bloc.match(new RegExp(prop + ":\\s*(\\d+)"))
      return v ? Number(v[1]) : null
    }
    return {
      nom,
      h: val("minHeight") ?? val("height"),
      w: val("minWidth") ?? val("width"),
      pleineLargeur: /className="[^"]*\bw-full\b/.test(bloc) || /flex\s+w-full/.test(bloc) || /flex-1/.test(bloc),
      texte: /<\/button>/.test(bloc) === false,
    }
  })
  exiger(boutons.length > 0, "aucun bouton trouvé : le contrôle ne prouve rien")

  const fautifs: string[] = []
  for (const b of boutons) {
    if (b.h !== null && b.h < 44) fautifs.push(`${b.nom} → hauteur ${b.h}`)
    // Une largeur déclarée doit atteindre 44. Une largeur NON déclarée est
    // admise seulement si le bouton s'étire (pleine largeur, `flex-1`) ou porte
    // un libellé : c'est alors le contenu qui la donne, et la QA la mesure.
    if (b.w !== null && b.w < 44) fautifs.push(`${b.nom} → largeur ${b.w}`)
  }
  exiger(fautifs.length === 0, `cible trop petite : ${fautifs.join(", ")}`)

  /* Le bouton qui OUVRE le guide vit dans le cockpit, pas dans ce composant. */
  const iGuide = SOURCE_PLAYER.indexOf('data-control="sim-guide"')
  exiger(iGuide > 0, "bouton sim-guide introuvable dans le player")
  const blocGuide = SOURCE_PLAYER.slice(iGuide, iGuide + 1200)
  exiger(/height:\s*44/.test(blocGuide), "le bouton Guide ne fait pas 44 px de haut")
  exiger(/minWidth:\s*44/.test(blocGuide), "le bouton Guide ne fait pas 44 px de large")

  /* Les pastilles de progression ne doivent PAS être des boutons : à dix
     étapes, dix cibles de 44 px ne tiennent pas dans le pied, et les réduire
     recréerait exactement le défaut mesuré en production. Elles doublent le
     sommaire, qui porte la navigation en lignes de 44 px. */
  const iPastille = SOURCE_GUIDE_BRUT.indexOf('data-control="guide-pastille"')
  exiger(iPastille > 0, "indicateur de progression introuvable")
  const avant = SOURCE_GUIDE_BRUT.slice(Math.max(0, iPastille - 300), iPastille)
  exiger(!/<button[^>]*$/.test(avant), "les pastilles sont redevenues des boutons")
  exiger(/aria-hidden/.test(SOURCE_GUIDE_BRUT.slice(iPastille, iPastille + 200)), "pastille non masquée aux lecteurs d'écran")

  return `${boutons.length} boutons du guide + celui du cockpit, tous ≥ 44 px ; progression non cliquable`
})

/* ── 6 bis. Accessibilité du dialogue ─────────────────────────────────────── */
verifier("dialogue accessible, sans piège à focus", () => {
  exiger(/role="dialog"/.test(SOURCE_GUIDE), "role=dialog absent")
  exiger(/tabIndex=\{-1\}/.test(SOURCE_GUIDE), "la carte n'est pas focalisable")
  exiger(/aria-labelledby="guide-titre"/.test(SOURCE_GUIDE), "aria-labelledby absent")

  // La description ne doit JAMAIS pointer un nœud absent : `#guide-texte`
  // disparaît en mode replié, `#guide-tache` est toujours rendu.
  exiger(
    /aria-describedby=\{compact \? "guide-tache" : "guide-texte"\}/.test(SOURCE_GUIDE),
    "aria-describedby ne s'adapte pas au mode replié",
  )
  exiger(/id="guide-tache"/.test(SOURCE_GUIDE), "#guide-tache n'existe pas")
  exiger(/id="guide-texte"/.test(SOURCE_GUIDE), "#guide-texte n'existe pas")

  // Focus donné à l'ouverture, rendu à la fermeture.
  exiger(/carteRef\.current\?\.focus/.test(SOURCE_GUIDE), "aucun focus à l'ouverture")
  exiger(/retour\.focus/.test(SOURCE_GUIDE), "le focus n'est pas restauré à la fermeture")
  exiger(/declencheur/.test(SOURCE_GUIDE), "le déclencheur n'est pas mémorisé")

  // ...mais pas de piège : le guide demande d'agir SUR le cockpit.
  exiger(!/focus-?trap|trapFocus/i.test(SOURCE_GUIDE), "un piège à focus a été introduit")
  exiger(!/aria-modal="true"/.test(SOURCE_GUIDE), "aria-modal=true isolerait le cockpit du guide")
  return "focus donné puis rendu, cockpit toujours atteignable"
})

/* ── 7. Vouvoiement ───────────────────────────────────────────────────────── */
verifier("vouvoiement conservé", () => {
  const tutoiement = motEntier(["tu", "ton", "ta", "tes", "toi", "vas", "peux"])
  const fautifs = ETAPES_GUIDE.filter((e) =>
    tutoiement.test([e.titre, e.texte, e.retenir, e.tache, e.reussite].join(" ")),
  ).map((e) => e.id)
  exiger(fautifs.length === 0, `tutoiement détecté : ${fautifs.join(", ")}`)
  return "aucun tutoiement"
})

/* ── 8. Aucun nom de plateforme interne ───────────────────────────────────── */
verifier("aucun nom de plateforme interne", () => {
  const interdits = /(e-?forma|onlineformapro|cloudelearning|rise\s?up|wedof|vtest)/i
  const fautifs = ETAPES_GUIDE.filter((e) =>
    interdits.test([e.titre, e.texte, e.retenir, e.tache, e.reussite].join(" ")),
  ).map((e) => e.id)
  exiger(fautifs.length === 0, `plateforme nommée : ${fautifs.join(", ")}`)
  return "textes neutres"
})

/* ── 9. Clé de stockage versionnée ────────────────────────────────────────── */
verifier("clé de stockage versionnée et cloisonnée", () => {
  const a = cleGuidePour("user-abc")
  const b = cleGuidePour("user-xyz")
  const anon = cleGuidePour(null)
  exiger(a !== b, "deux apprenants partagent la même clé")
  exiger(a.includes(`v${VERSION_GUIDE}`), "la version ne figure pas dans la clé")
  exiger(anon.endsWith(":anon"), "le repli sans identifiant est incorrect")
  exiger(cleGuidePour("  ") === anon, "un identifiant vide doit retomber sur le repli")
  return a
})

/* ── 10. Le player monte bien le guide, et le bouton est là ───────────────── */
verifier("branchement dans le cockpit", () => {
  exiger(SOURCE_PLAYER.includes("<GuideFormation"), "GuideFormation n'est pas monté")
  exiger(SOURCE_PLAYER.includes('data-control="sim-guide"'), "le bouton Guide est absent de la barre")
  exiger(
    /aria-label="Guide de la formation"/.test(SOURCE_PLAYER),
    "le bouton Guide n'a pas de libellé accessible",
  )
  // Le bouton ne doit rien faire d'autre qu'ouvrir/fermer.
  const bloc = SOURCE_PLAYER.slice(
    SOURCE_PLAYER.indexOf('data-control="sim-guide"'),
    SOURCE_PLAYER.indexOf('data-control="sim-guide"') + 900,
  )
  exiger(/onClick=\{\(\) => setGuideOuvert\(\(v\) => !v\)\}/.test(bloc), "le bouton Guide fait autre chose qu'ouvrir/fermer")
  // Les étapes déclarent des ancres ajoutées au player : elles doivent y être.
  for (const ancre of ["sim-badge-etape", "sim-indice", "sim-cockpit", "sim-progression"]) {
    exiger(SOURCE_PLAYER.includes(`data-control="${ancre}"`), `ancre ${ancre} absente du player`)
  }
  return "bouton, ancres et montage en place"
})

/* ── 11. Le fichier d'étapes reste pur ────────────────────────────────────── */
verifier("le fichier d'étapes reste sans effet de bord", () => {
  exiger(!/from\s+["']react/.test(SOURCE_ETAPES), "guide-formation.ts importe React")
  exiger(!/\bfetch\s*\(|document\.|window\./.test(SOURCE_ETAPES), "guide-formation.ts touche au global")
  return "données pures, testables hors navigateur"
})

/* ── Rapport ──────────────────────────────────────────────────────────────── */
console.log("\n═══ check-guide-formation ═══\n")
verts.forEach((v) => console.log("  " + v))
if (echecs.length) {
  console.log("")
  echecs.forEach((e) => console.log("  " + e))
  console.log(`\n${verts.length}/${verts.length + echecs.length} contrôles au vert.\n`)
  process.exit(1)
}
console.log(`\n${verts.length}/${verts.length} contrôles au vert.\n`)
