# 🌙 Friend's Night

Party games for your phone, all in one place. Pick a game, share the room code, and bots fill the empty seats.

**Games:** Vault Rush · Chor Police Dakat Babu · Ram Shaayam Jadu Madhu

*Developed by Avijit Bose*

---

## What's in here

- `hub/`: the Friend's Night page (plain HTML/CSS/JS, no build step). `hub/games.json` lists the games.
- `wrangler.jsonc`: hosts `hub/` on Cloudflare Workers (free plan, static files only).
- `server/` + [GUIDE.md](GUIDE.md): an alternative setup for one Oracle Cloud server. Not in use (Oracle needs a card).

## Hosting (Cloudflare, free)

The hub is a Cloudflare Worker named `friends-night`, connected to this GitHub repo. Every push to `main` goes live within a minute or two. Each game is its own Cloudflare Worker (or still on Render), and the hub just links to it.

| Game | Address |
|---|---|
| Chor Police Dakat Babu | https://cpdb.avibose000.workers.dev |
| Ram Shaayam Jadu Madhu | https://rsjm.avibose000.workers.dev |
| Vault Rush | Render for now |

## Adding a game

1. Put its icon in `hub/games/<id>/` (square PNG or SVG; screenshots optional).
2. Copy an entry in `hub/games.json` and change it:
   - `id`: lowercase, unique, e.g. `ludo`
   - `url`: the game's address (where **Play** goes)
   - `health`: an address on the game that answers quickly, e.g. `/healthz` (drives the status light)
   - `humans`: `[min, max]` **people** (bots fill the rest), used by the "How many of you?" filter
   - `name`, `short`, `tagline`, `about`, `howTo`, `seats`, `time`, `tags`, `accent`, `bg`, `icon`, `screenshots`: what the card and the "How to play" sheet show
   - `subdomain`, `repo`, `branch`, `port`: only used by the Oracle setup
3. Push. The new card appears on the hub.

## Preview on your computer

`python -m http.server -d hub` (or `npx serve hub`), then open the address it prints. To test with Cloudflare's own server: `npx wrangler@4 dev`.
