"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

type ProductOption = { id: string; name: string };
type CreativeRow = {
  id: string;
  type: string;
  status: string;
  headline: string | null;
  body: string | null;
  cta: string | null;
  strategy: string | null;
  format: string | null;
  variantLabel: string | null;
  hashtags: string[];
};

const JOB_TYPES = [
  { id: "ad_copy_pack", label: "Pack copy (3 stratégies)" },
  { id: "ad_visual", label: "Visuels multi-formats" },
  { id: "ad_ab_variants", label: "Variantes A/B" },
  { id: "ad_video_script", label: "Script vidéo 15/30/60s" },
  { id: "ad_copy", label: "Texte simple" },
  { id: "ad_image", label: "Image simple" },
] as const;

export function AdsStudio({
  storeId,
  locale,
  products,
  creatives,
}: {
  storeId: string;
  locale: "fr" | "en";
  products: ProductOption[];
  creatives: CreativeRow[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [jobType, setJobType] =
    useState<(typeof JOB_TYPES)[number]["id"]>("ad_copy_pack");
  const [strategy, setStrategy] = useState<"sales" | "acquisition" | "brand">(
    "sales",
  );
  const [durationSec, setDurationSec] = useState<15 | 30 | 60>(30);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">(
    "9:16",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHeadline, setEditHeadline] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCta, setEditCta] = useState("");

  async function submit() {
    setLoading(true);
    setMessage(null);
    const promptInput = document.getElementById("prompt") as HTMLInputElement;
    const res = await fetch(`/api/stores/${storeId}/ai/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: jobType,
        prompt: promptInput.value,
        productId: productId || undefined,
        locale,
        strategy,
        durationSec,
        aspectRatio,
        includeVoiceover: jobType === "ad_video_script",
        includeVideoRender: false,
      }),
    });
    const data = await res.json();
    setLoading(false);
    setMessage(data.notice || data.error || data.job?.status);
    setTimeout(() => router.refresh(), 1500);
    setTimeout(() => router.refresh(), 5000);
  }

  async function approve(id: string) {
    setMessage(null);
    const res = await fetch(`/api/stores/${storeId}/ai/creatives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const data = await res.json();
    setMessage(data.error || `Approuvé · ${data.creative?.status}`);
    router.refresh();
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/stores/${storeId}/ai/creatives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: editHeadline,
        body: editBody,
        cta: editCta,
      }),
    });
    const data = await res.json();
    setMessage(data.error || "Créatif mis à jour");
    setEditingId(null);
    router.refresh();
  }

  async function publish(
    id: string,
    platform: "meta" | "tiktok",
    mode: "organic" | "spend",
  ) {
    const confirmLabel =
      mode === "spend"
        ? "Confirmer la dépense Ads (confirmSpend) ?"
        : "Confirmer la publication organique (confirmPublish) ?";
    if (!window.confirm(confirmLabel)) {
      setMessage("Annulé — aucune publication/dépense sans confirmation.");
      return;
    }
    const res = await fetch(
      `/api/stores/${storeId}/ai/creatives/${id}/publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          mode,
          confirmPublish: mode === "organic",
          confirmSpend: mode === "spend",
          budgetMinor: mode === "spend" ? 5000 : undefined,
          currency: "USD",
        }),
      },
    );
    const data = await res.json();
    setMessage(data.notice || data.error || data.status);
    router.refresh();
  }

  function startEdit(c: CreativeRow) {
    setEditingId(c.id);
    setEditHeadline(c.headline || "");
    setEditBody(c.body || "");
    setEditCta(c.cta || "");
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 font-semibold">Générer un créatif product-aware</h2>
        <div className="space-y-3">
          <div>
            <Label htmlFor="productId">Produit catalogue</Label>
            <select
              id="productId"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">— sélectionner —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="jobType">Type de job</Label>
            <select
              id="jobType"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={jobType}
              onChange={(e) =>
                setJobType(e.target.value as (typeof JOB_TYPES)[number]["id"])
              }
            >
              {JOB_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="strategy">Stratégie</Label>
              <select
                id="strategy"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                value={strategy}
                onChange={(e) =>
                  setStrategy(
                    e.target.value as "sales" | "acquisition" | "brand",
                  )
                }
              >
                <option value="sales">Sales</option>
                <option value="acquisition">Acquisition</option>
                <option value="brand">Brand</option>
              </select>
            </div>
            <div>
              <Label htmlFor="duration">Durée vidéo</Label>
              <select
                id="duration"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                value={durationSec}
                onChange={(e) =>
                  setDurationSec(Number(e.target.value) as 15 | 30 | 60)
                }
              >
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
              </select>
            </div>
            <div>
              <Label htmlFor="aspect">Ratio</Label>
              <select
                id="aspect"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                value={aspectRatio}
                onChange={(e) =>
                  setAspectRatio(e.target.value as "9:16" | "1:1" | "16:9")
                }
              >
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="prompt">Brief / prompt</Label>
            <Input
              id="prompt"
              placeholder="Pub Mobile Money friendly, ton Kinshasa, CTA WhatsApp"
            />
          </div>
          {message && <p className="text-sm text-[var(--muted)]">{message}</p>}
          <Button disabled={loading} onClick={() => void submit()}>
            {loading ? "En file…" : "Lancer la génération"}
          </Button>
          <p className="text-xs text-[var(--muted)]">
            Sans OPENAI_API_KEY: jobs texte/image échouent explicitement. Scripts
            vidéo locaux OK; TTS/rendu vidéo restent fail-closed (pas de faux
            média).
          </p>
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold">Créatifs — éditer / approuver / publier</h2>
        {creatives.length === 0 && (
          <p className="text-sm text-[var(--muted)]">Aucun créatif encore.</p>
        )}
        {creatives.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {c.headline || "(sans titre)"} · {c.type} · {c.status}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {[c.strategy, c.format, c.variantLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {editingId === c.id ? (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={editHeadline}
                      onChange={(e) => setEditHeadline(e.target.value)}
                      placeholder="Titre"
                    />
                    <Input
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      placeholder="Corps"
                    />
                    <Input
                      value={editCta}
                      onChange={(e) => setEditCta(e.target.value)}
                      placeholder="CTA"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void saveEdit(c.id)}>
                        Enregistrer
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
                    {(c.body || "").slice(0, 280)}
                    {c.cta ? `\nCTA: ${c.cta}` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => startEdit(c)}
                >
                  Éditer
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void approve(c.id)}>
                  Approuver
                </Button>
                <a
                  className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-xs"
                  href={`/api/stores/${storeId}/ai/creatives/${c.id}?download=1`}
                >
                  Télécharger
                </a>
                <Button
                  size="sm"
                  onClick={() => void publish(c.id, "meta", "organic")}
                >
                  Publier Meta
                </Button>
                <Button
                  size="sm"
                  onClick={() => void publish(c.id, "tiktok", "organic")}
                >
                  Publier TikTok
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void publish(c.id, "meta", "spend")}
                >
                  Ads Meta (spend)
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
