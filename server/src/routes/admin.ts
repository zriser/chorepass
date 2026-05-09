import { Router } from "express";
import { db } from "../db.js";
import { requireParent } from "../middleware/requireParent.js";
import { shouldBeUnlocked } from "../services/unlockRule.js";
import { gate } from "../services/gate.js";
import { todayISO } from "../util/date.js";

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

router.get("/gate-status", (_req, res) => {
  const kids = db.prepare("SELECT id, name, slug FROM kids ORDER BY name").all() as {
    id: number;
    name: string;
    slug: string;
  }[];
  const latest = db.prepare(
    `SELECT action, created_at FROM gate_log
      WHERE kid_id = ?
      ORDER BY id DESC LIMIT 1`,
  );
  const status = kids.map((k) => {
    const last = latest.get(k.id) as { action: string; created_at: string } | undefined;
    const rule = shouldBeUnlocked(k.id);
    return {
      ...k,
      lastAction: last?.action ?? null,
      lastActionAt: last?.created_at ?? null,
      shouldBeUnlocked: rule.unlocked,
      chores: { done: rule.completed, total: rule.total },
    };
  });
  res.json(status);
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
              gl.pihole_ok, gl.unifi_ok, gl.error, gl.created_at
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
