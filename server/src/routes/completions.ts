import { Router } from "express";
import { db } from "../db.js";
import { requireParent } from "../middleware/requireParent.js";
import { shouldBeUnlocked } from "../services/unlockRule.js";
import { gate } from "../services/gate.js";
import { todayISO, weekdayIndex } from "../util/date.js";

const router = Router();

router.post("/kids/:slug/complete/:choreId", async (req, res) => {
  const { slug, choreId } = req.params;
  const kid = db.prepare("SELECT id FROM kids WHERE slug = ?").get(slug) as
    | { id: number }
    | undefined;
  if (!kid) return res.status(404).json({ error: "kid not found" });

  const date = todayISO();
  const bit = 1 << weekdayIndex(date);
  const assign = db
    .prepare(
      `SELECT ca.id FROM chore_assignments ca
         JOIN chores c ON c.id = ca.chore_id
        WHERE ca.chore_id = ? AND ca.kid_id = ?
          AND c.active = 1 AND (ca.weekday_mask & ?) != 0`,
    )
    .get(Number(choreId), kid.id, bit) as { id: number } | undefined;
  if (!assign) return res.status(400).json({ error: "chore not assigned to kid today" });

  const before = shouldBeUnlocked(kid.id, date);

  try {
    db.prepare(
      `INSERT INTO completions (kid_id, chore_id, completed_date, completed_by)
       VALUES (?, ?, ?, 'kid')`,
    ).run(kid.id, Number(choreId), date);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("UNIQUE")) return res.status(200).json({ ok: true, date, alreadyDone: true });
    return res.status(400).json({ error: msg });
  }

  const after = shouldBeUnlocked(kid.id, date);
  let gateResult = null;
  if (after.unlocked && !before.unlocked) {
    gateResult = await gate.unblock(kid.id, "chore");
  }
  res.status(201).json({ ok: true, date, unlocked: after.unlocked, gate: gateResult });
});

router.post("/kids/:slug/uncomplete/:choreId", requireParent, (req, res) => {
  const { slug, choreId } = req.params;
  const date = (req.body?.date as string | undefined) ?? todayISO();
  const kid = db.prepare("SELECT id FROM kids WHERE slug = ?").get(slug) as
    | { id: number }
    | undefined;
  if (!kid) return res.status(404).json({ error: "kid not found" });

  const info = db
    .prepare(
      "DELETE FROM completions WHERE kid_id = ? AND chore_id = ? AND completed_date = ?",
    )
    .run(kid.id, Number(choreId), date);
  res.json({ ok: true, removed: info.changes });
});

router.get("/history", (req, res) => {
  const kidId = req.query.kidId ? Number(req.query.kidId) : null;
  const from = (req.query.from as string | undefined) ?? null;
  const to = (req.query.to as string | undefined) ?? null;
  const limit = Math.min(Number(req.query.limit ?? 500), 2000);

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (kidId) {
    where.push("co.kid_id = ?");
    params.push(kidId);
  }
  if (from) {
    where.push("co.completed_date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("co.completed_date <= ?");
    params.push(to);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT co.id, co.kid_id, k.name AS kid_name, co.chore_id, c.name AS chore_name,
              co.completed_date, co.completed_at, co.completed_by
         FROM completions co
         JOIN kids k ON k.id = co.kid_id
         JOIN chores c ON c.id = co.chore_id
         ${whereSql}
        ORDER BY co.completed_at DESC
        LIMIT ?`,
    )
    .all(...params);
  res.json(rows);
});

export default router;
