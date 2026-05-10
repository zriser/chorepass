import cron, { ScheduledTask } from "node-cron";
import { db } from "../db.js";
import { config } from "../config.js";
import { gate } from "./gate.js";
import { getHistoryRetentionDays } from "./settings.js";
import { todayISO } from "../util/date.js";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_RESET_TIME = "06:00";

const kidJobs = new Map<number, ScheduledTask>();
let dailyResetJob: ScheduledTask | null = null;

function scheduleKidBedtime(kidId: number, bedtime: string): boolean {
  const m = bedtime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    console.error(`[scheduler] kid ${kidId} has bad bedtime "${bedtime}", skipping`);
    return false;
  }
  const expr = `${Number(m[2])} ${Number(m[1])} * * *`;
  const job = cron.schedule(
    expr,
    async () => {
      console.log(`[scheduler] bedtime block kid=${kidId} (${bedtime})`);
      const r = await gate.block(kidId, "schedule");
      if (!r.ok) console.error(`[scheduler] bedtime block failed kid=${kidId}: ${r.error}`);
    },
    { timezone: config.tz },
  );
  kidJobs.set(kidId, job);
  return true;
}

export function reloadKidJobs(): number {
  for (const job of kidJobs.values()) job.stop();
  kidJobs.clear();
  const kids = db
    .prepare("SELECT id, bedtime FROM kids")
    .all() as { id: number; bedtime: string }[];
  let registered = 0;
  for (const k of kids) if (scheduleKidBedtime(k.id, k.bedtime)) registered++;
  console.log(`[scheduler] kid bedtime jobs: ${registered}/${kids.length}`);
  return registered;
}

function getMorningResetTime(): string {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'morning_reset_time'")
    .get() as { value: string } | undefined;
  const value = row?.value ?? DEFAULT_RESET_TIME;
  if (!TIME_RE.test(value)) {
    console.warn(
      `[scheduler] invalid morning_reset_time "${value}" in settings, falling back to ${DEFAULT_RESET_TIME}`,
    );
    return DEFAULT_RESET_TIME;
  }
  return value;
}

function scheduleDailyReset(time: string) {
  const [hh, mm] = time.split(":").map(Number);
  const expr = `${mm} ${hh} * * *`;
  dailyResetJob = cron.schedule(
    expr,
    async () => {
      const date = todayISO();
      const removed = db
        .prepare("DELETE FROM completions WHERE completed_date = ?")
        .run(date).changes;
      console.log(`[scheduler] morning reset ${date} (${time}) — cleared ${removed} completions`);
      const results = await gate.blockAll("schedule");
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        console.error(
          `[scheduler] morning block had ${failed.length}/${results.length} failures`,
        );
      }
    },
    { timezone: config.tz },
  );
}

export function reloadDailyReset(): string {
  if (dailyResetJob) {
    dailyResetJob.stop();
    dailyResetJob = null;
  }
  const time = getMorningResetTime();
  scheduleDailyReset(time);
  console.log(`[scheduler] daily reset scheduled for ${time}`);
  return time;
}

function startPrune() {
  cron.schedule(
    "0 2 * * *",
    () => {
      const days = getHistoryRetentionDays();
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const compInfo = db
        .prepare("DELETE FROM completions WHERE completed_date < ?")
        .run(cutoffDate);
      const gateInfo = db
        .prepare(`DELETE FROM gate_log WHERE created_at < datetime('now', ?)`)
        .run(`-${days} days`);
      console.log(
        `[scheduler] prune (>${days}d): ${compInfo.changes} completions, ${gateInfo.changes} gate_log`,
      );
    },
    { timezone: config.tz },
  );
}

export function start() {
  reloadDailyReset();
  startPrune();
  reloadKidJobs();
  console.log(`[scheduler] started (tz=${config.tz})`);
}

export const scheduler = { start, reloadKidJobs, reloadDailyReset };
