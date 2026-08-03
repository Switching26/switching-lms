"""Contrôle d'intégrité de la passe finale : un fichier complet par lot."""
import json, glob, os, collections
lots = sorted(glob.glob('final/lot*.json'))
manquants, incomplets, verdicts, total, doublons = [], [], collections.Counter(), 0, []
vus = set()
for l in lots:
    n = os.path.basename(l)[:-5]
    r = f'final/res-{n}.json'
    attendu = len(json.load(open(l)))
    if not os.path.exists(r) or os.path.getsize(r) == 0:
        manquants.append(n); continue
    try: d = json.load(open(r))
    except Exception: incomplets.append((n, 'illisible', attendu)); continue
    if len(d) != attendu: incomplets.append((n, len(d), attendu)); continue
    for x in d:
        k = (x['nom'], x['index'])
        if k in vus: doublons.append(k)
        vus.add(k); total += 1; verdicts[x['verdict']] += 1
print(f"lots {len(lots)} · fichiers complets {len(lots)-len(manquants)-len(incomplets)} · "
      f"manquants {len(manquants)} · incomplets {len(incomplets)}")
print(f"entrées {total} · uniques {len(vus)} · doublons {len(doublons)} · {dict(verdicts)}")
if manquants: print("  manquants:", ' '.join(manquants[:20]))
if incomplets: print("  incomplets:", incomplets[:10])
