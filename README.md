# Presentation Builder Starter

A tiny, no-build kit for making slide decks with an AI agent. You write
rough notes; the agent turns them into a clean HTML presentation that
matches a shared house style. Slides are plain HTML/CSS — they open in
any browser and export to PDF. No frameworks, no accounts, no install.

The default look is **Editorial**: a warm off-white canvas, serif
headings, and a single muted accent. It works in both **English (LTR)**
and **Arabic (RTL)** — set the direction per slide.

## What's inside

| File | What it is |
|------|------------|
| `CLAUDE.md` | The agent's job description + the house style. Read first. |
| `theme.css` | The whole visual system. Recolor the deck by editing the tokens at the top. |
| `deck.js` | The slide engine (keyboard nav + click-to-advance + fragments). |
| `slides.html` | An example deck in both English and Arabic — your style reference. |
| `notes.md` | Where you drop the content for the deck you want built. |
| `output/` | Where the agent writes finished decks. |

## Quick start

1. **Get the kit.** Clone this repo (or download it) to your computer.
2. **Open it with your AI agent.** Open this folder in a coding agent
   such as Claude Code. On the first run it will greet you and ask a few
   setup questions (your name, default language, accent color). That
   happens once.
3. **Write your notes.** Put the content for your presentation in
   `notes.md` — bullet points are fine.
4. **Ask for the deck.** Tell the agent: *"Build a deck from notes.md."*
   It writes a finished `.html` file into `output/`.
5. **Present or export.** Open the file in a browser to present. To
   share as PDF, use **Print → Save as PDF**.

## Controls when presenting

| Key | Action |
|-----|--------|
| `→` / `Space` | Next (reveals bullet points one at a time, then advances) |
| `←` | Previous |
| `Home` / `End` | First / last slide |
| `F` | Fullscreen |
| click | Right side = next, left side = back (flips for RTL slides) |

You can also deep-link to a slide with `#5` at the end of the URL.

## Make it yours

- **Recolor:** edit the `--accent` (and other tokens) at the top of
  `theme.css`. One change repaints the whole deck.
- **Fonts:** swap the Google Fonts `<link>` in your slide file's
  `<head>` and the `--serif` / `--sans` tokens in `theme.css`.
- **New slide types:** add a clearly-commented block at the bottom of
  `theme.css` — keep the shared tokens intact.

## License

MIT — see [`LICENSE`](LICENSE).
