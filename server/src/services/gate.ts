import { db } from "../db.js";
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

async function applyToKid(
  kidId: number,
  action: GateAction,
  source: GateSource,
): Promise<GateResult> {
  const macs = getMacsForKid(kidId);
  if (macs.length === 0) {
    const err = "no MACs configured for kid";
    logGate(kidId, action, source, null, null, err);
    return { ok: false, kidId, action, macs: 0, piholeOk: null, unifiOk: null, error: err };
  }

  const piholeErrors: string[] = [];
  const unifiErrors: string[] = [];

  for (const mac of macs) {
    const pi = action === "block" ? await pihole.moveToBlocked(mac) : await pihole.moveToUnblocked(mac);
    if (!pi.ok) piholeErrors.push(`${mac}: ${pi.error ?? "unknown"}`);

    const un = action === "block" ? await unifi.block(mac) : await unifi.unblock(mac);
    if (!un.ok) unifiErrors.push(`${mac}: ${un.error ?? "unknown"}`);
  }

  const piholeOk = piholeErrors.length === 0;
  const unifiOk = unifiErrors.length === 0;
  const errorParts: string[] = [];
  if (piholeErrors.length) errorParts.push(`pihole: ${piholeErrors.join("; ")}`);
  if (unifiErrors.length) errorParts.push(`unifi: ${unifiErrors.join("; ")}`);
  const error = errorParts.length ? errorParts.join(" | ") : null;

  logGate(kidId, action, source, piholeOk, unifiOk, error);

  return {
    ok: piholeOk && unifiOk,
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
};
