# Clubhouse Ledger

A mobile-first, single-file web app for tracking golf side games — **Wolf**, **Snake**, and **Dots** (Greenie, Sandy, Birdie, Eagle, Poley, 3-Putt) — with handicap-aware scoring.

No build step, no dependencies, no backend. Open `golf_games.html` in any browser and it works.

## Files

- **`golf_games.html`** — the app. Open it directly, or add it to your phone's home screen (Chrome → ⋮ → Add to Home screen) for an app-like experience.
- **`golf_games_demo.html`** — the same app pre-loaded with a full simulated 18-hole round (5 players, made-up scores/putts) so you can see every screen populated without entering data first.

## Features

- **Setup** — 2–6 players, each with a course handicap
- **Score** — enter gross strokes and putts per hole; net score is computed automatically from each player's handicap and the hole's stroke index
- **Wolf** — rotates automatically through the player order; supports lone wolf or any number of partners; auto-suggests the winner from net scores (best-ball), with manual override; pushes carry stakes forward to the next hole (2 pushes in a row = 3x on the decider)
- **Snake** — automatically derived from putts entered in Score; players with a handicap over 18 need 4 putts (not 3) before it counts against them
- **Dots** — Greenie (par-3s only), Sandy, Birdie/Eagle (auto-filled from gross score vs. par), Poley, and 3-Putt (paid by the putter to every other player, not deducted from their own total)
- **Ledger** — running totals per player, optional $-per-point settlement, and a full 18-hole scorecard (gross score, dots earned, and the wolf result for every hole)

All data is stored locally per-device via the browser's storage — nothing is sent to a server.

## Local development

There's nothing to build. Edit the HTML/CSS/JS directly in `golf_games.html` and refresh the browser.

## License

Personal project — no license specified.
