import { runMigrations } from "../db.js";

const ran = runMigrations();
if (ran.length === 0) {
  console.log("No migrations to apply.");
} else {
  console.log(`Applied: ${ran.join(", ")}`);
}
