import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../db.js";
import { config } from "../config.js";
import { requireParent } from "../middleware/requireParent.js";
import { scheduler } from "../services/scheduler.js";
import { todayISO, weekdayIndex } from "../util/date.js";

const router = Router();

export const avatarDir = path.join(path.dirname(config.dbPath), "avatars");
fs.mkdirSync(avatarDir, { recursive: true });

const ALLOWED_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 5 * 1024 * 1024;

type KidRow = {
  id: number;
  name: string;
  slug: string;
  avatar: string | null;
  created_at: string;
};

type MacRow = { id: number; kid_id: number; mac: string; label: string | null };
type BedtimeRow = { kid_id: number; weekday: number; time: string };
type BedtimeInput = { weekday: number; time: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseBedtimes(raw: unknown): BedtimeInput[] {
  if (!Array.isArray(raw)) {
    throw new Error("bedtimes must be an array of {weekday, time}");
  }
  const seen = new Set<number>();
  const out: BedtimeInput[] = [];
  for (const entry of raw) {
    if (entry == null) continue;
    const weekday = Number((entry as any).weekday);
    const time = String((entry as any).time ?? "");
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new Error(`bedtimes.weekday must be an integer 0..6 (got ${(entry as any).weekday})`);
    }
    if (time === "") continue;
    if (!TIME_RE.test(time)) {
      throw new Error(`bedtimes.time must be HH:MM (got "${time}")`);
    }
    if (seen.has(weekday)) {
      throw new Error(`bedtimes has duplicate entry for weekday ${weekday}`);
    }
    seen.add(weekday);
    out.push({ weekday, time });
  }
  return out;
}

function loadKid(id: number) {
  const kid = db.prepare("SELECT * FROM kids WHERE id = ?").get(id) as KidRow | undefined;
  if (!kid) return null;
  const macs = db
    .prepare("SELECT id, mac, label FROM kid_macs WHERE kid_id = ? ORDER BY id")
    .all(id) as Omit<MacRow, "kid_id">[];
  const bedtimes = db
    .prepare("SELECT weekday, time FROM kid_bedtimes WHERE kid_id = ? ORDER BY weekday")
    .all(id) as Omit<BedtimeRow, "kid_id">[];
  return { ...kid, macs, bedtimes };
}

function loadKidBySlug(slug: string) {
  const kid = db.prepare("SELECT * FROM kids WHERE slug = ?").get(slug) as KidRow | undefined;
  if (!kid) return null;
  return loadKid(kid.id);
}

router.get("/", (_req, res) => {
  const kids = db.prepare("SELECT * FROM kids ORDER BY name").all() as KidRow[];
  const macs = db.prepare("SELECT id, kid_id, mac, label FROM kid_macs").all() as MacRow[];
  const bedtimes = db
    .prepare("SELECT kid_id, weekday, time FROM kid_bedtimes ORDER BY weekday")
    .all() as BedtimeRow[];
  const macsByKid = new Map<number, Omit<MacRow, "kid_id">[]>();
  for (const m of macs) {
    const list = macsByKid.get(m.kid_id) ?? [];
    list.push({ id: m.id, mac: m.mac, label: m.label });
    macsByKid.set(m.kid_id, list);
  }
  const bedtimesByKid = new Map<number, Omit<BedtimeRow, "kid_id">[]>();
  for (const b of bedtimes) {
    const list = bedtimesByKid.get(b.kid_id) ?? [];
    list.push({ weekday: b.weekday, time: b.time });
    bedtimesByKid.set(b.kid_id, list);
  }
  res.json(
    kids.map((k) => ({
      ...k,
      macs: macsByKid.get(k.id) ?? [],
      bedtimes: bedtimesByKid.get(k.id) ?? [],
    })),
  );
});

router.post("/", requireParent, (req, res) => {
  const { name, slug, bedtimes, avatar, macs } = req.body ?? {};
  if (!name || !slug) {
    return res.status(400).json({ error: "name, slug required" });
  }
  const macList: { mac: string; label?: string }[] = Array.isArray(macs) ? macs : [];

  let parsedBedtimes: BedtimeInput[];
  try {
    parsedBedtimes = parseBedtimes(bedtimes ?? []);
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message ?? e) });
  }

  const tx = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO kids (name, slug, avatar) VALUES (?, ?, ?)")
      .run(name, slug, avatar ?? null);
    const kidId = Number(info.lastInsertRowid);
    const insertMac = db.prepare(
      "INSERT INTO kid_macs (kid_id, mac, label) VALUES (?, ?, ?)",
    );
    for (const m of macList) {
      insertMac.run(kidId, m.mac.toLowerCase(), m.label ?? null);
    }
    const insertBedtime = db.prepare(
      "INSERT INTO kid_bedtimes (kid_id, weekday, time) VALUES (?, ?, ?)",
    );
    for (const b of parsedBedtimes) insertBedtime.run(kidId, b.weekday, b.time);
    return kidId;
  });

  try {
    const id = tx();
    scheduler.reloadKidJobs();
    res.status(201).json(loadKid(id));
  } catch (e: any) {
    res.status(409).json({ error: String(e?.message ?? e) });
  }
});

router.put("/:id", requireParent, (req, res) => {
  const id = Number(req.params.id);
  const existing = loadKid(id);
  if (!existing) return res.status(404).json({ error: "not found" });

  const { name, slug, bedtimes, avatar, macs } = req.body ?? {};

  let parsedBedtimes: BedtimeInput[] | null = null;
  if (bedtimes !== undefined) {
    try {
      parsedBedtimes = parseBedtimes(bedtimes);
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message ?? e) });
    }
  }

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE kids SET name = ?, slug = ?, avatar = ? WHERE id = ?",
    ).run(
      name ?? existing.name,
      slug ?? existing.slug,
      avatar ?? existing.avatar,
      id,
    );
    if (Array.isArray(macs)) {
      db.prepare("DELETE FROM kid_macs WHERE kid_id = ?").run(id);
      const insertMac = db.prepare(
        "INSERT INTO kid_macs (kid_id, mac, label) VALUES (?, ?, ?)",
      );
      for (const m of macs) insertMac.run(id, m.mac.toLowerCase(), m.label ?? null);
    }
    if (parsedBedtimes !== null) {
      db.prepare("DELETE FROM kid_bedtimes WHERE kid_id = ?").run(id);
      const insertBedtime = db.prepare(
        "INSERT INTO kid_bedtimes (kid_id, weekday, time) VALUES (?, ?, ?)",
      );
      for (const b of parsedBedtimes) insertBedtime.run(id, b.weekday, b.time);
    }
  });

  try {
    tx();
    scheduler.reloadKidJobs();
    res.json(loadKid(id));
  } catch (e: any) {
    res.status(409).json({ error: String(e?.message ?? e) });
  }
});

router.post("/:id/avatar", requireParent, (req, res) => {
  const id = Number(req.params.id);
  const existing = loadKid(id);
  if (!existing) return res.status(404).json({ error: "not found" });

  const dataUrl = String(req.body?.dataUrl ?? "");
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: "expected data:image/...;base64,... in body.dataUrl" });
  const mime = m[1];
  const ext = ALLOWED_EXT[mime];
  if (!ext) return res.status(415).json({ error: `unsupported mime ${mime}` });

  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0) return res.status(400).json({ error: "empty payload" });
  if (buf.length > MAX_BYTES) return res.status(413).json({ error: `image too large (max ${MAX_BYTES} bytes)` });

  // Write with a hash-tagged filename so cache-busting is automatic on update.
  const tag = crypto.randomBytes(4).toString("hex");
  const filename = `${existing.slug}-${tag}.${ext}`;
  fs.writeFileSync(path.join(avatarDir, filename), buf);

  // Remove the previous avatar file if it was a local upload.
  if (existing.avatar?.startsWith("/avatars/")) {
    const oldPath = path.join(avatarDir, path.basename(existing.avatar));
    fs.unlink(oldPath, () => {});
  }

  const url = `/avatars/${filename}`;
  db.prepare("UPDATE kids SET avatar = ? WHERE id = ?").run(url, id);
  res.json(loadKid(id));
});

router.delete("/:id/avatar", requireParent, (req, res) => {
  const id = Number(req.params.id);
  const existing = loadKid(id);
  if (!existing) return res.status(404).json({ error: "not found" });
  if (existing.avatar?.startsWith("/avatars/")) {
    const oldPath = path.join(avatarDir, path.basename(existing.avatar));
    fs.unlink(oldPath, () => {});
  }
  db.prepare("UPDATE kids SET avatar = NULL WHERE id = ?").run(id);
  res.json(loadKid(id));
});

router.delete("/:id", requireParent, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM kids WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "not found" });
  scheduler.reloadKidJobs();
  res.json({ ok: true });
});

router.get("/:slug/today", (req, res) => {
  const kid = loadKidBySlug(req.params.slug);
  if (!kid) return res.status(404).json({ error: "not found" });
  const date = todayISO();
  const bit = 1 << weekdayIndex(date);

  const chores = db
    .prepare(
      `SELECT c.id, c.name, c.points, ca.weekday_mask
         FROM chores c
         JOIN chore_assignments ca ON ca.chore_id = c.id
        WHERE ca.kid_id = ?
          AND c.active = 1
          AND (ca.weekday_mask & ?) != 0
        ORDER BY c.name`,
    )
    .all(kid.id, bit) as { id: number; name: string; points: number; weekday_mask: number }[];

  const doneRows = db
    .prepare(
      "SELECT chore_id, completed_at, completed_by FROM completions WHERE kid_id = ? AND completed_date = ?",
    )
    .all(kid.id, date) as { chore_id: number; completed_at: string; completed_by: string }[];
  const doneBy = new Map(doneRows.map((r) => [r.chore_id, r]));

  res.json({
    kid: { id: kid.id, name: kid.name, slug: kid.slug, avatar: kid.avatar },
    date,
    chores: chores.map((c) => {
      const d = doneBy.get(c.id);
      return {
        id: c.id,
        name: c.name,
        points: c.points,
        completed: !!d,
        completed_at: d?.completed_at ?? null,
        completed_by: d?.completed_by ?? null,
      };
    }),
  });
});

export default router;
