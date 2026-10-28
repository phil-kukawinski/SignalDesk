const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const path = ROOT + '/api/_lib/core.js';
const core = require(path);
const src = require('fs').readFileSync(path, 'utf8');
// pull private helpers through a module wrapper
const m = { exports: {} };
new Function('module', 'exports', 'require', src + '\nmodule.exports.__t={parseFeed,upcomingSlots,zonedToUtc,renderTemplate,matchesKeywords,isPrivateAddress,assertPublicFeedUrl};')(m, m.exports, require);
const t = m.exports.__t;

const rss = `<?xml version="1.0"?><rss><channel><title>Bright &amp; Co News</title>
<item><title><![CDATA[Back to <b>school</b> tips]]></title><link>https://ex.com/a</link><guid>a1</guid><pubDate>Tue, 14 Oct 2026 10:00:00 GMT</pubDate>
<description>&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;img src="https://ex.com/a.jpg"&gt;</description></item>
<item><title>Second</title><link>https://ex.com/b</link><enclosure url="https://ex.com/b.png" type="image/png" length="1"/><pubDate>Wed, 15 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;
const f = t.parseFeed(rss);
assert.equal(f.title, 'Bright & Co News');
assert.equal(f.items.length, 2);
assert.equal(f.items[0].title, 'Back to school tips');
assert.equal(f.items[0].image, 'https://ex.com/a.jpg');
assert.equal(f.items[0].summary, 'Hello & welcome');
assert.equal(f.items[1].image, 'https://ex.com/b.png');
assert.equal(f.items[1].guid, 'https://ex.com/b');

const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Blog</title><entry><title>Hi</title><id>tag:1</id><link rel="alternate" href="https://ex.com/x"/><updated>2026-10-10T00:00:00Z</updated><media:thumbnail url="https://ex.com/t.jpg"/><summary>Short</summary></entry></feed>`;
const a = t.parseFeed(atom);
assert.equal(a.title, 'Atom Blog'); assert.equal(a.items[0].link, 'https://ex.com/x'); assert.equal(a.items[0].image, 'https://ex.com/t.jpg'); assert.equal(a.items[0].guid, 'tag:1');

// 9:00 New York in EDT (Oct) = 13:00Z; in EST (Dec) = 14:00Z
assert.equal(new Date(t.zonedToUtc(2026, 10, 20, 9, 0, 'America/New_York')).toISOString(), '2026-10-20T13:00:00.000Z');
assert.equal(new Date(t.zonedToUtc(2026, 12, 1, 9, 0, 'America/New_York')).toISOString(), '2026-12-01T14:00:00.000Z');
const slots = t.upcomingSlots({ days: [1, 3], times: ['15:00', '09:00'] }, 'America/Chicago', new Set(), 4);
assert.equal(slots.length, 4);
slots.forEach((s, i) => { const d = new Date(s); const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).format(d); assert.match(local, /^(Mon|Wed),? (09|15)$/, local); if (i) assert.ok(s > slots[i - 1]); });
const taken = new Set([slots[0]]);
assert.notEqual(t.upcomingSlots({ days: [1, 3], times: ['15:00', '09:00'] }, 'America/Chicago', taken, 1)[0], slots[0]);

assert.equal(t.renderTemplate('{title}\n\n\n\n{link} {nope}', { title: 'T', link: 'L', summary: '' }, ''), 'T\n\nL {nope}');
assert.equal(t.matchesKeywords({ include_keywords: 'school, kits', exclude_keywords: 'sale' }, { title: 'School day', summary: '' }), true);
assert.equal(t.matchesKeywords({ include_keywords: '', exclude_keywords: 'sale' }, { title: 'Big SALE', summary: '' }), false);

['127.0.0.1', '10.1.2.3', '192.168.0.4', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1'].forEach((ip) => assert.ok(t.isPrivateAddress(ip), ip));
['8.8.8.8', '2606:4700::1111', '172.32.0.1'].forEach((ip) => assert.ok(!t.isPrivateAddress(ip), ip));

assert.deepEqual(core.validatePostOptions({ cover: { url: 'https://cdn.test/c.jpg', offsetMs: 1500, video: 'ignored' } }, ['instagram']).cover, { url: 'https://cdn.test/c.jpg', offsetMs: 1500 });
for (const cover of [{ url: 'javascript:alert(1)' }, { url: 'http://insecure.test/c.jpg' }, { offsetMs: -5 }, { offsetMs: 1.5 }]) assert.throws(() => core.validatePostOptions({ cover }, ['tiktok']), (e) => e.status === 400, JSON.stringify(cover));
const opts = core.validatePostOptions({ collaborators: ['@one', 'two'], userTags: [{ username: 'a', x: 0.5, y: 0.9 }, { username: 'b' }], visibility: { linkedin: 'connections', youtube: 'unlisted', tiktok: 'friends' }, firstComment: ' #tags ', followUpComments: [{ comment: 'later', delayMinutes: 60 }], autoRepost: { repeat: 3, days: 7 } }, ['instagram', 'linkedin', 'youtube']);
assert.deepEqual(opts.instagramOptions, { collaborators: ['one', 'two'], userTags: [{ username: 'a', x: 0.5, y: 0.9 }, { username: 'b' }] });
assert.deepEqual(opts.linkedin, { visibility: 'connections' }); assert.deepEqual(opts.youtube, { visibility: 'unlisted' }); assert.equal(opts.tiktok, undefined);
const body = core.buildPostBody({ text: 'Hi', platforms: ['instagram', 'linkedin', 'youtube'], mediaUrls: ['https://x/y.mp4'], scheduleDate: '2026-11-01T13:00:00.000Z', requiresApproval: true, options: opts });
assert.deepEqual(body.youTubeOptions, { title: 'Hi', visibility: 'unlisted' });
assert.deepEqual(body.linkedInOptions, { visibility: 'connections' });
assert.deepEqual(body.firstComment, { comment: '#tags' });
assert.deepEqual(body.autoRepost, { repeat: 3, days: 7, startDate: '2026-11-01T13:00:00.000Z' });
assert.equal(body.scheduleDate, undefined); assert.equal(body.requiresApproval, true);
assert.equal(core.buildPostBody({ text: 'x', platforms: ['facebook'], scheduleDate: 'S', options: {} }).scheduleDate, 'S');
for (const bad of [{ collaborators: ['a', 'b', 'c', 'd'] }, { autoRepost: { repeat: 27, days: 2 } }, { autoRepost: { repeat: 13, every: "month" } }, { autoRepost: { repeat: 2, days: 1 } }, { followUpComments: [{ comment: 'x', delayMinutes: 5 }] }, { visibility: { linkedin: 'secret' } }, { userTags: [{ username: 'bad name' }] }]) {
  assert.throws(() => core.validatePostOptions(bad, ['instagram', 'linkedin']), (e) => e.status === 400, JSON.stringify(bad));
}
(async () => {
  for (const url of ['http://localhost/feed', 'http://127.0.0.1/rss', 'file:///etc/passwd', 'http://user:pw@example.com/', 'http://example.com:6379/']) {
    await assert.rejects(t.assertPublicFeedUrl(url), (e) => e.status === 400, url);
  }
  console.log('core tests passed');
})();
