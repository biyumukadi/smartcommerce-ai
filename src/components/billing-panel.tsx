"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function BillingPanel({
  currentPlan,
  billingProvider,
}: {
  currentPlan: string;
  billingProvider: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function choose(planCode: string) {
    if (planCode !== "trial") {
      const ok = window.confirm(
        `Confirmer l'achat du plan ${planCode} (confirmPurchase) ? Sans provider billing, l'activation payante échouera explicitement.`,
      );
      if (!ok) {
        setMessage("Annulé — pas de faux abonnement payant.");
        return;
      }
    }
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/billing/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planCode,
        confirmPurchase: planCode === "trial" ? true : true,
      }),
    });
    const json = await res.json();
    setLoading(false);
    const data = json.data || json;
    if (data.checkout?.status === "redirect" && data.checkout.checkoutUrl) {
      window.location.href = data.checkout.checkoutUrl;
      return;
    }
    setMessage(
      data.checkout?.error ||
        data.checkout?.notice ||
        data.error ||
        json.error ||
        `Plan ${data.subscription?.plan?.code || planCode}`,
    );
    router.refresh();
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Changer de plan</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Actuel: {currentPlan} · billing={billingProvider}
      </p>
      {message && <p className="mb-3 text-sm text-[var(--muted)]">{message}</p>}
      <div className="flex flex-wrap gap-2">
        {(["trial", "starter", "business", "premium"] as const).map((code) => (
          <Button
            key={code}
            disabled={loading || code === currentPlan}
            variant={code === currentPlan ? "secondary" : "default"}
            onClick={() => void choose(code)}
          >
            {code}
          </Button>
        ))}
      </div>
    </Card>
  );
}
