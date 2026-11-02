const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('public/app.js','utf8');
const fn=source.slice(source.indexOf('async function parseApiResponse('),source.indexOf('async function postJson('));
const context={}; vm.createContext(context); vm.runInContext(fn,context);
const response=(status,body)=>({status,ok:status>=200&&status<300,text:async()=>body});
(async()=>{
  await assert.rejects(context.parseApiResponse(response(500,'FUNCTION_INVOCATION_FAILED')),/HTTP 500, FUNCTION_INVOCATION_FAILED/);
  await assert.rejects(context.parseApiResponse(response(404,'<html>not found</html>')),/API de conversão não foi encontrada/);
  await assert.rejects(context.parseApiResponse(response(503,JSON.stringify({error:'Blob não conectado'}))),/Blob não conectado/);
  assert.equal((await context.parseApiResponse(response(200,'{"markdown":"teste"}'))).markdown,'teste');
  console.log('Respostas da API: erros da Vercel e mensagens JSON identificados.');
})();
