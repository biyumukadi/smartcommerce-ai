"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function InboxActions({
  storeId,
  conversationId,
  status,
}: {
  storeId: string;
  conversationId: string;
  status: string;
}) {
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendReply() {
    if (!reply.trim()) return;
    setLoading(true);
    const res = await fetch(
      `/api/stores/${storeId}/conversations/${conversationId}/reply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      },
    );
    const data = await res.json();
    setLoading(false);
    if (res.ok && data.ok) {
      setReply("");
      setMsg(`Envoyé: ${data.data.result.status}`);
    } else {
      setMsg(data.error || "Échec envoi");
    }
  }

  async function handoff(action: "handoff" | "resume_ai") {
    setLoading(true);
    const res = await fetch(
      `/api/stores/${storeId}/conversations/${conversationId}/handoff`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    const data = await res.json();
    setLoading(false);
    setMsg(
      res.ok && data.ok
        ? action === "handoff"
          ? "Transféré à un humain"
          : "IA réactivée"
        : data.error || "Échec",
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
      <textarea
        className="min-h-[64px] w-full rounded-md border border-[var(--line)] bg-[var(--surface)] p-2 text-sm"
        placeholder="Réponse humaine…"
        value={reply}
        onChange={(e) => setReply(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="h-8 px-2 text-xs"
          disabled={loading}
          onClick={sendReply}
        >
          Envoyer
        </Button>
        {status !== "human_handoff" ? (
          <Button
            type="button"
            className="h-8 px-2 text-xs"
            disabled={loading}
            onClick={() => handoff("handoff")}
          >
            Handoff humain
          </Button>
        ) : (
          <Button
            type="button"
            className="h-8 px-2 text-xs"
            disabled={loading}
            onClick={() => handoff("resume_ai")}
          >
            Reprendre IA
          </Button>
        )}
      </div>
      {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}
    </div>
  );
}
