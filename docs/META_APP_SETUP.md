# Meta App Setup — What Rivon Has To Do Before Any Business Can Connect

**For:** whoever sets up the Meta side. Assumes no prior Meta Developer experience.
**Researched:** 13 October 2026, from Meta's own documentation.

> **Confidence labels.** **Confirmed** = read directly from Meta's docs during
> this research. **Likely** = consistent with the docs but stated on a page that
> has since moved. **Check** = could not verify; confirm in the App Dashboard
> before relying on it.

---

## The shape of it

The thing that confuses people first: **there is one app, and it is ours.**

```
                    ONE Meta app  ("Rivon")
                    created once, reviewed once, by us
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
   Bright Clean Ltd      Apex Pest Control     Swift Removals
   their own WABA        their own WABA        their own WABA
   their own number      their own number      their own number
```

A business owner clicking **Connect WhatsApp** is authorising *our* app to
access *their* WhatsApp account. They never create an app. They never see the
App Dashboard. This is the same structure ManyChat, Twilio and Zapier use.

Our app is the thing Meta reviews. Their accounts are the things our app is
granted access to.

---

## The sequence, end to end

| # | Step | Who | How long | Blocks what |
|---|---|---|---|---|
| 1 | Create the app with the WhatsApp use case | Us | Minutes | Everything |
| 2 | Attach a business portfolio | Us | Minutes | Step 3 |
| 3 | Business Verification | Us | Days–weeks | Advanced access |
| 4 | App Review for the WhatsApp permissions | Us | Weeks | Any external customer |
| 5 | Create a Login for Business configuration | Us | Minutes | The Connect button |
| 6 | Allowlist our domain | Us | Minutes | OAuth redirect |
| 7 | Access Verification | Us | Unclear | Raises the onboarding cap |
| 8 | Business connects their number | **Tenant** | ~5 minutes | — |

Steps 1–7 happen **once**. Step 8 happens per tenant, forever.

⚠️ **Steps 3 and 4 are the long poles.** Everything else is minutes of
clicking. Start them early — this is the same reason the WhatsApp message
template has to be submitted in week one.

---

## Step 1 — Create the app

In the Meta App Dashboard, create an app and pick the WhatsApp use case,
described as *"Connect with customers through WhatsApp."* Give it a name and
contact email, then select or create a business portfolio. **(Confirmed)**

Note Meta's docs describe this by **use case** rather than by app type. Older
guides say "create a Business-type app" — the dashboard now leads with use
cases instead. **(Confirmed)**

The Embedded Signup docs separately state the integration helper requires a
**Business-type app**, so verify the created app reports that type.
**(Confirmed, but worth checking in the dashboard)**

---

## Step 2 — The business portfolio

Every app belongs to a business portfolio — Meta's container for a company's
assets: apps, WhatsApp accounts, Pages, ad accounts. **(Confirmed)**

A WhatsApp Business Account may be created automatically when you create a new
portfolio, so check what already exists before creating more. **(Confirmed)**

---

## Step 3 — Business Verification

Meta confirming Rivon is a real business. **(Likely — the dedicated help-centre
page could not be read during this research; confirm the document list in
Business Settings.)**

Generally requires legal business name, address, phone number, and a document
proving the business exists. Expect days to weeks depending on the documents
and jurisdiction.

**Why it matters here:** it gates advanced access, and it is one of the three
things that raise the customer onboarding cap. See step 7.

---

## Step 4 — App Review

**This is the step that decides whether anyone outside the team can use the
product.** Meta's rule, stated plainly in their docs:

> Apps used by anyone without a role on the app, or without a role in a
> Business that has claimed the app, must go through App Review. Apps used only
> by people with a role on the app don't need it. **(Confirmed)**

So: you can test with your own accounts today. The moment a real pest control
firm tries to connect, it fails without review.

### The permissions to request

| Permission | What it is for |
|---|---|
| `whatsapp_business_management` | Manage the tenant's WABA — register numbers, subscribe to webhooks |
| `whatsapp_business_messaging` | Send and receive messages on their behalf |

Both are named in the Embedded Signup docs as the usual pair for Cloud API.
**(Confirmed)**

For Instagram and Messenger later, the sets are different — see the channel
scopes already listed in `src/app/api/oauth/[provider]/start/route.ts`.

### How review actually works

- Meta **tests the app themselves** to confirm it genuinely uses what it
  requests. **(Confirmed)**
- **If Meta cannot access the app to test it, the whole submission is
  rejected.** **(Confirmed)** So the app has to be reachable and usable by a
  reviewer — a login they can use, a clear path to the Connect button.
- If they can access the app but cannot test one specific permission, **only
  that permission is refused**; the rest can still pass. **(Confirmed)**

### Before and after approval

| | Unapproved | Approved |
|---|---|---|
| Who can grant the permission | Only people with a role on the app | Any user **(Confirmed)** |
| Who sees features | Only app roles | Everyone **(Confirmed)** |

In development mode, permissions are visible only to users with admin,
developer or tester roles on the app. **(Confirmed)**

⚠️ **Practical consequence:** add your four teammates as app roles and you can
test the full flow before review completes. That is how you avoid blocking on
Meta for weeks.

---

## Step 5 — The Login for Business configuration

Separate from the app itself, and easy to miss.

In the App Dashboard: **Facebook Login for Business → Configurations → create
one using the "WhatsApp Embedded Signup" login variation.** Record the
configuration ID. **(Confirmed)**

That ID is `NEXT_PUBLIC_META_CONFIG_ID` in our environment, and it is what
`FB.login` passes as `config_id`. Without it the popup has nothing to render.

---

## Step 6 — Allowlist the domain

In **Facebook Login for Business → Settings → Client OAuth settings**, enable
the required toggles and add our domains to **Allowed Domains** and **Valid
OAuth Redirect URIs**. **(Confirmed)**

Add all of them:

```
https://rivon-dashboard.vercel.app
http://localhost:3000                  (local development)
```

⚠️ Vercel preview deployments get generated subdomains that will **not** be
allowlisted. Embedded Signup will fail on previews unless you add a wildcard or
test on production. Expect this to confuse someone.

Our webhook endpoint must also be on an HTTPS domain. **(Confirmed)**

---

## Step 7 — Access Verification and the onboarding cap

The limit most teams discover too late:

> Onboarding is limited to **10 new customers per rolling 7 days** by default.
> Completing **Business Verification, App Review, and Access Verification**
> raises this to **200**. **(Confirmed)**

For a pilot with a handful of tenants, 10 per week is fine. It becomes a
problem the moment you want to onboard a cohort.

**Check:** what Access Verification involves specifically — its documentation
page could not be reached during this research.

---

## Step 8 — What the business owner actually does

Once steps 1–6 are done, this is the whole tenant-side experience. Eight
screens in Meta's popup, roughly five minutes. **(Confirmed)**

1. Log in with Facebook or Meta Business credentials
2. Accept terms — Cloud API, WhatsApp Business, Meta Business Tools, Marketing
   Messages Lite API
3. Select which WhatsApp APIs to enable
4. Grant our app access to their WhatsApp assets
5. Choose or create a business portfolio
6. Choose or create a WhatsApp Business Account
7. Enter and verify their business phone number, and set a display name
8. Done — a "View your setup guide" button may appear

Pre-filling data reduces the number of screens. **(Confirmed)**

### What we get back

Two things, from two places, in no guaranteed order:

| Source | Contains |
|---|---|
| `FB.login` callback | An exchangeable `code` — **expires in 30 seconds** |
| `window` message, type `WA_EMBEDDED_SIGNUP` | `waba_id`, `phone_number_id`, `business_id` |

Both are needed. Already handled in `src/components/WhatsAppConnect.tsx`.
**(Confirmed)**

Success events are `FINISH`, `FINISH_ONLY_WABA`,
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, `FINISH_OBO_MIGRATION` and
`FINISH_GRANT_ONLY_API_ACCESS`. **Closing the popup on the final screen also
counts as success.** **(Confirmed)**

On `CANCEL`, `data.current_step` names where they stopped — useful for working
out which screen loses people. On `ERROR`, keep `error_code`, `session_id` and
`timestamp`; Meta support asks for them. **(Confirmed)**

---

## Tech Provider vs Solution Partner

Two ways to operate, and it changes who pays.

| | **Tech Provider** | **Solution Partner** |
|---|---|---|
| Tokens | Business tokens only | Business tokens + a system user token for credit |
| Who pays Meta | **The tenant** — they must add a payment method to their WABA before sending | Us, via a shared line of credit |
| Extra requirements | — | A line of credit, accepted Credit Allocation API terms, `business_management` permission, Admin or Financial Editor on the portfolio |
| Can the tenant message immediately after onboarding? | **No** — not until they add payment | **Yes** |

**(All Confirmed)**

### Which one we want

**Tech Provider**, almost certainly. Solution Partner means Rivon fronts every
tenant's messaging costs and bills them on — that is a financial product, not a
software one, and it needs a credit line we do not have.

⚠️ But note the consequence: **a tenant cannot send messages until they add a
payment method to their own WABA.** That is a step in our onboarding flow that
the Embedded Signup popup does not cover, and it will catch people out. The
channels page should detect it and say so plainly rather than letting messages
fail silently.

**Check:** the Tech Provider eligibility page 404'd during this research.
Confirm what qualifying involves before assuming it is automatic.

---

## Deadlines and things that expire

| Thing | Detail |
|---|---|
| **Embedded Signup v2 deprecated** | **15 October 2026** — build on v4. **(Confirmed)** |
| Exchangeable code | 30 seconds **(Confirmed)** |
| Graph API version | Docs example used v25.0; check the Versions page before building **(Confirmed)** |

⚠️ The v2 deprecation is **two days from this research date**. Our
implementation targets the current flow, but verify the configuration created
in step 5 is v4 and not a v2 variation.

---

## What this means for the build order

The research changes nothing about the design, but it does about sequencing:

1. **Start Business Verification and App Review now.** Weeks of waiting that
   run in parallel with everything else.
2. **Add teammates as app roles.** That makes the whole flow testable in
   development mode, today, without review.
3. **Build the web widget.** It needs none of this — no app, no review, no
   verification, no payment method — and it exercises the identical inbound
   path. It is how Team A tests the agent while Meta takes its time.
4. **Handle the no-payment-method state** in the channels UI, because Tech
   Provider status makes it a real state tenants will land in.

---

## Open questions to close

| Question | Why it matters | How |
|---|---|---|
| What does Access Verification involve? | Gates the 10 → 200 onboarding cap | App Dashboard, or Meta support |
| Does Tech Provider status need an application? | May be another multi-week wait | Developer docs; the page moved |
| Business Verification document list for a UK/PK entity? | Determines what paperwork to gather | Business Settings → Security Centre |
| Can preview deployments be allowlisted? | Otherwise previews cannot test OAuth | Try a wildcard domain entry |
| Is the current config variation v4? | v2 dies 15 Oct 2026 | Check when creating the configuration |
