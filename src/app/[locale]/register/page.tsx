"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function RegisterPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name")),
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      organizationName: String(fd.get("organizationName")),
      storeName: String(fd.get("storeName")),
      currency: String(fd.get("currency") || "USD"),
      locale: locale === "en" ? "en" : "fr",
    };

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Inscription échouée");
      setLoading(false);
      return;
    }

    const login = await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });
    if (login?.error) {
      setError("Compte créé mais connexion échouée — essayez de vous connecter.");
      setLoading(false);
      return;
    }
    router.push(`/${locale}/dashboard`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <Card>
        <h1 className="mb-1 text-2xl font-semibold">Créer un compte</h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Organisation + première boutique en une étape.
        </p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="name">Nom</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" name="password" type="password" minLength={8} required />
          </div>
          <div>
            <Label htmlFor="organizationName">Organisation</Label>
            <Input id="organizationName" name="organizationName" required />
          </div>
          <div>
            <Label htmlFor="storeName">Boutique</Label>
            <Input id="storeName" name="storeName" required />
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
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Création…" : "Créer ma boutique"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Déjà un compte ?{" "}
          <Link href={`/${locale}/login`} className="text-[var(--brand)]">
            Connexion
          </Link>
        </p>
      </Card>
    </main>
  );
}
