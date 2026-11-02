# MarkItDown Web

Aplicação web em português para extrair conteúdo de documentos, com envio em lote,
prévia e download em Markdown, TXT, HTML e JSON. Também reúne os resultados em ZIP.

## Publicar na Vercel

Envie este repositório ao GitHub e siga [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).
O arquivo `vercel.json` configura a interface em `public/` e a API Python em `api/`.
Não é necessário cadastrar chaves de API nem configurar banco de dados.

## Executar localmente

Requer Python 3.12.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python api/index.py
```

Abra http://127.0.0.1:3000. Em Linux/macOS, use `.venv/bin/python`.

## Formatos e limites

PDF com texto, DOCX, PPTX, XLSX, XLS, CSV, TSV, HTML, EPUB, TXT, Markdown,
JSON, XML, RSS, YAML, logs, IPYNB, MSG e ZIP com documentos compatíveis.

- Até 4,49 MB por arquivo, sem limite fixo de quantidade na seleção. Lotes grandes
  dependem da memória disponível no navegador e são processados um arquivo por vez.
- Não inclui OCR, transcrição, URLs, imagens ou documentos com senha.
- Extrai texto e estrutura; não reproduz o layout original.
- Uploads e resultados são processados em memória, sem armazenamento pelo aplicativo.

## Dependências e testes

`requirements.txt` fixa as versões de produção. `requirements.in` declara as
suas dependências diretas. `requirements-dev.txt` acrescenta somente a ferramenta
usada para gerar documentos Word nos testes. Node.js é necessário apenas para
verificar o JavaScript e o ZIP; o site não precisa de npm nem de build Node.

```powershell
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pip check
.\.venv\Scripts\python -m unittest discover -s tests/web -v
node --check public/app.js
node tests/web/test_upload_limits.cjs
node tests/web/test_zip.cjs | .\.venv\Scripts\python tests/web/check_zip.py
```

## Estrutura

- `api/`: validação, conversão e sanitização dos resultados.
- `public/`: interface estática sem dependências JavaScript externas.
- `packages/markitdown/`: motor de conversão e suas dependências internas.
- `tests/web/`: testes da aplicação e exemplo para verificação manual.
- `.github/workflows/web-tests.yml`: verificação automática em Python 3.12/Linux.

O motor é baseado no [MarkItDown da Microsoft](https://github.com/microsoft/markitdown).
Os módulos internos do pacote foram preservados porque são importados pelo motor;
os serviços opcionais de áudio, Azure e IA não são instalados pela aplicação.
Veja [LICENSE](LICENSE) e [avisos de terceiros](packages/markitdown/ThirdPartyNotices.md).
