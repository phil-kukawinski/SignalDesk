-- SignalDesk schema. Safe to re-run: it creates missing objects and migrates
-- older single-user installs (workspace_state keyed by user_id) to team workspaces.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My workspace',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_email_idx on public.workspace_members (email);

create table if not exists public.workspace_invites (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'user')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, email)
);

create table if not exists public.workspace_state (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_profiles (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  ayrshare_ref_id text not null,
  profile_key_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, client_id)
);

-- Migrate single-user installs: each existing user becomes the admin of their own workspace.
do $$
declare
  legacy record;
  ws uuid;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workspace_state' and column_name = 'user_id') then
    alter table public.workspace_state add column if not exists workspace_id uuid;
    alter table public.workspace_state add column if not exists updated_by uuid;
    for legacy in select s.user_id, s.state from public.workspace_state s where s.workspace_id is null loop
      ws := null;
      select m.workspace_id into ws from public.workspace_members m where m.user_id = legacy.user_id;
      if ws is null then
        insert into public.workspaces (name, created_by)
        values (coalesce(nullif(legacy.state -> 'settings' ->> 'name', ''), 'My workspace'), legacy.user_id)
        returning id into ws;
        insert into public.workspace_members (workspace_id, user_id, email, role)
        select ws, u.id, lower(coalesce(u.email, '')), 'admin' from auth.users u where u.id = legacy.user_id;
      end if;
      update public.workspace_state set workspace_id = ws, updated_by = legacy.user_id where user_id = legacy.user_id;
    end loop;
    drop policy if exists "Users can read their workspace state" on public.workspace_state;
    drop policy if exists "Users can create their workspace state" on public.workspace_state;
    drop policy if exists "Users can update their workspace state" on public.workspace_state;
    alter table public.workspace_state drop constraint if exists workspace_state_pkey;
    alter table public.workspace_state drop column user_id;
    alter table public.workspace_state alter column workspace_id set not null;
    alter table public.workspace_state add primary key (workspace_id);
    alter table public.workspace_state add constraint workspace_state_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces (id) on delete cascade;
    alter table public.workspace_state add constraint workspace_state_updated_by_fkey
      foreign key (updated_by) references auth.users (id) on delete set null;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'social_profiles' and column_name = 'user_id') then
    alter table public.social_profiles add column if not exists workspace_id uuid;
    update public.social_profiles p set workspace_id = m.workspace_id
      from public.workspace_members m where m.user_id = p.user_id and p.workspace_id is null;
    delete from public.social_profiles where workspace_id is null;
    alter table public.social_profiles drop constraint if exists social_profiles_pkey;
    alter table public.social_profiles drop column user_id;
    alter table public.social_profiles alter column workspace_id set not null;
    alter table public.social_profiles add primary key (workspace_id, client_id);
    alter table public.social_profiles add constraint social_profiles_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces (id) on delete cascade;
  end if;
end $$;

create table if not exists public.user_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.autopilot_feeds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  url text not null,
  feed_title text,
  platforms text[] not null,
  days int[] not null default '{1,2,3,4,5}',
  times text[] not null default '{09:00}',
  template text not null default E'{title}\n\n{link}',
  mode text not null default 'review' check (mode in ('review', 'auto')),
  include_image boolean not null default true,
  include_keywords text not null default '',
  exclude_keywords text not null default '',
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists autopilot_feeds_workspace_idx on public.autopilot_feeds (workspace_id);

create table if not exists public.autopilot_items (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.autopilot_feeds (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  guid text not null,
  title text,
  link text,
  image_url text,
  published_at timestamptz,
  status text not null check (status in ('baseline', 'filtered', 'skipped', 'scheduled', 'in_review', 'failed')),
  scheduled_for timestamptz,
  platforms text[],
  provider_post_id text,
  error text,
  created_at timestamptz not null default now(),
  unique (feed_id, guid)
);
create index if not exists autopilot_items_workspace_idx on public.autopilot_items (workspace_id, scheduled_for);

create table if not exists public.scheduled_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  provider_post_id text not null,
  platforms text[] not null,
  comment text not null,
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'posted', 'failed')),
  attempts int not null default 0,
  last_error text,
  posted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_comments_due_idx on public.scheduled_comments (status, run_at);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  category text not null check (category in ('approvals', 'autopilot', 'reports', 'team', 'publishing')),
  title text not null,
  body text not null default '',
  view text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  email_frequency text not null default 'daily' check (email_frequency in ('immediate', 'daily', 'weekly', 'off')),
  email_categories text[] not null default '{approvals,autopilot,reports,team,publishing}',
  weekly_day int not null default 1 check (weekly_day between 0 and 6),
  last_digest_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Who submitted each held post, so the approver's decision can notify them.
create table if not exists public.post_submissions (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider_post_id text not null,
  client_id text not null,
  submitted_by uuid references auth.users (id) on delete set null,
  title text,
  platforms text[],
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, provider_post_id)
);

create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  week_start date not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, client_id, week_start)
);

create table if not exists public.trend_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  focus text not null,
  platforms text[] not null,
  data jsonb not null,
  model text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists trend_reports_workspace_idx on public.trend_reports (workspace_id, created_at desc);

-- Accounts connected directly to Facebook, Instagram, LinkedIn, and Pinterest. Tokens are
-- encrypted by the server with SOCIAL_PROFILE_ENCRYPTION_KEY.
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  platform text not null check (platform in ('facebook', 'instagram', 'linkedin', 'pinterest')),
  external_id text not null,
  display_name text,
  username text,
  profile_url text,
  image_url text,
  token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'needs_reauth')),
  last_error text,
  expiry_notified_at timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, client_id, platform)
);

-- Short-lived sign-in attempts with Meta, LinkedIn, or Pinterest.
create table if not exists public.oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  provider text not null check (provider in ('meta', 'linkedin', 'pinterest')),
  status text not null default 'started' check (status in ('started', 'authorized', 'completed', 'failed')),
  candidates jsonb not null default '[]'::jsonb,
  secret_ciphertext text,
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Posts SignalDesk publishes itself at the scheduled time.
create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  created_by uuid references auth.users (id) on delete set null,
  title text not null default '',
  source text not null default 'composer' check (source in ('composer', 'autopilot')),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('pending_approval', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'canceled')),
  content jsonb not null,
  options jsonb not null default '{}'::jsonb,
  parent_id uuid references public.scheduled_posts (id) on delete cascade,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduled_posts_workspace_idx on public.scheduled_posts (workspace_id, scheduled_for);
create index if not exists scheduled_posts_parent_idx on public.scheduled_posts (parent_id);

-- One job per post and network, so each destination succeeds, fails, and retries on its own.
create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.scheduled_posts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  platform text not null,
  provider text not null check (provider in ('direct', 'ayrshare')),
  connection_id uuid references public.social_connections (id) on delete set null,
  run_at timestamptz not null,
  status text not null default 'queued'
    check (status in ('held', 'queued', 'publishing', 'published', 'failed', 'unknown', 'canceled')),
  attempts int not null default 0,
  locked_at timestamptz,
  lock_token uuid,
  sent_at timestamptz,
  stage jsonb not null default '{}'::jsonb,
  external_id text,
  external_url text,
  last_error text,
  error_kind text,
  published_at timestamptz,
  notified_at timestamptz,
  metrics jsonb,
  metrics_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, platform)
);
create index if not exists publish_jobs_due_idx on public.publish_jobs (status, run_at);
create index if not exists publish_jobs_workspace_idx on public.publish_jobs (workspace_id, published_at);

create table if not exists public.publish_attempts (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.publish_jobs (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  outcome text not null,
  error text,
  error_kind text
);
create index if not exists publish_attempts_job_idx on public.publish_attempts (job_id);

-- Campaign labels, evergreen recycling, and the client's review decision on scheduled posts.
alter table public.scheduled_posts add column if not exists campaign text;
alter table public.scheduled_posts add column if not exists evergreen boolean not null default false;
alter table public.scheduled_posts add column if not exists recycled_at timestamptz;
alter table public.scheduled_posts add column if not exists client_status text;
alter table public.scheduled_posts drop constraint if exists scheduled_posts_client_status_check;
alter table public.scheduled_posts add constraint scheduled_posts_client_status_check check (client_status in ('approved', 'changes_requested'));
create index if not exists scheduled_posts_campaign_idx on public.scheduled_posts (workspace_id, campaign);

-- Private links that let a client review upcoming posts without a SignalDesk account.
-- Only a hash of each link's secret is stored.
create table if not exists public.review_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  token_hash text not null unique,
  label text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz
);

-- Conversation on a post: team notes and client comments or decisions.
create table if not exists public.post_notes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.scheduled_posts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null,
  author_kind text not null check (author_kind in ('team', 'client')),
  body text not null default '',
  decision text check (decision in ('approved', 'changes_requested')),
  created_at timestamptz not null default now()
);
create index if not exists post_notes_post_idx on public.post_notes (post_id, created_at);

-- Manual reminders: networks you post to yourself get a reminder job instead of an API call.
alter table public.publish_jobs drop constraint if exists publish_jobs_provider_check;
alter table public.publish_jobs add constraint publish_jobs_provider_check check (provider in ('direct', 'ayrshare', 'manual'));
alter table public.publish_jobs drop constraint if exists publish_jobs_status_check;
alter table public.publish_jobs add constraint publish_jobs_status_check
  check (status in ('held', 'queued', 'publishing', 'manual_due', 'published', 'failed', 'unknown', 'canceled'));

-- What happened to each post and who did it, including the content before each edit.
create table if not exists public.post_history (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.scheduled_posts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_name text,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists post_history_post_idx on public.post_history (post_id, created_at);

-- Browser push subscriptions, one row per device.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Public link-in-bio pages; the page content lives with the client in workspace state.
create table if not exists public.bio_pages (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,40}$'),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (workspace_id, client_id)
);

-- Requests from Meta to delete someone's data after they remove SignalDesk from their Facebook
-- settings. Only the confirmation code and outcome are kept, so the person can check the status.
create table if not exists public.data_deletion_requests (
  code text primary key check (code ~ '^[a-f0-9]{24}$'),
  platform text not null check (platform in ('meta')),
  status text not null default 'received' check (status in ('received', 'completed')),
  connections_removed integer not null default 0,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- When each background job last ran, so a stopped scheduler can be noticed.
create table if not exists public.worker_runs (
  name text primary key,
  last_run_at timestamptz not null,
  last_result jsonb not null default '{}'::jsonb
);

alter table public.scheduled_comments add column if not exists job_id uuid references public.publish_jobs (id) on delete cascade;
alter table public.scheduled_comments alter column provider_post_id drop not null;
alter table public.autopilot_items add column if not exists post_id uuid references public.scheduled_posts (id) on delete set null;

-- Keeps each post's status in step with its per-network jobs.
create or replace function public.refresh_post_status(target uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  current_status text;
  total int; held int; queued int; running int; done int; bad int;
  next_status text;
begin
  select p.status into current_status from public.scheduled_posts p where p.id = target;
  if current_status is null or current_status = 'canceled' then return; end if;
  select count(*) filter (where j.status <> 'canceled'),
         count(*) filter (where j.status = 'held'),
         count(*) filter (where j.status = 'queued'),
         count(*) filter (where j.status in ('publishing', 'manual_due')),
         count(*) filter (where j.status = 'published'),
         count(*) filter (where j.status in ('failed', 'unknown'))
    into total, held, queued, running, done, bad
    from public.publish_jobs j where j.post_id = target;
  if total = 0 then next_status := 'canceled';
  elsif held > 0 then next_status := 'pending_approval';
  elsif running > 0 or (queued > 0 and (done > 0 or bad > 0)) then next_status := 'publishing';
  elsif queued > 0 then next_status := 'scheduled';
  elsif done = total then next_status := 'published';
  elsif done > 0 then next_status := 'partial';
  else next_status := 'failed';
  end if;
  update public.scheduled_posts set status = next_status, updated_at = now()
    where id = target and status is distinct from next_status;
end;
$$;

create or replace function public.publish_job_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.refresh_post_status(new.post_id);
  return new;
end;
$$;
drop trigger if exists publish_job_changed on public.publish_jobs;
create trigger publish_job_changed after insert or update of status on public.publish_jobs
  for each row execute function public.publish_job_changed();

-- Claims due jobs for one worker run. Jobs stuck mid-publish for 10 minutes are retried
-- if nothing reached the network yet, and otherwise flagged for a manual check so a
-- post is never published twice.
create or replace function public.claim_publish_jobs(p_limit int, p_token uuid)
returns setof public.publish_jobs
language plpgsql security definer set search_path = public
as $$
begin
  update public.publish_jobs
    set status = case when sent_at is null then 'queued' else 'unknown' end,
        last_error = case when sent_at is null then last_error
          else 'Publishing was interrupted after the post was sent to the network. Check the account before retrying.' end,
        error_kind = case when sent_at is null then error_kind else 'unknown' end,
        lock_token = null, locked_at = null, updated_at = now()
    where status = 'publishing' and locked_at < now() - interval '10 minutes';
  return query
    update public.publish_jobs j
      set status = 'publishing', locked_at = now(), lock_token = p_token, attempts = j.attempts + 1, updated_at = now()
      where j.id in (
        select q.id from public.publish_jobs q
        where q.status = 'queued' and q.run_at <= now()
        order by q.run_at
        limit p_limit
        for update skip locked
      )
      returning j.*;
end;
$$;
revoke all on function public.refresh_post_status(uuid) from public, anon, authenticated;
revoke all on function public.publish_job_changed() from public, anon, authenticated;
revoke all on function public.claim_publish_jobs(int, uuid) from public, anon, authenticated;
grant execute on function public.claim_publish_jobs(int, uuid) to service_role;

-- Role lookup used by row-level security.
create or replace function public.workspace_role(target uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select m.role from public.workspace_members m where m.workspace_id = target and m.user_id = auth.uid()
$$;
revoke all on function public.workspace_role(uuid) from public;
grant execute on function public.workspace_role(uuid) to authenticated;

-- Called by the app after sign-in: joins a pending invite (verified email only) or creates a new workspace.
create or replace function public.ensure_workspace()
returns table (workspace_id uuid, role text, workspace_name text)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  user_email text;
  confirmed boolean;
  ws uuid;
  member_role text;
  invite record;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select lower(coalesce(u.email, '')), u.email_confirmed_at is not null into user_email, confirmed from auth.users u where u.id = uid;
  select m.workspace_id, m.role into ws, member_role from public.workspace_members m where m.user_id = uid;
  if ws is null and confirmed then
    select i.* into invite from public.workspace_invites i where i.email = user_email order by i.created_at limit 1;
    if found then
      insert into public.workspace_members (workspace_id, user_id, email, role) values (invite.workspace_id, uid, user_email, invite.role);
      delete from public.workspace_invites i where i.email = user_email;
      insert into public.notifications (workspace_id, user_id, type, category, title, body, view)
      select invite.workspace_id, m.user_id, 'member_joined', 'team', user_email || ' joined the workspace',
        'They have ' || case when invite.role = 'admin' then 'Admin' else 'User' end || ' access.', 'settings'
      from public.workspace_members m where m.workspace_id = invite.workspace_id and m.role = 'admin' and m.user_id <> uid;
      ws := invite.workspace_id;
      member_role := invite.role;
    end if;
  end if;
  if ws is null then
    insert into public.workspaces (name, created_by) values ('My workspace', uid) returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, email, role) values (ws, uid, user_email, 'admin');
    member_role := 'admin';
  end if;
  insert into public.workspace_state (workspace_id, updated_by) values (ws, uid) on conflict (workspace_id) do nothing;
  return query select ws, member_role, w.name from public.workspaces w where w.id = ws;
end;
$$;
revoke all on function public.ensure_workspace() from public;
grant execute on function public.ensure_workspace() to authenticated;

-- Members with the User role can save posts and drafts but cannot change clients, settings, or approvals.
create or replace function public.guard_workspace_state()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.workspace_role(new.workspace_id) = 'admin' then return new; end if;
  if (new.state -> 'clients') is distinct from (old.state -> 'clients')
    or (new.state -> 'settings') is distinct from (old.state -> 'settings') then
    raise exception 'Only workspace admins can change clients or settings.';
  end if;
  if (select count(*) from jsonb_array_elements(case when jsonb_typeof(new.state -> 'approvals') = 'array' then new.state -> 'approvals' else '[]'::jsonb end) e where e ->> 'status' = 'Approved')
    > (select count(*) from jsonb_array_elements(case when jsonb_typeof(old.state -> 'approvals') = 'array' then old.state -> 'approvals' else '[]'::jsonb end) e where e ->> 'status' = 'Approved') then
    raise exception 'Only workspace admins can approve posts.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_workspace_state on public.workspace_state;
create trigger guard_workspace_state before update on public.workspace_state
  for each row execute function public.guard_workspace_state();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.workspace_state enable row level security;
alter table public.social_profiles enable row level security;
alter table public.user_drafts enable row level security;
alter table public.autopilot_feeds enable row level security;
alter table public.autopilot_items enable row level security;
alter table public.scheduled_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.post_submissions enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.trend_reports enable row level security;
alter table public.social_connections enable row level security;
alter table public.oauth_sessions enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.publish_jobs enable row level security;
alter table public.publish_attempts enable row level security;
alter table public.worker_runs enable row level security;
alter table public.review_links enable row level security;
alter table public.post_notes enable row level security;
alter table public.post_history enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.bio_pages enable row level security;
alter table public.data_deletion_requests enable row level security;

-- Team, provider, publishing, Autopilot, comment, report, and trend tables are managed only by the server API.
revoke all on public.workspaces, public.workspace_members, public.workspace_invites, public.social_profiles,
  public.autopilot_feeds, public.autopilot_items, public.scheduled_comments, public.post_submissions,
  public.weekly_reports, public.trend_reports, public.social_connections, public.oauth_sessions,
  public.scheduled_posts, public.publish_jobs, public.publish_attempts, public.worker_runs, public.review_links, public.post_notes, public.post_history, public.push_subscriptions,
  public.bio_pages, public.data_deletion_requests from anon, authenticated;
grant all on public.workspaces, public.workspace_members, public.workspace_invites, public.social_profiles,
  public.autopilot_feeds, public.autopilot_items, public.scheduled_comments, public.workspace_state, public.user_drafts,
  public.notifications, public.notification_preferences, public.post_submissions, public.weekly_reports,
  public.trend_reports, public.social_connections, public.oauth_sessions, public.scheduled_posts,
  public.publish_jobs, public.publish_attempts, public.worker_runs, public.review_links, public.post_notes, public.post_history, public.push_subscriptions,
  public.bio_pages, public.data_deletion_requests to service_role;

-- People read their own notifications and can only mark them read.
drop policy if exists "Users can read their notifications" on public.notifications;
create policy "Users can read their notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can mark their notifications read" on public.notifications;
create policy "Users can mark their notifications read"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "Users can manage their notification preferences" on public.notification_preferences;
create policy "Users can manage their notification preferences"
  on public.notification_preferences for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and (workspace_id is null or public.workspace_role(workspace_id) is not null));
revoke all on public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant insert (user_id, workspace_id, email_frequency, email_categories, weekly_day, updated_at),
  update (user_id, workspace_id, email_frequency, email_categories, weekly_day, updated_at)
  on public.notification_preferences to authenticated;

drop policy if exists "Members can read workspace state" on public.workspace_state;
create policy "Members can read workspace state"
  on public.workspace_state for select
  to authenticated
  using (public.workspace_role(workspace_id) is not null);

drop policy if exists "Members can update workspace state" on public.workspace_state;
create policy "Members can update workspace state"
  on public.workspace_state for update
  to authenticated
  using (public.workspace_role(workspace_id) is not null)
  with check (public.workspace_role(workspace_id) is not null);

revoke all on public.workspace_state from anon;
revoke insert, delete on public.workspace_state from authenticated;
grant select, update on public.workspace_state to authenticated;

drop policy if exists "Users can manage their own draft" on public.user_drafts;
create policy "Users can manage their own draft"
  on public.user_drafts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and (workspace_id is null or public.workspace_role(workspace_id) is not null));

revoke all on public.user_drafts from anon;
grant select, insert, update on public.user_drafts to authenticated;

insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do nothing;

drop policy if exists "Users can upload their social media" on storage.objects;
create policy "Users can upload their social media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'social-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can manage their social media" on storage.objects;
create policy "Users can manage their social media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'social-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Run the worker from Supabase (works on any Vercel plan). Enable the pg_cron and pg_net
-- extensions first, replace the URL and secret below, and run this block once.
-- The first job publishes due posts every minute; the second runs Autopilot, comments,
-- token checks, reports, and email digests every 10 minutes.
-- select cron.schedule('signaldesk-publish', '* * * * *', $cron$
--   select net.http_post(
--     url := 'https://YOUR-APP.vercel.app/api/cron?only=publish',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
-- $cron$);
-- select cron.schedule('signaldesk-worker', '*/10 * * * *', $cron$
--   select net.http_post(
--     url := 'https://YOUR-APP.vercel.app/api/cron',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
-- $cron$);
