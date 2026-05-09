// Cleanup: unblock test MAC and remove temp test-zach kid.
import Database from "better-sqlite3";
import { unifi } from "../services/unifi.js";
import { pihole } from "../services/pihole.js";

const MAC = "c2:6b:06:24:8b:59";

const r1 = await unifi.unblock(MAC);
const r2 = await pihole.moveToUnblocked(MAC);
console.log("unifi.unblock:", r1);
console.log("pihole.moveToUnblocked:", r2);

const db = new Database("../data/chores.db");
const kid = db.prepare("SELECT id FROM kids WHERE slug = 'test-zach'").get() as { id: number } | undefined;
if (kid) {
  db.prepare("DELETE FROM kid_macs WHERE kid_id = ?").run(kid.id);
  db.prepare("DELETE FROM kids WHERE id = ?").run(kid.id);
  console.log(`removed test kid id=${kid.id}`);
} else {
  console.log("test kid already gone");
}
