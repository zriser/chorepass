CREATE TABLE kids (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  avatar     TEXT,
  bedtime    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kid_macs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id     INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  mac        TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mac)
);
CREATE INDEX idx_kid_macs_kid ON kid_macs(kid_id);

CREATE TABLE chores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  points     INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chore_assignments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_id     INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  kid_id       INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  weekday_mask INTEGER NOT NULL DEFAULT 127,
  UNIQUE(chore_id, kid_id)
);
CREATE INDEX idx_chore_assignments_kid ON chore_assignments(kid_id);

CREATE TABLE completions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id         INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  chore_id       INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  completed_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_date TEXT NOT NULL,
  completed_by   TEXT NOT NULL CHECK (completed_by IN ('kid','parent')),
  UNIQUE(kid_id, chore_id, completed_date)
);
CREATE INDEX idx_completions_kid_date ON completions(kid_id, completed_date);

CREATE TABLE gate_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id     INTEGER REFERENCES kids(id) ON DELETE SET NULL,
  action     TEXT NOT NULL CHECK (action IN ('block','unblock')),
  source     TEXT NOT NULL CHECK (source IN ('schedule','chore','manual')),
  pihole_ok  INTEGER,
  unifi_ok   INTEGER,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_gate_log_kid_time ON gate_log(kid_id, created_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
