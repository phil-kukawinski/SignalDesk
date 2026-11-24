# SignalDesk walkthrough

Your guide to running SignalDesk: what's set up, what's left, how to use it day to day, and what to do when something breaks.

Live site: **https://socialsignaldesk.com**
Last updated: November 24, 2026

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
| **Vercel** (project `signaldesk`, **Pro plan**) | Hosts the site and the server code. Every push to `main` deploys automatically. | vercel.com → myatmoapp → signaldesk |
| **Supabase** project **`zuckwjjzhrcesrzbfdak`** (free plan) | Database, sign-in, uploaded media, and the scheduler. | supabase.com/dashboard/project/zuckwjjzhrcesrzbfdak |
| **GitHub** `phil-kukawinski/SignalDesk` (public) | The code. | github.com/phil-kukawinski/SignalDesk |
| **Resend** | Sends every email from `hello@pkworks.co`: invites, notifications, reports, the Monday check, and sign-up confirmations. | resend.com |
| **Namecheap** | DNS for `socialsignaldesk.com` and `pkworks.co`. | Domain List → the domain → Advanced DNS |
| **Meta, Threads, LinkedIn, Pinterest, X developer apps** | Let SignalDesk publish to those networks. | developers.facebook.com, linkedin.com/developers, developers.pinterest.com, developer.x.com |
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
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | X | ✅ Set, publishing directly |
| `THREADS_APP_ID`, `THREADS_APP_SECRET` | Threads | ✅ Set, publishing directly for PK Works; others wait on Meta's review |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | Email (`SignalDesk <hello@pkworks.co>`) | ✅ Set and verified |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications | ✅ Set |
| `PLATFORM_ADMIN_EMAILS` | Who sees Beta invites and gets error emails | ✅ Set to your email |
| `LEGAL_CONTACT_EMAIL`, `LEGAL_OPERATOR_NAME`, `LEGAL_GOVERNING_LAW` | Shown on the privacy, terms, and data deletion pages | ✅ Set |
| `UNSPLASH_ACCESS_KEY` | Stock photos | ✅ Set (demo access, 50 searches an hour) |
| `LINKEDIN_PAGES_CLIENT_ID`, `LINKEDIN_PAGES_CLIENT_SECRET` | The second LinkedIn app, for company Pages | ⬜ Waiting on LinkedIn's Community Management approval |

---

## 2. What's left to set up

The full, ranked to-do list lives in **[README-tasks.md](README-tasks.md)**. This is the short version.

### Done

- **Email:** `pkworks.co` is verified in Resend, and Supabase's sign-in emails go through it from `hello@pkworks.co`. The old 2-emails-an-hour limit no longer applies.
- **Domain:** `socialsignaldesk.com` is live, with the old `vercel.app` address redirecting to it.
- **Stock photos:** Unsplash works on demo access (50 searches an hour).
- **Direct publishing:** Facebook, Instagram, Threads, X, and LinkedIn (as yourself).
- **Vercel Pro:** active.

### Still open

1. **Supabase Pro.** Supabase wouldn't accept your card. Options: try another card, ask Supabase support (Dashboard → Help) for another way to pay, or move the project to Vercel-billed Supabase near launch. Until then, SignalDesk makes its own daily backups (section 5, Backups).
2. **App reviews (Meta, LinkedIn, Pinterest).** Until each network approves the app, SignalDesk can only connect accounts that have a role on it (basically, yours). Copy-paste answers and screen-recording scripts are in **[app-review.md](app-review.md)**.
   - **Meta:** Business Verification first, then App Review. Add `read_insights` before recording, so reach and views show.
   - **LinkedIn:** app 1 needs the **Sign In with LinkedIn using OpenID Connect** product (instant). App 2, for company Pages, is waiting on LinkedIn's reply to your appeal.
   - **Pinterest:** apply for **Standard** access. Until then Pinterest refuses live Pins, so the website lists it as coming soon.
   - **Before submitting:** create a reviewer login (Settings → Team members, or an invite from section 4).
3. **YouTube and TikTok.** Connected but posting privately until each network's audit passes; still advertised as reminders.
4. **Unsplash production access**, for more than 50 searches an hour.

---

## 3. Daily use: from new client to published post

### Sign in

Go to the live site and select **Sign in** in the top right. Forgot your password? Select **Forgot your password?** and use the emailed link on the same device.

### Get set up (new workspace)

The first time someone signs in, SignalDesk shows a welcome screen and offers a **one-minute tour** that highlights each part of the app. Replay it any time from **New here? → Take the tour** in the sidebar or from the shortcuts list (**?**).

A new workspace also shows a slim **Finish setting up** bar on the Command Center with the next step and its button. **All steps** shows the full list, and **×** hides it.

The sidebar is grouped into **Plan** (Home, calendar, Publishing Studio, Campaigns, Library), **Review** (Approvals, Social Inbox), **Measure** (Analytics), and **Manage** (Clients, Social Accounts, Settings). Your name at the bottom opens an account menu: your account, light or dark theme, shortcuts, feedback, and sign out. **Settings** also has **Text size** and **Density** if the screen feels cramped or too large.

Times read the friendly way across lists and the post panel: "In 4 hours", "Tomorrow, 9:00 AM".

After an update, a short **New in SignalDesk** note on the Command Center lists what changed. **Got it** hides it on that device. A tab left open checks for a newer version every 10 minutes (and when you come back to it) and offers **Reload** in a bar at the bottom.

Press **?** anywhere for keyboard shortcuts: **N** starts a new post, **/** searches, and **G** then **C** jumps to the calendar (**H** home, **A** analytics, **S** social accounts).

A **Needs attention** row at the top of the Command Center counts what's waiting (failed posts, approvals, accounts to reconnect); each count goes straight to the fix. Below it, **Needs your attention** lists failed posts, approvals, accounts to reconnect, and dates with nothing planned. Select **×** to dismiss one; it comes back if something about it changes, and **Show dismissed** brings them all back. Dismissing only hides it on your own device and doesn't fix anything, so a dismissed failed post still needs a retry.

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

1. **Social Accounts** → choose the client → **Connect** on Facebook (this connects Instagram too), Threads, LinkedIn, Pinterest, X, YouTube, or TikTok.
2. Sign in on the network's own page and choose the Page, account, or board for this client.
3. If a connection fails, open **Settings → Setup & health → Recent problems** to see the network's exact reason.

**Instagram Stories** use the Instagram connection: pick **Instagram Story** in the Publishing Studio (images are converted to 9:16). **Facebook Stories** use the Facebook Page connection: pick **Facebook Story** (one image or video up to 60 seconds; Stories show no caption). Any network that isn't connected can still use a **reminder**: SignalDesk notifies you at the scheduled time with the copy ready to paste.

### Create a post (Publishing Studio)

1. **Choose where to publish:** pick the client and its accounts, plus any reminder networks. The Studio opens on the client you used last on that device, with the networks you last picked for them.
2. **Write the copy.** Optional helpers:
   - **✦ Draft with AI** writes a version for each network in the client's voice.
   - **Templates** and **Snippets** insert saved text.
   - The **network tabs** let you customize the copy or media for one network.
   - **@mentions:** type **@** in the caption, a network's own copy, or the first comment. SignalDesk suggests accounts this client has tagged or mentioned before, and looks up a typed name on Instagram to show the account's picture and name. Only Instagram business and creator accounts can be looked up. The @ still goes out on every network: it links on Instagram, Threads, and X, and shows as plain text on Facebook and LinkedIn.
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
   - **Comments:** a first comment (posted right after the post goes live, good for hashtags), plus follow-up comments.
   - **Video cover:** for video posts, **Choose a frame** picks the cover. You can change it later from the post panel in the calendar.
   - **Privacy, Pinterest settings, and Repeat:** repeat runs weekly, every 2 weeks, monthly, or every few days.
6. **Publishing options:**
   - Pick a date and time, a campaign, and tracking options: UTM tags, or **short links** that count clicks per network.
   - Then choose **Schedule post**, **Post now**, **Send for approval**, or **Add to queue**.
7. **After scheduling:** a confirmation lists each network and the time, and the Publishing Studio clears for the next post. **View in calendar** jumps to the post's date. If the post started as a saved draft, the draft is removed, since the scheduled post replaces it. Opened from a campaign, the confirmation also offers **Back to campaign drafts**.

### Import many posts from a spreadsheet

**Import CSV** in the Publishing Studio (or **Import spreadsheet** on Campaigns) takes up to 200 posts at a time. **Download a template** for the columns.

- **Media by file name:** put file names in the spreadsheet's media column (and `cover` for a video's cover), then select **Add media files** and pick those files. You can add them in more than one batch; each batch joins the ones already added.
- The import shows the range of files added (for example "1.png … 49.png, 50.png") and, under **Still needed**, any file the spreadsheet names that you haven't added yet.
- **Import as drafts** sends each ready row to Saved drafts instead of scheduling it, so you can review or send them for approval first.
- **The Export spreadsheet imports too.** Settings → Export's posts spreadsheet uses these same columns plus `id`, `status`, and `title`. Importing it shows existing posts as "No change," adds back upcoming posts that were deleted ("Ready (adds back a deleted post)"), and offers past ones only as drafts.

### Calendar, approvals, and clients

- **Content Calendar** has Day, Week, Month, List, and Grid views. **List** shows every upcoming post for the next 12 months, soonest first; use **Filter** to narrow it by client, network, status, or campaign.
  - Drag a post or draft to reschedule it, then confirm. Day and Week views set the day and time; Month sets the day and keeps the time. Click a post for its details.
  - Each post has a **status dot** (the legend under the calendar explains the colors), and busy Month days show network icons.
  - The gold bands are good times to post: general starter times at first, then based on your own results.
  - **Print** saves the visible range as a PDF.
- **Approvals:** posts from members with the User role wait here for an admin to approve.
- **Client review links** (client card → **Review link**): clients approve or request changes without an account, and can subscribe to a calendar feed.
- **Link in bio** (client card): a public page at `/b/client-name`.

### After it publishes

- **Post details** show each network's status, a **View** link, and link clicks.
- **Social Inbox:** one client at a time. The tabs across the top pick the client (each counts what's waiting), and both panels follow that choice.
  - **Messages:** direct messages to the client's Facebook Page and Instagram account, read live from Meta (not stored). Folders: **Unread** (their message is the latest), **Inbox** (everything not done), and **Done**. **Mark done** clears a conversation; it comes back by itself when they write again, and **Reopen** brings it back by hand. Counts include unread from the last 3 business days; older ones stay in Unread marked **Reply window closed**.
  - **Replying:** Meta allows answers from SignalDesk only within 24 hours of the person's last message (an auto-reply after it doesn't extend this). After that, the reply box is replaced by a pointer to the Facebook or Instagram app. Templates and **Suggest a reply** work as they do for comments. Shared Reels, posts, and some story replies can only be seen in the app; the conversation says so.
  - **Comments on your posts:** read and reply to comments on Facebook, Instagram, and LinkedIn. **Needs a reply** lists unanswered comments on the client's recent posts.
- **Analytics & Reports**, in three tabs:
  - Each network keeps the **same color** everywhere: charts, tables, the client report, and the report emails. A one-line summary sits at the top of Overview and Posts.
  - **Overview:** reach, engagements, engagement rate, published posts, and engagement over time. Switch the chart between **All networks** and **By network** (one line each); click a legend entry to hide or show it.
  - **Posts:** **Top posts** (each row edged in its network's color), **When posts do best** (filter by network), and **Link clicks** by network.
  - **Reports:** **Client report** (a branded PDF), **Weekly Top Posts**, and **Campaigns**.
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
3. Select **Create invite**, then **Copy link** if you're sending it yourself. Links look like `https://socialsignaldesk.com/?invite=7KQ2MX4P`.
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
| AI help (drafts, image descriptions, Fill from website, campaign questions, single-post rewrites, asking for a planning note) | 30 per day, shared |
| Campaign plans | 3 per day |
| Trend scans | 1 every 7 days |
| Uploads | Images and video only, 50 MB each |

All of these come from one place in the code (`api/_lib/allowances.js`), so plans can change them later. The client limit is also enforced by the database.

### Usage and costs

**Settings → Usage & costs**, for platform owners only, measures what the pricing plan needs:

- **Workspaces:** people, clients (yellow near the limit, red over it), new posts, AI requests and their cost, and storage, for the last 7, 30, or 90 days.
- **What each AI request costs:** the count, average, highest, and total cost of each kind of request, such as a trend scan or a caption draft, with its average size. Only token and search counts are kept, never the text. Records are kept for about 13 months.
- **The trend scan check:** whether scans still average under the $0.57 that the planned 10-credit price allows.

Costs use Anthropic's list prices, so they can differ slightly from the bill. Storage is counted once a day and leaves out profile photos. If the screen says to run the database update, paste `supabase/schema.sql` into the SQL editor and click Run.

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

### Emails and their colors

Every SignalDesk email is color coded by how urgent it is, with a colored bar across the top, a label above the heading, and a legend when an email mixes levels:

| Color | Label | Means | Examples |
|---|---|---|---|
| Dark red | **Emergency** | Fix now | The scheduler stopped, posts about to miss their time, site or database down, many posts failing across workspaces |
| Red | **Warning** | Something broke | A post failed, an account was signed out or expired, a comment failed |
| Yellow | **Attention** | Needs a look | An account expiring soon, a post waiting for approval, a client asked for changes |
| Green | **Good** | Went well | A client approved, an approval came through |

Emergency and warning emails also start their subject with "Emergency:" or "Warning:". Digest emails list the most urgent items first. Network names in reports use the same colors as the app.

**As platform owner** you also get:

- **The Monday check** (after 8 AM Eastern): a health check of the site, database, scheduler, sign-in, accounts, and recent errors, grouped from Emergency down to Working. "All good" means nothing needs you.
- **Problem alerts,** at most every 6 hours, when server errors are logged or posts fail across workspaces. Settings → Beta invites → **Server errors this week** shows the same list, including refused message replies with Meta's own words. The Monday check names the latest one.

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

Supabase's free plan has no backups you can restore yourself, so SignalDesk makes its own:

- **Every day,** the worker copies every table into one compressed file in a private `backups` bucket that only the server can reach. It keeps the last **7 daily copies plus 5 Monday copies**, so you can go back up to five weeks.
- **What's in it:** all workspaces, clients, posts, connections (tokens stay encrypted), history, and settings, plus the list of sign-in accounts. **Not included:** passwords (Supabase never hands them out) and uploaded files (`media_files` lists them).
- **Settings → Usage & costs → Backups** shows the last copy, lists every copy with **Download**, and has **Back up now** for right before a big change. Download one now and then and keep it somewhere of your own (it holds client data, so not a shared folder). The Monday check warns if no copy was made in two days.

**Restoring.** Tell me what was lost and I'll do it with you. The steps:

1. Download the copy from before the problem.
2. Make the SQL: `node scripts/restore-backup.mjs daily-2026-11-18.json.gz --sql restore.sql`. Add `--table scheduled_posts --table publish_jobs` to restore only some tables. Without `--sql`, it just lists what's in the copy.
3. Read it over, then run it in the **SignalDesk** SQL editor. Rows that still exist are left alone, so it only puts back what's missing, and running it twice does nothing extra.

A full rebuild into a new project also needs `supabase/schema.sql` first and the sign-in accounts recreated (people then set a new password). **Each workspace's own copy.** Admins can keep their own copy and get things back without you:

- **Settings → General → Export** downloads everything in the workspace (JSON) and a posts spreadsheet in the importer's format.
- **Settings → General → Restore…** reads that JSON, lists only what's missing now (clients with their brand kits, saved posts, templates, snippets, library items, reply templates, and upcoming posts), and adds back what's ticked. Nothing current is overwritten; settings are replaced only if chosen. Afterward the window lists everything that came back by name, anything left unticked, and the upcoming posts still to check (**Check posts** opens them in the import window). Activity records one entry, such as "Restored from a copy · Copy made Nov 15, 2026 · 1 client (Harbor Coffee) · 3 templates (…) · 1 upcoming post to check." If the save fails, nothing is restored.
- **The guide for users** is the public page **https://socialsignaldesk.com/backups** (linked from Settings, the Restore window, the reminder email, and the footer of the legal pages). It explains what SignalDesk copies, where to keep your own copy (a private folder of your own, not a shared one), the three ways back, and to email you for anything older.
- **The reminder:** admins' wrap-up emails suggest a copy when nobody in the workspace has made one in 30 days, at most every four weeks, and never as an email of its own. Downloads show in Activity as "Downloaded a copy of the workspace."

---

## 6. Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| Sign-up emails don't arrive | Supabase's email settings (Authentication → Emails → SMTP) changed or the sender address is wrong | Supabase → Logs → **Auth** shows the real reason. The sender must be `hello@pkworks.co` (`.co`, not `.com`). |
| "SignalDesk is invite-only…" after signing in | No invite code on the account | Enter a code in the prompt, or create one in Beta invites. |
| A network's Connect pop-up shows an error | The developer app is missing a permission or product | Setup & health → Recent problems shows the network's exact message. LinkedIn "unauthorized scope" means a product is missing (section 2). |
| An @mention shows "can't be looked up" | It's a personal Instagram account, or the name is misspelled | Personal accounts can't be confirmed by any app. Check the name with **Open ↗**; the @ still goes out as typed. |
| A post didn't go out | Scheduler stopped, account needs reconnecting, or the network refused it | Open the post's details: common problems are explained in plain words with the fix, and **Details** shows the network's own message. **Retry** once fixed. Check Setup & health → Scheduler. |
| "Check the account" on a post | The connection dropped after sending; it may already be live | Look on the network before selecting Retry, to avoid posting twice. |
| Instagram image rejected | Very rare now; SignalDesk converts images automatically | Setup & health → **Instagram image conversion** should be OK. Use Prep image to crop if needed. |
| The whole site shows "Vercel Security Checkpoint" to tools | Vercel's automatic protection after a burst of requests | It clears on its own within the hour. If it doesn't, check Vercel → Firewall → Attack Challenge Mode is off. |
| A push to GitHub didn't update the site | Vercel's build hasn't started yet | Wait a few minutes. Check Vercel → Deployments, or select Redeploy. |
| Setup & health says the site and server use different projects | `js/config.js` and the Vercel `SUPABASE_*` settings disagree | Point both at `zuckwjjzhrcesrzbfdak`, then redeploy. |
| A message reply says Meta refused it | More than 24 hours since they last wrote, or, before Meta approves messaging, the person has no role on the app (Instagram also needs a role on the business account) | The message ends with Meta's own words. Reply in the Facebook or Instagram app; after approval, replies within 24 hours work for everyone. |
| Messages say they aren't turned on, or one account is missing | The account hasn't allowed messages | On Instagram: Settings → Messages and story replies → Message controls → Connected tools → **Allow access to messages**. Then reconnect the account in Social Accounts and allow messages. |
| The app looks out of date after an update | The tab was open before the update | Select **Reload** in the bar at the bottom, or reload the page. |
| Settings → Beta invites is missing | Your email isn't in `PLATFORM_ADMIN_EMAILS`, or the site wasn't redeployed after setting it | Check the setting in Vercel, then redeploy. |

---

## 7. Making changes to the code

- **Run locally:**
  - **Interface only:** open `index.html` in a browser. It opens on the sign-in screen; there's no demo mode any more.
  - **Full app with the API:** run `npm install`, then `vercel dev`.
- **Test:** run `npm test`. It covers the server tests, database tests (a real Postgres loaded with `supabase/schema.sql`), interface tests, and browser checks. Google Chrome is required. The tests never contact Supabase or the social networks. They include a check that one workspace can't read, change, or delete another's data, through the database, the server, and uploaded files.
- **Deploy:** push to `main`. If you changed `supabase/schema.sql`, run it in the SignalDesk project too.
- **More detail:** `README.md` (setup and features) and `docs/app-review.md` (network reviews).
