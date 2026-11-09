# Friend's Night — hosting guide (Oracle Cloud, free)

> **Not in use right now.** Oracle needs a credit/debit card for sign-up, so Friend's Night runs on **Cloudflare** for now (see README.md). Keep this guide for later, if you get a card.

This puts the Friend's Night hub and all your games on one free Oracle server in India, with free HTTPS. After setup, you keep uploading to GitHub like you do now, and the server picks up the changes by itself within about 2 minutes.

**You'll end up with:**

| Address | What |
|---|---|
| `https://friendsnight.duckdns.org` | the hub page |
| `https://vault.friendsnight.duckdns.org` | Vault Rush |
| `https://cpdb.friendsnight.duckdns.org` | Chor Police Dakat Babu |
| `https://rsjm.friendsnight.duckdns.org` | Ram Shaayam Jadu Madhu |

(`friendsnight` is an example. You pick the name in step 4.)

**You need:** a GitHub account, a debit/credit card (Oracle uses it only to check you're a real person) and about an hour.

---

## 1. Put this folder on GitHub

1. On github.com, create a new **public** repository, for example `friends_night` (done: github.com/Avijit0104/friends_night).
2. Upload everything in this folder (`hub/`, `server/`, `GUIDE.md`, `README.md`, `.gitignore`).

The server will read this repo, so it must stay public (your game repos are already public).

## 2. Create the Oracle Cloud account

1. Go to **cloud.oracle.com** → **Sign up** (the "Free Tier").
2. **Home region: choose `India South (Hyderabad)` or `India West (Mumbai)`.** This can't be changed later, and free servers only run in your home region.
3. Add your card. You won't be charged for anything in this guide: everything used here is labelled "Always Free".

### Keep Oracle from deleting the server for being idle

Oracle may reclaim an "Always Free" server that stays almost idle for 7 days (very low CPU, network *and* memory use). Party games use very little, so this can happen. Two ways to avoid it (check Oracle's current "Always Free" page, the rules can change):

- **Recommended:** upgrade the account to **Pay As You Go** (Billing → Upgrade). Always Free things stay free, and idle reclaiming no longer applies. Then set a **budget alert** (Billing → Budgets → ₹100) so you get an email if anything ever costs money. Only create things marked "Always Free".
- Or stay on Free Tier and accept that you may have to re-create the server. That takes ~15 minutes with this guide, because everything is in GitHub.

## 3. Create the server (VM)

1. Menu → **Compute → Instances → Create instance**.
2. **Image:** click *Change image* → **Canonical Ubuntu 24.04**.
3. **Shape:** click *Change shape* → **Ampere** → **VM.Standard.A1.Flex**, **2 OCPUs and 12 GB memory**. It must show the **"Always Free-eligible"** tag. (Don't pick the AMD "micro" shape, it only has 1 GB.)
4. **Networking:** keep *Create new virtual cloud network* and *Assign a public IPv4 address* = **Yes**.
5. **SSH keys:** choose **Generate a key pair for me** → **Download private key**. Keep this file safe: it's your only way into the server. Save it as e.g. `C:\Users\<you>\.ssh\oracle.key`.
6. Click **Create**. After a minute it shows **Running** and a **Public IP address**. Write that IP down.

> **"Out of capacity"?** Very common for free Ampere servers. Try another *Availability domain* (in the Placement section), try again later (late night works best), or try 1 OCPU / 6 GB.

### Open ports 80 and 443 in Oracle's network

Without this nothing will load, even when everything else is right.

1. On your instance page, click the **Subnet** link → **Security Lists** → the default security list.
2. **Add Ingress Rules**: Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port Range `80`. Save.
3. Add another one the same way with port `443`.

(`setup.sh` opens the same two ports in the server's own firewall. Oracle needs **both**.)

## 4. Get a free web address (DuckDNS)

1. Go to **duckdns.org**, sign in with GitHub or Google.
2. Type a name, e.g. `friendsnight`, click **add domain**.
3. In **current ip**, paste your server's public IP → **update ip**.

Every sub-address (`vault.friendsnight.duckdns.org`, etc.) automatically points to the same server.

## 5. Log in to the server

On your Windows PC, in **PowerShell**:

```powershell
icacls "$HOME\.ssh\oracle.key" /inheritance:r
icacls "$HOME\.ssh\oracle.key" /grant:r "$($env:USERNAME):(R)"
ssh -i "$HOME\.ssh\oracle.key" ubuntu@YOUR.SERVER.IP
```

(The two `icacls` lines are needed once: SSH refuses a key file that other Windows users could read.) Type `yes` the first time it asks.

## 6. Run the setup script

Still connected to the server, paste this (put in **your** repo name, domain and email):

```bash
curl -fsSL https://raw.githubusercontent.com/Avijit0104/friends_night/main/server/setup.sh -o setup.sh
sudo bash setup.sh https://github.com/Avijit0104/friends_night.git friendsnight.duckdns.org you@example.com
```

It takes 5–10 minutes. It installs Node.js 22, pm2 and Caddy, opens the firewall, downloads every game from `hub/games.json`, starts them, gets HTTPS certificates and turns on auto-deploy. At the end it prints a list of your addresses.

The email is optional. Let's Encrypt only uses it to warn you if a certificate ever has a problem.

## 7. Check that it works

1. Open `https://friendsnight.duckdns.org` on your phone. Every card should show a green **Ready to play**.
2. Play a quick game of each with bots.
3. On the server: `pm2 ls` should show every game as **online**.

## 8. Switch over from Render

1. Update the "Play now" links in each game's README to the new addresses.
2. Keep the Render services for a week, just in case.
3. Then in the Render dashboard: each service → **Settings → Suspend** (or delete).

---

## Everyday use

### Update a game
Upload your changes to the game's GitHub repo like you do now. Within ~2 minutes the server pulls them, runs `npm install` and restarts **only that game**.

Rooms are kept in memory, so restarting a game ends the rooms open in it. If a game's health check says rooms are open (Vault Rush's `/healthz` does: `{"ok":true,"rooms":2}`), the update **waits until nobody is playing** (at most 30 minutes). Other games restart right away.

### Update the hub page
Edit files in the `friends_night` repo. Live within ~2 minutes.

### Add a new game
The game must:
- be a Node.js app that starts with `npm start`,
- listen on the port in the `PORT` environment variable (`process.env.PORT`),
- have a health check address that answers when it's running (e.g. `/healthz`).

Then:
1. Put its icon in `hub/games/<id>/` (square PNG or SVG).
2. Add an entry to `hub/games.json` (copy an existing one). Fields the server uses:

   | Field | Example | Rule |
   |---|---|---|
   | `id` | `"ludo-king"` | lowercase letters, digits, dashes; unique |
   | `subdomain` | `"ludo"` | the game's address: `ludo.friendsnight.duckdns.org` |
   | `port` | `3004` | unique; next free number (3001–3003 are taken) |
   | `repo` | `"https://github.com/Avijit0104/ludo.git"` | public repo |
   | `branch` | `"main"` | |
   | `health` | `"/healthz"` | |
   | `humans` | `[1, 6]` | min and max **people** (bots fill the rest) for the player-count filter |

   The other fields (`name`, `tagline`, `about`, `howTo`, `seats`, `time`, `tags`, `accent`, `bg`, `icon`, `screenshots`, `url`) are what the hub shows.

   On the Oracle server, also set `"hosting": "own-server"` at the top of `games.json`, so the hub links to the `<subdomain>.<your domain>` addresses instead of each game's `url`.
3. Upload. Within ~2 minutes the game is cloned, installed and started, gets its own HTTPS address, and shows up on the hub.

### Remove a game
Delete its entry from `hub/games.json`. The server stops it at the next sync.

---

## Useful commands (on the server)

| Command | What it does |
|---|---|
| `pm2 ls` | every game, its status, memory and restarts |
| `pm2 logs vault-rush` | live log of one game (Ctrl+C to stop) |
| `pm2 restart vault-rush` | restart one game by hand |
| `pm2 monit` | live CPU/memory dashboard |
| `journalctl -u friendsnight-sync -n 50` | what auto-deploy did recently |
| `sudo systemctl start friendsnight-sync` | run auto-deploy right now |
| `journalctl -u caddy -n 50` | web server / HTTPS log |
| `curl localhost:3003/stats` | Vault Rush's own load numbers |

Ubuntu installs security updates by itself. About once a month, run `sudo apt update && sudo apt upgrade -y` and, if it says a restart is required, `sudo reboot`. Everything comes back on its own after a reboot.

## Troubleshooting

| Problem | Fix |
|---|---|
| Nothing loads at all | Ports 80/443 open in the Oracle **Security List** (step 3)? DuckDNS IP correct (step 4)? |
| Browser warns about the certificate | Wait a minute after setup. Still wrong: `journalctl -u caddy -n 50`. Usually the ports or the DuckDNS IP. |
| A card on the hub is red | `pm2 ls` and `pm2 logs <id>`. A game that keeps crashing waits longer between restarts. |
| An update didn't arrive | `journalctl -u friendsnight-sync -n 50`. It might be waiting for players to finish (see "Update a game"). |
| Server IP changed (after re-creating the VM) | Put the new IP in DuckDNS. |
