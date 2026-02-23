-- Safe incremental migration for existing databases.
-- This script is idempotent and can be re-run safely.

begin;

-- 1) Ensure updated_at trigger function exists.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $func$
begin
  new.updated_at := now();
  return new;
end;
$func$;

-- 2) Ensure localized translation cache table exists.
create table if not exists public.localized_content_cache (
  store_id bigint not null references public.stores(id) on delete cascade,
  language text not null,
  content_key text not null check (
    content_key in ('ai_summary', 'latest_google_reviews', 'app_reviews')
  ),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (store_id, language, content_key)
);

-- Backward-compatible column guards in case table exists with older shape.
alter table public.localized_content_cache
  add column if not exists updated_at timestamptz not null default now();
alter table public.localized_content_cache
  add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.localized_content_cache
  add column if not exists language text;
alter table public.localized_content_cache
  add column if not exists content_key text;

-- 3) Helpful index for TTL reads.
create index if not exists idx_localized_content_cache_updated_at
  on public.localized_content_cache(updated_at desc);

-- 4) updated_at auto-refresh trigger for this table.
drop trigger if exists trg_localized_content_cache_updated_at on public.localized_content_cache;
create trigger trg_localized_content_cache_updated_at
before update on public.localized_content_cache
for each row
execute function public.set_updated_at();

-- 5) Enable RLS (safe if already enabled).
alter table public.localized_content_cache enable row level security;

-- 6) Ensure key tables have RLS enabled (safe no-op if already enabled).
alter table public.stores enable row level security;
alter table public.reviews enable row level security;
alter table public.review_analyses enable row level security;
alter table public.store_metrics enable row level security;
alter table public.google_review_cache enable row level security;
alter table public.naver_signal_cache enable row level security;
alter table public.ai_review_summaries enable row level security;
alter table public.store_detail_snapshots enable row level security;
alter table public.users enable row level security;
alter table public.user_reviews enable row level security;

-- 7) Create read policies for already-public tables only if missing.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stores'
      and policyname = 'stores_read_public'
  ) then
    create policy stores_read_public on public.stores
      for select
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'reviews_read_public'
  ) then
    create policy reviews_read_public on public.reviews
      for select
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'review_analyses'
      and policyname = 'review_analyses_read_public'
  ) then
    create policy review_analyses_read_public on public.review_analyses
      for select
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'store_metrics'
      and policyname = 'store_metrics_read_public'
  ) then
    create policy store_metrics_read_public on public.store_metrics
      for select
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_review_summaries'
      and policyname = 'ai_review_summaries_read_public'
  ) then
    create policy ai_review_summaries_read_public on public.ai_review_summaries
      for select
      using (true);
  end if;
end
$$;

commit;
