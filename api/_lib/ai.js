const { AsyncLocalStorage } = require('node:async_hooks');
const { Anthropic } = require('@anthropic-ai/sdk');
// core is required when needed: some modules that core loads use this one.
const databaseRequest = (...args) => require('./core').databaseRequest(...args);

// Records what every AI request costs, per workspace and action, in the ai_usage table, so credit
// prices (docs/pricing-plan.md) come from real numbers instead of estimates. Only token and search
// counts are kept, never the prompt or the reply.

// US dollars per million tokens (Anthropic's published prices, November 2026). Cache writes cost
// 1.25 times input. Claude Haiku 5.5 costs 5 times as much for prompts over 100,000 tokens.
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.20 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.10 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.20 },
  'claude-haiku-5-5': { input: 0.10, output: 0.50, cacheRead: 0.01, longPrompt: 100000, longMultiplier: 5 }
};
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches
const KEEP_DAYS = 400;

const scope = new AsyncLocalStorage();

// Runs fn with the workspace and action that AI requests inside it are recorded against.
function withAiUsage(context, fn) {
  return scope.run({ workspaceId: context.workspaceId || null, action: context.action || 'unknown' }, fn);
}

function usageCost(model, usage = {}) {
  const price = PRICES[String(model || '').replace(/-\d{8}$/, '')];
  const searches = usage.server_tool_use?.web_search_requests || 0;
  if (!price) return null;
  const input = usage.input_tokens || 0, cacheRead = usage.cache_read_input_tokens || 0, cacheWrite = usage.cache_creation_input_tokens || 0;
  const scale = price.longPrompt && input + cacheRead + cacheWrite > price.longPrompt ? price.longMultiplier : 1;
  const dollars = (input * price.input + cacheWrite * price.input * 1.25 + cacheRead * price.cacheRead + (usage.output_tokens || 0) * price.output) * scale / 1e6;
  return Math.round((dollars + searches * WEB_SEARCH_USD) * 1e5) / 1e5;
}

async function recordAiUsage(response) {
  const context = scope.getStore();
  const usage = response?.usage;
  if (!context || !usage) return;
  try {
    await databaseRequest('ai_usage', {
      method: 'POST', headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        workspace_id: context.workspaceId, action: context.action, model: response.model || 'unknown',
        input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0,
        cache_read_tokens: usage.cache_read_input_tokens || 0, cache_write_tokens: usage.cache_creation_input_tokens || 0,
        web_searches: usage.server_tool_use?.web_search_requests || 0, cost_usd: usageCost(response.model, usage)
      })
    });
  } catch {
    // Recording is for pricing research. A missing table (before the database update) never breaks AI help.
  }
}

// An Anthropic client whose replies are recorded. Same interface as new Anthropic().
function trackedClient(options) {
  const client = new Anthropic(options);
  const messages = client.beta.messages;
  const create = messages.create.bind(messages), stream = messages.stream.bind(messages);
  messages.create = (params, options) => {
    // Streams (including the SDK's own stream helper, which calls create) are recorded at finalMessage.
    if (params?.stream) return create(params, options);
    return create(params, options).then(async (response) => {
      await recordAiUsage(response);
      return response;
    });
  };
  messages.stream = (...args) => {
    const running = stream(...args);
    const finalMessage = running.finalMessage.bind(running);
    running.finalMessage = async () => {
      const response = await finalMessage();
      await recordAiUsage(response);
      return response;
    };
    return running;
  };
  return client;
}

async function cleanupAiUsage({ now = Date.now() } = {}) {
  await databaseRequest(`ai_usage?created_at=lt.${new Date(now - KEEP_DAYS * 86400000).toISOString()}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
}

module.exports = { PRICES, WEB_SEARCH_USD, withAiUsage, usageCost, recordAiUsage, trackedClient, cleanupAiUsage };
