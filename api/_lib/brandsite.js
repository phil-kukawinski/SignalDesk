const { Anthropic } = require('@anthropic-ai/sdk');
const { assertPublicUrl, httpError } = require('./core');

// Brand kit → "Fill from website": reads a client's homepage (and its About page, if linked),
// then has Claude draft the brand kit fields. Nothing is saved until the person reviews and saves.

const MODEL = 'claude-opus-5-5';
const MAX_HTML = 600000;
const SOCIAL_HOSTS = { instagram: /instagram\.com\/([A-Za-z0-9._]{1,30})/i, facebook: /facebook\.com\/([A-Za-z0-9.\-]{2,80})/i, linkedin: /linkedin\.com\/(company|in)\/([A-Za-z0-9\-_%]{2,100})/i, pinterest: /pinterest\.[a-z.]+\/([A-Za-z0-9_]{2,30})/i, tiktok: /tiktok\.com\/@([A-Za-z0-9._]{2,30})/i, x: /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})/i, youtube: /youtube\.com\/(@[A-Za-z0-9._-]{2,40}|channel\/[A-Za-z0-9_-]+)/i };
const IGNORE_SOCIAL = /^(share|sharer|intent|home|login|p|reel|explore|hashtag|watch|embed|plugins|dialog|tr)$/i;

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['description', 'voice', 'audience', 'requiredHashtags', 'avoidWords', 'watchTerms', 'primaryColor', 'secondaryColor', 'logoUrl', 'contentPillars'],
  properties: {
    description: { type: 'string', description: 'What the business does, in one or two plain sentences (under 300 characters).' },
    voice: { type: 'string', description: 'Brand voice guidance for someone writing their social posts: tone, how they talk to customers, what to emphasize, what to avoid. 2–5 short sentences, under 900 characters.' },
    audience: { type: 'string', description: 'Who they sell to, in one sentence.' },
    requiredHashtags: { type: 'array', items: { type: 'string' }, description: 'At most 2 branded hashtags they clearly use or would use (e.g. #harborcoffee). Empty if none fit.' },
    avoidWords: { type: 'array', items: { type: 'string' }, description: 'Up to 5 words or claims that would clash with this brand or be risky (e.g. "cheapest", "guaranteed"). Empty if none stand out.' },
    watchTerms: { type: 'array', items: { type: 'string' }, description: 'Brand name, main product or service names, up to 6.' },
    primaryColor: { type: 'string', description: 'The main brand color as #rrggbb, chosen from the candidates; empty string if unclear.' },
    secondaryColor: { type: 'string', description: 'A second brand color as #rrggbb from the candidates; empty string if unclear.' },
    logoUrl: { type: 'string', description: 'The best logo image URL from the candidates (prefer an actual logo over a favicon); empty string if none.' },
    contentPillars: { type: 'array', items: { type: 'string' }, description: 'Three to five recurring post topics that fit this business.' }
  }
};

async function fetchHtml(raw) {
  let target = raw;
  for (let hop = 0; hop < 5; hop += 1) {
    const checked = await assertPublicUrl(target, 'Websites');
    const response = await fetch(checked, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; SignalDeskBot/1.0; brand kit)' } }).catch(() => null);
    if (!response) throw httpError(400, 'Couldn’t reach that website. Check the address and try again.');
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) { target = new URL(location, checked).href; continue; }
    if (!response.ok) throw httpError(400, `The website answered with HTTP ${response.status}.`);
    if (!/html/i.test(response.headers.get('content-type') || '')) throw httpError(400, 'That address isn’t a web page.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < MAX_HTML) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
    return { html, url: target };
  }
  throw httpError(400, 'That website redirects too many times.');
}

const decode = (text) => String(text || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
function absolute(href, base) { try { const url = new URL(decode(href), base); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; } }
function meta(html, names) {
  for (const name of names) {
    const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i').exec(html)?.[0];
    const content = tag && /content=(["'])([\s\S]*?)\1/i.exec(tag)?.[2];
    if (content?.trim()) return decode(content.trim());
  }
  return '';
}

function pageText(html) {
  return decode(html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/section)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line.length > 2).join('\n').slice(0, 9000);
}

// Hex colors from theme-color, inline styles, CSS variables, and <style> blocks, most frequent first.
function colorCandidates(html) {
  const counts = new Map();
  const add = (hex, weight = 1) => {
    let value = hex.toLowerCase();
    if (value.length === 4) value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    if (!/^#[0-9a-f]{6}$/.test(value)) return;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread < 18) return; // skip whites, blacks, and grays: brand colors have a hue
    counts.set(value, (counts.get(value) || 0) + weight);
  };
  const theme = meta(html, ['theme-color', 'msapplication-TileColor']);
  if (theme) add(theme, 20);
  for (const match of html.matchAll(/--[\w-]*(?:primary|brand|accent|secondary|main)[\w-]*\s*:\s*(#[0-9a-f]{3,6})\b/gi)) add(match[1], 8);
  for (const match of html.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![0-9a-f])/gi)) add(match[0]);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([hex]) => hex);
}

function logoCandidates(html, base) {
  const found = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/logo/i.test(tag)) continue;
    const src = /\s(?:src|data-src)=["']([^"']+)["']/i.exec(tag)?.[1];
    const url = src && absolute(src, base);
    if (url) found.push(url);
  }
  const og = meta(html, ['og:logo']);
  if (og) found.push(absolute(og, base));
  for (const match of html.matchAll(/<link[^>]+rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]*>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(match[0])?.[1];
    if (href) found.push(absolute(href, base));
  }
  return [...new Set(found.filter(Boolean))].slice(0, 6);
}

function socialLinks(html) {
  const links = {};
  for (const match of html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)) {
    for (const [network, pattern] of Object.entries(SOCIAL_HOSTS)) {
      if (links[network]) continue;
      const found = pattern.exec(match[1]);
      const handle = found && (found[2] || found[1]);
      if (handle && !IGNORE_SOCIAL.test(handle)) links[network] = match[1].split('?')[0];
    }
  }
  return links;
}

function aboutLink(html, base) {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi)) {
    if (/about|our story|who we are/i.test(match[2].replace(/<[^>]+>/g, '')) || /\/about/i.test(match[1])) {
      const url = absolute(match[1], base);
      if (url && new URL(url).hostname === new URL(base).hostname && url !== base) return url;
    }
  }
  return '';
}

async function readSite(rawUrl) {
  const start = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const home = await fetchHtml(start);
  const about = aboutLink(home.html, home.url);
  const aboutPage = about ? await fetchHtml(about).catch(() => null) : null;
  const title = meta(home.html, ['og:site_name', 'og:title']) || decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(home.html)?.[1] || '').trim());
  return {
    url: home.url, title, description: meta(home.html, ['description', 'og:description']),
    image: absolute(meta(home.html, ['og:image']), home.url),
    colors: colorCandidates(home.html + (aboutPage?.html || '')), logos: logoCandidates(home.html, home.url),
    social: socialLinks(home.html), homeText: pageText(home.html), aboutText: aboutPage ? pageText(aboutPage.html).slice(0, 5000) : '', aboutUrl: aboutPage?.url || ''
  };
}

async function brandFromSite({ url, clientName }) {
  if (!process.env.ANTHROPIC_API_KEY) throw httpError(503, 'AI isn’t set up on this server. Add ANTHROPIC_API_KEY in Vercel.');
  if (typeof url !== 'string' || !url.trim() || url.length > 500) throw httpError(400, 'Enter the client’s website.');
  const site = await readSite(url.trim());
  if (site.homeText.length < 80 && !site.description) throw httpError(422, 'That page has almost no readable text (it may be built entirely with scripts). Fill in the brand kit by hand, or try their About page address.');
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL, max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: 'You help a social media manager set up a brand kit for a client from the client’s own website. Base everything on what the site says and how it says it. Write the voice guidance as practical instructions for writing their social posts. Don’t invent facts, awards, or claims. Pick colors and the logo only from the candidates given.',
    messages: [{ role: 'user', content: `Client name in SignalDesk: ${clientName || '(not given)'}\nWebsite: ${site.url}\nPage title: ${site.title}\nMeta description: ${site.description}\n\nColor candidates (most used first): ${site.colors.join(', ') || 'none'}\nLogo candidates: ${site.logos.join(' ') || 'none'}\n\nHomepage text:\n${site.homeText}\n${site.aboutText ? `\nAbout page (${site.aboutUrl}):\n${site.aboutText}` : ''}` }]
  });
  if (response.stop_reason === 'refusal') throw httpError(422, 'The AI couldn’t draft a brand kit from this site.');
  const text = response.content.find((block) => block.type === 'text')?.text || '{}';
  const draft = JSON.parse(text);
  const hex = (value) => (/^#[0-9a-f]{6}$/i.test(value || '') && site.colors.includes(value.toLowerCase()) ? value.toLowerCase() : '');
  const tag = (value) => { const clean = String(value || '').replace(/[^\p{L}\p{N}_]/gu, ''); return clean ? `#${clean}` : ''; };
  return {
    site: { url: site.url, title: site.title, aboutUrl: site.aboutUrl, image: site.image },
    description: String(draft.description || '').slice(0, 400),
    voice: [String(draft.voice || '').trim(), draft.audience ? `Audience: ${String(draft.audience).trim()}` : '', draft.contentPillars?.length ? `Recurring topics: ${draft.contentPillars.slice(0, 5).join('; ')}.` : ''].filter(Boolean).join('\n\n').slice(0, 1500),
    requiredHashtags: [...new Set((draft.requiredHashtags || []).map(tag).filter(Boolean))].slice(0, 2).join(' '),
    avoidWords: [...new Set((draft.avoidWords || []).map((word) => String(word).trim()).filter(Boolean))].slice(0, 5).join(', '),
    watchTerms: [...new Set((draft.watchTerms || []).map((word) => String(word).trim()).filter(Boolean))].slice(0, 6).join(', '),
    colors: [hex(draft.primaryColor), hex(draft.secondaryColor)].filter(Boolean),
    logo: site.logos.includes(draft.logoUrl) ? draft.logoUrl : '',
    social: site.social
  };
}

module.exports = { brandFromSite, readSite, colorCandidates, logoCandidates, socialLinks };
