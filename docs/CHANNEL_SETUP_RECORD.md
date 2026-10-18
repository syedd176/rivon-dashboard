# Channel Connections — Build Record

What was actually built, configured and learned while connecting WhatsApp,
Instagram and Facebook Messenger to the Rivon dashboard. Written 19 October
2026, after all three channels were working end to end.

This is the record of what *is*, including the mistakes. `META_APP_SETUP.md`
next door is the plan written *before* any of this existed; where the two
disagree, this one is right.

**No secrets are written down here.** Every token and secret lives in Vercel's
environment variables. This document names them and says where they came from.

---

## 1. What works today

| Channel | Receive | Reply | Notes |
|---|---|---|---|
| WhatsApp | ✅ | ✅ | App Review approved first time |
| Instagram DMs | ✅ | ✅ | Instagram Login (not Facebook Login) |
| Instagram comments | ✅ | ✅ | Only on API-visible media — see §9 |
| Facebook Messenger | ✅ | ✅ | Page: Aylestone |

One webhook endpoint, one inbox, one send path. Adding a fourth channel is a
start route, a callback and a parser — not a redesign.

**Not built:** Facebook Page comments. The parser matches Instagram's
`field: "comments"`; Pages send `field: "feed"`, so those webhooks arrive and
are silently dropped. See §12.

---

## 2. The Meta app

| | |
|---|---|
| App name | Rivon |
| App ID | `2208094983924664` |
| Business portfolio | Aylestone Taxis Uk (`1641430147026910`) |
| Status | Published, development mode |
| Dashboard | https://rivon-dashboard.vercel.app |

**One app for all three channels.** Meta reviews an app, not a channel, so
three apps would mean three Business Verifications and three review cycles.

### Use cases added

- **WhatsApp Business Platform** — approved
- **Instagram API with Instagram Login** — submitted
- **Messenger from Meta** — submitted

### Test Page

Aylestone, Page ID `967749679759142`, reachable at `m.me/967749679759142`.

---

## 3. Environment variables

All set in Vercel (Production, and Preview/Development where noted). `.env.local`
mirrors them for local work, minus the Instagram pair.

| Variable | What it is | Where it came from |
|---|---|---|
| `META_APP_ID` | `2208094983924664` | App Dashboard → Settings → Basic |
| `META_APP_SECRET` | App secret | Same page. Use the **copy button** — see §11 |
| `NEXT_PUBLIC_META_APP_ID` | Same as above, for the browser | Embedded Signup runs client-side |
| `NEXT_PUBLIC_META_CONFIG_ID` | WhatsApp Embedded Signup config | Login for Business → Configurations |
| `MESSENGER_CONFIG_ID` | `2515380225624032` | Login for Business → Configurations |
| `INSTAGRAM_APP_ID` | Instagram app id | **Not** the Meta app id — see §5 |
| `INSTAGRAM_APP_SECRET` | Instagram app secret | Different secret from `META_APP_SECRET` |
| `META_WEBHOOK_VERIFY_TOKEN` | Webhook handshake token | We chose it; same value for all three channels |
| `WHATSAPP_ACCESS_TOKEN` | System user token | WhatsApp API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | `1115798258273940` | WhatsApp API Setup |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `1420930893034090` | WhatsApp API Setup |
| `WHATSAPP_REGISTER_PIN` | 6-digit number registration PIN | We chose it |
| `APP_URL` | `https://rivon-dashboard.vercel.app` | Used to build redirect URIs |
| `DATABASE_URL` | Neon Postgres connection string | Neon dashboard |

⚠️ Vercel applies environment variables **at build time**. Adding one without
redeploying changes nothing.

---

## 4. Webhooks

**One endpoint for all three channels:**

```
https://rivon-dashboard.vercel.app/api/webhooks/whatsapp
```

The path says `whatsapp` for historical reasons — it was the only channel when
it was written. It routes on `body.object`:

| `body.object` | Parser |
|---|---|
| `instagram` | messaging + comments |
| `page` | messaging (Messenger) |
| anything else | WhatsApp |

`/api/webhooks/meta` would be the honest name. Renaming means re-verifying
three webhook configurations in Meta for no functional gain; worth doing when
the Python backend takes this over.

### Configuring one

For each object (WhatsApp Business Account, Instagram, Page):

1. App Dashboard → Webhooks → select the object
2. Callback URL: the endpoint above
3. Verify token: `META_WEBHOOK_VERIFY_TOKEN`
4. **Verify and save**
5. **Subscribe to the fields** ← the step that broke all three channels

| Object | Fields |
|---|---|
| WhatsApp Business Account | `messages` |
| Instagram | `messages`, `comments` |
| Page | `messages`, `messaging_postbacks` |

⚠️ **Saving the URL only proves Meta can reach you.** Without a field
subscription it sends nothing, the connection looks healthy, and nothing
arrives. This cost time on every single channel.

For Messenger there are **two** levels: the app-level field list *and* the
per-Page subscription under "Generate access tokens". Both must be set. The
OAuth callback does the Page-level one itself via `POST /{page-id}/subscribed_apps`.

### Signature verification

Meta signs every webhook with `X-Hub-Signature-256`. We verify against
**either** app secret:

```ts
const secrets = [
  process.env.META_APP_SECRET,
  process.env.INSTAGRAM_APP_SECRET,
].filter((s): s is string => Boolean(s));
```

Instagram Login webhooks are signed with the *Instagram* app secret; WhatsApp
and Messenger use the Meta one. A Meta-only check rejected every Instagram
webhook with a 401 **before any logging ran**, which looked exactly like
nothing arriving. The failure path now logs before returning.

Comparison is `timingSafeEqual`, not `===`.

---

## 5. Instagram — two incompatible login families

Meta offers two ways to connect Instagram, and they do not mix:

| | Instagram Login | Facebook Login |
|---|---|---|
| Prerequisites | A professional Instagram account | A Facebook Page, linked to Instagram via Account Centre, with Connected Tools on |
| Screens | 2 | 5+ |
| API host | `graph.instagram.com` | `graph.facebook.com` |
| Permission family | `instagram_business_*` | `instagram_*` + `pages_*` |
| Token life | **60 days**, refreshable | Page token never expires |
| Can serve Messenger | No | Yes |

**We use Instagram Login** as the primary path. Three prerequisites that each
fail five screens in with no useful explanation is how a cleaner or a pest
controller abandons onboarding. Two screens is the whole point.

The cost is real: 60-day tokens need refreshing, hence the cron in §8. Both
routes exist in the codebase (`/api/oauth/instagram/*` for Facebook Login,
`/api/oauth/instagram-direct/*` for Instagram Login).

### Instagram Login — the three sharp edges

```ts
// 1. Instagram appends "#_" to the code. Left on, the exchange fails.
const code = rawCode.replace(/#_$/, "");

// 2. The token response wraps everything in a `data` ARRAY.
const first = shortBody?.data?.[0] ?? shortBody;

// 3. An already-long-lived token cannot be exchanged again — Meta returns
//    code 452 "Session key invalid". That is not a failure.
const alreadyLongLived = !longRes.ok && longBody?.error?.code === 452;
```

### The two IDs from `/me`

`GET https://graph.instagram.com/v25.0/me?fields=user_id,username` returns:

- **`user_id`** — the Instagram Business ID. Used by webhooks **and** sending.
- **`id`** — an app-scoped id. Used by neither.

The OAuth response hands back the app-scoped one. Storing it meant inbound
webhooks arrived carrying the Business ID and matched no row. Both
`external_id` and `page_id` must be the **Business ID**.

---

## 6. Facebook Messenger

### Facebook Login for Business needs a configuration, not scopes

A plain `scope` list produces:

> This app isn't available — This app needs at least one supported permission.

which reads like a bad scope name but means the dialog has no configuration.

**Create one:** Login for Business → Configurations → Create configuration

| Field | Value |
|---|---|
| Name | Messenger |
| Login variation | **General** (not WhatsApp Embedded Signup) |
| Access token | Business integration system user access token |
| Assets | Pages, **Asset Required** ticked |
| Permissions | `pages_messaging`, `pages_show_list`, `pages_manage_metadata` |

The resulting ID goes in `MESSENGER_CONFIG_ID`. The start route sends
`config_id` *instead of* `scope` — sending both makes Meta reject the dialog.

⚠️ **Login variation cannot be changed later.** Permissions can.

⚠️ Tick **Asset Required**, or the owner can click through granting nothing,
`/me/accounts` returns empty, and they land back on Channels with `no_pages`
looking like a bug.

### Redirect URIs

Login for Business → Settings → Valid OAuth Redirect URIs:

```
https://rivon-dashboard.vercel.app/api/oauth/whatsapp/exchange
https://rivon-dashboard.vercel.app/api/oauth/instagram/callback
https://rivon-dashboard.vercel.app/api/oauth/messenger/callback
```

**Use Strict Mode is on** — these must match exactly. No trailing slash. The
Redirect URI Validator at the top of that page checks one before you test it
for real.

### The callback's four calls

1. Code → short-lived user token
2. Short-lived → long-lived (`fb_exchange_token`) — **a Page token derived from
   a short-lived user token dies in an hour**
3. `GET /me/accounts` — the Pages, each with its own token
4. `POST /{page-id}/subscribed_apps` with
   `subscribed_fields=messages,messaging_postbacks,message_echoes`

Only then is the channel saved. If step 4 fails, nothing is stored — better
than a row that looks connected and receives nothing.

⚠️ **Takes `pages[0]` if several.** A tenant administering multiple Pages gets
an arbitrary one. A Page picker is the obvious next step.

### Unclaimed Pages

If the Page is not claimed by a business portfolio, the dialog tries to claim
it mid-flow and can fail with `#2136001`. Claim it first in Business Settings
→ Accounts → Pages, or use a Page that already belongs to the portfolio.

---

## 7. The database

Two tables, both in Neon Postgres. They are separate because the key differs:
WhatsApp routes on a phone number id, the social channels on an account id.

```
channels                       social_channels
  provider                       provider          'instagram' | 'messenger'
  provider_phone_number_id ←key  external_id   ←key  routes inbound webhooks
  waba_id                        page_id             the sender for replies
  business_id                    display_name
  display_number                 access_token
  access_token                   expires_at
  status                         status
  UNIQUE(provider, phone_id)     UNIQUE(provider, external_id)
```

```
inbound_messages               message_statuses
  provider                       provider_message_id
  provider_message_id  ←unique   status
  phone_number_id                recipient
  from_number, sender_name       error_title
  text, message_type             occurred_at
  comment_id
  received_at, raw
  UNIQUE(provider, provider_message_id)
```

The unique constraint on `(provider, provider_message_id)` makes a webhook
retry a no-op instead of a duplicate reply to a real customer.

⚠️ **Access tokens are stored in plain text.** Acceptable while these are our
own accounts; must be encrypted before a second tenant's credentials live in
that table.

### A schema trap worth remembering

`CREATE TABLE IF NOT EXISTS` silently skips an existing table, so a column
added to that statement later never lands. Add it explicitly:

```ts
await sql`ALTER TABLE inbound_messages ADD COLUMN IF NOT EXISTS comment_id TEXT`;
```

---

## 8. Token lifetimes

| Token | Life | Refresh |
|---|---|---|
| Instagram Login | 60 days | Cron, daily |
| Facebook Page (from long-lived user token) | Never expires | None |
| WhatsApp system user | Never expires | None |

`vercel.json` runs `/api/cron/refresh-tokens` at 03:00 daily. Without it,
Instagram tenants go dark after two months with no warning.

---

## 9. Instagram comments — what works and what doesn't

Comment replies work on media the API can see. On a `MEDIA_CREATOR` account
the API may report `media_count: 2` while the profile shows five — **Reels are
not returned**. Replying to a comment on an invisible post fails.

The error that covers all of this:

> Object with ID '...' does not exist, cannot be loaded due to missing
> permissions, or does not support this operation

It means *any* of: a wrong id, a missing permission, an object you don't own,
or an account-type limitation. It is not diagnostic. Subcode 33 narrows it to
"not on your own media".

The reply pattern is public-then-private: a short public reply under the
comment, then a DM where the real conversation happens. Prices and addresses
stay out of public view, and the DM opens the 24-hour window. The private
reply is best-effort — allowed once per comment, and it fails if the person
restricts messages.

---

## 10. Development mode

Until App Review approves `pages_messaging`, the app can **receive** from
anyone but only **send** to people holding an App role.

```
Cannot message users who are not admins, developers or testers of the app
until pages_messaging permission is reviewed and the app is live.
```

Meta returns **code 10** for this — the same code as a closed 24-hour window.
They are only distinguishable by message text, and they call for opposite
actions. The send route checks the text before adding a window explanation.

### Granting a role

App Dashboard → App roles → Roles → Add People → **Tester** → a real account.

⚠️ Several traps here:

- **Test users** (App roles → Test users) cannot receive bot messages. Meta's
  own review note says so. Use a real account with the Tester role.
- `developers.facebook.com/requests` is **dead**. Invitations now appear in
  Facebook → Settings & Privacy → Settings → Apps and Websites → Requests.
- For an app under a business portfolio, invitations may route through
  **Meta Business Suite** instead and never reach personal settings at all.
- **Administrator** and **Developer** roles require the invitee to have a Meta
  developer account. **Tester** does not — which makes Tester the path of
  least resistance.
- A pending invitation behaves exactly like no role.

Current roles: Aylestone Taxid (Administrator), Haseeb Naqvi (Tester),
syed_ali_husnain_jafari (Instagram Tester).

---

## 11. Mistakes worth not repeating

**`pages_manage_metadata` was missing from the Messenger scopes.** The callback
subscribes the Page to the webhook, which needs it. Without it OAuth completes,
the channel saves, and no message ever arrives.

**`isDirect` was inferred from matching IDs.** The send route picked
`graph.instagram.com` vs `graph.facebook.com` by testing
`page_id === external_id`, which held while Instagram was the only social
channel. Messenger saves a Page the same way, so a Facebook Page token went to
Instagram's host and came back *"Cannot parse access token"* — which reads as
an expired token and sends you to reconnect. The provider column already
carries this; never infer it.

**One invalid scope name kills the whole dialog.** An earlier attempt
requested a permission that does not exist for the configured login type.
Meta rejects the **entire** authorisation dialog, with no indication of which
scope was the problem — the error names none of them.

**`INSTAGRAM_APP_SECRET` was 19 characters.** Meta's UI truncates the display.
Use the copy button, always.

**Next 16 specifics:** `export const dynamic` is incompatible with
`cacheComponents`; reading `searchParams` makes a page dynamic. The fix was a
client island behind `<Suspense>`.

**Echoes must be dropped.** Our own messages come back through the same
webhook. Recording them has the agent replying to itself.

---

## 12. Known gaps

**Facebook Page comments are silently dropped.** `extractComments` requires
`change.field === "comments"`, which is the Instagram shape. Facebook Pages
send `field: "feed"` with a nested `item: "comment"`. The webhook arrives,
matches nothing, and is discarded with no log. Needs: a `feed` branch in the
parser, a reply route against `graph.facebook.com`, and two permissions —
`pages_read_user_content` to read comments others leave, and
`pages_manage_engagement` to reply. Neither is in the current submission.

**Access tokens in plain text** — see §7.

**Messenger takes the first Page** — see §6.

**No tenant resolution.** `providerPhoneNumberId` → `tenant_id` is a TODO in
the webhook. Getting it wrong sends one business's customers to another
business's agent.

**No agent.** Everything between "message stored" and "reply sent" is a human
typing in `/inbox`. That is honest today and is what the Human Agent permission
was submitted on. `AGENTIC_LAYER.md` describes the intended design.

---

## 13. App Review

### Submitted

| Permission | For |
|---|---|
| `pages_messaging` | Messenger DMs |
| `pages_show_list` | List Pages at connect |
| `pages_manage_metadata` | Subscribe Page to webhook |
| `pages_read_engagement` | Dependency of the above |
| `instagram_business_basic` | Instagram identity |
| `instagram_business_manage_messages` | Instagram DMs |
| `instagram_business_manage_comments` | Instagram comments |
| Human Agent | 7-day window for human handover |

Renewing: `whatsapp_business_messaging`, `whatsapp_business_management`,
`public_profile`.

### Deliberately not requested

`ads_management`, `business_management`, `email`, `marketing_messages_messenger`,
`paid_marketing_messages`, `pages_user_gender`, `pages_user_locale`,
`pages_user_timezone`, `pages_utility_messaging`,
`instagram_business_content_publish`, `instagram_business_manage_insights`.

Every unused permission is something a reviewer cannot verify and may reject
the whole batch over.

### What a submission needs per permission

1. A description of actual use
2. A screencast of the end-to-end experience
3. **API test calls already made** — the counter takes up to 24 hours
4. The compliance checkbox
5. Reproduction instructions (`pages_messaging` only)

⚠️ Do not submit with any requirement unmet. Meta rejects, and that is a
wasted round trip.

### Test calls that satisfied the counter

```
GET  /{ig-id}/media?fields=id,caption,comments_count
GET  /{media-id}/comments?fields=id,text,from
POST /{comment-id}/replies
GET  /{page-id}/subscribed_apps
POST /{page-id}/subscribed_apps?subscribed_fields=...
GET  /{page-id}/conversations?platform=messenger
GET  /{conversation-id}/messages
```

### On Human Agent

Reviewed on the premise that a **real person** takes over the conversation.
The screencast must show a human typing the reply. A bot-only demo reads as
using the 7-day window to extend automated messaging, which is what the
permission exists to prevent.

---

## 14. The code

```
src/app/api/
  webhooks/whatsapp/        one endpoint, all channels, routes on body.object
  oauth/
    whatsapp/exchange/      Embedded Signup code exchange
    instagram-direct/       Instagram Login — PRIMARY
    instagram/              Facebook Login — alternative
    messenger/              Facebook Login for Business
  whatsapp/send/
  instagram/send/           serves Instagram AND Messenger
  instagram/comment-reply/  public reply + private DM
  inbox/
  cron/refresh-tokens/      daily, 60-day Instagram tokens

src/lib/
  channels-store.ts         both channel tables, credential lookup
  inbox.ts                  inbound_messages, message_statuses
  whatsapp-types.ts         defines NormalisedMessage
  instagram-types.ts        Instagram + Messenger messaging
  comment-types.ts          Instagram comments (not Facebook — §12)

src/components/
  WhatsAppConnect.tsx       Embedded Signup popup (FB.login + config_id)
  ChannelRow.tsx  ConnectResult.tsx  ReplyBox.tsx  CommentReplyBox.tsx
```

Every parser normalises to one `NormalisedMessage`, which is why one inbox and
one send path serve three channels.

---

## 15. Order of operations for a new environment

1. Create the Meta app; add the three use cases
2. Attach it to a business portfolio; complete Business Verification
3. Set all environment variables in Vercel; **redeploy**
4. Create the Login for Business configurations (WhatsApp Embedded Signup,
   Messenger General); record both config IDs
5. Add the three redirect URIs; validate each one
6. Configure the webhook for each object — **and subscribe the fields**
7. Add a real second account as **Tester**
8. Connect each channel at `/channels`
9. Send a message to each channel; confirm it lands in `/inbox`
10. Reply to each from `/inbox`; confirm it arrives
11. Make the API test calls (§13); wait up to 24 hours for the counters
12. Complete and submit App Review

Steps 6 and 11 are the ones that look done when they are not.
