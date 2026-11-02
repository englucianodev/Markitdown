/* No external scripts: documents and results stay in this page's memory. */
'use strict';
const $ = (id) => document.getElementById(id);
const allowed = new Set('.pdf .docx .pptx .xlsx .xls .csv .tsv .html .htm .txt .md .json .xml .rss .epub .ipynb .msg .zip .yaml .yml .log'.split(' '));
const items = [];
const MAX_FILE_BYTES = 4_490_000;
let busy = false;
let activeId = null;
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
    else if (file.size > MAX_FILE_BYTES) error = 'O arquivo excede o limite de 4,49 MB.';
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
    const labels = {pending: 'Pronto para converter', converting: 'Convertendo…', done: '✓ Convertido', error: item.error, invalid: item.error};
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
  $('convert').disabled = busy || !items.some((item) => ['pending', 'error'].includes(item.status));
  if (!busy) $('convert').textContent = items.some((item) => item.status === 'error') ? 'Converter pendentes / tentar novamente →' : 'Converter arquivos →';
  $('download-all').disabled = !completed().length;
  syncResults();
}

function htmlDocument(result) {
  // No active content, external images, or remote styles in previews/exports.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'"><title>${escapeHtml(result.filename)}</title><style>body{font:15px/1.8 system-ui,sans-serif;color:#263e34;max-width:850px;margin:32px auto;padding:0 22px;overflow-wrap:anywhere}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #dce2d5;padding:8px 12px}pre{white-space:pre-wrap;background:#f4f6ef;padding:16px}a{color:#366d48}blockquote{border-left:3px solid #adc396;margin-left:0;padding-left:20px}</style></head><body>${result.html}</body></html>`;
}

function syncResults() {
  const results = completed();
  $('results').hidden = !results.length;
  if (!results.length) {
    activeId = null;
    $('preview').replaceChildren(); $('source').textContent = ''; return;
  }
  if (!results.some((item) => item.id === activeId)) activeId = results[0].id;
  $('result-select').replaceChildren(...results.map((item) => {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.file.name; return option;
  }));
  $('result-select').value = activeId;
  $('result-count').textContent = `${results.length} DOCUMENTO${results.length === 1 ? '' : 'S'}`;
  showResult();
}

function showResult() {
  const item = current(); if (!item) return;
  // This HTML is sanitized by the server using an allowlist without active tags.
  $('preview').innerHTML = item.result.html;
  for (const link of $('preview').querySelectorAll('a')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  $('source').textContent = item.result.markdown;
  $('result-warnings').textContent = item.result.warnings.join(' · ');
  $('result-warnings').hidden = !item.result.warnings.length;
  $('download').textContent = `↓ Baixar .${format()}`;
}

function exportFile(item, kind = format()) {
  const result = item.result;
  const contents = {md: result.markdown, txt: result.text, html: htmlDocument(result), json: JSON.stringify({filename: result.filename, markdown: result.markdown, text: result.text, warnings: result.warnings}, null, 2)};
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
      const response = await fetch('/api/convert', {method: 'POST', headers: {'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(item.file.name)}, body: item.file, signal: AbortSignal.timeout(305000)});
      let body;
      try { body = await response.json(); } catch { throw new Error(response.status === 413 ? 'Arquivo ou resultado grande demais. Divida o documento.' : 'O servidor não respondeu como esperado. Tente novamente.'); }
      if (!response.ok) throw new Error(body.error || 'Não foi possível converter este arquivo.');
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
  try { await navigator.clipboard.writeText($('source').hidden ? item.result.text : item.result.markdown); $('copy').textContent = '✓ Copiado'; setTimeout(() => { $('copy').textContent = 'Copiar texto'; }, 2000); }
  catch { message('Não foi possível copiar. Use o download para salvar o conteúdo.', true); }
});
render();
