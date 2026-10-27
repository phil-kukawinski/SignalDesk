# SignalDesk beta: inviting testers

SignalDesk is a product of PK Works. This page is the checklist for bringing someone into the invite-only beta with as few hiccups as possible.

**The main catch:** until each network approves your developer app, the network only lets people you've added to that app connect their accounts. Most "it won't connect" problems in a beta come from this, so collect the details in step 1 and add each tester before they try.

---

## 1. Ask each tester for

| For | What to ask for |
|---|---|
| SignalDesk | The email they'll sign up with |
| Facebook and Instagram | Their Facebook profile name or the email on their Facebook account; their Instagram must be a Business or Creator account linked to a Facebook Page they manage |
| Threads | Their Threads username |
| YouTube | Their Google account email |
| TikTok | Their TikTok username |
| LinkedIn, Pinterest, X | Nothing extra (see the notes in step 2) |

## 2. Add them on each network (while the apps are in testing)

- **Meta (Facebook and Instagram):** developers.facebook.com → your SignalDesk app → **App roles → Roles → Add People** → **Tester**. They accept at **developers.facebook.com/requests** (they may need to register as a Meta developer, which is free and quick).
- **Threads:** the Threads app → **App roles → Roles → Add People** → **Threads Tester** → their Threads username. They accept on threads.net under **Settings → Account → Website permissions → Invites**.
- **YouTube (Google):** Google Cloud → **APIs & Services → OAuth consent screen → Audience → Test users** → add their Google email (up to 100). They'll see "Google hasn't verified this app": **Advanced → Go to SignalDesk**.
- **TikTok:** TikTok developer portal → your app → **Sandbox** → **Target users** → add their TikTok account. Videos post as private until TikTok's audit passes.
- **LinkedIn:** personal profiles work for anyone. Company Pages only work after LinkedIn approves the Community Management API; until then use the **LinkedIn Page** reminder.
- **Pinterest:** with Trial access, Pinterest may only allow your own account. Ask testers to try; if Pinterest refuses, it'll work after Standard access.
- **X:** anyone can sign in. Posting counts against your X API plan's monthly allowance.

**YouTube upload limit:** Google's default quota allows about **6 uploads a day across all users**. Request a higher quota in Google Cloud (**YouTube Data API v3 → Quotas**, or the YouTube API audit form) before testers rely on YouTube.

## 3. Send the invite

Settings → **Beta invites** → enter their email → **Create invite**. They get an email from hello@pkworks.co with a link that opens the sign-up form with the code filled in.

Then send them a short note so they know what to expect:

> Hi {name},
>
> Thanks for helping test SignalDesk, the social media scheduler we built at PK Works. Your invite email is on its way from hello@pkworks.co. The link sets up your account.
>
> A few things to know:
> - When you first sign in, take the 1-minute tour. It covers the essentials.
> - Start with **Add client**, then **Social Accounts → Connect**. I've added you as a tester on Facebook/Instagram, Threads, YouTube, and TikTok, so those should let you in. Accept the tester invites first if you got any.
> - YouTube and TikTok posts stay private while the networks review our app. That's expected.
> - If anything breaks or confuses you, use **Send feedback** in the sidebar (or the More menu on your phone). It comes straight to me.
>
> It's a beta, so please double-check posts that matter. Thank you!

## 4. When feedback comes in

Feedback arrives by email from hello@pkworks.co, with the page they were on, their browser, and their workspace; hit **Reply** to answer them. Server errors are collected too: **Settings → Setup & health → Recent problems** shows them, and platform admins get an email summary at most every 6 hours.

---

## Branded sign-in emails (Supabase)

Supabase sends the "confirm your email" and "reset your password" emails. By default they say "Supabase", which confuses people. You paste a SignalDesk design into Supabase's dashboard once; there's no script or SQL.

The designs are in `supabase/email-templates/`:

| Supabase template | Subject to paste | Body file |
|---|---|---|
| **Confirm signup** | `Confirm your SignalDesk account` | `confirm-signup.html` |
| **Reset password** | `Reset your SignalDesk password` | `reset-password.html` |

For each one:
1. Supabase (project zuckwjjzhrcesrzbfdak) → **Authentication** → **Emails** → the template's tab.
2. Replace the **Subject** with the subject above.
3. In the message body box, select everything, delete it, and paste the whole file's contents. Leave `{{ .ConfirmationURL }}` and `{{ .Email }}` exactly as they are; Supabase fills them in.
4. **Save**. Use the preview to check it.
