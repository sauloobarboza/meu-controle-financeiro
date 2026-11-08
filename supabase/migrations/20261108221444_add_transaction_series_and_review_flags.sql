alter table public.transactions add column if not exists series_id uuid;
alter table public.transactions add column if not exists needs_review boolean not null default false;
create index if not exists transactions_series_idx
  on public.transactions (user_id, series_id, transaction_date)
  where series_id is not null;
