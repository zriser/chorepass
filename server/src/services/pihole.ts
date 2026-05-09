import { Agent, fetch as undiciFetch } from "undici";
import { config } from "../config.js";

export type PiholeResult = { ok: boolean; status?: number; error?: string };

type AuthResponse = {
  session: {
    valid: boolean;
    sid: string;
    csrf?: string;
    validity: number;
    message?: string;
  };
};

type GroupsResponse = {
  groups: Array<{ id: number; name: string; enabled: number; comment: string | null }>;
};

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

class PiholeClient {
  private sid: string | null = null;
  private sidExpiresAt = 0;
  private groupIds: Record<string, number> = {};

  private get base(): string {
    const h = config.pihole.host;
    if (!h) throw new Error("PIHOLE_HOST not configured");
    return h.replace(/\/$/, "");
  }

  private async authenticate(): Promise<void> {
    const pw = config.pihole.password;
    if (!pw) throw new Error("PIHOLE_PW not configured");
    const res = await undiciFetch(`${this.base}/api/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
      dispatcher: insecureAgent,
    });
    if (!res.ok) {
      throw new Error(`pihole auth failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    const data = (await res.json()) as AuthResponse;
    if (!data.session?.valid || !data.session.sid) {
      throw new Error(`pihole auth returned invalid session: ${data.session?.message ?? "?"}`);
    }
    this.sid = data.session.sid;
    this.sidExpiresAt = Date.now() + (data.session.validity - 10) * 1000;
  }

  private async ensureAuthed(): Promise<void> {
    if (!this.sid || Date.now() >= this.sidExpiresAt) {
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
      return undiciFetch(`${this.base}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "X-FTL-SID": this.sid!,
        },
        body: body ? JSON.stringify(body) : undefined,
        dispatcher: insecureAgent,
      });
    };
    let res = await doCall();
    if (res.status === 401) {
      this.sid = null;
      await this.authenticate();
      res = await doCall();
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`pihole ${method} ${path} → ${res.status}: ${detail}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async resolveGroupIds(): Promise<{ unblocked: number; blocked: number }> {
    const unblockedName = config.pihole.unblockedGroup;
    const blockedName = config.pihole.blockedGroup;
    if (this.groupIds[unblockedName] && this.groupIds[blockedName]) {
      return { unblocked: this.groupIds[unblockedName], blocked: this.groupIds[blockedName] };
    }
    const data = await this.request<GroupsResponse>("GET", "/api/groups");
    for (const g of data.groups) this.groupIds[g.name] = g.id;
    const unblocked = this.groupIds[unblockedName];
    const blocked = this.groupIds[blockedName];
    if (unblocked === undefined) {
      throw new Error(`pihole group "${unblockedName}" not found (have: ${data.groups.map((g) => g.name).join(", ")})`);
    }
    if (blocked === undefined) {
      throw new Error(`pihole group "${blockedName}" not found`);
    }
    return { unblocked, blocked };
  }

  private async setClientGroups(mac: string, groupIds: number[]): Promise<void> {
    const m = mac.toLowerCase();
    await this.request("PUT", `/api/clients/${encodeURIComponent(m)}`, {
      groups: groupIds,
    });
  }

  async moveToUnblocked(mac: string): Promise<PiholeResult> {
    try {
      const { unblocked } = await this.resolveGroupIds();
      await this.setClientGroups(mac, [unblocked]);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  async moveToBlocked(mac: string): Promise<PiholeResult> {
    try {
      const { blocked } = await this.resolveGroupIds();
      await this.setClientGroups(mac, [blocked]);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  async getClient(mac: string): Promise<unknown> {
    const m = mac.toLowerCase();
    return this.request("GET", `/api/clients/${encodeURIComponent(m)}`);
  }
}

export const pihole = new PiholeClient();
