const { trackedClient } = require('./ai');

// Small AI helpers, each one short request: reply suggestions in the Social Inbox, a plain-language
// "what worked" paragraph for client reports, and a fresh take on a past top post. Haiku for replies,
// Sonnet for the writing that goes to clients.

const REPLY_MODEL = 'claude-haiku-5-5';
const WRITING_MODEL = 'claude-sonnet-5-5';

function configured() {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('AI help is not configured. Add ANTHROPIC_API_KEY to the server environment.'), { status: 503 });
}

async function structured({ model, system, prompt, schema, maxTokens = 1500 }) {
  configured();
  const response = await trackedClient().beta.messages.create({
    model, max_tokens: maxTokens, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } }, system, messages: [{ role: 'user', content: prompt }]
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('The AI declined this one. Write it yourself, or try different wording.'), { status: 422 });
  if (response.stop_reason === 'max_tokens') throw new Error('The answer ran long. Try again.');
  return JSON.parse(response.content.find((block) => block.type === 'text')?.text || '{}');
}

function brandNotes(client) {
  const brand = client?.brand || {};
  return [client?.desc && `About: ${client.desc}`, brand.voice && `Voice: ${brand.voice}`, brand.avoidWords && `Words to avoid: ${brand.avoidWords}`].filter(Boolean).join('\n').slice(0, 2000);
}

const clip = (text, length) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, length);

async function suggestReplies({ client, post, comment, author, network }) {
  const parsed = await structured({
    model: REPLY_MODEL, maxTokens: 800,
    system: `You draft replies to comments on a brand's social media posts, for the social media manager to edit and send. Write as the brand, in its voice. Be warm, specific to what the person said, and brief (under 220 characters). No hashtags. At most one emoji, only if the brand voice is casual. Don't promise refunds, prices, dates, or anything the post doesn't say; for complaints or questions you can't answer, invite them to message the brand. If the comment is spam or abusive, reply with an empty list.`,
    prompt: `${client ? `Brand: ${client.name}\n${brandNotes(client)}\n\n` : ''}Network: ${network || 'social media'}\nThe post: ${clip(post, 1200) || '(no caption)'}\n\nComment from ${clip(author, 60) || 'someone'}: ${clip(comment, 1500)}\n\nWrite two different replies.`,
    schema: { type: 'object', additionalProperties: false, required: ['replies'], properties: { replies: { type: 'array', items: { type: 'string' } } } }
  });
  return (parsed.replies || []).map((reply) => clip(reply, 400)).filter(Boolean).slice(0, 2);
}

// For client reports: what stood out and one or two things to try, from the numbers the report has.
async function reportSummary({ client, periodLabel, totals, previous, top, byNetwork, highlights }) {
  const parsed = await structured({
    model: WRITING_MODEL, maxTokens: 900,
    system: `You write the "What worked" paragraph of a monthly social media report that a small agency sends to its client. Plain, friendly, confident English for a business owner, not a marketer. 3 to 5 sentences: what did best and why it likely worked, one honest note on what was weaker, and one or two concrete things to try next month. Only use the numbers given; don't invent any. No jargon like "leverage" or "synergy". No headings or bullet points.`,
    prompt: `Client: ${client.name}\n${brandNotes(client)}\nPeriod: ${periodLabel}\nTotals: ${JSON.stringify(totals)}\nPrevious period: ${JSON.stringify(previous || null)}\nBy network: ${JSON.stringify(byNetwork)}\nTop posts: ${JSON.stringify(top)}\nHighlights already in the report: ${JSON.stringify(highlights || [])}`,
    schema: { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } }
  });
  return clip(parsed.summary, 1200);
}

// A past top post, rewritten so it can run again without feeling like a repeat.
async function refreshPost({ client, text, network, results }) {
  const parsed = await structured({
    model: WRITING_MODEL, maxTokens: 1500,
    system: `You help a social media manager reuse a post that did well. Write a fresh version for the same brand and network: keep what made it work (the idea, the offer, the hook style) but change the opening line, the wording, and the call to action so followers don't see a repeat. Keep the brand's voice, keep any links and @mentions exactly as written, and keep roughly the same length. Then say in one short sentence what you kept and what you changed.`,
    prompt: `${client ? `Brand: ${client.name}\n${brandNotes(client)}\n\n` : ''}Network: ${network || 'social media'}\nHow it did: ${clip(results, 200) || 'one of the best recent posts'}\n\nThe post:\n${String(text || '').slice(0, 3000)}`,
    schema: { type: 'object', additionalProperties: false, required: ['text', 'note'], properties: { text: { type: 'string' }, note: { type: 'string' } } }
  });
  return { text: String(parsed.text || '').trim().slice(0, 5000), note: clip(parsed.note, 300) };
}

module.exports = { suggestReplies, reportSummary, refreshPost, brandNotes };
