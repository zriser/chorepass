import type { Request, Response, NextFunction } from "express";

export function requireParent(req: Request, res: Response, next: NextFunction) {
  const sig = req.signedCookies?.parent;
  if (sig === "ok") return next();
  return res.status(401).json({ error: "parent auth required" });
}
