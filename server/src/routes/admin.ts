import { Router } from "express";
import { db } from "../db.js";
import { config } from "../config.js";
import { requireParent } from "../middleware/requireParent.js";
import { shouldBeUnlocked } from "../services/unlockRule.js";
import { gate } from "../services/gate.js";
import { scheduler } from "../services/scheduler.js";
import {
  getHistoryRetentionDays,
  historyRetentionLimits,
  setHistoryRetentionDays,
  getEnforcementPause,
  setEnforcementPause,
  clearEnforcementPause,
} from "../services/settings.js";
import { PARENT_COOKIE, bumpSessionEpoch } from "../services/session.js";
import { todayISO } from "../util/date.js";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const router = Router();
router.use(requireParent);

router.post("/reset-day", async (_req, res) => {
  const date = todayISO();
  const removed = db
    .prepare("DELETE FROM completions WHERE completed_date = ?")
    .run(date).changes;
  const results = await gate.blockAll("manual");
  res.json({ ok: true, date, removedCompletions: removed, gate: results });
});

router.post("/force-block", async (req, res) => {
  const kidId = req.body?.kidId ? Number(req.body.kidId) : null;
  if (kidId) {
    const exists = db.prepare("SELECT 1 FROM kids WHERE id = ?").get(kidId);
    if (!exists) return res.status(404).json({ error: "kid not found" });
    const result = await gate.block(kidId, "manual");
    return res.json({ ok: result.ok, kidId, gate: result });
  }
  const results = await gate.blockAll("manual");
  res.json({ ok: results.every((r) => r.ok), blocked: results.length, gate: results });
});

router.post("/force-unblock", async (req, res) => {
  const kidId = Number(req.body?.kidId);
  if (!kidId) return res.status(400).json({ error: "kidId required" });
  const exists = db.prepare("SELECT 1 FROM kids WHERE id = ?").get(kidId);
  if (!exists) return res.status(404).json({ error: "kid not found" });
  const result = await gate.unblock(kidId, "manual");
  res.json({ ok: result.ok, kidId, gate: result });
});

// Log out every device, including this one, by advancing the session epoch.
// Use after a PIN leak when you want even the current browser forced to re-auth.
router.post("/logout-all-sessions", (_req, res) => {
  const epoch = bumpSessionEpoch();
  res.clearCookie(PARENT_COOKIE);
  res.json({ ok: true, epoch });
});

router.get("/gate-status", (_req, res) => {
  const kids = db.prepare("SELECT id, name, slug FROM kids ORDER BY name").all() as {
    id: number;
    name: string;
    slug: string;
  }[];
  const latest = db.prepare(
    `SELECT action, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
       FROM gate_log
      WHERE kid_id = ?
      ORDER BY id DESC LIMIT 1`,
  );
  const date = todayISO();
  const pointsRows = db
    .prepare(
      `SELECT cmp.kid_id AS kid_id, COALESCE(SUM(c.points), 0) AS points
         FROM completions cmp
         JOIN chores c ON c.id = cmp.chore_id
        WHERE cmp.completed_date = ?
        GROUP BY cmp.kid_id`,
    )
    .all(date) as { kid_id: number; points: number }[];
  const pointsByKid = new Map(pointsRows.map((r) => [r.kid_id, r.points]));
  const status = kids.map((k) => {
    const last = latest.get(k.id) as { action: string; created_at: string } | undefined;
    const rule = shouldBeUnlocked(k.id);
    return {
      ...k,
      lastAction: last?.action ?? null,
      lastActionAt: last?.created_at ?? null,
      shouldBeUnlocked: rule.unlocked,
      currentlyUnlocked: last?.action === "unblock",
      chores: { done: rule.completed, total: rule.total },
      pointsToday: pointsByKid.get(k.id) ?? 0,
    };
  });
  res.json(status);
});

router.get("/deploy-config", (_req, res) => {
  res.json({
    tz: config.tz,
    pihole: {
      unblockedGroup: config.pihole.unblockedGroup,
      blockedGroup: config.pihole.blockedGroup,
    },
    unifi: {
      host: config.unifi.host,
      site: config.unifi.site,
    },
  });
});

router.get("/daily-schedule", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT key, value FROM settings
        WHERE key IN ('morning_reset_time', 'chore_enforcement_time')`,
    )
    .all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  res.json({
    resetTime: map.get("morning_reset_time") ?? "06:00",
    enforcementTime: map.get("chore_enforcement_time") ?? "06:00",
  });
});

router.put("/daily-schedule", (req, res) => {
  const resetTime = String(req.body?.resetTime ?? "");
  const enforcementTime = String(req.body?.enforcementTime ?? "");
  if (!TIME_RE.test(resetTime)) {
    return res.status(400).json({ error: "resetTime must be HH:MM (24-hour)" });
  }
  if (!TIME_RE.test(enforcementTime)) {
    return res.status(400).json({ error: "enforcementTime must be HH:MM (24-hour)" });
  }
  if (enforcementTime < resetTime) {
    return res
      .status(400)
      .json({ error: "enforcementTime must be at or after resetTime" });
  }
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const tx = db.transaction(() => {
    upsert.run("morning_reset_time", resetTime);
    upsert.run("chore_enforcement_time", enforcementTime);
  });
  tx();
  const applied = scheduler.reloadDailySchedule();
  res.json({ ok: true, ...applied });
});

// "Away mode" — pause all scheduled blocks (morning enforcement + bedtimes).
// Manual force-block/unblock and chore-earned unblocks still work.
router.get("/enforcement-pause", (_req, res) => {
  res.json(getEnforcementPause());
});

router.put("/enforcement-pause", async (req, res) => {
  const paused = Boolean(req.body?.paused);
  if (!paused) {
    clearEnforcementPause();
    return res.json({ ...getEnforcementPause(), unblocked: 0 });
  }
  // Enabling: `until` is an optional ISO datetime; omit/blank/null = indefinite.
  const untilRaw = req.body?.until;
  const until =
    untilRaw === undefined || untilRaw === null || String(untilRaw).trim() === ""
      ? null
      : String(untilRaw);
  try {
    const state = setEnforcementPause(until);
    // Take effect immediately: bring every kid back online now, rather than
    // waiting for the next scheduled event that we're about to start skipping.
    const results = await gate.unblockAll("manual");
    res.json({ ...state, unblocked: results.filter((r) => r.ok).length });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

router.get("/history-retention-days", (_req, res) => {
  res.json({
    days: getHistoryRetentionDays(),
    min: historyRetentionLimits.min,
    max: historyRetentionLimits.max,
  });
});

router.put("/history-retention-days", (req, res) => {
  const days = Number(req.body?.days);
  try {
    const applied = setHistoryRetentionDays(days);
    res.json({ ok: true, days: applied });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

router.get("/gate-log", (req, res) => {
  const kidId = req.query.kidId ? Number(req.query.kidId) : null;
  const limit = Math.min(Number(req.query.limit ?? 200), 1000);
  const where = kidId ? "WHERE gl.kid_id = ?" : "";
  const params: (string | number)[] = [];
  if (kidId) params.push(kidId);
  params.push(limit);
  const rows = db
    .prepare(
      `SELECT gl.id, gl.kid_id, k.name AS kid_name, gl.action, gl.source,
              gl.pihole_ok, gl.unifi_ok, gl.error,
              strftime('%Y-%m-%dT%H:%M:%SZ', gl.created_at) AS created_at
         FROM gate_log gl
         LEFT JOIN kids k ON k.id = gl.kid_id
         ${where}
        ORDER BY gl.id DESC
        LIMIT ?`,
    )
    .all(...params);
  res.json(rows);
});

export default router;
