"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export function AdsStudio({
  storeId,
  locale,
}: {
  storeId: string;
  locale: "fr" | "en";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(type: "ad_copy" | "ad_image") {
    setLoading(true);
    setMessage(null);
    const promptInput = document.getElementById("prompt") as HTMLInputElement;
    const productInput = document.getElementById(
      "productName",
    ) as HTMLInputElement;
    const res = await fetch(`/api/stores/${storeId}/ai/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        prompt: promptInput.value,
        productName: productInput.value,
        locale,
      }),
    });
    const data = await res.json();
    setLoading(false);
    setMessage(data.notice || data.error || data.job?.status);
    // Poll briefly then refresh
    setTimeout(() => router.refresh(), 1500);
    setTimeout(() => router.refresh(), 4000);
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Générer un créatif</h2>
      <div className="space-y-3">
        <div>
          <Label htmlFor="productName">Produit</Label>
          <Input id="productName" placeholder="Écouteurs sans fil" />
        </div>
        <div>
          <Label htmlFor="prompt">Brief / prompt</Label>
          <Input
            id="prompt"
            placeholder="Pub Mobile Money friendly, ton Kinshasa, CTA WhatsApp"
            required
          />
        </div>
        {message && <p className="text-sm text-[var(--muted)]">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={loading} onClick={() => submit("ad_copy")}>
            Générer texte
          </Button>
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => submit("ad_image")}
          >
            Générer image
          </Button>
        </div>
      </div>
    </Card>
  );
}
