const { Anthropic } = require('@anthropic-ai/sdk');

const TREND_MODEL = 'claude-opus-5-5';
const TREND_PLATFORMS = {
  tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn',
  twitter: 'X', youtube: 'YouTube', threads: 'Threads', pinterest: 'Pinterest'
};
const MAX_CONTINUATIONS = 4;

const stringList = { type: 'array', items: { type: 'string' } };
const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'hashtags', 'audio', 'formats', 'topPosts', 'ideas'],
  properties: {
    summary: { type: 'string', description: 'Two or three sentences on the biggest shifts this week.' },
    hashtags: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['tag', 'platforms', 'momentum', 'why', 'sourceUrls'],
        properties: {
          tag: { type: 'string', description: 'Hashtag including #.' },
          platforms: stringList,
          momentum: { type: 'string', enum: ['rising', 'peaking', 'steady', 'fading'] },
          why: { type: 'string' },
          sourceUrls: stringList
        }
      }
    },
    audio: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'artist', 'platforms', 'howCreatorsUseIt', 'sourceUrls'],
        properties: { title: { type: 'string' }, artist: { type: 'string' }, platforms: stringList, howCreatorsUseIt: { type: 'string' }, sourceUrls: stringList }
      }
    },
    formats: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'platforms', 'description', 'sourceUrls'],
        properties: { name: { type: 'string' }, platforms: stringList, description: { type: 'string' }, sourceUrls: stringList }
      }
    },
    topPosts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['creator', 'platform', 'description', 'whyItWorks', 'url', 'sourceUrls'],
        properties: {
          creator: { type: 'string' }, platform: { type: 'string' }, description: { type: 'string' }, whyItWorks: { type: 'string' },
          url: { type: 'string', description: 'Link to the post itself if a search result contained it, otherwise an empty string.' },
          sourceUrls: stringList
        }
      }
    },
    ideas: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'client', 'platforms', 'hook', 'description'],
        properties: {
          title: { type: 'string' },
          client: { type: 'string', description: 'Client name this idea is for, or "Any".' },
          platforms: stringList, hook: { type: 'string', description: 'Opening line or first three seconds.' }, description: { type: 'string' }
        }
      }
    }
  }
};

const SYSTEM_PROMPT = `You are the trend researcher for SignalDesk, a social media workspace used by an agency that publishes for several client brands. Each report is read by social media managers planning the coming week, so it should tell them what is actually moving right now and how their clients could join in.

Research with web search before you write anything. Look for what is trending in roughly the past seven days: hashtags gaining use, sounds and songs creators are building posts around on TikTok and Instagram Reels, post formats that are breaking out, and specific high-performing posts that people are talking about. Platform trend pages (for example TikTok Creative Center), creator newsletters, and recent marketing coverage are good sources; older evergreen listicles are not.

Only include a trend if one of your searches supports it, and put the URLs of the supporting results in sourceUrls. If you cannot confirm something is current, leave it out rather than guessing; a shorter report is better than an inaccurate one. Aim for up to 10 hashtags, 6 audio trends, 5 formats, 5 notable posts, and 6 ideas. Ideas should be specific to the clients described, safe for a brand account, and should not copy another creator's work.

When the research is done, call submit_trend_report once with the full report.`;

function submitTool() {
  return {
    name: 'submit_trend_report',
    description: 'Submit the finished trend report. Call this exactly once, after researching.',
    strict: true,
    input_schema: REPORT_SCHEMA
  };
}

function collectSearchResults(content, seen) {
  for (const block of content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (result.type === 'web_search_result' && typeof result.url === 'string' && !seen.has(result.url)) {
        seen.set(result.url, { url: result.url, title: result.title || result.url, pageAge: result.page_age || null });
      }
    }
  }
}

function cleanReport(input, sources) {
  // Keep only links that came back from a real search result, so the UI never shows invented URLs.
  const keep = (urls) => (Array.isArray(urls) ? urls.filter((url) => sources.has(url)).slice(0, 4) : []);
  const list = (items, max) => (Array.isArray(items) ? items.slice(0, max).map((item) => ({ ...item, sourceUrls: keep(item.sourceUrls) })) : []);
  return {
    summary: typeof input.summary === 'string' ? input.summary : '',
    hashtags: list(input.hashtags, 12),
    audio: list(input.audio, 8),
    formats: list(input.formats, 6),
    topPosts: list(input.topPosts, 6).map((item) => ({ ...item, url: /^https:\/\//.test(item.url || '') && sources.has(item.url) ? item.url : '' })),
    ideas: Array.isArray(input.ideas) ? input.ideas.slice(0, 8) : []
  };
}

async function generateTrendReport({ clients, focus, platforms, today }) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('Trend research is not configured. Add ANTHROPIC_API_KEY to the server environment.'), { status: 503 });
  const client = new Anthropic();
  const clientLines = clients.map((item) => `- ${item.name}: ${item.desc || 'No description yet.'}`).join('\n') || '- No clients yet.';
  const platformNames = platforms.map((platform) => TREND_PLATFORMS[platform]).join(', ');
  const messages = [{
    role: 'user',
    content: `Today is ${today}. Build this week's trend report for: ${platformNames}.\n\nFocus: ${focus}\n\nClients:\n${clientLines}`
  }];
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }, submitTool()];
  const sources = new Map();
  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn += 1) {
    const response = await client.beta.messages.create({
      model: TREND_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      tools,
      tool_choice: { type: 'auto' },
      messages
    });
    if (response.stop_reason === 'refusal') throw Object.assign(new Error('The trend request was declined. Try a different focus.'), { status: 422 });
    collectSearchResults(response.content, sources);
    const submission = response.content.find((block) => block.type === 'tool_use' && block.name === 'submit_trend_report');
    if (submission) {
      return { report: cleanReport(submission.input, sources), sources: [...sources.values()].slice(0, 40), model: response.model || TREND_MODEL };
    }
    if (response.stop_reason === 'max_tokens') throw new Error('The trend report ran out of room before it finished.');
    messages.push({ role: 'assistant', content: response.content });
    // pause_turn resumes on its own; after a normal end, remind it to submit.
    if (response.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: 'Please submit the report now with submit_trend_report.' });
  }
  throw new Error('Trend research did not finish. Try again in a few minutes.');
}

module.exports = { TREND_PLATFORMS, TREND_MODEL, generateTrendReport };
