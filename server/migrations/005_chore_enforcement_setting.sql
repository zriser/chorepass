-- Split the old morning reset into two events: an unblocking reset and a
-- separate chore enforcement block. Seed the enforcement time to match the
-- existing morning_reset_time so upgrade preserves today's behavior (when
-- they're equal, scheduler collapses them into one combined job).
INSERT INTO settings (key, value)
SELECT 'chore_enforcement_time', value FROM settings WHERE key = 'morning_reset_time'
  ON CONFLICT(key) DO NOTHING;
INSERT OR IGNORE INTO settings (key, value) VALUES ('chore_enforcement_time', '06:00');
