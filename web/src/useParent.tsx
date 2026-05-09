import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api.js";

type ParentState = {
  ready: boolean;
  authed: boolean;
  login: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ParentState | null>(null);

export function ParentProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ authed: boolean }>("/api/parent/me");
      setAuthed(r.authed);
    } catch {
      setAuthed(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (pin: string) => {
      try {
        await api.post("/api/parent/login", { pin });
        setAuthed(true);
        return true;
      } catch {
        setAuthed(false);
        return false;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await api.post("/api/parent/logout").catch(() => {});
    setAuthed(false);
  }, []);

  return <Ctx.Provider value={{ ready, authed, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useParent(): ParentState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useParent outside ParentProvider");
  return v;
}
