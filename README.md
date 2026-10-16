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
- **Users** see the Command Center, Content Library, and Publishing Studio. Every post a User submits is held with the provider until an Admin approves it in **Team & Approvals**.

Roles are enforced server-side: `/api/social` rejects admin-only actions for Users and always sets `requiresApproval` on their posts, and a database trigger blocks Users from changing clients, settings, or approval status in shared workspace state. Each person's in-progress draft is stored separately in `user_drafts`. A person can belong to one workspace at a time.

Re-running `supabase/schema.sql` on an older install migrates each existing account into its own workspace as Admin, keeping its clients, posts, and linked social profiles.

## Social API setup

Social account linking and API calls run through the Vercel serverless endpoint in `api/social.js`; provider credentials must never go in browser code.

1. Create an Ayrshare Launch/Business account and enable the networks your users may connect. Launch supports up to 10 Ayrshare user profiles; this app creates one profile per SignalDesk client workspace. Review current plan, messaging, and usage charges with Ayrshare before onboarding clients.
2. Run the current `supabase/schema.sql` in the Supabase SQL editor. It creates user-scoped encrypted provider-profile storage and a public `social-media` bucket with uploads restricted to the signed-in user's folder. If that bucket already exists, the migration does not change its visibility; make it public only if you intend its media to be available to social networks.
3. Set `url` and `anonKey` in `js/config.js` to the Supabase project URL and public anon/publishable key. That key is expected to be browser-visible; never use the Supabase service-role key there.
4. Add the variables in `.env.example` to the Vercel project's server-side Environment Variables. Set `APP_ORIGINS` to the exact local HTTP and deployed HTTPS origins, comma-separated. Generate `SOCIAL_PROFILE_ENCRYPTION_KEY` with `openssl rand -base64 32`. Do not commit actual secret values.
5. In Ayrshare, enable your desired networks and configure the hosted account-linking page. The Connect button provisions a client profile only when linking begins.
6. For X, create an X Developer App, enable Read and Write (and Direct Messages if needed), set its callback URLs to `https://profile.ayrshare.com/social-accounts` and `https://app.ayrshare.com/social-accounts`, buy X API credits, and set the two X variables in Vercel. X is omitted from the linking page until both keys are configured.

7. Set `CRON_SECRET` (for example `openssl rand -hex 32`) and schedule `/api/cron` every 10 minutes. It checks Autopilot feeds and posts scheduled follow-up comments. On Vercel Pro, add a `vercel.json` with `{"crons":[{"path":"/api/cron","schedule":"*/10 * * * *"}]}`; Vercel sends the secret automatically. On Vercel Hobby (daily cron only), use the commented `pg_cron` block at the end of `supabase/schema.sql` instead. Admins can also run both jobs on demand with **Check feeds now** on the calendar.

8. For notification emails, create a [Resend](https://resend.com) account, verify your sending domain, and set `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` (for example `SignalDesk <alerts@yourdomain.com>`), and `APP_URL` (the deployed site, used for email links). Without them, notifications still appear in the app.
9. For Trend signals in the Content Library, set `ANTHROPIC_API_KEY`. Scans use Claude Opus 5.5 with web search; each scan is billed per token plus per web search (up to 8 searches per scan). Repeat scans of the same focus within 6 hours reuse the last result, and each workspace is limited to 12 scans per day.
10. `package.json` pins `@anthropic-ai/sdk`; Vercel installs it on deploy (run `npm install` for `vercel dev`). `vercel.json` raises the API time limit to 300 seconds because trend scans and Top Posts can take a minute or more; that limit needs Vercel's Fluid Compute (on by default for new projects) — lower it to 60 if your plan rejects it.

Local static-file or Live Server previews cannot run `/api/social`; use a Vercel deployment or `vercel dev` for end-to-end integration testing. Do not paste API keys, encryption keys, or service-role keys into chat or commit them to Git.

## Included in this prototype
- Command Center with sample performance metrics and upcoming content
- Content Calendar with Day, Week (default), and Month views; Day and Week show an hour-by-hour timeline with best-time-to-post bands from your own post history, plus client and status filters
- Publishing Studio with live caption preview, connected-account selection, per-platform copy and media, Supabase media upload, post scheduling, and provider approval submission
- Publishing checklist with optional checks: proofreading (instant quick checks plus AI suggestions you can apply), platform fit (character limits, required media, hashtag counts, unclickable caption links), and link validation
- Post options: Instagram collaborators and photo tags, LinkedIn/YouTube/TikTok privacy, a first comment, scheduled follow-up comments, and automatic reshares (Ayrshare `autoRepost`)
- Autopilot: connect RSS/Atom feeds per client; new articles fill posting-time slots on the calendar and are either auto-scheduled or sent to the approval queue, with keyword filters and article images
- Team workspaces with Admin and User roles
- Notifications: an in-app bell for approvals requested and decided, Autopilot posts awaiting approval or feed errors, failed scheduled comments, weekly reports, and new teammates; plus per-person email delivery — immediately, a daily digest at 8 AM, a weekly wrap-up on a chosen day, or off
- Weekly Top Posts in Analytics: every published post for a week or the last 7 days, ranked by views, engagement, engagement rate, comments, likes, organic reach, shares, saves, clicks, video views, or watch time, with CSV export. Last week's report is built automatically each Monday and summarized in weekly wrap-up emails
- Trend signals in the Content Library: AI web research on trending hashtags, audio, formats, and standout posts, with source links and client-specific ideas you can drop into a draft
- Content Library with searchable sample assets
- Social Inbox with connected DM conversations, direct replies, and post-comment tools for supported accounts
- Analytics dashboard with provider-backed account metrics and CSV export
- Client workspaces and add-client demo flow
- Team approval queue with provider approval release for API-submitted posts; sample approvals are local examples
- Settings page

## Important prototype limitations
- Overview metrics, calendar examples, approvals, and much of the content library remain sample data; they are not automatically populated from social APIs. Approval is an Ayrshare post hold released by an Admin.
- Shared workspace state is a single JSON row; saves merge with the latest copy, but changes from teammates appear after a reload, not live.
- Autopilot skips articles already in a feed when it's connected (optionally queuing the newest one), checks feeds only when `/api/cron` runs, and does not post to YouTube. Instagram, Pinterest, and TikTok only receive articles that include an image. Removing a feed does not cancel posts it already scheduled with the provider.
- Instagram tags are spaced along the bottom of a single image; there is no drag-to-position UI yet. Collaborator invites must be accepted on Instagram. Reshares require a paid Ayrshare plan, and how Ayrshare combines `autoRepost` with approval holds has not been verified.
- Top Posts covers posts published through SignalDesk/Ayrshare. Networks report different metrics; anything a network doesn't provide shows as —, and Facebook reach includes paid reach because Meta no longer reports organic reach separately.
- Best-time bands need about 10 published posts with metrics in weekly Top Posts reports (last 12 weeks); until then the calendar shows clearly labeled starter windows that are general guidance, not your data. Times are shown in the viewer's local time zone.
- Link checks run from the server and only reach public websites. Some sites block automated checks; those links are marked “couldn't confirm” rather than broken.
- Trend signals are AI research from public web results at scan time, not platform data feeds. Links are limited to pages the search actually returned, but summaries can still be wrong; confirm trends and audio licensing before using them.
- Digests and weekly reports run from `/api/cron`, so they need the scheduler from step 7. Notifications refresh every minute while the app is open.
- Follow-up comments retry every 30 minutes (up to 12 times) if the post is not live yet, for example while it awaits approval.
- The **Connect account** button is SignalDesk email sign-in. Social accounts are connected separately in **Social Accounts** through Ayrshare's hosted OAuth page.
- The Ayrshare integration remains inactive until Vercel secrets and the Supabase schema are configured. Per-client provider profile keys are encrypted server-side; social network credentials are entered only on their provider login pages.
- Provider coverage varies by network. Publishing supports the requested services plus others, but DMs are limited to Facebook, Instagram, X, and WhatsApp (WhatsApp access is beta). Instagram, Pinterest, TikTok, and YouTube publishing require media.
- X requires your own developer app and API credits. Provider app reviews, account eligibility, rate limits, message windows, and network policy apply.
- Uploaded social media is stored in a public Supabase bucket so networks can fetch it. Do not upload private or sensitive files. Clearing a draft drops its media reference but does not delete the public object, because a scheduled post may still use it; orphan cleanup is not implemented yet.

## Suggested next build phase
1. Configure Ayrshare, Supabase, X, and Vercel secrets using the setup steps above.
2. Test linking, publishing, analytics, comments, and messaging against approved accounts.
3. Replace remaining sample dashboard data with live histories and provider webhooks.
4. Add audit logs, live collaboration updates, and production monitoring.

## Project structure
- `index.html` — page structure
- `css/styles.css` — responsive visual design
- `js/app.js` — demo data, navigation, and interactions
- `api/social.js` — authenticated social, team, and Autopilot API
- `api/cron.js` — scheduled worker for Autopilot feeds and follow-up comments
- `api/_lib/core.js` — shared provider, database, post-option, and RSS helpers
- `api/_lib/notify.js` — in-app notifications, immediate emails, and digests
- `api/_lib/reports.js` — Top Posts metrics and weekly reports
- `api/_lib/trends.js` — Claude-powered trend research
- `api/_lib/proofread.js` — Claude-powered proofreading
- `supabase/schema.sql` — tables, migration, row-level security, and the `ensure_workspace` function

## Import into Replit
Push this folder to a GitHub repository, then import the repository into Replit. Keep Git as the source of truth and avoid editing the same files independently in VS Code and Replit without committing/syncing.
