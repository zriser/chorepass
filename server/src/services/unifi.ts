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
}

export const unifi = new UnifiClient();
