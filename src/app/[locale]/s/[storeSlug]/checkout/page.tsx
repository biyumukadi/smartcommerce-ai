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
  const [method, setMethod] = useState("mobile_money");

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
        operator: fd.get("operator")
          ? String(fd.get("operator"))
          : undefined,
        currency: String(fd.get("currency") || "USD"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.ok) {
      setError(data.error || "Checkout échoué");
      return;
    }
    const providerRef = data.data.intent?.providerRef;
    const qs = new URLSearchParams({
      orderId: data.data.order.id,
      providerRef: providerRef || "",
      method: data.data.payment.method || "",
      status: data.data.order.status || "",
    });
    router.push(`/${locale}/s/${storeSlug}/checkout/result?${qs.toString()}`);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <h1 className="mb-2 text-2xl font-semibold">Checkout</h1>
        <p className="mb-6 text-sm text-amber-800">
          Mode sandbox — carte/MM : paid uniquement après webhook provider
          signé. COD : chemin séparé (cod_pending), sans faux succès carte.
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
            <Label htmlFor="currency">Devise</Label>
            <select
              id="currency"
              name="currency"
              className="h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3"
              defaultValue="USD"
            >
              <option value="USD">USD</option>
              <option value="CDF">CDF</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div>
            <Label htmlFor="method">Méthode</Label>
            <select
              id="method"
              name="method"
              className="h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="mobile_money">Mobile Money</option>
              <option value="card">Carte Visa / Mastercard</option>
              <option value="cash_on_delivery">Paiement à la livraison (COD)</option>
              <option value="bank">Banque</option>
            </select>
          </div>
          {method === "mobile_money" && (
            <div>
              <Label htmlFor="operator">Opérateur Mobile Money</Label>
              <select
                id="operator"
                name="operator"
                className="h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3"
                defaultValue="orange_money"
              >
                <option value="orange_money">Orange Money</option>
                <option value="mpesa">M-Pesa</option>
                <option value="airtel_money">Airtel Money</option>
              </select>
            </div>
          )}
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
