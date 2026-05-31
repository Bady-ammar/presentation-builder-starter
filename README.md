# Presentation Builder Starter

A tiny, no-build kit for making slide decks with an AI agent. You write
rough notes; the agent turns them into a clean HTML presentation that
matches a shared house style. Slides are plain HTML/CSS — they open in
any browser and export to PDF. No frameworks, no accounts, no install.

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
  the decks from your notes.
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
| `deck.js` | The slide engine (keyboard nav + click-to-advance + fragments). |
| `review.js` · `review.py` | The review + edit tool. Lets you comment on slides and fix text inline; your agent reads the feedback and applies it. |
| `watch.py` | Streams new comments to your agent live, and lights up the panel's **● watcher live** status. |
| `welcome.html` | A short guided-tour deck your agent opens the first time — it teaches the controls and the review tool. |
| `slides.html` | An example deck in both English and Arabic — your style reference. |
| `presentations/` | One folder per presentation. Each holds its `notes.md` and the finished `deck.html` side by side. |

## Quick start

1. **Get the kit.** Clone this repo (or download it) to your computer.
2. **Open it with your AI agent.** Open this folder in a coding agent
   such as Claude Code. On the first run it will greet you and ask a few
   setup questions (your name, default language, accent color). That
   happens once.
3. **Ask for a presentation.** Tell the agent what you need —
   *"Make a deck for my Q1 team update."* It creates a folder for it
   under `presentations/` and either asks you for the content or takes
   the notes you give it.
4. **Get the deck.** The agent writes `deck.html` into that same
   folder, right next to its `notes.md`.
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
3. **Comment or edit.**
   - Type a comment on any slide and hit **Send to agent** (or
     **Ctrl/Cmd+Enter**).
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
| click | Right side = next, left side = back (flips for RTL slides) |

You can also deep-link to a slide with `#5` at the end of the URL.

In a review session (deck served by `review.py`) there are three more:
`R` toggles the review panel, `E` toggles inline edit, `Esc` closes the
panel. All review chrome is hidden in fullscreen.

## Make it yours

- **Recolor:** edit the `--accent` (and other tokens) at the top of
  `theme.css`. One change repaints the whole deck.
- **Fonts:** swap the Google Fonts `<link>` in your slide file's
  `<head>` and the `--serif` / `--sans` tokens in `theme.css`.
- **New slide types:** add a clearly-commented block at the bottom of
  `theme.css` — keep the shared tokens intact.

## License

MIT — see [`LICENSE`](LICENSE).
