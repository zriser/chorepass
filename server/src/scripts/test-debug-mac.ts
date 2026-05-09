// Diagnostic: is c2:6b:06:24:8b:59 known to UniFi + actually blocked?
// Also list currently-connected stations so we can find the phone's real MAC.
import { Agent, fetch as undiciFetch } from "undici";
import { unifi } from "../services/unifi.js";
import { config } from "../config.js";

const MAC = "c2:6b:06:24:8b:59";

const u = await unifi.getUser(MAC);
console.log(`getUser(${MAC}):`, u);
const blocked = await unifi.isBlocked(MAC);
console.log(`isBlocked: ${blocked}`);

// List active stations
const insecure = new Agent({ connect: { rejectUnauthorized: false } });
// re-auth via the public API path
const auth = await undiciFetch(`${config.unifi.host}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: config.unifi.user, password: config.unifi.password }),
  dispatcher: insecure,
});
const token = (auth.headers.getSetCookie?.() ?? []).map((h) => h.match(/TOKEN=([^;]+)/i)?.[1]).find(Boolean);
const csrf = auth.headers.get("x-csrf-token") ?? auth.headers.get("x-updated-csrf-token") ?? "";
const sta = await undiciFetch(`${config.unifi.host}/proxy/network/api/s/${config.unifi.site}/stat/sta`, {
  headers: { cookie: `TOKEN=${token}`, "x-csrf-token": csrf },
  dispatcher: insecure,
});
const data = (await sta.json()) as { data: Array<{ mac: string; hostname?: string; name?: string; ip?: string; oui?: string; is_wired?: boolean; signal?: number }> };
console.log(`\nActive stations (${data.data.length}):`);
for (const c of data.data) {
  console.log(
    `  ${c.mac}  ${c.is_wired ? "wired" : "wifi"}  ip=${c.ip ?? "?"}  name=${c.name ?? c.hostname ?? "?"}  oui=${c.oui ?? "?"}`,
  );
}
