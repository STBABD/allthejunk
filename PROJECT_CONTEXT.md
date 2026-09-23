# Clubhouse Ledger — Project Context

*This file is meant to let any future session — human or AI — pick up development without re-deriving decisions already made. If something here seems wrong or outdated, treat that as a signal to ask the user before changing it, not to silently "fix" it.*

---

## What this is

A mobile-first web app for tracking golf side-game bets during a round — Wolf, Snake, Dots, and Nassau — with handicap-aware scoring and a unified "who pays whom" Ledger. Built for a small private group (not a public product; see "App-store publishing" under Decisions).

**Live app:** `https://stbabd.github.io/allthejunk/golf_games.html`
**Repo:** `https://github.com/STBABD/allthejunk`, served by GitHub Pages directly from `main` (no build step — the merged file *is* the live file).

---

## Architecture at a glance

- **`golf_games.html`** — the entire app. Plain HTML/CSS/JS in one file, no framework, no bundler. A custom `el(tag, attrs, children)` helper builds the DOM instead of a templating library. A single `render()` function redraws everything from a module-level `state` object each time something changes.
- **`functions/`** — one Firebase Cloud Function, `readScorecard`. This is the *only* server-side code in the project, and it exists solely because reading a scorecard image with Claude's vision API requires an API key that can never be exposed client-side. **Deployed separately from git**, via `firebase deploy --only functions` using the Firebase CLI directly — not part of the GitHub Pages flow. Confirm this folder is actually committed to git before assuming a fresh clone has it.
- **Firebase**: Authentication (email/password) + Realtime Database (**not** Firestore) + the one Cloud Function above, on the Blaze (pay-as-you-go) plan (required for the Function's outbound network calls).

---

## Data model

### Round state (client-side, the heart of the app)
Everything about the round currently being played lives in one JS object, persisted to `localStorage` and synced to Firebase. Key fields:
- `players[]`, `handicaps[]`, `activePlayers` (2–6)
- `holePar{}`, `holeHcp{}` — keyed by hole number 1–18
- `scores{}`, `putts{}` — gross strokes and putts per hole per player
- `wolf{}`, `dots{}`, `nassau{teamA[], teamB[], autoPress, autoPressThreshold, manualPresses[]}`
- `points{greenie, sandy, birdie, eagle, poley, barky, watery, threeputt}` — configurable payout per event
- `gamesEnabled{wolf, snake, dots, nassau}` — per-round toggles
- `wolfUnit`, `snakeStake`, `nassauUnit`, `dollarPerPoint`
- `courseName` (read-only, set only via search/upload/library — not manually editable, by design), `roundName` (auto-defaults to `"<date> – <player names>"`, editable)

Any new persistent field needs to be added to `defaultState` **and** to both of the two migration call-sites that upgrade older saved states — missing one has caused bugs before.

### Realtime Database — per-user paths only
```
/archive/{uid}/{roundId}       completed rounds (full state JSON in a `state` field)
/archiveUnclaimed/{id}         legacy orphaned rounds; any signed-in user can claim one
/courseLibrary/{uid}/{id}      each user's saved courses (name, holePar, holeHcp)
/rounds/{...}                  open read/write; live-share/spectate links
```
**Why per-user paths, specifically:** RTDB cannot authorize a `.limitToLast()` (or similar) *query* against a security rule defined at a child level — it can't know which children satisfy a data-dependent rule before deciding "the last N." A flat `archive/{roundId}` structure with a rule like `archive/$id: {.read: "...owner check..."}` will reject *any query* against the parent, even though the rule is logically correct. The fix that actually works is defining the rule at the exact path being read (`archive/$uid`) and never querying above it. **Do not flatten this back down** without understanding this — it was a significant, confirmed debugging effort (verified directly via Firebase's Rules Playground).

### Current security rules
```json
{
  "rules": {
    "rounds": { ".read": true, ".write": true },
    "archive": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "archiveUnclaimed": {
      ".read": "auth != null",
      "$id": { ".write": "auth != null" }
    },
    "courseLibrary": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

---

## Course data — sourcing strategy

Three layers, in the order a user actually hits them:
1. **OpenGolfAPI** (`api.opengolfapi.org/v1`, free, no key, called directly from the browser) — reliably has Par; **frequently missing Stroke Index**. This is a confirmed, verified limitation of their underlying (crowdsourced) data — not a parsing bug. Don't "fix" this again without re-testing against the real API first.
2. **AI-vision scorecard upload** — photos and PDFs are both sent to the `readScorecard` Cloud Function, which asks Claude to read the actual card. This is the reliable path for real Stroke Index data. The function's prompt is deliberately written to (a) return `null` rather than guess any value it can't clearly read, and (b) correctly pick the Men's row over a Ladies'/forward-tee row on cards with ambiguous, unlabeled multi-tee handicap sections. PDFs are rendered to an image client-side and sent through the *same* vision path as photos — text-extraction-based parsing was tried first and abandoned because PDF internal text order doesn't reliably match visual reading order.
3. **Course Library** — once a course is successfully loaded via either path above, it's cached per-user in Firebase (`courseLibrary/{uid}/...`) so it's never looked up twice.
4. **Manual entry** — an always-available, always-editable 18-hole Par/Stroke-Index grid as the final fallback.

**A paid third-party provider (Golf Intelligence / Stracka Intelligence) was purchased ($49/50 credits) specifically to get more reliable Stroke Index data, but is NOT integrated into the app.** Their API is currently returning empty results / access errors for reasons that appear to be an account-provisioning problem on their end (the OAuth token's scope came back as `profile offline_access`, unrelated to course data, despite a paid and supposedly-active plan). Do not build an integration against this API without first getting one verified, real, successful response (e.g., via Postman) — this discipline is what caught the OpenGolfAPI issues early and should be repeated here.

---

## Scoring model

**Core principle: gross-wins, not zero-sum.** Winners gain points; losers simply gain nothing from that specific event (no one goes negative from a single hole/bet). Final settlement — converting everyone's combined totals into an actual "who pays whom" — happens exactly once, in the Ledger, via pairwise differences sorted low to high.

- **Wolf** — role rotates by hole; wolf picks a partner or goes alone; winner can be auto-computed from net scores or manually overridden. Payout is **flat per winning player**, based on how many consecutive pushes preceded the hole (1pt normal win, 2pt after one push/carryover, 3pt after two, etc.) — **team size does not scale the payout**.
- **Snake** — derived automatically from putts entered. A single fixed threshold (3 putts) applies to every player — this was deliberately simplified from an earlier per-player-customizable version. Holder passes to whoever next hits the threshold; ties broken by tapping who finished last. Stake is added to every *other* player's total at settlement.
- **Dots** — Birdie/Eagle automatic from gross vs. par. Greenie (par-3 only), Sandy, Barky (tree/pole recovery), and Watery (water hazard recovery) are all manual **and require the player to have made par or better on that hole** — enforced both in the UI (checkbox disabled otherwise) and independently in the scoring calculation. Poley is manual with **no** par requirement (confirmed distinct from Barky, not a duplicate). 3-Putt is automatic and pays snake-style — every other player gains a dot, and multiple 3-putters on one hole compound (two 3-putters = everyone else gets +2).
- **Nassau** — teams (Team A / Team B, any split) play three independent net-best-ball match-play bets: Front 9, Back 9, Overall. A bet only pays once every hole in its range is recorded. **Presses** are additional side-bets that start partway through a segment and run to the same end point, stacking alongside the original bet rather than replacing it — triggerable manually or automatically (when a team falls behind by a configurable margin), and a press can itself spawn a child press if it falls behind, but each match can only ever spawn one press.
- Every game above is independently toggleable per round (`gamesEnabled`); a disabled game contributes nothing to the Ledger and disappears from its sub-tab.

---

## UI structure

- **Bottom nav:** Dashboard · Round · Ledger. (History was deliberately removed as a standalone tab — reached instead via a "Recent rounds" list on the Dashboard.)
- **Round tab** has its own sub-tab pills (Score / Wolf / Snake / Dots / Nassau — only for enabled games). Setup is reached via an "Edit" button or the initial "Tee off" flow, not a persistent pill.
- **Header hole-navigator** (prev/next arrows, current hole, read-only Par/Stroke-Index) only shows on actual scoring sub-tabs — hidden on Setup, Dashboard, Ledger. Editing Par/Stroke-Index only happens in Setup's dedicated grid, to prevent accidental mid-round changes. Any hole-navigation action, from anywhere, always returns you to the Score sub-tab.
- **Score screen** ends with working Previous/Next Hole buttons and the app's *only* "Complete round" button (deliberately removed from the round-overview card that used to also show it, to reduce clutter).
- **Setup screen order** (deliberately sequenced): Load a course → Upload a scorecard → Course setup grid → Group size → Names & handicap → Round name → Games in play → Nassau config (if enabled) → Point values → reset/save controls → Tee off.
- Wide tables (the 8-column Dots table, the full 18-hole scorecard in the Ledger) use horizontal-scroll containers with explicit scroll hints rather than shrinking to fit a phone screen.

---

## Git / deployment workflow

Every change ships as its own branch and PR against `main`:
```bash
git checkout main && git pull origin main
git checkout -b <branch-name>
# replace golf_games.html
git add golf_games.html && git commit -m "..."
git push -u origin <branch-name>
# open PR, merge via GitHub's UI
```
GitHub Pages redeploys automatically within ~1–2 minutes of a merge — there is no staging environment and no CI build step. The Cloud Function deploys through a completely separate pathway (Firebase CLI, not git) — easy to forget since it's a different mental model than everything else here.

---

## Known active issue

**Golf Intelligence (Stracka) paid API access is broken** — see "Course data" above. Third support email sent, citing the specific OAuth scope evidence; awaiting reply. No integration code exists for this yet; don't write any until a verified real response is in hand.

---

## Decisions worth respecting, not re-litigating

- Single static file, no framework, no general backend — the one Cloud Function is a narrow, deliberate exception, not a first step toward a bigger backend.
- Realtime Database, not Firestore, and specifically the per-user path structure described above.
- Gross-wins scoring, not zero-sum.
- The app should never fabricate a data value it can't verify — always show a gap plainly rather than guess convincingly.
- App-store publishing has been discussed only as a *possible future* direction, explicitly not current scope — it would require real architectural changes and new recurring costs (e.g., Golf Intelligence's own licensing jumps from $49 one-time to $399/month once an app is distributed beyond personal use). Don't treat it as an implicit goal of ongoing work.

---

## Working style that's worked well on this project

- Verify third-party API behavior with a real, screenshotted response before writing integration code against it — guessing at request/response shapes has cost real time and money here more than once.
- For scoring-logic changes, write a small disposable Node.js script that mocks `document`/`firebase` and directly exercises the relevant functions from the extracted `<script>` block before shipping — there's no persistent test suite, but this discipline has caught real bugs (e.g., an auto-press triggering repeatedly instead of once) before they reached production.
- This is money-adjacent software for real people — err toward showing an honest "I don't know" over a plausible-looking guess, anywhere in the app.
