# ChorePass auto-deploy (homelab LXC)

CI-validated branch promotion + pull-based deploy. GitHub Actions
(`.github/workflows/build-validate.yml`) builds the real production image on every
push to `main`, asserts `/api/health` returns `{"ok":true}`, and **only then**
force-pushes the commit to a `live` branch. The LXC polls `live` and rebuilds. A
broken build never advances `live`, so it never reaches the host.

```
push → main ─► GitHub Actions (cloud)
                 validate: docker compose up --build  +  curl /api/health == ok:true
                 promote (push to main only): git push --force origin HEAD:refs/heads/live
                                                            │
LXC 101 (192.168.1.172) ◄───────────────────────────────────┘  live branch
  chorepass-deploy.timer (~3 min) → chorepass-deploy.sh:
    fetch live; if HEAD != origin/live → reset --hard + docker compose up -d --build
```

These files are version-controlled here for reproducibility but **run on the LXC**,
not in the image (`deploy/` is in `.dockerignore`).

---

## One-time host setup

Do this **after** the first push to `main` has run the workflow and created the
`live` branch (check: the branch shows up in the repo, or the Actions run's
`promote` job is green).

```bash
ssh -i ~/.ssh/id_ed25519 root@192.168.1.172
cd /opt/stacks/chorepass

# 1. Auth: pull over SSH with the existing user key (/root/.ssh/id_ed25519,
#    account zriser). The remote is already SSH; confirm:
git remote -v
git remote set-url origin git@github.com:zriser/chorepass.git   # if not already SSH
ssh -T git@github.com    # expect "Hi zriser! You've successfully authenticated"

# 2. Track the validated branch instead of main:
git fetch origin live
git checkout -B live origin/live

# 3. Install the deploy script + systemd units:
install -m 755 deploy/homelab/chorepass-deploy.sh /usr/local/bin/chorepass-deploy.sh
install -m 644 deploy/homelab/chorepass-deploy.service /etc/systemd/system/
install -m 644 deploy/homelab/chorepass-deploy.timer   /etc/systemd/system/

# 4. Prove the script works once by hand, then arm the timer:
/usr/local/bin/chorepass-deploy.sh          # should say "already current" or rebuild
systemctl daemon-reload
systemctl enable --now chorepass-deploy.timer
systemctl list-timers chorepass-deploy.timer   # confirm it's scheduled
```

From now on: **push to `main` → it auto-deploys within ~3 min** (assuming the
build + health gate passes). No more hand `git pull && docker compose up`.

> The stack dir tracks `live`, which the script keeps via `git reset --hard`. Don't
> commit on the host — push to GitHub `main` and let the pipeline carry it down.
> The real `.env` (secrets) and `data/` (SQLite DB) are gitignored, so `reset --hard`
> never touches them. A manual `docker compose up -d --build` is still safe; the
> script's `flock` keeps it from colliding with a timer tick.

---

## Operating it

```bash
systemctl status chorepass-deploy.service        # last run result
journalctl -u chorepass-deploy.service -n 50     # deploy history / errors
systemctl list-timers chorepass-deploy.timer     # next scheduled run
systemctl start chorepass-deploy.service         # force a deploy check now
systemctl disable --now chorepass-deploy.timer   # pause auto-deploy
```

## Prove the gate works (do this once, before trusting it)

A deploy gate is only worth its salt if it **fails closed**. Verify both directions:

1. **Fails closed:** push a deliberately broken commit to `main` (e.g. a syntax
   error in `server/src/index.ts`). Confirm the `validate` job goes red and
   `promote` is **skipped** — `live` does not move, the LXC stays on the old build.
   Then revert.
2. **Succeeds end-to-end:** push a small real change to `main`, walk away, and
   confirm the timer fires on its own (`journalctl -u chorepass-deploy.service`)
   and the change is live. Verify by the served behavior, not container uptime.

## Rollback

`live` is just a pointer. To roll back, force-push an older good commit to it
(`git push --force origin <good-sha>:refs/heads/live`) and the LXC will reset to it
on the next tick — or on the host, `git reset --hard <good-sha> && docker compose up -d --build`.
