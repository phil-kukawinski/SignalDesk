# App review submissions

Copy-ready answers for the Meta, LinkedIn, and Pinterest developer reviews, written from how SignalDesk actually uses each permission. Replace anything in **[brackets]** before submitting.

Live site: `https://signaldesk-social.vercel.app` (if you move to a custom domain, update every URL below and in each developer portal).

---

## Before you submit (all three)

1. **A reviewer login for SignalDesk.** Reviewers sign in to your app, so create an account just for them:
   - Sign up at the live site with an address like `[review@pkworks.co]` and a strong password. Confirm the email.
   - In that account's workspace, open **Clients & Accounts**, and add a client called **App Review Demo** (new workspaces start with no clients).
   - Keep that login active until every review is finished. Put the email and password in each portal's "test credentials" field, never in the written answers.
2. **Settings → Setup & health shows no ✕** for the network you're submitting.
3. **The legal pages load:** `/privacy`, `/terms`, `/data-deletion`.
4. **Record screencasts in one take per permission group** (scripts below). Use a clean browser window at 1280×800 or larger, turn on English UI on Facebook/Instagram/LinkedIn, and narrate or caption each step. Show the network's permission dialog, then the feature that uses the permission, then the result on the network itself.

---

## Meta (Facebook Pages and Instagram)

### Why review is needed
SignalDesk manages Pages and Instagram accounts for PK Works' clients, not only accounts you own. Accounts that aren't on the app's roles list need **Advanced Access**, which requires App Review and **Business Verification** (Meta Business Settings → Security Center). Start Business Verification first; it can take several days.

### App settings to check (App Dashboard → App settings → Basic)

| Field | Value |
|---|---|
| App domains | `signaldesk-social.vercel.app` |
| Privacy Policy URL | `https://signaldesk-social.vercel.app/privacy` |
| Terms of Service URL | `https://signaldesk-social.vercel.app/terms` |
| User data deletion | Data deletion callback URL: `https://signaldesk-social.vercel.app/api/legal?event=meta-deletion` |
| App icon | `icons/icon-1024.png` (1024×1024) |
| Category | Business and pages |
| Facebook Login for Business → Valid OAuth Redirect URIs | `https://signaldesk-social.vercel.app/api/oauth` |
| Deauthorize callback URL | `https://signaldesk-social.vercel.app/api/legal?event=meta-deauthorize` |

### App description (App Review → "Tell us about your app")
> SignalDesk is a social media planning and publishing tool used by PK Works, a small marketing agency, to manage the Facebook Pages and Instagram professional accounts of its small-business clients. An admin connects a client's Page and linked Instagram account by signing in with Facebook and choosing which Page to connect. Team members then write posts, attach images or video, get approval, and schedule them. At the scheduled time SignalDesk publishes the post to the Page and Instagram account, posts an optional first comment, shows comments so the team can reply, and reports engagement for each post in a monthly client report. SignalDesk only acts on Pages and accounts the person explicitly connects, never posts without a scheduled or approved post, and does not sell or share data. Access tokens are encrypted at rest and deleted when an account is disconnected or the person removes the app.

### Permission answers

Each answer covers what Meta asks: how the app uses the permission, why it's needed, and how a reviewer can see it.

**`pages_show_list`**
> After the person signs in with Facebook, SignalDesk lists the Pages they manage so they can choose which Page belongs to the client they're connecting (Social Accounts → Connect → choose a Page). Without it, SignalDesk can't show which Pages are available, and the person couldn't pick the right one. We only read each Page's name, ID, picture, and link, and whether an Instagram professional account is linked to it.
> **To test:** sign in with the test credentials, open Social Accounts, choose "App Review Demo", select Connect on Facebook, finish Facebook's sign-in, and you'll see the list of your Pages to choose from.

**`pages_manage_posts`**
> SignalDesk publishes the posts a team schedules for a client's Page: text posts, posts with a link (with its preview card), photos, and videos, at the time they chose. This is the app's core feature; without it SignalDesk can't publish to Facebook.
> **To test:** after connecting a Page, open Publishing Studio, choose the Facebook account, write a post (optionally attach an image), and select Post now. Within about a minute the post appears on the Page. Its details in SignalDesk show "Published" with a View link.

**`pages_read_engagement`**
> SignalDesk reads the Page's basic information and the reactions, comment, and share counts on posts it published, to show results in Analytics, the Command Center, and monthly client reports. It's also required to get the Page access token used to publish. We only read engagement on posts SignalDesk published.
> **To test:** open a published post's details from the calendar, or Analytics → Top Posts, to see its reactions, comments, and shares. Counts refresh every few hours.

**`pages_manage_engagement`**
> Teams can add a first comment that SignalDesk posts right after the post publishes (often a link or hashtags), and they can reply to comments on their posts from SignalDesk's Social Inbox. Without it, first comments and replies wouldn't work.
> **To test:** in Publishing Studio, open Post options → Comments, add a first comment, and select Post now. The comment appears under the post. Then open Social Inbox → Comments on your posts, choose the post, and reply.

**`read_insights`**
> SignalDesk reads reach for posts it published to a Page, so Analytics and client reports can show engagement rate (engagement ÷ reach). We only read insights for posts SignalDesk published.
> **To test:** open Analytics after a post has been live for a few hours; Reach and Engagement rate are filled in for it.

**`instagram_basic`**
> SignalDesk reads the connected Instagram professional account's username, name, and profile picture so the person can confirm they connected the right account, and reads each published post's permalink so the team can open it. When someone adds a collaborator or tags an account on a post, SignalDesk looks the username up (Business Discovery) and shows that account's name and picture, so the team tags the right account. It's also required for every other Instagram feature.
> **To test:** after connecting, Social Accounts shows the Instagram account's username and picture. In Publishing Studio → Post options → Collaborators & tags, type a business account's username to see it confirmed with its name and picture.

**`instagram_content_publish`**
> SignalDesk publishes the posts a team schedules for a client's Instagram account: images and Reels, with captions, collaborators, and photo tags. This is the app's core Instagram feature.
> **To test:** in Publishing Studio, choose the Instagram account, attach an image, write a caption, and select Post now. Within about a minute the post appears on the Instagram account. Its details in SignalDesk show "Published" with a View link.

**`instagram_manage_comments`**
> SignalDesk posts an optional first comment right after an Instagram post publishes, and lets the team read and reply to comments on posts SignalDesk published, from the Social Inbox.
> **To test:** add a first comment under Post options → Comments and publish to Instagram; the comment appears under the post. Then open Social Inbox → Comments on your posts and reply to a comment.

**`instagram_manage_insights`**
> SignalDesk reads views, reach, likes, comments, shares, and saves for Instagram posts it published, to show results in Analytics, Top Posts, and monthly client reports.
> **To test:** open Analytics → Top Posts a few hours after an Instagram post publishes to see its numbers.

**`business_management`**
> Many of our clients' Pages and Instagram accounts are owned by a Meta Business portfolio rather than a personal profile. This permission lets the person grant SignalDesk access to those business-owned Pages and Instagram accounts during Facebook Login for Business, so they appear in the list of Pages to connect. We don't create, change, or read anything else in the business portfolio.
> **To test:** sign in with a Facebook user who manages a Page through a Business portfolio; that Page appears in SignalDesk's list of Pages to connect.

### Meta screencast script (one video, about 3–4 minutes)
1. Show the SignalDesk sign-in page and sign in with the reviewer login.
2. **Social Accounts** → choose **App Review Demo** → **Connect** on Facebook.
3. Show Facebook's Login for Business dialog listing every permission, choose the Page (and its Instagram account), and finish.
4. Back in SignalDesk, show the Page and Instagram account connected, with their names and pictures *(pages_show_list, instagram_basic)*.
5. **Publishing Studio**: choose both accounts, write a caption, attach an image, add a first comment, and add a collaborator by typing a business username so it shows as confirmed *(instagram_basic)*. Select **Post now**.
6. Open the Page and the Instagram account in new tabs and show the post and the first comment *(pages_manage_posts, instagram_content_publish, pages_manage_engagement, instagram_manage_comments)*.
7. On Facebook or Instagram, leave a comment on the post. In SignalDesk, open **Social Inbox → Comments on your posts**, show the comment, reply, and show the reply on the network *(pages_manage_engagement, instagram_manage_comments)*.
8. Open **Analytics** and the post's details to show engagement and reach *(pages_read_engagement, read_insights, instagram_manage_insights)*. If the numbers are still empty, say they refresh every few hours and show a post from earlier.
9. **Social Accounts → Disconnect** on the Page, to show people can remove access.

### Common reasons Meta rejects, and how this submission avoids them
- *Screencast doesn't show the permission in use* → each step above names the permission it demonstrates; consider adding on-screen captions with the permission names.
- *Reviewer can't sign in* → test credentials work, and the reviewer account has a client ready to connect.
- *Asking for permissions the app doesn't use* → every permission above maps to a visible feature. If you decide not to use one (for example, the Social Inbox replies), remove it from the Facebook Login for Business configuration instead of explaining it.
- *Privacy policy doesn't mention Facebook data* → `/privacy` describes the tokens, Page and account details, post metrics, and comments SignalDesk receives, and how to delete them.

---

## LinkedIn

### Two LinkedIn apps

LinkedIn requires the **Community Management API** to be the **only product on its app**, so SignalDesk uses two apps:

| App | Products | What it enables in SignalDesk | Vercel settings |
|---|---|---|---|
| **App 1: profiles** (your existing app) | **Sign In with LinkedIn using OpenID Connect** + **Share on LinkedIn**, both self-serve and instant | Posting to the person's own profile (`openid`, `profile`, `w_member_social`) | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| **App 2: company Pages** (new) | **Community Management API** only, Development tier, then Standard | Posting to company Pages the person administers (`r_organization_admin`, `w_organization_social`, `r_organization_social`) | `LINKEDIN_PAGES_CLIENT_ID`, `LINKEDIN_PAGES_CLIENT_SECRET` |

**Before requesting the Community Management API on App 2** (a rejected app can't re-apply; you'd have to create a new one):
- Name it without "Linked" or "In", for example **SignalDesk Pages**.
- Associate it with the **PK Works** LinkedIn Page, and have a Page super admin **verify** it (Settings tab → Verify).
- Use a **business email** such as `phil@pkworks.co` in the request form; personal addresses (Gmail) fail vetting. Have the organization's legal name, address, website, and privacy policy URL ready.
- Add the same redirect URL and privacy policy URL as App 1.

Once App 2's keys are in Vercel, Social Accounts shows **Connect a company Page** next to **Connect your profile**.

**Auth tab:** Authorized redirect URL `https://signaldesk-social.vercel.app/api/oauth`.
**Settings tab:** Privacy policy URL `https://signaldesk-social.vercel.app/privacy`. The app must be linked to (and verified by) the **[PK Works]** LinkedIn Page.

### Community Management API application answers

**Describe your use case**
> SignalDesk is a social media planning and publishing tool used by PK Works, a small marketing agency, to manage LinkedIn Pages for its small-business clients and its own Page. A Page admin connects a Page by signing in with LinkedIn and choosing which of the Pages they administer to connect. The team then writes and schedules posts (text, links with a preview card, and images), gets approval, and SignalDesk publishes them to the Page at the scheduled time. SignalDesk also shows comments on those posts so the team can reply, and counts likes and comments for client reports. SignalDesk only posts content a team member wrote and scheduled; it does not post automatically on its own, scrape data, or collect information about LinkedIn members.

**How each permission is used**
> - `r_organization_admin`: after sign-in, list the Pages the person administers so they can choose which one to connect, and read each Page's name and logo to show which Page is connected.
> - `w_organization_social`: publish scheduled posts to the connected Page, and reply to comments on those posts from SignalDesk.
> - `r_organization_social`: read comments, likes, and comment counts on posts SignalDesk published to the Page, for the inbox and client reports.

**Who uses the app**
> PK Works staff who are admins of the client Pages they manage. It isn't offered to the public.

**Data handling**
> Access tokens are encrypted at rest and deleted when the person disconnects the account in SignalDesk. We don't store information about LinkedIn members other than the name shown on comments they leave on posts SignalDesk published. See https://signaldesk-social.vercel.app/privacy.

### LinkedIn screencast script (about 2 minutes, if requested)
1. Sign in to SignalDesk → **Social Accounts** → choose a client → **Connect** on LinkedIn.
2. Show LinkedIn's consent screen, then choose the company Page from the list.
3. **Publishing Studio**: choose LinkedIn, write a post with a link, show the LinkedIn preview with the link card, and select **Post now**.
4. Open the Page on LinkedIn and show the post with its link card.
5. Comment on the post on LinkedIn, then show and reply to it from **Social Inbox**.

---

## Pinterest

### Access
New Pinterest apps start with **Trial access** (Pins visible only to you, low limits). Apply for **Standard access** from the app's page at developers.pinterest.com once the trial app works. SignalDesk requests these scopes:

| Scope | Used for |
|---|---|
| `user_accounts:read` | Show which Pinterest account was connected (name and picture) |
| `boards:read` | List the account's boards so the person can choose a default board, and a board per Pin |
| `pins:write` | Create the Pins a team schedules |
| `pins:read` | Read impressions, saves, Pin clicks, and outbound clicks on Pins SignalDesk created, for reports |

**App settings:** Redirect URI `https://signaldesk-social.vercel.app/api/oauth`; Privacy policy `https://signaldesk-social.vercel.app/privacy`.

### Standard access application answers

**Describe your app**
> SignalDesk is a social media planning and publishing tool used by PK Works, a small marketing agency, to schedule Pins for its small-business clients. An admin connects a client's Pinterest business account with Pinterest sign-in and chooses a default board. Team members create a Pin with an image, title, description, and destination link, choose a board, and schedule it; SignalDesk creates the Pin at that time. SignalDesk then shows impressions, saves, and clicks for those Pins in monthly client reports.

**How you use each scope** → use the table above, one sentence per scope.

**Who uses it**
> PK Works staff managing their clients' Pinterest business accounts. It isn't offered to the public.

**Pinterest demo video (about 90 seconds)**
1. Sign in to SignalDesk → **Social Accounts** → **Connect** on Pinterest → approve on Pinterest → choose the default board.
2. **Publishing Studio**: choose Pinterest, attach an image, set the Pin title, link, and board under **Post options → Pinterest**, show the Pinterest preview, and select **Post now**.
3. Open the board on Pinterest and show the new Pin linking to the destination.
4. Show the Pin's numbers in **Analytics** (or explain they appear within a day).

---

## After approval

1. Connect each network from **Social Accounts** and post one test to each: an image, a link post, and an Instagram image that isn't between 4:5 and 1.91:1 (SignalDesk should pad it and send a JPEG).
2. Check **Settings → Setup & health** for anything marked ✕ under Recent problems; a failed sign-in shows the network's exact reason there.
3. Remove the reviewer account from **Settings → Team members** (and delete it in Supabase → Authentication → Users) once all reviews are closed.
