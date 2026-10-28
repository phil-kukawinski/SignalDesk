# SignalDesk — Social Publishing Workspace

SignalDesk is a product of [PK Works](https://www.pkworks.co).

A responsive, browser-based workspace for planning, approving, scheduling, and publishing social media posts across multiple clients, with direct publishing to Facebook, Instagram, LinkedIn, and Pinterest. It is an original project inspired by common social media management workflows, not a copy of Social News Desk.

Live site: https://socialsignaldesk.com

## Run it
- **Live:** pushing to `main` deploys to Vercel.
- **Locally with the API:** run `npm install`, then `vercel dev`, and open the address it prints.
- **Interface only:** open `index.html` in a browser or use VS Code's Live Server extension. There is no build step. It opens on the sign-in screen; signing in needs the Supabase project, and publishing needs the API (`vercel dev`).

## Workspace persistence

Everything is stored in Supabase (project `zuckwjjzhrcesrzbfdak` on the live site) once you sign in. Signed out, visitors see the public landing page (what SignalDesk does, the networks, **Request an invite**, and **Sign in**), with links to the privacy policy, terms, and data deletion pages. Invite links open the sign-up form directly.

To point a copy of SignalDesk at a Supabase project:
1. Run `supabase/schema.sql` in the project's SQL editor.
2. Set the project URL and publishable (anon) key in `js/config.js`. These are browser-visible values; never put a service-role key in this file.
3. Enable email/password sign-in in Supabase, and add the local and deployed site URLs to its allowed redirect URLs.
4. Select **Sign in** in the app and create an account with an invite code (see **Invite-only beta** below).

## Team roles

Cloud sync uses team workspaces. The first person to sign in becomes the workspace **Admin**. Admins invite teammates in **Settings → Team members** as **Admin** or **User**; the invitee joins automatically after creating a SignalDesk account with that email and confirming it.

- **Admins** manage team members, clients, social accounts, settings, Autopilot, the calendar, inbox, analytics, and approvals.
- **Users** see the Command Center, Content Library, and Publishing Studio. Every post a User submits is held until an Admin approves it in **Team & Approvals**.

Running SignalDesk on your own? Turn on **Settings → Personal mode** to hide the Social Inbox and team members.

Roles are enforced server-side: `/api/social` rejects admin-only actions for Users and always holds their posts for approval, and a database trigger blocks Users from changing clients, settings, or approval status in shared workspace state. Each person's in-progress draft is stored separately in `user_drafts`. A person can belong to one workspace at a time.

Re-running `supabase/schema.sql` on an older install migrates each existing account into its own workspace as Admin, keeping its clients, posts, and linked social profiles.

## Invite-only beta

New accounts need an invite code while **Settings → Beta invites → Invite only** is on (the default). People listed in `PLATFORM_ADMIN_EMAILS` see that panel and can create and email invite links. Each workspace is limited to 25 teammates, 50 clients, and 150 scheduled posts a day, and anyone can delete their own account in **Settings → Your account**. Server errors are logged in Supabase (`app_errors`) and emailed to the platform admins at most every 6 hours.

## Publishing setup

SignalDesk publishes posts itself. When you schedule a post, `/api/social` saves it in Supabase with one job per network. A worker (`/api/cron`) runs every minute, claims the jobs that are due, publishes them, and records the result, so posts go out with the browser closed. Each network succeeds, fails, and retries on its own:

- Temporary problems (network errors, rate limits, outages) retry automatically with backoff, up to 6 tries.
- Expired or revoked sign-ins mark the account **Reconnect needed** and notify admins.
- If the connection drops after a post was sent, the job is marked **Check the account** instead of retrying, so nothing is posted twice. After checking, an admin can post it again from the post's details.

Facebook Pages, Instagram (posts, Reels, and Stories), Threads, LinkedIn, Pinterest, X, YouTube, and TikTok connect **directly** through each network's official API, with no publishing-provider fee. Other networks can still go through Ayrshare if you add an Ayrshare key; direct connections always take priority.

1. **Supabase.** Run `supabase/schema.sql` in the SQL editor and set `url` and `anonKey` in `js/config.js`. Those two values are browser-visible; never put the service-role key there. The schema creates a public `social-media` bucket for uploads, because networks download media from a public link.
2. **Server settings.** Add the variables in `.env.example` to the Vercel project's Environment Variables:
   - The Supabase values.
   - `SOCIAL_PROFILE_ENCRYPTION_KEY`, from `openssl rand -base64 32`. It encrypts every stored token.
   - `APP_URL`, your site's address: `https://socialsignaldesk.com`. Sign-in redirects go to `APP_URL/api/oauth`, and short links use `APP_URL/l/…`.
   - `APP_ORIGINS`, the exact local and deployed origins, separated by commas.
   - `CRON_SECRET`, from `openssl rand -hex 32`.
3. **The scheduler.** This works on any Vercel plan. In Supabase, enable the `pg_cron` and `pg_net` extensions, fill in your URL and `CRON_SECRET` in the commented block at the end of `schema.sql`, and run it. It creates two jobs: `/api/cron?only=publish` every minute, and the full worker every 10 minutes (Autopilot, comments, token upkeep, reports, digests). On Vercel Pro you can use Vercel Cron for the same two schedules instead. **Until a scheduler runs, scheduled posts wait.** As a backstop, `vercel.json` adds a daily Vercel Cron call to `/api/cron?only=health` (allowed on every plan). If the every-minute run has stopped and posts are past due, it notifies admins, at most every 12 hours. The Command Center and post details also show a warning.
4. **Meta (Facebook + Instagram).**
   - Create a Business-type app at developers.facebook.com and add Facebook Login for Business plus the Instagram API with Facebook Login.
   - Add `APP_URL/api/oauth` as a valid OAuth redirect URI.
   - Set `META_APP_ID` and `META_APP_SECRET`. If your Login for Business setup uses a configuration ID, set `META_LOGIN_CONFIG_ID` and make sure the configuration includes every permission below (without `read_insights`, Facebook reach and views stay blank); otherwise SignalDesk requests: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `read_insights`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `business_management`.
   - Instagram accounts must be Business or Creator accounts linked to a Facebook Page you manage.
   - In the app's Basic settings, use `APP_URL/privacy` for the Privacy Policy URL and `APP_URL/terms` for the Terms of Service URL. For **User data deletion**, choose *Data deletion callback URL* and enter `APP_URL/api/legal?event=meta-deletion`. Under Facebook Login for Business settings, set the **Deauthorize callback URL** to `APP_URL/api/legal?event=meta-deauthorize`.
   - While the app is in Development mode, only people with a role on the app can sign in. That's fine for personal use; confirm with Meta whether you need App Review for your setup.
5. **LinkedIn.**
   - Create an app at linkedin.com/developers, linked to a LinkedIn Page, and add the **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** products.
   - Add `APP_URL/api/oauth` as a redirect URL and set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`. That lets you post as yourself.
   - **Company Pages need a second LinkedIn app.** LinkedIn requires the **Community Management API** to be the only product on its app. Create another app (its name can't contain "Linked" or "In"), verify it with the company's LinkedIn Page, add the same redirect URL, and request Community Management API access with a business email. Set `LINKEDIN_PAGES_CLIENT_ID` and `LINKEDIN_PAGES_CLIENT_SECRET`, and Social Accounts shows **Connect a company Page** next to **Connect your profile**. Each connection remembers which app it came from, so renewals use the right one.
   - LinkedIn sign-ins typically last about 60 days. SignalDesk renews them automatically when LinkedIn issues a refresh token, and otherwise warns admins a week before they expire.
6. **Pinterest.**
   - Create an app at developers.pinterest.com, add `APP_URL/api/oauth` as a redirect URI, and set `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET`.
   - New apps start with limited trial access, so check what yours allows before scheduling real Pins. For testing against Pinterest's sandbox, set `PINTEREST_SANDBOX=true`.
   - You choose a default board when connecting, and you can pick another board per post under **Post options → Pinterest**.
6b. **X, YouTube, TikTok, and Threads** (each optional; until one is set up, posts to it can use a reminder instead). Every app uses `APP_URL/api/oauth` as its redirect/callback URL.
   - **X:** at developer.x.com create a project and app, turn on **OAuth 2.0** (type *Web App*, read and write), and set `X_CLIENT_ID` and `X_CLIENT_SECRET`. Posting through the API needs a plan that includes writes; X charges for posting beyond its free allowance. Posts: up to 280 characters, up to 4 images or 1 video.
   - **YouTube:** in Google Cloud, enable the **YouTube Data API v3**, set up the OAuth consent screen (add the `youtube.upload` and `youtube.readonly` scopes), and create an OAuth client of type *Web application*. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Until Google verifies the app and YouTube completes its API audit, uploads stay private. Vertical videos under 60 seconds become Shorts automatically. Videos up to 250 MB.
   - **TikTok:** at developers.tiktok.com create an app with **Login Kit** and the **Content Posting API** (Direct Post), scopes `user.info.basic`, `video.upload`, `video.publish`. Set `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`. Until TikTok audits the app, videos post as private. Videos only, up to 250 MB.
   - **Threads:** in your Meta app, add the **Access the Threads API** use case with `threads_basic`, `threads_content_publish`, and `threads_manage_insights` (post stats), add the redirect URL, and set `THREADS_APP_ID` and `THREADS_APP_SECRET` (the Threads app ID and secret, which differ from `META_APP_ID`). Posts: up to 500 characters, text, images, video, or carousels.
   - **Instagram Stories** use the client's Instagram connection, with no extra setup. Choose **Instagram Story** in the Publishing Studio; images are converted to a 9:16 JPEG.
7. **Legal pages.** Meta, LinkedIn, and Pinterest ask for a privacy policy, terms, and data deletion instructions. SignalDesk serves them at `/privacy`, `/terms`, and `/data-deletion`. Set `LEGAL_CONTACT_EMAIL` (shown on all three pages) and `LEGAL_OPERATOR_NAME` (your name or business), plus optionally `LEGAL_GOVERNING_LAW` (for example `the State of New York, USA`). The privacy policy lists only the outside services this deployment has turned on, such as Resend or Anthropic. When someone removes SignalDesk in their Facebook settings, Meta calls the deletion callback, SignalDesk deletes that person's Facebook and Instagram connections, and Meta shows them a confirmation code they can look up at `/data-deletion`. Have a lawyer review the pages before offering SignalDesk to other businesses.
8. **Connect accounts.** In **Social Accounts**, choose a client and select **Connect** on a network. Sign in on the network's own page, then choose which Page, Instagram account, LinkedIn profile or Page, or Pinterest account (and board) belongs to that client. Tokens stay on the server, encrypted; the browser never sees them.
9. **Optional: Ayrshare** for other networks, the Social Inbox, and account-level analytics. Set `AYRSHARE_API_KEY` and use **Connect via Ayrshare**. For X, also create an X Developer App and set the two `X_TWITTER_*` variables.
10. **Notification emails.** Create a [Resend](https://resend.com) account, verify your sending domain, and set `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` (for example `SignalDesk <alerts@yourdomain.com>`). Without them, notifications still appear in the app.
11. **AI features.** For Trend signals, AI proofreading, caption drafts, and image descriptions, set `ANTHROPIC_API_KEY`. All use Claude Opus 5.5. Caption drafts, image descriptions, and Fill from website share a cap of 75 requests per workspace per day (change it with `AI_DAILY_LIMIT`). A trend scan is billed per token plus per web search (up to 8 searches). Repeat scans of the same focus within 6 hours reuse the last result, and each workspace is limited to 12 scans a day.
12. **Stock photos (optional).** Create a free app at [unsplash.com/developers](https://unsplash.com/developers) and set `UNSPLASH_ACCESS_KEY` (the app's Access Key) in Vercel. **🔍 Find a free stock photo** in the Publishing Studio then searches Unsplash and attaches the photo; you can add “Photo by … on Unsplash” to the post. New Unsplash apps start in demo mode, limited to 50 requests an hour; apply for production in the Unsplash dashboard to raise it. Photos stay on Unsplash's servers, as their API terms require.
13. **Click-tracking short links.** Check **Count clicks with short links** when posting (or turn it on by default in a client's brand kit). When the post publishes, each link becomes `APP_URL/l/<code>`, one per network, so you see clicks per network in the post's details and under **Analytics → Link clicks**. Link-preview robots from the networks aren't counted, and no personal data about the person clicking is stored. Instagram captions keep their original links, since Instagram doesn't make them clickable. If the short-link tables are missing, posts publish with their original links instead of failing.
14. **Setup & health.** Admins can open **Settings → Setup & health** to see what's configured, whether the scheduler is running, which accounts need reconnecting, and what failed recently, including failed network sign-ins. It never shows secret values.
15. **Push notifications (optional).** Generate keys with `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and optionally `VAPID_SUBJECT` (for example `mailto:you@example.com`). Each person then turns push on per device under the bell → Preferences. On iPhone and iPad, push works only after adding SignalDesk to the Home Screen.
16. **Dependencies and time limits.** `package.json` pins `@anthropic-ai/sdk` and `web-push`; Vercel installs it on deploy (run `npm install` for `vercel dev`). `vercel.json` allows the API up to 300 seconds, which needs Vercel's Fluid Compute (on by default for new projects); lower it to 60 if your plan rejects it.

API versions: Meta calls use Graph API `v23.0` and LinkedIn calls use version `202607`. To move to newer versions without a code change, set `META_GRAPH_VERSION` or `LINKEDIN_API_VERSION` in Vercel. LinkedIn supports each version for about a year.

Local static-file or Live Server previews can't run the API; use a Vercel deployment or `vercel dev` for end-to-end testing. Don't paste API keys, encryption keys, or service-role keys into chat or commit them to Git.

## Features
- **Interface:** one design system (`css/app.css` tokens) with matching light and dark themes, real icons and network logos, loading placeholders, plain-language errors with **Try again**, one confirmation dialog for anything destructive, ⓘ explainers on terms like reach and engagement rate, keyboard shortcuts (press **?**), post details in a side panel, and a bottom tab bar on phones
- Command Center with real numbers when signed in: posts scheduled for the next 7 days, approvals waiting, 30-day engagement with a daily chart and network ranking, connected accounts, and a **Needs your attention** list (failed posts, approvals, accounts to reconnect, and a stopped scheduler). A client picker at the top (shared with Analytics) shows one client or all of them. Upcoming content filters by network.
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
- Content Library: when signed in, upload images and videos, tag them, filter by client and type, and add them to a post.
- Social Inbox: comments on your published posts, plus Ayrshare DMs when Ayrshare is configured
- Analytics dashboard with provider-backed account metrics and CSV export
- Client workspaces, with **Add client** (colors, logo, and voice can be filled in from the client's website)
- Approval queue for held posts, with approve and request-changes actions
- Settings page

## Known limitations
- Posts made outside SignalDesk come from an account sync that runs about every 3 hours per account (90 days on the first sync, then 35). **Sync now** on the calendar refreshes one client right away. LinkedIn doesn't let apps read a personal profile's posts, so only posts made through SignalDesk appear for those.
- Editing a scheduled post replaces it with a new one, so its ID and history start over. Reposts can't be edited on their own; edit the original post.
- Facebook, Instagram, and Pinterest are connected and syncing on the live site. LinkedIn publishing and Pinterest publishing haven't been tried against the live APIs yet, so expect small fixes on the first real posts.
- Instagram only accepts JPEG images between 4:5 and 1.91:1. When a post publishes, SignalDesk converts other images (PNG, WebP, very tall or wide shapes) with `sharp`: transparent areas become white and the image is padded, not cropped, using its dominant color. The converted copy is stored under `system/instagram/` in the media bucket. The composer preview notes when this will happen.
- Links get preview cards: Facebook receives the post's first link as the post link, and LinkedIn gets a card built from the page's Open Graph title, description, and image (SignalDesk reads the page, since LinkedIn's API doesn't). If the page can't be read, LinkedIn shows a plain card.
- Direct publishing supports text, images, and video on Facebook, Instagram (Reels, Stories, and carousels of up to 10 items), LinkedIn, Pinterest (video Pins), Threads, and X, and video on YouTube and TikTok. A chosen video cover is used by Instagram Reels, Facebook, YouTube, TikTok (frame only), Pinterest, and LinkedIn.
- Posts go out within about a minute of their time when the every-minute scheduler is running. A post approved after its time publishes on the next run.
- Shared workspace state is a single JSON row; saves merge with the latest copy, but changes from teammates appear after a reload, not live.
- Autopilot skips articles already in a feed when it's connected (optionally queuing the newest one), checks feeds only when `/api/cron` runs, and does not post to YouTube. Instagram, Pinterest, and TikTok only receive articles that include an image. Removing a feed doesn't cancel posts it already scheduled; cancel them from the calendar.
- Instagram tags are spaced along the bottom of a single image; there is no drag-to-position UI yet. Collaborator invites must be accepted on Instagram. Reposts copy the post's text and media but not its comments, and approving a post approves its reposts too.
- Weekly Top Posts covers posts SignalDesk published; **Analytics → Top posts, every source** covers everything on the connected accounts. For direct posts, numbers come from each network's API and are cached for 6 hours: Instagram insights, Facebook reactions, comments, and shares (reach when Meta provides it), Pinterest Pin analytics, and LinkedIn likes and comments (which may need extra LinkedIn permissions). Anything a network doesn't provide shows as —.
- Best-time bands need about 10 published posts with metrics in weekly Top Posts reports (last 12 weeks); until then the calendar shows clearly labeled starter windows that are general guidance, not your data. Times are shown in the viewer's local time zone.
- Link checks run from the server and only reach public websites. Some sites block automated checks; those links are marked “couldn't confirm” rather than broken.
- Trend signals are AI research from public web results at scan time, not platform data feeds. Links are limited to pages the search actually returned, but summaries can still be wrong; confirm trends and audio licensing before using them.
- Digests and weekly reports run from `/api/cron`, so they need the scheduler from step 3. Notifications refresh every minute while the app is open.
- First comments and follow-ups wait until their post is live, then retry every 30 minutes (up to 12 times) if posting fails. Pinterest doesn't support comments.
- The **Sign in** button is SignalDesk email sign-in. Social accounts are connected separately in **Social Accounts**. Network passwords are entered only on each network's own sign-in page.
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

## Status and next steps
A day-to-day guide, setup checklist, and troubleshooting table is in [docs/walkthrough.md](docs/walkthrough.md). Inviting beta testers (adding them on each network, the welcome note, and branded sign-in emails) is in [docs/beta-testers.md](docs/beta-testers.md). App review answers, portal settings, and screencast scripts for Meta, LinkedIn, and Pinterest are in [docs/app-review.md](docs/app-review.md).

Supabase, Vercel, the scheduler, the legal pages, Resend email, AI features, Unsplash, and push notifications are set up on the live site, and Facebook, Instagram, and Pinterest accounts are connected. Next:
1. **Meta:** add `read_insights` to the Facebook Login for Business configuration, reconnect Facebook, then complete Business Verification and App Review.
2. **LinkedIn:** add **Sign In with LinkedIn using OpenID Connect** to the first app. For company Pages, create the second app with the Community Management API and set `LINKEDIN_PAGES_CLIENT_ID` and `LINKEDIN_PAGES_CLIENT_SECRET`.
3. **Pinterest:** apply for Standard access. **Unsplash:** apply for production access.
4. Schedule a test post to each network, including an image, a carousel, and an Instagram video.
5. Before inviting other people: Vercel Pro and Supabase Pro, and a lawyer's review of the legal pages.
6. Later: audit logs.

## Testing
Run `npm install`, then `npm test`. It runs:
- **Server tests** (`tests/unit/`) with simulated network responses.
- **Database tests** (`tests/db/`) against a real Postgres (PGlite) loaded with `supabase/schema.sql`, behind a small PostgREST stand-in. They cover publishing, retries, short links, Instagram image conversion, link previews, health checks, and upgrading from the original schema.
- **Interface tests** (`tests/ui/`) inside the real page in headless Google Chrome. The app ships with no sample data, so the interface and browser tests load the sample clients in `tests/fixtures/sample.js`.
- **Browser checks** (`tests/browser/`): the page loads and every view opens with no errors, plus the composer, sign-in and beta screens, posts from every source, and the client picker. They block every request to Supabase, so they never touch the real project. `screens.mjs` isn't part of `npm test`; it saves a screenshot of every page for a visual review.

The interface and browser checks need Google Chrome installed (set `CHROME` to its path if it isn't in the default macOS location). `tests/` isn't deployed (see `.vercelignore`). None of the tests contact the real networks.

## Making changes
`main` deploys to the live site. Make changes on a branch instead: push it, and Vercel builds a preview deployment with its own address. Check the preview, then merge the branch into `main` to publish. Preview deployments use the same environment variables unless you set preview-specific ones in Vercel, so a preview signed in to the real Supabase project works with real data.

## Project structure
- `index.html` — page structure
- `css/app.css` — every style in one file. It starts with the design tokens (colors, type, spacing, radius, shadows) for light and dark mode, and every rule uses them, so dark mode only redefines the tokens. Network previews keep each network's real colors
- `js/icons.js` — the interface icons (`icon('plus')`), loaded first
- `js/*.js` — the interface, one file per area (`base.js` helpers and navigation, `calendar.js`, `composer.js`, `publishing.js`, `overview.js`, `brand.js`, and so on). They load in order from `index.html` and share one global scope, so a file can use anything defined in a file listed before it; `app.js` loads last and starts the app
- `api/social.js` — authenticated publishing, account, team, and Autopilot API
- `api/oauth.js` — sign-in callback for Meta, LinkedIn, and Pinterest
- `api/review.js`, `review.html`, `js/review.js`, `css/review.css` — the client review page and calendar feed
- `api/bio.js`, `bio.html`, `js/bio-page.js`, `css/bio.css` — public link-in-bio pages
- `robots.txt` — keeps the API and private review links out of search engines
- Landing page (signed out) — part of `index.html` and `js/landing.js`, with screenshots in `img/` (made with sample clients, not real ones); `api/invite-request.js` emails invite requests to `PLATFORM_ADMIN_EMAILS` and records them in `invite_requests`
- `api/go.js` — short link redirects (`/l/<code>`) that count clicks
- `api/_lib/health.js`, `js/health.js` — Settings → Setup & health
- `api/_lib/stock.js`, `js/stock.js` — Unsplash stock photos
- `api/legal.js`, `api/_lib/legal.js` — the privacy policy, terms, and data deletion pages, plus Meta's data deletion and deauthorize callbacks
- `api/_lib/captions.js` — AI caption drafts and image descriptions
- `api/_lib/push.js` — browser push notifications
- `sw.js`, `manifest.webmanifest`, `icons/` — the installable app
- `api/cron.js` — scheduled worker: publishing queue, Autopilot, comments, token upkeep, reports, and digests
- `api/_lib/publishing.js` — the publishing queue, connections, and post management
- `api/_lib/platforms.js` — direct Facebook, Instagram (including Stories), LinkedIn, and Pinterest connectors
- `api/_lib/networks.js` — direct X, YouTube, TikTok, and Threads connectors
- `api/_lib/media.js` — daily cleanup of unused uploads
- `api/_lib/images.js` — converts images Instagram won't accept into JPEGs it will
- `api/_lib/sync.js`, `js/network.js` — reads posts and follower counts from connected accounts, for the calendar and Analytics
- `api/_lib/platform.js`, `js/beta.js`, `js/onboarding.js`, `js/auth.js` — invite-only beta, the error log, first-run setup, and sign-in
- `api/_lib/account.js` — self-serve account deletion
- `api/_lib/brandsite.js` — Brand kit → Fill from website
- `api/_lib/core.js` — shared provider, database, post-option, and RSS helpers
- `api/_lib/notify.js` — in-app notifications, immediate emails, and digests
- `api/_lib/reports.js` — Top Posts metrics and weekly reports
- `api/_lib/trends.js` — Claude-powered trend research
- `api/_lib/proofread.js` — Claude-powered proofreading
- `supabase/schema.sql` — tables, migration, row-level security, the `ensure_workspace` function, and the publishing queue's claim and status functions
