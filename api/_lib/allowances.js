// What each workspace may use. Every limit check on the server reads it from here, so when plans,
// comps, and trials arrive (docs/pricing-plan.md, section 2a) this is the one place that changes.
// During the beta every workspace gets the same allowances.
//
// The client limit is also enforced in the database: keep workspace_client_limit() in
// supabase/schema.sql in step with `clients` below (tests/unit/allowances.test.js checks).

const envNumber = (name, fallback) => Math.max(1, parseInt(process.env[name], 10) || fallback);

const BETA = Object.freeze({
  plan: 'beta',
  clients: 50,
  teamMembers: 25,
  // New posts in any 24 hours: the fair-use limit on every plan.
  postsPerDay: 150,
  // AI writing help per day (caption drafts, image descriptions, Fill from website, campaign questions, rewrites, planning notes).
  aiPerDay: envNumber('AI_DAILY_LIMIT', 30),
  // Whole campaign plans are the largest AI request after trend scans.
  campaignPlansPerDay: envNumber('CAMPAIGN_DAILY_LIMIT', 3),
  trendScansPerWeek: envNumber('TREND_WEEKLY_LIMIT', 1),
  // Failed scans leave no report but still cost money, so tries are capped too.
  trendTriesPerDay: 2,
  // No storage limit yet. Usage is measured in media_files.
  storageBytes: null
});

// Daily counters and the allowance each one is held to.
const DAILY_COUNTERS = { 'ai-usage': 'aiPerDay', 'campaign-usage': 'campaignPlansPerDay', 'trend-tries': 'trendTriesPerDay' };

// eslint-disable-next-line no-unused-vars -- the workspace decides the plan once billing exists
async function workspaceAllowances(workspaceId) {
  return { ...BETA };
}

module.exports = { BETA, DAILY_COUNTERS, workspaceAllowances };
