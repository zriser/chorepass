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

// --- Enforcement pause ("away mode") -----------------------------------------
// When paused, the scheduler skips every scheduled BLOCK (morning enforcement +
// per-kid bedtimes). Resets/unblocks and manual parent actions still run, so a
// deliberate block during the pause is respected. Stored as a single settings
// key: absent/empty = active, "indefinite" = paused with no end, or an ISO
// datetime = paused until that instant (auto-resumes lazily once it passes).
const ENFORCEMENT_PAUSE_KEY = "enforcement_pause_until";

export type EnforcementPause = { paused: boolean; until: string | null };

export function clearEnforcementPause(): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(ENFORCEMENT_PAUSE_KEY);
}

export function getEnforcementPause(): EnforcementPause {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(ENFORCEMENT_PAUSE_KEY) as { value: string } | undefined;
  const raw = row?.value?.trim() ?? "";
  if (!raw) return { paused: false, until: null };
  if (raw === "indefinite") return { paused: true, until: null };
  const untilMs = Date.parse(raw);
  if (Number.isNaN(untilMs)) {
    console.warn(`[settings] invalid ${ENFORCEMENT_PAUSE_KEY}="${raw}", clearing`);
    clearEnforcementPause();
    return { paused: false, until: null };
  }
  if (Date.now() >= untilMs) {
    // The pause window elapsed — auto-resume by clearing the stale key.
    clearEnforcementPause();
    return { paused: false, until: null };
  }
  return { paused: true, until: new Date(untilMs).toISOString() };
}

export function isEnforcementPaused(): boolean {
  return getEnforcementPause().paused;
}

// until === null → pause indefinitely; ISO datetime string → pause until then.
export function setEnforcementPause(until: string | null): EnforcementPause {
  let value: string;
  if (until === null) {
    value = "indefinite";
  } else {
    const ms = Date.parse(until);
    if (Number.isNaN(ms)) throw new Error("until must be an ISO datetime or null");
    if (ms <= Date.now()) throw new Error("until must be in the future");
    value = new Date(ms).toISOString();
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(ENFORCEMENT_PAUSE_KEY, value);
  return getEnforcementPause();
}
