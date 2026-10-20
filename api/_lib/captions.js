const { Anthropic } = require('@anthropic-ai/sdk');
const { assertPublicUrl, httpError } = require('./core');

// AI help in the Publishing Studio: caption drafts in a client's voice, and image descriptions.
const CAPTION_MODEL = 'claude-opus-5-5';
const NETWORK_NOTES = {
  facebook: 'Facebook: conversational, 1–3 short paragraphs, links are clickable.',
  instagram: 'Instagram: hook in the first line, line breaks for readability, up to about 8 relevant hashtags at the end, links are not clickable (say "link in bio" if needed). Max 2,200 characters.',
  linkedin: 'LinkedIn: professional and specific, a strong first line, 3–5 hashtags at most. Max 3,000 characters.',
  pinterest: 'Pinterest: a keyword-rich description that says what the Pin shows and why to save it. Max 500 characters.',
  tiktok: 'TikTok: short, punchy caption with 3–5 hashtags.',
  twitter: 'X: under 280 characters.',
  threads: 'Threads: casual, under 500 characters.',
  youtube: 'YouTube: a description whose first line works as a summary.',
  bluesky: 'Bluesky: under 300 characters.'
};

const CAPTIONS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['variants'],
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['platform', 'text'],
        properties: { platform: { type: 'string' }, text: { type: 'string', description: 'The full caption, ready to post.' } }
      }
    }
  }
};
const ALT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['altText'],
  properties: { altText: { type: 'string', description: 'One or two plain sentences describing the image for someone who cannot see it.' } }
};

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('AI writing help is not configured. Add ANTHROPIC_API_KEY to the server environment.'), { status: 503 });
  return new Anthropic();
}

function parse(response, schemaName) {
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('The request was declined. Try rewording it.'), { status: 422 });
  if (response.stop_reason === 'max_tokens') throw new Error(`The ${schemaName} ran out of room. Try a shorter request.`);
  return JSON.parse(response.content.find((block) => block.type === 'text')?.text || '{}');
}

async function draftCaptions({ idea, brandClient, platforms }) {
  const brand = brandClient.brand || {};
  const guidelines = [
    `Client: ${brandClient.name}${brandClient.desc ? ` — ${brandClient.desc}` : ''}`,
    brand.voice && `Brand voice: ${brand.voice}`,
    brand.requiredHashtags && `Always include: ${brand.requiredHashtags}`,
    brand.bannedWords && `Never use these words: ${brand.bannedWords}`
  ].filter(Boolean).join('\n');
  const response = await client().beta.messages.create({
    model: CAPTION_MODEL,
    max_tokens: 6000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: CAPTIONS_SCHEMA } },
    system: `You write social media captions for a brand, in its voice, for a social media manager to review and edit before posting. Write one caption per requested network, adapted to how that network works. Keep facts to what the brief says; don't invent prices, dates, offers, or claims. Use the exact network keys you were given for "platform".\n\n${guidelines}`,
    messages: [{ role: 'user', content: `Brief:\n${idea}\n\nWrite a caption for each of these networks:\n${platforms.map((platform) => `- ${platform} (${NETWORK_NOTES[platform] || 'follow the network’s usual conventions'})`).join('\n')}` }]
  });
  const wanted = new Set(platforms);
  return (parse(response, 'draft').variants || []).filter((item) => wanted.has(item.platform) && typeof item.text === 'string' && item.text.trim()).map((item) => ({ platform: item.platform, text: item.text.trim().slice(0, 5000) }));
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Downloads the image here and sends its bytes, since some hosts block the AI's own downloader.
// Each redirect is checked again so a public link can't lead to a private address.
async function fetchImage(raw) {
  let url = raw;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicUrl(url, 'Images');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { accept: 'image/*', 'user-agent': 'SignalDesk/1.0 (alt text)' } }).catch(() => null);
    if (!response) throw httpError(400, 'Couldn’t download that image. Check that the link opens in a browser.');
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) { url = new URL(response.headers.get('location'), url).href; continue; }
    if (!response.ok) throw httpError(400, `Couldn’t download that image (HTTP ${response.status}).`);
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) throw httpError(400, 'Alt text works with JPEG, PNG, GIF, or WebP images.');
    if (Number(response.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) throw httpError(400, 'That image is over 5 MB. Shrink it first with Prep image.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) throw httpError(400, 'That image is over 5 MB. Shrink it first with Prep image.');
    return { type, data: bytes.toString('base64') };
  }
  throw httpError(400, 'That image link redirects too many times.');
}

async function describeImage({ url, context }) {
  const image = await fetchImage(url);
  const response = await client().beta.messages.create({
    model: CAPTION_MODEL,
    max_tokens: 1000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ALT_SCHEMA } },
    system: 'You write alt text for images in social media posts. Describe what matters in the image plainly and briefly (under 250 characters when possible). Include any important text shown in the image. Don’t start with "Image of" or "Picture of", and don’t add hashtags or marketing language.',
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image.type, data: image.data } }, { type: 'text', text: context ? `The post this image goes with:\n${context}` : 'Describe this image.' }] }]
  });
  return String(parse(response, 'description').altText || '').trim().slice(0, 1000);
}

module.exports = { draftCaptions, describeImage };
