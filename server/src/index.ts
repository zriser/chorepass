import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { db, runMigrations } from "./db.js";
import kidsRouter, { avatarDir } from "./routes/kids.js";
import choresRouter from "./routes/chores.js";
import completionsRouter from "./routes/completions.js";
import authRouter, { ensureParentPin } from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import { scheduler } from "./services/scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ran = runMigrations();
if (ran.length) console.log(`[db] applied migrations: ${ran.join(", ")}`);
ensureParentPin();
scheduler.start();

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(cookieParser(config.sessionSecret));

app.use("/avatars", express.static(avatarDir, { maxAge: "30d", immutable: true }));

app.get("/api/health", (_req, res) => {
  const row = db.prepare("SELECT COUNT(*) AS n FROM kids").get() as { n: number };
  res.json({ ok: true, kids: row.n, tz: config.tz });
});

app.use("/api/parent", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/kids", kidsRouter);
app.use("/api/chores", choresRouter);
app.use("/api", completionsRouter);

const publicDir = path.resolve(__dirname, "../public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.listen(config.port, () => {
  console.log(`[chore-app] listening on :${config.port} (tz=${config.tz})`);
});
