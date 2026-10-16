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
4. Select **Connect account** in the app and create an account or sign in. Each account can read and write only its own workspace row through row-level security.

On first sign-in, existing browser-local workspace data is copied to the new account if it does not already have cloud data.

## Social API setup

Social account linking and API calls run through the Vercel serverless endpoint in `api/social.js`; provider credentials must never go in browser code.

1. Create an Ayrshare Launch/Business account and enable the networks your users may connect. Launch supports up to 10 Ayrshare user profiles; this app creates one profile per SignalDesk client workspace. Review current plan, messaging, and usage charges with Ayrshare before onboarding clients.
2. Run the current `supabase/schema.sql` in the Supabase SQL editor. It creates user-scoped encrypted provider-profile storage and a public `social-media` bucket with uploads restricted to the signed-in user's folder. If that bucket already exists, the migration does not change its visibility; make it public only if you intend its media to be available to social networks.
3. Set `url` and `anonKey` in `js/config.js` to the Supabase project URL and public anon/publishable key. That key is expected to be browser-visible; never use the Supabase service-role key there.
4. Add the variables in `.env.example` to the Vercel project's server-side Environment Variables. Set `APP_ORIGINS` to the exact local HTTP and deployed HTTPS origins, comma-separated. Generate `SOCIAL_PROFILE_ENCRYPTION_KEY` with `openssl rand -base64 32`. Do not commit actual secret values.
5. In Ayrshare, enable your desired networks and configure the hosted account-linking page. The Connect button provisions a client profile only when linking begins.
6. For X, create an X Developer App, enable Read and Write (and Direct Messages if needed), set its callback URLs to `https://profile.ayrshare.com/social-accounts` and `https://app.ayrshare.com/social-accounts`, buy X API credits, and set the two X variables in Vercel. X is omitted from the linking page until both keys are configured.

Local static-file or Live Server previews cannot run `/api/social`; use a Vercel deployment or `vercel dev` for end-to-end integration testing. Do not paste API keys, encryption keys, or service-role keys into chat or commit them to Git.

## Included in this prototype
- Command Center with sample performance metrics and upcoming content
- Content Calendar with month navigation and demo posts
- Publishing Studio with live caption preview, connected-account selection, Supabase media upload, post scheduling, and provider approval submission
- Content Library with searchable sample assets
- Social Inbox with connected DM conversations, direct replies, and post-comment tools for supported accounts
- Analytics dashboard with provider-backed account metrics and CSV export
- Client workspaces and add-client demo flow
- Team approval queue with provider approval release for API-submitted posts; sample approvals are local examples
- Settings page

## Important prototype limitations
- Overview metrics, calendar examples, approvals, and much of the content library remain sample data; they are not automatically populated from social APIs. Approval is an Ayrshare post hold, not a full multi-user team approval system.
- The **Connect account** button is SignalDesk email sign-in. Social accounts are connected separately in **Social Accounts** through Ayrshare's hosted OAuth page.
- The Ayrshare integration remains inactive until Vercel secrets and the Supabase schema are configured. Per-client provider profile keys are encrypted server-side; social network credentials are entered only on their provider login pages.
- Provider coverage varies by network. Publishing supports the requested services plus others, but DMs are limited to Facebook, Instagram, X, and WhatsApp (WhatsApp access is beta). Instagram, Pinterest, TikTok, and YouTube publishing require media.
- X requires your own developer app and API credits. Provider app reviews, account eligibility, rate limits, message windows, and network policy apply.
- Uploaded social media is stored in a public Supabase bucket so networks can fetch it. Do not upload private or sensitive files. Clearing a draft drops its media reference but does not delete the public object, because a scheduled post may still use it; orphan cleanup is not implemented yet.

## Suggested next build phase
1. Configure Ayrshare, Supabase, X, and Vercel secrets using the setup steps above.
2. Test linking, publishing, analytics, comments, and messaging against approved accounts.
3. Replace remaining sample dashboard data with live histories and provider webhooks.
4. Add organization/team membership, role-based approvals, audit logs, and production monitoring.

## Project structure
- `index.html` — page structure
- `css/styles.css` — responsive visual design
- `js/app.js` — demo data, navigation, and interactions

## Import into Replit
Push this folder to a GitHub repository, then import the repository into Replit. Keep Git as the source of truth and avoid editing the same files independently in VS Code and Replit without committing/syncing.
