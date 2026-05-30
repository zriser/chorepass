@~/claude-memory/CLAUDE.md

# chorepass
Chore-gated kid internet access. Two enforcement layers (Pi-hole DNS + UniFi
gateway) toggled together. Setup, enforcement modes, and the USG/MAC-rotation
caveats are in README.md — read it before touching enforcement.

## Layout
- `server/`      — Express + SQLite, the gate engine. See server/CLAUDE.md
- `web/`         — React + Vite parent/kid UI. See web/CLAUDE.md
- `data/chores.db` — only stateful artifact; holds kids, MACs, IPs, PIN hash, gate log
- `server/migrations/` — numbered .sql files; applied in order, tracked in `_migrations` table

## Dev (from repo root)
```
npm run install:all   # installs server/ and web/ deps
npm run dev           # concurrently: server :3000 + web :5173 (Vite proxies /api)
npm run migrate       # run pending migrations
npm run seed          # seed dev data
npm run build         # web dist + server dist
```

## Env config
All runtime config is in `server/src/config.ts` — read it. Key vars:
`SESSION_SECRET`, `DB_PATH`, `PIHOLE_HOST`, `PIHOLE_PW`, `UNIFI_HOST`,
`UNIFI_USER`, `UNIFI_PW`, `UNIFI_SITE`, `UNIFI_ENFORCEMENT_MODE`, `TZ`.
`.env` is loaded from `server/` or `../` (repo root).

## Invariant: the gate degrades CLOSED
`gate.ts` applies both layers independently; if one fails it logs the error and
still applies the other — never fail open. `ok:false` means partial failure, not
a skip. LAN-only app: kid pages have no auth (slug = the secret); parent area is
PIN-gated via server-side session.
