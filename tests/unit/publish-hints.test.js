// Plain reasons for failed posts: common network messages get a reason and a fix; unknown ones don't,
// so the network's own words are shown instead.
const assert = require('node:assert/strict');
const { explainPublishError: explain } = require('../../js/publish-hints.js');

const cases = [
  ['instagram', 'The aspect ratio is not supported. (2207009)', 'invalid', /image’s shape/, /Prep image/],
  ['instagram_story', 'The video duration exceeds the maximum allowed: 60 seconds', 'invalid', /video is longer than Instagram/, /60 seconds/],
  ['facebook', 'Error validating access token: Session has been invalidated', 'auth', /access to this Facebook account/, /Reconnect/],
  ['twitter', 'You are not allowed to create a Tweet with duplicate content.', 'invalid', /^X blocked this as a repeat/, /wording/],
  ['pinterest', 'Your application consumer type is not supported for trial access', 'invalid', /hasn’t approved SignalDesk/, /Standard access/],
  ['instagram', 'Media download has failed. (2207003)', 'invalid', /couldn’t download/, /attached/],
  ['threads', 'Application request limit reached', 'rate_limit', /limiting how often/, /hour/],
  ['linkedin', 'Could not reach the network.', 'temporary', /LinkedIn didn’t respond/, /few minutes/],
  ['instagram', 'The caption is too long', 'invalid', /text is longer than Instagram/, /counter/],
  ['youtube', 'Insufficient permission for this request', 'invalid', /hasn’t given SignalDesk permission/, /Reconnect/]
];
for (const [platform, message, kind, why, fix] of cases) {
  const hint = explain(platform, message, kind);
  assert.ok(hint, `${platform}: "${message}" gets a reason`);
  assert.match(hint.why, why, `${platform}: ${hint.why}`);
  assert.match(hint.fix, fix, `${platform}: ${hint.fix}`);
}
assert.equal(explain('facebook', '(#100) Invalid parameter', 'invalid'), null, 'an unrecognized message falls back to the network’s words');
assert.equal(explain('facebook', '', ''), null, 'no message, no reason');
assert.match(explain('mastodon', 'timed out', 'temporary').why, /^The network didn’t respond/, 'an unknown network gets a generic name');
console.log(`publish hints tests passed (${cases.length + 3} cases)`);
