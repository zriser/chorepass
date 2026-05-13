import { db } from "../db.js";
import { config } from "../config.js";
import { pihole } from "./pihole.js";
import { unifi } from "./unifi.js";

export type GateSource = "schedule" | "chore" | "manual";
export type GateAction = "block" | "unblock";

export type GateResult = {
  ok: boolean;
  kidId: number;
  action: GateAction;
  macs: number;
  piholeOk: boolean | null;
  unifiOk: boolean | null;
  error: string | null;
};

type KidRow = { id: number; slug: string };

function getKid(kidId: number): KidRow | null {
  return (
    (db.prepare("SELECT id, slug FROM kids WHERE id = ?").get(kidId) as KidRow | undefined) ?? null
  );
}

function getMacsForKid(kidId: number): string[] {
  const rows = db
    .prepare("SELECT mac FROM kid_macs WHERE kid_id = ?")
    .all(kidId) as { mac: string }[];
  return rows.map((r) => r.mac);
}

function logGate(
  kidId: number | null,
  action: GateAction,
  source: GateSource,
  piholeOk: boolean | null,
  unifiOk: boolean | null,
  error: string | null,
) {
  db.prepare(
    `INSERT INTO gate_log (kid_id, action, source, pihole_ok, unifi_ok, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    kidId,
    action,
    source,
    piholeOk === null ? null : piholeOk ? 1 : 0,
    unifiOk === null ? null : unifiOk ? 1 : 0,
    error,
  );
}

async function applyUnifi(
  kid: KidRow,
  macs: string[],
  action: GateAction,
): Promise<{ ok: boolean | null; errors: string[] }> {
  const errors: string[] = [];
  const mode = config.unifi.enforcementMode;
  if (mode === "none") {
    return { ok: null, errors: [] };
  }
  if (mode === "traffic_rule") {
    const r =
      action === "block"
        ? await unifi.enableTrafficRuleForSlug(kid.slug)
        : await unifi.disableTrafficRuleForSlug(kid.slug);
    if (!r.ok) errors.push(`chorepass:${kid.slug}: ${r.error ?? "unknown"}`);
  } else {
    for (const mac of macs) {
      const r = action === "block" ? await unifi.block(mac) : await unifi.unblock(mac);
      if (!r.ok) errors.push(`${mac}: ${r.error ?? "unknown"}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

async function applyToKid(
  kidId: number,
  action: GateAction,
  source: GateSource,
): Promise<GateResult> {
  const kid = getKid(kidId);
  if (!kid) {
    const err = `unknown kid id ${kidId}`;
    logGate(kidId, action, source, null, null, err);
    return { ok: false, kidId, action, macs: 0, piholeOk: null, unifiOk: null, error: err };
  }

  const macs = getMacsForKid(kidId);
  if (macs.length === 0) {
    const err = "no MACs configured for kid";
    logGate(kidId, action, source, null, null, err);
    return { ok: false, kidId, action, macs: 0, piholeOk: null, unifiOk: null, error: err };
  }

  const piholeErrors: string[] = [];
  for (const mac of macs) {
    const pi = action === "block" ? await pihole.moveToBlocked(mac) : await pihole.moveToUnblocked(mac);
    if (!pi.ok) piholeErrors.push(`${mac}: ${pi.error ?? "unknown"}`);
  }

  const un = await applyUnifi(kid, macs, action);

  const piholeOk = piholeErrors.length === 0;
  const unifiOk = un.ok;
  const errorParts: string[] = [];
  if (piholeErrors.length) errorParts.push(`pihole: ${piholeErrors.join("; ")}`);
  if (un.errors.length) errorParts.push(`unifi: ${un.errors.join("; ")}`);
  const error = errorParts.length ? errorParts.join(" | ") : null;

  logGate(kidId, action, source, piholeOk, unifiOk, error);

  // For overall ok, treat unifiOk=null (mode=none) as not-failing.
  const overallOk = piholeOk && unifiOk !== false;

  return {
    ok: overallOk,
    kidId,
    action,
    macs: macs.length,
    piholeOk,
    unifiOk,
    error,
  };
}

export const gate = {
  block: (kidId: number, source: GateSource) => applyToKid(kidId, "block", source),
  unblock: (kidId: number, source: GateSource) => applyToKid(kidId, "unblock", source),

  async blockAll(source: GateSource): Promise<GateResult[]> {
    const kids = db.prepare("SELECT id FROM kids").all() as { id: number }[];
    const results: GateResult[] = [];
    for (const k of kids) results.push(await applyToKid(k.id, "block", source));
    return results;
  },

  async unblockAll(source: GateSource): Promise<GateResult[]> {
    const kids = db.prepare("SELECT id FROM kids").all() as { id: number }[];
    const results: GateResult[] = [];
    for (const k of kids) results.push(await applyToKid(k.id, "unblock", source));
    return results;
  },
};
