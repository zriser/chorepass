// One-off: add descriptive comments to Pi-hole client entries so the UI is self-explanatory.
// Uses the same auth + insecure agent as services/pihole.ts.
import { Agent, fetch as undiciFetch } from "undici";
import { config } from "../config.js";

const insecure = new Agent({ connect: { rejectUnauthorized: false } });

async function authSid(): Promise<string> {
  const res = await undiciFetch(`${config.pihole.host}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: config.pihole.password }),
    dispatcher: insecure,
  });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  const data = (await res.json()) as { session: { sid: string } };
  return data.session.sid;
}

async function resolveGroupId(sid: string, name: string): Promise<number> {
  const res = await undiciFetch(`${config.pihole.host}/api/groups`, {
    headers: { "X-FTL-SID": sid },
    dispatcher: insecure,
  });
  const data = (await res.json()) as { groups: Array<{ id: number; name: string }> };
  const g = data.groups.find((x) => x.name === name);
  if (!g) throw new Error(`group "${name}" not found`);
  return g.id;
}

async function setClient(sid: string, mac: string, comment: string, groupId: number) {
  const res = await undiciFetch(`${config.pihole.host}/api/clients/${encodeURIComponent(mac)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "X-FTL-SID": sid },
    body: JSON.stringify({ comment, groups: [groupId] }),
    dispatcher: insecure,
  });
  console.log(`PUT ${mac}  comment="${comment}"  → ${res.status}`);
  if (!res.ok) console.log("  body:", await res.text().catch(() => ""));
}

const sid = await authSid();
const unblockedId = await resolveGroupId(sid, config.pihole.unblockedGroup);

const clients: Array<[string, string]> = [
  ["06:4d:28:af:f7:da", "Zoe — iPad (primary)"],
  ["50:ee:32:98:18:fd", "Caleb — device 1"],
  ["e2:1c:c6:e5:5d:ce", "Caleb — device 2"],
  ["c2:6b:06:24:8b:59", "Zach phone (test)"],
];

for (const [mac, comment] of clients) {
  await setClient(sid, mac, comment, unblockedId);
}
