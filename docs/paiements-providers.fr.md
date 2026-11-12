# Paiements SmartCommerce AI — notes FR (Phase 3)

## Principes

1. **Aucun faux succès** : un paiement ne passe `succeeded` / commande `paid` qu’après confirmation fiable (webhook signé ou confirmation COD marchand).
2. **Architecture modulaire** : interface `PaymentProvider` + adapters agrégateurs.
3. **Sandbox d’abord** : clés test ; production = contrat + KYC.

## Providers

| Provider | Canaux | Devises | Mode sans clés | Clés / contrat |
|----------|--------|---------|----------------|----------------|
| **mock** | Carte, MM, banque | USD, CDF, EUR | Live sandbox local | `PAYMENT_WEBHOOK_SECRET` |
| **stripe** | Cartes Visa/MC | USD, EUR (pas CDF natif) | `unavailable` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (test) |
| **flutterwave** | Cartes + MM (M-Pesa, Airtel, Orange selon pays) | USD, CDF, EUR | `unavailable` | `FLW_PUBLIC_KEY`, `FLW_SECRET_KEY`, `FLW_WEBHOOK_SECRET` + **KYC marchand** en prod |
| **paystack** | Cartes + MM (couverture pays) | USD, CDF | `unavailable` | `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` + **KYC** |
| **maxicash** | MM / cartes RDC | USD, CDF | `unavailable` | **Contrat opérateur/agrégateur** + clés API |
| **flexpay** | MM RDC | USD, CDF | `unavailable` | **Contrat** + clés API |
| **cash_on_delivery** | Espèces à la livraison | USD, CDF, EUR | Toujours dispo | Aucune — chemin `cod_pending` |

## Mobile Money RDC

- Opérateurs ciblés : **Orange Money**, **M-Pesa**, **Airtel Money**.
- En MVP Phase 3 : routés via **Flutterwave / Paystack sandbox** quand les clés sont présentes.
- Adapters **Maxicash / FlexPay** : stubs honnêtes `unavailable` jusqu’à contrat réel (souvent Phase 6).

## Cash on delivery (COD)

- Checkout `method=cash_on_delivery` → commande `cod_pending`, paiement `pending`.
- **Pas** de webhook carte. Le marchand confirme via `POST /api/stores/:storeId/orders/:orderId/confirm-cod`.

## Webhooks

- `POST /api/payments/webhook/:provider`
- Signature HMAC (`x-sc-signature` / header provider) + table `WebhookEvent` idempotente.
- Mock : `POST /api/payments/mock/confirm` émet un webhook **signé**.

## Remboursements & reçus

- `POST /api/stores/:storeId/payments/:paymentId/refund` si le provider le permet.
- Reçu PDF : `GET /api/stores/:storeId/orders/:orderId/receipt`.

## Config recommandée locale

```bash
PAYMENT_PROVIDER=mock
PAYMENT_WEBHOOK_SECRET=dev-webhook-secret-change-me
```

Pour tester Flutterwave sandbox (sans fake) :

```bash
PAYMENT_PROVIDER=flutterwave
FLW_SECRET_KEY=FLWSECK_TEST-...
FLW_PUBLIC_KEY=FLWPUBK_TEST-...
FLW_WEBHOOK_SECRET=...
```
