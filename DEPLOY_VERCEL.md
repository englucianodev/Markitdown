# Publicar MarkItDown Web na Vercel

## 1. Enviar ao GitHub

Envie o projeto completo, incluindo `api/`, `server/`, `web/`, `public/`,
`packages/markitdown/src/`, `requirements.txt`, `package.json`, `package-lock.json`,
`.python-version` e `vercel.json`.
Inclua também `scripts/`, usado para gerar os recursos de OCR durante o build.

Não envie `.venv`, `node_modules` ou arquivos `.env` com credenciais.
Os módulos `public/blob-upload.js`, `public/documents.js` e os diretórios
`public/ocr/` e `public/pdf/` são gerados durante o build e não precisam estar no Git.
São arquivos estáticos servidos pela Vercel; não entram no pacote da função Python.

## 2. Configurar o projeto

Na Vercel, escolha Add New → Project e importe o repositório:

| Campo | Valor |
| --- | --- |
| Framework Preset | Other |
| Root Directory | Raiz do repositório (`./`) |
| Build Command | `npm run build` (já configurado no vercel.json) |
| Install Command | Padrão automático (`npm install`/`npm ci`) |
| Output Directory | `public` (já configurado no vercel.json) |
| Python | 3.12, declarado em `.python-version` |
| Node.js | 24.x, declarado em `package.json` |

As funções Python instalam `requirements.txt` automaticamente. A função Node usa
`@vercel/blob` do `package.json`. Não defina o diretório raiz como `public`.
Mantenha Fluid Compute habilitado para a duração de até 300 segundos.

## 3. Habilitar uploads de 50 MB

1. No projeto da Vercel, abra **Storage → Create Storage → Blob**.
2. Escolha acesso **Private** e conecte o store ao projeto.
3. Inclua o ambiente **Production** e, se desejado, Preview e Development.
4. Confirme em **Settings → Environment Variables** a variável
   **BLOB_READ_WRITE_TOKEN**. Use o nome padrão, sem prefixo personalizado.
5. Faça um novo deploy para que as funções recebam a variável.

O token fica somente no servidor. O navegador recebe uma autorização assinada
para um único arquivo, com caminho aleatório, prazo de validade e limite de tamanho.
A função Node verifica a autorização antes de permitir o upload. A aplicação é
pública: proteja o projeto pela Vercel se quiser restringir quem pode converter.

PDFs e imagens de até 50 MB são processados localmente e não precisam de Blob.
Outros arquivos até 4,49 MB também não precisam de Blob. Documentos do servidor
entre 4,49 MB e 50 MB vão diretamente do navegador ao armazenamento,
sem atravessar o corpo da requisição da função Python. A API recebe apenas o ticket,
baixa o arquivo do store privado, converte e tenta excluir o upload.

Consulte https://vercel.com/docs/vercel-blob/client-upload para criar e conectar o store.
O uso do armazenamento e a transferência seguem as cotas do seu plano Vercel.

## 4. Verificar o deploy

Abra `/api/health`. A resposta deve incluir:

```json
{
  "status": "ok",
  "max_file_bytes": 50000000,
  "direct_upload_max_bytes": 4490000,
  "large_uploads_configured": true
}
```

Abra `/api/health?check=conversion` para também verificar a inicialização do motor.
Depois converta um TXT pequeno, um PDF digitalizado e uma imagem PNG com texto.
Para verificar o upload Blob, use um DOCX/PPTX/XLSX maior que 4,49 MB.
A fila exibe progresso durante upload, leitura das páginas e OCR.

## OCR e imagens

O build copia o Tesseract.js, modelos português/inglês e o leitor PDF.js para
`public/`. Não é necessário instalar Tesseract no servidor nem cadastrar chave de IA.
Não omita `npm run build`: arquivos de OCR ausentes impedem a leitura local.
Os cabeçalhos permitem os workers e o WebAssembly necessários sem liberar scripts
arbitrários. Não remova `worker-src` e `'wasm-unsafe-eval'` da política CSP.

Na página, escolha OCR automático/forçado/desativado e preservar/ignorar imagens.
Depois da conversão, abra **Selecionar imagens e editar legendas**. Os formatos
HTML, Markdown e JSON incluem as imagens selecionadas; TXT é somente texto.
Imagens de PDF são páginas renderizadas; imagens de Office/EPUB ficam reunidas
ao final. Para ZIP, envie os documentos extraídos para usar OCR e seleção de imagens.

## Corrigir o erro observado no deploy anterior

O erro informado foi:

```text
Distribution `markitdown @ directory+packages/markitdown` can't be installed
because it is marked as `--no-build` but has no binary distribution
```

A correção foi retirar `./packages/markitdown` de `requirements.txt`.
O código do motor é distribuído como fonte incluída e carregado pela API; apenas
suas bibliotecas externas são instaladas. Não reinsira o pacote local na lista.

Após enviar os arquivos atualizados ao GitHub, faça **Redeploy**. Se o build antigo
persistir, desmarque a opção de usar o cache do build ao fazer o redeploy.

Se houver novo erro, abra **Logs** e filtre pela chamada que falhou. A interface
agora distingue erros de rota, tamanho e falha de inicialização da função.

## Limites e privacidade

A função Python usa a identificação por extensão validada e não instala o detector
Magika/ONNX, para reduzir o pacote. Os modelos de OCR continuam em arquivos estáticos
do navegador. `excludeFiles` separa os recursos estáticos, dependências Node, testes
e ambientes locais de cada função.

Se o deploy anterior apresentou `LAMBDA_SIZE_EXCEEDED` (519,99 MB), envie também
o `requirements.txt` atualizado e o motor em `packages/markitdown/src/`.
Faça um novo deploy sem reutilizar o cache de build antigo. Não é necessário
aumentar o plano nem habilitar funções grandes para aplicar esta correção.

Para verificar a margem local antes de publicar:

```powershell
.\.venv\Scripts\python scripts/check-runtime-size.py
```

O teste usa um orçamento de 350 MB para dependências e código, deixando margem
para os arquivos de runtime gerados pela Vercel. O tamanho final é informado pelo
deploy da plataforma; a medição local varia conforme o sistema operacional.

- Upload: até 50.000.000 bytes (50 MB) por arquivo.
- Quantidade: sem limite fixo na seleção; depende da memória do navegador.
- Requisição direta e resposta JSON da API: até 4,49 MB. Documentos do servidor
  que gerem texto demais ainda podem exigir divisão. Resultados de PDF/OCR e
  imagens preparados localmente não passam por esse limite de resposta.
- Etapa no servidor: até 300 segundos. OCR local depende do dispositivo e do
  número de páginas/imagens; mantenha a aba aberta durante a análise.
- ZIP/Office/EPUB: até 200 MB descompactados, 1.500 itens e profundidade limitada.
- ZIP de exportação: até 65.535 resultados e tamanho total inferior a 4 GiB.
- OCR em português/inglês, sujeito a erros em manuscritos e digitalizações ruins.
  Sem transcrição de áudio/vídeo, arquivos com senha ou conversão universal.
- Arquivos pequenos são processados em memória. Arquivos grandes usam Blob privado
  temporário e têm exclusão solicitada mesmo quando a conversão falha.
- Se a aba fechar depois do upload, ou a função for encerrada abruptamente,
  o arquivo pode permanecer no store. Revise e remova periodicamente uploads
  abandonados com mais de uma hora no diretório `uploads/` do painel Blob.
- PDFs e imagens ficam no navegador; documentos Office e outros formatos são
  enviados ao servidor para extração de texto, e o OCR de suas imagens ocorre
  localmente. Não há banco de dados, histórico ou envio a um modelo de IA.

## Executar e testar localmente

Veja os comandos do [README.md](README.md). Para o fluxo completo com Blob e a
função Node, use `npx vercel dev` e configure as variáveis do projeto no ambiente
local. O servidor `python api/index.py` serve somente a aplicação Python.

Para atualizar a lista fixada após alterar `requirements.in`:

```powershell
python -m uv pip compile requirements.in --python-version 3.12 --universal --no-annotate --output-file requirements.txt
```

O uv é opcional para atualizar as versões; não é necessário para publicar.
