"use client";

import { useState } from "react";

export function WhatsAppConsent({ storeSlug }: { storeSlug: string }) {
  const [consent, setConsent] = useState(false);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/storefront/${storeSlug}/whatsapp/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent, phone: phone || undefined }),
    });
    const data = await res.json();
    setLoading(false);
    setMsg(
      res.ok && data.ok
        ? data.data.notice
        : data.error || "Échec enregistrement consentement",
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--line)] p-3 text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span>
          J’accepte de recevoir des rappels WhatsApp (ex. panier abandonné).
          Sans consentement, aucun nudge marketing.
        </span>
      </label>
      <input
        className="h-9 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3"
        placeholder="Téléphone +243…"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <button
        type="button"
        onClick={save}
        disabled={loading}
        className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {loading ? "…" : "Enregistrer le consentement"}
      </button>
      {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}
    </div>
  );
}
