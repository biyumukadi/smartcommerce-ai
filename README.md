# SmartCommerce AI

SaaS ecommerce **multi-boutiques**, conçu **Africa / RDC-first** : catalogue, panier, commandes, paiements (cartes + Mobile Money via agrégateurs), dashboard marchand, et **Studio Pubs AI** (fail-closed sans clé).

Langue UI primaire : **FR** (EN supporté). Devises : **USD / CDF / EUR**.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Auth.js (NextAuth v5) — email/password
- Prisma + PostgreSQL 16
- Redis + BullMQ (jobs AI)
- MinIO/S3 (stockage objets)
- Paiements modulaires (`PaymentProvider`) — **mock**, Stripe / Flutterwave / Paystack sandbox, COD, stubs Maxicash/FlexPay
- next-intl (FR/EN)

## Prérequis

- Node.js 22+
- Docker Compose **ou** Postgres 16 + Redis 7 locaux

## Démarrage rapide (Docker)

```bash
cp .env.example .env
# Éditer AUTH_SECRET (min 32 caractères)

docker compose up -d postgres redis minio minio-init
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

App : [http://localhost:3000](http://localhost:3000)  
Compte démo (après seed) : `demo@smartcommerce.ai` / `Demo1234!`  
Vitrine démo : `/fr/s/marche-central`

Stack complète (web + worker) :

```bash
docker compose up --build
```

## Démarrage local (sans Docker app)

```bash
cp .env.example .env
# Démarrer Postgres + Redis (ex. docker compose up -d postgres redis)
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
# Terminal 2 (optionnel) :
npm run worker
```

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur Next.js |
| `npm run build` / `npm start` | Build & prod |
| `npm test` | Tests Vitest (helpers + flux commerce) |
| `npm run db:migrate` | Migrations Prisma |
| `npm run db:seed` | Rôles, plan trial, boutique démo |
| `npm run worker` | Worker BullMQ (AI + WhatsApp nudges) |

## Ce qui est live vs stub (Phases 3–4)

| Intégration | Statut |
|-------------|--------|
| Auth email/password | **Live** |
| Org / Store / RBAC seed | **Live** |
| Catalogue, panier, checkout, stock | **Live** |
| Paiement **mock** + webhooks signés idempotents | **Live (sandbox)** |
| **Cash on delivery** (`cod_pending` → confirm marchand) | **Live** |
| Stripe / Flutterwave / Paystack | **Sandbox-if-keyed** sinon unavailable |
| Maxicash / FlexPay RDC | **Stub unavailable** |
| Remboursements / reçus PDF | **Live** (mock / générateur) |
| WhatsApp CTA produit (`wa.me`) | **Live** si `settings.whatsappCta` |
| WhatsApp Cloud API envois | **Sandbox-if-keyed** ; sinon mock (dev) / unavailable |
| Inbox + handoff humain | **Live** |
| Assistant IA commercial | **Live si OPENAI_API_KEY** + catalogue réel ; sinon fail-closed |
| Nudges panier abandonné | **Live** uniquement avec consentement |
| Templates order/payment/delivery | **Hooks live** ; Meta approval requise en prod |
| Meta Ads / TikTok | **Stub** (Phase 5) |

Détails FR : [`docs/paiements-providers.fr.md`](docs/paiements-providers.fr.md) · [`docs/whatsapp-meta.fr.md`](docs/whatsapp-meta.fr.md)

## Paiements — règles Phase 3

1. `PAYMENT_PROVIDER=mock` (défaut) : intent `requires_action`, **jamais** `paid` sans webhook.
2. Checkout méthodes : `card`, `mobile_money` (+ opérateur `mpesa` / `airtel_money` / `orange_money`), `cash_on_delivery`, `bank`.
3. COD : statut commande `cod_pending` — confirmation `POST /api/stores/:storeId/orders/:orderId/confirm-cod`.
4. Endpoint sandbox mock : `POST /api/payments/mock/confirm` → webhook **signé**.
5. Webhooks : `POST /api/payments/webhook/:provider` — signature + idempotence `WebhookEvent`.
6. Sans clés agrégateur : provider `unavailable` / paiement `failed` — **aucun débit inventé**.
7. Historique : dashboard `/dashboard/payments` + `GET /api/stores/:storeId/payments`.
8. Refund : `POST /api/stores/:storeId/payments/:paymentId/refund`.
9. Reçu : `GET /api/stores/:storeId/orders/:orderId/receipt`.

## WhatsApp — règles Phase 4

1. `WHATSAPP_PROVIDER=auto` : Cloud API si token+phone id ; sinon **mock** en development, **unavailable** sinon.
2. Webhook : `GET/POST /api/whatsapp/webhook` (verify token + signature).
3. Mock inbound : `POST /api/whatsapp/mock/inbound` (HMAC signé).
4. Inbox : `/fr/dashboard/inbox` — reply + handoff humain / resume IA.
5. Assistant : lit **uniquement** produits/stocks/commandes DB ; pas d’invention de prix.
6. Nudges panier : consentement explicite (`marketingConsentWhatsApp`) obligatoire.
7. Templates Meta : hooks `notify-order` ; échec clair si template non approuvé / clés absentes.

## AI Ads Studio

- Interfaces `TextGenProvider` / `ImageGenProvider`
- Sans `OPENAI_API_KEY` : provider `noop` → **échec explicite** (pas de faux succès)
- Usage suivi dans `AIUsage`
- Pas de publication Meta/TikTok dans ce MVP

## Multi-tenant

Toutes les requêtes commerce filtrent `storeId` / `organizationId`. Les helpers `requireStoreAccess` refusent l’accès cross-store.

## API utiles

- `GET /api/health` — db, redis, catalogue providers
- `POST /api/auth/register` — signup + org/store
- `GET/POST /api/stores/:storeId/products`
- `GET/POST /api/storefront/:slug/cart`
- `POST /api/storefront/:slug/checkout`
- `GET /api/stores/:storeId/payments`
- `POST /api/stores/:storeId/payments/:paymentId/refund`
- `POST /api/stores/:storeId/orders/:orderId/confirm-cod`
- `GET /api/stores/:storeId/orders/:orderId/receipt`
- `GET/POST /api/whatsapp/webhook`
- `POST /api/whatsapp/mock/inbound`
- `GET /api/stores/:storeId/conversations`
- `POST /api/stores/:storeId/conversations/:id/reply|handoff`
- `POST /api/stores/:storeId/whatsapp/notify-order`
- `POST /api/stores/:storeId/whatsapp/nudges`
- `POST /api/storefront/:slug/whatsapp/consent`
- `POST /api/stores/:storeId/ai/jobs`

## Variables d’environnement

Voir `.env.example`. Secrets **hors** du dépôt.

## Licence

Propriétaire — Biyu Mukadi / SmartCommerce AI.
