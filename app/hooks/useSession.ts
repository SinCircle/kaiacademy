"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { SessionMember } from "../lib/types";
import { clearClientCache, getCachedJson, refreshCachedJson, setCachedJson } from "../lib/client-cache";

let cachedMember: SessionMember | null | undefined;
const InitialSessionContext = createContext<SessionMember | null | undefined>(undefined);

export function SessionProvider({ children, initialMember }: { children: ReactNode; initialMember: SessionMember | null }) {
  return createElement(InitialSessionContext.Provider, { value: initialMember }, children);
}

export function useSession() {
  const initialMember = useContext(InitialSessionContext);
  const [member, setMember] = useState<SessionMember | null>(cachedMember === undefined ? initialMember ?? null : cachedMember);
  const [loading, setLoading] = useState(cachedMember === undefined && initialMember === undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await refreshCachedJson<{ member?: SessionMember | null }>("/api/session");
      cachedMember = data.member ?? null;
      setMember(cachedMember);
    } catch {
      cachedMember = null;
      setMember(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedMember !== undefined) return;
    if (initialMember !== undefined) {
      cachedMember = initialMember;
      setMember(initialMember);
      setLoading(false);
      setCachedJson("/api/session", { member: initialMember });
    }
    let active = true;
    getCachedJson<{ member?: SessionMember | null }>("/api/session", {
      onUpdate: (data) => {
        if (!active) return;
        cachedMember = data.member ?? null;
        setMember(cachedMember);
      },
    }).then((data) => {
      if (!active) return;
      cachedMember = data.member ?? null;
      setMember(cachedMember);
    }).catch(() => {
      if (!active) return;
      cachedMember = null;
      setMember(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [initialMember, refresh]);

  return { member, loading, refresh, hasSession: Boolean(member) };
}

export function clearSessionCache() {
  cachedMember = undefined;
  clearClientCache();
}
