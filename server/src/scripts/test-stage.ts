// One-off staging: ensure a test MAC is registered in Pi-hole and in Kids_Unblocked.
// Usage: tsx test-stage.ts <mac>
import { pihole } from "../services/pihole.js";

const MAC = process.argv[2];

if (!MAC) {
  console.error("usage: tsx test-stage.ts <mac>");
  process.exit(1);
}

const r = await pihole.moveToUnblocked(MAC);
console.log("moveToUnblocked:", r);
if (!r.ok) process.exit(1);
