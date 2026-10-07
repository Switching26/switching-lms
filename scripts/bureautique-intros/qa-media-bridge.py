"""Serveur QA jetable, lecture des sources et bootstrap privé à usage unique.
Ne démarre jamais pendant une chaîne vidéo. Aucun appel R2, aucune écriture source.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.parse import urlsplit, parse_qs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("private_folder", type=Path)
    parser.add_argument("targets", type=Path)
    parser.add_argument("--port", type=int, default=3119)
    args = parser.parse_args()
    if subprocess.run(["pgrep", "-f", "outils/production.mjs"], capture_output=True).returncode == 0:
        raise SystemExit("BLOCAGE : chaînes vidéo encore actives, serveur QA interdit")
    targets = json.loads(args.targets.read_text())
    cookies = json.loads((args.private_folder / "cookies.json").read_text())
    apps = ["word", "powerpoint", "outlook"]
    allowed = {(app, t["id"]) for app in apps for t in targets if t["app"] == app.upper()}
    used = False
    examples = []
    for app in apps:
        lessons = [t for t in targets if t["app"] == app.upper() and "chapterId" in t]
        module = next(t for t in targets if t["app"] == app.upper() and "sectionId" in t)
        first = next(t for t in lessons if t["chapterId"] == module["firstChapterId"])
        second = next(t for t in lessons if t["moduleNumber"] == first["moduleNumber"] and t["chapterId"] != first["chapterId"])
        examples.append(dict(app=app, formationId=first["formationId"], first=first["chapterId"], second=second["chapterId"], moduleIntroId=module["introId"], lessonIntroId=first["introId"]))

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            nonlocal used
            if self.path == "/bootstrap" and not used:
                used = True
                payload = json.dumps(dict(cookies=[dict(name="authjs.session-token", value=cookies["learner"], domain="127.0.0.1", path="/", httpOnly=True,
                    sameSite="Lax", expires=int(time.time()) + 1800)], examples=examples)).encode()
                self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(payload))); self.end_headers(); self.wfile.write(payload)
                return
            if self.path == "/examples":
                payload = json.dumps(examples).encode()
                self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(payload))); self.end_headers(); self.wfile.write(payload)
                return
            url = urlsplit(self.path)
            match = re.fullmatch(r"/switching-lms-videos/introductions/(word|powerpoint|outlook)/2026-10-v1/(m\d{2}-(?:intro|l\d{2}))\.(mp4|jpg)", url.path)
            query = parse_qs(url.query)
            if not query.get("X-Amz-Signature") or query.get("X-Amz-Expires") != ["300"]:
                self.send_error(403); return
            if not match or (match[1], match[2]) not in allowed:
                self.send_error(404); return
            source = Path.home() / "checkos/scratchpads/lms-intros-video" / match[1] / "rendus" / f"{match[2]}.{match[3]}"
            if not source.exists():
                self.send_error(404); return
            size = source.stat().st_size; start = 0; end = size - 1
            byte_range = re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
            if byte_range:
                start = int(byte_range[1]); end = min(size - 1, int(byte_range[2]) if byte_range[2] else size - 1)
                if start > end:
                    self.send_error(416); return
            self.send_response(206 if byte_range else 200)
            self.send_header("Content-Type", "video/mp4" if match[3] == "mp4" else "image/jpeg")
            self.send_header("Content-Length", str(end - start + 1)); self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-store")
            if byte_range:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            try:
                with source.open("rb") as stream:
                    stream.seek(start); remaining = end - start + 1
                    while remaining:
                        chunk = stream.read(min(65536, remaining))
                        if not chunk: break
                        self.wfile.write(chunk); remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    timer = threading.Timer(280, server.shutdown); timer.start()
    print("Relais local QA prêt, lecture seule, extinction en moins de cinq minutes", flush=True)
    try:
        server.serve_forever()
    finally:
        timer.cancel(); server.server_close()


if __name__ == "__main__":
    main()
