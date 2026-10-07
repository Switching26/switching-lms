"""Resolve all 207 targets. Production access is strictly READ ONLY; no dependencies."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlparse, unquote

APPS = {"word": (19, 41), "powerpoint": (16, 64), "outlook": (16, 51)}


def resolve_targets(snapshot, sources):
    result = []
    for app, (modules, lessons) in APPS.items():
        root = sources / app
        ids = json.loads((root / "ids.json").read_text())
        if len(ids) != modules + lessons or len(set(ids)) != len(ids):
            raise ValueError(f"{app}: nombre de sources incorrect")
        app_targets = []
        for source_id in ids:
            match = re.fullmatch(r"m(\d{2})-(intro|l\d{2})", source_id)
            if not match:
                raise ValueError(f"{app}/{source_id}: identifiant interdit")
            number = int(match[1])
            module = json.loads((root / "donnees" / f"m{number:02}.json").read_text())
            if number != module["module_ordre"] or module["id"] != f"m{number:02}-intro":
                raise ValueError(f"{app}/{source_id}: module source incohérent")
            rows = [s for s in snapshot["sections"] if s["order"] == number and s["title"] == module["module"]
                    and any(c["sectionId"] == s["id"] and c["app"] == app.upper() for c in snapshot["chapters"])]
            if len(rows) != 1:
                raise ValueError(f"{app}/{source_id}: module absent ou ambigu")
            section = rows[0]
            formation = next(f for f in snapshot["formations"] if f["id"] == section["formationId"])
            if not formation["isPublished"] or formation["deletedAt"]:
                raise ValueError(f"{app}: formation non publiée")
            published = sorted([c for c in snapshot["chapters"] if c["sectionId"] == section["id"] and c["app"] == app.upper() and c["isPublished"] and c["mode"] == "LESSON"], key=lambda c: (c["order"], c["id"]))
            declared = module["lecons"]
            if len(published) != len(declared) or {(c["id"], c["title"]) for c in published} != {(c["chapitre_id"], c["titre"]) for c in declared}:
                raise ValueError(f"{app}/{source_id}: couverture des leçons du module différente")
            target = dict(id=source_id, introId=f"{app}-{source_id}", app=app.upper(), formationId=formation["id"], formationTitle=formation["title"], sectionTitle=section["title"], moduleNumber=number)
            if match[2] == "intro":
                target.update(sectionId=section["id"], title=section["title"], firstChapterId=published[0]["id"])
            else:
                data = json.loads((root / "donnees" / f"{source_id}.json").read_text())
                rows = [c for c in published if c["id"] == data["chapitre_id"]]
                if len(rows) != 1:
                    raise ValueError(f"{app}/{source_id}: leçon publiée introuvable")
                chapter = rows[0]
                if (chapter["title"] != data["titre"] or chapter["formationId"] != formation["id"] or chapter["order"] != 100 + int(match[2][1:])
                        or data["module"] != section["title"] or data["module_ordre"] != number or data["ordre"] != int(match[2][1:]) or data["application"].upper() != app.upper()):
                    raise ValueError(f"{app}/{source_id}: identité de leçon différente")
                target.update(chapterId=chapter["id"], chapterOrder=chapter["order"], title=chapter["title"])
            app_targets.append(target)
        if sum("chapterId" in t for t in app_targets) != lessons or sum("sectionId" in t for t in app_targets) != modules:
            raise ValueError(f"{app}: répartition incorrecte")
        if len({t["formationId"] for t in app_targets}) != 1:
            raise ValueError(f"{app}: formations mélangées")
        result.extend(app_targets)
    if len(result) != 207 or len({t.get("chapterId", t.get("sectionId")) for t in result}) != 207 or len({t["introId"] for t in result}) != 207:
        raise ValueError("207 cibles uniques requises")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path, default=Path.home() / "checkos/scratchpads/lms-intros-video")
    parser.add_argument("--output", type=Path, default=Path.home() / "lms-intros-mission/bureautique/cibles.json")
    parser.add_argument("--snapshot", type=Path, help="Snapshot déjà obtenu en lecture seule (tests hors ligne)")
    args = parser.parse_args()
    if args.snapshot:
        snapshot = json.loads(args.snapshot.read_text())
    else:
        u = urlparse((Path.home() / "switching-lms-backups/.db-url").read_text().strip())
        env = os.environ.copy()
        env.update(PGHOST=u.hostname, PGPORT=str(u.port or 5432), PGUSER=unquote(u.username), PGPASSWORD=unquote(u.password), PGDATABASE=u.path[1:], PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=30000", PGCONNECT_TIMEOUT="10")
        sql = '''BEGIN READ ONLY;
SELECT json_build_object('formations',(SELECT json_agg(f) FROM (SELECT id,title,"isPublished","deletedAt" FROM "Formation" WHERE id IN (SELECT "formationId" FROM "Chapter" JOIN "Simulation" ON "chapterId"="Chapter".id WHERE app::text IN ('WORD','POWERPOINT','OUTLOOK'))) f),'sections',(SELECT json_agg(s) FROM (SELECT id,title,"order","formationId" FROM "Section" WHERE "formationId" IN (SELECT "formationId" FROM "Chapter" JOIN "Simulation" ON "chapterId"="Chapter".id WHERE app::text IN ('WORD','POWERPOINT','OUTLOOK'))) s),'chapters',(SELECT json_agg(c) FROM (SELECT c.id,c.title,c."order",c."formationId",c."sectionId",c."isPublished",s.app,s.mode FROM "Chapter" c JOIN "Simulation" s ON s."chapterId"=c.id WHERE app::text IN ('WORD','POWERPOINT','OUTLOOK')) c));
COMMIT;'''
        response = subprocess.run(["/opt/homebrew/opt/libpq@18/bin/psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], input=sql, text=True, capture_output=True, env=env, timeout=45)
        if response.returncode:
            raise ValueError("Lecture DB refusée (aucun secret journalisé)")
        snapshot = json.loads(response.stdout)
    targets = resolve_targets(snapshot, args.sources)
    args.output.write_text(json.dumps(targets, ensure_ascii=False, indent=2) + "\n")
    journal = args.output.parent / "journal.md"
    with journal.open("a") as f:
        f.write(datetime.datetime.now().strftime("%Y-%m-%d %H:%M") + " — Cibles résolues et uniques : Word 60, PowerPoint 80, Outlook 67 ; production lecture seule.\n")
    print("207/207 cibles uniques contrôlées : 51 modules + 156 leçons")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"BLOCAGE : {error}" if isinstance(error, ValueError) else "BLOCAGE : résolution interrompue ; aucune écriture en production")
        raise SystemExit(1)
