# Studio Pubs AI (Phase 6)

## Objectif

Étendre le Studio Pubs au-delà des stubs MVP : génération **product-aware**, packs multi-stratégies, visuels multi-formats, scripts vidéo, crédits, et publication vers les canaux Phase 5 — **sans jamais inventer un succès** quand les clés ou confirmations manquent.

## Jobs supportés

| Type | Description | Clés requises |
|------|-------------|---------------|
| `ad_copy` / `product_description` | Texte simple | `OPENAI_API_KEY` |
| `ad_copy_pack` | Titres, descriptions, CTA, hashtags, promo WhatsApp pour **sales / acquisition / brand** | `OPENAI_API_KEY` + produit catalogue |
| `ad_image` | Image unique | `OPENAI_API_KEY` |
| `ad_visual` | Bannières / IG-FB / WhatsApp Status / TikTok (tailles DALL·E) + overlays prix/promo | `OPENAI_API_KEY` |
| `ad_ab_variants` | 2–3 variantes A/B texte+image | `OPENAI_API_KEY` + produit |
| `ad_video_script` | Scripts 15/30/60s, hooks sous-titres, VO FR/EN, ratios 9:16 · 1:1 · 16:9 | Script local OK ; TTS/render **fail-closed** |

## Crédits

- Compteur `AIUsage.creditsUsed` / `creditsLimit` (défaut `AI_CREDITS_LIMIT=500`).
- Coûts indicatifs : copy 2, pack 8, image 5, visual 12, A/B 15, script vidéo 6.
- Dépassement → `CreditsExceededError` (job `failed`, message explicite).

## TTS / vidéo

- `ELEVENLABS_API_KEY` ou `OPENAI_API_KEY` : hook voiceover — **pas de faux fichier audio**.
- `VIDEO_RENDER_API_KEY` : hook rendu — **pas de faux mp4**.
- Les scripts, scènes, sous-titres et texte voiceover restent générés localement à partir des faits produit.

## Édition / approbation / téléchargement / publication

1. **Éditer** : `PATCH /api/stores/:storeId/ai/creatives/:id`
2. **Approuver** : `PATCH` avec `{ "action": "approve" }` → statut `approved`
3. **Télécharger** : `GET .../creatives/:id?download=1` (JSON export)
4. **Publier organique** : `POST .../publish` avec `confirmPublish=true` + connexion Meta/TikTok Phase 5
5. **Dépense Ads** : `mode: "spend"` + `confirmSpend=true` — jamais de succès inventé sans clés / éligibilité

Sans confirmation ou sans credentials : statut `needs_confirmation` / `unavailable` — **aucun faux succès**.

## Variables d’environnement

Voir `.env.example` : `OPENAI_API_KEY`, `AI_CREDITS_LIMIT`, `ELEVENLABS_API_KEY`, `VIDEO_RENDER_API_KEY`, plus clés sociales Phase 5.

## Garde-fous

- Génération ancrée sur le catalogue (`productId`) — pas de prix inventés hors faits produit.
- Fail-closed providers (`Noop*`, hooks TTS/vidéo).
- Publication / spend : confirmations utilisateur explicites + canaux connectés.
