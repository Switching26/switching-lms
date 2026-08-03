#!/usr/bin/env python3
"""Matrice de couverture et de défauts par FAMILLE D'ÉTAT, avant/après.

  python3 matrice.py <prefixe-avant> <dossier-avant> [<prefixe-apres> <dossier-apres>]
"""
import json, glob, os, re, sys, collections

INV = "/Users/switchingformation/checkos/work/switching-lms-audit-opus5/.audit-inventaire-demos.json"
inv = {(l["fichier"] + ".json", l["index"]): l for l in json.load(open(INV))}

CLASSES = [
    ("cibles-non-dessinees", r"cibles non dessinées"),
    ("repere-invisible", r"repère de surface nulle"),
    ("pressions-differentes", r"pressions P1"),
    ("etat-final-different", r"état final DIFFÉRENT"),
    ("auto-avancement", r"auto-avancement"),
    ("sans-fin", r"ne se termine pas|marqueur de fin"),
    ("compteur-incomplet", r"P[12] compteur"),
    ("erreur-js", r"erreur JS"),
    ("valeur-absurde", r"valeur absurde"),
    ("entree-non-restauree", r"état d'entrée NON restauré"),
]


def classe(d):
    for nom, motif in CLASSES:
        if re.search(motif, d):
            return nom
    return "autre"


def charger(dossier, prefixe):
    res = []
    for f in sorted(glob.glob(os.path.join(dossier, f"{prefixe}-front*.json"))):
        try:
            res += json.load(open(f))
        except Exception:
            pass
    return res


def resume(res, titre):
    print(f"\n{'='*78}\n{titre} — {len(res)} étapes mesurées\n{'='*78}")
    v = collections.Counter(r["verdict"] for r in res)
    print("verdicts :", dict(v))
    par = collections.defaultdict(set)
    detail = collections.defaultdict(list)
    for r in res:
        for d in r.get("defauts", []) or ([r["motif"]] if r.get("motif") else []):
            c = classe(d)
            par[c].add(f"{r['nom'][:-5]}#{r['index']}")
            if len(detail[c]) < 6:
                detail[c].append(f"{r['nom'][:-5]}#{r['index']} — {d[:150]}")
    if not par:
        print("aucun défaut")
    for c, s in sorted(par.items(), key=lambda x: -len(x[1])):
        print(f"\n  {c:26s} {len(s):5d} étapes")
        for d in detail[c]:
            print(f"      {d}")
    return {c: s for c, s in par.items()}


def matrice(res, titre):
    fam = collections.defaultdict(lambda: [0, 0, 0, 0])  # mesurées, ok, défaut, hors-portée
    for r in res:
        k = inv.get((r["nom"], r["index"]), {}).get("famille", "?")
        fam[k][0] += 1
        if r["verdict"] == "OK":
            fam[k][1] += 1
        elif r["verdict"] == "DEFAUT":
            fam[k][2] += 1
        else:
            fam[k][3] += 1
    print(f"\n{titre}")
    print(f"{'FAMILLE':16s} {'mesurées':>9s} {'OK':>7s} {'défaut':>8s} {'hors-portée':>12s}")
    for k, (m, o, d, h) in sorted(fam.items(), key=lambda x: -x[1][0]):
        print(f"{k:16s} {m:9d} {o:7d} {d:8d} {h:12d}")
    tot = [sum(x[i] for x in fam.values()) for i in range(4)]
    print(f"{'TOTAL':16s} {tot[0]:9d} {tot[1]:7d} {tot[2]:8d} {tot[3]:12d}")
    return fam


av = charger(sys.argv[2], sys.argv[1])
a = resume(av, "AVANT")
matrice(av, "Matrice AVANT")

if len(sys.argv) > 4:
    ap = charger(sys.argv[4], sys.argv[3])
    b = resume(ap, "APRÈS")
    matrice(ap, "Matrice APRÈS")
    print(f"\n{'='*78}\nCOMPARAISON par classe\n{'='*78}")
    for c in sorted(set(a) | set(b)):
        na, nb = len(a.get(c, set())), len(b.get(c, set()))
        fleche = "→" if na != nb else "="
        print(f"  {c:26s} {na:5d} {fleche} {nb:5d}")
        reste = b.get(c, set()) - a.get(c, set())
        if reste:
            print(f"      apparues : {sorted(reste)[:8]}")
