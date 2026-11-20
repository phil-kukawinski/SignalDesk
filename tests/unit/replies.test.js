// Approving by email reply: the webhook signature check, reading just the reply above the quoted email,
// and telling APPROVE from CHANGES.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const crypto = require('node:crypto');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const { verifySignature, replyText, replyDecision } = require(ROOT + '/api/_lib/replies.js');

const secretBytes = crypto.randomBytes(24), secret = 'whsec_' + secretBytes.toString('base64');
const body = JSON.stringify({ type: 'email.received', data: { email_id: 'e1' } }), now = Date.now(), ts = String(Math.floor(now / 1000));
const sign = (raw, id = 'msg_1', t = ts) => 'v1,' + crypto.createHmac('sha256', secretBytes).update(`${id}.${t}.${raw}`).digest('base64');
const headers = { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': `v1,bm90aGlz ${sign(body)}` };
assert.strictEqual(verifySignature(body, headers, secret, now), true, 'a good signature (among several) passes');
assert.strictEqual(verifySignature(body + ' ', headers, secret, now), false, 'a changed body fails');
assert.strictEqual(verifySignature(body, headers, 'whsec_' + crypto.randomBytes(24).toString('base64'), now), false, 'the wrong secret fails');
assert.strictEqual(verifySignature(body, headers, secret, now + 10 * 60000), false, 'old messages fail');
assert.strictEqual(verifySignature(body, { ...headers, 'svix-signature': '' }, secret, now), false);

assert.strictEqual(replyText('Approve!\n\nOn Tue, Nov 24, 2026 at 9:00 AM PK Works <hello@pkworks.co> wrote:\n> 3 posts waiting'), 'Approve!');
assert.strictEqual(replyText('Changes: swap the photo\n> quoted\n'), 'Changes: swap the photo');
assert.strictEqual(replyText(null, '<div>Looks good</div><div>Sent from my iPhone</div>'), 'Looks good');
assert.strictEqual(replyText('ok\n--\nJane Smith\nAcme'), 'ok');

assert.deepStrictEqual(replyDecision('Approve!'), { decision: 'approved', comment: '' });
assert.deepStrictEqual(replyDecision('approved, thanks team'), { decision: 'approved', comment: 'thanks team' });
assert.deepStrictEqual(replyDecision('Looks good'), { decision: 'approved', comment: '' });
assert.deepStrictEqual(replyDecision('CHANGES: use the red logo'), { decision: 'changes_requested', comment: 'use the red logo' });
assert.deepStrictEqual(replyDecision('Change - fix the date'), { decision: 'changes_requested', comment: 'fix the date' });
assert.strictEqual(replyDecision('Who is this?'), null, 'anything else is unclear');
assert.strictEqual(replyDecision('okra recipes'), null, 'only whole words count');
console.log('replies: ok');
