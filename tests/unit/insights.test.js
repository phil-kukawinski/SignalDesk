// What works: post types, caption lengths, and hashtags (2+ posts), averaged per post, with the lift
// over the overall average.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const { contentInsights, postType, lengthBucket } = require(ROOT + '/api/_lib/insights.js');
assert.strictEqual(postType({ media_type: 'CAROUSEL_ALBUM' }), 'Carousel');
assert.strictEqual(postType({ media_type: 'REELS' }), 'Video');
assert.strictEqual(postType({ media_type: 'IMAGE' }), 'Photo');
assert.strictEqual(postType({ platform: 'instagram_story', media_type: 'IMAGE' }), 'Story');
assert.strictEqual(postType({ platform: 'linkedin' }), 'Text only');
assert.strictEqual(lengthBucket('x'.repeat(79)), 'Short (under 80 characters)');
assert.strictEqual(lengthBucket('x'.repeat(300)), 'Medium (80 to 300)');
const rows = [
  { platform: 'instagram', media_type: 'REELS', text: 'Barrel day #Rum #craft', metrics: { engagements: 90, reach: 1000 } },
  { platform: 'instagram', media_type: 'IMAGE', text: 'New bottle #rum', metrics: { engagements: 30, reach: 1000 } },
  { platform: 'instagram', media_type: 'IMAGE', text: 'Tasting #craft', metrics: { engagements: 30 } },
  { platform: 'facebook', media_type: '', text: 'Hours this week', metrics: { engagements: 10, views: 500 } },
  { platform: 'facebook', media_type: '', text: 'No numbers yet #rum', metrics: {} }
];
const out = contentInsights(rows);
assert.strictEqual(out.posts, 5);
assert.strictEqual(out.average.avgEngagements, 40);
assert.strictEqual(out.average.rate, 5.2, '(90+30+10) / (1000+1000+500)');
assert.deepStrictEqual(out.types.map((t) => [t.type, t.posts, t.avgEngagements, t.lift]), [['Video', 1, 90, 125], ['Photo', 2, 30, -25], ['Text only', 2, 10, -75]]);
assert.deepStrictEqual(out.hashtags.map((h) => [h.tag, h.posts, h.avgEngagements]), [['#rum', 3, 60], ['#craft', 2, 60]], 'case is ignored, posts without numbers still count, and ties go to the more used tag');
console.log('insights: ok');
