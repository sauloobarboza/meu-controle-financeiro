const test=require('node:test');
const assert=require('node:assert/strict');
const {sourceKey}=require('../debt-identity.js');
test('identical purchases receive distinct keys by occurrence',async()=>{
 const a=await sourceKey('Nubank','same row',1,1,3);
 const b=await sourceKey('Nubank','same row',2,1,3);
 assert.notEqual(a,b);
});
test('reimporting the same row occurrence is idempotent',async()=>{
 const a=await sourceKey('Mercado Pago','date=2026-11-01|amount=45.00',1,2,4);
 const b=await sourceKey('Mercado Pago','date=2026-11-01|amount=45.00',1,2,4);
 assert.equal(a,b);
});
test('different installments receive distinct keys',async()=>{
 const a=await sourceKey('Nubank','purchase',1,1,3);
 const b=await sourceKey('Nubank','purchase',1,2,3);
 assert.notEqual(a,b);
});
test('rejects invalid occurrence and installment values',async()=>{
 await assert.rejects(sourceKey('Nubank','purchase',0,1,3),/Identidade da parcela inválida/);
});
