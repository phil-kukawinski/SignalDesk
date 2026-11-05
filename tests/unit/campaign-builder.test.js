// Build with AI: reading uploaded documents, and keeping the AI's plan to the campaign's dates and networks.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), ANTHROPIC_API_KEY: 'test' });
const { readDocument, docxText, cleanPlan, cleanRequest, cleanSchedule, cleanPostLimit, extraPosts, trimToLimit, askQuestions, writePlan, MAX_FILE_BYTES } = require(ROOT + '/api/_lib/campaign-builder.js');

// The smallest .docx that matters: a zip holding word/document.xml.
function zip(entries, { store = false } = {}) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const raw = Buffer.from(text), packed = store ? raw : zlib.deflateRawSync(raw), label = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(store ? 0 : 8, 8); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(label.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(store ? 0 : 8, 10); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(label.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, label, packed); centrals.push(central, label);
    offset += 30 + label.length + packed.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const XML = '<w:document><w:body><w:p><w:r><w:t>Fall kits &amp; more</w:t></w:r></w:p><w:p><w:r><w:t>20% off</w:t><w:tab/><w:t>&lt;teachers&gt; &#8212; caf&#xE9;</w:t></w:r></w:p></w:body></w:document>';
const EXPECTED = 'Fall kits & more\n20% off\t<teachers> — café';
assert.equal(docxText(zip([['[Content_Types].xml', '<x/>'], ['word/document.xml', XML]])), EXPECTED);
assert.equal(docxText(zip([['word/document.xml', XML]], { store: true })), EXPECTED, 'files stored without compression work too');
const code = (fn) => { try { fn(); } catch (error) { return error.status; } return 'no error'; };
assert.equal(code(() => docxText(Buffer.from('not a zip file at all, not even close, really'))), 400);
assert.equal(code(() => docxText(zip([['word/other.xml', XML]]))), 400, 'a zip that is not a Word file');
const bomb = zip([['word/document.xml', 'a'.repeat(40 * 1024 * 1024)]]);
assert.equal(code(() => docxText(bomb)), 400, 'a small file can’t unpack into something huge');

const upload = (name, bytes) => ({ name, data: Buffer.from(bytes).toString('base64') });
assert.equal(readDocument(undefined), null);
assert.equal(readDocument(upload('brief.docx', zip([['word/document.xml', XML]]))).text, EXPECTED);
assert.equal(readDocument(upload('notes.TXT', '﻿Hello')).text, 'Hello');
assert.equal(readDocument(upload('notes.md', '# Hi')).text, '# Hi');
assert.deepEqual(readDocument(upload('a.pdf', '%PDF-1.7 x')).kind, 'pdf');
assert.equal(code(() => readDocument(upload('a.pdf', 'hello'))), 400, 'a renamed file isn’t a PDF');
assert.equal(code(() => readDocument(upload('a.doc', 'x'))), 400, 'old Word files aren’t supported');
assert.equal(code(() => readDocument(upload('a.exe', 'x'))), 400);
assert.equal(code(() => readDocument(upload('a.txt', '   '))), 400, 'empty');
assert.equal(code(() => readDocument(upload('a.txt', Buffer.from([65, 0, 66])))), 400, 'binary');
assert.equal(code(() => readDocument({ name: 'a.txt', data: 'A'.repeat(Math.ceil(MAX_FILE_BYTES / 3) * 4 + 100) })), 400, 'too big');
const long = readDocument(upload('long.txt', 'x'.repeat(70000)));
assert.equal(long.text.length, 60000); assert.equal(long.trimmed, true);

// --- the plan
const post = (over = {}) => ({ date: '2026-11-10', time: '10:30', networks: ['facebook', 'linkedin'], title: 'Launch', format: 'Image', captions: [{ network: 'facebook', text: 'FB' }, { network: 'linkedin', text: 'LI' }], creativeIdea: 'A photo', ...over });
const scope = { networks: ['facebook', 'linkedin', 'tiktok'], start: '2026-11-10', end: '2026-11-23' };
let plan = cleanPlan({ name: 'Fall', angle: 'Big idea', assumptions: ['A guess', ''], posts: [
  post({ date: '2026-11-12', title: 'Later' }),
  post({ title: 'First' }),
  post({ date: '2026-11-09', title: 'Too early' }),
  post({ date: '2026-11-24', title: 'Too late' }),
  post({ date: '2026-02-31', title: 'Not a day' }),
  post({ date: 'soon', title: 'Not a date' }),
  post({ networks: ['myspace'], title: 'Not chosen' }),
  post({ captions: [], title: 'No words' }),
  post({ date: '2026-11-11', time: '25:00', networks: ['facebook', 'myspace', 'tiktok'], captions: [{ network: 'facebook', text: ' Shared ' }], title: 'Fixes' })
] }, scope);
assert.deepEqual(plan.posts.map((item) => item.title), ['First', 'Fixes', 'Later'], 'in date order, only usable posts');
assert.deepEqual(plan.assumptions, ['A guess']);
const fixed = plan.posts[1];
assert.equal(fixed.time, '09:00', 'a bad time gets a safe default');
assert.deepEqual(fixed.networks, ['facebook', 'tiktok'], 'only chosen networks');
assert.deepEqual(fixed.captions, [{ network: 'facebook', text: 'Shared' }, { network: 'tiktok', text: 'Shared' }], 'a network with no caption borrows one');
assert.equal(cleanPlan({ posts: Array.from({ length: 50 }, () => post()) }, scope).posts.length, 30, 'at most 30 posts');
assert.deepEqual(cleanPlan({}, scope).posts, []);

// --- requests
const known = new Set(['facebook', 'x']);
assert.equal(code(() => cleanRequest({ networks: [] }, known)), 400);
assert.equal(code(() => cleanRequest({ networks: ['myspace'] }, known)), 400);
const request = cleanRequest({ networks: ['facebook', 'facebook', 'myspace', 'x'], brief: ' Promote it ', answers: [{ question: 'Goal?', answer: ' Sales ' }, { question: 'Blank?', answer: ' ' }, 'nonsense'] }, known);
assert.deepEqual(request.networks, ['facebook', 'x']);
assert.equal(request.brief, 'Promote it');
assert.deepEqual(request.answers, [{ question: 'Goal?', answer: 'Sales' }]);
assert.deepEqual(cleanSchedule({ start: '2026-11-10' }, '2026-11-04'), { start: '2026-11-10', days: null });
assert.deepEqual(cleanSchedule({ start: '2026-11-10', days: 14 }, '2026-11-04'), { start: '2026-11-10', days: 14 });
assert.equal(code(() => cleanSchedule({ start: '2026-11-03' }, '2026-11-04')), 400, 'already passed');
assert.equal(code(() => cleanSchedule({ start: 'tomorrow' }, '2026-11-04')), 400);
for (const days of [0, 61, 1.5, 'lots']) assert.equal(code(() => cleanSchedule({ start: '2026-11-10', days }, '2026-11-04')), 400, `${days} days`);

// --- how many posts someone asked for
assert.equal(cleanPostLimit({}), null, 'blank means the AI decides');
assert.equal(cleanPostLimit({ postCount: '' }), null);
assert.deepEqual(cleanPostLimit({ postCount: 3 }), { count: 3, per: 'week' }, 'per week unless total is chosen');
assert.deepEqual(cleanPostLimit({ postCount: '30', postPer: 'total' }), { count: 30, per: 'total' });
for (const postCount of [0, -1, 1.5, 15, 'lots']) assert.equal(code(() => cleanPostLimit({ postCount })), 400, `${postCount} a week`);
assert.equal(code(() => cleanPostLimit({ postCount: 31, postPer: 'total' })), 400);
const dated = (days) => days.map((day) => ({ id: day, date: new Date(Date.UTC(2026, 10, 10 + day)).toISOString().slice(0, 10) }));
const limitWeek = { count: 2, per: 'week' }, limitTotal = { count: 3, per: 'total' };
assert.equal(extraPosts(dated([0, 1, 2, 3, 7, 8]), limitWeek, '2026-11-10'), 2, 'weeks count from the start date');
assert.equal(extraPosts(dated([0, 6, 7, 13]), limitWeek, '2026-11-10'), 0, 'the 7th day starts a new week');
assert.equal(extraPosts(dated([0, 1, 2, 3]), limitTotal, '2026-11-10'), 1);
assert.deepEqual(trimToLimit(dated([0, 1, 2, 3, 4, 5, 6]), limitTotal, '2026-11-10').map((post) => post.id), [0, 3, 6], 'trimming keeps the start and end');
assert.deepEqual(trimToLimit(dated([0, 1, 2, 3, 7]), limitWeek, '2026-11-10').map((post) => post.id), [0, 3, 7], 'trimming works week by week');

// --- questions: what goes to the AI, and what comes back
(async () => {
  let sent;
  global.fetch = async (url, options) => {
    sent = JSON.parse(options.body);
    const text = JSON.stringify({ name: 'Fall kits', docNotes: 'Kits cost $20.', questions: [1, 2, 3, 4, 5, 6].map((n) => ({ question: `Q${n}?`, hint: 'e.g.' })) });
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = { id: 'c1', name: 'PK Works', brand: { voice: 'Warm', bannedWords: 'cheap' } };
  let result = await askQuestions({ client, brief: 'Promote kits', document: { kind: 'pdf', data: 'QUJD' }, networks: ['facebook'] });
  assert.equal(result.questions.length, 4, 'at most 4 questions');
  assert.equal(result.docNotes, 'Kits cost $20.');
  assert.equal(sent.messages[0].content[0].type, 'document', 'a PDF goes as a document');
  assert.ok(/Warm/.test(sent.system) && /cheap/.test(sent.system), 'the brand kit is used');
  result = await askQuestions({ client, brief: 'Promote kits', document: null, networks: ['facebook'] });
  assert.equal(result.docNotes, '', 'no document, no notes');
  assert.equal(sent.messages[0].content.length, 1);

  // --- the plan: streamed from the AI, using what's on the calendar, and limited to the campaign
  const sse = (text, stop = 'end_turn') => [
    ['message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 1 } }],
    ['message_stop', { type: 'message_stop' }]
  ].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  const urls = [];
  let reply = JSON.stringify({ name: 'Fall', angle: 'Big idea', assumptions: ['A guess'], posts: [post({ date: '2026-11-11' }), post({ date: '2026-12-25', title: 'Past the end' })] }), stop = 'end_turn';
  global.fetch = async (input, options) => {
    const url = String(input.url || input);
    urls.push(url);
    if (url.includes('sb.test')) {
      const rows = url.includes('scheduled_posts') && url.includes('publish_jobs')
        ? [{ title: 'Existing', scheduled_for: '2026-11-11T15:00:00Z', publish_jobs: [{ platform: 'x', status: 'queued' }, { platform: 'facebook', status: 'canceled' }] }, { title: 'Out of range', scheduled_for: '2026-11-20T15:00:00Z', publish_jobs: [{ platform: 'facebook', status: 'queued' }] }]
        : [];
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    sent = JSON.parse(options.body);
    return new Response(sse(reply, stop), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const planArgs = { workspaceId: 'ws-1', client, timeZone: 'America/New_York', brief: 'Promote kits', docNotes: 'Kits cost $20.', answers: [{ question: 'Goal?', answer: 'Sales' }], networks: ['facebook', 'linkedin'], start: '2026-11-10', days: 7, now: new Date('2026-11-04T12:00:00Z') };
  // A post count: asked for in the prompt, redone once if it's ignored, then trimmed with a note.
  {
    const realReply = reply;
    const planWith = (count) => JSON.stringify({ name: 'N', angle: 'A', assumptions: ['Guess'], posts: Array.from({ length: count }, (_, index) => ({ date: `2026-11-1${index % 4}`, time: '09:00', networks: ['facebook'], title: `P${index}`, format: 'Image', captions: [{ network: 'facebook', text: 'T' }], creativeIdea: '' })) });
    let bodies = [];
    const stub = global.fetch;
    const replies = (...counts) => { let turn = 0; bodies = []; global.fetch = async (url, options) => { if (String(url).includes('sb.test')) return stub(url, options); bodies.push(JSON.parse(options.body)); const count = counts[Math.min(turn++, counts.length - 1)]; if (count === 'fail') return new Response('{}', { status: 400 }); return new Response(sse(planWith(count)), { status: 200, headers: { 'content-type': 'text/event-stream' } }); }; };
    const limited = { ...planArgs, start: '2026-11-10', days: 14, postLimit: { count: 3, per: 'total' } };
    replies(3);
    let limitedPlan = await writePlan(limited);
    assert.equal(bodies.length, 1, 'a plan within the limit is not redone');
    assert.equal(limitedPlan.posts.length, 3);
    assert.ok(/Write exactly 3 posts/.test(bodies[0].messages[0].content), 'the limit goes in the prompt');
    assert.ok(!/three to five a week/.test(bodies[0].system), 'the usual pace is dropped when a number is set');
    assert.deepEqual(limitedPlan.assumptions, ['Guess']);
    replies(4, 3);
    limitedPlan = await writePlan(limited);
    assert.equal(bodies.length, 2, 'over the limit gets one redo');
    assert.ok(/1 too many post/.test(bodies[1].messages[0].content));
    assert.equal(limitedPlan.posts.length, 3);
    assert.deepEqual(limitedPlan.assumptions, ['Guess'], 'a good redo needs no note');
    replies(6, 5);
    limitedPlan = await writePlan(limited);
    assert.equal(bodies.length, 2, 'never more than one redo');
    assert.equal(limitedPlan.posts.length, 3, 'still over, so trimmed');
    assert.ok(/2 more posts than you asked for/.test(limitedPlan.assumptions[0]), 'trimming is explained');
    replies(4, 'fail');
    limitedPlan = await writePlan(limited);
    assert.equal(limitedPlan.posts.length, 3, 'a failed redo keeps and trims the first plan');
    replies(2);
    limitedPlan = await writePlan(limited);
    assert.ok(/You asked for 3 posts, and this plan has 2/.test(limitedPlan.assumptions[0]), 'too few is pointed out');
    assert.equal(bodies.length, 1);
    replies(4);
    limitedPlan = await writePlan({ ...limited, postLimit: { count: 1, per: 'week' } });
    assert.ok(/at most 1 post in each week/.test(bodies[0].messages[0].content));
    assert.equal(limitedPlan.posts.length, 1, 'all four landed in one week');
    global.fetch = stub;
    reply = realReply;
  }

  const written = await writePlan(planArgs);
  assert.equal(sent.stream, true, 'long plans stream');
  assert.equal(sent.output_config.format.type, 'json_schema');
  const prompt = sent.messages[0].content;
  assert.ok(/Kits cost \$20/.test(prompt) && /Goal\?\s+Sales/.test(prompt), 'the notes and answers reach the AI');
  assert.ok(/It runs 7 days, through 2026-11-16/.test(prompt));
  assert.ok(/2026-11-11 10:00 on twitter: Existing/.test(prompt), 'what’s already booked reaches the AI in local time, canceled networks left out');
  assert.ok(!/Out of range/.test(prompt));
  assert.ok(/Never invent prices/.test(sent.system) && /Warm/.test(sent.system));
  assert.deepEqual(written.posts.map((item) => item.date), ['2026-11-11'], 'posts past the end are dropped');
  assert.deepEqual(written.booked, [{ date: '2026-11-11', time: '10:00', title: 'Existing', networks: ['twitter'] }]);
  await assert.rejects(writePlan({ ...planArgs, days: null, start: '2026-11-10' }).then(() => { reply = '{"posts":[]}'; return writePlan(planArgs); }), (error) => error.status === 502, 'a plan with no usable posts says so');
  stop = 'max_tokens'; reply = '{"posts":[';
  await assert.rejects(writePlan(planArgs), (error) => error.status === 422 && /fewer days/.test(error.message), 'a plan that runs out of room says what to do');
  stop = 'refusal'; reply = '';
  await assert.rejects(writePlan(planArgs), (error) => error.status === 422 && /declined/.test(error.message));
  console.log('campaign builder tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
