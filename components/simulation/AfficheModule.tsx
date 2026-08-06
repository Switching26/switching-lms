/**
 * L'affiche du module, en tête de chaque atelier.
 *
 * POURQUOI
 * L'écran d'ouverture des 246 chapitres montrait TOUS la même illustration : un
 * mini-classeur « Trimestre / Ventes / =SOMME(B2:B4) ». Juste pour le module 6,
 * qui enseigne les formules ; absurde pour les vingt-six autres — sur la prise
 * en main, elle affichait déjà un tableau rempli et une somme, alors que la
 * leçon parle d'un classeur pas encore ouvert.
 *
 * DIRECTION B, validée par Samuel le 29/07/2026 : dessin vectoriel plat, encre
 * et couleur sur ivoire, sans ombre ni perspective. L'affiche ne montre pas
 * l'écran, elle montre l'IDÉE du module — le cycle d'un geste, l'anatomie d'une
 * formule, la page cotée comme un plan. Elle enseigne déjà : trois secondes de
 * regard et l'apprenant a compris quelque chose avant d'avoir cliqué.
 *
 * UNE PAR MODULE, PAS PAR CHAPITRE : 78 affiches pour 580 chapitres. La même
 * sert à la leçon, à l'exercice et à l'évaluation — c'est ce qui permet à
 * l'apprenant de savoir où il est quand il enchaîne les trois.
 *
 * QUATRE APPLICATIONS depuis le 04/08/2026 : Excel 27 modules (vert), Word 19
 * (bleu), PowerPoint 16 (orange), Outlook 16 (bleu vif). Chaque application
 * garde sa couleur d'identité ; le vocabulaire graphique, lui, reste commun —
 * mêmes primitives, mêmes graisses, même bandeau de pied.
 *
 * Aucune image, aucune police à charger : du SVG inline, net à toute taille et
 * gratuit en poids de page.
 */

import { PALETTES, type AppSim } from "@/lib/simulation/couleurs"

const ENCRE = "#171a18"
const VERT = "#107C41"
const VERT_F = "#0b5c30"
const GRIS = "#8b877f"
const TRAIT = "#DDD8CE"
const PALE = "#E4E0D8"
const SANS = "system-ui,-apple-system,BlinkMacSystemFont,sans-serif"
const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace"

/**
 * L'application d'une affiche. Même liste que le reste du simulateur : le type
 * est un alias de `AppSim` pour ne pas maintenir deux vocabulaires.
 */
export type AppAffiche = AppSim

/**
 * La couleur d'identité de chaque application. `rgb` sert aux voiles : une
 * couleur posée à faible opacité derrière du texte doit rester la MÊME teinte
 * que le trait, sinon l'affiche se met à jurer avec elle-même.
 *
 * ⚠️ La table vivait ICI jusqu'au 07/08/2026, et le châssis du simulateur en
 * portait une COPIE figée sur le vert d'Excel. Elle a été extraite dans
 * `lib/simulation/couleurs.ts` pour qu'affiche et châssis lisent la même
 * source : deux tables auraient divergé au premier ajustement.
 */
type Palette = { accent: string; accentF: string; rgb: string }

const EXCEL_P = PALETTES.EXCEL

/** Un voile de la couleur d'accent, à l'opacité demandée. */
function voile(p: Palette, a: number): string {
  return `rgba(${p.rgb},${a})`
}

/**
 * Titre de module → application et numéro. Les titres viennent des scénarios
 * eux-mêmes (vérifié fichier par fichier), et non des tables du semeur, qui en
 * formulent plusieurs différemment.
 *
 * ⚠️ DEUX TITRES SONT AMBIGUS, et c'est pour cela que la résolution ne peut pas
 * être un simple dictionnaire :
 *  — « Prise en main » désigne le module 1 d'Excel ET celui de PowerPoint ;
 *  — « Cas pratique » désigne les modules 8 ET 16 de PowerPoint (leurs
 *    évaluations portent ce titre tronqué, alors que leurs leçons et exercices
 *    disent « Cas pratique : la réunion de lundi » / « … : le point trimestriel »).
 * Le premier cas se tranche avec le paramètre `app` ; le second ne se tranche
 * pas du tout et se replie sur l'ancien visuel — c'est un défaut de CONTENU à
 * corriger dans les deux scénarios, pas dans ce composant.
 */
const ENTREES: Array<[AppAffiche, number, string]> = [
  ["EXCEL", 1, "Prise en main"],
  ["EXCEL", 2, "Saisie des données"],
  ["EXCEL", 3, "Sélectionner une cellule, une plage de cellules"],
  ["EXCEL", 4, "Les lignes et les colonnes"],
  ["EXCEL", 5, "Les différents formats"],
  ["EXCEL", 6, "Calculs simples"],
  ["EXCEL", 7, "Les fonctions courantes"],
  ["EXCEL", 8, "Mise en forme"],
  ["EXCEL", 9, "Premières applications"],
  ["EXCEL", 10, "Fonctions avancées"],
  ["EXCEL", 11, "Mise en forme conditionnelle"],
  ["EXCEL", 12, "Saisie semi-automatique et recopie"],
  ["EXCEL", 13, "Mise en page et impression"],
  ["EXCEL", 14, "Noms de cellules"],
  ["EXCEL", 15, "Gestion des feuilles et liaisons entre feuilles"],
  ["EXCEL", 16, "Applications pratiques"],
  ["EXCEL", 17, "Présenter les données en graphiques"],
  ["EXCEL", 18, "Manipuler les séries de données"],
  ["EXCEL", 19, "Tri, filtre et sous-totaux"],
  ["EXCEL", 20, "Tableaux croisés dynamiques"],
  ["EXCEL", 21, "Validation des données et protection"],
  ["EXCEL", 22, "Consolidation des données"],
  ["EXCEL", 23, "Analyses et simulations"],
  ["EXCEL", 24, "Images et illustrations"],
  ["EXCEL", 25, "Outils divers"],
  ["EXCEL", 26, "Import, export et échanges de données"],
  ["EXCEL", 27, "Les macros"],

  ["WORD", 1, "Pour commencer"],
  ["WORD", 2, "Saisie et mise en forme des caractères"],
  ["WORD", 3, "Modification de texte"],
  ["WORD", 4, "Mise en forme des paragraphes"],
  ["WORD", 5, "Bordures et trames"],
  ["WORD", 6, "Puces et numéros"],
  ["WORD", 7, "Symboles et caractères spéciaux"],
  ["WORD", 8, "Mise en page"],
  ["WORD", 9, "En-tête, pied de page et filigrane"],
  ["WORD", 10, "Impression"],
  ["WORD", 11, "Les tabulations"],
  ["WORD", 12, "Les tableaux"],
  ["WORD", 13, "Les tableaux : faire évoluer une grille"],
  ["WORD", 14, "Insérer une image"],
  ["WORD", 15, "L'habillage des images"],
  ["WORD", 16, "Schémas, graphiques et zones de texte"],
  ["WORD", 17, "Correction d'un document"],
  ["WORD", 18, "Les styles dans Word"],
  ["WORD", 19, "Les liens hypertexte"],

  ["POWERPOINT", 1, "Prise en main"],
  ["POWERPOINT", 2, "Organiser et enchaîner"],
  ["POWERPOINT", 3, "Mettre en forme le texte"],
  ["POWERPOINT", 4, "Images et formes"],
  ["POWERPOINT", 5, "Choisir la bonne disposition"],
  ["POWERPOINT", 6, "Écrire pour être lu"],
  ["POWERPOINT", 7, "Reprendre une présentation existante"],
  ["POWERPOINT", 8, "Cas pratique : la réunion de lundi"],
  ["POWERPOINT", 9, "Dessiner et annoter"],
  ["POWERPOINT", 10, "Préparer son intervention"],
  ["POWERPOINT", 11, "Projeter ou envoyer"],
  ["POWERPOINT", 12, "Une présentation longue"],
  ["POWERPOINT", 13, "Faire apparaître au bon moment"],
  ["POWERPOINT", 14, "Des chiffres sans tableau"],
  ["POWERPOINT", 15, "Une présentation homogène"],
  ["POWERPOINT", 16, "Cas pratique : le point trimestriel"],

  ["OUTLOOK", 1, "Prise en main d'Outlook"],
  ["OUTLOOK", 2, "Répondre, transférer, tenir une conversation"],
  ["OUTLOOK", 3, "Le calendrier : rendez-vous et invitations"],
  ["OUTLOOK", 4, "Sécurité : reconnaître et traiter un message dangereux"],
  ["OUTLOOK", 5, "Retrouver l'information dans une boîte chargée"],
  ["OUTLOOK", 6, "Écrire un message qu'on lit vraiment"],
  ["OUTLOOK", 7, "Coordonner un dossier à plusieurs"],
  ["OUTLOOK", 8, "Traiter sa boîte du matin : la routine"],
  ["OUTLOOK", 9, "Les pièces jointes : ce qui part avec le message"],
  ["OUTLOOK", 10, "Le calendrier au service du chantier"],
  ["OUTLOOK", 11, "Reprendre la boîte d'un collègue"],
  ["OUTLOOK", 12, "Écrire à une administration ou un donneur d'ordre public"],
  ["OUTLOOK", 13, "Le premier contact commercial"],
  ["OUTLOOK", 14, "Traiter une réclamation par écrit"],
  ["OUTLOOK", 15, "Commander, relancer, contester chez un fournisseur"],
  ["OUTLOOK", 16, "Préparer son absence, reprendre à son retour"],
]

/** Normalise un titre : accents, casse et ponctuation ne doivent pas décider. */
function cle(titre: string): string {
  return titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Index construit une seule fois. Une clé ambiguë À L'INTÉRIEUR d'une même
 * application est marquée `null` : mieux vaut le repli que l'affiche d'un autre
 * module, qui raconterait une histoire fausse à l'apprenant.
 */
const INDEX: Record<AppAffiche, Record<string, number | null>> = {
  EXCEL: {},
  WORD: {},
  POWERPOINT: {},
  OUTLOOK: {},
}
for (const [app, n, titre] of ENTREES) {
  const k = cle(titre)
  INDEX[app][k] = k in INDEX[app] && INDEX[app][k] !== n ? null : n
}

/** L'ordre de préférence quand aucune application n'est précisée : Excel d'abord,
 * pour que les 246 chapitres déjà en production ne changent jamais d'affiche. */
const ORDRE: AppAffiche[] = ["EXCEL", "WORD", "POWERPOINT", "OUTLOOK"]

function resoudre(titre?: string | null, app?: AppAffiche | null): { app: AppAffiche; n: number } | null {
  if (!titre) return null
  const k = cle(titre)
  if (app) {
    const n = INDEX[app][k]
    return typeof n === "number" ? { app, n } : null
  }
  for (const a of ORDRE) {
    const n = INDEX[a][k]
    if (typeof n === "number") return { app: a, n }
  }
  return null
}

/**
 * Le numéro du module, ou `null` si le titre n'est pas reconnu.
 * `app` est facultatif : sans lui, un titre partagé par deux applications est
 * résolu vers Excel, ce qui préserve à l'identique les 246 chapitres publiés.
 */
export function numeroModule(titre?: string | null, app?: AppAffiche | null): number | null {
  return resoudre(titre, app)?.n ?? null
}

/* ─────────────── primitives communes ─────────────── */

function Fleche({ x, y, l = 26, couleur, p = EXCEL_P }: { x: number; y: number; l?: number; couleur?: string; p?: Palette }) {
  const c = couleur ?? p.accent
  return (
    <g stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${x} ${y}h${l}`} />
      <path d={`M${x + l - 5} ${y - 4.5}l4.5 4.5-4.5 4.5`} />
    </g>
  )
}

/** Une pointe de flèche seule, quand le trait est dessiné à part (coudes, courbes). */
function Pointe({ x, y, sens = "droite", couleur, w = 1.4 }: { x: number; y: number; sens?: "droite" | "gauche" | "bas" | "haut"; couleur: string; w?: number }) {
  const d =
    sens === "droite" ? `M${x} ${y - 4}l4.5 4-4.5 4`
      : sens === "gauche" ? `M${x} ${y - 4}l-4.5 4 4.5 4`
        : sens === "bas" ? `M${x - 4} ${y}l4 4.5 4-4.5`
          : `M${x - 4} ${y}l4-4.5 4 4.5`
  return <path d={d} stroke={couleur} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
}

function T({ x, y, children, ancre = "middle", couleur = ENCRE }: { x: number; y: number; children: React.ReactNode; ancre?: "start" | "middle" | "end"; couleur?: string }) {
  return (
    // La page de garde rend son SVG à l'échelle 1 : une taille de 8 dans le
    // viewBox fait 8 px à l'écran. Les libellés étaient à la limite du lisible
    // et leurs sous-titres carrément sous elle (audit visuel du 31/07/2026).
    <text x={x} y={y} textAnchor={ancre} fontFamily={SANS} fontSize="9.5" fontWeight="700" fill={couleur}>
      {children}
    </text>
  )
}

function S({ x, y, children, ancre = "middle" }: { x: number; y: number; children: React.ReactNode; ancre?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={ancre} fontFamily={SANS} fontSize="8.2" fill={GRIS}>
      {children}
    </text>
  )
}

/** Une cellule de tableau : le motif le plus réutilisé du jeu. */
function Case({
  x, y, w = 44, h = 16, texte, actif, aligne = "start", mono, gras, p = EXCEL_P, taille = 7.6,
}: {
  x: number; y: number; w?: number; h?: number; texte?: string
  actif?: boolean; aligne?: "start" | "middle" | "end"; mono?: boolean; gras?: boolean
  p?: Palette; taille?: number
}) {
  const tx = aligne === "end" ? x + w - 5 : aligne === "middle" ? x + w / 2 : x + 5
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={actif ? voile(p, 0.12) : "#fff"} stroke={actif ? p.accent : TRAIT} strokeWidth={actif ? 1.5 : 1} />
      {texte !== undefined && (
        <text
          x={tx} y={y + h / 2 + 3} textAnchor={aligne} fontFamily={mono ? MONO : SANS}
          fontSize={taille} fontWeight={gras ? 700 : 400} fill={actif ? p.accentF : ENCRE}
        >
          {texte}
        </text>
      )}
    </g>
  )
}

/**
 * Une ligne de texte simulée. Tout ce qui n'est pas Excel manipule des
 * DOCUMENTS et des MESSAGES : il fallait un moyen de figurer du texte sans
 * l'écrire, sinon chaque affiche se serait remplie de faux latin illisible à
 * cette taille.
 */
function Ligne({ x, y, w, h = 3.4, couleur = PALE }: { x: number; y: number; w: number; h?: number; couleur?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={couleur} />
}

/** Un bloc de lignes simulées, de largeurs irrégulières comme un vrai paragraphe. */
function Para({ x, y, largeurs, pas = 9, couleur = PALE, h = 3.4 }: { x: number; y: number; largeurs: number[]; pas?: number; couleur?: string; h?: number }) {
  return (
    <g>
      {largeurs.map((w, i) => (
        <Ligne key={i} x={x} y={y + i * pas} w={w} h={h} couleur={couleur} />
      ))}
    </g>
  )
}

/* ─────────────── les 27 scènes d'Excel ─────────────── */

function SceneExcel({ n }: { n: number }): React.ReactElement {
  switch (n) {
    /* 1 — Prise en main : le cycle complet d'une séance de travail. */
    case 1:
      return (
        <g>
          <g fill="none" stroke={ENCRE} strokeWidth="1.5" strokeLinejoin="round">
            <rect x="20" y="60" width="62" height="48" rx="3" />
            <path d="M20 72h62" />
            <rect x="128" y="60" width="62" height="48" rx="3" />
            <path d="M128 72h62M149 60v48M170 60v48M128 90h62" />
            <rect x="236" y="60" width="62" height="48" rx="3" />
            <path d="M250 60v17h34V60" />
            <rect x="256" y="87" width="22" height="21" />
          </g>
          <circle cx="27" cy="66" r="1.9" fill={ENCRE} />
          <rect x="149" y="80" width="21" height="10" fill={VERT} opacity=".18" />
          <rect x="262" y="93" width="10" height="8" fill={VERT} opacity=".24" />
          <Fleche x={92} y={84} />
          <Fleche x={200} y={84} />
          <T x={51} y={126}>Ouvrir</T>
          <T x={159} y={126}>Travailler</T>
          <T x={267} y={126}>Enregistrer</T>
          <S x={51} y={138}>menu Démarrer</S>
          <S x={159} y={138}>la grille</S>
          <S x={267} y={138}>Ctrl + S</S>
        </g>
      )

    /* 2 — Saisie : la distinction qui commande tout le reste. */
    case 2:
      return (
        <g>
          <Case x={40} y={54} w={92} h={26} texte="Lemoine" />
          <Case x={198} y={54} w={92} h={26} texte="35" aligne="end" />
          <path d="M40 92h92M198 92h92" stroke={VERT} strokeWidth="1.4" />
          <T x={86} y={108}>collé à gauche</T>
          <T x={244} y={108}>collé à droite</T>
          <S x={86} y={121}>Excel a lu du texte</S>
          <S x={244} y={121}>Excel a lu un nombre</S>
          <S x={165} y={144}>l’alignement n’est pas un choix : c’est une réponse</S>
        </g>
      )

    /* 3 — Sélectionner : les trois formes, de la plus fine à la plus large. */
    case 3: {
      const g = (ox: number, cells: Array<[number, number]>) => (
        <g>
          {[0, 1, 2].map((c) =>
            [0, 1, 2].map((r) => {
              const on = cells.some(([cc, rr]) => cc === c && rr === r)
              return (
                <rect
                  key={`${c}${r}`} x={ox + c * 20} y={48 + r * 18} width={20} height={18}
                  fill={on ? "rgba(16,124,65,.16)" : "#fff"} stroke={TRAIT} strokeWidth="1"
                />
              )
            }),
          )}
        </g>
      )
      return (
        <g>
          {g(30, [[1, 1]])}
          <rect x="50" y="66" width="20" height="18" fill="none" stroke={VERT} strokeWidth="2" />
          {g(135, [[0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]])}
          <rect x="135" y="66" width="60" height="36" fill="none" stroke={VERT} strokeWidth="2" />
          <rect x="192" y="99" width="6" height="6" fill={VERT} />
          {g(240, [[1, 0], [1, 1], [1, 2]])}
          <rect x="260" y="48" width="20" height="54" fill="none" stroke={VERT} strokeWidth="2" />
          <T x={60} y={124}>une cellule</T>
          <T x={165} y={124}>une plage</T>
          <T x={270} y={124}>une colonne</T>
          <S x={60} y={137}>un clic</S>
          <S x={165} y={137}>un glissement</S>
          <S x={270} y={137}>son en-tête</S>
        </g>
      )
    }

    /* 4 — Lignes et colonnes : ce qui se passe VRAIMENT à l'insertion. */
    case 4:
      return (
        <g>
          <g>
            {[0, 1, 2].map((c) =>
              [0, 1, 2].map((r) => (
                <rect key={`a${c}${r}`} x={26 + c * 26} y={54 + r * 20} width={26} height={20} fill="#fff" stroke={TRAIT} />
              )),
            )}
          </g>
          <Fleche x={118} y={84} l={30} />
          <g>
            {[0, 1, 2, 3].map((c) =>
              [0, 1, 2].map((r) => {
                const neuve = c === 1
                return (
                  <rect
                    key={`b${c}${r}`} x={166 + c * 26} y={54 + r * 20} width={26} height={20}
                    fill={neuve ? "rgba(16,124,65,.14)" : "#fff"}
                    stroke={neuve ? VERT : TRAIT} strokeWidth={neuve ? 1.5 : 1}
                    strokeDasharray={neuve ? "3.5 2.5" : undefined}
                  />
                )
              }),
            )}
          </g>
          <T x={65} y={128}>avant</T>
          <T x={218} y={128}>après insertion</T>
          <S x={218} y={141}>rien n’est écrasé : tout se décale</S>
        </g>
      )

    /* 5 — Formats : un seul nombre, quatre visages. */
    case 5:
      return (
        <g>
          <rect x="118" y="30" width="94" height="22" fill="rgba(16,124,65,.1)" stroke={VERT} strokeWidth="1.5" />
          <text x="165" y="45" textAnchor="middle" fontFamily={MONO} fontSize="12" fontWeight="700" fill={VERT_F}>
            1234,5
          </text>
          <S x={165} y={64}>une seule valeur en mémoire</S>
          <g stroke={TRAIT} strokeWidth="1.2" fill="none">
            <path d="M165 70v10M60 80h210M60 80v8M130 80v8M200 80v8M270 80v8" />
          </g>
          <Case x={26} y={88} w={68} h={22} texte="1 234,50" aligne="end" mono />
          <Case x={96} y={88} w={68} h={22} texte="1 234,50 €" aligne="end" mono />
          <Case x={166} y={88} w={68} h={22} texte="123 450 %" aligne="end" mono />
          <Case x={236} y={88} w={68} h={22} texte="18/05/1903" aligne="end" mono />
          <S x={60} y={126}>nombre</S>
          <S x={130} y={126}>monétaire</S>
          <S x={200} y={126}>pourcentage</S>
          <S x={270} y={126}>date</S>
          <S x={165} y={146}>le format change ce qu’on voit, jamais ce qu’on calcule</S>
        </g>
      )

    /* 6 — Calculs : l'anatomie d'une formule. */
    case 6:
      return (
        <g>
          <rect x="24" y="44" width="20" height="32" fill={VERT} opacity=".12" />
          <rect x="161" y="44" width="92" height="32" fill={VERT} opacity=".08" />
          <text x="26" y="70" fontFamily={MONO} fontSize="27" fontWeight="700" fill={VERT}>=</text>
          <text x="46" y="70" fontFamily={MONO} fontSize="27" fontWeight="700" fill={ENCRE}>SOMME</text>
          <text x="147" y="70" fontFamily={MONO} fontSize="27" fill={GRIS}>(</text>
          <text x="163" y="70" fontFamily={MONO} fontSize="27" fontWeight="700" fill={ENCRE}>B2:B4</text>
          <text x="255" y="70" fontFamily={MONO} fontSize="27" fill={GRIS}>)</text>
          <g fill="none" stroke={VERT} strokeWidth="1.3">
            <path d="M24 84v6h20v-6M34 90v7" />
            <path d="M46 84v6h99v-6M95 90v7" />
            <path d="M161 84v6h92v-6M207 90v7" />
          </g>
          <T x={34} y={110}>le signal</T>
          <T x={95} y={110}>la fonction</T>
          <T x={207} y={110}>la plage</T>
          <S x={34} y={122}>« ceci est</S>
          <S x={34} y={131}>un calcul »</S>
          <S x={95} y={122}>ce qu’on veut</S>
          <S x={95} y={131}>faire</S>
          <S x={207} y={122}>sur quelles</S>
          <S x={207} y={131}>cellules</S>
        </g>
      )

    /* 7 — Fonctions courantes : une même plage, quatre questions. */
    case 7:
      return (
        <g>
          <g>
            {[0, 1, 2, 3].map((r) => (
              <Case key={r} x={26} y={44 + r * 19} w={54} h={19} texte={["1 250", "1 480", "1 620", "1 410"][r]} aligne="end" mono />
            ))}
          </g>
          <rect x="26" y="44" width="54" height="76" fill="none" stroke={VERT} strokeWidth="2" />
          <g stroke={VERT} strokeWidth="1.2" fill="none">
            <path d="M86 82h16M102 56h10M102 74h10M102 92h10M102 110h10M102 56v54" />
          </g>
          {[
            ["SOMME", "5 760", 56],
            ["MOYENNE", "1 440", 74],
            ["MAX", "1 620", 92],
            ["MIN", "1 250", 110],
          ].map(([f, v, y]) => (
            <g key={f as string}>
              <text x={118} y={(y as number) + 3} fontFamily={MONO} fontSize="8.4" fontWeight="700" fill={ENCRE}>
                {f}
              </text>
              <text x={304} y={(y as number) + 3} textAnchor="end" fontFamily={MONO} fontSize="8.4" fill={VERT_F}>
                {v}
              </text>
              <path d={`M${186} ${(y as number) - 0.5}h${110}`} stroke={PALE} strokeWidth=".9" strokeDasharray="2 3" />
            </g>
          ))}
          <S x={165} y={142}>quatre questions, la même plage</S>
        </g>
      )

    /* 8 — Mise en forme : avant / après, sur la même ligne. */
    case 8:
      return (
        <g>
          <g>
            <Case x={26} y={46} w={122} h={18} texte="Prestation" />
            <Case x={26} y={64} w={122} h={18} texte="Formation Excel" />
            <Case x={26} y={82} w={122} h={18} texte="Formation Word" />
            <Case x={26} y={100} w={122} h={18} texte="Total" />
          </g>
          <Fleche x={158} y={82} l={24} />
          <g>
            <rect x="192" y="46" width="112" height="18" fill={VERT} />
            <text x="197" y="58" fontFamily={SANS} fontSize="7.6" fontWeight="700" fill="#fff">Prestation</text>
            <Case x={192} y={64} w={112} h={18} texte="Formation Excel" />
            <rect x="192" y="82" width="112" height="18" fill="rgba(16,124,65,.07)" stroke={TRAIT} />
            <text x="197" y="94" fontFamily={SANS} fontSize="7.6" fill={ENCRE}>Formation Word</text>
            <rect x="192" y="100" width="112" height="18" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            <text x="197" y="112" fontFamily={SANS} fontSize="7.6" fontWeight="700" fill={ENCRE}>Total</text>
          </g>
          <T x={87} y={136}>lisible</T>
          <T x={248} y={136}>hiérarchisé</T>
          <S x={165} y={150}>mêmes données — on ne change que la lecture</S>
        </g>
      )

    /* 9 — Premières applications : les briques s'assemblent. */
    case 9:
      return (
        <g>
          <g fill="none" stroke={GRIS} strokeWidth="1.2" strokeDasharray="3.5 2.5">
            <rect x="26" y="42" width="58" height="34" rx="3" />
            <rect x="26" y="86" width="58" height="34" rx="3" />
            <rect x="26" y="130" width="58" height="26" rx="3" />
          </g>
          <S x={55} y={62}>un tableau</S>
          <S x={55} y={106}>des formules</S>
          <S x={55} y={147}>de la forme</S>
          <g stroke={VERT} strokeWidth="1.4" fill="none">
            <path d="M90 59h22v34h10M90 103h32M90 143h22v-34" />
          </g>
          <Fleche x={128} y={103} l={20} />
          <g>
            <rect x="158" y="42" width="146" height="114" rx="3" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
            <rect x="158" y="42" width="146" height="17" fill={ENCRE} />
            <text x="166" y="54" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill="#fff">Budget mensuel</text>
            <g stroke={PALE} strokeWidth="1"><path d="M158 76h146M158 93h146M158 110h146M158 127h146M232 59v97" /></g>
            <g fill={PALE}>
              <rect x="166" y="64" width="42" height="4" rx="2" /><rect x="166" y="81" width="34" height="4" rx="2" />
              <rect x="166" y="98" width="46" height="4" rx="2" /><rect x="166" y="115" width="30" height="4" rx="2" />
            </g>
            <g fill="#CFC9BD">
              <rect x="266" y="64" width="30" height="4" rx="2" /><rect x="266" y="81" width="30" height="4" rx="2" />
              <rect x="266" y="98" width="30" height="4" rx="2" /><rect x="266" y="115" width="30" height="4" rx="2" />
            </g>
            <rect x="158" y="127" width="146" height="29" fill="rgba(16,124,65,.1)" />
            <text x="166" y="145" fontFamily={SANS} fontSize="7.8" fontWeight="700" fill={VERT_F}>Total</text>
            <text x="296" y="145" textAnchor="end" fontFamily={MONO} fontSize="9" fontWeight="700" fill={VERT_F}>4 350</text>
          </g>
        </g>
      )

    /* 10 — Fonctions avancées : la condition, et ses deux issues. */
    case 10:
      return (
        <g>
          <g fill="none" stroke={ENCRE} strokeWidth="1.5">
            <path d="M62 44l34 22-34 22-34-22z" />
          </g>
          <text x="62" y="69" textAnchor="middle" fontFamily={MONO} fontSize="8" fontWeight="700" fill={ENCRE}>B2&gt;1500</text>
          <g stroke={ENCRE} strokeWidth="1.3" fill="none">
            <path d="M96 66h28v-22h30" />
            <path d="M96 66h28v22h30" />
          </g>
          <path d="M149 40l5 4-5 4" stroke={ENCRE} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M149 84l5 4-5 4" stroke={ENCRE} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="158" y="34" width="66" height="20" fill="rgba(16,124,65,.14)" stroke={VERT} strokeWidth="1.4" />
          <text x="191" y="48" textAnchor="middle" fontFamily={SANS} fontSize="8" fontWeight="700" fill={VERT_F}>« Objectif »</text>
          <rect x="158" y="78" width="66" height="20" fill="#fff" stroke={TRAIT} strokeWidth="1.2" />
          <text x="191" y="92" textAnchor="middle" fontFamily={SANS} fontSize="8" fill={GRIS}>« À revoir »</text>
          <S x={137} y={38}>vrai</S>
          <S x={137} y={104}>faux</S>
          <text x="26" y="128" fontFamily={MONO} fontSize="8.6" fill={ENCRE}>=SI(B2&gt;1500 ; &quot;Objectif&quot; ; &quot;À revoir&quot;)</text>
          <S x={165} y={146}>une question fermée, deux réponses écrites d’avance</S>
        </g>
      )

    /* 11 — Mise en forme conditionnelle : la règle colore, pas la main. */
    case 11:
      return (
        <g>
          <rect x="26" y="34" width="128" height="22" fill="#fff" stroke={VERT} strokeWidth="1.4" strokeDasharray="4 3" />
          <text x="90" y="49" textAnchor="middle" fontFamily={MONO} fontSize="8.2" fill={VERT_F}>valeur &gt; 1 500</text>
          <S x={90} y={68}>la règle</S>
          <g stroke={VERT} strokeWidth="1.3" fill="none"><path d="M160 45h22" /></g>
          <path d="M177 41l5 4-5 4" stroke={VERT} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {[
            ["Janvier", "1 250", false],
            ["Février", "1 480", false],
            ["Mars", "1 620", true],
            ["Avril", "1 410", false],
            ["Mai", "1 880", true],
          ].map(([m, v, on], i) => (
            <g key={m as string}>
              <Case x={190} y={34 + i * 21} w={62} h={21} texte={m as string} />
              <Case x={252} y={34 + i * 21} w={52} h={21} texte={v as string} aligne="end" mono actif={on as boolean} gras={on as boolean} />
            </g>
          ))}
          <S x={90} y={112}>écrite une fois</S>
          <S x={90} y={124}>pour toute la plage</S>
          <S x={165} y={152}>les couleurs suivent les données, même quand elles changent</S>
        </g>
      )

    /* 12 — Recopie : la poignée, et ce qu'Excel devine. */
    case 12:
      return (
        <g>
          <Case x={92} y={34} w={68} h={20} texte="Janvier" actif />
          <rect x="155" y="49" width="7" height="7" fill={VERT} />
          <g stroke={VERT} strokeWidth="1.4" fill="none" strokeDasharray="3 2.6">
            <path d="M158 58v66" />
          </g>
          <path d="M153.5 119l4.5 5 4.5-5" stroke={VERT} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {["Février", "Mars", "Avril", "Mai"].map((m, i) => (
            <Case key={m} x={92} y={54 + i * 20} w={68} h={20} texte={m} />
          ))}
          <g fill="none" stroke={GRIS} strokeWidth="1.1" strokeDasharray="3 2.6">
            <path d="M172 44h14v90h-14" />
          </g>
          <T x={250} y={78}>la suite</T>
          <T x={250} y={90}>est devinée</T>
          <S x={250} y={108}>jours, mois, dates,</S>
          <S x={250} y={119}>numéros, formules</S>
          <S x={165} y={152}>on écrit le premier terme — la poignée fait le reste</S>
        </g>
      )

    /* 13 — Mise en page : la feuille cotée comme un plan. */
    case 13:
      return (
        <g>
          <rect x="106" y="34" width="118" height="112" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
          <g fill="none" stroke={VERT} strokeWidth="1" strokeDasharray="4 3">
            <path d="M124 34v112M206 34v112M106 50h118M106 130h118" />
          </g>
          <g stroke={ENCRE} strokeWidth=".9" fill="none">
            <path d="M106 24h18M109 21.5l-3 2.5 3 2.5M121 21.5l3 2.5-3 2.5" />
            <path d="M206 24h18M209 21.5l-3 2.5 3 2.5M221 21.5l3 2.5-3 2.5" />
            <path d="M94 34v16M91.5 37l2.5-3 2.5 3M91.5 47l2.5 3 2.5-3" />
          </g>
          <text x="115" y="18" textAnchor="middle" fontFamily={SANS} fontSize="6.8" fill={ENCRE}>1,8</text>
          <text x="215" y="18" textAnchor="middle" fontFamily={SANS} fontSize="6.8" fill={ENCRE}>1,8</text>
          <text x="86" y="46" textAnchor="middle" fontFamily={SANS} fontSize="6.8" fill={ENCRE}>1,9</text>
          <g fill={PALE}>
            <rect x="130" y="60" width="46" height="4" rx="2" /><rect x="130" y="74" width="68" height="3" rx="1.5" />
            <rect x="130" y="84" width="68" height="3" rx="1.5" /><rect x="130" y="94" width="68" height="3" rx="1.5" />
            <rect x="130" y="104" width="50" height="3" rx="1.5" />
          </g>
          <rect x="130" y="70" width="68" height="7" fill={VERT} opacity=".16" />
          <g fill="none" stroke={GRIS} strokeWidth="1.2">
            <rect x="244" y="40" width="28" height="36" /><rect x="240" y="98" width="36" height="28" />
          </g>
          <rect x="244" y="40" width="28" height="36" fill={VERT} opacity=".12" />
          <rect x="244" y="40" width="28" height="36" fill="none" stroke={VERT} strokeWidth="1.4" />
          <text x="258" y="88" textAnchor="middle" fontFamily={SANS} fontSize="6.6" fontWeight="700" fill={VERT_F}>portrait</text>
          <S x={258} y={138}>paysage</S>
        </g>
      )

    /* 14 — Noms de cellules : une adresse devient un mot. */
    case 14:
      return (
        <g>
          <Case x={40} y={42} w={62} h={22} texte="B13" aligne="middle" mono />
          <Fleche x={110} y={53} l={26} />
          <rect x="146" y="42" width="96" height="22" fill="rgba(16,124,65,.12)" stroke={VERT} strokeWidth="1.5" />
          <text x="194" y="57" textAnchor="middle" fontFamily={MONO} fontSize="9" fontWeight="700" fill={VERT_F}>TauxTVA</text>
          <S x={71} y={78}>une adresse</S>
          <S x={194} y={78}>un nom</S>
          <path d="M26 96h278" stroke={PALE} strokeWidth="1" />
          <text x="26" y="120" fontFamily={MONO} fontSize="9.6" fill={GRIS}>=D9*B13</text>
          <text x="118" y="120" fontFamily={SANS} fontSize="8" fill={GRIS}>devient</text>
          <text x="166" y="120" fontFamily={MONO} fontSize="9.6" fontWeight="700" fill={ENCRE}>=D9*TauxTVA</text>
          <S x={165} y={144}>une formule qui se lit à voix haute se relit six mois plus tard</S>
        </g>
      )

    /* 15 — Feuilles et liaisons : une cellule qui en appelle une autre, ailleurs. */
    case 15:
      return (
        <g>
          {["Janvier", "Février", "Synthèse"].map((f, i) => {
            const actif = i === 2
            return (
              <g key={f}>
                <rect x={26 + i * 100} y="46" width="92" height="70" fill="#fff" stroke={actif ? VERT : TRAIT} strokeWidth={actif ? 1.5 : 1} />
                <rect x={26 + i * 100} y="34" width="62" height="14" rx="2" fill={actif ? VERT : "#F2EFE8"} stroke={actif ? VERT : TRAIT} />
                <text x={57 + i * 100} y="44" textAnchor="middle" fontFamily={SANS} fontSize="7" fontWeight="700" fill={actif ? "#fff" : GRIS}>
                  {f}
                </text>
                <g stroke={PALE} strokeWidth=".9"><path d={`M${26 + i * 100} 70h92M${26 + i * 100} 92h92`} /></g>
              </g>
            )
          })}
          <g stroke={VERT} strokeWidth="1.4" fill="none">
            <path d="M72 122v10h86" />
            <path d="M172 122v10h-14" />
          </g>
          <path d="M153 128l5 4-5 4" stroke={VERT} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="234" y="60" width="76" height="20" fill="rgba(16,124,65,.12)" stroke={VERT} strokeWidth="1.4" />
          <text x="272" y="74" textAnchor="middle" fontFamily={MONO} fontSize="8" fontWeight="700" fill={VERT_F}>=Janvier!B5</text>
          <S x={165} y={152}>la synthèse ne recopie rien : elle pointe</S>
        </g>
      )

    /* 16 — Applications pratiques : le cas complet, de bout en bout. */
    case 16:
      return (
        <g>
          {[
            ["Saisir", 26],
            ["Calculer", 100],
            ["Mettre en forme", 174],
            ["Imprimer", 248],
          ].map(([t, x], i) => (
            <g key={t as string}>
              <circle cx={(x as number) + 28} cy="62" r="17" fill={i === 3 ? "rgba(16,124,65,.14)" : "#fff"} stroke={i === 3 ? VERT : ENCRE} strokeWidth="1.5" />
              <text x={(x as number) + 28} y="66" textAnchor="middle" fontFamily={SANS} fontSize="11" fontWeight="800" fill={i === 3 ? VERT_F : ENCRE}>
                {i + 1}
              </text>
              <T x={(x as number) + 28} y={96}>{t as string}</T>
              {i < 3 && <path d={`M${(x as number) + 50} 62h20`} stroke={TRAIT} strokeWidth="1.4" />}
            </g>
          ))}
          <path d="M26 118h278" stroke={PALE} strokeWidth="1" />
          <S x={165} y={136}>un dossier réel, du premier chiffre à la feuille imprimée</S>
          <S x={165} y={149}>rien de nouveau — tout ensemble</S>
        </g>
      )

    /* 17 — Graphiques : des nombres, une évidence. */
    case 17:
      return (
        <g>
          <path d="M26 32v100" stroke={ENCRE} strokeWidth="1.5" />
          <g fontFamily={MONO} fontSize="9.6" fill={ENCRE} textAnchor="end">
            {["1 250", "1 480", "1 620", "1 410", "1 880"].map((v, i) => (
              <text key={v} x="76" y={44 + i * 20}>{v}</text>
            ))}
          </g>
          <Fleche x={96} y={82} l={38} />
          <g>
            {[34, 44, 50, 40, 64].map((h, i) => (
              <rect key={i} x={152 + i * 28} y={132 - h} width={17} height={h} fill={i === 4 ? VERT : ENCRE} />
            ))}
          </g>
          <path d="M144 132h146" stroke={ENCRE} strokeWidth="1.5" />
          <T x={62} y={152} ancre="start">des nombres</T>
          <T x={290} y={152} ancre="end">une évidence</T>
        </g>
      )

    /* 18 — Séries : ce qu'on met en avant, ce qu'on retire. */
    case 18:
      return (
        <g>
          <g>
            {[38, 50, 44, 58].map((h, i) => (
              <g key={i}>
                <rect x={40 + i * 62} y={112 - h} width={20} height={h} fill={VERT} />
                <rect x={62 + i * 62} y={112 - h * 0.6} width={20} height={h * 0.6} fill={ENCRE} opacity=".18" />
              </g>
            ))}
          </g>
          <path d="M32 112h258" stroke={ENCRE} strokeWidth="1.4" />
          <path d="M50 74l62-8 62 6 62-14" fill="none" stroke={ENCRE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <g fill={ENCRE}>
            {[[50, 74], [112, 66], [174, 72], [236, 58]].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r="2.6" />
            ))}
          </g>
          <g>
            <rect x="32" y="128" width="10" height="10" fill={VERT} />
            <text x="48" y="137" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={ENCRE}>2026</text>
            <rect x="92" y="128" width="10" height="10" fill={ENCRE} opacity=".18" />
            <text x="108" y="137" fontFamily={SANS} fontSize="7.4" fill={GRIS}>2025</text>
            <path d="M152 133h12" stroke={ENCRE} strokeWidth="1.6" />
            <circle cx="158" cy="133" r="2.6" fill={ENCRE} />
            <text x="172" y="137" fontFamily={SANS} fontSize="7.4" fill={GRIS}>tendance</text>
          </g>
          <S x={165} y={154}>une série se montre, se masque, se compare</S>
        </g>
      )

    /* 19 — Tri, filtre, sous-totaux : l'entonnoir. */
    case 19:
      return (
        <g>
          <g>
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <Case key={r} x={26} y={38 + r * 17} w={72} h={17} />
            ))}
          </g>
          <rect x="26" y="38" width="72" height="17" fill="rgba(16,124,65,.1)" stroke={VERT} strokeWidth="1.2" />
          <path d="M84 44l7 0-3.5 5z" fill={VERT} />
          <g fill="none" stroke={ENCRE} strokeWidth="1.5" strokeLinejoin="round">
            <path d="M120 44h56l-20 24v20l-16-8V68z" />
          </g>
          <g>
            {[0, 1, 2].map((r) => (
              <Case key={r} x={210} y={54 + r * 17} w={72} h={17} />
            ))}
            <rect x="210" y="105" width="72" height="19" fill="rgba(16,124,65,.14)" stroke={VERT} strokeWidth="1.4" />
            <text x="216" y="118" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={VERT_F}>Sous-total</text>
          </g>
          <S x={62} y={148}>toutes les lignes</S>
          <S x={148} y={148}>le filtre</S>
          <S x={246} y={148}>ce qui compte</S>
        </g>
      )

    /* 20 — TCD : la liste plate devient un croisement. */
    case 20:
      return (
        <g>
          <g>
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <g key={r}>
                <Case x={22} y={36 + r * 16} w={34} h={16} />
                <Case x={56} y={36 + r * 16} w={24} h={16} />
                <Case x={80} y={36 + r * 16} w={24} h={16} />
              </g>
            ))}
          </g>
          <S x={63} y={146}>une liste plate</S>
          <Fleche x={110} y={84} l={20} />
          <g>
            <rect x="186" y="36" width="40" height="18" fill={ENCRE} />
            <rect x="226" y="36" width="40" height="18" fill={ENCRE} />
            <rect x="266" y="36" width="40" height="18" fill={ENCRE} />
            <g fill="#fff" fontFamily={SANS} fontSize="7" fontWeight="700" textAnchor="middle">
              <text x="206" y="48">T1</text><text x="246" y="48">T2</text><text x="286" y="48">T3</text>
            </g>
            {[0, 1, 2].map((r) => (
              <g key={r}>
                <rect x="146" y={54 + r * 22} width="40" height="22" fill="#F5F3EF" stroke={TRAIT} />
                <text x="152" y={68 + r * 22} fontFamily={SANS} fontSize="7" fill={ENCRE}>{["Nord", "Sud", "Est"][r]}</text>
                {[0, 1, 2].map((c) => (
                  <Case key={c} x={186 + c * 40} y={54 + r * 22} w={40} h={22} texte={["1 250", "980", "1 610", "740", "1 320", "890", "1 480", "1 070", "620"][r * 3 + c]} aligne="end" mono />
                ))}
              </g>
            ))}
          </g>
          <S x={226} y={146}>un croisement, sans une seule formule</S>
        </g>
      )

    /* 21 — Validation et protection : ce qui entre, ce qui ne bouge plus. */
    case 21:
      return (
        <g>
          <rect x="26" y="44" width="112" height="24" fill="#fff" stroke={VERT} strokeWidth="1.5" />
          <text x="34" y="60" fontFamily={SANS} fontSize="8" fill={ENCRE}>Oui</text>
          <path d="M124 54l6 6 6-6" fill="none" stroke={VERT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="26" y="68" width="112" height="20" fill="#fff" stroke={TRAIT} />
          <text x="34" y="82" fontFamily={SANS} fontSize="8" fill={GRIS}>Non</text>
          <rect x="26" y="96" width="112" height="20" fill="#FBF3F1" stroke="#C2705A" strokeWidth="1.2" strokeDasharray="3.5 2.5" />
          <text x="34" y="110" fontFamily={SANS} fontSize="8" fill="#8F3F28">Peut-être</text>
          <g stroke="#8F3F28" strokeWidth="1.4" strokeLinecap="round">
            <path d="M120 102l10 8M130 102l-10 8" />
          </g>
          <S x={82} y={132}>seules les valeurs prévues</S>
          <g fill="none" stroke={ENCRE} strokeWidth="1.6">
            <rect x="216" y="70" width="46" height="36" rx="4" />
            <path d="M226 70V58a13 13 0 0 1 26 0v12" />
          </g>
          <rect x="216" y="70" width="46" height="36" rx="4" fill={VERT} opacity=".12" />
          <circle cx="239" cy="88" r="4.4" fill={ENCRE} />
          <S x={239} y={132}>et des cellules verrouillées</S>
        </g>
      )

    /* 22 — Consolidation : trois sources, un seul résultat. */
    case 22:
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="26" y={34 + i * 38} width="76" height="30" fill="#fff" stroke={TRAIT} />
              <g stroke={PALE} strokeWidth=".9"><path d={`M26 ${44 + i * 38}h76M26 ${54 + i * 38}h76`} /></g>
              <text x="32" y={44 + i * 38 - 3} fontFamily={SANS} fontSize="6.6" fill={GRIS}>{["Agence Nord", "Agence Sud", "Agence Est"][i]}</text>
            </g>
          ))}
          <g stroke={VERT} strokeWidth="1.4" fill="none">
            <path d="M108 49h30v34h20M108 87h30M108 125h30v-34" />
          </g>
          <path d="M153 79l5 4-5 4" stroke={VERT} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="176" y="52" width="128" height="62" fill="rgba(16,124,65,.08)" stroke={VERT} strokeWidth="1.6" />
          <text x="184" y="68" fontFamily={SANS} fontSize="8" fontWeight="700" fill={VERT_F}>Consolidé</text>
          <g stroke={VERT} strokeWidth=".9" opacity=".4"><path d="M176 78h128M176 94h128" /></g>
          <text x="296" y="108" textAnchor="end" fontFamily={MONO} fontSize="9.6" fontWeight="700" fill={VERT_F}>12 480</text>
          <S x={165} y={146}>trois tableaux de même forme, une seule addition</S>
        </g>
      )

    /* 23 — Analyses et simulations : on part du résultat voulu. */
    case 23:
      return (
        <g>
          <Case x={26} y={44} w={104} h={24} texte="Prix" />
          <Case x={26} y={68} w={104} h={24} texte="Quantité" />
          <rect x="26" y="92" width="104" height="26" fill="rgba(16,124,65,.12)" stroke={VERT} strokeWidth="1.5" strokeDasharray="4 3" />
          <text x="34" y="109" fontFamily={SANS} fontSize="8" fontWeight="700" fill={VERT_F}>Marge</text>
          <text x="122" y="109" textAnchor="end" fontFamily={MONO} fontSize="8.6" fontWeight="700" fill={VERT_F}>?</text>
          <g stroke={ENCRE} strokeWidth="1.4" fill="none">
            <path d="M148 105h52v-49h-52" />
          </g>
          <path d="M153 100l-5 5 5 5" stroke={ENCRE} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="206" y="38" width="98" height="36" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
          <text x="214" y="52" fontFamily={SANS} fontSize="7.6" fill={GRIS}>Objectif</text>
          <text x="296" y="67" textAnchor="end" fontFamily={MONO} fontSize="11" fontWeight="700" fill={ENCRE}>15 000 €</text>
          <S x={258} y={84}>le résultat qu’on veut</S>
          <S x={78} y={134}>la valeur à trouver</S>
          <S x={165} y={154}>d’habitude on calcule un résultat — ici on remonte à la donnée</S>
        </g>
      )

    /* 24 — Images : l'objet flotte au-dessus de la grille, il ne l'occupe pas. */
    case 24:
      return (
        <g>
          <g>
            {[0, 1, 2, 3, 4].map((c) =>
              [0, 1, 2, 3].map((r) => (
                <rect key={`${c}${r}`} x={30 + c * 46} y={38 + r * 24} width={46} height={24} fill="#fff" stroke={PALE} />
              )),
            )}
          </g>
          <g>
            <rect x="106" y="52" width="112" height="72" fill="#F5F3EF" stroke={ENCRE} strokeWidth="1.5" />
            <path d="M106 108l28-24 22 18 18-14 24 20v16h-92z" fill={VERT} opacity=".24" />
            <circle cx="140" cy="72" r="7" fill="none" stroke={ENCRE} strokeWidth="1.4" />
            <g fill={VERT}>
              {[[106, 52], [162, 52], [218, 52], [106, 88], [218, 88], [106, 124], [162, 124], [218, 124]].map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" />
              ))}
            </g>
          </g>
          <S x={165} y={148}>une image ne vit pas dans une cellule : elle flotte au-dessus</S>
        </g>
      )

    /* 25 — Outils divers : chercher, remplacer, annoter. */
    case 25:
      return (
        <g>
          <g fill="none" stroke={ENCRE} strokeWidth="1.6">
            <circle cx="58" cy="58" r="17" />
            <path d="M70 70l13 13" strokeLinecap="round" />
          </g>
          <T x={58} y={96}>Rechercher</T>
          <g fill="none" stroke={ENCRE} strokeWidth="1.5">
            <path d="M136 50h34M164 45l6 5-6 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M170 68h-34M142 63l-6 5 6 5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <T x={153} y={96}>Remplacer</T>
          <g fill="none" stroke={ENCRE} strokeWidth="1.5" strokeLinejoin="round">
            <path d="M226 40h56v34h-34l-14 12v-12h-8z" />
          </g>
          <rect x="226" y="40" width="56" height="34" fill={VERT} opacity=".1" />
          <g stroke={VERT} strokeWidth="1.2"><path d="M234 52h40M234 62h28" /></g>
          <T x={254} y={96}>Commenter</T>
          <path d="M26 116h278" stroke={PALE} strokeWidth="1" />
          <S x={165} y={136}>les petits outils qu’on cherche le jour où le classeur devient gros</S>
        </g>
      )

    /* 26 — Import/export : le même contenu, trois enveloppes. */
    case 26:
      return (
        <g>
          {[
            [".csv", "brut, une feuille", 22, false],
            [".xlsx", "le format de travail", 122, true],
            [".pdf", "figé, pour envoyer", 222, false],
          ].map(([ext, sous, x, actif]) => (
            <g key={ext as string}>
              <rect
                x={x as number} y="44" width="86" height="58" rx="4"
                fill={actif ? "rgba(16,124,65,.1)" : "#fff"}
                stroke={actif ? VERT : ENCRE} strokeWidth={actif ? 1.8 : 1.4}
              />
              <path d={`M${(x as number) + 62} 44v14h24`} fill="none" stroke={actif ? VERT : ENCRE} strokeWidth={actif ? 1.8 : 1.4} />
              <path d={`M${(x as number) + 62} 44l24 14`} fill="none" stroke={actif ? VERT : ENCRE} strokeWidth="1" opacity=".35" />
              <text x={(x as number) + 14} y="86" fontFamily={MONO} fontSize="11" fontWeight="700" fill={actif ? VERT_F : ENCRE}>
                {ext as string}
              </text>
              <S x={(x as number) + 43} y={118}>{sous as string}</S>
            </g>
          ))}
          <g stroke={GRIS} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M112 73h6M212 73h6M113 69l4.5 4-4.5 4M213 69l4.5 4-4.5 4" />
          </g>
          <S x={165} y={148}>on n’exporte pas un classeur : on en fait une copie appauvrie</S>
        </g>
      )

    /* 27 — Macros : on enregistre des gestes, on les rejoue. */
    case 27:
      return (
        <g>
          <circle cx="52" cy="62" r="15" fill="none" stroke={ENCRE} strokeWidth="1.6" />
          <circle cx="52" cy="62" r="7" fill={VERT} />
          <T x={52} y={94}>Enregistrer</T>
          <g stroke={TRAIT} strokeWidth="1.4" fill="none"><path d="M74 62h18" /></g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={100 + i * 44} y="48" width="34" height="28" rx="3" fill="#fff" stroke={ENCRE} strokeWidth="1.3" />
              <g stroke={GRIS} strokeWidth="1.1">
                <path d={`M${107 + i * 44} 58h20M${107 + i * 44} 66h${[14, 20, 10][i]}`} />
              </g>
              {i < 2 && <path d={`M${138 + i * 44} 62h6`} stroke={TRAIT} strokeWidth="1.4" />}
            </g>
          ))}
          <T x={151} y={94}>vos gestes</T>
          <g stroke={VERT} strokeWidth="1.5" fill="none">
            <path d="M234 62h18" />
          </g>
          <path d="M247 57.5l5 4.5-5 4.5" stroke={VERT} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <g fill="none" stroke={VERT} strokeWidth="1.7">
            <path d="M266 48a15 15 0 1 1-6 22" strokeLinecap="round" />
          </g>
          <path d="M262 44l6 5-7 4" fill="none" stroke={VERT} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <T x={276} y={94}>rejoués</T>
          <S x={276} y={106}>autant de fois</S>
          <S x={276} y={116}>qu’on veut</S>
          <path d="M26 132h278" stroke={PALE} strokeWidth="1" />
          <S x={165} y={150}>ce qui prenait dix minutes chaque lundi en prend une, une fois</S>
        </g>
      )

    default:
      return <g />
  }
}

/* ─────────────── les 19 scènes de Word ─────────────── */

function SceneWord({ n }: { n: number }): React.ReactElement {
  const p = PALETTES.WORD
  const A = p.accent
  const AF = p.accentF
  const ROUGE = "#B3402A"

  switch (n) {
    /* 1 — Pour commencer : la page blanche devient un document. */
    case 1:
      return (
        <g>
          <g fill="#fff" stroke={ENCRE} strokeWidth="1.5">
            <rect x="24" y="30" width="62" height="80" />
            <rect x="134" y="30" width="62" height="80" />
            <rect x="244" y="30" width="62" height="80" />
          </g>
          <path d="M34 42v13" stroke={A} strokeWidth="1.6" />
          <Para x={144} y={44} largeurs={[42, 38, 44, 30]} pas={9} />
          <Para x={144} y={84} largeurs={[42, 34]} pas={9} />
          <rect x="254" y="41" width="30" height="5.5" rx="1" fill={A} />
          <Para x={254} y={55} largeurs={[42, 36, 44]} pas={8.5} />
          <rect x="254" y="82" width="22" height="4.5" rx="1" fill={A} opacity=".55" />
          <Para x={254} y={92} largeurs={[42, 34]} pas={8.5} />
          <Fleche x={94} y={70} p={p} />
          <Fleche x={204} y={70} p={p} />
          <T x={55} y={128}>Une page</T>
          <T x={165} y={128}>Du texte</T>
          <T x={275} y={128}>Un document</T>
          <S x={55} y={140}>le curseur attend</S>
          <S x={165} y={140}>on saisit, on corrige</S>
          <S x={275} y={140}>la structure suit</S>
        </g>
      )

    /* 2 — Caractères : un même mot, quatre habillages. */
    case 2:
      return (
        <g>
          <text x="165" y="42" textAnchor="middle" fontFamily={SANS} fontSize="9" fill={GRIS}>
            le même mot, quatre habillages
          </text>
          <g stroke={TRAIT} strokeWidth="1" fill="#fff">
            <rect x="22" y="54" width="66" height="40" />
            <rect x="96" y="54" width="66" height="40" />
            <rect x="170" y="54" width="66" height="40" />
            <rect x="244" y="54" width="66" height="40" />
          </g>
          <text x="55" y="79" textAnchor="middle" fontFamily={SANS} fontSize="11" fill={ENCRE}>Devis</text>
          <text x="129" y="81" textAnchor="middle" fontFamily={SANS} fontSize="17" fontWeight="700" fill={ENCRE}>Devis</text>
          <text x="203" y="79" textAnchor="middle" fontFamily={SANS} fontSize="11" fontWeight="700" fill={A}>Devis</text>
          <rect x="256" y="66" width="42" height="15" fill="#F3D24B" opacity=".55" />
          <text x="277" y="79" textAnchor="middle" fontFamily={SANS} fontSize="11" fill={ENCRE}>Devis</text>
          <path d="M258 74h38" stroke={ENCRE} strokeWidth="1" />
          <T x={55} y={112}>la police</T>
          <T x={129} y={112}>la taille</T>
          <T x={203} y={112}>la couleur</T>
          <T x={277} y={112}>annoter</T>
          <S x={55} y={124}>le caractère</S>
          <S x={129} y={124}>ce qu’on voit</S>
          <S x={203} y={124}>à garder rare</S>
          <S x={277} y={124}>surligner, barrer</S>
          <S x={165} y={150}>on habille le texte pour le faire lire, pas pour le décorer</S>
        </g>
      )

    /* 3 — Modification : rien n'est gravé. */
    case 3:
      return (
        <g>
          <rect x="30" y="26" width="182" height="96" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          <Para x={42} y={40} largeurs={[158, 140, 152]} pas={11} />
          <g>
            <Ligne x={42} y={73} w={46} />
            <rect x="94" y="70" width="52" height="8" fill={ROUGE} opacity=".14" />
            <path d="M94 74h52" stroke={ROUGE} strokeWidth="1.4" />
            <Ligne x={152} y={73} w={40} />
          </g>
          <rect x="94" y="53" width="52" height="8" rx="1.5" fill={A} />
          <path d="M120 62v6" stroke={A} strokeWidth="1.3" />
          <Pointe x={120} y={64} sens="bas" couleur={A} w={1.3} />
          <Para x={42} y={90} largeurs={[158, 96]} pas={11} />
          <S x={150} y={137}>l’ancien passage s’efface, le nouveau prend sa place</S>
          <g fill="none" stroke={ENCRE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M250 56a20 20 0 0 1 40 0" />
            <path d="M250 56l-5-6M250 56l7-3" />
            <path d="M290 108a20 20 0 0 0-40 0" />
            <path d="M290 108l5-6M290 108l-7-3" />
          </g>
          <T x={270} y={76}>Annuler</T>
          <T x={270} y={128}>Rétablir</T>
        </g>
      )

    /* 4 — Paragraphes : les quatre alignements, vus d'un coup. */
    case 4: {
      const W = 56
      const bloc = (x: number, mode: "g" | "c" | "d" | "j") => {
        const L = [52, 44, 56, 30]
        return (
          <g>
            {L.map((w, i) => {
              const plein = mode === "j" && i < L.length - 1
              const lw = plein ? W : w
              const lx = mode === "c" ? x + (W - lw) / 2 : mode === "d" ? x + W - lw : x
              return <Ligne key={i} x={lx} y={44 + i * 11} w={lw} h={4} couleur={i === 0 ? A : PALE} />
            })}
          </g>
        )
      }
      return (
        <g>
          {[22, 96, 170, 244].map((x, i) => (
            <g key={x}>
              <rect x={x} y="34" width="68" height="60" fill="#fff" stroke={TRAIT} />
              {bloc(x + 6, (["g", "c", "d", "j"] as const)[i])}
            </g>
          ))}
          <T x={56} y={112}>à gauche</T>
          <T x={130} y={112}>centré</T>
          <T x={204} y={112}>à droite</T>
          <T x={278} y={112}>justifié</T>
          <S x={56} y={124}>le texte courant</S>
          <S x={130} y={124}>un titre, une date</S>
          <S x={204} y={124}>un lieu, un total</S>
          <S x={278} y={124}>deux bords nets</S>
          <S x={165} y={150}>l’alignement dit au lecteur quel genre de texte il regarde</S>
        </g>
      )
    }

    /* 5 — Bordures et trames : arrêter l'œil sur un passage. */
    case 5:
      return (
        <g>
          <rect x="56" y="22" width="194" height="112" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          <Para x={70} y={34} largeurs={[166, 152, 160]} pas={10} />
          <rect x="64" y="66" width="178" height="32" fill={voile(p, 0.1)} />
          <rect x="64" y="66" width="3.5" height="32" fill={A} />
          <Para x={76} y={75} largeurs={[152, 112]} pas={11} couleur="#B9C4D6" />
          <Para x={70} y={108} largeurs={[166, 126]} pas={10} />
          <g stroke={A} strokeWidth="1.1" fill="none" strokeDasharray="3 2.4">
            <path d="M256 82h14" />
          </g>
          <text x="274" y="79" textAnchor="start" fontFamily={SANS} fontSize="8" fontWeight="700" fill={AF}>on</text>
          <text x="274" y="89" textAnchor="start" fontFamily={SANS} fontSize="8" fontWeight="700" fill={AF}>s’arrête</text>
          <S x={165} y={152}>une trame ne décore pas : elle signale ce qu’il ne faut pas manquer</S>
        </g>
      )

    /* 6 — Puces et numéros : quand l'ordre compte. */
    case 6:
      return (
        <g>
          <rect x="20" y="32" width="86" height="66" fill="#fff" stroke={TRAIT} />
          <Para x={28} y={42} largeurs={[70, 62, 70, 54, 66, 40]} pas={9} />
          <Fleche x={112} y={65} l={22} p={p} />
          <g>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <circle cx="148" cy={44 + i * 17} r="2.8" fill={A} />
                <Ligne x={156} y={42 + i * 17} w={[54, 44, 50][i]} h={4} />
              </g>
            ))}
          </g>
          <g>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <text x="228" y={47 + i * 17} fontFamily={SANS} fontSize="8.4" fontWeight="700" fill={A}>{i + 1}.</text>
                <Ligne x={242} y={42 + i * 17} w={[56, 46, 52][i]} h={4} />
              </g>
            ))}
          </g>
          <path d="M212 36v58" stroke={PALE} strokeWidth="1" />
          <T x={177} y={112}>des puces</T>
          <T x={266} y={112}>des numéros</T>
          <S x={177} y={124}>des éléments</S>
          <S x={177} y={134}>de même rang</S>
          <S x={266} y={124}>des étapes</S>
          <S x={266} y={134}>dans l’ordre</S>
          <S x={63} y={112}>un pavé</S>
          <S x={165} y={156}>la forme de la liste dit si l’ordre compte ou non</S>
        </g>
      )

    /* 7 — Symboles : ce que le clavier ne donne pas. */
    case 7: {
      const S1 = ["€", "©", "®", "™", "°", "±", "½", "×", "œ", "æ", "«", "»"]
      return (
        <g>
          <rect x="60" y="26" width="210" height="76" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          <rect x="60" y="26" width="210" height="15" fill={A} />
          <text x="68" y="37" fontFamily={SANS} fontSize="7.6" fontWeight="700" fill="#fff">Caractères spéciaux</text>
          {S1.map((s, i) => {
            const c = i % 6
            const r = Math.floor(i / 6)
            const on = s === "€"
            return (
              <g key={s}>
                <rect x={68 + c * 34} y={48 + r * 24} width="30" height="20" fill={on ? voile(p, 0.12) : "#fff"} stroke={on ? A : TRAIT} strokeWidth={on ? 1.5 : 1} />
                <text x={83 + c * 34} y={62 + r * 24} textAnchor="middle" fontFamily={SANS} fontSize="11" fill={on ? AF : ENCRE}>{s}</text>
              </g>
            )
          })}
          <g fill="none" stroke={GRIS} strokeWidth="1.2">
            <rect x="98" y="118" width="134" height="22" rx="3" />
          </g>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={i} x={104 + i * 16} y="123" width="11" height="5" rx="1" fill={PALE} />
          ))}
          <rect x="104" y="132" width="122" height="4" rx="2" fill={PALE} />
          <S x={165} y={156}>introuvables au clavier — le document professionnel en a besoin</S>
        </g>
      )
    }

    /* 8 — Mise en page : l'air autour du texte, et le sens de la feuille. */
    case 8:
      return (
        <g>
          <rect x="88" y="30" width="88" height="112" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
          <g fill="none" stroke={A} strokeWidth="1" strokeDasharray="4 3">
            <path d="M104 30v112M160 30v112M88 46h88M88 126h88" />
          </g>
          <Para x={110} y={56} largeurs={[46, 44, 46, 30]} pas={9.5} />
          <Para x={110} y={98} largeurs={[46, 36]} pas={9.5} />
          <g stroke={ENCRE} strokeWidth=".9" fill="none">
            <path d="M88 22h16M91 19.5l-3 2.5 3 2.5M101 19.5l3 2.5-3 2.5" />
            <path d="M76 30v16M73.5 33l2.5-3 2.5 3M73.5 43l2.5 3 2.5-3" />
          </g>
          <text x="96" y="16" textAnchor="middle" fontFamily={SANS} fontSize="6.8" fill={ENCRE}>2,5</text>
          <text x="68" y="42" textAnchor="middle" fontFamily={SANS} fontSize="6.8" fill={ENCRE}>2,5</text>
          <T x={132} y={158}>les marges</T>
          <g>
            <rect x="212" y="30" width="44" height="56" fill={voile(p, 0.1)} stroke={A} strokeWidth="1.6" />
            <Para x={220} y={42} largeurs={[28, 24, 28]} pas={8} couleur="#B9C4D6" />
            <rect x="206" y="104" width="56" height="38" fill="#fff" stroke={GRIS} strokeWidth="1.2" />
            <Para x={214} y={114} largeurs={[40, 34, 40]} pas={8} />
          </g>
          <T x={234} y={98} couleur={AF}>portrait</T>
          <S x={234} y={158}>ou paysage</S>
        </g>
      )

    /* 9 — En-tête, pied et filigrane : ce qui se répète sur chaque page. */
    case 9:
      return (
        <g>
          <rect x="96" y="20" width="138" height="116" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
          <rect x="96" y="20" width="138" height="19" fill={voile(p, 0.1)} />
          <path d="M96 39h138" stroke={A} strokeWidth="1.2" strokeDasharray="4 3" />
          <Ligne x={106} y={28} w={54} h={4} couleur="#9FB0CB" />
          <text x="224" y="34" textAnchor="end" fontFamily={SANS} fontSize="7" fontWeight="700" fill={AF}>page 1</text>
          <rect x="96" y="117" width="138" height="19" fill={voile(p, 0.1)} />
          <path d="M96 117h138" stroke={A} strokeWidth="1.2" strokeDasharray="4 3" />
          <Ligne x={106} y={124} w={44} h={4} couleur="#9FB0CB" />
          <Ligne x={188} y={124} w={36} h={4} couleur="#9FB0CB" />
          <Para x={108} y={50} largeurs={[114, 104, 114, 86]} pas={10} />
          <Para x={108} y={96} largeurs={[114, 70]} pas={10} />
          <text
            x="165" y="86" textAnchor="middle" fontFamily={SANS} fontSize="21" fontWeight="800"
            fill={A} opacity=".16" transform="rotate(-28 165 86)"
          >
            BROUILLON
          </text>
          <T x={52} y={36}>En-tête</T>
          <S x={52} y={48}>le même</S>
          <S x={52} y={58}>sur toutes</S>
          <T x={278} y={128}>Pied de page</T>
          <T x={272} y={84} couleur={AF}>Filigrane</T>
          <g stroke={GRIS} strokeWidth="1" fill="none">
            <path d="M78 30h14M88 128h6" />
          </g>
          <S x={165} y={154}>on l’écrit une fois, il apparaît partout</S>
        </g>
      )

    /* 10 — Impression : voir avant de sortir. */
    case 10:
      return (
        <g>
          <rect x="26" y="22" width="88" height="104" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
          <Para x={40} y={34} largeurs={[60, 52, 60, 40]} pas={9.5} />
          <Para x={40} y={78} largeurs={[60, 48, 34]} pas={9.5} />
          <g fill="none" stroke={A} strokeWidth="1.8">
            <circle cx="96" cy="104" r="14" />
            <path d="M106 114l10 10" strokeLinecap="round" />
          </g>
          <T x={70} y={148}>L’aperçu</T>
          <rect x="150" y="26" width="158" height="102" fill="#fff" stroke={TRAIT} />
          {[
            ["Copies", "3"],
            ["Pages", "2 à 5"],
            ["Recto verso", "oui"],
          ].map(([k, v], i) => (
            <g key={k}>
              <text x="162" y={46 + i * 24} fontFamily={SANS} fontSize="8.2" fill={GRIS}>{k}</text>
              <rect x="238" y={36 + i * 24} width="58" height="15" fill={i === 0 ? voile(p, 0.12) : "#fff"} stroke={i === 0 ? A : TRAIT} strokeWidth={i === 0 ? 1.4 : 1} />
              <text x="267" y={46 + i * 24} textAnchor="middle" fontFamily={SANS} fontSize="8" fontWeight="700" fill={i === 0 ? AF : ENCRE}>{v}</text>
              {i < 2 && <path d={`M158 ${54 + i * 24}h142`} stroke={PALE} strokeWidth="1" />}
            </g>
          ))}
          <g fill="none" stroke={ENCRE} strokeWidth="1.4">
            <rect x="196" y="102" width="66" height="18" rx="2" />
            <path d="M210 102v-6h38v6" />
          </g>
          <rect x="196" y="102" width="66" height="18" rx="2" fill={A} opacity=".12" />
          <T x={229} y={148}>Les réglages</T>
          <S x={165} y={160}>on règle avant, on n’imprime qu’une fois</S>
        </g>
      )

    /* 11 — Tabulations : la règle, les taquets, une colonne qui tient. */
    case 11:
      return (
        <g>
          <rect x="40" y="30" width="250" height="16" fill="#F5F3EF" stroke={TRAIT} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <path key={i} d={`M${52 + i * 25} 40v5`} stroke={GRIS} strokeWidth=".9" />
          ))}
          <g fill={A}>
            <path d="M152 32h9v9h-9z" />
            <path d="M262 41h-9v-9h9z" />
          </g>
          <path d="M156.5 46v66M257.5 46v66" stroke={A} strokeWidth="1" strokeDasharray="3 3" />
          <S x={124} y={56} ancre="end">taquet gauche</S>
          <S x={306} y={56} ancre="end">taquet droit</S>
          {[
            ["Étude de dossier", "1 250,00"],
            ["Rédaction", "480,00"],
            ["Dépôt", "95,00"],
          ].map(([d, v], i) => (
            <g key={d}>
              <text x="52" y={80 + i * 18} fontFamily={SANS} fontSize="8.4" fill={ENCRE}>{d}</text>
              <path d={`M${52 + d.length * 4.6} ${77 + i * 18}h${190 - d.length * 4.6}`} stroke={PALE} strokeWidth=".9" strokeDasharray="1.5 2.5" />
              <text x="257" y={80 + i * 18} textAnchor="end" fontFamily={MONO} fontSize="8.4" fontWeight="700" fill={AF}>{v}</text>
            </g>
          ))}
          <path d="M52 124h205" stroke={ENCRE} strokeWidth="1" />
          <text x="52" y="140" fontFamily={SANS} fontSize="8.4" fontWeight="700" fill={ENCRE}>Total</text>
          <text x="257" y="140" textAnchor="end" fontFamily={MONO} fontSize="9" fontWeight="700" fill={AF}>1 825,00</text>
          <S x={165} y={156}>les prix s’alignent sur le taquet, jamais sur des espaces</S>
        </g>
      )

    /* 12 — Les tableaux : on choisit sa grille avant de la remplir. */
    case 12:
      return (
        <g>
          <rect x="22" y="26" width="106" height="86" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          {[0, 1, 2, 3, 4].map((c) =>
            [0, 1, 2, 3].map((r) => {
              const on = c < 3 && r < 2
              return (
                <rect
                  key={`${c}${r}`} x={30 + c * 18} y={40 + r * 16} width="18" height="16"
                  fill={on ? voile(p, 0.18) : "#fff"} stroke={on ? A : TRAIT} strokeWidth={on ? 1.2 : 1}
                />
              )
            }),
          )}
          <text x="75" y="36" textAnchor="middle" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={AF}>3 × 2</text>
          <Fleche x={136} y={68} l={22} p={p} />
          <g>
            <rect x="172" y="38" width="136" height="20" fill={A} />
            {["Poste", "Qté", "Prix"].map((h, i) => (
              <text key={h} x={180 + i * 46} y="51" fontFamily={SANS} fontSize="7.6" fontWeight="700" fill="#fff">{h}</text>
            ))}
            {[0, 1].map((r) => (
              <g key={r}>
                {[0, 1, 2].map((c) => (
                  <rect key={c} x={172 + c * 45.3} y={58 + r * 20} width="45.3" height="20" fill="#fff" stroke={TRAIT} />
                ))}
                <Ligne x={180} y={65 + r * 20} w={30} h={4} />
                <Ligne x={225} y={65 + r * 20} w={12} h={4} />
                <Ligne x={270} y={65 + r * 20} w={24} h={4} />
              </g>
            ))}
          </g>
          <T x={75} y={132}>choisir</T>
          <T x={240} y={132}>puis remplir</T>
          <S x={75} y={144}>lignes et colonnes</S>
          <S x={240} y={144}>l’information tient en place</S>
        </g>
      )

    /* 13 — Faire évoluer une grille : ajouter, retirer. */
    case 13: {
      const cell = (x: number, y: number, w = 34, h = 18) => ({ x, y, w, h })
      void cell
      return (
        <g>
          <g>
            {[0, 1, 2, 3].map((c) =>
              [0, 1, 2].map((r) => (
                <rect key={`${c}${r}`} x={30 + c * 34} y={38 + r * 20} width="34" height="20" fill="#fff" stroke={TRAIT} />
              )),
            )}
            {[0, 1, 2, 3].map((c) => (
              <rect key={c} x={30 + c * 34} y="98" width="34" height="20" fill={voile(p, 0.14)} stroke={A} strokeWidth="1.4" strokeDasharray="3.5 2.5" />
            ))}
            <path d="M20 108h6M23 104l-4 4 4 4" stroke={A} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <T x={83} y={140} couleur={AF}>une ligne de plus</T>
          <path d="M180 34v96" stroke={PALE} strokeWidth="1" />
          <g>
            {[0, 1, 2, 3].map((c) =>
              [0, 1, 2, 3].map((r) => {
                const off = c === 2
                return (
                  <rect
                    key={`${c}${r}`} x={200 + c * 26} y={38 + r * 20} width="26" height="20"
                    fill={off ? "#F6EFEC" : "#fff"} stroke={off ? ROUGE : TRAIT} strokeWidth={off ? 1.3 : 1}
                  />
                )
              }),
            )}
            <g stroke={ROUGE} strokeWidth="1.6" strokeLinecap="round">
              <path d="M247 44l12 12M259 44l-12 12" />
            </g>
            <path d="M252 104v14" stroke={ROUGE} strokeWidth="1.2" strokeDasharray="3 2.5" />
          </g>
          <T x={252} y={140} couleur={ROUGE}>une colonne en trop</T>
          <S x={165} y={156}>une grille se corrige — on n’en refait pas une autre</S>
        </g>
      )
    }

    /* 14 — Insérer une image : elle prend sa place dans le texte. */
    case 14:
      return (
        <g>
          <rect x="86" y="20" width="158" height="118" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
          <Para x={100} y={30} largeurs={[130, 118, 130]} pas={10} />
          <g>
            <rect x="112" y="64" width="106" height="46" fill="#F1EFEA" stroke={ENCRE} strokeWidth="1.4" />
            <path d="M112 100l24-20 18 14 16-11 28 17v10h-86z" fill={A} opacity=".28" />
            <circle cx="140" cy="77" r="6" fill="none" stroke={ENCRE} strokeWidth="1.3" />
            <g fill={A}>
              {[[112, 64], [165, 64], [218, 64], [112, 87], [218, 87], [112, 110], [165, 110], [218, 110]].map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" />
              ))}
            </g>
          </g>
          <Para x={100} y={118} largeurs={[130, 92]} pas={10} />
          <g stroke={A} strokeWidth="1.1" fill="none" strokeDasharray="3 2.4">
            <path d="M250 87h12" />
          </g>
          <S x={266} y={84} ancre="start">le texte</S>
          <S x={266} y={94} ancre="start">s’écarte</S>
          <S x={165} y={154}>l’image entre dans le fil du document, elle ne flotte pas dessus</S>
        </g>
      )

    /* 15 — Habillage : le texte contourne l'image. */
    case 15:
      return (
        <g>
          <rect x="46" y="20" width="214" height="120" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
          <Para x={58} y={32} largeurs={[190, 178]} pas={11} />
          <g>
            <rect x="162" y="56" width="86" height="54" fill="#F1EFEA" stroke={ENCRE} strokeWidth="1.4" />
            <path d="M162 100l20-16 16 12 14-9 36 22v11h-86z" fill={A} opacity=".28" />
            <circle cx="186" cy="70" r="5.5" fill="none" stroke={ENCRE} strokeWidth="1.3" />
          </g>
          <g>
            {[0, 1, 2, 3, 4].map((i) => (
              <Ligne key={i} x={58} y={57 + i * 11} w={96} h={4} />
            ))}
          </g>
          <Para x={58} y={114} largeurs={[190, 166, 122]} pas={9.5} />
          <g stroke={A} strokeWidth="1.2" fill="none">
            <path d="M156 52v58" strokeDasharray="3.5 2.5" />
          </g>
          <path d="M264 82h10" stroke={A} strokeWidth="1.1" fill="none" />
          <S x={268} y={70} ancre="start">le texte</S>
          <S x={268} y={98} ancre="start">contourne</S>
          <S x={165} y={154}>l’habillage décide si l’image coupe la page ou s’y intègre</S>
        </g>
      )

    /* 16 — Le bon objet pour la bonne information. */
    case 16:
      return (
        <g>
          <g>
            <rect x="22" y="34" width="88" height="66" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect x={32 + i * 24} y={i === 1 ? 58 : 48} width="20" height="16" fill={voile(p, 0.14)} stroke={A} strokeWidth="1.2" />
              </g>
            ))}
            <g stroke={ENCRE} strokeWidth="1.1" fill="none">
              <path d="M52 56h4M76 66h4" />
            </g>
            <Ligne x={32} y={82} w={68} h={4} />
          </g>
          <T x={66} y={116}>un schéma</T>
          <S x={66} y={128}>une relation</S>
          <g>
            <rect x="122" y="34" width="88" height="66" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            {[24, 34, 18, 40].map((h, i) => (
              <rect key={i} x={136 + i * 17} y={86 - h} width="11" height={h} fill={i === 3 ? A : ENCRE} opacity={i === 3 ? 1 : 0.2} />
            ))}
            <path d="M130 86h72" stroke={ENCRE} strokeWidth="1.2" />
          </g>
          <T x={166} y={116}>un graphique</T>
          <S x={166} y={128}>une proportion</S>
          <g>
            <rect x="222" y="34" width="88" height="66" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            <rect x="234" y="46" width="64" height="42" fill={voile(p, 0.08)} stroke={A} strokeWidth="1.4" />
            <Para x={242} y={56} largeurs={[48, 40, 44]} pas={9} couleur="#B9C4D6" />
          </g>
          <T x={266} y={116}>une zone de texte</T>
          <S x={266} y={128}>un à-côté</S>
          <S x={165} y={152}>trois objets, trois intentions — on ne les échange pas</S>
        </g>
      )

    /* 17 — Correction : la machine signale, elle ne décide pas. */
    case 17:
      return (
        <g>
          <rect x="26" y="24" width="180" height="110" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          <Para x={38} y={38} largeurs={[156, 140]} pas={11} />
          <g>
            <text x="38" y="76" fontFamily={SANS} fontSize="9" fill={ENCRE}>Nous vous adressont</text>
            <path
              d="M108 80q3-3 6 0t6 0 6 0 6 0 6 0 6 0 6 0"
              fill="none" stroke={ROUGE} strokeWidth="1.3"
            />
          </g>
          <Para x={38} y={90} largeurs={[156, 118, 92]} pas={11} />
          <g>
            <rect x="112" y="86" width="94" height="44" fill="#fff" stroke={ENCRE} strokeWidth="1.3" />
            <rect x="112" y="86" width="94" height="15" fill={voile(p, 0.12)} />
            <text x="120" y="97" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={AF}>Suggestions</text>
            <text x="120" y="112" fontFamily={SANS} fontSize="8" fontWeight="700" fill={ENCRE}>adressons</text>
            <text x="120" y="124" fontFamily={SANS} fontSize="8" fill={GRIS}>adressant</text>
          </g>
          <g>
            <rect x="222" y="34" width="86" height="72" fill="#fff" stroke={TRAIT} />
            <text x="265" y="50" textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight="700" fill={ENCRE}>important</text>
            <path d="M232 58h66" stroke={PALE} strokeWidth="1" />
            {["essentiel", "majeur", "décisif"].map((m, i) => (
              <text key={m} x="265" y={72 + i * 12} textAnchor="middle" fontFamily={SANS} fontSize="8" fill={i === 0 ? AF : GRIS} fontWeight={i === 0 ? 700 : 400}>{m}</text>
            ))}
          </g>
          <T x={265} y={124}>Synonymes</T>
          <S x={165} y={146}>le correcteur voit la faute de forme</S>
          <S x={165} y={157}>— pas le contresens</S>
        </g>
      )

    /* 18 — Les styles : une hiérarchie, pas une décoration. */
    case 18:
      return (
        <g>
          <rect x="24" y="24" width="196" height="122" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
          <g>
            <rect x="36" y="34" width="84" height="8" rx="1" fill={A} />
            <Para x={36} y={50} largeurs={[172, 150]} pas={10} />
            <rect x="46" y="74" width="64" height="6.5" rx="1" fill={A} opacity=".7" />
            <Para x={46} y={88} largeurs={[162, 128]} pas={10} />
            <rect x="56" y="110" width="48" height="5.5" rx="1" fill={A} opacity=".45" />
            <Para x={56} y={122} largeurs={[152, 96]} pas={10} />
          </g>
          <g stroke={A} strokeWidth="1" fill="none" strokeDasharray="3 2.5">
            <path d="M30 38v88M30 38h4M30 78h14M30 114h24M30 126h4" />
          </g>
          <rect x="234" y="30" width="76" height="110" fill="#F5F3EF" stroke={TRAIT} />
          <text x="242" y="43" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={GRIS}>Styles</text>
          {[
            ["Titre 1", 9.4, true],
            ["Titre 2", 8.6, false],
            ["Titre 3", 8, false],
            ["Normal", 7.6, false],
          ].map(([t, s, on], i) => (
            <g key={t as string}>
              <rect x="240" y={52 + i * 20} width="64" height="16" fill={on ? voile(p, 0.14) : "#fff"} stroke={on ? A : TRAIT} strokeWidth={on ? 1.4 : 1} />
              <text x="248" y={64 + i * 20} fontFamily={SANS} fontSize={s as number} fontWeight={on ? 700 : 400} fill={on ? AF : ENCRE}>{t as string}</text>
            </g>
          ))}
          <S x={165} y={158}>on nomme le rôle du texte — la mise en forme suit toute seule</S>
        </g>
      )

    /* 19 — Liens hypertexte : un passage qui mène ailleurs. */
    case 19:
      return (
        <g>
          <rect x="26" y="30" width="168" height="104" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          <Para x={38} y={44} largeurs={[144, 128]} pas={11} />
          <g>
            <text x="38" y="82" fontFamily={SANS} fontSize="8.6" fill={A} fontWeight="700">conditions générales</text>
            <path d="M38 85h104" stroke={A} strokeWidth="1.1" />
          </g>
          <Para x={38} y={96} largeurs={[144, 112, 78]} pas={11} />
          <g fill="none" stroke={ENCRE} strokeWidth="1.3" strokeLinejoin="round">
            <path d="M146 88v12l4-3 3.5 7 3.5-2-3.5-7 5-1z" />
          </g>
          <g stroke={A} strokeWidth="1.4" fill="none">
            <path d="M204 82h34" />
          </g>
          <Pointe x={238} y={82} couleur={A} />
          <g>
            <rect x="246" y="46" width="62" height="72" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            <rect x="246" y="46" width="62" height="13" fill={A} opacity=".16" />
            <Para x={254} y={68} largeurs={[46, 38, 46, 30]} pas={9} />
          </g>
          <S x={277} y={132}>la cible</S>
          <S x={110} y={148}>le passage reste du texte</S>
          <S x={165} y={158}>il porte en plus une adresse — le lecteur n’a plus à chercher</S>
        </g>
      )

    default:
      return <g />
  }
}

/* ─────────────── les 16 scènes de PowerPoint ─────────────── */

function ScenePpt({ n }: { n: number }): React.ReactElement {
  const p = PALETTES.POWERPOINT
  const A = p.accent
  const AF = p.accentF

  /** Une diapositive : le motif que PowerPoint répète partout, en 16:9. */
  const Diapo = ({
    x, y, w = 80, actif, titre, lignes, vide,
  }: { x: number; y: number; w?: number; actif?: boolean; titre?: boolean; lignes?: number[]; vide?: boolean }) => {
    const h = (w * 9) / 16
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill="#fff" stroke={actif ? A : TRAIT} strokeWidth={actif ? 1.6 : 1} />
        {titre && <rect x={x + w * 0.1} y={y + h * 0.16} width={w * 0.62} height={h * 0.11} rx="1" fill={actif ? A : "#C9C4BA"} />}
        {(lignes ?? []).map((l, i) => (
          <Ligne key={i} x={x + w * 0.1} y={y + h * 0.42 + i * (h * 0.15)} w={w * 0.8 * l} h={h * 0.07} />
        ))}
        {vide && <path d={`M${x + w * 0.35} ${y + h / 2}h${w * 0.3}`} stroke={PALE} strokeWidth="1.4" />}
      </g>
    )
  }

  switch (n) {
    /* 1 — Prise en main : le fil des diapositives, et celle qu'on travaille. */
    case 1:
      return (
        <g>
          <rect x="22" y="26" width="52" height="112" fill="#F5F3EF" stroke={TRAIT} />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <text x="30" y={44 + i * 27} textAnchor="middle" fontFamily={SANS} fontSize="6.6" fill={GRIS}>{i + 1}</text>
              <Diapo x={36} y={32 + i * 27} w={32} actif={i === 1} titre lignes={i === 1 ? [0.9] : []} />
            </g>
          ))}
          <Diapo x={100} y={34} w={124} actif titre lignes={[0.95, 0.75, 0.85]} />
          <g fill="none" stroke={A} strokeWidth="1.3" strokeDasharray="3 2.4">
            <path d="M74 46h22" />
          </g>
          <S x={162} y={112}>la diapositive en cours</S>
          <g>
            <rect x="244" y="52" width="58" height="34" rx="3" fill={voile(p, 0.12)} stroke={A} strokeWidth="1.5" />
            <path d="M266 62l14 7-14 7z" fill={A} />
          </g>
          <T x={273} y={102} couleur={AF}>Diaporama</T>
          <S x={48} y={150}>le fil</S>
          <S x={273} y={114}>plein écran</S>
          <S x={192} y={152}>on écrit dans la diapositive, on se déplace dans le fil</S>
        </g>
      )

    /* 2 — Organiser : l'ordre se change, l'enchaînement se règle. */
    case 2:
      return (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <Diapo x={24 + i * 74} y={38} w={62} titre lignes={[0.8]} actif={i === 2} />
              <text x={55 + i * 74} y="30" textAnchor="middle" fontFamily={SANS} fontSize="7" fontWeight="700" fill={i === 2 ? AF : GRIS}>
                {[1, 2, 3, 4][i]}
              </text>
            </g>
          ))}
          {[0, 1, 2].map((i) => (
            <g key={i} stroke={A} strokeWidth="1.2" fill="none">
              <path d={`M${88 + i * 74} 55h8`} strokeDasharray="2.5 2" />
              <path d={`M${94 + i * 74} 51.5l3.5 3.5-3.5 3.5`} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
          <g fill="none" stroke={AF} strokeWidth="1.5">
            <path d="M180 84v14h-84v-14" strokeDasharray="4 3" />
          </g>
          <Pointe x={96} y={86} sens="haut" couleur={AF} />
          <S x={138} y={112}>on déplace une diapositive dans le fil</S>
          <g>
            {[0, 1, 2].map((i) => (
              <rect key={i} x={112 + i * 40} y={124} width="30" height="10" rx="2" fill={i === 1 ? voile(p, 0.16) : "#fff"} stroke={i === 1 ? A : TRAIT} />
            ))}
          </g>
          <S x={165} y={148}>la même transition partout : l’œil ne doit pas être surpris</S>
        </g>
      )

    /* 3 — Mettre en forme : une règle, tenue partout. */
    case 3:
      return (
        <g>
          <Diapo x={24} y={30} w={126} actif titre />
          <g>
            <rect x="36" y="66" width="52" height="12" fill={voile(p, 0.18)} />
            <text x="40" y="75.5" fontFamily={SANS} fontSize="8" fontWeight="700" fill={AF}>l’essentiel</text>
            <text x="92" y="75.5" fontFamily={SANS} fontSize="8" fill={ENCRE}>, puis le reste</text>
          </g>
          <S x={104} y={114}>on sélectionne, puis on met en forme</S>
          <g>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <Diapo x={206} y={28 + i * 38} w={82} titre lignes={[0.85, 0.6]} />
                <path d={`M${292} ${51 + i * 38}h8`} stroke={A} strokeWidth="1.2" />
              </g>
            ))}
            <path d="M300 51v76" stroke={A} strokeWidth="1.2" />
          </g>
          <S x={240} y={20}>trois diapositives, un traitement</S>
          <S x={104} y={130}>gras pour ce qui compte, et rien d’autre</S>
          
        </g>
      )

    /* 4 — Images et formes : poser, mettre à l'échelle, désigner. */
    case 4:
      return (
        <g>
          <Diapo x={22} y={34} w={132} actif />
          <g>
            <rect x="34" y="46" width="70" height="46" fill="#F1EFEA" stroke={ENCRE} strokeWidth="1.3" />
            <path d="M34 84l16-14 12 10 10-7 22 13v6H34z" fill={A} opacity=".3" />
            <circle cx="52" cy="58" r="5" fill="none" stroke={ENCRE} strokeWidth="1.2" />
            <g fill={A}>
              {[[34, 46], [69, 46], [104, 46], [34, 69], [104, 69], [34, 92], [69, 92], [104, 92]].map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x - 2.6} y={y - 2.6} width="5.2" height="5.2" />
              ))}
            </g>
            <path d="M104 92l14 10" stroke={A} strokeWidth="1.3" />
            <Pointe x={118} y={102} couleur={A} />
          </g>
          <S x={88} y={122}>on la place, on la met à l’échelle</S>
          <path d="M170 40v82" stroke={PALE} strokeWidth="1" />
          <Diapo x={188} y={34} w={120} actif />
          <g>
            <Ligne x={198} y={48} w={64} h={4.5} />
            <Ligne x={198} y={60} w={48} h={4.5} />
            <ellipse cx="252" cy="80" rx="34" ry="15" fill="none" stroke={A} strokeWidth="1.8" />
            <path d="M206 96l34-10" stroke={A} strokeWidth="1.8" strokeLinecap="round" />
            <Pointe x={240} y={86} couleur={A} w={1.8} />
          </g>
          <S x={248} y={122}>les formes désignent</S>
          <S x={165} y={150}>une image montre, une forme dit où regarder</S>
        </g>
      )

    /* 5 — Six dispositions : le contenu décide, pas l'habitude. */
    case 5: {
      const D = [
        { t: "Titre", c: 0 }, { t: "Titre + contenu", c: 1 }, { t: "Deux contenus", c: 2 },
        { t: "Comparaison", c: 3 }, { t: "Titre seul", c: 4 }, { t: "Vide", c: 5 },
      ]
      return (
        <g>
          {D.map((d, i) => {
            const x = 24 + (i % 3) * 98
            const y = 30 + Math.floor(i / 3) * 60
            const on = i === 2
            return (
              <g key={d.t}>
                <rect x={x} y={y} width="84" height="47" fill="#fff" stroke={on ? A : TRAIT} strokeWidth={on ? 1.6 : 1} />
                {d.c === 0 && <><rect x={x + 14} y={y + 18} width="56" height="6" rx="1" fill={on ? A : "#C9C4BA"} /><Ligne x={x + 24} y={y + 29} w={36} /></>}
                {d.c === 1 && <><rect x={x + 8} y={y + 7} width="46" height="5" rx="1" fill="#C9C4BA" /><Para x={x + 8} y={y + 20} largeurs={[66, 54, 60]} pas={8} h={3} /></>}
                {d.c === 2 && <>
                  <rect x={x + 8} y={y + 7} width="46" height="5" rx="1" fill={A} />
                  <rect x={x + 8} y={y + 18} width="32" height="22" fill={voile(p, 0.12)} stroke={A} strokeWidth="1" />
                  <rect x={x + 44} y={y + 18} width="32" height="22" fill={voile(p, 0.12)} stroke={A} strokeWidth="1" />
                </>}
                {d.c === 3 && <>
                  <rect x={x + 8} y={y + 7} width="46" height="5" rx="1" fill="#C9C4BA" />
                  <rect x={x + 8} y={y + 17} width="32" height="5" rx="1" fill="#C9C4BA" />
                  <rect x={x + 44} y={y + 17} width="32" height="5" rx="1" fill="#C9C4BA" />
                  <Para x={x + 8} y={y + 27} largeurs={[30, 24]} pas={7} h={3} />
                  <Para x={x + 44} y={y + 27} largeurs={[30, 26]} pas={7} h={3} />
                </>}
                {d.c === 4 && <rect x={x + 8} y={y + 20} width="52" height="6" rx="1" fill="#C9C4BA" />}
                {d.c === 5 && <path d={`M${x + 30} ${y + 23}h24`} stroke={PALE} strokeWidth="1.4" />}
                <text x={x + 42} y={y + 57} textAnchor="middle" fontFamily={SANS} fontSize="7.4" fontWeight={on ? 700 : 400} fill={on ? AF : GRIS}>
                  {d.t}
                </text>
              </g>
            )
          })}
          <S x={165} y={158}>on choisit la disposition d’après ce qu’on a à dire</S>
        </g>
      )
    }

    /* 6 — Écrire pour être lu : du pavé à la liste. */
    case 6:
      return (
        <g>
          <Diapo x={22} y={34} w={124} />
          <rect x="32" y="42" width="66" height="5" rx="1" fill="#C9C4BA" />
          <Para x={32} y={56} largeurs={[104, 96, 104, 88, 104, 62]} pas={7.5} h={3.2} />
          <T x={84} y={116} couleur={GRIS}>un pavé</T>
          <S x={84} y={128}>personne ne le lit</S>
          <Fleche x={154} y={68} l={22} p={p} />
          <Diapo x={186} y={34} w={124} actif />
          <rect x="196" y="42" width="84" height="5.5" rx="1" fill={A} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx="200" cy={62 + i * 14} r="2.4" fill={A} />
              <Ligne x={208} y={60 + i * 14} w={[86, 68, 78][i]} h={4} />
            </g>
          ))}
          <T x={248} y={116} couleur={AF}>une idée</T>
          <S x={248} y={128}>par ligne, par diapositive</S>
          <S x={165} y={152}>le titre porte le message — les lignes ne font que l’appuyer</S>
        </g>
      )

    /* 7 — Reprendre : on tire une version, on ne repart pas de zéro. */
    case 7:
      return (
        <g>
          <g>
            {[0, 1, 2].map((i) => (
              <Diapo key={i} x={32} y={30 + i * 37} w={64} titre lignes={[0.8]} />
            ))}
            <S x={64} y={152}>la version d’origine</S>
          </g>
          <g stroke={A} strokeWidth="1.4" fill="none">
            <path d="M108 84h24" />
          </g>
          <Pointe x={132} y={84} couleur={A} />
          <g>
            {[0, 1, 2].map((i) => {
              const retire = i === 1
              return (
                <g key={i}>
                  <Diapo x={150} y={30 + i * 37} w={64} titre={!retire} lignes={retire ? [] : [0.8]} actif={i === 0} />
                  {retire && (
                    <g stroke="#B3402A" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M172 76l20 16M192 76l-20 16" />
                    </g>
                  )}
                </g>
              )
            })}
            <S x={182} y={152}>la version adaptée</S>
          </g>
          <text x="256" y="54" fontFamily={SANS} fontSize="8.6" fontWeight="700" fill={AF}>autre public</text>
          <S x={256} y={74} ancre="start">on retire</S>
          <S x={256} y={86} ancre="start">ce qui ne le</S>
          <S x={256} y={98} ancre="start">concerne pas</S>
        </g>
      )

    /* 8 — Cas pratique : le plan d'abord, le contenu ensuite. */
    case 8:
      return (
        <g>
          {[
            ["Le plan", 0], ["Le contenu", 1], ["Le contrôle", 2],
          ].map(([t, i]) => {
            const x = 24 + (i as number) * 100
            return (
              <g key={t as string}>
                <circle cx={x + 11} cy="34" r="11" fill={(i as number) === 2 ? voile(p, 0.16) : "#fff"} stroke={(i as number) === 2 ? A : ENCRE} strokeWidth="1.5" />
                <text x={x + 11} y="38" textAnchor="middle" fontFamily={SANS} fontSize="10" fontWeight="800" fill={(i as number) === 2 ? AF : ENCRE}>
                  {(i as number) + 1}
                </text>
                <T x={x + 28} y={38} ancre="start">{t as string}</T>
              </g>
            )
          })}
          <g>
            <rect x="24" y="56" width="86" height="92" fill="#fff" stroke={TRAIT} />
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <rect x="32" y={64 + i * 18} width="10" height="10" fill="none" stroke={GRIS} strokeWidth="1" />
                <Ligne x={48} y={67 + i * 18} w={[52, 44, 50, 38][i]} h={4} />
              </g>
            ))}
          </g>
          <g>
            <rect x="124" y="56" width="86" height="92" fill="#fff" stroke={TRAIT} />
            {[0, 1, 2].map((i) => (
              <Diapo key={i} x={144} y={62 + i * 28} w={46} titre lignes={[0.8]} />
            ))}
          </g>
          <g>
            <rect x="224" y="56" width="86" height="92" fill="#fff" stroke={A} strokeWidth="1.5" />
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <path d={`M234 ${69 + i * 18}l3.5 4 6.5-8`} fill="none" stroke={A} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <Ligne x={250} y={67 + i * 18} w={[50, 42, 48, 36][i]} h={4} />
              </g>
            ))}
          </g>
          <S x={165} y={158}>on ne remplit rien tant que le plan n’est pas posé</S>
        </g>
      )

    /* 9 — Dessiner et annoter : désigner sans surcharger. */
    case 9:
      return (
        <g>
          <Diapo x={26} y={30} w={140} actif />
          <g>
            <rect x="38" y="42" width="116" height="52" fill="#F1EFEA" stroke={TRAIT} />
            <path d="M38 86l24-18 18 14 14-10 60 20v6H38z" fill={ENCRE} opacity=".14" />
            <rect x="52" y="52" width="34" height="22" fill="none" stroke={A} strokeWidth="1.8" />
            <path d="M120 92l-24-14" stroke={A} strokeWidth="1.8" strokeLinecap="round" />
            <Pointe x={98} y={79} sens="gauche" couleur={A} w={1.8} />
            <rect x="112" y="90" width="44" height="14" fill="#fff" stroke={A} strokeWidth="1.2" />
            <Ligne x={117} y={95} w={34} h={4} couleur="#E2B4A6" />
          </g>
          <S x={96} y={128}>un encadré, une flèche, un mot</S>
          <path d="M186 36v92" stroke={PALE} strokeWidth="1" />
          <g>
            {[0, 1, 2].map((i) =>
              [0, 1].map((j) => {
                const k = i + j * 3
                return (
                  <g key={k}>
                    {k === 0 && <rect x={204} y={40 + j * 40} width="26" height="18" fill="none" stroke={ENCRE} strokeWidth="1.4" />}
                    {k === 1 && <ellipse cx={257} cy={49} rx="15" ry="9" fill="none" stroke={ENCRE} strokeWidth="1.4" />}
                    {k === 2 && <path d="M284 58l8-18 8 18z" fill="none" stroke={ENCRE} strokeWidth="1.4" strokeLinejoin="round" />}
                    {k === 3 && <path d="M204 89h22M220 84l6 5-6 5" fill="none" stroke={ENCRE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
                    {k === 4 && <path d="M244 80h26v14h-8l-5 6v-6h-13z" fill="none" stroke={ENCRE} strokeWidth="1.4" strokeLinejoin="round" />}
                    {k === 5 && <path d="M284 80l16 14M300 80l-16 14" stroke={ENCRE} strokeWidth="1.4" strokeLinecap="round" />}
                  </g>
                )
              }),
            )}
          </g>
          <S x={252} y={128}>six formes, six usages</S>
          <S x={165} y={152}>une annotation de plus, c’est une information de moins</S>
        </g>
      )

    /* 10 — Préparer : ce que le public voit, ce que vous seul lisez. */
    case 10:
      return (
        <g>
          <Diapo x={30} y={26} w={150} actif titre lignes={[0.9, 0.7]} />
          <path d="M30 114h150" stroke={A} strokeWidth="1.3" strokeDasharray="4 3" />
          <rect x="30" y="116" width="150" height="30" fill="#F5F3EF" stroke={TRAIT} />
          <text x="38" y="127" fontFamily={SANS} fontSize="7" fontWeight="700" fill={AF}>Notes</text>
          <Para x={38} y={132} largeurs={[132, 108]} pas={8} h={3.2} />
          <S x={105} y={18}>ce que le public voit</S>
          <g fill="none" stroke={ENCRE} strokeWidth="1.5">
            <circle cx="244" cy="44" r="11" />
            <path d="M226 84a18 18 0 0 1 36 0" />
          </g>
          <rect x="216" y="106" width="56" height="28" rx="3" fill={voile(p, 0.12)} stroke={A} strokeWidth="1.3" />
          <Para x={224} y={114} largeurs={[40, 30]} pas={8} h={3.2} couleur="#E2B4A6" />
          <S x={244} y={146}>vous seul les lisez</S>
          <g stroke={A} strokeWidth="1.2" fill="none" strokeDasharray="3 2.4">
            <path d="M190 130h20" />
          </g>
          <S x={165} y={160}>ce qui est projeté en haut, ce que vous gardez en bas</S>
        </g>
      )

    /* 11 — Projeter ou envoyer : deux usages, deux versions. */
    case 11:
      return (
        <g>
          <g>
            <rect x="26" y="34" width="112" height="66" fill="#fff" stroke={ENCRE} strokeWidth="1.5" />
            <rect x="36" y="44" width="70" height="8" rx="1" fill={A} />
            <Ligne x={36} y={62} w={90} h={5} />
            <Ligne x={36} y={76} w={70} h={5} />
            <path d="M74 100v10M56 114h36" stroke={ENCRE} strokeWidth="1.5" />
          </g>
          <T x={82} y={132} couleur={AF}>Projeté</T>
          <S x={82} y={144}>gros, court, lisible de loin</S>
          <path d="M164 40v96" stroke={PALE} strokeWidth="1" />
          <g>
            <rect x="192" y="34" width="112" height="66" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            <rect x="200" y="42" width="52" height="5" rx="1" fill="#C9C4BA" />
            <Para x={200} y={54} largeurs={[94, 84, 94, 70]} pas={8} h={3.2} />
            <path d="M192 100h112v14h-112z" fill="#F5F3EF" stroke={TRAIT} />
            <Ligne x={200} y={105} w={70} h={3.4} couleur="#D8D2C8" />
          </g>
          <T x={248} y={132} couleur={ENCRE}>Envoyé</T>
          <S x={248} y={144}>il doit se lire sans vous</S>
          <S x={165} y={156}>le même fond, deux mises en forme — jamais le même fichier</S>
        </g>
      )

    /* 12 — Une présentation longue : des sections, un ordre du jour, des annexes. */
    case 12:
      return (
        <g>
          <g>
            <rect x="24" y="28" width="92" height="70" fill="#fff" stroke={A} strokeWidth="1.5" />
            <rect x="34" y="38" width="52" height="6" rx="1" fill={A} />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <text x="34" y={60 + i * 13} fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={AF}>{i + 1}.</text>
                <Ligne x={46} y={56 + i * 13} w={[58, 48, 54][i]} h={4} />
              </g>
            ))}
          </g>
          <T x={70} y={114}>L’ordre du jour</T>
          <g>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect x={144} y={26 + i * 34} width="52" height="26" fill={voile(p, 0.14)} stroke={A} strokeWidth="1.3" />
                <text x={170} y={42 + i * 34} textAnchor="middle" fontFamily={SANS} fontSize="7.6" fontWeight="700" fill={AF}>
                  {["Partie 1", "Partie 2", "Partie 3"][i]}
                </text>
                <Diapo x={206} y={26 + i * 34} w={46} titre lignes={[0.8]} />
                <Diapo x={258} y={26 + i * 34} w={46} titre lignes={[0.8]} />
              </g>
            ))}
          </g>
          <S x={222} y={140}>chaque partie s’ouvre par sa section</S>
          <g>
            <rect x="24" y="122" width="92" height="22" fill="#F5F3EF" stroke={TRAIT} strokeDasharray="4 3" />
            <text x="70" y="136" textAnchor="middle" fontFamily={SANS} fontSize="7.6" fill={GRIS}>Annexes</text>
          </g>
          <S x={165} y={158}>une présentation longue se lit comme un sommaire</S>
        </g>
      )

    /* 13 — Faire apparaître au bon moment. */
    case 13:
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Diapo x={24 + i * 100} y={34} w={88} actif={i === 2} />
              <rect x={34 + i * 100} y="42" width="52" height="5" rx="1" fill="#C9C4BA" />
              {[0, 1, 2].map((j) => {
                const vu = j <= i
                return (
                  <g key={j}>
                    <circle cx={38 + i * 100} cy={62 + j * 13} r="2.4" fill={vu ? A : "#E8E3DA"} />
                    <Ligne x={46 + i * 100} y={60 + j * 13} w={[58, 48, 54][j]} h={4} couleur={vu ? "#E2B4A6" : "#EFECE6"} />
                  </g>
                )
              })}
            </g>
          ))}
          {[0, 1].map((i) => (
            <g key={i}>
              <path d={`M${118 + i * 100} 68h10`} stroke={A} strokeWidth="1.3" />
              <Pointe x={128 + i * 100} y={68} couleur={A} w={1.3} />
              <text x={123 + i * 100} y="60" textAnchor="middle" fontFamily={SANS} fontSize="6.6" fill={GRIS}>clic</text>
            </g>
          ))}
          <S x={68} y={112}>un point</S>
          <S x={168} y={112}>deux points</S>
          <S x={268} y={112}>tout est dit</S>
          <S x={165} y={140}>on retient l’information jusqu’au moment où on en parle</S>
          <S x={165} y={154}>— l’animation sert le discours, ou elle ne sert à rien</S>
        </g>
      )

    /* 14 — Des chiffres sans tableau : un seul, énorme. */
    case 14:
      return (
        <g>
          <g>
            <rect x="24" y="36" width="104" height="76" fill="#fff" stroke={TRAIT} />
            {[0, 1, 2, 3].map((r) =>
              [0, 1, 2].map((c) => (
                <rect key={`${r}${c}`} x={32 + c * 29} y={44 + r * 16} width="29" height="16" fill="#fff" stroke={PALE} />
              )),
            )}
            {[0, 1, 2, 3].map((r) =>
              [0, 1, 2].map((c) => (
                <Ligne key={`l${r}${c}`} x={36 + c * 29} y={50 + r * 16} w={20} h={3} />
              )),
            )}
          </g>
          <S x={76} y={128}>un tableau : douze chiffres</S>
          <S x={76} y={140}>et aucun message</S>
          <Fleche x={140} y={72} l={22} p={p} />
          <g>
            <rect x="176" y="30" width="132" height="88" fill="#fff" stroke={A} strokeWidth="1.6" />
            <text x="242" y="76" textAnchor="middle" fontFamily={SANS} fontSize="30" fontWeight="800" fill={AF}>+18 %</text>
            <text x="242" y="96" textAnchor="middle" fontFamily={SANS} fontSize="8.4" fill={ENCRE}>de chantiers livrés à l’heure</text>
            <Ligne x={196} y={40} w={44} h={4.5} couleur="#E2B4A6" />
          </g>
          <S x={242} y={134}>un chiffre, une phrase</S>
          <S x={165} y={156}>le tableau reste en annexe — la diapositive porte la conclusion</S>
        </g>
      )

    /* 15 — Homogène : le même gabarit d'un bout à l'autre. */
    case 15:
      return (
        <g>
          <g>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect x={26} y={30 + i * 34} width="104" height="28" fill="#fff" stroke={TRAIT} />
                <rect x={34 + i * 14} y={36 + i * 34} width={[46, 62, 38][i]} height={[6, 4.5, 7.5][i]} rx="1" fill="#C9C4BA" />
                <Ligne x={34} y={50 + i * 34} w={[70, 58, 82][i]} h={3.4} />
              </g>
            ))}
          </g>
          <S x={78} y={144}>trois titres, trois formats</S>
          <g stroke={A} strokeWidth="1.4" fill="none"><path d="M144 78h20" /></g>
          <Pointe x={164} y={78} couleur={A} />
          <g>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect x={180} y={30 + i * 34} width="104" height="28" fill="#fff" stroke={A} strokeWidth="1.3" />
                <rect x={188} y={36 + i * 34} width="52" height="6" rx="1" fill={A} />
                <Ligne x={188} y={50 + i * 34} w={[74, 62, 80][i]} h={3.4} />
              </g>
            ))}
            <g stroke={A} strokeWidth="1" strokeDasharray="3 2.5" fill="none">
              <path d="M188 26v106M240 26v106" />
            </g>
          </g>
          <S x={232} y={144}>un seul gabarit, tenu</S>
          <S x={165} y={160}>ce qui se répète doit se répéter exactement</S>
        </g>
      )

    /* 16 — Cas pratique : d'une commande à un livrable contrôlé. */
    case 16:
      return (
        <g>
          <g>
            <rect x="22" y="30" width="84" height="58" rx="3" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            <path d="M22 34l42 26 42-26" fill="none" stroke={ENCRE} strokeWidth="1.2" />
            <Ligne x={32} y={70} w={64} h={4} />
            <Ligne x={32} y={78} w={44} h={4} />
          </g>
          <T x={64} y={106}>La commande</T>
          <S x={64} y={118}>« le point du trimestre,</S>
          <S x={64} y={129}>lundi, dix minutes »</S>
          <g stroke={A} strokeWidth="1.4" fill="none"><path d="M114 59h18" /></g>
          <Pointe x={132} y={59} couleur={A} />
          <g>
            {[0, 1, 2, 3].map((i) => (
              <Diapo key={i} x={142} y={24 + i * 26} w={66} titre lignes={[0.8]} actif={i === 0} />
            ))}
          </g>
          <T x={175} y={148}>La trame</T>
          <g stroke={A} strokeWidth="1.4" fill="none"><path d="M218 84h18" /></g>
          <Pointe x={236} y={84} couleur={A} />
          <g>
            <rect x="246" y="52" width="62" height="62" fill={voile(p, 0.1)} stroke={A} strokeWidth="1.5" />
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <path d={`M254 ${68 + i * 13}l3.5 4 6.5-8`} fill="none" stroke={A} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <Ligne x={270} y={66 + i * 13} w={[30, 24, 28, 20][i]} h={3.4} couleur="#E2B4A6" />
              </g>
            ))}
          </g>
          <T x={277} y={132}>Le contrôle</T>
          <S x={165} y={158}>la demande fixe la durée, la trame, et ce qu’on vérifie à la fin</S>
        </g>
      )

    default:
      return <g />
  }
}

/* ─────────────── les 16 scènes d'Outlook ─────────────── */

function SceneOutlook({ n }: { n: number }): React.ReactElement {
  const p = PALETTES.OUTLOOK
  const A = p.accent
  const AF = p.accentF
  const ROUGE = "#B3402A"

  /** Une ligne de la liste des messages : le motif de base d'une boîte. */
  const Msg = ({
    x, y, w = 96, h = 20, lu, actif, alerte,
  }: { x: number; y: number; w?: number; h?: number; lu?: boolean; actif?: boolean; alerte?: boolean }) => {
    const c = alerte ? ROUGE : A
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={actif ? voile(p, 0.1) : "#fff"} stroke={actif || alerte ? c : TRAIT} strokeWidth={actif || alerte ? 1.3 : 1} />
        {!lu && <rect x={x} y={y} width="3" height={h} fill={c} />}
        <Ligne x={x + 9} y={y + 5} w={w * 0.42} h={3.6} couleur={lu ? "#CFCAC1" : "#9DBBDA"} />
        <Ligne x={x + 9} y={y + 12} w={w * 0.68} h={3.2} />
      </g>
    )
  }

  /** L'enveloppe d'un message en cours de rédaction : À, objet, corps. */
  const Champ = ({ x, y, w, label, valeur, actif }: { x: number; y: number; w: number; label: string; valeur?: number; actif?: boolean }) => (
    <g>
      <text x={x} y={y + 5} fontFamily={SANS} fontSize="7" fontWeight="700" fill={actif ? AF : GRIS}>{label}</text>
      <rect x={x + 22} y={y - 4} width={w - 22} height="12" fill={actif ? voile(p, 0.1) : "#fff"} stroke={actif ? A : TRAIT} strokeWidth={actif ? 1.2 : 1} />
      {valeur !== undefined && <Ligne x={x + 27} y={y - 0.5} w={valeur} h={3.4} couleur={actif ? "#9DBBDA" : PALE} />}
    </g>
  )

  switch (n) {
    /* 1 — Prise en main : une boîte à gauche, un message qu'on écrit à droite. */
    case 1:
      return (
        <g>
          <rect x="22" y="26" width="112" height="112" fill="#F5F3EF" stroke={TRAIT} />
          <text x="30" y="38" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={AF}>Réception</text>
          {[0, 1, 2, 3, 4].map((i) => (
            <Msg key={i} x={30} y={44 + i * 18} w={96} h={16} lu={i > 1} actif={i === 0} />
          ))}
          <S x={78} y={152}>ce qui arrive</S>
          <g>
            <rect x="156" y="26" width="152" height="112" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            <rect x="156" y="26" width="152" height="14" fill={A} />
            <text x="164" y="36" fontFamily={SANS} fontSize="7.2" fontWeight="700" fill="#fff">Nouveau message</text>
            <Champ x={164} y={54} w={136} label="À" valeur={52} actif />
            <Champ x={164} y={70} w={136} label="Cc" valeur={34} />
            <Champ x={164} y={86} w={136} label="Objet" valeur={78} />
            <Para x={166} y={104} largeurs={[128, 112, 128]} pas={8} h={3.2} />
            <rect x="164" y="126" width="42" height="10" rx="2" fill={A} />
            <text x="185" y="133.5" textAnchor="middle" fontFamily={SANS} fontSize="6.6" fontWeight="700" fill="#fff">Envoyer</text>
          </g>
          <S x={232} y={152}>ce qu’on écrit</S>
        </g>
      )

    /* 2 — Répondre, répondre à tous, transférer : trois gestes, trois portées. */
    case 2:
      return (
        <g>
          {[
            ["Répondre", "à l’expéditeur seul", 1],
            ["Répondre à tous", "à tout le monde", 4],
            ["Transférer", "à quelqu’un d’autre", 1],
          ].map(([t, s2, nb], i) => {
            const x = 22 + i * 98
            const on = i === 1
            return (
              <g key={t as string}>
                <rect x={x} y="30" width="86" height="62" fill={on ? voile(p, 0.1) : "#fff"} stroke={on ? A : TRAIT} strokeWidth={on ? 1.5 : 1} />
                <g fill="none" stroke={on ? A : ENCRE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  {i < 2
                    ? <path d={`M${x + 34} ${52}l-10 8 10 8M${x + 24} ${60}h20a12 12 0 0 1 12 12`} />
                    : <path d={`M${x + 42} ${52}l10 8-10 8M${x + 52} ${60}h-20a12 12 0 0 0-12 12`} />}
                </g>
                <g>
                  {Array.from({ length: nb as number }).map((_, k) => (
                    <circle key={k} cx={x + 22 + k * 14} cy="82" r="3.4" fill={on ? A : "#C9C4BA"} />
                  ))}
                </g>
                <T x={x + 43} y={110}>{t as string}</T>
                <S x={x + 43} y={122}>{s2 as string}</S>
              </g>
            )
          })}
          <S x={165} y={150}>on choisit d’abord qui doit lire — le texte vient après</S>
        </g>
      )

    /* 3 — Le calendrier : poser un rendez-vous, répondre à une invitation. */
    case 3:
      return (
        <g>
          <rect x="22" y="28" width="164" height="108" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          <rect x="22" y="28" width="164" height="14" fill={voile(p, 0.12)} />
          {["L", "M", "M", "J", "V"].map((j, i) => (
            <text key={i} x={44 + i * 32} y="38" textAnchor="middle" fontFamily={SANS} fontSize="7" fontWeight="700" fill={AF}>{j}</text>
          ))}
          <g stroke={PALE} strokeWidth="1">
            {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${28 + i * 32} 42v94`} />)}
            {[0, 1, 2, 3].map((i) => <path key={i} d={`M22 ${60 + i * 20}h164`} />)}
          </g>
          <rect x="62" y="62" width="28" height="26" fill={voile(p, 0.24)} stroke={A} strokeWidth="1.3" />
          <rect x="126" y="82" width="28" height="18" fill={voile(p, 0.24)} stroke={A} strokeWidth="1.3" />
          <S x={104} y={146}>l’agenda de la semaine</S>
          <g>
            <rect x="206" y="34" width="102" height="76" fill="#fff" stroke={A} strokeWidth="1.4" />
            <text x="214" y="48" fontFamily={SANS} fontSize="7.6" fontWeight="700" fill={AF}>Invitation</text>
            <Ligne x={214} y={56} w={72} h={3.6} />
            <Ligne x={214} y={64} w={54} h={3.6} />
            <g>
              <rect x="214" y="76" width="40" height="14" rx="2" fill={A} />
              <text x="234" y="86" textAnchor="middle" fontFamily={SANS} fontSize="6.8" fontWeight="700" fill="#fff">Accepter</text>
              <rect x="260" y="76" width="40" height="14" rx="2" fill="#fff" stroke={TRAIT} />
              <text x="280" y="86" textAnchor="middle" fontFamily={SANS} fontSize="6.8" fill={GRIS}>Refuser</text>
            </g>
          </g>
          <S x={257} y={126}>accepter, c’est</S>
          <S x={257} y={137}>bloquer le créneau</S>
          <S x={165} y={156}>répondre à une invitation, c’est engager son temps</S>
        </g>
      )

    /* 4 — Sécurité : le nom peut mentir, l'adresse beaucoup moins. */
    case 4:
      return (
        <g>
          <rect x="42" y="30" width="246" height="52" fill="#fff" stroke={ROUGE} strokeWidth="1.5" />
          <text x="54" y="48" fontFamily={SANS} fontSize="9.4" fontWeight="700" fill={ENCRE}>Service Comptabilité</text>
          <path d="M54 56h114" stroke={PALE} strokeWidth="1" />
          <text x="54" y="70" fontFamily={MONO} fontSize="8.6" fill={ROUGE}>compta@fac-tures-secure.net</text>
          <g stroke={ROUGE} strokeWidth="1.5" fill="none">
            <circle cx="264" cy="56" r="12" />
            <path d="M264 49v8M264 62v1.5" strokeLinecap="round" />
          </g>
          <S x={108} y={96}>le nom affiché : n’importe qui peut l’écrire</S>
          <S x={108} y={108}>l’adresse réelle : c’est elle qu’on lit</S>
          <g>
            {[
              ["Ne pas répondre", true],
              ["Ne rien ouvrir", true],
              ["Signaler", false],
            ].map(([t, croix], i) => (
              <g key={t as string}>
                <rect x={42 + i * 84} y="122" width="76" height="22" fill={croix ? "#F6EFEC" : voile(p, 0.1)} stroke={croix ? ROUGE : A} strokeWidth="1.2" />
                <text x={80 + i * 84} y="136" textAnchor="middle" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={croix ? ROUGE : AF}>
                  {t as string}
                </text>
              </g>
            ))}
          </g>
          <S x={165} y={158}>en cas de doute, on vérifie ailleurs — jamais en répondant</S>
        </g>
      )

    /* 5 — Retrouver : chercher plutôt que faire défiler. */
    case 5:
      return (
        <g>
          <rect x="60" y="28" width="210" height="20" fill="#fff" stroke={A} strokeWidth="1.5" />
          <g fill="none" stroke={A} strokeWidth="1.5">
            <circle cx="74" cy="38" r="5.5" />
            <path d="M78 42l5 5" strokeLinecap="round" />
          </g>
          <text x="88" y="41" fontFamily={SANS} fontSize="8.4" fill={ENCRE}>devis chantier Morel</text>
          <path d="M165 48v10" stroke={A} strokeWidth="1.2" />
          <Pointe x={165} y={54} sens="bas" couleur={A} w={1.2} />
          <g>
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <rect x={60} y={64 + i * 17} width="150" height="15" fill={i === 1 ? voile(p, 0.12) : "#fff"} stroke={i === 1 ? A : TRAIT} strokeWidth={i === 1 ? 1.3 : 1} />
                <Ligne x={66} y={69 + i * 17} w={i === 1 ? 96 : 68} h={3.4} couleur={i === 1 ? "#9DBBDA" : PALE} />
                {i === 1 && <path d="M196 68l6 4-6 4z" fill={A} />}
              </g>
            ))}
          </g>
          <g>
            {["Clients", "Chantiers", "À classer"].map((d, i) => (
              <g key={d}>
                <path d={`M228 ${66 + i * 22}h14l3 4h27v16h-44z`} fill={i === 1 ? voile(p, 0.14) : "#F5F3EF"} stroke={i === 1 ? A : TRAIT} strokeWidth={i === 1 ? 1.3 : 1} />
                <text x={250} y={80 + i * 22} textAnchor="middle" fontFamily={SANS} fontSize="6.6" fill={i === 1 ? AF : GRIS}>{d}</text>
              </g>
            ))}
          </g>
          <S x={135} y={140}>on cherche</S>
          <S x={250} y={140}>ou on a classé</S>
          <S x={165} y={154}>ranger coûte dix secondes, chercher en coûte dix minutes</S>
        </g>
      )

    /* 6 — Écrire un message qu'on lit : l'objet, puis la demande. */
    case 6:
      return (
        <g>
          <g>
            <rect x="22" y="28" width="128" height="26" fill="#fff" stroke={TRAIT} />
            <text x="30" y="39" fontFamily={SANS} fontSize="6.8" fontWeight="700" fill={GRIS}>Objet</text>
            <text x="30" y="49" fontFamily={SANS} fontSize="8.4" fill={GRIS}>Info</text>
            <g stroke={ROUGE} strokeWidth="1.4" strokeLinecap="round">
              <path d="M128 36l10 10M138 36l-10 10" />
            </g>
          </g>
          <g>
            <rect x="180" y="28" width="128" height="26" fill="#fff" stroke={A} strokeWidth="1.5" />
            <text x="188" y="39" fontFamily={SANS} fontSize="6.8" fontWeight="700" fill={AF}>Objet</text>
            <text x="188" y="49" fontFamily={SANS} fontSize="6.6" fontWeight="700" fill={ENCRE}>Devis n°412 — retour avant jeudi</text>
          </g>
          <S x={165} y={68}>l’objet est la seule chose qu’on lit avant d’ouvrir</S>
          <g>
            <rect x="60" y="80" width="210" height="62" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            {[
              ["Quoi", "valider le devis n°412"],
              ["Pour quand", "jeudi 12, fin de journée"],
              ["Par qui", "vous, ou Marc en votre absence"],
            ].map(([k, v], i) => (
              <g key={k}>
                <text x="70" y={97 + i * 18} fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={AF}>{k}</text>
                <text x="132" y={97 + i * 18} fontFamily={SANS} fontSize="7.6" fill={ENCRE}>{v}</text>
                {i < 2 && <path d={`M70 ${102 + i * 18}h190`} stroke={PALE} strokeWidth="1" />}
              </g>
            ))}
          </g>
          <S x={165} y={158}>une demande sans échéance ni destinataire n’est pas une demande</S>
        </g>
      )

    /* 7 — Coordonner : la copie gonfle, la synthèse clôt. */
    case 7:
      return (
        <g>
          {[2, 4, 7].map((nb, i) => (
            <g key={i}>
              <rect x={24 + i * 64} y={34} width="52" height="34" fill="#fff" stroke={TRAIT} />
              <Ligne x={30 + i * 64} y={40} w={38} h={3.4} />
              <Ligne x={30 + i * 64} y={48} w={30} h={3.2} />
              <g>
                {Array.from({ length: nb }).map((_, k) => (
                  <circle key={k} cx={30 + i * 64 + (k % 4) * 11} cy={60 + Math.floor(k / 4) * 7} r="2.6" fill={k > 1 ? "#C9C4BA" : A} />
                ))}
              </g>
            </g>
          ))}
          {[0, 1].map((i) => (
            <g key={i}>
              <path d={`M${80 + i * 64} 50h8`} stroke={GRIS} strokeWidth="1.2" />
              <Pointe x={88 + i * 64} y={50} couleur={GRIS} w={1.2} />
            </g>
          ))}
          <S x={90} y={86}>chaque réponse ajoute quelqu’un</S>
          <g stroke={ROUGE} strokeWidth="1.4" fill="none" strokeLinecap="round">
            <path d="M204 44l10 10M214 44l-10 10" />
          </g>
          <g>
            <rect x="228" y="34" width="80" height="72" fill={voile(p, 0.1)} stroke={A} strokeWidth="1.5" />
            <text x="236" y="47" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={AF}>Synthèse</text>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <path d={`M236 ${58 + i * 13}l3 3.5 5.5-7`} fill="none" stroke={A} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <Ligne x={250} y={57 + i * 13} w={[50, 40, 46][i]} h={3.4} couleur="#9DBBDA" />
              </g>
            ))}
            <Ligne x={236} y={96} w={64} h={3.4} />
          </g>
          <S x={262} y={122}>ce qui est décidé,</S>
          <S x={262} y={133}>qui fait quoi, et quand</S>
          <S x={165} y={158}>un fil se clôt par un message, pas par le silence</S>
        </g>
      )

    /* 8 — Les quatre décisions du matin. */
    case 8:
      return (
        <g>
          <rect x="22" y="30" width="72" height="104" fill="#F5F3EF" stroke={TRAIT} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Msg key={i} x={28} y={38 + i * 16} w={60} h={14} lu={i > 2} />
          ))}
          <S x={58} y={142}>six messages</S>
          <g stroke={A} strokeWidth="1.3" fill="none"><path d="M100 82h12" /></g>
          <Pointe x={112} y={82} couleur={A} w={1.3} />
          {[
            ["Répondre", "moins de deux minutes"],
            ["Planifier", "ça prendra plus longtemps"],
            ["Déléguer", "ce n’est pas à vous"],
            ["Supprimer", "rien à en faire"],
          ].map(([t, s2], i) => (
            <g key={t as string}>
              <rect x={124} y={30 + i * 27} width="184" height="23" fill={i === 0 ? voile(p, 0.1) : "#fff"} stroke={i === 0 ? A : TRAIT} strokeWidth={i === 0 ? 1.3 : 1} />
              <text x="134" y={40 + i * 27} fontFamily={SANS} fontSize="8" fontWeight="700" fill={i === 0 ? AF : ENCRE}>{t as string}</text>
              <text x="134" y={49 + i * 27} fontFamily={SANS} fontSize="7" fill={GRIS}>{s2 as string}</text>
              <text x="298" y={45 + i * 27} textAnchor="end" fontFamily={SANS} fontSize="10" fontWeight="800" fill={i === 0 ? A : "#D8D2C8"}>{i + 1}</text>
            </g>
          ))}
          <S x={165} y={156}>chaque message reçoit une décision, une seule, tout de suite</S>
        </g>
      )

    /* 9 — Les pièces jointes : ce qui part avec le message. */
    case 9:
      return (
        <g>
          <rect x="46" y="28" width="140" height="98" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          <Champ x={56} y={44} w={120} label="À" valeur={44} />
          <Champ x={56} y={60} w={120} label="Objet" valeur={70} />
          <path d="M56 74h120" stroke={PALE} strokeWidth="1" />
          {[
            ["devis-412.pdf", "180 Ko", false],
            ["plan-masse.pdf", "2,4 Mo", false],
            ["photos-chantier.zip", "38 Mo", true],
          ].map(([f, po, lourd], i) => (
            <g key={f as string}>
              <path d={`M58 ${82 + i * 14}h9l2 3h11v9h-22z`} fill={lourd ? "#F6EFEC" : voile(p, 0.12)} stroke={lourd ? ROUGE : A} strokeWidth="1" />
              <text x="86" y={90 + i * 14} fontFamily={SANS} fontSize="7" fill={ENCRE}>{f as string}</text>
              <text x="180" y={90 + i * 14} textAnchor="end" fontFamily={MONO} fontSize="6.6" fontWeight={lourd ? 700 : 400} fill={lourd ? ROUGE : GRIS}>{po as string}</text>
            </g>
          ))}
          <g stroke={ROUGE} strokeWidth="1.3" fill="none"><path d="M192 110h14" /></g>
          <S x={244} y={104}>trop lourd : la boîte</S>
          <S x={244} y={115}>du destinataire refuse</S>
          <S x={116} y={142}>on choisit ce qu’on joint</S>
          <g>
            <rect x="212" y="34" width="96" height="54" fill="#F5F3EF" stroke={TRAIT} strokeDasharray="4 3" />
            <text x="260" y="50" textAnchor="middle" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={GRIS}>Transfert</text>
            <text x="260" y="64" textAnchor="middle" fontFamily={SANS} fontSize="7" fill={GRIS}>il emporte tout,</text>
            <text x="260" y="75" textAnchor="middle" fontFamily={SANS} fontSize="7" fill={GRIS}>sans rien demander</text>
          </g>
          <S x={165} y={158}>ce qui est joint quitte votre boîte pour toujours</S>
        </g>
      )

    /* 10 — Le calendrier du chantier : bloquer le temps de travail. */
    case 10:
      return (
        <g>
          <rect x="26" y="28" width="256" height="108" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          <rect x="26" y="28" width="256" height="14" fill={voile(p, 0.12)} />
          {["Lun", "Mar", "Mer", "Jeu", "Ven"].map((j, i) => (
            <text key={j} x={51 + i * 51} y="38" textAnchor="middle" fontFamily={SANS} fontSize="7" fontWeight="700" fill={AF}>{j}</text>
          ))}
          <g stroke={PALE} strokeWidth="1">
            {[1, 2, 3, 4].map((i) => <path key={i} d={`M${26 + i * 51} 42v94`} />)}
            {[1, 2, 3, 4].map((i) => <path key={i} d={`M26 ${42 + i * 19}h256`} />)}
          </g>
          {[
            [0, 46, 34, "Chantier"],
            [1, 46, 53, "Chantier"],
            [2, 65, 34, "Bureau"],
            [3, 46, 53, "Chantier"],
            [4, 84, 15, "Devis"],
          ].map(([c, y, h, t], i) => (
            <g key={i}>
              <rect x={30 + (c as number) * 51} y={y as number} width="43" height={h as number} fill={voile(p, 0.22)} stroke={A} strokeWidth="1.2" />
              <text x={51 + (c as number) * 51} y={(y as number) + 11} textAnchor="middle" fontFamily={SANS} fontSize="6.4" fontWeight="700" fill={AF}>{t as string}</text>
            </g>
          ))}
          <rect x="234" y="103" width="43" height="19" fill="#F6EFEC" stroke={ROUGE} strokeWidth="1.2" strokeDasharray="3 2.4" />
          <text x="255" y="115" textAnchor="middle" fontFamily={SANS} fontSize="6.4" fill={ROUGE}>invitation</text>
          <S x={165} y={148}>ce qui n’est pas dans l’agenda peut vous être pris</S>
          <S x={165} y={160}>— on bloque le travail, pas seulement les rendez-vous</S>
        </g>
      )

    /* 11 — Reprendre la boîte d'un collègue. */
    case 11:
      return (
        <g>
          <g fill="none" stroke={GRIS} strokeWidth="1.5">
            <circle cx="52" cy="44" r="10" />
            <path d="M36 78a16 16 0 0 1 32 0" />
          </g>
          <S x={52} y={96}>absent</S>
          <g stroke={A} strokeWidth="1.4" fill="none" strokeDasharray="4 3"><path d="M74 60h22" /></g>
          <Pointe x={96} y={60} couleur={A} />
          <rect x="108" y="26" width="96" height="112" fill="#F5F3EF" stroke={A} strokeWidth="1.4" />
          <text x="116" y="38" fontFamily={SANS} fontSize="7.2" fontWeight="700" fill={AF}>Boîte de Marc</text>
          {[0, 1, 2, 3, 4].map((i) => (
            <Msg key={i} x={116} y={44 + i * 18} w={80} h={16} lu={i > 1} />
          ))}
          <S x={156} y={152}>on entre, on ne se sert pas</S>
          <g>
            <rect x="222" y="34" width="86" height="46" fill="#fff" stroke={ENCRE} strokeWidth="1.3" />
            <text x="230" y="48" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={ENCRE}>« De la part</text>
            <text x="230" y="59" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={ENCRE}>de Marc, absent</text>
            <text x="230" y="70" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={ENCRE}>jusqu’au 12 »</text>
          </g>
          <S x={265} y={94}>répondre pour lui,</S>
          <S x={265} y={105}>jamais à sa place</S>
          <g>
            <rect x="222" y="116" width="86" height="22" fill={voile(p, 0.1)} stroke={A} strokeWidth="1.2" />
            <text x="265" y="130" textAnchor="middle" fontFamily={SANS} fontSize="7.2" fontWeight="700" fill={AF}>rendue propre</text>
          </g>
        </g>
      )

    /* 12 — Administration : la référence avant tout le reste. */
    case 12:
      return (
        <g>
          <rect x="52" y="24" width="226" height="118" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
          <rect x="52" y="24" width="226" height="16" fill={voile(p, 0.12)} />
          <text x="62" y="35" fontFamily={SANS} fontSize="7.2" fontWeight="700" fill={AF}>Objet</text>
          <text x="96" y="35" fontFamily={MONO} fontSize="7.6" fontWeight="700" fill={ENCRE}>Dossier 2026-4188502 — pièces demandées</text>
          <rect x="62" y="50" width="120" height="16" fill={voile(p, 0.14)} stroke={A} strokeWidth="1.3" />
          <text x="70" y="61" fontFamily={MONO} fontSize="7.6" fontWeight="700" fill={AF}>Réf. 2026-4188502</text>
          <g stroke={A} strokeWidth="1.2" fill="none"><path d="M190 58h14" /></g>
          <text x="210" y="61" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={AF}>en tête, toujours</text>
          <Para x={62} y={78} largeurs={[204, 186, 200]} pas={10} />
          <g>
            {[0, 1].map((i) => (
              <g key={i}>
                <path d={`M64 ${112 + i * 14}h9l2 3h11v9h-22z`} fill={voile(p, 0.12)} stroke={A} strokeWidth="1" />
                <Ligne x={92} y={116 + i * 14} w={[86, 64][i]} h={3.4} />
              </g>
            ))}
          </g>
          <S x={224} y={124}>ce qu’on écrit engage,</S>
          <S x={224} y={135}>et reste au dossier</S>
          <S x={165} y={160}>sans la référence, le message n’arrive à aucun dossier</S>
        </g>
      )

    /* 13 — Premier contact commercial : répondre vite, même sans réponse. */
    case 13:
      return (
        <g>
          {[
            ["Jour 1", "Accusé de réception", "« bien reçu, réponse sous 48 h »", true],
            ["Jour 2", "Le devis", "objet clair, pièce jointe nommée", false],
            ["Jour 9", "La relance", "une seule, courte, datée", false],
          ].map(([j, t, s2, on], i) => (
            <g key={t as string}>
              <circle cx="40" cy={40 + i * 40} r="10" fill={on ? voile(p, 0.16) : "#fff"} stroke={on ? A : ENCRE} strokeWidth="1.4" />
              <text x="40" y={43 + i * 40} textAnchor="middle" fontFamily={SANS} fontSize="8" fontWeight="800" fill={on ? AF : ENCRE}>{i + 1}</text>
              {i < 2 && <path d={`M40 ${52 + i * 40}v18`} stroke={TRAIT} strokeWidth="1.4" />}
              <text x="62" y={33 + i * 40} fontFamily={SANS} fontSize="6.8" fontWeight="700" fill={GRIS}>{j as string}</text>
              <text x="62" y={45 + i * 40} fontFamily={SANS} fontSize="8.6" fontWeight="700" fill={on ? AF : ENCRE}>{t as string}</text>
              <text x="62" y={55 + i * 40} fontFamily={SANS} fontSize="7.4" fill={GRIS}>{s2 as string}</text>
            </g>
          ))}
          <path d="M26 138h278" stroke={PALE} strokeWidth="1" />
          <S x={165} y={154}>répondre vite vaut mieux que répondre complètement</S>
        </g>
      )

    /* 14 — Une réclamation : accuser, instruire, trancher. */
    case 14:
      return (
        <g>
          <g>
            <rect x="24" y="30" width="80" height="58" fill="#fff" stroke={ROUGE} strokeWidth="1.4" />
            <text x="32" y="44" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={ROUGE}>Réclamation</text>
            <Para x={32} y={52} largeurs={[62, 54, 62]} pas={9} />
          </g>
          <Fleche x={110} y={58} l={20} p={p} />
          <g>
            <rect x="138" y="30" width="80" height="58" fill={voile(p, 0.1)} stroke={A} strokeWidth="1.4" />
            <text x="146" y="44" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={AF}>Bien reçu</text>
            <text x="146" y="56" fontFamily={SANS} fontSize="6.4" fill={ENCRE}>« nous examinons,</text>
            <text x="146" y="66" fontFamily={SANS} fontSize="6" fill={ENCRE}>réponse sous 5 jours »</text>
            <text x="146" y="80" fontFamily={SANS} fontSize="6.4" fontStyle="italic" fill={GRIS}>sans rien reconnaître</text>
          </g>
          <Fleche x={224} y={58} l={20} p={p} />
          <g>
            <rect x="252" y="30" width="56" height="58" fill="#fff" stroke={ENCRE} strokeWidth="1.4" />
            {[0, 1].map((i) => (
              <g key={i}>
                <path d={`M258 ${44 + i * 18}h9l2 3h11v9h-22z`} fill={voile(p, 0.12)} stroke={A} strokeWidth="1" />
                <Ligne x={286} y={48 + i * 18} w={16} h={3.2} />
              </g>
            ))}
            <text x="280" y="80" textAnchor="middle" fontFamily={SANS} fontSize="6.8" fontWeight="700" fill={AF}>les pièces</text>
          </g>
          <path d="M26 104h278" stroke={PALE} strokeWidth="1" />
          <S x={165} y={122}>on répond sur les faits, dans l’ordre où ils sont reprochés</S>
          <S x={165} y={140}>fondée ou non, la réponse est écrite, datée et classée</S>
        </g>
      )

    /* 15 — Le cycle fournisseur : commander, relancer, contester. */
    case 15:
      return (
        <g>
          {[
            ["Commander", "quoi, combien, quand"],
            ["Relancer", "bon de commande joint"],
            ["Contester", "la ligne, pas le tout"],
          ].map(([t, s2], i) => (
            <g key={t as string}>
              <rect x={22 + i * 98} y="30" width="86" height="50" fill={i === 2 ? voile(p, 0.1) : "#fff"} stroke={i === 2 ? A : TRAIT} strokeWidth={i === 2 ? 1.5 : 1} />
              <Ligne x={30 + i * 98} y={38} w={54} h={4} couleur={i === 2 ? "#9DBBDA" : PALE} />
              <Ligne x={30 + i * 98} y={48} w={68} h={3.4} />
              <Ligne x={30 + i * 98} y={56} w={44} h={3.4} />
              {i === 2 && (
                <g>
                  <rect x={220 + 8} y={64} width="52" height="9" fill={voile(p, 0.3)} stroke={A} strokeWidth="1" />
                </g>
              )}
              <T x={65 + i * 98} y={96}>{t as string}</T>
              <S x={65 + i * 98} y={108}>{s2 as string}</S>
            </g>
          ))}
          {[0, 1].map((i) => (
            <g key={i}>
              <path d={`M${112 + i * 98} 55h10`} stroke={A} strokeWidth="1.3" />
              <Pointe x={122 + i * 98} y={55} couleur={A} w={1.3} />
            </g>
          ))}
          <path d="M26 126h278" stroke={PALE} strokeWidth="1" />
          <S x={165} y={144}>chaque message rappelle la référence du précédent</S>
          <S x={165} y={158}>— c’est ce qui fait la preuve, le jour où il en faut une</S>
        </g>
      )

    /* 16 — L'absence : prévenir, bloquer, transmettre. */
    case 16:
      return (
        <g>
          <g>
            <rect x="22" y="30" width="90" height="56" fill="#fff" stroke={A} strokeWidth="1.4" />
            <text x="30" y="44" fontFamily={SANS} fontSize="7.2" fontWeight="700" fill={AF}>Réponse auto</text>
            <text x="30" y="56" fontFamily={SANS} fontSize="7" fill={ENCRE}>« absent du 4 au 18,</text>
            <text x="30" y="66" fontFamily={SANS} fontSize="7" fill={ENCRE}>contactez Marc »</text>
            <text x="30" y="79" fontFamily={SANS} fontSize="6.6" fontStyle="italic" fill={GRIS}>rien de plus</text>
          </g>
          <T x={67} y={104}>Prévenir</T>
          <g>
            <rect x="124" y="30" width="82" height="56" fill="#fff" stroke={TRAIT} />
            <rect x="124" y="30" width="82" height="12" fill={voile(p, 0.12)} />
            <g stroke={PALE} strokeWidth="1">
              {[1, 2].map((i) => <path key={i} d={`M${124 + i * 27} 42v44`} />)}
              {[1, 2].map((i) => <path key={i} d={`M124 ${42 + i * 15}h82`} />)}
            </g>
            <rect x="128" y="46" width="74" height="36" fill={voile(p, 0.22)} stroke={A} strokeWidth="1.2" />
            <text x="165" y="67" textAnchor="middle" fontFamily={SANS} fontSize="7.4" fontWeight="700" fill={AF}>Absence</text>
          </g>
          <T x={165} y={104}>Bloquer</T>
          <g>
            <rect x="218" y="30" width="90" height="56" fill={voile(p, 0.08)} stroke={A} strokeWidth="1.4" />
            <text x="226" y="44" fontFamily={SANS} fontSize="7.2" fontWeight="700" fill={AF}>Passation</text>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <path d={`M226 ${54 + i * 11}l3 3.5 5.5-7`} fill="none" stroke={A} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <Ligne x={240} y={53 + i * 11} w={[60, 48, 54][i]} h={3.2} couleur="#9DBBDA" />
              </g>
            ))}
          </g>
          <T x={263} y={104}>Transmettre</T>
          <S x={67} y={116}>sans exposer vos clients</S>
          <S x={165} y={116}>le temps est pris</S>
          <S x={258} y={116}>par écrit, pas oralement</S>
          <S x={165} y={148}>on part une fois que la boîte peut vivre sans nous</S>
        </g>
      )

    default:
      return <g />
  }
}

/**
 * L'affiche complète : la scène du module, un filet, et le bandeau qui situe
 * l'apprenant — c'est lui qui permet de savoir où l'on est quand on enchaîne
 * leçon, exercice puis évaluation d'un même module.
 */
export default function AfficheModule({ moduleTitle, app }: { moduleTitle?: string | null; app?: AppAffiche | null }) {
  const r = resoudre(moduleTitle, app)
  if (!r) return null
  const p = PALETTES[r.app]
  return (
    <svg viewBox="0 0 330 208" width="100%" role="img" aria-label={`Module ${r.n} — ${moduleTitle}`}>
      {r.app === "EXCEL" ? <SceneExcel n={r.n} />
        : r.app === "WORD" ? <SceneWord n={r.n} />
          : r.app === "POWERPOINT" ? <ScenePpt n={r.n} />
            : <SceneOutlook n={r.n} />}
      <path d="M26 168h278" stroke={TRAIT} strokeWidth="1" />
      <text x="26" y="184" fontFamily={SANS} fontSize="8.6" fontWeight="800" fill={p.accent} letterSpacing="1.6">
        MODULE {r.n}
      </text>
      {/* Les titres d'Outlook vont jusqu'à 56 caractères et venaient RECOUVRIR
          « MODULE N » (mesuré : jusqu'à 27 unités de chevauchement). Le seuil est
          au-dessus du plus long titre d'Excel (47 caractères), pour que les 246
          chapitres en production gardent exactement le même pied de page. */}
      <text
        x="304" y="184" textAnchor="end" fontFamily={SANS}
        fontSize={(moduleTitle ?? "").length > 48 ? "7.2" : "8.6"} fill={GRIS}
      >
        {moduleTitle}
      </text>
    </svg>
  )
}
