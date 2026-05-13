# chore-app

A small self-hosted web app that gates your kids' internet access on chore completion. Each kid has a chore list for the day; when they finish their chores, their devices come off the Pi-hole "Kids_Blocked" group **and** off the UniFi mac-blocked-list, restoring full internet. At their bedtime, a cron job re-blocks them. A morning reset clears yesterday's completions and re-blocks everyone, so they wake up needing to earn their access back.

It is opinionated and homelab-shaped: it expects **Pi-hole v6** and a **UniFi OS** controller, both reachable from the container, and assumes you run it behind a reverse proxy on a LAN-only hostname.

## How blocking works

Two enforcement layers, toggled together:

- **Pi-hole** — a `Kids_Blocked` group with a deny-all blocklist. Each kid's MACs move between `Kids_Unblocked` and `Kids_Blocked`. Members get DNS-level NXDOMAIN for everything. This is the heavy hammer.
- **UniFi** — one of three strategies, picked by `UNIFI_ENFORCEMENT_MODE`:
  - `traffic_rule` *(default)* — toggle a per-kid Traffic Rule (`chorepass:<slug>`) that blocks internet only. The kid stays on Wi-Fi and can still reach the chore-app's UI to check off chores. This is what you want for the daytime chore gate. **Requires a modern UniFi Cloud Gateway (UDM/UXG/UCG). See the USG note below.**
  - `mac_block` — the controller's per-MAC `cmd/stamgr block-sta` flag. Disconnects the device from Wi-Fi entirely. Useful for a hard bedtime "device off" semantic. Works on all UniFi gateways including legacy USG.
  - `none` — skip the UniFi layer entirely; rely on Pi-hole alone. Use this if you're on a legacy USG and don't want the disconnect side effect of `mac_block`. Accepts the tradeoff that a kid using DNS-over-HTTPS or iCloud Private Relay can bypass the gate (Pi-hole sees no queries to deny).

> **Legacy USG note.** The original UniFi Security Gateway line (UGW3 / USG-Pro-4 / USG-XG-8) **does not support v2 Traffic Rules.** The controller accepts the API call and stores the rule; the gateway silently never enforces it. If you're on USG hardware, set `UNIFI_ENFORCEMENT_MODE=none` (and accept the DoH-bypass risk) or `mac_block` (and accept the disconnect side effect). `traffic_rule` mode will appear to work in logs but produce no actual gateway enforcement. Upgrading to a Cloud Gateway (UDM/UXG/UCG) unlocks the `traffic_rule` mode without any code or config change.

If either layer fails the gate operation reports `ok: false` but the other layer is still applied, so partial failures degrade closed.

State of the gate is logged to a `gate_log` table; the parent UI's "Today" tab shows the latest action (block/unblock) per kid plus whether they've earned unblock by the chore rule.

**What this won't catch:** cellular data, mobile hotspots, and any device on a Wi-Fi network you don't run. The app gates the LAN; it doesn't reach beyond it.

## Requirements

- Linux host with Docker + Docker Compose
- Pi-hole v6 (the v6 API is required — v5 will not work)
- UniFi OS controller (Dream Machine, Cloud Gateway, UNVR, etc.) reachable over HTTPS
- A reverse proxy fronting the app on your LAN (Caddy, Nginx Proxy Manager, etc.) — the app does not terminate TLS
- A device-to-kid MAC mapping you actually know and trust
- **Stable MACs on the kid devices.** iOS "Private Wi-Fi Address" and Android MAC randomization will silently break the gate by handing each device a fresh MAC per network. Disable randomization for your home SSID on every kid device, or the app will appear "stuck blocked" the moment a device rerolls.

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
2. Add kids in the **Kids** tab. For each kid: name, slug (used in URLs), per-weekday bedtimes (each day can have its own time, or be left empty to skip a scheduled block), and one or more device MACs.
3. Add chores in the **Chores** tab and assign them to kids per weekday.
4. Hand each kid the URL `https://<your-host>/kid/<slug>` — that's their view. There's no auth on the kid page; treat the slug like a shared secret.

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
| `UNIFI_ENFORCEMENT_MODE` | `traffic_rule` *(default)*, `mac_block`, or `none`. Set to `none` on legacy USG hardware. See **How blocking works** above. |
| `TZ` | Timezone for cron schedules. Default `America/New_York` |
| `HISTORY_RETENTION_DAYS` | First-boot seed only for the in-app retention setting. Default `90`. After first boot, change it under Settings → history retention; the env var is ignored. |

The compose file uses `${VAR:?msg}` substitution, so the stack will refuse to start if any required secret is unset.

### Pi-hole setup

The chore-app's only Pi-hole responsibility is moving each kid's MAC between two groups — `PIHOLE_UNBLOCKED_GROUP` and `PIHOLE_BLOCKED_GROUP` (defaults: `Kids_Unblocked`, `Kids_Blocked`). It does not configure adlists, regex rules, or the meaning of those groups for you. **You decide what makes membership in the blocked group actually block traffic.**

Two common recipes:
- **Deny-list scoped to the blocked group** — attach an aggressive adlist (or a `.*` regex deny) to only `Kids_Blocked`. Members of that group resolve nothing; everyone else is unaffected.
- **Default-deny + allow-list scoped to the unblocked group** — keep your normal adlists on Default, then put allow rules / a permissive group on `Kids_Unblocked` that exempts members. Toggle exemption by group membership.

Whichever you pick:
1. Create both groups in Pi-hole (Group management).
2. Attach whatever lists/rules implement your block semantics.
3. Add each kid device as a Pi-hole client by MAC and put it in `Kids_Unblocked` to start.
4. Generate an application password under Settings → API and put it in `PIHOLE_PW`.

> **If you skip step 2, the Pi-hole layer is a no-op.** The chore-app will happily move clients between two empty groups; UniFi alone will be doing all the actual blocking. That's still a working gate, but you've lost the defense-in-depth — if a kid finds a way around the L2 block (ethernet, hotspot off-host, etc.) and you assumed Pi-hole was a fallback, it isn't.

The app resolves group IDs by name at runtime, so you can rename the groups via the env vars if you'd rather.

### UniFi setup

1. In UniFi OS, create a local admin account (one that authenticates against the controller, not your Ubiquiti SSO) with network admin permissions on the site you'll target. The exact menu wording depends on firmware — look for "local-only" or "restricted" admin options. Recommended username: `chore-bot`.
2. Make sure the controller is reachable from the chore-app container over HTTPS. The app uses cookie-based auth and tolerates self-signed certs.
3. **If `UNIFI_ENFORCEMENT_MODE=traffic_rule` (the default)**, create one disabled Traffic Rule per kid before starting the app. The app finds rules by description and toggles `enabled`; it does not create them.

   Description format: `chorepass:<kid-slug>` (must match the kid's `slug` exactly).

   Required fields:
   - `enabled: false` (chorepass toggles this)
   - `action: BLOCK`
   - `matching_target: INTERNET`
   - `target_devices`: one `{ type: "CLIENT", client_mac: "..." }` entry per MAC for that kid

   On UniFi Network 9.x and earlier the Traffic Rules UI lives at **Settings → Internet → Traffic Management → Traffic Rules**. On Network 10.x the v2 Traffic Rules API still works but is no longer exposed in the UI — create the rules via `POST /proxy/network/v2/api/site/<site>/trafficrules`. Example payload:

   ```json
   {
     "description": "chorepass:kid-one",
     "enabled": false,
     "action": "BLOCK",
     "matching_target": "INTERNET",
     "target_devices": [
       { "type": "CLIENT", "client_mac": "aa:bb:cc:dd:ee:ff" }
     ],
     "domains": [], "ip_addresses": [], "ip_ranges": [],
     "regions": [], "app_category_ids": [], "app_ids": [], "network_ids": [],
     "bandwidth_limit": { "enabled": false, "download_limit_kbps": 1024, "upload_limit_kbps": 1024 },
     "schedule": { "mode": "ALWAYS", "repeat_on_days": [], "time_all_day": true }
   }
   ```

   The `schedule` field is load-bearing: leaving `time_all_day: false` with a `time_range_start` / `time_range_end` pair silently restricts enforcement to that window even when `mode` is `"ALWAYS"`. Use `time_all_day: true` (and omit the range fields) for a 24/7 rule.

   Whenever a kid's MAC list changes in chorepass, update the rule's `target_devices` to match (chorepass does not currently sync this automatically — tracked separately).

## Daily flow

- **06:00** — morning reset clears yesterday's completions and re-blocks every kid.
- During the day — when a kid checks off all their assigned chores for the current weekday, the app calls `gate.unblock` and their devices go free.
- **At each kid's bedtime for the current weekday** — the per-(kid, weekday) cron job calls `gate.block`. Days left empty in the bedtime grid simply have no scheduled block.
- Parents can force block/unblock from the **Today** tab at any time; that overrides the rule until the next scheduled event.

## Security notes

- This app is intended to run **LAN-only**. Don't expose it publicly. There is no rate limiting, no MFA, and the kid pages have no auth at all (URL = the auth).
- The parent area is protected by a numeric PIN. It is hashed in the settings table and the cookie is signed with `SESSION_SECRET`. Pick a long random secret.
- The app talks to Pi-hole and UniFi over HTTPS but does not validate the controller's certificate (homelab self-signed reality). Keep that traffic on your LAN.
- Don't reuse network-admin credentials for `UNIFI_USER` — make a dedicated account so you can rotate it.
- **Back up `./data/chores.db`.** That single file holds your kid records, MAC mappings, completion history, gate log, and the parent PIN hash. It's the only stateful thing the app produces.

## Development

```bash
# install both workspaces from the repo root
npm run install:all

# run server + web concurrently
npm run dev
```

Or run them in separate terminals: `npm --prefix server run dev` and `npm --prefix web run dev`. The web dev server proxies `/api` to the server on `:3000` (see `web/vite.config.ts`).

`server/src/scripts/test-pihole.ts` and `test-unifi.ts` exercise the integrations against your real controllers — use a non-critical test MAC.

## License

MIT — see [LICENSE](LICENSE).
