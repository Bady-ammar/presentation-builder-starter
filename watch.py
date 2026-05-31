#!/usr/bin/env python3
"""
watch.py — stream review comments to your AI agent in real time.

Run this alongside `review.py` (which serves the deck and writes comments).
While you review in the browser, every new comment you send lands in a
`review.jsonl` file. This watcher tails all of them and prints each new
*pending* comment as it arrives, so your agent can act on it the moment
you send it — no "apply my review" needed.

    python3 watch.py            # watches the kit, talks to review.py on :8000
    python3 watch.py 8080       # if you started review.py on a different port

How an agent uses it: run this in the background (Claude Code can do this
for you) and treat each printed block as one task — read the slide it
points at, make the change, then ack it so it stops being pending:

    curl -X POST http://localhost:8000/__review/ack \
      -H 'Content-Type: application/json' \
      -d '{"slidePath":"<slidePath>","ts":"<ts>"}'

It also pings the server every few seconds so the review panel can show a
live "● watcher live" status. Stop it with Ctrl-C.

No dependencies. Pure Python standard library.
"""
from __future__ import annotations  # keep type hints lazy so Python 3.7+ works

import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
POLL_SECONDS = 1.0          # how often to check the files for new comments
HEARTBEAT_SECONDS = 10.0    # how often to tell review.py we're alive


def review_files():
    """Every review.jsonl in the kit: the root one + one per presentation."""
    files = []
    root_log = ROOT / "review.jsonl"
    if root_log.is_file():
        files.append(root_log)
    files.extend(sorted((ROOT / "presentations").rglob("review.jsonl")))
    return files


def pending_records(path: Path):
    """Yield (record, raw_line) for each pending comment/edit in a file."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("status") == "pending":
            yield rec, line


def heartbeat(port: int):
    """Tell review.py we're alive so the panel shows 'watcher live'."""
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/__review/heartbeat",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=2).read()
    except Exception:
        pass  # server down or restarting — keep watching, retry next tick


def emit(rel_path: str, rec: dict):
    """Print one pending comment as a two-line block the agent acts on."""
    n = (rec.get("slideIndex", 0) or 0) + 1
    kind = rec.get("type", "comment")
    summary = rec.get("comment") if kind == "comment" else \
        f"edit: {rec.get('oldText', '')!r} -> {rec.get('newText', '')!r}"
    where = "slide %d" % n
    if rec.get("elementId"):
        where += " · element %s" % rec["elementId"]
    print(f"[{rel_path}] {where}: {summary}")
    print(json.dumps(rec, ensure_ascii=False))
    sys.stdout.flush()


def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    seen = set()  # ts values we've already emitted
    last_hb = 0.0

    print(f"  Watching for review comments… (Ctrl-C to stop)", file=sys.stderr)
    print(f"  Talking to review.py on http://localhost:{port}\n", file=sys.stderr)

    try:
        while True:
            for f in review_files():
                rel = f.relative_to(ROOT).as_posix()
                for rec, _line in pending_records(f):
                    ts = rec.get("ts")
                    if ts and ts in seen:
                        continue
                    if ts:
                        seen.add(ts)
                    emit(rel, rec)

            now = time.time()
            if now - last_hb >= HEARTBEAT_SECONDS:
                heartbeat(port)
                last_hb = now

            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\n  Stopped watching.\n", file=sys.stderr)


if __name__ == "__main__":
    main()
