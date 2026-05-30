# server — gate engine

## Key files
- `src/services/gate.ts` — orchestrator; calls pihole + unifi in parallel-ish, logs every action to `gate_log`
- `src/services/pihole.ts` — Pi-hole v6 API client; moves kid MACs between `Kids_Blocked` / `Kids_Unblocked` groups
- `src/services/unifi.ts` — UniFi client; three enforcement strategies (see below)
- `src/services/scheduler.ts` — node-cron jobs: morning reset, chore enforcement window, per-kid bedtimes
- `src/services/unlockRule.ts` — pure logic: is kid's chore count satisfied for today?
- `src/services/settings.ts` — read/write settings table (retention days, schedule times)
- `src/config.ts` — all env var parsing; source of truth for defaults and valid enforcement modes
- `src/db.ts` — better-sqlite3 singleton; WAL mode, FK enforcement, migration runner

## UniFi enforcement modes (UNIFI_ENFORCEMENT_MODE)
Three strategies, each with different hardware requirements — see `server/src/config.ts` for the full comment:

| Mode | Mechanism | Hardware |
|---|---|---|
| `firewall_rule` | Classic Firewall Group (IPs) + WAN_OUT drop rule | USG + all modern gateways — **default** |
| `traffic_rule` | v2 Traffic Rule toggle | UDM/UXG/UCG only — **silent no-op on USG** |
| `mac_block` | `cmd/stamgr block-sta` (disconnects Wi-Fi) | Any UniFi AP |
| `none` | Skip UniFi; Pi-hole only | — |

**Never make `traffic_rule` the default** — it silently no-ops on legacy USG hardware.

## firewall_rule specifics (gotchas)
- Keyed on `kid_ips` table (static IPs), not MACs — kid must have IPs configured or gate returns `ok:false`
- Each kid needs a distinct `rule_index`; value is `CHOREPASS_RULE_INDEX_BASE + kid.id` (base = 2500)
- USG rejects a duplicate index with `api.err.FirewallRuleIndexExisted` — never reuse an index
- `enableFirewallBlockForSlug` is idempotent: syncs the IP group, upserts the rule, then enables it
- address-group members are bare IPv4 (no CIDR — confirmed via spike in `test-stage.ts`)

## Pi-hole specifics
- Pi-hole is MAC-keyed regardless of UniFi mode
- Client MAC must be pre-registered in Pi-hole (via the client list) — the API `PUT /api/clients/:mac` updates groups, not creates clients
- Group IDs are cached in-memory on the `PiholeClient` instance; restart server if you rename groups

## Scheduler
- `morning_reset_time` and `chore_enforcement_time` are read from the `settings` table at startup and on settings changes
- If both times are equal → single combined reset+block job (pre-split behavior)
- If different → reset clears completions + unblocks; enforcement later blocks until chores done
- Bedtime jobs are per-kid, per-weekday; call `reloadKidJobs()` after any bedtime edit
- All cron runs in `config.tz` timezone (default `America/New_York`)

## Test scripts (hit real controllers — use with care)
```
npm run test:pihole   # src/scripts/test-pihole.ts
npm run test:unifi    # src/scripts/test-unifi.ts
```
Use a throwaway test MAC, never a kid's real MAC. `test-cleanup.ts` reverses test state.

## Migrations
Add a new numbered `.sql` file to `migrations/`; `db.ts` applies unapplied files in sort order.
Never edit an already-applied migration — add a new one.
