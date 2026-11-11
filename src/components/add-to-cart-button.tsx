"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AddToCartButton({
  storeSlug,
  variantId,
  disabled,
}: {
  storeSlug: string;
  variantId: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  async function add() {
    setLoading(true);
    const res = await fetch(`/api/storefront/${storeSlug}/cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, quantity: 1 }),
    });
    setLoading(false);
    setOk(res.ok);
  }

  return (
    <Button size="sm" onClick={add} disabled={disabled || loading}>
      {ok ? "Ajouté" : loading ? "…" : "Ajouter"}
    </Button>
  );
}
