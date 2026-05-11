-- Optional per-kid avatar background color override. NULL falls back to the
-- name-hashed default in web/src/components/Avatar.tsx (colorForName).
ALTER TABLE kids ADD COLUMN color TEXT;
