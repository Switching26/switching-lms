/**
 * LA COULEUR DE CHAQUE APPLICATION — source unique.
 *
 * POURQUOI CE FICHIER EXISTE
 * Le châssis commun du simulateur (`AtelierShell`) portait le vert d'Excel EN
 * DUR — exactement `#107C41`. C'était juste tant que le simulateur ne simulait
 * qu'Excel. Depuis le 04/08/2026 il en simule quatre, et Word, PowerPoint et
 * Outlook héritaient tous du vert d'Excel : bouton « Voir le geste », badge de
 * phase, cockpit, sommaire, guide — tout en vert, dans un Word bleu.
 *
 * Les affiches de module (`AfficheModule`) connaissaient déjà la bonne couleur
 * de chaque application depuis le 04/08 : elles portaient leur propre table.
 * Deux tables auraient divergé au premier ajustement — c'est pourquoi la table
 * vit ICI, et qu'`AfficheModule` la lit au lieu de la redéclarer.
 *
 * ═══ COMMENT LA COULEUR ATTEINT LE CHÂSSIS ═══
 *
 * Par VARIABLES CSS, posées une seule fois par `SimulationChapter` sur le
 * conteneur qui enveloppe le player — donc au-dessus de l'écran d'ouverture,
 * du châssis, du chrome de l'application et du guide, tous descendants.
 *
 * Chaque touche du châssis s'écrit `var(--sim-accent, #107C41)` : le repli est
 * TOUJOURS la valeur d'Excel telle qu'elle était écrite en dur avant. Deux
 * conséquences voulues :
 *   — Excel est inchangé PAR CONSTRUCTION, même si les variables manquaient ;
 *   — un chapitre dont l'application est inconnue retombe sur l'existant.
 *
 * ═══ CE QUI N'EST PAS ICI, ET NE DOIT PAS Y VENIR ═══
 *
 * Les couleurs SÉMANTIQUES. Elles portent une information, pas une identité :
 * le vert de franchissement `#22A75A`, les verdicts `#059669` / `#e11d48`, le
 * rouge de la panne du juge, l'ambre de l'évaluation notée `#8A5A12`, le
 * bleu-gris de lecture `#3E5A67`, les vignettes « L » et « ★ » du sommaire, le
 * halo d'erreur des players, et l'encart « Voici la réponse » (vert conservé,
 * décision de Samuel du 07/08/2026). Les recolorer ferait mentir l'écran.
 */

/** Les quatre applications simulées. */
export type AppSim = "EXCEL" | "WORD" | "POWERPOINT" | "OUTLOOK"

/**
 * Les rôles de couleur dont le châssis a besoin. Ce ne sont pas des nuances
 * libres : chaque champ correspond à une touche précise de l'écran, et la
 * valeur d'Excel est celle qui était écrite en dur avant ce fichier.
 */
export type PaletteApp = {
  /** L'accent d'identité : boutons pleins, filets, pastilles, barres. */
  accent: string
  /** L'accent foncé : textes qui doivent tenir sur un fond clair. */
  accentF: string
  /** `r,g,b` de l'accent, pour composer des voiles. */
  rgb: string
  /** Le voile clair de l'accent : fond des badges et des pastilles. */
  voile: string
  /** Le filet du voile : bordure d'un bloc posé sur le voile. */
  voileBord: string
  /** L'encre à poser SUR le voile clair (badge de phase). */
  encreVoile: string
  /** La teinte claire du cockpit : segments franchis, barre d'avancement. */
  clair: string
  /** L'encre très claire du bouton « Guide » replié. */
  tresClair: string
  /** L'encre de la barre du cockpit — un noir teinté de l'application. */
  encre: string
  /** Le fond du cadre de l'atelier, assorti au cockpit. */
  fond: string
  /** `r,g,b` du voile du bouton « Guide ». Voir la note ci-dessous. */
  guideRgb: string
  /**
   * Le geste souligné dans la consigne (`==action==`) et le lien du panneau
   * Notes. Excel les rendait avec `text-emerald-700` — un vert de Tailwind qui
   * n'est même pas le sien : sa valeur est donc conservée telle quelle.
   */
  souligne: string
  /**
   * Le focus du champ de note et la coche du sommaire. Même histoire :
   * `text-emerald-600` chez Excel, conservé à l'identique.
   */
  notes: string
  /**
   * La consigne d'une étape du guide de la formation.
   *
   * ⚠️ Excel y portait `#0C5B31` et non `#0b5c30` — un point d'écart sur chaque
   * canal avec son propre accent foncé, vraisemblablement une faute de frappe
   * d'origine. Le banc l'a attrapée : sans ce champ, Excel changeait de couleur
   * ici. On la conserve telle quelle plutôt que de « corriger » à l'aveugle un
   * écran qui doit rester identique au pixel près.
   */
  guideTache: string
}

/**
 * ⚠️ `guideRgb` — pourquoi Excel fait exception.
 *
 * Le bouton « Guide » replié porte chez Excel un voile de sa teinte CLAIRE
 * (`rgba(78,208,138,…)`), pas de son accent. Les trois autres applications
 * prennent le voile de leur ACCENT : c'est ce qui a été montré à Samuel et
 * validé le 07/08/2026, et c'est aussi ce qui donne le meilleur contraste sur
 * leur encre de cockpit. Conserver la valeur d'Excel est ce qui garantit qu'il
 * ne bouge d'aucun pixel.
 */
export const PALETTES: Record<AppSim, PaletteApp> = {
  EXCEL: {
    accent: "#107C41",
    accentF: "#0b5c30",
    rgb: "16,124,65",
    voile: "#E7F3EB",
    voileBord: "#BFE3CD",
    encreVoile: "#107C41",
    clair: "#4ED08A",
    tresClair: "#BFF0D4",
    encre: "#10201B",
    fond: "#0B1512",
    guideRgb: "78,208,138",
    souligne: "#047857",
    notes: "#059669",
    guideTache: "#0C5B31",
  },
  WORD: {
    accent: "#2B579A",
    accentF: "#1B3A6B",
    rgb: "43,87,154",
    voile: "#E6EBF3",
    voileBord: "#B5C4DC",
    encreVoile: "#1B3A6B",
    clair: "#6BA6E8",
    tresClair: "#C9DEF7",
    encre: "#101A24",
    fond: "#0B1018",
    guideRgb: "43,87,154",
    souligne: "#1B3A6B",
    notes: "#2B579A",
    guideTache: "#1B3A6B",
  },
  POWERPOINT: {
    accent: "#C43E1C",
    accentF: "#8D2B12",
    rgb: "196,62,28",
    voile: "#F8E8E4",
    voileBord: "#EABBB0",
    encreVoile: "#8D2B12",
    clair: "#F08A6B",
    tresClair: "#F8D8CC",
    encre: "#221310",
    fond: "#170C0A",
    guideRgb: "196,62,28",
    souligne: "#8D2B12",
    notes: "#C43E1C",
    guideTache: "#8D2B12",
  },
  OUTLOOK: {
    accent: "#0F6CBD",
    accentF: "#0A4B84",
    rgb: "15,108,189",
    voile: "#E2EDF7",
    voileBord: "#ABCCE8",
    encreVoile: "#0A4B84",
    clair: "#5FB2F0",
    tresClair: "#C4E3FA",
    encre: "#0E1A24",
    fond: "#081119",
    guideRgb: "15,108,189",
    souligne: "#0A4B84",
    notes: "#0F6CBD",
    guideTache: "#0A4B84",
  },
}

/**
 * Les variables CSS d'une application, à poser sur un conteneur.
 *
 * Renvoie un objet de style React ; le type est volontairement large, les
 * propriétés personnalisées n'entrant pas dans `CSSProperties`.
 */
export function variablesCouleur(app: AppSim | null | undefined): Record<string, string> {
  const p = PALETTES[app ?? "EXCEL"] ?? PALETTES.EXCEL
  return {
    "--sim-accent": p.accent,
    "--sim-accent-fonce": p.accentF,
    "--sim-accent-rgb": p.rgb,
    "--sim-voile": p.voile,
    "--sim-voile-bord": p.voileBord,
    "--sim-encre-voile": p.encreVoile,
    "--sim-clair": p.clair,
    "--sim-tres-clair": p.tresClair,
    "--sim-encre": p.encre,
    "--sim-fond": p.fond,
    "--sim-guide-rgb": p.guideRgb,
    "--sim-souligne": p.souligne,
    "--sim-notes": p.notes,
    "--sim-guide-tache": p.guideTache,
  }
}

/**
 * Les expressions `var(…)` à écrire dans le châssis. Le repli est la valeur
 * d'Excel : c'est LUI qui garantit qu'Excel ne bouge pas, et pas une précaution
 * prise ailleurs.
 */
export const C = {
  accent: "var(--sim-accent, #107C41)",
  accentF: "var(--sim-accent-fonce, #0b5c30)",
  rgb: "var(--sim-accent-rgb, 16,124,65)",
  voile: "var(--sim-voile, #E7F3EB)",
  voileBord: "var(--sim-voile-bord, #BFE3CD)",
  encreVoile: "var(--sim-encre-voile, #107C41)",
  clair: "var(--sim-clair, #4ED08A)",
  tresClair: "var(--sim-tres-clair, #BFF0D4)",
  encre: "var(--sim-encre, #10201B)",
  fond: "var(--sim-fond, #0B1512)",
  guideRgb: "var(--sim-guide-rgb, 78,208,138)",
  souligne: "var(--sim-souligne, #047857)",
  notes: "var(--sim-notes, #059669)",
  guideTache: "var(--sim-guide-tache, #0C5B31)",
} as const

/** Un voile de l'accent, à l'opacité demandée. */
export function voileAccent(a: number): string {
  return `rgba(${C.rgb},${a})`
}

/** Un voile du bouton « Guide », à l'opacité demandée. */
export function voileGuide(a: number): string {
  return `rgba(${C.guideRgb},${a})`
}
