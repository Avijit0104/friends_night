# 🌙 Friend's Night

Party games for your phone, all in one place. Pick a game, share the room code, and bots fill the empty seats.

**Games:** Vault Rush · Chor Police Dakat Babu · Ram Shaayam Jadu Madhu

*Developed by Avijit Bose*

---

- `hub/`: the Friend's Night page (plain HTML/CSS/JS, no build step). `hub/games.json` lists the games.
- `server/`: free hosting on an Oracle Cloud VM: `setup.sh` (one-time setup), `sync.js` (auto-deploy every 2 minutes).
- [GUIDE.md](GUIDE.md): step-by-step hosting guide, plus how to add a new game.

Preview the page on your own computer: `npx serve hub` (or `python -m http.server -d hub`), then open the address it prints.
