# WhatsApp Business (Cloud API) — notes FR (Phase 4)

## Principes

1. **Aucun faux envoi** : sans `WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`, le provider est `unavailable` (ou `mock` en local) — status `unavailable` / `failed`, jamais « sent » Meta inventé.
2. **Assistant IA grounded** : lit uniquement catalogue / stock / commandes DB. Sans `OPENAI_API_KEY` → fail-closed + handoff.
3. **Nudges panier** : uniquement si `Customer.marketingConsentWhatsApp = true`.
4. **Webhooks signés** : `X-Hub-Signature-256` (META_APP_SECRET) ou signature mock HMAC.

## Approvals Meta / WABA

| Étape | Sandbox | Production |
|-------|---------|------------|
| App Meta + produit WhatsApp | Oui | Oui |
| Token temporaire / permanent | Test | System user token |
| Phone Number ID | Numéro test | Numéro business |
| Business Verification | Non | **Obligatoire** |
| WhatsApp Business Account (WABA) | Test | **Oui** |
| Templates (order / payment / delivery / abandoned_cart) | Limités | **Soumission + approbation Meta** |
| Webhook verify token | `WHATSAPP_VERIFY_TOKEN` | Idem + HTTPS public |

Sans vérification business / templates approuvés, les `sendTemplate` échouent **honnêtement** (status `failed`).

## Variables

```bash
WHATSAPP_PROVIDER=auto          # auto | mock | cloud | unavailable
WHATSAPP_CLOUD_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=smartcommerce-wa-verify
WHATSAPP_WEBHOOK_SECRET=...     # mock HMAC
META_APP_SECRET=...             # signature Cloud
WHATSAPP_DEFAULT_STORE_ID=...   # mapping webhook → boutique
OPENAI_API_KEY=...              # assistant IA (sinon fail-closed)
```

## Endpoints

- `GET/POST /api/whatsapp/webhook` — challenge Meta + inbound
- `POST /api/whatsapp/mock/inbound` — inbound sandbox signé
- Inbox dashboard : `/[locale]/dashboard/inbox`
- `POST /api/stores/:storeId/conversations/:id/reply|handoff`
- `POST /api/stores/:storeId/whatsapp/notify-order` — templates order/payment/delivery
- `POST /api/stores/:storeId/whatsapp/nudges` — scan paniers abandonnés (consent only)
- `POST /api/storefront/:slug/whatsapp/consent`

## Boutons produit

Les CTA `wa.me` storefront utilisent `store.settings.whatsappCta` (click-to-chat). L’envoi serveur Cloud API est séparé et fail-closed sans clés.
