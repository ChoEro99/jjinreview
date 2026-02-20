-- Cleanup + guard for duplicated AI summary rows.
-- Run this once in Supabase SQL Editor (production DB).

begin;

create table if not exists public.ai_review_summaries (
  store_id bigint not null references public.stores(id) on delete cascade,
  summary_text text,
  ad_suspect_percent numeric(5, 2),
  updated_at timestamptz not null default now()
);

alter table public.ai_review_summaries
  add column if not exists updated_at timestamptz not null default now();

-- Keep latest row per store_id, delete older duplicates.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by store_id
      order by updated_at desc nulls last, ctid desc
    ) as rn
  from public.ai_review_summaries
)
delete from public.ai_review_summaries t
using ranked r
where t.ctid = r.ctid
  and r.rn > 1;

commit;

-- Ensure one-row-per-store going forward.
create unique index if not exists uq_ai_review_summaries_store_id
  on public.ai_review_summaries(store_id);

create index if not exists idx_ai_review_summaries_updated_at
  on public.ai_review_summaries(updated_at desc);
