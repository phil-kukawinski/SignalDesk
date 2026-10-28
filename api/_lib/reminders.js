// Nudges for client reviews: when posts waiting for approval have sat unanswered on a client's review
// link for 2 days, admins are told in SignalDesk and (if the client's brand kit allows it) the client
// gets a short email with their link. At most once every 2 days per link.
const { databaseRequest, getWorkspaceState, decryptSecret } = require('./core');
const { notify, sendEmail, renderEmail, appUrl, emailConfigured, reportEmails } = require('./notify');
const { lastWorkerRun, recordWorkerRun } = require('./publishing');

const WAIT_MS = 2 * 86400000;

async function processReviewReminders({ encryptionKey, now = Date.now(), limit = 10 } = {}) {
  const links = await databaseRequest(`review_links?revoked_at=is.null&expires_at=gt.${new Date(now).toISOString()}&select=id,workspace_id,client_id,label,token_ciphertext,created_at&order=created_at.desc&limit=200`) || [];
  const bucket = Math.floor(now / WAIT_MS);
  const states = new Map();
  let reminded = 0, emailed = 0;
  for (const link of links) {
    if (reminded >= limit) break;
    const runName = `review-reminder:${link.id}:${bucket}`;
    if (await lastWorkerRun(runName)) continue;
    const before = new Date(now - WAIT_MS).toISOString();
    // Posts this link has shown for at least 2 days, still waiting, not yet answered, and not yet due.
    const since = Date.parse(link.created_at) > now - WAIT_MS ? null : before;
    if (!since) continue;
    const posts = await databaseRequest(`scheduled_posts?workspace_id=eq.${link.workspace_id}&client_id=eq.${encodeURIComponent(link.client_id)}&status=eq.pending_approval&client_status=is.null&created_at=lte.${since}&scheduled_for=gt.${new Date(now).toISOString()}&scheduled_for=lte.${new Date(now + 60 * 86400000).toISOString()}&select=id,title,scheduled_for&order=scheduled_for.asc&limit=20`) || [];
    if (!posts.length) continue;
    if (!states.has(link.workspace_id)) states.set(link.workspace_id, await getWorkspaceState(link.workspace_id));
    const state = states.get(link.workspace_id);
    const client = (state.clients || []).find((item) => item.id === link.client_id);
    const name = client?.name || 'A client';
    const who = link.label ? `${link.label} (${name})` : name;
    const first = posts[0];
    await notify({
      workspaceId: link.workspace_id, audience: 'admins', type: 'review_overdue', category: 'approvals',
      title: `${who} hasn’t reviewed ${posts.length} post${posts.length === 1 ? '' : 's'}`,
      body: `Waiting at least 2 days. The next one, “${first.title || 'Untitled post'}”, is set for ${new Date(first.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
      view: 'approvals', data: { clientId: link.client_id, linkId: link.id }
    });
    const emails = client?.reports?.reviewReminders === true ? reportEmails(client.reports.emails) : [];
    let token = null;
    if (emails.length && link.token_ciphertext) { try { token = decryptSecret(link.token_ciphertext, encryptionKey); } catch { token = null; } }
    if (token && emails.length && emailConfigured() && appUrl()) {
      const agency = state.settings?.name || 'Your social media team';
      const content = renderEmail({
        eyebrow: agency.toUpperCase(),
        heading: `${posts.length} post${posts.length === 1 ? '' : 's'} waiting for your review`,
        intro: `${agency} is waiting on your OK for ${posts.length === 1 ? 'a post' : 'these posts'} before ${posts.length === 1 ? 'it goes' : 'they go'} out.`,
        sections: [{ title: 'Waiting for you', items: posts.slice(0, 8).map((post) => ({ title: post.title || 'Untitled post', meta: `Set for ${new Date(post.scheduled_for).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` })) }],
        ctaLabel: 'Review the posts', ctaUrl: `${appUrl()}/review.html#t=${token}`,
        footer: 'You can approve each post or ask for changes. No account needed.'
      });
      for (const email of emails) {
        await sendEmail(email, `Waiting for your review: ${posts.length} post${posts.length === 1 ? '' : 's'}`, content).then(() => { emailed += 1; }).catch((error) => console.error('Review reminder email failed:', error.message));
      }
    }
    await recordWorkerRun(runName, { posts: posts.length, emailed: emails.length && token ? emails.length : 0 });
    reminded += 1;
  }
  return { reminded, emailed };
}

module.exports = { processReviewReminders };
