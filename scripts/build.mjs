import { build } from 'esbuild';
import { cp, mkdir, readdir, copyFile } from 'node:fs/promises';

await mkdir('public/ocr/core', {recursive:true});
await mkdir('public/ocr/lang', {recursive:true});
await mkdir('public/pdf', {recursive:true});
await build({entryPoints:['web/blob-upload.js','web/documents.js'],bundle:true,format:'esm',platform:'browser',outdir:'public',target:'es2022'});
await copyFile('node_modules/tesseract.js/dist/worker.min.js','public/ocr/worker.min.js');
for (const file of await readdir('node_modules/tesseract.js-core')) {
  if (file.endsWith('.wasm') || file.endsWith('.wasm.js')) await copyFile(`node_modules/tesseract.js-core/${file}`,`public/ocr/core/${file}`);
}
for (const lang of ['por','eng']) await copyFile(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,`public/ocr/lang/${lang}.traineddata.gz`);
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','public/pdf/pdf.worker.min.mjs');
for (const dir of ['cmaps','standard_fonts','wasm']) await cp(`node_modules/pdfjs-dist/${dir}`,`public/pdf/${dir}`,{recursive:true});
await copyFile('node_modules/tesseract.js/LICENSE.md','public/ocr/LICENSE-TESSERACT.md');
await copyFile('node_modules/tesseract.js-core/LICENSE','public/ocr/LICENSE-CORE');
await copyFile('node_modules/pdfjs-dist/LICENSE','public/pdf/LICENSE');
console.log('Cliente de upload, OCR, idiomas e leitor PDF gerados localmente.');
