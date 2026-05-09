import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import { db, runMigrations } from "../db.js";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type SeedMac = { mac: string; label?: string | null };
type SeedKid = {
  name: string;
  slug: string;
  avatar?: string | null;
  bedtime: string;
  macs: SeedMac[];
};
type SeedChore = {
  name: string;
  points?: number;
  assignments: { slug: string; weekday_mask?: number }[];
};
type SeedFile = { kids: SeedKid[]; chores: SeedChore[] };

const arg = process.argv[2];
const seedPath = arg
  ? path.resolve(process.cwd(), arg)
  : path.join(__dirname, "seed.json");

if (!fs.existsSync(seedPath)) {
  console.error(`Seed file not found: ${seedPath}`);
  process.exit(1);
}

const data: SeedFile = JSON.parse(fs.readFileSync(seedPath, "utf8"));

runMigrations();

const insertKid = db.prepare(
  "INSERT INTO kids (name, slug, avatar, bedtime) VALUES (?, ?, ?, ?)",
);
const insertMac = db.prepare(
  "INSERT INTO kid_macs (kid_id, mac, label) VALUES (?, ?, ?)",
);
const findKidBySlug = db.prepare("SELECT id FROM kids WHERE slug = ?");
const insertChore = db.prepare(
  "INSERT INTO chores (name, points) VALUES (?, ?)",
);
const insertAssignment = db.prepare(
  "INSERT INTO chore_assignments (chore_id, kid_id, weekday_mask) VALUES (?, ?, ?)",
);
const upsertSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);
const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");

const tx = db.transaction(() => {
  for (const kid of data.kids) {
    const existing = findKidBySlug.get(kid.slug) as { id: number } | undefined;
    if (existing) {
      console.log(`- kid ${kid.slug} already exists (id=${existing.id}), skipping`);
      continue;
    }
    const info = insertKid.run(kid.name, kid.slug, kid.avatar ?? null, kid.bedtime);
    const kidId = Number(info.lastInsertRowid);
    for (const m of kid.macs) {
      insertMac.run(kidId, m.mac.toLowerCase(), m.label ?? null);
    }
    console.log(`+ kid ${kid.slug} (id=${kidId}) with ${kid.macs.length} mac(s)`);
  }

  for (const chore of data.chores) {
    const info = insertChore.run(chore.name, chore.points ?? 0);
    const choreId = Number(info.lastInsertRowid);
    for (const a of chore.assignments) {
      const k = findKidBySlug.get(a.slug) as { id: number } | undefined;
      if (!k) {
        console.warn(`  chore ${chore.name}: unknown kid slug ${a.slug}, skipping`);
        continue;
      }
      insertAssignment.run(choreId, k.id, a.weekday_mask ?? 127);
    }
    console.log(`+ chore "${chore.name}" (id=${choreId})`);
  }

  const hasPin = getSetting.get("parent_pin_hash") as { value: string } | undefined;
  if (!hasPin) {
    const hash = bcrypt.hashSync(config.parentPinDefault, 10);
    upsertSetting.run("parent_pin_hash", hash);
    console.log(`+ parent_pin_hash seeded from PARENT_PIN_DEFAULT`);
  }
});

tx();
console.log("Seed complete.");
