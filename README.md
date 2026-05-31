# Presentation Builder Starter

A tiny, no-build kit for making slide decks with an AI agent. You share
your content however you like — usually just by telling the agent in the
chat — and it turns that into a clean HTML presentation that matches a
shared house style. Slides are plain HTML/CSS — they open in any browser
and export to PDF. No frameworks, no accounts, no install.

The default look is **Editorial**: a warm off-white canvas, serif
headings, and a single muted accent. It works in both **English (LTR)**
and **Arabic (RTL)** — set the direction per slide.

## What you need

Almost nothing — this is deliberately low-setup.

- **A web browser** — to view, present, and export decks. That's the only
  requirement for the slides themselves. No install, no build, no accounts.
- **Python 3.7+** — *only* for the review tool (`review.py`). It uses just
  the standard library, so there's **nothing to `pip install`**.
  - **macOS:** often already there. A brand-new Mac will offer to install
    the "Command Line Tools" the first time you run `python3` — one click,
    a couple of minutes. (Or your AI agent can do it for you.)
  - **Windows:** install once from [python.org](https://www.python.org/downloads/)
    (tick *"Add Python to PATH"*) or the Microsoft Store. Then `python`
    works in any terminal.
- **An AI coding agent** (e.g. Claude Code) — to actually build and revise
  the decks from whatever you tell it.
- *(Optional)* **Internet on first view** — the example fonts load from
  Google Fonts. Offline, decks fall back to clean system fonts; everything
  still works.

If you only ever open finished decks to present, you don't even need
Python — it's purely for the review/refine step.

## What's inside

| File | What it is |
|------|------------|
| `CLAUDE.md` | The agent's job description + the house style. Read first. |
| `theme.css` | The whole visual system. Recolor the deck by editing the tokens at the top. |
| `deck.js` | The slide engine (keyboard navigation + fragments). |
| `review.js` · `review.py` | The review + edit tool. Comment on slides, fix text inline, or pin a comment to a specific element; your agent reads the feedback and applies it. |
| `watch.py` | Streams new comments to your agent live, and lights up the panel's **● watcher live** status. |
| `welcome.html` | The one template — a guided-tour deck your agent opens first that also serves as the style reference (every slide type, English + Arabic). |
| `presentations/` | One folder per presentation, holding the finished `deck.html` (the agent may keep an optional `notes.md` brief beside it). |

## Quick start

1. **Get the kit.** Clone this repo (or download it) to your computer.
2. **Open it with your AI agent.** Open this folder in a coding agent
   such as Claude Code. On the first run it will greet you and ask a few
   setup questions (your name, default language, accent color). That
   happens once.
3. **Ask for a presentation.** Tell the agent what you need —
   *"Make a deck for my Q1 team update."* Share the content however suits
   you: talk it through in the chat, paste some text, or point it at a
   document. The agent asks for whatever's missing.
4. **Get the deck.** The agent creates a folder under `presentations/`
   and writes the finished `deck.html` there.
5. **Present or export.** Open `deck.html` in a browser to present. To
   share as PDF, use **Print → Save as PDF**.

Each presentation is self-contained — copy a folder to reuse it, or
delete one to throw it away. See `presentations/example/` for the shape.

## Review and refine

The first draft is never the last. To review a deck and ask for changes:

1. **Start the review server** from the repo root (or just ask your
   agent to): `python3 review.py`
2. **Open the deck** at the printed address, e.g.
   `http://localhost:8000/presentations/<name>/deck.html`. A floating
   **pencil button** appears top-right — click it or press **`R`** to
   open the review panel.
3. **Comment, attach, or edit.**
   - Type a comment on any slide and hit **Send to agent** (or
     **Ctrl/Cmd+Enter**).
   - Want it about one specific thing? Hover that element and click
     **📌 Attach** first — your comment is pinned to exactly that element.
   - Or press **`E`** for **Edit mode** and fix text right on the slide —
     small typo-level fixes save straight to the file.
4. **Apply.** For a live loop, have your agent run `python3 watch.py` — it
   picks comments up as you send them, and the panel shows a green
   **● watcher live** badge so you know it's listening. Otherwise just tell
   it *"apply my review"* — it reads the feedback (stored in
   `presentations/<name>/review.jsonl`), makes the changes, and marks each
   one done. Refresh the browser to see them.

The button and panel only show up when the deck is served by `review.py`,
and they disappear in fullscreen. When you open `deck.html` directly to
present, it's just the slides — nothing extra.

## Controls when presenting

| Key | Action |
|-----|--------|
| `→` / `↓` / `Space` / `PageDown` | Next (reveals bullet points one at a time, then advances) |
| `←` / `↑` / `PageUp` | Previous |
| `Home` / `End` | First / last slide |
| `F` | Fullscreen |

Navigation is keyboard-only — a stray click never jumps the slide. You can
also deep-link to a slide with `#5` at the end of the URL.

In a review session (deck served by `review.py`) there's more: `R` toggles
the review panel, `E` toggles inline edit, hover an element and click
**📌 Attach** to pin a comment to it, `Esc` closes the panel. All review
chrome is hidden in fullscreen.

## Make it yours

- **Recolor:** edit the `--accent` (and other tokens) at the top of
  `theme.css`. One change repaints the whole deck.
- **Fonts:** swap the Google Fonts `<link>` in your slide file's
  `<head>` and the `--serif` / `--sans` tokens in `theme.css`.
- **New slide types:** add a clearly-commented block at the bottom of
  `theme.css` — keep the shared tokens intact.

## License

MIT — see [`LICENSE`](LICENSE).
