import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  tz: process.env.TZ ?? "America/New_York",
  sessionSecret: required("SESSION_SECRET", "dev-secret-change-me"),
  dbPath: process.env.DB_PATH ?? path.resolve(process.cwd(), "../data/chores.db"),
  historyRetentionDays: Number(process.env.HISTORY_RETENTION_DAYS ?? 90),
  parentPinDefault: process.env.PARENT_PIN_DEFAULT ?? "0000",
  pihole: {
    host: process.env.PIHOLE_HOST ?? "",
    password: process.env.PIHOLE_PW ?? "",
    unblockedGroup: process.env.PIHOLE_UNBLOCKED_GROUP ?? "Kids_Unblocked",
    blockedGroup: process.env.PIHOLE_BLOCKED_GROUP ?? "Kids_Blocked",
  },
  unifi: {
    host: process.env.UNIFI_HOST ?? "",
    user: process.env.UNIFI_USER ?? "",
    password: process.env.UNIFI_PW ?? "",
    site: process.env.UNIFI_SITE ?? "default",
  },
};
