"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PaymentActions(props: {
  storeId: string;
  paymentId: string;
  orderId: string;
  canRefund: boolean;
  isCod: boolean;
  orderStatus: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refund() {
    setLoading(true);
    setMsg(null);
    const res = await fetch(
      `/api/stores/${props.storeId}/payments/${props.paymentId}/refund`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Demande marchand" }),
      },
    );
    const data = await res.json();
    setLoading(false);
    setMsg(
      res.ok && data.ok
        ? `Remboursement ${data.data.refund.status}`
        : data.error || "Échec remboursement",
    );
  }

  async function confirmCod() {
    setLoading(true);
    setMsg(null);
    const res = await fetch(
      `/api/stores/${props.storeId}/orders/${props.orderId}/confirm-cod`,
      { method: "POST" },
    );
    const data = await res.json();
    setLoading(false);
    setMsg(
      res.ok && data.ok
        ? "COD confirmé — commande paid"
        : data.error || "Échec confirmation COD",
    );
  }

  return (
    <div className="mt-2 flex flex-col items-end gap-1">
      <a
        className="text-xs underline"
        href={`/api/stores/${props.storeId}/orders/${props.orderId}/receipt`}
      >
        Reçu PDF
      </a>
      {props.isCod && props.orderStatus === "cod_pending" && (
        <Button
          type="button"
          className="h-8 px-2 text-xs"
          disabled={loading}
          onClick={confirmCod}
        >
          Confirmer espèces (COD)
        </Button>
      )}
      {props.canRefund && !props.isCod && (
        <Button
          type="button"
          className="h-8 px-2 text-xs"
          disabled={loading}
          onClick={refund}
        >
          Rembourser
        </Button>
      )}
      {msg && <p className="max-w-[14rem] text-xs text-[var(--muted)]">{msg}</p>}
    </div>
  );
}
