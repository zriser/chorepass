import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "../db.js";
import { config } from "../config.js";

const router = Router();

const SETTING_KEY = "parent_pin_hash";
const COOKIE_NAME = "parent";
const SESSION_DAYS = 30;

export function ensureParentPin(): void {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(SETTING_KEY) as { value: string } | undefined;
  if (row?.value) return;
  const hash = bcrypt.hashSync(config.parentPinDefault, 10);
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(SETTING_KEY, hash);
  console.log(`[auth] seeded parent_pin_hash from PARENT_PIN_DEFAULT`);
}

function getStoredHash(): string | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(SETTING_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

router.post("/login", (req, res) => {
  const pin = String(req.body?.pin ?? "");
  const hash = getStoredHash();
  if (!hash) return res.status(500).json({ error: "pin not configured" });
  if (!bcrypt.compareSync(pin, hash)) {
    return res.status(401).json({ error: "invalid pin" });
  }
  res.cookie(COOKIE_NAME, "ok", {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.post("/change-pin", (req, res) => {
  const oldPin = String(req.body?.oldPin ?? "");
  const newPin = String(req.body?.newPin ?? "");
  if (!/^\d{4,8}$/.test(newPin)) {
    return res.status(400).json({ error: "newPin must be 4-8 digits" });
  }
  const hash = getStoredHash();
  if (!hash || !bcrypt.compareSync(oldPin, hash)) {
    return res.status(401).json({ error: "invalid pin" });
  }
  const newHash = bcrypt.hashSync(newPin, 10);
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(newHash, SETTING_KEY);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.json({ authed: req.signedCookies?.[COOKIE_NAME] === "ok" });
});

export default router;
