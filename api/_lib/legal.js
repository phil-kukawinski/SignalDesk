// Public legal pages: privacy policy, terms of service, and data deletion instructions.
// Meta, LinkedIn, and Pinterest ask for these URLs when reviewing an app. The operator's
// name and contact email come from LEGAL_OPERATOR_NAME and LEGAL_CONTACT_EMAIL, and the
// list of outside services reflects which ones this deployment actually has turned on.

const EFFECTIVE_DATE = 'October 17, 2026';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function settings() {
  const email = (process.env.LEGAL_CONTACT_EMAIL || '').trim();
  return {
    operator: (process.env.LEGAL_OPERATOR_NAME || '').trim() || 'the operator of SignalDesk',
    operatorName: (process.env.LEGAL_OPERATOR_NAME || '').trim() || 'SignalDesk',
    email,
    contact: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)
      ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
      : '<b>the contact email for this site (not set up yet)</b>',
    governingLaw: (process.env.LEGAL_GOVERNING_LAW || '').trim()
  };
}

// Outside services that may receive data, limited to the ones configured on this server.
function serviceProviders() {
  const list = [
    ['Supabase', 'database, sign-in, and file storage for uploaded images and videos'],
    ['Vercel', 'hosting the app and running scheduled publishing jobs'],
    ['jsDelivr and Google Fonts', 'delivering the sign-in library and fonts to your browser, which shares your IP address with them']
  ];
  if (process.env.RESEND_API_KEY) list.push(['Resend', 'sending notification, digest, and report emails']);
  if (process.env.ANTHROPIC_API_KEY) list.push(['Anthropic', 'AI features you choose to use, such as caption drafts, image descriptions, proofreading, and trend summaries. Only the text, images, and brand notes needed for that request are sent']);
  if (process.env.VAPID_PUBLIC_KEY) list.push(['Your browser’s push service (for example Apple, Google, or Mozilla)', 'delivering push notifications to devices where you turned them on']);
  if (process.env.UNSPLASH_ACCESS_KEY) list.push(['Unsplash', 'stock photo search in the Publishing Studio. Your search words are sent to Unsplash, and photos load from Unsplash’s servers, which shares your IP address with them']);
  if (process.env.AYRSHARE_API_KEY) list.push(['Ayrshare', 'publishing to networks that SignalDesk doesn’t connect to directly, when you link them through Ayrshare']);
  return list;
}

function layout({ title, active, body }) {
  const nav = [['privacy', 'Privacy'], ['terms', 'Terms'], ['data-deletion', 'Data deletion']]
    .map(([slug, label]) => `<a href="/${slug}"${slug === active ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)} · SignalDesk</title>
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<style>
:root{--ink:#1a1f3a;--muted:#5d6475;--line:#e6e1dc;--bg:#fdf9f5;--card:#fff;--accent:#3f73a3;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--ink:#ededed;--muted:#a3a3a3;--line:#2e2e2e;--bg:#000;--card:#141414;--accent:#8db8e0;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{border-bottom:1px solid var(--line);background:var(--card)}
.bar{max-width:820px;margin:0 auto;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.brand{font-weight:800;color:var(--ink);text-decoration:none;letter-spacing:-.3px}
nav{display:flex;gap:16px;flex-wrap:wrap;font-size:14px}
nav a{color:var(--muted);text-decoration:none}nav a[aria-current]{color:var(--ink);font-weight:700}
main{max-width:820px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:32px;line-height:1.2;margin:0 0 6px;letter-spacing:-.5px}
.updated{color:var(--muted);margin:0 0 28px;font-size:14px}
h2{font-size:20px;margin:36px 0 8px}
h3{font-size:16px;margin:22px 0 4px}
p,li{overflow-wrap:anywhere}
ul,ol{padding-left:22px}li{margin:4px 0}
a{color:var(--accent)}
.summary,.status{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 20px;margin:0 0 8px}
.status{border-left:4px solid var(--accent)}
footer{max-width:820px;margin:0 auto;padding:0 20px 40px;color:var(--muted);font-size:13px}
</style>
</head>
<body>
<header><div class="bar"><a class="brand" href="/">SignalDesk</a><nav aria-label="Legal">${nav}</nav></div></header>
<main>${body}</main>
<footer>SignalDesk is not affiliated with or endorsed by Meta, Instagram, LinkedIn, or Pinterest.</footer>
</body>
</html>`;
}

function privacyPage() {
  const s = settings();
  const providers = serviceProviders().map(([name, use]) => `<li><b>${escapeHtml(name)}</b>: ${escapeHtml(use)}.</li>`).join('');
  return layout({
    title: 'Privacy Policy', active: 'privacy', body: `
<h1>Privacy Policy</h1>
<p class="updated">Effective ${EFFECTIVE_DATE}</p>
<div class="summary"><p><b>The short version:</b> SignalDesk uses your information only to schedule, publish, and report on your social media posts. It doesn’t sell your data, show ads, or use tracking or advertising cookies. You can disconnect accounts, export your data, or ask for everything to be deleted at any time.</p></div>

<h2>Who we are</h2>
<p>SignalDesk is a social media planning and publishing tool run by ${escapeHtml(s.operator)} (“we” or “us”). If you have questions about this policy or your data, email ${s.contact}.</p>

<h2>What we collect</h2>
<h3>Your account</h3>
<p>Your email address and, if you add it, your name. Your password is handled by our sign-in provider and stored only in hashed form; we never see it.</p>
<h3>What you put into SignalDesk</h3>
<p>Clients, posts and captions, images and videos you upload, image descriptions, notes, templates, brand kits, campaigns, goals, link-in-bio pages, and settings. Team members you invite to your workspace can see this content.</p>
<h3>Social accounts you connect</h3>
<p>When you connect Facebook, Instagram, LinkedIn, or Pinterest, you sign in on that network’s own page and choose what to allow. We never see your password for those networks. We receive:</p>
<ul>
<li>An access token that lets SignalDesk act on your behalf. It is encrypted (AES-256-GCM) before it is stored.</li>
<li>Basic details about the accounts you can manage, such as the account or Page ID, name, username, profile picture, and profile link, and for Pinterest, your board names.</li>
<li>For Facebook and Instagram, your app-specific Facebook user ID, so we can delete your connections if you remove SignalDesk from your Facebook settings.</li>
</ul>
<h3>Information from the networks about your posts</h3>
<p>If you turn on click counting, links in your posts are replaced with short SignalDesk links. When someone opens one, we add one to that link’s click count for the day and send them on. We don’t store who clicked, their IP address, or any cookie.</p>
<p>For posts published through SignalDesk, we store the post’s ID and link, and we read performance numbers such as reach, impressions, likes, comments, shares, saves, and clicks. If you use the comment inbox, we read the comments on those posts, including the commenter’s name or username as the network provides it, and send the replies you write.</p>
<h3>Client reviewers</h3>
<p>If you share a review link, the person reviewing can enter their name, approve posts, and leave comments. We store what they enter.</p>
<h3>Notifications</h3>
<p>The email addresses you choose for notifications and reports and, if you turn on push notifications, a device address from your browser’s push service.</p>
<h3>Technical information</h3>
<p>Our hosting provider keeps standard server logs (such as IP address, browser type, and time of request) for security and troubleshooting. Your browser stores your sign-in session and a few preferences, such as theme and calendar settings. We don’t use analytics, advertising, or tracking cookies.</p>

<h2>How we use it</h2>
<ul>
<li>To publish your posts to the networks you chose, at the time you chose.</li>
<li>To show your calendar, approvals, post history, analytics, and client reports.</li>
<li>To read and reply to comments when you ask.</li>
<li>To send the notifications, digests, and reports you turned on.</li>
<li>To run AI features when you use them, such as drafting captions or describing an image.</li>
<li>To keep the service secure, fix problems, and prevent abuse.</li>
</ul>
<p>We don’t sell your information, use it for advertising, or build profiles of you or the people who interact with your posts. Data from Meta, LinkedIn, and Pinterest is used only to provide the features you use in SignalDesk, following each network’s developer terms, and is never used to train AI models.</p>

<h2>Who we share it with</h2>
<p>We share information only as needed to run SignalDesk:</p>
<ul>
<li><b>The social networks you publish to.</b> Posts you publish become public or visible on those networks according to your settings there.</li>
${providers}
<li><b>People you choose to share with:</b> your workspace team, anyone you send a review or calendar link to, and visitors to a link-in-bio page you publish.</li>
<li><b>When the law requires it</b>, or to protect the rights, safety, or property of our users or others.</li>
</ul>
<p>These providers may only use your information to provide their service to us.</p>

<h2>How long we keep it</h2>
<ul>
<li>Your account and workspace content: until you delete them or ask us to.</li>
<li>Access tokens: deleted right away when you disconnect an account, or when you remove SignalDesk from your Facebook settings.</li>
<li>Uploaded files that no post or draft uses anymore: deleted automatically after 30 days.</li>
<li>Sign-in attempts with a network: expire after 15 minutes.</li>
<li>Deletion requests: completed within 30 days. Copies in our database provider’s backups are removed when those backups expire.</li>
</ul>
<p>Deleting something from SignalDesk doesn’t remove posts already published on a social network. Delete those on the network itself.</p>

<h2>How we protect it</h2>
<p>All connections use HTTPS. Access tokens are encrypted at rest, review and calendar links are stored only as hashes, and database access is limited to your own workspace. No system is perfectly secure, but we work to protect your information and will tell you promptly if a breach affects it.</p>

<h2>Your choices and rights</h2>
<ul>
<li><b>Disconnect</b> any social account in SignalDesk under Clients &amp; Accounts, or remove SignalDesk’s access in that network’s settings.</li>
<li><b>Export</b> your workspace and posts from Settings.</li>
<li><b>Change or stop</b> notification emails and push notifications from the notification settings.</li>
<li><b>Access, correct, or delete</b> your information. See <a href="/data-deletion">Data deletion</a> or email ${s.contact}.</li>
</ul>
<p>Depending on where you live (for example in the EU, UK, or California), you may have additional rights, such as to object to or restrict processing, or to complain to your local data protection authority. We will respond to requests within 30 days and won’t treat you differently for making one.</p>

<h2>Children</h2>
<p>SignalDesk is not meant for children under 13, and we don’t knowingly collect their information.</p>

<h2>Changes to this policy</h2>
<p>If we change this policy, we’ll update the date at the top and, for important changes, let you know in the app or by email.</p>

<h2>Contact</h2>
<p>${escapeHtml(s.operatorName)} · ${s.contact}</p>`
  });
}

function termsPage() {
  const s = settings();
  return layout({
    title: 'Terms of Service', active: 'terms', body: `
<h1>Terms of Service</h1>
<p class="updated">Effective ${EFFECTIVE_DATE}</p>
<p>These terms are an agreement between you and ${escapeHtml(s.operator)} (“we” or “us”) for your use of SignalDesk. By creating an account or using SignalDesk, you agree to them. If you use SignalDesk for a business, you agree on behalf of that business.</p>

<h2>The service</h2>
<p>SignalDesk helps you plan, approve, schedule, and publish social media posts, and report on how they perform. SignalDesk is free to use right now. If we ever introduce paid plans, we’ll tell you in advance, and nothing you use will start costing money without your agreement.</p>

<h2>Your account</h2>
<p>Give accurate information, keep your password safe, and tell us if you think someone else has used your account. You’re responsible for what happens in your workspace, including what team members you invite do there.</p>

<h2>Your content</h2>
<p>You own the content you put into SignalDesk. You give us permission to store, copy, resize, and send it only as needed to run the service for you, for example to publish a post to the networks you chose. You confirm that you have the rights to everything you publish and that it follows the law and each network’s rules.</p>

<h2>Connected networks</h2>
<p>When you connect Facebook, Instagram, LinkedIn, Pinterest, or another network, your use of that network is also governed by its own terms and policies. SignalDesk is not affiliated with or endorsed by those companies. They can change or limit their services at any time, which may cause scheduled posts or features to fail. SignalDesk tries again and tells you when a post doesn’t go out, but please check posts that matter.</p>

<h2>Acceptable use</h2>
<p>Don’t use SignalDesk to:</p>
<ul>
<li>post spam, or content that is illegal, harmful, harassing, deceptive, or infringes someone else’s rights;</li>
<li>impersonate a person or organization, or manage accounts you aren’t authorized to manage;</li>
<li>get around a network’s limits or rules, or collect other people’s data;</li>
<li>break, overload, probe, or reverse-engineer SignalDesk, or access other people’s workspaces.</li>
</ul>
<p>We may remove content or suspend accounts that break these rules.</p>

<h2>AI features</h2>
<p>AI caption drafts, image descriptions, proofreading, and trend summaries can be wrong or incomplete. Review them before publishing; you’re responsible for what you post.</p>

<h2>Availability and changes</h2>
<p>We may change, add, or remove features. We aim to keep SignalDesk running reliably but can’t promise it will always be available or error-free.</p>

<h2>Ending your use</h2>
<p>You can stop using SignalDesk at any time and ask us to delete your data (see <a href="/data-deletion">Data deletion</a>). We may suspend or end access if you break these terms or to protect the service or others. When we can, we’ll give you notice and a chance to export your data.</p>

<h2>Disclaimers</h2>
<p>SignalDesk is provided “as is” and “as available,” without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement, to the extent the law allows.</p>

<h2>Limitation of liability</h2>
<p>To the extent the law allows, we aren’t liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, data, or goodwill, including from posts that fail, are delayed, or are published incorrectly. Our total liability for any claim relating to SignalDesk is limited to the greater of the amount you paid us in the 12 months before the claim and US $50.</p>

<h2>Indemnity</h2>
<p>If a claim is brought against us because of your content or your breaking these terms, you agree to cover the reasonable costs and losses that result, to the extent the law allows.</p>
${s.governingLaw ? `
<h2>Governing law</h2>
<p>These terms are governed by the laws of ${escapeHtml(s.governingLaw)}, without regard to its conflict-of-law rules.</p>` : ''}

<h2>Changes to these terms</h2>
<p>If we change these terms, we’ll update the date at the top and, for important changes, let you know in the app or by email before they take effect. Continuing to use SignalDesk after that means you accept the new terms.</p>

<h2>Contact</h2>
<p>Questions about these terms? Email ${s.contact}.</p>`
  });
}

const STATUS_TEXT = {
  received: 'We received this request and are working on it. It will be finished within 30 days.',
  completed: 'Done. The Facebook and Instagram connections and access tokens linked to your Facebook account have been deleted from SignalDesk.'
};

function deletionPage(request) {
  const s = settings();
  const status = request === undefined ? '' : request
    ? `<div class="status" role="status"><p><b>Request ${escapeHtml(request.code)}</b> · received ${escapeHtml(new Date(request.requested_at).toUTCString())}</p><p>${STATUS_TEXT[request.status] || STATUS_TEXT.received}${request.status === 'completed' && request.connections_removed === 0 ? ' No connections were stored for your account.' : ''}</p></div>`
    : '<div class="status" role="status"><p>We couldn’t find a deletion request with that confirmation code. Check the link, or email us using the address below.</p></div>';
  return layout({
    title: 'Data Deletion', active: 'data-deletion', body: `
<h1>Data Deletion</h1>
<p class="updated">How to remove your information from SignalDesk</p>
${status}
<h2>Disconnect a social account</h2>
<p>In SignalDesk, open <b>Clients &amp; Accounts</b>, choose the client, and select <b>Disconnect</b> next to the account. The access token and account details are deleted immediately, and SignalDesk can no longer post to or read from that account.</p>

<h2>Remove SignalDesk from Facebook or Instagram</h2>
<ol>
<li>On Facebook, go to <b>Settings &amp; privacy → Settings → Business integrations</b> (on some accounts this is called <b>Apps and websites</b>).</li>
<li>Find SignalDesk, select <b>Remove</b>, and choose to delete the data it has.</li>
</ol>
<p>Facebook tells us automatically, and we delete the Facebook and Instagram connections and access tokens linked to your account. Facebook gives you a confirmation code you can use to check the status of your request on this page.</p>

<h2>Remove SignalDesk from LinkedIn or Pinterest</h2>
<ul>
<li><b>LinkedIn:</b> go to <b>Settings → Data privacy → Permitted services</b> and remove SignalDesk.</li>
<li><b>Pinterest:</b> go to your <b>Settings</b>, open the list of connected apps, and revoke SignalDesk’s access.</li>
</ul>
<p>SignalDesk can’t use the access immediately after you revoke it. To also delete the stored connection details, disconnect the account in SignalDesk or email us.</p>

<h2>Delete everything</h2>
<p>To delete your SignalDesk account and all its data, including your workspace, posts, uploaded files, connections, and notification settings, email ${s.contact} from the address you signed up with, with the subject <b>“Delete my data.”</b> We’ll confirm, then finish within 30 days. If you’d like a copy first, export it from <b>Settings</b>.</p>
<p>Posts already published on a social network stay there until you delete them on that network.</p>`
  });
}

module.exports = { privacyPage, termsPage, deletionPage, escapeHtml };
