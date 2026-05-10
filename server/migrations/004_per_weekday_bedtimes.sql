-- Move bedtime from a single column on kids to a per-(kid, weekday) row in
-- kid_bedtimes. Absence of a row for (kid, weekday) means "no scheduled block
-- that day". weekday is 0..6 with 0=Sunday, matching weekdayIndex() in
-- server/src/util/date.ts.
CREATE TABLE kid_bedtimes (
  kid_id  INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  time    TEXT    NOT NULL,
  PRIMARY KEY (kid_id, weekday)
);

-- Preserve existing single bedtime by replicating across all 7 weekdays.
INSERT INTO kid_bedtimes (kid_id, weekday, time)
SELECT k.id, w.weekday, k.bedtime
  FROM kids k
  CROSS JOIN (
    SELECT 0 AS weekday UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
    SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
  ) w;

ALTER TABLE kids DROP COLUMN bedtime;
