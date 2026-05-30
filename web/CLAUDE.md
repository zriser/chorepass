# web — parent/kid UI

## Stack
React + Vite + TypeScript + Tailwind. Dev server on :5173; proxies `/api` and
`/avatars` to server :3000 (see `vite.config.ts`).

## Key files
- `src/useParent.tsx` — `ParentProvider` + `useParent()` hook; server-side session auth via `POST /api/parent/login`
- `src/api.ts` — thin fetch wrapper used everywhere; throws on non-2xx
- `src/pages/Parent.tsx` — parent shell; tab routing into `pages/parent/*`
- `src/pages/parent/` — `TodayTab`, `KidsTab`, `ChoresTab`, `HistoryTab`, `GateLogTab`, `SettingsTab`
- `src/pages/KidView.tsx` — kid chore-completion page; no auth, accessed by slug
- `src/pages/Landing.tsx` — root page; links to kid slugs + parent login

## Auth model
- Parent area: PIN-gated via server session (`useParent` checks `/api/parent/me` on mount)
- Kid pages: no auth — the URL slug is the only secret. Don't add auth here by default; it's by design.
- `useParent` must wrap parent routes; throws if used outside `ParentProvider`

## Gotchas
- All API calls go through `src/api.ts` — don't use raw `fetch` in components
- Tailwind config is in `tailwind.config.js`; PostCSS in `postcss.config.js`
- `vite.config.ts` also proxies `/avatars` (static files served by Express) — add new proxy paths there if server gains new static routes
- No test suite in web — manual verification via dev server
