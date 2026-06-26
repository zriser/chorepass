import type { Request, Response, NextFunction } from "express";
import { isParentAuthed } from "../services/session.js";

export function requireParent(req: Request, res: Response, next: NextFunction) {
  if (isParentAuthed(req)) return next();
  return res.status(401).json({ error: "parent auth required" });
}
