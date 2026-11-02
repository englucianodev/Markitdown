/* PDF/images and OCR run locally; other documents use the API and optional private Blob. */
'use strict';
const $ = (id) => document.getElementById(id);
const allowed = new Set('.pdf .docx .pptx .xlsx .xls .csv .tsv .html .htm .txt .md .json .xml .rss .epub .ipynb .msg .zip .yaml .yml .log .png .jpg .jpeg .webp .gif .bmp'.split(' '));
const items = [];
const MAX_FILE_BYTES = 50_000_000;
const DIRECT_UPLOAD_BYTES = 4_490_000;
let busy = false;
let activeId = null;
let displayedResult = null;
const suffix = (name) => name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
const completed = () => items.filter((item) => item.result);
const current = () => items.find((item) => item.id === activeId && item.result);
const format = () => document.querySelector('input[name="format"]:checked').value;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
$('file-input').accept = [...allowed].join(',');

function message(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
  $('message').hidden = !text;
}

function addFiles(files) {
  for (const file of files) {
    if (items.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
    let error = '';
    if (!allowed.has(suffix(file.name))) error = 'Formato não compatível. Consulte a lista abaixo.';
    else if (file.size > MAX_FILE_BYTES) error = 'O arquivo excede o limite de 50 MB.';
    else if (!file.size) error = 'Este arquivo está vazio.';
    items.push({id: crypto.randomUUID(), file, status: error ? 'invalid' : 'pending', error, result: null});
  }
  message('');
  render();
}

function render() {
  $('queue').replaceChildren();
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'queue-item';
    const badge = document.createElement('span');
    badge.className = 'file-badge';
    badge.textContent = suffix(item.file.name).slice(1).toUpperCase() || 'FILE';
    const info = document.createElement('div'); info.className = 'file-info';
    const name = document.createElement('span'); name.className = 'file-name'; name.textContent = item.file.name; name.title = item.file.name;
    const status = document.createElement('span'); status.className = 'file-status';
    const size = item.file.size < 1000000 ? `${Math.ceil(item.file.size / 1000)} KB` : `${(item.file.size / 1000000).toFixed(1)} MB`;
    const labels = {pending: 'Pronto para converter', converting: item.progress || 'Convertendo…', done: '✓ Convertido', error: item.error, invalid: item.error};
    status.textContent = `${size} · ${labels[item.status]}`;
    status.classList.toggle('error', ['error', 'invalid'].includes(item.status));
    info.append(name, status);
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remover ${item.file.name}`); remove.disabled = busy;
    remove.addEventListener('click', () => { items.splice(items.indexOf(item), 1); render(); });
    li.append(badge, info, remove); $('queue').append(li);
  }
  $('queue-count').textContent = items.length;
  $('empty-queue').hidden = !!items.length;
  $('clear').disabled = busy || !items.length;
  $('file-input').disabled = busy;
  for(const id of ['ocr-mode','ocr-language','image-policy']) $(id).disabled=busy;
  $('convert').disabled = busy || !items.some((item) => ['pending', 'error'].includes(item.status));
  if (!busy) $('convert').textContent = items.some((item) => item.status === 'error') ? 'Converter pendentes / tentar novamente →' : 'Converter arquivos →';
  $('download-all').disabled = !completed().length;
  syncResults();
}

function htmlDocument(result) {
  // No active content, external images, or remote styles in previews/exports.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escapeHtml(result.filename)}</title><style>body{font:15px/1.8 system-ui,sans-serif;color:#263e34;max-width:850px;margin:32px auto;padding:0 22px;overflow-wrap:anywhere}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #dce2d5;padding:8px 12px}pre{white-space:pre-wrap;background:#f4f6ef;padding:16px}a{color:#366d48}blockquote{border-left:3px solid #adc396;margin-left:0;padding-left:20px}img{max-width:100%;height:auto}figure{margin:24px 0}figcaption{font-size:13px;color:#65705e}</style></head><body>${result.html}</body></html>`;
}

function syncResults() {
  const results = completed();
  $('results').hidden = !results.length;
  if (!results.length) {
    activeId = null;
    displayedResult = null;
    $('preview').replaceChildren(); $('source').textContent = ''; return;
  }
  if (!results.some((item) => item.id === activeId)) activeId = results[0].id;
  $('result-select').replaceChildren(...results.map((item) => {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.file.name; return option;
  }));
  $('result-select').value = activeId;
  $('result-count').textContent = `${results.length} DOCUMENTO${results.length === 1 ? '' : 'S'}`;
  if(current()?.result !== displayedResult) showResult();
}

function showResult() {
  const item = current(); if (!item) return;
  displayedResult=item.result;
  refreshOutput(item);
  $('image-list').replaceChildren();
  const assets=item.result.assets||[];
  $('image-controls').hidden=!assets.length;
  for(const asset of assets) {
    const row=document.createElement('div');row.className='image-choice';
    const include=document.createElement('input');include.type='checkbox';include.checked=asset.selected;include.setAttribute('aria-label',`Incluir ${asset.name}`);
    const image=document.createElement('img');image.src=asset.src;image.alt=asset.caption;image.loading='lazy';
    const caption=document.createElement('input');caption.type='text';caption.value=asset.caption;caption.setAttribute('aria-label',`Legenda de ${asset.name}`);
    include.addEventListener('change',()=>{asset.selected=include.checked;refreshOutput(item);});
    caption.addEventListener('input',()=>{asset.caption=caption.value;image.alt=caption.value;refreshOutput(item);});
    row.append(include,image,caption);$('image-list').append(row);
  }
}

function outputResult(item) {
  const result=item.result, assets=(result.assets||[]).filter(asset=>asset.selected);
  const figures=assets.map(asset=>`<figure><img src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.caption)}"><figcaption>${escapeHtml(asset.caption)}</figcaption></figure>`).join('\n');
  const md=assets.map(asset=>`![${asset.caption.replace(/[\[\]\r\n]/g,' ')}](${asset.src})`).join('\n\n');
  return {...result,html:result.html+(figures?`<h2>Imagens selecionadas</h2>${figures}`:''),markdown:result.markdown+(md?`\n\n## Imagens selecionadas\n\n${md}`:''),assets};
}

function refreshOutput(item) {
  const result=outputResult(item);
  // This HTML is sanitized by the server using an allowlist without active tags.
  // Browser OCR text/captions are escaped, and embedded images are raster data URIs.
  $('preview').innerHTML = result.html;
  for (const link of $('preview').querySelectorAll('a')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  $('source').textContent = result.markdown;
  $('result-warnings').textContent = result.warnings.join(' · ');
  $('result-warnings').hidden = !result.warnings.length;
  $('download').textContent = `↓ Baixar .${format()}`;
}

function exportFile(item, kind = format()) {
  const result = outputResult(item);
  const contents = {md: result.markdown, txt: result.text, html: htmlDocument(result), json: JSON.stringify({filename: result.filename, markdown: result.markdown, text: result.text, warnings: result.warnings,images:result.assets}, null, 2)};
  const types = {md: 'text/markdown', txt: 'text/plain', html: 'text/html', json: 'application/json'};
  const base = item.file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'documento';
  return {name: `${base}.${kind}`, content: contents[kind], type: `${types[kind]};charset=utf-8`};
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ZIP's STORE method keeps exports fully local; UTF-8 names and CRC32 are standard ZIP.
function zipFiles(files) {
  const tooLarge = () => new Error('O lote é grande demais para um único ZIP. Baixe os arquivos individualmente ou use lotes menores.');
  if (files.length > 65535) throw tooLarge();
  const encoder = new TextEncoder(); const chunks = [], central = [];
  let offset = 0, centralSize = 0;
  const used = new Set();
  for (const file of files) {
    let name = file.name, index = 2;
    while (used.has(name.toLowerCase())) name = file.name.replace(/(\.[^.]+)$/, ` (${index++})$1`);
    used.add(name.toLowerCase());
    const nameBytes = encoder.encode(name), data = encoder.encode(file.content);
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + nameBytes.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true); lv.setUint16(12, 33, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nameBytes.length, true); local.set(nameBytes, 30);
    const entry = new Uint8Array(46 + nameBytes.length); const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true); entry.set(nameBytes, 46);
    if (offset + local.length + data.length + centralSize + entry.length + 22 > 0xffffffff) throw tooLarge();
    chunks.push(local, data); central.push(entry); offset += local.length + data.length; centralSize += entry.length;
  }
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, central.reduce((sum, entry) => sum + entry.length, 0), true); ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], {type: 'application/zip'});
}

async function parseApiResponse(response) {
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); }
  catch {
    if (response.status === 413) throw new Error('O envio direto excedeu o limite da Vercel. Atualize o site para usar o upload de 50 MB.');
    if ([404, 405].includes(response.status)) throw new Error(`A API de conversão não foi encontrada (HTTP ${response.status}). Verifique as rotas do deploy.`);
    const code = raw.match(/\b(?:FUNCTION_[A-Z_]+|DEPLOYMENT_NOT_FOUND)\b/)?.[0];
    throw new Error(`Falha no servidor da Vercel (HTTP ${response.status}${code ? `, ${code}` : ''}). Consulte os Logs do projeto.`);
  }
  if (!body || typeof body !== 'object') throw new Error('A API retornou uma resposta inválida. Verifique o deploy.');
  if (!response.ok) throw new Error(body.error || `A API retornou HTTP ${response.status}.`);
  return body;
}

async function postJson(path, payload) {
  return parseApiResponse(await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(305000)}));
}

async function convertServerFile(item) {
  if (item.file.size <= DIRECT_UPLOAD_BYTES) {
    return parseApiResponse(await fetch('/api/convert', {method:'POST', headers:{'Content-Type':'application/octet-stream', 'X-Filename':encodeURIComponent(item.file.name)}, body:item.file, signal:AbortSignal.timeout(305000)}));
  }
  item.progress = 'Preparando envio…'; render();
  const job = await postJson('/api/uploads', {filename:item.file.name, size:item.file.size});
  try {
    const { uploadDocument } = await import('/blob-upload.js');
    await uploadDocument(item.file, job, (percentage) => { item.progress = `Enviando ${percentage}%…`; render(); });
    item.progress = 'Convertendo…'; render();
    return await postJson('/api/convert-blob', {ticket:job.ticket});
  } finally {
    // Also try deletion when the upload fails or conversion is interrupted.
    try { await postJson('/api/delete-upload', {ticket:job.ticket}); } catch {}
    item.progress = '';
  }
}

async function convertFile(item) {
  const options={ocr:$('ocr-mode').value,language:$('ocr-language').value,images:$('image-policy').value};
  const {localDocument,processDocument}=await import('/documents.js');
  const base=localDocument(item.file.name)?null:await convertServerFile(item);
  return processDocument(item.file,options,base,(text)=>{item.progress=text;render();});
}

$('file-input').addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
for (const event of ['dragenter', 'dragover']) $('dropzone').addEventListener(event, (e) => { e.preventDefault(); if (!busy) $('dropzone').classList.add('dragging'); });
for (const event of ['dragleave', 'drop']) $('dropzone').addEventListener(event, (e) => { e.preventDefault(); $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', (event) => { if (!busy) addFiles(event.dataTransfer.files); });
// Prevent the browser from navigating away when a file is dropped outside the zone.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
$('clear').addEventListener('click', () => { items.length = 0; message(''); render(); });
$('convert').addEventListener('click', async () => {
  if (busy) return;
  busy = true; message('');
  const pending = items.filter((item) => ['pending', 'error'].includes(item.status));
  for (const [index, item] of pending.entries()) {
    item.status = 'converting'; $('convert').textContent = `Convertendo ${index + 1} de ${pending.length}…`; render();
    try {
      const body = await convertFile(item);
      if (typeof body.markdown !== 'string' || typeof body.html !== 'string' || typeof body.text !== 'string' || !Array.isArray(body.warnings)) throw new Error('A API retornou um resultado incompleto. Verifique o deploy.');
      item.result = body; item.status = 'done';
    } catch (error) {
      item.status = 'error'; item.error = error.name === 'TimeoutError' ? 'O tempo de conversão acabou. Divida o arquivo e tente novamente.' : error.message === 'Failed to fetch' ? 'Falha na conexão. Verifique sua internet e tente novamente.' : error.message;
    }
    render();
  }
  busy = false; render();
  const success = completed().length, errors = items.filter((item) => ['error', 'invalid'].includes(item.status)).length;
  message(`${success} arquivo(s) convertido(s).${errors ? ` ${errors} arquivo(s) precisam de atenção. Veja os detalhes na lista.` : ' Escolha o formato e faça o download.'}`, !success);
  if (success) $('results').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
});
$('result-select').addEventListener('change', (event) => { activeId = event.target.value; showResult(); });
$('export-options').addEventListener('change', showResult);
for(const [id,selected] of [['include-images',true],['exclude-images',false]]) $(id).addEventListener('click',()=>{const item=current();if(!item)return;for(const asset of item.result.assets||[])asset.selected=selected;showResult();});
for (const [id, isPreview] of [['preview-tab', true], ['source-tab', false]]) $(id).addEventListener('click', () => {
  $('preview').hidden = !isPreview; $('source').hidden = isPreview;
  $('preview-tab').setAttribute('aria-pressed', String(isPreview)); $('source-tab').setAttribute('aria-pressed', String(!isPreview));
});
$('download').addEventListener('click', () => { const item = current(); if (!item) return; const file = exportFile(item); downloadBlob(new Blob([file.content], {type:file.type}), file.name); });
$('download-all').addEventListener('click', () => {
  try { if (completed().length) downloadBlob(zipFiles(completed().map((item) => exportFile(item))), 'documentos-convertidos.zip'); }
  catch (error) { message(error.message, true); }
});
$('copy').addEventListener('click', async () => {
  const item = current(); if (!item) return;
  try { await navigator.clipboard.writeText($('source').hidden ? item.result.text : outputResult(item).markdown); $('copy').textContent = '✓ Copiado'; setTimeout(() => { $('copy').textContent = 'Copiar texto'; }, 2000); }
  catch { message('Não foi possível copiar. Use o download para salvar o conteúdo.', true); }
});
render();
