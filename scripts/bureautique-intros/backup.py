"""Sauvegarde production en lecture seule, à effectuer juste avant la phase 2."""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse, unquote


def main():
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    folder = Path.home() / "switching-lms-backups"
    dump = folder / f"bureautique-intros-{stamp}.sql.gz"
    proof = folder / f"bureautique-intros-{stamp}.proof.json"
    u = urlparse((folder / ".db-url").read_text().strip())
    env = os.environ.copy()
    env.update(PGHOST=u.hostname, PGPORT=str(u.port or 5432), PGUSER=unquote(u.username), PGPASSWORD=unquote(u.password), PGDATABASE=u.path[1:],
               PGCONNECT_TIMEOUT="10", PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=120000")
    result = subprocess.run(["/opt/homebrew/opt/libpq@18/bin/pg_dump", "--no-owner", "--no-acl"], capture_output=True, env=env, timeout=240)
    if result.returncode or b"PostgreSQL database dump complete" not in result.stdout:
        raise ValueError("Dump refusé ou incomplet")
    with gzip.open(dump, "xb") as stream:
        stream.write(result.stdout)
    dump.chmod(0o600)
    with gzip.open(dump, "rb") as stream:
        if stream.read() != result.stdout:
            raise ValueError("Vérification gzip refusée")
    data = dump.read_bytes()
    proof.write_text(json.dumps(dict(purpose="before-bureautique-intros", dumpPath=str(dump), dumpBytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(), compressionVerified=True, verifiedAt=datetime.datetime.now(datetime.timezone.utc).isoformat()), indent=2) + "\n")
    proof.chmod(0o600)
    print(f"Sauvegarde vérifiée ; INTRO_BACKUP_VERIFIED={proof}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("BLOCAGE : sauvegarde interrompue ; aucun secret affiché, aucune écriture production")
        raise SystemExit(1)
