# SignalDesk walkthrough

Your guide to running SignalDesk: what's set up, what's left, how to use it day to day, and what to do when something breaks.

Live site: **https://signaldesk-social.vercel.app**
Last updated: October 26, 2026

---

## Contents

1. [Where everything lives](#1-where-everything-lives)
2. [What's left to set up](#2-whats-left-to-set-up)
3. [Daily use: from new client to published post](#3-daily-use-from-new-client-to-published-post)
4. [Running the invite-only beta](#4-running-the-invite-only-beta)
5. [Keeping it healthy](#5-keeping-it-healthy)
6. [Troubleshooting](#6-troubleshooting)
7. [Making changes to the code](#7-making-changes-to-the-code)

---

## 1. Where everything lives

| Service | What it does | Where to manage it |
|---|---|---|
| **Vercel** (project `signaldesk`) | Hosts the site and the server code. Every push to `main` deploys automatically. | vercel.com → myatmoapp → signaldesk |
| **Supabase** project **`zuckwjjzhrcesrzbfdak`** | Database, sign-in, uploaded media, and the scheduler. | supabase.com/dashboard/project/zuckwjjzhrcesrzbfdak |
| **GitHub** `phil-kukawinski/SignalDesk` | The code. | github.com/phil-kukawinski/SignalDesk |
| **Resend** | Sends emails: invites, notifications, reports, and (once set up) sign-up confirmations. | resend.com |
| **Namecheap** | DNS for `pkworks.co`. | Domain List → pkworks.co → Advanced DNS |
| **Meta, LinkedIn, Pinterest developer apps** | Let SignalDesk publish to those networks. | developers.facebook.com, linkedin.com/developers, developers.pinterest.com |
| **Anthropic** | AI features: caption drafts, image descriptions, proofreading, trends, Fill from website. | console.anthropic.com |

> **Important:** the Supabase project **`dfdpqxgkumzlbovzzawg` belongs to ATMO, not SignalDesk.** Always check the project ID in the address bar before running SQL. SignalDesk's is `zuckwjjzhrcesrzbfdak`.

### Settings in Vercel

These live in Vercel → signaldesk → Settings → Environment Variables. After changing any of them, **redeploy** (Deployments → ⋯ → Redeploy). Your `.env.local` file is only a private copy for running SignalDesk on your own computer; the live site never reads it.

| Setting | What it's for | Status |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Database connection (SignalDesk project) | ✅ Set |
| `SOCIAL_PROFILE_ENCRYPTION_KEY` | Encrypts every network sign-in token. Never change it, or existing connections stop working. | ✅ Set |
| `APP_URL`, `APP_ORIGINS` | The site's address | ✅ Set |
| `CRON_SECRET` | Lets the scheduler call the site | ✅ Set |
| `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID` | Facebook and Instagram | ✅ Set, waiting on app review |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn | ✅ Set, waiting on products and review |
| `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_SANDBOX` | Pinterest | ✅ Set |
| `ANTHROPIC_API_KEY` | AI features | ✅ Set |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | Email (`SignalDesk <hello@pkworks.co>`) | ✅ Set; domain not verified yet |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications | ✅ Set |
| `PLATFORM_ADMIN_EMAILS` | Who sees Beta invites and gets error emails | ✅ Set to your email |
| `LEGAL_CONTACT_EMAIL`, `LEGAL_OPERATOR_NAME`, `LEGAL_GOVERNING_LAW` | Shown on the privacy, terms, and data deletion pages | ✅ Set |
| `UNSPLASH_ACCESS_KEY` | Stock photos | ⬜ Not set |
| `LINKEDIN_PAGES_CLIENT_ID`, `LINKEDIN_PAGES_CLIENT_SECRET` | The second LinkedIn app, for company Pages | ⬜ Not set (create the app first) |

---

## 2. What's left to set up

Work through these in order. Each step says how to confirm it worked.

### ☐ 1. Verify `pkworks.co` in Resend (email)

Resend can't send to anyone but you until the domain is verified. Its last check **failed** because the DNS records aren't published yet.

1. At **Namecheap → pkworks.co → Advanced DNS**, add these four records. Namecheap adds `.pkworks.co` automatically, so enter only the Host shown.

   | Type | Host | Value | Priority |
   |---|---|---|---|
   | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCiJpR6s49dL0mC0qs9JaiLAN/t1++vV02GdTMU4zPt8UxPhpiAJ4230Z0ht9DjF9jEo7bnUmcPu3+zQm7iZYHUC3cBqWcRlu2eUdrRc8hjkbCFeUD/gCh0keO17flTtZf/GXRqUE9qpod3V/rSRHtW3fmKfJjarD4yU3avalktcwIDAQAB` | |
   | MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | |
   | CNAME | `rsend` | `send.forge.rmta.net` | |

   - Add the MX record under **Mail Settings → Custom MX**. **Keep your existing Google MX record**; it's for your main inbox.
   - These records only cover the `send` and `resend` subdomains, so your Google Workspace email isn't affected.
2. In **Resend → Domains → pkworks.co**, select **Verify** (or **Restart verification**).
3. ✅ **Done when** Resend shows **Verified**. It usually takes minutes, sometimes a few hours.

### ☐ 2. Send Supabase's sign-in emails through Resend

Supabase's built-in email sends only about **2 emails an hour**, so a third sign-up within an hour gets blocked. Do this right after step 1.

1. Supabase (SignalDesk project) → **Authentication → Emails → SMTP Settings** → turn on **Enable custom SMTP**:

   | Field | Value |
   |---|---|
   | Sender email | `hello@pkworks.co` |
   | Sender name | `SignalDesk` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your Resend API key (in `.env.local` as `RESEND_API_KEY`) |

2. **Authentication → Rate Limits** → raise **emails sent per hour** to about 30.
3. ✅ **Done when** a test sign-up's confirmation email arrives from `hello@pkworks.co`.

### ☐ 3. Unsplash stock photos (optional)

1. Create a free app at **unsplash.com/developers** and copy its **Access Key**.
2. Add `UNSPLASH_ACCESS_KEY` in Vercel, then redeploy.
3. ✅ **Done when** Settings → Setup & health shows **Stock photos (Unsplash)** as OK.

New Unsplash apps allow 50 searches an hour. Apply for production access in their dashboard for more.

### ☐ 4. App reviews (Meta, LinkedIn, Pinterest)

Until each network approves your app, SignalDesk can only connect accounts that have a role on that app (basically, yours). Full copy-paste answers and screen-recording scripts are in **`docs/app-review.md`**.

1. **Meta:** start **Business Verification** first (Meta Business Settings → Security Center); it can take days. Then submit App Review for the 10 permissions.
2. **LinkedIn:**
   - **Your existing app:** add **Sign In with LinkedIn using OpenID Connect** (alongside Share on LinkedIn). Both are instant and let you post as yourself.
   - **Company Pages need a second app:** LinkedIn requires the Community Management API to be alone on its app. Create **SignalDesk Pages**, verify it with the PK Works Page, request the Community Management API using a business email (not Gmail), then add `LINKEDIN_PAGES_CLIENT_ID` and `LINKEDIN_PAGES_CLIENT_SECRET` in Vercel. Details are in `docs/app-review.md`.
3. **Pinterest:** add `PINTEREST_APP_SECRET` in Vercel, then apply for **Standard** access.
4. **Before submitting:** create a reviewer login. Reviewers need a SignalDesk account to sign in with. Create an invite (see section 4) and use it to make an account for them.
5. ✅ **Done when** each network shows approved. Then connect your accounts and post a test to each (see section 3).

---

## 3. Daily use: from new client to published post

### Sign in

Go to the live site and select **Sign in** in the top right. Forgot your password? Select **Forgot your password?** and use the emailed link on the same device.

### Get set up (new workspace)

A new workspace shows a **Get set up** checklist on the Command Center. Work down it; each step has a button. You can hide the checklist, and everything stays available in the sidebar.

Press **?** anywhere for keyboard shortcuts: **N** starts a new post, **/** searches, and **G** then **C** jumps to the calendar (**H** home, **A** analytics, **S** social accounts).

With more than one client, use the picker at the top right of the Command Center or Analytics to show **All clients** or just one. Both pages share the choice: the numbers, upcoming posts, the attention list, goals, the performance chart, audience, link clicks, top posts and the exported report all follow it, and it's remembered on that device.

### Add a client

1. **Clients & Accounts → Add client.**
2. Enter the name, their **website**, a short description, and a color.
3. Leave **Fill in the brand kit from their website next** checked.

### Brand kit

The brand kit opens after you add a client. You can also open it any time from the client card → **Brand kit**.

- **✦ Fill from website** reads the client's homepage and About page. The AI drafts the description, voice, audience and recurring topics, hashtags, words to avoid, mentions to watch, colors, and logo. It also lists the social profiles it finds on the site.
  - New fields are **highlighted**. Review them, edit anything that's off, then select **Save**. Nothing is saved until you do.
- **Instagram accounts you often tag** are suggested first when tagging.
- **Posting queue:** the days and times **Add to queue** uses.
- **Count clicks with short links** and **UTM tags** can be turned on by default here.

### Connect social accounts

1. **Social Accounts** → choose the client → **Connect** on Facebook (this connects Instagram too), LinkedIn, or Pinterest.
2. Sign in on the network's own page and choose the Page, account, or board for this client.
3. If a connection fails, open **Settings → Setup & health → Recent problems** to see the network's exact reason.

TikTok, YouTube Shorts, X, Threads, and Instagram Stories use **reminders** instead: SignalDesk notifies you at the scheduled time with the copy ready to paste.

### Create a post (Publishing Studio)

1. **Choose where to publish:** pick the client and its accounts, plus any reminder networks.
2. **Write the copy.** Optional helpers:
   - **✦ Draft with AI** writes a version for each network in the client's voice.
   - **Templates** and **Snippets** insert saved text.
   - The **network tabs** let you customize the copy or media for one network.
3. **Add media:**
   - **Upload:** **Prep image** helps you crop to each network's shape.
   - **Stock photo:** **🔍 Find a free stock photo** searches Unsplash. You can add the photographer credit to the post.
   - **Image descriptions (alt text):** add one per image, or ask AI to suggest one.
4. **Check the preview.** Switch between **Facebook, Instagram, LinkedIn, and Pinterest** to see each network's layout:
   - **Captions** get cut off at "…more" in the same place the network cuts them.
   - **Images** are shaped the way that network shows them.
   - **Links** show the same preview card the network will build.
   - A **dot on the Instagram tab** means Instagram's copy of the image will be adjusted. Instagram only accepts JPEG images between 4:5 and 1.91:1, so SignalDesk converts and pads other images automatically, without cropping.
5. **Post options:**
   - **Collaborators & tags:** type an Instagram username to look it up. The account's picture and name confirm you have the right one. **Open ↗** checks any account on Instagram.
   - **Comments:** a first comment, plus follow-up comments.
   - **Privacy, Pinterest settings, and Repeat:** repeat runs weekly, every 2 weeks, monthly, or every few days.
6. **Publishing options:**
   - Pick a date and time, a campaign, and tracking options: UTM tags, or **short links** that count clicks per network.
   - Then choose **Schedule post**, **Post now**, **Send for approval**, or **Add to queue**.
7. **After scheduling:** a confirmation lists each network and the time, and the Publishing Studio clears for the next post. **View in calendar** jumps to the post's date.

### Calendar, approvals, and clients

- **Content Calendar** has Day, Week, Month, and Grid views.
  - Drag a post to reschedule it, and click a post for its details.
  - The gold bands are good times to post: general starter times at first, then based on your own results.
  - **Print** saves the visible range as a PDF.
- **Team & Approvals:** posts from members with the User role wait here for an admin to approve.
- **Client review links** (client card → **Review link**): clients approve or request changes without an account, and can subscribe to a calendar feed.
- **Link in bio** (client card): a public page at `/b/client-name`.

### After it publishes

- **Post details** show each network's status, a **View** link, and link clicks.
- **Social Inbox → Comments on your posts:** read and reply to comments on Facebook, Instagram, and LinkedIn.
- **Analytics & Reports:**
  - 30-day reach, engagements, engagement rate, and published posts.
  - **Top Posts** and **Link clicks** by network.
  - **Client report:** a branded PDF.
  - **Export report:** a CSV.
- Monthly client report emails can be turned on in each brand kit.

---

## 4. Running the invite-only beta

New people need an **invite code** to create a workspace. People you invite to *your* workspace (Settings → Team members) don't need one.

### Invite someone

1. **Settings → Beta invites.** Only platform owners see this; it's controlled by `PLATFORM_ADMIN_EMAILS`.
2. Fill in:
   - **Email** (optional), so SignalDesk emails the invite once Resend is verified.
   - **Note**, for your own records.
   - **Uses**: 1, 5, or 25 people.
   - **Expiry**: 7, 30, or 90 days.
3. Select **Create invite**, then **Copy link** if you're sending it yourself. Links look like `https://signaldesk-social.vercel.app/?invite=7KQ2MX4P`.
4. They open the link, select **Create account** (the code is already filled in), and confirm their email.

The invite list shows who used each code. **Revoke** stops a code immediately.

### Open sign-ups to everyone

Uncheck **Invite-only sign-ups** in Settings → Beta invites. Check it again to close them. Existing accounts are never affected.

### Beta limits per workspace

| Limit | Value |
|---|---|
| New posts | 150 per 24 hours |
| People (members plus pending invites) | 25 |
| Clients | 50 |
| AI requests (drafts, descriptions, Fill from website) | 200 per day |
| Uploads | Images and video only, 50 MB each |

### Deleting accounts

Anyone can delete their own account under **Settings → Your account → Delete account** (they type DELETE to confirm).

- **If they're the only member,** the whole workspace goes too: clients, posts, connected accounts and their tokens, links, and files.
- **The only admin of a shared workspace** must make someone else an admin first.
- **If someone can't sign in,** delete them in Supabase → Authentication → Users. Their workspace stays if others share it.

---

## 5. Keeping it healthy

### Setup & health (check this first)

**Settings → Setup & health** shows, with ✓ / ! / ✕:

- **Site and database:**
  - whether the site and server use the same Supabase project
  - any missing tables
  - the server keys
- **Scheduler:** when the publisher (every minute) and background jobs (every 10 minutes) last ran.
- **Networks and features:** which are set up, and the exact fix for any that aren't.
- **Connected accounts:** which need reconnecting, and whose sign-ins expire soon.
- **Recent problems:** failed posts, failed network sign-ins, and failed comments from the last 14 days.

### Emails you'll get as platform owner

Once Resend is verified, you get an email, at most every 6 hours, when server errors are logged or several posts fail across workspaces. Settings → Beta invites → **Server errors in the last 24 hours** shows the same list.

### The scheduler

Two jobs in the SignalDesk project's database (pg_cron) call the site:

- `signaldesk-publish` runs every minute and publishes posts that are due.
- `signaldesk-worker` runs every 10 minutes and handles comments, token renewals, metrics, Autopilot, reports, digests, and media cleanup.

To check them, run this in the SignalDesk project's SQL Editor:
```sql
select jobname, schedule from cron.job where jobname like 'signaldesk%';
```

### Running SQL safely

- Always open a **new query** in the **SignalDesk project** (`zuckwjjzhrcesrzbfdak`): https://supabase.com/dashboard/project/zuckwjjzhrcesrzbfdak/sql/new
- Re-running an older saved query tab runs the old version.
- `supabase/schema.sql` is safe to run again in full whenever it changes.

### Backups

Supabase's free plan has no backups you can restore yourself. Until you upgrade, use **Settings → Export** now and then to download a full copy (JSON) and a posts spreadsheet (CSV).

---

## 6. Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| Sign-up says "too many requests" or emails don't arrive | Supabase's 2-emails-an-hour limit | Finish section 2, steps 1 and 2 (Resend SMTP). Until then, wait an hour. |
| "SignalDesk is invite-only…" after signing in | No invite code on the account | Enter a code in the prompt, or create one in Beta invites. |
| A network's Connect pop-up shows an error | The developer app is missing a permission or product | Setup & health → Recent problems shows the network's exact message. LinkedIn "unauthorized scope" means a product is missing (section 2, step 4). |
| A post didn't go out | Scheduler stopped, account needs reconnecting, or the network refused it | Open the post's details for the reason; **Retry** once fixed. Check Setup & health → Scheduler. |
| "Check the account" on a post | The connection dropped after sending; it may already be live | Look on the network before selecting Retry, to avoid posting twice. |
| Instagram image rejected | Very rare now; SignalDesk converts images automatically | Setup & health → **Instagram image conversion** should be OK. Use Prep image to crop if needed. |
| The whole site shows "Vercel Security Checkpoint" to tools | Vercel's automatic protection after a burst of requests | It clears on its own within the hour. If it doesn't, check Vercel → Firewall → Attack Challenge Mode is off. |
| A push to GitHub didn't update the site | Vercel's build hasn't started yet | Wait a few minutes. Check Vercel → Deployments, or select Redeploy. |
| Setup & health says the site and server use different projects | `js/config.js` and the Vercel `SUPABASE_*` settings disagree | Point both at `zuckwjjzhrcesrzbfdak`, then redeploy. |
| Settings → Beta invites is missing | Your email isn't in `PLATFORM_ADMIN_EMAILS`, or the site wasn't redeployed after setting it | Check the setting in Vercel, then redeploy. |

---

## 7. Making changes to the code

- **Run locally:**
  - **Interface only:** open `index.html` in a browser. It opens on the sign-in screen; there's no demo mode any more.
  - **Full app with the API:** run `npm install`, then `vercel dev`.
- **Test:** run `npm test`. It covers the server tests, database tests (a real Postgres loaded with `supabase/schema.sql`), interface tests, and browser checks. Google Chrome is required. The tests never contact Supabase or the social networks.
- **Deploy:** push to `main`. If you changed `supabase/schema.sql`, run it in the SignalDesk project too.
- **More detail:** `README.md` (setup and features) and `docs/app-review.md` (network reviews).
