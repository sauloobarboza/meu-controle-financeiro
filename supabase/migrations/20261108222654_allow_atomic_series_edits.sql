create or replace function public.apply_transaction_batch(
  p_creates jsonb default '[]'::jsonb,
  p_updates jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_created integer := 0;
  v_updated integer := 0;
  v_rows integer := 0;
  v_item jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_creates, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_updates, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid batch payload';
  end if;
  if jsonb_array_length(coalesce(p_creates, '[]'::jsonb)) > 360
     or jsonb_array_length(coalesce(p_updates, '[]'::jsonb)) > 360 then
    raise exception 'Batch limit exceeded';
  end if;
  if jsonb_array_length(coalesce(p_creates, '[]'::jsonb)) > 0 then
    if exists (
      select 1 from jsonb_array_elements(p_creates) as item(value)
      where coalesce(item.value->>'type', '') not in ('income', 'expense')
         or nullif(btrim(item.value->>'description'), '') is null
         or coalesce((item.value->>'amount')::numeric, 0) <= 0
         or nullif(btrim(item.value->>'category'), '') is null
         or coalesce(item.value->>'status', '') not in ('paid', 'pending')
         or coalesce(item.value->>'transaction_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ) then raise exception 'Invalid transaction in create batch'; end if;
    insert into public.transactions (
      id, user_id, type, description, amount, category,
      transaction_date, status, series_id, needs_review
    )
    select coalesce((item.value->>'id')::uuid, gen_random_uuid()), v_user_id,
      item.value->>'type', btrim(item.value->>'description'),
      (item.value->>'amount')::numeric, btrim(item.value->>'category'),
      (item.value->>'transaction_date')::date, item.value->>'status',
      nullif(item.value->>'series_id', '')::uuid,
      coalesce((item.value->>'needs_review')::boolean, false)
    from jsonb_array_elements(p_creates) as item(value);
    get diagnostics v_created = row_count;
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb))
  loop
    if nullif(v_item->>'id', '') is null
       or jsonb_typeof(coalesce(v_item->'payload', '{}'::jsonb)) <> 'object' then
      raise exception 'Invalid transaction update';
    end if;
    update public.transactions as t
    set type = coalesce(v_item->'payload'->>'type', t.type),
        description = coalesce(v_item->'payload'->>'description', t.description),
        amount = coalesce((v_item->'payload'->>'amount')::numeric, t.amount),
        category = coalesce(v_item->'payload'->>'category', t.category),
        transaction_date = coalesce((v_item->'payload'->>'transaction_date')::date, t.transaction_date),
        status = coalesce(v_item->'payload'->>'status', t.status),
        needs_review = coalesce((v_item->'payload'->>'needs_review')::boolean, t.needs_review),
        updated_at = now()
    where t.id = (v_item->>'id')::uuid and t.user_id = v_user_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'Transaction update was not applied'; end if;
    v_updated := v_updated + v_rows;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;
revoke all on function public.apply_transaction_batch(jsonb, jsonb) from public;
revoke all on function public.apply_transaction_batch(jsonb, jsonb) from anon;
grant execute on function public.apply_transaction_batch(jsonb, jsonb) to authenticated;
