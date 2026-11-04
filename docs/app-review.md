# App review submissions

Copy-ready answers for the Meta, LinkedIn, and Pinterest developer reviews, written from how SignalDesk actually uses each permission. Replace anything in **[brackets]** before submitting.

Live site: `https://socialsignaldesk.com` (the old address, `https://signaldesk-social.vercel.app`, still works; keep its redirect URL in each portal until every connection has moved).

---

## Before you submit (all three)

1. **A reviewer login for SignalDesk.** Reviewers sign in to your app, so create an account just for them. Sign-ups are invite-only, so:
   - In **Settings → Beta invites**, create a one-use invite for an address like `[review@pkworks.co]`, then open its link and create the account with a strong password. Confirm the email.
   - In that account's workspace, open **Clients & Accounts**, and add a client called **App Review Demo** (new workspaces start with no clients).
   - Sign in once as the reviewer and close the welcome screen, so it doesn't get in their way.
   - Keep that login active until every review is finished. Put the email and password in each portal's "test credentials" field, never in the written answers. The reviewer signs in with these, so they don't need an invite.
2. **Settings → Setup & health shows no ✕** for the network you're submitting.
3. **The legal pages load:** `/privacy`, `/terms`, `/data-deletion`.
4. **Record screencasts in one take per permission group** (scripts below). Use a clean browser window at 1280×800 or larger, turn on English UI on Facebook/Instagram/LinkedIn, and narrate or caption each step. Show the network's permission dialog, then the feature that uses the permission, then the result on the network itself.

---

## Meta (Facebook Pages and Instagram)

### Order of steps
1. **Reconnect your own Facebook account in SignalDesk first** so it has every permission below, including `read_insights`, then use each feature once (post, first comment, reply to a comment, open Analytics). Meta's dashboard can hold back a permission until the app has actually used it recently.
2. **Business Verification** for PK Works, in Meta's business settings. Review of these permissions needs it, and it can take days or longer, so start it first.
3. **Check App settings** (below), including the new app icon.
4. **Record the screencast** and fill in the answers below under App Review → Requests.
5. **After approval, switch the app to Live.** Until then, only people with a role on the app can connect, which is why testers see "App not active".

### Why review is needed
SignalDesk manages Pages and Instagram accounts for PK Works' clients, not only accounts you own. Accounts that aren't on the app's roles list need **Advanced Access**, which requires App Review and **Business Verification** (Meta Business Settings → Security Center). Start Business Verification first; it can take several days.

### App settings to check (App Dashboard → App settings → Basic)

| Field | Value |
|---|---|
| App domains | `socialsignaldesk.com` |
| Privacy Policy URL | `https://socialsignaldesk.com/privacy` |
| Terms of Service URL | `https://socialsignaldesk.com/terms` |
| User data deletion | Data deletion callback URL: `https://socialsignaldesk.com/api/legal?event=meta-deletion` |
| App icon | `icons/icon-1024.png` (1024×1024). The logo changed, so upload it again here and in the other portals. |
| Category | Business and pages |
| Facebook Login for Business → Valid OAuth Redirect URIs | `https://socialsignaldesk.com/api/oauth` |
| Deauthorize callback URL | `https://socialsignaldesk.com/api/legal?event=meta-deauthorize` |

### App description (App Review → "Tell us about your app")
> SignalDesk is a social media planning and publishing tool used by PK Works, a small marketing agency, to manage the Facebook Pages and Instagram professional accounts of its small-business clients. It is also in an invite-only beta with a small number of other agencies and freelancers; there is no open sign-up. An admin connects a client's Page and linked Instagram account by signing in with Facebook and choosing which Page to connect. Team members then write posts, attach images or video, get approval, and schedule them. At the scheduled time SignalDesk publishes the post to the Page and Instagram account, posts an optional first comment, shows comments so the team can reply, and reports engagement for each post in a monthly client report. An admin can also connect a blog or news feed (RSS), which creates posts from new articles, either held for approval or scheduled automatically. SignalDesk only acts on Pages and accounts the person explicitly connects, publishes only posts that a team member scheduled or that come from a feed an admin set up, and does not sell data. The service providers it uses, including Anthropic for AI features, are listed in the privacy policy. Access tokens are encrypted at rest and deleted when an account is disconnected or the person removes the app.

### Permission answers

Each answer covers what Meta asks: how the app uses the permission, why it's needed, and how a reviewer can see it.

**`pages_show_list`**
> After the person signs in with Facebook, SignalDesk lists the Pages they manage so they can choose which Page belongs to the client they're connecting (Social Accounts → Connect → choose a Page). Without it, SignalDesk can't show which Pages are available, and the person couldn't pick the right one. We only read each Page's name, ID, picture, and link, and whether an Instagram professional account is linked to it.
> **To test:** sign in with the test credentials, open Social Accounts, choose "App Review Demo", select Connect on Facebook, finish Facebook's sign-in, and you'll see the list of your Pages to choose from.

**`pages_manage_posts`**
> SignalDesk publishes the posts a team schedules for a client's Page: text posts, posts with a link (with its preview card), photos, and videos, at the time they chose. This is the app's core feature; without it SignalDesk can't publish to Facebook.
> **To test:** after connecting a Page, open Publishing Studio, choose the Facebook account, write a post (optionally attach an image), and choose **More → Post now**. Within about a minute the post appears on the Page. Its details in SignalDesk show "Published" with a View link.

**`pages_read_engagement`**
> SignalDesk reads the Page's name and follower count, and its published posts with their reactions, comments, and share counts, including posts made outside SignalDesk. Teams see everything on the account in one calendar and in Analytics and monthly client reports, not only what they scheduled here. It's also required to get the Page access token used for publishing. Without it, SignalDesk couldn't publish or report results.
> **To test:** open a published post's details from the calendar, or Analytics → Weekly Top Posts, to see its reactions, comments, and shares. Posts made directly on Facebook also appear on the Content Calendar. Numbers refresh every few hours.

**`pages_manage_engagement`**
> Teams can add a first comment that SignalDesk posts right after the post publishes (often a link or hashtags), and they can reply to comments on their posts from SignalDesk's Social Inbox. Without it, first comments and replies wouldn't work.
> **To test:** in Publishing Studio, open **More options → Comments**, add a first comment, and choose **More → Post now**. The comment appears under the post. Then open Social Inbox → Comments on your posts, choose the post, and reply.

**`read_insights`**
> SignalDesk reads views and reach for the Page's recent posts, including posts made outside SignalDesk, so Analytics and client reports can show engagement rate (engagement ÷ reach) across everything on the account. We read this only for Pages the person connected, and use it only to show them their own results.
> **To test:** open Analytics after a post has been live for a few hours; Reach and Engagement rate are filled in for it.

**`instagram_basic`**
> SignalDesk reads the connected Instagram professional account's username, name, and profile picture so the person can confirm they connected the right account, and reads the account's recent posts (caption, media, permalink, date, and like and comment counts), including posts made outside SignalDesk, so the calendar and Analytics show the whole account. When someone adds a collaborator or tags an account on a post, SignalDesk looks the username up (Business Discovery) and shows that account's name and picture, so the team tags the right account. It's also required for every other Instagram feature.
> **To test:** after connecting, Social Accounts shows the Instagram account's username and picture. Posts made directly on Instagram appear on the Content Calendar. In Publishing Studio → More options → Collaborators & tags, type a business account's username to see it confirmed with its name and picture.

**`instagram_content_publish`**
> SignalDesk publishes the posts a team schedules for a client's Instagram account: images, carousels, Reels, and Stories, with captions, collaborators, and photo tags. This is the app's core Instagram feature.
> **To test:** in Publishing Studio, choose the Instagram account, attach an image, write a caption, and choose **More → Post now**. Within about a minute the post appears on the Instagram account. Its details in SignalDesk show "Published" with a View link.

**`instagram_manage_comments`**
> SignalDesk posts an optional first comment right after an Instagram post publishes, and lets the team read and reply to comments on posts SignalDesk published, from the Social Inbox.
> **To test:** add a first comment under **More options → Comments** and publish to Instagram; the comment appears under the post. Then open Social Inbox → Comments on your posts and reply to a comment.

**`instagram_manage_insights`**
> SignalDesk reads views, reach, likes, comments, shares, and saves for the account's recent posts, including posts made outside SignalDesk, plus the account's follower count and daily reach and views. These show in Analytics, Weekly Top Posts, follower growth, and monthly client reports. We use them only to show the person their own results.
> **To test:** open Analytics → Weekly Top Posts a few hours after an Instagram post publishes to see its numbers.

**`business_management`**
> Many of our clients' Pages and Instagram accounts are owned by a Meta Business portfolio rather than a personal profile. This permission lets the person grant SignalDesk access to those business-owned Pages and Instagram accounts during Facebook Login for Business, so they appear in the list of Pages to connect. We don't create, change, or read anything else in the business portfolio.
> **To test:** sign in with a Facebook user who manages a Page through a Business portfolio; that Page appears in SignalDesk's list of Pages to connect.

### Meta screencast script (one video, about 3–4 minutes)
1. Show the SignalDesk sign-in page and sign in with the reviewer login.
2. **Social Accounts** → choose **App Review Demo** → **Connect** on Facebook.
3. Show Facebook's Login for Business dialog listing every permission, choose the Page (and its Instagram account), and finish.
4. Back in SignalDesk, show the Page and Instagram account connected, with their names and pictures *(pages_show_list, instagram_basic)*.
5. **Publishing Studio**: choose both accounts, write a caption, attach an image, add a first comment, and add a collaborator by typing a business username so it shows as confirmed *(instagram_basic)*. Choose **More → Post now**.
6. Open the Page and the Instagram account in new tabs and show the post and the first comment *(pages_manage_posts, instagram_content_publish, pages_manage_engagement, instagram_manage_comments)*.
7. On Facebook or Instagram, leave a comment on the post. In SignalDesk, open **Social Inbox → Comments on your posts**, show the comment, reply, and show the reply on the network *(pages_manage_engagement, instagram_manage_comments)*.
8. Open **Analytics** and the post's details to show engagement and reach *(pages_read_engagement, read_insights, instagram_manage_insights)*. If the numbers are still empty, say they refresh every few hours and show a post from earlier. Then open the **Content Calendar** and show a post made directly on Facebook or Instagram, to show why posts from outside SignalDesk are read *(pages_read_engagement, instagram_basic)*.
9. **Social Accounts → Disconnect** on the Page, to show people can remove access.

### Common reasons Meta rejects, and how this submission avoids them
- *Screencast doesn't show the permission in use* → each step above names the permission it demonstrates; consider adding on-screen captions with the permission names.
- *Reviewer can't sign in* → test credentials work, and the reviewer account has a client ready to connect.
- *Asking for permissions the app doesn't use* → every permission above maps to a visible feature. If you decide not to use one (for example, the Social Inbox replies), remove it from the Facebook Login for Business configuration instead of explaining it.
- *Privacy policy doesn't mention Facebook data* → `/privacy` describes the tokens, Page and account details, post metrics, and comments SignalDesk receives, and how to delete them. Check it also covers posts made outside SignalDesk and account-level numbers before submitting, since Meta compares the policy with these answers.

---

## LinkedIn

### Two LinkedIn apps

LinkedIn requires the **Community Management API** to be the **only product on its app**, so SignalDesk uses two apps:

| App | Products | What it enables in SignalDesk | Vercel settings |
|---|---|---|---|
| **App 1: profiles** (your existing app) | **Sign In with LinkedIn using OpenID Connect** + **Share on LinkedIn**, both self-serve and instant | Posting to the person's own profile (`openid`, `profile`, `w_member_social`) | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| **App 2: company Pages** (new) | **Community Management API** only, Development tier, then Standard | Posting to company Pages the person administers (`r_organization_admin`, `w_organization_social`, `r_organization_social`) | `LINKEDIN_PAGES_CLIENT_ID`, `LINKEDIN_PAGES_CLIENT_SECRET` |

**Status, November 3, 2026:** LinkedIn denied App 2's request with "Business verification failed," and a vetting appeal has been sent. Don't create a new app unless the appeal fails. If it does, follow the checklist below.

**Before requesting the Community Management API on App 2** (a rejected app can't re-apply; you'd have to create a new one):
- Name it without "Linked" or "In", for example **SignalDesk Pages**.
- Associate it with the **PK Works** LinkedIn Page, and have a Page super admin **verify** it (Settings tab → Verify).
- Use a **business email** such as `phil@pkworks.co` in the request form; personal addresses (Gmail) fail vetting. Have the organization's legal name, address, website, and privacy policy URL ready.
- Add the same redirect URL and privacy policy URL as App 1.

Once App 2's keys are in Vercel, Social Accounts shows **Connect a company Page** next to **Connect your profile**.

**Auth tab:** Authorized redirect URL `https://socialsignaldesk.com/api/oauth`.
**Settings tab:** Privacy policy URL `https://socialsignaldesk.com/privacy`. The app must be linked to (and verified by) the **[PK Works]** LinkedIn Page.

### Community Management API application answers

**Describe your use case**
> SignalDesk is a social media planning and publishing tool used by PK Works, a small marketing agency, to manage LinkedIn Pages for its small-business clients and its own Page. It is also in an invite-only beta with a small number of other agencies and freelancers; there is no open sign-up. A Page admin connects a Page by signing in with LinkedIn and choosing which of the Pages they administer to connect. The team then writes and schedules posts (text, links with a preview card, and images), gets approval, and SignalDesk publishes them to the Page at the scheduled time. SignalDesk also shows comments on those posts so the team can reply, and counts likes and comments for client reports. An admin can also connect a blog or news feed (RSS), which creates posts from new articles, either held for approval or scheduled automatically. SignalDesk does not scrape data or store information about LinkedIn members.

**How each permission is used**
> - `r_organization_admin`: after sign-in, list the Pages the person administers so they can choose which one to connect, and read each Page's name and logo to show which Page is connected.
> - `w_organization_social`: publish scheduled posts to the connected Page, and reply to comments on those posts from SignalDesk.
> - `r_organization_social`: read the connected Page's recent posts, including ones made outside SignalDesk (text, link, post type, and date), with their like and comment counts and the Page's follower count, for the calendar, analytics, and client reports. It also reads the comments on posts SignalDesk published to the Page, for the inbox.

**Who uses the app**
> PK Works staff, plus a small number of other agencies and freelancers in our invite-only beta. There is no open sign-up, and only someone who administers a Page can connect it.

**Data handling**
> Access tokens are encrypted at rest and deleted when the person disconnects the account in SignalDesk. We store the connected Page's posts and their counts. We don't store information about LinkedIn members: comments are read when the inbox opens, without stored copies, and their authors appear only as "LinkedIn member." Post text and counts may go to our AI provider, Anthropic, to write a weekly planning note for the team. See https://socialsignaldesk.com/privacy.

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
| `boards:write` | Required by Pinterest to create a Pin on a board. SignalDesk doesn't create, edit, or delete boards |
| `pins:write` | Create the Pins a team schedules |
| `pins:read` | Read the account's recent Pins, including ones made outside SignalDesk, with their impressions, saves, Pin clicks, and outbound clicks, for the calendar, analytics, and reports |

**App settings:** Redirect URI `https://socialsignaldesk.com/api/oauth`; Privacy policy `https://socialsignaldesk.com/privacy`.

### Standard access application answers

**Describe your app**
> SignalDesk is a social media planning and publishing tool used by PK Works, a small marketing agency, to schedule Pins for its small-business clients. It is also in an invite-only beta with a small number of other agencies and freelancers; there is no open sign-up. An admin connects a client's Pinterest business account with Pinterest sign-in and chooses a default board. Team members create a Pin with an image, title, description, and destination link, choose a board, and schedule it; SignalDesk creates the Pin at that time. An admin can also connect a blog or news feed (RSS), which creates posts from new articles, either held for approval or scheduled automatically. SignalDesk then shows impressions, saves, and clicks for those Pins in monthly client reports.

**How you use each scope** → use the table above, one sentence per scope.

**Who uses it**
> PK Works staff managing their clients' Pinterest business accounts, plus a small number of other agencies and freelancers in our invite-only beta. There is no open sign-up.

**Pinterest demo video (about 90 seconds)**
1. Sign in to SignalDesk → **Social Accounts** → **Connect** on Pinterest → approve on Pinterest → choose the default board.
2. **Publishing Studio**: choose Pinterest, attach an image, set the Pin title, link, and board under **More options → Pinterest**, show the Pinterest preview, and select **Post now**.
3. Open the board on Pinterest and show the new Pin linking to the destination.
4. Show the Pin's numbers in **Analytics** (or explain they appear within a day).

---

## X, YouTube, TikTok, and Threads

These connect directly too. Each needs its own developer app with `APP_URL/api/oauth` as the redirect URL; setup steps are in the README (Publishing setup → 6b).

- **X:** no review, but posting through the API needs an X plan that includes writes. Use the app description: “SignalDesk schedules and publishes posts that our users write for the X accounts they manage.”
- **YouTube (Google):** Google verifies apps that use `youtube.upload`. Submit the OAuth consent screen for verification with the privacy policy (`APP_URL/privacy`, which already includes the YouTube API Services disclosures) and a screen recording: connect YouTube in Social Accounts, schedule a video, and show it on the channel. Separately, request a **YouTube API audit** so uploads aren't locked to private.
- **Google verification scopes:** SignalDesk requests only `youtube.upload` and `youtube.readonly`, so remove `youtube.force-ssl` and `yt-analytics.readonly` from the consent screen's Data Access page. Justifications:
  - `youtube.upload`: “SignalDesk uploads a video the user chose in its Publishing Studio to the YouTube channel they connected, at the time they scheduled, with their title, description, privacy setting, and optional thumbnail. This is the core function, and a narrower scope can't upload videos.”
  - `youtube.readonly`: “After sign-in, SignalDesk reads the connected channel's name, picture, and address so the user can confirm which channel they connected. It also reads view, like, and comment counts for the videos it published, for the user's analytics and client reports. No narrower scope provides this data, and SignalDesk doesn't change or delete anything with this scope.”
- **TikTok:** submit the app for the **Content Posting API** audit. TikTok wants a recording that shows: the creator's nickname and avatar before posting, the privacy choice, the caption, and a clear notice that the post goes to TikTok. Until the audit passes, posts are private.
- **Threads:** add the **Access the Threads API** use case to the Meta app. For `threads_content_publish`, record connecting Threads and publishing a post; for `threads_manage_insights`, show that post's views and likes in Analytics; it goes through Meta's normal App Review alongside the Facebook and Instagram permissions.

## After approval

1. Connect each network from **Social Accounts** and post one test to each: an image, a link post, and an Instagram image that isn't between 4:5 and 1.91:1 (SignalDesk should pad it and send a JPEG).
2. Check **Settings → Setup & health** for anything marked ✕ under Recent problems; a failed sign-in shows the network's exact reason there.
3. Remove the reviewer account from **Settings → Team members** (and delete it in Supabase → Authentication → Users) once all reviews are closed.
