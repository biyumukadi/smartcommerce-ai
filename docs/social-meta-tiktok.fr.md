# Meta (IG/FB) & TikTok — notes FR (Phase 5)

## Principes

1. **Fail-closed** : sans `META_APP_ID`/`META_APP_SECRET` ou `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`, OAuth et publish retournent `unavailable` — **jamais** de succès de publication inventé.
2. **Spend Ads** : `confirmSpend=true` obligatoire. Sans confirmation → `needs_confirmation`. Campagnes Meta créées en **PAUSED**.
3. **Catalogue** : sync API si `META_CATALOG_ID` + token ; sinon **export manuel** clair (`exported` / `unavailable`).
4. **TikTok Ads** : seulement si `TIKTOK_ADS_ELIGIBLE=true` ; sinon export manuel créatifs.

## Approvals

| Plateforme | Sandbox | Production |
|------------|---------|------------|
| Meta App + OAuth | App ID/secret | Business Verification |
| Pages FB / IG pro | Comptes test | Permissions review Meta |
| Meta Catalog | Catalog test | Commerce Manager |
| Meta Ads | Ad account test | Billing + ads_management |
| TikTok for Business | App + sandbox | **Audit TikTok** souvent requis |
| TikTok Ads | Limité | Éligibilité compte + scopes |

## Permissions Meta (UI)

- `pages_manage_posts`, `instagram_content_publish`
- `instagram_manage_comments` / `pages_read_engagement`
- `catalog_management`, `ads_management`, `business_management`

## Endpoints

- `POST /api/social/:platform/start` → URL OAuth ou unavailable
- `GET /api/social/:platform/callback`
- `GET /api/stores/:storeId/social/connections`
- `POST /api/stores/:storeId/social/catalog`
- `GET/POST /api/stores/:storeId/social/posts`
- `GET /api/stores/:storeId/social/posts/:id/comments`
- `GET/POST /api/stores/:storeId/social/campaigns` (`action=launch` + `confirmSpend`)
- `POST /api/storefront/:slug/attribution` (UTM / click ids)

Dashboard : `/[locale]/dashboard/social`
