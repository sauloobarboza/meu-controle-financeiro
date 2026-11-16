-- Atomic debt operations and idempotent CSV imports.
-- Additive only: preserves all existing rows and RLS policies.

alter table public.transactions
  add column if not exists source_key text;

-- Preserve the existing projection row created by the previous debt synchronizer.
update public.transactions
set source_key =
  'card-debt:' ||
  case
    when description like 'Pagamento Mercado Pago - %' then 'mercado-pago'
    when description like 'Pagamento Nubank - %' then 'nubank'
  end || ':' ||
  to_char(to_date(split_part(description, ' - ', 2), 'MM/YYYY'), 'YYYY-MM')
where source_key is null
  and category = 'Cartão'
  and description ~ '^Pagamento (Nubank|Mercado Pago) - [0-9]{1,2}/[0-9]{4}$';

create unique index if not exists transactions_user_source_key_uidx
  on public.transactions (user_id, source_key);

create or replace function public.sync_card_debt_projection(
  p_user_id uuid,
  p_card text,
  p_month date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_total numeric(12,2);
  v_date date;
  v_source_key text;
  v_description text;
begin
  if p_user_id is null or auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authentication required';
  end if;
  if p_card is null or p_card not in ('Nubank', 'Mercado Pago') then
    raise exception 'Invalid card';
  end if;
  if p_month is null then
    raise exception 'Invalid month';
  end if;

  select
    coalesce(sum(i.amount) filter (where i.status = 'paid'), 0),
    min(i.due_date) filter (where i.status = 'paid')
  into v_total, v_date
  from public.card_debt_installments as i
  where i.user_id = p_user_id
    and i.card = p_card
    and i.due_date >= v_month
    and i.due_date < (v_month + interval '1 month')::date;

  v_source_key := 'card-debt:' ||
    case when p_card = 'Mercado Pago' then 'mercado-pago' else 'nubank' end ||
    ':' || to_char(v_month, 'YYYY-MM');
  v_description := 'Pagamento ' || p_card || ' - ' || to_char(v_month, 'MM/YYYY');

  if v_total > 0 then
    insert into public.transactions (
      user_id, type, description, amount, category,
      transaction_date, status, source_key
    )
    values (
      p_user_id, 'expense', v_description, v_total, 'Cartão',
      coalesce(v_date, v_month), 'paid', v_source_key
    )
    on conflict (user_id, source_key) do update
    set type = excluded.type,
        description = excluded.description,
        amount = excluded.amount,
        category = excluded.category,
        transaction_date = excluded.transaction_date,
        status = 'paid',
        updated_at = now();
  else
    delete from public.transactions
    where user_id = p_user_id
      and source_key = v_source_key;
  end if;
end;
$$;

create or replace function public.set_card_debt_installment_paid(
  p_installment_id uuid,
  p_paid boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.card_debt_installments;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_paid is null then raise exception 'Payment status is required'; end if;
  select * into v_row
  from public.card_debt_installments
  where id = p_installment_id and user_id = v_user_id
  for update;
  if not found then raise exception 'Installment not found'; end if;

  update public.card_debt_installments
  set status = case when p_paid then 'paid' else 'pending' end,
      paid_at = case when p_paid then now() else null end,
      updated_at = now()
  where id = p_installment_id and user_id = v_user_id;

  perform public.sync_card_debt_projection(
    v_user_id, v_row.card, v_row.due_date
  );
end;
$$;

create or replace function public.update_card_debt_installment(
  p_installment_id uuid,
  p_card text,
  p_description text,
  p_amount numeric,
  p_due_date date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.card_debt_installments;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_card is null or p_card not in ('Nubank', 'Mercado Pago')
     or nullif(btrim(p_description), '') is null
     or p_amount is null or p_amount <= 0
     or p_due_date is null then
    raise exception 'Invalid installment values';
  end if;

  select * into v_row
  from public.card_debt_installments
  where id = p_installment_id and user_id = v_user_id
  for update;
  if not found then raise exception 'Installment not found'; end if;

  update public.card_debt_installments
  set card = p_card,
      description = left(btrim(p_description), 100),
      amount = p_amount,
      due_date = p_due_date,
      updated_at = now()
  where id = p_installment_id and user_id = v_user_id;

  if v_row.status = 'paid' then
    perform public.sync_card_debt_projection(v_user_id, v_row.card, v_row.due_date);
    perform public.sync_card_debt_projection(v_user_id, p_card, p_due_date);
  end if;
end;
$$;

create or replace function public.delete_card_debt_installment(
  p_installment_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.card_debt_installments;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_row
  from public.card_debt_installments
  where id = p_installment_id and user_id = v_user_id
  for update;
  if not found then raise exception 'Installment not found'; end if;

  delete from public.card_debt_installments
  where id = p_installment_id and user_id = v_user_id;

  if v_row.status = 'paid' then
    perform public.sync_card_debt_projection(v_user_id, v_row.card, v_row.due_date);
  end if;
end;
$$;

create or replace function public.reorder_card_debt_installments(
  p_due_date date,
  p_order uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected integer;
  v_owned integer;
  v_distinct integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select count(*) into v_expected
  from public.card_debt_installments
  where user_id = v_user_id and due_date = p_due_date;

  select count(*), count(distinct id) into v_owned, v_distinct
  from public.card_debt_installments
  where user_id = v_user_id and due_date = p_due_date
    and id = any(coalesce(p_order, array[]::uuid[]));

  if p_due_date is null
     or coalesce(cardinality(p_order), 0) <> v_expected
     or v_owned <> v_expected
     or v_distinct <> v_expected then
    raise exception 'Order must contain every installment for this date exactly once';
  end if;

  update public.card_debt_installments as i
  set sort_order = ordered.position - 1,
      updated_at = now()
  from unnest(p_order) with ordinality as ordered(id, position)
  where i.id = ordered.id
    and i.user_id = v_user_id
    and i.due_date = p_due_date;
end;
$$;

create or replace function public.import_card_debt_installments(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 1000 then
    raise exception 'Invalid import payload';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      card text, description text, amount numeric,
      installment_number integer, installment_total integer,
      due_date date, source_key text
    )
    where x.card is null or x.card not in ('Nubank', 'Mercado Pago')
       or nullif(btrim(x.description), '') is null
       or x.amount is null or x.amount <= 0
       or x.installment_number is null or x.installment_number < 1
       or x.installment_total is null or x.installment_total < x.installment_number
       or x.installment_total > 60
       or x.due_date is null
       or nullif(btrim(x.source_key), '') is null
  ) then
    raise exception 'Invalid installment in import payload';
  end if;

  insert into public.card_debt_installments (
    user_id, purchase_id, card, description, original_description,
    amount, installment_number, installment_total, due_date,
    status, source_key
  )
  select
    v_user_id,
    coalesce(x.purchase_id, gen_random_uuid()),
    x.card,
    left(btrim(x.description), 100),
    x.original_description,
    x.amount,
    x.installment_number,
    x.installment_total,
    x.due_date,
    'pending',
    x.source_key
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    purchase_id uuid, card text, description text, original_description text,
    amount numeric, installment_number integer, installment_total integer,
    due_date date, source_key text
  )
  on conflict (user_id, source_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.sync_card_debt_projection(uuid, text, date) from public;
revoke all on function public.set_card_debt_installment_paid(uuid, boolean) from public;
revoke all on function public.update_card_debt_installment(uuid, text, text, numeric, date) from public;
revoke all on function public.delete_card_debt_installment(uuid) from public;
revoke all on function public.reorder_card_debt_installments(date, uuid[]) from public;
revoke all on function public.import_card_debt_installments(jsonb) from public;

grant execute on function public.sync_card_debt_projection(uuid, text, date) to authenticated;
grant execute on function public.set_card_debt_installment_paid(uuid, boolean) to authenticated;
grant execute on function public.update_card_debt_installment(uuid, text, text, numeric, date) to authenticated;
grant execute on function public.delete_card_debt_installment(uuid) to authenticated;
grant execute on function public.reorder_card_debt_installments(date, uuid[]) to authenticated;
grant execute on function public.import_card_debt_installments(jsonb) to authenticated;
