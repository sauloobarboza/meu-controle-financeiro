const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261115235900_atomic_card_debt_operations.sql'),'utf8').toLowerCase();
test('debt RPC migration uses invoker security and rejects null identity/payment inputs',()=>{
 assert.doesNotMatch(sql,/security\s+definer/);
 assert.match(sql,/p_user_id\s+is\s+null\s+or\s+auth\.uid\(\)\s+is\s+null/);
 assert.match(sql,/if\s+p_paid\s+is\s+null\s+then/);
 assert.match(sql,/p_card\s+is\s+null/);
 assert.match(sql,/p_month\s+is\s+null/);
});
test('migration grants authenticated RPC execution and revokes public execution',()=>{
 assert.match(sql,/revoke all on function public\.import_card_debt_installments\(jsonb\) from public/);
 assert.match(sql,/grant execute on function public\.import_card_debt_installments\(jsonb\) to authenticated/);
});
test('migration includes idempotency and foreign-key supporting indexes',()=>{
 assert.match(sql,/transactions_user_source_key_uidx/);
 assert.match(sql,/app_change_requests_user_id_idx/);
});
