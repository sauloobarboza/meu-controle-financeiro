const test=require('node:test');
const assert=require('node:assert/strict');
const {fetchAllTransactions}=require('../pagination.js');
function mockClient(pages,failAt=-1){
 const calls=[];
 return {calls,from(table){assert.equal(table,'transactions');return {select(columns){assert.match(columns,/transaction_date/);return this},eq(column,value){calls.push({column,value});return this},order(column,options){calls.push({order:column,ascending:options.ascending});return this},range(from,to){calls.push({range:[from,to]});const index=from/((to-from)+1);return Promise.resolve(index===failAt?{data:null,error:new Error('db fail')}:{data:pages[index]||[],error:null})}}}};
}
test('paginates all rows and uses deterministic ordering',async()=>{
 const rows=Array.from({length:2050},(_,i)=>({id:String(i)}));
 const client=mockClient([rows.slice(0,1000),rows.slice(1000,2000),rows.slice(2000)]);
 const result=await fetchAllTransactions(client,'user-1');
 assert.equal(result.length,2050);
 assert.deepEqual(client.calls.filter(x=>x.range).map(x=>x.range),[[0,999],[1000,1999],[2000,2999]]);
 assert.deepEqual(client.calls.filter(x=>x.order).map(x=>x.order),['transaction_date','created_at','id','transaction_date','created_at','id','transaction_date','created_at','id']);
});
test('returns empty list when there are no transactions',async()=>{
 assert.deepEqual(await fetchAllTransactions(mockClient([[]]),'user-1'),[]);
});
test('propagates database errors instead of silently truncating history',async()=>{
 await assert.rejects(fetchAllTransactions(mockClient([[]],0),'user-1'),/db fail/);
});
test('rejects invalid page size',async()=>{
 await assert.rejects(fetchAllTransactions(mockClient([]),'user-1',1001),/Tamanho de página inválido/);
});
