/**
 * LA TROISIÈME PROPRIÉTÉ : la démonstration accomplit-elle la consigne ?
 *
 * POURQUOI ELLE MANQUAIT, ET POURQUOI C'ÉTAIT GRAVE
 * « l'état d'entrée est restauré » (`R0 == E0`) et « les deux passages
 * aboutissent au même écran » (`S2 == S1`) sont satisfaits **par une
 * démonstration qui ne fait rien du tout**. Deux passages vides sont
 * parfaitement identiques. Ces deux propriétés disent que le rejeu est fidèle
 * au premier passage ; elles ne disent rien de ce que le premier passage a
 * produit.
 *
 * Ce module ajoute la mesure manquante : **`S1` atteint-il l'état que l'action
 * et le `setup` de l'étape déclarent ?** Elle est calculée depuis le SCÉNARIO,
 * pas depuis le plan — sinon le contrôle serait circulaire, il vérifierait que
 * le plan fait ce que le plan annonce.
 *
 * Quand l'effet n'est pas jugeable, on ne dit pas « conforme » : on le QUALIFIE,
 * avec sa raison. Trois qualifications seulement :
 *
 *   · `designation`  — le geste n'a pas d'état à produire (raccourci clavier,
 *                      double-clic, menu contextuel, écran de lecture) ;
 *   · `non-observable` — le moteur n'expose pas la propriété (gras, italique,
 *                      souligné, bordures, présence d'un filtre) ;
 *   · `montre-sans-agir` — choix délibéré du moteur : le geste n'est pas
 *                      idempotent, la démonstration le désigne sans l'exécuter
 *                      (`SANS_EXECUTION` : insérer/supprimer une ligne, ajouter
 *                      une feuille).
 */

/** Contrôles que la démonstration MONTRE sans les exécuter (cf. `SANS_EXECUTION`). */
const MONTRE_SANS_AGIR = new Set(['acc-inserer', 'acc-supprimer'])

/**
 * LE STYLE BRUT REND TOUT OBSERVABLE.
 *
 * `getFormat` ne rendait que cinq attributs, et le gras, l'italique, le
 * souligné, les bordures et la couleur de police étaient déclarés « hors de
 * portée du moteur ». C'était faux : Univer les stocke, seulement sous d'autres
 * noms. Sondé au banc — `setAlign("right")` écrit `{"ht":3}`, la valeur RIGHT de
 * l'énumération, quand la façade l'appelle « normal ». On lit donc le style tel
 * qu'il est stocké, et plus aucun de ces attributs n'échappe au contrôle.
 *
 *   ht 1 gauche · 2 centre · 3 droite      vt 1 haut · 2 milieu · 3 bas
 *   bl gras · it italique · ul.s souligné  tb 3 renvoi à la ligne
 *   fs taille · cl.rgb couleur · bg.rgb fond · bd bordures
 */
const STYLE = {
  hAlign: (s, v) => s.ht === { left: 1, center: 2, right: 3 }[v],
  vAlign: (s, v) => s.vt === { top: 1, middle: 2, bottom: 3 }[v],
  fontSize: (s, v) => Number(s.fs) === Number(v),
  bold: (s, v) => Boolean(s.bl) === Boolean(v),
  italic: (s, v) => Boolean(s.it) === Boolean(v),
  underline: (s, v) => Boolean(s.ul && s.ul.s) === Boolean(v),
  wrap: (s, v) => (s.tb === 3) === Boolean(v),
  background: (s) => !!(s.bg && s.bg.rgb),
  color: (s) => !!(s.cl && s.cl.rgb),
  border: (s) => !!s.bd,
  borders: (s) => !!s.bd,
}

/**
 * Contrôles dont le SEUL effet est invisible à la sonde : Univer n'expose ni le
 * gras, ni l'italique, ni le souligné, ni les bordures, ni la fusion. Exiger
 * « une famille d'état a bougé » sur eux produirait un faux défaut — c'est le
 * détecteur qui est aveugle, pas le bouton qui est mort.
 */
/**
 * Contrôles dont l'effet n'a AUCUNE trace lisible dans le moteur.
 *
 * La liste a fondu : le style brut rend le gras, l'italique, le souligné, les
 * bordures et la couleur parfaitement observables. Il ne reste que deux gestes
 * dont Univer ne publie rien — une image posée dans une cellule et une règle de
 * validation de données : `insertCellImage` et `addValidation` écrivent, rien ne
 * relit.
 */
const EFFET_INVISIBLE = new Set(['ins-image-cellule', 'don-validation', 'don-effacer-validation'])
const norm = (v) =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^=/, '')
    .toUpperCase()

/**
 * Deux écritures de la MÊME date française.
 *
 * Le scénario accepte « 16/3/26 » — la forme abrégée qu'un apprenant tape — et
 * la grille, qui stocke un numéro de série, réaffiche « 16/03/2026 ». Comparer
 * les chaînes déclarerait faux une date parfaitement saisie. On compare donc
 * jour, mois et année, l'année à deux chiffres valant celle du siècle courant :
 * c'est exactement la règle qu'applique `lireDateOuHeureFr` côté moteur.
 */
function memeDateFr(a, b) {
  const lire = (s) => {
    const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s*$/.exec(String(s ?? ''))
    if (!m) return null
    const an = Number(m[3])
    return { j: Number(m[1]), m: Number(m[2]), a: an < 100 ? 2000 + an : an }
  }
  const x = lire(a)
  const y = lire(b)
  return !!x && !!y && x.j === y.j && x.m === y.m && x.a === y.a
}

/** Deux écritures de la même HEURE : « 9:05 » et « 09:05 ». */
function memeHeureFr(a, b) {
  const lire = (s) => {
    const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(String(s ?? ''))
    return m ? `${Number(m[1])}:${m[2]}:${m[3] ?? '00'}` : null
  }
  const x = lire(a)
  const y = lire(b)
  return !!x && !!y && x === y
}

/** Une valeur lue vaut-elle la valeur déclarée ? Tolère virgule/point et casse. */
function memeValeur(lu, attendu) {
  if (lu === undefined || lu === null) return attendu === '' || attendu === undefined
  const a = String(lu).trim()
  const b = String(attendu).trim()
  if (a === b) return true
  const na = Number(a.replace(',', '.'))
  const nb = Number(b.replace(',', '.'))
  if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 1e-9
  return norm(a) === norm(b)
}

/**
 * La cellule satisfait-elle la déclaration du scénario ?
 *
 * `lu` est le CONTENU (formule si la cellule en porte une), `calcule` la valeur
 * résolue. Un scénario qui déclare `{v: 510}` parle du RÉSULTAT : comparer
 * « =SOMME(D14:D20) » à 510 déclarerait faux un total parfaitement juste — c'est
 * ce qui faisait échouer la macro relative du module 27.
 */
function celluleConforme(lu, att, calcule, affiche) {
  if (att === null || att === undefined) return true
  /**
   * TROIS LECTURES D'UNE MÊME CELLULE.
   *
   * `lu` est le CONTENU (la formule si la cellule en porte une), `calcule` la
   * valeur résolue, `affiche` le texte que l'apprenant lit. Une date tapée
   * « 07/04/2026 » est stockée en NUMÉRO DE SÉRIE avec un format : le contenu
   * vaut « 46119 », la valeur aussi, et seul l'affichage ressemble à ce que le
   * scénario accepte. Une formule `=D10+D21` satisfait `{v: 990}` par sa valeur.
   * On accepte donc l'une quelconque des trois lectures — le test reste strict,
   * il regarde simplement la cellule par les trois faces qu'elle a vraiment.
   */
  const egal = (attendu) =>
    norm(lu) === norm(attendu) ||
    (affiche !== undefined && norm(affiche) === norm(attendu)) ||
    memeValeur(lu, attendu) ||
    (calcule !== undefined && memeValeur(calcule, attendu)) ||
    (affiche !== undefined && memeValeur(affiche, attendu)) ||
    (affiche !== undefined && memeDateFr(affiche, attendu)) ||
    (affiche !== undefined && memeHeureFr(affiche, attendu))
  if (att.f !== undefined) return norm(lu) === norm(att.f)
  if (Array.isArray(att.anyOf)) return att.anyOf.some(egal)
  if (att.v !== undefined) {
    if (att.v === '') return !lu
    return egal(att.v)
  }
  return true
}

const FAMILLE_FORMAT = {
  monetaire: (m) => /€/.test(m),
  pourcentage: (m) => /%/.test(m),
  date: (m) => /[dmy]/i.test(m) && /\//.test(m),
  nombre: (m) => /0/.test(m) && !/€|%/.test(m),
}

/**
 * Assertions à vérifier sur `S1` pour une étape donnée.
 * Rend `{ points: [{quoi, ok}], qualifications: [{quoi, raison}] }`.
 */
function efficacite(step, s1, e0, presses, volatils = []) {
  const P = []
  const Q = []
  const ok = (quoi, v) => P.push({ quoi, ok: !!v })
  const qual = (quoi, raison) => Q.push({ quoi, raison })
  const a = step.action || {}
  const su = step.setup || {}
  const cel = s1.cellules || {}
  const fmt = s1.formats || {}
  const mis = s1.mises || {}

  if (step.montrer && step.montrer.length) {
    qual('écran de lecture', 'designation : la démonstration illustre, elle ne modifie pas le classeur')
    return { points: P, qualifications: Q }
  }

  switch (a.type) {
    case 'TYPE': {
      if (a.target === 'formula-bar') {
        qual('barre de formule', 'designation : la frappe est mimée, aucune écriture attendue')
        break
      }
      ok(`${a.target} = ${a.accept[0]}`, celluleConforme(cel[a.target], { anyOf: a.accept }, (s1.valeurs || {})[a.target], (s1.affichages || {})[a.target]))
      break
    }
    case 'EXPECT_STATE':
      for (const [ref, att] of Object.entries(a.cells || {}))
        ok(`${ref} conforme`, celluleConforme(cel[ref], att, (s1.valeurs || {})[ref], (s1.affichages || {})[ref]))
      break

    case 'EXPECT_FORMAT':
      for (const [ref, att] of Object.entries(a.cells || {})) {
        let brut = {}
        try { brut = JSON.parse(mis[ref] || '{}') } catch { brut = {} }
        for (const [cle, val] of Object.entries(att)) {
          if (cle === 'numberFormat') {
            const test = FAMILLE_FORMAT[val]
            ok(`${ref} format ${val}`, test ? test(fmt[ref] || '') : !!fmt[ref])
          } else if (STYLE[cle]) {
            ok(`${ref} ${cle} ${JSON.stringify(val)}`, STYLE[cle](brut, val))
          } else {
            qual(`${ref}.${cle}`, 'non-observable : attribut absent du style stocké par le moteur')
          }
        }
      }
      break

    case 'CLICK_CELL':
    case 'CLICK_CELL_MODIFIER':
      ok(`sélection sur ${a.cell}`, String(s1.selection || '').toUpperCase().includes(a.cell.toUpperCase()))
      break
    case 'DRAG_RANGE':
      ok(`sélection ${a.range}`, String(s1.selection || '').toUpperCase() === a.range.toUpperCase())
      break
    case 'GOTO_REF':
      ok(`sélection ${a.ref}`, String(s1.selection || '').toUpperCase().includes(a.ref.toUpperCase().split(':')[0]))
      break
    case 'SELECT_COLUMN':
      ok(`colonne ${a.column} sélectionnée`, new RegExp(`^${a.column}\\d+:${a.column}\\d+$`, 'i').test(String(s1.selection || '')))
      break
    case 'SELECT_ROW':
      ok(`ligne ${a.row} sélectionnée`, new RegExp(`^[A-Z]+${a.row}:[A-Z]+${a.row}$`, 'i').test(String(s1.selection || '')))
      break
    case 'SELECT_SHEET':
      ok(`feuille ${a.name} active`, (s1.feuilles || []).includes(`${a.name}*`))
      break
    case 'DEFINE_NAME':
      ok(`nom ${a.name} créé`, (s1.noms || []).some((n) => n.toUpperCase().startsWith(a.name.toUpperCase() + '=')))
      break

    case 'CLICK_CONTROL': {
      if (MONTRE_SANS_AGIR.has(a.control)) {
        qual(a.control, 'montre-sans-agir : geste non idempotent, désigné mais pas exécuté')
        break
      }
      ok(`${a.control} pressé`, (presses || []).includes(a.control))
      if (EFFET_INVISIBLE.has(a.control)) {
        qual(a.control, 'non-observable : Univer n’expose pas cet attribut (gras, italique, souligné, bordures, fusion)')
        break
      }
      /* Un bouton doit PRODUIRE quelque chose. L'effet peut être FUGACE — une
         boîte de dialogue que `rendreClasseur` referme en sortant : on accepte
         donc aussi un changement observé PENDANT la séquence, échantillonné par
         le banc. Sans cela `bf-fx`, qui ouvre « Insérer une fonction » sous les
         yeux de l'apprenant, était déclaré mort. */
      const bougeFugace = Array.isArray(volatils) && volatils.length > 1
      const bouge = bougeFugace || ['cellules', 'formats', 'mises', 'colonnes', 'noms', 'feuilles', 'volets',
        'filtreesHors', 'filtrePose', 'reglesMfc', 'poste', 'boite', 'menuFormat', 'pressePapiers',
        'plageSomme', 'graphique', 'tcd', 'reglages', 'panneauMep', 'macros', 'enregistrement', 'selection',
        /* les FUSIONS : `acc-fusionner` ne change rien d'autre. */ 'fusions',
        /* les COMMENTAIRES : `rev-commentaire` n'écrit rien d'autre, et sans ce
           champ le bouton était déclaré mort alors qu'il pose bien la note. */
        'notes']
        .some((f) => JSON.stringify(e0[f] ?? null) !== JSON.stringify(s1[f] ?? null))
      ok(`${a.control} a produit un effet`, bouge)
      break
    }

    case 'EXPECT_CHART': {
      const g = s1.graphique
      ok('graphique présent', !!g)
      if (!g) break
      const d = a.chart || {}
      if (d.type) ok(`type ${d.type}`, g.type === d.type)
      if (d.title !== undefined) ok('titre posé', norm(g.titre) === norm(d.title))
      if (d.categories) ok('catégories', norm(g.categories) === norm(d.categories))
      /* `seriesCount` compte les séries VISIBLES, pas le total : c'est la
         lecture du validateur du produit (`validate.ts`, « ne compte pas N
         série(s) visible(s) »). Une série masquée reste dans le modèle —
         m17-e03 déclare 3 séries dont une masquée et attend `seriesCount: 2`. */
      if (typeof d.seriesCount === 'number') {
        const visibles = (g.series ?? 0) - (g.seriesCachees?.length ?? 0)
        ok(`${d.seriesCount} série(s) visible(s)`, visibles === d.seriesCount)
      }
      if (d.elements)
        for (const [k, v] of Object.entries(d.elements)) ok(`élément ${k}`, !!(g.elements || {})[k] === !!v)
      if (d.legendPosition) ok(`légende ${d.legendPosition}`, g.legende === d.legendPosition)
      if (typeof d.style === 'number') ok(`style ${d.style}`, g.style === d.style)
      if (Array.isArray(d.series))
        for (const s of d.series) {
          if (s.name && s.hidden !== undefined)
            ok(`série ${s.name} ${s.hidden ? 'masquée' : 'visible'}`, (g.seriesCachees || []).includes(s.name) === !!s.hidden)
          else if (s.name && s.trendline !== undefined)
            ok(`tendance ${s.name}`, (g.seriesTendance || []).some((t) => t.startsWith(s.name + ':')) === !!s.trendline)
          else if (s.name) ok(`série ${s.name}`, (g.seriesNoms || []).includes(s.name))
        }
      if (Array.isArray(d.removeSeries))
        for (const n of d.removeSeries) ok(`série ${n} retirée`, !(g.seriesNoms || []).includes(n))
      break
    }

    case 'SELECT_CHART_ELEMENT': {
      const sel = String(s1.graphique?.selection || '')
      // Une SÉRIE n'existe pas comme élément du DOM : on la sélectionne en
      // cliquant une de ses marques, et le moteur retient `serie:N` ou `point:N:i`.
      const attendu = String(a.element || '')
      // Règle d'Excel que les leçons enseignent : le premier clic prend la
      // SÉRIE entière, le second descend au point. Le moteur retient donc
      // `serie:N` ou `point:N:i` — les deux valent sélection de la série N.
      const n = /^(?:serie|point):(\d+)/.exec(attendu)
      ok(`élément ${attendu} sélectionné`, n ? new RegExp(`^(serie|point):${n[1]}(\\b|:)`).test(sel) : sel === attendu)
      break
    }

    case 'EXPECT_PIVOT': {
      const t = s1.tcd
      ok('tableau croisé présent', !!t)
      if (!t) break
      const d = a.pivot || {}
      for (const [cle, lu] of [['rows', t.lignes], ['cols', t.colonnes], ['filters', t.filtres || []]]) {
        if (!Array.isArray(d[cle])) continue
        ok(`${cle} = ${d[cle].join(',')}`, JSON.stringify(d[cle]) === JSON.stringify(lu ?? []))
      }
      if (Array.isArray(d.values))
        ok(
          `valeurs = ${d.values.map((v) => (typeof v === 'string' ? v : `${v.name}/${v.agg ?? 'somme'}`)).join(',')}`,
          JSON.stringify(d.values.map((v) => (typeof v === 'string' ? `${v}/somme` : `${v.name}/${v.agg ?? 'somme'}`))) ===
            JSON.stringify(t.valeurs ?? []),
        )
      if (typeof d.styleId === 'number') ok(`style ${d.styleId}`, t.style === d.styleId)
      for (const [ref, att] of Object.entries(d.cells || {})) ok(`${ref} conforme`, celluleConforme(cel[ref], att, (s1.valeurs || {})[ref], (s1.affichages || {})[ref]))
      break
    }

    case 'EXPECT_PAGE_SETUP': {
      const r = s1.reglages || {}
      for (const [k, v] of Object.entries(a.pageSetup || {})) {
        if (Array.isArray(v)) {
          // Les sauts de page s'AJOUTENT : la feuille peut en porter d'autres,
          // posés plus tôt. On exige la présence, pas l'égalité stricte.
          const lu = Array.isArray(r[k]) ? r[k] : []
          ok(`mise en page ${k} ⊇ ${JSON.stringify(v)}`, v.every((x) => lu.includes(x)))
        } else if (v && typeof v === 'object') {
          // `center: {horizontal:true}` ne dit rien de `vertical` : comparer
          // l'objet entier ferait échouer un réglage parfaitement posé.
          const lu = r[k] || {}
          for (const [sk, sv] of Object.entries(v))
            ok(`mise en page ${k}.${sk} = ${JSON.stringify(sv)}`, JSON.stringify(lu[sk]) === JSON.stringify(sv))
        } else {
          /* « Vide » et « absent » sont le MÊME état pour une référence de
             mise en page : `appliquerReglages` traduit `repeatRows: ""` en
             `undefined`, et c'est bien ce que l'apprenant voit — plus aucun
             titre répété. Les comparer littéralement déclarait faux un retrait
             parfaitement exécuté (m13-e06, m13-e02, m13-l02). */
          const vide = (x) => x === '' || x === null || x === undefined
          ok(`mise en page ${k} = ${v}`,
             (vide(v) && vide(r[k])) || JSON.stringify(r[k]) === JSON.stringify(v))
        }
      }
      break
    }

    case 'EXPECT_POSTE': {
      const p = s1.poste || {}
      for (const [k, v] of Object.entries(a.poste || {})) {
        if (k === 'fichiers') ok('fichier créé', (p.fichiers || []).some((f) => v.includes(f.nom)))
        else ok(`poste ${k} = ${v}`, JSON.stringify(p[k]) === JSON.stringify(v))
      }
      break
    }

    case 'EXPECT_MACRO': {
      /**
       * Les neuf formes réelles du corpus : `macro` porte tantôt `name` seul,
       * tantôt `effet` seul, tantôt les deux, plus `minStatements`, `shortcut`,
       * `relative` et `contains`. Lire `macro.name` sans plus donnait
       * « macro undefined » sur la moitié des étapes — un défaut du contrôle,
       * pas du produit.
       */
      const m = a.macro || {}
      const macros = s1.macros || []
      if (m.name) {
        const trouvee = macros.find((x) => x.split(':')[0] === m.name)
        ok(`macro ${m.name} existe`, !!trouvee)
        if (trouvee && typeof m.minStatements === 'number')
          ok(`macro ${m.name} : ${m.minStatements} instruction(s)`, Number(trouvee.split(':')[1]) >= m.minStatements)
      } else if (typeof m.minStatements === 'number') {
        ok(`une macro d'au moins ${m.minStatements} instruction(s)`,
          macros.some((x) => Number(x.split(':')[1]) >= m.minStatements))
      }
      // L'EFFET est la preuve la plus dure : les cellules que la macro écrit.
      for (const [ref, att] of Object.entries(m.effet || {})) ok(`${ref} conforme`, celluleConforme(cel[ref], att, (s1.valeurs || {})[ref], (s1.affichages || {})[ref]))
      break
    }
    case 'RECORD_MACRO':
      if (a.expect === 'started') ok('enregistrement démarré', !!s1.enregistrement)
      else ok('enregistrement arrêté', !s1.enregistrement)
      break

    case 'SORT_RANGE': {
      /**
       * On RECONSTRUIT l'ordre attendu depuis les valeurs d'avant, puis on le
       * compare à celles d'après. Un test de monotonie seul se trompe sur les
       * ex æquo et sur les colonnes mixtes.
       *
       * ⚠️ La plage du scénario n'inclut PAS toujours la ligne d'en-tête :
       * `m19-e01` déclare `A1:D8` (en-tête compris), `m24-e01` déclare `A2:D4`
       * (données seules). Supposer l'un ou l'autre faisait échouer la moitié des
       * tris — dont un parfaitement exécuté. On accepte donc l'une OU l'autre
       * lecture, ce qui exige toujours un vrai tri.
       */
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(a.range || '')
      if (!m) { qual('tri', 'non-observable : plage illisible'); break }
      const col = a.column
      const fin = Number(m[4])
      const lire = (src, d) => {
        const out = []
        for (let r = d; r <= fin; r++) out.push(String((src || {})[`${col}${r}`] ?? ''))
        return out
      }
      const trie = (avant, apres) => {
        if (!avant.length || avant.every((v) => v === '')) return null
        const num = avant.concat(apres).every((v) => v === '' || Number.isFinite(Number(v.replace(',', '.'))))
        const cmp = (x, y) => (num
          ? Number(x.replace(',', '.')) - Number(y.replace(',', '.'))
          : x.localeCompare(y, 'fr', { numeric: true }))
        const attendu = [...avant].sort((x, y) => (a.ascending ? cmp(x, y) : cmp(y, x)))
        return JSON.stringify(attendu) === JSON.stringify(apres)
      }
      const avecEntete = trie(lire(e0.cellules, Number(m[2]) + 1), lire(cel, Number(m[2]) + 1))
      const sansEntete = trie(lire(e0.cellules, Number(m[2])), lire(cel, Number(m[2])))
      if (avecEntete === null && sansEntete === null) {
        qual('tri', 'non-observable : colonne hors du cliché')
        break
      }
      ok(`colonne ${col} triée ${a.ascending ? 'A→Z' : 'Z→A'}`, avecEntete === true || sansEntete === true)
      break
    }

    case 'FILTER_COLUMN':
      ok('bouton Filtrer pressé', (presses || []).includes('don-filtrer'))
      qual('filtre posé', 'non-observable : le moteur n’expose pas la présence d’un filtre, et les critères viennent de l’apprenant')
      break

    case 'KEY':
    case 'DOUBLE_CLICK':
    case 'CONTEXT_MENU':
      qual(a.type, 'designation : le geste n’a pas d’état observable à produire')
      break

    default:
      qual(a.type, 'designation : aucune attente d’état déclarée')
  }
  return { points: P, qualifications: Q }
}

module.exports = { efficacite }
