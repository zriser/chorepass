# Chore App — TODO

_Companion to `PLAN.md`. Numbered sequentially — later items depend on earlier ones._

## Inputs needed before starting

- [x] Kids list: name, device MAC, bedtime, avatar (Zoe, Caleb — avatars set in-app)
- [x] Initial chore list (deferred — will add via in-app UI)
- [x] Parent PIN (default 5874, changeable in-app)
- [x] UniFi controller host + port + site name (`192.168.1.10`, HTTPS 443, site `default`)
- [x] Pi-hole application password generated + verified
- [x] MAC strategy: randomization staying on, captured stable per-SSID MACs from UniFi
- [x] UniFi `chore-bot` local admin account created (needed before Phase C)

---

## Build sequence

### Phase A — Foundation
- [x] 1. Scaffold repo: Node 22 + TypeScript + Express + better-sqlite3 + Vite React + Tailwind + Dockerfile + compose
- [x] 2. Add migrations system + `001_init.sql` (kids, kid_macs, chores, chore_assignments, completions, gate_log, settings)
- [x] 3. Seed script that takes a JSON of kids + chores and populates the DB

### Phase B — Backend logic (no external calls yet)
- [x] 4. CRUD routes for kids, chores, assignments, completions
- [x] 5. `services/unlockRule.ts` — `shouldBeUnlocked(kid, date)` returns bool (all-chores-today rule)
- [x] 6. Parent PIN auth (bcrypt) + session cookie middleware; gate parent-only routes
- [x] 7. `admin/reset-day`, `admin/force-block`, `admin/force-unblock` as stubs that only write to `gate_log`
- [x] 8. Verify everything end-to-end with curl before touching Pi-hole/UniFi

### Phase C — External integrations
- [x] 9. Pi-hole manual setup: create `Kids_Unblocked` + `Kids_Blocked` groups, add kid client MACs
- [x] 10. `services/pihole.ts` — auth (SID), update client group assignment
- [x] 11. `scripts/test-pihole.ts` — move a test MAC between groups; verify via Pi-hole UI
- [x] 12. UniFi manual setup: create `chore-bot` local admin, disable MFA
- [x] 13. `services/unifi.ts` — login (cookie jar), block-sta, unblock-sta
- [x] 14. `scripts/test-unifi.ts` — block then unblock a non-critical test MAC; verify in UniFi UI
- [x] 15. `services/gate.ts` — idempotent wrapper that calls both, logs to `gate_log`
- [x] 16. Wire chore-completion endpoint: on complete, if `shouldBeUnlocked()` flipped true, call `gate.unblock(kid)`

### Phase D — Scheduling
- [x] 17. `services/scheduler.ts` with node-cron:
  - [x] 06:00 daily → reset today's completions + block all kids
  - [x] Per-kid bedtime → block that kid (auto-reload on kid CRUD)
  - [x] 02:00 daily → prune `completions` + `gate_log` older than `HISTORY_RETENTION_DAYS`
- [x] 18. Tested live: registered a temp kid w/ bedtime ~2 min out, observed cron fire at the scheduled minute, gate.block hit Pi-hole + UniFi successfully (gate_log row written), force-unblock cycle clean. Findings: (a) iOS hops to other SSIDs with a fresh randomized MAC if the main one is blocked — need per-SSID MACs OR firewall-group-by-IP approach OR lock kid devices out of non-Default SSIDs; (b) cellular fallback is invisible to network-layer gating, document as out-of-scope

### Phase E — Frontend
- [x] 19. `KidView`: avatar tile picker → big chore cards → tap to complete → progress ring → celebration on full clear
- [x] 20. `ParentView` — PIN gate → tabs for:
  - [x] Kids (add/edit, MAC, bedtime, avatar)
  - [x] Chores (create, assign kids, weekday mask, active toggle)
  - [x] Today (live status: who's blocked, what's done)
  - [x] History (completions with filters)
  - [x] Gate log (debug view)
  - [x] Manual override buttons (force block/unblock per kid)
- [x] 21. Full sticker-book redesign: Fredoka/Nunito fonts, cream paper bg w/ dot grid, thick deep-brown borders + solid offset shadows, per-kid signature color, sticker chore cards with stamp animation on complete, floating "+points" indicator, chunky progress bar (replaces SVG ring), confetti rain celebration
- [x] 21a. Avatar uploads: `POST /api/kids/:id/avatar` accepts base64 data URL (5MB cap, png/jpeg/webp/gif), stores under `data/avatars/`, served at `/avatars/*`. Parent KidsTab has upload + replace + remove UI. `Avatar` component now renders image / emoji / initial fallback
- [x] 21b. Settings tab in ParentView with change-PIN form (validates 4–8 digits, must differ, must match confirm; backend route `POST /api/parent/change-pin` already existed)

### Phase F — Deploy
- [x] 22. Dockerfile is multi-stage (web-build → server-build → server-deps → runtime). Compose has TZ + `./data` volume mount. Builds need a smoke `docker build .` before Portainer
- [x] 23. `.env.example` cleaned: removed dead `PARENT_PIN_HASH` field (code reads from DB), kept all real keys with sensible defaults
- [ ] 24. Push to GitHub (personal: `zriser/chore-app`)
- [ ] 25. Deploy as Portainer stack from Git
- [ ] 26. NPM proxy host `chores.zachriser.com` → `192.168.1.172:3000`, force SSL, LAN-only ACL
- [ ] 27. Smoke test from a kid device on Wi-Fi

### Phase G — Rollout
- [ ] 28. Weekend dry run with one kid
- [ ] 29. Full rollout to all kids
- [ ] 30. Observe for a week, iterate

---

## Deferred / future

- Per-kid 4-digit PIN on kid view
- Summer rule: 50%-unlock-for-a-bit-then-reblock (edit `unlockRule.ts` only)
- Points / rewards ledger
- Push notifications to parent when a kid completes all chores
- Weekly summary email
