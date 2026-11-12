"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";

function ResultInner() {
  const { locale, storeSlug } = useParams<{
    locale: string;
    storeSlug: string;
  }>();
  const search = useSearchParams();
  const router = useRouter();
  const orderId = search.get("orderId");
  const providerRef = search.get("providerRef") || search.get("mockPayment");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function confirmMock() {
    if (!providerRef) return;
    setLoading(true);
    const res = await fetch("/api/payments/mock/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerRef }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.ok) {
      setMessage(data.error || "Confirmation échouée");
      return;
    }
    setMessage("Paiement confirmé via webhook mock signé — commande paid.");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Card className="space-y-4">
        <h1 className="text-2xl font-semibold">Résultat checkout</h1>
        <p className="text-sm text-[var(--muted)]">Commande: {orderId}</p>
        <p className="text-sm text-[var(--muted)]">Provider ref: {providerRef}</p>
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Sandbox: le paiement n’est pas marqué réussi tant que le webhook
          provider n’a pas confirmé. Bouton ci-dessous = émettre un webhook mock
          signé (pas un succès silencieux).
        </p>
        {providerRef && (
          <Button onClick={confirmMock} disabled={loading}>
            {loading ? "Confirmation…" : "Confirmer paiement sandbox (webhook)"}
          </Button>
        )}
        {message && <p className="text-sm text-[var(--brand)]">{message}</p>}
        <Link href={`/${locale}/s/${storeSlug}`} className="text-sm underline">
          Retour boutique
        </Link>
      </Card>
    </main>
  );
}

export default function CheckoutResultPage() {
  return (
    <Suspense fallback={<p className="p-8">Chargement…</p>}>
      <ResultInner />
    </Suspense>
  );
}
