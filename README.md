# ARMOR ARENA — 鋼機工廠

Build an autonomous mech from parts. Watch it fight. No twitch skills — your engineering wins the match.

**Play:** https://d3j.github.io/armor-arena/

ARMOR ARENA (Japanese title: 鋼機工廠 *Kouki Koushou*, "Steel Machine Arsenal") is a free browser game where you assemble a mech — frame, legs, generator, armor, two weapons, and an AI temperament — then send it into a fully autonomous battle simulation. Matches play back on three synchronized screens:

- **Text play-by-play** — an MM-style live commentary log
- **CRT radar** — top-down tactical view with scanline glow
- **Wireframe 3D** — retro vector-style battle footage (Three.js), with a cockpit POV mode

The simulation is deterministic: a match is fully defined by two builds and a seed, so replays are tiny codes and online matches are verified server-side by re-running the same sim.

## Features

- ~30 parts to unlock with battle credits; drill ranks E→S, daily drills (date-seeded)
- Async online PvP: register your mech to the arena, the server matches you by rating, runs the authoritative sim, and updates Elo — no realtime connection needed
- Optional Google sign-in for cloud garage (8 slots); fully playable anonymously with localStorage
- Replay codes you can share; battles are watchable by anyone from a URL
- Non-P2W by design: cosmetics only, ratings are the sole server-authoritative value

## Origin

Inspired by MM (マッチメーカー / MatchMaker), a classic Japanese play-by-text robot-battle format devised by 篠崎砂美: assemble an Armor Knight from parts, submit it, and read how the match unfolds. ARMOR ARENA is a new work in that spirit — no names or data from the original are used.

This game was built autonomously by AI (Claude / Fable) in the [fable-playground](https://github.com/d3j/fable-playground) experiment, where its full development history lives (as `kouki`). This repository is its standalone home.

## Repository layout

```
public/           the game (static site, deployed to GitHub Pages)
public/dev/       development build (noindex) — features staged here before promotion
public/lib/       shared browser helpers (API client, share/screenshot)
workers/kouki/    Cloudflare Worker backend (D1 + KV): auth, cloud garage, arena matchmaking, Elo
.github/          Pages deploy workflow
```

## Local development

The site is plain static ESM — no build step:

```sh
npx serve public   # or: python3 -m http.server -d public 8742
```

The backend worker (optional; the game is fully playable without it):

```sh
cd workers/kouki
npm ci
npx wrangler dev
```

`public/game.js` picks the local API when served from `localhost`.

## Deploying

- **Site**: push to `main` → `.github/workflows/pages.yml` publishes `public/` to GitHub Pages.
- **Worker**: `cd workers/kouki && npx wrangler deploy` (deploys as `fable-kouki`).
