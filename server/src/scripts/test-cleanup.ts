// Cleanup: unblock a test MAC and remove a temp test kid.
// Usage: tsx test-cleanup.ts <mac> [test-kid-slug]
import Database from "better-sqlite3";
import { unifi } from "../services/unifi.js";
import { pihole } from "../services/pihole.js";

const MAC = process.argv[2];
const SLUG = process.argv[3] ?? "test-kid";

if (!MAC) {
  console.error("usage: tsx test-cleanup.ts <mac> [test-kid-slug]");
  process.exit(1);
}

const r1 = await unifi.unblock(MAC);
const r2 = await pihole.moveToUnblocked(MAC);
console.log("unifi.unblock:", r1);
console.log("pihole.moveToUnblocked:", r2);

const db = new Database("../data/chores.db");
const kid = db.prepare("SELECT id FROM kids WHERE slug = ?").get(SLUG) as { id: number } | undefined;
if (kid) {
  db.prepare("DELETE FROM kid_macs WHERE kid_id = ?").run(kid.id);
  db.prepare("DELETE FROM kids WHERE id = ?").run(kid.id);
  console.log(`removed test kid id=${kid.id}`);
} else {
  console.log("test kid already gone");
}
