/**
 * Le poste de travail autour d'Excel — modèle pur.
 *
 * POURQUOI CETTE COUCHE
 * Trois leçons du module 1 promettent un geste que l'apprenant ne faisait
 * jamais : « Démarrer Excel et quitter proprement » commençait par un écran de
 * lecture qui RACONTE le menu Démarrer, puis saisissait directement dans A1 ;
 * « Ouvrir et enregistrer un classeur » annonçait un devis « qui a été ouvert
 * depuis les fichiers récents » ; « Créer un classeur à partir d'un modèle »
 * ouvrait le modèle d'office. Sans un ordinateur autour du tableur, ces gestes
 * ne sont pas simulables — c'est exactement ce que fait OnlineFormaPro, et
 * c'est la direction C validée par Samuel le 29/07/2026.
 *
 * CHOIX DU DÉCOR : un bureau NEUTRE, pas une copie de Windows (choix Samuel).
 * Une barre des tâches, un bouton Démarrer, des icônes : assez reconnaissable
 * pour que l'apprenant transpose, sans reprendre les visuels de Microsoft, et
 * sans se périmer à la prochaine version de Windows.
 *
 * Aucune dépendance à React, à Univer ni au DOM : le même code sert à corriger
 * côté serveur, comme pour les macros et les tableaux croisés.
 */

import type {
  AppPoste,
  BoitePoste,
  FichierPoste,
  GestePoste,
  ModelePoste,
  PosteAttendu,
  PosteState,
} from "./types"

export const APPS_PAR_DEFAUT: AppPoste[] = [
  { id: "word", nom: "Word" },
  { id: "excel", nom: "Excel", ouvrable: true },
  { id: "powerpoint", nom: "PowerPoint" },
  { id: "courrier", nom: "Courrier" },
]

/**
 * État de départ. `excelOuvert` vaut true pour l'immense majorité des
 * chapitres : ils commencent dans le classeur, exactement comme aujourd'hui.
 * Seules les leçons qui enseignent le poste lui-même partent d'Excel fermé.
 */
export function posteInitial(options?: {
  excelOuvert?: boolean
  classeur?: string | null
  fichiers?: FichierPoste[]
  apps?: AppPoste[]
  modeles?: ModelePoste[]
}): PosteState {
  const ouvert = options?.excelOuvert !== false
  return {
    excel: ouvert ? "classeur" : "ferme",
    menu: false,
    boite: "aucune",
    classeur: options?.classeur ?? null,
    modifie: false,
    fichiers: options?.fichiers ? [...options.fichiers] : [],
    apps: options?.apps ?? APPS_PAR_DEFAUT,
    modeles: options?.modeles ? [...options.modeles] : [],
  }
}

/**
 * Applique un geste. Fonction pure : elle renvoie un nouvel état, ce qui rend
 * chaque transition rejouable et vérifiable hors navigateur.
 */
export function appliquerGeste(etat: PosteState, geste: GestePoste): PosteState {
  switch (geste.type) {
    case "menu":
      return { ...etat, menu: !etat.menu }

    case "lancer": {
      const app = etat.apps.find((a) => a.id === geste.app)
      // Une application non ouvrable referme quand même le menu : l'apprenant
      // voit que son clic a été pris en compte, il n'insiste pas dans le vide.
      if (!app?.ouvrable) return { ...etat, menu: false }
      return { ...etat, menu: false, excel: "accueil" }
    }

    case "nouveau":
      return { ...etat, excel: "classeur", classeur: null, modifie: false }

    case "ouvrirFichier": {
      const existe = etat.fichiers.some((f) => f.nom === geste.nom)
      if (!existe) return etat
      return { ...etat, excel: "classeur", classeur: geste.nom, modifie: false, boite: "aucune" }
    }

    case "ouvrirModele": {
      const existe = etat.modeles.some((m) => m.id === geste.modele)
      if (!existe) return etat
      // `classeur: null` est le cœur de la leçon : on n'ouvre PAS le modèle,
      // on ouvre une copie qui n'a pas encore de nom. La barre de titre affiche
      // « Classeur1 », et le modèle reste intact pour la fois suivante.
      return { ...etat, excel: "classeur", classeur: null, modifie: false, boite: "aucune", menu: false }
    }

    case "fermer":
      // Fermer ramène au bureau. Le classeur courant est oublié : c'est
      // précisément ce que la leçon veut faire sentir quand rien n'a été
      // enregistré.
      return { ...etat, excel: "ferme", boite: "aucune", menu: false }

    case "reduire":
      return { ...etat, menu: false }

    case "ouvrirBoite":
      // Enregistrer un classeur qui a DÉJÀ un nom n'ouvre aucune fenêtre :
      // Excel écrase la version précédente sans rien demander. C'est toute la
      // différence avec « Enregistrer sous » (`forcer`), et la leçon
      // « Ouvrir et enregistrer un classeur » la fait maintenant éprouver au
      // lieu de la raconter.
      if (geste.boite === "enregistrer" && !geste.forcer && etat.classeur) {
        return { ...etat, menu: false, modifie: false }
      }
      return { ...etat, boite: geste.boite, menu: false }

    case "fermerBoite":
      return { ...etat, boite: "aucune" }

    case "enregistrer": {
      const nom = geste.nom.trim()
      if (!nom) return etat
      const dejaLa = etat.fichiers.some((f) => f.nom === nom)
      return {
        ...etat,
        boite: "aucune",
        classeur: nom,
        modifie: false,
        fichiers: dejaLa
          ? etat.fichiers.map((f) => (f.nom === nom ? { ...f, surBureau: geste.surBureau ?? f.surBureau } : f))
          : [...etat.fichiers, { nom, surBureau: geste.surBureau ?? true }],
      }
    }

    case "modifier":
      return etat.modifie ? etat : { ...etat, modifie: true }

    default:
      return etat
  }
}

/**
 * Compare l'état obtenu à ce que l'étape attend. Renvoie null si tout va bien,
 * sinon un message destiné à l'apprenant — jamais un jargon d'état interne.
 */
export function verifierPoste(etat: PosteState, attendu: PosteAttendu): string | null {
  if (attendu.excel && etat.excel !== attendu.excel) {
    if (attendu.excel === "ferme") return "Excel est encore ouvert."
    if (attendu.excel === "accueil") return "Excel n'est pas encore lancé."
    return etat.excel === "ferme"
      ? "Excel n'est pas encore lancé."
      : "Aucun classeur n'est encore ouvert."
  }
  if (attendu.menu !== undefined && etat.menu !== attendu.menu) {
    return attendu.menu ? "Le menu Démarrer n'est pas ouvert." : "Le menu Démarrer est encore ouvert."
  }
  if (attendu.boite && etat.boite !== attendu.boite) {
    return attendu.boite === "enregistrer"
      ? "La fenêtre d'enregistrement n'est pas ouverte."
      : "La fenêtre d'ouverture n'est pas ouverte."
  }
  if (attendu.classeur !== undefined) {
    const obtenu = (etat.classeur ?? "").trim().toLowerCase()
    if (obtenu !== attendu.classeur.trim().toLowerCase()) {
      return etat.classeur
        ? `Le classeur s'appelle « ${etat.classeur} ».`
        : "Le classeur n'a pas encore été enregistré."
    }
  }
  if (attendu.fichiers?.length) {
    const manquant = attendu.fichiers.find(
      (n) => !etat.fichiers.some((f) => f.nom.trim().toLowerCase() === n.trim().toLowerCase()),
    )
    if (manquant) return `Le fichier « ${manquant} » n'existe pas encore.`
  }
  return null
}

/** Identifiants des contrôles du poste, pour les scénarios et les tests. */
export const CONTROLES_POSTE = {
  demarrer: "poste-demarrer",
  fermer: "poste-fermer",
  reduire: "poste-reduire",
  nouveau: "poste-nouveau",
  enregistrer: "poste-enregistrer",
  enregistrerSous: "poste-enregistrer-sous",
  enregistrerValider: "poste-enregistrer-valider",
  enregistrerAnnuler: "poste-enregistrer-annuler",
  ouvrir: "poste-ouvrir",
  ouvrirValider: "poste-ouvrir-valider",
  ouvrirAnnuler: "poste-ouvrir-annuler",
  app: (id: string) => `poste-app-${id}`,
  fichier: (nom: string) => `poste-fichier-${nom.trim().toLowerCase().replace(/\s+/g, "-")}`,
  /** Ligne de la boîte « Ouvrir » : id distinct de l'icône du bureau, sinon le
   *  même `data-control` existerait deux fois dans le DOM et un clic
   *  automatisé viserait l'icône cachée derrière la modale. */
  listeFichier: (nom: string) => `poste-liste-${nom.trim().toLowerCase().replace(/\s+/g, "-")}`,
  modele: (id: string) => `poste-modele-${id}`,
} as const
