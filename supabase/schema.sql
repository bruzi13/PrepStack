-- PrepStack: tables for the interview-prep site (its own Supabase project).
-- Run once: Supabase -> SQL Editor -> New query -> paste -> Run. Safe to run again.

create table if not exists public.prep_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  role_key text,
  answers jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prep_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track text not null default 'main',            -- 'main' | 'ai'
  role_key text,
  title text,
  data jsonb not null default '{}',              -- summary, market notes, sources
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prep_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.prep_plans(id) on delete cascade,
  track text not null default 'main',
  module text not null,
  title text not null,
  description text,
  kind text not null default 'concept',          -- concept | coding | design | practical | behavioral
  ord int not null default 0,
  priority int not null default 2,
  est_minutes int not null default 30,
  status text not null default 'todo',           -- todo | learning | done
  mastery real not null default 0,               -- 0..100
  reviews int not null default 0,
  interval_days real not null default 0,
  next_review date,
  last_score real,
  created_at timestamptz not null default now()
);

create table if not exists public.prep_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.prep_topics(id) on delete cascade,
  topic_kind text,
  format text not null,
  choice jsonb,                                  -- why this format was picked (the algorithm's numbers)
  content jsonb not null default '{}',
  status text not null default 'ready',          -- ready | done
  score real,
  minutes real,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.prep_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid references public.prep_lessons(id) on delete cascade,
  topic_id uuid references public.prep_topics(id) on delete cascade,
  kind text not null,
  submission jsonb,
  score real,
  review jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.prep_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid references public.prep_lessons(id) on delete cascade,
  topic_kind text,
  format text not null,
  rating int check (rating between 1 and 5),
  difficulty int check (difficulty between 1 and 5),
  wanted text,
  comment text check (char_length(comment) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.prep_interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  config jsonb not null default '{}',
  transcript jsonb not null default '[]',
  workspace jsonb,
  scorecard jsonb,
  score real,
  status text not null default 'live',           -- live | done
  created_at timestamptz not null default now()
);

-- One row per AI request. The site inserts the request; only the server (service role) writes the result.
create table if not exists public.prep_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  input jsonb not null default '{}',
  status text not null default 'queued',         -- queued | running | done | error
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- What each role needs to know right now, researched from the web. Shared by all users; written by the server only.
create table if not exists public.prep_role_maps (
  role_key text primary key,
  role_title text,
  data jsonb not null default '{}',
  sources jsonb not null default '[]',
  refreshed_at timestamptz not null default now()
);

create index if not exists prep_topics_user on public.prep_topics(user_id, track, ord);
create index if not exists prep_lessons_user on public.prep_lessons(user_id, created_at);
create index if not exists prep_attempts_user on public.prep_attempts(user_id, created_at);
create index if not exists prep_jobs_user on public.prep_jobs(user_id, created_at);

-- Row Level Security: every user sees and changes only their own rows.
do $$
declare t text;
begin
  foreach t in array array['prep_profiles','prep_plans','prep_topics','prep_feedback','prep_interviews']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.prep_jobs enable row level security;
drop policy if exists "read own jobs" on public.prep_jobs;
create policy "read own jobs" on public.prep_jobs for select to authenticated using (user_id = auth.uid());
-- Jobs are created by the server only: it validates each request and builds the model input itself.
drop policy if exists "queue own jobs" on public.prep_jobs;

alter table public.prep_role_maps enable row level security;  -- no policies: server only

-- Anonymous averages across all learners: which lesson format works best for which kind of topic.
-- Built only from server-written attempts, and each learner counts once per (format, kind),
-- so no single account can move the averages for everyone.
create or replace function public.prep_format_priors()
returns table (format text, topic_kind text, n bigint, avg_score real)
language sql security definer set search_path = public as $$
  with per_user as (
    select l.format, coalesce(l.topic_kind, 'concept') as topic_kind, a.user_id, avg(a.score) as s
    from public.prep_attempts a join public.prep_lessons l on l.id = a.lesson_id
    where a.score is not null
    group by 1, 2, 3
  )
  select format, topic_kind, count(*), avg(s)::real from per_user group by 1, 2 having count(*) >= 5
$$;
revoke all on function public.prep_format_priors() from public;
grant execute on function public.prep_format_priors() to authenticated;


-- =====================================================================================================
-- v2 (Nov 2026): server-written results, shared lesson cache, maintainer board, usage and error records.
-- Safe to run again.
-- =====================================================================================================

-- Lessons and attempts: learners read their own; only the server writes them (scores cannot be forged).
-- A learner may still delete their own unfinished lesson (switching format).
alter table public.prep_lessons enable row level security;
alter table public.prep_attempts enable row level security;
drop policy if exists "own rows" on public.prep_lessons;
drop policy if exists "own rows" on public.prep_attempts;
drop policy if exists "read own lessons" on public.prep_lessons;
create policy "read own lessons" on public.prep_lessons for select to authenticated using (user_id = auth.uid());
drop policy if exists "delete own unfinished lessons" on public.prep_lessons;
create policy "delete own unfinished lessons" on public.prep_lessons for delete to authenticated using (user_id = auth.uid() and status = 'ready');
drop policy if exists "read own attempts" on public.prep_attempts;
create policy "read own attempts" on public.prep_attempts for select to authenticated using (user_id = auth.uid());

alter table public.prep_jobs add column if not exists request_id text;
alter table public.prep_feedback add column if not exists content_error boolean not null default false;

-- Canonical topics shared by everyone. Shared lessons are generated only from this text, never from a learner's input.
create table if not exists public.prep_topic_catalog (
  topic_key   text primary key,
  title       text not null,
  description text not null default '',
  kind        text not null,
  aliases     text[] not null default '{}',
  origin      text not null default 'plan',      -- plan | learner_request
  created_at  timestamptz not null default now()
);
alter table public.prep_topics add column if not exists topic_key text references public.prep_topic_catalog(topic_key);

-- One generated lesson body per key, served to every learner the key fits.
create table if not exists public.prep_lesson_templates (
  id             uuid primary key default gen_random_uuid(),
  topic_key      text not null references public.prep_topic_catalog(topic_key),
  format         text not null,
  level_band     text not null check (level_band in ('junior','mid','senior')),
  lang           text not null default 'he',
  variant        text not null check (variant in ('full','review')),
  prompt_version int  not null,
  version        int  not null default 1,
  status         text not null default 'generating' check (status in ('generating','ready','stale','retired','failed')),
  lease_until    timestamptz,
  content        jsonb,
  content_hash   text,
  uses           int not null default 0,
  created_at     timestamptz not null default now(),
  refreshed_at   timestamptz
);
-- Single flight: at most one live (generating or ready) template per key. A stale one may sit beside it.
create unique index if not exists prep_templates_live on public.prep_lesson_templates
  (topic_key, format, level_band, lang, variant, prompt_version) where status in ('generating','ready');

-- 4 to 6 end-of-lesson tests per template, so a review does not repeat a test the learner saw.
create table if not exists public.prep_test_bank (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.prep_lesson_templates(id) on delete cascade,
  test        jsonb not null,
  status      text not null default 'active' check (status in ('active','retired')),
  uses        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists prep_test_bank_template on public.prep_test_bank(template_id);

alter table public.prep_lessons add column if not exists template_id uuid references public.prep_lesson_templates(id) on delete set null;
alter table public.prep_lessons add column if not exists test_id uuid references public.prep_test_bank(id) on delete set null;
alter table public.prep_lessons add column if not exists personal jsonb;

-- Learner requests ("I also want to learn X"): classified; general ones wait for a maintainer's review.
create table if not exists public.prep_topic_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  request     text not null check (char_length(request) <= 2000),
  scope       text not null check (scope in ('private','general')),
  title       text, description text, kind text,
  status      text not null default 'pending' check (status in ('pending','approved','rejected','private')),
  topic_key   text references public.prep_topic_catalog(topic_key),
  decided_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- Settings maintainers change from the board (for example the share of learners on cached lessons).
create table if not exists public.ops_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
insert into public.ops_settings (key, value) values ('lesson_cache_percent', '10') on conflict (key) do nothing;

-- Maintainers: who can open the board. The project owner is the first one.
create table if not exists public.prep_maintainers (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text,
  added_at timestamptz not null default now()
);
insert into public.prep_maintainers (user_id, email)
  select id, email from auth.users where lower(email) = 'ezrabard@gmail.com'
  on conflict (user_id) do nothing;

-- Every Claude call: tokens and cost, for the cost board. Written by the server only.
create table if not exists public.ops_ai_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid references auth.users(id) on delete set null,
  request_id    text,
  feature       text not null,
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens  int not null default 0,
  cache_write_tokens int not null default 0,
  web_searches  int not null default 0,
  cost_usd      numeric(12,6) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists ops_ai_usage_time on public.ops_ai_usage(created_at);

-- Errors from the browser and the server, for the board.
create table if not exists public.ops_events (
  id          bigint generated always as identity primary key,
  level       text not null default 'error',
  source      text not null,                   -- web | server
  event       text not null,
  message     text,
  detail      jsonb,
  user_id     uuid,
  request_id  text,
  created_at  timestamptz not null default now()
);
create index if not exists ops_events_time on public.ops_events(created_at);

-- Shared tables: readable where learners need them, written by the server only.
alter table public.prep_topic_catalog enable row level security;
alter table public.prep_lesson_templates enable row level security;
alter table public.prep_test_bank enable row level security;
alter table public.prep_topic_requests enable row level security;
alter table public.ops_settings enable row level security;
alter table public.prep_maintainers enable row level security;
alter table public.ops_ai_usage enable row level security;
alter table public.ops_events enable row level security;
drop policy if exists "read catalog" on public.prep_topic_catalog;
create policy "read catalog" on public.prep_topic_catalog for select to authenticated using (true);
drop policy if exists "read own requests" on public.prep_topic_requests;
create policy "read own requests" on public.prep_topic_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists "am i a maintainer" on public.prep_maintainers;
create policy "am i a maintainer" on public.prep_maintainers for select to authenticated using (user_id = auth.uid());

-- Weekly: templates that learners rate poorly or report as wrong go stale and are regenerated the next time
-- someone opens them. Tests nobody can pass are retired. At most one regeneration per key per week.
create or replace function public.prep_mark_stale_templates()
returns int language plpgsql security definer set search_path = public as $fn$
declare n int := 0;
begin
  with stats as (
    select l.template_id, count(*) as uses, avg(f.rating) as rating, count(*) filter (where f.content_error) as reports
    from public.prep_feedback f join public.prep_lessons l on l.id = f.lesson_id
    where l.template_id is not null group by 1
  )
  update public.prep_lesson_templates t set status = 'stale'
  from stats s
  where s.template_id = t.id and t.status = 'ready'
    and coalesce(t.refreshed_at, t.created_at) < now() - interval '7 days'
    and ((s.uses >= 10 and s.rating < 3) or s.reports >= 3);
  get diagnostics n = row_count;

  update public.prep_test_bank b set status = 'retired'
  where b.status = 'active' and b.uses >= 10
    and (select avg(a.score) from public.prep_attempts a join public.prep_lessons l on l.id = a.lesson_id where l.test_id = b.id) < 20;
  return n;
end $fn$;
revoke all on function public.prep_mark_stale_templates() from public;

-- Server-side counters (the service role calls these; no client grant).
create or replace function public.prep_bump_uses(p_template uuid, p_test uuid)
returns void language sql security definer set search_path = public as $fn$
  update public.prep_lesson_templates set uses = uses + 1 where id = p_template;
  update public.prep_test_bank set uses = uses + 1 where id = p_test;
$fn$;
revoke all on function public.prep_bump_uses(uuid, uuid) from public;
