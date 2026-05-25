import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  tz: process.env.TZ ?? "America/New_York",
  sessionSecret: required("SESSION_SECRET", "dev-secret-change-me"),
  dbPath: process.env.DB_PATH ?? path.resolve(process.cwd(), "../data/chores.db"),
  parentPinDefault: process.env.PARENT_PIN_DEFAULT ?? "0000",
  pihole: {
    host: process.env.PIHOLE_HOST ?? "",
    password: process.env.PIHOLE_PW ?? "",
    unblockedGroup: process.env.PIHOLE_UNBLOCKED_GROUP ?? "Kids_Unblocked",
    blockedGroup: process.env.PIHOLE_BLOCKED_GROUP ?? "Kids_Blocked",
  },
  unifi: {
    host: process.env.UNIFI_HOST ?? "",
    user: process.env.UNIFI_USER ?? "",
    password: process.env.UNIFI_PW ?? "",
    site: process.env.UNIFI_SITE ?? "default",
    // firewall_rule: classic Firewall Rule + Firewall Group keyed on the kid's
    //   static IPs (kid_ips table). Default-deny WAN_OUT from those IPs — kid
    //   stays on LAN and can reach chorepass, internet is dropped at the USG.
    //   Works on legacy USG (compiles to iptables); preferred on this deployment.
    // traffic_rule: toggle a per-kid Traffic Rule (kid stays on Wi-Fi, only internet drops).
    //   Requires a modern UniFi Cloud Gateway (UDM/UXG/UCG). USG (legacy) accepts the
    //   API call but the gateway silently does not enforce — use `firewall_rule` instead.
    // mac_block: legacy per-MAC `cmd/stamgr block-sta` (disconnects from Wi-Fi entirely).
    // none: skip UniFi entirely; Pi-hole is the only enforcement layer.
    enforcementMode: (process.env.UNIFI_ENFORCEMENT_MODE ?? "firewall_rule") as
      | "firewall_rule"
      | "traffic_rule"
      | "mac_block"
      | "none",
  },
};
