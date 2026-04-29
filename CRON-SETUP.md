# Cron jobs · setup guide

This app has a number of HTTP cron endpoints under `/api/cron/*` that need to be triggered on schedules. This file documents how to wire them up.

## SaaS billing crons (added 2026-04-29)

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/billing-auto-renew` | daily 06:00 UTC (09:00 Iraq) | Send trial/renewal reminders for `[7, 3, 1, 0, -1, -3, -6]` day windows. On day 0 with auto_renew + saved payment method, attempts checkout. Idempotent — safe to call multiple times per day. |
| `/api/cron/check-subscriptions` | hourly | Transition expired subs into grace period; suspend expired+grace tenants. |

## Other existing crons (kept as-is)

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/check-iot-alerts` | hourly | IoT critical-event WhatsApp dispatch |
| `/api/cron/check-inactive-generators` | manual | Mark stale generators |
| `/api/cron/check-unpaid-subscribers` | manual | Tenant-level subscriber dunning |
| `/api/cron/generate-invoices` | manual / month-start | Tenant-level invoice generation |
| `/api/cron/monthly-report` | manual | Monthly stats email |
| `/api/cron/discount-timeout` | manual | Auto-revoke time-limited discounts |
| `/api/cron/cleanup-telemetry` | manual | Delete old IoT logs |
| `/api/cron/run-all` | manual | Run all of the above sequentially |

## Wiring options

### Option A · Vercel Cron (preferred for Vercel deploys)

`vercel.json` is already configured. Limits:
- Hobby plan: max 2 cron jobs, daily-only schedule (cannot run hourly)
- Pro plan: 40 cron jobs, any cron expression

If you're on Hobby and need hourly, use option B.

### Option B · cron-job.org (free, works anywhere)

1. Sign up at https://cron-job.org
2. For each entry above, create a job:
   - URL: `https://manager.amper.iq/api/cron/{endpoint}`
   - Method: POST
   - Schedule: copy from the table
   - Headers: add `X-Cron-Auth: <secret>` (see Auth section below)
3. Save + enable. Their free plan covers up to 50 jobs.

### Option C · GitHub Actions (free, but Render/Vercel deploy URLs only)

`.github/workflows/cron.yml` template:

```yaml
name: Amper crons
on:
  schedule:
    - cron: '0 6 * * *'   # billing-auto-renew · 06:00 UTC daily
    - cron: '30 * * * *'  # check-subscriptions · every hour at :30

jobs:
  hit-endpoint:
    runs-on: ubuntu-latest
    steps:
      - name: trigger
        run: |
          if [ "${{ github.event.schedule }}" = "0 6 * * *" ]; then
            curl -X POST -H "X-Cron-Auth: ${{ secrets.CRON_SECRET }}" \
              https://manager.amper.iq/api/cron/billing-auto-renew
          else
            curl -X POST -H "X-Cron-Auth: ${{ secrets.CRON_SECRET }}" \
              https://manager.amper.iq/api/cron/check-subscriptions
          fi
```

## Auth (recommended for production)

The cron endpoints currently accept GET/POST without auth. **Before going to production**, add a shared-secret check:

```ts
// At the top of each /api/cron/* handler
const auth = req.headers.get('x-cron-auth');
if (auth !== process.env.CRON_SECRET) {
  return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
}
```

Then set `CRON_SECRET` in deployment env + pass it as header from whichever runner you choose.

## Manual testing

```bash
# Local
curl -X POST http://localhost:3002/api/cron/billing-auto-renew | jq

# Production
curl -X POST https://manager.amper.iq/api/cron/billing-auto-renew \
  -H "X-Cron-Auth: $CRON_SECRET" | jq
```

Expected response:
```json
{
  "ok": true,
  "timestamp": "2026-04-29T...",
  "scanned": 12,
  "remindersSent": 3,
  "remindersDeduped": 9,
  "whatsappSent": 2,
  "autoChargeAttempts": 0,
  "errors": []
}
```
