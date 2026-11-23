# Meta App Review: what to screen record

One video, about 4–6 minutes once trimmed, covering all 14 permissions. Upload the **same video** to every permission in App Review → Requests, and in each permission's notes give the timestamp where it's shown (template at the end).

Business Verification itself doesn't need a video: it's documents only. This recording is for **App Review**, which comes after verification.

---

## Part A: before you press record (about 30 minutes, once)

### 1. Check Meta's permission list
In the Meta App Dashboard, go to **Facebook Login for Business → Configurations** and open the configuration SignalDesk uses. It must include all of these:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `pages_manage_engagement`
- `pages_read_user_content`
- `read_insights`
- `instagram_basic`
- `instagram_content_publish`
- `instagram_manage_comments`
- `instagram_manage_insights`
- `business_management`
- `pages_messaging`
- `instagram_manage_messages`
- `pages_manage_metadata`

`read_insights`, `pages_read_user_content` and the three messaging permissions are the most likely to be missing. Add any that are, and save. If Meta won't offer the messaging permissions, add the messaging use cases first (task 17a in README-tasks).

### 2. Make Facebook ask for permission again
On Facebook, open **Settings & privacy → Settings → Business integrations**, find SignalDesk, and **Remove** it. That way the recording shows Facebook's full permission screen instead of skipping it. Your existing connections in SignalDesk will need reconnecting afterward; the recording does that for the demo client.

### 3. Have these ready
- **The reviewer login** (task 9 in README-tasks), with the **App Review Demo** client. The reviewer account must not have two-factor sign-in turned on.
- **A Facebook Page and linked Instagram professional account** to post to. PK Works' own is fine; the post goes out for real.
- **One image** on your desktop: a JPG, 1080×1350 or 1080×1080, nothing that needs explaining.
- **A second Facebook account and a second Instagram account** to leave comments and send messages from. Your phone works for this.
- **That second Facebook account added as a Tester** on the Meta app (App roles → Roles → Add people → Tester), and the invite accepted. Until Meta approves, SignalDesk can only reply to people with a role on the app, so a reply to anyone else fails.
- **The second Instagram account set up to receive replies.** Facebook replies work with just the Tester role (tested November 23). Instagram is stricter before approval: the person messaging needs a role on the app *and* a role on the business's Instagram account. Otherwise the reply fails with "(#10) This message is sent outside of allowed window", even minutes after their message. To give it both:
  1. In **Accounts Center**, link the second Instagram account to the second Facebook account (the Tester).
  2. In **Meta Business Suite → Settings → People**, give that Facebook account access to the PK Works Instagram account (partial access with messages is enough).
  3. Test it before recording: send a direct message from the second Instagram account, then reply from SignalDesk. If it still fails, record step 29 anyway, using the fallback in that step.
- **Instagram set to share messages:** in the Instagram app on the business account, go to **Settings → Messages and story replies → Message controls → Connected tools** and turn on **Allow access to messages**.
- **One older post with numbers:** something posted at least a day ago, so Analytics has reach and engagement to show. Fresh posts take a few hours.
- **One post made directly on Facebook or Instagram** (not through SignalDesk) in the last week or two, so you can show it on the calendar.
- **An Instagram business username to look up**, for the collaborator step. You'll only look it up, not post with it.

### 4. Set up the screen
- Use a separate Chrome profile with no extensions and the bookmarks bar hidden (⌘⇧B). The window should be at least 1280×800, at 100% zoom.
- Set Facebook and Instagram to English.
- Turn on **Do Not Disturb** on the Mac, so no notifications show.
- Open three tabs in this order:
  1. `https://socialsignaldesk.com`, signed out.
  2. Your Facebook Page.
  3. Your Instagram profile on instagram.com.
- In SignalDesk, check that **Settings → Setup & health** shows no ✕ for Facebook or Instagram.

### 5. How to record
- Press **⌘⇧5**, choose **Record Selected Portion** around the browser window, and turn on the microphone under **Options** if you'll narrate.
- Narrating is easiest. The **Say:** lines below are suggestions; plain and slow is best. If you'd rather not talk, add the same lines as captions in iMovie afterward.
- Waiting is fine. Trim the dead time afterward in QuickTime (⌘T) or iMovie, but keep each step's start and result on screen.
- Note the time on the recording when you reach each **⏱** marker. You'll need those times for the notes.

---

## Part B: the recording

### 1. Sign in (about 20 seconds)
1. On the SignalDesk tab, select **Sign in** and enter the reviewer email and password.
2. If a **New in SignalDesk** card appears on the Command Center, select **Got it** to close it. Close anything else that pops up.

**Say:** "This is SignalDesk, a social media scheduling tool. I'm signing in with the test account provided for review."

### 2. Connect the Page and Instagram account (about 1 minute)
*Shows `pages_show_list`, `business_management`, `instagram_basic`.*

3. In the sidebar, select **Social Accounts**. ⏱ **connect**
4. In the client menu at the top, choose **App Review Demo**.
5. On the **Facebook** card, select **Connect**.
6. In Facebook's window, **hold still for 3 seconds on the screen that lists the permissions**. This is the moment reviewers look for. If there's an **Edit access** or **Choose what you allow** option, open it so the list is visible.
7. Choose the Page. If Facebook asks about a Business portfolio, show choosing the business that owns the Page. ⏱ **business**
8. Choose the Instagram account linked to the Page.
9. Select **Save** or **Continue**, then **Got it**, until you're back in SignalDesk.
10. Point the mouse at the Facebook and Instagram cards, which now show the Page name, the Instagram username and their pictures. ⏱ **connected**

**Say:** "SignalDesk lists the Pages I manage so I can pick this client's Page, including Pages owned by a business portfolio. It then shows the connected Instagram account's username and picture, so I know I connected the right one."

### 3. Write and publish a post (about 1½ minutes, plus the wait)
*Shows `pages_manage_posts`, `instagram_content_publish`, `pages_manage_engagement`, `instagram_manage_comments`, `instagram_basic`.*

11. In the sidebar, select **Publishing Studio**. ⏱ **publish**
12. Choose **App Review Demo**, then tick **Facebook** and **Instagram**.
13. Type a short caption, for example: *"Testing SignalDesk's scheduling for our clients."*
14. Attach the image from your desktop.
15. Open **More options → Comments**. In **First comment**, type: *"Thanks for stopping by!"*
16. Open **More options → Collaborators & tags**. Type the business username and wait until its name and picture appear as confirmed. **Then remove it**, so you don't send that account a real collaborator invite. ⏱ **lookup**
17. Next to **Save draft**, open **More** and choose **Post now**. Confirm if asked.
18. Wait about a minute. You can cut this out later. Open the post on the **Content Calendar** and show **Published** with a **View** link for each network.
19. Go to the **Facebook tab**, refresh, and show the post with the first comment under it. ⏱ **on-facebook**
20. Go to the **Instagram tab**, refresh, open the post, and show the first comment. ⏱ **on-instagram**

**Say:** "At the time chosen, which here is now, SignalDesk publishes the post to the Page and to Instagram, then posts the first comment the team wrote. The username lookup confirms an Instagram business account before tagging it."

### 4. Read and reply to comments (about 1 minute)
*Shows `pages_read_user_content`, `pages_manage_engagement`, `instagram_manage_comments`.*

21. **Pause the recording** (stop it and start a new clip). From your second Facebook account, comment on the new Facebook post. From your second Instagram account, comment on the new Instagram post. Then resume.
22. In SignalDesk, select **Social Inbox**. If there are client tabs at the top, choose **App Review Demo**. Scroll past **Messages** to **Comments on your posts**. ⏱ **inbox**
23. Choose the Facebook post. Show the comment with the commenter's name, type a reply, and send it.
24. Choose the Instagram post and do the same.
25. Go to the **Facebook tab**, refresh, and show your reply under the comment. Do the same on the **Instagram tab**. ⏱ **replies**

**Say:** "Comments people leave on posts SignalDesk published show up here with their name, so the team can answer them in one place. The replies appear on Facebook and Instagram."

### 5. Answer direct messages (about 1½ minutes)
*Shows `pages_messaging`, `instagram_manage_messages`, `pages_manage_metadata`.*

26. **Pause the recording.** From your second Facebook account, send the Page a Messenger message, for example *"Hi! Are you open on Sunday?"* From your second Instagram account, send the Instagram account a direct message. Then resume.
27. In SignalDesk, scroll back up to **Messages** (still on the **App Review Demo** tab, in the **Inbox** folder). Select **Check again**. Point at the two conversations: each shows who wrote, the network and how long is left to reply. ⏱ **messages**
28. Open the Facebook conversation, type a reply, for example *"Hi! Yes, 9 to 3 on Sundays."*, and select **Send**.
29. Open the Instagram conversation and do the same. *If Meta refuses the reply* (the second Instagram account couldn't get a role, see the prep list), keep recording: show the message arriving in SignalDesk and the reply being typed and sent, and let the error show. Then say aloud, or add a caption: "Before approval, Meta only allows replies to people with a role on the app. The Facebook reply above shows the same flow working." The review notes explain this too.
30. Go to Messenger and Instagram (on your phone or in the browser tabs) as the second accounts, and show the replies arriving. ⏱ **message-replies**

**Say:** "Messages people send the client's Page and Instagram account show up here too, so the team answers customers in one place. A person writes every reply, and SignalDesk only replies within Meta's 24-hour window."

### 6. Results (about 1 minute)
*Shows `pages_read_engagement`, `read_insights`, `instagram_manage_insights`, `instagram_basic`.*

31. In the sidebar, select **Analytics & Reports**. On the **Overview** tab, point at the Facebook and Instagram numbers: reach, views and engagement. ⏱ **analytics**
32. Select the **Reports** tab at the top of Analytics and scroll to **Weekly Top Posts**. Open the older post from Part A to show its reactions, comments, shares, reach and views.
33. In the sidebar, select **Content Calendar** and open the post you made directly on Facebook or Instagram. ⏱ **outside-posts**

**Say:** "SignalDesk shows each post's reach and engagement for the client's reports. That includes posts made directly on Facebook or Instagram, like this one, so the calendar and reports cover the whole account. New posts fill in after a few hours, which is why I'm showing an older one."

### 7. Removing access (about 15 seconds)
34. Go back to **Social Accounts**. On the Facebook card, select **Disconnect** and confirm. ⏱ **disconnect**

**Say:** "Anyone can disconnect at any time, and SignalDesk deletes the stored access."

Stop recording.

---

## Part C: after recording

- **Trim** the waits and join the clips. In iMovie, use File → New Movie, drag the clips in, then **File → Share → File** at 1080p.
- **Watch it once without sound.** Each permission's result should be visible on screen, not only described in the narration.
- **Reconnect your real accounts.** The disconnect in step 34 only affected App Review Demo. Removing the app in Part A step 2 may also have logged out your other clients' Facebook connections, so check Social Accounts for each client and reconnect any that need it.
- **Remove the tester role** from your second Facebook account if you don't want to keep it.
- **Delete the demo post** from the Page and Instagram if you don't want it kept.

## Part D: notes to paste next to each permission

Fill in the times you noted at each ⏱ marker:

| Permission | Note to paste |
|---|---|
| `pages_show_list` | Shown at [connect]: the list of Pages to choose from after Facebook Login. |
| `business_management` | Shown at [business]: choosing a business-owned Page during Facebook Login for Business. |
| `instagram_basic` | Shown at [connected]: the connected Instagram username and picture. Also at [lookup] (a business account confirmed before tagging) and [outside-posts] (posts made on Instagram appear on the calendar). |
| `pages_manage_posts` | Shown at [publish] through [on-facebook]: the post is written in SignalDesk and appears on the Page. |
| `instagram_content_publish` | Shown at [publish] through [on-instagram]: the post is written in SignalDesk and appears on Instagram. |
| `pages_manage_engagement` | Shown at [on-facebook]: the first comment posted under the Facebook post. Also at [replies]: a reply sent from SignalDesk appears on Facebook. |
| `instagram_manage_comments` | Shown at [on-instagram]: the first comment on the Instagram post. Also at [inbox] through [replies]: reading and replying to a comment. |
| `pages_read_user_content` | Shown at [inbox]: another person's comment on the Page's post appears in SignalDesk with their name. |
| `pages_read_engagement` | Shown at [analytics]: the post's reactions, comments and shares. Also at [outside-posts]: posts made directly on Facebook appear on the calendar. |
| `read_insights` | Shown at [analytics]: reach and views for the Page's posts. |
| `instagram_manage_insights` | Shown at [analytics]: reach, views, likes, comments and saves for Instagram posts. |
| `pages_messaging` | Shown at [messages]: a Messenger conversation with the Page, read in SignalDesk. At [message-replies]: the reply written in SignalDesk arrives in Messenger. |
| `instagram_manage_messages` | Shown at [messages]: an Instagram direct message, read in SignalDesk. At [message-replies]: the reply arrives in Instagram. |
| `pages_manage_metadata` | Shown at [messages]: the Page's and Instagram account's conversations listed in SignalDesk's Social Inbox. If Meta shows no notes box for this permission, skip it; the `pages_messaging` notes cover it. |

The written answers for each permission are in [app-review.md](app-review.md) under **Permission answers**. Paste those as well; the notes above only point to the video.

**Threads:** if the Threads use case is part of the same request, record one more short clip:
1. On the **Threads** card in Social Accounts, select **Connect**.
2. Publish a text post to Threads with **Post now**, and show it on threads.net (`threads_content_publish`).
3. A few hours later, show its views and likes in Analytics (`threads_manage_insights`).
