"use client";

import { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";

/** Captures utm_* / fbclid / ttclid into storefront attribution API */
export function AttributionCapture() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const search = useSearchParams();

  useEffect(() => {
    if (!storeSlug) return;
    const source =
      search.get("utm_source") ||
      (search.get("fbclid") ? "meta" : null) ||
      (search.get("ttclid") ? "tiktok" : null);
    if (!source && !search.get("utm_medium") && !search.get("utm_campaign")) {
      return;
    }
    void fetch(`/api/storefront/${storeSlug}/attribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: source || undefined,
        medium: search.get("utm_medium") || undefined,
        campaign: search.get("utm_campaign") || undefined,
        content: search.get("utm_content") || undefined,
        term: search.get("utm_term") || undefined,
        clickId: search.get("fbclid") || search.get("ttclid") || undefined,
        path: window.location.pathname,
      }),
    });
  }, [storeSlug, search]);

  return null;
}
