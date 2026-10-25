# Migrating Off Vercel — Server-Side Configuration and Cutover

The Vercel dashboard was built to prove the channel integrations work. They do.
This records every server-side setting that has to move, what changes when the
URL changes, and — the part that actually carries risk — **when** it is safe to
do it relative to App Review.

Written 25 October 2026. Companion to
[`CHANNEL_SETUP_RECORD.md`](CHANNEL_SETUP_RECORD.md), which describes the
current setup in full.

**No secrets are in this document.** Variables are named, never valued.

---

## 1. The short answer on risk

| Channel | Review state | Risk from changing the URL |
|---|---|---|
| WhatsApp | ✅ Approved | **None.** Approval attaches to the app and its permissions, not to a hostname |
| Instagram | ⏳ Under review | 🔴 **High, while under review** |
| Messenger | ⏳ Under review | 🔴 **High, while under review** |

### Why approved permissions are safe

App Review grants permissions to an **app ID**, not to a URL. The app keeps
`whatsapp_business_messaging` whatever host it runs on. Meta expects apps to
move between staging and production; the webhook URL is a mutable setting, not
part of the grant. Changing it does not reopen an approved permission.

### Why pending ones are not

The reviewer works through the reproduction instructions you submitted, which
name `https://rivon-dashboard.vercel.app`. They will:

1. Open `/channels` and connect a Page or Instagram account
2. Message it from their own account
3. Open `/inbox` and expect the message
4. Send a reply and expect it to arrive

Repoint the webhook at AWS and step 3 breaks — messages go to AWS, the Vercel
inbox stays empty, and the reviewer sees a product that does not work.

⚠️ **A rejection is not just a delay.** Repeated rejections attract scrutiny,
and the resubmission queue is slower than the first pass.

### So: the rule

> **Do not touch the webhook URL or the redirect URIs until Instagram and
> Messenger have a verdict.**
>
> Approved → migrate freely.
> Rejected → fix on Vercel, resubmit, migrate after the next verdict.

Checking state: App Dashboard → Review → App Review. A decision usually lands
within a few working days of submission.

---

## 2. What "server side" actually means here

Vercel runs this as serverless functions, not a server. Four things are
configured outside the code:

1. **Environment variables** — §3
2. **The cron job** in `vercel.json` — §4
3. **The database**, at Neon, independent of Vercel — §5
4. **The URL**, which Meta holds in three places — §6

Nothing else is Vercel-specific. The app is a standard Next.js build.

---

## 3. Environment variables

14 in Production. Every one must exist on the new host, with the same name and
value. Names only here — read values from Vercel → Settings → Environment
Variables before you delete the project.

### Meta app identity

| Variable | Changes on migration? |
|---|---|
| `META_APP_ID` | No |
| `META_APP_SECRET` | No |
| `NEXT_PUBLIC_META_APP_ID` | No |
| `NEXT_PUBLIC_META_CONFIG_ID` | No |
| `MESSENGER_CONFIG_ID` | No |
| `INSTAGRAM_APP_ID` | No |
| `INSTAGRAM_APP_SECRET` | No |
| `META_WEBHOOK_VERIFY_TOKEN` | No — but see §6 |

The Instagram pair are **not** the Meta app's. Instagram Login has its own, on
"API setup with Instagram login". Copy the secret with the **button** — the UI
truncates the display, and a 19-character secret fails in ways that look like
something else entirely.

### WhatsApp

| Variable | Changes? |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | No |
| `WHATSAPP_PHONE_NUMBER_ID` | No — `1309283308942888` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | No — `1484624586887274` |
| `WHATSAPP_REGISTER_PIN` | No |

### Infrastructure

| Variable | Changes? |
|---|---|
| `APP_URL` | 🔴 **Yes** — this is the one |
| `DATABASE_URL` | Only if you also move off Neon |
| `POSTGRES_URL_NON_POOLING` | Same |

**`APP_URL` is load-bearing.** Every OAuth route builds its redirect URI from
it:

```ts
const origin = process.env.APP_URL ?? url.origin;
const redirectUri = `${origin}/api/oauth/messenger/callback`;
```

The URI sent to Meta must byte-match an allowlisted one, and **Use Strict Mode
is on**. Set `APP_URL` wrong — a trailing slash, `http`, the wrong subdomain —
and every connect flow fails at the redirect with no useful message.

### Export before you delete anything

```bash
vercel env pull .env.production --environment=production
```

⚠️ That file contains every secret in plaintext. Move it into your secret
store and delete it. Do not commit it; `.env*` is gitignored, but do not test
that.

### On AWS

Use **Secrets Manager** or **Parameter Store (SecureString)**, not plain
environment variables on the instance. Two of these — `META_APP_SECRET` and
`INSTAGRAM_APP_SECRET` — can forge webhooks if leaked, and
`WHATSAPP_ACCESS_TOKEN` can send messages as the business.

---

## 4. The cron job

`vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/refresh-tokens", "schedule": "0 3 * * *" }] }
```

**This does not survive the migration.** Vercel Cron is a platform feature.

🔴 **It matters.** Instagram Login tokens last 60 days. The current one expires
**17 December 2026**. Without a refresh the Instagram channel goes dark with no
error — messages simply stop, and nothing says why.

Replacements on AWS, in order of preference:

- **EventBridge Scheduler** → Lambda → HTTP call to the route
- **ECS scheduled task**, if the app runs on ECS
- **systemd timer** or plain cron, on EC2

Whichever: it must call the same path daily, and **it must be verified in the
first week**. A cron that silently never runs looks identical to one that works
until the day the token dies.

---

## 5. The database

Neon Postgres, at `DATABASE_URL`. **Nothing forces it to move** — Neon is
independent of Vercel and reachable from anywhere.

Current contents:

| Table | Rows | Holds |
|---|---|---|
| `channels` | 1 | WhatsApp — number `+92 307 9591373` |
| `social_channels` | 2 | Instagram `@syed_ali_husnain_jafari`, Messenger `Aylestone` |
| `inbound_messages` | 40 | 22 Instagram, 14 WhatsApp, 4 Messenger |
| `message_statuses` | — | Delivery receipts |

### If you do move it (to RDS or Aurora)

The schema is created at runtime by `ensureSchema()` in `channels-store.ts` and
`inbox.ts`, so an empty database self-populates on first request. To keep the
data:

```bash
pg_dump "$NEON_URL" --no-owner --no-acl > rivon.sql
psql "$RDS_URL" < rivon.sql
```

⚠️ The connection style differs. Neon uses `@neondatabase/serverless`, which
speaks HTTP, not the Postgres wire protocol. Against RDS you need `pg` or
`postgres.js` instead — `src/lib/channels-store.ts` and `src/lib/inbox.ts` both
import the Neon driver and would need changing.

**Recommendation: keep Neon through the migration.** Change one thing at a
time. Moving host and database together means a failure could be either.

### Do this first, whatever else you decide

🔴 **Access tokens are stored in plain text.** Fine while these are our own
accounts. A migration is the natural moment to fix it, and it must be fixed
before a second tenant's credentials live in that table.

---

## 6. What Meta holds, and what must change

Three places. All three must be updated in the same session, or the app ends up
half-migrated.

### 6.1 Webhook callback URL — three objects

App Dashboard → Webhooks. **Each object is configured separately:**

| Object | Current URL | Fields |
|---|---|---|
| WhatsApp Business Account | `…vercel.app/api/webhooks/whatsapp` | `messages` |
| Instagram | same | `messages`, `comments` |
| Page | same | `messages`, `messaging_postbacks` |

For each: change the URL, re-enter `META_WEBHOOK_VERIFY_TOKEN`, click **Verify
and save**, then **confirm the field subscriptions survived**.

🔴 **The fields are the trap.** Changing the URL can reset them. Saving
succeeds, the dashboard looks healthy, and nothing arrives. This caught us on
every channel during the original build. Re-check every object after saving.

The new endpoint must be live and serving the GET handshake **before** you
save, or verification fails:

```
GET /api/webhooks/whatsapp?hub.mode=subscribe
   &hub.verify_token=<token>&hub.challenge=test
→ 200, body exactly: test
```

### 6.2 Per-Page subscription (Messenger only)

App-level webhooks say which fields Meta *sends*. The Page must separately be
subscribed. Verify after cutover:

```
GET  /967749679759142/subscribed_apps          (Page token)
POST /967749679759142/subscribed_apps
     subscribed_fields=messages,messaging_postbacks,message_echoes
```

The OAuth callback does this on connect, so a **reconnect** fixes it too.

### 6.3 OAuth redirect URIs

Facebook Login for Business → Settings → Valid OAuth Redirect URIs:

```
https://<new-host>/api/oauth/whatsapp/exchange
https://<new-host>/api/oauth/instagram/callback
https://<new-host>/api/oauth/messenger/callback
```

And Instagram Login's own list (API setup with Instagram login →
"OAuth redirect URIs"):

```
https://<new-host>/api/oauth/instagram-direct/callback
```

⚠️ **Add the new ones before removing the old.** Both can coexist, which gives
you a working rollback. Remove Vercel's only once AWS is proven.

**Use Strict Mode is on** — exact match, no trailing slash. The Redirect URI
Validator at the top of that settings page tests one without a full flow.

### 6.4 Also pointing at the old host

| Setting | Where |
|---|---|
| Privacy Policy URL | App Settings → Basic |
| Data Deletion URL | App Settings → Basic |
| App Domains | App Settings → Basic |
| Allowed Domains for the JS SDK | Login for Business → Settings |
| Site URL | App Settings → Basic → Website |

⚠️ The Privacy Policy and Data Deletion URLs are **reviewed**. If they 404
after migration, that is visible to Meta and is grounds for enforcement on an
already-approved app. Both pages exist in the codebase (`/privacy`,
`/data-deletion`) and will move with it — but the URLs must be updated.

---

## 7. Do the existing connections survive?

**Yes.** Tokens belong to the app and the connected account. They do not know
what host called the API.

| | Survives? |
|---|---|
| WhatsApp number `+92 307 9591373` | ✅ |
| Instagram `@syed_ali_husnain_jafari` | ✅ until 17 Dec, then needs the refresh cron |
| Messenger Page `Aylestone` | ✅ Page tokens do not expire |
| 40 stored messages | ✅ if the database stays |

Provided `DATABASE_URL` points at the same Neon database, the new host reads
the same rows and keeps working. **No reconnection is needed.**

What breaks without the webhook update is only *new inbound messages* — they go
to the old URL, which is gone.

---

## 8. Cutover sequence

### Before

1. ✅ Instagram and Messenger have a **verdict**
2. New host deployed, reachable over HTTPS with a valid certificate
3. All 14 environment variables set, `APP_URL` = the new origin
4. `DATABASE_URL` pointing at the same Neon database
5. Webhook GET handshake returns the bare challenge (test with curl)
6. New redirect URIs **added** alongside the old
7. Replacement cron scheduled
8. Vercel deployment still live, as rollback

### Cutover — one sitting, about 15 minutes

9. Update the webhook URL on **all three** objects
10. **Re-verify field subscriptions on all three** ← the step that bites
11. Update Privacy Policy, Data Deletion, App Domains, Site URL
12. Message each channel; confirm it reaches the new `/inbox`
13. Reply to each; confirm it arrives
14. Check `subscribed_apps` for the Page

### After

15. Watch for 24 hours — a webhook that fails intermittently looks fine at first
16. Confirm the cron ran, and that it ran *successfully*
17. Remove the Vercel redirect URIs
18. Keep the Vercel deployment one week, then delete

⚠️ **Steps 9–13 are not reversible by waiting.** Messages sent while the
webhook points at a broken endpoint are lost — Meta retries for a while, then
drops them. Do this when traffic is quiet.

---

## 9. Rollback

Within the first hours, rollback is just: set the three webhook URLs back to
Vercel, re-verify fields, confirm a test message arrives.

That works only while the Vercel deployment is live and its redirect URIs are
still allowlisted. Hence steps 8 and 17.

Nothing in the database needs reverting — both hosts read the same rows.

---

## 10. Things that will bite

**The webhook path is called `whatsapp`.** It serves all three channels,
routing on `body.object`. Migration is the natural moment to rename it to
`/api/webhooks/meta` — but doing so means re-verifying three objects *and*
changing the URL, two variables at once. **Migrate first, rename later.**

**Vercel applies environment variables at build time.** If AWS behaves the
same way, a changed variable needs a rebuild, not a restart.

**`APP_URL` has a fallback:** `process.env.APP_URL ?? url.origin`. If the
variable is missing, routes silently use the request's origin. Behind a load
balancer or proxy that can be an internal hostname, and the redirect URI will
not match. **Set it explicitly.**

**Instagram Login uses `graph.instagram.com`**, not `graph.facebook.com`. If
AWS egress is restricted, both hosts need allowing — plus `api.instagram.com`
for the initial code exchange.

**Webhook signatures are verified against two secrets.** Instagram Login signs
with `INSTAGRAM_APP_SECRET`; WhatsApp and Messenger use `META_APP_SECRET`. Both
must be present or one channel silently 401s.

**The health check must not be the webhook path.** A GET without
`hub.mode=subscribe` returns 403 by design. Point load-balancer health checks
at `/` or add a dedicated route.

---

## 11. Open decisions

| Question | Note |
|---|---|
| Which AWS service? | ECS Fargate or App Runner fit a Next.js app with a cron. Lambda works but makes the daily job awkward |
| Keep Neon? | Recommended for the migration. Moving later is a separate, smaller change |
| Keep Next.js? | `SYSTEM_DESIGN.md` has the backend as Python/FastAPI. If that rewrite is coming, migrating this Next.js app may be throwaway work — consider going straight to the real backend |
| Encrypt tokens first? | Yes. It is a schema change, easier before a host move than after |

⚠️ That third row is worth a decision before any of this starts. If the
FastAPI backend is weeks away, the cheapest path may be to **leave the
dashboard on Vercel** until the real backend exists, then cut over once rather
than twice. The only cost of staying is Vercel's bill.

---

## 12. Summary

**Safe:** WhatsApp is approved; a host change does not affect it.

**Not safe right now:** Instagram and Messenger are under review, and the
reviewer tests against the Vercel URL. Wait for the verdict.

**The three things that break silently:**
1. Field subscriptions reset when a webhook URL changes
2. The refresh cron does not come with you — Instagram dies 17 December without it
3. `APP_URL` wrong by one character breaks every connect flow

**What does not break:** existing connections, stored tokens, the 40 messages,
and WhatsApp's approval.
