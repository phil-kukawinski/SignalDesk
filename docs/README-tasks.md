# SignalDesk: your task list

Last updated November 5, 2026. Tasks are ranked easiest first, and times are rough estimates of your hands-on work, not how long a platform takes to respond.

I can't see the developer portals, so some of these may already be done. Check off anything you've finished, and tell me if a task's status has changed.

Copy-ready answers and screencast scripts for the reviews are in [app-review.md](app-review.md).

## A few minutes each

- [x] **0. Run the latest database update. Do this first.** Open the [SignalDesk SQL editor](https://supabase.com/dashboard/project/zuckwjjzhrcesrzbfdak/sql/new) (project `zuckwjjzhrcesrzbfdak`), paste all of `supabase/schema.sql`, and click Run. It's safe to run again. Until you do, Settings → Setup & health will flag a missing table, Activity shows post events only, and the database's double-booking check stays off.
- [ ] **1. Ask Google to index the home page.** In Search Console, paste `https://socialsignaldesk.com/` into URL Inspection and click Request indexing.
- [ ] **2. Add your name and photo.** Settings → Your account.
- [ ] **3. Add OpenID Connect to LinkedIn app 1.** Add the **Sign In with LinkedIn using OpenID Connect** product. It's self-serve and instant.
- [ ] **4. Replace any Meta, LinkedIn, or Pinterest answers you've already copied.** I corrected them in [app-review.md](app-review.md), including who can use SignalDesk and that blog feeds can schedule posts automatically, so older copies are out of date. Skip this if you haven't copied any.
- [ ] **5. Check the first Monday email on November 9.** It should arrive after 8 AM Eastern. Tell me if it doesn't.
- [ ] **6. Check Google's indexing around November 10.** In Search Console, open Indexing → Pages and look for your four pages. Results can take days to weeks to appear.

## 10 to 30 minutes each

- [ ] **7. Turn on Facebook reach and views.** Add `read_insights` to the Facebook Login for Business configuration, then reconnect both Facebook connections in SignalDesk. Do this before Meta's App Review.
- [ ] **8. Apply for Unsplash production access.** Make sure your Access Key is in Vercel as `UNSPLASH_ACCESS_KEY`. Then search for a photo in the Publishing Studio, attach it, and take a screenshot showing "Photo by [name] on Unsplash" for the application. Demo access allows 50 requests an hour.
- [ ] **9. Create the reviewer login.** Follow "Before you submit" in [app-review.md](app-review.md). The Meta, LinkedIn, and Pinterest reviews all use it.
- [ ] **10. Watch for LinkedIn's reply on app 2 (company Pages).** LinkedIn denied the Community Management API request with "Business verification failed," and you sent a vetting appeal on November 3, 2026. Watch your Gmail and any `pkworks.co` inboxes for a request for documents. Have proof of your business ready, and make sure the business name, address, website, and LinkedIn Page all match.
- [ ] **11. Apply for Pinterest Standard access.** Until it's approved, Pinterest refuses to create live Pins, so scheduled Pins fail. Facebook and Instagram aren't affected. The answers are in [app-review.md](app-review.md).
- [ ] **12. Upgrade to Vercel Pro and Supabase Pro.** This is quick but costs money, so wait until just before you invite anyone else. Check what backups Supabase Pro includes while you're there, since task A depends on them.

## About an hour each

- [ ] **13. Finish the PK Works campaign test.** Import two or three posts as drafts, send them for approval, open the client link in a private window, click Approve all, and let one post publish on schedule. This is the most useful test on the list, because these features haven't run on real accounts yet.
- [ ] **14. Send a test post to each connected network.** Include an image, a carousel, and an Instagram video.

## Before taking customers

Added November 5, 2026, from the outside review.

- [ ] **A. Turn on automated backups and test a restore.** Needs Supabase Pro (task 12). Restore a backup into a separate, temporary Supabase project, never the live one, and confirm clients, posts, and connections came back. About half a day. A backup that's never been restored isn't proven.
- [ ] **B. Try real failures on your own accounts.** Each should show a clear message, and none should post twice. About an hour, spread out:
  - Revoke SignalDesk's access on a network, with a post scheduled soon. It should say Reconnect needed, then publish on retry after reconnecting.
  - Schedule several posts for the same minute across networks. Each should publish once.
  - Upload a file over 50 MB and a video the network won't accept. Each should be refused before scheduling.
- [ ] **C. Check that a repeat post keeps its local time across a clock change.** Daylight saving ended November 1, so the next real change is March 14, 2027. Set a weekly repeat that spans it and check its times on the calendar.
- [ ] **D. Confirm that one workspace can't see another's data.** Use a second real workspace with a test client, before any paying customer signs up. Sign in to each one and confirm neither shows the other's clients, posts, or files. Create only this one test account, because of Supabase's email limit.
- [ ] **E. Check how the Threads and X test post went out.** Open the PK Works test post's details and see whether those two were direct posts or reminders. Tell me which, so the docs and the report can say for sure.

## Half a day or more, with waiting

- [ ] **15. Get a lawyer to review the legal pages.** Do this before opening SignalDesk to other people: `/privacy`, `/terms`, and `/data-deletion`. Ask specifically about keeping a deleted person's name and email in the activity log and post history, and how that fits deletion requests under laws like GDPR and California's. Also ask about sending uploaded documents to Anthropic for campaign plans, since they may include client material, and about client confidentiality when agencies use the automatic planning notes, which admins can now turn off. Check Anthropic's current data-use and retention terms for the API so the privacy policy states them correctly.
- [ ] **16. Complete Meta Business Verification.** It's done for PK Works in Meta's business settings and can take days or longer. Start it before you record anything for App Review.
- [ ] **17. Complete Meta App Review.** Needs tasks 7, 9, and 16. Use each feature once, record the screencast, and paste the answers from [app-review.md](app-review.md). List Anthropic as a service provider.

## Optional: the other four networks

SignalDesk can connect to these directly, but the website now advertises them as reminders only. Do these only if you want to post to them automatically, and tell me when one is ready so I can update the website.

- [ ] **18. Threads.** Add the **Access the Threads API** use case to the Meta app. It goes through App Review with task 17.
- [ ] **19. X.** No review is needed, but posting through the API needs an X plan that includes writes.
- [ ] **20. YouTube.** Needs Google verification of the app and a YouTube API audit. Uploads stay private until the audit passes.
- [ ] **21. TikTok.** Needs the Content Posting API audit and a screen recording. Posts stay private until the audit passes.

## After the approvals come through

- [ ] **22. Switch the Meta app to Live.** Until then, only people with a role on the app can connect.
- [ ] **23. Post one test to each newly approved network,** then check Settings → Setup & health for anything marked ✕.
- [ ] **24. Remove the reviewer account.** Remove it in Settings → Team members, then delete it in Supabase → Authentication → Users, once every review is closed.
- [ ] **25. Remove the old `vercel.app` redirect URLs from each portal.** Wait until every connection has moved to `socialsignaldesk.com`.
