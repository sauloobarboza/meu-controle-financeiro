(function(root){
'use strict';
function enqueueUpdate(queue,userId,id,payload){
 const next=queue.slice();
 const pendingInsert=next.findIndex(x=>!x.__auroraOp&&x.id===id);
 if(pendingInsert>=0){next[pendingInsert]={...next[pendingInsert],...payload};return next}
 const pendingUpdate=next.findIndex(x=>x.__auroraOp==='update'&&x.id===id);
 if(pendingUpdate>=0){next[pendingUpdate]={...next[pendingUpdate],payload:{...next[pendingUpdate].payload,...payload}};return next}
 next.push({__auroraOp:'update',user_id:userId,id,payload:{...payload}});return next;
}
function enqueueDelete(queue,userId,ids){
 let next=queue.slice();
 for(const id of ids){
  const hasPendingInsert=next.some(x=>!x.__auroraOp&&x.id===id);
  next=next.filter(x=>x.id!==id);
  if(!hasPendingInsert)next.push({__auroraOp:'delete',user_id:userId,id});
 }
 return next;
}
function apply(queue,entries){
 let next=entries.slice();
 for(const item of queue){
  if(!item.__auroraOp){if(!next.some(e=>e.id===item.id))next.unshift({id:item.id,type:item.type,description:item.description,amount:Number(item.amount),category:item.category,date:item.transaction_date,status:item.status,series_id:item.series_id||null,needs_review:!!item.needs_review,sort_order:Number(item.sort_order||0),offline:true});continue}
  if(item.__auroraOp==='delete'){next=next.filter(e=>e.id!==item.id);continue}
  if(item.__auroraOp==='update'){next=next.map(e=>e.id===item.id?{...e,...(item.payload.description!==undefined?{description:item.payload.description}:{}),...(item.payload.amount!==undefined?{amount:Number(item.payload.amount)}:{}),...(item.payload.category!==undefined?{category:item.payload.category}:{}),...(item.payload.transaction_date!==undefined?{date:item.payload.transaction_date}:{}),...(item.payload.status!==undefined?{status:item.payload.status}:{}),...(item.payload.needs_review!==undefined?{needs_review:!!item.payload.needs_review}:{}),...(item.payload.sort_order!==undefined?{sort_order:Number(item.payload.sort_order)}:{}),offline:true}:e)}
 }
 return next;
}
async function sync(queue,client,userId){
 let remaining=queue.slice(),saved=[];
 for(let i=0;i<queue.length;){
  const item=queue[i];
  if(!item.__auroraOp){
   const batch=[];let j=i;while(j<queue.length&&!queue[j].__auroraOp)batch.push(queue[j++]);
   const {data,error}=await client.from('transactions').upsert(batch,{onConflict:'id'}).select('id,type,description,amount,category,transaction_date,status,series_id,needs_review,sort_order,created_at');
   if(error)return {remaining:queue.slice(i),saved,error};
   const ids=new Set((data||[]).map(x=>x.id));if(ids.size!==batch.length)return {remaining:queue.slice(i),saved,error:new Error('A sincronização não confirmou todos os lançamentos.')};
   saved.push(...data);remaining=remaining.filter(x=>!ids.has(x.id));i=j;continue;
  }
  if(item.__auroraOp==='update'){
   const {error}=await client.rpc('apply_transaction_batch',{p_creates:[],p_updates:[{id:item.id,payload:item.payload}]});
   if(error)return {remaining:queue.slice(i),saved,error};
  }else if(item.__auroraOp==='delete'){
   const {error}=await client.from('transactions').delete().eq('id',item.id).eq('user_id',userId);
   if(error)return {remaining:queue.slice(i),saved,error};
  }
  remaining=remaining.filter((_,index)=>index!==remaining.indexOf(item));i++;
 }
 return {remaining,saved,error:null};
}
const api={enqueueUpdate,enqueueDelete,apply,sync};
root.AuroraOfflineQueue=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
