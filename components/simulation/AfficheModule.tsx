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
 * et vert sur ivoire, sans ombre ni perspective. L'affiche ne montre pas
 * l'écran, elle montre l'IDÉE du module — le cycle d'un geste, l'anatomie d'une
 * formule, la page cotée comme un plan. Elle enseigne déjà : trois secondes de
 * regard et l'apprenant a compris quelque chose avant d'avoir cliqué.
 *
 * UNE PAR MODULE, PAS PAR CHAPITRE : 27 affiches pour 246 chapitres. La même
 * sert à la leçon, à l'exercice et à l'évaluation — c'est ce qui permet à
 * l'apprenant de savoir où il est quand il enchaîne les trois.
 *
 * Aucune image, aucune police à charger : du SVG inline, net à toute taille et
 * gratuit en poids de page.
 */

const ENCRE = "#171a18"
const VERT = "#107C41"
const VERT_F = "#0b5c30"
const GRIS = "#8b877f"
const TRAIT = "#DDD8CE"
const PALE = "#E4E0D8"
const SANS = "system-ui,-apple-system,BlinkMacSystemFont,sans-serif"
const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace"

/**
 * Titre de module → numéro. Les titres viennent des scénarios eux-mêmes
 * (vérifié : 246/246 en déclarent un, et un seul titre distinct par module),
 * et non de la table du semeur, qui en formule cinq différemment.
 */
const MODULES: Record<string, number> = {
  "prise en main": 1,
  "saisie des donnees": 2,
  "selectionner une cellule une plage de cellules": 3,
  "les lignes et les colonnes": 4,
  "les differents formats": 5,
  "calculs simples": 6,
  "les fonctions courantes": 7,
  "mise en forme": 8,
  "premieres applications": 9,
  "fonctions avancees": 10,
  "mise en forme conditionnelle": 11,
  "saisie semi automatique et recopie": 12,
  "mise en page et impression": 13,
  "noms de cellules": 14,
  "gestion des feuilles et liaisons entre feuilles": 15,
  "applications pratiques": 16,
  "presenter les donnees en graphiques": 17,
  "manipuler les series de donnees": 18,
  "tri filtre et sous totaux": 19,
  "tableaux croises dynamiques": 20,
  "validation des donnees et protection": 21,
  "consolidation des donnees": 22,
  "analyses et simulations": 23,
  "images et illustrations": 24,
  "outils divers": 25,
  "import export et echanges de donnees": 26,
  "les macros": 27,
}

/** Normalise un titre : accents, casse et ponctuation ne doivent pas décider. */
function cle(titre: string): string {
  return titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function numeroModule(titre?: string | null): number | null {
  if (!titre) return null
  return MODULES[cle(titre)] ?? null
}

/* ─────────────── primitives communes ─────────────── */

function Fleche({ x, y, l = 26, couleur = VERT }: { x: number; y: number; l?: number; couleur?: string }) {
  return (
    <g stroke={couleur} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${x} ${y}h${l}`} />
      <path d={`M${x + l - 5} ${y - 4.5}l4.5 4.5-4.5 4.5`} />
    </g>
  )
}

function T({ x, y, children, ancre = "middle" }: { x: number; y: number; children: React.ReactNode; ancre?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={ancre} fontFamily={SANS} fontSize="8" fontWeight="700" fill={ENCRE}>
      {children}
    </text>
  )
}

function S({ x, y, children, ancre = "middle" }: { x: number; y: number; children: React.ReactNode; ancre?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={ancre} fontFamily={SANS} fontSize="6.8" fill={GRIS}>
      {children}
    </text>
  )
}

/** Une cellule de tableau : le motif le plus réutilisé du jeu. */
function Case({
  x, y, w = 44, h = 16, texte, actif, aligne = "start", mono, gras,
}: {
  x: number; y: number; w?: number; h?: number; texte?: string
  actif?: boolean; aligne?: "start" | "middle" | "end"; mono?: boolean; gras?: boolean
}) {
  const tx = aligne === "end" ? x + w - 5 : aligne === "middle" ? x + w / 2 : x + 5
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={actif ? "rgba(16,124,65,.12)" : "#fff"} stroke={actif ? VERT : TRAIT} strokeWidth={actif ? 1.5 : 1} />
      {texte !== undefined && (
        <text
          x={tx} y={y + h / 2 + 3} textAnchor={aligne} fontFamily={mono ? MONO : SANS}
          fontSize="7.6" fontWeight={gras ? 700 : 400} fill={actif ? VERT_F : ENCRE}
        >
          {texte}
        </text>
      )}
    </g>
  )
}

/* ─────────────── les 27 scènes ─────────────── */

function Scene({ n }: { n: number }): React.ReactElement {
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

/**
 * L'affiche complète : la scène du module, un filet, et le bandeau qui situe
 * l'apprenant — c'est lui qui permet de savoir où l'on est quand on enchaîne
 * leçon, exercice puis évaluation d'un même module.
 */
export default function AfficheModule({ moduleTitle }: { moduleTitle?: string | null }) {
  const n = numeroModule(moduleTitle)
  if (!n) return null
  return (
    <svg viewBox="0 0 330 208" width="100%" role="img" aria-label={`Module ${n} — ${moduleTitle}`}>
      <Scene n={n} />
      <path d="M26 168h278" stroke={TRAIT} strokeWidth="1" />
      <text x="26" y="184" fontFamily={SANS} fontSize="8.6" fontWeight="800" fill={VERT} letterSpacing="1.6">
        MODULE {n}
      </text>
      <text x="304" y="184" textAnchor="end" fontFamily={SANS} fontSize="8.6" fill={GRIS}>
        {moduleTitle}
      </text>
    </svg>
  )
}
