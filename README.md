# chore-app

A small self-hosted web app that gates your kids' internet access on chore completion. Each kid has a chore list for the day; when they finish their chores, their devices come off the Pi-hole "Kids_Blocked" group **and** off the UniFi mac-blocked-list, restoring full internet. At their bedtime, a cron job re-blocks them. A morning reset clears yesterday's completions and re-blocks everyone, so they wake up needing to earn their access back.

It is opinionated and homelab-shaped: it expects **Pi-hole v6** and a **UniFi OS** controller, both reachable from the container, and assumes you run it behind a reverse proxy on a LAN-only hostname.

## How blocking works

Two enforcement layers, applied to every MAC associated with a kid:

- **Pi-hole** — a `Kids_Blocked` group with a deny-all blocklist. Members get DNS-level NXDOMAIN for everything. This is the heavy hammer.
- **UniFi** — the controller's per-MAC block flag. This catches devices that have hard-coded DNS or DoH and would otherwise bypass Pi-hole.

Both are toggled together. If either fails the gate operation reports `ok: false` but the other layer is still applied, so partial failures degrade closed.

State of the gate is logged to a `gate_log` table; the parent UI's "Today" tab shows the latest action (block/unblock) per kid plus whether they've earned unblock by the chore rule.

## Requirements

- Linux host with Docker + Docker Compose
- Pi-hole v6 (the v6 API is required — v5 will not work)
- UniFi OS controller (Dream Machine, Cloud Gateway, UNVR, etc.) reachable over HTTPS
- A reverse proxy fronting the app on your LAN (Caddy, Nginx Proxy Manager, etc.) — the app does not terminate TLS
- A device-to-kid MAC mapping you actually know and trust

## Quick start

```bash
git clone https://github.com/<your-fork>/chore-app.git
cd chore-app
cp .env.example .env
# edit .env — see Configuration below
docker compose up -d --build
```

App listens on `:3000`. Point your reverse proxy at it (LAN-only access list strongly recommended) and open the result in a browser.

First boot:
1. The `PARENT_PIN_DEFAULT` from your `.env` is hashed into the settings table — change it from the in-app **Settings** tab afterward.
2. Add kids in the **Kids** tab. For each kid: name, slug (used in URLs), bedtime, and one or more device MACs.
3. Add chores in the **Chores** tab and assign them to kids per weekday.
4. Hand each kid the URL `https://<your-host>/<slug>` — that's their view, no auth required.

## Configuration

All config is environment variables. See `.env.example` for the full list.

| Var | Purpose |
|---|---|
| `SESSION_SECRET` | Long random string — used to sign the parent session cookie. Required. |
| `PARENT_PIN_DEFAULT` | Seed PIN, only used on first boot to populate the settings table. Change in-app afterward. |
| `PIHOLE_HOST` | Pi-hole base URL, e.g. `https://192.168.1.254` |
| `PIHOLE_PW` | Pi-hole v6 application password (Settings → API) |
| `PIHOLE_UNBLOCKED_GROUP` | Name of the unblocked group. Default `Kids_Unblocked` |
| `PIHOLE_BLOCKED_GROUP` | Name of the blocked group. Default `Kids_Blocked` |
| `UNIFI_HOST` | UniFi controller URL, e.g. `https://192.168.1.10` |
| `UNIFI_USER` | Local-admin username (recommend a dedicated `chore-bot` account) |
| `UNIFI_PW` | Password for that account |
| `UNIFI_SITE` | UniFi site identifier. Default `default` |
| `TZ` | Timezone for cron schedules. Default `America/New_York` |
| `HISTORY_RETENTION_DAYS` | How long to keep completion history + gate log. Default `90` |

The compose file uses `${VAR:?msg}` substitution, so the stack will refuse to start if any required secret is unset.

### Pi-hole setup

1. Create two groups: `Kids_Unblocked` (your default group) and `Kids_Blocked`.
2. Attach a deny-all blocklist (e.g. a single regex `.*`) to **only** the `Kids_Blocked` group.
3. Add each kid device as a Pi-hole client by MAC and put them in `Kids_Unblocked` to start.
4. Generate an application password under Settings → API → Application password — that's `PIHOLE_PW`.

The app resolves group IDs by name at runtime, so you can rename the groups via the env vars if you'd rather.

### UniFi setup

1. Create a local admin account (UniFi OS → Admins → Add → "Restrict to local access only"). Give it network admin permissions on the site you'll target. Recommended username: `chore-bot`.
2. Make sure the controller is reachable from the chore-app container over HTTPS. The app uses cookie-based auth and tolerates self-signed certs.

## Daily flow

- **06:00** — morning reset clears yesterday's completions and re-blocks every kid.
- During the day — when a kid checks off all their assigned chores for the current weekday, the app calls `gate.unblock` and their devices go free.
- **At each kid's bedtime** — a per-kid cron job calls `gate.block`.
- Parents can force block/unblock from the **Today** tab at any time; that overrides the rule until the next scheduled event.

## Security notes

- This app is intended to run **LAN-only**. Don't expose it publicly. There is no rate limiting, no MFA, and the kid pages have no auth at all (URL = the auth).
- The parent area is protected by a numeric PIN. It is hashed in the settings table and the cookie is signed with `SESSION_SECRET`. Pick a long random secret.
- The app talks to Pi-hole and UniFi over HTTPS but does not validate the controller's certificate (homelab self-signed reality). Keep that traffic on your LAN.
- Don't reuse network-admin credentials for `UNIFI_USER` — make a dedicated account so you can rotate it.

## Development

```bash
# server
cd server && npm install && npm run dev

# web (separate terminal)
cd web && npm install && npm run dev
```

The web dev server proxies `/api` to the server on `:3000` (see `web/vite.config.ts`).

`server/src/scripts/test-pihole.ts` and `test-unifi.ts` exercise the integrations against your real controllers — use a non-critical test MAC.

## License

MIT — see [LICENSE](LICENSE).
