import { Agent, fetch as undiciFetch } from "undici";
import { config } from "../config.js";

export type UnifiResult = { ok: boolean; status?: number; error?: string };

type UserRecord = {
  _id: string;
  mac: string;
  blocked?: boolean;
  hostname?: string;
  name?: string;
};

// Minimal type for v2 trafficrules — we round-trip the full object on PUT,
// so unknown fields are preserved via index signature.
type TrafficRule = {
  _id: string;
  description: string;
  enabled: boolean;
  action: string;
  matching_target: string;
  target_devices?: Array<{ type: string; client_mac?: string }>;
  [key: string]: unknown;
};

// Classic firewall entities (the `/rest/firewallgroup` and `/rest/firewallrule`
// endpoints). These compile to iptables on USG, unlike v2 Traffic Rules which
// are a no-op on legacy hardware.
type FirewallGroup = {
  _id: string;
  name: string;
  group_type: string;
  group_members: string[];
  [key: string]: unknown;
};

type FirewallRule = {
  _id: string;
  name: string;
  ruleset: string;
  rule_index: string;
  action: string;
  enabled: boolean;
  src_firewallgroup_ids?: string[];
  [key: string]: unknown;
};

// Reserved rule_index base for chorepass-managed WAN_OUT drop rules. Picked
// high to stay clear of typical user-added rules. The USG rejects a second rule
// at an already-used index (api.err.FirewallRuleIndexExisted), so each kid MUST
// get a distinct index — callers pass `2500 + kidId` (see gate.ts).
export const CHOREPASS_RULE_INDEX_BASE = 2500;

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

class UnifiClient {
  private token: string | null = null;
  private csrf: string | null = null;
  private tokenCapturedAt = 0;

  private get base(): string {
    const h = config.unifi.host;
    if (!h) throw new Error("UNIFI_HOST not configured");
    return h.replace(/\/$/, "");
  }

  private get site(): string {
    return config.unifi.site || "default";
  }

  private extractToken(setCookieHeaders: string[]): string | null {
    for (const h of setCookieHeaders) {
      const m = h.match(/(?:^|;\s*)TOKEN=([^;]+)/i);
      if (m) return m[1];
    }
    return null;
  }

  private async authenticate(): Promise<void> {
    const user = config.unifi.user;
    const pw = config.unifi.password;
    if (!user || !pw) throw new Error("UNIFI_USER / UNIFI_PW not configured");

    const res = await undiciFetch(`${this.base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: user, password: pw, rememberMe: false }),
      dispatcher: insecureAgent,
    });
    if (!res.ok) {
      throw new Error(`unifi login failed: ${res.status} ${await res.text().catch(() => "")}`);
    }

    const setCookies = res.headers.getSetCookie?.() ?? [];
    const token = this.extractToken(setCookies);
    if (!token) {
      throw new Error("unifi login: no TOKEN cookie in response");
    }
    this.token = token;
    this.csrf = res.headers.get("x-csrf-token") ?? res.headers.get("x-updated-csrf-token");
    this.tokenCapturedAt = Date.now();
  }

  private async ensureAuthed(): Promise<void> {
    // UniFi OS tokens are JWTs valid ~2h; re-auth proactively after 1h
    if (!this.token || Date.now() - this.tokenCapturedAt > 60 * 60 * 1000) {
      await this.authenticate();
    }
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    await this.ensureAuthed();
    const doCall = async () => {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        cookie: `TOKEN=${this.token}`,
      };
      if (this.csrf && method !== "GET") headers["x-csrf-token"] = this.csrf;
      const res = await undiciFetch(`${this.base}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        dispatcher: insecureAgent,
      });
      // CSRF token can rotate on each response — capture if present
      const newCsrf = res.headers.get("x-updated-csrf-token") ?? res.headers.get("x-csrf-token");
      if (newCsrf) this.csrf = newCsrf;
      return res;
    };

    let res = await doCall();
    if (res.status === 401 || res.status === 403) {
      this.token = null;
      await this.authenticate();
      res = await doCall();
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`unifi ${method} ${path} → ${res.status}: ${detail}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async stamgr(cmd: "block-sta" | "unblock-sta", mac: string): Promise<void> {
    await this.request("POST", `/proxy/network/api/s/${this.site}/cmd/stamgr`, {
      cmd,
      mac: mac.toLowerCase(),
    });
  }

  async block(mac: string): Promise<UnifiResult> {
    try {
      await this.stamgr("block-sta", mac);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  async unblock(mac: string): Promise<UnifiResult> {
    try {
      await this.stamgr("unblock-sta", mac);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  async getUser(mac: string): Promise<UserRecord | null> {
    const m = mac.toLowerCase();
    const data = await this.request<{ data: UserRecord[] }>(
      "GET",
      `/proxy/network/api/s/${this.site}/rest/user`,
    );
    return data.data.find((u) => u.mac?.toLowerCase() === m) ?? null;
  }

  async isBlocked(mac: string): Promise<boolean | null> {
    const u = await this.getUser(mac);
    if (!u) return null;
    return u.blocked === true;
  }

  private trafficRulesPath(id?: string): string {
    const base = `/proxy/network/v2/api/site/${this.site}/trafficrules`;
    return id ? `${base}/${id}` : base;
  }

  private async findTrafficRuleByDescription(description: string): Promise<TrafficRule | null> {
    const rules = await this.request<TrafficRule[]>("GET", this.trafficRulesPath());
    return rules.find((r) => r.description === description) ?? null;
  }

  // Toggle the `enabled` field on a v2 Traffic Rule, found by its description.
  // PUT requires the entire payload back — partial bodies are rejected.
  async setTrafficRuleEnabled(description: string, enabled: boolean): Promise<UnifiResult> {
    try {
      const rule = await this.findTrafficRuleByDescription(description);
      if (!rule) {
        return { ok: false, error: `no traffic rule with description "${description}"` };
      }
      if (rule.enabled === enabled) return { ok: true };
      rule.enabled = enabled;
      await this.request("PUT", this.trafficRulesPath(rule._id), rule);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  enableTrafficRuleForSlug(slug: string): Promise<UnifiResult> {
    return this.setTrafficRuleEnabled(`chorepass:${slug}`, true);
  }

  disableTrafficRuleForSlug(slug: string): Promise<UnifiResult> {
    return this.setTrafficRuleEnabled(`chorepass:${slug}`, false);
  }

  // ---- Classic firewall (USG-enforced) ------------------------------------

  private firewallGroupPath(id?: string): string {
    const base = `/proxy/network/api/s/${this.site}/rest/firewallgroup`;
    return id ? `${base}/${id}` : base;
  }

  private firewallRulePath(id?: string): string {
    const base = `/proxy/network/api/s/${this.site}/rest/firewallrule`;
    return id ? `${base}/${id}` : base;
  }

  private static groupNameForSlug(slug: string): string {
    return `chorepass:${slug}_ips`;
  }

  private static ruleNameForSlug(slug: string): string {
    return `chorepass:${slug}_block`;
  }

  private async findFirewallGroupByName(name: string): Promise<FirewallGroup | null> {
    const r = await this.request<{ data: FirewallGroup[] }>("GET", this.firewallGroupPath());
    return r.data.find((g) => g.name === name) ?? null;
  }

  private async findFirewallRuleByName(name: string): Promise<FirewallRule | null> {
    const r = await this.request<{ data: FirewallRule[] }>("GET", this.firewallRulePath());
    return r.data.find((rl) => rl.name === name) ?? null;
  }

  // Ensure the kid's firewall group exists and has exactly these IPs as members.
  // address-group accepts bare IPv4 addresses (no CIDR — confirmed via spike).
  async syncKidGroup(slug: string, ips: string[]): Promise<{ groupId: string }> {
    const name = UnifiClient.groupNameForSlug(slug);
    const desired = [...ips].sort();
    const existing = await this.findFirewallGroupByName(name);
    if (!existing) {
      const resp = await this.request<{ data: FirewallGroup[] }>(
        "POST",
        this.firewallGroupPath(),
        { name, group_type: "address-group", group_members: desired },
      );
      return { groupId: resp.data[0]._id };
    }
    const current = [...existing.group_members].sort();
    if (current.length === desired.length && current.every((x, i) => x === desired[i])) {
      return { groupId: existing._id };
    }
    existing.group_members = desired;
    await this.request("PUT", this.firewallGroupPath(existing._id), existing);
    return { groupId: existing._id };
  }

  // Ensure a WAN_OUT drop rule exists for this kid's group. Created disabled by
  // default — caller toggles `enabled` via setFirewallRuleEnabledForSlug.
  async syncKidBlockRule(
    slug: string,
    groupId: string,
    ruleIndex: string,
  ): Promise<{ ruleId: string }> {
    const name = UnifiClient.ruleNameForSlug(slug);
    const existing = await this.findFirewallRuleByName(name);
    if (existing) {
      const currentGroupIds = existing.src_firewallgroup_ids ?? [];
      const needsUpdate =
        currentGroupIds.length !== 1 || currentGroupIds[0] !== groupId;
      if (needsUpdate) {
        existing.src_firewallgroup_ids = [groupId];
        await this.request("PUT", this.firewallRulePath(existing._id), existing);
      }
      return { ruleId: existing._id };
    }
    const payload = {
      name,
      ruleset: "WAN_OUT",
      rule_index: ruleIndex,
      action: "drop",
      protocol: "all",
      enabled: false,
      src_firewallgroup_ids: [groupId],
      src_address: "",
      src_mac_address: "",
      src_networkconf_id: "",
      src_networkconf_type: "NETv4",
      dst_address: "",
      dst_firewallgroup_ids: [],
      dst_networkconf_id: "",
      dst_networkconf_type: "NETv4",
      icmp_typename: "",
      ipsec: "",
      logging: false,
      state_established: false,
      state_invalid: false,
      state_new: false,
      state_related: false,
    };
    const resp = await this.request<{ data: FirewallRule[] }>(
      "POST",
      this.firewallRulePath(),
      payload,
    );
    return { ruleId: resp.data[0]._id };
  }

  async setFirewallRuleEnabledForSlug(slug: string, enabled: boolean): Promise<UnifiResult> {
    try {
      const name = UnifiClient.ruleNameForSlug(slug);
      const rule = await this.findFirewallRuleByName(name);
      if (!rule) {
        return { ok: false, error: `no firewall rule named "${name}"` };
      }
      if (rule.enabled === enabled) return { ok: true };
      rule.enabled = enabled;
      await this.request("PUT", this.firewallRulePath(rule._id), rule);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  // Bootstrap + enable in one call. Idempotent: safe to call repeatedly.
  async enableFirewallBlockForSlug(
    slug: string,
    ips: string[],
    ruleIndex: string,
  ): Promise<UnifiResult> {
    try {
      if (ips.length === 0) {
        return { ok: false, error: "no IPs configured for kid" };
      }
      const { groupId } = await this.syncKidGroup(slug, ips);
      await this.syncKidBlockRule(slug, groupId, ruleIndex);
      return await this.setFirewallRuleEnabledForSlug(slug, true);
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  disableFirewallBlockForSlug(slug: string): Promise<UnifiResult> {
    return this.setFirewallRuleEnabledForSlug(slug, false);
  }
}

export const unifi = new UnifiClient();
