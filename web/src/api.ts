type Method = "GET" | "POST" | "PUT" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).error ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export type Mac = { id: number; mac: string; label: string | null };
export type Bedtime = { weekday: number; time: string };
export type Kid = {
  id: number;
  name: string;
  slug: string;
  avatar: string | null;
  created_at: string;
  macs: Mac[];
  bedtimes: Bedtime[];
};
export type Assignment = {
  id: number;
  kidId: number;
  weekdays: number[];
  weekdayMask: number;
};
export type Chore = {
  id: number;
  name: string;
  points: number;
  active: boolean;
  created_at: string;
  assignments: Assignment[];
};
export type TodayChore = {
  id: number;
  name: string;
  points: number;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
};
export type Today = {
  kid: { id: number; name: string; slug: string; avatar: string | null };
  date: string;
  pointsWeek: number;
  pointsAllTime: number;
  chores: TodayChore[];
};
export type GateStatus = {
  id: number;
  name: string;
  slug: string;
  lastAction: "block" | "unblock" | null;
  lastActionAt: string | null;
  shouldBeUnlocked: boolean;
  currentlyUnlocked: boolean;
  chores: { done: number; total: number };
  pointsToday: number;
};
export type GateLogRow = {
  id: number;
  kid_id: number | null;
  kid_name: string | null;
  action: "block" | "unblock";
  source: "schedule" | "chore" | "manual";
  pihole_ok: number | null;
  unifi_ok: number | null;
  error: string | null;
  created_at: string;
};
export type HistoryRow = {
  id: number;
  kid_id: number;
  kid_name: string;
  chore_id: number;
  chore_name: string;
  completed_date: string;
  completed_at: string;
  completed_by: "kid" | "parent";
};
