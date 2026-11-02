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
`.web-deps`, credenciais ou documentos pessoais; os arquivos de ignore já excluem
os diretórios de desenvolvimento.

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
node tests/web/test_zip.cjs | python tests/web/check_zip.py
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

- Até 30 arquivos na lista e **4.000.000 bytes por arquivo**. O navegador envia
  um arquivo por requisição para respeitar o limite de payload de 4,5 MB da Vercel:
  https://vercel.com/docs/functions/limitations
- O texto extraído fica limitado a 1 MB por documento; a resposta JSON fica abaixo
  de 3,8 MB. Documentos maiores devem ser divididos. A função tem duração máxima
  configurada de 60 segundos, sujeita ao plano e à configuração da Vercel.
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

Para documentos acima de 4 MB, uma evolução exige upload direto a armazenamento
e um serviço de processamento separado; aumentar apenas `MAX_CONTENT_LENGTH`
não remove o limite da plataforma.

## Estrutura acrescentada

- `public/`: interface estática, sem build e sem dependências JavaScript externas.
- `api/index.py`: API Flask, validação, adaptação para MarkItDown e sanitização.
- `requirements.txt`: dependências web e conversores usados na interface.
- `vercel.json`: rotas, diretório público, duração da função e cabeçalhos.
- `tests/web/`: testes de conversão, validação e interoperabilidade do ZIP.

Os pacotes e a interface de linha de comando originais permanecem disponíveis.
