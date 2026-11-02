# MarkItDown Web

Aplicação em português para converter documentos, com envio em lote, prévia e
exportação em Markdown, TXT, HTML e JSON. Download individual ou conjunto em ZIP.

## Publicar

Siga [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md). A interface é hospedada na Vercel;
para documentos de até **50 MB**, com OCR local e seleção de imagens.
PDFs e imagens são processados no navegador e não precisam de armazenamento.
Para outros documentos acima de 4,49 MB, conecte um **Vercel Blob Store privado**.

O código MarkItDown é incluído em `packages/markitdown/src/`. Ele não é instalado
como pacote local: a Vercel instala dependências em execução com `--no-build`,
que rejeita distribuições locais sem wheel. `requirements.txt` contém apenas
bibliotecas externas com versões fixadas.

## Desenvolvimento local

Requer Python 3.12 e Node.js 24.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm ci
npm run build
.\.venv\Scripts\python api/index.py
```

Abra http://127.0.0.1:3000. Em Linux/macOS, use `.venv/bin/python`.
O servidor Flask local permite testar PDF/imagens com OCR até 50 MB e a conversão
direta de outros arquivos pequenos.
Para testar o fluxo Blob com a função Node, use `npx vercel dev`, com as variáveis
do projeto configuradas localmente. Não compartilhe o token do armazenamento.

## Formatos e limites

PDF com texto, DOCX, PPTX, XLSX, XLS, CSV, TSV, HTML, EPUB, TXT, Markdown,
JSON, XML, RSS, YAML, logs, IPYNB, MSG e ZIP com documentos compatíveis.
Imagens: PNG, JPG, JPEG, WebP, GIF e BMP.

- Até 50.000.000 bytes (50 MB) por arquivo; sem limite fixo de quantidade na seleção.
- Documentos enviados ao servidor acima de 4,49 MB precisam de Blob privado.
- Respostas da API ficam limitadas a 4,49 MB; PDF/OCR e imagens montados localmente
  não passam por esse limite de resposta, dependendo da memória do navegador.
- A etapa no servidor pode levar até 5 minutos, com Fluid Compute habilitado.
  O OCR local tem duração variável conforme o documento e o dispositivo.
- Áudio, vídeo, URLs e documentos com senha não estão habilitados.
- A conversão extrai conteúdo e estrutura; a aparência original pode mudar.

Os uploads grandes são privados e a aplicação tenta excluí-los ao finalizar ou
falhar a conversão. Interrupções abruptas podem deixar uploads pendentes no store;
consulte a seção de privacidade no guia de implantação.

## OCR e preservação de imagens

- **Automático:** em PDF, faz OCR quando a página tem menos de 30 caracteres de
  texto pesquisável; também reconhece texto em imagens e imagens incorporadas.
- **Forçado:** reconhece todas as páginas do PDF. Útil quando o texto existente
  está incompleto ou quando existem rótulos em figuras que o modo automático não leu.
- **Desativado:** usa somente o texto existente e permite exportar imagens sem OCR.
- Idiomas disponíveis: português, inglês ou ambos.
- Em PDF, preserva cada página como imagem, incluindo fotos, figuras e layout.
- Em DOCX, PPTX, XLSX e EPUB, extrai imagens rasterizadas e reúne-as ao final do
  resultado. A posição original pode mudar. Vetores SVG/WMF/EMF não são incluídos
  diretamente; cópias PNG/JPEG existentes no arquivo podem ser usadas.
- No resultado, selecione/desmarque imagens individualmente e edite suas legendas.
  HTML e Markdown incorporam imagens como data URIs; JSON também inclui a lista
  de imagens selecionadas. TXT contém somente texto.
- Para OCR ou imagens selecionáveis em documentos dentro de ZIP, extraia e envie
  os documentos individualmente. A conversão do ZIP pelo servidor é textual.
- OCR requer revisão humana, especialmente para manuscritos, texto em baixa
  resolução e tabelas complexas. O texto extraído de PDF pelo navegador pode
  perder parte da estrutura de tabelas e colunas.

O OCR usa Tesseract.js/WebAssembly localmente. Idiomas e scripts são gerados no
build e servidos pelo próprio site, sem CDN externa nem chave de IA.

## Testes

```powershell
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pip check
.\.venv\Scripts\python -m unittest discover -s tests/web -v
npm run build
node tests/web/test_upload_limits.cjs
node tests/web/test_upload_ticket.mjs
node tests/web/test_api_responses.cjs
node tests/web/test_image_exports.cjs
node tests/web/test_zip.cjs | .\.venv\Scripts\python tests/web/check_zip.py
```

`requirements.in` declara as dependências diretas, `requirements.txt` fixa as
versões e `requirements-dev.txt` acrescenta apenas o gerador de Word usado nos testes.
O `package-lock.json` fixa as bibliotecas de upload, OCR, PDF e imagens, além da
ferramenta que gera os módulos do navegador.

## Estrutura

- `api/index.py`: API Flask de conversão e preparação/remoção de uploads.
- `api/upload.mjs`: função Node de autorização do upload direto para Blob.
- `server/uploads.py`: tickets assinados, leitura limitada e exclusão de uploads.
- `public/`: interface e módulo gerado `blob-upload.js`.
- `web/`: fonte do módulo de upload do navegador.
- `web/documents.js`: leitura de PDF, OCR e extração de imagens no navegador.
- `scripts/build.mjs`: gera os módulos e copia workers, modelos e fontes locais.
- `packages/markitdown/`: código incluído do motor de conversão.
- `tests/web/`: testes da aplicação.

Baseado no [MarkItDown da Microsoft](https://github.com/microsoft/markitdown).
Veja [LICENSE](LICENSE) e [avisos de terceiros](packages/markitdown/ThirdPartyNotices.md).
