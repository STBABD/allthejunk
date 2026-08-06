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
- **Ledger** — running totals per player, optional $-per-point settlement, a running money tally showing each player's cumulative winnings hole by hole, and a full 18-hole scorecard (gross score, dots earned, and the wolf result for every hole)

All data is stored locally per-device in the browser's `localStorage` — nothing is sent to a server unless you turn on live spectator mode below.

## Live spectator mode (optional)

One phone keeps score; everyone else opens a link and watches it update live. It's **off by default** — with no setup, the app behaves exactly as described above and never touches the network.

Turning it on takes about five minutes and needs a free Firebase project (its free tier is far beyond what a golf group uses):

1. Go to <https://console.firebase.google.com>, create a project, and add a **Web app** to it.
2. In **Build → Realtime Database**, create a database (any region; start in locked mode).
3. Paste these security rules in the database's **Rules** tab. Anyone may create a round; only whoever holds that round's write token may change it afterward:

   ```json
   {
     "rules": {
       "rounds": {
         "$code": {
           ".read": true,
           ".write": "!data.exists() || newData.child('token').val() === data.child('token').val()"
         }
       }
     }
   }
   ```

4. Copy the `firebaseConfig` object Firebase shows you, and paste it into `golf_games.html` where it says `var SYNC_CONFIG = null;` — so it reads `var SYNC_CONFIG = { apiKey: "...", databaseURL: "...", ... };`. (These values are not secrets; the rules above are what protect the data.)

A **Share round live** card then appears in Setup. Tap *Start sharing*, send the link to the group, and their phones follow along read-only — they can switch tabs and look around, but can't change anything.

Notes:
- The scorer's phone is always the source of truth and keeps working normally with no signal; updates reach spectators once it's back in range. Golf courses have dead zones — expect spectators to lag there, not the scorer.
- Spectators never write to their own device's saved round, so someone can spectate one round and still have their own round intact.
- Round codes are short and readable; the write token is separate and never leaves the scorer's phone.

## Local development

There's nothing to build. Edit the HTML/CSS/JS directly in `golf_games.html` and refresh the browser.

## License

Personal project — no license specified.
