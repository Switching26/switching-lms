#!/usr/bin/env python3
"""Agrège les fronts du balayage et classe les défauts par gravité et par famille."""
import json, glob, re, sys, collections, os

prefixe = sys.argv[1] if len(sys.argv) > 1 else "avant"
inv = {(l["fichier"] + ".json", l["index"]): l
       for l in json.load(open("/Users/switchingformation/checkos/work/switching-lms-audit-opus5/.audit-inventaire-demos.json"))}

res = []
for f in sorted(glob.glob(f"{prefixe}-front*.json")):
    try:
        res += json.load(open(f))
    except Exception as e:
        print(f"  (front {f} illisible : {e})")

print(f"{len(res)} étapes mesurées sur 1587\n")

verdicts = collections.Counter(r["verdict"] for r in res)
print("VERDICTS :", dict(verdicts), "\n")

# Classement par gravité
GRAVE = [
    ("cibles-invisibles", r"cibles non dessinées"),
    ("pressions-differentes", r"pressions P1"),
    ("etat-final-different", r"état final DIFFÉRENT"),
    ("auto-avancement", r"auto-avancement"),
    ("sans-fin", r"ne se termine pas|marqueur de fin"),
    ("compteur", r"compteur \d"),
    ("erreur-js", r"erreur JS"),
]
MOYEN = [("entree-non-restauree", r"état d'entrée NON restauré")]

def classe(d):
    for nom, motif in GRAVE:
        if re.search(motif, d):
            return nom
    for nom, motif in MOYEN:
        if re.search(motif, d):
            return nom
    return "autre"

par_classe = collections.defaultdict(list)
for r in res:
    for d in r.get("defauts", []) or ([r["motif"]] if r.get("motif") else []):
        par_classe[classe(d)].append((r, d))

print("PAR CLASSE DE DÉFAUT")
for c, l in sorted(par_classe.items(), key=lambda x: -len(x[1])):
    etapes = {f"{r['nom'][:-5]}#{r['index']}" for r, _ in l}
    print(f"  {c:26s} {len(l):5d} constats · {len(etapes):4d} étapes")

# Détail des familles pour les "état d'entrée non restauré"
print("\nÉTAT D'ENTRÉE NON RESTAURÉ — familles touchées")
fam = collections.Counter()
famEx = {}
for r, d in par_classe.get("entree-non-restauree", []):
    for m in re.finditer(r"(?:^|\| )([a-zA-Zé]+)[:\[]", d.split("restauré: ", 1)[-1]):
        fam[m.group(1)] += 1
        famEx.setdefault(m.group(1), f"{r['nom'][:-5]}#{r['index']}")
for k, v in fam.most_common():
    print(f"  {k:20s} {v:5d}   ex. {famEx[k]}")

# Familles d'action concernées par les défauts GRAVES
print("\nDÉFAUTS GRAVES — répartition par famille d'action")
gr = collections.Counter()
grEx = collections.defaultdict(list)
for c, l in par_classe.items():
    if c in ("entree-non-restauree", "autre"):
        continue
    for r, d in l:
        k = inv.get((r["nom"], r["index"]), {}).get("famille", "?")
        t = inv.get((r["nom"], r["index"]), {}).get("type", "?")
        gr[(k, t, c)] += 1
        if len(grEx[(k, t, c)]) < 5:
            grEx[(k, t, c)].append(f"{r['nom'][:-5]}#{r['index']}")
for (k, t, c), v in gr.most_common():
    print(f"  {k:14s} {t:26s} {c:24s} {v:4d}   ex. {', '.join(grEx[(k,t,c)])}")

# Liste brute des étapes en défaut GRAVE
graves = []
for c, l in par_classe.items():
    if c in ("entree-non-restauree", "autre"):
        continue
    for r, d in l:
        graves.append((f"{r['nom'][:-5]}#{r['index']}", r.get("etape"), c, d[:220]))
graves.sort()
print(f"\n{len({g[0] for g in graves})} étapes en défaut GRAVE :")
vu = set()
for e, et, c, d in graves:
    if e in vu:
        continue
    vu.add(e)
    print(f"  {e:22s} {str(et):14s} {c:22s} {d}")

json.dump(res, open(f"{prefixe}-tout.json", "w"))
