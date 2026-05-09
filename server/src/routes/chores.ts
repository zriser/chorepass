import { Router } from "express";
import { db } from "../db.js";
import { requireParent } from "../middleware/requireParent.js";
import { weekdayArrayFromMask, weekdayMaskFromArray } from "../util/date.js";

const router = Router();

type ChoreRow = {
  id: number;
  name: string;
  points: number;
  active: number;
  created_at: string;
};

type AssignmentRow = {
  id: number;
  chore_id: number;
  kid_id: number;
  weekday_mask: number;
};

function loadChore(id: number) {
  const chore = db.prepare("SELECT * FROM chores WHERE id = ?").get(id) as ChoreRow | undefined;
  if (!chore) return null;
  const assigns = db
    .prepare(
      "SELECT id, chore_id, kid_id, weekday_mask FROM chore_assignments WHERE chore_id = ? ORDER BY kid_id",
    )
    .all(id) as AssignmentRow[];
  return {
    ...chore,
    active: !!chore.active,
    assignments: assigns.map((a) => ({
      id: a.id,
      kidId: a.kid_id,
      weekdays: weekdayArrayFromMask(a.weekday_mask),
      weekdayMask: a.weekday_mask,
    })),
  };
}

router.get("/", (_req, res) => {
  const chores = db.prepare("SELECT * FROM chores ORDER BY name").all() as ChoreRow[];
  const assigns = db
    .prepare("SELECT id, chore_id, kid_id, weekday_mask FROM chore_assignments")
    .all() as AssignmentRow[];
  const byChore = new Map<number, AssignmentRow[]>();
  for (const a of assigns) {
    const list = byChore.get(a.chore_id) ?? [];
    list.push(a);
    byChore.set(a.chore_id, list);
  }
  res.json(
    chores.map((c) => ({
      id: c.id,
      name: c.name,
      points: c.points,
      active: !!c.active,
      created_at: c.created_at,
      assignments: (byChore.get(c.id) ?? []).map((a) => ({
        id: a.id,
        kidId: a.kid_id,
        weekdays: weekdayArrayFromMask(a.weekday_mask),
        weekdayMask: a.weekday_mask,
      })),
    })),
  );
});

router.post("/", requireParent, (req, res) => {
  const { name, kidIds, weekdays, points, active } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name required" });

  const mask = Array.isArray(weekdays) && weekdays.length ? weekdayMaskFromArray(weekdays) : 127;
  const kidIdList: number[] = Array.isArray(kidIds) ? kidIds.map(Number) : [];

  const tx = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO chores (name, points, active) VALUES (?, ?, ?)")
      .run(name, Number(points ?? 0), active === false ? 0 : 1);
    const choreId = Number(info.lastInsertRowid);
    const ins = db.prepare(
      "INSERT INTO chore_assignments (chore_id, kid_id, weekday_mask) VALUES (?, ?, ?)",
    );
    for (const kidId of kidIdList) ins.run(choreId, kidId, mask);
    return choreId;
  });

  try {
    const id = tx();
    res.status(201).json(loadChore(id));
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

router.put("/:id", requireParent, (req, res) => {
  const id = Number(req.params.id);
  const existing = loadChore(id);
  if (!existing) return res.status(404).json({ error: "not found" });

  const { name, kidIds, weekdays, points, active } = req.body ?? {};

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE chores SET name = ?, points = ?, active = ? WHERE id = ?",
    ).run(
      name ?? existing.name,
      points !== undefined ? Number(points) : existing.points,
      active === undefined ? (existing.active ? 1 : 0) : active ? 1 : 0,
      id,
    );
    if (Array.isArray(kidIds) || Array.isArray(weekdays)) {
      const mask = Array.isArray(weekdays) && weekdays.length
        ? weekdayMaskFromArray(weekdays)
        : existing.assignments[0]?.weekdayMask ?? 127;
      const nextKidIds: number[] = Array.isArray(kidIds)
        ? kidIds.map(Number)
        : existing.assignments.map((a) => a.kidId);
      db.prepare("DELETE FROM chore_assignments WHERE chore_id = ?").run(id);
      const ins = db.prepare(
        "INSERT INTO chore_assignments (chore_id, kid_id, weekday_mask) VALUES (?, ?, ?)",
      );
      for (const kidId of nextKidIds) ins.run(id, kidId, mask);
    }
  });

  try {
    tx();
    res.json(loadChore(id));
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

router.delete("/:id", requireParent, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM chores WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
