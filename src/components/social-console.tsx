"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export function SocialConsole({ storeId }: { storeId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [campaignId, setCampaignId] = useState("");

  async function connect(platform: "meta" | "tiktok") {
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/social/${platform}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.ok) {
      setMsg(data.error || "OAuth indisponible");
      return;
    }
    if (data.data.status === "redirect" && data.data.url) {
      window.location.href = data.data.url;
      return;
    }
    setMsg(data.data.error || "OAuth unavailable");
  }

  async function syncCatalog(platform: "meta" | "tiktok") {
    setLoading(true);
    const res = await fetch(`/api/stores/${storeId}/social/catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    });
    const data = await res.json();
    setLoading(false);
    setMsg(
      res.ok && data.ok
        ? `Catalogue ${platform}: ${data.data.result.status} (${data.data.result.itemCount} items)`
        : data.error || "Échec catalogue",
    );
  }

  async function createPost(platform: "meta" | "tiktok", confirmPublish: boolean) {
    setLoading(true);
    const caption = (document.getElementById("caption") as HTMLInputElement)
      ?.value;
    const res = await fetch(`/api/stores/${storeId}/social/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        caption,
        productName: "Produit démo",
        priceLabel: "25 USD",
        storeName: "Boutique",
        confirmPublish,
      }),
    });
    const data = await res.json();
    setLoading(false);
    setMsg(
      res.ok && data.ok
        ? `Post ${platform}: ${data.data.publish.status}`
        : data.error || "Échec post",
    );
  }

  async function createCampaign(platform: "meta" | "tiktok") {
    setLoading(true);
    const res = await fetch(`/api/stores/${storeId}/social/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        name: `Campagne ${platform} ${new Date().toISOString().slice(0, 10)}`,
        budgetMinor: 5000,
        currency: "USD",
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok && data.ok) {
      setCampaignId(data.data.campaign.id);
      setMsg(data.data.notice);
    } else {
      setMsg(data.error || "Échec campagne");
    }
  }

  async function launchCampaign(
    platform: "meta" | "tiktok",
    confirmSpend: boolean,
  ) {
    if (!campaignId) {
      setMsg("Créez d’abord une campagne draft");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/stores/${storeId}/social/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "launch",
        campaignId,
        platform,
        confirmSpend,
      }),
    });
    const data = await res.json();
    setLoading(false);
    setMsg(
      res.ok && data.ok
        ? `Launch: ${data.data.launch.status}${data.data.launch.error ? " — " + data.data.launch.error : ""}`
        : data.error || "Échec launch",
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-semibold">Connexions OAuth</h2>
        <div className="flex flex-wrap gap-2">
          <Button disabled={loading} onClick={() => connect("meta")}>
            Connecter Meta (FB/IG)
          </Button>
          <Button disabled={loading} onClick={() => connect("tiktok")}>
            Connecter TikTok
          </Button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Sans META_APP_* / TIKTOK_CLIENT_* : OAuth unavailable (pas de faux
          succès).
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Catalogue</h2>
        <div className="flex flex-wrap gap-2">
          <Button disabled={loading} onClick={() => syncCatalog("meta")}>
            Sync/Export Meta
          </Button>
          <Button disabled={loading} onClick={() => syncCatalog("tiktok")}>
            Export TikTok
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Posts / promo</h2>
        <div>
          <Label htmlFor="caption">Caption</Label>
          <Input id="caption" placeholder="Promo Mobile Money Kinshasa…" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={loading} onClick={() => createPost("meta", false)}>
            Draft Meta
          </Button>
          <Button disabled={loading} onClick={() => createPost("meta", true)}>
            Publier Meta (confirmé)
          </Button>
          <Button disabled={loading} onClick={() => createPost("tiktok", false)}>
            Préparer TikTok
          </Button>
          <Button disabled={loading} onClick={() => createPost("tiktok", true)}>
            Publier TikTok (confirmé)
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Ads (spend gate)</h2>
        <p className="text-xs text-[var(--muted)]">
          Aucun spend sans case/action confirmSpend. Campagnes créées en draft /
          paused.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={loading} onClick={() => createCampaign("meta")}>
            Draft Ads Meta
          </Button>
          <Button
            disabled={loading}
            onClick={() => launchCampaign("meta", false)}
          >
            Launch sans confirm
          </Button>
          <Button
            disabled={loading}
            onClick={() => launchCampaign("meta", true)}
          >
            Launch + confirmSpend
          </Button>
          <Button disabled={loading} onClick={() => createCampaign("tiktok")}>
            Draft Ads TikTok
          </Button>
        </div>
        {campaignId && (
          <p className="text-xs text-[var(--muted)]">Campaign draft: {campaignId}</p>
        )}
      </Card>

      {msg && <p className="text-sm text-[var(--brand)]">{msg}</p>}
    </div>
  );
}
