import { db } from "../db.js";
import { todayISO, weekdayIndex } from "../util/date.js";

export type UnlockStatus = {
  kidId: number;
  date: string;
  total: number;
  completed: number;
  unlocked: boolean;
};

export function shouldBeUnlocked(kidId: number, date: string = todayISO()): UnlockStatus {
  const bit = 1 << weekdayIndex(date);

  const total = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM chore_assignments ca
         JOIN chores c ON c.id = ca.chore_id
        WHERE ca.kid_id = ?
          AND c.active = 1
          AND (ca.weekday_mask & ?) != 0`,
    )
    .get(kidId, bit) as { n: number };

  const completed = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM completions co
         JOIN chore_assignments ca
           ON ca.chore_id = co.chore_id AND ca.kid_id = co.kid_id
         JOIN chores c ON c.id = co.chore_id
        WHERE co.kid_id = ?
          AND co.completed_date = ?
          AND c.active = 1
          AND (ca.weekday_mask & ?) != 0`,
    )
    .get(kidId, date, bit) as { n: number };

  return {
    kidId,
    date,
    total: total.n,
    completed: completed.n,
    unlocked: completed.n >= total.n,
  };
}
