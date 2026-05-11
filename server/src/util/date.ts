import { config } from "../config.js";

export function todayISO(tz: string = config.tz): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

export function weekdayIndex(dateISO: string, tz: string = config.tz): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  });
  const wk = fmt.format(new Date(`${dateISO}T12:00:00Z`));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wk] ?? 0;
}

export function weekdayMaskFromArray(days: number[]): number {
  let mask = 0;
  for (const d of days) {
    if (d >= 0 && d <= 6) mask |= 1 << d;
  }
  return mask;
}

export function weekdayArrayFromMask(mask: number): number[] {
  const out: number[] = [];
  for (let d = 0; d <= 6; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

// Sunday is day 0, matching weekdayIndex(). Returns the ISO date of the
// most recent Sunday on or before dateISO.
export function startOfWeekISO(dateISO: string = todayISO()): string {
  const wd = weekdayIndex(dateISO);
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}
