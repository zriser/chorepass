// One-off staging: ensure Zach's phone MAC is registered in Pi-hole and in Kids_Unblocked.
import { pihole } from "../services/pihole.js";

const MAC = "c2:6b:06:24:8b:59";

const r = await pihole.moveToUnblocked(MAC);
console.log("moveToUnblocked:", r);
if (!r.ok) process.exit(1);
