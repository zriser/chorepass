import type { Request, Response } from "express";
import { db } from "../db.js";

/**
 * Parent auth is a stateless signed cookie. To make it revocable, the cookie
 * carries the current "session epoch" instead of a fixed value, and
 * requireParent accepts a cookie only when its epoch matches the one stored in
 * settings. Bumping the epoch (on PIN change, or an explicit "log out all
 * devices") makes every previously issued cookie stop validating — the only way
 * to truly end existing sessions for a self-validating signed cookie.
 */

export const PARENT_COOKIE = "parent";
const EPOCH_KEY = "session_epoch";
const SESSION_DAYS = 30;

/** Seed the epoch on first boot (mirrors ensureParentPin). */
export function ensureSessionEpoch(): void {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(EPOCH_KEY) as { value: string } | undefined;
  if (row?.value) return;
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(EPOCH_KEY, "1");
  console.log(`[auth] seeded session_epoch`);
}

export function getSessionEpoch(): string {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(EPOCH_KEY) as { value: string } | undefined;
  return row?.value ?? "1";
}

/** Invalidate every issued cookie by advancing the epoch. Returns the new epoch. */
export function bumpSessionEpoch(): string {
  const next = String((Number(getSessionEpoch()) || 0) + 1);
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(EPOCH_KEY, next);
  return next;
}

/** Issue a fresh parent cookie bound to the current epoch. */
export function issueParentCookie(res: Response): void {
  res.cookie(PARENT_COOKIE, getSessionEpoch(), {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

/** True if the request carries a valid, current-epoch parent cookie. */
export function isParentAuthed(req: Request): boolean {
  const sig = req.signedCookies?.[PARENT_COOKIE];
  return typeof sig === "string" && sig === getSessionEpoch();
}
