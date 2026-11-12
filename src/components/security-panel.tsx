"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function SecurityPanel({ mfaEnabled }: { mfaEnabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);

  async function beginMfa() {
    const res = await fetch("/api/security/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "begin" }),
    });
    const json = await res.json();
    const data = json.data || json;
    setSecret(data.secret || null);
    setOtpauth(data.otpauthUrl || null);
    setMessage(data.notice || json.error);
  }

  async function confirmMfa() {
    const token = (document.getElementById("mfa-token") as HTMLInputElement)
      .value;
    const res = await fetch("/api/security/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", token }),
    });
    const json = await res.json();
    setMessage(json.error || (json.data?.mfaEnabled ? "MFA activé" : "OK"));
    router.refresh();
  }

  async function exportData() {
    const res = await fetch("/api/security/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export" }),
    });
    const json = await res.json();
    const payload = json.data?.payload;
    if (payload) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "smartcommerce-export.json";
      a.click();
      URL.revokeObjectURL(url);
    }
    setMessage(json.error || "Export téléchargé");
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Confirmer anonymisation du compte (confirm=true) ? Irréversible.",
      )
    ) {
      setMessage("Annulé");
      return;
    }
    const res = await fetch("/api/security/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", confirm: true }),
    });
    const json = await res.json();
    setMessage(json.data?.status || json.error || "done");
  }

  return (
    <div className="space-y-4">
      {message && <p className="text-sm text-[var(--muted)]">{message}</p>}
      <Card>
        <h2 className="mb-3 font-semibold">
          MFA TOTP {mfaEnabled ? "(actif)" : ""}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void beginMfa()}>Générer secret</Button>
          <Input id="mfa-token" placeholder="Code 6 chiffres" className="w-40" />
          <Button variant="secondary" onClick={() => void confirmMfa()}>
            Confirmer MFA
          </Button>
        </div>
        {secret && (
          <p className="mt-3 break-all text-xs text-[var(--muted)]">
            Secret: {secret}
          </p>
        )}
        {otpauth && (
          <p className="mt-1 break-all text-xs text-[var(--muted)]">{otpauth}</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Confidentialité</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void exportData()}>Exporter mes données</Button>
          <Button variant="secondary" onClick={() => void deleteAccount()}>
            Anonymiser mon compte
          </Button>
        </div>
      </Card>
    </div>
  );
}
