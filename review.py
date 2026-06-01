#!/usr/bin/env python3
"""
review.py — the review server for the presentation kit.

Run it from the repo root, then open the printed URL in your browser:

    python3 review.py            # serves on http://localhost:8000
    python3 review.py 8080       # pick a different port

When a deck is opened through this server, the review overlay
(review.js) wakes up. You can comment on any slide and fix text
inline; both are written to `review.jsonl` in that deck's folder:

    presentations/<name>/review.jsonl

Then tell your AI agent "apply my review" — it reads that file,
makes the changes to deck.html, and marks each item done.

No dependencies. Pure Python standard library. Stop with Ctrl-C.
"""
from __future__ import annotations  # keep type hints lazy so Python 3.7+ works

import json
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

ROOT = Path(__file__).resolve().parent

# Last time the watcher (watch.py) checked in, as epoch seconds. The review
# panel polls /__review/health and turns this into a "watcher live" pill so
# you can see at a glance whether your agent is listening. None = never seen.
_HB_LOCK = threading.Lock()
_LAST_HEARTBEAT = None

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".woff2": "font/woff2",
    ".md": "text/markdown; charset=utf-8",
}


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def review_file_for(slide_path: str) -> Path:
    """Map a deck URL path (/presentations/x/deck.html) to its review.jsonl."""
    rel = unquote(slide_path).lstrip("/")
    folder = (ROOT / rel).resolve().parent
    return folder / "review.jsonl"


def safe_target(rel: str) -> Path | None:
    """Resolve a static path, blocking traversal outside ROOT."""
    try:
        target = (ROOT / rel.lstrip("/")).resolve()
        target.relative_to(ROOT)
    except (ValueError, OSError):
        return None
    return target


class Handler(BaseHTTPRequestHandler):
    # ---- output helpers ----
    def _send(self, code, ctype, data):
        if isinstance(data, str):
            data = data.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, "application/json", json.dumps(obj))

    def _body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def log_message(self, *args):
        pass  # quiet — we print our own lines

    # ---- GET ----
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/__review/health":
            with _HB_LOCK:
                last = _LAST_HEARTBEAT
            age = None if last is None else round(time.time() - last, 1)
            return self._json(200, {"ok": True, "root": str(ROOT),
                                    "listener": {"last_seen_seconds_ago": age}})

        if path == "/__review/comments":
            q = parse_qs(parsed.query)
            slide_path = (q.get("path") or ["/"])[0]
            items = self._read_review(slide_path)
            return self._json(200, {"items": items})

        return self._static(path)

    # ---- POST ----
    def do_POST(self):
        path = urlparse(self.path).path
        body = self._body()
        try:
            if path == "/__review/comment":
                return self._post_comment(body)
            if path == "/__review/edit":
                return self._post_edit(body)
            if path == "/__review/ack":
                return self._post_ack(body)
            if path == "/__review/heartbeat":
                return self._post_heartbeat(body)
            return self._json(404, {"error": "unknown_endpoint"})
        except Exception as e:  # never crash the server on a bad request
            return self._json(500, {"error": "server_error", "reason": str(e)})

    # ---- static files ----
    def _static(self, path):
        rel = path if path != "/" else "/index.html"
        target = safe_target(rel)
        if target is None:
            return self._send(403, "text/plain; charset=utf-8", "Forbidden")
        if target.is_dir():
            idx = target / "index.html"
            target = idx if idx.is_file() else target
        if not target.is_file():
            return self._send(404, "text/plain; charset=utf-8", "Not found")
        ctype = CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream")
        return self._send(200, ctype, target.read_bytes())

    # ---- review.jsonl helpers ----
    def _read_review(self, slide_path):
        f = review_file_for(slide_path)
        if not f.is_file():
            return []
        out = []
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Only this deck's records.
            if rec.get("slidePath") == slide_path:
                out.append(rec)
        return out

    def _append_review(self, slide_path, record):
        f = review_file_for(slide_path)
        f.parent.mkdir(parents=True, exist_ok=True)
        with f.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    # ---- endpoints ----
    def _post_comment(self, body):
        for k in ("slidePath", "comment"):
            if not body.get(k):
                return self._json(400, {"error": f"missing:{k}"})
        rec = {
            "ts": now_iso(),
            "type": "comment",
            "status": "pending",
            "slidePath": body["slidePath"],
            "slideIndex": body.get("slideIndex", 0),
            "slideTitle": body.get("slideTitle", ""),
            "comment": body["comment"],
        }
        # Optional: a specific element the reviewer pinned with the Attach button.
        for k in ("elementId", "elementTag", "elementClasses", "elementSnippet"):
            if body.get(k):
                rec[k] = body[k]
        self._append_review(body["slidePath"], rec)
        n = body.get("slideIndex", 0) + 1
        print(f"  💬 comment on slide {n}: {body['comment'][:70]}")
        return self._json(200, {"ok": True})

    def _post_edit(self, body):
        if not body.get("slidePath"):
            return self._json(400, {"error": "missing:slidePath"})
        slide_path = body["slidePath"]
        rich = bool(body.get("richEdit"))
        if rich:
            for k in ("oldInner", "newInner"):
                if k not in body:
                    return self._json(400, {"error": f"missing:{k}"})
            old, new = body["oldInner"], body["newInner"]
        else:
            for k in ("oldText", "newText"):
                if k not in body:
                    return self._json(400, {"error": f"missing:{k}"})
            old, new = body["oldText"], body["newText"]

        # Apply only when the old string occurs exactly once — an unambiguous
        # swap. (Works the same whether `old` is plain text or an HTML span.)
        target = safe_target(slide_path)
        applied = False
        reason = "no_file"
        if target and target.is_file():
            html = target.read_text(encoding="utf-8")
            count = html.count(old)
            if count == 1:
                target.write_text(html.replace(old, new, 1), encoding="utf-8")
                applied = True
                reason = "applied"
            else:
                reason = "not_found" if count == 0 else "ambiguous"

        # Log the edit either way (done if we applied it, pending if not).
        rec = {
            "ts": now_iso(),
            "type": "edit",
            "status": "done" if applied else "pending",
            "slidePath": slide_path,
            "slideIndex": body.get("slideIndex", 0),
            "editId": body.get("editId", ""),
            "result": reason,
        }
        if rich:
            rec["richEdit"] = True
            rec["oldInner"], rec["newInner"] = old, new
        else:
            rec["oldText"], rec["newText"] = old, new
        self._append_review(slide_path, rec)
        if applied:
            print(f"  ✎ edit applied on slide {body.get('slideIndex',0)+1}: {old[:40]} → {new[:40]}")
        return self._json(200, {"ok": True, "applied": applied, "result": reason})

    def _post_ack(self, body):
        slide_path = body.get("slidePath")
        ts = body.get("ts")
        if not slide_path or not ts:
            return self._json(400, {"error": "missing:slidePath|ts"})
        f = review_file_for(slide_path)
        if not f.is_file():
            return self._json(404, {"error": "no_file"})
        lines = []
        for line in f.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                lines.append(line)
                continue
            if rec.get("ts") == ts:
                rec["status"] = "done"
            lines.append(json.dumps(rec, ensure_ascii=False))
        f.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return self._json(200, {"ok": True})

    def _post_heartbeat(self, body):
        # The watcher (watch.py) pings this every few seconds while it's alive.
        global _LAST_HEARTBEAT
        with _HB_LOCK:
            _LAST_HEARTBEAT = time.time()
        return self._json(200, {"ok": True})


def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    base = f"http://localhost:{port}"
    print("\n  Review server running.  (Ctrl-C to stop)\n")
    print(f"  Open a deck to review, e.g.:")
    print(f"    {base}/slides.html                         (the example)")
    print(f"    {base}/presentations/<name>/deck.html      (one you built)\n")
    print("  Comment on a slide or use Edit mode; both land in that")
    print("  deck's review.jsonl. Then tell your agent: \"apply my review.\"\n")
    print("  For live review (agent acts as you send each comment), also run:")
    print(f"    python3 watch.py {port if port != 8000 else ''}".rstrip() + "\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.\n")
        server.shutdown()


if __name__ == "__main__":
    main()
