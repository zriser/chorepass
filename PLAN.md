# Chore App — Build Plan

_Last updated: 2026-04-19_

A family chore management system that gates kids' internet access (via Pi-hole + UniFi) until their chores are complete.

---

## 1. Decisions locked

| Area | Decision |
|---|---|
| Kid auth | Tap avatar, no PIN (may add per-kid PIN later) |
| Unlock rule | All of today's assigned chores complete (pluggable via `unlockRule.ts` — will evolve to 50%-then-reblock for summer) |
| Weekday variation | Yes — per-chore weekday mask |
| Bedtime | Per-kid, stored on `kids.bedtime` |
| Devices | All Wi-Fi (phones / tablets / desktops) |
| Timezone | `America/New_York` |
| External orchestration | **Skip n8n.** App calls Pi-hole + UniFi directly. |
| History | Auto-prune, default 90 days (env-tunable) |

---

## 2. Tech stack

| Layer | Pick |
|---|---|
| Frontend | React (Vite) + Tailwind |
| Backend | Node 22 / Express / TypeScript |
| DB | SQLite via better-sqlite3 |
| Scheduler | node-cron (in-process) |
| Hosting | Docker Compose → Portainer stack; NPM reverse proxy at `chores.zachriser.com` (LAN-only) |

---

## 3. Architecture

```
┌────────────┐                    ┌────────────────────────┐  HTTPS  ┌──────────┐
│ Kid device │ ─── tap chore ───▶ │ chore-app              │ ──────▶ │ Pi-hole  │
│ (WiFi MAC) │                    │ Node/Express + SQLite  │ ──────▶ │ UniFi    │
└────────────┘                    │                        │         └──────────┘
┌────────────┐                    │  node-cron:            │
│ Parent web │ ─── PIN-gated ───▶ │   06:00 reset+block    │
└────────────┘                    │   per-kid bedtime      │
                                  │   nightly prune        │
                                  └────────────────────────┘
```

### Backend module layout

```
server/src/services/
├── gate.ts          # applyGate(kid, desiredState) → pihole + unifi, idempotent, logs to gate_log
├── pihole.ts        # login (SID), move client MAC between Kids_Unblocked/Kids_Blocked groups
├── unifi.ts         # login (cookie jar), block-sta / unblock-sta
├── scheduler.ts     # node-cron: 06:00 reset, per-kid bedtime, nightly prune
└── unlockRule.ts    # shouldBeUnlocked(kid, date) — swap body to change rule
```

---

## 4. External APIs (reference)

### Pi-hole v6

Auth is session-based (v6 changed from v5):
- `POST /api/auth` body `{"password":"..."}` → `{sid, csrf, validity}`
- Pass `X-FTL-SID: <sid>` header on subsequent calls
- Use an **application password** generated in web UI, not admin password

Blocking (global, **not per-group**):
- `POST /api/dns/blocking` body `{"blocking": true|false, "timer": <sec>}`

Groups:
- `GET/POST /api/groups`, `GET/PUT/DELETE /api/groups/{name}`

Clients (by MAC):
- `POST /api/clients` body `{"client":["aa:bb:cc:dd:ee:ff"], "comment":"Lily's iPad", "groups":[2]}`
- `PUT /api/clients/{client}` body `{"comment":"...", "groups":[...]}`

**Gating strategy**: move a kid's client MAC between two groups — `Kids_Unblocked` (permissive) and `Kids_Blocked` (block-everything adlists). Pi-hole has no per-group disable endpoint.

### UniFi

Two auth options; **use legacy cookie auth** for this project (official integrations API doesn't fully expose block-sta yet):
- `POST /api/auth/login` (UniFi OS) body `{username, password}` → sets session cookie
- Block: `POST /proxy/network/api/s/{site}/cmd/stamgr` body `{"cmd":"block-sta","mac":"..."}`
- Unblock: same path, `"cmd":"unblock-sta"`

Requires a **local admin account** (not UI/SSO account). Disable MFA on that account.

---

## 5. DB schema

```sql
kids(id, name, slug, avatar, bedtime TEXT /* 'HH:MM' */, created_at)
kid_macs(id, kid_id, mac, label, created_at)  /* 1:many — a kid may have multiple devices */
chores(id, name, points, active, created_at)
chore_assignments(id, chore_id, kid_id, weekday_mask INT /* bits 0-6, Sun-Sat */)
completions(id, kid_id, chore_id, completed_at, completed_by /* 'kid'|'parent' */)
gate_log(id, kid_id, action /* 'block'|'unblock' */, source /* 'schedule'|'chore'|'manual' */,
         pihole_ok INT, unifi_ok INT, error TEXT, created_at)
settings(key, value) /* parent_pin_hash, history_retention_days, etc. */
```

Gating operations iterate all of a kid's MACs (Caleb has 2, for example).

---

## 6. API contract (chore-app backend)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/parent/login` | Parent PIN → session cookie |
| GET | `/api/kids` | List kids |
| POST | `/api/kids` | Add kid `{name, slug, bedtime, avatar?, macs: [{mac, label?}]}` |
| PUT | `/api/kids/:id` | Update kid |
| DELETE | `/api/kids/:id` | Remove kid |
| GET | `/api/kids/:slug/today` | Kid's chores + completion state for today |
| POST | `/api/kids/:slug/complete/:choreId` | Mark chore done (kid) |
| POST | `/api/kids/:slug/uncomplete/:choreId` | Parent override |
| GET | `/api/chores` | All chore templates |
| POST | `/api/chores` | Create chore `{name, kidIds[], weekdays[], points?}` |
| PUT | `/api/chores/:id` | Edit chore |
| DELETE | `/api/chores/:id` | Remove chore |
| GET | `/api/history?kidId=&from=&to=` | Completion history |
| POST | `/api/admin/reset-day` | Manual trigger for daily reset |
| POST | `/api/admin/force-block` | `{kidId?}` (all if omitted) |
| POST | `/api/admin/force-unblock` | `{kidId}` |
| GET | `/api/admin/gate-status` | Current block state per kid |
| GET | `/api/admin/gate-log?kidId=&limit=` | Debug view of gate actions |

---

## 7. Project structure

```
chore-app/
├── PLAN.md
├── TODO.md
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── db.ts
│   │   ├── routes/
│   │   │   ├── kids.ts
│   │   │   ├── chores.ts
│   │   │   ├── completions.ts
│   │   │   ├── admin.ts
│   │   │   └── auth.ts
│   │   ├── services/
│   │   │   ├── gate.ts
│   │   │   ├── pihole.ts
│   │   │   ├── unifi.ts
│   │   │   ├── scheduler.ts
│   │   │   └── unlockRule.ts
│   │   └── types.ts
│   ├── migrations/
│   │   └── 001_init.sql
│   └── scripts/
│       ├── seed.ts
│       └── seed.json
├── web/
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── KidView.tsx
│   │   │   └── Parent.tsx
│   │   ├── components/
│   │   │   ├── ChoreCard.tsx
│   │   │   ├── ProgressRing.tsx
│   │   │   └── PinGate.tsx
│   │   └── api.ts
│   └── vite.config.ts
├── scripts/
│   ├── test-pihole.ts
│   └── test-unifi.ts
└── data/
    └── chores.db   (gitignored, Docker volume mount)
```

---

## 8. Manual setup (pre-deploy)

### Pi-hole (192.168.1.254)
1. Create group `Kids_Unblocked` (enabled, no block lists).
2. Create group `Kids_Blocked` (enabled, assign all adlists + add a block-everything regex).
3. Groups → Clients → add each kid's device MAC, comment with kid name, assign to `Kids_Blocked` initially.
4. Settings → API/Web Interface → generate an **Application password**. Store as `PIHOLE_PW` in `.env`.

### UniFi (local controller)
1. Admins → create a Local Admin account `chore-bot` with full-site admin. **Disable MFA.**
2. Confirm controller is reachable from Docker host (443 / 8443 / 11443).
3. Store creds as `UNIFI_USER` / `UNIFI_PW` / `UNIFI_HOST` / `UNIFI_SITE` (usually `default`) in `.env`.

### Per kid device
MAC randomization stays **on** — iOS "Private Wi-Fi Address" is stable per-SSID until the network is forgotten, so the randomized MAC on the home SSID is a fine stable identifier.
1. From UniFi client list, capture each device's current MAC on the home SSID.
2. Enter MAC(s) into Pi-hole client record and chore-app `kid_macs` table. Kids with multiple devices get one row per MAC.
3. If a kid's MAC ever changes (they forgot/rejoined the network), add the new MAC as an additional row — don't delete the old one until you're sure it's retired.

---

## 9. Docker / Portainer deployment

**Dockerfile** — multi-stage:
- Stage 1: `node:22-alpine`, build `web/` (`npm ci && npm run build`)
- Stage 2: `node:22-alpine`, install `server/` prod deps, compile TS, copy `web/dist`
- Stage 3 runtime: copy `/app`, `EXPOSE 3000`, `CMD ["node","dist/index.js"]`
- Server serves `web/dist` statically at `/` and API at `/api/*`

**docker-compose.yml**:
```yaml
services:
  chore-app:
    build: .
    container_name: chore-app
    restart: unless-stopped
    environment:
      TZ: America/New_York
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    env_file: .env
    networks: [homelab]
networks:
  homelab:
    external: true
```

**.env keys**: `PORT`, `TZ`, `PARENT_PIN_HASH`, `SESSION_SECRET`, `DB_PATH=/app/data/chores.db`, `HISTORY_RETENTION_DAYS=90`, `PIHOLE_HOST`, `PIHOLE_PW`, `PIHOLE_UNBLOCKED_GROUP_ID`, `PIHOLE_BLOCKED_GROUP_ID`, `UNIFI_HOST`, `UNIFI_USER`, `UNIFI_PW`, `UNIFI_SITE`.

**Portainer**: Stacks → deploy from Git (point at repo) or web editor. NPM host `chores.zachriser.com` → `192.168.1.172:3000`, force SSL, LAN-only access list.

---

## 10. Known risks / caveats

- **Pi-hole is DNS-only.** Any kid who sets device DNS to 1.1.1.1 bypasses it. UniFi `block-sta` is the real enforcement.
- **MAC randomization is staying on.** iOS Private Wi-Fi Address is stable per-SSID, so the randomized MAC is the identifier. If a kid forgets/rejoins the home network, the MAC rotates — re-capture from UniFi and add a new row to `kid_macs`.
- **UniFi official integrations API (X-API-KEY) doesn't yet cover block-sta** — using legacy cookie auth is intentional.
- **Pi-hole v6 auth is session-based**; lots of online v5 examples are stale.
- **UniFi local admin must have MFA disabled** for scripted login.

---

## 11. Inputs collected (2026-04-19)

- Kids: Zoe (MAC `06:4d:28:af:f7:da`, bedtime 20:00), Caleb (MACs `50:ee:32:98:18:fd`, `e2:1c:c6:e5:5d:ce`, bedtime 22:00). Avatars set in app.
- Chores: deferred to in-app UI.
- Parent PIN: `5874` default (changeable in app).
- UniFi controller: `192.168.1.10` (UniFi OS, HTTPS 443). `chore-bot` local admin still TODO.
- Pi-hole: `192.168.1.254`, app password stored in `.env`, verified against `/api/auth`.

See `TODO.md` for the sequenced work list.
