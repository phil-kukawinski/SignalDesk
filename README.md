# SignalDesk — Social Publishing Workspace Prototype

A responsive, browser-based prototype for a multi-client social media management platform. It is an original starter project inspired by common social media management workflows, not a copy of Social News Desk.

## Run it
1. Unzip the folder.
2. Open `index.html` in a modern browser, or open the folder in VS Code and use the Live Server extension.
3. No build step or package installation is required.

## Workspace persistence

Client workspaces, saved posts, approval statuses, the current draft, and settings persist in this browser by default. This local mode does not sync between browsers or devices.

To enable account-based cloud sync:
1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Set the project URL and anon/public key in `js/config.js`. These are browser-visible values; never put a service-role key in this file.
3. Serve the site over HTTP or HTTPS, enable email/password authentication in Supabase, and add the local and deployed site URLs to Supabase's allowed URLs.
4. Select **Connect account** in the app and create an account or sign in.

On first sign-in, existing browser-local workspace data is copied to the new account if it does not already have cloud data.

## Team roles

Cloud sync uses team workspaces. The first person to sign in becomes the workspace **Admin**. Admins invite teammates in **Settings → Team members** as **Admin** or **User**; the invitee joins automatically after creating a SignalDesk account with that email and confirming it.

- **Admins** manage team members, clients, social accounts, settings, Autopilot, the calendar, inbox, analytics, and approvals.
- **Users** see the Command Center, Content Library, and Publishing Studio. Every post a User submits is held until an Admin approves it in **Team & Approvals**.

Running SignalDesk on your own? Turn on **Settings → Personal mode** to hide the Social Inbox and team members.

Roles are enforced server-side: `/api/social` rejects admin-only actions for Users and always holds their posts for approval, and a database trigger blocks Users from changing clients, settings, or approval status in shared workspace state. Each person's in-progress draft is stored separately in `user_drafts`. A person can belong to one workspace at a time.

Re-running `supabase/schema.sql` on an older install migrates each existing account into its own workspace as Admin, keeping its clients, posts, and linked social profiles.

## Publishing setup

SignalDesk publishes posts itself. When you schedule a post, `/api/social` saves it in Supabase with one job per network. A worker (`/api/cron`) runs every minute, claims the jobs that are due, publishes them, and records the result, so posts go out with the browser closed. Each network succeeds, fails, and retries on its own:

- Temporary problems (network errors, rate limits, outages) retry automatically with backoff, up to 6 tries.
- Expired or revoked sign-ins mark the account **Reconnect needed** and notify admins.
- If the connection drops after a post was sent, the job is marked **Check the account** instead of retrying, so nothing is posted twice. After checking, an admin can post it again from the post's details.

Facebook Pages, Instagram professional accounts, LinkedIn, and Pinterest connect **directly** through each network's official API, with no publishing-provider fee. Other networks (TikTok, YouTube, X, and so on) can still go through Ayrshare if you add an Ayrshare key; direct connections always take priority.

1. **Supabase.** Run `supabase/schema.sql` in the SQL editor and set `url` and `anonKey` in `js/config.js`. Those two values are browser-visible; never put the service-role key there. The schema creates a public `social-media` bucket for uploads, because networks download media from a public link.
2. **Server settings.** Add the variables in `.env.example` to the Vercel project's Environment Variables:
   - The Supabase values.
   - `SOCIAL_PROFILE_ENCRYPTION_KEY`, from `openssl rand -base64 32`. It encrypts every stored token.
   - `APP_URL`, your deployed address such as `https://signaldesk.vercel.app`. Sign-in redirects go to `APP_URL/api/oauth`.
   - `APP_ORIGINS`, the exact local and deployed origins, separated by commas.
   - `CRON_SECRET`, from `openssl rand -hex 32`.
3. **The scheduler.** This works on any Vercel plan. In Supabase, enable the `pg_cron` and `pg_net` extensions, fill in your URL and `CRON_SECRET` in the commented block at the end of `schema.sql`, and run it. It creates two jobs: `/api/cron?only=publish` every minute, and the full worker every 10 minutes (Autopilot, comments, token upkeep, reports, digests). On Vercel Pro you can use Vercel Cron for the same two schedules instead. **Until a scheduler runs, scheduled posts wait.** As a backstop, `vercel.json` adds a daily Vercel Cron call to `/api/cron?only=health` (allowed on every plan). If the every-minute run has stopped and posts are past due, it notifies admins, at most every 12 hours. The Command Center and post details also show a warning.
4. **Meta (Facebook + Instagram).**
   - Create a Business-type app at developers.facebook.com and add Facebook Login for Business plus the Instagram API with Facebook Login.
   - Add `APP_URL/api/oauth` as a valid OAuth redirect URI.
   - Set `META_APP_ID` and `META_APP_SECRET`. If your Login for Business setup uses a configuration ID, set `META_LOGIN_CONFIG_ID`; otherwise SignalDesk requests: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `read_insights`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `business_management`.
   - Instagram accounts must be Business or Creator accounts linked to a Facebook Page you manage.
   - In the app's Basic settings, use `APP_URL/privacy` for the Privacy Policy URL and `APP_URL/terms` for the Terms of Service URL. For **User data deletion**, choose *Data deletion callback URL* and enter `APP_URL/api/legal?event=meta-deletion`. Under Facebook Login for Business settings, set the **Deauthorize callback URL** to `APP_URL/api/legal?event=meta-deauthorize`.
   - While the app is in Development mode, only people with a role on the app can sign in. That's fine for personal use; confirm with Meta whether you need App Review for your setup.
5. **LinkedIn.**
   - Create an app at linkedin.com/developers, linked to a LinkedIn Page, and add the **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** products.
   - Add `APP_URL/api/oauth` as a redirect URL and set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`. That lets you post as yourself.
   - To post as company Pages, apply for the **Community Management API**. Once approved, set `LINKEDIN_ORGANIZATIONS=true`; the sign-in then lists the Pages you administer.
   - LinkedIn sign-ins typically last about 60 days. SignalDesk renews them automatically when LinkedIn issues a refresh token, and otherwise warns admins a week before they expire.
6. **Pinterest.**
   - Create an app at developers.pinterest.com, add `APP_URL/api/oauth` as a redirect URI, and set `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET`.
   - New apps start with limited trial access, so check what yours allows before scheduling real Pins. For testing against Pinterest's sandbox, set `PINTEREST_SANDBOX=true`.
   - You choose a default board when connecting, and you can pick another board per post under **Post options → Pinterest**.
7. **Legal pages.** Meta, LinkedIn, and Pinterest ask for a privacy policy, terms, and data deletion instructions. SignalDesk serves them at `/privacy`, `/terms`, and `/data-deletion`. Set `LEGAL_CONTACT_EMAIL` (shown on all three pages) and `LEGAL_OPERATOR_NAME` (your name or business), plus optionally `LEGAL_GOVERNING_LAW` (for example `the State of New York, USA`). The privacy policy lists only the outside services this deployment has turned on, such as Resend or Anthropic. When someone removes SignalDesk in their Facebook settings, Meta calls the deletion callback, SignalDesk deletes that person's Facebook and Instagram connections, and Meta shows them a confirmation code they can look up at `/data-deletion`. Have a lawyer review the pages before offering SignalDesk to other businesses.
8. **Connect accounts.** In **Social Accounts**, choose a client and select **Connect** on a network. Sign in on the network's own page, then choose which Page, Instagram account, LinkedIn profile or Page, or Pinterest account (and board) belongs to that client. Tokens stay on the server, encrypted; the browser never sees them.
9. **Optional: Ayrshare** for other networks, the Social Inbox, and account-level analytics. Set `AYRSHARE_API_KEY` and use **Connect via Ayrshare**. For X, also create an X Developer App and set the two `X_TWITTER_*` variables.
10. **Notification emails.** Create a [Resend](https://resend.com) account, verify your sending domain, and set `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` (for example `SignalDesk <alerts@yourdomain.com>`). Without them, notifications still appear in the app.
11. **AI features.** For Trend signals, AI proofreading, caption drafts, and image descriptions, set `ANTHROPIC_API_KEY`. All use Claude Opus 5.5. Caption drafts and image descriptions are capped at 200 requests per workspace per day. A trend scan is billed per token plus per web search (up to 8 searches). Repeat scans of the same focus within 6 hours reuse the last result, and each workspace is limited to 12 scans a day.
12. **Push notifications (optional).** Generate keys with `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and optionally `VAPID_SUBJECT` (for example `mailto:you@example.com`). Each person then turns push on per device under the bell → Preferences. On iPhone and iPad, push works only after adding SignalDesk to the Home Screen.
13. **Dependencies and time limits.** `package.json` pins `@anthropic-ai/sdk` and `web-push`; Vercel installs it on deploy (run `npm install` for `vercel dev`). `vercel.json` allows the API up to 300 seconds, which needs Vercel's Fluid Compute (on by default for new projects); lower it to 60 if your plan rejects it.

API versions: Meta calls use Graph API `v23.0` and LinkedIn calls use version `202607`. Override them with `META_GRAPH_VERSION` and `LINKEDIN_API_VERSION` when the networks retire those versions. LinkedIn supports each version for about a year.

Local static-file or Live Server previews can't run the API; use a Vercel deployment or `vercel dev` for end-to-end testing. Don't paste API keys, encryption keys, or service-role keys into chat or commit them to Git.

## Included in this prototype
- Command Center with real numbers when signed in: posts scheduled for the next 7 days, approvals waiting, 30-day engagement with a daily chart and network ranking, connected accounts, and a **Needs your attention** list (failed posts, approvals, accounts to reconnect, and a stopped scheduler). Upcoming content filters by client and network. Demo mode keeps the sample dashboard
- Content Calendar with Day, Week (default), and Month views; Day and Week show an hour-by-hour timeline with best-time-to-post bands from your own post history, plus client and status filters. Admins can drag a scheduled post to a new day or time (15-minute steps)
- Publishing Studio with live caption preview, connected-account selection, per-platform copy and media, Supabase media upload, scheduling, and approval requests
- Server-side publishing queue: direct Facebook, Instagram, LinkedIn, and Pinterest publishing (Ayrshare optional for other networks), per-network status and retries, and failure alerts
- Post details from the calendar or Command Center: status and links for each network, retry, move, cancel, approve, or request changes
- **Edit in Studio** for scheduled posts: opens the post in the Publishing Studio, sets your own draft aside, and puts it back when you save or cancel. Admins can edit any post until 2 minutes before it goes out. Users can edit their own posts while they await approval, and the edit goes back for approval
- Publishing checklist with optional checks: proofreading (instant quick checks plus AI suggestions you can apply), platform fit (character limits, required media, hashtag counts, unclickable caption links), and link validation
- Post options: Instagram collaborators and photo tags, LinkedIn/YouTube/TikTok privacy, a first comment, scheduled follow-up comments, Pinterest board, title, and link, and automatic reposts (each scheduled as its own post)
- Autopilot: connect RSS/Atom feeds per client; new articles fill posting-time slots on the calendar and are either auto-scheduled or sent to the approval queue, with keyword filters and article images
- Team workspaces with Admin and User roles
- Notifications: an in-app bell for approvals requested and decided, Autopilot posts awaiting approval or feed errors, failed scheduled comments, weekly reports, and new teammates; plus per-person email delivery — immediately, a daily digest at 8 AM, a weekly wrap-up on a chosen day, or off
- Weekly Top Posts in Analytics: every published post for a week or the last 7 days, ranked by views, engagement, engagement rate, comments, likes, organic reach, shares, saves, clicks, video views, or watch time, with CSV export. Last week's report is built automatically each Monday and summarized in weekly wrap-up emails
- Trend signals in the Content Library: AI web research on trending hashtags, audio, formats, and standout posts, with source links and client-specific ideas you can drop into a draft
- **Brand kits** per client (Clients → Brand kit): voice, hashtags to always include, words to avoid, colors, logo, watch terms, a default for link tracking, and a posting queue. The checklist's optional **On brand** item flags avoid-list words and missing hashtags, and AI proofreading checks copy against the voice
- **Client review links** (Clients → Review link): a private page (`review.html`) where a client sees the next 60 days of posts for each network, approves them, asks for changes, or comments, with no account. Links expire (7–90 days) and can be turned off; only a hash of each link is stored. Approving a post that's waiting for approval schedules it. Clients never see team notes
- **Notes on posts:** a team thread in each post's details, alongside client comments and decisions
- **Templates and snippets** in the Publishing Studio, saved per client or for all clients. Templates fill in `{client}`, `{date}`, and `{campaign}`
- **Posting queues:** set weekly days and times per client, then use **Add to queue** to take the next open slot. **Evergreen** posts go back into the queue after a rest period (default 30 days)
- **Campaigns:** label posts and filter the calendar, client reports, and Top Posts rows by campaign
- **Link tracking:** optional UTM tags (`utm_source` = network, `utm_medium=social`, `utm_campaign` = campaign or client), added when each network's post goes out so saved copy stays clean
- **Instagram grid preview** (Calendar → Grid) for a client's recent and scheduled Instagram posts
- **Holiday overlay** on the calendar: US holidays and common marketing days, which you can toggle off
- **Comments on your posts** in the Social Inbox: read and reply to comments on posts SignalDesk published to Facebook, Instagram, and LinkedIn
- **Client reports** (Analytics → Client report): a branded summary for last month, this month, or the last 30 or 90 days, optionally for one campaign. It opens in a new tab, ready to save as a PDF
- **Client goals and alerts:** set posts per week, an engagement-rate goal, a gap warning (nothing scheduled within N days), and a daily limit in each brand kit. The Command Center shows goal progress, and Needs your attention flags gaps and busy days. The calendar marks busy days too
- **AI caption drafts** (✦ Draft with AI): describe the post and get a version for each network in the client's voice
- **Image descriptions:** add alt text to each image, or get an AI suggestion. It's sent to Facebook, Instagram, LinkedIn, and Pinterest
- **Manual reminders:** for formats SignalDesk can't publish (Instagram Stories, TikTok, YouTube Shorts, X, Threads), it sends a reminder at the scheduled time with the copy and media. You post it, then select **Mark as posted**
- **Post now**, **Duplicate** (from post details), and **Repeat** weekly, every 2 weeks, monthly, or every N days, always at the same local time
- **Import CSV:** schedule up to 200 posts from a spreadsheet, with every row checked before anything is scheduled
- **Image prep:** crop new images to a network's shape (square, 4:5, 1.91:1, 16:9, 2:3, 9:16) and shrink them to at most 2,048 px before upload
- **Search everything** (Ctrl+K / ⌘K): posts, clients, templates, snippets, library files, and pages
- **Post history:** every step (created, edited, approved, moved, published, failed, client decisions) with who did it. Earlier versions can be restored into the editor
- **Link-in-bio pages** (Clients → Link in bio): a public page at `/b/<address>` with the client's links and recent posts
- **Calendar sharing:** each review link also gives a calendar feed for Google Calendar, Outlook, or Apple Calendar, and the calendar has a **Print** view for PDFs
- **Monthly report emails** to each client on a chosen day (set in the brand kit; needs Resend)
- **Installable app** with push notifications, a **dark theme** (Settings → Theme), and **Export** for a full backup plus a posts spreadsheet
- Content Library: when signed in, upload images and videos, tag them, filter by client and type, and add them to a post. Demo mode shows sample collections
- Social Inbox: comments on your published posts, plus Ayrshare DMs when Ayrshare is configured
- Analytics dashboard with provider-backed account metrics and CSV export
- Client workspaces and add-client demo flow
- Approval queue for held posts, with approve and request-changes actions; sample approvals appear only in demo mode
- Settings page

## Important prototype limitations
- In demo mode the content library shows sample data. When signed in, the Command Center, calendar, and approvals show only real posts; sample data appears in demo mode.
- Command Center engagement counts posts SignalDesk published. The worker refreshes metrics for the last 30 days of posts every 12 hours or so (10 posts per run), so new numbers can take a few hours to appear.
- Editing a scheduled post replaces it with a new one, so its ID and history start over. Reposts can't be edited on their own; edit the original post.
- The direct integrations haven't been run against the live Meta, LinkedIn, or Pinterest APIs yet. They were tested against simulated responses, so expect small fixes on first connection.
- Direct publishing supports text, images, and video on Facebook and Instagram (Reels and carousels of up to 10 items), and text and images on LinkedIn and Pinterest. LinkedIn and Pinterest video aren't supported yet. Instagram Stories aren't supported.
- Posts go out within about a minute of their time when the every-minute scheduler is running. A post approved after its time publishes on the next run.
- Shared workspace state is a single JSON row; saves merge with the latest copy, but changes from teammates appear after a reload, not live.
- Autopilot skips articles already in a feed when it's connected (optionally queuing the newest one), checks feeds only when `/api/cron` runs, and does not post to YouTube. Instagram, Pinterest, and TikTok only receive articles that include an image. Removing a feed doesn't cancel posts it already scheduled; cancel them from the calendar.
- Instagram tags are spaced along the bottom of a single image; there is no drag-to-position UI yet. Collaborator invites must be accepted on Instagram. Reposts copy the post's text and media but not its comments, and approving a post approves its reposts too.
- Top Posts covers posts SignalDesk published. For direct posts, numbers come from each network's API and are cached for 6 hours: Instagram insights, Facebook reactions, comments, and shares (reach when Meta provides it), Pinterest Pin analytics, and LinkedIn likes and comments (which may need extra LinkedIn permissions). Anything a network doesn't provide shows as —.
- Best-time bands need about 10 published posts with metrics in weekly Top Posts reports (last 12 weeks); until then the calendar shows clearly labeled starter windows that are general guidance, not your data. Times are shown in the viewer's local time zone.
- Link checks run from the server and only reach public websites. Some sites block automated checks; those links are marked “couldn't confirm” rather than broken.
- Trend signals are AI research from public web results at scan time, not platform data feeds. Links are limited to pages the search actually returned, but summaries can still be wrong; confirm trends and audio licensing before using them.
- Digests and weekly reports run from `/api/cron`, so they need the scheduler from step 7. Notifications refresh every minute while the app is open.
- First comments and follow-ups wait until their post is live, then retry every 30 minutes (up to 12 times) if posting fails. Pinterest doesn't support comments.
- The **Connect account** button is SignalDesk email sign-in. Social accounts are connected separately in **Social Accounts**. Network passwords are entered only on each network's own sign-in page.
- The Social Inbox and account-level analytics still use Ayrshare and stay inactive without it. DMs are limited to Facebook, Instagram, X, and WhatsApp. Instagram, Pinterest, TikTok, and YouTube publishing require media.
- X requires your own developer app and API credits. Provider app reviews, account eligibility, rate limits, message windows, and network policy apply.
- Client review pages show post images from their public links, so anyone who has a review link can see that client's upcoming posts until it expires or is turned off. Share links only with the client.
- Comment authors on LinkedIn show as "LinkedIn member" without extra LinkedIn profile permissions. LinkedIn replies are posted as replies to the comment, and that request format hasn't been checked against the live API yet.
- Queues and evergreen reposting use the workspace time zone. If a client has no queue, evergreen posts come back at the same time of day after the rest period.
- AI drafts and image descriptions can be wrong. Check facts, prices, and dates before posting. Instagram and Facebook alt text use fields Meta added recently, and none of the alt text fields has been checked against the live APIs yet.
- Manual reminders arrive as in-app, email (if set to immediate), and push notifications. SignalDesk can't check whether you posted them.
- The calendar feed link uses the review link's secret in its address (calendar apps need that), so treat it like the review link. Turning off the review link stops the feed.
- Monthly report emails go straight to the client's addresses from your sending domain. Check one by sending it to yourself first.
- The service worker keeps a copy of the app files for spotty connections. Scheduling and loading data still need a connection.
- Dark mode re-colors the main screens. A few rarely used panels may still look light.
- The holiday overlay is a fixed list of US dates and common marketing days, not a live calendar feed.
- Uploaded social media is stored in a public Supabase bucket so networks can fetch it. Do not upload private or sensitive files. Once a day, the worker deletes uploads older than 30 days that no draft, saved post, or recent scheduled post uses. If it can't read those references, it deletes nothing.

## Suggested next build phase
1. Create the Meta, LinkedIn, and Pinterest developer apps, then configure Supabase, the scheduler, and Vercel using the setup steps above.
2. Connect your own accounts first and schedule test posts to each network, including an image, a carousel, and an Instagram video.
3. Add LinkedIn and Pinterest video and Instagram Stories if you need them.
4. Replace the remaining sample content library and analytics data, and add audit logs.

## Making changes
`main` deploys to the live site. Make changes on a branch instead: push it, and Vercel builds a preview deployment with its own address. Check the preview, then merge the branch into `main` to publish. Preview deployments use the same environment variables unless you set preview-specific ones in Vercel, so a preview signed in to the real Supabase project works with real data.

## Project structure
- `index.html` — page structure
- `css/styles.css` — responsive visual design
- `js/*.js` — the interface, one file per area (`base.js` helpers and navigation, `calendar.js`, `composer.js`, `publishing.js`, `overview.js`, `brand.js`, and so on). They load in order from `index.html` and share one global scope, so a file can use anything defined in a file listed before it; `app.js` loads last and starts the app
- `api/social.js` — authenticated publishing, account, team, and Autopilot API
- `api/oauth.js` — sign-in callback for Meta, LinkedIn, and Pinterest
- `api/review.js`, `review.html`, `js/review.js`, `css/review.css` — the client review page and calendar feed
- `api/bio.js`, `bio.html`, `js/bio-page.js`, `css/bio.css` — public link-in-bio pages
- `api/legal.js`, `api/_lib/legal.js` — the privacy policy, terms, and data deletion pages, plus Meta's data deletion and deauthorize callbacks
- `api/_lib/captions.js` — AI caption drafts and image descriptions
- `api/_lib/push.js` — browser push notifications
- `sw.js`, `manifest.webmanifest`, `icons/` — the installable app
- `css/dark.css` — the dark theme
- `api/cron.js` — scheduled worker: publishing queue, Autopilot, comments, token upkeep, reports, and digests
- `api/_lib/publishing.js` — the publishing queue, connections, and post management
- `api/_lib/platforms.js` — direct Facebook, Instagram, LinkedIn, and Pinterest connectors
- `api/_lib/media.js` — daily cleanup of unused uploads
- `api/_lib/core.js` — shared provider, database, post-option, and RSS helpers
- `api/_lib/notify.js` — in-app notifications, immediate emails, and digests
- `api/_lib/reports.js` — Top Posts metrics and weekly reports
- `api/_lib/trends.js` — Claude-powered trend research
- `api/_lib/proofread.js` — Claude-powered proofreading
- `supabase/schema.sql` — tables, migration, row-level security, the `ensure_workspace` function, and the publishing queue's claim and status functions

## Import into Replit
Push this folder to a GitHub repository, then import the repository into Replit. Keep Git as the source of truth and avoid editing the same files independently in VS Code and Replit without committing/syncing.
