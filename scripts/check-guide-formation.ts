/**
 * Contrôles anti-régression du guide interactif de la formation.
 *
 * Sans base ni serveur Next : règles pures puis vrai châssis React dans un
 * Chrome privé sans fenêtre. Toutes les requêtes externes sont bloquées.
 * Utilise esbuild et le playwright-core de l'outillage CLI installé.
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
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { build } from "esbuild"
import { ETAPES_GUIDE, etapesDisponibles, cleGuidePour, VERSION_GUIDE, type EtapeGuide } from "../lib/simulation/guide-formation"

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

// Les ancres sont vérifiées sur le DOM rendu, à la fin du contrôle.

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

  // Le bouton du cockpit est mesuré dans le navigateur, avec la vraie barre.

  /* Les pastilles de progression ne doivent PAS être des boutons : à dix
     étapes, dix cibles de 44 px ne tiennent pas dans le pied, et les réduire
     recréerait exactement le défaut mesuré en production. Elles doublent le
     sommaire, qui porte la navigation en lignes de 44 px. */
  const iPastille = SOURCE_GUIDE_BRUT.indexOf('data-control="guide-pastille"')
  exiger(iPastille > 0, "indicateur de progression introuvable")
  const avant = SOURCE_GUIDE_BRUT.slice(Math.max(0, iPastille - 300), iPastille)
  exiger(!/<button[^>]*$/.test(avant), "les pastilles sont redevenues des boutons")
  exiger(/aria-hidden/.test(SOURCE_GUIDE_BRUT.slice(iPastille, iPastille + 200)), "pastille non masquée aux lecteurs d'écran")

  return `${boutons.length} boutons du guide, dimensions déclarées ≥ 44 px ; progression non cliquable`
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

// Le branchement est exercé par un clic réel, avec AtelierShell et son guide.

/* ── 11. Le fichier d'étapes reste pur ────────────────────────────────────── */
verifier("le fichier d'étapes reste sans effet de bord", () => {
  exiger(!/from\s+["']react/.test(SOURCE_ETAPES), "guide-formation.ts importe React")
  exiger(!/\bfetch\s*\(|document\.|window\./.test(SOURCE_ETAPES), "guide-formation.ts touche au global")
  return "données pures, testables hors navigateur"
})

/** Pas de serveur Next ni de base : le vrai châssis React, rendu dans Chrome. */
async function verifierRendu() {
  const requireLocal = createRequire(join(RACINE, "package.json"))
  // Utilise l'outillage QA installé, sans dépendance applicative ni chemin Mac.
  const npmGlobal = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim()
  const { chromium } = requireLocal(process.env.PLAYWRIGHT_CORE_MODULE || join(npmGlobal, "@playwright/cli/node_modules/playwright-core"))
  const source = `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import AtelierShell from "@/components/simulation/AtelierShell";
    import { useImmersion, ContexteImmersion } from "@/components/learner/useImmersion";
    import { ETAPES_GUIDE } from "@/lib/simulation/guide-formation";
    const rien = () => {};
    const consigne = {
      texte: "Repérez les commandes du logiciel.", nature: "action", lecture: false,
      aDemonstration: true, demoJouable: true, attendu: "Le geste demandé", reponse: null,
      aide: "Un repère utile", aideVisible: false, aideAncree: false, indiceDisponible: true,
      evaluationNotee: false, relais: 0, relaisActif: false, verdict: null, aplomb: null,
      panneJuge: null, passageEnCours: false, aideProposee: true, demonstration: false,
      demoFinie: false, demoRejouable: false, index: 0, total: 3, reculPossible: false,
      onMontrer: rien, onDebloquer: rien, onRejouerDemo: rien, onIndice: rien,
      onSuivant: rien, onReculer: rien
    };
    function Banc() {
      const immersion = useImmersion();
      return <ContexteImmersion.Provider value={immersion}>
        <div ref={immersion.cadre} style={{height:"100vh"}}>
          <AtelierShell chapterId="guide-fixture" mode="LESSON" evaluationNotee={false}
            filModule="Module de contrôle" filChapitre="Commandes du châssis" index={0} total={3}
            relais={0} introVue preview pleinCadre consigne={consigne}
            sommaire={[{id:"guide-fixture",titre:"Leçon de contrôle",module:"Module",genre:"lecon",termine:false}]}
            onNaviguer={rien} onNote={rien} note="" afficherRessources onQuitter={rien}>
            <div data-zone-grille="" style={{flex:1,minHeight:200}}>Surface du logiciel</div>
          </AtelierShell>
        </div>
      </ContexteImmersion.Provider>
    }
    window.__etapesGuide = ETAPES_GUIDE;
    createRoot(document.getElementById("root")).render(<Banc />);
  `
  const bundle = await build({
    stdin: { contents: source, resolveDir: RACINE, loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife",
    jsx: "automatic", tsconfig: join(RACINE, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
  })
  const navigateur = await chromium.launch({ channel: "chrome", headless: true, args: ["--mute-audio"] })
  try {
    const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
    const erreurs: string[] = []
    page.on("pageerror", (e: Error) => erreurs.push(e.message))
    await page.route("**/*", (route: { abort: () => Promise<void> }) => route.abort())
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div></body></html>')
    await page.addStyleTag({ content: lire("app/fluid.css") + lire("app/lessons.css") })
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.locator('[data-control="sim-guide"]').waitFor()
    const ancres = await page.evaluate(() => {
      const racine = document.querySelector("[data-immersion-atelier]")!
      const etapes = (window as unknown as { __etapesGuide: EtapeGuide[] }).__etapesGuide
      return etapes.filter(e => e.cible).map(e => {
        const el = racine.querySelector(e.cible!) as HTMLElement | null
        const rect = el?.getBoundingClientRect()
        return { id: e.id, present: !!el, visible: !!rect && rect.width > 0 && rect.height > 0 }
      })
    })
    verifier("toutes les cibles existent dans le DOM du vrai châssis", () => {
      const manquantes = ancres.filter((e: {present:boolean;visible:boolean}) => !e.present || !e.visible)
      exiger(ancres.length === ETAPES_GUIDE.filter(e => e.cible).length, "des étapes n'ont pas été contrôlées")
      exiger(manquantes.length === 0, "cible absente ou invisible : " + manquantes.map((e: {id:string}) => e.id).join(", "))
      return `${ancres.length} ancres visibles, y compris les replis des aides contextuelles`
    })
    await page.locator('[data-control="sim-guide"]').click()
    await page.locator('[data-guide="carte"]').waitFor()
    const mesures = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>(".lms-common-bar button, [data-guide=carte] button")).filter(e => e.offsetHeight && getComputedStyle(e).display !== "none").map(e => ({
      nom: e.getAttribute("aria-label") || e.textContent?.trim(), largeur: e.offsetWidth, hauteur: e.offsetHeight
    })))
    verifier("cibles de la barre et du guide réellement ≥ 44 × 44", () => {
      const petites = mesures.filter((m: {largeur:number;hauteur:number}) => m.largeur < 44 || m.hauteur < 44)
      exiger(mesures.length >= 8, "trop peu de boutons mesurés")
      exiger(petites.length === 0, "cibles trop petites : " + JSON.stringify(petites))
      return `${mesures.length} boutons mesurés avec les styles réels`
    })
    const parcoursVerifie = ancres.every((e: {present:boolean;visible:boolean}) => e.present && e.visible)
    if (parcoursVerifie) {
      for (let i = 0; i < ETAPES_GUIDE.length; i++) {
        if (i) await page.locator('[data-control="guide-suivant"]').click()
        const etape = ETAPES_GUIDE[i]
        await page.waitForFunction((titre: string) => document.querySelector("#guide-titre")?.textContent === titre, etape.titre)
        if (!etape.cible) continue
        await page.waitForFunction(({ cible, pad }: { cible:string; pad:number }) => {
          const racine = document.querySelector<HTMLElement>("[data-immersion-atelier]")!
          const el = racine.querySelector<HTMLElement>(cible)!
          const spot = racine.querySelector<HTMLElement>('[data-guide="projecteur"]')!
          if (!el || !spot) return false
          const r = racine.getBoundingClientRect(), e = el.getBoundingClientRect(), s = spot.getBoundingClientRect()
          return Math.abs(s.width - e.width - pad * 2) < 1 && Math.abs(s.height - e.height - pad * 2) < 1
            && Math.abs(s.left - (e.left - pad + racine.scrollLeft)) < 1
            && Math.abs(s.top - (e.top - pad + racine.scrollTop)) < 1 && r.width > 0
        }, { cible: etape.cible, pad: etape.pad ?? 6 }, { timeout:10000 })
      }
    }
    await page.locator('[data-control="guide-fermer"]').click()
    await page.locator('[data-guide="carte"]').waitFor({ state: "detached" })
    verifier("branchement réel du guide depuis la barre", () => {
      exiger(erreurs.length === 0, erreurs.join("; "))
      return parcoursVerifie
        ? `${ETAPES_GUIDE.length} étapes parcourues ; projecteur aligné sur chaque cible ; ouverture/fermeture réelles ; aucun appel réseau`
        : "ouverture/fermeture réelles ; parcours interrompu car une cible manque"
    })
  } finally {
    await navigateur.close()
  }
}

function resultat() {
  console.log("\n" + verts.map(s => "  " + s).join("\n"))
  if (echecs.length) console.error("\n" + echecs.map(s => "  " + s).join("\n"))
  console.log(`\n${verts.length}/${verts.length + echecs.length} contrôles au vert.\n`)
  process.exitCode = echecs.length ? 1 : 0
}
verifierRendu().catch((e: Error) => echecs.push("✗ harnais rendu : " + e.message)).finally(resultat)
