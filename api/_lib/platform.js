const crypto = require('node:crypto');
const { databaseRequest, httpError } = require('./core');
const { emailConfigured, sendEmail, renderEmail, appUrl } = require('./notify');

// Running SignalDesk as an invite-only beta: platform owners (PLATFORM_ADMIN_EMAILS) create invite
// codes, choose whether sign-ups are open, and see server errors from every workspace.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ERROR_WINDOW_MS = 60 * 60000;

function platformAdmins() {
  return (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function isPlatformAdmin(email) {
  return Boolean(email) && platformAdmins().includes(String(email).toLowerCase());
}

function newInviteCode() {
  return Array.from(crypto.randomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function inviteLink(code) {
  const base = appUrl().replace(/\/+$/, '');
  return base ? `${base}/?invite=${code}` : '';
}

async function inviteOnly() {
  const rows = await databaseRequest('app_settings?key=eq.invite_only&select=value').catch(() => null);
  return rows?.[0]?.value !== false;
}

async function setInviteOnly(value) {
  await databaseRequest('app_settings?on_conflict=key', {
    method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'invite_only', value: Boolean(value), updated_at: new Date().toISOString() })
  });
  return Boolean(value);
}

async function listInvites() {
  const [invites, redemptions] = await Promise.all([
    databaseRequest('beta_invites?select=code,label,max_uses,uses,sent_to,expires_at,revoked_at,created_at&order=created_at.desc&limit=200'),
    databaseRequest('beta_redemptions?select=code,email,redeemed_at&order=redeemed_at.desc&limit=500')
  ]);
  const byCode = {};
  for (const row of redemptions || []) (byCode[row.code] ||= []).push({ email: row.email, at: row.redeemed_at });
  const now = Date.now();
  return (invites || []).map((invite) => ({
    code: invite.code, label: invite.label || '', maxUses: invite.max_uses, uses: invite.uses, sentTo: invite.sent_to || '',
    expiresAt: invite.expires_at, createdAt: invite.created_at, link: inviteLink(invite.code), redeemedBy: byCode[invite.code] || [],
    status: invite.revoked_at ? 'revoked' : invite.expires_at && Date.parse(invite.expires_at) < now ? 'expired' : invite.uses >= invite.max_uses ? 'used' : 'active'
  }));
}

async function createInvite({ label, maxUses, days, email, createdBy }) {
  const uses = Math.min(100, Math.max(1, parseInt(maxUses, 10) || 1));
  const life = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
  const sendTo = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : '';
  if (sendTo && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendTo) || sendTo.length > 320)) throw httpError(400, 'Enter a valid email address to send the invite to.');
  let code;
  for (let attempt = 0; attempt < 3 && !code; attempt += 1) {
    const candidate = newInviteCode();
    try {
      await databaseRequest('beta_invites', {
        method: 'POST', headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ code: candidate, label: typeof label === 'string' ? label.trim().slice(0, 80) || null : null, max_uses: uses, created_by_email: createdBy || null, sent_to: sendTo || null, expires_at: new Date(Date.now() + life * 86400000).toISOString() })
      });
      code = candidate;
    } catch (error) {
      if (error.status !== 409) throw error;
    }
  }
  if (!code) throw new Error('Could not create an invite code.');
  let emailed = false;
  if (sendTo && emailConfigured()) {
    const content = renderEmail({
      eyebrow: 'SIGNALDESK', heading: 'You’re invited to SignalDesk',
      intro: `${createdBy || 'The SignalDesk team'} invited you to try SignalDesk, a calm place to plan, approve, and publish social media for your clients.`,
      sections: [{ title: 'Your invite code', items: [{ title: code, body: 'Use the button below, or enter this code when you create your account.', meta: `Works until ${new Date(Date.now() + life * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` }] }],
      ctaLabel: 'Create your account', ctaUrl: inviteLink(code), footer: 'If you weren’t expecting this, you can ignore it.'
    });
    emailed = await sendEmail(sendTo, 'You’re invited to SignalDesk', content).catch(() => false);
  }
  return { code, link: inviteLink(code), emailed, emailConfigured: emailConfigured() };
}

async function revokeInvite(code) {
  if (typeof code !== 'string' || !/^[A-Z0-9]{6,20}$/.test(code)) throw httpError(400, 'Choose an invite code.');
  await databaseRequest(`beta_invites?code=eq.${code}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
  return { revoked: true };
}

// Records a server error. The same message from the same place within an hour adds to its count.
async function recordAppError(source, error, workspaceId = null) {
  try {
    const message = String(error?.message || error || 'Unknown error').slice(0, 500);
    const since = new Date(Date.now() - ERROR_WINDOW_MS).toISOString();
    const existing = await databaseRequest(`app_errors?source=eq.${encodeURIComponent(source)}&message=eq.${encodeURIComponent(message)}&last_seen=gte.${since}&select=id,count&limit=1`);
    if (existing?.[0]) {
      await databaseRequest(`app_errors?id=eq.${existing[0].id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ count: existing[0].count + 1, last_seen: new Date().toISOString() }) });
    } else {
      await databaseRequest('app_errors', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ source, message, workspace_id: workspaceId }) });
    }
  } catch (failure) {
    console.error('Could not record error:', failure.message);
  }
}

async function recentErrors(hours = 24) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  return (await databaseRequest(`app_errors?last_seen=gte.${since}&select=source,message,count,first_seen,last_seen&order=last_seen.desc&limit=50`).catch(() => [])) || [];
}

// Emails platform owners about new server errors and widespread publishing failures, at most every 6 hours.
async function alertPlatformAdmins({ lastAlert } = {}) {
  const admins = platformAdmins();
  if (!admins.length || !emailConfigured()) return { sent: 0, reason: !admins.length ? 'no platform admins' : 'email not configured' };
  if (lastAlert && Date.now() - Date.parse(lastAlert) < 6 * 3600000) return { sent: 0, reason: 'recently alerted' };
  const errors = (await databaseRequest('app_errors?alerted_at=is.null&select=id,source,message,count,last_seen&order=last_seen.desc&limit=20').catch(() => [])) || [];
  const since = new Date(Date.now() - 6 * 3600000).toISOString();
  const failed = (await databaseRequest(`publish_jobs?status=in.(failed,unknown)&updated_at=gte.${since}&select=workspace_id,platform,last_error&limit=200`).catch(() => [])) || [];
  const failedWorkspaces = new Set(failed.map((job) => job.workspace_id)).size;
  if (!errors.length && failed.length < 5) return { sent: 0, reason: 'nothing to report' };
  const content = renderEmail({
    eyebrow: 'SIGNALDESK · PLATFORM', heading: 'Something needs a look',
    intro: `${errors.length} new server error${errors.length === 1 ? '' : 's'}${failed.length ? ` and ${failed.length} failed post${failed.length === 1 ? '' : 's'} across ${failedWorkspaces} workspace${failedWorkspaces === 1 ? '' : 's'}` : ''} in the last few hours.`,
    sections: [
      ...(errors.length ? [{ title: 'Server errors', items: errors.map((row) => ({ title: row.source, body: row.message, meta: `${row.count}× · last ${new Date(row.last_seen).toUTCString()}` })) }] : []),
      ...(failed.length ? [{ title: 'Failed posts', items: Object.entries(failed.reduce((sum, job) => ({ ...sum, [`${job.platform}: ${job.last_error || 'failed'}`.slice(0, 160)]: (sum[`${job.platform}: ${job.last_error || 'failed'}`.slice(0, 160)] || 0) + 1 }), {})).slice(0, 8).map(([title, count]) => ({ title, meta: `${count}×` })) }] : [])
    ],
    ctaLabel: 'Open Setup & health', footer: 'You get this because your email is in PLATFORM_ADMIN_EMAILS.'
  });
  let sent = 0;
  for (const admin of admins) if (await sendEmail(admin, 'SignalDesk: something needs a look', content).catch(() => false)) sent += 1;
  if (errors.length) await databaseRequest(`app_errors?id=in.(${errors.map((row) => row.id).join(',')})`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ alerted_at: new Date().toISOString() }) }).catch(() => {});
  return { sent, errors: errors.length, failed: failed.length };
}

module.exports = { isPlatformAdmin, platformAdmins, inviteOnly, setInviteOnly, listInvites, createInvite, revokeInvite, recordAppError, recentErrors, alertPlatformAdmins, inviteLink };
