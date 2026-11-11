"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export function ProductForm({
  storeId,
  defaultCurrency,
}: {
  storeId: string;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const priceMajor = Number(fd.get("price"));
    const res = await fetch(`/api/stores/${storeId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameFr: String(fd.get("nameFr")),
        nameEn: String(fd.get("nameEn") || ""),
        descriptionFr: String(fd.get("descriptionFr") || ""),
        sku: String(fd.get("sku")),
        priceAmount: Math.round(priceMajor * 100),
        currency: String(fd.get("currency") || defaultCurrency),
        quantityOnHand: Number(fd.get("quantity") || 0),
        status: "active",
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.ok) {
      setError(data.error || "Erreur");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Ajouter un produit</h2>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="nameFr">Nom (FR)</Label>
          <Input id="nameFr" name="nameFr" required />
        </div>
        <div>
          <Label htmlFor="nameEn">Nom (EN)</Label>
          <Input id="nameEn" name="nameEn" />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="descriptionFr">Description</Label>
          <Input id="descriptionFr" name="descriptionFr" />
        </div>
        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" name="sku" required />
        </div>
        <div>
          <Label htmlFor="price">Prix (majeur, ex. 45.00)</Label>
          <Input id="price" name="price" type="number" step="0.01" min="0.01" required />
        </div>
        <div>
          <Label htmlFor="currency">Devise</Label>
          <select
            id="currency"
            name="currency"
            defaultValue={defaultCurrency}
            className="h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3"
          >
            <option value="USD">USD</option>
            <option value="CDF">CDF</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div>
          <Label htmlFor="quantity">Stock</Label>
          <Input id="quantity" name="quantity" type="number" min={0} defaultValue={10} />
        </div>
        {error && <p className="md:col-span-2 text-sm text-red-700">{error}</p>}
        <div className="md:col-span-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Enregistrement…" : "Créer le produit"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
