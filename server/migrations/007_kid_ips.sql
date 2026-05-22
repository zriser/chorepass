CREATE TABLE kid_ips (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id     INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  ip         TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ip)
);
CREATE INDEX idx_kid_ips_kid ON kid_ips(kid_id);
