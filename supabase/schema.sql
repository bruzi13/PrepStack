-- PrepStack: tables for the interview-prep site. Lives in the same Supabase project as Amirnet;
-- every table is prefixed prep_ so nothing of Amirnet's is touched.
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
  foreach t in array array['prep_profiles','prep_plans','prep_topics','prep_lessons','prep_attempts','prep_feedback','prep_interviews']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.prep_jobs enable row level security;
drop policy if exists "read own jobs" on public.prep_jobs;
create policy "read own jobs" on public.prep_jobs for select to authenticated using (user_id = auth.uid());
drop policy if exists "queue own jobs" on public.prep_jobs;
create policy "queue own jobs" on public.prep_jobs for insert to authenticated
  with check (user_id = auth.uid() and status = 'queued' and result is null);

alter table public.prep_role_maps enable row level security;  -- no policies: server only

-- Anonymous averages across all learners: which lesson format works best for which kind of topic.
-- Used as the starting assumption for a new learner, before we have their own results.
create or replace function public.prep_format_priors()
returns table (format text, topic_kind text, n bigint, avg_score real)
language sql security definer set search_path = public as $$
  select format, coalesce(topic_kind,'concept'), count(*), avg(score)::real
  from public.prep_lessons where status = 'done' and score is not null
  group by 1, 2 having count(*) >= 5
$$;
revoke all on function public.prep_format_priors() from public;
grant execute on function public.prep_format_priors() to authenticated;
