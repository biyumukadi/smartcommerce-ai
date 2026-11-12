"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function AnalyticsAssistant({
  storeId,
  period,
  locale,
}: {
  storeId: string;
  period: string;
  locale: "fr" | "en";
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function ask() {
    setLoading(true);
    setResult(null);
    setNotice(null);
    const res = await fetch(`/api/stores/${storeId}/analytics/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question || undefined,
        period,
        locale,
      }),
    });
    const data = await res.json();
    setLoading(false);
    setResult(data.recommendations || data.error || "—");
    setNotice(data.notice || (data.status === "unavailable" ? data.error : null));
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold">Assistant analytique AI</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Recommandations ancrées sur les KPI réels · fail-closed sans clé LLM
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ex: Comment améliorer mon AOV cette semaine ?"
          className="min-w-[16rem] flex-1"
        />
        <Button disabled={loading} onClick={() => void ask()}>
          {loading ? "Analyse…" : "Demander"}
        </Button>
      </div>
      {notice && (
        <p className="mt-2 text-xs text-amber-800">{notice}</p>
      )}
      {result && (
        <pre className="mt-3 whitespace-pre-wrap rounded bg-[var(--surface-2)] p-3 text-sm">
          {result}
        </pre>
      )}
    </Card>
  );
}
