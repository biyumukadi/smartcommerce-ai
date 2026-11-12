"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AdminPanel({
  organizations,
  subscriptions,
}: {
  organizations: Array<{
    id: string;
    name: string;
    status: string;
    plan: string;
  }>;
  subscriptions: Array<{
    id: string;
    org: string;
    plan: string;
    status: string;
  }>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function orgStatus(id: string, status: "active" | "suspended") {
    const res = await fetch("/api/admin/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "org_status", organizationId: id, status }),
    });
    const json = await res.json();
    setMessage(json.error || `Org ${status}`);
    router.refresh();
  }

  async function subStatus(
    id: string,
    status: "trialing" | "active" | "past_due" | "cancelled",
  ) {
    const res = await fetch("/api/admin/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "subscription_status",
        subscriptionId: id,
        status,
      }),
    });
    const json = await res.json();
    setMessage(json.error || `Sub ${status}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {message && <p className="text-sm text-[var(--muted)]">{message}</p>}
      <Card>
        <h2 className="mb-3 font-semibold">Organisations</h2>
        <ul className="space-y-2 text-sm">
          {organizations.map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2"
            >
              <span>
                {o.name} · {o.status} · {o.plan}
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void orgStatus(o.id, "active")}
                >
                  Activer
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void orgStatus(o.id, "suspended")}
                >
                  Suspendre
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Abonnements</h2>
        <ul className="space-y-2 text-sm">
          {subscriptions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2"
            >
              <span>
                {s.org} · {s.plan} · {s.status}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void subStatus(s.id, "cancelled")}
              >
                Cancel
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
