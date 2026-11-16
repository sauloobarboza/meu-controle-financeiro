(function(root){
'use strict';
async function fetchAllTransactions(client,userId,pageSize=1000){
 if(!client||typeof client.from!=='function')throw new TypeError('Cliente Supabase inválido.');
 if(!userId)throw new TypeError('Identificador do usuário obrigatório.');
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>1000)throw new RangeError('Tamanho de página inválido.');
 const rows=[];
 for(let offset=0;;offset+=pageSize){
  const {data,error}=await client.from('transactions')
   .select('id,user_id,type,description,amount,category,transaction_date,status,created_at,series_id,needs_review,sort_order')
   .eq('user_id',userId)
   .order('transaction_date',{ascending:false})
   .order('created_at',{ascending:false})
   .order('id',{ascending:false})
   .range(offset,offset+pageSize-1);
  if(error)throw error;
  const page=data||[];
  rows.push(...page);
  if(page.length<pageSize)break;
 }
 return rows;
}
const api={fetchAllTransactions};
root.AuroraPagination=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
