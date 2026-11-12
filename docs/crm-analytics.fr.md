# CRM, statistiques et automatisation (Phase 7)

## CRM

- **Profils clients** : identité, lifecycle (`prospect` → `active` → `vip` / `churn_risk` / `inactive`), tags, segments.
- **Historique** : commandes, conversations (inbox), points fidélité, coupons personnels, réclamations.
- **Consentements** : `marketingConsentWhatsApp` / `Email` / `Sms` — jamais d’envoi marketing sans opt-in.
- **Segments** par défaut : `prospects`, `vip`, `consent_whatsapp`, `abandoned`.
- **Fidélité** : ledger `LoyaltyLedger` (earn / redeem / adjust / expire).
- **Coupons personnels** : code unique, % ou montant fixe, 1 redemption.
- **Réclamations** : ouverture → suivi → résolution.

APIs sous `/api/stores/:storeId/crm/*` (customers, loyalty, coupons, complaints, segments, campaigns).

## Dashboard stats

`GET /api/stores/:storeId/analytics?period=day|week|month` (+ `from`/`to` custom) :

- CA, commandes, AOV, conversion payée
- Série CA (barres)
- Top produits
- Attribution canaux WhatsApp / Meta / TikTok
- Spend pubs (budgets campagnes) + ROI CA/spend
- Stock bas, paniers abandonnés (+ flag consent)

UI : `/dashboard` avec filtres période et graphiques CSS.

## Assistant analytique AI

`POST /api/stores/:storeId/analytics/assistant`

- Prompt ancré **uniquement** sur les KPI / faits calculés.
- Sans `OPENAI_API_KEY` : statut `unavailable` + **heuristiques déterministes** (pas de faux succès génératif).

## Campagnes marketing consenties

`MarketingAutomation` :

- `requireConsent=true` par défaut
- Sans destinataires opt-in → `blocked_no_consent` (spam interdit)
- Envoi WhatsApp via provider réel / mock / unavailable — **pas de faux succès**
- `confirmSend=true` obligatoire pour lancer

## Variables

Voir `.env.example` : `OPENAI_API_KEY`, `ANALYTICS_ASSISTANT_ENABLED`.

## Migration

`prisma/migrations/20261112160000_phase7_crm_analytics`
