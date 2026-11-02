import { createWorker } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';
import JSZip from 'jszip';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
const imageTypes = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp'};
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const extension = name => name.split('.').pop().toLowerCase();
const dataUrl = blob => new Promise((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
const textHtml = text => `<p>${escape(text).replace(/\n/g,'<br>')}</p>`;

export function localDocument(name) {
  return ['pdf',...Object.keys(imageTypes)].includes(extension(name));
}

export async function processDocument(file, options, base, progress) {
  const assets=[]; const warnings=[...(base?.warnings||[])]; let worker;
  let currentLabel='';
  const ocr = async (input,label) => {
    currentLabel=label;
    if (!worker) worker=await createWorker(options.language,1,{
      workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',
      workerBlobURL:false,cacheMethod:'none',
      logger:event=>progress(`${currentLabel}: ${event.status === 'recognizing text' ? 'lendo texto' : 'preparando OCR'} ${Math.round((event.progress||0)*100)}%…`),
    });
    progress(`${label}: lendo texto…`);
    const {data}=await worker.recognize(input);
    if (data.confidence < 65 && data.text.trim()) warnings.push(`${label}: OCR com baixa confiança. Revise o texto reconhecido.`);
    return data.text.trim();
  };
  const addAsset = (name,src,label) => assets.push({id:`image-${assets.length+1}`,name,src,caption:label,selected:options.images==='preserve'});
  // Discard the engine's image placeholders; only selected, extracted assets are exported.
  let markdown=(base?.markdown||'').replace(/!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g,''), html=base?.html||'', plain=base?.text||'';
  try {
    const ext=extension(file.name);
    if (imageTypes[ext]) {
      const src=await dataUrl(file);
      addAsset(file.name,src,file.name);
      if (options.ocr!=='off') plain=await ocr(file,file.name);
      else warnings.push('OCR desativado: nenhum texto foi extraído. Selecione a imagem para incluí-la na exportação.');
      markdown=plain; html=textHtml(plain);
    } else if (ext==='pdf') {
      const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'/pdf/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdf/standard_fonts/',wasmUrl:'/pdf/wasm/',isEvalSupported:false,isOffscreenCanvasSupported:false,disableWorkerRendering:true});
      let document;
      try {
        document=await task.promise;
        const mdPages=[], htmlPages=[], txtPages=[];
        for(let number=1;number<=document.numPages;number++) {
          progress(`Página ${number} de ${document.numPages}…`);
          const page=await document.getPage(number);
          const content=await page.getTextContent();
          let text=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();
          const needsOCR=options.ocr==='all'||(options.ocr==='auto'&&text.replace(/\s/g,'').length<30);
          if (needsOCR || options.images==='preserve') {
            const natural=page.getViewport({scale:1});
            const scale=Math.min(needsOCR?2:1.4,Math.sqrt(12_000_000/(natural.width*natural.height)),8192/Math.max(natural.width,natural.height));
            const viewport=page.getViewport({scale});
            const canvas=documentCanvas(viewport.width,viewport.height);
            try {
              await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
              if (needsOCR) {
                try {text=await ocr(canvas,`Página ${number}`)||text;}
                catch(error) {if (!text) throw error; warnings.push(`Página ${number}: OCR falhou; o texto original foi mantido.`);}
              }
              if(options.images==='preserve') addAsset(`pagina-${number}.jpg`,canvas.toDataURL('image/jpeg',0.85),`Página ${number} — imagem original`);
            } finally {canvas.width=canvas.height=1;}
          }
          if(!text && options.ocr==='off') warnings.push(`Página ${number}: sem texto pesquisável; habilite OCR para reconhecer a digitalização.`);
          mdPages.push(`## Página ${number}\n\n${text}`); htmlPages.push(`<h2>Página ${number}</h2>${textHtml(text)}`); txtPages.push(`Página ${number}\n\n${text}`);
          page.cleanup();
        }
        markdown=mdPages.join('\n\n');html=htmlPages.join('\n');plain=txtPages.join('\n\n');
        if(options.images==='preserve') warnings.push('PDF: as páginas foram preservadas como imagens, mantendo fotos, figuras e a aparência original. As imagens selecionadas são reunidas ao final da exportação.');
      } finally {await task.destroy();}
    } else if (['docx','pptx','xlsx','epub'].includes(ext)) {
      const zip=await JSZip.loadAsync(file);
      const files=Object.values(zip.files);
      let expanded=0;
      if(files.length>1500) throw new Error('Documento compactado contém itens demais.');
      for (const entry of files) {
        if(entry.dir || !imageTypes[extension(entry.name)]) continue;
        // Restrict to the usual image folders rather than arbitrary document members.
        if(ext!=='epub' && !/^(word|ppt|xl)\/media\//i.test(entry.name)) continue;
        const bytes=await entry.async('uint8array'); expanded+=bytes.length;
        if(expanded>100_000_000) throw new Error('As imagens incorporadas excedem 100 MB. Divida o documento.');
        const name=entry.name.split('/').pop();
        const blob=new Blob([bytes],{type:imageTypes[extension(name)]});
        const src=await dataUrl(blob);
        addAsset(name,src,name);
        if(options.ocr!=='off') {
          try {
            const text=await ocr(blob,name);
            if(text) {markdown+=`\n\n### Texto da imagem: ${name}\n\n${text}`;html+=`<h3>Texto da imagem: ${escape(name)}</h3>${textHtml(text)}`;plain+=`\n\nTexto da imagem: ${name}\n${text}`;}
          } catch {warnings.push(`Não foi possível reconhecer texto na imagem ${name}.`);}
        }
      }
      if(assets.length) warnings.push('As imagens incorporadas são reunidas ao final do documento; a posição original pode mudar.');
      if(files.some(entry=>/\.(emf|wmf|svg)$/i.test(entry.name))) warnings.push('Figuras vetoriais EMF/WMF/SVG não são incorporadas diretamente. Quando existir uma cópia rasterizada no documento, ela será incluída.');
    } else if(options.ocr!=='off' && base) {
      warnings.push('OCR local disponível para PDF, imagens e imagens incorporadas em DOCX, PPTX, XLSX e EPUB.');
    }
    return {filename:file.name,markdown,html,text:plain,warnings,assets};
  } finally {if(worker) await worker.terminate();}
}

function documentCanvas(width,height) {
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(width);canvas.height=Math.ceil(height);return canvas;
}
