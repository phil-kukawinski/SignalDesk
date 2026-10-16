create table if not exists public.workspace_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_state enable row level security;

drop policy if exists "Users can read their workspace state" on public.workspace_state;
create policy "Users can read their workspace state"
  on public.workspace_state for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their workspace state" on public.workspace_state;
create policy "Users can create their workspace state"
  on public.workspace_state for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their workspace state" on public.workspace_state;
create policy "Users can update their workspace state"
  on public.workspace_state for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.workspace_state to authenticated;

create table if not exists public.social_profiles (
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  ayrshare_ref_id text not null,
  profile_key_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

alter table public.social_profiles enable row level security;
revoke all on public.social_profiles from anon, authenticated;
grant all on public.social_profiles to service_role;

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