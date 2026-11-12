"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  lifecycle: string;
  loyaltyPoints: number;
  orderCount: number;
  marketingConsentWhatsApp: boolean;
  segmentKeys: string[];
};

export function CrmPanel({
  storeId,
  customers,
  segments,
  campaigns,
  complaints,
}: {
  storeId: string;
  customers: CustomerRow[];
  segments: Array<{ key: string; name: string; description: string | null }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    channel: string;
    sentCount: number;
    skippedNoConsent: number;
  }>;
  complaints: Array<{
    id: string;
    subject: string;
    status: string;
    customerId: string;
  }>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState(customers[0]?.id || "");

  async function createCustomer() {
    const name = (document.getElementById("crm-name") as HTMLInputElement).value;
    const phone = (document.getElementById("crm-phone") as HTMLInputElement)
      .value;
    const consent = (
      document.getElementById("crm-consent") as HTMLInputElement
    ).checked;
    const res = await fetch(`/api/stores/${storeId}/crm/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        lifecycle: "prospect",
        marketingConsentWhatsApp: consent,
      }),
    });
    const data = await res.json();
    setMessage(data.error || `Créé ${data.customer?.id}`);
    router.refresh();
  }

  async function addPoints() {
    if (!selected) return;
    const points = Number(
      (document.getElementById("crm-points") as HTMLInputElement).value || 10,
    );
    const res = await fetch(`/api/stores/${storeId}/crm/loyalty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: selected,
        type: "earn",
        points,
        reason: "Bonus marchand",
      }),
    });
    const data = await res.json();
    setMessage(
      data.error || `Fidélité: ${data.customer?.loyaltyPoints} pts`,
    );
    router.refresh();
  }

  async function issueCoupon() {
    if (!selected) return;
    const res = await fetch(`/api/stores/${storeId}/crm/coupons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: selected,
        type: "percent",
        valueMinor: 10,
      }),
    });
    const data = await res.json();
    setMessage(data.error || `Coupon ${data.coupon?.code}`);
    router.refresh();
  }

  async function openComplaint() {
    if (!selected) return;
    const subject = (
      document.getElementById("crm-complaint") as HTMLInputElement
    ).value;
    const res = await fetch(`/api/stores/${storeId}/crm/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: selected,
        subject: subject || "Réclamation",
        body: subject || "Détail à compléter",
      }),
    });
    const data = await res.json();
    setMessage(data.error || `Réclamation ${data.complaint?.status}`);
    router.refresh();
  }

  async function createCampaign() {
    const name = (
      document.getElementById("camp-name") as HTMLInputElement
    ).value;
    const template = (
      document.getElementById("camp-msg") as HTMLInputElement
    ).value;
    const segmentKey = (
      document.getElementById("camp-segment") as HTMLSelectElement
    ).value;
    const res = await fetch(`/api/stores/${storeId}/crm/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || "Campagne consentement",
        channel: "whatsapp",
        segmentKey: segmentKey || "consent_whatsapp",
        messageTemplate:
          template || "Bonjour {{name}} — offre fidélité {{points}} pts.",
        requireConsent: true,
      }),
    });
    const data = await res.json();
    setMessage(data.error || `Campagne ${data.campaign?.id}`);
    router.refresh();
  }

  async function runCampaign(id: string) {
    if (!window.confirm("Confirmer l'envoi (confirmSend) aux opt-in uniquement ?")) {
      setMessage("Annulé — aucun spam sans confirmation.");
      return;
    }
    const res = await fetch(`/api/stores/${storeId}/crm/campaigns`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "run",
        automationId: id,
        confirmSend: true,
      }),
    });
    const data = await res.json();
    setMessage(data.notice || data.error || data.status);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {message && <p className="text-sm text-[var(--muted)]">{message}</p>}

      <Card>
        <h2 className="mb-3 font-semibold">Nouveau prospect / client</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="crm-name">Nom</Label>
            <Input id="crm-name" placeholder="Amina" />
          </div>
          <div>
            <Label htmlFor="crm-phone">Téléphone</Label>
            <Input id="crm-phone" placeholder="2438..." />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input id="crm-consent" type="checkbox" />
          Consentement marketing WhatsApp
        </label>
        <Button className="mt-3" onClick={() => void createCustomer()}>
          Enregistrer
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Clients ({customers.length})</h2>
        <select
          className="mb-3 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.phone || c.email || c.id} · {c.lifecycle} ·{" "}
              {c.loyaltyPoints} pts
              {c.marketingConsentWhatsApp ? " · WA✓" : ""}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="crm-points">Points</Label>
            <Input id="crm-points" type="number" defaultValue={10} />
          </div>
          <Button onClick={() => void addPoints()}>Créditer fidélité</Button>
          <Button variant="secondary" onClick={() => void issueCoupon()}>
            Coupon perso −10%
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input id="crm-complaint" placeholder="Sujet réclamation" />
          <Button variant="secondary" onClick={() => void openComplaint()}>
            Ouvrir réclamation
          </Button>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {customers.slice(0, 15).map((c) => (
            <li
              key={c.id}
              className="flex justify-between gap-2 border-b border-[var(--line)] py-2"
            >
              <span>
                {c.name || "—"} · {c.orderCount} cmd · segments{" "}
                {c.segmentKeys.join(",") || "—"}
              </span>
              <span className="text-xs text-[var(--muted)]">{c.lifecycle}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Segments</h2>
        <ul className="space-y-2 text-sm">
          {segments.map((s) => (
            <li key={s.key}>
              <strong>{s.name}</strong>{" "}
              <span className="text-[var(--muted)]">({s.key})</span> —{" "}
              {s.description}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">
          Campagnes marketing (consentement obligatoire)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="camp-name">Nom</Label>
            <Input id="camp-name" placeholder="Relance VIP" />
          </div>
          <div>
            <Label htmlFor="camp-segment">Segment</Label>
            <select
              id="camp-segment"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              {segments.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="camp-msg">Message</Label>
          <Input
            id="camp-msg"
            placeholder="Bonjour {{name}} — votre solde {{points}} pts"
          />
        </div>
        <Button className="mt-3" onClick={() => void createCampaign()}>
          Créer campagne
        </Button>
        <ul className="mt-4 space-y-2 text-sm">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2"
            >
              <span>
                {c.name} · {c.channel} · {c.status} · envoyés {c.sentCount} ·
                skip consent {c.skippedNoConsent}
              </span>
              <Button size="sm" onClick={() => void runCampaign(c.id)}>
                Lancer
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Réclamations</h2>
        <ul className="space-y-2 text-sm">
          {complaints.length === 0 && (
            <li className="text-[var(--muted)]">Aucune réclamation.</li>
          )}
          {complaints.map((c) => (
            <li key={c.id}>
              {c.subject} · {c.status}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
