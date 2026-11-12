# Guide d’installation — SmartCommerce AI

## Prérequis

- Node.js **22+**
- Docker + Docker Compose (Postgres 16, Redis 7, MinIO)
- Git

## Installation locale rapide

```bash
git clone https://github.com/biyumukadi/smartcommerce-ai.git
cd smartcommerce-ai
cp .env.example .env
npm ci
docker compose up -d postgres redis minio minio-init
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Ouvrir `http://localhost:3000/fr`. Compte démo : voir `SEED_DEMO_EMAIL` / `SEED_DEMO_PASSWORD` dans `.env`.

## Variables essentielles

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Cache + BullMQ |
| `AUTH_SECRET` | Sessions Auth.js (≥32 chars) |
| `CREDENTIALS_ENCRYPTION_KEY` | Tokens sociaux AES-GCM |
| `PAYMENT_PROVIDER` | `mock` en local |
| `SAAS_BILLING_PROVIDER` | `mock` local / `stripe` / `unavailable` |
| `OPENAI_API_KEY` | AI (fail-closed si absent) |

Voir `.env.example` pour WhatsApp, Meta, TikTok, Stripe, MFA, platform admin.

## Stack Docker complète

```bash
export AUTH_SECRET=change-me-to-a-long-random-secret-string
export SAAS_BILLING_PROVIDER=mock
npm run docker:up
```

Healthcheck : `GET /api/health`.

## Vérifications

```bash
npm run ci          # typecheck + tests
curl -s localhost:3000/api/health | jq .
```

## Notes honnêteté providers

Sans clés API, les connecteurs restent `unavailable` — **aucun faux succès** (paiements, pubs, WhatsApp, AI, billing SaaS).
