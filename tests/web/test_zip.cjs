// Check the actual browser ZIP implementation against Python's standard ZIP reader.
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8');
const functionSource = source.slice(source.indexOf('function zipFiles('), source.indexOf("$('file-input').addEventListener"));
const context = {TextEncoder, Blob, Uint8Array, DataView, Set};
vm.createContext(context); vm.runInContext(functionSource, context);
(async () => {
  const blob = context.zipFiles([{name:'ação.md',content:'# Olá\nTeste de UTF-8.'}, {name:'ação.md',content:'Segundo arquivo.'}, {name:'AÇÃO.md',content:'Terceiro arquivo.'}]);
  const data = Buffer.from(await blob.arrayBuffer());
  process.stdout.write(data.toString('base64'));
})();
