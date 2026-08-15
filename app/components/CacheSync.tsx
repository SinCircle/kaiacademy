"use client";

import { useEffect } from "react";
import { invalidateClientCache } from "../lib/client-cache";

export function CacheSync() {
  useEffect(() => {
    const source = new EventSource("/api/sync");
    source.addEventListener("invalidate", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as { prefixes?: string[] };
        if (data.prefixes?.length) invalidateClientCache(data.prefixes);
      } catch {
        // A malformed event is ignored; EventSource keeps the next updates flowing.
      }
    });
    return () => source.close();
  }, []);
  return null;
}
