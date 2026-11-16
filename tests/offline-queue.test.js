const test=require('node:test');
const assert=require('node:assert/strict');
const {enqueueUpdate,enqueueDelete,apply,sync}=require('../offline-queue.js');
test('edits an unsynced insert in place instead of adding an update operation',()=>{
 const row={id:'a',user_id:'u',description:'old',amount:10};
 const q=enqueueUpdate([row],'u','a',{description:'new',amount:12});
 assert.equal(q.length,1);assert.equal(q[0].description,'new');assert.equal(q[0].amount,12);
});
test('merges multiple updates for the same persisted row',()=>{
 let q=enqueueUpdate([],'u','a',{status:'paid'});q=enqueueUpdate(q,'u','a',{needs_review:false});
 assert.equal(q.length,1);assert.deepEqual(q[0].payload,{status:'paid',needs_review:false});
});
test('deleting an unsynced insert removes it without queuing a server delete',()=>{
 const q=enqueueDelete([{id:'a',user_id:'u'}],'u',['a']);assert.deepEqual(q,[]);
});
test('deleting a persisted row supersedes queued updates',()=>{
 const q=enqueueDelete([{__auroraOp:'update',id:'a',payload:{status:'paid'}}],'u',['a']);
 assert.deepEqual(q,[{__auroraOp:'delete',user_id:'u',id:'a'}]);
});
test('replays queued updates and deletes into local state',()=>{
 const rows=[{id:'a',status:'pending'},{id:'b',status:'paid'}];
 const q=[{__auroraOp:'update',id:'a',payload:{status:'paid',transaction_date:'2026-11-01'}},{__auroraOp:'delete',id:'b'}];
 const result=apply(q,rows);assert.equal(result.length,1);assert.equal(result[0].status,'paid');assert.equal(result[0].date,'2026-11-01');
});
test('syncs queued inserts then updates then deletes in FIFO order',async()=>{
 const calls=[];
 const client={from(){return {upsert(rows){calls.push(['insert',rows.length]);return {select:async()=>({data:rows.map(x=>({...x,transaction_date:x.transaction_date||'2026-01-01'})),error:null})}},delete(){return {eq(){return this},then(resolve){calls.push(['delete']);resolve({error:null})}}}}},rpc:async(name,args)=>{calls.push(['rpc',name,args.p_updates[0].id]);return {error:null}}};
 const q=[{id:'a',user_id:'u',type:'expense',description:'A',amount:1,category:'X',transaction_date:'2026-01-01'},{__auroraOp:'update',id:'a',user_id:'u',payload:{status:'paid'}},{__auroraOp:'delete',id:'b',user_id:'u'}];
 const result=await sync(q,client,'u');assert.equal(result.remaining.length,0);assert.deepEqual(calls.map(x=>x[0]),['insert','rpc','delete']);
});
test('keeps pending operations when a server update fails',async()=>{
 const client={rpc:async()=>({error:new Error('offline')})};
 const q=[{__auroraOp:'update',id:'a',payload:{status:'paid'}}];
 const result=await sync(q,client,'u');assert.equal(result.remaining.length,1);assert.match(result.error.message,/offline/);
});

test('saves and restores an offline snapshot per user',()=>{
 const map=new Map(),storage={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)};
 assert.equal(require('../offline-queue.js').saveSnapshot(storage,'u',[{id:'x'}],123.45),true);
 const snap=require('../offline-queue.js').restoreSnapshot(storage,'u');
 assert.equal(snap.openingBalance,123.45);assert.equal(snap.entries[0].id,'x');
 assert.equal(require('../offline-queue.js').restoreSnapshot(storage,'other'),null);
});
