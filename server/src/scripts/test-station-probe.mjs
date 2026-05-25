// Diagnostic: for each kid IP in the chorepass DB, report whether the UniFi
// controller currently sees that IP bound to a real hardware MAC or a locally
// administered (randomized) MAC. If a kid IP is bound to a randomized MAC via
// DHCP reservation, the gate will silently fail the next time iOS/Android
// rotates that MAC — the device gets a pool IP not in the firewall group.
//
// Usage (inside the chorepass container, where credentials are available):
//   docker cp test-station-probe.mjs chore-app:/tmp/
//   docker exec chore-app sh -c "cp /tmp/test-station-probe.mjs /app/ && cd /app && node test-station-probe.mjs"
//
// Optionally pass IPs as CLI args to override the DB lookup:
//   docker exec chore-app sh -c "cd /app && node test-station-probe.mjs 192.168.1.10 192.168.1.20"

import { Agent, fetch } from "undici";
import Database from "better-sqlite3";

const HOST = process.env.UNIFI_HOST?.replace(/\/$/, "");
const USER = process.env.UNIFI_USER;
const PW = process.env.UNIFI_PW;
const SITE = process.env.UNIFI_SITE || "default";
const DB_PATH = process.env.DB_PATH ?? "/app/data/chores.db";

const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
let token = null;

async function authenticate() {
  const res = await fetch(`${HOST}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USER, password: PW, rememberMe: false }),
    dispatcher,
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const m = c.match(/(?:^|;\s*)TOKEN=([^;]+)/i);
    if (m) token = m[1];
  }
}

async function get(path) {
  const res = await fetch(`${HOST}${path}`, {
    headers: { cookie: `TOKEN=${token}` },
    dispatcher,
  });
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
  return res.json();
}

function isLocallyAdministered(mac) {
  if (!mac) return null;
  const firstOctet = parseInt(mac.split(":")[0], 16);
  return (firstOctet & 0x02) !== 0;
}

function loadKidIpsFromDb() {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const rows = db
    .prepare(
      `SELECT k.slug, k.name, ki.ip, ki.label
         FROM kid_ips ki
         JOIN kids k ON k.id = ki.kid_id
        ORDER BY k.name, ki.id`,
    )
    .all();
  db.close();
  return rows;
}

if (!HOST || !USER || !PW) {
  console.error("missing UNIFI_HOST / UNIFI_USER / UNIFI_PW in env");
  process.exit(1);
}

const argIps = process.argv.slice(2);
let entries;
if (argIps.length > 0) {
  entries = argIps.map((ip) => ({ slug: "(arg)", name: "(arg)", ip, label: null }));
} else {
  entries = loadKidIpsFromDb();
  if (entries.length === 0) {
    console.error("no rows in kid_ips — populate IPs in the Kids tab or pass IPs as args");
    process.exit(1);
  }
}

await authenticate();

const sta = await get(`/proxy/network/api/s/${SITE}/stat/sta`);
const stations = sta.data ?? sta;
const users = await get(`/proxy/network/api/s/${SITE}/rest/user`);
const userList = users.data ?? users;

console.log(`active stations: ${stations.length}, known users: ${userList.length}\n`);

for (const entry of entries) {
  const onlineMatch = stations.find((s) => s.ip === entry.ip || s.fixed_ip === entry.ip);
  const offlineMatch = userList.find((u) => u.fixed_ip === entry.ip);
  const match = onlineMatch ?? offlineMatch;
  const label = entry.label ? ` (${entry.label})` : "";
  console.log(`=== ${entry.ip}${label} — ${entry.name} [${entry.slug}] ===`);
  if (!match) {
    console.log("  not currently online and no reservation found with this IP");
    continue;
  }
  const isRandom = isLocallyAdministered(match.mac);
  console.log(`  mac: ${match.mac}`);
  console.log(`  hostname: ${match.hostname ?? match.name ?? "-"}`);
  console.log(`  oui: ${match.oui || "(empty — randomized MAC giveaway)"}`);
  console.log(
    `  locally-administered bit set: ${isRandom} ${isRandom ? "← RANDOMIZED (gate at risk)" : "← real hardware MAC"}`,
  );
  console.log(`  use_fixedip: ${match.use_fixedip ?? false}`);
  console.log(`  fixed_ip: ${match.fixed_ip ?? "(none)"}`);
  console.log(`  current ip: ${match.ip ?? "(offline)"}`);
}
