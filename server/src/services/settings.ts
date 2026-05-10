import { db } from "../db.js";

const HISTORY_RETENTION_KEY = "history_retention_days";
const DEFAULT_HISTORY_RETENTION_DAYS = 90;
const MIN_HISTORY_RETENTION_DAYS = 1;
const MAX_HISTORY_RETENTION_DAYS = 3650;

export function seedHistoryRetentionDays(envValue: string | undefined) {
  const existing = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(HISTORY_RETENTION_KEY);
  if (existing) return;
  const parsed = envValue !== undefined ? Number(envValue) : NaN;
  const seed =
    Number.isInteger(parsed) && parsed >= MIN_HISTORY_RETENTION_DAYS
      ? parsed
      : DEFAULT_HISTORY_RETENTION_DAYS;
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
    HISTORY_RETENTION_KEY,
    String(seed),
  );
  console.log(`[settings] seeded ${HISTORY_RETENTION_KEY}=${seed}`);
}

export function getHistoryRetentionDays(): number {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(HISTORY_RETENTION_KEY) as { value: string } | undefined;
  const n = row ? Number(row.value) : NaN;
  if (!Number.isInteger(n) || n < MIN_HISTORY_RETENTION_DAYS) {
    console.warn(
      `[settings] invalid ${HISTORY_RETENTION_KEY}="${row?.value}", falling back to ${DEFAULT_HISTORY_RETENTION_DAYS}`,
    );
    return DEFAULT_HISTORY_RETENTION_DAYS;
  }
  return n;
}

export function setHistoryRetentionDays(days: number): number {
  if (
    !Number.isInteger(days) ||
    days < MIN_HISTORY_RETENTION_DAYS ||
    days > MAX_HISTORY_RETENTION_DAYS
  ) {
    throw new Error(
      `days must be an integer between ${MIN_HISTORY_RETENTION_DAYS} and ${MAX_HISTORY_RETENTION_DAYS}`,
    );
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(HISTORY_RETENTION_KEY, String(days));
  return days;
}

export const historyRetentionLimits = {
  min: MIN_HISTORY_RETENTION_DAYS,
  max: MAX_HISTORY_RETENTION_DAYS,
  default: DEFAULT_HISTORY_RETENTION_DAYS,
};
