(function(root){
'use strict';
async function sourceKey(card,identity,occurrence,installment,total){
 if(!card||!identity||!Number.isInteger(occurrence)||occurrence<1||!Number.isInteger(installment)||installment<1||!Number.isInteger(total)||total<installment)throw new TypeError('Identidade da parcela inválida.');
 const input=String(card)+'|'+String(identity)+'|row:'+occurrence+'|'+installment+'/'+total;
 const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return 'csv:v1:'+hash;
}
const api={sourceKey};root.AuroraDebtIdentity=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
