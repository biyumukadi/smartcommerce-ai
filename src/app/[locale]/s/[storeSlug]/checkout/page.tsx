"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function CheckoutPage() {
  const { locale, storeSlug } = useParams<{
    locale: string;
    storeSlug: string;
  }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/storefront/${storeSlug}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name")),
        email: String(fd.get("email") || ""),
        phone: String(fd.get("phone") || ""),
        city: String(fd.get("city")),
        address: String(fd.get("address")),
        notes: String(fd.get("notes") || ""),
        method: String(fd.get("method") || "mobile_money"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.ok) {
      setError(data.error || "Checkout échoué");
      return;
    }
    const providerRef = data.data.intent?.providerRef;
    router.push(
      `/${locale}/s/${storeSlug}/checkout/result?orderId=${data.data.order.id}&providerRef=${providerRef || ""}`,
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <h1 className="mb-2 text-2xl font-semibold">Checkout</h1>
        <p className="mb-6 text-sm text-amber-800">
          Mode paiement sandbox/mock — la commande n’est marquée payée qu’après
          confirmation provider (webhook signé).
        </p>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="name">Nom</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="phone">Téléphone (Mobile Money)</Label>
            <Input id="phone" name="phone" placeholder="+243…" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div>
            <Label htmlFor="city">Ville</Label>
            <Input id="city" name="city" defaultValue="Kinshasa" required />
          </div>
          <div>
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" name="address" required />
          </div>
          <div>
            <Label htmlFor="method">Méthode</Label>
            <select
              id="method"
              name="method"
              className="h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3"
              defaultValue="mobile_money"
            >
              <option value="mobile_money">Mobile Money</option>
              <option value="card">Carte</option>
              <option value="bank">Banque</option>
            </select>
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Création commande…" : "Créer la commande + intent"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
