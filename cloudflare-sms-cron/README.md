# HEMS SMS queue scheduler

This Cloudflare Worker calls the deployed HEMS SMS worker once per minute. It stores the bearer token as a Cloudflare secret and does not put the token in the source code.

## Deploy

From the repository root, authenticate Wrangler and store the same `CRON_SECRET` value that is configured in Vercel Production:

```powershell
npx wrangler login
npx wrangler secret put CRON_SECRET --config cloudflare-sms-cron/wrangler.jsonc
npx wrangler deploy --config cloudflare-sms-cron/wrangler.jsonc
```

Wrangler prompts for the secret when running `secret put`. Do not commit it or paste it into chat.

The Worker uses the `* * * * *` Cron Trigger. In Cloudflare, check **Workers & Pages → hems-sms-cron → Observability → Logs** or **Settings → Triggers → Cron Triggers** for execution status. A successful run logs the HEMS worker result; HTTP errors fail the scheduled invocation so they are visible in Cloudflare.

The HEMS worker processes queued SMS. Before the first run, review the SMS outbox because it will process existing queued messages as well as new ones.
