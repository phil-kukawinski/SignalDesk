# SignalDesk: your task list

Last updated November 3, 2026. Tasks are ranked easiest first, and times are rough estimates of your hands-on work, not how long a platform takes to respond.

I can't see the developer portals, so some of these may already be done. Check off anything you've finished, and tell me if a task's status has changed.

Copy-ready answers and screencast scripts for the reviews are in [app-review.md](app-review.md).

## A few minutes each

- [ ] **0. Run the latest database update. Do this first.** Open the [SignalDesk SQL editor](https://supabase.com/dashboard/project/zuckwjjzhrcesrzbfdak/sql/new) (project `zuckwjjzhrcesrzbfdak`), paste all of `supabase/schema.sql`, and click Run. It's safe to run again. Until you do, Settings → Setup & health will flag a missing table, Activity shows post events only, and the database's double-booking check stays off.
- [ ] **1. Ask Google to index the home page.** In Search Console, paste `https://socialsignaldesk.com/` into URL Inspection and click Request indexing.
- [ ] **2. Add your name and photo.** Settings → Your account.
- [ ] **3. Add OpenID Connect to LinkedIn app 1.** Add the **Sign In with LinkedIn using OpenID Connect** product. It's self-serve and instant.
- [ ] **4. Replace any Meta, LinkedIn, or Pinterest answers you've already copied.** I corrected them in [app-review.md](app-review.md), including who can use SignalDesk and that blog feeds can schedule posts automatically, so older copies are out of date. Skip this if you haven't copied any.
- [ ] **5. Check the first Monday email on November 9.** It should arrive after 8 AM Eastern. Tell me if it doesn't.
- [ ] **6. Check Google's indexing around November 10.** In Search Console, open Indexing → Pages and look for your four pages. Results can take days to weeks to appear.

## 10 to 30 minutes each

- [ ] **7. Turn on Facebook reach and views.** Add `read_insights` to the Facebook Login for Business configuration, then reconnect both Facebook connections in SignalDesk. Do this before Meta's App Review.
- [ ] **8. Apply for Unsplash production access.** Stock photo search has low limits until it's approved.
- [ ] **9. Create the reviewer login.** Follow "Before you submit" in [app-review.md](app-review.md). The Meta, LinkedIn, and Pinterest reviews all use it.
- [ ] **10. Watch for LinkedIn's reply on app 2 (company Pages).** LinkedIn denied the Community Management API request with "Business verification failed," and you sent a vetting appeal on November 3, 2026. Watch your Gmail and any `pkworks.co` inboxes for a request for documents. Have proof of your business ready, and make sure the business name, address, website, and LinkedIn Page all match.
- [ ] **11. Apply for Pinterest Standard access.** Until it's approved, Pins are visible only to you. The answers are in [app-review.md](app-review.md).
- [ ] **12. Upgrade to Vercel Pro and Supabase Pro.** This is quick but costs money, so wait until just before you invite anyone else.

## About an hour each

- [ ] **13. Finish the PK Works campaign test.** Import two or three posts as drafts, send them for approval, open the client link in a private window, click Approve all, and let one post publish on schedule. This is the most useful test on the list, because these features haven't run on real accounts yet.
- [ ] **14. Send a test post to each connected network.** Include an image, a carousel, and an Instagram video.

## Half a day or more, with waiting

- [ ] **15. Get a lawyer to review the legal pages.** Do this before opening SignalDesk to other people: `/privacy`, `/terms`, and `/data-deletion`.
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
