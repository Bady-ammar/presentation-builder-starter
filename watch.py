#!/usr/bin/env python3
"""
watch.py — bring review comments to your AI agent without pinging it.

Run this alongside `review.py` (which serves the deck and writes comments).
While you review in the browser, every comment you send lands in a
`review.jsonl` file. This watcher surfaces each new *pending* one so your
agent can act on it — no "apply my review" needed.

Two modes:

  python3 watch.py --wait     # RECOMMENDED for an AI agent.
      Waits until the next comment(s) arrive, prints them, then EXITS.
      Why exit? A background process only notifies the agent when it
      finishes — so exiting is what actually wakes the agent up. The agent
      handles the comment, then runs `watch.py --wait` again to wait for
      the next one. That's the hands-free loop.

  python3 watch.py            # continuous: prints comments as they arrive
      and never exits. Good for a human watching a terminal, or an agent
      whose tooling streams a background process's output live.

Add the port if review.py isn't on 8000:  python3 watch.py --wait 8080

Each comment prints as a two-line block — a `[path] slide N: …` header and
the raw JSON. To act on one: open the slide it points at, make the change,
then ack it so it stops being pending:

    curl -X POST http://localhost:8000/__review/ack \
      -H 'Content-Type: application/json' \
      -d '{"slidePath":"<slidePath>","ts":"<ts>"}'

It also pings the server so the review panel shows a live "● watcher live"
status. Stop it with Ctrl-C. No dependencies — pure standard library.
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


def scan_new(seen):
    """Return [(rel_path, record), …] for pending records not seen before."""
    found = []
    for f in review_files():
        rel = f.relative_to(ROOT).as_posix()
        for rec, _line in pending_records(f):
            ts = rec.get("ts")
            if ts and ts in seen:
                continue
            if ts:
                seen.add(ts)
            found.append((rel, rec))
    return found


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
    wait_mode = False
    for arg in sys.argv[1:]:
        if arg in ("--wait", "-w", "--once"):
            wait_mode = True
        else:
            try:
                port = int(arg)
            except ValueError:
                pass

    seen = set()        # ts values already emitted
    msg = "Waiting for the next review comment…" if wait_mode else "Watching for review comments…"
    print(f"  {msg} (Ctrl-C to stop)", file=sys.stderr)
    print(f"  Talking to review.py on http://localhost:{port}\n", file=sys.stderr)

    heartbeat(port)
    last_hb = time.time()

    try:
        while True:
            found = scan_new(seen)
            for rel, rec in found:
                emit(rel, rec)
            # --wait: exit as soon as we've surfaced something. Exiting is the
            # signal that wakes the agent; it handles these, then relaunches us.
            if wait_mode and found:
                return

            now = time.time()
            if now - last_hb >= HEARTBEAT_SECONDS:
                heartbeat(port)
                last_hb = now
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\n  Stopped watching.\n", file=sys.stderr)


if __name__ == "__main__":
    main()
