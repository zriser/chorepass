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
}

export const unifi = new UnifiClient();
