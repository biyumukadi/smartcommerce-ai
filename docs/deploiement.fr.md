# Guide de déploiement — SmartCommerce AI

## Principes

1. **Secrets hors repo** — injectés via env / secret manager.
2. **Fail-closed** — pas de succès inventé sans clés provider.
3. **Migrations** — `prisma migrate deploy` au boot (Dockerfile) ou job CI.
4. **SaaS ≠ coûts externes** — abonnement plateforme distinct des Ads / WhatsApp / AI / frais transaction.

## Cible Docker Compose (staging)

```bash
cp .env.example .env.production
# Renseigner AUTH_SECRET, DATABASE_URL internes, STRIPE_*, META_*, etc.
SAAS_BILLING_PROVIDER=stripe MFA_REQUIRED=true docker compose up -d --build
```

Services : `postgres`, `redis`, `minio`, `web`, `worker`.

## Production (checklist)

- [ ] `AUTH_SECRET` fort + `AUTH_URL` / `APP_URL` HTTPS
- [ ] Postgres managé + backups
- [ ] Redis managé
- [ ] S3 compatible (pas MinIO en prod sauf besoin)
- [ ] `CREDENTIALS_ENCRYPTION_KEY` (64 hex) rotatable
- [ ] Webhooks : secrets Stripe / Paystack / FLW / WhatsApp configurés
- [ ] `SAAS_BILLING_PROVIDER=stripe` + `STRIPE_SECRET_KEY` + webhook billing
- [ ] `PLATFORM_ADMIN_EMAIL` seedé
- [ ] `MFA_REQUIRED=true` pour rôles sensibles
- [ ] Healthchecks + alertes sur `/api/health`
- [ ] Worker BullMQ toujours up

## CI

```bash
npm ci
npm run ci
```

Workflow GitHub Actions fourni : `.github/workflows/ci.yml` (typecheck + tests avec Postgres/Redis services).

## Rollback

1. Redeploy image précédente.
2. Ne pas « down-migrate » destructif sans backup.
3. Feature flags via env (`SAAS_BILLING_PROVIDER=unavailable` coupe les activations payantes).

## Observabilité

- Logs JSON (`requestId`, `storeId`)
- `AuditLog` pour billing, MFA, privacy, actions platform admin
- `/api/health` expose providers + audit webhooks (sans secrets)
