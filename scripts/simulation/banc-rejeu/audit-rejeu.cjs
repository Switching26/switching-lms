/**
 * AUDIT DU REJEU DES DÉMONSTRATIONS — premier passage PUIS « Revoir ».
 *
 *   node audit-rejeu.cjs --cas=cas.json --sortie=res.json [--front=0 --fronts=1]
 *                        [--vitesse=5] [--tete] [--bouton]
 *
 * CE QU'IL MESURE, ET POURQUOI CE N'EST PAS LE COMPTEUR
 * Une démonstration mutante peut réussir une fois puis supprimer ses propres
 * cibles : « Enregistrer sous » ferme la boîte et crée le fichier, si bien
 * qu'un simple rejeu du calque fait avancer 1/2 puis 2/2 dans le vide. Le
 * compteur, `demoFinie` et l'apparition de « Revoir » sont donc tous les trois
 * des faux témoins. Ce harnais s'appuie sur quatre mesures qui, elles, ne
 * peuvent pas mentir :
 *
 *   E0  état à l'ENTRÉE de l'étape, avant que quoi que ce soit ne bouge ;
 *   S1  état après le PREMIER passage ;
 *   R0  état au moment où le REJEU commence à dessiner (après l'annonce, avant
 *       la première écriture — d'où `data-demo-phase`, qui donne l'instant
 *       exact au lieu de le chronométrer) ;
 *   S2  état après le REJEU.
 *
 * Et il en tire deux propriétés :
 *
 *   RESTAURATION   R0 == E0 — le rejeu repart de l'état d'entrée, pas de la
 *                  mutation laissée par le premier passage ;
 *   REPRODUCTION   S2 == S1 — le second passage aboutit au MÊME écran que le
 *                  premier. C'est la propriété qui attrape tout : un bouton qui
 *                  bascule, une boîte qui ne s'ouvre plus, un fichier créé deux
 *                  fois, un onglet introuvable.
 *
 * S'y ajoutent, dans les DEUX passages : toutes les cibles du plan réellement
 * dessinées (`__SIM_DEMO_VUS`, posé au RENDU — mesurer après coup se retourne
 * contre nous, un bouton de menu disparaît justement parce que le geste a
 * abouti), toutes les pressions rejouées, le compteur arrivé à n/n, l'absence
 * d'auto-avancement et une console propre.
 */

const fs = require('fs')
const path = require('path')
const { efficacite } = require('./efficacite.cjs')
const { chromium } = require('/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core')

const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`))
  return m ? m.slice(n.length + 3) : d
}
const drapeau = (n) => process.argv.includes(`--${n}`)

const PORT = arg('port', '8890')
const VITESSE = Number(arg('vitesse', '5'))
const FRONT = Number(arg('front', '0'))
const FRONTS = Number(arg('fronts', '1'))
const SORTIE = arg('sortie', 'res.json')
const PAR_BOUTON = drapeau('bouton')
const BROUILLER = drapeau('brouiller')

let cas = JSON.parse(fs.readFileSync(arg('cas', 'cas.json'), 'utf8'))
  .filter((_, i) => i % FRONTS === FRONT)

/**
 * REPRISE. Un front interrompu a déjà écrit ses résultats : les rejouer coûte
 * des dizaines de minutes pour rien, et les perdre coûte pire. `--reprendre`
 * recharge la sortie, déduplique par (nom, index) et ne joue que ce qui manque.
 */
let dejaFait = []
if (drapeau('reprendre') && fs.existsSync(SORTIE)) {
  try {
    const vus = new Map()
    for (const r of JSON.parse(fs.readFileSync(SORTIE, 'utf8'))) {
      const k = `${r.nom}#${r.index}`
      /**
       * ON NE REPREND QUE LES SUCCÈS.
       *
       * Garder un DEFAUT et le sauter, c'est publier un verdict rendu par une
       * version antérieure du banc : `m01-l02#3` était compté en défaut alors
       * qu'il ressort OK dès que l'échantillonnage volatil existe. Un défaut se
       * REMESURE toujours ; seul ce qui est passé peut être tenu pour acquis.
       */
      if (r.verdict !== 'OK') continue
      if (!vus.has(k)) vus.set(k, r)
    }
    dejaFait = [...vus.values()]
    const cles = new Set(vus.keys())
    const avant = cas.length
    cas = cas.filter((c) => !cles.has(`${c.nom}#${c.index}`))
    console.error(`reprise : ${dejaFait.length} déjà mesurés, ${cas.length}/${avant} à jouer`)
  } catch (e) {
    console.error(`reprise impossible (${String(e).slice(0, 80)}) : on repart de zéro`)
  }
}

/** Scénarios chargés une fois : l'attendu se calcule depuis EUX, pas depuis le plan. */
const SCENARIOS = new Map()
function scenario(nom) {
  if (!SCENARIOS.has(nom)) SCENARIOS.set(nom, JSON.parse(fs.readFileSync(path.join('scenarios', nom), 'utf8')))
  return SCENARIOS.get(nom)
}

/* ── Comparaison d'états ─────────────────────────────────────────────────────
   On compare famille par famille pour pouvoir NOMMER ce qui a bougé. Un écart
   sur `selection` n'a pas le même sens qu'un écart sur `poste`. */

const FAMILLES = [
  'cellules', 'formats', 'mises', 'colonnes', 'noms', 'feuilles', 'volets', 'filtreesHors', 'reglesMfc',
  'poste', 'boite', 'menuFormat', 'pressePapiers', 'plageSomme',
  'graphique', 'tcd', 'reglages', 'macros', 'macroCourante', 'enregistrement', 'filtrePose',
  'fusions', 'notes',
]
/* La sélection et l'onglet de ruban bougent par construction pendant une
   démonstration (elle sélectionne la plage, elle ouvre l'onglet). On les
   mesure à part : ce sont des indices, pas des défauts en soi. */
const FAMILLES_INDICE = ['selection', 'onglet']

/**
 * Formats que la GRILLE pose elle-même, pas la démonstration.
 *
 * `ExcelGrid.localiserDecimale` met `0.##########` sur toute décimale sans
 * format d'auteur, et `lireDateOuHeureFr` pose `dd/mm/yyyy` / `hh:mm` sur une
 * date tapée à la française. Ce sont des conséquences déterministes de la
 * VALEUR — la même valeur les reproduira à l'identique au rejeu, et sur une
 * cellule revenue vide elles ne se voient pas. Les compter comme « état
 * d'entrée non restauré » produirait des centaines de faux défauts : c'est le
 * même piège que `aplomb.ts`, qui a dû ajouter `MOTIF_DECIMAL_AUTO` et
 * `formatFrancisation` après avoir « réparé » toute la francisation du corpus.
 *
 * L'exclusion tombe dès que le plan presse un bouton de format : là, le format
 * EST le geste enseigné, et son absence de rejeu est un vrai défaut.
 */
const AUTO_DECIMAL = '0.##########'
const AUTO_DATE = new Set(['dd/mm/yyyy', 'hh:mm', 'hh:mm:ss', 'yyyy/mm/dd;@'])

/** Feuille active d'un cliché : `["Feuil1","Charges*"]` → « Charges ». */
const feuilleActive = (e) => (e?.feuilles || []).find((f) => f.endsWith('*')) || ''

function ecarts(a, b, familles, presse = [], sansFiltre = false) {
  if (!a || !b) return ['état manquant']
  /* La sonde ne lit QUE la feuille active. Comparer deux clichés pris sur des
     feuilles différentes revient à comparer deux classeurs : sur `m15-l01`, B3
     valait 124 700 sur « Synthèse » et « Chiffre d'affaires » sur l'autre — un
     écart de cent pour cent, et purement imaginaire. */
  const memeFeuille = feuilleActive(a) === feuilleActive(b)
  // Seul `acc-format-date` peut poser un motif de date : quand il n'est pas du
  // geste, un motif de date ne peut venir que de la francisation moteur.
  const dateEnJeu = sansFiltre || presse.includes('acc-format-date')
  const out = []
  for (const f of familles) {
    const x = JSON.stringify(a[f] ?? null)
    const y = JSON.stringify(b[f] ?? null)
    if (x === y) continue
    if (f === 'cellules' || f === 'formats' || f === 'mises' || f === 'colonnes') {
      if (!memeFeuille) continue
      const A = a[f] ?? {}, B = b[f] ?? {}
      const refs = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort()
      let d = refs.filter((r) => A[r] !== B[r])
      if (f === 'formats' && !sansFiltre) {
        // `0.##########` n'est posé par AUCUN bouton : c'est la francisation des
        // décimales, reposée à l'identique dès que la valeur revient.
        const franc = (v) =>
          v === undefined || v === '' || v === AUTO_DECIMAL || (!dateEnJeu && AUTO_DATE.has(v))
        d = d.filter((r) => !(franc(A[r]) && franc(B[r])))
      }
      if (!d.length) continue
      out.push(`${f}[${d.slice(0, 8).map((r) => `${r}:${A[r] ?? '∅'}→${B[r] ?? '∅'}`).join(' ')}]`)
    } else {
      out.push(`${f}:${x.slice(0, 90)}→${y.slice(0, 90)}`)
    }
  }
  return out
}

/* ── Pilotage d'une étape ──────────────────────────────────────────────────── */

const FIN = '[data-control="sim-revoir-demo"],[data-control="sim-revoir-geste"]'
const MONTRER = '[data-control="sim-montrer"],[data-control="sim-voir-geste"]'

async function attendre(page, predicat, msMax, pas = 45) {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = await page.evaluate(predicat) } catch { /* remontage en cours */ }
    if (v) return v
    if (Date.now() - t0 > msMax) return null
    await page.waitForTimeout(pas)
  }
}

/** Relevé de ce que le calque a dessiné et pressé depuis la dernière remise à zéro. */
const RELEVE = () => {
  const vus = window.__SIM_DEMO_VUS || {}
  const plan = window.__SIM_DEMO_PLAN
  const c = document.querySelector('[data-demo-compteur]')
  const calque = document.querySelector('[data-demo-phase]')
  const cadre = calque ? calque.getBoundingClientRect() : null
  return {
    plan,
    vus,
    boites: window.__SIM_DEMO_BOITES || {},
    cadre: cadre ? { w: cadre.width, h: cadre.height } : null,
    presses: (window.__SIM_DEMO_PRESSES || []).slice(),
    /**
     * L'ÉTAT VOLATIL, ÉCHANTILLONNÉ PENDANT LA SÉQUENCE.
     *
     * Certains effets ne SURVIVENT PAS à la fin de la démonstration :
     * `rendreClasseur()` referme la boîte « Insérer une fonction » et le menu
     * Format en sortant, à dessein — l'apprenant ne doit pas récupérer la main
     * devant une fenêtre posée sur sa feuille. Comparer seulement E0 à S1
     * déclarait donc « ce bouton ne produit rien » sur `bf-fx`, alors que la
     * boîte s'ouvre bel et bien sous les yeux de l'apprenant. On échantillonne
     * donc ce qui est fugace, au lieu d'affaiblir le contrôle.
     */
    volatil: (() => {
      /* RELEVÉ LÉGER. L'échantillonnage tourne toutes les 40 ms PENDANT que la
         démonstration écrit : appeler ici le relevé complet interrogeait des
         centaines de cellules par seconde et saturait la façade d'Univer
         jusqu'au « [redi]: Detecting cyclic dependency » qui rendait le
         classeur définitivement inutilisable (m01-e02). `__SIM_ETAT_VOLATIL`
         ne lit que des états React et ne touche pas la grille. */
      const e = window.__SIM_ETAT_VOLATIL ? window.__SIM_ETAT_VOLATIL() : null
      return e ? JSON.stringify(e) : null
    })(),
    compteur: c ? c.getAttribute('data-demo-compteur') : null,
    phase: document.querySelector('[data-demo-phase]')?.getAttribute('data-demo-phase') ?? null,
    etape: window.__SIM_ETAPE,
    fin: !!document.querySelector('[data-control="sim-revoir-demo"],[data-control="sim-revoir-geste"]'),
  }
}

/** Joue une séquence jusqu'à son marqueur de fin, en relevant au vol. */
async function jouerSequence(page, msMax) {
  const t0 = Date.now()
  const compteurs = new Set()
  const volatils = new Set()
  let plan = null
  let etapes = new Set()
  let derniere = null
  for (;;) {
    let r = null
    try { r = await page.evaluate(RELEVE) } catch { /* remontage */ }
    if (r) {
      derniere = r
      if (r.plan) plan = r.plan
      if (r.compteur) compteurs.add(r.compteur)
      if (r.volatil) volatils.add(r.volatil)
      if (r.etape) etapes.add(r.etape)
      if (r.fin) break
    }
    if (Date.now() - t0 > msMax) break
    await page.waitForTimeout(40)
  }
  const final = await page.evaluate(RELEVE).catch(() => derniere)
  return {
    plan: plan ?? final?.plan ?? null,
    vus: final?.vus ?? {},
    boites: final?.boites ?? {},
    cadre: final?.cadre ?? derniere?.cadre ?? null,
    presses: final?.presses ?? [],
    compteurs: [...compteurs],
    volatils: [...volatils],
    etapes: [...etapes],
    fini: !!final?.fin,
    duree: Date.now() - t0,
  }
}

/**
 * Amène le chapitre à l'étape voulue en le JOUANT depuis le début : la
 * démonstration fait chaque geste, « J'ai compris — continuer » avance. C'est le
 * seul moyen de disposer des objets — graphique, tableau croisé — qu'une étape
 * antérieure a créés.
 */
async function amener(page, nom, index) {
  await page.evaluate(([n]) => window.__BANC_OUVRIR(n, 0), [nom])
  if (!(await attendre(page, () => window.__BANC_PRET === true, 15000))) return false
  const intro = page.locator('[data-control="intro-commencer"]')
  if (await intro.count()) await intro.click().catch(() => {})
  for (let i = 0; i < index; i++) {
    const fini = await attendre(
      page,
      () => !!document.querySelector('[data-control="sim-revoir-demo"],[data-control="sim-revoir-geste"]'),
      60000,
    )
    if (!fini) return false
    const suivant = page.locator('[data-control="sim-debloquer"],[data-control="sim-continuer"]')
    if (await suivant.count()) await suivant.first().click().catch(() => {})
    else return false
    await page.waitForTimeout(900)
  }
  // La démonstration de l'étape VISÉE doit repartir de zéro.
  return await attendre(page, () => !!window.__SIM_ETAT_AUDIT, 15000)
}

async function auditerEtape(page, nom, index, attenduId) {
  const erreurs = []
  const onErr = (e) => erreurs.push(
    (String(e.message || e) + (process.env.BANC_PILE ? '\n' + String(e.stack || '') : '')).slice(0, process.env.BANC_PILE ? 2000 : 130))
  page.on('pageerror', onErr)
  const journal = []
  const onCons = (m) => { if (m.type() === 'error') journal.push(m.text().slice(0, 130)) }
  page.on('console', onCons)

  const fin = () => { page.off('pageerror', onErr); page.off('console', onCons) }

  try {
    /* Les traces vivent sur `window` et SURVIVENT au remontage du player : sans
       cette remise à zéro, les pressions de l'étape précédente s'ajoutaient à
       celles du premier passage, et une cible dessinée à l'étape d'avant
       passait pour dessinée ici. Premier faux verdict rencontré. */
    await page.evaluate(() => { window.__SIM_DEMO_VUS = {}; window.__SIM_DEMO_PRESSES = []; window.__SIM_DEMO_BOITES = {} })
    await page.evaluate(([n, i]) => window.__BANC_OUVRIR(n, i), [nom, index])
    const pret = await attendre(page, () => window.__BANC_PRET === true, 12000)
    if (!pret) { fin(); return { nom, index, verdict: 'ECHEC', motif: 'banc non prêt' } }

    // Page de garde : sans ce clic, la lecture automatique ne part pas
    // (`introVue`) et la démonstration ne se joue jamais.
    const intro = page.locator('[data-control="intro-commencer"]')
    if (await intro.count()) { await intro.click().catch(() => {}); }

    // Se recaler sur l'ÉTAPE avant toute mesure : une évaluation retombe de
    // force sur sa première question, et juste après un remontage l'ancien
    // identifiant peut encore traîner.
    await attendre(page, () => !!window.__SIM_ETAT_AUDIT, 8000)
    /**
     * E0 SE RELÈVE QUAND L'ÉTAPE EST POSÉE, PAS DÈS QUE LA SONDE EXISTE.
     *
     * `applyStep` change de feuille, écrit son décor et laisse le moteur
     * recalculer. Relever l'état trop tôt donnait, sur les chapitres
     * multi-feuilles, un E0 pris sur la feuille PRÉCÉDENTE — d'où des écarts de
     * cent pour cent entre deux relevés qui n'avaient jamais décrit le même
     * écran. On attend l'annonce de la démonstration : à cet instant le décor
     * est posé et rien n'a encore bougé.
     */
    await attendre(
      page,
      () => document.querySelector('[data-demo-phase]')?.getAttribute('data-demo-phase') === 'avertir',
      12000,
      40,
    )
    let e0 = await page.evaluate(() => window.__SIM_ETAT_AUDIT())
    let prerequisRejoues = false
    if (attenduId && e0.etape !== attenduId) {
      /* Une ouverture peut se croiser avec un recyclage de page : le scénario
         par défaut du banc reste alors affiché. On rouvre une fois avant de
         déclarer l'étape hors portée — sinon on renonce à mesurer pour une
         course entre deux commandes, pas pour un défaut. */
      await page.evaluate(([n, i]) => window.__BANC_OUVRIR(n, i), [nom, index])
      await attendre(page, () => window.__BANC_PRET === true, 15000)
      const intro2 = page.locator('[data-control="intro-commencer"]')
      if (await intro2.count()) await intro2.click().catch(() => {})
      await attendre(page, () => !!window.__SIM_ETAT_AUDIT, 12000)
      e0 = await page.evaluate(() => window.__SIM_ETAT_AUDIT())
      if (e0.etape !== attenduId) {
        fin()
        return { nom, index, verdict: 'HORS-PORTEE', motif: `étape ${e0.etape} au lieu de ${attenduId}` }
      }
    }
    /**
     * L'OBJET N'EXISTE PAS PARCE QUE LE HARNAIS A SAUTÉ LES ÉTAPES D'AVANT.
     *
     * `?step=N` ouvre l'étape directement, et `rejouerAvant` ne reconstitue que
     * des CELLULES : un graphique ou un tableau croisé créé par une étape
     * antérieure n'existe pas. Mesurer une étape qui le RETOUCHE reviendrait à
     * rapporter un défaut produit là où il n'y a qu'une limite de banc — c'est
     * ce que `m18-e01#2` a démontré, la même étape étant parfaite quand le
     * chapitre est joué depuis le début. On la classe donc hors portée et on la
     * vérifie séparément, chapitre en main.
     */
    const st = scenario(nom).steps[index]
    const su0 = st.setup || {}
    const besoinGraph = st.action.type === 'SELECT_CHART_ELEMENT' || (su0.chartEdit && !su0.chart)
    const besoinTcd = su0.pivotEdit && !su0.pivot
    /* Une macro NOMMÉE qu'une étape antérieure a enregistrée : `M27-E01-07`
       demande de l'EXÉCUTER, pas de la refaire. Sauter jusqu'à cette étape la
       laisse inexistante, et la démonstration se rabat sur un enregistrement
       qui n'a que deux instructions au lieu de quatre. Le prérequis se joue. */
    const macroAttendue = st.action.type === 'EXPECT_MACRO' ? st.action.macro?.name : null
    const besoinMacro = !!macroAttendue &&
      !(e0.macros || []).some((m) => String(m).split(':')[0] === macroAttendue)
    if ((besoinGraph && !e0.graphique) || (besoinTcd && !e0.tcd) || besoinMacro) {
      /**
       * ON VA CHERCHER LE PRÉREQUIS AU LIEU DE RENONCER.
       *
       * `?step=N` ouvre l'étape directement, et `rejouerAvant` ne reconstitue
       * que des CELLULES : un graphique ou un tableau croisé créé plus tôt
       * n'existe pas. Plutôt que de classer l'étape hors portée, on rejoue le
       * chapitre DEPUIS LE DÉBUT — la démonstration accomplit chaque geste, et
       * « J'ai compris — continuer » fait avancer — jusqu'à l'étape visée. C'est
       * le chemin de l'apprenant, en plus fidèle que le saut.
       */
      const arrive = await amener(page, nom, index)
      if (!arrive) {
        fin()
        return { nom, index, etape: e0.etape, verdict: 'ECHEC',
                 motif: 'prérequis introuvable : le chapitre n’a pas pu être joué jusqu’à cette étape' }
      }
      await page.evaluate(() => { window.__SIM_DEMO_VUS = {}; window.__SIM_DEMO_PRESSES = []; window.__SIM_DEMO_BOITES = {} })
      e0 = await page.evaluate(() => window.__SIM_ETAT_AUDIT())
      prerequisRejoues = true
    }

    /* ── Variante « état brouillé » ───────────────────────────────────────────
       Le protocole exige de refaire l'épreuve après une erreur volontaire. On
       reproduit le film de Samuel du 31/07 : une valeur absurde écrite PAR-DESSUS
       une cellule déjà produite, et une autre dans une case que le scénario
       laisse vide. La démonstration doit alors montrer un classeur VRAI, et le
       rejeu doit montrer exactement la même chose. */
    let salies = []
    if (BROUILLER) {
      salies = await page.evaluate(() => {
        const g = window.__SIM_GRID
        if (!g) return []
        const etat = window.__SIM_ETAT_AUDIT()
        const pleines = Object.keys(etat.cellules)
        const cible = pleines[Math.floor(pleines.length / 2)]
        // Une case vide de la même colonne, deux lignes plus bas.
        const m = cible ? /^([A-Z]+)(\d+)$/.exec(cible) : null
        const vide = m ? `${m[1]}${Number(m[2]) + 2}` : null
        const cells = {}
        if (cible) cells[cible] = { v: 999999 }
        if (vide && !etat.cellules[vide]) cells[vide] = { v: 999999 }
        if (!Object.keys(cells).length) return []
        g.applyCells(cells)
        return Object.keys(cells)
      })
      await page.waitForTimeout(500)
    }

    // Départ de la démonstration : soit par le bouton de l'apprenant quand il
    // est proposé, soit par le crochet d'audit — les deux passent depuis le
    // 03/08 par la même fonction `demarrerDemonstration`.
    if (PAR_BOUTON) {
      const b = page.locator(MONTRER)
      if (await b.count()) await b.first().click().catch(() => {})
    }

    const p1 = await jouerSequence(page, 70000)
    if (!p1.fini) {
      fin()
      const arret = await page.evaluate(() => {
        const c = document.querySelector('[data-demo-phase]')
        return {
          phase: c?.getAttribute('data-demo-phase') ?? null,
          geste: c?.getAttribute('data-demo-geste') ?? null,
          compteur: document.querySelector('[data-demo-compteur]')?.textContent ?? null,
          etape: window.__SIM_ETAPE ?? null,
          calque: !!c,
          revoir: !!document.querySelector('[data-testid="sim-revoir-demo"]'),
          debloquer: !!document.querySelector('[data-testid="sim-debloquer"]'),
        }
      }).catch(() => null)
      return { nom, index, etape: e0.etape, verdict: 'SANS-FIN',
               motif: `pas de marqueur de fin en ${p1.duree} ms`, arret, p1, erreurs, journal }
    }
    const s1 = await page.evaluate(() => window.__SIM_ETAT_AUDIT())

    /* ── Rejeu ─────────────────────────────────────────────────────────────
       Traces remises à zéro AVANT le clic : sans cela, une cible dessinée au
       premier passage ferait croire qu'elle l'a été au second. */
    await page.evaluate(() => { window.__SIM_DEMO_VUS = {}; window.__SIM_DEMO_PRESSES = []; window.__SIM_DEMO_BOITES = {} })
    const bouton = page.locator(FIN)
    if (!(await bouton.count())) { fin(); return { nom, index, verdict: 'ECHEC', motif: 'bouton Revoir absent' } }
    await bouton.first().click()

    /* R0 : à la SORTIE de l'annonce, quand le calque commence à dessiner et
       avant que le premier geste ne valide — c'est le seul instant où « l'état
       d'entrée est-il restauré ? » a un sens. `data-demo-phase` le donne. */
    const arrive = await attendre(
      page,
      () => {
        const p = document.querySelector('[data-demo-phase]')?.getAttribute('data-demo-phase')
        return p && p !== 'avertir' ? p : null
      },
      20000,
      25,
    )
    const r0 = await page.evaluate(() => window.__SIM_ETAT_AUDIT())
    const p2 = await jouerSequence(page, 70000)
    const s2 = await page.evaluate(() => window.__SIM_ETAT_AUDIT())

    /* ── Verdicts ─────────────────────────────────────────────────────────── */
    const plan = p1.plan || p2.plan
    const cibles = plan ? [...new Set(plan.cibles)] : []
    const manque1 = cibles.filter((c) => p1.vus[c] !== true)
    const manque2 = cibles.filter((c) => p2.vus[c] !== true)
    const nGestes = plan?.gestes ?? 0
    const auBout = (l) => (nGestes > 1 ? l.includes(`${nGestes}/${nGestes}`) : true)

    /* « Résolue » ≠ « visible » : une colonne masquée rend un rectangle de
       largeur zéro, et un repère hors du cadre du calque ne se voit pas
       davantage. On exige donc une surface réelle, dans le champ. */
    const invisibles = (p) => {
      const cadre = p.cadre
      return cibles.filter((c) => {
        const b = p.boites?.[c]
        if (!b) return false // absence déjà traitée par « non dessinée »
        if (b.width <= 1 || b.height <= 1) return true
        if (!cadre) return false
        return b.top > cadre.h - 4 || b.left > cadre.w - 4 || b.top + b.height < 4 || b.left + b.width < 4
      })
    }
    const nul1 = invisibles(p1)
    const nul2 = invisibles(p2)

    const defauts = []
    if (manque1.length) defauts.push(`P1 cibles non dessinées: ${manque1.join(', ')}`)
    if (manque2.length) defauts.push(`P2 cibles non dessinées: ${manque2.join(', ')}`)
    if (nul1.length) defauts.push(`P1 repère de surface nulle ou hors cadre: ${nul1.join(', ')}`)
    if (nul2.length) defauts.push(`P2 repère de surface nulle ou hors cadre: ${nul2.join(', ')}`)
    if (JSON.stringify(p1.presses) !== JSON.stringify(p2.presses))
      defauts.push(`pressions P1[${p1.presses.join(',')}] ≠ P2[${p2.presses.join(',')}]`)
    const pressions = plan?.presse ?? []
    const restau = ecarts(e0, r0, FAMILLES, pressions)
    if (restau.length) defauts.push(`état d'entrée NON restauré: ${restau.join(' | ')}`)
    const repro = ecarts(s1, s2, FAMILLES, pressions)
    if (repro.length) defauts.push(`état final DIFFÉRENT au rejeu: ${repro.join(' | ')}`)
    if (!p2.fini) defauts.push('le rejeu ne se termine pas')
    if (!auBout(p1.compteurs)) defauts.push(`P1 compteur ${p1.compteurs.join(' ')} au lieu de ${nGestes}/${nGestes}`)
    if (!auBout(p2.compteurs)) defauts.push(`P2 compteur ${p2.compteurs.join(' ')} au lieu de ${nGestes}/${nGestes}`)
    /* ── EFFICACITÉ : le premier passage a-t-il ATTEINT l'état déclaré ? ──
       Sans elle, deux passages qui ne font rien satisfont « restauration » et
       « reproduction » et seraient déclarés conformes. */
    const sc = scenario(nom)
    const eff = efficacite(sc.steps[index], s1, e0, p1.presses, p1.volatils)
    const rates = eff.points.filter((x) => !x.ok)
    if (rates.length)
      defauts.push(`effet NON atteint après la démonstration: ${rates.map((x) => x.quoi).join(' | ')}`)

    const etapesVues = [...new Set([...p1.etapes, ...p2.etapes, e0.etape, s1.etape, r0.etape, s2.etape])]
    if (etapesVues.filter(Boolean).length > 1)
      defauts.push(`auto-avancement: ${etapesVues.join(' → ')}`)
    if (erreurs.length) defauts.push(`erreur JS: ${erreurs[0]}`)
    if (BROUILLER && salies.length) {
      const reste = salies.filter((r) => String(s1.cellules?.[r] ?? '') === '999999')
      if (reste.length) defauts.push(`valeur absurde encore à l'écran après la démonstration: ${reste.join(', ')}`)
      const reste2 = salies.filter((r) => String(s2.cellules?.[r] ?? '') === '999999')
      if (reste2.length) defauts.push(`valeur absurde encore à l'écran après le rejeu: ${reste2.join(', ')}`)
    }

    fin()
    return {
      nom, index, etape: e0.etape, gestes: nGestes, salies, prerequisRejoues,
      cibles, presses1: p1.presses, presses2: p2.presses,
      compteurs1: p1.compteurs, compteurs2: p2.compteurs,
      phaseR0: arrive,
      indiceRestau: ecarts(e0, r0, FAMILLES_INDICE, []),
      efficacite: { juges: eff.points.length, rates: eff.points.filter((x) => !x.ok).map((x) => x.quoi), qualifications: eff.qualifications },
      ...(process.env.BANC_DETAIL ? { detailS1: { reglages: s1.reglages, graphique: s1.graphique, notes: s1.notes, panneauMep: s1.panneauMep, e0reglages: e0.reglages } } : {}),
      brut: { restau: ecarts(e0, r0, FAMILLES, [], true), repro: ecarts(s1, s2, FAMILLES, [], true) },
      verdict: defauts.length ? 'DEFAUT' : 'OK',
      defauts, erreurs, journal,
      duree: p1.duree + p2.duree,
    }
  } catch (e) {
    fin()
    return { nom, index, verdict: 'ECHEC', motif: String(e).slice(0, 200) }
  }
}

/* ── Boucle principale ───────────────────────────────────────────────────── */

;(async () => {
  /**
   * UN NAVIGATEUR QUI MEURT NE DOIT PAS EMPORTER LE RESTE DU FRONT.
   *
   * Univer laisse derrière lui de quoi saturer un onglet : après ~150 étapes le
   * contexte mourait, et tout ce qui suivait rendait « banc non prêt » — 78
   * mesures perdues, présentées comme des échecs alors qu'elles n'avaient rien
   * mesuré du tout. On recycle donc page, contexte ET navigateur, à intervalle
   * régulier et à la moindre mort ; chaque cas est rejoué une fois sur du neuf.
   * Une mesure manquante est un trou à combler, jamais un verdict.
   */
  let nav = null
  let ctx = null
  let page = null

  /**
   * MONTER SOUS CHRONOMÈTRE, ET RÉESSAYER.
   *
   * `chromium.launch()` n'a pas de délai non plus : à cinq fronts, un
   * lancement peut ne jamais rendre la main — le front `fam0` est resté figé
   * plus de trois minutes au recyclage du dixième cas, sans processus enfant ni
   * charge. Le montage est donc borné, et retenté sur du neuf. Un montage qui
   * échoue trois fois de suite arrête le front proprement plutôt que de le
   * laisser suspendu.
   */
  const monterUneFois = async () => {
    nav = await chromium.launch({ channel: 'chrome', headless: !drapeau('tete') })
    ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript(
      ([v]) => {
        // Posés AVANT tout script de la page : l'effet qui déclenche la
        // démonstration les lit dès le montage.
        window.__SIM_FORCE_DEMO = true
        window.__SIM_DEMO_VITESSE = v
      },
      [VITESSE],
    )
    page = await ctx.newPage()
    await page.goto(`http://127.0.0.1:${PORT}/atelier-banc.html?s=${cas[0].nom}&step=0`)
    await page.waitForFunction(() => window.__BANC_READY === true, { timeout: 60000 })
  }

  const monter = async () => {
    for (let essai = 1; essai <= 3; essai++) {
      const fini = await Promise.race([
        monterUneFois().then(() => true).catch(() => false),
        new Promise((r) => setTimeout(() => r(null), 90000)),
      ])
      if (fini === true && page) return
      console.error(`montage ${fini === null ? 'expiré' : 'échoué'} (essai ${essai}/3)`)
      try {
        const [p0, c0, n0] = [page, ctx, nav]
        page = ctx = nav = null
        for (const f of [() => p0?.close(), () => c0?.close(), () => n0?.close()]) {
          try { await Promise.race([Promise.resolve(f()).catch(() => null), new Promise((r) => setTimeout(r, 3000))]) } catch { /* déjà mort */ }
        }
      } catch { /* rien à démonter */ }
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error('banc impossible à monter après 3 essais')
  }

  /**
   * FERMER SOUS CHRONOMÈTRE.
   *
   * `page.close()` / `context.close()` / `browser.close()` n'ont PAS de délai :
   * quand l'onglet est déjà mort, l'attente ne rend jamais la main. Mesuré sur
   * le balayage complet — quatre fronts sur cinq figés après exactement dix
   * cas, processus Node à 0 % de charge et plus aucun Chrome enfant. Le
   * recyclage devenait la panne qu'il devait corriger. On borne donc chaque
   * fermeture, et on repart sur du neuf même si l'ancienne instance refuse de
   * mourir : un navigateur zombie coûte de la mémoire, un front figé coûte la
   * mesure.
   */
  const avecDelai = (p, ms) =>
    Promise.race([
      Promise.resolve(p).catch(() => null),
      new Promise((r) => setTimeout(r, ms)),
    ])

  const demonter = async () => {
    const [p0, c0, n0] = [page, ctx, nav]
    page = ctx = nav = null
    for (const f of [() => p0?.close(), () => c0?.close(), () => n0?.close()]) {
      try { await avecDelai(f(), 4000) } catch { /* déjà mort */ }
    }
  }

  const recycler = async () => {
    await demonter()
    await monter()
  }

  await monter()
  const empreinte = await page.evaluate(() => window.__EMPREINTE_AUDIT_REJEU)
  if (empreinte !== `OPUS5-REJEU-${PORT}`) {
    console.error(`BANC INATTENDU : empreinte « ${empreinte} »`)
    process.exit(2)
  }

  /** Un verdict qui ne mesure RIEN : il faut recommencer, pas le publier. */
  const nonMesure = (r) =>
    r.verdict === 'ECHEC' ||
    r.verdict === 'SANS-FIN' ||
    /banc non prêt|closed|crash|Target/i.test(String(r.motif || ''))

  const res = [...dejaFait]
  let n = 0
  let recyclages = 0
  /* Seuil BAS : un front ne compte que 28 à 38 cas, un recyclage tous les 40 ne
     se serait jamais déclenché — c'est ce qui a laissé 78 mesures se perdre. */
  const TOUS_LES = 10
  for (const c of cas) {
    if (n > 0 && n % TOUS_LES === 0) { await recycler().catch(() => {}); recyclages++ }
    let r = await auditerEtape(page, c.nom, c.index, c.etape)
    // Deux reprises sur navigateur neuf : au-delà, c'est le cas qui pose
    // problème, plus l'outil.
    for (let essai = 0; essai < 2 && nonMesure(r); essai++) {
      await recycler().catch(() => {})
      recyclages++
      r = await auditerEtape(page, c.nom, c.index, c.etape)
    }
    /* Et même quand la reprise a fini par mesurer, un cas qui a mal tourné
       laisse un onglet douteux : on repart du neuf pour le SUIVANT. C'est la
       contamination en chaîne qu'on refuse, pas seulement le cas lui-même. */
    if (nonMesure(r) || r.verdict === 'SANS-FIN') { await recycler().catch(() => {}); recyclages++ }
    res.push(r)
    n++
    if (r.verdict !== 'OK' && r.verdict !== 'HORS-PORTEE')
      console.error(`  ✗ ${c.nom}#${c.index} ${r.verdict} — ${(r.defauts || [r.motif]).join(' ;; ').slice(0, 300)}`)
    if (n % 10 === 0) {
      console.error(`… front ${FRONT}: ${n}/${cas.length} — ${res.filter((x) => x.verdict !== 'OK').length} à voir`)
      fs.writeFileSync(SORTIE, JSON.stringify(res, null, 1))
    }
  }
  fs.writeFileSync(SORTIE, JSON.stringify(res, null, 1))
  await demonter()
  const ko = res.filter((r) => r.verdict !== 'OK' && r.verdict !== 'HORS-PORTEE')
  const nm = res.filter(nonMesure)
  console.error(`front ${FRONT} terminé : ${res.length} étapes, ${ko.length} à voir, ${nm.length} non mesurées, ${recyclages} recyclage(s)`)
  /**
   * SORTIR POUR DE BON.
   *
   * Un navigateur récalcitrant laisse des handles ouverts : le processus restait
   * vivant après avoir écrit son JSON, sans enfant ni charge, et bloquait la
   * commande qui l'attendait. Le résultat est sur le disque, il n'y a plus rien
   * à attendre.
   */
  process.exit(0)
})()
