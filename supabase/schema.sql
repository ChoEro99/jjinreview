create table if not exists public.stores (
  id bigint generated always as identity primary key,
  name text not null,
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  external_rating numeric(3, 2),
  external_review_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  store_id bigint not null references public.stores(id) on delete cascade,
  source text not null check (source in ('inapp', 'external')),
  rating numeric(2, 1) not null check (rating >= 1 and rating <= 5),
  content text not null,
  author_name text,
  is_disclosed_ad boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_analyses (
  id bigint generated always as identity primary key,
  review_id bigint not null references public.reviews(id) on delete cascade,
  store_id bigint not null references public.stores(id) on delete cascade,
  model_provider text not null,
  model_name text not null,
  analysis_version text not null default 'v1',
  ad_risk numeric(5, 4) not null check (ad_risk >= 0 and ad_risk <= 1),
  undisclosed_ad_risk numeric(5, 4) not null check (undisclosed_ad_risk >= 0 and undisclosed_ad_risk <= 1),
  low_quality_risk numeric(5, 4) not null check (low_quality_risk >= 0 and low_quality_risk <= 1),
  trust_score numeric(5, 4) not null check (trust_score >= 0 and trust_score <= 1),
  confidence numeric(5, 4) not null check (confidence >= 0 and confidence <= 1),
  signals jsonb not null default '[]'::jsonb,
  reason_summary text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.store_metrics (
  store_id bigint primary key references public.stores(id) on delete cascade,
  weighted_rating numeric(3, 2),
  ad_suspect_ratio numeric(5, 4) not null default 0,
  trust_score numeric(5, 4) not null default 0.5,
  positive_ratio numeric(5, 4) not null default 0,
  review_count integer not null default 0,
  inapp_review_count integer not null default 0,
  external_review_count integer not null default 0,
  last_analyzed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.google_review_cache (
  store_id bigint primary key references public.stores(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.naver_signal_cache (
  store_id bigint primary key references public.stores(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.stores add column if not exists updated_at timestamptz not null default now();
alter table public.stores add column if not exists latitude numeric(10, 7);
alter table public.stores add column if not exists longitude numeric(10, 7);
alter table public.reviews add column if not exists updated_at timestamptz not null default now();
alter table public.reviews add column if not exists is_disclosed_ad boolean not null default false;

create table if not exists public.store_detail_snapshots (
  store_id bigint primary key references public.stores(id) on delete cascade,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_reviews_store_id on public.reviews(store_id);
create index if not exists idx_reviews_source on public.reviews(source);
create index if not exists idx_reviews_created_at on public.reviews(created_at desc);
create index if not exists idx_review_analyses_review_id_created_at on public.review_analyses(review_id, created_at desc);
create index if not exists idx_review_analyses_store_id_created_at on public.review_analyses(store_id, created_at desc);
create index if not exists idx_google_review_cache_updated_at on public.google_review_cache(updated_at desc);
create index if not exists idx_naver_signal_cache_updated_at on public.naver_signal_cache(updated_at desc);
create index if not exists idx_store_detail_snapshots_expires_at on public.store_detail_snapshots(expires_at desc);

-- 유저 테이블 (NextAuth용)
create table if not exists public.users (
  id text primary key,
  email text unique,
  name text,
  image text,
  provider text,
  created_at timestamptz not null default now()
);

-- 앱 내 유저 리뷰 테이블 (기존 reviews 테이블과 분리)
create table if not exists public.user_reviews (
  id bigint generated always as identity primary key,
  store_id bigint not null references public.stores(id) on delete cascade,
  user_id text references public.users(id) on delete set null,
  ip_hash text,
  rating numeric(2, 1) not null check (rating >= 0.5 and rating <= 5.0),
  food text check (food in ('good', 'normal', 'bad') or food is null),
  price text check (price in ('expensive', 'normal', 'cheap') or price is null),
  service text check (service in ('good', 'normal', 'bad') or service is null),
  space text check (space in ('enough', 'normal', 'narrow') or space is null),
  wait_time text check (wait_time in ('short', 'normal', 'long') or wait_time is null),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_reviews_store_id on public.user_reviews(store_id);
create index if not exists idx_user_reviews_user_id on public.user_reviews(user_id);
create index if not exists idx_user_reviews_ip_hash on public.user_reviews(ip_hash);
create index if not exists idx_user_reviews_created_at on public.user_reviews(created_at desc);
