"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionMember } from "../lib/types";

let cachedMember: SessionMember | null | undefined;

export function useSession() {
  const [member, setMember] = useState<SessionMember | null>(cachedMember ?? null);
  const [loading, setLoading] = useState(cachedMember === undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const data = await response.json() as { member?: SessionMember | null };
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
    if (cachedMember === undefined) void refresh();
  }, [refresh]);

  return { member, loading, refresh };
}

export function clearSessionCache() {
  cachedMember = undefined;
}
