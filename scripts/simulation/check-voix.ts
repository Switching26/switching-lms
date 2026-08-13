/**
 * CONTRÔLE DU GUIDE VOCAL.
 *
 * Trois choses, et elles échouent toutes en `exit 1` — un contrôle qui chiffre
 * un défaut et sort 0 n'est pas un contrôle, c'est un afficheur :
 *
 *  1. les règles pures (noms de piste, manifeste, requêtes partielles) ;
 *  2. les manifestes réellement posés dans `public/voix/` : chaque fichier
 *     déclaré existe, chaque fichier présent est déclaré ;
 *  3. l'ADOPTION par les quatre players — sans la ligne `etapeId`, tout le reste
 *     est inerte et personne ne s'en aperçoit.
 *
 * `--piege` rejoue les règles d'AVANT et exige qu'elles rougissent : un
 * détecteur qu'on n'a pas piégé ne prouve rien.
 *
 *     npx tsx scripts/simulation/check-voix.ts [--piege]
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"
import {
  aDesPistes,
  estIdentifiantSur,
  estNomDePisteValide,
  lireManifeste,
  lirePlageOctets,
  ROLES_AIDE,
  ROLES_ARRIVEE,
  ROLES_JOUES,
  segmentsPour,
  urlDePiste,
} from "../../lib/simulation/voix"

const RACINE = join(__dirname, "..", "..")
let anomalies = 0
const dire = (m: string) => console.log(m)
const rouge = (m: string) => {
  anomalies++
  console.log(`  ✗ ${m}`)
}

/* ═══════════ 1. LES RÈGLES PURES ═══════════ */

dire("── Noms de piste ──")
const NOMS_REFUSES: unknown[] = [
  "../secret.mp3",
  "dossier/piste.mp3",
  "dossier\\piste.mp3",
  "piste.mp3.exe",
  "piste.wav",
  ".mp3",
  "-piste.mp3",
  "piste..mp3",
  "",
  null,
  42,
  "a".repeat(200) + ".mp3",
]
for (const n of NOMS_REFUSES) {
  if (estNomDePisteValide(n)) rouge(`nom accepté alors qu'il devrait être refusé : ${String(n)}`)
}
for (const n of ["s1a-probleme.mp3", "voix_01.mp3", "M07L0106.mp3"]) {
  if (!estNomDePisteValide(n)) rouge(`nom refusé alors qu'il est valide : ${n}`)
}
if (estIdentifiantSur("../../etc")) rouge("identifiant de chapitre avec chemin accepté")
if (!estIdentifiantSur("cms43a86n00161xggeb0vlh6c")) rouge("cuid réel refusé")
dire(`  ${NOMS_REFUSES.length} noms hostiles refusés, 3 noms légitimes acceptés`)

dire("── Manifeste ──")
if (lireManifeste({ version: 2, etapes: {} }) !== null) rouge("une autre version de format est acceptée")
if (lireManifeste(null) !== null) rouge("un manifeste absent n'est pas rejeté")
{
  // Fail-closed PAR SEGMENT : un segment mal formé disparaît, les autres vivent.
  const m = lireManifeste({
    version: 1,
    etapes: {
      "E-1": [
        { role: "consigne", fichier: "bon.mp3" },
        { role: "consigne", fichier: "../vol.mp3" },
        { role: "inconnu", fichier: "bon.mp3" },
        { role: "bulle", fichier: "bulle.mp3", geste: 2 },
      ],
    },
  })
  const tous = m?.etapes["E-1"] ?? []
  if (tous.length !== 2) rouge(`segments retenus : ${tous.length} au lieu de 2 (bon.mp3 + la bulle)`)
  const joues = segmentsPour(m, "E-1", ROLES_ARRIVEE)
  if (joues.length !== 1 || joues[0].fichier !== "bon.mp3") {
    rouge("le filtrage par rôle ne garde pas la seule consigne")
  }
  // La bulle est déclarée mais JAMAIS jouée : c'est la règle « la voix ne se
  // superpose pas à une démonstration ».
  if (joues.some((s) => s.role === "bulle")) rouge("une bulle de démonstration est jouée")
}
{
  /* 🔴 CE QUI SE JOUE À L'ARRIVÉE EST LA CONSIGNE, ET RIEN D'AUTRE.
   *
   * Défaut de la première version, attrapé au banc : `ROLES_JOUES` servait aussi
   * de file de démarrage, si bien qu'à l'arrivée sur l'étape la voix enchaînait
   * la consigne, PUIS l'indice, PUIS le retour de réussite — « 910 € de prime
   * pour Amina » annoncé avant que l'apprenant ait tapé la moindre formule. */
  const m = lireManifeste({
    version: 1,
    etapes: {
      E: [
        { role: "consigne", fichier: "c.mp3" },
        { role: "aide", fichier: "a.mp3" },
        { role: "feedback", fichier: "f.mp3" },
        { role: "bulle", fichier: "b.mp3" },
      ],
    },
  })
  const arrivee = segmentsPour(m, "E", ROLES_ARRIVEE)
  if (arrivee.length !== 1 || arrivee[0].role !== "consigne") {
    rouge(`à l'arrivée : ${arrivee.map((s) => s.role).join("+") || "rien"} au lieu de la seule consigne`)
  }
  const aide = segmentsPour(m, "E", ROLES_AIDE)
  if (aide.length !== 1 || aide[0].role !== "aide") rouge("le dévoilement de l'indice ne lit pas l'aide")
  if (segmentsPour(m, "E", ROLES_JOUES).some((s) => s.role === "feedback")) {
    rouge("le retour de réussite est joué alors que le player avance seul 550 ms après")
  }
  if (!aDesPistes(m)) rouge("un manifeste porteur d'une consigne est déclaré vide")
  if (aDesPistes(lireManifeste({ version: 1, etapes: { "E-1": [{ role: "bulle", fichier: "b.mp3" }] } })))
    rouge("un manifeste ne portant que des bulles est déclaré sonore")
}
{
  /* LE FORMAT DE LA CHAÎNE DE SYNTHÈSE EST LU TEL QUEL, sans moulinette.
   *
   * Elle ne porte pas de numéro de version, range ses pistes dans `audio/`, et
   * nomme ses rôles en toutes lettres dans une phrase de relecture — le rôle
   * exploitable se déduit de l'identifiant du segment. */
  const m = lireManifeste({
    chapitre: { chapterId: "abc", app: "Excel" },
    voix: { nom: "fr-FR-Chirp3-HD-Aoede" },
    segments: [
      { id: "intro", etape_lms: "intro", fichier: "audio/intro.mp3", duree_s: 9.8, texte_dit: "…" },
      { id: "e6-consigne", etape_lms: "M07-L01-06", fichier: "audio/e6-consigne.mp3", duree_s: 19.9 },
      { id: "e6-aide", etape_lms: "M07-L01-06", fichier: "audio/e6-aide.mp3" },
      { id: "e6-feedback", etape_lms: "M07-L01-06", fichier: "audio/e6-feedback.mp3" },
      { id: "e5-bulle2", etape_lms: "M07-L01-05", fichier: "audio/e5-bulle2.mp3" },
      { id: "vol", etape_lms: "M07-L01-05", fichier: "../vol.mp3" },
    ],
  })
  if (!m) {
    rouge("le format de la chaîne de synthèse n'est pas reconnu")
  } else {
    const e6 = m.etapes["M07-L01-06"] ?? []
    if (e6.length !== 3) rouge(`étape 6 : ${e6.length} segments au lieu de 3`)
    const arrivee = segmentsPour(m, "M07-L01-06", ROLES_ARRIVEE)
    if (arrivee.length !== 1 || arrivee[0].fichier !== "audio/e6-consigne.mp3") {
      rouge("le rôle n'est pas déduit de l'identifiant du segment")
    }
    if (segmentsPour(m, "M07-L01-06", ROLES_AIDE).length !== 1) rouge("l'aide n'est pas reconnue")
    if ((m.etapes["M07-L01-05"] ?? []).some((s) => s.role !== "bulle")) {
      rouge("une bulle n'est pas reconnue comme telle")
    }
    if ((m.etapes["M07-L01-05"] ?? []).length !== 1) rouge("le chemin hostile n'est pas écarté")
    // Les pseudo-étapes de la chaîne sont conservées : aucun identifiant
    // d'étape ne peut les heurter, et elles serviront le jour où l'écran
    // d'ouverture saura parler.
    if (!m.etapes.intro) rouge("la piste d'ouverture est perdue")
  }
}
if (estNomDePisteValide("audio/../vol.mp3")) rouge("un chemin remontant est accepté sous `audio/`")
if (estNomDePisteValide("audio/sous/piste.mp3")) rouge("deux niveaux de dossier sont acceptés")
if (!estNomDePisteValide("audio/e6-consigne.mp3")) rouge("le sous-dossier `audio/` est refusé")
if (!urlDePiste("abc", "p.mp3").startsWith("/api/simulations/abc/voix?piste=")) {
  rouge("l'adresse d'une piste ne passe pas par la route du chapitre")
}
dire("  format, fail-closed par segment, filtrage des rôles, adresse")

dire("── Requêtes partielles (Safari / iPad) ──")
{
  const cas: [string | null, number, { debut: number; fin: number } | null][] = [
    ["bytes=0-499", 1000, { debut: 0, fin: 499 }],
    ["bytes=500-", 1000, { debut: 500, fin: 999 }],
    ["bytes=-200", 1000, { debut: 800, fin: 999 }],
    ["bytes=0-99999", 1000, { debut: 0, fin: 999 }],
    ["bytes=1000-1200", 1000, null], // au-delà du fichier
    ["bytes=600-500", 1000, null], // à l'envers
    ["bytes=-", 1000, null],
    ["octets=0-10", 1000, null],
    [null, 1000, null],
    ["bytes=0-10", 0, null], // fichier vide
  ]
  for (const [entete, taille, attendu] of cas) {
    const obtenu = lirePlageOctets(entete, taille)
    if (JSON.stringify(obtenu) !== JSON.stringify(attendu)) {
      rouge(`plage « ${entete} » sur ${taille} o → ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`)
    }
  }
  dire(`  ${cas.length} en-têtes, bornés au fichier`)
}

/* ═══════════ 2. LES MANIFESTES POSÉS ═══════════ */

dire("── Manifestes de `public/voix/` ──")
const racineVoix = join(RACINE, "public", "voix")
let chapitres = 0
let pistes = 0
if (existsSync(racineVoix)) {
  for (const chapitre of readdirSync(racineVoix)) {
    const dossier = join(racineVoix, chapitre)
    if (!statSync(dossier).isDirectory()) continue
    chapitres++
    if (!estIdentifiantSur(chapitre)) rouge(`dossier au nom inexploitable : ${chapitre}`)
    const chemin = join(dossier, "manifeste.json")
    if (!existsSync(chemin)) {
      rouge(`${chapitre} : aucun manifeste — les fichiers ne seront jamais servis`)
      continue
    }
    const manifeste = lireManifeste(JSON.parse(readFileSync(chemin, "utf8")))
    if (!manifeste) {
      rouge(`${chapitre} : manifeste illisible`)
      continue
    }
    const declares: string[] = []
    for (const [etapeId, segments] of Object.entries(manifeste.etapes)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(etapeId)) {
        rouge(`${chapitre} : identifiant d'étape douteux « ${etapeId} »`)
      }
      for (const s of segments) {
        pistes++
        if (declares.indexOf(s.fichier) === -1) declares.push(s.fichier)
        if (!existsSync(join(dossier, s.fichier))) {
          rouge(`${chapitre} · ${etapeId} : « ${s.fichier} » déclaré mais absent du disque`)
        }
      }
    }
    /* L'inverse compte autant : un fichier non déclaré ne sera jamais servi —
     * la route refuse tout ce que le manifeste n'annonce pas.
     *
     * ⚠️ On parcourt AUSSI `audio/`. Ne regarder que la racine était un angle
     * mort : la chaîne de synthèse range tout dans ce sous-dossier, si bien que
     * le contrôle ne voyait aucun fichier et ne pouvait rien signaler. */
    const aRegarder = [
      ...readdirSync(dossier).map((f) => f),
      ...(existsSync(join(dossier, "audio"))
        ? readdirSync(join(dossier, "audio")).map((f) => `audio/${f}`)
        : []),
    ]
    for (const f of aRegarder) {
      if (!f.endsWith(".mp3")) continue
      if (declares.indexOf(f) === -1) rouge(`${chapitre} : « ${f} » présent mais absent du manifeste`)
    }
  }
}
dire(`  ${chapitres} chapitre(s), ${pistes} segment(s) déclarés`)

/* ═══════════ 3. L'ADOPTION PAR LES PLAYERS ═══════════ */

dire("── Adoption par les quatre players ──")
const PLAYERS = [
  "components/simulation/SimulationPlayer.tsx",
  "components/simulation/word/WordPlayer.tsx",
  "components/simulation/ppt/PptPlayer.tsx",
  "components/simulation/outlook/OutlookPlayer.tsx",
]
/**
 * ⚠️ ON RETIRE LES COMMENTAIRES AVANT DE CHERCHER.
 *
 * Le piège du registre multi-app, tombé deux fois le même jour : `registre.ts`
 * documentait son propre branchement en commentaire, et le contrôle lisait la
 * source commentaires compris — Word passait au vert alors qu'il n'était branché
 * nulle part.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

for (const p of PLAYERS) {
  const src = sansCommentaires(readFileSync(join(RACINE, p), "utf8"))
  if (!/etapeId=\{/.test(src)) {
    rouge(`${p} ne passe pas \`etapeId\` : le guide vocal y est inerte`)
  }
}
{
  const shell = sansCommentaires(readFileSync(join(RACINE, "components/simulation/AtelierShell.tsx"), "utf8"))
  if (!/useGuideVocal\(/.test(shell)) rouge("le châssis ne monte pas le guide vocal")
  if (!/data-control="sim-voix"/.test(shell)) rouge("le châssis ne rend pas la commande d'écoute")
  if (!/data-control="sim-voix-couper"/.test(shell)) rouge("le châssis ne rend pas la coupure définitive")
  if (!/data-voix/.test(shell)) rouge("les commandes de la voix ne sont pas exemptées de l'arrêt sur geste")
}
dire(`  ${PLAYERS.length} players + le châssis`)

/* ═══════════ AUTO-ÉPREUVE ═══════════ */

if (process.argv.includes("--piege")) {
  dire("── Piège : les règles d'avant doivent rougir ──")
  let attrapes = 0
  // a) une validation naïve laisserait passer un chemin
  const naif = (n: string) => n.endsWith(".mp3")
  if (naif("../vol.mp3") && !estNomDePisteValide("../vol.mp3")) attrapes++
  // b) un manifeste sans filtrage de rôle jouerait les bulles pendant la démo
  const m = lireManifeste({ version: 1, etapes: { E: [{ role: "bulle", fichier: "b.mp3" }] } })
  if ((m?.etapes.E ?? []).length === 1 && segmentsPour(m, "E", ROLES_ARRIVEE).length === 0) attrapes++
  // c) sans requête partielle, l'iPad ne lirait rien
  if (lirePlageOctets("bytes=0-9", 100) !== null) attrapes++
  if (attrapes !== 3) {
    rouge(`auto-épreuve : ${attrapes}/3 pièges attrapés`)
  } else {
    dire("  3/3 pièges attrapés")
  }
}

if (anomalies) {
  console.log(`\n✗ ${anomalies} anomalie(s)`)
  process.exit(1)
}
console.log("\n✓ guide vocal : règles, manifestes et adoption des players conformes")
