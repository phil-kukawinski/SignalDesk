const { Anthropic } = require('@anthropic-ai/sdk');

const PROOFREAD_MODEL = 'claude-opus-5-5';
const ISSUE_TYPES = ['spelling', 'grammar', 'punctuation', 'clarity', 'consistency'];

const ISSUES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'original', 'suggestion', 'type', 'reason'],
        properties: {
          key: { type: 'string', description: 'The key of the text the issue is in.' },
          original: { type: 'string', description: 'The exact text to replace, copied character for character.' },
          suggestion: { type: 'string', description: 'The replacement text.' },
          type: { type: 'string', enum: ISSUE_TYPES },
          reason: { type: 'string', description: 'A short explanation for the social media manager.' }
        }
      }
    }
  }
};

const SYSTEM_PROMPT = `You proofread social media posts before they are published for a brand. Find spelling mistakes, grammar errors, punctuation problems, unclear phrasing, and inconsistencies between versions of the same post (for example a different date, price, or name in one platform's version).

Respect the brand's voice: casual tone, emoji, hashtags, @mentions, intentional slang, and stylized brand names are fine and should not be flagged. Do not rewrite for style or length. Only flag something a careful editor would actually fix.

For each issue, copy the exact text being replaced into "original" (short, but long enough to be unique in that text) and give the corrected text in "suggestion". If a text has no problems, return no issues for it.`;

async function proofreadTexts(texts) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('Proofreading is not configured. Add ANTHROPIC_API_KEY to the server environment.'), { status: 503 });
  const client = new Anthropic();
  const body = texts.map((item) => `<text key="${item.key}" label="${item.label.replace(/"/g, "'")}">\n${item.text}\n</text>`).join('\n\n');
  const response = await client.beta.messages.create({
    model: PROOFREAD_MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ISSUES_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Proofread these texts from one post:\n\n${body}` }]
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('Proofreading was declined for this post.'), { status: 422 });
  if (response.stop_reason === 'max_tokens') throw new Error('Proofreading ran out of room. Try a shorter post.');
  const text = response.content.find((block) => block.type === 'text')?.text || '{"issues":[]}';
  const parsed = JSON.parse(text);
  const byKey = new Map(texts.map((item) => [item.key, item.text]));
  // Keep only suggestions that point at real text, so "Apply" always has something to replace.
  return parsed.issues.filter((issue) => byKey.has(issue.key) && issue.original && issue.original !== issue.suggestion && byKey.get(issue.key).includes(issue.original)).slice(0, 40);
}

module.exports = { proofreadTexts };
