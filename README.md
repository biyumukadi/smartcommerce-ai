# SmartCommerce AI

SaaS ecommerce **multi-boutiques**, conçu **Africa / RDC-first** : catalogue, panier, commandes, paiements sandbox/mock, dashboard marchand, et **Studio Pubs AI** (fail-closed sans clé).

Langue UI primaire : **FR** (EN supporté). Devises : **USD / CDF / EUR**.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Auth.js (NextAuth v5) — email/password
- Prisma + PostgreSQL 16
- Redis + BullMQ (jobs AI)
- MinIO/S3 (stockage objets)
- Paiements modulaires (`PaymentProvider`) — **mock** par défaut, Stripe sandbox optionnel
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
| `npm run worker` | Worker BullMQ AI |

## Ce qui est live vs stub

| Intégration | Statut MVP |
|-------------|------------|
| Auth email/password | **Live** |
| Org / Store / RBAC seed | **Live** |
| Catalogue, panier, checkout, stock | **Live** |
| Paiement **mock** + webhooks signés idempotents | **Live (sandbox)** |
| Stripe sandbox | **Optionnel** — nécessite `STRIPE_SECRET_KEY` + `PAYMENT_PROVIDER=stripe` |
| AI texte/image OpenAI | **Live si `OPENAI_API_KEY`** — sinon job `failed` explicite |
| Meta Ads / TikTok Ads | **Stub** — pas de publication, pas de claim live |
| WhatsApp Cloud API | **Stub CTA** — bouton/lien si numéro configuré ; **pas** Cloud API sans credentials |
| MinIO/S3 | Configurée ; uploads avancés phase suivante |

## Paiements — règles

1. `PAYMENT_PROVIDER=mock` (défaut) : intent `requires_action`, **jamais** `paid` sans webhook.
2. Endpoint sandbox : `POST /api/payments/mock/confirm` émet un webhook **signé** (`PAYMENT_WEBHOOK_SECRET`).
3. Webhooks : `POST /api/payments/webhook/:provider` — signature obligatoire, clé d’événement unique.
4. Stripe : uniquement avec clés test ; sinon erreur claire.

## AI Ads Studio

- Interfaces `TextGenProvider` / `ImageGenProvider`
- Sans `OPENAI_API_KEY` : provider `noop` → **échec explicite** (pas de faux succès)
- Usage suivi dans `AIUsage`
- Pas de publication Meta/TikTok dans ce MVP

## Multi-tenant

Toutes les requêtes commerce filtrent `storeId` / `organizationId`. Les helpers `requireStoreAccess` refusent l’accès cross-store.

## API utiles

- `GET /api/health` — db, redis, statut providers
- `POST /api/auth/register` — signup + org/store
- `GET/POST /api/stores/:storeId/products`
- `GET/POST /api/storefront/:slug/cart`
- `POST /api/storefront/:slug/checkout`
- `POST /api/stores/:storeId/ai/jobs`

## Variables d’environnement

Voir `.env.example`. Secrets **hors** du dépôt.

## Licence

Propriétaire — Biyu Mukadi / SmartCommerce AI.
