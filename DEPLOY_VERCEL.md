# MarkItDown Web — GitHub + Vercel

Interface em português para converter vários documentos, visualizar o resultado,
copiar o texto e baixar arquivos individuais ou um ZIP. Exportações: Markdown,
texto simples, HTML e JSON. O formato de saída pode ser alterado sem reconverter.

## Publicar

1. Envie **este repositório inteiro** ao GitHub, incluindo `api/`, `public/`,
   `packages/markitdown/`, `requirements.txt`, `.python-version` e `vercel.json`.
   A API usa o código local do projeto, e não uma versão diferente do PyPI.
2. Na Vercel, escolha **Add New → Project** e importe o repositório.
3. Use a raiz do repositório como **Root Directory** e **Other** como framework.
   Não configure um build de Node/Next.js. Deixe Build Command e Install Command
   nos padrões da Vercel; o runtime Python instala `requirements.txt`.
   O diretório de saída já está definido como `public` no `vercel.json`.
4. Clique em **Deploy**. Nenhuma chave de API ou banco de dados é necessária.
5. Abra o endereço publicado e converta um TXT e um PDF com texto. Para verificar
   a disponibilidade da API, abra `/api/health`.

Cada push na branch de produção dispara um novo deploy. Não envie `.venv`,
credenciais ou documentos pessoais; os arquivos de ignore já excluem o ambiente
de desenvolvimento. As dependências são instaladas pela Vercel durante o deploy.

## Executar localmente

Requer Python 3.12 (a versão declarada para publicação).

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python api/index.py
```

Abra http://127.0.0.1:3000. Em Linux/macOS, use `.venv/bin/python`.
O servidor integrado é apenas para desenvolvimento. Na Vercel, o runtime executa
o objeto WSGI `app` de `api/index.py`.

Testes da camada web:

```powershell
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m unittest discover -s tests/web -v
node --check public/app.js
node tests/web/test_upload_limits.cjs
node tests/web/test_zip.cjs | .\.venv\Scripts\python tests/web/check_zip.py
```

## O que é compatível

| Entrada | Comportamento |
| --- | --- |
| PDF | Extração de texto existente; PDFs digitalizados precisam de OCR prévio |
| DOCX, PPTX | Texto e estrutura; não reproduz o layout original |
| XLSX, XLS, CSV, TSV | Conteúdo das planilhas/tabelas |
| HTML, EPUB | Conteúdo convertido para Markdown |
| TXT, MD, JSON, XML, RSS, YAML, logs | Conteúdo textual |
| IPYNB | Conteúdo do notebook, sem executar código |
| MSG | Conteúdo suportado pelo conversor Outlook |
| ZIP | Documentos compatíveis reunidos em um resultado; itens com erro são listados |

O motor original também oferece integrações com modelos de visão, Azure,
transcrição de áudio e YouTube. Esses recursos exigem serviços, chaves e/ou
binários adicionais e **não estão habilitados nesta interface**. Imagens, áudio,
vídeo, `.doc`, `.ppt`, documentos com senha e formatos arbitrários não são
compatíveis. Não existe conversão universal de qualquer arquivo. O projeto
extrai conteúdo; não é um conversor visual de PDF para Word nem de Excel para PDF.

## Limites e privacidade

- Sem limite fixo de quantidade na seleção; a capacidade prática depende da memória
  do navegador. O ZIP suporta até 65.535 resultados e tamanho total inferior a 4 GiB;
  lotes acima desses limites devem ser baixados individualmente ou em partes.
- **4.490.000 bytes (4,49 MB) por arquivo**. O navegador envia um arquivo por
  requisição, deixando 10 KB de margem abaixo do limite de payload de 4,5 MB da Vercel:
  https://vercel.com/docs/functions/limitations
- A resposta JSON completa pode ter até 4,49 MB, incluindo Markdown, HTML e texto
  simples. O limite anterior de 1 MB para o texto extraído foi removido; resultados
  cuja resposta completa exceda o teto precisam ser divididos. A função permite
  até 300 segundos por documento, com Fluid Compute habilitado na Vercel. O tempo
  limite do navegador acompanha essa configuração.
- Arquivos ZIP/Office/EPUB são inspecionados antes da conversão: limite de 40 MB
  descompactados, 1.500 itens e profundidade de compactação limitada.
- Uploads e resultados são mantidos em memória pelo aplicativo; não há banco,
  bucket ou histórico. Recarregar a página descarta os resultados. O conteúdo é
  enviado ao servidor na Vercel; não há envio para um serviço de IA. A infraestrutura
  da hospedagem continua sujeita às políticas da Vercel.
- A prévia HTML é sanitizada com uma lista de tags e atributos permitidos; imagens e scripts do
  documento não são carregados. Links e conteúdo textual continuam disponíveis.
- URLs não são aceitas como entrada. Plugins de terceiros ficam desativados.
- O endpoint é público. Para uso restrito, habilite a proteção de acesso do projeto
  e configure regras e limites no Firewall da Vercel conforme sua necessidade.

Para documentos acima de 4,49 MB, uma evolução exige upload direto a armazenamento
e um serviço de processamento separado; aumentar apenas `MAX_CONTENT_LENGTH`
não remove o limite da plataforma.

## Estrutura acrescentada

- `public/`: interface estática, sem build e sem dependências JavaScript externas.
- `api/index.py`: API Flask, validação, adaptação para MarkItDown e sanitização.
- `requirements.in`: dependências diretas usadas pela interface.
- `requirements.txt`: versões fixadas das dependências de produção, incluindo
  as transitivas, para instalação reproduzível no Python 3.12.
- `requirements-dev.txt`: acrescenta apenas a dependência para gerar Word nos testes.
- `vercel.json`: rotas, diretório público, duração da função e cabeçalhos.
- `tests/web/`: testes de conversão, validação e interoperabilidade do ZIP.

O pacote `packages/markitdown/` e sua interface de linha de comando permanecem
disponíveis. MCP, plugins externos, testes da distribuição original e configurações
de Docker foram removidos porque não são usados pelo site. Os módulos internos do
motor foram preservados para manter suas importações e conversores funcionando.

Ao alterar as dependências diretas, atualize `requirements.in` e gere novamente
`requirements.txt` com uv, antes de instalar e executar os testes:

```powershell
python -m uv pip compile requirements.in --python-version 3.12 --universal --no-annotate --output-file requirements.txt
```

O uv é uma ferramenta opcional para atualizar a lista fixada; não é necessário
para executar ou publicar a aplicação.
